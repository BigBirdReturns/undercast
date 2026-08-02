#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collapseSourceObservations } from "./lib/preservation.mjs";

export const METRIC_CONTRACT_VERSION = 1;
export const DAY_MS = 86_400_000;
export const MIN_BUILD_SAMPLES = 5;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const round = (value, digits = 6) => Number(value.toFixed(digits));

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value;
}
function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}
function requireString(value, label) {
  if (!String(value || "").trim()) throw new Error(`${label} is required`);
  return String(value).trim();
}
function requireDate(value, label) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be an ISO date/time`);
  return timestamp;
}
function requireNonNegativeNumber(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative number`);
  return Number(value);
}
function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive integer`);
  return value;
}
function requireEvidence(value, label) {
  const rows = requireArray(value, label);
  if (!rows.length) throw new Error(`${label} must be non-empty`);
  return rows.map((row, index) => ({
    type: requireString(requireObject(row, `${label}[${index}]`).type, `${label}[${index}].type`),
    value: requireString(row.value, `${label}[${index}].value`),
  }));
}
function uniqueRows(rows, label) {
  const ids = new Set();
  for (const row of rows) {
    const id = requireString(row.id, `${label}.id`);
    if (ids.has(id)) throw new Error(`${label} contains duplicate id ${id}`);
    ids.add(id);
  }
}

export function nearestRankPercentile(values, percentile) {
  if (!Array.isArray(values) || !values.length) throw new Error("percentile values must be non-empty");
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) throw new Error("percentile must be in (0, 1]");
  const sorted = values.map((value, index) => {
    if (!Number.isFinite(value)) throw new Error(`percentile value ${index} is not finite`);
    return Number(value);
  }).sort((a, b) => a - b);
  return sorted[Math.ceil(percentile * sorted.length) - 1];
}

export function measureBuildP95(samples, { minimumSamples = MIN_BUILD_SAMPLES } = {}) {
  const rows = requireArray(samples, "build samples").map((row, index) => {
    requireObject(row, `build samples[${index}]`);
    const id = requireString(row.id, `build samples[${index}].id`);
    const startedAt = requireDate(row.started_at, `build samples[${index}].started_at`);
    const completedAt = requireDate(row.completed_at, `build samples[${index}].completed_at`);
    const durationMs = requireNonNegativeNumber(row.duration_ms, `build samples[${index}].duration_ms`);
    if (completedAt < startedAt) throw new Error(`build sample ${id} completes before it starts`);
    if (Math.abs((completedAt - startedAt) - durationMs) > 5_000) throw new Error(`build sample ${id} duration disagrees with timestamps`);
    if (row.gate_exit_code !== 0) throw new Error(`build sample ${id} gate exited ${row.gate_exit_code}`);
    if (row.exact_head !== true) throw new Error(`build sample ${id} is not exact-head`);
    if (row.rendered_browser !== true) throw new Error(`build sample ${id} omitted rendered-browser work`);
    requireString(row.target_head, `build samples[${index}].target_head`);
    return { ...row, id, duration_ms: durationMs };
  });
  uniqueRows(rows, "build samples");
  const heads = new Set(rows.map((row) => row.target_head));
  if (heads.size !== 1) throw new Error("build sample population spans multiple target heads");
  if (rows.length < minimumSamples) {
    return {
      metric: "build_minutes_p95",
      status: "insufficient-population",
      value: null,
      population: rows.length,
      minimum_population: minimumSamples,
      target_head: [...heads][0] || null,
      quantile: "nearest-rank-p95",
    };
  }
  const durationMs = rows.map((row) => row.duration_ms);
  const p95Ms = nearestRankPercentile(durationMs, 0.95);
  return {
    metric: "build_minutes_p95",
    status: "measured",
    value: round(p95Ms / 60_000),
    unit: "minutes",
    population: rows.length,
    minimum_population: minimumSamples,
    target_head: [...heads][0],
    quantile: "nearest-rank-p95",
    p95_ms: p95Ms,
    min_ms: Math.min(...durationMs),
    max_ms: Math.max(...durationMs),
    sample_ids: rows.map((row) => row.id),
  };
}

export function measureSourceFreshness(manifest, { franchise, asOf }) {
  requireObject(manifest, "census manifest");
  const asOfMs = requireDate(asOf, "as_of");
  const records = collapseSourceObservations(manifest, { franchise });
  if (!records.length) {
    return {
      metric: "source_freshness_p95_days",
      status: "insufficient-population",
      value: null,
      population: 0,
      franchise,
      quantile: "nearest-rank-p95",
    };
  }
  const ages = records.map((record) => {
    const observed = record.facets.map((facet, index) => requireDate(facet.observed_at, `${record.archive_id}.facets[${index}].observed_at`));
    const freshestObservation = Math.max(...observed);
    if (freshestObservation > asOfMs + 60_000) throw new Error(`source ${record.archive_id} was observed in the future`);
    return Math.max(0, asOfMs - freshestObservation) / DAY_MS;
  });
  return {
    metric: "source_freshness_p95_days",
    status: "measured",
    value: round(nearestRankPercentile(ages, 0.95)),
    unit: "days",
    population: records.length,
    franchise,
    as_of: new Date(asOfMs).toISOString(),
    quantile: "nearest-rank-p95",
    minimum_days: round(Math.min(...ages)),
    maximum_days: round(Math.max(...ages)),
    denominator: "unique exact source revision identities; duplicate category facets collapse; the freshest observation of identical bytes governs",
  };
}

export function measureCostPerVerifiedRecord(doc) {
  requireObject(doc, "cost ledger");
  if (doc.version !== 1) throw new Error("cost ledger version must be 1");
  const rows = requireArray(doc.observations, "cost observations");
  uniqueRows(rows, "cost observations");
  if (!rows.length) {
    return {
      metric: "cost_per_verified_record_usd",
      status: "no-observations",
      value: null,
      population: 0,
      boundary: "No invoice, receipt, or direct-cash observation exists; free-tier or included usage is not rounded to zero.",
    };
  }
  let cost = 0;
  let records = 0;
  for (const row of rows) {
    requireDate(row.at, `cost observation ${row.id}.at`);
    if (row.currency !== "USD") throw new Error(`cost observation ${row.id}.currency must be USD`);
    cost += requireNonNegativeNumber(row.direct_cost_usd, `cost observation ${row.id}.direct_cost_usd`);
    records += requirePositiveInteger(row.verified_records, `cost observation ${row.id}.verified_records`);
    requireEvidence(row.evidence, `cost observation ${row.id}.evidence`);
  }
  return {
    metric: "cost_per_verified_record_usd",
    status: "measured",
    value: round(cost / records),
    unit: "USD per verified record",
    population: rows.length,
    total_direct_cost_usd: round(cost),
    verified_records: records,
    denominator: "direct evidenced cash cost divided by newly verified records",
  };
}

export function measureRightsResponse(doc) {
  requireObject(doc, "rights ledger");
  if (doc.version !== 1) throw new Error("rights ledger version must be 1");
  const rows = requireArray(doc.cases, "rights cases");
  uniqueRows(rows, "rights cases");
  if (!rows.length) {
    return {
      metric: "rights_response_sla_days",
      status: "no-observations",
      value: null,
      population: 0,
      boundary: "No real or explicitly labeled exercise case has an opened and first-response timestamp; an empty inbox is not a zero-day response.",
    };
  }
  const durations = rows.map((row) => {
    const openedAt = requireDate(row.opened_at, `rights case ${row.id}.opened_at`);
    const respondedAt = requireDate(row.first_response_at, `rights case ${row.id}.first_response_at`);
    if (respondedAt < openedAt) throw new Error(`rights case ${row.id} responds before opening`);
    if (!new Set(["real", "exercise"]).has(row.case_type)) throw new Error(`rights case ${row.id}.case_type must be real or exercise`);
    requireEvidence(row.evidence, `rights case ${row.id}.evidence`);
    return (respondedAt - openedAt) / DAY_MS;
  });
  return {
    metric: "rights_response_sla_days",
    status: "measured",
    value: round(Math.max(...durations)),
    unit: "days",
    population: rows.length,
    method: "maximum observed first-response interval",
    maximum_days: round(Math.max(...durations)),
    p95_days: round(nearestRankPercentile(durations, 0.95)),
  };
}

export function measureOperationalMetrics({ manifest, manifestBytes, manifestPath = "data/CENSUS-MANIFEST.json", buildSamples, costLedger, rightsLedger, franchise, asOf }) {
  const build = measureBuildP95(buildSamples);
  const freshness = measureSourceFreshness(manifest, { franchise, asOf });
  const cost = measureCostPerVerifiedRecord(costLedger);
  const rights = measureRightsResponse(rightsLedger);
  const rows = [build, cost, freshness, rights];
  return {
    version: METRIC_CONTRACT_VERSION,
    operation: "operational-reliability-metric-evidence",
    generated_at: new Date().toISOString(),
    as_of: new Date(requireDate(asOf, "as_of")).toISOString(),
    source_manifest: {
      path: requireString(manifestPath, "manifest path"),
      sha256: sha256(manifestBytes),
      captured_at: manifest.captured_at,
      franchise,
    },
    metrics: Object.fromEntries(rows.map((row) => [row.metric, row])),
    measured_patch: Object.fromEntries(rows.filter((row) => row.status === "measured").map((row) => [row.metric, row.value])),
    unresolved_metrics: rows.filter((row) => row.status !== "measured").map((row) => ({ metric: row.metric, status: row.status, boundary: row.boundary || null })),
    boundary: {
      workflow_executed_unreviewed: true,
      waterline_state_mutated: false,
      roadmap_state_mutated: false,
      missing_values_rounded_to_zero: false,
      second_desk_review_required_before_recording: true,
    },
  };
}

function option(args, name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} requires a value`);
  return value;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

async function cli() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (command !== "measure") throw new Error("usage: operational-metrics.mjs measure --build-samples path --manifest path --cost-ledger path --rights-ledger path --franchise name --as-of ISO --output path");
  const manifestPath = option(args, "manifest", "data/CENSUS-MANIFEST.json");
  const buildPath = option(args, "build-samples");
  const costPath = option(args, "cost-ledger", "data/operational-reliability/COST-OBSERVATIONS.json");
  const rightsPath = option(args, "rights-ledger", "data/operational-reliability/RIGHTS-CASES.json");
  const output = option(args, "output");
  const franchise = option(args, "franchise", "Star Trek");
  const asOf = option(args, "as-of");
  if (!buildPath || !output || !asOf) throw new Error("measure requires --build-samples, --as-of, and --output");
  const manifestBytes = await readFile(resolve(manifestPath));
  const result = measureOperationalMetrics({
    manifest: JSON.parse(manifestBytes),
    manifestBytes,
    manifestPath,
    buildSamples: await readJson(buildPath),
    costLedger: await readJson(costPath),
    rightsLedger: await readJson(rightsPath),
    franchise,
    asOf,
  });
  await writeFile(resolve(output), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] || "")) {
  cli().catch((error) => {
    console.error(`operational metrics: ${error.message}`);
    process.exitCode = 1;
  });
}
