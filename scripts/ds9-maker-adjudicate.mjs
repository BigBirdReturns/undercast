#!/usr/bin/env node
/**
 * ds9-maker-adjudicate.mjs — COLLECT, PIN, HASH, VERIFY maker attributions.
 * Uses the network (pins Memory Alpha pages).
 *
 * Input: data/ds9/maker-judgments.json — the reader fan-out's raw claims. Each is a
 *   verbatim quote copied from a Memory Alpha page, scoped either to a character or
 *   to a species:
 *     { scope: "character", key: <character_page>, maker, maker_type, source_page, quote }
 *     { scope: "species",   key: <species>,        maker, maker_type, source_page, quote }
 *
 * This machine builds a per-performance maker DOSSIER. It does not decide the
 * canonical maker and it never invents one.
 *   - a character-scoped maker attaches to every performance of that character;
 *   - a species-scoped maker (e.g. "the Cardassian makeup was designed by …")
 *     attaches to every performance of every character of that species.
 * Both are correct character-scoped sharing — one makeup design, many performers —
 * not eligibility's forbidden per-performer leakage. The curated canonical maker
 * lives only in data/ds9/maker-decisions.json.
 *
 *   CONTACT=you@example.com node scripts/ds9-maker-adjudicate.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { pinPages, verifyBasis } from "./lib/adjudicate.mjs";
import { evidenceId } from "./lib/maker.mjs";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const claims = JSON.parse(await readFile("data/ds9/maker-judgments.json", "utf8")).claims || [];
const graphEdges = JSON.parse(await readFile("data/ds9/graph/edges.json", "utf8")).edges;
const contact = process.env.CONTACT || "ds9-maker-attribution";

// character -> [species] (from the cited relationship graph)
const speciesByChar = new Map();
for (const e of graphEdges) if (e.type === "is_species") {
  const c = e.from.replace("character:", ""), s = e.to.replace("species:", "");
  (speciesByChar.get(c) || speciesByChar.set(c, []).get(c)).push(s);
}

const charClaims = new Map();     // character_page -> claims[]
const speciesClaims = new Map();  // species        -> claims[]
for (const c of claims) {
  if (!c.key || !c.source_page) continue;
  const bucket = c.scope === "species" ? speciesClaims : charClaims;
  (bucket.get(c.key) || bucket.set(c.key, []).get(c.key)).push(c);
}

const citedPages = [...new Set(claims.map((c) => c.source_page).filter(Boolean))];
console.log(`pinning ${citedPages.length} cited page(s)...`);
const pins = await pinPages(citedPages, { contact });

const captured_at = new Date().toISOString();
const performances = {};
for (const row of roster) {
  const evidence = [];
  const add = (c, scope) => {
    const pin = pins.get(c.source_page);
    const item = {
      kind: "maker-note", scope, maker: c.maker, maker_type: c.maker_type,
      page: pin?.title || c.source_page, source: pin?.url || null,
      revision: pin?.revision ?? null, content_sha256: pin?.content_sha256 ?? null,
      basis: c.quote, establishes: `maker (${scope}-scoped): ${c.maker} (${c.maker_type})`,
      verified: pin && !pin.missing && c.quote ? verifyBasis(c.quote, pin.wikitext) : false,
    };
    evidence.push({ id: evidenceId(row.duplicate_key, item), ...item });
  };
  for (const c of charClaims.get(row.character_page) || []) add(c, "character");
  const species = speciesByChar.get(row.character_page || row.character) || [];
  for (const s of species) for (const c of speciesClaims.get(s) || []) add(c, "species");

  const makers = [...new Set(evidence.filter((e) => e.verified).map((e) => e.maker))];
  performances[row.duplicate_key] = {
    duplicate_key: row.duplicate_key,
    performer: row.performer, performer_pageid: row.performer_pageid,
    character: row.character, character_page: row.character_page, character_pageid: row.character_pageid,
    species_context: species,
    verified_makers: makers,             // distinct makers with a verified quote (hints, not a verdict)
    evidence,
    on_wall: row.role_on_wall, wall_ids: row.wall_ids,
  };
}

const allEv = Object.values(performances).flatMap((p) => p.evidence);
const doc = {
  version: 1, production: "Star Trek: Deep Space Nine", captured_at,
  generator: "scripts/ds9-maker-adjudicate.mjs",
  note: "Per-performance MAKER dossiers. Machines collect, pin, hash and verify verbatim maker quotes read off Memory Alpha; they do not decide the canonical maker. Makers are character-scoped: a character-page maker attaches to that character's performances, a species-page maker attaches to every performance of that species. The curated canonical maker lives only in data/ds9/maker-decisions.json. Everything undecided stays review.",
  performance_count: Object.keys(performances).length,
  evidence_items: allEv.length,
  verified_quotes: allEv.filter((e) => e.basis && e.verified).length,
  distinct_verified_makers: [...new Set(allEv.filter((e) => e.verified).map((e) => e.maker))].sort(),
  performances,
};
await writeFile("data/ds9/maker-evidence.json", JSON.stringify(doc, null, 1) + "\n");
console.log(`dossiers: ${doc.performance_count}; evidence items: ${doc.evidence_items}; verified quotes: ${doc.verified_quotes}`);
console.log(`distinct verified makers: ${doc.distinct_verified_makers.length}`);
