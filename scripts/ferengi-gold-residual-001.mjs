#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

const args = process.argv.slice(2);
const command = args.shift() || "apply";
const CONTROL_PATH = ".github/FERENGI-GOLD-RESIDUAL-001.json";
const SPECIMENS_PATH = "data/specimens.json";
const SOURCES_PATH = "data/SOURCES.json";
const MEDIA_PATH = "data/MEDIA-AUDIT.json";
const MEDIA_MANIFEST_PATH = "data/media-manifest.json";
const REVIEW_DIR = "data/review/ferengi-gold";
const RECEIPT_PATH = `${REVIEW_DIR}/residual-001-rivkin-applied-2026-07-25.json`;
const RESOLUTION_PATH = `${REVIEW_DIR}/residual-001-rivkin-media-resolution-2026-07-25.json`;
const OUT_DIR = process.env.OUT_DIR || "build/review/ferengi-gold-residual-001";
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
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return "image/gif";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "unknown";
}
function extensionFor(mime) {
  return mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : mime === "image/gif" ? "gif" : mime === "image/webp" ? "webp" : "bin";
}
function safeSlug(value) { return normalize(value).replace(/\s+/g, "-") || "candidate"; }
function htmlDecode(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\\u0026/g, "&").replace(/\\\//g, "/");
}
function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }

async function fetchRetry(url, options = {}, label = url) {
  let last;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(url, { ...options, redirect: "follow", signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      last = error;
      if (attempt < 5) await sleep(attempt * 1500);
    }
  }
  throw new Error(`${label} unavailable after retries: ${last?.message || last}`);
}

async function downloadImage(url, sourcePage, label) {
  const response = await fetchRetry(url, {
    headers: {
      "User-Agent": UA,
      Referer: sourcePage,
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.8",
    },
  }, label);
  const bytes = Buffer.from(await response.arrayBuffer());
  const mime = signatureMime(bytes);
  assert(mime !== "unknown", `${label} returned non-image bytes; content-type=${response.headers.get("content-type") || "unknown"}`);
  assert(bytes.length > 700, `${label} returned implausibly small image bytes (${bytes.length})`);
  return { bytes, mime, sha256: sha256(bytes), resolved_url: response.url || url, content_type: response.headers.get("content-type") || null };
}

async function existingAssetHashes() {
  const hashes = new Map();
  let manifest = { assets: {} };
  try { manifest = await readJson(MEDIA_MANIFEST_PATH); } catch {}
  for (const [path, row] of Object.entries(manifest.assets || {})) if (/^[0-9a-f]{64}$/i.test(row?.sha256 || "")) hashes.set(row.sha256.toLowerCase(), path);
  try {
    for (const name of await readdir("images")) {
      const path = join("images", name);
      if (!/\.(?:jpe?g|png|gif|webp)$/i.test(extname(path))) continue;
      try { const bytes = await readFile(path); if (bytes.length) hashes.set(sha256(bytes), path); } catch {}
    }
  } catch {}
  return hashes;
}

async function apply() {
  const [control, specimens, sources] = await Promise.all([readJson(CONTROL_PATH), readJson(SPECIMENS_PATH), readJson(SOURCES_PATH)]);
  assert(control.version === 1 && control.scope === "star-trek" && control.species === "ferengi", "residual portrait scope drift");
  assert(control.reviewed_role === "second-desk", "residual portrait transaction requires second-desk review");
  assert(Array.isArray(control.apply) && control.apply.length === 1, "residual portrait transaction must apply exactly one reviewed portrait");
  const entry = control.apply[0];
  const specimen = specimens.find((row) => row.id === entry.id);
  const ledger = sources.find((row) => row.id === entry.id);
  assert(specimen && ledger, `${entry.id} missing canonical or source row`);
  assert(normalize(specimen.actor) === normalize(entry.actor) && normalize(ledger.actor) === normalize(entry.actor), `${entry.id} actor identity drift`);
  assert(!specimen.portrait && !ledger.portrait, `${entry.id} already has a portrait; refusing overwrite`);
  const downloaded = await downloadImage(entry.asset_url, entry.source_page, `${entry.provider} portrait for ${entry.actor}`);
  assert(downloaded.mime === entry.mime, `${entry.id} MIME drift: ${downloaded.mime} != ${entry.mime}`);
  assert(downloaded.bytes.length === entry.bytes, `${entry.id} byte-count drift: ${downloaded.bytes.length} != ${entry.bytes}`);
  assert(downloaded.sha256 === entry.sha256, `${entry.id} SHA-256 drift: ${downloaded.sha256} != ${entry.sha256}`);
  const duplicate = (await existingAssetHashes()).get(downloaded.sha256);
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
  await writeJson(SPECIMENS_PATH, specimens);
  await writeJson(SOURCES_PATH, sources);
  await writeJson(RECEIPT_PATH, {
    version: 1,
    scope: control.scope,
    species: control.species,
    operation: "apply-michael-william-rivkin-reviewed-portrait",
    reviewed_by: control.reviewed_by,
    reviewed_role: control.reviewed_role,
    reviewed_at: control.reviewed_at,
    applied_at: new Date().toISOString(),
    authorization_sha256: sha256(await readFile(CONTROL_PATH)),
    entry: { ...entry, character: specimen.character, output, resolved_url: downloaded.resolved_url },
  });
  console.log(`applied ${entry.id} portrait for ${entry.actor} -> ${output}`);
}

function candidateScore(url, context, actor) {
  const hay = `${url} ${context}`.toLowerCase();
  let score = 0;
  for (const token of normalize(actor).split(" ")) if (token.length > 2 && hay.includes(token)) score += 4;
  if (/head[-_ ]?shot|portrait|people|person/.test(hay)) score += 5;
  if (/broadwayworld|bwwstatic|playbill/.test(hay)) score += 2;
  if (/logo|sprite|icon|banner|advert|pixel|quantcast|facebook|twitter|instagram|youtube|playbutton/.test(hay)) score -= 12;
  if (/\.svg(?:\?|$)/i.test(url)) score -= 12;
  return score;
}

function extractPageImageCandidates(html, pageUrl, actor) {
  const rows = new Map();
  const add = (raw, context = "") => {
    const decoded = htmlDecode(raw).trim();
    if (!decoded || decoded.startsWith("data:")) return;
    let url;
    try { url = new URL(decoded, pageUrl).href; } catch { return; }
    if (!/^https:\/\//.test(url)) return;
    if (!/\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(url) && !/(?:image|headshot|photo|people|person)/i.test(url)) return;
    const score = candidateScore(url, context, actor);
    const previous = rows.get(url);
    if (!previous || score > previous.score) rows.set(url, { url, score, context: String(context).replace(/\s+/g, " ").slice(0, 400) });
  };
  for (const match of html.matchAll(/<(?:meta|img|source)[^>]+>/gi)) {
    const tag = match[0];
    for (const attr of tag.matchAll(/(?:content|src|data-src|data-lazy-src|data-original|srcset)\s*=\s*["']([^"']+)["']/gi)) {
      for (const part of attr[1].split(/\s*,\s*/)) add(part.trim().split(/\s+/)[0], tag);
    }
  }
  for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'<>\s]+/gi)) add(match[0], html.slice(Math.max(0, match.index - 180), match.index + match[0].length + 180));
  return [...rows.values()].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url)).slice(0, 30);
}

async function gather() {
  const control = await readJson(CONTROL_PATH);
  assert(Array.isArray(control.gather) && control.gather.length === 2, "residual gather must cover Peter Slutsker and Michael Snyder");
  await mkdir(join(OUT_DIR, "candidates"), { recursive: true });
  const manifest = {
    version: 1,
    scope: control.scope,
    species: control.species,
    generated_at: new Date().toISOString(),
    semantics: "Candidate-only harvest. Download success is not visual approval and may not mutate canonical media.",
    authorization_sha256: sha256(await readFile(CONTROL_PATH)),
    entries: [],
  };
  const seenHashes = new Set();
  for (const target of control.gather) {
    const urls = [];
    for (const direct of target.asset_urls || []) urls.push({ ...direct, score: 100, context: target.note });
    if (!urls.length) {
      const response = await fetchRetry(target.source_page, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.8" } }, `${target.provider} page for ${target.actor}`);
      const html = await response.text();
      await writeFile(join(OUT_DIR, `${safeSlug(target.actor)}-source.html`), html);
      urls.push(...extractPageImageCandidates(html, response.url || target.source_page, target.actor));
    }
    const entry = { actor: target.actor, aliases: target.aliases || [], cards: target.cards, provider: target.provider, source_page: target.source_page, note: target.note, candidates: [], errors: [] };
    let ordinal = 0;
    for (const candidate of urls.slice(0, 30)) {
      ordinal++;
      try {
        const downloaded = await downloadImage(candidate.url, target.source_page, `${target.actor} candidate ${ordinal}`);
        if (seenHashes.has(downloaded.sha256)) continue;
        seenHashes.add(downloaded.sha256);
        const extension = extensionFor(downloaded.mime);
        const file = `${safeSlug(target.actor)}-${String(entry.candidates.length + 1).padStart(2, "0")}.${extension}`;
        await writeFile(join(OUT_DIR, "candidates", file), downloaded.bytes);
        entry.candidates.push({
          label: candidate.label || `${target.actor} candidate ${ordinal}`,
          requested_url: candidate.url,
          resolved_url: downloaded.resolved_url,
          local: `candidates/${file}`,
          mime: downloaded.mime,
          bytes: downloaded.bytes.length,
          sha256: downloaded.sha256,
          score: candidate.score ?? null,
          context: candidate.context || "",
        });
      } catch (error) {
        entry.errors.push({ url: candidate.url, error: error.message });
      }
    }
    manifest.entries.push(entry);
    console.log(`gathered ${entry.candidates.length} unique ${target.actor} candidate(s); errors=${entry.errors.length}`);
  }
  await writeJson(join(OUT_DIR, "manifest.json"), manifest);
  const cards = manifest.entries.flatMap((entry) => entry.candidates.map((candidate) => `<article><img src="${escapeHtml(candidate.local)}" alt=""><h2>${escapeHtml(entry.actor)}</h2><p>${escapeHtml(candidate.label)}</p><p><code>${escapeHtml(candidate.sha256)}</code></p><p>${escapeHtml(candidate.requested_url)}</p></article>`)).join("\n");
  const html = `<!doctype html><meta charset="utf-8"><title>Ferengi residual portrait review</title><style>body{font:14px system-ui;margin:24px;background:#eee}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}article{background:white;padding:12px;border:1px solid #bbb}img{width:100%;height:320px;object-fit:contain;background:#222}code{font-size:10px;word-break:break-all}p{word-break:break-word}</style><h1>Ferengi residual portrait candidates</h1><p>Candidate-only harvest. Identity and neutral-human presentation require visual review before canonical use.</p><main>${cards}</main>`;
  await writeFile(join(OUT_DIR, "sheet.html"), html);
  console.log(`wrote ${OUT_DIR}/manifest.json and review sheet`);
}

async function resolution() {
  const [receipt, media] = await Promise.all([readJson(RECEIPT_PATH), readJson(MEDIA_PATH)]);
  const entry = receipt.entry;
  const item = (media.items || []).find((row) => row.scope === "star-trek" && row.wall_id === entry.id && row.side === "portrait");
  assert(item?.asset?.sha256 === entry.sha256, `${entry.id} media-audit item does not bind the applied portrait bytes`);
  await writeJson(RESOLUTION_PATH, {
    version: 2,
    reviewed_by: receipt.reviewed_by,
    reviewed_role: receipt.reviewed_role,
    reviewed_at: receipt.reviewed_at,
    votes: [
      {
        item_id: item.id,
        namespace: "identity",
        value: "expected",
        enforced: true,
        note: `IMDb exact-name identity nm0729699 and visual review identify the expected performer ${entry.actor}.`,
        evidence: [entry.source_page, entry.asset_url, `sha256:${entry.sha256}`],
      },
      {
        item_id: item.id,
        namespace: "presentation",
        value: "neutral-human",
        enforced: true,
        note: `The reviewed image presents ${entry.actor} unmasked as a single identifiable person rather than a role depiction, group, or non-person image.`,
        evidence: [entry.source_page, entry.review_note],
      },
    ],
  });
  console.log(`wrote ${RESOLUTION_PATH}`);
}

async function validate() {
  const [receipt, specimens, sources, media, plan] = await Promise.all([readJson(RECEIPT_PATH), readJson(SPECIMENS_PATH), readJson(SOURCES_PATH), readJson(MEDIA_PATH), readJson("data/STAR-TREK-GOLD.json")]);
  const entry = receipt.entry;
  const specimen = specimens.find((row) => row.id === entry.id), ledger = sources.find((row) => row.id === entry.id);
  assert(JSON.stringify(specimen?.portrait) === JSON.stringify(ledger?.portrait), `${entry.id} portrait differs between canonical and source ledger`);
  assert(specimen?.portrait?.origin === entry.source_page && specimen?.portrait?.pin === true, `${entry.id} portrait provenance or pin drift`);
  const bytes = await readFile(entry.output);
  assert(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `${entry.id} retained portrait drift`);
  const item = (media.items || []).find((row) => row.scope === "star-trek" && row.wall_id === entry.id && row.side === "portrait");
  assert(item?.status === "verified", `${entry.id} portrait is ${item?.status || "missing"}, expected verified`);
  assert(item.asset?.sha256 === entry.sha256, `${entry.id} media-audit hash drift`);
  assert(plan.sequence?.find((row) => row.id === "ferengi")?.state === "active", "Ferengi active-species lock changed during residual transaction");
  console.log(`PASS — ${entry.id} ${entry.actor} portrait retained and exact-subject verified`);
}

if (command === "apply") await apply();
else if (command === "gather") await gather();
else if (command === "resolution") await resolution();
else if (command === "validate") await validate();
else throw new Error("unknown command; use apply, gather, resolution, or validate");
