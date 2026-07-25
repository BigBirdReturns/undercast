#!/usr/bin/env node
import { chromium } from "@playwright/test";
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
const flag = (name) => args.includes(`--${name}`);
const CONTROL = ".github/FERENGI-GOLD-RESIDUAL-PORTRAIT-ORBIT-005.json";
const OUT = option("out", process.env.OUT || "/tmp/ferengi-gold-residual-portrait-orbit-005");
const ACTOR_KEY = option("actor", process.env.ACTOR_KEY || "");
const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "bigbirdreturns@proton.me"})`;
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); };
const norm = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, " ").trim().toLowerCase();
const slug = (value) => norm(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
const esc = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const safeName = (value) => String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "source";
const sameSet = (a, b) => a.size === b.size && [...a].every((value) => b.has(value));

function signatureMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "image/gif";
  return "unknown";
}
function extensionFor(mime) { return mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : mime === "image/gif" ? "gif" : "bin"; }
function imageSize(bytes, mime) {
  if (mime === "image/png" && bytes.length >= 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (mime === "image/gif" && bytes.length >= 10) return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (mime === "image/webp" && bytes.length >= 30) {
    const kind = bytes.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (kind === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L") {
      const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
      return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
  }
  if (mime === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      const length = bytes.readUInt16BE(offset + 2);
      if (!length) break;
      offset += 2 + length;
    }
  }
  return { width: 0, height: 0 };
}
function absoluteUrl(value, base) {
  if (!value || /^(?:data|blob|javascript):/i.test(value)) return "";
  try {
    const url = new URL(String(value).replace(/&amp;/g, "&"), base);
    if (!/^https?:$/.test(url.protocol)) return "";
    url.hash = "";
    return url.href;
  } catch { return ""; }
}
function aliasesPresent(text, aliases) {
  const hay = norm(text);
  return aliases.some((alias) => hay.includes(norm(alias)));
}
function contextPresent(text, terms) {
  const hay = norm(text);
  return terms.some((term) => hay.includes(norm(term)));
}

async function fetchRetry(url, options = {}, { attempts = 3, quiet = true } = {}) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { ...options, redirect: "follow", signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      last = error;
      if (attempt < attempts) await sleep(attempt * 900);
    }
  }
  if (quiet) return null;
  throw new Error(`${url} unavailable: ${last?.message || last}`);
}

function deriveResidual(control, plan, species, specimens, media) {
  const active = (plan.sequence || []).filter((row) => ["active", "candidate-gold"].includes(row.state));
  assert(active.length === 1 && active[0].id === "ferengi", `expected Ferengi as sole active species, found ${active.map((row) => row.id).join(", ") || "none"}`);
  const taxon = (species.taxa || []).find((row) => row.key === "species:star-trek:ferengi");
  assert(taxon, "Ferengi species projection is missing");
  const specimenById = new Map(specimens.map((row) => [row.id, row]));
  const auditByKey = new Map((media.items || []).map((row) => [`${row.wall_id}|${row.side}`, row]));
  const residual = [];
  for (const record of taxon.wall_records || []) {
    const specimen = specimenById.get(record.id);
    assert(specimen, `missing Ferengi specimen ${record.id}`);
    const item = auditByKey.get(`${record.id}|portrait`);
    if (!specimen.portrait?.src || item?.status !== "verified") residual.push({ id: record.id, actor: specimen.actor, character: specimen.character, status: item?.status || "missing-audit-row" });
  }
  residual.sort((a, b) => Number(a.id.match(/\d+/)?.[0] || 0) - Number(b.id.match(/\d+/)?.[0] || 0));
  const expectedCards = new Set((control.actors || []).flatMap((actor) => actor.cards || []));
  assert(control.expected_cards === residual.length, `control expects ${control.expected_cards} residual cards, corpus has ${residual.length}`);
  assert(sameSet(expectedCards, new Set(residual.map((row) => row.id))), `residual card set drift: expected ${[...expectedCards].join(", ")}; got ${residual.map((row) => row.id).join(", ")}`);
  const actorByCard = new Map(residual.map((row) => [row.id, norm(row.actor)]));
  for (const actor of control.actors || []) for (const id of actor.cards || []) {
    assert(actorByCard.get(id) === norm(actor.actor), `${id} actor drift: ${actorByCard.get(id) || "missing"} != ${norm(actor.actor)}`);
  }
  assert(control.expected_actors === (control.actors || []).length, "control actor count drift");
  return residual;
}

async function cdxSnapshots(pattern) {
  const endpoint = `https://web.archive.org/cdx/search/cdx?${new URLSearchParams({
    url: pattern,
    output: "json",
    fl: "timestamp,original,statuscode,mimetype,digest",
    filter: "statuscode:200",
    collapse: "digest",
    limit: "6",
    from: "1998",
    to: "2026",
  })}`;
  const response = await fetchRetry(endpoint, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!response) return [];
  try {
    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length < 2) return [];
    return rows.slice(1).filter((row) => row[0] && row[1]).map((row) => ({
      url: `https://web.archive.org/web/${row[0]}id_/${row[1]}`,
      original: row[1],
      timestamp: row[0],
      mimetype: row[3] || "",
    }));
  } catch { return []; }
}

async function extractPage(context, actor, source, pageIndex) {
  const page = await context.newPage();
  const networkImages = new Set();
  page.on("response", async (response) => {
    try {
      const type = response.request().resourceType();
      const contentType = response.headers()["content-type"] || "";
      if (type === "image" || /^image\//i.test(contentType)) networkImages.add(response.url());
    } catch {}
  });
  const result = { source_page: source.url, source_kind: source.kind, source_label: source.label || source.url, page_title: "", final_url: source.url, page_identity: false, page_context: false, screenshot: null, error: null, images: [] };
  try {
    await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 55_000 });
    await page.waitForTimeout(1800);
    await page.evaluate(async () => {
      const step = Math.max(500, Math.round(innerHeight * 0.8));
      for (let y = 0; y < Math.min(document.body.scrollHeight, 12_000); y += step) { scrollTo(0, y); await new Promise((resolve) => setTimeout(resolve, 80)); }
      scrollTo(0, 0);
    }).catch(() => {});
    await page.waitForTimeout(800);
    const data = await page.evaluate(() => {
      const urls = [];
      const add = (value, meta = {}) => { if (value) urls.push({ value, ...meta }); };
      for (const meta of document.querySelectorAll('meta[property="og:image"],meta[property="og:image:secure_url"],meta[name="twitter:image"],meta[name="twitter:image:src"]')) add(meta.content, { origin: "meta", alt: meta.getAttribute("property") || meta.getAttribute("name") || "" });
      for (const img of document.images) {
        for (const name of ["currentSrc", "src"]) add(img[name], { origin: "img", alt: img.alt || img.title || "", rendered_width: img.naturalWidth || img.width || 0, rendered_height: img.naturalHeight || img.height || 0 });
        for (const name of ["data-src", "data-lazy-src", "data-original", "data-image", "data-url"]) add(img.getAttribute(name), { origin: `img-${name}`, alt: img.alt || img.title || "" });
        const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
        for (const part of srcset.split(",")) add(part.trim().split(/\s+/)[0], { origin: "srcset", alt: img.alt || img.title || "" });
      }
      let inspected = 0;
      for (const element of document.querySelectorAll("*")) {
        if (++inspected > 2500) break;
        const style = getComputedStyle(element);
        const bg = style.backgroundImage || "";
        for (const match of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) add(match[1], { origin: "css-background", alt: element.getAttribute("aria-label") || element.getAttribute("title") || "" });
      }
      const walk = (value, depth = 0) => {
        if (depth > 8 || value == null) return;
        if (typeof value === "string") {
          if (/^https?:\/\//i.test(value) && /\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(value)) add(value, { origin: "json-ld", alt: "" });
          return;
        }
        if (Array.isArray(value)) { for (const item of value) walk(item, depth + 1); return; }
        if (typeof value === "object") for (const [key, item] of Object.entries(value)) {
          if (["image", "contentUrl", "thumbnailUrl", "url"].includes(key)) walk(item, depth + 1);
          else if (depth < 4) walk(item, depth + 1);
        }
      };
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) { try { walk(JSON.parse(script.textContent || "null")); } catch {} }
      const html = document.documentElement.innerHTML;
      for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'<>\\\s]+\.(?:jpe?g|png|webp|gif)(?:\?[^"'<>\\\s]*)?/ig)) add(match[0].replace(/\\\//g, "/").replace(/&amp;/g, "&"), { origin: "html-regex", alt: "" });
      return { title: document.title, text: (document.body?.innerText || "").slice(0, 140_000), urls };
    });
    result.page_title = data.title || "";
    result.final_url = page.url();
    result.page_identity = aliasesPresent(`${result.final_url}\n${result.page_title}\n${data.text}`, actor.aliases);
    result.page_context = contextPresent(`${result.page_title}\n${data.text}`, actor.context || []);
    const screenshotName = `screens/${String(pageIndex + 1).padStart(2, "0")}-${safeName(source.kind)}-${safeName(new URL(result.final_url).hostname)}.jpg`;
    await mkdir(join(OUT, "screens"), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshotName), fullPage: true, type: "jpeg", quality: 70, timeout: 45_000 }).catch(() => null);
    result.screenshot = screenshotName;
    const seen = new Set();
    for (const row of [...data.urls, ...[...networkImages].map((value) => ({ value, origin: "network", alt: "" }))]) {
      const url = absoluteUrl(row.value, result.final_url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      result.images.push({ url, origin: row.origin || "page", alt: String(row.alt || "").slice(0, 500), rendered_width: Number(row.rendered_width || 0), rendered_height: Number(row.rendered_height || 0) });
    }
  } catch (error) {
    result.error = String(error?.message || error);
  } finally {
    await page.close().catch(() => {});
  }
  return result;
}

async function bingImageCandidates(context, actor, query, queryIndex) {
  const page = await context.newPage();
  const rows = [];
  try {
    const url = `https://www.bing.com/images/search?${new URLSearchParams({ q: query, form: "HDRSC2", first: "1", scenario: "ImageBasicHover" })}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 55_000 });
    await page.waitForTimeout(1800);
    await page.evaluate(async () => { for (let i = 0; i < 5; i++) { scrollBy(0, innerHeight * 1.2); await new Promise((resolve) => setTimeout(resolve, 280)); } }).catch(() => {});
    const extracted = await page.evaluate(() => {
      const out = [];
      for (const anchor of document.querySelectorAll("a.iusc")) {
        try {
          const m = JSON.parse(anchor.getAttribute("m") || "{}");
          out.push({ image_url: m.murl || m.turl || "", source_page: m.purl || "", title: m.t || anchor.getAttribute("aria-label") || "", thumbnail_url: m.turl || "" });
        } catch {}
      }
      return out;
    });
    for (const row of extracted) {
      const imageUrl = absoluteUrl(row.image_url, page.url());
      const sourcePage = absoluteUrl(row.source_page, page.url());
      if (!imageUrl || !sourcePage) continue;
      rows.push({ url: imageUrl, thumbnail_url: absoluteUrl(row.thumbnail_url, page.url()) || imageUrl, source_page: sourcePage, source_kind: "bing-image-search", source_label: query, page_title: row.title || "", page_identity: aliasesPresent(`${row.title}\n${sourcePage}`, actor.aliases), page_context: contextPresent(`${row.title}\n${sourcePage}`, actor.context || []), origin: `bing-query-${queryIndex + 1}`, alt: row.title || "" });
    }
  } catch {}
  finally { await page.close().catch(() => {}); }
  return rows.slice(0, 45);
}

async function bingWebLinks(context, actor, query) {
  const page = await context.newPage();
  const links = [];
  try {
    await page.goto(`https://www.bing.com/search?${new URLSearchParams({ q: query, count: "20" })}`, { waitUntil: "domcontentloaded", timeout: 55_000 });
    await page.waitForTimeout(900);
    const rows = await page.evaluate(() => [...document.querySelectorAll("li.b_algo h2 a, main a")].map((a) => ({ href: a.href, text: a.textContent || "" })).filter((row) => /^https?:/.test(row.href)));
    for (const row of rows) {
      const host = (() => { try { return new URL(row.href).hostname; } catch { return ""; } })();
      if (!host || /(?:bing\.com|microsoft\.com)$/i.test(host)) continue;
      if (!aliasesPresent(`${row.text}\n${row.href}`, actor.aliases) && !contextPresent(`${row.text}\n${row.href}`, actor.context || [])) continue;
      if (!links.includes(row.href)) links.push(row.href);
      if (links.length >= 8) break;
    }
  } catch {}
  finally { await page.close().catch(() => {}); }
  return links;
}

async function downloadCandidate(actor, candidate, index, seenHashes) {
  const url = candidate.thumbnail_url || candidate.url;
  const response = await fetchRetry(url, { headers: { "User-Agent": BROWSER_UA, Referer: candidate.source_page || "https://www.bing.com/", Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.2" } });
  if (!response) return { ...candidate, download_error: "request failed" };
  const bytes = Buffer.from(await response.arrayBuffer());
  const mime = signatureMime(bytes);
  if (bytes.length < 900 || bytes.length > 25_000_000 || mime === "unknown") return { ...candidate, download_error: `unusable bytes (${bytes.length}, ${mime}, ${response.headers.get("content-type") || "unknown"})` };
  const size = imageSize(bytes, mime);
  if (size.width && size.height && (size.width < 100 || size.height < 100)) return { ...candidate, download_error: `too small (${size.width}x${size.height})` };
  const hash = sha256(bytes);
  if (seenHashes.has(hash)) return null;
  seenHashes.add(hash);
  const extension = extensionFor(mime);
  const local = `files/${actor.key}-${String(index + 1).padStart(3, "0")}-${safeName(candidate.source_kind || candidate.origin || "candidate")}.${extension}`;
  await mkdir(join(OUT, "files"), { recursive: true });
  await writeFile(join(OUT, local), bytes);
  return { ...candidate, resolved_url: response.url || url, local, mime, bytes: bytes.length, sha256: hash, width: size.width, height: size.height };
}

async function main() {
  const [control, plan, species, specimens, media] = await Promise.all([
    readJson(CONTROL), readJson("data/STAR-TREK-GOLD.json"), readJson("data/species.json"), readJson("data/specimens.json"), readJson("data/MEDIA-AUDIT.json"),
  ]);
  assert(control.version === 1 && control.scope === "star-trek" && control.species === "ferengi", "residual portrait control scope drift");
  assert(control.reviewed_role === "second-desk", "residual portrait orbit requires second-desk authorization");
  const residual = deriveResidual(control, plan, species, specimens, media);
  console.log(`PASS — exact residual Ferengi portrait boundary: ${residual.length} cards / ${control.actors.length} performers`);
  if (flag("validate-only")) return;
  const actor = (control.actors || []).find((row) => row.key === ACTOR_KEY);
  assert(actor, `unknown or missing --actor; expected one of ${(control.actors || []).map((row) => row.key).join(", ")}`);
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: BROWSER_UA, locale: "en-US", viewport: { width: 1440, height: 1100 }, javaScriptEnabled: true });
  context.setDefaultTimeout(30_000);
  context.setDefaultNavigationTimeout(55_000);
  const sources = [];
  for (const page of actor.pages || []) sources.push({ url: page, kind: "reviewed-named-page", label: page });
  for (const pattern of actor.archive_patterns || []) {
    for (const snapshot of await cdxSnapshots(pattern)) sources.push({ url: snapshot.url, kind: "wayback-snapshot", label: `${snapshot.original} @ ${snapshot.timestamp}` });
  }
  const searchImageRows = [];
  const searchPageLinks = [];
  for (const [index, query] of (actor.queries || []).entries()) {
    searchImageRows.push(...await bingImageCandidates(context, actor, query, index));
    searchPageLinks.push(...await bingWebLinks(context, actor, query));
  }
  for (const link of [...new Set(searchPageLinks)].slice(0, 18)) sources.push({ url: link, kind: "bing-web-result", label: link });
  const pageReports = [];
  for (const [index, source] of sources.entries()) {
    console.log(`${actor.actor}: page ${index + 1}/${sources.length} ${source.url}`);
    pageReports.push(await extractPage(context, actor, source, index));
  }
  await browser.close();

  const rawCandidates = [];
  for (const report of pageReports) for (const image of report.images || []) rawCandidates.push({
    ...image,
    source_page: report.final_url || report.source_page,
    source_kind: report.source_kind,
    source_label: report.source_label,
    page_title: report.page_title,
    page_identity: report.page_identity,
    page_context: report.page_context,
    screenshot: report.screenshot,
  });
  rawCandidates.push(...searchImageRows);
  rawCandidates.sort((a, b) => {
    const rank = (row) => row.source_kind === "reviewed-named-page" ? 0 : row.source_kind === "wayback-snapshot" ? 1 : row.source_kind === "bing-web-result" ? 2 : 3;
    return rank(a) - rank(b) || Number(b.page_identity) - Number(a.page_identity) || Number(b.page_context) - Number(a.page_context) || (b.rendered_width || 0) * (b.rendered_height || 0) - (a.rendered_width || 0) * (a.rendered_height || 0);
  });
  const uniqueUrls = new Set();
  const seenHashes = new Set();
  const candidates = [];
  for (const candidate of rawCandidates) {
    if (!candidate.url || uniqueUrls.has(candidate.url)) continue;
    uniqueUrls.add(candidate.url);
    const downloaded = await downloadCandidate(actor, candidate, candidates.length, seenHashes);
    if (downloaded) candidates.push(downloaded);
    if (candidates.filter((row) => !row.download_error).length >= 100) break;
  }
  const manifest = {
    version: 1,
    scope: "star-trek",
    species: "ferengi",
    operation: control.operation,
    generated_at: new Date().toISOString(),
    control_sha256: sha256(await readFile(CONTROL)),
    actor: actor.actor,
    actor_key: actor.key,
    aliases: actor.aliases,
    cards: actor.cards,
    context: actor.context,
    residual_boundary: residual,
    source_pages: pageReports,
    candidates,
    counts: {
      source_pages_attempted: pageReports.length,
      source_pages_loaded: pageReports.filter((row) => !row.error).length,
      page_images_discovered: rawCandidates.length,
      candidates_downloaded: candidates.filter((row) => !row.download_error).length,
      candidates_rejected_at_download: candidates.filter((row) => row.download_error).length,
      exact_identity_pages: pageReports.filter((row) => row.page_identity).length,
    },
    semantics: control.semantics,
  };
  await writeJson(join(OUT, "manifest.json"), manifest);
  await writeJson(join(OUT, "summary.json"), { actor: actor.actor, cards: actor.cards, counts: manifest.counts, pages_with_errors: pageReports.filter((row) => row.error).map((row) => ({ url: row.source_page, error: row.error })) });
  const cards = candidates.map((row, index) => {
    const image = row.local ? `<img src="${esc(row.local)}" alt="">` : `<div class="missing">${esc(row.download_error || "not downloaded")}</div>`;
    return `<article>${image}<h2>${index + 1}. ${esc(actor.actor)}</h2><p><b>Source class:</b> ${esc(row.source_kind || row.origin)}<br><b>Page identity:</b> ${row.page_identity ? "yes" : "no"}<br><b>Context:</b> ${row.page_context ? "yes" : "no"}<br><b>Dimensions:</b> ${esc(`${row.width || row.rendered_width || 0}×${row.height || row.rendered_height || 0}`)}</p><p>${esc(row.page_title || row.alt || row.source_label || "")}</p><p><a href="${esc(row.source_page)}">source page</a><br><a href="${esc(row.resolved_url || row.url)}">image bytes</a></p><code>${esc(row.sha256 || row.download_error || "")}</code></article>`;
  }).join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(actor.actor)} residual portrait orbit</title><style>body{font:14px system-ui;margin:24px;background:#e9e9e9;color:#111}header{max-width:1000px;margin:auto auto 24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}article{background:#fff;border:1px solid #aaa;padding:12px}img,.missing{display:block;width:100%;height:320px;object-fit:contain;background:#222;color:#fff}.missing{display:grid;place-items:center}h2{font-size:16px}p{font-size:12px;line-height:1.45}code{font-size:10px;word-break:break-all}a{color:#0645ad}</style></head><body><header><h1>${esc(actor.actor)} — exact residual portrait orbit</h1><p>Cards: ${esc(actor.cards.join(", "))}. Candidate-only. Reject namesakes, logos, posters, role makeup, production characters, unidentified groups, and any image whose source page does not identify the expected performer.</p></header><main>${cards}</main></body></html>`;
  await writeFile(join(OUT, "sheet.html"), html);
  console.log(`${actor.actor}: ${manifest.counts.candidates_downloaded} unique candidate images retained from ${manifest.counts.source_pages_loaded}/${manifest.counts.source_pages_attempted} loaded pages`);
}

main().catch((error) => { console.error(`ferengi residual portrait orbit: ${error.message}`); process.exitCode = 1; });
