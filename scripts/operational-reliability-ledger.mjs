#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateExecutedRestoreReceipt } from "./operational-reliability-execute.mjs";
import { validateRollbackReceipt } from "./operational-reliability.mjs";

export const OPERATIONAL_EVIDENCE_LEDGER_VERSION = 1;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^(?:sha256:)?[0-9a-f]{64}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HTTPS_RE = /^https:\/\//;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function stableJson(value) { return JSON.stringify(stable(value)); }
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function requireString(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}
function requireCommit(value, label) {
  const text = requireString(value, label);
  if (!COMMIT_RE.test(text)) throw new Error(`${label} must be a full 40-character commit SHA`);
  return text;
}
function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive safe integer`);
  return number;
}
function requireSha256(value, label) {
  const text = requireString(value, label).toLowerCase();
  if (!SHA256_RE.test(text)) throw new Error(`${label} must be a SHA-256 digest`);
  return text.startsWith("sha256:") ? text : `sha256:${text}`;
}
function requireRepository(value, label) {
  const text = requireString(value, label);
  if (!REPOSITORY_RE.test(text)) throw new Error(`${label} must use owner/name form`);
  return text;
}
function requireHttps(value, label) {
  const text = requireString(value, label);
  if (!HTTPS_RE.test(text)) throw new Error(`${label} must use HTTPS`);
  return text;
}
function requireDate(value, label) {
  const text = requireString(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO date/time`);
  return text;
}
function receiptHash(raw, label) {
  if (!Buffer.isBuffer(raw) && typeof raw !== "string") throw new Error(`${label} raw bytes are required`);
  return sha256(raw);
}
function assertReceiptWorkflow(receipt, label, { runId, runAttempt, eventName, repository }) {
  if (receipt.workflow?.run_id !== runId) throw new Error(`${label} run id does not match the workflow run`);
  if (receipt.workflow?.run_attempt !== runAttempt) throw new Error(`${label} run attempt does not match the workflow attempt`);
  if (receipt.workflow?.event_name !== eventName) throw new Error(`${label} event does not match the workflow event`);
  if (receipt.workflow?.repository !== repository) throw new Error(`${label} repository does not match the workflow repository`);
}

export function buildOperationalEvidenceIssue({
  restoreReceipt,
  restoreRaw,
  rollbackReceipt,
  rollbackRaw,
  bundle,
  runId,
  runAttempt,
  runUrl,
  repository,
  eventName,
  headBranch,
  headSha,
  generatedAt,
  artifactId,
  artifactName,
  artifactUrl,
  artifactDigest,
}) {
  validateExecutedRestoreReceipt(restoreReceipt);
  validateRollbackReceipt(rollbackReceipt);

  runId = requirePositiveInteger(runId, "run id");
  runAttempt = requirePositiveInteger(runAttempt, "run attempt");
  repository = requireRepository(repository, "repository");
  eventName = requireString(eventName, "event name");
  headBranch = requireString(headBranch, "head branch");
  headSha = requireCommit(headSha, "head SHA");
  generatedAt = requireDate(generatedAt, "generated_at");
  artifactId = requirePositiveInteger(artifactId, "artifact id");
  artifactName = requireString(artifactName, "artifact name");
  artifactDigest = requireSha256(artifactDigest, "artifact digest");
  runUrl = requireHttps(runUrl, "run URL");
  artifactUrl = requireHttps(artifactUrl, "artifact URL");

  if (eventName !== "push") throw new Error(`ledger accepts only push evidence, found ${eventName}`);
  if (headBranch !== "main") throw new Error(`ledger accepts only main evidence, found ${headBranch}`);
  const expectedRunUrl = `https://github.com/${repository}/actions/runs/${runId}`;
  if (runUrl !== expectedRunUrl) throw new Error(`run URL ${runUrl} != ${expectedRunUrl}`);
  const expectedArtifactName = `operational-reliability-evidence-${runId}-attempt-${runAttempt}`;
  if (artifactName !== expectedArtifactName) throw new Error(`artifact name ${artifactName} != ${expectedArtifactName}`);
  const expectedArtifactUrl = `${expectedRunUrl}/artifacts/${artifactId}`;
  if (artifactUrl !== expectedArtifactUrl) throw new Error(`artifact URL ${artifactUrl} != ${expectedArtifactUrl}`);

  assertReceiptWorkflow(restoreReceipt, "restore receipt", { runId, runAttempt, eventName, repository });
  assertReceiptWorkflow(rollbackReceipt, "rollback receipt", { runId, runAttempt, eventName, repository });
  if (restoreReceipt.forward_recovery?.target_head !== headSha) throw new Error("restore receipt target does not match the exact main head");
  if (rollbackReceipt.known_good?.target_head !== headSha) throw new Error("rollback receipt target does not match the exact main head");
  if (rollbackReceipt.known_good?.snapshot_id !== restoreReceipt.source_snapshot?.id) throw new Error("restore and rollback receipts use different snapshots");
  if (!bundle || bundle.version !== 1 || bundle.status !== "passed" || bundle.evidence_tier !== "workflow-executed-unreviewed") {
    throw new Error("bundle is not a passed workflow-executed-unreviewed object");
  }
  if (bundle.target_head !== headSha || bundle.snapshot_id !== restoreReceipt.source_snapshot.id) {
    throw new Error("bundle target or snapshot does not match the exact main evidence");
  }

  const restoreSha = receiptHash(restoreRaw, "restore receipt");
  const rollbackSha = receiptHash(rollbackRaw, "rollback receipt");
  if (bundle.receipts?.repository_restore_sha256 !== restoreSha) throw new Error("bundle restore receipt hash does not match the supplied bytes");
  if (bundle.receipts?.publication_rollback_sha256 !== rollbackSha) throw new Error("bundle rollback receipt hash does not match the supplied bytes");
  if (bundle.boundary?.reviewed_waterline_receipts_created !== false || bundle.boundary?.roadmap_milestone_completed !== false) {
    throw new Error("bundle review boundary is invalid");
  }
  if (!Array.isArray(rollbackReceipt.served_checks) || !rollbackReceipt.served_checks.length) {
    throw new Error("rollback receipt has no served checks");
  }

  const title = `Operational reliability evidence run ${runId} @ ${headSha.slice(0, 12)}`;
  const facts = {
    version: OPERATIONAL_EVIDENCE_LEDGER_VERSION,
    evidence_tier: "workflow-executed-unreviewed",
    review_status: "unreviewed",
    generated_at: generatedAt,
    repository,
    event: eventName,
    branch: headBranch,
    target_head: headSha,
    workflow: {
      run_id: runId,
      run_attempt: runAttempt,
      run_url: runUrl,
    },
    artifact: {
      id: artifactId,
      name: artifactName,
      url: artifactUrl,
      digest: artifactDigest,
    },
    source_snapshot: {
      id: restoreReceipt.source_snapshot.id,
      repository_commit: restoreReceipt.source_snapshot.repository_commit,
      asset_sha256: restoreReceipt.source_snapshot.asset_sha256,
      asset_bytes: restoreReceipt.source_snapshot.asset_bytes,
    },
    recovery: {
      exact_tracked_tree_match: restoreReceipt.forward_recovery.exact_tracked_tree_match,
      target_files: restoreReceipt.forward_recovery.target_files,
      target_manifest_sha256: restoreReceipt.forward_recovery.target_manifest_sha256,
      forward_patch_sha256: restoreReceipt.forward_recovery.patch_sha256,
      dependency_install_ms: restoreReceipt.dependency_install.duration_ms,
      canonical_gate_ms: restoreReceipt.canonical_gate.duration_ms,
      verification_index_mode: restoreReceipt.verification_index.mode,
      source_history_restored: restoreReceipt.verification_index.source_history_restored,
    },
    rollback: {
      scope: rollbackReceipt.known_good.publication_surface_scope,
      selected_paths: rollbackReceipt.known_good.paths,
      fault_path: rollbackReceipt.fault_injection.path,
      fault_detected: rollbackReceipt.fault_injection.detected_before_rollback,
      atomic_directory_swap: rollbackReceipt.rollback.atomic_directory_swap,
      exact_manifest_restored: rollbackReceipt.rollback.exact_manifest_restored,
      served_exact_byte_checks: rollbackReceipt.served_checks.length,
    },
    receipt_sha256: {
      repository_restore: restoreSha,
      publication_rollback: rollbackSha,
    },
    boundary: {
      reviewed_waterline_receipts_created: false,
      roadmap_milestone_completed: false,
      operational_metrics_populated: false,
      live_publication_mutated: false,
      discovery_issue_is_mutable: true,
      artifact_and_receipt_hashes_are_authoritative: true,
      review_required: true,
      next_authorized_work: "second-desk review followed by a separate reviewed waterline receipt lane",
    },
  };
  const ledgerSha = sha256(stableJson(facts));
  const body = [
    "## Exact-main operational reliability evidence",
    "",
    "This issue is a durable discovery surface for a successful exact-main recovery run. The workflow produced the evidence; it did not review or admit its own receipts. The issue may be updated on a rerun, while the artifact digest and receipt hashes remain the authoritative custody identifiers.",
    "",
    `- Evidence tier: \`${facts.evidence_tier}\``,
    `- Review status: \`${facts.review_status}\``,
    `- Target: \`${facts.target_head}\` on \`${facts.branch}\``,
    `- Workflow run: ${facts.workflow.run_url}`,
    `- Artifact: ${facts.artifact.url}`,
    `- Artifact digest: \`${facts.artifact.digest}\``,
    `- Snapshot: \`${facts.source_snapshot.id}\` at \`${facts.source_snapshot.repository_commit}\``,
    `- Exact tracked paths: ${facts.recovery.target_files}`,
    `- Canonical gate observation: ${facts.recovery.canonical_gate_ms} ms`,
    `- Rollback surface: ${facts.rollback.selected_paths.length} files`,
    `- Served exact-byte checks: ${facts.rollback.served_exact_byte_checks}`,
    `- Restore receipt SHA-256: \`${facts.receipt_sha256.repository_restore}\``,
    `- Rollback receipt SHA-256: \`${facts.receipt_sha256.publication_rollback}\``,
    `- Ledger content SHA-256: \`${ledgerSha}\``,
    "",
    "### Control boundary",
    "",
    "No reviewed waterline receipt was created, no roadmap milestone was completed, no operational metric was populated, and the live publication was not mutated. A second-desk reviewer must inspect the run and artifact before a separate state-changing receipt lane may proceed.",
    "",
    "<details><summary>Machine-readable facts</summary>",
    "",
    "```json",
    JSON.stringify({ ...facts, ledger_sha256: ledgerSha }, null, 2),
    "```",
    "",
    "</details>",
  ].join("\n");
  return {
    title,
    body,
    facts: { ...facts, ledger_sha256: ledgerSha },
  };
}

function parseCli(argv) {
  const args = [...argv];
  const command = args.shift() || "help";
  const values = new Map();
  while (args.length) {
    const token = args.shift();
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const key = token.slice(2);
    const value = args.shift();
    if (!value || value.startsWith("--")) throw new Error(`--${key} requires a value`);
    values.set(key, value);
  }
  return { command, value: (key, fallback = null) => values.has(key) ? values.get(key) : fallback };
}

async function cli() {
  const { command, value } = parseCli(process.argv.slice(2));
  if (command !== "issue-payload") throw new Error("unknown command; use issue-payload");
  const restorePath = path.resolve(requireString(value("restore-receipt"), "--restore-receipt"));
  const rollbackPath = path.resolve(requireString(value("rollback-receipt"), "--rollback-receipt"));
  const bundlePath = path.resolve(requireString(value("bundle"), "--bundle"));
  const [restoreRaw, rollbackRaw, bundleRaw] = await Promise.all([
    readFile(restorePath),
    readFile(rollbackPath),
    readFile(bundlePath, "utf8"),
  ]);
  const issue = buildOperationalEvidenceIssue({
    restoreReceipt: JSON.parse(restoreRaw.toString("utf8")),
    restoreRaw,
    rollbackReceipt: JSON.parse(rollbackRaw.toString("utf8")),
    rollbackRaw,
    bundle: JSON.parse(bundleRaw),
    runId: value("run-id"),
    runAttempt: value("run-attempt"),
    runUrl: requireString(value("run-url"), "--run-url"),
    repository: requireString(value("repository"), "--repository"),
    eventName: requireString(value("event-name"), "--event-name"),
    headBranch: requireString(value("head-branch"), "--head-branch"),
    headSha: requireString(value("head-sha"), "--head-sha"),
    generatedAt: value("generated-at", new Date().toISOString()),
    artifactId: value("artifact-id"),
    artifactName: requireString(value("artifact-name"), "--artifact-name"),
    artifactUrl: requireString(value("artifact-url"), "--artifact-url"),
    artifactDigest: requireString(value("artifact-digest"), "--artifact-digest"),
  });
  const outputPath = path.resolve(requireString(value("output"), "--output"));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ title: issue.title, body: issue.body }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(issue.facts, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli().catch((error) => {
    console.error(`operational-reliability-ledger: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
