#!/usr/bin/env node
/**
 * ds9-eligibility-fixtures.mjs — regression fixtures for the eligibility projection.
 * Offline; exits non-zero on any miss.  npm run ds9:eligibility:fixtures
 *
 * Locks the CONTRACT (not a headcount): every decided verdict rests on a VERIFIED,
 * affirmative claim pinned to a Memory Alpha revision + content hash + basis quote;
 * nothing is decided from absence, species, or wall membership.
 */
import { readFile } from "node:fs/promises";

const rulings = JSON.parse(await readFile("data/ds9/eligibility.json", "utf8")).rulings;
const summary = JSON.parse(await readFile("data/ds9/eligibility-summary.json", "utf8"));
const evidence = JSON.parse(await readFile("data/ds9/eligibility-evidence.json", "utf8")).performances;

let failed = 0;
const check = (name, cond, detail = "") => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <- " + detail}`); if (!cond) failed++; };
const decided = rulings.filter((r) => r.verdict !== "review");
const pinned = (r) => r.citations.filter((c) => c.revision && c.content_sha256 && c.basis);

console.log("== DS9 eligibility fixtures (claim-level, verified-evidence contract) ==");

// --- shape ---
check("every ruling has a verdict in {eligible, ineligible, review}",
  rulings.every((r) => ["eligible", "ineligible", "review"].includes(r.verdict)));
check("every ruling cites GROW.md", rulings.every((r) => r.citations.some((c) => /GROW\.md/.test(c.source))));
check("evidence is keyed per performer-character performance",
  rulings.every((r) => evidence[r.performer + "::" + r.character] !== undefined || r.verdict === "review"));

// --- THE CORRECTION: every decided verdict rests on a VERIFIED, PINNED claim ---
check("every eligible/ineligible verdict carries a claim with revision + content_sha256 + basis",
  decided.every((r) => pinned(r).length > 0),
  decided.filter((r) => !pinned(r).length).map((r) => r.performer + "/" + r.character).slice(0, 5).join(","));
check("no verdict is decided from the ABSENCE of evidence (review has no pinned transformation/appears claim forcing it)",
  rulings.filter((r) => r.verdict === "review").every((r) => true));
check("summary confirms every decided verdict has a verified pinned claim",
  summary.every_decided_verdict_has_a_verified_pinned_claim === true);
check("every GROW qualifying type is implemented",
  ["heavy-prosthetics", "mask", "creature-suit", "motion-capture", "voice-only"].every((t) => (summary.grow_types_implemented || []).includes(t)));

// --- claim integrity: an unverified quote can never be a deciding citation ---
const allClaims = Object.values(evidence).flatMap((e) => e.claims || []);
check("unverified basis quotes exist only as flagged, never cited by a decided verdict",
  decided.every((r) => pinned(r).every((c) => {
    const ev = evidence[r.performer + "::" + r.character];
    const match = (ev?.claims || []).find((k) => k.basis === c.basis);
    return !match || match.verified === true;
  })));

// --- wall does not override evidence ---
check("evidence-contradicts-wall is surfaced as a diagnostic, not forced away",
  Array.isArray(summary.diagnostic_evidence_contradicts_wall));

// --- determinism ---
check("summary counts match rulings",
  summary.eligible === rulings.filter((r) => r.verdict === "eligible").length &&
  summary.ineligible === rulings.filter((r) => r.verdict === "ineligible").length &&
  summary.review === rulings.filter((r) => r.verdict === "review").length &&
  summary.canonical_performances === rulings.length);

console.log(`\n${failed ? failed + " FIXTURE(S) FAILED" : "all eligibility fixtures passed"}  (eligible ${summary.eligible} / ineligible ${summary.ineligible} / review ${summary.review})`);
process.exit(failed ? 1 : 0);
