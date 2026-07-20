#!/usr/bin/env node
/**
 * census-scope.mjs — discover the FULL Star Trek census scope. NO API KEY.
 *
 * Walks Memory Alpha's Category:Individuals subcategory tree — the wiki's own
 * complete index of individuals by kind (every species, plus Holograms,
 * Androids, Borg drones, and the one-off "X's species" categories) — and
 * writes the resolved category scope to data/CENSUS-SCOPE.json with a stated
 * reason for every exclusion. census.mjs unions this scope into its star-trek
 * hand list when the file exists; the hand list remains authoritative for
 * categories not filed under Individuals (e.g. Q, Borg).
 *
 *   node scripts/census-scope.mjs           # -> data/CENSUS-SCOPE.json
 *
 * The scope only names categories. The census crawl still owns page-level
 * dispositions, and nothing lands on the wall without the usual gates
 * (Wikipedia verification in grow.mjs --drafts, then vision image audit).
 * Exclusion here is a receipt, never a silent drop: when in doubt a category
 * stays IN and its characters resolve as credited/unresolved rows downstream.
 */
import { writeFile } from "node:fs/promises";

const API = "https://memory-alpha.fandom.com/api.php";
const PARENT = "Individuals";
const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "census-scope"})`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every rule names its reason; the resolved scope file carries both lists so a
// reviewer can audit what was fenced out and why without re-running discovery.
const EXCLUSIONS = [
  [(c) => /^Memory Alpha /i.test(c), "wiki maintenance category, not canon individuals"],
  [(c) => c === "Individuals (retconned)", "retconned out of canon by the source wiki"],
  [(c) => c === "Fictional characters", "in-universe fictional persons; performers appear in period costume, not under designed faces — designed exceptions surface via their kind categories (Holograms, Androids)"],
  [(c) => c === "Humans", "performers appearing as themselves; designed-face human-adjacent roles surface via kind categories (Holograms, Androids, Chameloids)"],
  [(c) => ["Cats", "Dogs", "Horses", "Ferrets", "Fish", "Rabbits", "Elephants", "Rhinos",
    "Pets", "Whales", "Spiders", "Targs", "Sehlats", "Set'leths", "Tribbles"].includes(c),
  "portrayed by live animals, props, or CG; no performer under a designed face"],
];

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
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 1_000);
    }
  }
  throw new Error(`scope source unavailable after 3 attempts: ${url}\n${lastError}`);
}

// all ns-14 subcategories of the parent, continuation-safe
const subcategories = [];
let cont = {};
do {
  const j = await mw({ action: "query", list: "categorymembers", cmtitle: "Category:" + PARENT, cmlimit: "500", cmtype: "subcat", ...cont });
  subcategories.push(...(j?.query?.categorymembers || []).map((m) => m.title.replace(/^Category:/, "")));
  cont = j?.continue || null;
} while (cont);
if (!subcategories.length) throw new Error(`Category:${PARENT} returned no subcategories; refusing to publish an empty scope`);

// page counts, batched — an article-less category would trip the census crawl's
// false-zero guard mid-run, so emptiness is recorded here as its own exclusion.
const pageCount = new Map(), subcatCount = new Map();
for (let i = 0; i < subcategories.length; i += 50) {
  const j = await mw({ action: "query", prop: "categoryinfo", titles: subcategories.slice(i, i + 50).map((c) => "Category:" + c).join("|") });
  for (const p of Object.values(j?.query?.pages || {}))
    pageCount.set(p.title.replace(/^Category:/, ""), p.categoryinfo?.pages || 0);
}
// Only "Unnamed X" subcategories are content-bearing to the census walker (it
// recurses into exactly those); image galleries and other subcats are not, and
// counting them would keep article-less categories that trip the crawl's
// false-zero guard.
for (const category of subcategories) {
  if (pageCount.get(category)) continue;
  const j = await mw({ action: "query", list: "categorymembers", cmtitle: "Category:" + category, cmtype: "subcat", cmlimit: "500" });
  const unnamed = (j?.query?.categorymembers || []).filter((m) => /^Category:Unnamed /i.test(m.title)).length;
  subcatCount.set(category, unnamed);
}

const included = [], excluded = [];
// The parent itself carries directly-filed individuals (and the Unnamed
// individuals tree, which the census walker recurses into) — keep it in scope.
included.push({ category: PARENT, pages: null, note: "directly-filed individuals + Unnamed individuals tree" });
for (const category of subcategories) {
  const pages = pageCount.get(category) ?? 0;
  const rule = EXCLUSIONS.find(([test]) => test(category));
  // pages counts only direct articles — a species whose individuals are all
  // background performers lives entirely in an "Unnamed X" subcategory the
  // census walker recurses into (Zaranites, Tosk, Ba'Neth), so a category is
  // empty only when it has neither articles nor subcategories.
  if (rule) excluded.push({ category, pages, reason: rule[1] });
  else if (!pages && !subcatCount.get(category)) excluded.push({ category, pages, reason: "no article members or subcategories at discovery time; rediscovery picks it up if populated" });
  else included.push({ category, pages });
}

const scope = {
  version: 1,
  captured_at: new Date().toISOString(),
  generator: "scripts/census-scope.mjs",
  api: API,
  parent: "Category:" + PARENT,
  semantics: "Discovered Star Trek census categories. census.mjs unions `included` into its star-trek hand list; every exclusion states its reason. Page counts are discovery-time snapshots, not contracts.",
  included: included.sort((a, b) => a.category.localeCompare(b.category)),
  excluded: excluded.sort((a, b) => a.category.localeCompare(b.category)),
};
await writeFile("data/CENSUS-SCOPE.json", JSON.stringify(scope, null, 1) + "\n");
console.log(`scope: ${included.length} categories in, ${excluded.length} out -> data/CENSUS-SCOPE.json`);
console.log(`pages in scope (excl. parent): ${included.reduce((n, r) => n + (r.pages || 0), 0)}`);
for (const row of excluded) console.log(`  out: ${row.category} (${row.pages}) — ${row.reason}`);
