#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  applyMetricReadinessPolicy,
  metricObservationCountsFromLedgers,
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

const state = {
  metrics: {
    build_minutes_p95: 1.091267,
    cost_per_verified_record_usd: null,
    source_freshness_p95_days: 3.683774,
    rights_response_sla_days: null,
  },
};

validateMetricReadinessConfig(config);
assert.throws(() => validateMetricReadinessConfig({
  ...config,
  operations: {
    ...config.operations,
    metric_readiness: {
      ...config.operations.metric_readiness,
      rights_response_sla_days: undefined,
    },
  },
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

const emptyCounts = metricObservationCountsFromLedgers({
  costLedger: { version: 1, observations: [] },
  rightsLedger: { version: 1, cases: [] },
});
assert.deepEqual(emptyCounts, {
  cost_per_verified_record_usd: 0,
  rights_response_sla_days: 0,
});

let status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state,
  observationCounts: emptyCounts,
});
assert.equal(status.evidence_readiness.operational_reliability, true);
assert.deepEqual(status.evidence_readiness.missing_metrics, []);
assert.deepEqual(status.evidence_readiness.unobserved_nonblocking_metrics, [
  "cost_per_verified_record_usd",
  "rights_response_sla_days",
]);
assert.equal(status.evidence_readiness.metric_states.cost_per_verified_record_usd.status, "unobserved-nonblocking");
assert.equal(status.evidence_readiness.metric_states.rights_response_sla_days.status, "unobserved-nonblocking");
assert.deepEqual(status.natural_unlocks_when_receipted, [
  "adapter-sdk-and-second-gold-shard",
  "public-trust-and-corrections",
]);

status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state,
  observationCounts: {
    cost_per_verified_record_usd: 1,
    rights_response_sla_days: 0,
  },
});
assert.equal(status.evidence_readiness.operational_reliability, false);
assert.deepEqual(status.evidence_readiness.measurement_due_metrics, ["cost_per_verified_record_usd"]);
assert.deepEqual(status.evidence_readiness.missing_metrics, ["cost_per_verified_record_usd"]);

status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state: {
    metrics: {
      ...state.metrics,
      cost_per_verified_record_usd: 4.25,
    },
  },
  observationCounts: {
    cost_per_verified_record_usd: 1,
    rights_response_sla_days: 0,
  },
});
assert.equal(status.evidence_readiness.operational_reliability, true);
assert.deepEqual(status.evidence_readiness.unobserved_nonblocking_metrics, ["rights_response_sla_days"]);

status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state: {
    metrics: {
      ...state.metrics,
      rights_response_sla_days: 20,
    },
  },
  observationCounts: {
    cost_per_verified_record_usd: 0,
    rights_response_sla_days: 1,
  },
});
assert.equal(status.evidence_readiness.operational_reliability, false);
assert.deepEqual(status.evidence_readiness.slo_target_failures, [
  { metric: "rights_response_sla_days", value: 20, target: 14 },
]);

status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state: {
    metrics: {
      ...state.metrics,
      cost_per_verified_record_usd: 4.25,
    },
  },
  observationCounts: emptyCounts,
});
assert.equal(status.evidence_readiness.operational_reliability, false);
assert.deepEqual(status.evidence_readiness.metric_ledger_regressions, ["cost_per_verified_record_usd"]);
assert.equal(status.evidence_readiness.metric_states.cost_per_verified_record_usd.status, "measured-without-observation-custody");

status = applyMetricReadinessPolicy({
  ...baseStatus(),
  evidence_readiness: {
    ...baseStatus().evidence_readiness,
    missing_drills: ["publication-rollback"],
  },
}, {
  config,
  state,
  observationCounts: emptyCounts,
});
assert.equal(status.evidence_readiness.operational_reliability, false);

status = applyMetricReadinessPolicy({
  ...baseStatus(),
  incidents: { blocking_open: [{ incident_id: "inc-1" }] },
}, {
  config,
  state,
  observationCounts: emptyCounts,
});
assert.equal(status.evidence_readiness.operational_reliability, false);

status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state: {
    metrics: {
      ...state.metrics,
      source_freshness_p95_days: null,
    },
  },
  observationCounts: emptyCounts,
});
assert.equal(status.evidence_readiness.operational_reliability, false);
assert.deepEqual(status.evidence_readiness.missing_required_metrics, ["source_freshness_p95_days"]);

assert.throws(() => metricObservationCountsFromLedgers({
  costLedger: { version: 1, observations: {} },
  rightsLedger: { version: 1, cases: [] },
}), /cost ledger/);

console.log("PASS — required metrics block, empty event-dependent ledgers remain explicit nonblocking debt, first observations reopen measurement, and ledger regressions fail closed");
