#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} requires a value`);
  return value;
};
const CONTROL_PATH = ".github/FERENGI-GOLD-PORTRAIT-DEEP-001.json";
const OUT = option("out", process.env.OUT || "/tmp/ferengi-gold-portrait-deep");
const UA = `Mozilla/5.0 (compatible; undercast/0.1; +https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "bigbirdreturns@proton.me"})`;
const IMDB_GRAPHQL_ENDPOINTS = ["https://api.graphql.imdb.com/", "https://caching.graphql.imdb.com/"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); };
const normalize = (value) => String(value || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, " ").trim().toLowerCase();
const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const safeSlug = (value) => normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";

function signatureMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "image/gif";
  return "unknown";
}
function extensionFor(mime) { return mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "bin"; }
function sourceHost(value) { try { return new URL(value).hostname.toLowerCase(); } catch { return ""; } }
function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/").replace(/\\u0026/g, "&");
}
function aliasesFor(actor) { return new Set((actor.aliases || [actor.actor]).map(normalize).filter(Boolean)); }
function exactAlias(actor, value) { return aliasesFor(actor).has(normalize(value)); }

let lastRequest = 0;
async function fetchRetry(url, options = {}, label = url, { attempts = 3, quiet = false } = {}) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const wait = Math.max(0, 120 - (Date.now() - lastRequest));
      if (wait) await sleep(wait);
      lastRequest = Date.now();
      const response = await fetch(url, { ...options, redirect: "follow", signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      last = error;
      if (attempt < attempts) await sleep(attempt * 800);
    }
  }
  if (quiet) return null;
  throw new Error(`${label} unavailable after retries: ${last?.message || last}`);
}
async function fetchText(url, config = {}) {
  const response = await fetchRetry(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.2", ...(config.headers || {}) },
  }, config.label || url, { quiet: config.quiet === true, attempts: config.attempts || 3 });
  if (!response) return null;
  return { body: await response.text(), url: response.url || url, contentType: response.headers.get("content-type") || "" };
}
async function fetchJson(url, config = {}) {
  const response = await fetchRetry(url, {
    method: config.method || "GET",
    headers: { "User-Agent": UA, Accept: "application/json", ...(config.headers || {}) },
    body: config.body,
  }, config.label || url, { quiet: config.quiet === true, attempts: config.attempts || 3 });
  if (!response) return null;
  try { return await response.json(); }
  catch (error) { if (config.quiet) return null; throw new Error(`${config.label || url} returned invalid JSON: ${error.message}`); }
}

function contextScore(actor, text) {
  const hay = normalize(text);
  return (actor.context_terms || []).reduce((score, term) => score + (hay.includes(normalize(term)) ? 1 : 0), 0);
}
async function resolveImdbIds(actor) {
  const ids = new Set(actor.imdb_ids || []);
  const receipts = [];
  for (const alias of actor.aliases || [actor.actor]) {
    for (const endpoint of [
      `https://v2.sg.media-imdb.com/suggestion/x/${encodeURIComponent(alias)}.json`,
      `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(alias)}.json`,
    ]) {
      const payload = await fetchJson(endpoint, { quiet: true, label: `IMDb suggestion for ${alias}` });
      for (const row of payload?.d || []) {
        if (!/^nm\d+$/.test(row.id || "") || !exactAlias(actor, row.l)) continue;
        ids.add(row.id);
        receipts.push({ alias, id: row.id, name: row.l, known_for: row.s || "", image: row.i?.imageUrl || row.i?.url || null, endpoint });
      }
      if (payload?.d) break;
    }
  }
  return { ids: [...ids], receipts };
}

function collectImageObjects(value, path = [], rows = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectImageObjects(item, [...path, index], rows));
    return rows;
  }
  if (!value || typeof value !== "object") return rows;
  const url = value.url || value.imageUrl || value.contentUrl || value.src;
  if (typeof url === "string" && /^https?:\/\//i.test(url) && /(?:m\.media-amazon\.com|media-amazon\.com|imdb-media)/i.test(url)) {
    rows.push({ id: value.id || null, url: decodeHtml(url), width: Number(value.width || value.w || 0) || null, height: Number(value.height || value.h || 0) || null, path: path.join(".") });
  }
  for (const [key, child] of Object.entries(value)) collectImageObjects(child, [...path, key], rows);
  return rows;
}

async function imdbGraphqlImages(actor, imdbId) {
  const queries = [
    {
      label: "name.images",
      query: `query UnderCastNameImages($id: ID!, $first: Int!) { name(id: $id) { id nameText { text } primaryImage { id url width height } images(first: $first) { total edges { node { id url width height } } } } }`,
    },
    {
      label: "name.imageTypes",
      query: `query UnderCastNameImageTypes($id: ID!) { name(id: $id) { id nameText { text } primaryImage { id url width height } imageTypes { imageType { imageTypeId text } images { edges { node { id url width height } } } } } }`,
    },
  ];
  const candidates = [];
  const attempts = [];
  for (const endpoint of IMDB_GRAPHQL_ENDPOINTS) {
    for (const item of queries) {
      const payload = await fetchJson(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://www.imdb.com",
          "Referer": `https://www.imdb.com/name/${imdbId}/mediaindex/`,
          "x-imdb-client-name": "imdb-web-next",
          "x-imdb-client-version": "1.0.0",
          "x-imdb-user-language": "en-US",
          "x-imdb-user-country": "US",
        },
        body: JSON.stringify({ query: item.query, variables: { id: imdbId, first: 60 } }),
        quiet: true,
        label: `IMDb GraphQL ${item.label} for ${imdbId}`,
      });
      attempts.push({ endpoint, query: item.label, errors: payload?.errors || null, returned_data: Boolean(payload?.data) });
      if (!payload?.data) continue;
      const nameText = payload.data?.name?.nameText?.text || "";
      if (nameText && !exactAlias(actor, nameText)) {
        attempts.push({ endpoint, query: item.label, rejected_name: nameText });
        continue;
      }
      for (const row of collectImageObjects(payload.data)) {
        candidates.push({
          provider: "IMDb GraphQL",
          provider_rank: 0,
          exact_identity: true,
          imdb_id: imdbId,
          image_id: row.id || "",
          label: `${actor.actor} — IMDb image ${row.id || "candidate"}`,
          source_page: row.id ? `https://www.imdb.com/name/${imdbId}/mediaviewer/${row.id}/` : `https://www.imdb.com/name/${imdbId}/mediaindex/`,
          url: row.url,
          thumbnail_url: row.url,
          width: row.width,
          height: row.height,
          note: `IMDb GraphQL image attached to exact name identity ${imdbId}; visual review must confirm neutral unmasked portrait presentation.`,
        });
      }
    }
  }
  return { candidates, attempts };
}

function imageUrlsFromHtml(html) {
  const urls = [];
  const add = (value) => {
    value = decodeHtml(value);
    if (!/^https?:\/\//i.test(value)) return;
    if (!/\.(?:jpe?g|png|webp|gif)(?:[?._-]|$)/i.test(value) && !/(?:m\.media-amazon\.com|media-amazon\.com\/images)/i.test(value)) return;
    if (!urls.includes(value)) urls.push(value);
  };
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]+content=["']([^"']+)["']/ig,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["']/ig,
    /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/ig,
    /(?:srcset|data-srcset)=["']([^"']+)["']/ig,
    /"(?:imageUrl|contentUrl|image|url|src)"\s*:\s*"(https?:\\?\/\\?\/[^"\\]+(?:\\.[^"\\]+)*)"/ig,
    /(https?:\\?\/\\?\/(?:m\.)?media-amazon\.com\/images\/M\/[^"'<>\s\\]+)/ig,
  ];
  for (const [index, pattern] of patterns.entries()) {
    for (const match of html.matchAll(pattern)) {
      if (index === 3) {
        for (const part of match[1].split(",")) add(part.trim().split(/\s+/)[0]);
      } else add(match[1]);
    }
  }
  return urls;
}
function imdbViewerIdsFromHtml(html) {
  const ids = new Set();
  for (const match of html.matchAll(/\/mediaviewer\/(rm\d+)\/?/ig)) ids.add(match[1]);
  for (const match of html.matchAll(/"id"\s*:\s*"(rm\d+)"/ig)) ids.add(match[1]);
  return [...ids];
}
async function imdbHtmlImages(actor, imdbId) {
  const candidates = [];
  const receipts = [];
  const pages = [
    `https://www.imdb.com/name/${imdbId}/`,
    `https://www.imdb.com/name/${imdbId}/mediaindex/`,
    `https://www.imdb.com/name/${imdbId}/bio/`,
  ];
  for (const page of pages) {
    const result = await fetchText(page, { quiet: true, label: `IMDb page ${page}` });
    if (!result) { receipts.push({ page, status: "unavailable" }); continue; }
    const score = contextScore(actor, result.body);
    receipts.push({ page, resolved_url: result.url, bytes: Buffer.byteLength(result.body), context_score: score });
    if (score === 0 && !result.body.includes(imdbId)) continue;
    const viewerIds = imdbViewerIdsFromHtml(result.body);
    for (const url of imageUrlsFromHtml(result.body)) {
      if (!/(?:m\.)?media-amazon\.com\/images\/M\//i.test(url)) continue;
      candidates.push({
        provider: "IMDb HTML",
        provider_rank: 1,
        exact_identity: true,
        imdb_id: imdbId,
        image_id: "",
        label: `${actor.actor} — IMDb page image`,
        source_page: result.url,
        url,
        thumbnail_url: url,
        note: `Image embedded on the exact IMDb identity ${imdbId}; visual review must distinguish portrait, role still, title art, and unrelated recommendation imagery.`,
      });
    }
    for (const viewerId of viewerIds) {
      const viewer = await fetchText(`https://www.imdb.com/name/${imdbId}/mediaviewer/${viewerId}/`, { quiet: true, label: `IMDb viewer ${viewerId}` });
      if (!viewer) continue;
      for (const url of imageUrlsFromHtml(viewer.body)) {
        if (!/(?:m\.)?media-amazon\.com\/images\/M\//i.test(url)) continue;
        candidates.push({
          provider: "IMDb media viewer",
          provider_rank: 0,
          exact_identity: true,
          imdb_id: imdbId,
          image_id: viewerId,
          label: `${actor.actor} — IMDb ${viewerId}`,
          source_page: viewer.url,
          url,
          thumbnail_url: url,
          note: `IMDb media viewer ${viewerId} is attached to exact identity ${imdbId}; visual review must confirm the expected performer and neutral-human presentation.`,
        });
      }
    }
  }
  return { candidates, receipts };
}

function candidateFromPage(actor, page, url, index) {
  const host = sourceHost(page);
  return {
    provider: `Named page (${host})`,
    provider_rank: host.includes("playbill") || host.includes("stasiphotography") || host.includes("dougwarhit") ? 2 : 4,
    exact_identity: true,
    imdb_id: "",
    image_id: "",
    label: `${actor.actor} — named-page image ${index + 1}`,
    source_page: page,
    url,
    thumbnail_url: url,
    note: `Image embedded by a manually approved page for ${actor.actor}; visual review must reject logos, recommendations, role stills, groups, and namesakes.`,
  };
}
async function namedPageImages(actor) {
  const candidates = [];
  const receipts = [];
  for (const page of actor.pages || []) {
    if (/imdb\.com\/name\//i.test(page)) continue;
    const result = await fetchText(page, { quiet: true, label: `named page ${page}`, attempts: 2 });
    if (!result) { receipts.push({ page, status: "unavailable" }); continue; }
    const score = contextScore(actor, result.body);
    receipts.push({ page, resolved_url: result.url, bytes: Buffer.byteLength(result.body), context_score: score });
    if (score === 0 && !normalize(result.body).includes(normalize(actor.actor).split(" ").pop())) continue;
    const urls = imageUrlsFromHtml(result.body).slice(0, 40);
    urls.forEach((url, index) => candidates.push(candidateFromPage(actor, result.url, url, index)));
  }
  return { candidates, receipts };
}

function dedupeCandidates(candidates) {
  const map = new Map();
  for (const candidate of candidates) {
    let key;
    try {
      const url = new URL(candidate.url);
      url.hash = "";
      key = `${candidate.provider}|${url.href}`;
    } catch { continue; }
    const old = map.get(key);
    if (!old || candidate.provider_rank < old.provider_rank) map.set(key, candidate);
  }
  return [...map.values()].sort((a, b) => a.provider_rank - b.provider_rank || Number(b.exact_identity) - Number(a.exact_identity) || a.label.localeCompare(b.label));
}

function normalizeCandidateUrl(value) {
  try {
    const url = new URL(value);
    // Prefer larger IMDb derivatives while preserving the immutable source asset stem.
    if (/media-amazon\.com$/i.test(url.hostname) && /\._V1_/.test(url.pathname)) {
      url.pathname = url.pathname.replace(/\._V1_.*?(?=\.(?:jpe?g|png|webp)$)/i, "._V1_");
    }
    return url.href;
  } catch { return value; }
}
async function downloadCandidate(actor, candidate, index) {
  const tried = [candidate.url, normalizeCandidateUrl(candidate.url)].filter((value, at, rows) => value && rows.indexOf(value) === at);
  const failures = [];
  for (const url of tried) {
    const response = await fetchRetry(url, {
      headers: {
        "User-Agent": UA,
        Referer: candidate.source_page,
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.2",
      },
    }, `${candidate.provider} image for ${actor.actor}`, { quiet: true, attempts: 2 });
    if (!response) { failures.push(`${url}: request failed`); continue; }
    const bytes = Buffer.from(await response.arrayBuffer());
    const mime = signatureMime(bytes);
    if (bytes.length < 700 || mime === "unknown") {
      failures.push(`${url}: ${bytes.length} bytes, ${mime}, ${response.headers.get("content-type") || "unknown"}`);
      continue;
    }
    const local = `thumbs/${safeSlug(actor.actor)}-${String(index + 1).padStart(3, "0")}-${safeSlug(candidate.provider)}.${extensionFor(mime)}`;
    await mkdir(join(OUT, "thumbs"), { recursive: true });
    await writeFile(join(OUT, local), bytes);
    return {
      ...candidate,
      requested_url: candidate.url,
      resolved_url: response.url || url,
      local,
      mime,
      bytes: bytes.length,
      sha256: sha256(bytes),
    };
  }
  return { ...candidate, download_error: failures.join(" | ") || "image unavailable" };
}

async function gatherActor(actor) {
  const resolved = await resolveImdbIds(actor);
  const raw = [];
  const providerReceipts = { imdb_resolution: resolved.receipts, graphql: [], imdb_html: [], named_pages: [] };
  for (const imdbId of resolved.ids) {
    const [graph, html] = await Promise.all([imdbGraphqlImages(actor, imdbId), imdbHtmlImages(actor, imdbId)]);
    raw.push(...graph.candidates, ...html.candidates);
    providerReceipts.graphql.push({ imdb_id: imdbId, attempts: graph.attempts });
    providerReceipts.imdb_html.push({ imdb_id: imdbId, pages: html.receipts });
  }
  const named = await namedPageImages(actor);
  raw.push(...named.candidates);
  providerReceipts.named_pages = named.receipts;

  const candidates = dedupeCandidates(raw).slice(0, 90);
  const downloaded = [];
  const byteHashes = new Set();
  for (let index = 0; index < candidates.length; index++) {
    const row = await downloadCandidate(actor, candidates[index], index);
    if (row.sha256 && byteHashes.has(row.sha256)) continue;
    if (row.sha256) byteHashes.add(row.sha256);
    downloaded.push(row);
    if (downloaded.filter((item) => item.sha256).length >= 36) break;
  }
  return {
    actor: actor.actor,
    aliases: actor.aliases,
    cards: actor.cards,
    expected_distinct_portraits: actor.cards.length,
    imdb_ids: resolved.ids,
    context_terms: actor.context_terms,
    candidate_count: downloaded.filter((row) => row.sha256).length,
    providers: [...new Set(downloaded.map((row) => row.provider))],
    candidates: downloaded,
    provider_receipts: providerReceipts,
  };
}

const [control, plan, species, specimens, media] = await Promise.all([
  readJson(CONTROL_PATH), readJson("data/STAR-TREK-GOLD.json"), readJson("data/species.json"), readJson("data/specimens.json"), readJson("data/MEDIA-AUDIT.json"),
]);
assert(control.version === 1 && control.scope === "star-trek" && control.species === "ferengi", "deep portrait control scope drift");
assert(plan.sequence?.find((row) => row.id === "ferengi")?.state === "active", "Ferengi is not the active species");
const taxon = species.taxa?.find((row) => row.key === "species:star-trek:ferengi");
assert(taxon, "Ferengi taxon missing");
const specimenById = new Map(specimens.map((row) => [row.id, row]));
const auditByKey = new Map((media.items || []).map((row) => [`${row.wall_id}|${row.side}`, row]));
const openPortraitIds = (taxon.wall_records || []).map((row) => row.id).filter((id) => {
  const specimen = specimenById.get(id);
  const audit = auditByKey.get(`${id}|portrait`);
  return !specimen?.portrait?.src || audit?.status !== "verified";
}).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
const controlledIds = control.actors.flatMap((actor) => actor.cards).sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
assert(openPortraitIds.length === control.expected_cards, `expected ${control.expected_cards} open Ferengi portraits, found ${openPortraitIds.length}`);
assert(JSON.stringify(openPortraitIds) === JSON.stringify(controlledIds), `deep portrait control does not exactly match open target set: open=${openPortraitIds.join(",")} control=${controlledIds.join(",")}`);
await mkdir(OUT, { recursive: true });
const entries = [];
for (const actor of control.actors) {
  console.log(`deep portrait search: ${actor.actor} for ${actor.cards.join(", ")}`);
  entries.push(await gatherActor(actor));
}
const manifest = {
  version: 1,
  scope: control.scope,
  species: control.species,
  generated_at: new Date().toISOString(),
  control_sha256: sha256(await readFile(CONTROL_PATH)),
  target_cards: openPortraitIds,
  actor_count: entries.length,
  card_count: controlledIds.length,
  entries,
};
await writeJson(join(OUT, "manifest.json"), manifest);
await writeJson(join(OUT, "summary.json"), {
  actor_count: entries.length,
  card_count: controlledIds.length,
  candidates_downloaded: entries.reduce((sum, row) => sum + row.candidate_count, 0),
  actors_without_candidates: entries.filter((row) => row.candidate_count === 0).map((row) => row.actor),
  entries: entries.map((row) => ({ actor: row.actor, cards: row.cards, expected_distinct_portraits: row.expected_distinct_portraits, candidate_count: row.candidate_count, providers: row.providers, imdb_ids: row.imdb_ids })),
});
const cardsHtml = entries.flatMap((entry) => entry.candidates.map((candidate, index) => {
  const image = candidate.local ? `<img src="${escapeHtml(candidate.local)}" alt="">` : `<div class="missing">${escapeHtml(candidate.download_error || "unavailable")}</div>`;
  return `<article><div class="identity">${escapeHtml(entry.actor)} · ${escapeHtml(entry.cards.join(" / "))}</div>${image}<h2>${escapeHtml(candidate.provider)} · ${index + 1}</h2><p>${escapeHtml(candidate.label)}</p><p><b>IMDb:</b> ${escapeHtml(candidate.imdb_id || "—")}<br><b>Image:</b> ${escapeHtml(candidate.image_id || "—")}<br><b>Dimensions:</b> ${escapeHtml(candidate.width || "?")}×${escapeHtml(candidate.height || "?")}</p><p><a href="${escapeHtml(candidate.source_page)}">source page</a></p><p>${escapeHtml(candidate.note)}</p><code>${escapeHtml(candidate.sha256 || candidate.download_error || "")}</code></article>`;
})).join("\n");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ferengi deep portrait orbit</title><style>body{font:14px system-ui;margin:24px;background:#e9e9e9;color:#111}header{max-width:1050px;margin:0 auto 24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}article{background:white;padding:12px;border:1px solid #aaa}img,.missing{display:block;width:100%;height:330px;object-fit:contain;background:#222;color:white}.missing{display:grid;place-items:center;text-align:center}.identity{font-weight:700;margin-bottom:8px}h2{font-size:16px;margin:.7em 0 .2em}p{font-size:12px;line-height:1.45}code{font-size:10px;word-break:break-all}a{color:#0645ad}</style></head><body><header><h1>Ferengi residual performer portraits</h1><p>Candidate-only. Exact actor IDs narrow discovery but do not approve pixels. Each card needs a visually confirmed, attributable, unmasked, neutral-human portrait; repeated performers need distinct final bytes.</p></header><main>${cardsHtml}</main></body></html>`;
await writeFile(join(OUT, "sheet.html"), html);
console.log(`deep portrait orbit: ${entries.length} actors / ${controlledIds.length} cards / ${entries.reduce((sum, row) => sum + row.candidate_count, 0)} unique downloaded candidates -> ${OUT}`);
