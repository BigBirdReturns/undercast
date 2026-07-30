#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFile, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { buildRepositoryHashIndex, inspectImage } from "./lib/card-backfill-packet.mjs";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
function numeric(name, fallback) {
  const value = Number(option(name, String(fallback)));
  if (!Number.isFinite(value)) throw new Error(`${name} must be numeric`);
  return value;
}
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + "\n"); }
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const stripHtml = (value = "") => String(value).replace(/<[^>]+>/g, " ").replace(/&(?:nbsp|amp|quot|apos|#39);/gi, " ").replace(/\s+/g, " ").trim();
const FREE_LICENSE = /(?:public domain|\bpd\b|cc0|cc[-\s]?by(?:[-\s]?sa)?|gfdl)/i;
const NON_IMAGE = /(?:logo|icon|symbol|flag|map|diagram|schematic|signature|wordmark|poster|cover|title card|screenshot of|interface|ui\b|button|arrow|badge|seal|coat of arms)/i;
const GROUP = /\b(?:and|with|cast|group|panel|crew|ensemble|family|team)\b|[,;&]/i;
const FRANCHISE_WIKIS = [
  [/star wars|jedi|sith|mandalorian|wookiee|ewok|clone wars/i, "https://starwars.fandom.com/api.php"],
  [/lord of the rings|hobbit|middle.?earth|tolkien|rings of power/i, "https://lotr.fandom.com/api.php"],
  [/doctor who|dalek|cyberman|tardis|torchwood|sontaran|time lord/i, "https://tardis.fandom.com/api.php"],
  [/predator|yautja|alien|aliens|xenomorph|prometheus|covenant|nostromo/i, "https://avp.fandom.com/api.php"],
  [/hellboy/i, "https://hellboy.fandom.com/api.php"],
  [/dark crystal|gelfling|skeksis/i, "https://darkcrystal.fandom.com/api.php"],
  [/muppet|sesame street|fraggle|henson|labyrinth/i, "https://muppet.fandom.com/api.php"],
  [/power rangers|super sentai|zord/i, "https://powerrangers.fandom.com/api.php"],
  [/ultraman|ultra series/i, "https://ultra.fandom.com/api.php"],
  [/kamen rider|masked rider/i, "https://kamenrider.fandom.com/api.php"],
  [/godzilla|gamera|mothra|ghidorah|toho|kaiju|tokusatsu/i, "https://wikizilla.org/w/api.php"],
  [/buffy|angel|vampire slayer|sunnydale/i, "https://buffy.fandom.com/api.php"],
  [/harry potter|hogwarts|wizarding world|fantastic beasts/i, "https://harrypotter.fandom.com/api.php"],
  [/game of thrones|westeros|targaryen|house of the dragon/i, "https://gameofthrones.fandom.com/api.php"],
  [/planet of the apes/i, "https://planetoftheapes.fandom.com/api.php"],
  [/ninja turtles|\btmnt\b/i, "https://tmnt.fandom.com/api.php"],
  [/friday the 13th|jason voorhees|camp crystal lake/i, "https://fridaythe13th.fandom.com/api.php"],
  [/hellraiser|pinhead|cenobite/i, "https://hellraiser.fandom.com/api.php"],
  [/nightmare on elm street|freddy krueger/i, "https://elmstreet.fandom.com/api.php"],
  [/marvel|avengers|\bmcu\b|x-men|guardians of the galaxy/i, "https://marvelcinematicuniverse.fandom.com/api.php"],
  [/batman|superman|justice league|\bdc\b comics?/i, "https://dc.fandom.com/api.php"],
  [/star trek|ferengi|klingon|cardassian|romulan|vulcan|borg|dominion/i, "https://memory-alpha.fandom.com/api.php"],
  [/babylon 5/i, "https://babylon5.fandom.com/api.php"],
  [/farscape/i, "https://farscape.fandom.com/api.php"],
];
const DEFAULT_WIKIS = {
  "Star Trek": "https://memory-alpha.fandom.com/api.php",
  "Babylon 5": "https://babylon5.fandom.com/api.php",
  Farscape: "https://farscape.fandom.com/api.php",
  Kaiju: "https://wikizilla.org/w/api.php",
};

function apiUrl(base, params) {
  const url = new URL(base);
  const entries = { action: "query", format: "json", formatversion: "2", origin: "*", ...params };
  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === undefined || value === "") continue;
    url.searchParams.set(key, Array.isArray(value) ? value.join("|") : String(value));
  }
  return url;
}
function wikiTitle(link) {
  try {
    const url = new URL(link);
    const marker = "/wiki/";
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    return decodeURIComponent(url.pathname.slice(index + marker.length)).replaceAll("_", " ");
  } catch { return null; }
}
function apiFromHost(host) {
  return /(^|\.)fandom\.com$/i.test(host) ? `https://${host}/api.php` : `https://${host}/w/api.php`;
}
function resolveWiki(hint) {
  if (!hint) return null;
  if (/\/api\.php(?:\?|$)/.test(hint) || /\/w\/api\.php(?:\?|$)/.test(hint)) return hint;
  if (/^https?:\/\//i.test(hint)) {
    try { return apiFromHost(new URL(hint).host); } catch { return null; }
  }
  return `https://${hint}.fandom.com/api.php`;
}
function stillApisFor(record) {
  const values = [];
  const push = (value) => { if (value && !values.includes(value)) values.push(value); };
  push(resolveWiki(record.wiki));
  const hay = `${record.production || ""} ${record.character || ""} ${record.universe || ""}`;
  for (const [pattern, api] of FRANCHISE_WIKIS) if (pattern.test(hay)) push(api);
  try {
    const host = new URL(record.link).host;
    if (host && !/^en\.wikipedia\.org$/i.test(host) && /wiki|pedia|fandom|memory-alpha|wikizilla/i.test(host)) push(apiFromHost(host));
  } catch {}
  push(DEFAULT_WIKIS[record.universe]);
  push("https://en.wikipedia.org/w/api.php");
  return values;
}
function normalize(value) {
  return stripHtml(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function words(value, minimum = 3) {
  return [...new Set(normalize(value).split(/\s+/).filter((word) => word.length >= minimum && !["the", "and", "from", "with", "into", "for", "voice", "actor", "film", "series"].includes(word)))];
}
function subjectAliases(value) {
  const raw = String(value || "").trim();
  const parts = raw.split(/\s*(?:\/|&|,|;|\band\b)\s*/i).map((part) => part.trim()).filter((part) => part.length >= 2);
  return [...new Set([raw, ...parts].filter(Boolean))].slice(0, 8);
}
function overlap(text, terms) {
  const hay = normalize(text);
  return terms.filter((term) => hay.includes(normalize(term))).length;
}
function containsPhrase(text, value) {
  const needle = normalize(value);
  return needle.length >= 3 && normalize(text).includes(needle);
}
function matchingWindows(text, values, maximum = 4) {
  const source = stripHtml(text);
  const lower = source.toLowerCase();
  const out = [];
  for (const value of values.filter(Boolean)) {
    const needle = String(value).toLowerCase();
    const index = lower.indexOf(needle);
    if (index < 0) continue;
    const start = Math.max(0, index - 180);
    const end = Math.min(source.length, index + needle.length + 260);
    const excerpt = source.slice(start, end).replace(/\s+/g, " ").trim();
    if (excerpt && !out.includes(excerpt)) out.push(excerpt);
    if (out.length >= maximum) break;
  }
  return out;
}
function metadataValue(metadata, key) { return stripHtml(metadata?.[key]?.value || ""); }
function imageInfo(page) { return page?.imageinfo?.[0] || null; }
function detectedExtension(contentType, url = "") {
  const normalized = String(contentType).split(";")[0].trim().toLowerCase();
  if (normalized === "image/png") return ".png";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/gif") return ".gif";
  if (normalized === "image/jpeg" || normalized === "image/jpg") return ".jpg";
  const ext = extname(new URL(String(url)).pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
}

class Transport {
  constructor({ userAgent, timeoutMs, delayMs }) {
    this.userAgent = userAgent;
    this.timeoutMs = timeoutMs;
    this.delayMs = delayMs;
    this.lastRequestAt = 0;
  }
  async wait() {
    const delay = Math.max(0, this.delayMs - (Date.now() - this.lastRequestAt));
    if (delay) await sleep(delay);
    this.lastRequestAt = Date.now();
  }
  async request(url, { stage, attempts, accept = "*/*", referer = null, binary = false, retries = 2 } = {}) {
    let lastError = null;
    for (let retry = 0; retry <= retries; retry += 1) {
      await this.wait();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, {
          redirect: "follow",
          signal: controller.signal,
          headers: { "User-Agent": this.userAgent, Accept: accept, ...(referer ? { Referer: referer } : {}) },
        });
        const contentType = response.headers.get("content-type") || "";
        const bytes = Buffer.from(await response.arrayBuffer());
        const receipt = {
          stage,
          requested_url: String(url),
          resolved_url: response.url || String(url),
          retry,
          status: response.status,
          ok: response.ok,
          content_type: contentType,
          bytes: bytes.length,
          body_sha256: sha256(bytes),
          ...(binary ? {} : { body_excerpt: bytes.toString("utf8", 0, Math.min(bytes.length, 1600)) }),
        };
        attempts.push(receipt);
        if (response.ok) return { response, bytes, contentType, receipt };
        lastError = new Error(`${stage} HTTP ${response.status}`);
        if (![403, 408, 425, 429, 500, 502, 503, 504].includes(response.status)) break;
      } catch (error) {
        lastError = error;
        attempts.push({ stage, requested_url: String(url), retry, status: null, ok: false, error: error.name === "AbortError" ? "timeout" : error.message });
      } finally { clearTimeout(timer); }
      await sleep((retry + 1) * 700);
    }
    throw lastError || new Error(`${stage} failed`);
  }
  async json(url, options = {}) {
    const result = await this.request(url, { ...options, accept: "application/json", binary: false });
    try { return { ...result, value: JSON.parse(result.bytes.toString("utf8")) }; }
    catch (error) {
      options.attempts?.push({ stage: `${options.stage}:json-parse`, requested_url: String(url), ok: false, error: error.message });
      throw new Error(`${options.stage} returned invalid JSON`);
    }
  }
}

async function queryPage(api, title, transport, attempts, stage) {
  const url = apiUrl(api, {
    redirects: 1,
    prop: "pageimages|images|extracts|info",
    piprop: "name|thumbnail|original",
    pithumbsize: 1600,
    pilicense: "any",
    imlimit: 40,
    explaintext: 1,
    exchars: 12000,
    inprop: "url",
    titles: title,
  });
  const { value } = await transport.json(url, { stage, attempts });
  return value?.query?.pages?.[0] || null;
}
async function searchPages(api, query, transport, attempts, limit) {
  const url = apiUrl(api, { list: "search", srsearch: query, srlimit: limit, srprop: "" });
  try {
    const { value } = await transport.json(url, { stage: `page-search:${new URL(api).host}`, attempts });
    return (value?.query?.search || []).map((row) => row.title).filter(Boolean);
  } catch { return []; }
}
async function queryImageInfos(api, files, transport, attempts, stage) {
  const out = [];
  for (let index = 0; index < files.length; index += 20) {
    const group = files.slice(index, index + 20).map((file) => file.startsWith("File:") ? file : `File:${file}`);
    const url = apiUrl(api, {
      prop: "imageinfo",
      iiprop: "url|size|mime|extmetadata",
      iiurlwidth: 1600,
      titles: group,
    });
    try {
      const { value } = await transport.json(url, { stage: `${stage}:${index / 20 + 1}`, attempts });
      for (const page of value?.query?.pages || []) {
        const info = imageInfo(page);
        if (info) out.push({ file: String(page.title || "").replace(/^File:/, ""), info });
      }
    } catch {}
  }
  return out;
}
async function commonsSearch(query, transport, attempts, endpoints, limit) {
  const url = apiUrl(endpoints.commonsApi, {
    generator: "search",
    gsrsearch: query,
    gsrnamespace: 6,
    gsrlimit: limit,
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: 1600,
  });
  try {
    const { value } = await transport.json(url, { stage: "commons-file-search", attempts });
    return (value?.query?.pages || []).map((page) => ({ file: String(page.title || "").replace(/^File:/, ""), info: imageInfo(page) })).filter((row) => row.info);
  } catch { return []; }
}

function pageUrl(api, page) {
  if (page?.fullurl) return page.fullurl;
  try { return `https://${new URL(api).host}/wiki/${encodeURIComponent(String(page?.title || "").replaceAll(" ", "_"))}`; }
  catch { return null; }
}
function fileSource(info, fallbackOrigin) {
  const metadata = info?.extmetadata || {};
  const date = metadataValue(metadata, "DateTimeOriginal") || metadataValue(metadata, "DateTime");
  return {
    url: info?.thumburl || info?.url || null,
    original_url: info?.url || null,
    origin: info?.descriptionurl || fallbackOrigin || null,
    width: Number(info?.width || info?.thumbwidth || 0) || null,
    height: Number(info?.height || info?.thumbheight || 0) || null,
    mime: info?.mime || null,
    author: metadataValue(metadata, "Artist") || metadataValue(metadata, "Credit"),
    license: metadataValue(metadata, "LicenseShortName") || metadataValue(metadata, "License"),
    year: Number((date.match(/(?:19|20)\d{2}/) || [])[0] || 0) || null,
    description: metadataValue(metadata, "ImageDescription") || metadataValue(metadata, "ObjectName"),
    categories: metadataValue(metadata, "Categories"),
  };
}
function addCandidate(map, candidate) {
  if (!candidate?.source?.url) return;
  const key = String(candidate.source.url);
  const prior = map.get(key);
  if (!prior || candidate.score > prior.score) map.set(key, candidate);
}
function subjectScore({ file, page, source, aliases, production, actorEvidence, side, lead }) {
  const pageTitle = page?.title || "";
  const pageExtract = page?.extract || "";
  const fileText = `${file || ""} ${source.description || ""} ${source.categories || ""}`;
  const aliasTokens = [...new Set(aliases.flatMap((alias) => words(alias)))];
  const productionTokens = words(production);
  let score = 0;
  const exactPage = aliases.some((alias) => normalize(pageTitle) === normalize(alias));
  if (exactPage) score += 120;
  if (aliases.some((alias) => containsPhrase(pageTitle, alias))) score += 70;
  score += overlap(pageTitle, aliasTokens) * 8;
  score += overlap(fileText, aliasTokens) * 10;
  score += overlap(pageExtract, aliasTokens) * 5;
  score += overlap(pageTitle, productionTokens) * 10;
  score += overlap(fileText, productionTokens) * 8;
  score += overlap(pageExtract, productionTokens) * 4;
  if (lead) score += 20;
  if (source.width && source.height) score += Math.min(24, Math.log2(Math.max(1, source.width * source.height / 250000)) * 6);
  if (NON_IMAGE.test(`${fileText} ${pageTitle}`)) score -= 140;
  if (side === "portrait") {
    if (GROUP.test(file || "")) score -= 60;
    if (source.width && source.height && source.height >= source.width) score += 20;
    if (aliases.some((alias) => containsPhrase(fileText, alias))) score += 80;
    if (exactPage) score += 50;
  } else {
    if (actorEvidence?.explicit_character_and_production) score += 100;
    if (!exactPage && overlap(pageExtract, productionTokens) === 0) score -= 50;
  }
  return score;
}

async function actorEvidenceFor(record, transport, attempts, endpoints) {
  const title = wikiTitle(record.link) || record.actor;
  if (!title) return null;
  let page = null;
  try { page = await queryPage(endpoints.enwikiApi, title, transport, attempts, "actor-role-page"); }
  catch { return null; }
  const extract = page?.extract || "";
  const aliases = subjectAliases(record.character);
  const production = record.production || "";
  const characterWindows = matchingWindows(extract, aliases, 3);
  const productionWindows = matchingWindows(extract, [production, ...words(production)], 3);
  return {
    title: page?.title || title,
    url: pageUrl(endpoints.enwikiApi, page),
    character_windows: characterWindows,
    production_windows: productionWindows,
    explicit_character: characterWindows.length > 0,
    explicit_production: productionWindows.length > 0,
    explicit_character_and_production: characterWindows.length > 0 && productionWindows.length > 0,
  };
}

async function stillPool({ record, item, transport, attempts, endpoints, limits, actorEvidence }) {
  const aliases = subjectAliases(item.expected_subject || record.character);
  const production = record.production || "";
  const pages = new Map();
  for (const api of stillApisFor(record)) {
    const titles = [...aliases];
    const queries = [
      ...aliases.map((alias) => `"${alias}" "${production}"`),
      ...aliases.map((alias) => `${alias} ${production}`),
    ].filter((value) => value.replace(/["\s]/g, "").length);
    for (const query of queries.slice(0, 8)) for (const title of await searchPages(api, query, transport, attempts, limits.pageSearchLimit)) titles.push(title);
    for (const title of [...new Set(titles)].slice(0, limits.pageSearchLimit)) {
      let page = null;
      try { page = await queryPage(api, title, transport, attempts, `still-page:${new URL(api).host}`); }
      catch { continue; }
      if (!page || page.missing) continue;
      const key = `${api}|${page.title}`;
      if (!pages.has(key)) pages.set(key, { api, page });
    }
  }

  const candidates = new Map();
  for (const { api, page } of pages.values()) {
    const origin = pageUrl(api, page);
    const leadNames = [page.pageimage].filter(Boolean).map((value) => String(value).replace(/^File:/, ""));
    const pageFiles = (page.images || []).map((row) => String(row.title || "").replace(/^File:/, "")).filter(Boolean);
    const aliasTokens = [...new Set(aliases.flatMap((alias) => words(alias)))];
    const productionTokens = words(production);
    const relevant = pageFiles.filter((file) => {
      if (!/\.(?:jpe?g|png|webp)$/i.test(file) || NON_IMAGE.test(file)) return false;
      const text = normalize(file);
      return aliasTokens.some((word) => text.includes(word)) || productionTokens.some((word) => text.includes(word));
    });
    const files = [...new Set([...leadNames, ...relevant, ...pageFiles.filter((file) => /\.(?:jpe?g|png|webp)$/i.test(file) && !NON_IMAGE.test(file)).slice(0, 8)])].slice(0, limits.fileMetadataLimit);
    let infos = await queryImageInfos(api, files, transport, attempts, `still-imageinfo:${new URL(api).host}`);
    if (api === endpoints.enwikiApi) {
      const seen = new Set(infos.map((row) => row.file));
      const missing = files.filter((file) => !seen.has(file));
      if (missing.length) infos = [...infos, ...await queryImageInfos(endpoints.commonsApi, missing, transport, attempts, "still-commons-imageinfo")];
    }
    for (const { file, info } of infos) {
      const source = fileSource(info, origin);
      const score = subjectScore({ file, page, source, aliases, production, actorEvidence, side: "still", lead: leadNames.includes(file) });
      addCandidate(candidates, {
        file,
        source,
        score,
        method: "mediawiki-page-candidate-v2",
        page: { title: page.title, url: origin, extract_windows: matchingWindows(page.extract || "", [...aliases, production, ...words(production)], 5) },
        api,
      });
    }
    if (page.original?.source || page.thumbnail?.source) {
      const source = { url: page.original?.source || page.thumbnail?.source, original_url: page.original?.source || null, origin, width: page.original?.width || page.thumbnail?.width || null, height: page.original?.height || page.thumbnail?.height || null, mime: null, author: "", license: "", year: null, description: "", categories: "" };
      addCandidate(candidates, { file: page.pageimage || null, source, score: subjectScore({ file: page.pageimage || "", page, source, aliases, production, actorEvidence, side: "still", lead: true }), method: "mediawiki-pageimage-v2", page: { title: page.title, url: origin, extract_windows: matchingWindows(page.extract || "", [...aliases, production, ...words(production)], 5) }, api });
    }
  }
  return { aliases, production, pages: [...pages.values()].map(({ api, page }) => ({ api, title: page.title, url: pageUrl(api, page) })), candidates: [...candidates.values()].sort((a, b) => b.score - a.score) };
}

async function portraitPool({ record, item, transport, attempts, endpoints, limits }) {
  const expected = item.expected_subject || record.actor;
  const aliases = subjectAliases(expected);
  const production = record.production || "";
  const title = wikiTitle(item.canonical_link || record.link) || expected;
  const pages = [];
  let exact = null;
  try { exact = await queryPage(endpoints.enwikiApi, title, transport, attempts, "portrait-exact-page"); } catch {}
  if (exact && !exact.missing) pages.push({ api: endpoints.enwikiApi, page: exact });
  const searched = await searchPages(endpoints.enwikiApi, `"${expected}"`, transport, attempts, limits.pageSearchLimit);
  for (const searchTitle of searched) {
    if (pages.some((row) => row.page.title === searchTitle)) continue;
    try {
      const page = await queryPage(endpoints.enwikiApi, searchTitle, transport, attempts, "portrait-search-page");
      if (page && !page.missing) pages.push({ api: endpoints.enwikiApi, page });
    } catch {}
    if (pages.length >= 4) break;
  }

  const candidates = new Map();
  for (const { api, page } of pages) {
    const origin = pageUrl(api, page);
    const leadNames = [page.pageimage].filter(Boolean).map((value) => String(value).replace(/^File:/, ""));
    const files = [...new Set([...leadNames, ...(page.images || []).map((row) => String(row.title || "").replace(/^File:/, "")).filter((file) => /\.(?:jpe?g|png|webp)$/i.test(file) && !NON_IMAGE.test(file))])].slice(0, limits.fileMetadataLimit);
    let infos = await queryImageInfos(api, files, transport, attempts, "portrait-enwiki-imageinfo");
    const seen = new Set(infos.map((row) => row.file));
    const missing = files.filter((file) => !seen.has(file));
    if (missing.length) infos = [...infos, ...await queryImageInfos(endpoints.commonsApi, missing, transport, attempts, "portrait-commons-imageinfo")];
    for (const { file, info } of infos) {
      const source = fileSource(info, origin);
      addCandidate(candidates, { file, source, score: subjectScore({ file, page, source, aliases, production, actorEvidence: null, side: "portrait", lead: leadNames.includes(file) }), method: "exact-actor-page-image-v2", page: { title: page.title, url: origin, extract_windows: matchingWindows(page.extract || "", [expected, production], 4) }, api });
    }
    if (page.original?.source || page.thumbnail?.source) {
      const source = { url: page.original?.source || page.thumbnail?.source, original_url: page.original?.source || null, origin, width: page.original?.width || page.thumbnail?.width || null, height: page.original?.height || page.thumbnail?.height || null, mime: null, author: "", license: "", year: null, description: "", categories: "" };
      addCandidate(candidates, { file: page.pageimage || null, source, score: subjectScore({ file: page.pageimage || "", page, source, aliases, production, actorEvidence: null, side: "portrait", lead: true }), method: "exact-actor-pageimage-v2", page: { title: page.title, url: origin, extract_windows: matchingWindows(page.extract || "", [expected, production], 4) }, api });
    }
  }
  for (const query of [`"${expected}"`, expected]) {
    for (const { file, info } of await commonsSearch(query, transport, attempts, endpoints, 20)) {
      const source = fileSource(info, info?.descriptionurl || null);
      const pseudoPage = { title: expected, extract: "" };
      addCandidate(candidates, { file, source, score: subjectScore({ file, page: pseudoPage, source, aliases, production, actorEvidence: null, side: "portrait", lead: false }) - 10, method: "commons-name-search-v2", page: { title: "Wikimedia Commons search", url: source.origin, extract_windows: [] }, api: endpoints.commonsApi });
    }
  }
  return { aliases, production, pages: pages.map(({ api, page }) => ({ api, title: page.title, url: pageUrl(api, page) })), candidates: [...candidates.values()].sort((a, b) => b.score - a.score) };
}

async function selectDownloadable({ item, pool, out, transport, attempts, repositoryHashes, limits, magick }) {
  const screened = [];
  const tempRoot = join(out, ".pool", item.wall_id);
  await mkdir(tempRoot, { recursive: true });
  for (const [index, candidate] of pool.candidates.slice(0, limits.downloadCandidateLimit * 3).entries()) {
    if (screened.length >= limits.downloadCandidateLimit) break;
    try {
      const url = candidate.source.original_url || candidate.source.url;
      const result = await transport.request(url, { stage: `candidate-download:${item.wall_id}:${index + 1}`, attempts, accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*,*/*;q=.5", referer: candidate.source.origin || candidate.page.url, binary: true, retries: 2 });
      if (!/^image\//i.test(result.contentType) || result.bytes.length < 64) {
        attempts.push({ stage: `candidate-validate:${item.wall_id}:${index + 1}`, requested_url: url, ok: false, error: "non-image-or-empty", bytes: result.bytes.length, content_type: result.contentType });
        continue;
      }
      const extension = detectedExtension(result.contentType, result.response.url || url);
      const temp = join(tempRoot, `${String(index + 1).padStart(2, "0")}${extension}`);
      await writeFile(temp, result.bytes);
      let image;
      try { image = inspectImage(temp, magick); }
      catch (error) {
        attempts.push({ stage: `candidate-identify:${item.wall_id}:${index + 1}`, requested_url: url, ok: false, error: error.message });
        await rm(temp, { force: true });
        continue;
      }
      const digest = sha256(result.bytes);
      const duplicateMatches = repositoryHashes.get(digest) || [];
      const reason = image.width < limits.minimumWidth || image.height < limits.minimumHeight
        ? "below-minimum-dimensions"
        : duplicateMatches.length ? "canonical-byte-duplicate" : null;
      screened.push({ ...candidate, temp, extension, image, sha256: digest, bytes: result.bytes.length, duplicate_matches: duplicateMatches, prescreen_reason: reason, resolved_url: result.response.url || url });
      if (reason) continue;
      return { selected: screened[screened.length - 1], screened };
    } catch (error) {
      attempts.push({ stage: `candidate-download-error:${item.wall_id}:${index + 1}`, requested_url: candidate.source.original_url || candidate.source.url, ok: false, error: error.message });
    }
  }
  return { selected: null, screened };
}

async function discoverOne({ item, record, out, transport, endpoints, repositoryHashes, limits, magick }) {
  const attempts = [];
  const expected = item.expected_subject || (item.side === "still" ? record.character : record.actor);
  const receipt = {
    version: 2,
    wall_id: item.wall_id,
    side: item.side,
    expected_subject: expected,
    source_policy_version: 2,
    source_family: item.side === "portrait" ? "commons-multicandidate-v2" : "mediawiki-multicandidate-v2",
    canonical_link: item.canonical_link || record.link || null,
    attempts,
    canonical_write: false,
  };
  const actorEvidence = item.side === "still" ? await actorEvidenceFor(record, transport, attempts, endpoints) : null;
  const pool = item.side === "portrait"
    ? await portraitPool({ record, item, transport, attempts, endpoints, limits })
    : await stillPool({ record, item, transport, attempts, endpoints, limits, actorEvidence });
  const { selected, screened } = await selectDownloadable({ item, pool, out, transport, attempts, repositoryHashes, limits, magick });
  const sourceEvidence = {
    actor_role: actorEvidence,
    searched_pages: pool.pages,
    expected_subject_aliases: pool.aliases,
    production: pool.production,
    candidate_pool_count: pool.candidates.length,
    prescreened: screened.map((row) => ({
      file: row.file,
      page_title: row.page.title,
      page_url: row.page.url,
      source_origin: row.source.origin,
      method: row.method,
      score: row.score,
      width: row.image.width,
      height: row.image.height,
      sha256: row.sha256,
      duplicate_matches: row.duplicate_matches,
      prescreen_reason: row.prescreen_reason,
      description: row.source.description,
      categories: row.source.categories,
      page_extract_windows: row.page.extract_windows,
    })),
  };
  if (!selected) {
    const reasonCounts = Object.fromEntries([...new Set(screened.map((row) => row.prescreen_reason).filter(Boolean))].sort().map((reason) => [reason, screened.filter((row) => row.prescreen_reason === reason).length]));
    return {
      row: { wall_id: item.wall_id, side: item.side, expected_subject: expected, reason: item.reason, status: "not-found", baseline: null, candidate: null, candidate_sha256: null, discovery: { ...receipt, source_evidence: sourceEvidence, candidate_pool_count: pool.candidates.length, screened_count: screened.length, prescreen_reason_counts: reasonCounts, failure: pool.candidates.length ? "all-multicandidate-options-failed-prescreen-or-transport" : "no-source-candidates" } },
      receipt,
    };
  }
  const relative = `assets/${item.wall_id.toLowerCase()}-${item.side}${selected.extension}`;
  await mkdir(dirname(join(out, relative)), { recursive: true });
  await copyFile(selected.temp, join(out, relative));
  const candidate = {
    src: relative,
    kind: item.side === "still" ? "still" : (FREE_LICENSE.test(selected.source.license || "") ? "free" : "copyright"),
    origin: selected.source.origin || selected.page.url,
    author: selected.source.author || "",
    license: selected.source.license || "",
    ...(selected.source.year ? { year: selected.source.year } : {}),
    source_page: selected.page.url,
    source_page_title: selected.page.title,
    source_file: selected.file,
    source_method: selected.method,
    source_policy_version: 2,
    source_score: selected.score,
    width: selected.image.width,
    height: selected.image.height,
    sha256: selected.sha256,
  };
  return {
    row: { wall_id: item.wall_id, side: item.side, expected_subject: expected, reason: item.reason, status: "candidate", baseline: null, candidate, candidate_sha256: selected.sha256, discovery: { ...receipt, source_evidence: sourceEvidence, selected_candidate: { file: selected.file, page_title: selected.page.title, page_url: selected.page.url, source_origin: selected.source.origin, method: selected.method, score: selected.score, width: selected.image.width, height: selected.image.height, sha256: selected.sha256, description: selected.source.description, categories: selected.source.categories, page_extract_windows: selected.page.extract_windows }, candidate_pool_count: pool.candidates.length, screened_count: screened.length } },
    receipt,
  };
}

async function main() {
  const planPath = resolve(option("--plan"));
  const out = resolve(option("--out", "card-backfill-source-v2-candidates"));
  const journal = resolve(option("--journal", join(out, "media-search.jsonl")));
  const latest = resolve(option("--latest", join(out, "latest.json")));
  const runId = option("--run-id", "local");
  const baseline = resolve(option("--baseline", "."));
  const now = option("--now", new Date().toISOString());
  const magick = option("--magick", "magick");
  const contact = option("--contact", process.env.CONTACT || "maintainer");
  const limits = {
    pageSearchLimit: Math.max(1, Math.min(16, Math.floor(numeric("--page-limit", 10)))),
    fileMetadataLimit: Math.max(1, Math.min(60, Math.floor(numeric("--file-limit", 32)))),
    downloadCandidateLimit: Math.max(1, Math.min(12, Math.floor(numeric("--download-limit", 8)))),
    minimumWidth: Math.floor(numeric("--minimum-width", 500)),
    minimumHeight: Math.floor(numeric("--minimum-height", 400)),
  };
  const endpoints = {
    enwikiApi: option("--enwiki-api", "https://en.wikipedia.org/w/api.php"),
    commonsApi: option("--commons-api", "https://commons.wikimedia.org/w/api.php"),
  };
  const plan = await readJson(planPath);
  const specimens = await readJson(join(baseline, "data/specimens.json"));
  const byId = new Map(specimens.map((row) => [row.id, row]));
  const repositoryHashes = await buildRepositoryHashIndex(baseline);
  const transport = new Transport({ userAgent: `undercast-card-backfill-source-v2/2.0 (+https://github.com/BigBirdReturns/undercast; ${contact})`, timeoutMs: Math.floor(numeric("--timeout-ms", 30000)), delayMs: Math.floor(numeric("--delay-ms", 350)) });
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await mkdir(dirname(journal), { recursive: true });
  const results = [];
  for (const item of plan.candidates || []) {
    const record = byId.get(item.wall_id);
    if (!record) throw new Error(`missing specimen ${item.wall_id}`);
    const { row } = await discoverOne({ item, record, out, transport, endpoints, repositoryHashes, limits, magick });
    results.push(row);
    await appendFile(journal, JSON.stringify({ version: 2, op: "media-search.attempted", at: now, run_id: runId, wall_id: item.wall_id, side: item.side, source_policy_version: 2, result: row.status, candidate_sha256: row.candidate_sha256, failure: row.discovery?.failure || null }) + "\n");
    console.log(`${row.status === "candidate" ? "CANDIDATE" : "MISS"} ${item.wall_id}/${item.side} pool=${row.discovery?.candidate_pool_count || 0} screened=${row.discovery?.screened_count || 0}`);
  }
  const counts = Object.fromEntries(["candidate", "unchanged", "not-found"].map((key) => [key, results.filter((row) => row.status === key).length]));
  const report = { version: 2, generated_at: now, run_id: runId, artifact: `card-backfill-source-v2-${runId}`, source_policy_version: 2, canonical_write: false, counts, results };
  await writeJson(join(out, "report.json"), report);
  await writeJson(latest, report);
  console.log(`PASS — source policy v2 produced ${counts.candidate} candidate(s) and ${counts["not-found"]} miss(es)`);
  console.log(`OUTPUT — ${out}`);
}

main().catch((error) => { console.error(`card-backfill source v2: ${error.stack || error.message}`); process.exit(1); });
