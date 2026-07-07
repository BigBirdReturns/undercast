#!/usr/bin/env node
/**
 * retrieve.mjs — the image + provenance orchestrator. NO API KEY NEEDED.
 *
 * For each specimen still missing images, it politely crawls wikis for:
 *   - a CHARACTER still (the mask / in-character shot) from the matching wiki
 *   - an ACTOR portrait from Wikipedia (with its license, if any)
 * It caches both into images/, records everything in data/SOURCES.json with a
 * `kind` on every asset (free | copyright | generated), and writes any card it
 * couldn't illustrate to data/GAPS.json — your worklist for hand/gen fills.
 *
 * This is a FAN project. It keeps character stills. It does NOT gate images out
 * on license — it labels them honestly instead. The ledger tells the truth;
 * CREDITS.md (built by credits.mjs) carries visible attribution for the free ones.
 *
 * The one hard rule here is politeness, not copyright: single-threaded, a real
 * delay between requests, an honest User-Agent, and 429 back-off. Don't hammer
 * the wikis. A slow reasonable crawl is the whole etiquette.
 *
 * Run:  node scripts/retrieve.mjs           (chips away RETRIEVE_MAX per run)
 * Env:  RETRIEVE_MAX (default 20), CONTACT (put a real email in your User-Agent)
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { existsSync } from "node:fs";

const REPO    = "https://github.com/BigBirdReturns/undercast";
const CONTACT = process.env.CONTACT || "maintainer";
const UA      = `undercast-bot/0.1 (${REPO}; ${CONTACT}) node-fetch`;
const MAX     = parseInt(process.env.RETRIEVE_MAX || "20", 10);
const DELAY   = parseInt(process.env.CRAWL_DELAY_MS || "1500", 10); // be gentle
const DATA    = "data/specimens.json";
const LEDGER  = "data/SOURCES.json";
const GAPS    = "data/GAPS.json";
const IMGDIR  = "images";

// universe -> a wiki whose lead image for a CHARACTER page is the in-character still.
// Extend this map freely; it's the obvious first thing to grow.
const STILL_WIKIS = {
  "Star Trek":  "https://memory-alpha.fandom.com/api.php",
  "Babylon 5":  "https://babylon5.fandom.com/api.php",
  "Farscape":   "https://farscape.fandom.com/api.php",
  "Kaiju":      "https://godzilla.fandom.com/api.php",
  // Film / TV / Voice / Horror are mixed franchises — add per-title logic or a
  // `wiki` hint on the specimen to cover Star Wars, LOTR, MCU, etc.
};
const WIKIPEDIA = "https://en.wikipedia.org/w/api.php";

const FREE = [/cc0/i, /public domain/i, /^\s*pd/i, /cc[-\s]?by([-\s]?sa)?/i];
const isFree = (s = "") => FREE.some((re) => re.test(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const extOf = (url) => (url.split("?")[0].match(/\.(jpe?g|png|gif|webp)$/i)?.[1] || "jpg").toLowerCase();

let lastReq = 0;
async function politeFetch(url, tries = 0) {
  const wait = Math.max(0, DELAY - (Date.now() - lastReq));
  if (wait) await sleep(wait);
  lastReq = Date.now();
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" } });
  if (r.status === 429 && tries < 4) {
    const back = (tries + 1) * 4000;
    console.log(`  429 — backing off ${back}ms`);
    await sleep(back);
    return politeFetch(url, tries + 1);
  }
  return r;
}
async function mw(base, params) {
  const url = base + "?" + new URLSearchParams({ format: "json", origin: "*", ...params });
  const r = await politeFetch(url);
  if (!r.ok) throw new Error(`${base} ${r.status}`);
  return r.json();
}
async function download(url, out) {
  if (existsSync(out)) return true; // cache: never re-fetch
  const r = await politeFetch(url);
  if (!r.ok) return false;
  await writeFile(out, Buffer.from(await r.arrayBuffer()));
  return true;
}

// lead image (thumbnail) + its filename for a page matching `query` on one wiki
async function leadImage(base, query) {
  const s = await mw(base, { action: "query", list: "search", srsearch: query, srlimit: "1" }).catch(() => null);
  const hit = s?.query?.search?.[0]?.title;
  if (!hit) return null;
  const p = await mw(base, {
    action: "query", prop: "pageimages", piprop: "thumbnail|name", pithumbsize: "640", titles: hit,
  }).catch(() => null);
  const page = Object.values(p?.query?.pages || {})[0];
  if (!page?.thumbnail?.source) return null;
  const host = new URL(base).host;
  return { title: hit, src: page.thumbnail.source, file: page.pageimage, article: `https://${host}/wiki/${encodeURIComponent(hit.replace(/ /g, "_"))}` };
}

// license/author for a File on a wiki (used to label actor portraits honestly)
async function fileMeta(base, file) {
  if (!file) return {};
  const q = await mw(base, { action: "query", prop: "imageinfo", iiprop: "extmetadata|url", titles: "File:" + file }).catch(() => null);
  const info = Object.values(q?.query?.pages || {})[0]?.imageinfo?.[0];
  const m = info?.extmetadata || {};
  return {
    license: (m.LicenseShortName?.value || m.License?.value || "").trim(),
    author: (m.Artist?.value || "").replace(/<[^>]+>/g, "").trim(),
    origin: info?.descriptionurl || "",
  };
}

async function getStill(s) {
  const wiki = STILL_WIKIS[s.universe];
  if (!wiki) return null;
  const lead = await leadImage(wiki, s.character).catch(() => null);
  if (!lead) return null;
  const out = `${IMGDIR}/${s.id.toLowerCase()}-still.${extOf(lead.src)}`;
  if (!(await download(lead.src, out))) return null;
  return { src: out, kind: "still", origin: lead.article }; // studio-copyright, shown under fan-use
}

async function getPortrait(s) {
  const lead = await leadImage(WIKIPEDIA, s.actor).catch(() => null);
  if (!lead) return null;
  const meta = await fileMeta(WIKIPEDIA, lead.file).catch(() => ({}));
  const out = `${IMGDIR}/${s.id.toLowerCase()}-portrait.${extOf(lead.src)}`;
  if (!(await download(lead.src, out))) return null;
  const free = isFree(meta.license);
  return {
    src: out,
    kind: free ? "free" : "copyright",
    origin: meta.origin || lead.article,
    author: meta.author || "",
    license: meta.license || "",
  };
}

async function main() {
  await mkdir(IMGDIR, { recursive: true });
  const specimens = JSON.parse(await readFile(DATA, "utf8"));
  let ledger = [];
  try { ledger = JSON.parse(await readFile(LEDGER, "utf8")); } catch {}
  const gaps = [];
  const todo = specimens.filter((s) => !s.still && !s.portrait).slice(0, MAX);
  console.log(`retrieving for ${todo.length} of ${specimens.length} (max ${MAX})`);

  let filled = 0;
  for (const s of todo) {
    try {
      const still = await getStill(s).catch(() => null);
      const portrait = await getPortrait(s).catch(() => null);
      if (still) s.still = still;
      if (portrait) s.portrait = portrait;

      ledger = ledger.filter((r) => r.id !== s.id);
      ledger.push({ id: s.id, actor: s.actor, character: s.character, universe: s.universe, still, portrait, fetched_at: new Date().toISOString().slice(0, 10) });

      if (still || portrait) {
        filled++;
        console.log(`  ${s.id} ${s.actor}: ${[still && "still", portrait && `portrait(${portrait.kind})`].filter(Boolean).join(" + ")}`);
      } else {
        gaps.push({ id: s.id, actor: s.actor, character: s.character, universe: s.universe });
        console.log(`  ${s.id} ${s.actor}: GAP (nothing found — gen worklist)`);
      }
    } catch (e) { console.log(`  ${s.id} error: ${e.message}`); }
  }

  await writeFile(DATA, JSON.stringify(specimens, null, 2) + "\n");
  await writeFile(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  // merge gaps with any existing outstanding ones
  let priorGaps = [];
  try { priorGaps = JSON.parse(await readFile(GAPS, "utf8")); } catch {}
  const stillGap = specimens.filter((s) => !s.still && !s.portrait).map((s) => ({ id: s.id, actor: s.actor, character: s.character, universe: s.universe }));
  await writeFile(GAPS, JSON.stringify(stillGap, null, 2) + "\n");

  console.log(`done: ${filled} illustrated this run, ${stillGap.length} gaps remain. ledger: ${ledger.length} rows.`);
}
main();
