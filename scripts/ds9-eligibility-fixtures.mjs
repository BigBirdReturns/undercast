#!/usr/bin/env node
/**
 * ds9-eligibility-fixtures.mjs — regression fixtures for the eligibility projection.
 * Offline; exits non-zero on any miss.  npm run ds9:eligibility:fixtures
 *
 * Locks the CONTRACT: a verdict rests on a claim that is verified (quote present in
 * the pinned revision), threshold-meeting (a FULL designed face — not teeth /
 * contacts / light / anatomy), and applicable to THIS performance. Not a headcount.
 */
import { readFile } from "node:fs/promises";

const rulings = JSON.parse(await readFile("data/ds9/eligibility.json", "utf8")).rulings;
const summary = JSON.parse(await readFile("data/ds9/eligibility-summary.json", "utf8"));
const evidence = JSON.parse(await readFile("data/ds9/eligibility-evidence.json", "utf8")).performances;

let failed = 0;
const check = (name, cond, detail = "") => { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <- " + detail}`); if (!cond) failed++; };
const decided = rulings.filter((r) => r.verdict !== "review");
const pinned = (r) => r.citations.filter((c) => c.revision && c.content_sha256 && c.basis);
const find = (p, c) => rulings.find((r) => r.performer === p && r.character === c);
const claimFor = (r) => (evidence[r.duplicate_key]?.claims || []);

console.log("== DS9 eligibility fixtures (verified + threshold + applicable) ==");

// --- shape + no collision ---
check("every ruling has a verdict in {eligible, ineligible, review}",
  rulings.every((r) => ["eligible", "ineligible", "review"].includes(r.verdict)));
check("every ruling cites GROW.md", rulings.every((r) => r.citations.some((c) => /GROW\.md/.test(c.source))));
check("evidence is keyed collision-free by duplicate_key (557 performances, not 556)",
  rulings.length === 557 && new Set(Object.keys(evidence)).size === new Set(rulings.map((r) => r.duplicate_key)).size);

// --- every decided verdict rests on a verified, PINNED claim ---
check("every eligible/ineligible verdict carries a claim with revision + content_sha256 + basis",
  decided.every((r) => pinned(r).length > 0));

// --- THRESHOLD: teeth / contacts / light / anatomy must NOT produce eligible ---
check("every eligible verdict's deciding claim is verified AND threshold-meeting AND applicable",
  rulings.filter((r) => r.verdict === "eligible").every((r) =>
    claimFor(r).some((c) => c.type === "transformation" && c.verified && c.threshold && c.applies)));
check("a below-threshold transformation quote never decides (teeth/contacts/light stay review)",
  rulings.filter((r) => r.verdict === "eligible").every((r) =>
    !claimFor(r).every((c) => c.type !== "transformation" || !c.threshold)));
const teethOnly = Object.values(evidence).filter((e) =>
  e.claims.some((c) => c.type === "transformation" && c.verified && !c.threshold) &&
  !e.claims.some((c) => c.type === "transformation" && c.verified && c.threshold));
check("performances whose only transformation quote is below threshold are review",
  teethOnly.every((e) => find(e.performer, e.character)?.verdict !== "eligible"),
  teethOnly.filter((e) => find(e.performer, e.character)?.verdict === "eligible").map((e) => e.character).slice(0, 4).join(","));

// --- PER-PERFORMER: a quote naming a different performer must not cross over ---
check("Melanie Smith does NOT inherit the Batten/Middendorf Tora Ziyal quote (review)",
  find("Melanie Smith", "Tora Ziyal")?.verdict === "review");
check("cross-performer quotes are dropped (applies=false exists in the evidence)",
  Object.values(evidence).flatMap((e) => e.claims).some((c) => c.applies === false));

// --- specific verdicts, each on a real full-face quote ---
check("Garak -> eligible on the Cardassian forehead/chin/nose appliance quote",
  find("Andrew J. Robinson", "Elim Garak")?.verdict === "eligible");
check("Nog -> eligible on the Ferengi head-appliance quote",
  find("Aron Eisenberg", "Nog")?.verdict === "eligible");
check("Herbert Rossoff -> ineligible on the bare-faced quote",
  find("Armin Shimerman", "Herbert Rossoff")?.verdict === "ineligible");
check("Martok -> review: a 'teeth' quote does not clear the full-designed-face threshold",
  find("J.G. Hertzler", "Martok")?.verdict === "review");
check("Julian Bashir -> review: no affirmative bare-faced quote (not inferred from silence)",
  find("Alexander Siddig", "Julian Bashir")?.verdict === "review");

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
