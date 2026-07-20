#!/usr/bin/env node
/**
 * mint-census-references.mjs — promote census receipts into claim-level card
 * evidence. NO NETWORK, NO MODEL: every reference minted here is backed by a
 * page the census crawler already read (revision identity retained in
 * data/CENSUS-MANIFEST.json).
 *
 *   node scripts/mint-census-references.mjs           # dry run — report only
 *   node scripts/mint-census-references.mjs --write   # apply to specimens.json
 *
 * A reference is minted only when ALL of:
 *   - the census row is a named character (never the "—" performer-category rows),
 *   - census.mjs matched it to a filed card at performer+role grain (wall_ids),
 *   - the crawl manifest holds a credited observation for that page with durable
 *     revision identity.
 * Existing references win: a card that already cites the same source for the
 * same claim is left untouched. This mints "the source wiki credits performer X
 * for role Y" — nothing more; it never edits prose, transform, or any claim a
 * human filed.
 */
import { readFile, writeFile } from "node:fs/promises";
import { normalizeCensusKey as normalize } from "./census-key.mjs";

const WRITE = process.argv.includes("--write");

const PUBLISHERS = {
  "memory-alpha.fandom.com": "Memory Alpha",
  "muppet.fandom.com": "Muppet Wiki",
  "tardis.fandom.com": "Tardis Data Core",
  "wikizilla.org": "Wikizilla",
  "powerrangers.fandom.com": "RangerWiki",
  "starwars.fandom.com": "Wookieepedia",
  "ultra.fandom.com": "Ultraman Wiki",
};
const publisherOf = (url) => { try { return PUBLISHERS[new URL(url).hostname] || new URL(url).hostname; } catch { return null; } };

const specimens = JSON.parse(await readFile("data/specimens.json", "utf8"));
const coverage = JSON.parse(await readFile("data/CENSUS-COVERAGE.json", "utf8"));
const manifest = JSON.parse(await readFile("data/CENSUS-MANIFEST.json", "utf8"));

// credited observations by franchise|category|title — the receipt that the
// source page, at a recorded revision, carried the performer credit.
const credited = new Map();
for (const row of manifest.observations || []) {
  if (row.disposition !== "credited") continue;
  credited.set([row.franchise, row.category, row.title].map(normalize).join("|"), row);
}

const byId = new Map(specimens.map((s) => [s.id, s]));
const minted = [], skipped = { noReceipt: 0, alreadyCited: 0, unnamed: 0 };
for (const row of coverage) {
  if (!row.role_on_wall || !row.wall_ids?.length) continue;
  if (!row.character || row.character === "—") { skipped.unnamed++; continue; }
  if (!row.source) { skipped.noReceipt++; continue; }
  const receipt = credited.get([row.franchise, row.category, row.character].map(normalize).join("|"));
  if (!receipt) { skipped.noReceipt++; continue; }
  const publisher = publisherOf(row.source);
  for (const id of row.wall_ids) {
    const card = byId.get(id);
    if (!card) continue;
    const exists = (card.references || []).some((r) => r.claim === "performance" && r.source === row.source);
    if (exists) { skipped.alreadyCited++; continue; }
    const voice = row.performance_mode === "voice-animation" ? " (voice)" : "";
    const reference = {
      claim: "performance",
      label: `${row.character} character page credits ${row.performer}${voice}`,
      source: row.source,
      ...(publisher ? { publisher } : {}),
    };
    card.references = [...(card.references || []), reference];
    minted.push({ id, character: row.character, performer: row.performer, source: row.source });
  }
}

console.log(`mint: ${minted.length} references across ${new Set(minted.map((m) => m.id)).size} cards`);
console.log(`skipped: ${skipped.alreadyCited} already cited, ${skipped.noReceipt} without a credited receipt, ${skipped.unnamed} unnamed-category rows`);
const withRefs = specimens.filter((s) => s.references?.length).length;
console.log(`cards with claim evidence after mint: ${withRefs}/${specimens.length}`);
if (!WRITE) { console.log("dry run — pass --write to apply, then rebuild projections (shard, contract) and validate."); process.exit(0); }
await writeFile("data/specimens.json", JSON.stringify(specimens, null, 1) + "\n");
console.log("written: data/specimens.json");
