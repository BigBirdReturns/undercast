#!/usr/bin/env node
/**
 * ds9-eligibility.mjs — a per-performance GROW.md eligibility projection. NO NETWORK.
 *
 * GROW.md law: a specimen is "a real, verifiable performer who vanishes under a
 * designed face — heavy prosthetics, a mask, a full creature suit, motion capture,
 * or an unseen voice-only role. … If the audience mostly sees the performer as
 * themselves, it doesn't qualify."
 *
 * This engine judges each CANONICAL PERFORMANCE in data/ds9/roster.json against
 * that law, using only the SOURCED species already in the census graph. It never
 * decides the wall and never touches specimens.json — it emits verdicts with a
 * cited reason for every one:
 *
 *   eligible    — the character's species is realized in DS9 production design as a
 *                 full designed face (the performer is never seen as themselves).
 *   ineligible  — the character is Human / genetically-enhanced Human: the performer
 *                 appears as themselves, no designed face.
 *   review      — a light-makeup species (Bajoran ridge, Trill spots, Vulcan/Romulan
 *                 ears) or an unestablished species: the "designed face" question is
 *                 genuinely per-performance and cannot be settled from species alone.
 *
 * A light-makeup species is NEVER auto-excluded — a heavily-transformed Bajoran can
 * still qualify, so those land in review, not ineligible.
 *
 *   node scripts/ds9-eligibility.mjs         # rebuild data/ds9/eligibility*.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { normalizeCensusKey as normalize } from "./census-key.mjs";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const graphEdges = JSON.parse(await readFile("data/ds9/graph/edges.json", "utf8")).edges;

// species -> the citation that established it (character page or species category),
// straight from the sourced is_species edges. This is the receipt behind a verdict.
const speciesSourceOf = new Map();   // "characterId|species" -> source url
const speciesByChar = new Map();     // characterId -> [species]
for (const e of graphEdges) if (e.type === "is_species") {
  const c = e.from.replace("character:", ""), s = e.to.replace("species:", "");
  (speciesByChar.get(c) || speciesByChar.set(c, []).get(c)).push(s);
  speciesSourceOf.set(c + "|" + s, e.source);
}

// --- GROW.md rule, grounded in DS9 production design and documented per tier ---
// DESIGNED_FACE: species whose EVERY DS9 realization is a full prosthetic / creature
// makeup — there is no "light" version, so per-performance and per-species coincide.
const DESIGNED_FACE = new Set(["Cardassian", "Klingon", "Ferengi", "Jem'Hadar", "Vorta",
  "Changeling", "Breen", "Lurian", "Hupyrian", "Nausicaan", "Karemma", "Tosk", "Gorn",
  "Benzite", "Bolian", "Tzenkethi", "Wadi", "Markalian", "Lethean", "Boslic"]);
// HUMANLIKE: the audience sees the performer essentially as themselves.
const HUMANLIKE = new Set(["Human", "Augment"]);
// LIGHT_MAKEUP: a small prosthetic addition — the "designed face" call is genuinely
// per-performance, so these go to review, never auto-eligible or auto-ineligible.
const LIGHT_MAKEUP = new Set(["Bajoran", "Trill", "Vulcan", "Romulan", "Betazoid", "El-Aurian", "Grazerite"]);

const GROW = "https://github.com/BigBirdReturns/undercast/blob/main/GROW.md";
const cites = (charId, species) => [
  { claim: "GROW.md eligibility law", source: GROW },
  ...species.map((s) => ({ claim: `character species: ${s}`, source: speciesSourceOf.get(charId + "|" + s) })).filter((c) => c.source),
];

function judge(row) {
  const charId = row.character_page || row.character;
  const species = [...new Set(speciesByChar.get(charId) || [])];
  const designed = species.filter((s) => DESIGNED_FACE.has(s));
  const light = species.filter((s) => LIGHT_MAKEUP.has(s));
  const human = species.length > 0 && species.every((s) => HUMANLIKE.has(s));
  let verdict, reason;
  if (designed.length) {
    verdict = "eligible";
    reason = `Character species ${designed.join("/")} is realized in DS9 as a full designed face (prosthetic/creature makeup); the performer is not seen as themselves — GROW.md "vanishes under a designed face."`;
  } else if (human) {
    verdict = "ineligible";
    reason = `Character species ${species.join("/")} appears without a designed face; the audience sees ${row.performer} as themselves — GROW.md "if the audience mostly sees the performer as themselves, it doesn't qualify."`;
  } else if (light.length) {
    verdict = "review";
    reason = `Character species ${light.join("/")} carries only a light makeup addition (e.g. nasal ridge / spots / ears); whether this "vanishes under a designed face" is a per-performance call, not decidable from species — GROW.md.`;
  } else if (species.length) {
    verdict = "review";
    reason = `Character species ${species.join("/")} has no established DS9 makeup tier in this ruleset; needs per-performance adjudication before a verdict.`;
  } else {
    verdict = "review";
    reason = `No species is established for this character in the census graph; the designed-face question cannot be judged from the sourced evidence alone.`;
  }
  return { verdict, reason, species, citations: cites(charId, species) };
}

const rulings = roster.map((row) => {
  const j = judge(row);
  return {
    performer: row.performer, performer_pageid: row.performer_pageid,
    character: row.character, character_pageid: row.character_pageid,
    character_named: row.character_named, background_role: row.background_role,
    species: j.species, verdict: j.verdict, reason: j.reason,
    basis: "GROW.md designed-face law applied to sourced census species",
    on_wall: row.role_on_wall, wall_ids: row.wall_ids,
    duplicate_key: row.duplicate_key, citations: j.citations,
  };
}).sort((a, b) => a.performer.localeCompare(b.performer) || a.character.localeCompare(b.character));

const by = (v) => rulings.filter((r) => r.verdict === v);
const eligible = by("eligible"), ineligible = by("ineligible"), review = by("review");
// INVARIANT: nothing already on the wall may be ruled ineligible (it passed GROW.md
// when it was added). review is allowed — a wall member may be a per-performance
// borderline (Leeta, transform 1) or expose a census species gap (Gaila, Ferengi
// with no is_species edge), and review neither excludes it nor pretends certainty.
const onWallIneligible = rulings.filter((r) => r.on_wall && r.verdict === "ineligible");
const onWallInReview = rulings.filter((r) => r.on_wall && r.verdict === "review");

const summary = {
  version: 1, production: "Star Trek: Deep Space Nine",
  law: "GROW.md — a real, verifiable performer who vanishes under a designed face",
  generated_from: ["data/ds9/roster.json", "data/ds9/graph/edges.json"],
  method: "Deterministic, offline projection. Each canonical performance is judged from its SOURCED census species; every verdict cites GROW.md and the species source. Full-designed-face species -> eligible; Human/Augment -> ineligible; light-makeup or unestablished species -> review (never auto-excluded).",
  rule_tiers: {
    designed_face_eligible: [...DESIGNED_FACE].sort(),
    humanlike_ineligible: [...HUMANLIKE].sort(),
    light_makeup_review: [...LIGHT_MAKEUP].sort(),
  },
  canonical_performances: rulings.length,
  eligible: eligible.length, ineligible: ineligible.length, review: review.length,
  every_verdict_cited: rulings.every((r) => r.citations.length >= 1),
  invariant_on_wall_ruled_ineligible: onWallIneligible.length,   // MUST be 0
  diagnostic_on_wall_in_review: onWallInReview.map((r) => ({ performer: r.performer, character: r.character, species: r.species, wall_ids: r.wall_ids, why: r.species.length ? "per-performance borderline (light makeup)" : "census species gap — no is_species edge for this character" })),
  note: "This is a first-pass projection. review verdicts are candidates for a later, separately-authorized per-performance adjudication. Nothing here enters specimens.json.",
};

await writeFile("data/ds9/eligibility.json", JSON.stringify({ version: 1, count: rulings.length, rulings }, null, 1) + "\n");
await writeFile("data/ds9/eligibility-summary.json", JSON.stringify(summary, null, 1) + "\n");

console.log(`canonical performances: ${rulings.length}`);
console.log(`  eligible:   ${eligible.length}`);
console.log(`  ineligible: ${ineligible.length}`);
console.log(`  review:     ${review.length}`);
console.log(`INVARIANT on-wall ruled ineligible (must be 0): ${onWallIneligible.length}`);
console.log(`diagnostic on-wall in review: ${onWallInReview.length}`);
