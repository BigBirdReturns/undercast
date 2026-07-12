#!/usr/bin/env node
/**
 * media-stage.mjs — stage photographic bytes for the GitHub Releases media store.
 *
 * The site, JSON records, provenance ledger and blanks stay on GitHub Pages. Only
 * photographic bytes move to Releases (Pages soft-caps at ~1GB; Releases allow up to
 * 1,000 assets/release, <2GiB each, with no stated total-size or bandwidth limit).
 *
 * This does NOT upload — it plans. For a batch of images it:
 *   - hashes each file (sha256) and gives it a content-addressed name
 *     `uc-004-still-<sha8>.jpg` (replacing an image = a NEW asset, never a mutation),
 *   - assigns it to an immutable release shard (media-0001, media-0002, … ≤800 each),
 *   - reads its pixel dimensions (dependency-free), byte size, kind and provenance,
 *   - and records all of that in data/media-manifest.json at location:"pending".
 *
 * The manifest is APPEND-ONLY and is the ONLY thing the front end reads — it never
 * knows the release layout, only each image's resolved url + whether it's live.
 * scripts/media-upload.mjs (in CI, with a token) does the actual upload and flips
 * entries to location:"release". Local bytes are left in place — migration is a
 * canary, not a destructive bulk move.
 *
 *   node scripts/media-stage.mjs --canary          # a representative dozen
 *   node scripts/media-stage.mjs --ids UC-004 UC-071
 *   node scripts/media-stage.mjs --all             # everything not yet staged
 */
import { readFile, writeFile } from "node:fs/promises";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

const MANIFEST = "data/media-manifest.json";
const DATA = "data/specimens.json";
const CAP = 800; // assets per release shard — comfortably under GitHub's 1,000 limit

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const extOf = (p) => (p.split(".").pop() || "jpg").toLowerCase();

// owner/repo for the stable release-download URL — from the git remote so forks work.
function repoSlug() {
  if (process.env.MEDIA_REPO) return process.env.MEDIA_REPO;
  try {
    const u = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
    const m = u.match(/github\.com[:/]+([^/]+\/[^/.\s]+)/i);
    if (m) return m[1];
  } catch {}
  return "BigBirdReturns/undercast";
}

// dependency-free pixel dimensions for JPEG + PNG (CI has no image libs).
function imgSize(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) // \x89PNG
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) { // JPEG: walk to the SOF marker
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const m = buf[o + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
      if (m === 0xd8 || m === 0xd9 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
      o += 2 + buf.readUInt16BE(o + 2);
    }
  }
  if (buf.length > 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) // GIF
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  if (buf.length > 30 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") { // WebP
    const cc = buf.toString("latin1", 12, 16);
    if (cc === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (cc === "VP8L") { const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      return { w: 1 + (((b1 & 0x3f) << 8) | b0), h: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) }; }
    if (cc === "VP8X") return { w: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), h: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)) };
  }
  return { w: 0, h: 0 };
}

// ── load state ──
const specimens = JSON.parse(await readFile(DATA, "utf8"));
let manifest;
try { manifest = JSON.parse(await readFile(MANIFEST, "utf8")); }
catch { manifest = { version: 1, repo: repoSlug(), release_capacity: CAP, note: "Append-only media index. Photographic bytes live in GitHub Releases; this maps each image to its immutable release asset. The front end reads url+location only.", assets: {} }; }
if (!manifest.assets) manifest.assets = {};
manifest.repo = manifest.repo || repoSlug();

// every (src, kind, id, side) image reference on the wall
const refs = [];
for (const s of specimens) for (const side of ["still", "portrait"]) {
  const a = s[side];
  if (a && a.src) refs.push({ src: a.src, id: s.id, side, kind: a.kind || side });
}

// ── choose the batch ──
const argv = process.argv.slice(2);
const flag = argv[0];
let want;
if (flag === "--all") {
  want = refs;
} else if (flag === "--ids") {
  const ids = new Set(argv.slice(1).map((x) => x.toUpperCase()));
  want = refs.filter((r) => ids.has(r.id));
} else if (flag === "--canary") {
  // representative: a few of each kind, plus the byte-size extremes
  const present = refs.filter((r) => existsSync(r.src));
  const byKind = (k) => present.filter((r) => r.kind === k);
  const pick = [...byKind("still").slice(0, 4), ...byKind("free").slice(0, 4), ...byKind("copyright").slice(0, 4)];
  const sized = present.map((r) => ({ r, b: readFileSync(r.src).length })).sort((a, b) => a.b - b.b);
  if (sized.length) { pick.push(sized[0].r, sized[sized.length - 1].r); }
  const seen = new Set(); want = pick.filter((r) => !seen.has(r.src) && seen.add(r.src));
} else {
  console.log("usage: node scripts/media-stage.mjs --canary | --ids <UC-id…> | --all");
  process.exit(1);
}

// ── plan: assign content-addressed names + release shards, append-only ──
const perRelease = {};
for (const e of Object.values(manifest.assets)) perRelease[e.release] = (perRelease[e.release] || 0) + 1;
function nextRelease() {
  let n = 1, tag;
  while ((perRelease[(tag = "media-" + String(n).padStart(4, "0"))] || 0) >= CAP) n++;
  perRelease[tag] = (perRelease[tag] || 0) + 1;
  return tag;
}

let added = 0, updated = 0, skipped = 0, missing = 0;
for (const r of want) {
  if (!existsSync(r.src)) { missing++; continue; }
  const buf = readFileSync(r.src);
  const hash = sha256(buf), sha8 = hash.slice(0, 8);
  const prev = manifest.assets[r.src];
  if (prev && prev.sha256 === hash) {                                // already staged, unchanged bytes
    const { w, h } = imgSize(buf);                                   // but refresh dims (parser may have improved)
    if (prev.w !== w || prev.h !== h || prev.bytes !== buf.length) { prev.w = w; prev.h = h; prev.bytes = buf.length; updated++; }
    else skipped++;
    continue;
  }
  const asset = `${r.id.toLowerCase()}-${r.side}-${sha8}.${extOf(r.src)}`;
  const release = prev ? prev.release : nextRelease();               // corrections stay in their shard
  const { w, h } = imgSize(buf);
  manifest.assets[r.src] = {
    id: r.id, side: r.side, kind: r.kind,
    sha256: hash, asset, bytes: buf.length, w, h,
    release, url: `https://github.com/${manifest.repo}/releases/download/${release}/${asset}`,
    location: "pending", // upload flips → "release"; front end serves local until then
    prov: r.id,          // provenance identifier → the SOURCES.json / specimen row
  };
  prev ? updated++ : added++;
}

// prune orphaned entries — a card (or a side) that no longer exists on the wall. Keeps
// the manifest honest and stops the cap accounting from counting dead entries.
const liveSrc = new Set(refs.map((r) => r.src));
let pruned = 0;
for (const src of Object.keys(manifest.assets)) if (!liveSrc.has(src)) { delete manifest.assets[src]; pruned++; }

// stable key order for a clean, reviewable diff
const sorted = {};
for (const k of Object.keys(manifest.assets).sort()) sorted[k] = manifest.assets[k];
manifest.assets = sorted;
await writeFile(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");

const rels = [...new Set(Object.values(manifest.assets).map((e) => e.release))].sort();
console.log(`staged: +${added} new, ${updated} corrected/refreshed, ${skipped} unchanged, ${pruned} pruned, ${missing} missing-locally`);
console.log(`manifest now maps ${Object.keys(manifest.assets).length} image(s) across ${rels.length} release shard(s): ${rels.join(", ")}`);
console.log(`next: upload with a token — node scripts/media-upload.mjs   (or dispatch .github/workflows/media.yml)`);
