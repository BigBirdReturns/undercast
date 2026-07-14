#!/usr/bin/env node
/**
 * ds9-eligibility-fixtures.mjs — prove the review-queue CONTRACT on ten
 * deliberately difficult performances, and prove owner-decision validation using
 * the SAME implementation production uses. Offline; exits non-zero on any miss.
 *
 * Robust to future owner decisions: it asserts the contract (status mirrors a
 * valid owner decision; evidence never crosses performances), not "all review".
 *
 *   npm run ds9:eligibility:fixtures
 */
import { readFile } from "node:fs/promises";
import { validateDecisions, validateDecision, evidenceId, isSubstantive } from "./lib/eligibility.mjs";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const dossiers = JSON.parse(await readFile("data/ds9/eligibility-evidence.json", "utf8")).performances;
const queue = JSON.parse(await readFile("data/ds9/eligibility-queue.json", "utf8")).queue;
const qByKey = new Map(queue.map((q) => [q.duplicate_key, q]));
const decisionsDoc = JSON.parse(await readFile("data/ds9/eligibility-decisions.json", "utf8"));

let failed = 0;
const check = (name, cond, detail = "") => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <- " + detail}`); if (!cond) failed++; };
const keyOf = (p, c) => roster.filter((r) => r.performer === p && r.character === c).map((r) => r.duplicate_key);
const perfQuotes = (k) => (dossiers[k]?.evidence || []).filter((e) => e.kind !== "species-context");
const mentions = (k, name) => perfQuotes(k).some((e) => (e.basis || "").toLowerCase().includes(name.toLowerCase()));

const CASES = {
  garak: keyOf("Andrew J. Robinson", "Elim Garak")[0],
  rossoff: keyOf("Armin Shimerman", "Herbert Rossoff")[0],
  bashir: keyOf("Alexander Siddig", "Julian Bashir")[0],
  martok: keyOf("J.G. Hertzler", "Martok")[0],
  meganCole: keyOf("Megan Cole", "Kimara Cretak")[0],
  barbeau: keyOf("Adrienne Barbeau", "Kimara Cretak")[0],
  melanieZiyal: keyOf("Melanie Smith", "Tora Ziyal")[0],
  battenZiyal: keyOf("Cyia Batten", "Tora Ziyal")[0],
  changeling: keyOf("Salome Jens", "Female Changeling"),
  computerVoice: keyOf("Judi Durand", "Computer voice")[0],
};

console.log("== DS9 eligibility review-queue contract (10 hard performances) ==");

// --- INVARIANT: status mirrors a VALID owner decision (shared validator) — robust to future decisions ---
const { applied, errors } = validateDecisions(decisionsDoc.decisions, dossiers);
check("committed owner decisions are all valid (no duplicate/malformed/stale/dangling)", errors.length === 0, errors.slice(0, 3).join("; "));
check("a performance is `decided` IFF the owner has a valid decision for it (else review)",
  queue.every((q) => q.status === (applied.has(q.duplicate_key) ? "decided" : "review")));
check("no queue entry carries a verdict without a valid owner decision",
  queue.every((q) => (q.owner_verdict === null) === !applied.has(q.duplicate_key)));
for (const [k, key] of Object.entries(CASES)) {
  if (Array.isArray(key)) continue;
  if (!key) { check(`case ${k} resolves to a performance`, false); continue; }
  check(`${k}: status matches its decision state (currently ${applied.has(key) ? "decided" : "review"})`,
    qByKey.get(key)?.status === (applied.has(key) ? "decided" : "review"));
}

// --- INVARIANT: evidence never crosses performances ---
check("Megan Cole (Cretak) carries NO evidence naming Adrienne Barbeau", CASES.meganCole && !mentions(CASES.meganCole, "Barbeau"));
check("Adrienne Barbeau (Cretak) carries NO evidence naming Megan Cole", CASES.barbeau && !mentions(CASES.barbeau, "Cole"));
check("Melanie Smith (Ziyal) carries NO Batten/Middendorf quote",
  CASES.melanieZiyal && !mentions(CASES.melanieZiyal, "Batten") && !mentions(CASES.melanieZiyal, "Middendorf"));
check("Cyia Batten (Ziyal) keeps only the quote that names her",
  CASES.battenZiyal && perfQuotes(CASES.battenZiyal).every((e) => /batten/i.test(e.basis || "")));
check("every attributed performance quote names the performer, or the character had one performer",
  Object.values(dossiers).every((d) => {
    const others = new Set(roster.filter((r) => r.character === d.character && r.performer !== d.performer).map((r) => r.performer));
    if (others.size === 0) return true;
    return perfQuotes(d.duplicate_key).every((e) => (e.basis || "").toLowerCase().includes(d.performer.split(" ").slice(-1)[0].toLowerCase()));
  }));

// --- signals are hints, not verdicts; species is context; collision preserved ---
check("Rossoff has a bare-faced signal but is not decided (signal != verdict)",
  CASES.rossoff && qByKey.get(CASES.rossoff)?.signals.includes("bare-faced") && !applied.has(CASES.rossoff));
check("Garak dossier carries species as CONTEXT and no evidence item is a verdict",
  CASES.garak && dossiers[CASES.garak]?.evidence.some((e) => e.kind === "species-context") &&
  dossiers[CASES.garak]?.evidence.every((e) => !("verdict" in e)));
check("Female Changeling (Salome Jens) collision keeps two distinct dossiers",
  CASES.changeling.length === 2 && CASES.changeling.every((k) => dossiers[k]));

// --- evidence IDs are content-addressed (stable, not positional) ---
check("every evidence id is the content-address of its own item",
  Object.values(dossiers).every((d) => d.evidence.every((e) => e.id === evidenceId(d.duplicate_key, e))));
check("every verified quote is pinned to page + revision + content_sha256 + basis",
  Object.values(dossiers).flatMap((d) => d.evidence).filter((e) => e.basis && e.verified)
    .every((e) => e.page && e.revision && e.content_sha256 && e.basis));

// --- owner-decision validation: substantive evidence + complete metadata; bad ones rejected ---
const gk = CASES.garak, gEv = dossiers[gk].evidence;
const substantiveId = gEv.find((e) => isSubstantive(e))?.id;
const speciesId = gEv.find((e) => e.kind === "species-context")?.id;
const good = { duplicate_key: gk, verdict: "eligible", rationale: "Full Cardassian facial prosthetic; performer not visible.", evidence_ids: [substantiveId], decided_by: "owner", date: "2026-07-14", grow_md_version: "GROW.md@abc" };
check("a complete decision citing substantive evidence is accepted", validateDecision(good, dossiers).ok, JSON.stringify(validateDecision(good, dossiers).errors));
check("a decision citing only species-context is rejected (not substantive)",
  !validateDecision({ ...good, evidence_ids: [speciesId] }, dossiers).ok);
check("a decision citing non-existent evidence is rejected (stale/dangling)",
  !validateDecision({ ...good, evidence_ids: ["nope#000000"] }, dossiers).ok);
check("a decision missing rationale is rejected (incomplete metadata)",
  !validateDecision({ ...good, rationale: "" }, dossiers).ok);
check("a decision with a bad verdict value is rejected (malformed)",
  !validateDecision({ ...good, verdict: "maybe" }, dossiers).ok);
check("a decision for an unknown performance is rejected (dangling)",
  !validateDecision({ ...good, duplicate_key: "p0|c0" }, dossiers).ok);
check("duplicate decisions for the same performance are rejected",
  validateDecisions([good, good], dossiers).errors.some((e) => /duplicate/.test(e)));
check("a valid decision applied by the shared validator flips exactly that one performance",
  (() => { const { applied: a } = validateDecisions([good], dossiers); return a.size === 1 && a.has(gk); })());

console.log(`\n${failed ? failed + " FIXTURE(S) FAILED" : "all contract fixtures passed"}`);
process.exit(failed ? 1 : 0);
