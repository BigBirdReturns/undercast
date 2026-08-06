#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  analyzeWorkflow,
  gitBlobSha,
  recordDigest,
  scanRepository,
  sha256Hex,
  validateArtifactMetadata,
  validateEvidenceHandoff,
  validateProductCommitObject,
  validateProductPullRequest,
  validateTerminalPublication,
} from "../scripts/publisher-custody.mjs";

let failures = 0;
function fixture(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.error(`FAIL ${name}\n  ${error?.stack || error}`); }
}
function mustThrow(name, fn, matcher) {
  fixture(name, () => assert.throws(fn, matcher));
}

fixture("pull_request read-only job passes", () => {
  const result = analyzeWorkflow(`on:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps: []\n`);
  assert.deepEqual(result.violations, []);
});

fixture("implicit repository-default permissions fail closed", () => {
  const result = analyzeWorkflow(`on:\n  pull_request:\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps: []\n`);
  assert.deepEqual(result.violations, [{ job: "verify", write_scopes: ["<implicit-default>"] }]);
});

fixture("write-permission inheritance fails closed", () => {
  const result = analyzeWorkflow(`on:\n  pull_request:\npermissions:\n  contents: write\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps: []\n`);
  assert.deepEqual(result.violations, [{ job: "verify", write_scopes: ["contents"] }]);
});

fixture("job-level write on PR fails", () => {
  const result = analyzeWorkflow(`on: [pull_request]\npermissions:\n  contents: read\njobs:\n  mutate:\n    permissions:\n      issues: write\n    runs-on: ubuntu-latest\n    steps: []\n`);
  assert.deepEqual(result.violations, [{ job: "mutate", write_scopes: ["issues"] }]);
});

fixture("trusted push-only writer in combined workflow passes", () => {
  const result = analyzeWorkflow(`on:\n  pull_request:\n  push:\npermissions:\n  contents: read\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps: []\n  publish:\n    if: \${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}\n    permissions:\n      issues: write\n    runs-on: ubuntu-latest\n    steps: []\n`);
  assert.deepEqual(result.violations, []);
});

fixture("pull_request_target-only writer in combined workflow passes", () => {
  const result = analyzeWorkflow(`on:\n  pull_request:\n  pull_request_target:\npermissions:\n  contents: read\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps: []\n  publish:\n    if: \${{ github.event_name == 'pull_request_target' }}\n    permissions:\n      contents: write\n    runs-on: ubuntu-latest\n    steps: []\n`);
  assert.deepEqual(result.violations, []);
});

fixture("ambiguous write-job condition fails closed", () => {
  const result = analyzeWorkflow(`on:\n  pull_request:\n  push:\npermissions:\n  contents: read\njobs:\n  publish:\n    if: \${{ success() }}\n    permissions: write-all\n    runs-on: ubuntu-latest\n    steps: []\n`);
  assert.equal(result.violations[0].job, "publish");
  assert.deepEqual(result.violations[0].write_scopes, ["*"]);
});

fixture("mutable PR-head workflow injection is detected", () => {
  const safe = `on:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps: []\n`;
  const injected = safe.replace("contents: read", "contents: write");
  assert.deepEqual(analyzeWorkflow(safe).violations, []);
  assert.deepEqual(analyzeWorkflow(injected).violations, [{ job: "verify", write_scopes: ["contents"] }]);
});

fixture("exact legacy blob is accepted and drift is refused", () => {
  const root = mkdtempSync(path.join(tmpdir(), "publisher-custody-"));
  try {
    mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
    mkdirSync(path.join(root, "data/review"), { recursive: true });
    const unsafe = `on:\n  pull_request:\npermissions:\n  contents: write\njobs:\n  mutate:\n    runs-on: ubuntu-latest\n    steps: []\n`;
    const workflowPath = ".github/workflows/legacy.yml";
    writeFileSync(path.join(root, workflowPath), unsafe);
    const baseline = {
      schema_version: 1,
      exceptions: [{ path: workflowPath, git_blob: gitBlobSha(unsafe), reason: "fixture" }],
    };
    writeFileSync(path.join(root, "data/review/baseline.json"), JSON.stringify(baseline));
    assert.equal(scanRepository(root, "data/review/baseline.json").failures.length, 0);
    writeFileSync(path.join(root, workflowPath), `${unsafe}\n# drift\n`);
    assert.equal(scanRepository(root, "data/review/baseline.json").failures.length > 0, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

fixture("zero-exception repository passes and stale exception fails", () => {
  const root = mkdtempSync(path.join(tmpdir(), "publisher-custody-zero-"));
  try {
    mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
    mkdirSync(path.join(root, "data/review"), { recursive: true });
    const safe = `on:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps: []\n`;
    writeFileSync(path.join(root, ".github/workflows/safe.yml"), safe);
    writeFileSync(path.join(root, "data/review/baseline.json"), JSON.stringify({ schema_version: 1, exceptions: [] }));
    assert.equal(scanRepository(root, "data/review/baseline.json").failures.length, 0);
    writeFileSync(path.join(root, "data/review/baseline.json"), JSON.stringify({
      schema_version: 1,
      exceptions: [{ path: ".github/workflows/safe.yml", git_blob: gitBlobSha(safe), reason: "stale" }],
    }));
    assert.match(JSON.stringify(scanRepository(root, "data/review/baseline.json").failures), /stale_exceptions/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

mustThrow("product PR base drift is rejected", () => validateProductPullRequest({
  base: { ref: "main", sha: "new-main" },
  head: { sha: "product" },
  state: "open",
  draft: true,
  merged: false,
  commits: 1,
  changed_paths: ["a"],
}, {
  base_ref: "main",
  base_sha: "frozen-main",
  head_sha: "product",
  changed_paths: ["a"],
}), /base SHA drifted/);

fixture("exact draft product PR passes", () => {
  validateProductPullRequest({
    base: { ref: "main", sha: "frozen-main" },
    head: { sha: "product" },
    state: "open",
    draft: true,
    merged: false,
    commits: 1,
    changed_paths: ["b", "a"],
  }, {
    base_ref: "main",
    base_sha: "frozen-main",
    head_sha: "product",
    changed_paths: ["a", "b"],
  });
});

mustThrow("extra product path is rejected", () => validateProductPullRequest({
  base: { ref: "main", sha: "frozen-main" },
  head: { sha: "product" },
  state: "open",
  draft: true,
  merged: false,
  commits: 1,
  changed_paths: ["a", "b"],
}, {
  base_ref: "main",
  base_sha: "frozen-main",
  head_sha: "product",
  changed_paths: ["a"],
}), /changed-path manifest drifted/);

fixture("evidence handoff binds artifact, run, head, and every file", () => {
  const root = mkdtempSync(path.join(tmpdir(), "publisher-handoff-"));
  try {
    writeFileSync(path.join(root, "receipt.json"), "exact bytes\n");
    const expected = {
      kind: "fixture-evidence",
      repository: "owner/repo",
      run_id: 7,
      run_attempt: 2,
      event_name: "push",
      head_branch: "main",
      head_sha: "a".repeat(40),
      artifact_id: 11,
      artifact_name: "fixture-7",
      artifact_digest: `sha256:${"b".repeat(64)}`,
    };
    const handoff = {
      schema_version: 1,
      kind: expected.kind,
      repository: expected.repository,
      run_id: expected.run_id,
      run_attempt: expected.run_attempt,
      event_name: expected.event_name,
      head_branch: expected.head_branch,
      head_sha: expected.head_sha,
      artifact_name: expected.artifact_name,
      files: { "receipt.json": sha256Hex("exact bytes\n") },
    };
    const artifact = {
      id: expected.artifact_id,
      name: expected.artifact_name,
      expired: false,
      digest: expected.artifact_digest,
      workflow_run: { id: expected.run_id, head_sha: expected.head_sha },
    };
    validateArtifactMetadata(artifact, expected);
    validateEvidenceHandoff(handoff, expected, root);
    writeFileSync(path.join(root, "receipt.json"), "tampered\n");
    assert.throws(() => validateEvidenceHandoff(handoff, expected, root), /file digest drifted/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function exactTerminalFixture() {
  const expected = {
    verifier_run_id: 77,
    carrier_head: "c".repeat(40),
    artifact_id: 99,
    artifact_digest: `sha256:${"d".repeat(64)}`,
    base_ref: "main",
    base_sha: "a".repeat(40),
    head_sha: "b".repeat(40),
    tree_sha: "e".repeat(40),
    pr_number: 409,
    changed_paths: ["a", "b"],
  };
  const payload = {
    artifact_digest: expected.artifact_digest,
    artifact_id: expected.artifact_id,
    base_ref: expected.base_ref,
    base_sha: expected.base_sha,
    carrier_head: expected.carrier_head,
    changed_paths: [...expected.changed_paths].sort(),
    product_commit: expected.head_sha,
    product_pr_number: expected.pr_number,
    product_tree: expected.tree_sha,
    verifier_run_id: expected.verifier_run_id,
  };
  const settlement = {
    schema_version: 1,
    verifier: { run_id: expected.verifier_run_id, carrier_head: expected.carrier_head },
    artifact: { id: expected.artifact_id, digest: expected.artifact_digest },
    product: {
      base_ref: expected.base_ref,
      base_sha: expected.base_sha,
      parent_sha: expected.base_sha,
      commit_sha: expected.head_sha,
      tree_sha: expected.tree_sha,
      pr_number: expected.pr_number,
      changed_paths: [...expected.changed_paths],
    },
    checkpoints: {
      product_commit_constructed: expected.base_sha,
      product_pr_created: expected.base_sha,
      publication_receipt_created: expected.base_sha,
      terminal_closure: expected.base_sha,
    },
    publication_receipt: { payload, sha256: recordDigest(payload) },
  };
  const pr = {
    number: expected.pr_number,
    base: { ref: expected.base_ref, sha: expected.base_sha },
    head: { sha: expected.head_sha },
    state: "open",
    draft: true,
    merged: false,
    commits: 1,
    changed_paths: [...expected.changed_paths],
  };
  const productCommit = {
    sha: expected.head_sha,
    tree: { sha: expected.tree_sha },
    parents: [{ sha: expected.base_sha }],
  };
  return { expected, settlement, pr, productCommit };
}

fixture("exact one-parent product commit object passes", () => {
  const { expected, productCommit } = exactTerminalFixture();
  validateProductCommitObject(productCommit, expected);
});

fixture("exact terminal publication passes after PR and commit-object re-fetch", () => {
  const { expected, settlement, pr, productCommit } = exactTerminalFixture();
  validateTerminalPublication({ settlement, pr, product_commit: productCommit, current_main_sha: expected.base_sha }, expected);
});

mustThrow("stale actual product parent fails closed", () => {
  const { expected, settlement, pr, productCommit } = exactTerminalFixture();
  productCommit.parents[0].sha = "f".repeat(40);
  validateTerminalPublication({ settlement, pr, product_commit: productCommit, current_main_sha: expected.base_sha }, expected);
}, /actual product parent drifted/);

mustThrow("wrong actual product tree fails closed", () => {
  const { expected, settlement, pr, productCommit } = exactTerminalFixture();
  productCommit.tree.sha = "f".repeat(40);
  validateTerminalPublication({ settlement, pr, product_commit: productCommit, current_main_sha: expected.base_sha }, expected);
}, /actual product tree drifted/);

mustThrow("merge commit product fails one-parent custody", () => {
  const { expected, settlement, pr, productCommit } = exactTerminalFixture();
  productCommit.parents.push({ sha: "f".repeat(40) });
  validateTerminalPublication({ settlement, pr, product_commit: productCommit, current_main_sha: expected.base_sha }, expected);
}, /actual product commit is not one-parent/);

mustThrow("different actual commit object fails closed", () => {
  const { expected, settlement, pr, productCommit } = exactTerminalFixture();
  productCommit.sha = "f".repeat(40);
  validateTerminalPublication({ settlement, pr, product_commit: productCommit, current_main_sha: expected.base_sha }, expected);
}, /actual product commit SHA drifted/);

mustThrow("main advancement after product branch creation fails closed", () => {
  const { expected, settlement, pr, productCommit } = exactTerminalFixture();
  settlement.checkpoints.product_pr_created = "f".repeat(40);
  validateTerminalPublication({ settlement, pr, product_commit: productCommit, current_main_sha: expected.base_sha }, expected);
}, /main advanced at checkpoint product_pr_created/);

mustThrow("main advancement immediately before closure fails closed", () => {
  const { expected, settlement, pr, productCommit } = exactTerminalFixture();
  validateTerminalPublication({ settlement, pr, product_commit: productCommit, current_main_sha: "f".repeat(40) }, expected);
}, /main advanced before terminal closure/);

mustThrow("tampered publication receipt fails closed", () => {
  const { expected, settlement, pr, productCommit } = exactTerminalFixture();
  settlement.publication_receipt.payload.product_commit = "f".repeat(40);
  validateTerminalPublication({ settlement, pr, product_commit: productCommit, current_main_sha: expected.base_sha }, expected);
}, /publication receipt payload drifted/);

console.log(failures ? `\n${failures} publisher-custody fixture(s) FAILED` : "\nall publisher-custody fixtures pass");
if (failures) process.exitCode = 1;
