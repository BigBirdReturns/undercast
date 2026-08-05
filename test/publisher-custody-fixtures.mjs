#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  analyzeWorkflow,
  gitBlobSha,
  scanRepository,
  validateProductPullRequest,
} from "../scripts/publisher-custody.mjs";

let failures = 0;
function fixture(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.error(`FAIL ${name}\n  ${error?.stack || error}`); }
}
function mustThrow(name, fn, matcher) {
  fixture(name, () => {
    assert.throws(fn, matcher);
  });
}

fixture("pull_request read-only job passes", () => {
  const result = analyzeWorkflow(`on:\n  pull_request:\npermissions:\n  contents: read\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps: []\n`);
  assert.deepEqual(result.violations, []);
});

fixture("implicit repository-default permissions fail closed", () => {
  const result = analyzeWorkflow(`on:\n  pull_request:\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps: []\n`);
  assert.deepEqual(result.violations, [{ job: "verify", write_scopes: ["<implicit-default>"] }]);
});

fixture("top-level write inherited by PR job fails", () => {
  const result = analyzeWorkflow(`on:\n  pull_request:\npermissions:\n  contents: write\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps: []\n`);
  assert.deepEqual(result.violations, [{ job: "verify", write_scopes: ["contents"] }]);
});

fixture("job-level write on PR fails", () => {
  const result = analyzeWorkflow(`on: [pull_request]\npermissions:\n  contents: read\njobs:\n  mutate:\n    permissions:\n      issues: write\n    runs-on: ubuntu-latest\n    steps: []\n`);
  assert.deepEqual(result.violations, [{ job: "mutate", write_scopes: ["issues"] }]);
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

console.log(failures ? `\n${failures} publisher-custody fixture(s) FAILED` : "\nall publisher-custody fixtures pass");
if (failures) process.exitCode = 1;
