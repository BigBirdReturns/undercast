#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const OPERATIONAL_METRICS_VERSION = 1;
export const OBSERVATION_PATH = "data/operations/OPERATIONAL-METRIC-OBSERVATIONS.json";
export const REPORT_PATH = "data/review/operational-reliability/metrics-2026-08-02/measurement.json";
export const WATERLINE_INPUT_PATH = "data/review/operational-reliability/metrics-2026-08-02/waterline-input.json";
const SHA256_RE = /^(?:sha256:)?[0-9a-f]{64}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const REVIEW_ROLES = new Set(["second-desk", "owner"]);
const BUILD_EVENTS = new Set(["push", "pull_request"]);
const COST_FIELDS = ["id", "incurred_at", "amount_usd", "verified_records_added", "activity", "receipt_sha256"];
const RIGHTS_FIELDS = ["id", "opened_at", "first_substantive_response_at", "case_class", "synthetic", "receipt_sha256"];

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
export function stableJson(value) { return JSON.stringify(stable(value)); }
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export function pretty(value) { return `${JSON.stringify(value, null, 2)}\n`; }
export function round(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
export function nearestRank(values, percentile = 0.95) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("nearest-rank needs at least one observation");
  if (!(percentile > 0 && percentile <= 1)) throw new Error("percentile must be greater than zero and at most one");
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

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
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value;
}
function requireNonNegativeNumber(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number`);
  return value;
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
  return text.replace(/^sha256:/, "");
}
function ensureUnique(rows, key, label) {
  const seen = new Set();
  for (const row of rows) {
    const value = row?.[key];
    if (value === undefined || value === null || value === "") throw new Error(`${label} has a missing ${key}`);
    if (seen.has(value)) throw new Error(`${label} has duplicate ${key} ${value}`);
    seen.add(value);
  }
}
function exactStringArray(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label} must be exactly ${expected.join(", ")}`);
}
function assertReported(actual, expected, label, decimals) {
  if (actual === null || !Number.isFinite(actual)) throw new Error(`${label} must be a measured number`);
  if (round(actual, decimals) !== round(expected, decimals)) throw new Error(`${label} ${actual} != computed ${round(expected, decimals)}`);
}
function requireNullableReported(actual, expected, label, decimals) {
  if (expected === null) {
    if (actual !== null) throw new Error(`${label} must remain null without a denominator`);
    return;
  }
  assertReported(actual, expected, label, decimals);
}

function evaluateBuild(section, method) {
  requireObject(section, "build");
  if (section.metric !== "build_minutes_p95") throw new Error("build.metric must be build_minutes_p95");
  const denominator = requireObject(section.denominator, "build.denominator");
  if (denominator.frozen !== true) throw new Error("build denominator must be frozen");
  requireString(denominator.kind, "build.denominator.kind");
  const observations = requireArray(section.observations, "build.observations");
  if (observations.length !== requirePositiveInteger(denominator.expected_count, "build.denominator.expected_count")) throw new Error("build observation count does not match the frozen denominator");
  ensureUnique(observations, "run_id", "build observations");
  ensureUnique(observations, "artifact_id", "build observations");
  const durations = [];
  for (const [index, row] of observations.entries()) {
    const label = `build.observations[${index}]`;
    requirePositiveInteger(row.run_id, `${label}.run_id`);
    if (!BUILD_EVENTS.has(row.event)) throw new Error(`${label}.event is invalid`);
    requireCommit(row.target_head, `${label}.target_head`);
    requirePositiveInteger(row.artifact_id, `${label}.artifact_id`);
    requireHash(row.artifact_digest, `${label}.artifact_digest`, true);
    requireHash(row.restore_receipt_sha256, `${label}.restore_receipt_sha256`);
    requirePositiveInteger(row.canonical_gate_ms, `${label}.canonical_gate_ms`);
    if (row.exact_tracked_tree_match !== true || row.complete_gate_passed !== true || row.rendered_browser_gate_included !== true) throw new Error(`${label} is not a qualified complete-gate observation`);
    durations.push(row.canonical_gate_ms / 60000);
  }
  if (observations[0].run_id !== denominator.first_run || observations.at(-1).run_id !== denominator.last_run) throw new Error("build first or last run does not match the frozen denominator");
  const value = round(nearestRank(durations, method.percentile), method.round_decimals);
  assertReported(section.reported_value, value, "build.reported_value", method.round_decimals);
  const target = requireNonNegativeNumber(section.target_minutes, "build.target_minutes");
  return {
    value,
    unit: "minutes",
    target,
    passes_target: value <= target,
    denominator: observations.length,
    sorted_observations: durations.sort((a, b) => a - b).map((row) => round(row, method.round_decimals)),
    first_run: denominator.first_run,
    last_run: denominator.last_run,
  };
}

function evaluateSourceFreshness(section, method) {
  requireObject(section, "source_freshness");
  if (section.metric !== "source_freshness_p95_days") throw new Error("source_freshness.metric must be source_freshness_p95_days");
  requireString(section.scope_id, "source_freshness.scope_id");
  const denominator = requireObject(section.denominator, "source_freshness.denominator");
  if (denominator.frozen !== true) throw new Error("source freshness denominator must be frozen");
  requireString(denominator.kind, "source_freshness.denominator.kind");
  requirePositiveInteger(denominator.facet_observations, "source_freshness.denominator.facet_observations");
  requirePositiveInteger(denominator.distinct_source_rows, "source_freshness.denominator.distinct_source_rows");
  requirePositiveInteger(denominator.certified_coverage_sources, "source_freshness.denominator.certified_coverage_sources");
  if (denominator.distinct_source_rows > denominator.facet_observations) throw new Error("source freshness distinct source rows exceed facet observations");
  const preservation = requireObject(section.preservation, "source_freshness.preservation");
  requirePositiveInteger(preservation.workflow_run, "source_freshness.preservation.workflow_run");
  requirePositiveInteger(preservation.artifact_id, "source_freshness.preservation.artifact_id");
  requireHash(preservation.artifact_digest, "source_freshness.preservation.artifact_digest", true);
  requireString(preservation.snapshot_id, "source_freshness.preservation.snapshot_id");
  requireCommit(preservation.snapshot_commit, "source_freshness.preservation.snapshot_commit");
  requireString(preservation.source_archive_name, "source_freshness.preservation.source_archive_name");
  requireHash(preservation.source_archive_sha256, "source_freshness.preservation.source_archive_sha256");
  requirePositiveInteger(preservation.source_archive_bytes, "source_freshness.preservation.source_archive_bytes");
  requireHash(preservation.source_snapshot_sha256, "source_freshness.preservation.source_snapshot_sha256");
  requireHash(preservation.source_index_sha256, "source_freshness.preservation.source_index_sha256");
  requirePositiveInteger(preservation.source_index_rows, "source_freshness.preservation.source_index_rows");
  requireHash(preservation.census_manifest_sha256, "source_freshness.preservation.census_manifest_sha256");
  const asOfText = requireDate(section.as_of, "source_freshness.as_of");
  const asOf = Date.parse(asOfText);
  const histogram = requireArray(section.observation_histogram, "source_freshness.observation_histogram");
  if (!histogram.length) throw new Error("source freshness histogram is empty");
  ensureUnique(histogram, "observed_at", "source freshness histogram");
  const weighted = [];
  let count = 0;
  for (const [index, row] of histogram.entries()) {
    const observedText = requireDate(row.observed_at, `source_freshness.observation_histogram[${index}].observed_at`);
    const observed = Date.parse(observedText);
    if (observed > asOf) throw new Error("source observation is newer than the snapshot as_of time");
    const weight = requirePositiveInteger(row.count, `source_freshness.observation_histogram[${index}].count`);
    const age = (asOf - observed) / 86400000;
    count += weight;
    for (let i = 0; i < weight; i++) weighted.push(age);
  }
  if (count !== denominator.facet_observations) throw new Error("source freshness histogram count does not match the frozen denominator");
  const value = round(nearestRank(weighted, method.percentile), method.round_decimals);
  assertReported(section.reported_value, value, "source_freshness.reported_value", method.round_decimals);
  const target = requireNonNegativeNumber(section.target_days, "source_freshness.target_days");
  return {
    value,
    unit: "days",
    target,
    passes_target: value <= target,
    denominator: count,
    distinct_source_rows: denominator.distinct_source_rows,
    certified_coverage_sources: denominator.certified_coverage_sources,
    distinct_observed_at_values: histogram.length,
    oldest_age_days: round(Math.max(...weighted), method.round_decimals),
    newest_age_days: round(Math.min(...weighted), method.round_decimals),
    snapshot_id: preservation.snapshot_id,
  };
}

function evaluateCost(section, method) {
  requireObject(section, "cost");
  if (section.metric !== "cost_per_verified_record_usd") throw new Error("cost.metric must be cost_per_verified_record_usd");
  exactStringArray(section.required_event_fields, COST_FIELDS, "cost.required_event_fields");
  const events = requireArray(section.events, "cost.events");
  ensureUnique(events, "id", "cost events");
  let amount = 0;
  let records = 0;
  for (const [index, row] of events.entries()) {
    const label = `cost.events[${index}]`;
    requireString(row.id, `${label}.id`);
    requireDate(row.incurred_at, `${label}.incurred_at`);
    amount += requireNonNegativeNumber(row.amount_usd, `${label}.amount_usd`);
    records += requireNonNegativeNumber(row.verified_records_added, `${label}.verified_records_added`);
    requireString(row.activity, `${label}.activity`);
    requireHash(row.receipt_sha256, `${label}.receipt_sha256`);
  }
  const value = records > 0 ? round(amount / records, method.round_decimals) : null;
  const expectedStatus = value === null ? "denominator-absent" : "measured";
  if (section.status !== expectedStatus) throw new Error(`cost.status must be ${expectedStatus}`);
  requireNullableReported(section.reported_value, value, "cost.reported_value", method.round_decimals);
  requireString(section.note, "cost.note");
  return { value, unit: "USD per verified record", status: expectedStatus, events: events.length, total_amount_usd: events.length ? round(amount, method.round_decimals) : null, verified_records_added: events.length ? records : null };
}

function evaluateRights(section, method) {
  requireObject(section, "rights");
  if (section.metric !== "rights_response_sla_days") throw new Error("rights.metric must be rights_response_sla_days");
  exactStringArray(section.required_case_fields, RIGHTS_FIELDS, "rights.required_case_fields");
  if (typeof section.include_synthetic !== "boolean") throw new Error("rights.include_synthetic must be boolean");
  const cases = requireArray(section.cases, "rights.cases");
  ensureUnique(cases, "id", "rights cases");
  const responseDays = [];
  for (const [index, row] of cases.entries()) {
    const label = `rights.cases[${index}]`;
    requireString(row.id, `${label}.id`);
    const opened = Date.parse(requireDate(row.opened_at, `${label}.opened_at`));
    const response = Date.parse(requireDate(row.first_substantive_response_at, `${label}.first_substantive_response_at`));
    if (response < opened) throw new Error(`${label} responds before opening`);
    requireString(row.case_class, `${label}.case_class`);
    if (typeof row.synthetic !== "boolean") throw new Error(`${label}.synthetic must be boolean`);
    requireHash(row.receipt_sha256, `${label}.receipt_sha256`);
    if (!row.synthetic || section.include_synthetic) responseDays.push((response - opened) / 86400000);
  }
  const value = responseDays.length ? round(nearestRank(responseDays, method.percentile), method.round_decimals) : null;
  const expectedStatus = value === null ? "denominator-absent" : "measured";
  if (section.status !== expectedStatus) throw new Error(`rights.status must be ${expectedStatus}`);
  requireNullableReported(section.reported_value, value, "rights.reported_value", method.round_decimals);
  requireString(section.note, "rights.note");
  return { value, unit: "days", status: expectedStatus, cases: cases.length, qualified_cases: responseDays.length };
}

export function evaluateOperationalMetrics(doc) {
  requireObject(doc, "operational metric observations");
  if (doc.version !== OPERATIONAL_METRICS_VERSION || doc.schema !== "undercast.operational-metric-observations/1") throw new Error("operational metric observations version or schema is invalid");
  requireDate(doc.as_of, "as_of");
  requireDate(doc.reviewed_at, "reviewed_at");
  requireString(doc.reviewed_by, "reviewed_by");
  if (!REVIEW_ROLES.has(doc.reviewed_role)) throw new Error("reviewed_role must be second-desk or owner");
  const method = requireObject(doc.method, "method");
  if (method.percentile !== 0.95 || method.estimator !== "nearest-rank" || method.round_decimals !== 6) throw new Error("operational metric method must be p95 nearest-rank rounded to six decimals");
  requireString(method.unknown_semantics, "method.unknown_semantics");
  requireString(method.successful_build_semantics, "method.successful_build_semantics");
  const build = evaluateBuild(doc.build, method);
  const source = evaluateSourceFreshness(doc.source_freshness, method);
  const cost = evaluateCost(doc.cost, method);
  const rights = evaluateRights(doc.rights, method);
  return {
    version: OPERATIONAL_METRICS_VERSION,
    transaction: "OPERATIONAL-METRICS-001",
    status: cost.value === null || rights.value === null ? "partially-measured" : "measured",
    as_of: doc.as_of,
    reviewed_at: doc.reviewed_at,
    reviewed_by: doc.reviewed_by,
    reviewed_role: doc.reviewed_role,
    method: {
      percentile: method.percentile,
      estimator: method.estimator,
      round_decimals: method.round_decimals,
    },
    measurements: {
      build_minutes_p95: build,
      source_freshness_p95_days: source,
      cost_per_verified_record_usd: cost,
      rights_response_sla_days: rights,
    },
  };
}

export function buildMeasurementReport(doc, observationRaw) {
  const result = evaluateOperationalMetrics(doc);
  const measured = Object.entries(result.measurements).filter(([, row]) => row.value !== null).map(([key]) => key);
  const unmeasured = Object.entries(result.measurements).filter(([, row]) => row.value === null).map(([key]) => key);
  return {
    ...result,
    source: {
      path: OBSERVATION_PATH,
      sha256: sha256(observationRaw),
    },
    waterline_effect: {
      measured_metrics: Object.fromEntries(measured.map((key) => [key, result.measurements[key].value])),
      remain_null: unmeasured,
      required_drills_already_paid: ["repository-restore", "publication-rollback"],
      operational_reliability_ready_after_this_receipt: unmeasured.length === 0,
    },
    boundary: {
      canonical_mutation: false,
      roadmap_milestone_completed: false,
      failed_or_cancelled_builds_reclassified_as_success: false,
      cost_inferred_from_absence: false,
      rights_response_inferred_from_absence: false,
      later_events_require_append_only_observation_receipts: true,
    },
  };
}

export function buildWaterlineInput(doc, report, reportRaw) {
  const metrics = report.waterline_effect.measured_metrics;
  if (Object.keys(metrics).length !== 2 || !("build_minutes_p95" in metrics) || !("source_freshness_p95_days" in metrics)) throw new Error("initial waterline input must pay exactly the two measured metrics");
  if (report.waterline_effect.remain_null.join(",") !== "cost_per_verified_record_usd,rights_response_sla_days") throw new Error("initial waterline input must leave cost and rights null");
  return {
    version: 1,
    metrics,
    note: "Measured the initial successful-build p95 and active Star Trek source-freshness p95 from frozen, hash-bound evidence denominators. Cost per verified record and rights-response time remain null because no actual spend-to-output ledger or real rights-response interval exists.",
    evidence: [
      {
        type: "measurement-report",
        value: `${REPORT_PATH}; sha256 ${sha256(reportRaw)}; transaction ${report.transaction}; status ${report.status}.`,
      },
      {
        type: "build-denominator",
        value: `Six complete operational-reliability evidence runs, ${doc.build.denominator.first_run} through ${doc.build.denominator.last_run}; every run has an Actions artifact digest and restore-receipt SHA-256 in ${OBSERVATION_PATH}.`,
      },
      {
        type: "source-denominator",
        value: `${doc.source_freshness.denominator.facet_observations} Star Trek facet observations from preservation snapshot ${doc.source_freshness.preservation.snapshot_id}; source index sha256 ${doc.source_freshness.preservation.source_index_sha256}.`,
      },
      {
        type: "method",
        value: "p95 nearest-rank; durations converted from milliseconds to minutes, freshness from observation time to source-snapshot creation time, both rounded to six decimals.",
      },
      {
        type: "unpaid-balances",
        value: "cost_per_verified_record_usd and rights_response_sla_days remain null; zero-event denominators are not zero-valued measurements.",
      },
    ],
    reviewed_by: doc.reviewed_by,
    reviewed_role: doc.reviewed_role,
    reviewed_at: doc.reviewed_at,
  };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}
async function writeDeterministic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, pretty(value), "utf8");
}
async function load(root) {
  const observationPath = path.resolve(root, OBSERVATION_PATH);
  const raw = await readFile(observationPath);
  const doc = JSON.parse(raw.toString("utf8"));
  const report = buildMeasurementReport(doc, raw);
  const reportRaw = Buffer.from(pretty(report));
  const input = buildWaterlineInput(doc, report, reportRaw);
  return { doc, raw, report, reportRaw, input };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift() || "check";
  const rootIndex = args.indexOf("--root");
  const root = path.resolve(rootIndex >= 0 ? args[rootIndex + 1] : ".");
  const loaded = await load(root);
  if (command === "validate") {
    console.log(`PASS — operational metrics valid; build=${loaded.report.measurements.build_minutes_p95.value}m; freshness=${loaded.report.measurements.source_freshness_p95_days.value}d; cost=null; rights=null`);
    return;
  }
  if (command === "write") {
    await writeDeterministic(path.resolve(root, REPORT_PATH), loaded.report);
    await writeDeterministic(path.resolve(root, WATERLINE_INPUT_PATH), loaded.input);
    console.log(`wrote ${REPORT_PATH} and ${WATERLINE_INPUT_PATH}`);
    return;
  }
  if (command === "check") {
    const [reportRaw, inputRaw] = await Promise.all([
      readFile(path.resolve(root, REPORT_PATH), "utf8"),
      readFile(path.resolve(root, WATERLINE_INPUT_PATH), "utf8"),
    ]);
    if (reportRaw !== pretty(loaded.report)) throw new Error(`${REPORT_PATH} is stale`);
    if (inputRaw !== pretty(loaded.input)) throw new Error(`${WATERLINE_INPUT_PATH} is stale`);
    console.log(`PASS — operational metrics generated bytes current; measured=2; unpaid=2`);
    return;
  }
  if (command === "status") {
    console.log(JSON.stringify(loaded.report, null, 2));
    return;
  }
  throw new Error("unknown command; use validate, write, check, or status");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`operational-metrics: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
