#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const CONTROL = ".github/FERENGI-GOLD-REMAINING-STILLS.json";
const API = "https://memory-alpha.fandom.com/api.php";
const OUT = process.env.OUT || "/tmp/ferengi-gold-remaining-stills";
const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "bigbirdreturns@proton.me"})`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function signatureMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.subarray(0,4).toString("ascii") === "RIFF" && bytes.subarray(8,12).toString("ascii") === "WEBP") return "image/webp";
  return "unknown";
}
function extensionFor(mime) { return mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "bin"; }
function slug(value) { return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

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

async function infoFor(file) {
  const url = `${API}?${new URLSearchParams({ format: "json", origin: "*", action: "query", prop: "imageinfo", iiprop: "url|mime|size|timestamp|sha1", titles: `File:${file}` })}`;
  const response = await fetchRetry(url, { headers: { "User-Agent": UA } }, `Memory Alpha file ${file}`);
  const payload = await response.json();
  const page = Object.values(payload?.query?.pages || {})[0];
  assert(page && !("missing" in page), `missing Memory Alpha file ${file}`);
  const info = page.imageinfo?.[0];
  assert(info?.url, `Memory Alpha file ${file} has no original URL`);
  return { page, info };
}

function originalCandidates(file, info) {
  const urls = [];
  const add = (value) => { if (value && !urls.includes(value)) urls.push(value); };
  add(info.url);
  try { const url = new URL(info.url); url.searchParams.set("format", "original"); add(url.href); } catch {}
  add(String(info.url).replace(/\/revision\/latest(?:\?.*)?$/i, ""));
  add(`https://memory-alpha.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(file)}`);
  return urls;
}

async function downloadOriginal(file, sourcePage) {
  const { page, info } = await infoFor(file);
  const failures = [];
  for (const url of originalCandidates(file, info)) {
    try {
      const response = await fetchRetry(url, {
        redirect: "follow",
        headers: { "User-Agent": UA, Referer: sourcePage, Accept: "image/jpeg,image/png,image/webp;q=0.8,*/*;q=0.1" },
      }, `original bytes for ${file}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const mime = signatureMime(bytes);
      if (bytes.length <= 512 || !["image/jpeg","image/png"].includes(mime)) {
        failures.push(`${url} -> ${bytes.length} bytes, ${mime}, ${response.headers.get("content-type") || "unknown"}`);
        continue;
      }
      return {
        bytes,
        receipt: {
          mediawiki_pageid: Number(page.pageid),
          mediawiki_title: page.title,
          source_page: sourcePage,
          imageinfo_url: info.url,
          resolved_url: response.url || url,
          original_width: Number(info.width),
          original_height: Number(info.height),
          original_timestamp: info.timestamp || null,
          mediawiki_sha1: info.sha1 || null,
          mime,
          bytes: bytes.length,
          sha256: sha256(bytes),
        },
      };
    } catch (error) { failures.push(`${url} -> ${error.message}`); }
  }
  throw new Error(`${file} produced no original JPEG/PNG: ${failures.join(" | ")}`);
}

const control = JSON.parse(await readFile(CONTROL, "utf8"));
assert(control.version === 1 && control.scope === "star-trek" && control.species === "ferengi", "remaining-still control scope drift");
assert(Array.isArray(control.entries) && control.entries.length === 4, "remaining-still control must have four cards");
await mkdir(join(OUT, "files"), { recursive: true });
const manifest = { version: 1, generated_at: new Date().toISOString(), control_sha256: sha256(await readFile(CONTROL)), entries: [] };

for (const entry of control.entries) {
  const result = { id: entry.id, actor: entry.actor, character: entry.character, mode: entry.mode, candidates: [] };
  for (const source of entry.sources) {
    const { bytes, receipt } = await downloadOriginal(source.file, source.source_page);
    const fileName = `${entry.id.toLowerCase()}-${slug(source.subject)}.${extensionFor(receipt.mime)}`;
    const output = join(OUT, "files", fileName);
    await writeFile(output, bytes);
    result.candidates.push({ subject: source.subject, file: source.file, output: `files/${fileName}`, ...receipt });
    console.log(`${entry.id} ${source.subject}: ${receipt.bytes} bytes ${receipt.sha256}`);
  }
  manifest.entries.push(result);
}
await writeFile(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const html = `<!doctype html><meta charset="utf-8"><title>Ferengi remaining still review</title><style>body{font:14px system-ui;margin:24px;background:#eee;color:#111}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}article{background:white;padding:12px;border:1px solid #aaa}img{width:100%;height:340px;object-fit:contain;background:#222}h2{font-size:18px}code{font-size:10px;word-break:break-all}</style><h1>Ferengi remaining character stills</h1><p>Candidate-only. Exact-subject visual review is required before canonical use.</p><main>${manifest.entries.flatMap(entry=>entry.candidates.map(candidate=>`<article><img src="${candidate.output}" alt=""><h2>${entry.id} · ${candidate.subject}</h2><p>${candidate.file}<br>${candidate.mime} · ${candidate.original_width}×${candidate.original_height}</p><code>${candidate.sha256}</code></article>`)).join("")}</main>`;
await writeFile(join(OUT, "sheet.html"), html);
console.log(`wrote ${manifest.entries.length} card groups to ${OUT}`);
