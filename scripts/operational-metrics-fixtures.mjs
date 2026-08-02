#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  buildMeasurementReport,
  buildWaterlineInput,
  evaluateOperationalMetrics,
  nearestRank,
  pretty,
  round,
} from "./operational-metrics.mjs";

const observationsPath = fileURLToPath(new URL("../data/operations/OPERATIONAL-METRIC-OBSERVATIONS.json", import.meta.url));
const reportPath = fileURLToPath(new URL("../data/review/operational-reliability/metrics-2026-08-02/measurement.json", import.meta.url));
const inputPath = fileURLToPath(new URL("../data/review/operational-reliability/metrics-2026-08-02/waterline-input.json", import.meta.url));
const observationRaw = await readFile(observationsPath);
const doc = JSON.parse(observationRaw.toString("utf8"));
const clone = (value) => structuredClone(value);

assert.equal(nearestRank([1, 2, 3, 4, 5, 6], 0.95), 6);
assert.equal(round(1.2266666666666666, 6), 1.226667);

const evaluated = evaluateOperationalMetrics(doc);
assert.equal(evaluated.status, "partially-measured");
assert.equal(evaluated.measurements.build_minutes_p95.value, 1.226667);
assert.equal(evaluated.measurements.build_minutes_p95.denominator, 6);
assert.equal(evaluated.measurements.build_minutes_p95.passes_target, true);
assert.equal(evaluated.measurements.source_freshness_p95_days.value, 3.496823);
assert.equal(evaluated.measurements.source_freshness_p95_days.denominator, 7416);
assert.equal(evaluated.measurements.source_freshness_p95_days.passes_target, true);
assert.equal(evaluated.measurements.cost_per_verified_record_usd.value, null);
assert.equal(evaluated.measurements.cost_per_verified_record_usd.total_amount_usd, null);
assert.equal(evaluated.measurements.rights_response_sla_days.value, null);

const report = buildMeasurementReport(doc, observationRaw);
assert.deepEqual(report.waterline_effect.measured_metrics, {
  build_minutes_p95: 1.226667,
  source_freshness_p95_days: 3.496823,
});
assert.deepEqual(report.waterline_effect.remain_null, ["cost_per_verified_record_usd", "rights_response_sla_days"]);
assert.equal(report.waterline_effect.operational_reliability_ready_after_this_receipt, false);
assert.equal(report.boundary.cost_inferred_from_absence, false);
assert.equal(report.boundary.rights_response_inferred_from_absence, false);
const reportRaw = Buffer.from(pretty(report));
const input = buildWaterlineInput(doc, report, reportRaw);
assert.deepEqual(input.metrics, {
  build_minutes_p95: 1.226667,
  source_freshness_p95_days: 3.496823,
});
assert.equal("cost_per_verified_record_usd" in input.metrics, false);
assert.equal("rights_response_sla_days" in input.metrics, false);
assert.match(input.note, /remain null/);

assert.equal(await readFile(reportPath, "utf8"), pretty(report));
assert.equal(await readFile(inputPath, "utf8"), pretty(input));

{
  const bad = clone(doc);
  bad.build.observations[1].run_id = bad.build.observations[0].run_id;
  assert.throws(() => evaluateOperationalMetrics(bad), /duplicate run_id/);
}
{
  const bad = clone(doc);
  bad.build.denominator.expected_count = 7;
  assert.throws(() => evaluateOperationalMetrics(bad), /count does not match/);
}
{
  const bad = clone(doc);
  bad.build.observations[0].complete_gate_passed = false;
  assert.throws(() => evaluateOperationalMetrics(bad), /not a qualified complete-gate/);
}
{
  const bad = clone(doc);
  bad.build.observations[0].artifact_digest = "0".repeat(64);
  assert.throws(() => evaluateOperationalMetrics(bad), /sha256: prefix/);
}
{
  const bad = clone(doc);
  bad.build.reported_value = 1;
  assert.throws(() => evaluateOperationalMetrics(bad), /computed/);
}
{
  const bad = clone(doc);
  bad.source_freshness.observation_histogram[0].count--;
  assert.throws(() => evaluateOperationalMetrics(bad), /histogram count/);
}
{
  const bad = clone(doc);
  bad.source_freshness.observation_histogram[0].observed_at = "2026-08-02T00:00:00Z";
  assert.throws(() => evaluateOperationalMetrics(bad), /newer than the snapshot/);
}
{
  const bad = clone(doc);
  bad.source_freshness.reported_value = 0;
  assert.throws(() => evaluateOperationalMetrics(bad), /computed/);
}
{
  const bad = clone(doc);
  bad.cost.reported_value = 0;
  assert.throws(() => evaluateOperationalMetrics(bad), /must remain null/);
}
{
  const measured = clone(doc);
  measured.cost.events.push({
    id: "cost-001",
    incurred_at: "2026-08-01T00:00:00Z",
    amount_usd: 12,
    verified_records_added: 3,
    activity: "measured fixture",
    receipt_sha256: "1".repeat(64),
  });
  measured.cost.status = "measured";
  measured.cost.reported_value = 4;
  assert.equal(evaluateOperationalMetrics(measured).measurements.cost_per_verified_record_usd.value, 4);
}
{
  const bad = clone(doc);
  bad.rights.reported_value = 0;
  assert.throws(() => evaluateOperationalMetrics(bad), /must remain null/);
}
{
  const measured = clone(doc);
  measured.rights.cases.push({
    id: "rights-001",
    opened_at: "2026-08-01T00:00:00Z",
    first_substantive_response_at: "2026-08-03T12:00:00Z",
    case_class: "rights inquiry",
    synthetic: false,
    receipt_sha256: "2".repeat(64),
  });
  measured.rights.status = "measured";
  measured.rights.reported_value = 2.5;
  assert.equal(evaluateOperationalMetrics(measured).measurements.rights_response_sla_days.value, 2.5);
}
{
  const excluded = clone(doc);
  excluded.rights.cases.push({
    id: "rights-synthetic",
    opened_at: "2026-08-01T00:00:00Z",
    first_substantive_response_at: "2026-08-01T00:01:00Z",
    case_class: "synthetic drill",
    synthetic: true,
    receipt_sha256: "3".repeat(64),
  });
  assert.equal(evaluateOperationalMetrics(excluded).measurements.rights_response_sla_days.value, null);
}
{
  const badReport = clone(report);
  badReport.waterline_effect.remain_null = [];
  assert.throws(() => buildWaterlineInput(doc, badReport, Buffer.from(pretty(badReport))), /leave cost and rights null/);
}

console.log("PASS — operational metrics frozen denominators, p95 calculation, target checks, generated receipts, and null-without-data refusals");
