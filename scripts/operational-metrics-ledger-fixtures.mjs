#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildOperationalMetricsIssue, sha256 } from "./operational-metrics-ledger.mjs";

const repository = "BigBirdReturns/undercast";
const runId = 30730000001;
const runAttempt = 1;
const headSha = "a".repeat(40);
const samples = [60_000, 61_000, 62_000, 63_000, 64_000].map((duration, index) => ({
  id: `canonical-gate-${index + 1}`,
  target_head: headSha,
  workflow_run: runId,
  workflow_attempt: runAttempt,
  started_at: new Date(Date.UTC(2026, 7, 2, 0, index * 2)).toISOString(),
  completed_at: new Date(Date.UTC(2026, 7, 2, 0, index * 2) + duration).toISOString(),
  duration_ms: duration,
  gate_exit_code: 0,
  exact_head: true,
  rendered_browser: true,
}));
const evidence = {
  version: 1,
  operation: "operational-reliability-metric-evidence",
  generated_at: "2026-08-02T00:10:00Z",
  as_of: "2026-08-02T00:10:00Z",
  source_manifest: {
    path: "fixtures/custom-manifest.json",
    sha256: "1".repeat(64),
    captured_at: "2026-07-29T00:00:00Z",
    franchise: "Star Trek",
  },
  metrics: {
    build_minutes_p95: {
      metric: "build_minutes_p95", status: "measured", value: 1.066667, unit: "minutes", population: 5,
      minimum_population: 5, target_head: headSha, quantile: "nearest-rank-p95", p95_ms: 64000,
      min_ms: 60000, max_ms: 64000, sample_ids: samples.map((row) => row.id),
    },
    source_freshness_p95_days: {
      metric: "source_freshness_p95_days", status: "measured", value: 3, unit: "days", population: 2,
      franchise: "Star Trek", as_of: "2026-08-02T00:10:00Z", quantile: "nearest-rank-p95",
      minimum_days: 2, maximum_days: 3, denominator: "unique exact source revision identities",
    },
    cost_per_verified_record_usd: {
      metric: "cost_per_verified_record_usd", status: "no-observations", value: null, population: 0,
      boundary: "No observations.",
    },
    rights_response_sla_days: {
      metric: "rights_response_sla_days", status: "no-observations", value: null, population: 0,
      boundary: "No observations.",
    },
  },
  measured_patch: { build_minutes_p95: 1.066667, source_freshness_p95_days: 3 },
  unresolved_metrics: [
    { metric: "cost_per_verified_record_usd", status: "no-observations", boundary: "No observations." },
    { metric: "rights_response_sla_days", status: "no-observations", boundary: "No observations." },
  ],
  boundary: {
    workflow_executed_unreviewed: true,
    waterline_state_mutated: false,
    roadmap_state_mutated: false,
    missing_values_rounded_to_zero: false,
    second_desk_review_required_before_recording: true,
  },
};
const evidenceRaw = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
const buildSamplesRaw = Buffer.from(`${JSON.stringify(samples, null, 2)}\n`);
const artifactId = 8827000000;
const base = {
  evidence, evidenceRaw, buildSamples: samples, buildSamplesRaw,
  runId, runAttempt,
  runUrl: `https://github.com/${repository}/actions/runs/${runId}`,
  repository, eventName: "push", headBranch: "main", headSha,
  generatedAt: "2026-08-02T00:11:00Z",
  artifactId, artifactName: `operational-metrics-evidence-${runId}`,
  artifactUrl: `https://github.com/${repository}/actions/runs/${runId}/artifacts/${artifactId}`,
  artifactDigest: `sha256:${sha256("artifact")}`,
};

const issue = buildOperationalMetricsIssue(base);
assert.equal(issue.title, `Operational metric evidence run ${runId} @ ${headSha.slice(0, 12)}`);
assert.equal(issue.facts.evidence.source_manifest_path, "fixtures/custom-manifest.json");
assert.equal(issue.facts.metrics.cost_per_verified_record_usd.value, null);
assert.equal(issue.facts.boundary.reviewed_waterline_receipt_created, false);
assert.match(issue.body, /No waterline metric receipt was created/);
assert.match(issue.facts.ledger_sha256, /^[0-9a-f]{64}$/);

assert.throws(() => buildOperationalMetricsIssue({ ...base, eventName: "pull_request" }), /only push evidence/);
assert.throws(() => buildOperationalMetricsIssue({ ...base, headBranch: "feature" }), /only main evidence/);
assert.throws(() => buildOperationalMetricsIssue({ ...base, runUrl: "https://example.test/run" }), /run URL/);
assert.throws(() => buildOperationalMetricsIssue({ ...base, artifactUrl: "https://example.test/artifact" }), /artifact URL/);
assert.throws(() => buildOperationalMetricsIssue({ ...base, headSha: "b".repeat(40) }), /target does not match/);
assert.throws(() => buildOperationalMetricsIssue({ ...base, buildSamples: [...samples, samples[0]] }), /count does not match/);
assert.throws(() => buildOperationalMetricsIssue({ ...base, buildSamples: samples.map((row, index) => index ? row : { ...row, rendered_browser: false }) }), /not a complete exact-head gate/);
assert.throws(() => buildOperationalMetricsIssue({ ...base, evidence: { ...evidence, measured_patch: { ...evidence.measured_patch, cost_per_verified_record_usd: 0 } } }), /unresolved cost entered/);

const measuredCost = structuredClone(evidence);
measuredCost.metrics.cost_per_verified_record_usd = {
  metric: "cost_per_verified_record_usd", status: "measured", value: 4, unit: "USD per verified record", population: 1,
};
measuredCost.measured_patch.cost_per_verified_record_usd = 4;
const measuredCostIssue = buildOperationalMetricsIssue({ ...base, evidence: measuredCost, evidenceRaw: Buffer.from(`${JSON.stringify(measuredCost, null, 2)}\n`) });
assert.equal(measuredCostIssue.facts.metrics.cost_per_verified_record_usd.value, 4);

const workflowPath = fileURLToPath(new URL("../.github/workflows/operational-metrics-evidence.yml", import.meta.url));
const workflow = await readFile(workflowPath, "utf8");
assert.match(workflow, /permissions:\n  contents: read\n  issues: write/);
assert.match(workflow, /id: metric_artifact/);
assert.match(workflow, /steps\.metric_artifact\.outputs\.artifact-id/);
assert.match(workflow, /github\.event_name == 'push'/);
assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
assert.match(workflow, /operational-metrics-ledger\.mjs issue-payload/);
assert.match(workflow, /ledgerCounts/);
assert.match(workflow, /multiple exact metric evidence issues found/);
assert.doesNotMatch(workflow, /waterline\.mjs record-metrics/);
assert.doesNotMatch(workflow, /ROADMAP-STATE\.json/);

console.log("PASS — operational metric exact-main ledger, populated-ledger compatibility, artifact binding, and unreviewed boundary");
