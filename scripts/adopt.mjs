#!/usr/bin/env node
/**
 * adopt.mjs — wire hand-added images into the wall. NO API, NO CRAWL.
 *
 * Drop a photo into images/ named after the card and side, then run this:
 *   images/uc-042-still.jpg      → the in-character STILL (front of card UC-042)
 *   images/uc-042-portrait.jpg   → the actor PORTRAIT   (back of card UC-042)
 * (.jpg/.jpeg/.png/.gif/.webp all fine.)
 *
 *   node scripts/adopt.mjs        # scan images/, attach any new hand-added files
 *
 * It records each into data/specimens.json (so it shows on the wall) and logs it
 * in data/SOURCES.json as a hand-added asset — provenance stays honest. It never
 * overwrites an image a card already has; delete the old entry first to replace.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";

const DATA = "data/specimens.json";
const LEDGER = "data/SOURCES.json";
const IMGDIR = "images";

const specimens = JSON.parse(await readFile(DATA, "utf8"));
let ledger = [];
try { ledger = JSON.parse(await readFile(LEDGER, "utf8")); } catch {}
const byId = new Map(specimens.map((s) => [s.id.toLowerCase(), s]));

const files = await readdir(IMGDIR).catch(() => []);
let added = 0;
for (const f of files) {
  const m = f.match(/^(uc-[a-z0-9]+)-(still|portrait)\.(jpe?g|png|gif|webp)$/i);
  if (!m) continue;
  const s = byId.get(m[1].toLowerCase());
  if (!s) { console.log(`skip ${f}: no card ${m[1].toUpperCase()}`); continue; }
  const side = m[2].toLowerCase();
  if (s[side]) continue; // already has this side — leave it
  s[side] = side === "still"
    ? { src: `${IMGDIR}/${f}`, kind: "still", origin: "hand-added" }
    : { src: `${IMGDIR}/${f}`, kind: "copyright", origin: "hand-added", author: "", license: "" };
  const i = ledger.findIndex((r) => r.id === s.id);
  const row = i >= 0 ? ledger[i] : { id: s.id, actor: s.actor, character: s.character, universe: s.universe, still: null, portrait: null };
  row[side] = s[side];
  row.fetched_at = new Date().toISOString().slice(0, 10);
  if (i >= 0) ledger[i] = row; else ledger.push(row);
  added++;
  console.log(`adopted ${s.id} ${side}: ${f}`);
}

await writeFile(DATA, JSON.stringify(specimens, null, 2) + "\n");
await writeFile(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
console.log(`done: adopted ${added} hand-added image(s). Rebuild credits if you like: node scripts/credits.mjs`);
