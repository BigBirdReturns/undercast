#!/usr/bin/env node
/**
 * ds9-maker-fixtures.mjs — prove the maker-attribution contract, using the SAME
 * validator production uses. Offline; exits non-zero on any miss.
 *
 * The core invariant after the PR #49 review: SUBSTANTIVE means applicability-matched
 * (DS9, no other-production marker, no other performer named, single-performer named
 * character or performer-named, not an aggregate page), not merely pinned. Owner
 * decisions are plural TYPED credits, each role matching its cited item's maker_type.
 *
 *   npm run ds9:maker:fixtures
 */
import { readFile } from "node:fs/promises";
import { validateDecisions, validateDecision, evidenceId, isSubstantive, ROLES } from "./lib/maker.mjs";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const dossiers = JSON.parse(await readFile("data/ds9/maker-evidence.json", "utf8")).performances;
const queue = JSON.parse(await readFile("data/ds9/maker-queue.json", "utf8")).queue;
const decisionsDoc = JSON.parse(await readFile("data/ds9/maker-decisions.json", "utf8"));

let failed = 0;
const check = (name, cond, detail = "") => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <- " + detail}`); if (!cond) failed++; };
const perf = (p, c) => Object.values(dossiers).find((d) => d.performer === p && d.character === c);
const substOf = (p, c) => (perf(p, c)?.evidence || []).filter((e) => e.substantive);
const perfCount = new Map();
for (const r of roster) { const k = r.character_page || r.character; perfCount.set(k, (perfCount.get(k) || 0) + 1); }

console.log("== DS9 maker-attribution review-queue contract ==");

// --- status mirrors a VALID owner decision (shared validator) ---
const { applied, errors } = validateDecisions(decisionsDoc.decisions, dossiers);
check("committed owner decisions are all valid", errors.length === 0, errors.slice(0, 3).join("; "));
check("a performance is `decided` IFF the owner has a valid decision (else review)",
  queue.every((q) => q.status === (applied.has(q.duplicate_key) ? "decided" : "review")));
check("no queue entry carries credits without a valid owner decision",
  queue.every((q) => (q.credits === null) === !applied.has(q.duplicate_key)));

// --- PROVENANCE != APPLICABILITY: the three PR #49 leaks stay CONTEXT ---
check("Marc Worden's DS9 Alexander carries NO substantive TNG (Tania McComas) item",
  !substOf("Marc Worden", "Alexander Rozhenko").some((e) => e.maker === "Tania McComas"));
check("Melanie Smith's Ziyal carries NO substantive Season-4 (Dean Jones) item",
  !substOf("Melanie Smith", "Tora Ziyal").some((e) => e.maker === "Dean Jones"));
check("Adrienne Barbeau's DS9 Cretak carries NO substantive PIC-Romulan (Neville Page) item",
  !substOf("Adrienne Barbeau", "Kimara Cretak").some((e) => e.maker === "Neville Page"));

// --- the substantive rule holds for EVERY substantive item across the corpus ---
const AGG = /^Unnamed |(?:personnel|residents|visitors)$|Dabo girls/i;
check("every substantive item is DS9-applicable, performer-matched, non-aggregate, character-scoped",
  Object.values(dossiers).every((d) => d.evidence.filter((e) => e.substantive).every((e) =>
    e.scope === "character" && e.verified && e.maker && ROLES.includes(e.maker_type) &&
    !e.applicability.other_production && !e.applicability.other_performer_named &&
    !AGG.test(d.character || "") && !AGG.test(d.character_page || "") &&
    (perfCount.get(d.character_page || d.character) === 1 || e.applicability.named_performers.includes(d.performer)))));
check("no species-scoped item is ever substantive (species design != a performance's maker)",
  Object.values(dossiers).every((d) => d.evidence.filter((e) => e.scope === "species").every((e) => !e.substantive)));
check("no cross-production quote is ever substantive",
  Object.values(dossiers).flatMap((d) => d.evidence).every((e) => !(e.substantive && e.applicability.other_production)));

// --- content-addressed, unique ids; verified quotes pinned ---
check("every evidence id is the content-address of its own item",
  Object.values(dossiers).every((d) => d.evidence.every((e) => e.id === evidenceId(d.duplicate_key, e))));
check("every evidence id is unique within its dossier",
  Object.values(dossiers).every((d) => new Set(d.evidence.map((e) => e.id)).size === d.evidence.length));
check("every substantive item is pinned to page + revision + content_sha256 + basis + typed maker",
  Object.values(dossiers).flatMap((d) => d.evidence).filter((e) => e.substantive)
    .every((e) => e.page && e.revision && e.content_sha256 && e.basis && e.maker && ROLES.includes(e.maker_type)));

// --- exact canonical-key coverage ---
const setEq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
check("roster == dossier == queue keys (exact sets)",
  setEq(new Set(roster.map((r) => r.duplicate_key)), new Set(Object.keys(dossiers))) &&
  setEq(new Set(Object.keys(dossiers)), new Set(queue.map((q) => q.duplicate_key))));

// --- PLURAL TYPED CREDITS: owner-decision validation (accept + reject paths) ---
const martok = perf("J.G. Hertzler", "Martok");
const mSub = (martok?.evidence || []).filter(isSubstantive);
check("a single-performer designed face retains MULTIPLE typed substantive credits (Martok)", mSub.length >= 2,
  `Martok substantive: ${mSub.length}`);
if (mSub.length >= 2) {
  const key = martok.duplicate_key;
  const credit = (e) => ({ maker: e.maker, role: e.maker_type, evidence_id: e.id });
  const good = { duplicate_key: key, credits: mSub.map(credit),
    rationale: "Westmore designed and Quashnick applied Martok's makeup — both sourced.",
    decided_by: "owner", date: "2026-07-14" };
  check("a plural-credit decision (designer + applicator) is accepted", validateDecision(good, dossiers).ok,
    JSON.stringify(validateDecision(good, dossiers).errors));
  check("a credit whose role != the cited item's maker_type is rejected",
    !validateDecision({ ...good, credits: [{ ...credit(mSub[0]), role: mSub[0].maker_type === "designer" ? "sculptor" : "designer" }] }, dossiers).ok);
  check("a credit whose maker the cited item does not name is rejected",
    !validateDecision({ ...good, credits: [{ ...credit(mSub[0]), maker: "Somebody Else" }] }, dossiers).ok);
  check("a credit missing role is rejected",
    !validateDecision({ ...good, credits: [{ maker: mSub[0].maker, evidence_id: mSub[0].id }] }, dossiers).ok);
  check("a credit citing non-substantive/context evidence is rejected",
    (() => { const ctx = (Object.values(dossiers).flatMap((d) => d.evidence)).find((e) => e.verified && !e.substantive);
      return ctx ? !validateDecision({ ...good, credits: [{ maker: ctx.maker, role: ctx.maker_type, evidence_id: ctx.id }] }, dossiers).ok : true; })());
  check("a credit citing a stale/nonexistent evidence id is rejected",
    !validateDecision({ ...good, credits: [{ maker: mSub[0].maker, role: mSub[0].maker_type, evidence_id: "nope#000" }] }, dossiers).ok);
  check("duplicate (maker, role) credits are rejected",
    !validateDecision({ ...good, credits: [credit(mSub[0]), credit(mSub[0])] }, dossiers).ok);
  check("an empty credits list is rejected",
    !validateDecision({ ...good, credits: [] }, dossiers).ok);
  check("an impossible calendar date is rejected",
    !validateDecision({ ...good, date: "2026-13-40" }, dossiers).ok);
  check("a decision for an unknown performance is rejected (dangling)",
    !validateDecision({ ...good, duplicate_key: "p0|c0" }, dossiers).ok);
  check("a valid decision flips exactly that one performance",
    (() => { const { applied: a } = validateDecisions([good], dossiers); return a.size === 1 && a.has(key); })());
}

console.log(`\n${failed ? failed + " FIXTURE(S) FAILED" : "all contract fixtures passed"}`);
process.exit(failed ? 1 : 0);
