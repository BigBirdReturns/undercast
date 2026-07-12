#!/usr/bin/env node
/** Mirror canonical card/image fields into the provenance ledger. */
import { readFile, writeFile } from "node:fs/promises";

const specimens = JSON.parse(await readFile("data/specimens.json", "utf8"));
const ledger = JSON.parse(await readFile("data/SOURCES.json", "utf8"));
const byId = new Map(specimens.map((record) => [record.id, record]));
let changed = 0;
for (const row of ledger) {
  const record = byId.get(row.id);
  if (!record) continue;
  for (const field of ["actor", "character", "universe"]) {
    if (row[field] !== record[field]) { row[field] = record[field]; changed++; }
  }
  for (const side of ["still", "portrait"]) {
    const canonical = record[side] || null;
    if (JSON.stringify(row[side] || null) !== JSON.stringify(canonical)) { row[side] = canonical; changed++; }
  }
}
if (process.argv.includes("--check")) {
  if (changed) { console.error(`SOURCES ledger has ${changed} mirrored-field drift(s); run node scripts/sync-sources.mjs`); process.exitCode = 1; }
} else {
  await writeFile("data/SOURCES.json", JSON.stringify(ledger, null, 2) + "\n");
  console.log(`SOURCES ledger synchronized (${changed} field update(s))`);
}
