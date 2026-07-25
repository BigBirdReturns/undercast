#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

const args = process.argv.slice(2);
const command = args.shift() || "apply";
const CONTROL_PATH = ".github/FERENGI-GOLD-STILLS-APPLY.json";
const SPECIMENS_PATH = "data/specimens.json";
const SOURCES_PATH = "data/SOURCES.json";
const MEDIA_PATH = "data/MEDIA-AUDIT.json";
const MEDIA_MANIFEST_PATH = "data/media-manifest.json";
const REVIEW_DIR = "data/review/ferengi-gold";
const RECEIPT_PATH = `${REVIEW_DIR}/five-stills-applied-2026-07-25.json`;
const RESOLUTION_PATH = `${REVIEW_DIR}/five-stills-media-resolution-2026-07-25.json`;
const API = "https://memory-alpha.fandom.com/api.php";
const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "bigbirdreturns@proton.me"})`;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const normalize = (value) => String(value || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, " ").trim().toLowerCase();
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) { if (!condition) throw new Error(message); }
function expectedExtension(mime) { return mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : ""; }
function signatureMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return "unknown";
}
function fileTitle(value) { return `File:${String(value || "").replace(/_/g, " ")}`; }
function titleKey(value) { return normalize(String(value || "").replace(/^File:/i, "")); }

async function fetchWithRetry(url, options = {}, label = url) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      last = error;
      if (attempt < 4) await sleep(attempt * 1200);
    }
  }
  throw new Error(`${label} unavailable after retries: ${last?.message || last}`);
}

async function imageInfo(entry) {
  const url = `${API}?${new URLSearchParams({
    format: "json", origin: "*", action: "query", prop: "imageinfo",
    iiprop: "url|mime|size|timestamp|sha1", titles: fileTitle(entry.file),
  })}`;
  const response = await fetchWithRetry(url, { headers: { "User-Agent": UA } }, `Memory Alpha file ${entry.file}`);
  const payload = await response.json();
  const page = Object.values(payload?.query?.pages || {})[0];
  assert(page && !("missing" in page), `Memory Alpha file is missing: ${entry.file}`);
  assert(titleKey(page.title) === titleKey(entry.file), `Memory Alpha resolved ${entry.file} to unexpected title ${page.title}`);
  const info = page.imageinfo?.[0];
  assert(info?.url, `Memory Alpha file has no original URL: ${entry.file}`);
  assert(info.mime === entry.expected_mime, `${entry.file} MIME drift: ${info.mime} != ${entry.expected_mime}`);
  return { page, info };
}

async function downloadOriginal(entry) {
  const { page, info } = await imageInfo(entry);
  const response = await fetchWithRetry(info.url, {
    headers: { "User-Agent": UA, Referer: entry.source_page },
  }, `original bytes for ${entry.file}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length > 512, `${entry.file} returned implausibly small bytes (${bytes.length})`);
  const mime = signatureMime(bytes);
  assert(mime === entry.expected_mime, `${entry.file} signature is ${mime}, expected ${entry.expected_mime}`);
  const extension = expectedExtension(mime);
  assert(extension === entry.extension, `${entry.file} extension drift: ${extension} != ${entry.extension}`);
  return {
    bytes,
    receipt: {
      mediawiki_pageid: Number(page.pageid),
      mediawiki_title: page.title,
      original_url: info.url,
      original_width: Number(info.width),
      original_height: Number(info.height),
      original_timestamp: info.timestamp || null,
      mediawiki_sha1: info.sha1 || null,
      mime,
      bytes: bytes.length,
      sha256: sha256(bytes),
    },
  };
}

async function existingAssetHashes() {
  const hashes = new Map();
  let manifest = { assets: {} };
  try { manifest = await readJson(MEDIA_MANIFEST_PATH); } catch {}
  for (const [path, row] of Object.entries(manifest.assets || {})) {
    if (/^[0-9a-f]{64}$/i.test(row?.sha256 || "")) hashes.set(row.sha256.toLowerCase(), path);
  }
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
  const [control, specimens, sources] = await Promise.all([
    readJson(CONTROL_PATH), readJson(SPECIMENS_PATH), readJson(SOURCES_PATH),
  ]);
  assert(control.version === 1 && control.scope === "star-trek" && control.species === "ferengi", "five-still authorization scope drift");
  assert(control.reviewed_role === "second-desk", "five-still authorization requires second-desk review");
  assert(Array.isArray(control.entries) && control.entries.length === 5, "five-still authorization must contain exactly five entries");
  const specimensById = new Map(specimens.map((row) => [row.id, row]));
  const sourcesById = new Map(sources.map((row) => [row.id, row]));
  const existingHashes = await existingAssetHashes();
  const applied = [];
  const freshHashes = new Map();

  for (const entry of control.entries) {
    assert(entry.side === "still", `${entry.id} is not a still authorization`);
    assert(/^[0-9a-f]{64}$/i.test(entry.reviewed_candidate_sha256 || ""), `${entry.id} lacks reviewed candidate SHA-256`);
    const specimen = specimensById.get(entry.id);
    const source = sourcesById.get(entry.id);
    assert(specimen && source, `${entry.id} is missing from canonical or source ledger`);
    assert(normalize(specimen.actor) === normalize(entry.actor) && normalize(source.actor) === normalize(entry.actor), `${entry.id} actor identity drift`);
    assert(normalize(specimen.character) === normalize(entry.character) && normalize(source.character) === normalize(entry.character), `${entry.id} character identity drift`);
    assert(!specimen.still && !source.still, `${entry.id} already has a canonical still; refusing overwrite`);

    const { bytes, receipt } = await downloadOriginal(entry);
    const duplicate = existingHashes.get(receipt.sha256) || freshHashes.get(receipt.sha256);
    assert(!duplicate, `${entry.id} original bytes duplicate existing media ${duplicate}`);
    const output = `images/${entry.id.toLowerCase()}-still.${entry.extension}`;
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, bytes);
    const after = await readFile(output);
    assert(after.length === receipt.bytes && sha256(after) === receipt.sha256, `${entry.id} write verification failed`);
    const asset = { src: output, kind: "still", origin: entry.source_page, pin: true };
    specimen.still = asset;
    source.still = asset;
    source.fetched_at = control.reviewed_at.slice(0, 10);
    freshHashes.set(receipt.sha256, output);
    applied.push({
      ...entry,
      output,
      ...receipt,
      exact_subject_review: {
        identity: "expected",
        presentation: "character-depiction",
        reviewed_by: control.reviewed_by,
        reviewed_role: control.reviewed_role,
        reviewed_at: control.reviewed_at,
        note: entry.review_note,
      },
    });
    console.log(`applied ${entry.id} still from ${entry.file} -> ${output} (${receipt.bytes} bytes, ${receipt.sha256})`);
  }

  await writeJson(SPECIMENS_PATH, specimens);
  await writeJson(SOURCES_PATH, sources);
  const receipt = {
    version: 1,
    scope: control.scope,
    species: control.species,
    operation: "apply-five-reviewed-character-stills",
    reviewed_by: control.reviewed_by,
    reviewed_role: control.reviewed_role,
    reviewed_at: control.reviewed_at,
    applied_at: new Date().toISOString(),
    authorization_sha256: sha256(await readFile(CONTROL_PATH)),
    entries: applied,
  };
  await writeJson(RECEIPT_PATH, receipt);
  console.log(`wrote ${RECEIPT_PATH}`);
}

async function resolution() {
  const [receipt, media] = await Promise.all([readJson(RECEIPT_PATH), readJson(MEDIA_PATH)]);
  const votes = [];
  for (const entry of receipt.entries) {
    const item = (media.items || []).find((row) => row.scope === "star-trek" && row.wall_id === entry.id && row.side === "still");
    assert(item?.asset?.sha256 === entry.sha256, `${entry.id} media-audit item does not bind the applied bytes`);
    votes.push({
      item_id: item.id,
      namespace: "identity",
      value: "expected",
      enforced: true,
      note: `Exact Memory Alpha file ${entry.file} depicts the expected subject ${entry.character}.`,
      evidence: [entry.source_page, entry.original_url, `sha256:${entry.sha256}`],
    });
    votes.push({
      item_id: item.id,
      namespace: "presentation",
      value: "character-depiction",
      enforced: true,
      note: `The reviewed image is a direct character depiction suitable for the ${entry.character} card front.`,
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
  const [receipt, specimens, sources, media] = await Promise.all([
    readJson(RECEIPT_PATH), readJson(SPECIMENS_PATH), readJson(SOURCES_PATH), readJson(MEDIA_PATH),
  ]);
  const specimenById = new Map(specimens.map((row) => [row.id, row]));
  const sourceById = new Map(sources.map((row) => [row.id, row]));
  for (const entry of receipt.entries) {
    const specimen = specimenById.get(entry.id);
    const source = sourceById.get(entry.id);
    assert(JSON.stringify(specimen?.still) === JSON.stringify(source?.still), `${entry.id} still differs between canonical and source ledger`);
    assert(specimen?.still?.origin === entry.source_page && specimen?.still?.pin === true, `${entry.id} still provenance or pin drift`);
    const bytes = await readFile(entry.output);
    assert(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `${entry.id} retained bytes drift`);
    const item = (media.items || []).find((row) => row.scope === "star-trek" && row.wall_id === entry.id && row.side === "still");
    assert(item?.status === "verified", `${entry.id} still is ${item?.status || "missing"}, expected verified`);
    assert(item.asset?.sha256 === entry.sha256, `${entry.id} media-audit hash drift`);
    assert(item.claims?.identity?.value === "expected", `${entry.id} identity ruling drift`);
    assert(item.claims?.presentation?.value === "character-depiction", `${entry.id} presentation ruling drift`);
  }
  console.log(`PASS — ${receipt.entries.length} reviewed Ferengi stills retained and exact-subject verified`);
}

if (command === "apply") await apply();
else if (command === "resolution") await resolution();
else if (command === "validate") await validate();
else throw new Error("unknown command; use apply, resolution, or validate");
