#!/usr/bin/env node
/**
 * curate.mjs — the automated best-pair image selection. NO API KEY.
 *
 * Heuristics can't see pixels; a vision model can. This gathers the top candidate
 * MASK stills and UNMASKED faces for a batch of cards into one contact sheet, a
 * vision-capable session model looks at it and writes its picks, and `apply`
 * pins them. No human hand-curation — the model does the looking, in a batch.
 *
 *   node scripts/curate.mjs gather UC-008 UC-010 UC-067      # -> contact-sheet + manifest
 *   # (a session model views data/_curate/sheet-*.png and writes data/_curate/picks.json:
 *   #   [{"id":"UC-008","still":"m2","portrait":"f1"}]  — label per chosen candidate, or "" to skip)
 *   node scripts/curate.mjs apply                            # pins the picks
 *
 * Reads the same wiki resolution as retrieve.mjs (copied — scripts stay self-contained).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";

const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "curate"})`;
const DATA = "data/specimens.json";
const LEDGER = "data/SOURCES.json";
const IMGDIR = "images";
const DIR = process.env.CURATE_DIR || "data/_curate"; // set per-agent so parallel runs don't clobber
const WIKIPEDIA = "https://en.wikipedia.org/w/api.php";
const FREE = [/cc0/i, /public domain/i, /^\s*pd/i, /cc[-\s]?by([-\s]?sa)?/i];
const isFree = (s = "") => FREE.some((re) => re.test(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const extOf = (u) => (u.split("?")[0].match(/\.(jpe?g|png|gif|webp)$/i)?.[1] || "jpg").toLowerCase();

// ── wiki resolution (mirrors retrieve.mjs) ──
const STILL_WIKIS = { "Star Trek": "https://memory-alpha.fandom.com/api.php", "Babylon 5": "https://babylon5.fandom.com/api.php", "Farscape": "https://farscape.fandom.com/api.php", "Kaiju": "https://wikizilla.org/w/api.php" };
const FRANCHISE_WIKIS = [
  [/star wars|jedi|sith|mandalorian|wookiee|ewok|clone wars/i, "https://starwars.fandom.com/api.php"],
  [/lord of the rings|hobbit|middle.?earth|tolkien/i, "https://lotr.fandom.com/api.php"],
  [/doctor who|dalek|cyberman|tardis|sontaran/i, "https://tardis.fandom.com/api.php"],
  [/predator|yautja/i, "https://avp.fandom.com/api.php"], [/alien|xenomorph|prometheus/i, "https://avp.fandom.com/api.php"],
  [/hellboy/i, "https://hellboy.fandom.com/api.php"], [/dark crystal|gelfling|skeksis/i, "https://darkcrystal.fandom.com/api.php"],
  [/muppet|sesame street|fraggle|henson/i, "https://muppet.fandom.com/api.php"], [/power rangers|super sentai/i, "https://powerrangers.fandom.com/api.php"],
  [/ultraman/i, "https://ultra.fandom.com/api.php"], [/kamen rider/i, "https://kamenrider.fandom.com/api.php"],
  [/godzilla|gamera|mothra|ghidorah|toho|kaiju|tokusatsu/i, "https://wikizilla.org/w/api.php"], [/buffy|angel|sunnydale/i, "https://buffy.fandom.com/api.php"],
  [/harry potter|hogwarts/i, "https://harrypotter.fandom.com/api.php"], [/game of thrones|westeros/i, "https://gameofthrones.fandom.com/api.php"],
  [/planet of the apes/i, "https://planetoftheapes.fandom.com/api.php"], [/ninja turtles|\btmnt\b/i, "https://tmnt.fandom.com/api.php"],
  [/friday the 13th|jason voorhees/i, "https://fridaythe13th.fandom.com/api.php"], [/hellraiser|pinhead|cenobite/i, "https://hellraiser.fandom.com/api.php"],
  [/nightmare on elm street|freddy krueger/i, "https://elmstreet.fandom.com/api.php"], [/marvel|avengers|x-men|guardians of the galaxy/i, "https://marvelcinematicuniverse.fandom.com/api.php"],
  [/batman|superman|justice league/i, "https://dc.fandom.com/api.php"], [/star trek/i, "https://memory-alpha.fandom.com/api.php"],
  [/babylon 5/i, "https://babylon5.fandom.com/api.php"], [/farscape/i, "https://farscape.fandom.com/api.php"],
];
const apiFromHost = (h) => /(^|\.)fandom\.com$/i.test(h) ? `https://${h}/api.php` : `https://${h}/w/api.php`;
function stillApiFor(s) {
  const hay = `${s.production || ""} ${s.character || ""} ${s.universe || ""}`;
  for (const [re, api] of FRANCHISE_WIKIS) if (re.test(hay)) return api;
  try { const h = new URL(s.link).host; if (h && !/^en\.wikipedia\.org$/i.test(h)) return apiFromHost(h); } catch {}
  return STILL_WIKIS[s.universe] || null;
}
const NONPHOTO = /logo|icon|symbol|commons-|edit-|flag|star_full|ambox|question_|padlock|signature|wikimedia|wikia-|poster|\bdvd\b|\bblu-?ray\b|cover|render|select|visualization|schematic|map\b|\.svg$/i;
const LATER_VER = /lower ?decks|prodigy|\banimated\b|reboot|remaster|mirror|\bcomic\b|novel/i;
const BTS = /directing|behind|\bmakeup\b|on set|filming|storyboard|concept|\bart\b|schematic|deleted|blooper|poster|premiere|screening/i;

let lastReq = 0;
async function mw(base, params) {
  const wait = Math.max(0, 700 - (Date.now() - lastReq)); if (wait) await sleep(wait); lastReq = Date.now();
  const r = await fetch(base + "?" + new URLSearchParams({ format: "json", origin: "*", ...params }), { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(base + " " + r.status);
  return r.json();
}
async function pageImages(base, title) {
  const j = await mw(base, { action: "query", prop: "images", imlimit: "60", titles: title }).catch(() => null);
  return (Object.values(j?.query?.pages || {})[0]?.images || []).map((i) => i.title.replace(/^File:/, ""));
}
// File-namespace search — the robust cross-wiki way to find images named after a
// subject (works where prop=images/parse return nothing, e.g. Wookieepedia).
async function fileSearch(base, q) {
  const s = await mw(base, { action: "query", list: "search", srsearch: q, srnamespace: "6", srlimit: "14" }).catch(() => null);
  return (s?.query?.search || []).map((h) => h.title.replace(/^File:/, "")).filter((t) => /\.(jpe?g|png)$/i.test(t));
}
async function leadFile(base, title) {
  if (!title) return null;
  const p = await mw(base, { action: "query", prop: "pageimages", piprop: "name", titles: title }).catch(() => null);
  return Object.values(p?.query?.pages || {})[0]?.pageimage || null;
}
// all candidate files for a subject on one wiki: the page lead + page images + file-search
async function candidateFiles(base, subject, production) {
  const title = await pageTitle(base, subject, production).catch(() => null);
  const set = new Map(); // file -> base
  const lead = await leadFile(base, title); if (lead) set.set(lead, base);
  if (title) for (const f of await pageImages(base, title)) set.set(f, base);
  for (const f of await fileSearch(base, subject)) if (!set.has(f)) set.set(f, base);
  return set;
}
async function thumb(base, file, w = 300) {
  const q = await mw(base, { action: "query", prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: String(w), titles: "File:" + file }).catch(() => null);
  const info = Object.values(q?.query?.pages || {})[0]?.imageinfo?.[0];
  if (!info?.thumburl) return null;
  const m = info.extmetadata || {};
  return { file, wiki: base, url: info.thumburl, full: info.url, license: (m.LicenseShortName?.value || "").trim(), author: (m.Artist?.value || "").replace(/<[^>]+>/g, "").trim(), origin: info.descriptionurl || "" };
}
async function pageTitle(base, character, production) {
  const ex = await mw(base, { action: "query", prop: "info", titles: character }).catch(() => null);
  const ep = Object.values(ex?.query?.pages || {})[0];
  if (ep && !("missing" in ep)) return ep.title;
  const sr = await mw(base, { action: "query", list: "search", srsearch: `${character} ${production || ""}`.trim(), srlimit: "5" }).catch(() => null);
  return (sr?.query?.search || []).map((h) => h.title)[0] || null;
}
// name affinity is a SCORING bonus, not a hard filter (many good stills don't
// carry the character's name in the filename); page-scoping already ensures relevance.
function pick(files, name, { face } = {}) {
  const words = String(name || "").toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  return files.filter((t) => /\.(jpe?g|png)$/i.test(t) && !NONPHOTO.test(t))
    .map((t) => ({ t, s: (LATER_VER.test(t) ? 8 : 0) + (BTS.test(t) ? 6 : 0) + (/\.png$/i.test(t) && !face ? 2 : 0) - (words.some((w) => t.toLowerCase().includes(w)) ? 3 : 0) }))
    .sort((a, b) => a.s - b.s).slice(0, 6).map((x) => x.t);
}

async function gather(ids) {
  await mkdir(DIR, { recursive: true });
  const specimens = JSON.parse(await readFile(DATA, "utf8"));
  const manifest = [];
  const sheets = [];
  for (const id of ids) {
    const s = specimens.find((x) => x.id.toLowerCase() === id.toLowerCase());
    if (!s) { console.log("skip", id, "(no card)"); continue; }
    const entry = { id: s.id, character: s.character, actor: s.actor, still: [], portrait: [] };
    const swiki = stillApiFor(s);
    // MASK candidates: the character's images on the franchise still-wiki (if one resolves)
    // AND — universally — on Wikipedia itself. Many iconic masks (Darth Maul, Boba Fett,
    // Michael Myers, the Bride of Frankenstein…) live on the character's Wikipedia page even
    // when production/character text matches no franchise wiki. Merge both, then pick.
    if (s.kind !== "voice") {
      const files = new Map(); // file -> base wiki it lives on
      if (swiki) { try { for (const [f, b] of await candidateFiles(swiki, s.character, s.production)) files.set(f, b); } catch {} }
      try { for (const [f, b] of await candidateFiles(WIKIPEDIA, s.character, s.production)) if (!files.has(f)) files.set(f, b); } catch {}
      for (const f of pick([...files.keys()], s.character)) { const t = await thumb(files.get(f), f); if (t) entry.still.push(t); }
    }
    // FACE candidates: the actor's images from their verified Wikipedia page + file-search
    // on Wikipedia and the franchise wiki (Fandom performer photos).
    const faceMap = new Map();
    try { const u = new URL(s.link); if (/wikipedia\.org$/.test(u.host) && u.pathname.includes("/wiki/")) { const title = decodeURIComponent(u.pathname.split("/wiki/")[1]).replace(/_/g, " "); for (const f of await pageImages(WIKIPEDIA, title)) faceMap.set(f, WIKIPEDIA); } } catch {}
    for (const f of await fileSearch(WIKIPEDIA, s.actor)) if (!faceMap.has(f)) faceMap.set(f, WIKIPEDIA);
    if (swiki) for (const f of await fileSearch(swiki, s.actor)) if (!faceMap.has(f)) faceMap.set(f, swiki);
    for (const f of pick([...faceMap.keys()], s.actor, { face: true })) { const t = await thumb(faceMap.get(f), f); if (t) entry.portrait.push(t); }
    // label candidates and cache each thumbnail LOCALLY (the browser that renders the
    // contact sheet can't reach some remote hosts; node fetch here can).
    await mkdir(`${DIR}/thumbs`, { recursive: true });
    for (const [arr, pre] of [[entry.still, "m"], [entry.portrait, "f"]]) {
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i]; c.label = pre + (i + 1);
        c.local = `thumbs/${s.id.toLowerCase()}-${c.label}.${extOf(c.url)}`;
        try { const r = await fetch(c.url, { headers: { "User-Agent": UA } }); if (r.ok) await writeFile(`${DIR}/${c.local}`, Buffer.from(await r.arrayBuffer())); } catch {}
        await sleep(150);
      }
    }
    manifest.push(entry);
    sheets.push(`<section><h2>${s.id} — ${s.character} <em>/ ${s.actor}</em></h2>
      <div class="row"><div class="lab">MASK (front):</div>${entry.still.map((c) => `<figure><img src="${c.local}"><figcaption>${c.label}</figcaption></figure>`).join("") || "<i>none</i>"}</div>
      <div class="row"><div class="lab">FACE (back):</div>${entry.portrait.map((c) => `<figure><img src="${c.local}"><figcaption>${c.label} ${isFree(c.license) ? "·free" : ""}</figcaption></figure>`).join("") || "<i>none</i>"}</div>
    </section>`);
    console.log(`${s.id} ${s.character}: ${entry.still.length} mask, ${entry.portrait.length} face candidates`);
  }
  await writeFile(`${DIR}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(`${DIR}/sheet.html`, `<style>body{background:#E4DFD5;font-family:monospace;padding:16px}section{border-bottom:1px solid #999;padding:12px 0}h2{font-size:15px}em{color:#555}.row{display:flex;align-items:center;gap:8px;margin:6px 0;flex-wrap:wrap}.lab{width:110px;font-size:11px;color:#a83e30}figure{margin:0;text-align:center}img{height:150px;border:1px solid #333;display:block}figcaption{font-size:11px}</style>` + sheets.join("\n"));
  console.log(`\ncontact sheet: ${DIR}/sheet.html — render it, look, then write ${DIR}/picks.json and run: node scripts/curate.mjs apply`);
}

// download with soft-retry on Wikimedia's robot-policy 403 / rate-limit 429,
// falling back from the full-res file to the (already-proven) thumbnail URL.
async function dl(urls) {
  for (const url of urls.filter(Boolean)) {
    for (let tries = 0; tries < 3; tries++) {
      try {
        const r = await fetch(url, { headers: { "User-Agent": UA } });
        if (r.ok) return { buf: Buffer.from(await r.arrayBuffer()), url };
        if (r.status === 403 || r.status === 429) { await sleep((tries + 1) * 2500); continue; }
        break; // other errors: try next url
      } catch { await sleep((tries + 1) * 1500); }
    }
  }
  return null;
}

async function apply() {
  const manifest = JSON.parse(await readFile(`${DIR}/manifest.json`, "utf8"));
  const picks = JSON.parse(await readFile(`${DIR}/picks.json`, "utf8"));
  const specimens = JSON.parse(await readFile(DATA, "utf8"));
  let ledger = []; try { ledger = JSON.parse(await readFile(LEDGER, "utf8")); } catch {}
  for (const p of picks) {
    const s = specimens.find((x) => x.id === p.id); const man = manifest.find((m) => m.id === p.id);
    if (!s || !man) continue;
    for (const side of ["still", "portrait"]) {
      if (!p[side]) continue;
      const c = man[side].find((x) => x.label === p[side]); if (!c) { console.log("no candidate", p.id, side, p[side]); continue; }
      // store a card-sized (640px) thumbnail, NOT the full-res original — durability:
      // a flip card renders ~300px, so full-res is 10x wasted weight at scale.
      const t640 = c.file && c.wiki ? await thumb(c.wiki, c.file, 640).catch(() => null) : null;
      const got = await dl([t640?.url, c.url, c.full]); if (!got) { console.log("dl fail", c.file); continue; }
      const out = `${IMGDIR}/${s.id.toLowerCase()}-${side}.${extOf(got.url)}`;
      await writeFile(out, got.buf); await sleep(300);
      s[side] = side === "still" ? { src: out, kind: "still", origin: c.origin, pin: true }
        : { src: out, kind: isFree(c.license) ? "free" : "copyright", origin: c.origin, author: c.author, license: c.license, pin: true };
      console.log(`pinned ${s.id} ${side} = ${c.label} (${c.file})`);
    }
    const i = ledger.findIndex((r) => r.id === s.id);
    const row = i >= 0 ? ledger[i] : { id: s.id, actor: s.actor, character: s.character, universe: s.universe, still: null, portrait: null };
    row.still = s.still || row.still; row.portrait = s.portrait || row.portrait; row.fetched_at = new Date().toISOString().slice(0, 10);
    if (i >= 0) ledger[i] = row; else ledger.push(row);
  }
  await writeFile(DATA, JSON.stringify(specimens, null, 2) + "\n");
  await writeFile(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  console.log("applied. rebuild credits: node scripts/credits.mjs");
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "gather") await gather(rest);
else if (cmd === "apply") await apply();
else console.log("usage: node scripts/curate.mjs gather <UC-id...>  |  node scripts/curate.mjs apply");
