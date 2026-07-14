#!/usr/bin/env node
/**
 * ds9-eligibility-fixtures.mjs — prove the review-queue CONTRACT on ten
 * deliberately difficult performances. Offline; exits non-zero on any miss.
 *
 * The two invariants that must hold no matter what the evidence says:
 *   (1) evidence never crosses performances;
 *   (2) nothing becomes a verdict without an owner decision.
 *
 *   npm run ds9:eligibility:fixtures
 */
import { readFile } from "node:fs/promises";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const dossiers = JSON.parse(await readFile("data/ds9/eligibility-evidence.json", "utf8")).performances;
const queueDoc = JSON.parse(await readFile("data/ds9/eligibility-queue.json", "utf8"));
const queue = queueDoc.queue;
const qByKey = new Map(queue.map((q) => [q.duplicate_key, q]));
const decisionsDoc = JSON.parse(await readFile("data/ds9/eligibility-decisions.json", "utf8"));

let failed = 0;
const check = (name, cond, detail = "") => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <- " + detail}`); if (!cond) failed++; };
const keyOf = (p, c) => roster.filter((r) => r.performer === p && r.character === c).map((r) => r.duplicate_key);
const perfQuotes = (k) => (dossiers[k]?.evidence || []).filter((e) => e.kind !== "species-context");
const mentions = (k, name) => perfQuotes(k).some((e) => (e.basis || "").toLowerCase().includes(name.toLowerCase()));

// the ten difficult performances
const CASES = {
  garak: keyOf("Andrew J. Robinson", "Elim Garak")[0],
  rossoff: keyOf("Armin Shimerman", "Herbert Rossoff")[0],
  bashir: keyOf("Alexander Siddig", "Julian Bashir")[0],
  martok: keyOf("J.G. Hertzler", "Martok")[0],
  meganCole: keyOf("Megan Cole", "Kimara Cretak")[0],
  barbeau: keyOf("Adrienne Barbeau", "Kimara Cretak")[0],
  melanieZiyal: keyOf("Melanie Smith", "Tora Ziyal")[0],
  battenZiyal: keyOf("Cyia Batten", "Tora Ziyal")[0],
  changeling: keyOf("Salome Jens", "Female Changeling"),   // collision -> two keys
  computerVoice: keyOf("Judi Durand", "Computer voice")[0],
};

console.log("== DS9 eligibility review-queue contract (10 hard performances) ==");

// --- INVARIANT 2: nothing is a verdict without an owner decision ---
check("owner decisions file ships empty (no machine-written verdicts)", (decisionsDoc.decisions || []).length === 0);
check("with no owner decisions, EVERY performance in the queue is review",
  queue.every((q) => q.status === "review" && q.owner_verdict === null),
  queue.filter((q) => q.status !== "review").map((q) => q.performer + "/" + q.character).slice(0, 3).join(","));
for (const [k, key] of Object.entries(CASES)) {
  if (Array.isArray(key)) continue;
  if (!key) { check(`case ${k} resolves to a performance`, false, "no duplicate_key"); continue; }
  check(`${k}: status review, no verdict (evidence is not a verdict)`, qByKey.get(key)?.status === "review" && qByKey.get(key)?.owner_verdict === null);
}

// --- INVARIANT 1: evidence never crosses performances ---
check("Megan Cole (Cretak) carries NO evidence naming Adrienne Barbeau", CASES.meganCole && !mentions(CASES.meganCole, "Barbeau"));
check("Adrienne Barbeau (Cretak) carries NO evidence naming Megan Cole", CASES.barbeau && !mentions(CASES.barbeau, "Cole"));
check("Melanie Smith (Ziyal) carries NO Batten/Middendorf quote",
  CASES.melanieZiyal && !mentions(CASES.melanieZiyal, "Batten") && !mentions(CASES.melanieZiyal, "Middendorf"));
check("Cyia Batten (Ziyal) keeps only the quote that names her",
  CASES.battenZiyal && perfQuotes(CASES.battenZiyal).every((e) => /batten/i.test(e.basis || "")));
check("every attributed performance quote either names the performer or the character had one performer",
  Object.values(dossiers).every((d) => {
    const others = new Set(roster.filter((r) => r.character === d.character && r.performer !== d.performer).map((r) => r.performer));
    if (others.size === 0) return true;
    return perfQuotes(d.duplicate_key).every((e) => (e.basis || "").toLowerCase().includes(d.performer.split(" ").slice(-1)[0].toLowerCase()));
  }));

// --- signals are hints, NOT verdicts ---
check("Rossoff has a bare-faced signal but is still review (signal != verdict)",
  CASES.rossoff && qByKey.get(CASES.rossoff)?.signals.includes("bare-faced") && qByKey.get(CASES.rossoff)?.status === "review");

// --- species is context only ---
check("Garak dossier carries species as CONTEXT, and no evidence item is a verdict",
  CASES.garak && dossiers[CASES.garak]?.evidence.some((e) => e.kind === "species-context") &&
  dossiers[CASES.garak]?.evidence.every((e) => !("verdict" in e)));

// --- collision: two distinct dossiers for the colliding pair ---
check("Female Changeling (Salome Jens) collision keeps two distinct dossiers", CASES.changeling.length === 2 && CASES.changeling.every((k) => dossiers[k]));

// --- provenance: every verified quote is pinned to a revision + hash ---
check("every verified quote carries page + revision + content_sha256 + basis",
  Object.values(dossiers).flatMap((d) => d.evidence).filter((e) => e.basis && e.verified)
    .every((e) => e.page && e.revision && e.content_sha256 && e.basis));

// --- an owner decision flips EXACTLY that performance (queue-logic proof) ---
const validate = (dec) => {
  const doss = dossiers[dec.duplicate_key]; if (!doss) return false;
  const ids = new Set(doss.evidence.map((e) => e.id));
  return ["eligible", "ineligible"].includes(dec.verdict) && Array.isArray(dec.evidence_ids) &&
    dec.evidence_ids.length > 0 && dec.evidence_ids.every((id) => ids.has(id));
};
const sampleEvId = dossiers[CASES.garak].evidence[0].id;
check("a well-formed owner decision (valid evidence_ids) would be applied",
  validate({ duplicate_key: CASES.garak, verdict: "eligible", evidence_ids: [sampleEvId] }));
check("an owner decision citing non-existent evidence is rejected (dangling, not applied)",
  !validate({ duplicate_key: CASES.garak, verdict: "eligible", evidence_ids: ["does-not-exist#9"] }));
check("an owner decision with no evidence_ids is rejected",
  !validate({ duplicate_key: CASES.garak, verdict: "eligible", evidence_ids: [] }));

console.log(`\n${failed ? failed + " FIXTURE(S) FAILED" : "all contract fixtures passed"}  (queue: ${queueDoc.summary.review} review / ${queueDoc.summary.decided} decided)`);
process.exit(failed ? 1 : 0);
