#!/usr/bin/env node
/**
 * census-gate.mjs — prove that a franchise census has no silent rows.
 *
 * This is an ACCOUNTING gate, not a claim that the wall is complete. A row is
 * accounted for only when it is one of:
 *   covered                  — exact performer+role has a live wall record
 *   excluded-with-reason     — a maintained exclusion names evidence + reason
 *   unresolved-with-evidence — discovered credit/character remains a filed gap
 *
 * The default scope is the benchmark: Star Trek / Ferengi.
 *
 *   node scripts/census-gate.mjs
 *   node scripts/census-gate.mjs --json
 *   node scripts/census-gate.mjs --write
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { normalizeCensusKey as normalize, censusCreditKey as creditKey,
  censusCharacterKey as characterKey } from "./census-key.mjs";

const args = process.argv.slice(2);
const JSON_ONLY = args.includes("--json");
const WRITE = args.includes("--write");
const ACCOUNTING_ONLY = args.includes("--accounting-only");
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
};
const scope = {
  franchise: valueAfter("--franchise", "Star Trek"),
  category: valueAfter("--category", "Ferengi"),
};
const inScope = (row) => normalize(row.franchise) === normalize(scope.franchise)
  && normalize(row.category) === normalize(scope.category);
const https = (value) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};
const load = (path, fallback) => existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const inputPaths = ["data/CENSUS.json", "data/CENSUS-COVERAGE.json", "data/CENSUS-UNRESOLVED.json",
  "data/CENSUS-EXCLUSIONS.json", "data/CENSUS-MANIFEST.json", "data/constellations.json", "data/specimens.json"];

const census = load("data/CENSUS.json", []);
const coverage = load("data/CENSUS-COVERAGE.json", []);
const unresolved = load("data/CENSUS-UNRESOLVED.json", []);
const exclusionsEnvelope = load("data/CENSUS-EXCLUSIONS.json", { version: 1, records: [] });
const exclusions = Array.isArray(exclusionsEnvelope) ? exclusionsEnvelope : exclusionsEnvelope.records;
const specimens = load("data/specimens.json", []);
const liveIds = new Set(specimens.map((row) => row.id));
const graph = load("data/constellations.json", { nodes: [], edges: [], constellations: [] });
const errors = [];
const dispositions = [];
const sourceAliases = [];

if (!Array.isArray(census) || !Array.isArray(coverage) || !Array.isArray(unresolved))
  errors.push("census inputs must be arrays");
if (!Array.isArray(exclusions)) errors.push("data/CENSUS-EXCLUSIONS.json records must be an array");

// Discoverability is satisfied only by an exact person -> character performed
// edge inside the Ferengi constellation. Labels become the canonical credit key;
// substring/fuzzy matching is deliberately forbidden.
const nodeById = new Map((graph.nodes || []).map((node) => [node.id, node]));
const ferengiConstellation = (graph.constellations || []).find((item) => normalize(item.id).includes("ferengi")
  || normalize(item.title).includes("ferengi"));
const ferengiEdgeIds = new Set(ferengiConstellation?.edge_ids || []);
const discoveryByKey = new Map();
for (const edge of (graph.edges || []).filter((item) => ferengiEdgeIds.has(item.id) && item.predicate === "performed")) {
  const person = nodeById.get(edge.from), character = nodeById.get(edge.to);
  if (person?.kind !== "person" || character?.kind !== "character") continue;
  const key = creditKey({ ...scope, character: character.label, performer: person.label });
  if (discoveryByKey.has(key)) errors.push(`duplicate Ferengi performed edge for exact credit: ${key}`);
  if (!(edge.evidence || []).some((item) => https(item.source)))
    errors.push(`Ferengi performed edge lacks HTTPS evidence: ${edge.id}`);
  discoveryByKey.set(key, edge);
}

const expected = new Map();
for (const row of census.filter(inScope)) for (const performer of row.performers || []) {
  const expanded = { ...row, performer };
  const key = creditKey(expanded);
  if (expected.has(key)) sourceAliases.push({ key, character: row.character, source: row.source });
  else expected.set(key, expanded);
}
const coverageByKey = new Map();
for (const row of coverage.filter(inScope)) {
  const key = creditKey(row);
  if (coverageByKey.has(key)) errors.push(`duplicate coverage credit: ${key}`);
  coverageByKey.set(key, row);
  if (!expected.has(key)) errors.push(`coverage row has no census source row: ${key}`);
}

const unresolvedByKey = new Map();
for (const row of unresolved.filter(inScope)) {
  const key = characterKey(row);
  if (unresolvedByKey.has(key)) errors.push(`duplicate unresolved character: ${key}`);
  unresolvedByKey.set(key, row);
}

const exclusionByKey = new Map();
for (const row of (exclusions || []).filter(inScope)) {
  const key = row.performer ? creditKey(row) : characterKey(row);
  if (exclusionByKey.has(key)) errors.push(`duplicate exclusion: ${key}`);
  exclusionByKey.set(key, row);
  if (!String(row.reason || "").trim()) errors.push(`exclusion lacks reason: ${key}`);
  if (!https(row.source)) errors.push(`exclusion lacks HTTPS evidence: ${key}`);
  if (!expected.has(key) && !unresolvedByKey.has(key)) errors.push(`exclusion has no census row: ${key}`);
}

for (const [key, sourceRow] of expected) {
  const row = coverageByKey.get(key);
  const exclusion = exclusionByKey.get(key);
  if (!row) {
    if (exclusion) dispositions.push({ key, disposition: "excluded-with-reason", franchise: sourceRow.franchise,
      category: sourceRow.category, character: sourceRow.character, performer: sourceRow.performer,
      reason: exclusion.reason, source: exclusion.source, performance_mode: sourceRow.performance_mode || "unresolved" });
    else errors.push(`silent credit missing from coverage projection: ${key}`);
    continue;
  }
  if (exclusion && row.role_on_wall) errors.push(`covered credit is also excluded: ${key}`);
  if (exclusion) {
    dispositions.push({ key, disposition: "excluded-with-reason", franchise: row.franchise,
      category: row.category, character: row.character, performer: row.performer,
      reason: exclusion.reason, source: exclusion.source, performance_mode: row.performance_mode });
  } else if (row.performance_mode === "voice-animation") {
    dispositions.push({ key, disposition: "excluded-with-reason", franchise: row.franchise,
      category: row.category, character: row.character, performer: row.performer,
      reason: "voice-animation credit is outside the physical Ferengi-face benchmark",
      source: row.source, performance_mode: row.performance_mode });
  } else if (discoveryByKey.has(key)) {
    const edge = discoveryByKey.get(key);
    if (row.role_on_wall) {
      if (!Array.isArray(row.wall_ids) || !row.wall_ids.length) errors.push(`wall-covered credit lacks wall_ids: ${key}`);
      for (const id of row.wall_ids || []) if (!liveIds.has(id)) errors.push(`wall-covered credit references missing ${id}: ${key}`);
    }
    dispositions.push({ key, disposition: "covered", franchise: row.franchise, category: row.category,
      character: row.character, performer: row.performer, edge_id: edge.id, wall_ids: row.wall_ids,
      source: edge.evidence.find((item) => https(item.source)).source, performance_mode: row.performance_mode });
  } else {
    if (!https(row.source || sourceRow.source)) errors.push(`unresolved credit lacks HTTPS evidence: ${key}`);
    dispositions.push({ key, disposition: "unresolved-with-evidence", franchise: row.franchise,
      category: row.category, character: row.character, performer: row.performer,
      reason: "credited physical performer-role pair lacks an exact sourced performed edge in the Ferengi constellation",
      source: row.source || sourceRow.source,
      performance_mode: row.performance_mode });
  }
}

for (const [key, row] of unresolvedByKey) {
  const exclusion = exclusionByKey.get(key);
  if (!https(row.source)) errors.push(`unresolved character lacks HTTPS evidence: ${key}`);
  if (!String(row.reason || "").trim()) errors.push(`unresolved character lacks reason: ${key}`);
  dispositions.push(exclusion
    ? { key, disposition: "excluded-with-reason", franchise: row.franchise, category: row.category,
      character: row.character, performer: null, reason: exclusion.reason, source: exclusion.source }
    : { key, disposition: "unresolved-with-evidence", franchise: row.franchise, category: row.category,
      character: row.character, performer: null, reason: row.reason, source: row.source });
}

const counts = { covered: 0, "excluded-with-reason": 0, "unresolved-with-evidence": 0 };
for (const row of dispositions) counts[row.disposition]++;
const expectedRows = expected.size + unresolvedByKey.size;
if (dispositions.length !== expectedRows)
  errors.push(`classified ${dispositions.length}/${expectedRows} source rows`);

const accountingStatus = errors.length ? "FAIL" : "PASS";
const physicalBlockers = dispositions.filter((row) => row.performer
  && row.disposition === "unresolved-with-evidence"
  && ["physical-prosthetic", "physical-and-voice", "unresolved"].includes(row.performance_mode));
const benchmarkStatus = accountingStatus === "PASS" && physicalBlockers.length === 0 ? "PASS" : "FAIL";
const physicalCoverageRows = [...coverageByKey.values()].filter((row) =>
  ["physical-prosthetic", "physical-and-voice", "unresolved"].includes(row.performance_mode)
  && !exclusionByKey.has(creditKey(row)));
const wallCoverageComplete = physicalCoverageRows.every((row) => row.role_on_wall);
const report = {
  version: 1,
  test: "ferengi-source-scoped-discoverability",
  scope,
  input_sha256: Object.fromEntries(inputPaths.map((path) => [path, sha256(path)])),
  status: benchmarkStatus,
  accounting_status: accountingStatus,
  pass_definition: "Every source-scoped named physical Ferengi performer-role credit has an exact-key sourced performed edge in the Ferengi constellation or an evidence-backed exclusion; voice credits and unnamed source pages remain explicitly dispositioned, with no fuzzy matches or silent rows.",
  constellation_id: ferengiConstellation?.id || null,
  wall_coverage_complete: wallCoverageComplete,
  physical_blockers: physicalBlockers.length,
  source_rows: expectedRows,
  raw_performer_role_rows: expected.size + sourceAliases.length,
  performer_role_credits: expected.size,
  normalized_source_aliases: sourceAliases,
  unresolved_characters: unresolvedByKey.size,
  counts,
  errors,
  dispositions: dispositions.sort((a, b) => a.key.localeCompare(b.key)),
};

if (WRITE) writeFileSync("data/CENSUS-FERENGI-TEST.json", JSON.stringify(report, null, 1) + "\n");
if (JSON_ONLY) console.log(JSON.stringify(report));
else {
  console.log(`Ferengi benchmark: ${report.status}; accounting: ${report.accounting_status} — ${dispositions.length}/${expectedRows} source identities classified`);
  console.log(`  covered ${counts.covered}; excluded ${counts["excluded-with-reason"]}; unresolved ${counts["unresolved-with-evidence"]}`);
  console.log(`  exact-edge blockers: ${report.physical_blockers}; wall coverage complete: ${report.wall_coverage_complete ? "yes" : "no"}`);
  for (const error of errors) console.error(`  ERROR ${error}`);
}
process.exitCode = (ACCOUNTING_ONLY ? report.accounting_status : report.status) === "PASS" ? 0 : 2;
