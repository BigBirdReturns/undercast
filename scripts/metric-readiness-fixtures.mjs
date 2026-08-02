#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  emptyWaterlineState,
  makeMetricsReceipt,
  normalizeMetricObservationSource,
  validateWaterlineState,
} from "./lib/waterline.mjs";
import {
  applyMetricReadinessPolicy,
  metricObservationSnapshotsFromLedgers,
  resolveMetricObservationSources,
  validateMetricReadinessConfig,
} from "./lib/metric-readiness.mjs";

const config = {
  version: 1,
  scopes: [{
    id: "star-trek",
    label: "Star Trek",
    roadmap_milestone: "star-trek-gold-shard",
    required_closed_cycles: 3,
    max_tasks_per_cycle: 12,
    minimum_resolved_per_cycle: 1,
  }],
  operations: {
    one_cycle_at_a_time: true,
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
assert.equal(normalizeMetricObservationSource(`./${costSource}`), costSource);
assert.equal(normalizeMetricObservationSource(`data/operational-reliability/../operational-reliability/COST-OBSERVATIONS.json`), costSource);
assert.throws(() => normalizeMetricObservationSource("../outside.json"), /must stay within the repository/);
resolveMetricObservationSources(config, {
  root: "/repo",
  overrides: { cost_per_verified_record_usd: `./${costSource}` },
});
const aliasedSourceConfig = structuredClone(config);
aliasedSourceConfig.operations.metric_readiness.cost_per_verified_record_usd.observation_source = `./${costSource}`;
assert.equal(resolveMetricObservationSources(aliasedSourceConfig, { root: "/repo" }).cost_per_verified_record_usd.source, costSource);
const duplicateAliasConfig = structuredClone(config);
duplicateAliasConfig.operations.metric_readiness.rights_response_sla_days.observation_source = `./${costSource}`;
assert.throws(() => validateMetricReadinessConfig(duplicateAliasConfig), /assigned to multiple metrics/);
assert.throws(() => resolveMetricObservationSources(config, {
  root: "/repo",
  overrides: { cost_per_verified_record_usd: "data/other-cost.json" },
}), /does not match configured observation source/);

const emptyCost = { version: 1, observations: [] };
const emptyRights = { version: 1, cases: [] };
const emptySnapshots = snapshotsFor(emptyCost, emptyRights);
assert.equal(emptySnapshots.cost_per_verified_record_usd.population, 0);
assert.equal(emptySnapshots.cost_per_verified_record_usd.value, null);
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
assert.throws(() => makeMetricsReceipt({
  metrics: { cost_per_verified_record_usd: null },
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T00:30:00Z",
  note: "Attempted to preserve null after the validated ledger became populated.",
  evidence: [{ type: "report", value: "cost-null-after-observation.json" }],
}, baseState().metrics, {
  metricReadiness: config.operations.metric_readiness,
  observationSnapshots: oneCostSnapshots,
  metricReceipts: [],
}), /cannot record null against a populated validated observation snapshot/);

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
  value: 4.25,
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
status = applyMetricReadinessPolicy(baseStatus(), {
  config,
  state: {
    ...current,
    metrics: { ...current.metrics, cost_per_verified_record_usd: 1 },
  },
  observationSnapshots: oneCostSnapshots,
});
assert.deepEqual(status.evidence_readiness.metric_ledger_regressions, ["cost_per_verified_record_usd"]);
assert.equal(status.evidence_readiness.metric_states.cost_per_verified_record_usd.status, "measured-value-does-not-match-ledger");

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
assert.equal(rightsSnapshots.rights_response_sla_days.value, 20);
assert.throws(() => makeMetricsReceipt({
  metrics: { rights_response_sla_days: 1 },
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T01:30:00Z",
  note: "Attempted to record a value unrelated to the validated ledger result.",
  evidence: [{ type: "report", value: "rights.json" }],
}, baseState().metrics, {
  metricReadiness: config.operations.metric_readiness,
  observationSnapshots: rightsSnapshots,
}), /does not match validated ledger measurement 20/);
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

const aliasedEmptySnapshots = {
  ...emptySnapshots,
  cost_per_verified_record_usd: {
    ...emptySnapshots.cost_per_verified_record_usd,
    source: `./${costSource}`,
  },
};
assert.throws(() => makeMetricsReceipt({
  metrics: { cost_per_verified_record_usd: null },
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T03:10:00Z",
  note: "Attempted to erase a measured value through a spelling-only source alias.",
  evidence: [{ type: "report", value: "cost-source-alias.json" }],
}, current.metrics, {
  metricReadiness: aliasedSourceConfig.operations.metric_readiness,
  observationSnapshots: aliasedEmptySnapshots,
  metricReceipts: current.metric_receipts,
}), /only after the configured observation source changes/);
const aliasedPopulatedSnapshots = {
  ...oneCostSnapshots,
  cost_per_verified_record_usd: {
    ...oneCostSnapshots.cost_per_verified_record_usd,
    source: `./${costSource}`,
  },
};
const aliasedMeasurement = makeMetricsReceipt({
  metrics: { cost_per_verified_record_usd: 4.25 },
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T03:11:00Z",
  note: "Bound an aliased configured path to its canonical repository identity.",
  evidence: [{ type: "report", value: "cost-source-alias-measured.json" }],
}, baseState().metrics, {
  metricReadiness: aliasedSourceConfig.operations.metric_readiness,
  observationSnapshots: aliasedPopulatedSnapshots,
});
assert.equal(aliasedMeasurement.receipt.observation_bindings.cost_per_verified_record_usd.source, costSource);
const migratedCostSource = "data/operational-reliability/COST-OBSERVATIONS-V2.json";
const migratedConfig = structuredClone(config);
migratedConfig.operations.metric_readiness.cost_per_verified_record_usd.observation_source = migratedCostSource;
const migrationState = emptyWaterlineState();
migrationState.metrics = { ...baseState().metrics };
const historicalResult = makeMetricsReceipt({
  metrics: { cost_per_verified_record_usd: 4.25 },
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T03:15:00Z",
  note: "Measured the original configured cost ledger before source migration.",
  evidence: [{ type: "report", value: "cost-original.json" }],
}, migrationState.metrics, {
  metricReadiness: config.operations.metric_readiness,
  observationSnapshots: oneCostSnapshots,
});
migrationState.metrics = historicalResult.metrics;
migrationState.metric_receipts.push(historicalResult.receipt);
assert.doesNotThrow(() => validateWaterlineState(migrationState, migratedConfig));
const migratedSnapshots = {
  ...oneCostSnapshots,
  cost_per_verified_record_usd: {
    ...oneCostSnapshots.cost_per_verified_record_usd,
    source: migratedCostSource,
  },
};
status = applyMetricReadinessPolicy(baseStatus(), {
  config: migratedConfig,
  state: migrationState,
  observationSnapshots: migratedSnapshots,
});
assert.equal(status.evidence_readiness.operational_reliability, false);
assert.deepEqual(status.evidence_readiness.metric_ledger_regressions, ["cost_per_verified_record_usd"]);
assert.equal(status.evidence_readiness.metric_states.cost_per_verified_record_usd.status, "measured-against-wrong-ledger");
const migratedEmptySnapshots = {
  ...emptySnapshots,
  cost_per_verified_record_usd: {
    ...emptySnapshots.cost_per_verified_record_usd,
    source: migratedCostSource,
  },
};
const emptyMigrationState = structuredClone(migrationState);
status = applyMetricReadinessPolicy(baseStatus(), {
  config: migratedConfig,
  state: emptyMigrationState,
  observationSnapshots: migratedEmptySnapshots,
});
assert.equal(status.evidence_readiness.operational_reliability, false);
assert.equal(status.evidence_readiness.metric_states.cost_per_verified_record_usd.status, "measured-against-wrong-ledger");
assert.throws(() => makeMetricsReceipt({
  metrics: { cost_per_verified_record_usd: null },
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T03:17:00Z",
  note: "Attempted to erase a measured value after emptying the same observation source.",
  evidence: [{ type: "report", value: "cost-same-source-empty.json" }],
}, current.metrics, {
  metricReadiness: config.operations.metric_readiness,
  observationSnapshots: emptySnapshots,
  metricReceipts: current.metric_receipts,
}), /only after the configured observation source changes/);
const emptyResetResult = makeMetricsReceipt({
  metrics: { cost_per_verified_record_usd: null },
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T03:18:00Z",
  note: "Retired the historical numeric value against the reviewed empty replacement ledger.",
  evidence: [{ type: "report", value: "cost-migrated-empty.json" }],
}, emptyMigrationState.metrics, {
  metricReadiness: migratedConfig.operations.metric_readiness,
  observationSnapshots: migratedEmptySnapshots,
  metricReceipts: emptyMigrationState.metric_receipts,
});
assert.deepEqual(emptyResetResult.receipt.observation_bindings.cost_per_verified_record_usd, {
  source: migratedCostSource,
  sha256: migratedEmptySnapshots.cost_per_verified_record_usd.sha256,
  population: 0,
  value: null,
});
emptyMigrationState.metrics = emptyResetResult.metrics;
emptyMigrationState.metric_receipts.push(emptyResetResult.receipt);
assert.doesNotThrow(() => validateWaterlineState(emptyMigrationState, migratedConfig));
status = applyMetricReadinessPolicy(baseStatus(), {
  config: migratedConfig,
  state: emptyMigrationState,
  observationSnapshots: migratedEmptySnapshots,
});
assert.equal(status.evidence_readiness.operational_reliability, true);
assert.equal(status.evidence_readiness.metric_states.cost_per_verified_record_usd.status, "unobserved-nonblocking");
const tamperedEmptyResetState = structuredClone(emptyMigrationState);
tamperedEmptyResetState.metric_receipts.at(-1).observation_bindings.cost_per_verified_record_usd.value = 0;
assert.throws(() => validateWaterlineState(tamperedEmptyResetState, migratedConfig), /empty observation binding value must be null/);
const reboundResult = makeMetricsReceipt({
  metrics: { cost_per_verified_record_usd: 4.25 },
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T03:20:00Z",
  note: "Rebound the measured value to the reviewed replacement observation source.",
  evidence: [{ type: "report", value: "cost-migrated.json" }],
}, migrationState.metrics, {
  metricReadiness: migratedConfig.operations.metric_readiness,
  observationSnapshots: migratedSnapshots,
});
migrationState.metrics = reboundResult.metrics;
migrationState.metric_receipts.push(reboundResult.receipt);
assert.doesNotThrow(() => validateWaterlineState(migrationState, migratedConfig));
status = applyMetricReadinessPolicy(baseStatus(), {
  config: migratedConfig,
  state: migrationState,
  observationSnapshots: migratedSnapshots,
});
assert.equal(status.evidence_readiness.operational_reliability, true);
assert.equal(status.evidence_readiness.metric_states.cost_per_verified_record_usd.status, "measured");
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

const waterlineCli = fileURLToPath(new URL("./waterline.mjs", import.meta.url));
const isolationRoot = await mkdtemp(join(tmpdir(), "undercast-waterline-ledger-isolation-"));
const writeFixtureText = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
};
const writeFixtureJson = (path, value) => writeFixtureText(path, JSON.stringify(value, null, 2) + "\n");
try {
  const fixtureLease = "lease_metric_ledger_failure";
  const fixtureTask = "ap_metric_ledger_failure";
  await Promise.all([
    writeFixtureJson(join(isolationRoot, "data/WATERLINE.json"), config),
    writeFixtureJson(join(isolationRoot, "data/WATERLINE-STATE.json"), emptyWaterlineState()),
    writeFixtureJson(join(isolationRoot, "data/MEDIA-AUDIT.json"), {
      source: { item_set_sha256: "a".repeat(64) },
      items: [{ id: "media-1", scope: "star-trek", status: "verified" }],
    }),
    writeFixtureJson(join(isolationRoot, "data/AUTOPILOT.json"), {
      jobs: [{
        id: fixtureTask,
        scope: "star-trek",
        status: "resolved",
        source_fingerprint: "b".repeat(64),
        wall_ids: ["UC-FIXTURE"],
      }],
    }),
    writeFixtureText(join(isolationRoot, "data/journal/autopilot.jsonl"), JSON.stringify({
      op: "lease.claimed",
      task_id: fixtureTask,
      at: "2026-08-02T07:00:00Z",
      scope: "star-trek",
      lease_id: fixtureLease,
      readiness_token: "c".repeat(64),
    }) + "\n"),
    writeFixtureJson(join(isolationRoot, "data/ROADMAP-STATE.json"), { completed: [] }),
    writeFixtureJson(join(isolationRoot, "preservation/SNAPSHOTS.json"), {
      history_guard: { precondition_met: true, status: "offsite-verified" },
    }),
    writeFixtureText(join(isolationRoot, "data/journal/waterline.jsonl"), ""),
    writeFixtureJson(join(isolationRoot, costSource), {
      version: 1,
      observations: [{}],
    }),
    writeFixtureJson(join(isolationRoot, rightsSource), {
      version: 1,
      cases: [],
    }),
    writeFixtureJson(join(isolationRoot, "cycle.json"), {
      version: 1,
      scope_id: "star-trek",
      lease_id: fixtureLease,
      outcome: "completed",
      reviewed_by: "second-desk",
      reviewed_role: "second-desk",
      reviewed_at: "2026-08-02T07:01:00Z",
      note: "Record completed work even while a metric ledger needs repair.",
      evidence: [
        { type: "workflow-run", value: "fixture-cycle" },
        { type: "commit", value: "fixture-commit" },
        { type: "restart-proof", value: "fixture-restart" },
      ],
    }),
    writeFixtureJson(join(isolationRoot, "incident.json"), {
      incident_id: "metric-ledger-malformed",
      status: "open",
      severity: "high",
      at: "2026-08-02T07:02:00Z",
      recorded_by: "fixture-operator",
      recorded_role: "operator",
      note: "Open a stop even though the metric ledger is malformed.",
      evidence: [{ type: "incident", value: "fixture-incident" }],
    }),
    writeFixtureJson(join(isolationRoot, "metrics.json"), {
      metrics: { cost_per_verified_record_usd: 1 },
      reviewed_by: "second-desk",
      reviewed_role: "second-desk",
      reviewed_at: "2026-08-02T07:03:00Z",
      note: "Metric-aware writes must still refuse the malformed ledger.",
      evidence: [{ type: "report", value: "fixture-metrics" }],
    }),
  ]);

  const runCli = (...cliArgs) => spawnSync(
    process.execPath,
    [waterlineCli, ...cliArgs, "--root", isolationRoot],
    { encoding: "utf8" },
  );
  const cycleRun = runCli("record-cycle", "--input", "cycle.json");
  assert.equal(cycleRun.status, 0, "record-cycle failed: " + cycleRun.stderr);
  const incidentRun = runCli("record-incident", "--input", "incident.json");
  assert.equal(incidentRun.status, 0, "record-incident failed: " + incidentRun.stderr);

  const metricRun = runCli("record-metrics", "--input", "metrics.json");
  assert.notEqual(metricRun.status, 0);
  assert.match(metricRun.stderr, /cost observations\.id/);
  const statusRun = runCli("status");
  assert.notEqual(statusRun.status, 0);
  assert.match(statusRun.stderr, /cost observations\.id/);

  const persisted = JSON.parse(await readFile(join(isolationRoot, "data/WATERLINE-STATE.json"), "utf8"));
  assert.equal(persisted.cycles.length, 1);
  assert.equal(persisted.incidents.length, 1);
  assert.equal(persisted.incidents[0].severity, "high");
  assert.equal(persisted.metric_receipts.length, 0);
} finally {
  await rm(isolationRoot, { recursive: true, force: true });
}

console.log("PASS — normalized source identity, populated-ledger null refusal, migration/reset custody, non-metric writer isolation during malformed metric ledgers, exact byte/population/value bindings, mismatch refusal, stale-measurement reopening, SLO refusal, and no-golden-cage null semantics");
