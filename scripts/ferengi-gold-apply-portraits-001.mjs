#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

const args = process.argv.slice(2);
const command = args.shift() || "apply";
const CONTROL_PATH = ".github/FERENGI-GOLD-PORTRAIT-TRANCHE-001.json";
const SPECIMENS_PATH = "data/specimens.json";
const SOURCES_PATH = "data/SOURCES.json";
const MEDIA_PATH = "data/MEDIA-AUDIT.json";
const MEDIA_MANIFEST_PATH = "data/media-manifest.json";
const REVIEW_DIR = "data/review/ferengi-gold";
const RECEIPT_PATH = `${REVIEW_DIR}/portrait-tranche-001-applied-2026-07-25.json`;
const RESOLUTION_PATH = `${REVIEW_DIR}/portrait-tranche-001-media-resolution-2026-07-25.json`;
const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "bigbirdreturns@proton.me"})`;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const normalize = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, " ").trim().toLowerCase();
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function signatureMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return "unknown";
}
function extensionFor(mime) { return mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "bin"; }

async function fetchRetry(url, options = {}, label = url) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, { ...options, redirect: "follow", signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      last = error;
      if (attempt < 4) await sleep(attempt * 1200);
    }
  }
  throw new Error(`${label} unavailable after retries: ${last?.message || last}`);
}

async function downloadReviewed(entry) {
  const response = await fetchRetry(entry.asset_url, {
    headers: {
      "User-Agent": UA,
      Referer: entry.source_page,
      Accept: entry.mime === "image/png" ? "image/png,image/jpeg;q=0.7,*/*;q=0.1" : "image/jpeg,image/png;q=0.7,*/*;q=0.1",
    },
  }, `${entry.provider} portrait for ${entry.actor}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const mime = signatureMime(bytes);
  const digest = sha256(bytes);
  assert(mime === entry.mime, `${entry.id} returned ${mime}, expected ${entry.mime}; content-type=${response.headers.get("content-type") || "unknown"}`);
  assert(bytes.length === entry.bytes, `${entry.id} byte count drift: ${bytes.length} != ${entry.bytes}`);
  assert(digest === entry.sha256, `${entry.id} SHA-256 drift: ${digest} != ${entry.sha256}`);
  return { bytes, resolved_url: response.url || entry.asset_url, mime, sha256: digest };
}

async function existingAssetHashes() {
  const hashes = new Map();
  let manifest = { assets: {} };
  try { manifest = await readJson(MEDIA_MANIFEST_PATH); } catch {}
  for (const [path, row] of Object.entries(manifest.assets || {})) if (/^[0-9a-f]{64}$/i.test(row?.sha256 || "")) hashes.set(row.sha256.toLowerCase(), path);
  try {
    for (const name of await readdir("images")) {
      const path = join("images", name);
      if (!/\.(?:jpe?g|png|webp)$/i.test(extname(path))) continue;
      try { const bytes = await readFile(path); if (bytes.length) hashes.set(sha256(bytes), path); } catch {}
    }
  } catch {}
  return hashes;
}

async function apply() {
  const [control, specimens, sources] = await Promise.all([readJson(CONTROL_PATH), readJson(SPECIMENS_PATH), readJson(SOURCES_PATH)]);
  assert(control.version === 1 && control.scope === "star-trek" && control.species === "ferengi", "portrait tranche scope drift");
  assert(control.reviewed_role === "second-desk", "portrait tranche requires second-desk review");
  assert(Array.isArray(control.entries) && control.entries.length === 9, "portrait tranche must contain exactly nine entries");
  const specimenById = new Map(specimens.map((row) => [row.id, row]));
  const sourceById = new Map(sources.map((row) => [row.id, row]));
  const existingHashes = await existingAssetHashes();
  const freshHashes = new Map();
  const applied = [];

  for (const entry of control.entries) {
    const specimen = specimenById.get(entry.id), ledger = sourceById.get(entry.id);
    assert(specimen && ledger, `${entry.id} missing canonical or source row`);
    assert(normalize(specimen.actor) === normalize(entry.actor) && normalize(ledger.actor) === normalize(entry.actor), `${entry.id} actor identity drift`);
    assert(normalize(specimen.character) === normalize(entry.character) && normalize(ledger.character) === normalize(entry.character), `${entry.id} character identity drift`);
    assert(!specimen.portrait && !ledger.portrait, `${entry.id} already has a portrait; refusing overwrite`);
    const downloaded = await downloadReviewed(entry);
    const duplicate = existingHashes.get(downloaded.sha256) || freshHashes.get(downloaded.sha256);
    assert(!duplicate, `${entry.id} portrait duplicates existing media ${duplicate}`);
    const output = `images/${entry.id.toLowerCase()}-portrait.${extensionFor(downloaded.mime)}`;
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, downloaded.bytes);
    const retained = await readFile(output);
    assert(retained.length === entry.bytes && sha256(retained) === entry.sha256, `${entry.id} retained portrait bytes drift`);
    const asset = { src: output, kind: "copyright", origin: entry.source_page, author: "", license: "", pin: true };
    specimen.portrait = asset;
    ledger.portrait = asset;
    ledger.fetched_at = control.reviewed_at.slice(0, 10);
    freshHashes.set(entry.sha256, output);
    applied.push({
      ...entry,
      output,
      resolved_url: downloaded.resolved_url,
      exact_subject_review: {
        identity: "expected",
        presentation: "neutral-human",
        reviewed_by: control.reviewed_by,
        reviewed_role: control.reviewed_role,
        reviewed_at: control.reviewed_at,
        note: entry.review_note,
      },
    });
    console.log(`applied ${entry.id} portrait for ${entry.actor} -> ${output} (${entry.bytes} bytes, ${entry.sha256})`);
  }

  await writeJson(SPECIMENS_PATH, specimens);
  await writeJson(SOURCES_PATH, sources);
  await writeJson(RECEIPT_PATH, {
    version: 1,
    scope: control.scope,
    species: control.species,
    operation: "apply-first-nine-reviewed-performer-portraits",
    reviewed_by: control.reviewed_by,
    reviewed_role: control.reviewed_role,
    reviewed_at: control.reviewed_at,
    applied_at: new Date().toISOString(),
    authorization_sha256: sha256(await readFile(CONTROL_PATH)),
    entries: applied,
  });
  console.log(`wrote ${RECEIPT_PATH}`);
}

async function resolution() {
  const [receipt, media] = await Promise.all([readJson(RECEIPT_PATH), readJson(MEDIA_PATH)]);
  const votes = [];
  for (const entry of receipt.entries) {
    const item = (media.items || []).find((row) => row.scope === "star-trek" && row.wall_id === entry.id && row.side === "portrait");
    assert(item?.asset?.sha256 === entry.sha256, `${entry.id} media-audit item does not bind the applied portrait bytes`);
    votes.push({
      item_id: item.id,
      namespace: "identity",
      value: "expected",
      enforced: true,
      note: `${entry.provider} exact-name person record and visual review identify the expected performer ${entry.actor}.`,
      evidence: [entry.source_page, entry.asset_url, `sha256:${entry.sha256}`],
    });
    votes.push({
      item_id: item.id,
      namespace: "presentation",
      value: "neutral-human",
      enforced: true,
      note: `The reviewed image presents ${entry.actor} unmasked as a single identifiable person rather than a role depiction, group, or non-person image.`,
      evidence: [entry.source_page, entry.review_note],
    });
  }
  await writeJson(RESOLUTION_PATH, {
    version: 2,
    reviewed_by: receipt.reviewed_by,
    reviewed_role: receipt.reviewed_role,
    reviewed_at: receipt.reviewed_at,
    votes,
  });
  console.log(`wrote ${RESOLUTION_PATH} with ${votes.length} enforced rulings`);
}

async function validate() {
  const [receipt, specimens, sources, media] = await Promise.all([readJson(RECEIPT_PATH), readJson(SPECIMENS_PATH), readJson(SOURCES_PATH), readJson(MEDIA_PATH)]);
  const specimenById = new Map(specimens.map((row) => [row.id, row]));
  const sourceById = new Map(sources.map((row) => [row.id, row]));
  for (const entry of receipt.entries) {
    const specimen = specimenById.get(entry.id), ledger = sourceById.get(entry.id);
    assert(JSON.stringify(specimen?.portrait) === JSON.stringify(ledger?.portrait), `${entry.id} portrait differs between canonical and source ledger`);
    assert(specimen?.portrait?.origin === entry.source_page && specimen?.portrait?.pin === true, `${entry.id} portrait provenance or pin drift`);
    const bytes = await readFile(entry.output);
    assert(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `${entry.id} retained portrait drift`);
    const item = (media.items || []).find((row) => row.scope === "star-trek" && row.wall_id === entry.id && row.side === "portrait");
    assert(item?.status === "verified", `${entry.id} portrait is ${item?.status || "missing"}, expected verified`);
    assert(item.asset?.sha256 === entry.sha256, `${entry.id} media-audit hash drift`);
    assert(item.claims?.identity?.value === "expected", `${entry.id} identity ruling drift`);
    assert(item.claims?.presentation?.value === "neutral-human", `${entry.id} presentation ruling drift`);
  }
  const plan = await readJson("data/STAR-TREK-GOLD.json");
  assert(plan.sequence?.find((row) => row.id === "ferengi")?.state === "active", "Ferengi active-species lock changed during portrait transaction");
  console.log(`PASS — ${receipt.entries.length} Ferengi performer portraits retained and exact-subject verified`);
}

if (command === "apply") await apply();
else if (command === "resolution") await resolution();
else if (command === "validate") await validate();
else throw new Error("unknown command; use apply, resolution, or validate");
