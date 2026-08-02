#!/usr/bin/env node
import assert from "node:assert/strict";
import { makeMetricsReceipt } from "./lib/waterline.mjs";
import {
  applyMetricReadinessPolicy,
  metricObservationSnapshotsFromLedgers,
  resolveMetricObservationSources,
  validateMetricReadinessConfig,
} from "./lib/metric-readiness.mjs";

const config = {
  version: 1,
  operations: {
    required_drills: ["repository-restore", "publication-rollback"],
    slo_targets: {
      build_minutes_p95: 20,
      source_freshness_p95_days: 14,
      rights_response_sla_days: 14,
    },
    metric_readiness: {
      build_minutes_p95: { mode: "required" },
      cost_per_verified_record_usd: {
        mode: "when-observed",
        observation_source: "data/operational-reliability/COST-OBSERVATIONS.json",
      },
      source_freshness_p95_days: { mode: "required" },
      rights_response_sla_days: {
        mode: "when-observed",
        observation_source: "data/operational-reliability/RIGHTS-CASES.json",
      },
    },
  },
};

const costSource = config.operations.metric_readiness.cost_per_verified_record_usd.observation_source;
const rightsSource = config.operations.metric_readiness.rights_response_sla_days.observation_source;
const encoded = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const costRow = (id = "cost-1", amount = 4.25) => ({
  id,
  at: "2026-08-02T00:00:00Z",
  currency: "USD",
  direct_cost_usd: amount,
  verified_records: 1,
  evidence: [{ type: "invoice", value: `${id}.json` }],
});
const rightsRow = (id = "rights-1", days = 10) => ({
  id,
  case_type: "exercise",
  opened_at: "2026-08-01T00:00:00Z",
  first_response_at: new Date(Date.parse("2026-08-01T00:00:00Z") + days * 86_400_000).toISOString(),
  evidence: [{ type: "exercise", value: `${id}.json` }],
});
const snapshotsFor = (costLedger, rightsLedger) => metricObservationSnapshotsFromLedgers({
  costLedger,
  costLedgerBytes: encoded(costLedger),
  costSource,
  rightsLedger,
  rightsLedgerBytes: encoded(rightsLedger),
  rightsSource,
});
const baseStatus = () => ({
  evidence_readiness: {
    star_trek_gold_shard: true,
    operational_reliability: false,
    missing_drills: [],
    missing_metrics: [],
    slo_target_failures: [],
  },
  incidents: { blocking_open: [] },
  natural_unlocks_when_receipted: [],
});
const baseState = () => ({
  metrics: {
    build_minutes_p95: 1.091267,
    cost_per_verified_record_usd: null,
    source_freshness_p95_days: 3.683774,
    rights_response_sla_days: null,
  },
  metric_receipts: [],
});

validateMetricReadinessConfig(config);
const {
  rights_response_sla_days: omittedRightsPolicy,
  ...missingMetricReadiness
} = config.operations.metric_readiness;
assert.equal(omittedRightsPolicy.mode, "when-observed");
assert.throws(() => validateMetricReadinessConfig({
  ...config,
  operations: { ...config.operations, metric_readiness: missingMetricReadiness },
}), /must define exactly/);
assert.throws(() => validateMetricReadinessConfig({
  ...config,
  operations: {
    ...config.operations,
    metric_readiness: {
      ...config.operations.metric_readiness,
      rights_response_sla_days: { mode: "convenient" },
    },
  },
}), /mode is invalid/);

const resolved = resolveMetricObservationSources(config, { root: "/repo" });
assert.equal(resolved.cost_per_verified_record_usd.path, "/repo/data/operational-reliability/COST-OBSERVATIONS.json");
assert.equal(resolved.rights_response_sla_days.source, rightsSource);
resolveMetricObservationSources(config, {
  root: "/repo",
  overrides: { cost_per_verified_record_usd: costSource },
});
assert.throws(() => resolveMetricObservationSources(config, {
  root: "/repo",
  overrides: { cost_per_verified_record_usd: "data/other-cost.json" },
}), /does not match configured observation source/);

const emptyCost = { version: 1, observations: [] };
const emptyRights = { version: 1, cases: [] };
const emptySnapshots = snapshotsFor(emptyCost, emptyRights);
assert.equal(emptySnapshots.cost_per_verified_record_usd.population, 0);
assert.equal(emptySnapshots.cost_per_verified_record_usd.measurement_status, "no-observations");

let status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state: baseState(),
  observationSnapshots: emptySnapshots,
});
assert.equal(status.evidence_readiness.operational_reliability, true);
assert.deepEqual(status.evidence_readiness.missing_metrics, []);
assert.deepEqual(status.evidence_readiness.unobserved_nonblocking_metrics, [
  "cost_per_verified_record_usd",
  "rights_response_sla_days",
]);
assert.deepEqual(status.natural_unlocks_when_receipted, [
  "adapter-sdk-and-second-gold-shard",
  "public-trust-and-corrections",
]);

const oneCost = { version: 1, observations: [costRow()] };
const oneCostSnapshots = snapshotsFor(oneCost, emptyRights);
status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state: baseState(),
  observationSnapshots: oneCostSnapshots,
});
assert.equal(status.evidence_readiness.operational_reliability, false);
assert.deepEqual(status.evidence_readiness.measurement_due_metrics, ["cost_per_verified_record_usd"]);

const current = baseState();
const metricResult = makeMetricsReceipt({
  metrics: { cost_per_verified_record_usd: 4.25 },
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T01:00:00Z",
  note: "Measured the validated current cost ledger.",
  evidence: [{ type: "report", value: "cost.json" }],
}, current.metrics, {
  metricReadiness: config.operations.metric_readiness,
  observationSnapshots: oneCostSnapshots,
});
assert.deepEqual(metricResult.receipt.observation_bindings.cost_per_verified_record_usd, {
  source: costSource,
  sha256: oneCostSnapshots.cost_per_verified_record_usd.sha256,
  population: 1,
});
current.metrics = metricResult.metrics;
current.metric_receipts.push(metricResult.receipt);
status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state: current,
  observationSnapshots: oneCostSnapshots,
});
assert.equal(status.evidence_readiness.operational_reliability, true);
assert.equal(status.evidence_readiness.metric_states.cost_per_verified_record_usd.status, "measured");

const appendedCost = { version: 1, observations: [costRow(), costRow("cost-2", 3.5)] };
status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state: current,
  observationSnapshots: snapshotsFor(appendedCost, emptyRights),
});
assert.equal(status.evidence_readiness.operational_reliability, false);
assert.deepEqual(status.evidence_readiness.stale_metric_measurements, ["cost_per_verified_record_usd"]);
assert.equal(status.evidence_readiness.metric_states.cost_per_verified_record_usd.status, "measurement-stale-after-ledger-change");

const replacedCost = { version: 1, observations: [costRow("replacement", 9.5)] };
status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state: current,
  observationSnapshots: snapshotsFor(replacedCost, emptyRights),
});
assert.deepEqual(status.evidence_readiness.stale_metric_measurements, ["cost_per_verified_record_usd"]);

status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state: {
    ...current,
    metric_receipts: [{ id: "metrics-unbound", metrics: { cost_per_verified_record_usd: 4.25 } }],
  },
  observationSnapshots: oneCostSnapshots,
});
assert.deepEqual(status.evidence_readiness.metric_ledger_regressions, ["cost_per_verified_record_usd"]);
assert.equal(status.evidence_readiness.metric_states.cost_per_verified_record_usd.status, "measured-without-observation-binding");

const oneRights = { version: 1, cases: [rightsRow("rights-slow", 20)] };
const rightsSnapshots = snapshotsFor(emptyCost, oneRights);
const rightsState = baseState();
const rightsResult = makeMetricsReceipt({
  metrics: { rights_response_sla_days: 20 },
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T02:00:00Z",
  note: "Measured the validated rights ledger.",
  evidence: [{ type: "report", value: "rights.json" }],
}, rightsState.metrics, {
  metricReadiness: config.operations.metric_readiness,
  observationSnapshots: rightsSnapshots,
});
rightsState.metrics = rightsResult.metrics;
rightsState.metric_receipts.push(rightsResult.receipt);
status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state: rightsState,
  observationSnapshots: rightsSnapshots,
});
assert.equal(status.evidence_readiness.operational_reliability, false);
assert.deepEqual(status.evidence_readiness.slo_target_failures, [
  { metric: "rights_response_sla_days", value: 20, target: 14 },
]);

assert.throws(() => applyMetricReadinessPolicy(baseStatus(), {
  config,
  state: baseState(),
  observationSnapshots: {
    ...emptySnapshots,
    cost_per_verified_record_usd: {
      ...emptySnapshots.cost_per_verified_record_usd,
      source: "data/wrong-cost.json",
    },
  },
}), /does not match configured source/);
assert.throws(() => snapshotsFor({ version: 1, observations: [{}] }, emptyRights), /cost observations.id/);
assert.throws(() => makeMetricsReceipt({
  metrics: { cost_per_verified_record_usd: 4.25 },
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T03:00:00Z",
  note: "Attempted unbound cost measurement.",
  evidence: [{ type: "report", value: "cost.json" }],
}, baseState().metrics, {
  metricReadiness: config.operations.metric_readiness,
  observationSnapshots: emptySnapshots,
}), /requires a populated validated observation snapshot/);

status = applyMetricReadinessPolicy({
  ...baseStatus(),
  evidence_readiness: { ...baseStatus().evidence_readiness, missing_drills: ["publication-rollback"] },
}, {
  config,
  state: baseState(),
  observationSnapshots: emptySnapshots,
});
assert.equal(status.evidence_readiness.operational_reliability, false);
status = applyMetricReadinessPolicy({
  ...baseStatus(),
  incidents: { blocking_open: [{ incident_id: "inc-1" }] },
}, {
  config,
  state: baseState(),
  observationSnapshots: emptySnapshots,
});
assert.equal(status.evidence_readiness.operational_reliability, false);
status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state: {
    ...baseState(),
    metrics: { ...baseState().metrics, source_freshness_p95_days: null },
  },
  observationSnapshots: emptySnapshots,
});
assert.deepEqual(status.evidence_readiness.missing_required_metrics, ["source_freshness_p95_days"]);

console.log("PASS — configured ledger sources, validated rows, exact byte/population bindings, stale-measurement reopening, SLO refusal, and no-golden-cage null semantics");
