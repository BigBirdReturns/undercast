#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const command = args.shift() || "apply";
const CONTROL_PATH = ".github/FERENGI-GOLD-FINAL-STILLS-APPLY.json";
const SPECIMENS_PATH = "data/specimens.json";
const SOURCES_PATH = "data/SOURCES.json";
const MEDIA_PATH = "data/MEDIA-AUDIT.json";
const MEDIA_MANIFEST_PATH = "data/media-manifest.json";
const REVIEW_DIR = "data/review/ferengi-gold";
const RECEIPT_PATH = `${REVIEW_DIR}/final-stills-applied-2026-07-25.json`;
const RESOLUTION_PATH = `${REVIEW_DIR}/final-stills-media-resolution-2026-07-25.json`;
const TRIPTYCH_PATH = `${REVIEW_DIR}/uc-298-triptych-provenance.json`;
const API = "https://memory-alpha.fandom.com/api.php";
const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "bigbirdreturns@proton.me"})`;
const TMP = process.env.TMPDIR ? join(process.env.TMPDIR, "undercast-ferengi-final-stills") : "/tmp/undercast-ferengi-final-stills";

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
function slug(value) { return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function titleKey(value) { return normalize(String(value || "").replace(/^File:/i, "")); }

async function fetchRetry(url, options = {}, label = url) {
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

async function imageInfo(source) {
  const url = `${API}?${new URLSearchParams({ format: "json", origin: "*", action: "query", prop: "imageinfo", iiprop: "url|mime|size|timestamp|sha1", titles: `File:${source.file}` })}`;
  const response = await fetchRetry(url, { headers: { "User-Agent": UA } }, `Memory Alpha file ${source.file}`);
  const payload = await response.json();
  const page = Object.values(payload?.query?.pages || {})[0];
  assert(page && !("missing" in page), `Memory Alpha file is missing: ${source.file}`);
  assert(titleKey(page.title) === titleKey(source.file), `Memory Alpha resolved ${source.file} to unexpected title ${page.title}`);
  const info = page.imageinfo?.[0];
  assert(info?.url, `Memory Alpha file has no original URL: ${source.file}`);
  assert(info.mime === source.mime, `${source.file} MIME drift: ${info.mime} != ${source.mime}`);
  return { page, info };
}

function originalCandidates(source, info) {
  const urls = [];
  const add = (value) => { if (value && !urls.includes(value)) urls.push(value); };
  add(info.url);
  try { const url = new URL(info.url); url.searchParams.set("format", "original"); add(url.href); } catch {}
  add(String(info.url).replace(/\/revision\/latest(?:\?.*)?$/i, ""));
  add(`https://memory-alpha.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(source.file)}`);
  return urls;
}

async function downloadReviewed(source) {
  const { page, info } = await imageInfo(source);
  const failures = [];
  for (const url of originalCandidates(source, info)) {
    try {
      const response = await fetchRetry(url, {
        redirect: "follow",
        headers: { "User-Agent": UA, Referer: source.source_page, Accept: "image/jpeg,image/png;q=0.8,*/*;q=0.1" },
      }, `original bytes for ${source.file}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const mime = signatureMime(bytes);
      if (bytes.length <= 512 || mime !== source.mime) {
        failures.push(`${url} -> ${bytes.length} bytes, ${mime}, ${response.headers.get("content-type") || "unknown"}`);
        continue;
      }
      const digest = sha256(bytes);
      assert(bytes.length === source.bytes, `${source.file} byte count drift: ${bytes.length} != ${source.bytes}`);
      assert(digest === source.sha256, `${source.file} SHA-256 drift: ${digest} != ${source.sha256}`);
      return {
        bytes,
        receipt: {
          subject: source.subject,
          file: source.file,
          source_page: source.source_page,
          mediawiki_pageid: Number(page.pageid),
          mediawiki_title: page.title,
          imageinfo_url: info.url,
          resolved_url: response.url || url,
          original_width: Number(info.width),
          original_height: Number(info.height),
          original_timestamp: info.timestamp || null,
          mediawiki_sha1: info.sha1 || null,
          mime,
          bytes: bytes.length,
          sha256: digest,
          review_note: source.review_note,
        },
      };
    } catch (error) { failures.push(`${url} -> ${error.message}`); }
  }
  throw new Error(`${source.file} produced no reviewed original bytes: ${failures.join(" | ")}`);
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

function imageMagickCommand() {
  if (spawnSync("magick", ["-version"], { stdio: "ignore" }).status === 0) return { command: "magick", prefix: [] };
  if (spawnSync("convert", ["-version"], { stdio: "ignore" }).status === 0) return { command: "convert", prefix: [] };
  throw new Error("ImageMagick is required to build the reviewed UC-298 triptych");
}
function runImageMagick(args, label) {
  const { command, prefix } = imageMagickCommand();
  const result = spawnSync(command, [...prefix, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`${label} failed: ${result.error?.message || result.stderr || result.stdout || `exit ${result.status}`}`);
}
function identifyDimensions(path) {
  const magick = spawnSync("magick", ["identify", "-format", "%wx%h", path], { encoding: "utf8" });
  if (!magick.error && magick.status === 0) return magick.stdout.trim();
  const identify = spawnSync("identify", ["-format", "%wx%h", path], { encoding: "utf8" });
  if (!identify.error && identify.status === 0) return identify.stdout.trim();
  throw new Error(`could not identify composite dimensions: ${magick.stderr || identify.stderr}`);
}

async function buildTriptych(entry, downloaded) {
  await rm(TMP, { recursive: true, force: true });
  await mkdir(TMP, { recursive: true });
  const sourcePaths = [];
  for (const item of downloaded) {
    const path = join(TMP, `${slug(item.receipt.subject)}.jpg`);
    await writeFile(path, item.bytes);
    sourcePaths.push(path);
  }
  const tiles = [];
  for (let index = 0; index < sourcePaths.length; index++) {
    const tile = join(TMP, `tile-${index}.jpg`);
    runImageMagick([
      sourcePaths[index], "-auto-orient", "-resize", "580x730", "-background", "black", "-gravity", "center", "-extent", "600x750", "-strip", "-quality", "94", tile,
    ], `build triptych tile ${index + 1}`);
    tiles.push(tile);
  }
  await mkdir(dirname(entry.output), { recursive: true });
  runImageMagick([
    "-size", "1200x1500", "xc:black",
    tiles[0], "-geometry", "+0+0", "-composite",
    tiles[1], "-geometry", "+600+0", "-composite",
    tiles[2], "-geometry", "+300+750", "-composite",
    "-strip", "-quality", "92", entry.output,
  ], "compose UC-298 Bok / Gral / Prak triptych");
  assert(identifyDimensions(entry.output) === "1200x1500", `UC-298 triptych dimensions drifted: ${identifyDimensions(entry.output)}`);
  const bytes = await readFile(entry.output);
  assert(signatureMime(bytes) === "image/jpeg", "UC-298 triptych is not JPEG bytes");
  return { bytes, sha256: sha256(bytes), bytes_length: bytes.length };
}

async function apply() {
  const [control, specimens, sources] = await Promise.all([readJson(CONTROL_PATH), readJson(SPECIMENS_PATH), readJson(SOURCES_PATH)]);
  assert(control.version === 1 && control.scope === "star-trek" && control.species === "ferengi", "final-still authorization scope drift");
  assert(control.reviewed_role === "second-desk", "final-still authorization requires second-desk review");
  assert(Array.isArray(control.entries) && control.entries.length === 4, "final-still authorization must cover four cards");
  const specimenById = new Map(specimens.map((row) => [row.id, row]));
  const sourceById = new Map(sources.map((row) => [row.id, row]));
  const existingHashes = await existingAssetHashes();
  const outputHashes = new Map();
  const applied = [];

  for (const entry of control.entries) {
    const specimen = specimenById.get(entry.id), ledger = sourceById.get(entry.id);
    assert(specimen && ledger, `${entry.id} missing canonical or source row`);
    assert(normalize(specimen.actor) === normalize(entry.actor) && normalize(ledger.actor) === normalize(entry.actor), `${entry.id} actor drift`);
    assert(normalize(specimen.character) === normalize(entry.character) && normalize(ledger.character) === normalize(entry.character), `${entry.id} character drift`);
    assert(!specimen.still && !ledger.still, `${entry.id} already has a still; refusing overwrite`);
    const downloaded = [];
    for (const source of entry.sources) downloaded.push(await downloadReviewed(source));

    let outputBytes, outputHash, outputLength, origin;
    if (entry.mode === "single") {
      assert(downloaded.length === 1, `${entry.id} single mode needs one source`);
      outputBytes = downloaded[0].bytes;
      outputHash = downloaded[0].receipt.sha256;
      outputLength = outputBytes.length;
      origin = downloaded[0].receipt.source_page;
      await mkdir(dirname(entry.output), { recursive: true });
      await writeFile(entry.output, outputBytes);
    } else if (entry.mode === "triptych") {
      assert(downloaded.length === 3, `${entry.id} triptych mode needs three sources`);
      const composite = await buildTriptych(entry, downloaded);
      outputBytes = composite.bytes; outputHash = composite.sha256; outputLength = composite.bytes_length; origin = entry.origin;
      await writeJson(TRIPTYCH_PATH, {
        version: 1,
        record_id: entry.id,
        actor: entry.actor,
        character: entry.character,
        semantics: "Three-source composite used because the canonical card displays three distinct Ferengi roles performed by Lee Arenberg. Each tile is exact-source evidence for one displayed role; no tile is claimed to depict all three.",
        reviewed_by: control.reviewed_by,
        reviewed_role: control.reviewed_role,
        reviewed_at: control.reviewed_at,
        composition: entry.composition,
        output: { path: entry.output, mime: "image/jpeg", bytes: outputLength, sha256: outputHash },
        sources: downloaded.map((item) => item.receipt),
      });
    } else throw new Error(`${entry.id} has unsupported mode ${entry.mode}`);

    const duplicate = existingHashes.get(outputHash) || outputHashes.get(outputHash);
    assert(!duplicate, `${entry.id} output duplicates existing media ${duplicate}`);
    const retained = await readFile(entry.output);
    assert(retained.length === outputLength && sha256(retained) === outputHash, `${entry.id} retained still bytes drift`);
    const image = { src: entry.output, kind: "still", origin, pin: true };
    specimen.still = image; ledger.still = image; ledger.fetched_at = control.reviewed_at.slice(0, 10);
    outputHashes.set(outputHash, entry.output);
    applied.push({
      id: entry.id, actor: entry.actor, character: entry.character, mode: entry.mode,
      output: entry.output, origin, mime: "image/jpeg", bytes: outputLength, sha256: outputHash,
      sources: downloaded.map((item) => item.receipt), composition: entry.composition || null,
      exact_subject_review: {
        identity: "expected", presentation: "character-depiction",
        reviewed_by: control.reviewed_by, reviewed_role: control.reviewed_role,
        reviewed_at: control.reviewed_at,
        note: entry.mode === "triptych"
          ? "The fixed composite visibly includes separate exact depictions of Bok, Gral and Prak, matching every role displayed on the card."
          : entry.sources[0].review_note,
      },
    });
    console.log(`applied ${entry.id} ${entry.mode} still -> ${entry.output} (${outputLength} bytes, ${outputHash})`);
  }

  await writeJson(SPECIMENS_PATH, specimens);
  await writeJson(SOURCES_PATH, sources);
  await writeJson(RECEIPT_PATH, {
    version: 1, scope: control.scope, species: control.species,
    operation: "apply-all-remaining-reviewed-character-stills",
    reviewed_by: control.reviewed_by, reviewed_role: control.reviewed_role,
    reviewed_at: control.reviewed_at, applied_at: new Date().toISOString(),
    authorization_sha256: sha256(await readFile(CONTROL_PATH)), entries: applied,
  });
  console.log(`wrote ${RECEIPT_PATH}`);
}

async function resolution() {
  const [receipt, media] = await Promise.all([readJson(RECEIPT_PATH), readJson(MEDIA_PATH)]);
  const votes = [];
  for (const entry of receipt.entries) {
    const item = (media.items || []).find((row) => row.scope === "star-trek" && row.wall_id === entry.id && row.side === "still");
    assert(item?.asset?.sha256 === entry.sha256, `${entry.id} media-audit item does not bind applied bytes`);
    const sourceEvidence = entry.sources.flatMap((source) => [source.source_page, `sha256:${source.sha256}`]);
    votes.push({
      item_id: item.id, namespace: "identity", value: "expected", enforced: true,
      note: entry.mode === "triptych"
        ? "The composite separately depicts Bok, Gral and Prak, exactly matching the three-role card identity."
        : `The exact character-specific source file depicts ${entry.character}.`,
      evidence: [entry.origin, ...sourceEvidence],
    });
    votes.push({
      item_id: item.id, namespace: "presentation", value: "character-depiction", enforced: true,
      note: entry.mode === "triptych"
        ? "The fixed three-tile composition presents every displayed role without substituting one role for the others."
        : `The reviewed image is a direct character depiction suitable for the ${entry.character} card front.`,
      evidence: [entry.origin, ...entry.sources.map((source) => source.review_note)],
    });
  }
  await writeJson(RESOLUTION_PATH, {
    version: 2, reviewed_by: receipt.reviewed_by, reviewed_role: receipt.reviewed_role,
    reviewed_at: receipt.reviewed_at, votes,
  });
  console.log(`wrote ${RESOLUTION_PATH} with ${votes.length} enforced rulings`);
}

async function validate() {
  const [receipt, specimens, sources, media] = await Promise.all([readJson(RECEIPT_PATH), readJson(SPECIMENS_PATH), readJson(SOURCES_PATH), readJson(MEDIA_PATH)]);
  const specimenById = new Map(specimens.map((row) => [row.id, row]));
  const sourceById = new Map(sources.map((row) => [row.id, row]));
  for (const entry of receipt.entries) {
    const specimen = specimenById.get(entry.id), ledger = sourceById.get(entry.id);
    assert(JSON.stringify(specimen?.still) === JSON.stringify(ledger?.still), `${entry.id} still differs between canonical and source ledger`);
    assert(specimen?.still?.origin === entry.origin && specimen?.still?.pin === true, `${entry.id} provenance or pin drift`);
    const bytes = await readFile(entry.output);
    assert(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `${entry.id} retained output drift`);
    const item = (media.items || []).find((row) => row.scope === "star-trek" && row.wall_id === entry.id && row.side === "still");
    assert(item?.status === "verified", `${entry.id} still is ${item?.status || "missing"}, expected verified`);
    assert(item.asset?.sha256 === entry.sha256, `${entry.id} media-audit hash drift`);
    assert(item.claims?.identity?.value === "expected", `${entry.id} identity ruling drift`);
    assert(item.claims?.presentation?.value === "character-depiction", `${entry.id} presentation ruling drift`);
  }
  const plan = await readJson("data/STAR-TREK-GOLD.json");
  assert(plan.sequence?.find((row) => row.id === "ferengi")?.state === "active", "Ferengi active-species lock changed during final-still transaction");
  console.log(`PASS — ${receipt.entries.length} final Ferengi stills retained and exact-subject verified`);
}

if (command === "apply") await apply();
else if (command === "resolution") await resolution();
else if (command === "validate") await validate();
else throw new Error("unknown command; use apply, resolution, or validate");
