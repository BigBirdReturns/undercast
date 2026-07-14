#!/usr/bin/env node
/**
 * ds9-maker-queue.mjs — assemble the maker-attribution REVIEW QUEUE. NO NETWORK.
 *
 * The machine prepares decisions; it does not make them. Every performance is
 * `review` unless the OWNER's decisions file records a list of typed credits for
 * it. Substantive-evidence hints never move a performance out of review.
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
    credits: decision ? decision.credits.map((c) => ({ maker: c.maker, role: c.role })) : null,
    decided_by: decision ? decision.decided_by : null, date: decision ? decision.date : null,
    substantive_credits: d.substantive_credits, context_makers: d.context_makers,
    evidence_count: d.evidence.length, substantive_count: d.evidence.filter((e) => e.substantive).length,
    on_wall: d.on_wall, wall_ids: d.wall_ids,
  };
}).sort((a, b) => a.performer.localeCompare(b.performer) || a.character.localeCompare(b.character));

const decided = queue.filter((q) => q.status === "decided");
const summary = {
  version: 2, production: "Star Trek: Deep Space Nine",
  title: "DS9 maker-attribution review queue",
  question: "Who built each designed face — the plural, typed credits (designer, sculptor, applicator, supervisor, shop)?",
  generated_from: ["data/ds9/maker-evidence.json (machine: pinned+verified, applicability-judged)", "data/ds9/maker-decisions.json (owner: plural typed credits)"],
  contract: "Machines pin+verify maker quotes and judge applicability; only substantive (DS9-applicable, performance-matched) items can support a decision. The owner records a list of typed credits per performance; a credit's role must match its cited item's maker_type. Everything undecided is review.",
  total: queue.length,
  decided: decided.length,
  review: queue.length - decided.length,
  performances_with_substantive_evidence: queue.filter((q) => q.substantive_credits.length > 0).length,
  performances_with_context_only: queue.filter((q) => q.substantive_credits.length === 0 && q.context_makers.length > 0).length,
  decision_errors: errors,
};

await writeFile("data/ds9/maker-queue.json", JSON.stringify({ version: 2, summary, queue }, null, 1) + "\n");
await writeFile("data/ds9/maker-summary.json", JSON.stringify(summary, null, 1) + "\n");

console.log(`maker review queue: ${queue.length} performances`);
console.log(`  decided by owner: ${decided.length}`);
console.log(`  review (undecided): ${summary.review}`);
console.log(`  with substantive evidence: ${summary.performances_with_substantive_evidence}; context-only: ${summary.performances_with_context_only}`);
if (errors.length) {
  console.error(`\n${errors.length} INVALID owner decision(s) — failing:`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
