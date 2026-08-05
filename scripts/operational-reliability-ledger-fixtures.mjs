#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildOperationalEvidenceIssue,
  sha256,
} from "./operational-reliability-ledger.mjs";
import { EVIDENCE_TIER } from "./operational-reliability.mjs";

const runId = 30720000001;
const runAttempt = 1;
const repository = "BigBirdReturns/undercast";
const headSha = "b".repeat(40);
const snapshotCommit = "a".repeat(40);
const restoreReceipt = {
  version: 1,
  kind: "repository-restore",
  status: "passed",
  evidence_tier: EVIDENCE_TIER,
  generated_at: "2026-08-01T00:00:00Z",
  workflow: {
    repository,
    run_id: runId,
    run_attempt: runAttempt,
    event_name: "push",
  },
  source_snapshot: {
    id: "preservation-fixture",
    status: "pending",
    repository_commit: snapshotCommit,
    release_tag: "preservation-fixture",
    release_url: "https://github.com/BigBirdReturns/undercast/releases/tag/preservation-fixture",
    asset_name: "repository.tar.gz",
    asset_sha256: sha256("archive"),
    asset_bytes: 7,
    archive_entries: 2,
  },
  forward_recovery: {
    target_head: headSha,
    patch_sha256: sha256("patch"),
    patch_bytes: 5,
    changed_paths: ["docs/OPERATIONAL-RELIABILITY.md"],
    target_files: 3691,
    target_manifest_sha256: sha256("manifest"),
    exact_tracked_tree_match: true,
  },
  verification_index: {
    mode: "disposable-local-git-index",
    baseline_commit: "c".repeat(40),
    baseline_tree: "d".repeat(40),
    target_head: headSha,
    tracked_paths: 3691,
    initialized_after_exact_tree_proof: true,
    source_history_restored: false,
  },
  dependency_install: {
    command: "npm ci",
    exit_code: 0,
    duration_ms: 750,
    stdout_sha256: sha256(""),
    stderr_sha256: sha256(""),
  },
  canonical_gate: {
    command: "npm run gate",
    exit_code: 0,
    duration_ms: 71208,
    stdout_sha256: sha256("gate output"),
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
const rollbackReceipt = {
  version: 1,
  kind: "publication-rollback",
  status: "passed",
  evidence_tier: EVIDENCE_TIER,
  generated_at: "2026-08-01T00:00:01Z",
  workflow: { ...restoreReceipt.workflow },
  known_good: {
    snapshot_id: restoreReceipt.source_snapshot.id,
    snapshot_commit: snapshotCommit,
    target_head: headSha,
    manifest_sha256: sha256("known good"),
    paths: [
      "data/quality.json",
      "images/uc-001-portrait.jpg",
      "index.html",
      "records/UC-001/index.html",
    ],
    publication_surface_scope: "representative-critical-surface",
  },
  fault_injection: {
    path: "index.html",
    bad_sha256: sha256("bad"),
    bad_manifest_sha256: sha256("bad manifest"),
    detected_before_rollback: true,
  },
  rollback: {
    strategy: "same-filesystem-directory-rename",
    atomic_directory_swap: true,
    quarantine_created: true,
    restored_manifest_sha256: sha256("known good"),
    exact_manifest_restored: true,
  },
  served_checks: [],
  boundary: {
    isolated_publication_slot: true,
    live_publication_mutated: false,
    waterline_state_mutated: false,
    roadmap_state_mutated: false,
    review_required_before_recording: true,
  },
};
rollbackReceipt.served_checks = rollbackReceipt.known_good.paths.map((relativePath) => ({
  route: relativePath === "index.html" ? "/" : `/${relativePath}`,
  path: relativePath,
  sha256: sha256(relativePath),
  bytes: relativePath.length,
  exact_byte_match: true,
}));

const restoreRaw = Buffer.from(`${JSON.stringify(restoreReceipt, null, 2)}\n`);
const rollbackRaw = Buffer.from(`${JSON.stringify(rollbackReceipt, null, 2)}\n`);
const bundle = {
  version: 1,
  status: "passed",
  evidence_tier: EVIDENCE_TIER,
  target_head: headSha,
  snapshot_id: restoreReceipt.source_snapshot.id,
  receipts: {
    repository_restore_sha256: sha256(restoreRaw),
    publication_rollback_sha256: sha256(rollbackRaw),
  },
  boundary: {
    reviewed_waterline_receipts_created: false,
    roadmap_milestone_completed: false,
  },
};

const artifactId = 8825000000;
const input = {
  restoreReceipt,
  restoreRaw,
  rollbackReceipt,
  rollbackRaw,
  bundle,
  runId,
  runAttempt,
  runUrl: `https://github.com/${repository}/actions/runs/${runId}`,
  repository,
  eventName: "push",
  headBranch: "main",
  headSha,
  generatedAt: "2026-08-01T00:00:02Z",
  artifactId,
  artifactName: `operational-reliability-evidence-${runId}`,
  artifactUrl: `https://github.com/${repository}/actions/runs/${runId}/artifacts/${artifactId}`,
  artifactDigest: `sha256:${sha256("artifact")}`,
};

const issue = buildOperationalEvidenceIssue(input);
assert.equal(issue.title, `Operational reliability evidence run ${runId} @ ${headSha.slice(0, 12)}`);
assert.match(issue.body, /workflow-executed-unreviewed/);
assert.match(issue.body, /durable discovery surface/);
assert.match(issue.body, /issue may be updated on a rerun/);
assert.match(issue.body, new RegExp(String(runId)));
assert.match(issue.body, new RegExp(headSha));
assert.match(issue.body, /Canonical gate observation: 71208 ms/);
assert.match(issue.body, /Rollback surface: 4 files/);
assert.match(issue.body, /No reviewed waterline receipt was created/);
assert.equal(issue.facts.review_status, "unreviewed");
assert.equal(issue.facts.boundary.operational_metrics_populated, false);
assert.equal(issue.facts.boundary.discovery_issue_is_mutable, true);
assert.equal(issue.facts.boundary.artifact_and_receipt_hashes_are_authoritative, true);
assert.equal(issue.facts.rollback.served_exact_byte_checks, 4);
assert.match(issue.facts.ledger_sha256, /^[0-9a-f]{64}$/);

assert.throws(() => buildOperationalEvidenceIssue({ ...input, eventName: "pull_request" }), /only push evidence/);
assert.throws(() => buildOperationalEvidenceIssue({ ...input, headBranch: "feature" }), /only main evidence/);
assert.throws(() => buildOperationalEvidenceIssue({ ...input, headSha: "e".repeat(40) }), /target does not match/);
assert.throws(() => buildOperationalEvidenceIssue({ ...input, repository: "not-a-repository" }), /owner\/name/);
assert.throws(() => buildOperationalEvidenceIssue({ ...input, runUrl: "https://example.test/run" }), /run URL/);
assert.throws(() => buildOperationalEvidenceIssue({ ...input, artifactName: "wrong" }), /artifact name/);
assert.throws(() => buildOperationalEvidenceIssue({ ...input, artifactUrl: "https://example.test/artifact" }), /artifact URL/);
assert.throws(() => buildOperationalEvidenceIssue({
  ...input,
  rollbackReceipt: { ...rollbackReceipt, workflow: { ...rollbackReceipt.workflow, run_attempt: 2 } },
}), /rollback receipt run attempt/);
assert.throws(() => buildOperationalEvidenceIssue({
  ...input,
  bundle: { ...bundle, receipts: { ...bundle.receipts, repository_restore_sha256: sha256("wrong") } },
}), /restore receipt hash/);
assert.throws(() => buildOperationalEvidenceIssue({
  ...input,
  bundle: { ...bundle, boundary: { ...bundle.boundary, reviewed_waterline_receipts_created: true } },
}), /review boundary/);

const workflowPath = fileURLToPath(new URL("../.github/workflows/operational-reliability-evidence.yml", import.meta.url));
const publisherPath = fileURLToPath(new URL("../.github/workflows/operational-reliability-evidence-publisher.yml", import.meta.url));
const workflow = await readFile(workflowPath, "utf8");
const publisher = await readFile(publisherPath, "utf8");
assert.match(workflow, /permissions:\n  contents: read/);
assert.doesNotMatch(workflow, /issues:\s*write/);
assert.match(workflow, /id: evidence_artifact/);
assert.match(workflow, /publisher-handoff\.json/);
assert.doesNotMatch(workflow, /operational-reliability-ledger\.mjs issue-payload/);
assert.doesNotMatch(workflow, /waterline\.mjs record-drill/);
assert.doesNotMatch(workflow, /ROADMAP-STATE\.json/);

assert.match(publisher, /\n  workflow_run:\n/);
assert.match(publisher, /permissions:\n  contents: read\n  actions: read\n  issues: write/);
assert.match(publisher, /workflow_run\.head_sha/);
assert.match(publisher, /artifact\.digest/);
assert.match(publisher, /operational-reliability-ledger\.mjs issue-payload/);
assert.match(publisher, /multiple exact evidence issues found/);
assert.ok((publisher.match(/git\/ref\/heads\/main/g) || []).length >= 2);

console.log("PASS — exact-main evidence issue payload, hash-bound artifact handoff, trusted publication, idempotent title, and unreviewed boundary");
