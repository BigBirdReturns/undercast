#!/usr/bin/env node
/**
 * census.mjs — the game trail. NO API KEY.
 *
 * For every major franchise on the wall, walk the franchise wiki's species /
 * character categories, read each character page's infobox, and extract every
 * credited performer. That is the ground-truth roster of "who wore the face" —
 * per race, per franchise — straight from the fan wikis' own books.
 *
 *   node scripts/census.mjs                 # all franchises -> data/CENSUS.json
 *   node scripts/census.mjs star-trek       # one franchise
 *
 * Output: data/CENSUS.json  [{franchise, category, character, performers[]}]
 *         data/CENSUS-GAPS.json  performers NOT on the wall, ranked by how many
 *         characters they wore (multi-role performers are prime UNDERCAST).
 *
 * The census only DISCOVERS names; nothing lands on the wall without the usual
 * gates (Wikipedia verification in grow.mjs --drafts, then vision image audit).
 */
import { readFile, writeFile } from "node:fs/promises";

const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "census"})`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Actor-ish infobox fields, in rough order of trust. Different wikis use
// different keys; all of these mean "the human behind the character".
const ACTOR_FIELDS = /\|\s*(actor|actors|performer|performers|played ?by|portrayed ?by|suit ?actor|main ?actor|voice ?actor)\s*=\s*([^\n]+)/gi;

const FRANCHISES = {
  "star-trek": {
    label: "Star Trek", api: "https://memory-alpha.fandom.com/api.php",
    categories: ["Klingons", "Cardassians", "Vulcans", "Romulans", "Bajorans", "Ferengi",
      "Borg", "Andorians", "Trill", "Vorta", "Jem'Hadar", "Talaxians", "Ocampa", "Hirogen",
      "Kazon", "Xindi", "Suliban", "Denobulans", "Tellarites", "Orions", "Gorn", "Betazoids",
      "Changelings", "Bolians", "Benzites", "El-Aurians", "Kelpiens", "Vidiians", "Breen",
      "Lurians", "Nausicaans", "Hupyrians", "Species 8472", "Q"],
  },
  "doctor-who": {
    label: "Doctor Who", api: "https://tardis.fandom.com/api.php",
    // Tardis wiki is in-universe-heavy; only these categories carry actor credits
    categories: ["Daleks", "Cybermen", "Sontarans", "Ice Warriors"],
  },
  "kaiju": {
    label: "Kaiju", api: "https://wikizilla.org/w/api.php",
    // these wikis keep the purest trail of all: the performers ARE the category
    performerCategories: ["Suit Actors", "Actors"],
  },
  "muppets": {
    label: "Muppets & Henson", api: "https://muppet.fandom.com/api.php",
    categories: ["Muppet Show Characters", "Sesame Street Characters", "Fraggle Rock Characters",
      "Dark Crystal Characters", "Labyrinth Characters", "Muppets Tonight Characters"],
  },
  "power-rangers": {
    label: "Power Rangers", api: "https://powerrangers.fandom.com/api.php",
    categories: ["Rangers", "PR Villains"],
  },
  "tokusatsu": {
    label: "Tokusatsu", api: "https://ultra.fandom.com/api.php",
    performerCategories: ["Suit Actors", "Actors who appeared in Kamen Rider",
      "Actors who appeared in Super Sentai", "Actors who appeared in Garo",
      "Actors who appeared in Metal Heroes", "Actors who appeared in Godzilla"],
  },
  "star-wars": {
    label: "Star Wars", api: "https://starwars.fandom.com/api.php",
    // Wookieepedia keys performers under "Actors who have portrayed <Character>"
    // subcategories — the members are the real people; the suffix is the character.
    portrayalPrefix: "Actors who have portrayed",
    performerCategories: ["Puppeteers"],
  },
};

let lastReq = 0;
async function mw(base, params) {
  const wait = Math.max(0, 600 - (Date.now() - lastReq)); if (wait) await sleep(wait); lastReq = Date.now();
  const r = await fetch(base + "?" + new URLSearchParams({ format: "json", origin: "*", ...params }), { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(base + " " + r.status);
  return r.json();
}

// category members; walks one level of subcategories too (namespace 14)
async function categoryMembers(api, cat, depth = 0) {
  const pages = []; let cont = {};
  do {
    const j = await mw(api, { action: "query", list: "categorymembers", cmtitle: "Category:" + cat, cmlimit: "500", ...cont }).catch(() => null);
    for (const m of j?.query?.categorymembers || []) {
      if (m.ns === 0) pages.push(m.title);
      else if (m.ns === 14 && depth === 0) pages.push(...await categoryMembers(api, m.title.replace(/^Category:/, ""), 1));
    }
    cont = j?.continue || null;
  } while (cont);
  return pages;
}

// strip wiki markup from a captured actor-field value -> clean people names.
// A performer credit must LOOK like a person: 2+ capitalized words, no digits,
// no ALL-CAPS citation templates (PROSE/COMIC/TV), no story parentheticals.
const PERSONISH = /^[A-ZÀ-Þ][a-zà-þ'.\-]+(?: [A-ZÀ-Þ][A-Za-zà-þ'.\-]*)+$/;
function namesFrom(value) {
  const links = [...value.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)?\]\]/g)]
    .map((m) => m[1].trim().replace(/\s*\((actor|actress|performer|puppeteer|Dalek operator)\)$/i, ""));
  return links.filter((n) => n && !/^(File|Image|Category|w:c:|Template):/i.test(n)
    && !/[()\d]/.test(n) && n !== n.toUpperCase()
    && !/uncredited|unknown|various|see below/i.test(n)
    && PERSONISH.test(n) && n.length < 40);
}

async function censusFranchise(key, cfg, rows) {
  console.log(`\n== ${cfg.label} (${cfg.api}) ==`);
  // portrayal subcategories: "Actors who have portrayed <Character>" — members are
  // the real performers, the suffix names the character they wore.
  if (cfg.portrayalPrefix) {
    let subs = [], cont = {};
    do {
      const j = await mw(cfg.api, { action: "query", list: "allcategories", acprefix: cfg.portrayalPrefix, aclimit: "500", ...cont }).catch(() => null);
      subs.push(...(j?.query?.allcategories || []).map((c) => c["*"]));
      cont = j?.continue || null;
    } while (cont);
    let people = 0;
    for (const sub of subs) {
      const character = sub.slice(cfg.portrayalPrefix.length).trim().replace(/\/Legends$/, "");
      const members = (await categoryMembers(cfg.api, sub).catch(() => []))
        .filter((t) => PERSONISH.test(t.replace(/\/Legends$/, "")) && !/[()\d]/.test(t))
        .map((t) => t.replace(/\/Legends$/, ""));
      for (const p of members) { rows.push({ franchise: cfg.label, category: "portrayed " + character, character, performers: [p] }); people++; }
    }
    console.log(`  [portrayal] ${subs.length} characters, ${people} performer credits`);
  }
  // direct performer categories: every member page IS a performer
  for (const cat of cfg.performerCategories || []) {
    const people = (await categoryMembers(cfg.api, cat).catch(() => []))
      .filter((t) => PERSONISH.test(t) && !/[()\d]/.test(t));
    for (const p of people) rows.push({ franchise: cfg.label, category: cat, character: "—", performers: [p] });
    console.log(`  [performers] ${cat}: ${people.length} people`);
  }
  for (const cat of cfg.categories || []) {
    const pages = await categoryMembers(cfg.api, cat).catch(() => []);
    if (!pages.length) { console.log(`  ${cat}: 0 pages (category missing or empty — skipped)`); continue; }
    let found = 0;
    for (let i = 0; i < pages.length; i += 20) {
      const j = await mw(cfg.api, { action: "query", prop: "revisions", rvprop: "content", rvslots: "main", titles: pages.slice(i, i + 20).join("|") }).catch(() => null);
      for (const p of Object.values(j?.query?.pages || {})) {
        // scan only the page head (infobox lives there) — actor-ish phrases in
        // body prose link to stories and planets, not people.
        const wt = (p?.revisions?.[0]?.slots?.main?.["*"] || "").split(/\n==/)[0].slice(0, 4000);
        const performers = new Set();
        for (const m of wt.matchAll(ACTOR_FIELDS)) for (const n of namesFrom(m[2])) performers.add(n);
        if (performers.size) { rows.push({ franchise: cfg.label, category: cat, character: p.title, performers: [...performers] }); found++; }
      }
    }
    console.log(`  ${cat}: ${pages.length} pages, ${found} with credited performers`);
  }
}

const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FRANCHISES);
const rows = [];
for (const k of keys) {
  const cfg = FRANCHISES[k];
  if (!cfg) { console.log("unknown franchise:", k, "— known:", Object.keys(FRANCHISES).join(", ")); continue; }
  await censusFranchise(k, cfg, rows);
}
await writeFile("data/CENSUS.json", JSON.stringify(rows, null, 1) + "\n");

// diff against the wall -> ranked gap list
const specimens = JSON.parse(await readFile("data/specimens.json", "utf8"));
const have = new Set(specimens.map((s) => s.actor.toLowerCase().trim()));
const byPerformer = new Map();
for (const r of rows) for (const p of r.performers) {
  const k = p.toLowerCase().trim();
  if (!byPerformer.has(k)) byPerformer.set(k, { performer: p, franchises: new Set(), characters: [] });
  const e = byPerformer.get(k); e.franchises.add(r.franchise); e.characters.push(r.character);
}
const gaps = [...byPerformer.values()].filter((e) => !have.has(e.performer.toLowerCase().trim()))
  .map((e) => ({ performer: e.performer, franchises: [...e.franchises], roles: e.characters.length, characters: e.characters.slice(0, 8) }))
  .sort((a, b) => b.roles - a.roles);
await writeFile("data/CENSUS-GAPS.json", JSON.stringify(gaps, null, 1) + "\n");

const censusPerformers = byPerformer.size;
console.log(`\ncensus: ${rows.length} characters with credited performers, ${censusPerformers} distinct performers`);
console.log(`gaps (not on the wall): ${gaps.length}  ->  data/CENSUS-GAPS.json (ranked by roles worn)`);
console.log("top 20:", gaps.slice(0, 20).map((g) => `${g.performer}(${g.roles})`).join(", "));
