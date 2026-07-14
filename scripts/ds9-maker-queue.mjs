#!/usr/bin/env node
/**
 * ds9-maker-queue.mjs — assemble the maker-attribution REVIEW QUEUE. NO NETWORK.
 *
 * The machine prepares decisions; it does not make them. Every performance is
 * `review` unless the OWNER's decisions file (data/ds9/maker-decisions.json)
 * records a curated canonical maker for it. No verified-maker hint moves a
 * performance out of review — only an owner decision.
 *
 *   node scripts/ds9-maker-queue.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { validateDecisions } from "./lib/maker.mjs";

const dossiers = JSON.parse(await readFile("data/ds9/maker-evidence.json", "utf8")).performances;
const decisionsDoc = JSON.parse(await readFile("data/ds9/maker-decisions.json", "utf8"));

const { applied, errors } = validateDecisions(decisionsDoc.decisions, dossiers);

const queue = Object.values(dossiers).map((d) => {
  const decision = applied.get(d.duplicate_key) || null;
  return {
    duplicate_key: d.duplicate_key, performer: d.performer, character: d.character,
    status: decision ? "decided" : "review",
    canonical_maker: decision ? decision.canonical_maker : null,
    owner_rationale: decision ? decision.rationale : null,
    decided_by: decision ? decision.decided_by : null, date: decision ? decision.date : null,
    verified_makers: d.verified_makers,
    evidence_count: d.evidence.length, verified_count: d.evidence.filter((e) => e.verified).length,
    on_wall: d.on_wall, wall_ids: d.wall_ids,
  };
}).sort((a, b) => a.performer.localeCompare(b.performer) || a.character.localeCompare(b.character));

const decided = queue.filter((q) => q.status === "decided");
const summary = {
  version: 1, production: "Star Trek: Deep Space Nine",
  title: "DS9 maker-attribution review queue",
  question: "Who built each designed face — makeup supervisor, artist, prosthetics/creature shop, sculptor?",
  generated_from: ["data/ds9/maker-evidence.json (machine: pinned+verified maker quotes)", "data/ds9/maker-decisions.json (owner: curated canonical maker)"],
  contract: "Machines collect/pin/hash/verify maker quotes and prepare this queue. The canonical maker comes ONLY from the owner decisions file. Everything undecided is review. A maker is character-scoped (shared across a character's performers). verified_makers are hints, not verdicts.",
  total: queue.length,
  decided: decided.length,
  review: queue.length - decided.length,
  performances_with_a_verified_maker: queue.filter((q) => q.verified_makers.length > 0).length,
  distinct_verified_makers: [...new Set(queue.flatMap((q) => q.verified_makers))].sort(),
  decision_errors: errors,
};

await writeFile("data/ds9/maker-queue.json", JSON.stringify({ version: 1, summary, queue }, null, 1) + "\n");
await writeFile("data/ds9/maker-summary.json", JSON.stringify(summary, null, 1) + "\n");

console.log(`maker review queue: ${queue.length} performances`);
console.log(`  decided by owner: ${decided.length}`);
console.log(`  review (undecided): ${summary.review}`);
console.log(`  with a verified maker hint: ${summary.performances_with_a_verified_maker}; distinct makers: ${summary.distinct_verified_makers.length}`);
if (errors.length) {
  console.error(`\n${errors.length} INVALID owner decision(s) — failing:`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
