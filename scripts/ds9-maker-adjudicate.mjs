#!/usr/bin/env node
/**
 * ds9-maker-adjudicate.mjs — COLLECT, PIN, HASH, VERIFY, and judge APPLICABILITY.
 * Uses the network (pins Memory Alpha pages).
 *
 * Input: data/ds9/maker-judgments.json — the reader fan-out's raw verbatim claims
 *   ({ scope: character|species, key, maker, maker_type, source_page, quote }).
 *
 * Pinning + verifying a quote proves PROVENANCE. It does NOT prove the quote applies
 * to a given DS9 performance. So each pinned item also carries structured
 * APPLICABILITY derived from its own text, and a `substantive` flag that is true for
 * a performance ONLY when applicability matches it:
 *   - production is not another Star Trek production (no TNG/VOY/PIC/film marker);
 *   - the quote names no performer other than this one; and
 *   - the claim is unambiguously about this performance: a character-scoped quote on
 *     a single-performer character, or a quote that names THIS performer.
 * Species-design notes, cross-production quotes, multi-performer-unnamed quotes, and
 * aggregate "her makeup artist" notes stay CONTEXT (substantive:false) — visible to
 * the owner, but unable to alone support a decision. The owner still curates the
 * plural typed credits in data/ds9/maker-decisions.json.
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

// A quote that references any OTHER Star Trek production cannot establish a DS9
// performance's maker. (Conservative: series templates, full series names, films.)
const OTHER_PROD = /\{\{s\|(TNG|VOY|ENT|TOS|PIC)\}\}|the next generation|star trek:?\s*voyager|star trek:?\s*enterprise|the original series|star trek:?\s*picard|\binto darkness\b|\bnemesis\b|\bgenerations\b|first contact|insurrection|the motion picture|the wrath of khan|the search for spock|the voyage home|the final frontier|the undiscovered country|\bkelvin\b/i;
const DS9_SEASON = /DS9 Season (\d+)/i;
// aggregate / group pages collapse many subjects into one roster row; a quote there
// is about one of many, not this performance specifically -> never substantive.
const AGGREGATE = /^Unnamed |(?:personnel|residents|visitors)$|Dabo girls/i;

// character identity -> its performers (character_page when present, else the name)
const charId = (r) => r.character_page || r.character;
const performersByChar = new Map();
for (const r of roster) (performersByChar.get(charId(r)) || performersByChar.set(charId(r), new Set()).get(charId(r))).add(r.performer);
const allPerformers = [...new Set(roster.map((r) => r.performer))];
const lastName = (n) => String(n).trim().split(/\s+/).slice(-1)[0].toLowerCase();

// index claims by scope+key
const charClaims = new Map(), speciesClaims = new Map();
for (const c of claims) {
  if (!c.key || !c.source_page) continue;
  const bucket = c.scope === "species" ? speciesClaims : charClaims;
  (bucket.get(c.key) || bucket.set(c.key, []).get(c.key)).push(c);
}
// character -> [species] from the cited relationship graph
const speciesByChar = new Map();
for (const e of graphEdges) if (e.type === "is_species") {
  const c = e.from.replace("character:", ""), s = e.to.replace("species:", "");
  (speciesByChar.get(c) || speciesByChar.set(c, []).get(c)).push(s);
}

const citedPages = [...new Set(claims.map((c) => c.source_page).filter(Boolean))];
console.log(`pinning ${citedPages.length} cited page(s)...`);
const pins = await pinPages(citedPages, { contact });

// derive applicability facets from a claim's own quote text
function applicabilityOf(c, characterPerformers, selfPerformer) {
  const q = String(c.quote || "");
  const lc = q.toLowerCase();
  const other_production = OTHER_PROD.test(q);
  const season = (q.match(DS9_SEASON) || [])[1] || null;
  const named_performers = [...characterPerformers].filter((p) => lc.includes(lastName(p)) && lastName(p).length >= 3);
  // a quote that names a DIFFERENT performer (by full name) is about them, not this performance
  const other_performer_named = allPerformers.some((p) => p !== selfPerformer && lc.includes(p.toLowerCase()));
  return { other_production, ds9_season: season, named_performers, other_performer_named };
}

const captured_at = new Date().toISOString();
const performances = {};
for (const row of roster) {
  const evidence = [];
  const performers = performersByChar.get(charId(row)) || new Set([row.performer]);
  const add = (c, scope) => {
    const pin = pins.get(c.source_page);
    const verified = pin && !pin.missing && c.quote ? verifyBasis(c.quote, pin.wikitext) : false;
    const appl = applicabilityOf(c, scope === "character" ? performers : new Set(), row.performer);
    // SUBSTANTIVE for THIS performance? Provenance + applicability match.
    let substantive = false;
    if (verified && c.maker && c.maker_type && !appl.other_production && !appl.other_performer_named
        && scope === "character" && !AGGREGATE.test(row.character || "") && !AGGREGATE.test(row.character_page || "")) {
      if (appl.named_performers.length > 0) substantive = appl.named_performers.includes(row.performer);
      else substantive = performers.size === 1;             // single-performer named character, unambiguous
      // multi-performer-unnamed, aggregate, cross-production, and cross-performer quotes stay context;
      // species-scoped quotes describe a species design, not a performance's maker -> context
    }
    const item = {
      kind: "maker-note", scope, maker: c.maker, maker_type: c.maker_type,
      page: pin?.title || c.source_page, source: pin?.url || null,
      revision: pin?.revision ?? null, content_sha256: pin?.content_sha256 ?? null,
      basis: c.quote, establishes: `maker: ${c.maker} (${c.maker_type})`,
      verified, applicability: appl, substantive,
    };
    evidence.push({ id: evidenceId(row.duplicate_key, item), ...item });
  };
  for (const c of charClaims.get(row.character_page) || []) add(c, "character");
  const species = speciesByChar.get(charId(row)) || [];
  for (const s of species) for (const c of speciesClaims.get(s) || []) add(c, "species");

  const substantiveCredits = [];
  const seen = new Set();
  for (const e of evidence) if (e.substantive) { const k = e.maker + "|" + e.maker_type; if (!seen.has(k)) { seen.add(k); substantiveCredits.push({ maker: e.maker, maker_type: e.maker_type }); } }
  performances[row.duplicate_key] = {
    duplicate_key: row.duplicate_key,
    performer: row.performer, performer_pageid: row.performer_pageid,
    character: row.character, character_page: row.character_page, character_pageid: row.character_pageid,
    performer_count: performers.size, species_context: species,
    substantive_credits: substantiveCredits,       // typed hints the owner may ratify; NOT verdicts
    context_makers: [...new Set(evidence.filter((e) => e.verified && !e.substantive).map((e) => e.maker))],
    evidence,
    on_wall: row.role_on_wall, wall_ids: row.wall_ids,
  };
}

const allEv = Object.values(performances).flatMap((p) => p.evidence);
const doc = {
  version: 2, production: "Star Trek: Deep Space Nine", captured_at,
  generator: "scripts/ds9-maker-adjudicate.mjs",
  note: "Per-performance MAKER dossiers. A pinned quote is provenance; the `substantive` flag adds applicability (DS9, no other-production marker, single-performer-character or performer-named). Only substantive items can support an owner decision; species-design, cross-production, and multi-performer-unnamed quotes stay context. Plural typed credits live only in data/ds9/maker-decisions.json.",
  performance_count: Object.keys(performances).length,
  evidence_items: allEv.length,
  verified_quotes: allEv.filter((e) => e.verified).length,
  substantive_items: allEv.filter((e) => e.substantive).length,
  performances_with_substantive_evidence: Object.values(performances).filter((p) => p.substantive_credits.length > 0).length,
  performances,
};
await writeFile("data/ds9/maker-evidence.json", JSON.stringify(doc, null, 1) + "\n");
console.log(`dossiers: ${doc.performance_count}; evidence items: ${doc.evidence_items}; verified: ${doc.verified_quotes}; substantive: ${doc.substantive_items}`);
console.log(`performances with substantive maker evidence: ${doc.performances_with_substantive_evidence}`);
