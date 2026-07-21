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
 *   node scripts/census.mjs star-trek --category Ferengi
 *   node scripts/census.mjs --project-only  # rebuild projections, no network
 *
 * Output: data/CENSUS.json  [{franchise, category, character, performers[]}]
 *         data/CENSUS-COVERAGE.json  every performer-role credit and its wall IDs
 *         data/CENSUS-GAPS.json  performer-role credits NOT on the wall, ranked
 *         by how many characters they wore (multi-role performers are prime).
 *         data/CENSUS-UNRESOLVED.json  source pages with no named performer
 *
 * Scoped runs replace only that franchise/category snapshot; they never erase
 * census results for unrelated franchises. Source failures stop the run rather
 * than publishing a false zero.
 *
 * The census only DISCOVERS names; nothing lands on the wall without the usual
 * gates (Wikipedia verification in grow.mjs --drafts, then vision image audit).
 */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { normalizeCensusKey as normalize } from "./census-key.mjs";
import { performerFieldValues, namesFrom, PERSONISH, loadScope } from "./lib/census-core.mjs";

const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "census"})`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fileDigest = async (path) => digest(await readFile(path));
const args = process.argv.slice(2);
const PROJECT_ONLY = args.includes("--project-only");
const CAPTURED_AT = PROJECT_ONLY ? null : new Date().toISOString();
const observations = [];
function observePage({ cfg, cat, page, revision, source, content, disposition }) {
  if (!Number.isInteger(page?.pageid) || !Number.isInteger(revision?.revid) || !revision?.timestamp)
    throw new Error(`${cfg.label} ${cat} page ${page?.title || "unknown"} lacks revision identity`);
  observations.push({ franchise: cfg.label, category: cat, title: page.title, source, observed_at: CAPTURED_AT,
    pageid: page.pageid, revision: revision.revid, timestamp: revision.timestamp,
    content_sha256: digest(content), disposition });
}

async function observeTitles(cfg, cat, titles, disposition = "category-member") {
  for (let i = 0; i < titles.length; i += 20) {
    const j = await mw(cfg.api, { action: "query", prop: "revisions", rvprop: "ids|timestamp|content",
      rvslots: "main", titles: titles.slice(i, i + 20).join("|") });
    for (const page of Object.values(j?.query?.pages || {})) {
      const revision = page?.revisions?.[0] || {};
      const content = revision?.slots?.main?.["*"] || "";
      const source = cfg.api.replace(/api\.php$/, `wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`);
      observePage({ cfg, cat, page, revision, source, content, disposition });
    }
  }
}

// Performer-field extraction lives in lib/census-core.mjs — nesting-aware,
// exact-parameter-only, and fixture-tested (scripts/census-fixtures.mjs).

const FRANCHISES = {
  "star-trek": {
    label: "Star Trek", api: "https://memory-alpha.fandom.com/api.php",
    // full-canon scope discovered by census-scope.mjs; unioned in at run time.
    // The hand list below stays authoritative for categories not filed under
    // Category:Individuals on the source wiki (e.g. Q, Borg).
    scopeFile: "data/CENSUS-SCOPE.json",
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
  const url = base + "?" + new URLSearchParams({ format: "json", origin: "*", ...params });
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(base + " " + r.status);
      return await r.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 1_000);
    }
  }
  throw new Error(`census source unavailable after 3 attempts: ${url}\n${lastError}`);
}

// category members; walks one level of subcategories too (namespace 14)
async function categoryMembers(api, cat, depth = 0, subcategoryMode = "all") {
  const pages = []; let cont = {};
  do {
    const j = await mw(api, { action: "query", list: "categorymembers", cmtitle: "Category:" + cat, cmlimit: "500", ...cont });
    for (const m of j?.query?.categorymembers || []) {
      if (m.ns === 0) pages.push(m.title);
      else if (m.ns === 14 && depth === 0
        && (subcategoryMode === "all" || /^Category:Unnamed /i.test(m.title))) {
        pages.push(...await categoryMembers(api, m.title.replace(/^Category:/, ""), 1, subcategoryMode));
      }
    }
    cont = j?.continue || null;
  } while (cont);
  return pages;
}

// strip wiki markup from a captured actor-field value -> clean people names.
// A performer credit must LOOK like a person: 2+ capitalized words, no digits,
// no ALL-CAPS citation templates (PROSE/COMIC/TV), no story parentheticals.
// PERSONISH and namesFrom moved to lib/census-core.mjs (fixture-tested).

async function censusFranchise(key, cfg, rows, unresolvedRows, onlyCategory) {
  console.log(`\n== ${cfg.label} (${cfg.api}) ==`);
  // A declared scope file widens the hand list; a missing file falls back to
  // the hand list alone (loudly), but a present-yet-unreadable one stops the
  // run — a silently narrowed scope would publish false zeros for every
  // category it dropped.
  if (cfg.scopeFile) {
    const discovered = await loadScope(readFile, cfg.scopeFile); // ENOENT-only fallback; anything else throws
    if (discovered === null) {
      console.log(`  scope: ${cfg.scopeFile} not found — hand list only (${(cfg.categories || []).length} categories)`);
    } else {
      cfg.categories = [...new Set([...(cfg.categories || []), ...discovered])];
      console.log(`  scope: ${discovered.length} discovered + hand list -> ${cfg.categories.length} categories`);
    }
  }
  // portrayal subcategories: "Actors who have portrayed <Character>" — members are
  // the real performers, the suffix names the character they wore.
  if (cfg.portrayalPrefix) {
    let subs = [], cont = {};
    do {
      const j = await mw(cfg.api, { action: "query", list: "allcategories", acprefix: cfg.portrayalPrefix, aclimit: "500", ...cont });
      subs.push(...(j?.query?.allcategories || []).map((c) => c["*"]));
      cont = j?.continue || null;
    } while (cont);
    let people = 0;
    for (const sub of subs) {
      const character = sub.slice(cfg.portrayalPrefix.length).trim().replace(/\/Legends$/, "");
      const sourceMembers = (await categoryMembers(cfg.api, sub))
        .filter((t) => PERSONISH.test(t.replace(/\/Legends$/, "")) && !/[()\d]/.test(t));
      await observeTitles(cfg, "portrayed " + character, [...new Set(sourceMembers)]);
      const members = sourceMembers.map((t) => t.replace(/\/Legends$/, ""));
      for (const p of members) { rows.push({ franchise: cfg.label, category: "portrayed " + character, character, performers: [p], source: cfg.api }); people++; }
    }
    console.log(`  [portrayal] ${subs.length} characters, ${people} performer credits`);
  }
  // direct performer categories: every member page IS a performer
  for (const cat of (cfg.performerCategories || []).filter((cat) => !onlyCategory || normalize(cat) === normalize(onlyCategory))) {
    const people = (await categoryMembers(cfg.api, cat))
      .filter((t) => PERSONISH.test(t) && !/[()\d]/.test(t));
    await observeTitles(cfg, cat, [...new Set(people)]);
    for (const p of people) rows.push({ franchise: cfg.label, category: cat, character: "—", performers: [p], source: cfg.api });
    console.log(`  [performers] ${cat}: ${people.length} people`);
  }
  for (const cat of (cfg.categories || []).filter((cat) => !onlyCategory || normalize(cat) === normalize(onlyCategory))) {
    const pages = [...new Set(await categoryMembers(cfg.api, cat, 0, cfg.label === "Star Trek" ? "unnamed" : "all"))];
    if (!pages.length) throw new Error(`${cfg.label} category ${cat} returned no pages; refusing to publish a false zero`);
    let found = 0;
    for (let i = 0; i < pages.length; i += 20) {
      const j = await mw(cfg.api, { action: "query", prop: "revisions", rvprop: "ids|timestamp|content", rvslots: "main", titles: pages.slice(i, i + 20).join("|") });
      for (const p of Object.values(j?.query?.pages || {})) {
        // scan only the page head (infobox lives there) — actor-ish phrases in
        // body prose link to stories and planets, not people.
        const fullWikitext = p?.revisions?.[0]?.slots?.main?.["*"] || "";
        const wt = fullWikitext.split(/\n==/)[0].slice(0, 4000);
        const revision = p?.revisions?.[0] || {};
        const source = cfg.api.replace(/api\.php$/, `wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`);
        if (cfg.label === "Star Trek" && normalize(cat) === "ferengi"
          && !/\|\s*species\s*=.*\[\[Ferengi(?:\||\]\])/i.test(wt)) {
          observePage({ cfg, cat, page: p, revision, source, content: fullWikitext, disposition: "out-of-scope" });
          continue;
        }
        const performers = new Set();
        for (const value of performerFieldValues(wt)) for (const n of namesFrom(value)) performers.add(n);
        observePage({ cfg, cat, page: p, revision, source, content: fullWikitext,
          disposition: performers.size ? "credited" : "unresolved" });
        if (performers.size) {
          rows.push({ franchise: cfg.label, category: cat, character: p.title, performers: [...performers],
            performance_mode: performanceMode(fullWikitext),
            source });
          found++;
        } else {
          unresolvedRows.push({ franchise: cfg.label, category: cat, character: p.title,
            performance_mode: performanceMode(fullWikitext), source,
            reason: "source page has no credited performer field" });
        }
      }
    }
    console.log(`  ${cat}: ${pages.length} pages, ${found} with credited performers`);
  }
}

const categoryAt = args.indexOf("--category");
const onlyCategory = categoryAt >= 0 ? args[categoryAt + 1] : null;
if (categoryAt >= 0 && !onlyCategory) throw new Error("--category requires a category name");
// categoryAt is -1 when --category is absent; without the guard, categoryAt + 1
// is 0 and the first positional franchise arg is silently dropped, turning a
// scoped "census.mjs star-trek" into a full every-franchise crawl.
const requested = args.filter((arg, index) => !arg.startsWith("--") && (categoryAt < 0 || index !== categoryAt + 1));
const keys = requested.length ? requested : Object.keys(FRANCHISES);
const freshRows = [];
const freshUnresolved = [];
if (!PROJECT_ONLY) {
for (const k of keys) {
  const cfg = FRANCHISES[k];
  if (!cfg) { console.log("unknown franchise:", k, "— known:", Object.keys(FRANCHISES).join(", ")); continue; }
  await censusFranchise(k, cfg, freshRows, freshUnresolved, onlyCategory);
}
}

function performanceMode(wikitext) {
  const live = /\{\{(?:TOS|TNG|DS9|VOY|ENT|DIS|PIC|SNW|ST\d+)(?=\s*[|}])/.test(wikitext);
  const voice = /\{\{(?:TAS|LD|PRO)(?=\s*[|}])/.test(wikitext);
  if (live && voice) return "physical-and-voice";
  if (live) return "physical-prosthetic";
  if (voice) return "voice-animation";
  return "unresolved";
}
let previous = [];
try { previous = JSON.parse(await readFile("data/CENSUS.json", "utf8")); } catch {}
const targetedLabels = new Set(keys.map((key) => FRANCHISES[key]?.label).filter(Boolean));
const retained = PROJECT_ONLY ? previous : previous.filter((row) => !targetedLabels.has(row.franchise)
  || (onlyCategory && normalize(row.category) !== normalize(onlyCategory)));
const sourceByFranchise = new Map(Object.values(FRANCHISES).map((cfg) => [cfg.label, cfg.api]));
const rows = [...retained, ...freshRows].map((row) => ({ ...row, source: row.source || sourceByFranchise.get(row.franchise) || null })).sort((a, b) =>
  a.franchise.localeCompare(b.franchise) || a.category.localeCompare(b.category)
  || a.character.localeCompare(b.character) || a.performers.join().localeCompare(b.performers.join()));
if (!PROJECT_ONLY) await writeFile("data/CENSUS.json", JSON.stringify(rows, null, 1) + "\n");
let previousUnresolved = [];
try { previousUnresolved = JSON.parse(await readFile("data/CENSUS-UNRESOLVED.json", "utf8")); } catch {}
const retainedUnresolved = PROJECT_ONLY ? previousUnresolved : previousUnresolved.filter((row) => !targetedLabels.has(row.franchise)
  || (onlyCategory && normalize(row.category) !== normalize(onlyCategory)));
const unresolved = [...retainedUnresolved, ...freshUnresolved].sort((a, b) =>
  a.franchise.localeCompare(b.franchise) || a.category.localeCompare(b.category) || a.character.localeCompare(b.character));
if (!PROJECT_ONLY) await writeFile("data/CENSUS-UNRESOLVED.json", JSON.stringify(unresolved, null, 1) + "\n");

// The crawl manifest preserves source observation identity separately from the
// derived coverage projections. Scoped runs replace only their own observation
// slice, just as they do for the census snapshot itself.
if (!PROJECT_ONLY) {
  let previousManifest = { observations: [] };
  try { previousManifest = JSON.parse(await readFile("data/CENSUS-MANIFEST.json", "utf8")); } catch {}
  const retainedObservations = (previousManifest.observations || []).filter((row) =>
    !targetedLabels.has(row.franchise)
    || (onlyCategory && normalize(row.category) !== normalize(onlyCategory)));
  const mergedObservations = [...retainedObservations, ...observations].sort((a, b) =>
    a.franchise.localeCompare(b.franchise) || a.category.localeCompare(b.category)
    || a.title.localeCompare(b.title) || a.source.localeCompare(b.source));
  const manifest = {
    version: 1,
    schema: "schema/census-manifest.schema.json",
    captured_at: CAPTURED_AT,
    generator: "scripts/census.mjs",
    scope: { franchises: [...targetedLabels].sort(), category: onlyCategory || null },
    observations: mergedObservations,
    snapshots: {
      census: { path: "data/CENSUS.json", sha256: await fileDigest("data/CENSUS.json"), rows: rows.length },
      unresolved: { path: "data/CENSUS-UNRESOLVED.json", sha256: await fileDigest("data/CENSUS-UNRESOLVED.json"), rows: unresolved.length },
    },
  };
  await writeFile("data/CENSUS-MANIFEST.json", JSON.stringify(manifest, null, 1) + "\n");
}

// Diff at performer+role granularity. Having Jeffrey Combs on the wall as
// Weyoun does not cover his separate Ferengi role as Brunt.
const specimens = JSON.parse(await readFile("data/specimens.json", "utf8"));
const coverage = [];
const seen = new Set();
for (const row of rows) for (const performer of row.performers) {
  const key = [row.franchise, row.category, row.character, performer].map(normalize).join("|");
  if (seen.has(key)) continue;
  seen.add(key);
  const performerRecords = specimens.filter((record) => [record.actor, ...(record.aliases || [])]
    .some((name) => normalize(name) === normalize(performer)));
  const roleRecords = performerRecords.filter((record) => {
    const censusRole = normalize(row.character);
    const filedRoles = [record.character, ...(record.performances || []).map((item) => item.character)].map(normalize);
    return !censusRole || censusRole === "—" || filedRoles.includes(censusRole);
  });
  coverage.push({ franchise: row.franchise, category: row.category, character: row.character,
    performer, performance_mode: row.performance_mode || "unresolved", source: row.source || null,
    performer_on_wall: performerRecords.length > 0,
    role_on_wall: roleRecords.length > 0, wall_ids: roleRecords.map((record) => record.id) });
}
coverage.sort((a, b) => a.franchise.localeCompare(b.franchise) || a.category.localeCompare(b.category)
  || a.character.localeCompare(b.character) || a.performer.localeCompare(b.performer));
await writeFile("data/CENSUS-COVERAGE.json", JSON.stringify(coverage, null, 1) + "\n");

const summaryGroups = new Map();
for (const row of coverage) {
  const key = `${row.franchise}|${row.category}`;
  if (!summaryGroups.has(key)) summaryGroups.set(key, { franchise: row.franchise, category: row.category,
    credits: 0, performers: new Set(), covered_roles: 0, modes: {}, sources: new Set() });
  const group = summaryGroups.get(key);
  group.credits++;
  group.performers.add(normalize(row.performer));
  if (row.role_on_wall) group.covered_roles++;
  group.modes[row.performance_mode] = (group.modes[row.performance_mode] || 0) + 1;
  if (row.source) group.sources.add(new URL(row.source).origin);
}
for (const row of unresolved) {
  const key = `${row.franchise}|${row.category}`;
  if (!summaryGroups.has(key)) summaryGroups.set(key, { franchise: row.franchise, category: row.category,
    credits: 0, performers: new Set(), covered_roles: 0, modes: {}, sources: new Set() });
  const group = summaryGroups.get(key);
  group.unresolved_characters = (group.unresolved_characters || 0) + 1;
  if (row.source) group.sources.add(new URL(row.source).origin);
}
const summary = {
  version: 1,
  coverage_unit: "one credited performer in one designed-character role",
  scope_note: "Community-wiki snapshot. Uncredited background performers and works outside each source wiki remain unresolved; zero is never inferred from a failed source.",
  groups: [...summaryGroups.values()].map((group) => ({ franchise: group.franchise, category: group.category,
    credits: group.credits, distinct_performers: group.performers.size, covered_roles: group.covered_roles,
    missing_roles: group.credits - group.covered_roles, performance_modes: group.modes,
    unresolved_characters: group.unresolved_characters || 0,
    source_origins: [...group.sources].sort() }))
    .sort((a, b) => a.franchise.localeCompare(b.franchise) || a.category.localeCompare(b.category)),
};
await writeFile("data/CENSUS-SUMMARY.json", JSON.stringify(summary, null, 1) + "\n");

const byPerformer = new Map();
for (const row of coverage.filter((entry) => !entry.role_on_wall)) {
  const key = normalize(row.performer);
  if (!byPerformer.has(key)) byPerformer.set(key, { performer: row.performer, franchises: new Set(), characters: [], sources: [] });
  const entry = byPerformer.get(key);
  entry.franchises.add(row.franchise);
  entry.characters.push(row.character);
  if (row.source) entry.sources.push(row.source);
}
const gaps = [...byPerformer.values()]
  .map((entry) => ({ performer: entry.performer, franchises: [...entry.franchises], missing_roles: entry.characters.length,
    characters: [...new Set(entry.characters)].slice(0, 12), sources: [...new Set(entry.sources)].slice(0, 12) }))
  .sort((a, b) => b.missing_roles - a.missing_roles || a.performer.localeCompare(b.performer));
await writeFile("data/CENSUS-GAPS.json", JSON.stringify(gaps, null, 1) + "\n");

const censusPerformers = new Set(coverage.map((entry) => normalize(entry.performer))).size;
const missingRoles = coverage.filter((entry) => !entry.role_on_wall).length;
console.log(`\ncensus: ${rows.length} character rows, ${censusPerformers} distinct performers`);
console.log(`coverage: ${coverage.length - missingRoles}/${coverage.length} performer-role credits on wall`);
console.log(`gaps: ${missingRoles} roles across ${gaps.length} performers -> data/CENSUS-GAPS.json`);
console.log("top 20:", gaps.slice(0, 20).map((g) => `${g.performer}(${g.missing_roles})`).join(", "));

// A successful crawl is not enough: prove that every discovered Ferengi row
// survived into an explicit disposition before publishing the refreshed report.
if (targetedLabels.has("Star Trek") && (!onlyCategory || normalize(onlyCategory) === "ferengi")) {
  const { spawnSync } = await import("node:child_process");
  const projection = spawnSync(process.execPath, ["scripts/build-ferengi-constellation.mjs"], { stdio: "inherit" });
  if (projection.status !== 0) throw new Error(`Ferengi constellation build failed with exit ${projection.status}`);
  const gate = spawnSync(process.execPath, ["scripts/census-gate.mjs", "--write", "--accounting-only"], { stdio: "inherit" });
  if (gate.status !== 0) throw new Error(`Ferengi accounting gate failed with exit ${gate.status}`);
}
