#!/usr/bin/env node
/**
 * ds9-eligibility-adjudicate.mjs — COLLECT, PIN, HASH, VERIFY. Nothing else.
 * Uses the network (pins Memory Alpha pages).
 *
 * This machine builds a per-performance EVIDENCE DOSSIER. It does not judge
 * heaviness, it does not decide eligibility, and it never merges a signal into a
 * verdict. There is no threshold classifier — "vanishes under a designed face" is
 * an editorial call that lives in the owner's decisions file, not here.
 *
 * Contract:
 *   - every dossier is keyed by the roster's canonical duplicate_key;
 *   - each evidence item is pinned to a Memory Alpha revision + content hash and
 *     carries a VERIFIED verbatim basis quote and a neutral `kind`
 *     (makeup-note / voice-note / bare-faced-note / species-context);
 *   - shared SPECIES information is attached as context only;
 *   - a character-page quote attaches to a performance only when it names THIS
 *     performer, or the character had a single performer — evidence never crosses
 *     performances;
 *   - voice-only and bare-faced quotes raise an unambiguous `signal`, a hint for
 *     the owner — NOT a verdict.
 *
 *   CONTACT=you@example.com node scripts/ds9-eligibility-adjudicate.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { pinPages, verifyBasis, normalizeText } from "./lib/adjudicate.mjs";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const judgments = JSON.parse(await readFile("data/ds9/eligibility-judgments.json", "utf8")).judgments;
const graphEdges = JSON.parse(await readFile("data/ds9/graph/edges.json", "utf8")).edges;
const contact = process.env.CONTACT || "ds9-eligibility";

const VOICE = /provided the voice|voiced (the|by)|voice of [a-z]|never (physically )?(seen|appeared) on(-| )?screen|only (heard|the voice)|unseen/i;
const BARE_FACED = /bare-?faced|no (ferengi |alien |special )?(make-?up|prosthetic)|without[\w ]{0,20}make-?up|out of[\w ]{0,20}make-?up|played (him|her)self|(his|her) own face|as (him|her)self/i;

const speciesByChar = new Map();
for (const e of graphEdges) if (e.type === "is_species") {
  const c = e.from.replace("character:", ""), s = e.to.replace("species:", "");
  (speciesByChar.get(c) || speciesByChar.set(c, []).get(c)).push({ species: s, source: e.source });
}
const judgeByChar = new Map(judgments.map((j) => [j.character, j]));
const performersOf = new Map();
for (const r of roster) (performersOf.get(r.character) || performersOf.set(r.character, new Set()).get(r.character)).add(r.performer);
const lastName = (n) => normalizeText(String(n).split(/\s+/).slice(-1)[0] || "");

// strict attribution: a character-page quote belongs to this performance only if
// it names this performer, or the character had exactly one performer. A quote
// that names a different performer, or is unattributable on a multi-performer
// character, never attaches — evidence cannot cross performances.
function attributableTo(quote, performer, character) {
  const q = normalizeText(quote);
  const others = [...(performersOf.get(character) || [])].filter((x) => x !== performer);
  if (others.length === 0) return true;                       // single-performer character
  if (q.includes(lastName(performer)) || q.includes(normalizeText(performer))) return true; // names this performer
  return false;                                                // multi-performer + not named -> not attributable
}

const characterPages = [...new Set(roster.map((r) => r.character_page).filter(Boolean))];
const speciesPages = [...new Set([...speciesByChar.values()].flat().map((x) => x.species))];
console.log(`pinning ${characterPages.length} character + ${speciesPages.length} species pages...`);
const pins = await pinPages([...characterPages, ...speciesPages], { contact });

const captured_at = new Date().toISOString();
const performances = {};
for (const row of roster) {
  const char = row.character_page || row.character;
  const j = judgeByChar.get(char);
  const species = speciesByChar.get(char) || [];
  const evidence = [];
  let n = 0;
  const add = (kind, page, basis, establishes) => {
    const pin = pins.get(page);
    evidence.push({ id: row.duplicate_key + "#" + (++n), kind, page: pin?.title || page, source: pin?.url || null,
      revision: pin?.revision ?? null, content_sha256: pin?.content_sha256 ?? null, basis, establishes,
      verified: pin && !pin.missing && basis ? verifyBasis(basis, pin.wikitext) : false });
  };
  // species membership — CONTEXT ONLY, never a verdict
  for (const s of species) evidence.push({ id: row.duplicate_key + "#" + (++n), kind: "species-context",
    page: char, source: s.source, establishes: `character species: ${s.species}`, basis: null, verified: true });

  for (const b of j?.basis || []) {
    const isSpeciesPage = speciesPages.includes(b.page);
    if (isSpeciesPage) { add("species-context", b.page, b.quote, b.establishes); continue; }
    if (!attributableTo(b.quote, row.performer, row.character)) continue;   // do not cross performances
    const nq = normalizeText(b.quote);
    const kind = j.transformation_type === "voice-only" && VOICE.test(nq) ? "voice-note"
      : (j.transformation_type === "appears-as-self" || j.transformation_type === "light-makeup") && BARE_FACED.test(nq) ? "bare-faced-note"
      : "makeup-note";
    add(kind, b.page, b.quote, b.establishes);
  }

  const signals = [];
  if (evidence.some((e) => e.kind === "voice-note" && e.verified)) signals.push("voice-only");
  if (evidence.some((e) => e.kind === "bare-faced-note" && e.verified)) signals.push("bare-faced");

  performances[row.duplicate_key] = {
    duplicate_key: row.duplicate_key,
    performer: row.performer, performer_pageid: row.performer_pageid,
    character: row.character, character_page: row.character_page, character_pageid: row.character_pageid,
    species_context: species.map((s) => s.species),
    reader_transformation: j?.transformation || null,   // the reader's raw note, unjudged
    evidence, signals,
    on_wall: row.role_on_wall, wall_ids: row.wall_ids,
  };
}

const allEv = Object.values(performances).flatMap((p) => p.evidence);
const doc = {
  version: 5, production: "Star Trek: Deep Space Nine", captured_at,
  generator: "scripts/ds9-eligibility-adjudicate.mjs",
  note: "Per-performance evidence DOSSIERS. Machines collect, pin, hash and verify; they do not decide eligibility. Species is context only. `signals` (voice-only, bare-faced) are unambiguous hints, not verdicts. Verdicts live only in data/ds9/eligibility-decisions.json. Everything undecided stays review.",
  performance_count: Object.keys(performances).length,
  evidence_items: allEv.length,
  verified_quotes: allEv.filter((e) => e.basis && e.verified).length,
  performances,
};
await writeFile("data/ds9/eligibility-evidence.json", JSON.stringify(doc, null, 1) + "\n");
console.log(`dossiers: ${doc.performance_count}; evidence items: ${doc.evidence_items}; verified quotes: ${doc.verified_quotes}`);
console.log(`signals — voice-only: ${Object.values(performances).filter((p) => p.signals.includes("voice-only")).length}; bare-faced: ${Object.values(performances).filter((p) => p.signals.includes("bare-faced")).length}`);
