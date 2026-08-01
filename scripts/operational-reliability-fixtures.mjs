#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  EVIDENCE_TIER,
  normalizeArchiveEntry,
  runPublicationRollbackDrill,
  selectPublicationPaths,
  selectRepositorySnapshot,
  sha256,
  sha256File,
  validateEvidenceBundle,
  validateRestoreReceipt,
  validateRollbackReceipt,
  verifyRepositoryArchive,
} from "./operational-reliability.mjs";

function command(name, args, cwd) {
  const result = spawnSync(name, args, { cwd, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`${name} failed: ${result.error?.message || result.stderr || result.stdout}`);
}
const work = await mkdtemp(path.join(tmpdir(), "undercast-operational-fixtures-"));
try {
  assert.equal(normalizeArchiveEntry("./data/file.json"), "data/file.json");
  assert.equal(normalizeArchiveEntry("."), null);
  assert.throws(() => normalizeArchiveEntry("../escape"), /unsafe archive entry/);
  assert.throws(() => normalizeArchiveEntry("/absolute"), /unsafe archive entry/);
  assert.throws(() => normalizeArchiveEntry("C:/escape"), /unsafe archive entry/);

  const archiveSource = path.join(work, "archive-source");
  await mkdir(path.join(archiveSource, "data"), { recursive: true });
  await writeFile(path.join(archiveSource, "index.html"), "<!doctype html><title>fixture</title>\n");
  await writeFile(path.join(archiveSource, "data", "quality.json"), '{"ok":true}\n');
  const archivePath = path.join(work, "repository.tar.gz");
  command("tar", ["-czf", archivePath, "."], archiveSource);
  const archiveBytes = (await stat(archivePath)).size;
  const archiveSha = await sha256File(archivePath);
  const registry = {
    snapshots: [{
      id: "snapshot-fixture",
      status: "pending",
      repository_commit: "a".repeat(40),
      public_release: {
        tag: "snapshot-fixture",
        url: "https://example.invalid/releases/snapshot-fixture",
        assets: [{
          kind: "repository-snapshot",
          name: "repository.tar.gz",
          sha256: archiveSha,
          bytes: archiveBytes,
          url: "https://example.invalid/repository.tar.gz",
        }],
      },
    }],
  };
  const selected = selectRepositorySnapshot(registry);
  assert.equal(selected.id, "snapshot-fixture");
  assert.equal(selected.asset.sha256, archiveSha);
  const verified = await verifyRepositoryArchive(archivePath, selected);
  assert.equal(verified.sha256, archiveSha);
  assert.ok(verified.entries >= 2);
  const tampered = path.join(work, "tampered.tar.gz");
  await writeFile(tampered, Buffer.concat([await readFile(archivePath), Buffer.from("tamper")]));
  await assert.rejects(() => verifyRepositoryArchive(tampered, selected), /bytes|SHA-256/);
  assert.throws(() => selectRepositorySnapshot({ snapshots: [] }), /no usable repository snapshot/);
  assert.throws(() => selectRepositorySnapshot(registry, "missing"), /no usable repository snapshot/);

  const restoredRoot = path.join(work, "restored");
  for (const directory of ["data", "records/UC-001", "records/UC-002", "images"]) await mkdir(path.join(restoredRoot, directory), { recursive: true });
  await writeFile(path.join(restoredRoot, "index.html"), "<!doctype html><title>known good</title>\n");
  await writeFile(path.join(restoredRoot, "data", "quality.json"), '{"total":2}\n');
  await writeFile(path.join(restoredRoot, "data", "specimens.json"), JSON.stringify([{ id: "UC-002" }, { id: "UC-001" }], null, 2) + "\n");
  await writeFile(path.join(restoredRoot, "records", "UC-001", "index.html"), "<!doctype html><title>UC-001</title>\n");
  await writeFile(path.join(restoredRoot, "records", "UC-002", "index.html"), "<!doctype html><title>UC-002</title>\n");
  await writeFile(path.join(restoredRoot, "images", "a.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const publicationPaths = await selectPublicationPaths(restoredRoot, 2, 1);
  assert.deepEqual(publicationPaths, [
    "data/quality.json",
    "images/a.jpg",
    "index.html",
    "records/UC-001/index.html",
    "records/UC-002/index.html",
  ]);

  const evidenceRoot = path.join(work, "evidence");
  await mkdir(evidenceRoot, { recursive: true });
  const restoreReceiptPath = path.join(evidenceRoot, "repository-restore.json");
  const restoreReceipt = {
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
      asset_sha256: archiveSha,
      asset_bytes: archiveBytes,
      archive_entries: verified.entries,
    },
    forward_recovery: {
      target_head: "b".repeat(40),
      patch_sha256: sha256("patch"),
      patch_bytes: 5,
      changed_paths: [],
      target_files: publicationPaths.length,
      target_manifest_sha256: sha256("manifest"),
      exact_tracked_tree_match: true,
    },
    dependency_install: null,
    canonical_gate: {
      command: "fixture gate",
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
    },
  };
  validateRestoreReceipt(restoreReceipt);
  await writeFile(restoreReceiptPath, JSON.stringify(restoreReceipt, null, 2) + "\n");
  assert.throws(() => validateRestoreReceipt({ ...restoreReceipt, canonical_gate: { exit_code: 1 } }), /did not pass/);
  assert.throws(() => validateRestoreReceipt({ ...restoreReceipt, boundary: { ...restoreReceipt.boundary, waterline_state_mutated: true } }), /boundary/);

  const rollbackReceiptPath = path.join(evidenceRoot, "publication-rollback.json");
  const rollbackReceipt = await runPublicationRollbackDrill({
    restoredRoot,
    restoreReceiptPath,
    workRoot: path.join(work, "rollback"),
    outputPath: rollbackReceiptPath,
    paths: publicationPaths,
  });
  validateRollbackReceipt(rollbackReceipt);
  assert.equal(rollbackReceipt.fault_injection.detected_before_rollback, true);
  assert.equal(rollbackReceipt.rollback.exact_manifest_restored, true);
  assert.ok(rollbackReceipt.served_checks.every((row) => row.exact_byte_match));
  assert.throws(() => validateRollbackReceipt({ ...rollbackReceipt, fault_injection: { detected_before_rollback: false } }), /did not detect/);

  const bundle = await validateEvidenceBundle(restoreReceiptPath, rollbackReceiptPath);
  assert.equal(bundle.status, "passed");
  assert.equal(bundle.target_head, "b".repeat(40));
  assert.equal(bundle.boundary.reviewed_waterline_receipts_created, false);
  const driftedRollbackPath = path.join(evidenceRoot, "drifted-rollback.json");
  await writeFile(driftedRollbackPath, JSON.stringify({
    ...rollbackReceipt,
    known_good: { ...rollbackReceipt.known_good, target_head: "c".repeat(40) },
  }, null, 2) + "\n");
  await assert.rejects(() => validateEvidenceBundle(restoreReceiptPath, driftedRollbackPath), /different heads/);

  console.log("PASS — operational restore and rollback evidence contracts, tamper refusal, exact-byte recovery, and review boundary");
} finally {
  await rm(work, { recursive: true, force: true });
}
