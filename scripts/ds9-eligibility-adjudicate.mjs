#!/usr/bin/env node
/**
 * ds9-eligibility-adjudicate.mjs — pin, verify, and THRESHOLD-check the evidence.
 * Uses the network (pins Memory Alpha pages).
 *
 * Provenance is not enough: a verified quote must also clear UNDERCAST's entry
 * threshold — a FULL designed face, not "teeth", "contact lenses", generic makeup,
 * or in-universe anatomy. And evidence must belong to the SPECIFIC performance, not
 * be copied across every actor who ever played the character.
 *
 * This step:
 *   - keys evidence by the roster's collision-proof duplicate_key (performer page |
 *     character page), so 557 performances -> 557 records;
 *   - builds a species "full designed face" registry from each SPECIES page (a
 *     verified quote that meets the threshold), which soundly applies to every
 *     performer of that species — but only for a standard (non-hybrid) member;
 *   - for character-page quotes, drops any that name a DIFFERENT performer of the
 *     same character (the Melanie-Smith-inherits-Batten fix);
 *   - marks each transformation claim threshold=true only when the quote documents
 *     a full designed face.
 *
 *   CONTACT=you@example.com node scripts/ds9-eligibility-adjudicate.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { pinPages, verifyBasis, normalizeText } from "./lib/adjudicate.mjs";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const judgments = JSON.parse(await readFile("data/ds9/eligibility-judgments.json", "utf8")).judgments;
const graphEdges = JSON.parse(await readFile("data/ds9/graph/edges.json", "utf8")).edges;
const contact = process.env.CONTACT || "ds9-eligibility";

// FULL designed face — the performer disappears. Multiple facial pieces / full
// head or face prosthetic / a mask / a full suit / motion capture / voice-only.
// Deliberately does NOT match "teeth", "contact lenses", "a wig", "airbrushing",
// bare "makeup", or in-universe anatomy ("Cardassians had neck ridges").
const FULL_FACE = /(forehead|cranial|full[- ]?(face|head)|entire (face|head))[\w ,'-]{0,40}?(piece|prosthetic|appliance)|(head|face)piece[\w ,'-]{0,40}(stretch|cover|over the|from the)|foam latex[\w ,'-]{0,30}(face|head|mask|cowl|appliance|prosthetic)|(rubber|latex|foam) (mask|cowl|head)|full (facial|head)[\w ]{0,20}(make-?up|prosthetic|appliance)|prosthetic[\w ,'-]{0,20}(that )?(covered|conceal|encased)|(creature|body|rubber|foam|monster|full[- ]body) suit|\banimatronic|motion capture|performance capture|\bmo-?cap\b/i;
const VOICE_ONLY = /provided the voice|voiced (the|by)|voice of [a-z]|never (physically )?(seen|appeared) on(-| )?screen|only (heard|the voice)|unseen/i;
const APPEARS_AS_SELF = /bare-?faced|no (ferengi |alien |special )?(make-?up|prosthetic)|without[\w ]{0,20}make-?up|out of[\w ]{0,20}make-?up|lack of[\w ]{0,20}make-?up|played (him|her)self|(his|her) own face|as (him|her)self|only a (wig|light|nasal)|light[\w ]{0,15}(make-?up|appliance)|airbrush/i;

const speciesByChar = new Map();
for (const e of graphEdges) if (e.type === "is_species") {
  const c = e.from.replace("character:", ""), s = e.to.replace("species:", "");
  (speciesByChar.get(c) || speciesByChar.set(c, []).get(c)).push({ species: s, source: e.source });
}
const judgeByChar = new Map(judgments.map((j) => [j.character, j]));
// every performer who ever played each character (to reject cross-performer quotes)
const performersOf = new Map();
for (const r of roster) (performersOf.get(r.character) || performersOf.set(r.character, new Set()).get(r.character)).add(r.performer);
const lastName = (n) => normalizeText(String(n).split(/\s+/).slice(-1)[0] || "");
// a character-page quote applies to performer P unless it names a DIFFERENT performer of the same character and not P
function appliesToPerformer(quote, P, character) {
  const q = normalizeText(quote);
  const others = [...(performersOf.get(character) || [])].filter((x) => x !== P);
  const namesOther = others.some((o) => lastName(o).length >= 3 && q.includes(lastName(o)));
  const namesP = q.includes(lastName(P)) || q.includes(normalizeText(P));
  return !(namesOther && !namesP);
}

// ---------- pin species + character pages ----------
const characterPages = [...new Set(roster.map((r) => r.character_page).filter(Boolean))];
const speciesPages = [...new Set([...speciesByChar.values()].flat().map((x) => x.species))];
console.log(`pinning ${characterPages.length} character + ${speciesPages.length} species pages...`);
const pins = await pinPages([...characterPages, ...speciesPages], { contact });

// NOTE: no species-level "registry" — a regex over a whole species page
// false-matches light-makeup races (Trill spots, Romulan ears) and misses others
// depending on phrasing, and it would generalise one makeup fact across every
// performer. Instead the PER-PERFORMANCE quote must itself clear the threshold.

// ---------- per-performance, claim-level evidence (keyed by duplicate_key) ----------
const captured_at = new Date().toISOString();
const evidence = {};
for (const row of roster) {
  const char = row.character_page || row.character;
  const key = row.duplicate_key;
  const j = judgeByChar.get(char);
  const species = speciesByChar.get(char) || [];
  const hybrid = species.length > 1 || /hybrid/i.test(j?.transformation_type || "") || /hybrid/i.test(j?.transformation || "");
  const claims = species.map((s) => ({ type: "species-membership", page: char, source: s.source, establishes: `character species: ${s.species}`, verified: true }));

  // per-performance quotes from the reader fan-out, threshold- and performer-checked
  for (const b of j?.basis || []) {
    const pin = pins.get(b.page);
    const q = b.quote;
    const isSpeciesPage = speciesPages.includes(b.page);
    const applies = isSpeciesPage ? true : appliesToPerformer(q, row.performer, row.character);
    if (j.transformation_type === "voice-only") {
      claims.push({ type: "transformation", scope: "performance", page: pin?.title || b.page, source: pin?.url || null,
        revision: pin?.revision ?? null, content_sha256: pin?.content_sha256 ?? null, basis: q, establishes: b.establishes,
        verified: pin && !pin.missing ? verifyBasis(q, pin.wikitext) : false, threshold: VOICE_ONLY.test(normalizeText(q)), applies });
    } else if (["heavy-prosthetics", "mask", "creature-suit", "motion-capture"].includes(j.transformation_type)) {
      claims.push({ type: "transformation", scope: "performance", page: pin?.title || b.page, source: pin?.url || null,
        revision: pin?.revision ?? null, content_sha256: pin?.content_sha256 ?? null, basis: q, establishes: b.establishes,
        verified: pin && !pin.missing ? verifyBasis(q, pin.wikitext) : false, threshold: FULL_FACE.test(normalizeText(q)), applies });
    } else if (j.transformation_type === "appears-as-self" || j.transformation_type === "light-makeup") {
      claims.push({ type: "appears-as-self", scope: "performance", page: pin?.title || b.page, source: pin?.url || null,
        revision: pin?.revision ?? null, content_sha256: pin?.content_sha256 ?? null, basis: q, establishes: b.establishes,
        verified: pin && !pin.missing ? verifyBasis(q, pin.wikitext) : false, affirmative: APPEARS_AS_SELF.test(normalizeText(q)), applies });
    }
  }

  evidence[key] = {
    performer: row.performer, performer_pageid: row.performer_pageid,
    character: row.character, character_page: row.character_page, character_pageid: row.character_pageid,
    species: species.map((s) => s.species), hybrid,
    transformation_type: j?.transformation_type || "unknown", reader_hint: j?.verdict_hint || null,
    claims,
  };
}

const tclaims = Object.values(evidence).flatMap((e) => e.claims).filter((c) => c.type === "transformation" && c.scope);
const aclaims = Object.values(evidence).flatMap((e) => e.claims).filter((c) => c.type === "appears-as-self");
const doc = {
  version: 4, production: "Star Trek: Deep Space Nine", captured_at,
  generator: "scripts/ds9-eligibility-adjudicate.mjs",
  note: "Per-performance evidence keyed by the roster's collision-proof duplicate_key. A transformation claim decides ONLY if verified=true (quote present in the pinned revision), threshold=true (documents a FULL designed face, not teeth/contacts/light/anatomy), and applies=true (species-level, or a character quote that does not name a different performer). appears-as-self decides ineligible only if verified and affirmative and applies. Everything else is review.",
  grow_types: ["heavy-prosthetics", "mask", "creature-suit", "motion-capture", "voice-only"],
  performance_count: Object.keys(evidence).length,
  transformation_claims_decisive: tclaims.filter((c) => c.verified && c.threshold && c.applies).length,
  transformation_claims_below_threshold: tclaims.filter((c) => c.verified && !c.threshold).length,
  appears_as_self_claims_decisive: aclaims.filter((c) => c.verified && c.affirmative && c.applies).length,
  cross_performer_quotes_dropped: [...tclaims, ...aclaims].filter((c) => c.applies === false).length,
  performances: evidence,
};
await writeFile("data/ds9/eligibility-evidence.json", JSON.stringify(doc, null, 1) + "\n");
console.log(`performances: ${doc.performance_count} (was 556 under the colliding key)`);
console.log(`decisive transformation claims: ${doc.transformation_claims_decisive}; below-threshold dropped: ${doc.transformation_claims_below_threshold}; cross-performer dropped: ${doc.cross_performer_quotes_dropped}`);
