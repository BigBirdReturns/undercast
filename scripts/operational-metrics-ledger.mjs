#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OPERATIONAL_METRICS_LEDGER_VERSION = 1;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^(?:sha256:)?[0-9a-f]{64}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function stableJson(value) { return JSON.stringify(stable(value)); }
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}
function requireString(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}
function requireDate(value, label) {
  const text = requireString(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO date/time`);
  return text;
}
function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive safe integer`);
  return number;
}
function requireCommit(value, label) {
  const text = requireString(value, label);
  if (!COMMIT_RE.test(text)) throw new Error(`${label} must be a full commit SHA`);
  return text;
}
function requireHash(value, label, prefixed = false) {
  const text = requireString(value, label).toLowerCase();
  if (!SHA256_RE.test(text)) throw new Error(`${label} must be a SHA-256`);
  if (prefixed && !text.startsWith("sha256:")) throw new Error(`${label} must use the sha256: prefix`);
  return text;
}
function requireUrl(value, label) {
  const text = requireString(value, label);
  if (!text.startsWith("https://")) throw new Error(`${label} must use HTTPS`);
  return text;
}
function requireRepository(value) {
  const text = requireString(value, "repository");
  if (!REPOSITORY_RE.test(text)) throw new Error("repository must use owner/name form");
  return text;
}
function validateMetric(row, key) {
  requireObject(row, key);
  if (row.metric !== key) throw new Error(`${key}.metric drifted`);
  if (!new Set(["measured", "no-observations", "insufficient-population"]).has(row.status)) throw new Error(`${key}.status is invalid`);
  if (row.status === "measured") {
    if (!Number.isFinite(row.value) || row.value < 0) throw new Error(`${key}.value must be non-negative when measured`);
    if (!Number.isSafeInteger(row.population) || row.population < 1) throw new Error(`${key}.population must be positive when measured`);
  } else if (row.value !== null) throw new Error(`${key}.value must be null when unresolved`);
  return row;
}

export function buildOperationalMetricsIssue({
  evidence,
  evidenceRaw,
  buildSamples,
  buildSamplesRaw,
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
  evidence = requireObject(evidence, "evidence");
  if (evidence.version !== 1 || evidence.operation !== "operational-reliability-metric-evidence") throw new Error("metric evidence version or operation is invalid");
  if (evidence.boundary?.workflow_executed_unreviewed !== true || evidence.boundary?.waterline_state_mutated !== false || evidence.boundary?.roadmap_state_mutated !== false || evidence.boundary?.missing_values_rounded_to_zero !== false || evidence.boundary?.second_desk_review_required_before_recording !== true) {
    throw new Error("metric evidence authority boundary is invalid");
  }
  runId = requirePositiveInteger(runId, "run id");
  runAttempt = requirePositiveInteger(runAttempt, "run attempt");
  repository = requireRepository(repository);
  eventName = requireString(eventName, "event name");
  headBranch = requireString(headBranch, "head branch");
  headSha = requireCommit(headSha, "head SHA");
  generatedAt = requireDate(generatedAt, "generated_at");
  artifactId = requirePositiveInteger(artifactId, "artifact id");
  artifactName = requireString(artifactName, "artifact name");
  artifactDigest = requireHash(artifactDigest, "artifact digest", true);
  runUrl = requireUrl(runUrl, "run URL");
  artifactUrl = requireUrl(artifactUrl, "artifact URL");

  if (eventName !== "push") throw new Error(`ledger accepts only push evidence, found ${eventName}`);
  if (headBranch !== "main") throw new Error(`ledger accepts only main evidence, found ${headBranch}`);
  const expectedRunUrl = `https://github.com/${repository}/actions/runs/${runId}`;
  if (runUrl !== expectedRunUrl) throw new Error(`run URL ${runUrl} != ${expectedRunUrl}`);
  const expectedArtifactName = `operational-metrics-evidence-${runId}-attempt-${runAttempt}`;
  if (artifactName !== expectedArtifactName) throw new Error(`artifact name ${artifactName} != ${expectedArtifactName}`);
  const expectedArtifactUrl = `${expectedRunUrl}/artifacts/${artifactId}`;
  if (artifactUrl !== expectedArtifactUrl) throw new Error(`artifact URL ${artifactUrl} != ${expectedArtifactUrl}`);

  const metrics = requireObject(evidence.metrics, "evidence.metrics");
  const build = validateMetric(metrics.build_minutes_p95, "build_minutes_p95");
  const freshness = validateMetric(metrics.source_freshness_p95_days, "source_freshness_p95_days");
  const cost = validateMetric(metrics.cost_per_verified_record_usd, "cost_per_verified_record_usd");
  const rights = validateMetric(metrics.rights_response_sla_days, "rights_response_sla_days");
  if (build.status !== "measured" || build.population < 5) throw new Error("build metric lacks the required measured population");
  if (freshness.status !== "measured" || freshness.population < 1) throw new Error("source freshness metric lacks a measured population");
  if (build.target_head !== headSha) throw new Error("build metric target does not match exact main");
  if (evidence.source_manifest?.path === undefined) throw new Error("source manifest path is missing");
  requireString(evidence.source_manifest.path, "source manifest path");
  requireHash(evidence.source_manifest.sha256, "source manifest SHA-256");
  requireDate(evidence.source_manifest.captured_at, "source manifest captured_at");

  buildSamples = requireArray(buildSamples, "build samples");
  if (buildSamples.length !== build.population) throw new Error("build sample count does not match metric population");
  const sampleIds = new Set();
  for (const [index, row] of buildSamples.entries()) {
    requireObject(row, `build samples[${index}]`);
    const id = requireString(row.id, `build samples[${index}].id`);
    if (sampleIds.has(id)) throw new Error(`duplicate build sample ${id}`);
    sampleIds.add(id);
    if (row.target_head !== headSha) throw new Error(`build sample ${id} target does not match exact main`);
    if (row.workflow_run !== runId || row.workflow_attempt !== runAttempt) throw new Error(`build sample ${id} workflow custody drifted`);
    if (row.gate_exit_code !== 0 || row.exact_head !== true || row.rendered_browser !== true) throw new Error(`build sample ${id} is not a complete exact-head gate`);
    if (!Number.isFinite(row.duration_ms) || row.duration_ms < 0) throw new Error(`build sample ${id} duration is invalid`);
  }
  if (JSON.stringify([...sampleIds]) !== JSON.stringify(build.sample_ids)) throw new Error("build metric sample IDs do not match the supplied sample bytes");

  const measuredPatch = requireObject(evidence.measured_patch, "measured_patch");
  if (measuredPatch.build_minutes_p95 !== build.value || measuredPatch.source_freshness_p95_days !== freshness.value) throw new Error("measured patch does not match measured rows");
  if (cost.status === "measured" && measuredPatch.cost_per_verified_record_usd !== cost.value) throw new Error("measured cost is absent from measured patch");
  if (rights.status === "measured" && measuredPatch.rights_response_sla_days !== rights.value) throw new Error("measured rights response is absent from measured patch");
  if (cost.status !== "measured" && "cost_per_verified_record_usd" in measuredPatch) throw new Error("unresolved cost entered measured patch");
  if (rights.status !== "measured" && "rights_response_sla_days" in measuredPatch) throw new Error("unresolved rights response entered measured patch");

  const evidenceSha = sha256(evidenceRaw);
  const buildSamplesSha = sha256(buildSamplesRaw);
  const facts = {
    version: OPERATIONAL_METRICS_LEDGER_VERSION,
    evidence_tier: "workflow-executed-unreviewed",
    review_status: "unreviewed",
    generated_at: generatedAt,
    repository,
    event: eventName,
    branch: headBranch,
    target_head: headSha,
    workflow: { run_id: runId, run_attempt: runAttempt, run_url: runUrl },
    artifact: { id: artifactId, name: artifactName, url: artifactUrl, digest: artifactDigest },
    evidence: {
      operational_metrics_sha256: evidenceSha,
      build_samples_sha256: buildSamplesSha,
      source_manifest_path: evidence.source_manifest.path,
      source_manifest_sha256: evidence.source_manifest.sha256,
      as_of: evidence.as_of,
    },
    metrics: {
      build_minutes_p95: build,
      source_freshness_p95_days: freshness,
      cost_per_verified_record_usd: cost,
      rights_response_sla_days: rights,
    },
    boundary: {
      reviewed_waterline_receipt_created: false,
      roadmap_milestone_completed: false,
      artifact_and_evidence_hashes_are_authoritative: true,
      discovery_issue_is_mutable: true,
      second_desk_review_required: true,
    },
  };
  const ledgerSha = sha256(stableJson(facts));
  const metricLine = (key, row) => `- ${key}: \`${row.status}\`${row.value === null ? "" : `, value \`${row.value}\``}, population ${row.population}`;
  const title = `Operational metric evidence run ${runId} @ ${headSha.slice(0, 12)}`;
  const body = [
    "## Exact-main operational metric evidence",
    "",
    "This issue is the durable discovery surface for one successful exact-main metric run. The workflow produced the evidence and did not review or admit its own values. A rerun may update the issue, while the artifact digest and evidence hashes remain the custody identifiers.",
    "",
    `- Target: \`${headSha}\` on \`main\``,
    `- Workflow run: ${runUrl}`,
    `- Artifact: ${artifactUrl}`,
    `- Artifact digest: \`${artifactDigest}\``,
    `- Source manifest: \`${evidence.source_manifest.path}\``,
    `- Source manifest SHA-256: \`${evidence.source_manifest.sha256}\``,
    `- Metric evidence SHA-256: \`${evidenceSha}\``,
    `- Build samples SHA-256: \`${buildSamplesSha}\``,
    metricLine("build_minutes_p95", build),
    metricLine("source_freshness_p95_days", freshness),
    metricLine("cost_per_verified_record_usd", cost),
    metricLine("rights_response_sla_days", rights),
    `- Ledger content SHA-256: \`${ledgerSha}\``,
    "",
    "### Control boundary",
    "",
    "No waterline metric receipt was created, no roadmap milestone was completed, and no missing value was converted to zero. A separate second-desk transaction must inspect the artifact and decide which measured values may enter state.",
    "",
    "<details><summary>Machine-readable facts</summary>",
    "",
    "```json",
    JSON.stringify({ ...facts, ledger_sha256: ledgerSha }, null, 2),
    "```",
    "",
    "</details>",
  ].join("\n");
  return { title, body, facts: { ...facts, ledger_sha256: ledgerSha } };
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() || "help";
  const values = new Map();
  while (args.length) {
    const token = args.shift();
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const value = args.shift();
    if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
    values.set(token.slice(2), value);
  }
  return { command, get: (name, fallback = null) => values.has(name) ? values.get(name) : fallback };
}

async function main() {
  const { command, get } = parseArgs(process.argv.slice(2));
  if (command !== "issue-payload") throw new Error("unknown command; use issue-payload");
  const evidencePath = path.resolve(requireString(get("evidence"), "--evidence"));
  const samplesPath = path.resolve(requireString(get("build-samples"), "--build-samples"));
  const [evidenceRaw, buildSamplesRaw] = await Promise.all([readFile(evidencePath), readFile(samplesPath)]);
  const issue = buildOperationalMetricsIssue({
    evidence: JSON.parse(evidenceRaw.toString("utf8")), evidenceRaw,
    buildSamples: JSON.parse(buildSamplesRaw.toString("utf8")), buildSamplesRaw,
    runId: get("run-id"), runAttempt: get("run-attempt"), runUrl: get("run-url"),
    repository: get("repository"), eventName: get("event-name"), headBranch: get("head-branch"), headSha: get("head-sha"),
    generatedAt: get("generated-at", new Date().toISOString()),
    artifactId: get("artifact-id"), artifactName: get("artifact-name"), artifactUrl: get("artifact-url"), artifactDigest: get("artifact-digest"),
  });
  const output = path.resolve(requireString(get("output"), "--output"));
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({ title: issue.title, body: issue.body }, null, 2)}\n`);
  console.log(JSON.stringify(issue.facts, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`operational-metrics-ledger: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
