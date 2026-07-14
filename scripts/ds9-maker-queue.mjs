#!/usr/bin/env node
/** Assemble the offline maker-credit review queue. No network. */
import { readFile, writeFile } from "node:fs/promises";
import { normalizeBasis, validateDecisions } from "./lib/maker.mjs";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const evidence = JSON.parse(await readFile("data/ds9/maker-evidence.json", "utf8"));
const decisions = JSON.parse(await readFile("data/ds9/maker-decisions.json", "utf8"));
const observations = JSON.parse(await readFile("data/ds9/observations.json", "utf8")).observations || [];
const episodeTitles = [...new Set(observations
  .map((item) => item.title)
  .filter((title) => /\(episode\)$/.test(title || ""))
  .map((title) => normalizeBasis(title.replace(/\s*\(episode\)$/, ""))))];

const { applied, errors } = validateDecisions(decisions, evidence, roster, episodeTitles);
const queue = roster.map((row) => {
  const decision = applied.get(row.duplicate_key) || null;
  const signals = evidence.performances?.[row.duplicate_key]?.signal_receipt_ids || [];
  return {
    duplicate_key: row.duplicate_key,
    performer: row.performer,
    character: row.character,
    status: decision ? decision.coverage : "review",
    credits: decision ? decision.credits : null,
    owner_rationale: decision?.rationale || null,
    decided_by: decision?.decided_by || null,
    date: decision?.date || null,
    grow_md_version: decision?.grow_md_version || null,
    signal_receipt_ids: signals,
    signal_count: signals.length,
    on_wall: row.role_on_wall,
    wall_ids: row.wall_ids,
  };
}).sort((a, b) => a.performer.localeCompare(b.performer) || a.character.localeCompare(b.character));

const summary = {
  version: 3,
  production: "Star Trek: Deep Space Nine",
  title: "DS9 maker-credit owner review queue",
  contract: "Machines collect, pin, hash, verify, and surface non-authoritative signals. Only owner decisions attach plural typed credits. Queue status is review, partial, or complete; evidence count never implies completion.",
  total: queue.length,
  review: queue.filter((item) => item.status === "review").length,
  partial: queue.filter((item) => item.status === "partial").length,
  complete: queue.filter((item) => item.status === "complete").length,
  receipt_count: evidence.receipt_count,
  verified_receipts: evidence.verified_receipts,
  performances_with_signals: queue.filter((item) => item.signal_count > 0).length,
  decision_errors: errors,
};

await writeFile("data/ds9/maker-queue.json", JSON.stringify({ version: 3, summary, queue }, null, 1) + "\n");
await writeFile("data/ds9/maker-summary.json", JSON.stringify(summary, null, 1) + "\n");

console.log(`maker review queue: ${queue.length} performances`);
console.log(`  review ${summary.review}; partial ${summary.partial}; complete ${summary.complete}`);
console.log(`  receipts ${summary.receipt_count}; verified ${summary.verified_receipts}; signal-only matches ${summary.performances_with_signals}`);
if (errors.length) {
  console.error(`\n${errors.length} INVALID owner decision error(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
