#!/usr/bin/env node
/** Build/check the exact-byte visual-comparison review queue. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { filedImageMeta } from "./image-bytes.mjs";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const specimensBody = await readFile("data/specimens.json", "utf8");
const reviewsBody = await readFile("data/comparison-reviews.json", "utf8");
const specimens = JSON.parse(specimensBody);
const ledger = JSON.parse(reviewsBody);
const media = await readJson("data/media-manifest.json");
const mediaBySrc = media.assets || {};
const imageSources = [...new Set(specimens.flatMap(record => [record.still?.src, record.portrait?.src]).filter(Boolean))];
const filedMeta = new Map(await Promise.all(imageSources.map(async src => [src, await filedImageMeta(src, mediaBySrc[src])])));
const recordById = new Map(specimens.map(record => [record.id, record]));
const reviewById = new Map();

for (const review of ledger.reviews || []) {
  if (reviewById.has(review.id)) throw new Error(`duplicate comparison review ${review.id}`);
  if (!recordById.has(review.id)) throw new Error(`comparison review ${review.id} has no canonical record`);
  reviewById.set(review.id, review);
}

const imageMeta = image => {
  const entry = image?.src ? filedMeta.get(image.src) : null;
  return image?.src ? {
    src: image.src,
    sha256: entry?.sha256 || null,
    width: entry?.width || null,
    height: entry?.height || null,
    focus: image.focus || null,
    comparison: image.comparison || null
  } : null;
};

const rows = specimens
  .filter(record => record.kind !== "voice" && record.still?.src && record.portrait?.src)
  .map(record => {
    const still = imageMeta(record.still), portrait = imageMeta(record.portrait);
    const review = reviewById.get(record.id);
    let status = "pending", note = "Exact image pair has not received a visual split-face review.";
    if (review) {
      const current = review.still_sha256 === still.sha256 && review.portrait_sha256 === portrait.sha256;
      status = current ? review.status : "stale";
      note = current ? review.note : "A reviewed source image changed; this pair must be inspected again.";
    }
    return {id: record.id, character: record.character, actor: record.actor, production: record.production, status, note, still, portrait};
  });

const statuses = ["approved", "needs-alignment", "needs-source", "pending", "stale"];
const summary = {eligible_pairs: rows.length};
for (const status of statuses) summary[status.replaceAll("-", "_")] = rows.filter(row => row.status === status).length;
const queue = {
  version: 1,
  schema: "schema/comparison-queue.schema.json",
  generated_from: {
    specimens_sha256: sha256(specimensBody.replace(/\r\n/g, "\n")),
    reviews_sha256: sha256(reviewsBody.replace(/\r\n/g, "\n")),
    media_manifest_version: media.version
  },
  policy: ledger.policy,
  summary,
  rows
};
const body = JSON.stringify(queue, null, 1) + "\n";

if (process.argv.includes("--check")) {
  const current = await readFile("data/comparison-queue.json", "utf8").catch(() => "");
  if (current !== body) {
    console.error("comparison review queue is stale; run node scripts/comparison-review.mjs --write");
    process.exitCode = 1;
  } else console.log(`comparison review queue: PASS (${rows.length} eligible pairs; ${summary.approved} approved; ${summary.pending} pending; ${summary.stale} stale)`);
} else if (process.argv.includes("--write")) {
  await writeFile("data/comparison-queue.json", body);
  console.log(`built comparison review queue: ${rows.length} eligible; ${summary.approved} approved; ${summary.needs_alignment} align; ${summary.needs_source} source; ${summary.pending} pending; ${summary.stale} stale`);
} else {
  console.log(JSON.stringify(summary, null, 2));
}
