#!/usr/bin/env node
/**
 * ds9-maker-fixtures.mjs — prove the maker-attribution review-queue CONTRACT, using
 * the SAME implementation production uses. Offline; exits non-zero on any miss.
 *
 * Asserts the contract (status mirrors a valid owner decision; ids are unique and
 * content-addressed; a maker is character-scoped) rather than specific makers, so
 * it survives re-runs of the fan-out and future owner decisions.
 *
 *   npm run ds9:maker:fixtures
 */
import { readFile } from "node:fs/promises";
import { validateDecisions, validateDecision, evidenceId, isSubstantive } from "./lib/maker.mjs";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const dossiers = JSON.parse(await readFile("data/ds9/maker-evidence.json", "utf8")).performances;
const queue = JSON.parse(await readFile("data/ds9/maker-queue.json", "utf8")).queue;
const decisionsDoc = JSON.parse(await readFile("data/ds9/maker-decisions.json", "utf8"));

let failed = 0;
const check = (name, cond, detail = "") => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <- " + detail}`); if (!cond) failed++; };

console.log("== DS9 maker-attribution review-queue contract ==");

// --- status mirrors a VALID owner decision (shared validator) — robust to future decisions ---
const { applied, errors } = validateDecisions(decisionsDoc.decisions, dossiers);
check("committed owner decisions are all valid (no duplicate/malformed/stale/dangling)", errors.length === 0, errors.slice(0, 3).join("; "));
check("a performance is `decided` IFF the owner has a valid decision for it (else review)",
  queue.every((q) => q.status === (applied.has(q.duplicate_key) ? "decided" : "review")));
check("no queue entry carries a canonical_maker without a valid owner decision",
  queue.every((q) => (q.canonical_maker === null) === !applied.has(q.duplicate_key)));

// --- content-addressed, unique ids; verified quotes pinned ---
check("every evidence id is the content-address of its own item",
  Object.values(dossiers).every((d) => d.evidence.every((e) => e.id === evidenceId(d.duplicate_key, e))));
check("every evidence id is unique within its dossier (no collapsing collisions)",
  Object.values(dossiers).every((d) => new Set(d.evidence.map((e) => e.id)).size === d.evidence.length));
check("every verified quote is pinned to page + revision + content_sha256 + basis + maker",
  Object.values(dossiers).flatMap((d) => d.evidence).filter((e) => e.verified)
    .every((e) => e.page && e.revision && e.content_sha256 && e.basis && e.maker));
check("no evidence item is itself a verdict (no canonical_maker field on evidence)",
  Object.values(dossiers).every((d) => d.evidence.every((e) => !("canonical_maker" in e))));

// --- a maker is character-scoped: all performances of one character share the same verified makers ---
const byChar = new Map();
for (const d of Object.values(dossiers)) (byChar.get(d.character_page) || byChar.set(d.character_page, []).get(d.character_page)).push(d);
check("all performances of a character carry the SAME set of verified makers (shared design)",
  [...byChar.values()].every((ds) => {
    const key = (d) => [...d.verified_makers].sort().join("|");
    return new Set(ds.map(key)).size === 1;
  }));

// --- exact canonical-key coverage: roster == dossiers == queue ---
const rosterKeys = new Set(roster.map((r) => r.duplicate_key));
const dossierKeys = new Set(Object.keys(dossiers));
const queueKeys = new Set(queue.map((q) => q.duplicate_key));
const setEq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
check("roster keys, dossier keys, and queue keys are EXACTLY equal sets",
  setEq(rosterKeys, dossierKeys) && setEq(dossierKeys, queueKeys),
  `roster ${rosterKeys.size} / dossiers ${dossierKeys.size} / queue ${queueKeys.size}`);

// --- owner-decision validation (accept + reject paths), using a real substantive item ---
const withMaker = Object.values(dossiers).find((d) => d.evidence.some(isSubstantive));
check("at least one performance has a substantive (verified, pinned) maker quote to decide on", !!withMaker,
  "the fan-out produced no verifiable maker — investigate before shipping");
if (withMaker) {
  const key = withMaker.duplicate_key;
  const subst = withMaker.evidence.find(isSubstantive);
  const good = { duplicate_key: key, canonical_maker: subst.maker, maker_type: subst.maker_type,
    rationale: "Verified production-note attribution for this character's makeup.",
    evidence_ids: [subst.id], decided_by: "owner", date: "2026-07-14" };
  check("a complete decision citing a substantive maker quote is accepted", validateDecision(good, dossiers).ok,
    JSON.stringify(validateDecision(good, dossiers).errors));
  check("a decision whose canonical_maker no evidence names is rejected",
    !validateDecision({ ...good, canonical_maker: "Somebody Not Named" }, dossiers).ok);
  check("a decision citing non-existent evidence is rejected (stale/dangling)",
    !validateDecision({ ...good, evidence_ids: ["nope#000000"] }, dossiers).ok);
  check("a decision citing the same evidence id twice is rejected (duplicate evidence_ids)",
    !validateDecision({ ...good, evidence_ids: [subst.id, subst.id] }, dossiers).ok);
  check("a decision missing rationale is rejected (incomplete metadata)",
    !validateDecision({ ...good, rationale: "" }, dossiers).ok);
  check("a decision with an impossible calendar date is rejected (2026-13-40)",
    !validateDecision({ ...good, date: "2026-13-40" }, dossiers).ok);
  check("a decision for an unknown performance is rejected (dangling)",
    !validateDecision({ ...good, duplicate_key: "p0|c0" }, dossiers).ok);
  check("duplicate decisions for the same performance are rejected",
    validateDecisions([good, good], dossiers).errors.some((e) => /duplicate/.test(e)));
  check("a valid decision applied by the shared validator flips exactly that one performance",
    (() => { const { applied: a } = validateDecisions([good], dossiers); return a.size === 1 && a.has(key); })());
}

console.log(`\n${failed ? failed + " FIXTURE(S) FAILED" : "all contract fixtures passed"}`);
process.exit(failed ? 1 : 0);
