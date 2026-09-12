#!/usr/bin/env node
/**
 * ds9-eligibility-queue.mjs — assemble the eligibility REVIEW QUEUE. NO NETWORK.
 *
 * The machine prepares decisions; it does not make them. Every performance is
 * `review` unless the OWNER's decisions file (data/ds9/eligibility-decisions.json)
 * records a verdict for it. No regex, species rule, signal, or agent
 * recommendation can move a performance out of review — only an owner decision.
 *
 *   node scripts/ds9-eligibility-queue.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { validateDecisions } from "./lib/eligibility.mjs";
import { coverageByKey, resolveDS9Key } from "./lib/ds9-coverage.mjs";

const dossiers = JSON.parse(await readFile("data/ds9/eligibility-evidence.json", "utf8")).performances;
const decisionsDoc = JSON.parse(await readFile("data/ds9/eligibility-decisions.json", "utf8"));
const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const coverage = coverageByKey(JSON.parse(await readFile("data/ds9/coverage.json", "utf8")).coverage, roster);
const aliases = JSON.parse(await readFile("data/ds9/key-aliases.json", "utf8")).aliases;

// ONE shared validator, identical to the fixtures. Any duplicate / malformed /
// stale / dangling decision produces an error and fails this build (and CI).
const { applied, errors } = validateDecisions(decisionsDoc.decisions, dossiers);

if (decisionsDoc.decisions.some(d => resolveDS9Key(d.duplicate_key, aliases) !== d.duplicate_key))
  throw new Error("Migrated eligibility decision needs explicit owner re-adjudication; cannot rebind historical evidence");
const queue = roster.map((row) => {
  const historical = Object.keys(dossiers).filter(key => key !== row.duplicate_key && resolveDS9Key(key, aliases) === row.duplicate_key);
  const d = dossiers[row.duplicate_key] || { ...row, signals: [], evidence: [] };
  const wall = coverage.get(row.duplicate_key);
  const decision = applied.get(d.duplicate_key) || null;
  return {
    duplicate_key: d.duplicate_key, performer: d.performer, character: d.character,
    status: decision ? "decided" : "review",
    owner_verdict: decision ? decision.verdict : null,
    owner_rationale: decision ? decision.rationale : null,
    decided_by: decision ? decision.decided_by : null, date: decision ? decision.date : null,
    grow_md_version: decision ? decision.grow_md_version : null,
    signals: d.signals, evidence_count: d.evidence.filter((e) => e.kind !== "species-context").length,
    on_wall: wall.role_on_wall, wall_ids: wall.wall_ids,
    ...(!dossiers[row.duplicate_key] || historical.length ? {
      evidence_status: dossiers[row.duplicate_key] ? "current-dossier" : "not-collected-for-current-key",
      historical_dossier_keys: historical,
    } : {}),
  };
}).sort((a, b) => a.performer.localeCompare(b.performer) || a.character.localeCompare(b.character));

const decided = queue.filter((q) => q.status === "decided");
const summary = {
  version: 1, production: "Star Trek: Deep Space Nine",
  title: "DS9 eligibility review queue",
  law: "GROW.md — a real, verifiable performer who vanishes under a designed face",
  generated_from: ["data/ds9/roster.json", "data/ds9/coverage.json", "data/ds9/key-aliases.json", "data/ds9/eligibility-evidence.json (machine: pinned+verified evidence)", "data/ds9/eligibility-decisions.json (owner: verdicts)"],
  contract: "Machines collect/pin/hash/verify evidence and prepare this queue. Verdicts come ONLY from the owner decisions file. Everything undecided is review. Signals (voice-only, bare-faced) are hints, not verdicts. Species is context only.",
  total: queue.length,
  decided: decided.length,
  review: queue.length - decided.length,
  owner_eligible: decided.filter((q) => q.owner_verdict === "eligible").length,
  owner_ineligible: decided.filter((q) => q.owner_verdict === "ineligible").length,
  performances_with_voice_only_signal: queue.filter((q) => q.signals.includes("voice-only")).length,
  performances_with_bare_faced_signal: queue.filter((q) => q.signals.includes("bare-faced")).length,
  decision_errors: errors,
};

await writeFile("data/ds9/eligibility-queue.json", JSON.stringify({ version: 1, summary, queue }, null, 1) + "\n");
await writeFile("data/ds9/eligibility-summary.json", JSON.stringify(summary, null, 1) + "\n");

console.log(`review queue: ${queue.length} performances`);
console.log(`  decided by owner: ${decided.length} (eligible ${summary.owner_eligible}, ineligible ${summary.owner_ineligible})`);
console.log(`  review (undecided): ${summary.review}`);
console.log(`  signals — voice-only: ${summary.performances_with_voice_only_signal}, bare-faced: ${summary.performances_with_bare_faced_signal}`);
if (errors.length) {
  console.error(`\n${errors.length} INVALID owner decision(s) — failing:`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
