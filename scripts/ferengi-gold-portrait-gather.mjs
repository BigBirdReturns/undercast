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
const CONTROL_PATH = ".github/FERENGI-GOLD-PORTRAITS.json";
const OUT = option("out", process.env.OUT || "/tmp/ferengi-gold-portraits");
const BATCH_INDEX = Number(option("batch", process.env.BATCH_INDEX || "0"));
const BATCH_COUNT = Number(option("batches", process.env.BATCH_COUNT || "4"));
const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "bigbirdreturns@proton.me"})`;
const WIKIPEDIA = "https://en.wikipedia.org/w/api.php";
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const MEMORY_ALPHA = "https://memory-alpha.fandom.com/api.php";
const WIKIDATA = "https://www.wikidata.org/w/api.php";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); };
const normalize = (value) => String(value || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, " ").trim().toLowerCase();
const numericId = (value) => Number(String(value || "").match(/\d+/)?.[0] || 0);
const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function signatureMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "image/gif";
  return "unknown";
}
function extensionFor(mime) { return mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "bin"; }
function sourceHost(value) { try { return new URL(value).hostname; } catch { return ""; } }

let lastRequest = 0;
async function fetchRetry(url, options = {}, label = url, { attempts = 3, quiet = false } = {}) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const wait = Math.max(0, 120 - (Date.now() - lastRequest));
      if (wait) await sleep(wait);
      lastRequest = Date.now();
      const response = await fetch(url, { ...options, redirect: "follow", signal: AbortSignal.timeout(35_000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      last = error;
      if (attempt < attempts) await sleep(attempt * 700);
    }
  }
  if (quiet) return null;
  throw new Error(`${label} unavailable after retries: ${last?.message || last}`);
}
async function jsonRequest(url, options = {}, label = url, config = {}) {
  const response = await fetchRetry(url, options, label, config);
  if (!response) return null;
  try { return await response.json(); }
  catch (error) { if (config.quiet) return null; throw new Error(`${label} returned invalid JSON: ${error.message}`); }
}
async function mediaWiki(base, params, label = base) {
  const url = `${base}?${new URLSearchParams({ format: "json", origin: "*", ...params })}`;
  return jsonRequest(url, { headers: { "User-Agent": UA, Accept: "application/json" } }, label, { quiet: true });
}

function aliasSet(control, actor) {
  const aliases = control.aliases?.[actor] || [actor];
  return new Set([actor, ...aliases].map(normalize).filter(Boolean));
}
function exactName(aliases, value) { return aliases.has(normalize(value)); }
function candidateKey(candidate) { return `${candidate.provider}|${candidate.url}`; }
function addCandidate(list, seen, candidate) {
  if (!candidate?.url || !candidate?.source_page) return;
  try { const u = new URL(candidate.url); if (!/^https?:$/.test(u.protocol)) return; }
  catch { return; }
  const key = candidateKey(candidate);
  if (seen.has(key)) return;
  seen.add(key);
  list.push({
    provider: candidate.provider,
    provider_rank: Number(candidate.provider_rank ?? 99),
    label: String(candidate.label || candidate.provider),
    exact_name: candidate.exact_name === true,
    source_page: candidate.source_page,
    url: candidate.url,
    thumbnail_url: candidate.thumbnail_url || candidate.url,
    author: String(candidate.author || ""),
    license: String(candidate.license || ""),
    person_id: String(candidate.person_id || ""),
    note: String(candidate.note || "Candidate requires exact-subject review."),
  });
}

async function wikiImage(base, fileName, { provider, providerRank, exact, note, sourcePage = "" }) {
  const title = /^File:/i.test(fileName) ? fileName : `File:${fileName}`;
  const payload = await mediaWiki(base, {
    action: "query", prop: "imageinfo", iiprop: "url|mime|size|extmetadata", iiurlwidth: "720", titles: title,
  }, `${provider} image ${fileName}`);
  const page = Object.values(payload?.query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.url) return null;
  const meta = info.extmetadata || {};
  const strip = (value) => String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return {
    provider,
    provider_rank: providerRank,
    label: page.title || title,
    exact_name: exact,
    source_page: info.descriptionurl || sourcePage || `${base.replace(/api\.php$/, "wiki/")}${encodeURIComponent(title.replace(/ /g, "_"))}`,
    url: info.url,
    thumbnail_url: info.thumburl || info.url,
    author: strip(meta.Artist?.value),
    license: strip(meta.LicenseShortName?.value),
    note,
  };
}

async function wikiPersonCandidates(base, aliases, provider, providerRank) {
  const candidates = [];
  const seenFiles = new Set();
  for (const alias of aliases) {
    const search = await mediaWiki(base, { action: "query", list: "search", srsearch: alias, srnamespace: "0", srlimit: "8" }, `${provider} person search`);
    const exactPage = (search?.query?.search || []).find((row) => exactName(aliases, row.title));
    if (!exactPage) continue;
    const page = await mediaWiki(base, { action: "query", prop: "pageimages|images|info", piprop: "name", imlimit: "50", inprop: "url", titles: exactPage.title }, `${provider} person page`);
    const row = Object.values(page?.query?.pages || {})[0];
    const files = [];
    if (row?.pageimage) files.push(row.pageimage);
    for (const image of row?.images || []) files.push(String(image.title || "").replace(/^File:/i, ""));
    for (const file of files) {
      if (!file || seenFiles.has(file) || !/\.(?:jpe?g|png|webp)$/i.test(file)) continue;
      seenFiles.add(file);
      const item = await wikiImage(base, file, {
        provider,
        providerRank,
        exact: true,
        sourcePage: row?.fullurl || "",
        note: `${provider} exact-name person page ${exactPage.title}; visual review must confirm the unmasked performer.`,
      });
      if (item) candidates.push(item);
      if (candidates.length >= 8) break;
    }
    if (candidates.length >= 8) break;
  }
  return candidates;
}

async function wikiFileSearchCandidates(base, aliases, provider, providerRank) {
  const candidates = [];
  const seenFiles = new Set();
  for (const alias of aliases) {
    const search = await mediaWiki(base, { action: "query", list: "search", srsearch: `\"${alias}\"`, srnamespace: "6", srlimit: "14" }, `${provider} file search`);
    for (const hit of search?.query?.search || []) {
      const file = String(hit.title || "").replace(/^File:/i, "");
      if (!file || seenFiles.has(file) || !/\.(?:jpe?g|png|webp)$/i.test(file)) continue;
      seenFiles.add(file);
      const item = await wikiImage(base, file, {
        provider,
        providerRank,
        exact: exactName(aliases, file.replace(/\.[^.]+$/, "").replace(/[_,()\d-]+/g, " ")),
        note: `${provider} file-namespace result for ${alias}; filename affinity is not identity proof.`,
      });
      if (item) candidates.push(item);
      if (candidates.length >= 8) break;
    }
    if (candidates.length >= 8) break;
  }
  return candidates;
}

async function imdbCandidates(aliases) {
  const candidates = [];
  const seen = new Set();
  for (const alias of aliases) {
    const urls = [
      `https://v2.sg.media-imdb.com/suggestion/x/${encodeURIComponent(alias)}.json`,
      `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(alias)}.json`,
    ];
    let payload = null;
    for (const url of urls) {
      payload = await jsonRequest(url, { headers: { "User-Agent": UA, Accept: "application/json" } }, `IMDb suggestion for ${alias}`, { quiet: true });
      if (payload?.d) break;
    }
    for (const row of payload?.d || []) {
      if (!/^nm\d+$/.test(row.id || "") || !exactName(aliases, row.l)) continue;
      const image = row.i?.imageUrl || row.i?.url;
      if (!image || seen.has(image)) continue;
      seen.add(image);
      candidates.push({
        provider: "IMDb",
        provider_rank: 0,
        label: `${row.l} — IMDb profile image`,
        exact_name: true,
        source_page: `https://www.imdb.com/name/${row.id}/`,
        url: image,
        thumbnail_url: image,
        person_id: row.id,
        note: `IMDb suggestion result exactly matches ${row.l}; visual review must confirm a neutral unmasked portrait.`,
      });
    }
  }
  return candidates;
}

async function tvMazeCandidates(aliases) {
  const candidates = [];
  const seen = new Set();
  for (const alias of aliases) {
    const payload = await jsonRequest(`https://api.tvmaze.com/search/people?q=${encodeURIComponent(alias)}`, { headers: { "User-Agent": UA, Accept: "application/json" } }, `TVMaze search for ${alias}`, { quiet: true });
    for (const hit of Array.isArray(payload) ? payload : []) {
      const person = hit?.person;
      if (!person || !exactName(aliases, person.name)) continue;
      const image = person.image?.original || person.image?.medium;
      if (!image || seen.has(image)) continue;
      seen.add(image);
      candidates.push({
        provider: "TVMaze",
        provider_rank: 1,
        label: `${person.name} — TVMaze person image`,
        exact_name: true,
        source_page: person.url,
        url: image,
        thumbnail_url: person.image?.medium || image,
        person_id: String(person.id || ""),
        note: `TVMaze exact-name person record for ${person.name}; visual review must confirm a neutral unmasked portrait.`,
      });
    }
  }
  return candidates;
}

async function wikidataCandidates(aliases) {
  const candidates = [];
  const seen = new Set();
  for (const alias of aliases) {
    const search = await mediaWiki(WIKIDATA, { action: "wbsearchentities", search: alias, language: "en", uselang: "en", limit: "8" }, `Wikidata search for ${alias}`);
    for (const row of search?.search || []) {
      const labels = [row.label, ...(row.aliases || [])];
      if (!labels.some((label) => exactName(aliases, label))) continue;
      const entity = await jsonRequest(`https://www.wikidata.org/wiki/Special:EntityData/${row.id}.json`, { headers: { "User-Agent": UA, Accept: "application/json" } }, `Wikidata entity ${row.id}`, { quiet: true });
      const file = entity?.entities?.[row.id]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (!file || seen.has(file)) continue;
      seen.add(file);
      const item = await wikiImage(COMMONS, file, {
        provider: "Wikidata/Commons",
        providerRank: 2,
        exact: true,
        sourcePage: `https://www.wikidata.org/wiki/${row.id}`,
        note: `Wikidata exact-name entity ${row.id} declares this P18 image; visual review must confirm the expected performer.`,
      });
      if (item) candidates.push({ ...item, person_id: row.id });
    }
  }
  return candidates;
}

function metaImageCandidates(html, pageUrl, actor) {
  const values = [];
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/ig,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/ig,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/ig,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/ig,
    /"image"\s*:\s*"(https?:\\?\/\\?\/[^"\\]+(?:\\.[^"\\]+)*)"/ig,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) values.push(match[1].replace(/\\\//g, "/").replace(/&amp;/g, "&"));
  }
  const unique = [];
  for (const value of values) {
    try {
      const url = new URL(value, pageUrl).href;
      if (!unique.includes(url)) unique.push(url);
    } catch {}
  }
  return unique.slice(0, 4).map((url) => ({
    provider: `Page metadata (${sourceHost(pageUrl)})`,
    provider_rank: 3,
    label: `${actor} — attributable page image`,
    exact_name: true,
    source_page: pageUrl,
    url,
    thumbnail_url: url,
    note: `Image advertised by an explicitly reviewed ${actor} source page; visual review must reject logos, role depictions, and unrelated social previews.`,
  }));
}
async function manualPageCandidates(actor, pages) {
  const candidates = [];
  for (const page of pages || []) {
    const response = await fetchRetry(page, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" } }, `manual portrait page ${page}`, { quiet: true });
    if (!response) continue;
    const html = await response.text();
    const surname = normalize(actor).split(" ").pop();
    if (surname && !normalize(html).includes(surname)) continue;
    candidates.push(...metaImageCandidates(html, response.url || page, actor));
  }
  return candidates;
}

async function downloadCandidate(candidate, target, index) {
  const response = await fetchRetry(candidate.thumbnail_url || candidate.url, {
    headers: {
      "User-Agent": UA,
      Referer: candidate.source_page,
      Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.2",
    },
  }, `${candidate.provider} image for ${target.actor}`, { quiet: true });
  if (!response) return { ...candidate, download_error: "request failed" };
  const bytes = Buffer.from(await response.arrayBuffer());
  const mime = signatureMime(bytes);
  if (bytes.length < 700 || mime === "unknown") {
    return { ...candidate, download_error: `not a usable image (${bytes.length} bytes, ${mime}, ${response.headers.get("content-type") || "unknown"})` };
  }
  const extension = extensionFor(mime);
  const local = `thumbs/${target.id.toLowerCase()}-${String(index + 1).padStart(2, "0")}-${candidate.provider.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.${extension}`;
  await mkdir(join(OUT, "thumbs"), { recursive: true });
  await writeFile(join(OUT, local), bytes);
  return {
    ...candidate,
    resolved_url: response.url || candidate.thumbnail_url || candidate.url,
    local,
    mime,
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

async function gatherTarget(control, target) {
  const aliases = aliasSet(control, target.actor);
  const aliasValues = [...new Set(control.aliases?.[target.actor] || [target.actor])];
  const raw = [];
  const seen = new Set();
  const providerGroups = await Promise.all([
    imdbCandidates(aliases),
    tvMazeCandidates(aliases),
    wikidataCandidates(aliases),
    manualPageCandidates(target.actor, control.manual_pages?.[target.actor]),
    wikiPersonCandidates(WIKIPEDIA, aliases, "Wikipedia", 4),
    wikiFileSearchCandidates(COMMONS, aliases, "Wikimedia Commons", 5),
    wikiPersonCandidates(MEMORY_ALPHA, aliases, "Memory Alpha person page", 6),
    wikiFileSearchCandidates(MEMORY_ALPHA, aliases, "Memory Alpha file search", 7),
  ]);
  for (const group of providerGroups) for (const candidate of group || []) addCandidate(raw, seen, candidate);
  raw.sort((a, b) => a.provider_rank - b.provider_rank || Number(b.exact_name) - Number(a.exact_name) || a.label.localeCompare(b.label));
  const selected = raw.slice(0, Number(control.max_candidates_per_record || 14));
  const downloaded = [];
  const byteHashes = new Set();
  for (const candidate of selected) {
    const row = await downloadCandidate(candidate, target, downloaded.length);
    if (row.sha256 && byteHashes.has(row.sha256)) continue;
    if (row.sha256) byteHashes.add(row.sha256);
    downloaded.push(row);
  }
  return {
    id: target.id,
    actor: target.actor,
    character: target.character,
    approved_names: aliasValues,
    portrait_status: target.portrait_status,
    candidates: downloaded,
    candidate_count: downloaded.filter((row) => !row.download_error).length,
    source_providers: [...new Set(downloaded.map((row) => row.provider))],
  };
}

function deriveTargets(plan, species, specimens, media) {
  const ferengiEntry = plan.sequence?.find((row) => row.id === "ferengi");
  assert(ferengiEntry?.state === "active", "Ferengi is not the sole active species");
  const taxon = species.taxa?.find((row) => row.key === "species:star-trek:ferengi");
  assert(taxon, "Ferengi species projection is missing");
  const specimenById = new Map(specimens.map((row) => [row.id, row]));
  const auditByKey = new Map((media.items || []).map((row) => [`${row.wall_id}|${row.side}`, row]));
  const targets = [];
  for (const record of taxon.wall_records || []) {
    const specimen = specimenById.get(record.id);
    assert(specimen, `Ferengi wall record ${record.id} is missing`);
    const item = auditByKey.get(`${record.id}|portrait`);
    if (!item || item.status !== "verified" || !specimen.portrait?.src) {
      targets.push({
        id: record.id,
        actor: specimen.actor,
        character: specimen.character,
        portrait_status: item?.status || "missing-audit-row",
      });
    }
  }
  return targets.sort((a, b) => numericId(a.id) - numericId(b.id));
}

const [control, plan, species, specimens, media] = await Promise.all([
  readJson(CONTROL_PATH), readJson("data/STAR-TREK-GOLD.json"), readJson("data/species.json"), readJson("data/specimens.json"), readJson("data/MEDIA-AUDIT.json"),
]);
assert(control.version === 1 && control.scope === "star-trek" && control.species === "ferengi", "portrait-orbit control scope drift");
assert(Number.isInteger(BATCH_INDEX) && Number.isInteger(BATCH_COUNT) && BATCH_INDEX >= 0 && BATCH_INDEX < BATCH_COUNT, "invalid portrait batch partition");
assert(BATCH_COUNT === Number(control.batch_count), `batch count ${BATCH_COUNT} differs from control ${control.batch_count}`);
const allTargets = deriveTargets(plan, species, specimens, media);
assert(allTargets.length > 0, "Ferengi has no remaining portrait targets");
const targets = allTargets.filter((_, index) => index % BATCH_COUNT === BATCH_INDEX);
await mkdir(OUT, { recursive: true });
const entries = [];
for (const target of targets) {
  console.log(`gathering ${target.id} ${target.actor} — ${target.character}`);
  entries.push(await gatherTarget(control, target));
}
const manifest = {
  version: 1,
  scope: "star-trek",
  species: "ferengi",
  generated_at: new Date().toISOString(),
  batch_index: BATCH_INDEX,
  batch_count: BATCH_COUNT,
  total_target_count: allTargets.length,
  target_ids: targets.map((row) => row.id),
  control_sha256: sha256(await readFile(CONTROL_PATH)),
  entries,
};
await writeJson(join(OUT, "manifest.json"), manifest);
await writeJson(join(OUT, "summary.json"), {
  batch_index: BATCH_INDEX,
  target_count: entries.length,
  candidates_downloaded: entries.reduce((sum, row) => sum + row.candidate_count, 0),
  no_candidate_ids: entries.filter((row) => row.candidate_count === 0).map((row) => row.id),
  entries: entries.map((row) => ({ id: row.id, actor: row.actor, character: row.character, candidate_count: row.candidate_count, providers: row.source_providers })),
});
const cards = entries.flatMap((entry) => entry.candidates.map((candidate, index) => {
  const image = candidate.local ? `<img src="${escapeHtml(candidate.local)}" alt="">` : `<div class="missing">${escapeHtml(candidate.download_error || "no image")}</div>`;
  return `<article><div class="label">${escapeHtml(entry.id)} · ${escapeHtml(entry.actor)} · ${escapeHtml(entry.character)}</div>${image}<h2>${escapeHtml(candidate.provider)} · ${index + 1}</h2><p>${escapeHtml(candidate.label)}</p><p><b>Exact-name provider:</b> ${candidate.exact_name ? "yes" : "no"}<br><b>License:</b> ${escapeHtml(candidate.license || "not supplied")}<br><b>Author:</b> ${escapeHtml(candidate.author || "not supplied")}</p><p><a href="${escapeHtml(candidate.source_page)}">source page</a></p><code>${escapeHtml(candidate.sha256 || candidate.download_error || "")}</code></article>`;
})).join("\n");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ferengi portrait orbit ${BATCH_INDEX}</title><style>body{font:14px system-ui;margin:24px;background:#e9e9e9;color:#111}header{max-width:1000px;margin:0 auto 24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}article{background:white;padding:12px;border:1px solid #aaa}img,.missing{display:block;width:100%;height:320px;object-fit:contain;background:#222;color:white}.missing{display:grid;place-items:center;text-align:center}h2{font-size:16px;margin:.7em 0 .2em}.label{font-weight:700;margin-bottom:8px}p{font-size:12px;line-height:1.45}code{font-size:10px;word-break:break-all}a{color:#0645ad}</style></head><body><header><h1>Ferengi performer portrait orbit ${BATCH_INDEX + 1}/${BATCH_COUNT}</h1><p>Candidate-only. Exact-name provider matches are not visual approval. Reject role depictions, groups without clear identity, non-person images, namesakes, and ambiguous people.</p></header><main>${cards}</main></body></html>`;
await writeFile(join(OUT, "sheet.html"), html);
console.log(`portrait orbit ${BATCH_INDEX}: ${entries.length} records, ${entries.reduce((sum, row) => sum + row.candidate_count, 0)} downloaded candidates -> ${OUT}`);
