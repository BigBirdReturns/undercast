#!/usr/bin/env node
/** Mirror canonical card/image fields into the provenance ledger. */
import { readFile, writeFile } from "node:fs/promises";

const specimens = JSON.parse(await readFile("data/specimens.json", "utf8"));
const ledger = JSON.parse(await readFile("data/SOURCES.json", "utf8"));
const specimenById = new Map(specimens.map((record) => [record.id, record]));
const ledgerIds = new Set(ledger.map((row) => row.id));
let changed = 0;
const synchronized = [];
for (const row of ledger) {
  const record = specimenById.get(row.id);
  if (!record) { changed++; continue; }
  for (const field of ["actor", "character", "universe"]) {
    if (row[field] !== record[field]) { row[field] = record[field]; changed++; }
  }
  for (const side of ["still", "portrait"]) {
    const canonical = record[side] || null;
    if (JSON.stringify(row[side] || null) !== JSON.stringify(canonical)) { row[side] = canonical; changed++; }
  }
  synchronized.push(row);
}
for (const record of specimens) if (!ledgerIds.has(record.id)) {
  synchronized.push({
    id: record.id, actor: record.actor, character: record.character, universe: record.universe,
    still: record.still || null, portrait: record.portrait || null,
  });
  changed++;
}
if (process.argv.includes("--check")) {
  if (changed) { console.error(`SOURCES ledger has ${changed} mirrored-field drift(s); run node scripts/sync-sources.mjs`); process.exitCode = 1; }
} else {
  await writeFile("data/SOURCES.json", JSON.stringify(synchronized, null, 2) + "\n");
  console.log(`SOURCES ledger synchronized (${changed} field update(s))`);
}
