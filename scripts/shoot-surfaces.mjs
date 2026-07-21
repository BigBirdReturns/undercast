#!/usr/bin/env node
/**
 * shoot-surfaces.mjs — harvest bounded production surfaces. NO API KEY.
 *
 * A "shoot surface" is a bounded object: a production working at a named place
 * over a named window. Its interest is that it CARRIES PARTICIPANTS — the
 * performers in the scene and the crews who kept them standing — and that a
 * sourced fact about the surface (a desert location, a summer schedule, a water
 * tank) is a fact about everyone on it.
 *
 *   node scripts/shoot-surfaces.mjs --episode "The Thaw (episode)"
 *   node scripts/shoot-surfaces.mjs --category "VOY episodes" --limit 40
 *
 * Output: data/SHOOT-SURFACES.json — candidate surfaces with the exact sentence
 * that evidences each one, plus page+revision identity for every source read.
 *
 * WHAT THIS DOES NOT DO. It never writes a `conditions[]` entry on a card and
 * never asserts that a performer was hot. It harvests the *sentence a human
 * wrote about a shoot* and records where it came from. Turning "shot at Vasquez
 * Rocks in August" plus "these performers were in the scene" into "they endured
 * heat" is a composition, and the conditions vocabulary is explicit that a
 * condition may never be inferred from location imagery or costume appearance —
 * it needs a source that states the condition. This file is the evidence lane
 * that could support such a claim, not the claim.
 */
import { readFile, writeFile } from "node:fs/promises";

const API = "https://memory-alpha.fandom.com/api.php";
const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "shoot-surfaces"})`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const argOf = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const LIMIT = parseInt(argOf("--limit") || "25", 10);

let lastReq = 0;
async function mw(params) {
  const wait = Math.max(0, 600 - (Date.now() - lastReq)); if (wait) await sleep(wait); lastReq = Date.now();
  const url = API + "?" + new URLSearchParams({ format: "json", origin: "*", ...params });
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(API + " " + r.status);
      return await r.json();
    } catch (error) { lastError = error; if (attempt < 3) await sleep(attempt * 1_000); }
  }
  throw new Error(`shoot-surface source unavailable after 3 attempts: ${url}\n${lastError}`);
}

// Location and schedule vocabulary. A sentence must name a PLACE or a dated
// shooting event to become a candidate; "the crew enjoyed the script" is not a
// surface. Deliberately narrow — a missed surface costs a re-run, a false one
// pollutes an evidence lane.
const PLACE = /\b(location|on location|soundstage|stage \d+|backlot|Paramount|Vasquez Rocks|Bronson Cany|Joshua Tree|Death Valley|Mojave|Red Rock|Soledad Cany|Griffith Park|Angeles (?:National )?Forest|Lone Pine|Malibu|desert|quarry|water tank|tank stage)\b/i;
// "shooting script" and "shooting draft" are script-development language, not a
// shoot: they describe a document, and the whole point of a surface is that it
// is a place and a window that carried people.
const SCHEDULE = /\b(filmed|shot|shooting|principal photography|call time|day shoot|night shoot|second unit|reshoot)\b(?!\s+(?:script|draft|schedule was (?:written|drafted)))/i;
const SCRIPT_TALK = /\bshooting (?:script|draft)\b/i;
const WHEN = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b|\b(19|20)\d{2}\b/;
// Conditions the SOURCE itself asserts. These are the sentences that could one
// day support a conditions[] entry — recorded verbatim, never paraphrased.
const CONDITION_HINT = /\b(heat|hot|sweltering|baking|degrees|temperature|cold|freezing|snow|rain|soaked|submerged|underwater|exhaust|dehydrat|collaps|faint|heatstroke|hours in (?:the )?makeup|could not sit|couldn't sit|restricted|vision|breathe|breathing|ventilat)\b/i;

function sentences(text) {
  const flat = text
    // Memory Alpha keeps shooting dates inside date templates ({{d|15|December|1966}}).
    // Blindly stripping templates deletes exactly the WHEN signal a shoot window
    // is made of, so expand those first and strip the rest.
    .replace(/\{\{d\|([^}]*)\}\}/gi, (_, body) => " " + body.split("|").join(" ") + " ")
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/<[^>]+>/g, " ").replace(/'{2,}/g, "");
  return flat.split(/(?<=[.!?])\s+|\n(?=\*)/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 40 && s.length < 500
      // Production-timeline bullet runs ("* Filmed: * Day 1 * Day 2 ...") are
      // scaffolding, not prose about a shoot: they survive as punctuation soup
      // once templates are gone and would pass every keyword test.
      && (s.match(/\*/g) || []).length < 2
      && (s.match(/[a-z]/g) || []).length > s.length * 0.5);
}

// Background sections carry production fact; plot summary does not.
function backgroundOf(wikitext) {
  const m = wikitext.split(/\n==+\s*(?:Background information|Production|Props, makeup, and sets|Cast and characters|Story and script)\s*==+/i);
  return m.length > 1 ? m.slice(1).join("\n").split(/\n==+\s*(?:Links and references|Apocrypha|External links|Video and DVD)\s*==+/i)[0] : "";
}

async function pagesToRead() {
  const episode = argOf("--episode");
  if (episode) return [episode];
  const category = argOf("--category");
  if (!category) throw new Error("pass --episode <title> or --category <category>");
  const out = []; let cont = {};
  do {
    const j = await mw({ action: "query", list: "categorymembers", cmtitle: "Category:" + category, cmlimit: "500", cmtype: "page", ...cont });
    out.push(...(j?.query?.categorymembers || []).map((m) => m.title));
    cont = j?.continue || null;
  } while (cont && out.length < LIMIT);
  if (!out.length) throw new Error(`category ${category} returned no pages; refusing to publish a false zero`);
  return out.slice(0, LIMIT);
}

const titles = await pagesToRead();
const surfaces = [], observations = [];
for (let i = 0; i < titles.length; i += 20) {
  const j = await mw({ action: "query", prop: "revisions", rvprop: "ids|timestamp|content", rvslots: "main", titles: titles.slice(i, i + 20).join("|") });
  for (const page of Object.values(j?.query?.pages || {})) {
    const revision = page?.revisions?.[0];
    const wikitext = revision?.slots?.main?.["*"] || "";
    if (!revision?.revid) continue;
    const source = `https://memory-alpha.fandom.com/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
    observations.push({ title: page.title, pageid: page.pageid, revision: revision.revid, timestamp: revision.timestamp, source });
    const background = backgroundOf(wikitext);
    if (!background) continue;
    for (const sentence of sentences(background)) {
      if (SCRIPT_TALK.test(sentence)) continue;
      const hasPlace = PLACE.test(sentence), hasSchedule = SCHEDULE.test(sentence);
      if (!(hasPlace && hasSchedule) && !(hasSchedule && WHEN.test(sentence))) continue;
      surfaces.push({
        work: page.title.replace(/\s*\(episode\)$/, ""),
        source, pageid: page.pageid, revision: revision.revid,
        evidence: sentence,
        signals: {
          place: hasPlace, schedule: hasSchedule, dated: WHEN.test(sentence),
          states_condition: CONDITION_HINT.test(sentence),
        },
      });
    }
  }
}

const withCondition = surfaces.filter((s) => s.signals.states_condition);
const out = {
  version: 1,
  generated: new Date().toISOString().slice(0, 10),
  generator: "scripts/shoot-surfaces.mjs",
  semantics: "Candidate bounded production surfaces: a work filming at a named place or in a named window, with the exact source sentence that evidences it. A surface is not a claim about any performer. Rows whose signals.states_condition is true contain a source sentence that itself asserts a working condition and are the only rows that could ever support a specimen conditions[] entry — and only by quoting that source, never by inferring from location or costume.",
  scope: { episode: argOf("--episode"), category: argOf("--category"), pages_read: observations.length },
  counts: { surfaces: surfaces.length, source_states_condition: withCondition.length },
  observations,
  surfaces,
};
await writeFile("data/SHOOT-SURFACES.json", JSON.stringify(out, null, 1) + "\n");
console.log(`pages read: ${observations.length}  candidate surfaces: ${surfaces.length}  source-stated conditions: ${withCondition.length}`);
for (const s of withCondition.slice(0, 8)) console.log(`  [${s.work}] ${s.evidence.slice(0, 150)}`);
