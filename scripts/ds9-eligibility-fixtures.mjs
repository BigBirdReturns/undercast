#!/usr/bin/env node
/**
 * ds9-eligibility-fixtures.mjs — regression fixtures for the eligibility projection.
 * Offline; exits non-zero on any miss.  npm run ds9:eligibility:fixtures
 */
import { readFile } from "node:fs/promises";

const rulings = JSON.parse(await readFile("data/ds9/eligibility.json", "utf8")).rulings;
const summary = JSON.parse(await readFile("data/ds9/eligibility-summary.json", "utf8"));

let failed = 0;
const check = (name, cond, detail = "") => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <- " + detail}`); if (!cond) failed++; };
const find = (p, c) => rulings.find((r) => r.performer === p && r.character === c);

console.log("== DS9 eligibility fixtures ==");

// --- shape ---
check("every ruling has a verdict in {eligible, ineligible, review}",
  rulings.every((r) => ["eligible", "ineligible", "review"].includes(r.verdict)));
check("every verdict carries a cited reason (>=1 citation incl. GROW.md)",
  rulings.every((r) => r.reason && r.citations.length >= 1 && r.citations.some((c) => /GROW\.md/.test(c.source))));
check("every non-review verdict cites its species source",
  rulings.filter((r) => r.verdict !== "review").every((r) => r.citations.some((c) => /memory-alpha/.test(c.source || ""))));

// --- INVARIANT: nothing on the wall is ruled ineligible ---
check("INVARIANT: no on-wall performance is ruled ineligible",
  rulings.filter((r) => r.on_wall && r.verdict === "ineligible").length === 0,
  rulings.filter((r) => r.on_wall && r.verdict === "ineligible").map((r) => r.performer + "/" + r.character).join(","));
check("summary invariant field agrees (== 0)", summary.invariant_on_wall_ruled_ineligible === 0);

// --- rule integrity ---
check("eligible verdicts only for designed-face species",
  rulings.filter((r) => r.verdict === "eligible").every((r) => r.species.some((s) => summary.rule_tiers.designed_face_eligible.includes(s))));
check("ineligible verdicts only for humanlike species (Human/Augment)",
  rulings.filter((r) => r.verdict === "ineligible").every((r) => r.species.length && r.species.every((s) => summary.rule_tiers.humanlike_ineligible.includes(s))));
check("no light-makeup species is ever ruled ineligible (a transformed Bajoran can qualify)",
  rulings.filter((r) => r.species.some((s) => summary.rule_tiers.light_makeup_review.includes(s))).every((r) => r.verdict !== "ineligible"));

// --- specific verdicts ---
const V = (p, c, v) => check(`${p} as ${c} -> ${v}`, find(p, c)?.verdict === v, find(p, c)?.verdict);
V("Andrew J. Robinson", "Elim Garak", "eligible");   // Cardassian
V("Jeffrey Combs", "Weyoun 5", "eligible");           // Vorta
V("Aron Eisenberg", "Nog", "eligible");               // Ferengi
V("Alexander Siddig", "Julian Bashir", "ineligible"); // Augment/Human
V("Avery Brooks", "Benjamin Sisko", "ineligible");    // Human
V("Nana Visitor", "Kira Nerys", "review");            // Bajoran (light)
V("Terry Farrell", "Jadzia Dax", "review");           // Trill (light)

// --- determinism: summary counts match the rulings ---
check("summary counts match rulings",
  summary.eligible === rulings.filter((r) => r.verdict === "eligible").length &&
  summary.ineligible === rulings.filter((r) => r.verdict === "ineligible").length &&
  summary.review === rulings.filter((r) => r.verdict === "review").length &&
  summary.canonical_performances === rulings.length);

console.log(`\n${failed ? failed + " FIXTURE(S) FAILED" : "all eligibility fixtures passed"}`);
process.exit(failed ? 1 : 0);
