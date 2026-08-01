#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  initializeDisposableVerificationIndex,
  selectExecutablePublicationPaths,
  validateExecutedRestoreReceipt,
} from "./operational-reliability-execute.mjs";
import { EVIDENCE_TIER, sha256 } from "./operational-reliability.mjs";

const root = await mkdtemp(path.join(tmpdir(), "undercast-operational-execute-fixtures-"));
try {
  await mkdir(path.join(root, "data"), { recursive: true });
  await writeFile(path.join(root, "index.html"), "<!doctype html><title>restored</title>\n");
  await writeFile(path.join(root, "data", "quality.json"), '{"ok":true}\n');
  const targetHead = "b".repeat(40);
  const verificationIndex = initializeDisposableVerificationIndex(root, targetHead);
  assert.equal(verificationIndex.mode, "disposable-local-git-index");
  assert.match(verificationIndex.baseline_commit, /^[0-9a-f]{40}$/);
  assert.match(verificationIndex.baseline_tree, /^[0-9a-f]{40}$/);
  assert.equal(verificationIndex.target_head, targetHead);
  assert.equal(verificationIndex.tracked_paths, 2);
  assert.equal(verificationIndex.initialized_after_exact_tree_proof, true);
  assert.equal(verificationIndex.source_history_restored, false);
  assert.ok((await stat(path.join(root, ".git"))).isDirectory());

  const publicationRoot = path.join(root, "publication-surface");
  for (const directory of ["data", "records/UC-001", "records/UC-002", "images"]) await mkdir(path.join(publicationRoot, directory), { recursive: true });
  await writeFile(path.join(publicationRoot, "index.html"), "<!doctype html><title>publication</title>\n");
  await writeFile(path.join(publicationRoot, "data", "quality.json"), '{"total":2}\n');
  await writeFile(path.join(publicationRoot, "data", "specimens.json"), JSON.stringify([{ id: "UC-002" }, { id: "UC-001" }]) + "\n");
  await writeFile(path.join(publicationRoot, "records", "UC-001", "index.html"), "UC-001\n");
  await writeFile(path.join(publicationRoot, "records", "UC-002", "index.html"), "UC-002\n");
  await writeFile(path.join(publicationRoot, "images", "README.md"), "not an image\n");
  await writeFile(path.join(publicationRoot, "images", "a.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  await writeFile(path.join(publicationRoot, "images", "b.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const publicationPaths = await selectExecutablePublicationPaths(publicationRoot, 2, 2);
  assert.deepEqual(publicationPaths, [
    "data/quality.json",
    "images/a.jpg",
    "images/b.png",
    "index.html",
    "records/UC-001/index.html",
    "records/UC-002/index.html",
  ]);
  assert.ok(!publicationPaths.includes("images/README.md"));

  const receipt = {
    version: 1,
    kind: "repository-restore",
    status: "passed",
    evidence_tier: EVIDENCE_TIER,
    generated_at: "2026-08-01T00:00:00Z",
    workflow: { repository: "fixture/repo", run_id: 1, run_attempt: 1, event_name: "fixture" },
    source_snapshot: {
      id: "snapshot-fixture",
      status: "pending",
      repository_commit: "a".repeat(40),
      release_tag: "snapshot-fixture",
      release_url: "https://example.invalid/releases/snapshot-fixture",
      asset_name: "repository.tar.gz",
      asset_sha256: sha256("archive"),
      asset_bytes: 7,
      archive_entries: 2,
    },
    forward_recovery: {
      target_head: targetHead,
      patch_sha256: sha256("patch"),
      patch_bytes: 5,
      changed_paths: [],
      target_files: 2,
      target_manifest_sha256: sha256("manifest"),
      exact_tracked_tree_match: true,
    },
    verification_index: verificationIndex,
    dependency_install: {
      command: "npm ci",
      exit_code: 0,
      duration_ms: 1,
      stdout_sha256: sha256(""),
      stderr_sha256: sha256(""),
    },
    canonical_gate: {
      command: "npm run gate",
      exit_code: 0,
      duration_ms: 1,
      stdout_sha256: sha256(""),
      stderr_sha256: sha256(""),
    },
    boundary: {
      preservation_asset_rewritten: false,
      source_snapshot_rewritten: false,
      waterline_state_mutated: false,
      roadmap_state_mutated: false,
      live_publication_mutated: false,
      review_required_before_recording: true,
      disposable_verification_index_created: true,
      source_history_restored: false,
    },
  };
  validateExecutedRestoreReceipt(receipt);
  assert.throws(() => validateExecutedRestoreReceipt({
    ...receipt,
    verification_index: { ...verificationIndex, source_history_restored: true },
  }), /verification index boundary/);
  assert.throws(() => validateExecutedRestoreReceipt({
    ...receipt,
    verification_index: { ...verificationIndex, target_head: "c".repeat(40) },
  }), /different head/);
  assert.throws(() => validateExecutedRestoreReceipt({
    ...receipt,
    canonical_gate: { ...receipt.canonical_gate, exit_code: 1 },
  }), /did not pass|commands did not pass/);
  assert.throws(() => validateExecutedRestoreReceipt({
    ...receipt,
    boundary: { ...receipt.boundary, source_history_restored: true },
  }), /source-history boundary|mutation boundary/);
  assert.equal(await readFile(path.join(root, "index.html"), "utf8"), "<!doctype html><title>restored</title>\n");
  console.log("PASS — disposable verification index, exact target binding, source-history boundary, and executed receipt contract");
} finally {
  await rm(root, { recursive: true, force: true });
}
