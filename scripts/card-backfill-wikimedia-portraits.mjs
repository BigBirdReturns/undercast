#!/usr/bin/env node
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, extname, join, resolve } from "node:path";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
function flag(name) { return args.includes(name); }
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + "\n"); }
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const stripHtml = (value = "") => String(value).replace(/<[^>]+>/g, " ").replace(/&(?:nbsp|amp|quot|apos);/gi, " ").replace(/\s+/g, " ").trim();
const FREE_LICENSE = /(?:public domain|\bpd\b|cc0|cc[-\s]?by(?:[-\s]?sa)?|gfdl)/i;

function apiUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries({ action: "query", format: "json", formatversion: "2", ...params })) {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
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

function detectImage(bytes, contentType = "") {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: ".jpg" };
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: "image/png", extension: ".png" };
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return { mime: "image/webp", extension: ".webp" };
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString("ascii"))) return { mime: "image/gif", extension: ".gif" };
  const normalized = String(contentType).split(";")[0].trim().toLowerCase();
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(normalized)) return { mime: normalized, extension: normalized === "image/jpeg" ? ".jpg" : `.${normalized.split("/")[1]}` };
  return null;
}

function metadataValue(metadata, key) {
  return stripHtml(metadata?.[key]?.value || "");
}

function imageInfo(page) {
  return page?.imageinfo?.[0] || null;
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

  async request(url, { stage, attempts, accept, referer = null, binary = false, retries = 2 }) {
    let lastError = null;
    for (let retry = 0; retry <= retries; retry += 1) {
      await this.wait();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url, {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent": this.userAgent,
            Accept: accept,
            ...(referer ? { Referer: referer } : {}),
          },
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
          ...(binary ? {} : { body_excerpt: bytes.toString("utf8", 0, Math.min(bytes.length, 1200)) }),
        };
        attempts.push(receipt);
        if (response.ok) return { response, bytes, contentType, receipt };
        lastError = new Error(`${stage} HTTP ${response.status}`);
        if (![403, 408, 425, 429, 500, 502, 503, 504].includes(response.status)) break;
      } catch (error) {
        lastError = error;
        attempts.push({ stage, requested_url: String(url), retry, status: null, ok: false, error: error.name === "AbortError" ? "timeout" : error.message });
      } finally {
        clearTimeout(timer);
      }
      await sleep((retry + 1) * 500);
    }
    throw lastError || new Error(`${stage} failed`);
  }

  async json(url, options) {
    const result = await this.request(url, { ...options, accept: "application/json", binary: false });
    try { return { ...result, value: JSON.parse(result.bytes.toString("utf8")) }; }
    catch (error) {
      options.attempts.push({ stage: `${options.stage}:json-parse`, requested_url: String(url), status: result.response.status, ok: false, error: error.message });
      throw new Error(`${options.stage} returned invalid JSON`);
    }
  }
}

async function queryPage({ title, enwikiApi, transport, attempts }) {
  const url = apiUrl(enwikiApi, {
    redirects: 1,
    prop: "pageimages|pageprops",
    piprop: "name|thumbnail|original",
    pithumbsize: 1600,
    pilicense: "any",
    ppprop: "wikibase_item",
    titles: title,
  });
  const { value } = await transport.json(url, { stage: "enwiki-pageimages", attempts });
  return value?.query?.pages?.[0] || null;
}

async function queryImageFile({ api, file, transport, attempts, stage }) {
  if (!file) return null;
  const url = apiUrl(api, {
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: 1600,
    titles: `File:${file}`,
  });
  try {
    const { value } = await transport.json(url, { stage, attempts });
    const page = value?.query?.pages?.[0] || null;
    return imageInfo(page);
  } catch { return null; }
}

async function queryWikidataImage({ qid, wikidataApi, transport, attempts }) {
  if (!qid) return null;
  const url = new URL(wikidataApi);
  for (const [key, value] of Object.entries({ action: "wbgetentities", format: "json", formatversion: "2", ids: qid, props: "claims" })) url.searchParams.set(key, value);
  try {
    const { value } = await transport.json(url, { stage: "wikidata-p18", attempts });
    return value?.entities?.[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value || null;
  } catch { return null; }
}

function sourceFromInfo(info, canonicalLink, method, file) {
  const metadata = info?.extmetadata || {};
  const license = metadataValue(metadata, "LicenseShortName") || metadataValue(metadata, "License");
  const author = metadataValue(metadata, "Artist") || metadataValue(metadata, "Credit");
  const date = metadataValue(metadata, "DateTimeOriginal") || metadataValue(metadata, "DateTime");
  const year = Number((date.match(/(?:19|20)\d{2}/) || [])[0] || 0) || null;
  return {
    method,
    file: file || null,
    origin: info?.descriptionurl || canonicalLink,
    author,
    license,
    year,
    width: Number(info?.width || info?.thumbwidth || 0) || null,
    height: Number(info?.height || info?.thumbheight || 0) || null,
    mime: info?.mime || null,
  };
}

function pushUrl(list, url, source) {
  if (!url) return;
  const value = String(url);
  if (!list.some((row) => row.url === value)) list.push({ url: value, source });
}

async function discoverOne({ item, specimen, output, transport, endpoints }) {
  const attempts = [];
  const canonicalLink = item.canonical_link || specimen?.link || null;
  const expected = item.expected_subject || specimen?.actor || null;
  const title = wikiTitle(canonicalLink);
  const receipt = {
    version: 1,
    wall_id: item.wall_id,
    side: item.side,
    expected_subject: expected,
    canonical_link: canonicalLink,
    exact_page_title: title,
    source_family: "exact-canonical-wikimedia-portrait",
    attempts,
    canonical_write: false,
  };
  if (item.side !== "portrait") return { row: { wall_id: item.wall_id, side: item.side, expected_subject: expected, reason: item.reason, status: "not-found", baseline: null, candidate: null, candidate_sha256: null, discovery: { ...receipt, failure: "adapter-requires-portrait" } }, receipt };
  if (!canonicalLink || !title) return { row: { wall_id: item.wall_id, side: item.side, expected_subject: expected, reason: item.reason, status: "not-found", baseline: null, candidate: null, candidate_sha256: null, discovery: { ...receipt, failure: "missing-exact-canonical-page" } }, receipt };
  if (specimen && specimen.actor && expected && specimen.actor !== expected) throw new Error(`${item.wall_id} actor drift: ${specimen.actor} != ${expected}`);

  let page = null;
  try { page = await queryPage({ title, enwikiApi: endpoints.enwikiApi, transport, attempts }); }
  catch (error) { receipt.page_query_error = error.message; }
  const resolvedTitle = page?.title || title;
  const qid = page?.pageprops?.wikibase_item || null;
  const files = [];
  if (page?.pageimage) files.push({ file: page.pageimage, method: "enwiki-pageimage" });
  const p18 = await queryWikidataImage({ qid, wikidataApi: endpoints.wikidataApi, transport, attempts });
  if (p18 && !files.some((row) => row.file === p18)) files.push({ file: p18, method: "wikidata-p18" });

  const candidates = [];

  for (const fileRow of files) {
    const localInfo = await queryImageFile({ api: endpoints.enwikiApi, file: fileRow.file, transport, attempts, stage: `enwiki-imageinfo:${fileRow.method}` });
    const commonsInfo = localInfo || await queryImageFile({ api: endpoints.commonsApi, file: fileRow.file, transport, attempts, stage: `commons-imageinfo:${fileRow.method}` });
    const info = commonsInfo || localInfo;
    const source = sourceFromInfo(info, canonicalLink, fileRow.method, fileRow.file);
    pushUrl(candidates, info?.thumburl, source);
    pushUrl(candidates, info?.url, source);
    if (endpoints.specialFileBase) {
      const special = new URL(`${endpoints.specialFileBase.replace(/\/$/, "")}/${encodeURIComponent(fileRow.file)}`);
      special.searchParams.set("width", "1600");
      pushUrl(candidates, special, source);
    }
  }
  const pageSource = sourceFromInfo(null, canonicalLink, "enwiki-pageimages", page?.pageimage || null);
  pushUrl(candidates, page?.thumbnail?.source, pageSource);
  pushUrl(candidates, page?.original?.source, pageSource);

  let selected = null;
  for (const candidate of candidates) {
    try {
      const result = await transport.request(candidate.url, { stage: `image-download:${candidate.source.method}`, attempts, accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*,*/*;q=.5", referer: candidate.source.origin || canonicalLink, binary: true, retries: 2 });
      const detected = detectImage(result.bytes, result.contentType);
      if (!detected || result.bytes.length < 64) {
        attempts.push({ stage: `image-validate:${candidate.source.method}`, requested_url: candidate.url, ok: false, error: detected ? "image-too-small" : "unrecognized-image-bytes", bytes: result.bytes.length });
        continue;
      }
      selected = { ...candidate, ...result, detected };
      break;
    } catch (error) {
      receipt.last_download_error = error.message;
    }
  }

  if (!selected) {
    const failure = page ? (candidates.length ? "all-image-transports-failed" : "canonical-page-has-no-retrievable-portrait") : "canonical-page-query-failed";
    const row = { wall_id: item.wall_id, side: item.side, expected_subject: expected, reason: item.reason, status: "not-found", baseline: null, candidate: null, candidate_sha256: null, discovery: { ...receipt, resolved_title: resolvedTitle, wikidata_item: qid, candidate_url_count: candidates.length, failure } };
    return { row, receipt: row.discovery };
  }

  const fileName = `${item.wall_id.toLowerCase()}-portrait${selected.detected.extension}`;
  const relativePath = `images/${fileName}`;
  const absolutePath = join(output, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, selected.bytes);
  const hash = sha256(selected.bytes);
  const source = selected.source;
  const candidate = {
    src: relativePath,
    kind: FREE_LICENSE.test(source.license || "") ? "free" : "copyright",
    origin: source.origin || canonicalLink,
    author: source.author || "",
    license: source.license || "",
    ...(source.year ? { year: source.year } : {}),
    source_page: canonicalLink,
    source_file: source.file,
    source_method: source.method,
    resolved_media_url: selected.response.url || selected.url,
    detected_mime: selected.detected.mime,
    bytes: selected.bytes.length,
  };
  const discovery = { ...receipt, resolved_title: resolvedTitle, wikidata_item: qid, candidate_url_count: candidates.length, selected: { method: source.method, file: source.file, requested_url: selected.url, resolved_url: selected.response.url || selected.url, sha256: hash, bytes: selected.bytes.length, mime: selected.detected.mime, origin: candidate.origin, license: candidate.license, author: candidate.author }, failure: null };
  return { row: { wall_id: item.wall_id, side: item.side, expected_subject: expected, reason: item.reason, status: "candidate", baseline: null, candidate, candidate_sha256: hash, discovery }, receipt: discovery };
}

async function main() {
  const planPath = resolve(option("--plan"));
  const output = resolve(option("--out", "wikimedia-portrait-candidates"));
  const journalPath = resolve(option("--journal", join(output, "media-search.jsonl")));
  const latestPath = resolve(option("--latest", join(output, "latest.json")));
  const runId = option("--run-id", "local");
  const now = option("--now", new Date().toISOString());
  const timeoutMs = Number(option("--timeout-ms", "30000"));
  const delayMs = Number(option("--delay-ms", process.env.CRAWL_DELAY_MS || "350"));
  const contact = option("--contact", process.env.CONTACT || "maintainer");
  const endpoints = {
    enwikiApi: option("--enwiki-api", "https://en.wikipedia.org/w/api.php"),
    wikidataApi: option("--wikidata-api", "https://www.wikidata.org/w/api.php"),
    commonsApi: option("--commons-api", "https://commons.wikimedia.org/w/api.php"),
    specialFileBase: option("--special-file-base", "https://commons.wikimedia.org/wiki/Special:Redirect/file"),
  };
  if (![timeoutMs, delayMs].every(Number.isFinite)) throw new Error("timeout and delay must be numeric");
  const plan = await readJson(planPath);
  const specimens = await readJson(option("--specimens", "data/specimens.json"));
  const specimenById = new Map(specimens.map((row) => [row.id, row]));
  const transport = new Transport({ userAgent: `undercast-card-backfill/2.0 (+https://github.com/BigBirdReturns/undercast; ${contact})`, timeoutMs, delayMs });
  await mkdir(output, { recursive: true });
  await mkdir(dirname(journalPath), { recursive: true });
  const results = [];
  for (const item of plan.candidates || []) {
    const { row, receipt } = await discoverOne({ item, specimen: specimenById.get(item.wall_id) || null, output, transport, endpoints });
    results.push(row);
    await writeJson(join(output, "receipts", `${item.wall_id}-${item.side}.json`), receipt);
    await appendFile(journalPath, JSON.stringify({ version: 1, op: "card-backfill.wikimedia-portrait-attempted", at: now, run_id: runId, wall_id: item.wall_id, side: item.side, result: row.status, candidate_sha256: row.candidate_sha256, failure: row.discovery?.failure || null }) + "\n");
    console.log(`  ${item.wall_id} ${item.expected_subject}: ${row.status}${row.discovery?.failure ? ` (${row.discovery.failure})` : ""}`);
  }
  const counts = Object.fromEntries(["candidate", "unchanged", "not-found"].map((key) => [key, results.filter((row) => row.status === key).length]));
  const report = { version: 1, generated_at: now, run_id: runId, artifact: `card-backfill-wikimedia-portraits-${runId}`, source_family: "exact-canonical-wikimedia-portrait", canonical_write: false, counts, results };
  await writeJson(join(output, "report.json"), report);
  await writeJson(latestPath, report);
  console.log(`PASS — exact canonical Wikimedia portrait adapter: ${JSON.stringify(counts)}`);
  console.log(`OUTPUT — ${output}`);
  if (flag("--require-candidate") && counts.candidate === 0) throw new Error("adapter returned zero candidates");
}

main().catch((error) => { console.error(`card-backfill Wikimedia portraits: ${error.message}`); process.exit(1); });
