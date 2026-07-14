#!/usr/bin/env node
/**
 * ds9-eligibility-adjudicate.mjs — pin + verify the reader-agents' basis quotes.
 * Uses the network (pins Memory Alpha pages).
 *
 * The reader fan-out (workflow ds9-eligibility-quotes) returns, per character, a
 * transformation type and VERBATIM basis quotes. This step:
 *   - pins each quoted page to its revision id + content hash, and
 *   - VERIFIES each quote actually appears in that pinned revision.
 * The output is per performer-character performance, with claim-level provenance.
 * A quote that does not verify is kept but flagged verified:false and never
 * decides a verdict. Silence carries no basis at all -> the engine keeps it review.
 *
 *   CONTACT=you@example.com node scripts/ds9-eligibility-adjudicate.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { pinPages, verifyBasis } from "./lib/adjudicate.mjs";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const judgments = JSON.parse(await readFile("data/ds9/eligibility-judgments.json", "utf8")).judgments;
const graphEdges = JSON.parse(await readFile("data/ds9/graph/edges.json", "utf8")).edges;
const contact = process.env.CONTACT || "ds9-eligibility";

const GROW_QUALIFYING = new Set(["heavy-prosthetics", "mask", "creature-suit", "motion-capture", "voice-only"]);
const speciesByChar = new Map();
for (const e of graphEdges) if (e.type === "is_species") {
  const c = e.from.replace("character:", ""), s = e.to.replace("species:", "");
  (speciesByChar.get(c) || speciesByChar.set(c, []).get(c)).push({ species: s, source: e.source });
}
const judgeByChar = new Map(judgments.map((j) => [j.character, j]));

// every page a quote points at, plus each character page, gets pinned
const quotePages = judgments.flatMap((j) => (j.basis || []).map((b) => b.page)).filter(Boolean);
const characterPages = roster.map((r) => r.character_page).filter(Boolean);
const allPages = [...new Set([...quotePages, ...characterPages])];
console.log(`pinning ${allPages.length} pages...`);
const pins = await pinPages(allPages, { contact });

const captured_at = new Date().toISOString();
const evidence = {};
for (const row of roster) {
  const char = row.character_page || row.character;
  const key = row.performer + "::" + row.character;
  const j = judgeByChar.get(char);
  const species = speciesByChar.get(char) || [];
  const type = j?.transformation_type || "unknown";
  const visible = j ? ({ "true": true, "false": false, "unknown": null }[j.visible_as_self]) : null;
  const claims = species.map((s) => ({ type: "species-membership", page: char, source: s.source, establishes: `character species: ${s.species}`, verified: true }));

  for (const b of j?.basis || []) {
    const pin = pins.get(b.page);
    const claimType = GROW_QUALIFYING.has(type) ? "transformation"
      : (type === "appears-as-self" || type === "light-makeup") ? "appears-as-self" : "other";
    claims.push({
      type: claimType, page: pin?.title || b.page, source: pin?.url || null,
      revision: pin?.revision ?? null, content_sha256: pin?.content_sha256 ?? null,
      basis: b.quote, establishes: b.establishes,
      verified: pin && !pin.missing ? verifyBasis(b.quote, pin.wikitext) : false,
    });
  }

  evidence[key] = {
    performer: row.performer, performer_pageid: row.performer_pageid,
    character: row.character, character_page: row.character_page, character_pageid: row.character_pageid,
    species: species.map((s) => s.species),
    transformation_type: type, visible_as_self: visible, reader_hint: j?.verdict_hint || null,
    claims,
  };
}

const nonSpecies = Object.values(evidence).flatMap((e) => e.claims).filter((c) => c.type !== "species-membership");
const doc = {
  version: 3, production: "Star Trek: Deep Space Nine", captured_at,
  generator: "scripts/ds9-eligibility-adjudicate.mjs",
  note: "Per performer-character PERFORMANCE evidence. Each non-species claim carries a VERBATIM basis quote pinned to a Memory Alpha revision + content hash, with verified=true when that quote is present in the pinned revision. The offline engine decides eligible/ineligible only from verified claims and returns everything else to review. Absence of a makeup note is never treated as evidence.",
  grow_types: [...GROW_QUALIFYING],
  performance_count: Object.keys(evidence).length,
  basis_quotes_total: nonSpecies.length,
  basis_quotes_verified: nonSpecies.filter((c) => c.verified).length,
  basis_quotes_unverified: nonSpecies.filter((c) => !c.verified).length,
  performances: evidence,
};
await writeFile("data/ds9/eligibility-evidence.json", JSON.stringify(doc, null, 1) + "\n");
console.log(`performances: ${doc.performance_count}`);
console.log(`basis quotes: ${doc.basis_quotes_total} (verified ${doc.basis_quotes_verified}, unverified ${doc.basis_quotes_unverified})`);
