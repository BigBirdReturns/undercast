#!/usr/bin/env node
/**
 * ds9-eligibility-fixtures.mjs — regression fixtures for the eligibility projection.
 * Offline; exits non-zero on any miss.  npm run ds9:eligibility:fixtures
 *
 * These lock the CONTRACT, not a headcount, so they hold whether the evidence file
 * is empty (all review) or fully adjudicated: species never decides, every decided
 * verdict is sourced, and the wall never overrides evidence.
 */
import { readFile } from "node:fs/promises";

const rulings = JSON.parse(await readFile("data/ds9/eligibility.json", "utf8")).rulings;
const summary = JSON.parse(await readFile("data/ds9/eligibility-summary.json", "utf8"));

let failed = 0;
const check = (name, cond, detail = "") => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <- " + detail}`); if (!cond) failed++; };
const decided = rulings.filter((r) => r.verdict !== "review");

console.log("== DS9 eligibility fixtures (evidence-driven contract) ==");

// --- shape ---
check("every ruling has a verdict in {eligible, ineligible, review}",
  rulings.every((r) => ["eligible", "ineligible", "review"].includes(r.verdict)));
check("every ruling cites GROW.md", rulings.every((r) => r.citations.some((c) => /GROW\.md/.test(c.source))));
check("every ruling carries a review_priority",
  rulings.every((r) => ["likely-designed-face", "likely-humanlike", "borderline-light-makeup", "unknown"].includes(r.review_priority)));

// --- THE CORRECTION: species must not decide; only sourced evidence decides ---
check("no verdict is decided (eligible/ineligible) without sourced evidence",
  decided.every((r) => r.evidence && Array.isArray(r.evidence.sources) && r.evidence.sources.length > 0),
  decided.filter((r) => !(r.evidence?.sources?.length)).map((r) => r.performer + "/" + r.character).slice(0, 5).join(","));
check("every decided verdict cites a Memory Alpha source",
  decided.every((r) => r.citations.some((c) => /memory-alpha/.test(c.source || ""))));
check("eligible only when evidence says the performer is NOT visible as themselves",
  rulings.filter((r) => r.verdict === "eligible").every((r) => r.evidence?.visible_as_self === false));
check("ineligible always rests on evidence (never on species/humanlike alone)",
  rulings.filter((r) => r.verdict === "ineligible").every((r) => r.evidence && r.evidence.sources.length > 0));
// a designed-face species with NO evidence must still be review (species != verdict)
const unadjudicatedDesigned = rulings.filter((r) => r.review_priority === "likely-designed-face" && !r.evidence);
check("a likely-designed-face species with no evidence stays review (species is only a priority)",
  unadjudicatedDesigned.every((r) => r.verdict === "review"));

// --- wall does not override evidence ---
check("summary agrees eligibility is evidence-derived, not wall-driven",
  summary.every_decided_verdict_has_sources === true);
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
