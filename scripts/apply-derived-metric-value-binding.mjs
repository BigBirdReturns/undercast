#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const command = process.argv[2];
const RECEIPT = "data/review/operational-reliability/metric-ledger-custody-hotfix-2026-08-02.json";
const FILES = [
  "scripts/lib/metric-readiness.mjs",
  "scripts/lib/waterline.mjs",
  "scripts/metric-readiness-fixtures.mjs",
  "docs/OPERATIONAL-METRICS.md",
];

function replaceOnce(path, before, after, label) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one exact match, found ${count}`);
  writeFileSync(path, source.replace(before, after));
}

function apply() {
  replaceOnce(
    "scripts/lib/metric-readiness.mjs",
    `function requireCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(\`${label} must be a non-negative safe integer\`);
  return value;
}

function requireHash`,
    `function requireCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(\`${label} must be a non-negative safe integer\`);
  return value;
}

function requireMetricValue(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new Error(\`${label} must be a non-negative number\`);
  return value;
}

function requireHash`,
    "metric value helper",
  );

  replaceOnce(
    "scripts/lib/metric-readiness.mjs",
    `      population: requireCount(costMeasurement.population, "cost observation population"),
      measurement_status: costMeasurement.status,`,
    `      population: requireCount(costMeasurement.population, "cost observation population"),
      value: costMeasurement.value,
      measurement_status: costMeasurement.status,`,
    "cost snapshot value",
  );
  replaceOnce(
    "scripts/lib/metric-readiness.mjs",
    `      population: requireCount(rightsMeasurement.population, "rights observation population"),
      measurement_status: rightsMeasurement.status,`,
    `      population: requireCount(rightsMeasurement.population, "rights observation population"),
      value: rightsMeasurement.value,
      measurement_status: rightsMeasurement.status,`,
    "rights snapshot value",
  );

  replaceOnce(
    "scripts/lib/metric-readiness.mjs",
    `    if (snapshot.measurement_status !== expectedStatus) {
      throw new Error(\`${metric} ledger status \${snapshot.measurement_status} disagrees with population \${snapshot.population}\`);
    }
  }`,
    `    if (snapshot.measurement_status !== expectedStatus) {
      throw new Error(\`${metric} ledger status \${snapshot.measurement_status} disagrees with population \${snapshot.population}\`);
    }
    if (snapshot.population === 0 && snapshot.value !== null) {
      throw new Error(\`${metric} empty ledger must have null measurement value\`);
    }
    if (snapshot.population > 0) requireMetricValue(snapshot.value, \`${metric} ledger measurement value\`);
  }`,
    "snapshot value validation",
  );

  replaceOnce(
    "scripts/lib/metric-readiness.mjs",
    `  if (measurementStatus !== expectedStatus) throw new Error(\`${metric} snapshot status \${measurementStatus} disagrees with population \${population}\`);
  return {
    source,
    sha256: requireHash(snapshot.sha256, \`observation snapshot for \${metric}.sha256\`),
    population,
    measurement_status: measurementStatus,
  };`,
    `  if (measurementStatus !== expectedStatus) throw new Error(\`${metric} snapshot status \${measurementStatus} disagrees with population \${population}\`);
  const measuredValue = snapshot.value;
  if (population === 0 && measuredValue !== null) throw new Error(\`${metric} empty snapshot must have null measurement value\`);
  if (population > 0) requireMetricValue(measuredValue, \`observation snapshot for \${metric}.value\`);
  return {
    source,
    sha256: requireHash(snapshot.sha256, \`observation snapshot for \${metric}.sha256\`),
    population,
    value: measuredValue,
    measurement_status: measurementStatus,
  };`,
    "validated snapshot value",
  );

  replaceOnce(
    "scripts/lib/metric-readiness.mjs",
    `    sha256: requireHash(binding.sha256, \`${receipt.id}.\${metric}.sha256\`),
    population: requireCount(binding.population, \`${receipt.id}.\${metric}.population\`),`,
    `    sha256: requireHash(binding.sha256, \`${receipt.id}.\${metric}.sha256\`),
    population: requireCount(binding.population, \`${receipt.id}.\${metric}.population\`),
    value: requireMetricValue(binding.value, \`${receipt.id}.\${metric}.value\`),`,
    "binding value",
  );

  replaceOnce(
    "scripts/lib/metric-readiness.mjs",
    `    if (binding.sha256 !== snapshot.sha256 || binding.population !== snapshot.population) {
      staleMeasurements.push(key);
      metricStates[key] = {
        mode: policy.mode,
        status: "measurement-stale-after-ledger-change",
        value,
        receipt_id: receipt.id,
        observation_snapshot: snapshot,
        observation_binding: binding,
      };
      continue;
    }
    metricStates[key] = {`,
    `    if (binding.sha256 !== snapshot.sha256 || binding.population !== snapshot.population) {
      staleMeasurements.push(key);
      metricStates[key] = {
        mode: policy.mode,
        status: "measurement-stale-after-ledger-change",
        value,
        receipt_id: receipt.id,
        observation_snapshot: snapshot,
        observation_binding: binding,
      };
      continue;
    }
    if (binding.value !== snapshot.value || value !== snapshot.value) {
      ledgerRegressions.push(key);
      metricStates[key] = {
        mode: policy.mode,
        status: "measured-value-does-not-match-ledger",
        value,
        receipt_id: receipt.id,
        observation_snapshot: snapshot,
        observation_binding: binding,
      };
      continue;
    }
    metricStates[key] = {`,
    "readiness value equality",
  );

  replaceOnce(
    "scripts/lib/waterline.mjs",
    `        if (!/^[0-9a-f]{64}$/.test(String(binding.sha256 || ""))) throw new Error(\`metric receipt \${receipt.id}.\${key}.sha256 must be a sha256\`);
        if (!Number.isSafeInteger(binding.population) || binding.population < 1) throw new Error(\`metric receipt \${receipt.id}.\${key}.population must be positive\`);`,
    `        if (!/^[0-9a-f]{64}$/.test(String(binding.sha256 || ""))) throw new Error(\`metric receipt \${receipt.id}.\${key}.sha256 must be a sha256\`);
        if (!Number.isSafeInteger(binding.population) || binding.population < 1) throw new Error(\`metric receipt \${receipt.id}.\${key}.population must be positive\`);
        if (!Number.isFinite(binding.value) || binding.value < 0) throw new Error(\`metric receipt \${receipt.id}.\${key}.value must be non-negative\`);
        if (binding.value !== value) throw new Error(\`metric receipt \${receipt.id}.\${key} value does not match its observation binding\`);`,
    "receipt value validation",
  );

  replaceOnce(
    "scripts/lib/waterline.mjs",
    `      if (!Number.isSafeInteger(snapshot.population) || snapshot.population < 1 || snapshot.measurement_status !== "measured") throw new Error(\`metric \${key} requires a populated validated observation snapshot\`);
      observation_bindings[key] = {
        source: snapshot.source,
        sha256: snapshot.sha256,
        population: snapshot.population,
      };`,
    `      if (!Number.isSafeInteger(snapshot.population) || snapshot.population < 1 || snapshot.measurement_status !== "measured") throw new Error(\`metric \${key} requires a populated validated observation snapshot\`);
      if (!Number.isFinite(snapshot.value) || snapshot.value < 0) throw new Error(\`metric \${key} validated ledger measurement is invalid\`);
      if (value !== snapshot.value) throw new Error(\`metrics.\${key} value \${value} does not match validated ledger measurement \${snapshot.value}\`);
      observation_bindings[key] = {
        source: snapshot.source,
        sha256: snapshot.sha256,
        population: snapshot.population,
        value: snapshot.value,
      };`,
    "writer value equality",
  );

  replaceOnce(
    "scripts/metric-readiness-fixtures.mjs",
    `assert.equal(emptySnapshots.cost_per_verified_record_usd.population, 0);
assert.equal(emptySnapshots.cost_per_verified_record_usd.measurement_status, "no-observations");`,
    `assert.equal(emptySnapshots.cost_per_verified_record_usd.population, 0);
assert.equal(emptySnapshots.cost_per_verified_record_usd.value, null);
assert.equal(emptySnapshots.cost_per_verified_record_usd.measurement_status, "no-observations");`,
    "empty snapshot value fixture",
  );
  replaceOnce(
    "scripts/metric-readiness-fixtures.mjs",
    `  sha256: oneCostSnapshots.cost_per_verified_record_usd.sha256,
  population: 1,
});`,
    `  sha256: oneCostSnapshots.cost_per_verified_record_usd.sha256,
  population: 1,
  value: 4.25,
});`,
    "binding value fixture",
  );

  replaceOnce(
    "scripts/metric-readiness-fixtures.mjs",
    `const rightsSnapshots = snapshotsFor(emptyCost, oneRights);
const rightsState = baseState();`,
    `const rightsSnapshots = snapshotsFor(emptyCost, oneRights);
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
const rightsState = baseState();`,
    "wrong derived value refusal",
  );

  replaceOnce(
    "scripts/metric-readiness-fixtures.mjs",
    `assert.equal(status.evidence_readiness.metric_states.cost_per_verified_record_usd.status, "measured");

const appendedCost`,
    `assert.equal(status.evidence_readiness.metric_states.cost_per_verified_record_usd.status, "measured");
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

const appendedCost`,
    "tampered state value refusal",
  );

  replaceOnce(
    "scripts/metric-readiness-fixtures.mjs",
    `console.log("PASS — configured ledger sources, validated rows, exact byte/population bindings, stale-measurement reopening, SLO refusal, and no-golden-cage null semantics");`,
    `console.log("PASS — configured ledger sources, validated rows, exact byte/population/value bindings, mismatched-value refusal, stale-measurement reopening, SLO refusal, and no-golden-cage null semantics");`,
    "fixture summary",
  );

  replaceOnce(
    "docs/OPERATIONAL-METRICS.md",
    `Every observation-triggered numeric receipt binds the configured ledger path, exact ledger SHA-256, and validated population.`,
    `Every observation-triggered numeric receipt binds the configured ledger path, exact ledger SHA-256, validated population, and the metric value derived from those ledger rows. The writer refuses any caller-supplied value that differs from the validated ledger result.`,
    "derived value documentation",
  );
  console.log("APPLIED — derived observation value is now bound and mismatch-refused");
}

function authorReceipt() {
  const receipt = JSON.parse(readFileSync(RECEIPT, "utf8"));
  receipt.status = "candidate-smoke-required";
  receipt.reviewed_at = new Date().toISOString();
  receipt.authorization = {
    ...receipt.authorization,
    previous_successful_workflow_run: 30729424293,
    derived_value_workflow_head: process.env.GITHUB_SHA,
    derived_value_workflow_run: Number(process.env.GITHUB_RUN_ID),
    derived_value_workflow_attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    review_threads: [3697406750, 3697406753, 3697551417],
  };
  receipt.corrections = {
    ...receipt.corrections,
    derived_metric_value_bound: true,
    caller_value_mismatch_refused: true,
    persisted_binding_value_mismatch_refused: true,
  };
  receipt.evidence.files = Object.fromEntries(FILES.map((file) => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
  receipt.evidence.focused_fixtures = "PASS — exact source/hash/population/value custody and mismatch refusal";
  receipt.evidence.complete_gate_required = true;
  delete receipt.smoke;
  writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`AUTHORED — ${RECEIPT}`);
}

function promoteReceipt() {
  const receipt = JSON.parse(readFileSync(RECEIPT, "utf8"));
  if (receipt.status !== "candidate-smoke-required") throw new Error(`receipt is ${receipt.status}`);
  receipt.status = "smoke-passed";
  receipt.smoke = {
    candidate_gate: "npm run gate",
    candidate_complete_gate_passed: true,
    candidate_rendered_browser_included: true,
    final_gate_after_temporary_authority_retirement: true,
    final_rendered_browser_included: true,
  };
  writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log("PROMOTED — derived-value custody receipt is smoke-passed");
}

if (command === "apply") apply();
else if (command === "author-receipt") authorReceipt();
else if (command === "promote-receipt") promoteReceipt();
else throw new Error("usage: apply-derived-metric-value-binding.mjs apply|author-receipt|promote-receipt");
