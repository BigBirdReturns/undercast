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

const dossiers = JSON.parse(await readFile("data/ds9/eligibility-evidence.json", "utf8")).performances;
const decisionsDoc = JSON.parse(await readFile("data/ds9/eligibility-decisions.json", "utf8"));
const decisions = new Map((decisionsDoc.decisions || []).map((d) => [d.duplicate_key, d]));

const queue = Object.values(dossiers).map((d) => {
  const decision = decisions.get(d.duplicate_key) || null;
  // a decision only counts if it is well-formed and cites evidence that exists
  const evIds = new Set(d.evidence.map((e) => e.id));
  const valid = decision && ["eligible", "ineligible"].includes(decision.verdict)
    && Array.isArray(decision.evidence_ids) && decision.evidence_ids.length > 0
    && decision.evidence_ids.every((id) => evIds.has(id));
  return {
    duplicate_key: d.duplicate_key, performer: d.performer, character: d.character,
    status: valid ? "decided" : "review",
    owner_verdict: valid ? decision.verdict : null,
    owner_rationale: valid ? decision.rationale : null,
    decided_by: valid ? decision.decided_by : null, date: valid ? decision.date : null,
    grow_md_version: valid ? decision.grow_md_version : null,
    signals: d.signals, evidence_count: d.evidence.filter((e) => e.kind !== "species-context").length,
    on_wall: d.on_wall, wall_ids: d.wall_ids,
  };
}).sort((a, b) => a.performer.localeCompare(b.performer) || a.character.localeCompare(b.character));

// a decision that references a performance/evidence that does not exist is surfaced, never silently applied
const danglingDecisions = (decisionsDoc.decisions || []).filter((d) => {
  const doss = dossiers[d.duplicate_key];
  if (!doss) return true;
  const evIds = new Set(doss.evidence.map((e) => e.id));
  return !(Array.isArray(d.evidence_ids) && d.evidence_ids.length && d.evidence_ids.every((id) => evIds.has(id)));
}).map((d) => d.duplicate_key);

const decided = queue.filter((q) => q.status === "decided");
const summary = {
  version: 1, production: "Star Trek: Deep Space Nine",
  title: "DS9 eligibility review queue",
  law: "GROW.md — a real, verifiable performer who vanishes under a designed face",
  generated_from: ["data/ds9/eligibility-evidence.json (machine: pinned+verified evidence)", "data/ds9/eligibility-decisions.json (owner: verdicts)"],
  contract: "Machines collect/pin/hash/verify evidence and prepare this queue. Verdicts come ONLY from the owner decisions file. Everything undecided is review. Signals (voice-only, bare-faced) are hints, not verdicts. Species is context only.",
  total: queue.length,
  decided: decided.length,
  review: queue.length - decided.length,
  owner_eligible: decided.filter((q) => q.owner_verdict === "eligible").length,
  owner_ineligible: decided.filter((q) => q.owner_verdict === "ineligible").length,
  performances_with_voice_only_signal: queue.filter((q) => q.signals.includes("voice-only")).length,
  performances_with_bare_faced_signal: queue.filter((q) => q.signals.includes("bare-faced")).length,
  dangling_owner_decisions: danglingDecisions,
};

await writeFile("data/ds9/eligibility-queue.json", JSON.stringify({ version: 1, summary, queue }, null, 1) + "\n");
await writeFile("data/ds9/eligibility-summary.json", JSON.stringify(summary, null, 1) + "\n");

console.log(`review queue: ${queue.length} performances`);
console.log(`  decided by owner: ${decided.length} (eligible ${summary.owner_eligible}, ineligible ${summary.owner_ineligible})`);
console.log(`  review (undecided): ${summary.review}`);
console.log(`  signals — voice-only: ${summary.performances_with_voice_only_signal}, bare-faced: ${summary.performances_with_bare_faced_signal}`);
if (danglingDecisions.length) console.log(`  WARNING dangling owner decisions: ${danglingDecisions.join(", ")}`);
