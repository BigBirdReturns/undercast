#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildEstate, canonicalJson, readCompletedPackets } from "./lib/card-backfill-cohort.mjs";
import { readPolicyAwareAdjudicationAttemptIndex } from "./lib/card-backfill-attempt-index.mjs";
import { isMultiSubject } from "./lib/card-backfill-source-policy-v3.mjs";
import { validateStaging } from "./lib/card-backfill-staging.mjs";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + "\n"); }
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function topLevelParts(value) {
  const source = String(value || "").trim();
  const parts = [];
  let current = "";
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    if (char === ")" && depth > 0) depth -= 1;
    const rest = source.slice(index);
    const andMatch = depth === 0 ? rest.match(/^\s+and\s+/i) : null;
    if (depth === 0 && (char === "&" || char === "/" || char === "," || andMatch)) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      if (andMatch) index += andMatch[0].length - 1;
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.map((part) => part.replace(/^\b(?:and|or)\b\s*/i, "").trim()).filter(Boolean);
}

function tokens(value) {
  return [...new Set(String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 1 && !new Set(["the", "a", "an", "of", "after", "modern", "english", "dub", "voice", "full", "costume"]).has(word)))];
}
function overlap(left, right) {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter((token) => b.has(token)).length;
  return shared / Math.min(a.size, b.size);
}
function classify(expectedSubject, components) {
  const text = String(expectedSubject || "");
  const openDenominator = /\b(?:many|menagerie|creatures|heroes\s+and\s+monsters|troopers\s*&\s*aliens|voices?|roles?)\b/i.test(text);
  const nonCharacterObject = /\b(?:song|narrator)\b/i.test(text);
  const aliasSignals = components.length === 2 && (
    overlap(components[0], components[1]) >= 0.5
    || /\b(?:palpatine|sidious|mandalorian|wolfman|hawkeye|clint barton|la parka|l\.a\. park|zenkai)\b/i.test(text)
  );
  if (openDenominator) return "open-denominator-review";
  if (nonCharacterObject) return "semantic-object-review";
  if (aliasSignals) return "alias-equivalence-review";
  if (components.length >= 2 && components.length <= 4) return "finite-composite-candidate";
  return "manual-denominator-review";
}
function countBy(rows, key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key] ?? "(none)", (counts.get(row[key] ?? "(none)") || 0) + 1);
  return [...counts.entries()].map(([value, count]) => ({ key: value, count })).sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}

export async function buildCompositeCensus({
  controlPath = ".github/CARD-BACKFILL-COHORT.json",
  completedRoot = "data/review/card-backfill",
  stagingRoot: explicitStagingRoot = null,
  now = new Date().toISOString(),
} = {}) {
  const control = await readJson(controlPath);
  const stagingRoot = explicitStagingRoot || control.staging?.root || "data/review/card-backfill-staging";
  const [specimens, sources, auditRoot, completedPackets, staging, attemptIndex] = await Promise.all([
    readJson("data/specimens.json"),
    readJson("data/SOURCES.json"),
    readJson("data/MEDIA-AUDIT.json"),
    readCompletedPackets(completedRoot),
    validateStaging({ root: stagingRoot, permanentRoot: completedRoot }),
    readPolicyAwareAdjudicationAttemptIndex(stagingRoot, control.campaign_id),
  ]);
  const byId = new Map(specimens.map((row) => [row.id, row]));
  const estate = buildEstate({ specimens, sources, auditItems: auditRoot.items || [], completedPackets, control });
  const staged = new Set(staging.entries.map((row) => row.obligation_id));
  const attempts = new Map(attemptIndex.entries.map((row) => [row.obligation_id, row.attempts || []]));
  const obligations = estate.obligations
    .filter((row) => row.side === "still" && isMultiSubject(row.expected_subject) && !staged.has(row.obligation_id))
    .map((row) => {
      const record = byId.get(row.wall_id) || {};
      const components = topLevelParts(row.expected_subject);
      const prior = attempts.get(row.obligation_id) || [];
      return {
        obligation_id: row.obligation_id,
        record_id: row.wall_id,
        expected_subject: row.expected_subject,
        components,
        component_count: components.length,
        census_class: classify(row.expected_subject, components),
        actor: record.actor || null,
        character: record.character || null,
        production: record.production || null,
        universe: record.universe || null,
        kind: record.kind || null,
        years: record.years || null,
        canonical_link: row.canonical_link || record.link || null,
        references: row.references || record.references || [],
        performances: row.performances || record.performances || [],
        shape: row.shape,
        disposition: row.disposition,
        quarantine_reasons: row.quarantine_reasons || [],
        prior_attempt_count: prior.length,
        prior_policy_versions: [...new Set(prior.map((attempt) => Number(attempt.source_policy_version || 0)).filter(Boolean))].sort((a, b) => a - b),
        uc170_precedent_applies: components.length >= 2 && components.length <= 4,
        canonical_mutation: false,
      };
    })
    .sort((a, b) => a.obligation_id.localeCompare(b.obligation_id, undefined, { numeric: true }));
  const summary = {
    census_class: countBy(obligations, "census_class"),
    component_count: countBy(obligations, "component_count"),
    performance_mode: countBy(obligations.map((row) => ({ performance_mode: row.shape?.performance_mode || null })), "performance_mode"),
    source_route: countBy(obligations.map((row) => ({ source_route: row.shape?.source_route || null })), "source_route"),
  };
  const body = {
    version: 1,
    lane: "card-backfill-composite-census",
    generated_at: now,
    campaign_id: control.campaign_id,
    source_estate_sha256: estate.estate_sha256,
    attempt_index_sha256: attemptIndex.index_sha256,
    staging_ledger_sha256: staging.ledger_sha256,
    completed_packets: completedPackets.size,
    open_obligations: estate.obligations.length,
    composite_obligations: obligations.length,
    precedent: {
      record_id: "UC-170",
      presentation: "three-role-animated-character-composite",
      recipe: "face-plus-body panels with deterministic dividers, crop simulation, exact source custody, and independent second-desk review",
    },
    summary,
    obligations,
    canonical_mutation: false,
  };
  body.census_sha256 = sha256(canonicalJson(body));
  return body;
}

async function main() {
  const out = resolve(option("--out", ".card-backfill-composite-census"));
  const body = await buildCompositeCensus({
    controlPath: option("--control", ".github/CARD-BACKFILL-COHORT.json"),
    completedRoot: option("--completed-root", "data/review/card-backfill"),
    stagingRoot: option("--staging-root", null),
    now: option("--now", new Date().toISOString()),
  });
  await writeJson(`${out}/composite-census.json`, body);
  await writeFile(`${out}/composite-census.md`, [
    "# Card-backfill composite frontier census",
    "",
    `- Completed packets: ${body.completed_packets}`,
    `- Open obligations: ${body.open_obligations}`,
    `- Composite-class obligations: ${body.composite_obligations}`,
    `- Census SHA-256: \`${body.census_sha256}\``,
    "- Canonical mutation: **false**",
    "",
    "## Classes",
    "",
    ...body.summary.census_class.map((row) => `- ${row.key}: ${row.count}`),
    "",
    "## Obligations",
    "",
    ...body.obligations.map((row) => `- ${row.obligation_id}: **${row.census_class}** — ${row.expected_subject} — ${row.actor || "unknown actor"} — ${row.production || "unknown production"}`),
    "",
  ].join("\n"));
  console.log(`PASS — classified ${body.obligations.length} repository-grounded composite obligations`);
  console.log(`CLASSES — ${JSON.stringify(Object.fromEntries(body.summary.census_class.map((row) => [row.key, row.count])))}`);
  console.log(`OUTPUT — ${out}`);
  console.log("canonical_mutation=false");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(`card-backfill composite census: ${error.stack || error.message}`); process.exit(1); });
}
