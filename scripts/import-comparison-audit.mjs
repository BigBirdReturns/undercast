#!/usr/bin/env node
/** Import an explicit human visual audit into the exact-byte comparison ledger. */
import { readFile, writeFile } from "node:fs/promises";
import { filedImageMeta } from "./image-bytes.mjs";

const paths = process.argv.slice(2).filter(value => !value.startsWith("--"));
if (!paths.length) {
  console.error("usage: node scripts/import-comparison-audit.mjs <audit.json> [...] [--write]");
  process.exit(2);
}

const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const [specimens, manifest, ledger] = await Promise.all([
  readJson("data/specimens.json"),
  readJson("data/media-manifest.json"),
  readJson("data/comparison-reviews.json")
]);
const specimensById = new Map(specimens.map(record => [record.id, record]));
const assets = manifest.assets || {};
const validStatuses = new Set(["approved", "needs-alignment", "needs-source"]);
const imported = new Map();

for (const path of paths) {
  const rows = await readJson(path);
  if (!Array.isArray(rows)) throw new Error(`${path}: expected an array`);
  for (const row of rows) {
    if (!row || typeof row !== "object" || typeof row.id !== "string") throw new Error(`${path}: invalid row`);
    if (imported.has(row.id)) throw new Error(`${row.id}: appears in more than one imported audit`);
    if (!validStatuses.has(row.status)) throw new Error(`${row.id}: invalid status ${row.status}`);
    if (typeof row.note !== "string" || !row.note.trim()) throw new Error(`${row.id}: note is required`);
    const record = specimensById.get(row.id);
    if (!record) throw new Error(`${row.id}: not found in specimens`);
    if (record.kind === "voice" || !record.still?.src || !record.portrait?.src) {
      throw new Error(`${row.id}: not eligible for a visual comparison`);
    }
    const still = await filedImageMeta(record.still.src, assets[record.still.src]);
    const portrait = await filedImageMeta(record.portrait.src, assets[record.portrait.src]);
    if (!still?.sha256 || !portrait?.sha256) throw new Error(`${row.id}: filed media hash missing`);
    imported.set(row.id, {
      id: row.id,
      status: row.status,
      still_sha256: still.sha256,
      portrait_sha256: portrait.sha256,
      note: row.note.trim()
    });
  }
}

const existing = new Map((ledger.reviews || []).map(row => [row.id, row]));
for (const [id, row] of imported) {
  // Preserve a more specific existing note when the same exact pair and status
  // has already received a focused review (for example the Morn calibration).
  const prior = existing.get(id);
  const unchanged = prior && prior.status === row.status &&
    prior.still_sha256 === row.still_sha256 && prior.portrait_sha256 === row.portrait_sha256;
  existing.set(id, unchanged ? prior : row);
}

const numericId = id => Number(id.slice(3));
ledger.reviews = [...existing.values()].sort((a, b) => numericId(a.id) - numericId(b.id));
const counts = {};
for (const row of imported.values()) counts[row.status] = (counts[row.status] || 0) + 1;
console.log(JSON.stringify({imported: imported.size, counts, ledger_reviews: ledger.reviews.length}, null, 2));

if (process.argv.includes("--write")) {
  await writeFile("data/comparison-reviews.json", JSON.stringify(ledger, null, 2) + "\n");
} else {
  console.log("dry run; pass --write to update data/comparison-reviews.json");
}
