#!/usr/bin/env node
/**
 * ingest.mjs — KEYLESS lead harvester. The 20-year top-of-funnel.
 *
 * It walks a curated set of wiki categories that skew heavily toward performers
 * who vanish under a designed face (tokusatsu suit actors, kaiju casts, …),
 * dedups every name against the wall AND against the existing queue, and appends
 * the new ones to data/CANDIDATES.json.
 *
 * IMPORTANT — a candidate is a LEAD, not a card. Category membership can't tell
 * "disappeared under a built face" from "played the lead with his own face," so
 * nothing here ever lands on the wall automatically. The queue is a worklist:
 * grow.mjs (or a human in a coding session) verifies each lead, decides whether
 * it truly qualifies, writes the rich card, and drops it from the queue. Honesty
 * over volume — same rule as the rest of the project.
 *
 * Add sources freely: the whole point is that this runs for years and the source
 * list grows. Each source declares the shelf its leads most likely belong to.
 *
 * Run:  node scripts/ingest.mjs            (adds up to INGEST_MAX new leads)
 *       node scripts/ingest.mjs --audit    (queue stats, no network)
 * Env:  INGEST_MAX (default 300), CRAWL_DELAY_MS (default 1200), CONTACT
 */
import { readFile, writeFile } from "node:fs/promises";

const REPO    = "https://github.com/BigBirdReturns/undercast";
const CONTACT = process.env.CONTACT || "maintainer";
const UA      = `undercast/0.1 (+${REPO}; ${CONTACT})`;
const MAX     = parseInt(process.env.INGEST_MAX || "300", 10);
const DELAY   = parseInt(process.env.CRAWL_DELAY_MS || "1200", 10);
const DATA    = "data/specimens.json";
const QUEUE   = "data/CANDIDATES.json";

// Curated, precision-first. Ship a source only after confirming its members are
// mostly designed-face performers. `universe` is the shelf a lead most likely
// belongs to; the triage step can always reassign it.
const SOURCES = [
  { api: "https://kamenrider.fandom.com/api.php", category: "Suit_Actors", universe: "Kaiju", note: "tokusatsu suit performers — high precision" },
  { api: "https://wikizilla.org/w/api.php",       category: "Actors",      universe: "Kaiju", note: "kaiju casts — includes some lead actors, triage filters them" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm  = (s) => String(s || "").trim().toLowerCase();
const today = () => new Date().toISOString().slice(0, 10);

let lastReq = 0;
async function politeFetch(url, tries = 0) {
  const wait = Math.max(0, DELAY - (Date.now() - lastReq));
  if (wait) await sleep(wait);
  lastReq = Date.now();
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (r.status === 429 && tries < 4) { await sleep((tries + 1) * 4000); return politeFetch(url, tries + 1); }
  return r;
}

// looks like a person's name, not a wiki namespace / template / list / stage handle
function looksLikeName(title) {
  if (!title || title.length < 3 || title.length > 60) return false;
  if (title.includes(":")) return false;                          // Template:, Category:, File:…
  if (/^(List|Index|Template|Category|File|Help|User|Talk|Portal|Module|MediaWiki)\b/i.test(title)) return false;
  if (/\b(filmography|list of|characters?|episodes?)\b/i.test(title)) return false;
  if (!/[A-Za-z]/.test(title)) return false;                      // pure numbers/symbols
  if (/^[A-Z0-9]+$/.test(title.replace(/\s/g, ""))) return false; // all-caps handles like "AFRO", "2700"
  return true;
}

async function categoryMembers(api, category) {
  const out = [];
  let cont = null, pages = 0;
  do {
    const params = { format: "json", origin: "*", action: "query", list: "categorymembers",
      cmtitle: "Category:" + category, cmtype: "page", cmlimit: "500" };
    if (cont) params.cmcontinue = cont;
    const url = api + "?" + new URLSearchParams(params);
    const r = await politeFetch(url);
    if (!r.ok) break;
    const j = await r.json().catch(() => null);
    for (const m of j?.query?.categorymembers || []) if (looksLikeName(m.title)) out.push(m.title);
    cont = j?.continue?.cmcontinue || null;
  } while (cont && ++pages < 10);
  return out;
}

async function audit() {
  let queue = [];
  try { queue = JSON.parse(await readFile(QUEUE, "utf8")); } catch {}
  console.log(`ingest queue: ${queue.length} leads awaiting triage`);
  const byUni = {}, bySrc = {};
  for (const c of queue) { byUni[c.universe] = (byUni[c.universe] || 0) + 1; bySrc[c.source] = (bySrc[c.source] || 0) + 1; }
  console.log("by shelf:", byUni);
  console.log("by source:", bySrc);
}

async function main() {
  if (process.argv.includes("--audit")) return audit();

  const specimens = JSON.parse(await readFile(DATA, "utf8"));
  let queue = [];
  try { queue = JSON.parse(await readFile(QUEUE, "utf8")); } catch {}

  // dedup universe: everyone already on the wall, plus everyone already queued
  const seen = new Set([...specimens.map((s) => norm(s.actor)), ...queue.map((c) => norm(c.name))]);
  let added = 0;

  for (const src of SOURCES) {
    if (added >= MAX) break;
    const host = new URL(src.api).host;
    let names = [];
    try { names = await categoryMembers(src.api, src.category); }
    catch (e) { console.log(`  ${host}/${src.category}: error ${e.message}`); continue; }
    let fresh = 0;
    for (const name of names) {
      if (added >= MAX) break;
      if (seen.has(norm(name))) continue;
      seen.add(norm(name));
      queue.push({ name, universe: src.universe, source: `${host}:${src.category}`,
        wiki: `https://${host}/wiki/${encodeURIComponent(name.replace(/ /g, "_"))}`, first_seen: today() });
      added++; fresh++;
    }
    console.log(`  ${host}/${src.category}: ${names.length} members, +${fresh} new leads`);
  }

  await writeFile(QUEUE, JSON.stringify(queue, null, 2) + "\n");
  console.log(`done: +${added} leads this run. queue now ${queue.length}. Triage with grow.mjs or by hand — leads are NOT on the wall.`);
}
main();
