#!/usr/bin/env node
/**
 * ds9-eligibility.mjs — a per-performance GROW.md eligibility projection. NO NETWORK.
 *
 * GROW.md law: a specimen is "a real, verifiable performer who vanishes under a
 * designed face — heavy prosthetics, a mask, a full creature suit, motion capture,
 * or an unseen voice-only role. … If the audience mostly sees the performer as
 * themselves, it doesn't qualify."
 *
 * Species does NOT decide eligibility — it only sets a review priority. A verdict
 * of eligible/ineligible is DERIVED from performance-specific, SOURCED evidence
 * held in data/ds9/eligibility-evidence.json (what transformation, how extensive,
 * was the performer visible as themselves, and the Memory Alpha sources). Without
 * that evidence a performance is `review`. Wall membership never overrides
 * evidence; a conflict is surfaced as a diagnostic, not resolved by fiat.
 *
 *   node scripts/ds9-eligibility.mjs         # rebuild data/ds9/eligibility*.json
 */
import { readFile, writeFile } from "node:fs/promises";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const graphEdges = JSON.parse(await readFile("data/ds9/graph/edges.json", "utf8")).edges;
const evidenceDoc = JSON.parse(await readFile("data/ds9/eligibility-evidence.json", "utf8"));
const EVIDENCE = evidenceDoc.characters || {};

// species per character, from the sourced is_species edges — CONTEXT ONLY.
const speciesByChar = new Map();
for (const e of graphEdges) if (e.type === "is_species") {
  const c = e.from.replace("character:", ""), s = e.to.replace("species:", "");
  (speciesByChar.get(c) || speciesByChar.set(c, []).get(c)).push(s);
}
// species only PRIORITISES review; it is never a verdict.
const DESIGNED_FACE = new Set(["Cardassian", "Klingon", "Ferengi", "Jem'Hadar", "Vorta", "Changeling",
  "Breen", "Lurian", "Hupyrian", "Nausicaan", "Karemma", "Tosk", "Gorn", "Benzite", "Bolian", "Tzenkethi", "Markalian", "Lethean", "Boslic"]);
const HUMANLIKE = new Set(["Human", "Augment"]);
const LIGHT_MAKEUP = new Set(["Bajoran", "Trill", "Vulcan", "Romulan", "Betazoid", "El-Aurian", "Grazerite"]);
const priorityOf = (species) => species.some((s) => DESIGNED_FACE.has(s)) ? "likely-designed-face"
  : species.length && species.every((s) => HUMANLIKE.has(s)) ? "likely-humanlike"
  : species.some((s) => LIGHT_MAKEUP.has(s)) ? "borderline-light-makeup" : "unknown";

const GROW = "https://github.com/BigBirdReturns/undercast/blob/main/GROW.md";

// The verdict is DERIVED from the sourced evidence facts, not asserted by anyone.
// A designed face the performer disappears into -> eligible; the performer seen as
// themselves -> ineligible; anything without sourced facts -> review.
function judge(charId, species) {
  const ev = EVIDENCE[charId];
  const prior = priorityOf(species);
  if (!ev || !Array.isArray(ev.sources) || ev.sources.length === 0)
    return { verdict: "review", evidence: null, review_priority: prior,
      reason: `No performance-specific transformation evidence yet. Species ${species.join("/") || "unestablished"} sets review priority "${prior}" but does not decide — GROW.md eligibility is about the designed face, not the race.` };
  const { transformation = null, extent = null, visible_as_self = null } = ev;
  const designed = extent && ["full", "partial"].includes(extent) && transformation && !/^none$/i.test(transformation);
  let verdict, reason;
  if (visible_as_self === false && designed) {
    verdict = "eligible";
    reason = `${row2label(charId)}: ${transformation} (${extent}); the performer is not seen as themselves — GROW.md "vanishes under a designed face."`;
  } else if (visible_as_self === true || extent === "none" || (extent === "light" && visible_as_self !== false)) {
    verdict = "ineligible";
    reason = `${row2label(charId)}: ${transformation || "no designed transformation"} (${extent || "none"}); the audience sees the performer as themselves — GROW.md disqualifier.`;
  } else {
    verdict = "review";
    reason = `${row2label(charId)}: evidence present but not decisive (transformation "${transformation}", extent "${extent}", visible_as_self ${visible_as_self}); needs a firmer sourced call.`;
  }
  return { verdict, evidence: { transformation, extent, visible_as_self, sources: ev.sources }, review_priority: prior, reason };
}
const labels = new Map();
const row2label = (charId) => labels.get(charId) || charId;

const rulings = roster.map((row) => {
  const charId = row.character_page || row.character;
  labels.set(charId, row.character);
  const species = [...new Set(speciesByChar.get(charId) || [])];
  const j = judge(charId, species);
  return {
    performer: row.performer, performer_pageid: row.performer_pageid,
    character: row.character, character_pageid: row.character_pageid,
    character_named: row.character_named, background_role: row.background_role,
    species,                       // context only
    review_priority: j.review_priority,
    verdict: j.verdict, reason: j.reason,
    evidence: j.evidence,          // the sourced facts a decided verdict rests on
    citations: [{ claim: "GROW.md eligibility law", source: GROW }, ...(j.evidence ? j.evidence.sources : [])],
    on_wall: row.role_on_wall, wall_ids: row.wall_ids, duplicate_key: row.duplicate_key,
  };
}).sort((a, b) => a.performer.localeCompare(b.performer) || a.character.localeCompare(b.character));

const by = (v) => rulings.filter((r) => r.verdict === v);
const eligible = by("eligible"), ineligible = by("ineligible"), review = by("review");
// evidence can contradict the wall — surfaced, never silently overridden either way.
const evidenceContradictsWall = rulings.filter((r) => r.on_wall && r.verdict === "ineligible");
const decided = rulings.filter((r) => r.verdict !== "review");

const summary = {
  version: 2, production: "Star Trek: Deep Space Nine",
  law: "GROW.md — a real, verifiable performer who vanishes under a designed face",
  generated_from: ["data/ds9/roster.json", "data/ds9/graph/edges.json", "data/ds9/eligibility-evidence.json"],
  method: "Species sets a review PRIORITY only. eligible/ineligible are DERIVED from performance-specific sourced evidence (transformation, extent, visible-as-self) in eligibility-evidence.json; without that evidence a performance is review. Wall membership never overrides evidence.",
  canonical_performances: rulings.length,
  eligible: eligible.length, ineligible: ineligible.length, review: review.length,
  performances_with_sourced_evidence: decided.length + rulings.filter((r) => r.verdict === "review" && r.evidence).length,
  every_decided_verdict_has_sources: decided.every((r) => r.evidence && r.evidence.sources.length > 0),
  review_priority_breakdown: rulings.reduce((a, r) => (a[r.review_priority] = (a[r.review_priority] || 0) + 1, a), {}),
  diagnostic_evidence_contradicts_wall: evidenceContradictsWall.map((r) => ({ performer: r.performer, character: r.character, wall_ids: r.wall_ids, evidence: r.evidence })),
  note: "First-pass. Until the sourced adjudication is run, verdicts are honestly mostly review. Nothing here enters specimens.json.",
};

await writeFile("data/ds9/eligibility.json", JSON.stringify({ version: 2, count: rulings.length, rulings }, null, 1) + "\n");
await writeFile("data/ds9/eligibility-summary.json", JSON.stringify(summary, null, 1) + "\n");

console.log(`canonical performances: ${rulings.length}`);
console.log(`  eligible:   ${eligible.length}  (evidence-backed)`);
console.log(`  ineligible: ${ineligible.length}  (evidence-backed)`);
console.log(`  review:     ${review.length}`);
console.log(`sourced evidence present for ${decided.length} decided verdict(s)`);
console.log(`evidence-contradicts-wall diagnostics: ${evidenceContradictsWall.length}`);
