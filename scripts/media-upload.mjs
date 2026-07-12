#!/usr/bin/env node
/**
 * media-upload.mjs — push staged media bytes to GitHub Releases, then flip the
 * manifest so the front end serves them. Runs in CI (or locally) with a token.
 *
 * For every data/media-manifest.json entry at location:"pending":
 *   1. ensure its release shard (media-NNNN) exists — create it if not,
 *   2. upload the local file under its content-addressed asset name (idempotent:
 *      an asset that already exists with the right size is left as-is),
 *   3. verify the asset's byte size on the release matches the manifest,
 *   4. flip the entry to location:"release".
 * Local bytes are NOT deleted — this is additive. Freeing Pages space (removing
 * migrated local files) is a deliberate later step, after the store is proven.
 *
 * Auth: GITHUB_TOKEN (or GH_TOKEN). Repo: manifest.repo (owner/name).
 *
 *   GITHUB_TOKEN=… node scripts/media-upload.mjs            # upload all pending
 *   node scripts/media-upload.mjs --dry-run                 # plan only, no network
 */
import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

const MANIFEST = "data/media-manifest.json";
const DRY = process.argv.includes("--dry-run");
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const CT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const slug = manifest.repo;
const pending = Object.entries(manifest.assets).filter(([, e]) => e.location === "pending");
if (!pending.length) { console.log("nothing pending — every staged image is already on a release."); process.exit(0); }

// group pending by release shard
const byRelease = {};
for (const [src, e] of pending) (byRelease[e.release] ||= []).push({ src, e });
console.log(`${pending.length} pending asset(s) across ${Object.keys(byRelease).length} release(s): ${Object.keys(byRelease).sort().join(", ")}`);

if (DRY) {
  for (const [tag, items] of Object.entries(byRelease))
    console.log(`  ${tag}: ${items.map((i) => i.e.asset).join(", ")}`);
  console.log("dry-run: no releases created, no bytes uploaded.");
  process.exit(0);
}
if (!TOKEN) { console.error("no GITHUB_TOKEN / GH_TOKEN — cannot create releases or upload assets."); process.exit(1); }

const API = "https://api.github.com";
const UPLOADS = "https://uploads.github.com";
const gh = (url, opts = {}) => fetch(url, { ...opts, headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(opts.headers || {}) } });

// find or create a release by tag; return {id, assets:[{name,size}]}
async function ensureRelease(tag) {
  let r = await gh(`${API}/repos/${slug}/releases/tags/${encodeURIComponent(tag)}`);
  if (r.status === 404) {
    r = await gh(`${API}/repos/${slug}/releases`, {
      method: "POST",
      body: JSON.stringify({ tag_name: tag, name: `UNDERCAST media ${tag}`, body: "Immutable content-addressed media assets for the UNDERCAST wall. Managed by scripts/media-upload.mjs — do not edit by hand.", make_latest: "false" }),
    });
    if (!r.ok) throw new Error(`create release ${tag}: ${r.status} ${await r.text()}`);
  } else if (!r.ok) {
    throw new Error(`get release ${tag}: ${r.status} ${await r.text()}`);
  }
  const rel = await r.json();
  return { id: rel.id, assets: rel.assets || [] };
}

let uploaded = 0, already = 0, flipped = 0, failed = 0;
for (const [tag, items] of Object.entries(byRelease)) {
  const rel = await ensureRelease(tag);
  const have = new Map(rel.assets.map((a) => [a.name, a]));
  for (const { src, e } of items) {
    try {
      let asset = have.get(e.asset);
      if (asset && asset.size === e.bytes) { already++; }
      else {
        if (asset && asset.size !== e.bytes) { // a partial/corrupt prior upload — delete and redo
          await gh(`${API}/repos/${slug}/releases/assets/${asset.id}`, { method: "DELETE" });
        }
        const ext = e.asset.split(".").pop().toLowerCase();
        const up = await gh(`${UPLOADS}/repos/${slug}/releases/${rel.id}/assets?name=${encodeURIComponent(e.asset)}`, {
          method: "POST",
          headers: { "Content-Type": CT[ext] || "application/octet-stream", "Content-Length": String(e.bytes) },
          body: readFileSync(src),
        });
        if (!up.ok) throw new Error(`upload ${e.asset}: ${up.status} ${await up.text()}`);
        asset = await up.json();
        uploaded++;
      }
      // verify size on the release before trusting it
      if (asset.size !== e.bytes) throw new Error(`size mismatch ${e.asset}: release ${asset.size} vs manifest ${e.bytes}`);
      manifest.assets[src].location = "release";
      flipped++;
    } catch (err) {
      failed++;
      console.error("FAIL", e.asset, "-", err.message);
    }
  }
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
console.log(`uploaded ${uploaded}, already-present ${already}, flipped→release ${flipped}, failed ${failed}`);
if (failed) { console.error("some assets failed — manifest left with those still pending (front end keeps serving them locally)."); process.exit(1); }
console.log("done. commit data/media-manifest.json; migrated images now load from Releases.");
