#!/usr/bin/env node
/**
 * ds9-graph.mjs — the DS9 relationship graph, built on the canonical roster.
 *
 * Two kinds of output, kept distinct:
 *   projections/  — mechanical VIEWS over the raw crawl: portrayal (performer↔
 *                   character), species, and five regex-selected power blocs.
 *                   These are not claims about how characters relate; they are
 *                   filters. They live in projections.json.
 *   relationships — actual, explicitly-predicated relationship charts, each edge
 *                   separately cited: parent_of / sibling_of / spouse_of (from
 *                   character infoboxes), member_of (House / family / organization),
 *                   host_of (Trill symbiont → hosts), succeeded_by (Weyoun clones),
 *                   commands (Dominion doctrine), allied_with (Dominion War
 *                   coalitions). These live in relationships.json.
 *
 *   node scripts/ds9-graph.mjs            # crawl character + doctrine pages
 *   node scripts/ds9-graph.mjs --project-only  # rebuild projections from nodes/edges
 *
 * Nothing here is inferred from prose narrative: an edge exists only where the
 * wiki states the relationship as an infobox field, a category, or a named
 * doctrine/belligerent list, and the edge carries that citation.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { normalizeCensusKey as normalize } from "./census-key.mjs";

const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "ds9-graph"})`;
const API = "https://memory-alpha.fandom.com/api.php";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const args = process.argv.slice(2);
const PROJECT_ONLY = args.includes("--project-only");
const CAPTURED_AT = PROJECT_ONLY ? null : new Date().toISOString();
const wikiUrl = (title) => `https://memory-alpha.fandom.com/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
const catUrl = (cat) => wikiUrl("Category:" + cat);

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
  throw new Error(`DS9 graph source unavailable after 3 attempts: ${url}\n${lastError}`);
}

// links inside one infobox field value. Parenthetical annotations and templates
// ("(joined in [[2286]])", "{{small|(briefly)}}") carry dates/homeworlds, never
// the value itself, so strip them before pulling the real links.
const fieldLinks = (value) => [...value.replace(/\([^)]*\)/g, "").replace(/\{\{[^}]*\}\}/g, "")
  .matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g)]
  .map((m) => m[1].trim()).filter((t) => t && !/^(File|Image|Category):/i.test(t));
const infoboxField = (wt, field) => {
  const m = wt.match(new RegExp("\\|\\s*" + field + "\\s*=\\s*([^\\n]+)", "i"));
  return m ? m[1] : "";
};

// Memory Alpha's species categories (plural) mapped to the canonical species.
const SPECIES_CATEGORIES = {
  "Bajorans": "Bajoran", "Cardassians": "Cardassian", "Ferengi": "Ferengi", "Klingons": "Klingon",
  "Trill": "Trill", "Vorta": "Vorta", "Jem'Hadar": "Jem'Hadar", "Changelings": "Changeling",
  "Vulcans": "Vulcan", "Romulans": "Romulan", "Bolians": "Bolian", "Betazoids": "Betazoid",
  "Breen": "Breen", "Lurians": "Lurian", "Hupyrians": "Hupyrian", "Nausicaans": "Nausicaan",
  "Andorians": "Andorian", "Humans": "Human", "Orions": "Orion", "Talaxians": "Talaxian",
  "Tellarites": "Tellarite", "El-Aurians": "El-Aurian", "Karemma": "Karemma", "Wadi": "Wadi",
  "Skrreea": "Skrreea", "Paradans": "Paradan", "Rakhari": "Rakhari", "Dosi": "Dosi",
};
// a noble House or a named family — the "lineage" edges.
const lineageOf = (name) => /^House of /i.test(name) || / family$/i.test(name);
// categories that name an organization a character belongs to (station/ship rosters,
// militaries, governments). The trailing role word is trimmed so the membership
// aligns with the infobox affiliation node of the same body.
const orgCategory = (cat) => {
  if (lineageOf(cat)) return null;
  if (/(personnel|residents)$/i.test(cat)) return cat.replace(/ (personnel|residents)$/i, "");
  if (/ government officials$/i.test(cat)) return cat.replace(/ officials$/i, "");
  if (/^(Guls|Legates|Vedeks|Kais)$/i.test(cat)) return cat;
  return null;
};
// infobox family fields -> the parent/child direction of a parent_of edge.
const FAMILY_PARENT_FIELDS = ["father", "mother", "parents"];   // link is the PARENT of this character
const FAMILY_CHILD_FIELDS = ["children", "son", "daughter"];    // link is a CHILD of this character
const FAMILY_SIBLING_FIELDS = ["sibling", "siblings", "brother", "sister"];
const FAMILY_SPOUSE_FIELDS = ["spouse", "partner", "husband", "wife"];

// requested title -> canonical title, from every fetch's redirect/normalization
// data, so family links that are redirects ([[Garak]] -> Elim Garak) connect to
// the right character node.
const canonTitle = new Map();
const resolveTitle = (t) => { let cur = t; for (let i = 0; i < 6 && canonTitle.has(cur); i++) cur = canonTitle.get(cur); return cur; };
async function fetchPages(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 20) {
    const j = await mw({ action: "query", prop: "revisions|categories", rvprop: "ids|timestamp|content",
      rvslots: "main", cllimit: "500", clshow: "!hidden", redirects: "1", titles: titles.slice(i, i + 20).join("|") });
    for (const n of j?.query?.normalized || []) canonTitle.set(n.from, n.to);
    for (const r of j?.query?.redirects || []) canonTitle.set(r.from, r.to);
    for (const page of Object.values(j?.query?.pages || {})) {
      if (page.missing !== undefined) { out.set(page.title, { title: page.title, missing: true }); continue; }
      const rev = page?.revisions?.[0] || {};
      out.set(page.title, { title: page.title, pageid: page.pageid, revision: rev.revid,
        timestamp: rev.timestamp, wikitext: rev?.slots?.main?.["*"] || "",
        categories: (page.categories || []).map((c) => c.title.replace(/^Category:/, "")) });
    }
    if (titles.length > 20) console.log(`  pages ${i + 1}-${Math.min(i + 20, titles.length)} read`);
  }
  return out;
}

// relationship-word links ([[son]], [[daughter]]) are the field's own label, not
// a named relative — never a family node.
const GENERIC_KIN = /^(son|daughter|child|children|brother|sister|sibling|mother|father|parent|wife|husband|spouse|twin|half-\w+|step\w*|niece|nephew|aunt|uncle|cousin|grand\w+)s?$/i;
// Family fields mix the relative with EXPLANATORY links: "[[Ziyal]] (daughter by
// [[Naprem]])", "[[six half-siblings]], through [[Dukat's wife]]". Everything from
// the first explanatory connective onward describes the relationship rather than
// naming another relative, so it is cut before links are read.
const EXPLANATORY = /\s*(?:\(|;|:|\bby\b|\bthrough\b|\bvia\b|\bwith\b|\bfrom\b|\bof\b|&ndash;|&mdash;|–|—| - )/i;
const relatives = (value) => [...new Set(value.split(/<br\s*\/?>/i).flatMap((entry) =>
  fieldLinks(entry.split(EXPLANATORY)[0]).filter((t) => !GENERIC_KIN.test(t))))];
function parseCharacter(page) {
  const head = page.wikitext.split(/\n==[^=]/)[0];
  const family = { parents: [], children: [], siblings: [], spouses: [] };
  for (const f of FAMILY_PARENT_FIELDS) family.parents.push(...relatives(infoboxField(head, f)));
  for (const f of FAMILY_CHILD_FIELDS) family.children.push(...relatives(infoboxField(head, f)));
  for (const f of FAMILY_SIBLING_FIELDS) family.siblings.push(...relatives(infoboxField(head, f)));
  for (const f of FAMILY_SPOUSE_FIELDS) family.spouses.push(...relatives(infoboxField(head, f)));
  family.parents = [...new Set(family.parents)]; family.children = [...new Set(family.children)];
  family.siblings = [...new Set(family.siblings)]; family.spouses = [...new Set(family.spouses)];
  return {
    title: page.title, source: wikiUrl(page.title), pageid: page.pageid, revision: page.revision,
    timestamp: page.timestamp, content_sha256: digest(page.wikitext),
    species: fieldLinks(infoboxField(head, "species").split(";")[0]),
    affiliations: fieldLinks(infoboxField(head, "affiliation")),
    rank: fieldLinks(infoboxField(head, "rank"))[0] || null,
    status: infoboxField(head, "status").replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1").replace(/<[^>]+>/g, "").trim().slice(0, 60) || null,
    raw_categories: page.categories, family,
  };
}

// ================= run =================
await mkdir("data/ds9/graph", { recursive: true });
const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const characterPages = [...new Set(roster.map((r) => r.character_page).filter(Boolean))].sort();

const nodes = new Map();
let familyReview = [];   // one-sided family claims, held for audit (not asserted)
const addNode = (type, id, extra = {}) => {
  const key = type + ":" + id;
  if (!nodes.has(key)) nodes.set(key, { type, id, label: id, ...extra });
  else Object.assign(nodes.get(key), extra);
  return nodes.get(key);
};
const edges = [];
const edgeSeen = new Set();
const addEdge = (type, from, to, citation) => {
  const k = type + "|" + from + "|" + to;
  if (edgeSeen.has(k)) return; edgeSeen.add(k);
  edges.push({ type, from, to, ...citation });
};

// --project-only is a PURE PROJECTION: load the committed nodes + edges exactly
// as they are and re-derive only projections/relationships/summary/manifest from
// them. It never rebuilds an edge, so the derived files can never drift from the
// nodes/edges they claim to project.
if (PROJECT_ONLY) {
  for (const n of JSON.parse(await readFile("data/ds9/graph/nodes.json", "utf8")).nodes) nodes.set(n.type + ":" + n.id, n);
  for (const e of JSON.parse(await readFile("data/ds9/graph/edges.json", "utf8")).edges) {
    edges.push(e); edgeSeen.add(e.type + "|" + e.from + "|" + e.to);
  }
}

// ---- performer -> character (episode-cited) + base character nodes ----
if (!PROJECT_ONLY) {
  console.log(`== reading ${characterPages.length} DS9 character pages ==`);
  const charData = new Map();
  for (const [title, page] of await fetchPages(characterPages)) charData.set(title, page.missing ? { title, missing: true } : parseCharacter(page));
  // fetch every family-referenced page not already loaded, so a relationship can
  // be corroborated from BOTH endpoints rather than asserted from one side.
  const famTitles = new Set();
  for (const c of charData.values()) if (!c.missing)
    for (const t of [...c.family.parents, ...c.family.children, ...c.family.siblings, ...c.family.spouses])
      if (!charData.has(t)) famTitles.add(t);
  if (famTitles.size) {
    console.log(`== reading ${famTitles.size} family-referenced pages ==`);
    for (const [title, page] of await fetchPages([...famTitles].sort()))
      if (!charData.has(title)) charData.set(title, page.missing ? { title, missing: true, family_target: true } : { ...parseCharacter(page), family_target: true });
  }

for (const row of roster) {
  const cid = row.character_page || row.character;
  addNode("performer", row.performer, { pageid: row.performer_pageid || null });
  addNode("character", cid, { label: row.character, page: row.character_page,
    character_named: row.character_named, background_role: row.background_role, in_cast: true });
  addEdge("portrayed", "performer:" + row.performer, "character:" + cid, {
    citation_type: "episode-credit", predicate: "portrayed",
    episodes: row.episodes.map((e) => ({ episode: e.episode, source: e.source, revision: e.revision })) });
}

// ---- enrich characters; species / affiliation / lineage / family edges ----
const bySpecies = (name) => addNode("species", name);
for (const [page, c] of charData) {
  const node = nodes.get("character:" + page);
  if (!node || c.missing) { if (node) node.missing = true; continue; }
  const infoboxCite = { citation_type: "infobox", source: c.source, revision: c.revision, content_sha256: c.content_sha256 };
  const species = new Map(), orgs = new Map(), lineages = new Map();
  for (const s of c.species) species.set(s, infoboxCite);
  for (const a of c.affiliations) (lineageOf(a) ? lineages : orgs).set(a, infoboxCite);
  for (const cat of c.raw_categories) {
    if (SPECIES_CATEGORIES[cat] && !species.has(SPECIES_CATEGORIES[cat]))
      species.set(SPECIES_CATEGORIES[cat], { citation_type: "category-membership", source: catUrl(cat), category: cat });
    if (lineageOf(cat)) { if (!lineages.has(cat)) lineages.set(cat, { citation_type: "category-membership", source: catUrl(cat), category: cat }); continue; }
    const org = orgCategory(cat);
    if (org && !orgs.has(org)) orgs.set(org, { citation_type: "category-membership", source: catUrl(cat), category: cat });
  }
  Object.assign(node, { source: c.source, pageid: c.pageid, revision: c.revision, timestamp: c.timestamp,
    content_sha256: c.content_sha256, species: [...species.keys()].sort(), affiliations: [...orgs.keys()].sort(),
    rank: c.rank, status: c.status, raw_categories: c.raw_categories, lineages: [...lineages.keys()].sort(),
    family: c.family, missing: false });
  for (const [s, cite] of species) { bySpecies(s); addEdge("is_species", "character:" + page, "species:" + s, { ...cite, predicate: "is_species" }); }
  for (const [a, cite] of orgs) { addNode("organization", a); addEdge("affiliated_with", "character:" + page, "organization:" + a, { ...cite, predicate: "affiliated_with" }); }
  for (const [l, cite] of lineages) { addNode("lineage", l); addEdge("member_of", "character:" + page, "lineage:" + l, { ...cite, predicate: "member_of" }); }
}

// ---- family edges by RECIPROCAL CORROBORATION ----
// A relationship is asserted only when BOTH endpoints' infoboxes state it (A lists
// B as child AND B lists A as parent; both list each other as sibling/spouse).
// One-sided claims are held in family-review.json, not asserted — this is what
// kills the false "Dukat parent_of Naprem" / "wife sibling_of Ziyal" edges that
// come from explanatory links surviving on a single page.
const famCite = (t, c) => ({ citation_type: "infobox-reciprocal", source: c.source, revision: c.revision, content_sha256: c.content_sha256 });
const famNode = (title, c) => { addNode("character", title, nodes.has("character:" + title) ? {} : { label: title, in_cast: !!(c && !c.family_target) }); return "character:" + title; };
// directed parent→child claims and undirected peer claims, keyed by canonical title
const childrenClaim = new Map();  // parentTitle -> Set(childTitle) declared on the parent's page
const parentClaim = new Map();    // childTitle -> Set(parentTitle) declared on the child's page
const siblingClaim = new Map();   // title -> Set(siblingTitle)
const spouseClaim = new Map();    // title -> Set(spouseTitle)
const add = (map, k, v) => { (map.get(k) || map.set(k, new Set()).get(k)).add(v); };
for (const [page, c] of charData) {
  if (c.missing) continue;
  const self = resolveTitle(page);
  for (const p of c.family.parents) add(parentClaim, self, resolveTitle(p));
  for (const ch of c.family.children) add(childrenClaim, self, resolveTitle(ch));
  for (const s of c.family.siblings) add(siblingClaim, self, resolveTitle(s));
  for (const s of c.family.spouses) add(spouseClaim, self, resolveTitle(s));
}
const dataFor = (title) => charData.get(title) || charData.get([...charData.keys()].find((k) => resolveTitle(k) === title));
const seenPair = new Set();
// parent_of: corroborated when the parent's page lists the child AND the child's page lists the parent
for (const [parent, kids] of childrenClaim) for (const child of kids) {
  const key = "parent_of|" + parent + "|" + child; if (seenPair.has(key)) continue; seenPair.add(key);
  const reciprocal = parentClaim.get(child)?.has(parent);
  if (reciprocal) addEdge("parent_of", famNode(parent, dataFor(parent)), famNode(child, dataFor(child)),
    { ...famCite(parent, dataFor(parent) || {}), predicate: "parent_of", corroborated_by: [wikiUrl(parent), wikiUrl(child)] });
  else familyReview.push({ predicate: "parent_of", parent, child, declared_on: wikiUrl(parent), missing_reciprocal_on: wikiUrl(child), reason: "child's page does not list this parent" });
}
// also surface child-side parent claims with no parent-side child claim
for (const [child, parents] of parentClaim) for (const parent of parents) {
  const key = "parent_of|" + parent + "|" + child; if (seenPair.has(key)) continue; seenPair.add(key);
  familyReview.push({ predicate: "parent_of", parent, child, declared_on: wikiUrl(child), missing_reciprocal_on: wikiUrl(parent), reason: "parent's page does not list this child" });
}
// sibling_of / spouse_of: corroborated when both list each other
for (const [pred, map] of [["sibling_of", siblingClaim], ["spouse_of", spouseClaim]])
  for (const [a, others] of map) for (const b of others) {
    const [x, y] = [a, b].sort(); const key = pred + "|" + x + "|" + y; if (seenPair.has(key)) continue; seenPair.add(key);
    const reciprocal = map.get(b)?.has(a);
    if (reciprocal) addEdge(pred, famNode(x, dataFor(x)), famNode(y, dataFor(y)),
      { citation_type: "infobox-reciprocal", predicate: pred, corroborated_by: [wikiUrl(a), wikiUrl(b)] });
    else familyReview.push({ predicate: pred, a, b, declared_on: wikiUrl(a), missing_reciprocal_on: wikiUrl(b), reason: "other party's page does not list this " + pred.replace("_of", "") });
  }

// ---- sourced doctrine + succession edges (from named pages, not prose inference) ----
// The nine primary Dax hosts, plus the temporary and alternate-timeline hosts, as
// an explicit CURATED evidence table. Memory Alpha's host succession is not a
// parseable structure on the symbiont page, so this is stated, typed, and cited
// to each host's own page — not silently inferred from a naming convention.
const DAX_HOSTS = [
  { host: "Lela Dax", type: "primary" }, { host: "Tobin Dax", type: "primary" },
  { host: "Emony Dax", type: "primary" }, { host: "Audrid Dax", type: "primary" },
  { host: "Torias Dax", type: "primary" }, { host: "Joran Dax", type: "primary" },
  { host: "Curzon Dax", type: "primary" }, { host: "Jadzia Dax", type: "primary" },
  { host: "Ezri Dax", type: "primary" },
  { host: "Verad", type: "temporary", note: "forcibly joined; DS9: Invasive Procedures" },
  { host: "Yedrin Dax", type: "alternate", note: "alternate timeline; DS9: Children of Time" },
];

// Curated Dominion War coalition membership, verified against each coalition page
// but labelled curated — the page is the basis, not a deterministic parse.
const COALITION_MEMBERS = {
  "Federation Alliance": ["United Federation of Planets", "Klingon Empire", "Romulan Star Empire"],
  "Breen-Dominion Alliance": ["Dominion", "Cardassian Union", "Breen Confederacy"],
};

// find the sentence in a page lead that explicitly names this clone's predecessor.
// A predecessor must be a LOWER-numbered clone (the intro also mentions this
// clone's own death and later clones, so those must be excluded).
function clonePredecessor(wt, thisN) {
  const lead = wt.split(/\n==[^=]/)[0].replace(/\{\{[^}]*\}\}/g, " ").replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1");
  const cands = [];
  for (const re of [/after (?:the [\w ]*?death|the [\w ]*?demise) of Weyoun (\d)/gi,
    /after Weyoun (\d)'s (?:demise|death)/gi, /death of Weyoun (\d)/gi,
    /(?:replaced|succeeded) Weyoun (\d)/gi, /prevent Weyoun (\d) from/gi]) {
    for (const m of lead.matchAll(re)) {
      const n = +m[1]; if (n >= thisN) continue;
      const s = lead.slice(0, m.index + m[0].length); const sentence = s.slice(s.lastIndexOf(".") + 1).trim();
      cands.push({ n, basis: sentence.slice(0, 160) });
    }
  }
  if (!cands.length) return null;
  return cands.sort((a, b) => b.n - a.n)[0];   // closest lower-numbered predecessor
}

  const cloneTitles = [...nodes.keys()].filter((k) => /^character:Weyoun \d+$/.test(k)).map((k) => k.replace("character:", ""));
  const special = await fetchPages(["Dax (symbiont)", "Vorta", "Jem'Hadar", "Dominion War",
    "Federation Alliance", "Breen-Dominion Alliance", ...DAX_HOSTS.map((h) => h.host), ...cloneTitles]);
  const cite = (t) => { const p = special.get(t); return p && !p.missing ? { citation_type: "page", source: wikiUrl(t), revision: p.revision, content_sha256: digest(p.wikitext) } : { citation_type: "page", source: wikiUrl(t) }; };

  // host_of: Dax symbiont -> each host it hosted, from the curated table, typed and
  // cited to the host's own page (only hosts whose page really exists).
  addNode("symbiont", "Dax", { label: "Dax (symbiont)" });
  for (const h of DAX_HOSTS) {
    const p = special.get(h.host); if (!p || p.missing) continue;
    addNode("character", h.host, nodes.has("character:" + h.host) ? {} : { label: h.host, in_cast: false });
    addEdge("host_of", "symbiont:Dax", "character:" + h.host, { ...cite(h.host), predicate: "host_of",
      citation_type: "curated-evidence", host_type: h.type, ...(h.note ? { note: h.note } : {}) });
  }

  // clone identity + sourced succession. Every Weyoun clone is an instance of the
  // Weyoun line (with its designation number); succeeded_by is emitted ONLY where
  // the successor's page explicitly names its predecessor, cited with that text.
  addNode("character", "Weyoun", nodes.has("character:Weyoun") ? {} : { label: "Weyoun (Vorta clone line)", in_cast: false });
  for (const title of cloneTitles) {
    const n = +title.match(/(\d+)$/)[1];
    addEdge("clone_instance_of", "character:" + title, "character:Weyoun", { ...cite(title), predicate: "clone_instance_of", designation: n });
    const p = special.get(title); if (!p || p.missing) continue;
    const pred = clonePredecessor(p.wikitext, n);
    if (pred && nodes.has("character:Weyoun " + pred.n))
      addEdge("succeeded_by", "character:Weyoun " + pred.n, "character:" + title, { ...cite(title), predicate: "succeeded_by", basis: pred.basis });
  }

  // commands: Dominion chain of command, species-level doctrine, each edge cited to
  // the page that states it.
  for (const s of ["Changeling", "Vorta", "Jem'Hadar"]) addNode("species", s);
  addEdge("commands", "species:Changeling", "species:Vorta", { ...cite("Vorta"), predicate: "commands",
    basis: 'Vorta "genetically-engineered by the Founders of the Dominion... served the Founders"' });
  addEdge("commands", "species:Vorta", "species:Jem'Hadar", { ...cite("Vorta"), predicate: "commands",
    basis: 'Vorta act as "field commanders"; Jem\'Hadar are "the military arm of the Dominion"' });

  // allied_with: the two Dominion War coalitions (from the war infobox) and their
  // member powers (curated per COALITION_MEMBERS, verified present on the coalition
  // page). Labelled curated — the coalition page is the basis, not a parse.
  const war = special.get("Dominion War");
  if (war && !war.missing) {
    const head = war.wikitext.split(/\n==[^=]/)[0];
    addNode("coalition", "Dominion War", { label: "Dominion War" });
    for (const side of ["combatant1", "combatant2"]) {
      const coalition = fieldLinks(infoboxField(head, side))[0];
      if (!coalition) continue;
      addNode("coalition", coalition);
      addEdge("belligerent_in", "coalition:" + coalition, "coalition:Dominion War", { ...cite("Dominion War"), predicate: "belligerent_in" });
      const cpage = special.get(coalition);
      for (const m of COALITION_MEMBERS[coalition] || []) {
        const present = cpage && !cpage.missing && cpage.wikitext.includes("[[" + m);
        addNode("power", m);
        addEdge("allied_with", "power:" + m, "coalition:" + coalition, { citation_type: "curated", predicate: "allied_with",
          source: wikiUrl(coalition), basis: `curated member of the ${coalition}`, verified_link_present: !!present });
      }
    }
  }
}

// default structured fields on characters never enriched (page-less / not-in-cast)
for (const node of nodes.values()) if (node.type === "character") {
  node.species ??= []; node.affiliations ??= []; node.lineages ??= []; node.raw_categories ??= [];
  node.rank ??= null; node.status ??= null; node.missing ??= false; node.in_cast ??= true;
  node.family ??= { parents: [], children: [], sibling_of: [], spouse_of: [] };
}

const nodeList = [...nodes.values()].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
edges.sort((a, b) => a.type.localeCompare(b.type) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
const nodeExists = (ntid) => nodes.has(ntid);

// ---- mechanical projections (VIEWS, not relationship claims) ----
const BLOCS = [
  { key: "dominion", label: "Dominion", species: /^(Changeling|Founder|Vorta|Jem'Hadar)$/i, affil: /Dominion/i },
  { key: "cardassian", label: "Cardassian Union", species: /^Cardassian$/i, affil: /Cardassian|Obsidian Order/i },
  { key: "bajoran", label: "Bajoran", species: /^Bajoran$/i, affil: /Bajoran|Militia|Resistance|Vedek|Kai\b/i },
  { key: "klingon", label: "Klingon Empire", species: /^Klingon$/i, affil: /Klingon|House of|Defense Force/i },
  { key: "ferengi", label: "Ferengi Alliance", species: /^Ferengi$/i, affil: /Ferengi|Nagus/i },
];
const inBloc = (bloc, n) => (n.species || []).some((s) => bloc.species.test(s))
  || (n.affiliations || []).some((a) => bloc.affil.test(a)) || (n.lineages || []).some((l) => bloc.affil.test(l));
const characterNodes = nodeList.filter((n) => n.type === "character");
const projection = (label, includeChar, edgeTypes) => {
  const keep = new Set(characterNodes.filter(includeChar).map((n) => "character:" + n.id));
  const subEdges = edges.filter((e) => edgeTypes.includes(e.type) && (keep.has(e.from) || keep.has(e.to)));
  const ids = new Set(); for (const e of subEdges) { ids.add(e.from); ids.add(e.to); }
  return { label, node_count: ids.size, edge_count: subEdges.length,
    nodes: nodeList.filter((n) => ids.has(n.type + ":" + n.id)).map((n) => n.type + ":" + n.id), edges: subEdges };
};
const projections = {
  portrayal: projection("Portrayal — who wore which face", () => true, ["portrayed"]),
  species: projection("Species — character to alien race", () => true, ["is_species"]),
};
for (const bloc of BLOCS)
  projections[bloc.key] = projection(bloc.label, (n) => inBloc(bloc, n), ["is_species", "affiliated_with", "member_of", "portrayed"]);

// ---- relationship charts (explicit predicates only) ----
// Each chart names exactly which predicates it contains — a faction web folds in
// the family edges among that people so parentage (Tain→Garak, Dukat→Ziyal) is
// present, not just affiliation.
const chart = (label, note, edgeFilter) => {
  const subEdges = edges.filter(edgeFilter);
  const ids = new Set(); for (const e of subEdges) { ids.add(e.from); ids.add(e.to); }
  return { label, note, predicates: [...new Set(subEdges.map((e) => e.type))].sort(),
    node_count: ids.size, edge_count: subEdges.length,
    nodes: nodeList.filter((n) => ids.has(n.type + ":" + n.id)).map((n) => ({ id: n.type + ":" + n.id, label: n.label })),
    edges: subEdges };
};
const FAMILY = new Set(["parent_of", "sibling_of", "spouse_of"]);
const membersOf = (re) => new Set(characterNodes.filter((n) => (n.species || []).some((s) => re.test(s))).map((n) => "character:" + n.id));
const familyAmong = (set) => (e) => FAMILY.has(e.type) && (set.has(e.from) || set.has(e.to));
const orgTo = (re) => (e) => (e.type === "affiliated_with" || e.type === "member_of") && re.test(e.to);
const cardassians = membersOf(/^Cardassian$/i), bajorans = membersOf(/^Bajoran$/i), klingons = membersOf(/^Klingon$/i);
const relationships = {
  family: chart("Family & marriage web", "parent_of (parent→child), sibling_of, spouse_of — from character infoboxes.",
    (e) => FAMILY.has(e.type)),
  klingon_houses: chart("Klingon Houses & bloodlines", "House membership (member_of) plus family edges among Klingons.",
    (e) => (e.type === "member_of" && /^lineage:House of/.test(e.to)) || familyAmong(klingons)(e)),
  dax_hosts: chart("Dax symbiont host set", "host_of only. Hosts are typed primary/temporary/alternate; the source gives no machine-readable succession order, so none is charted.",
    (e) => e.type === "host_of"),
  dominion_command: chart("Dominion chain of command & Weyoun clone line",
    "commands (species doctrine), clone_instance_of + succeeded_by (Weyoun, sourced per clone page), and Dominion org membership.",
    (e) => ["commands", "clone_instance_of", "succeeded_by"].includes(e.type) || orgTo(/Dominion|Vorta|Jem'Hadar/i)(e)),
  cardassian_web: chart("Cardassian affiliations & families",
    "Cardassian/Obsidian Order org membership plus family edges among Cardassians (Tain→Garak, Dukat→Ziyal).",
    (e) => orgTo(/Cardassian|Obsidian Order|Detapa|Gul|Legate/i)(e) || familyAmong(cardassians)(e)),
  bajoran_web: chart("Bajoran affiliations & families",
    "Bajoran militia/government/religious org membership plus family among Bajorans. Affiliation membership, not a command hierarchy.",
    (e) => orgTo(/Bajoran|Militia|Vedek|Kai|Resistance/i)(e) || familyAmong(bajorans)(e)),
  war_coalitions: chart("Dominion War coalitions", "allied_with (curated coalition membership) and belligerent_in (war infobox).",
    (e) => e.type === "allied_with" || e.type === "belligerent_in"),
};

// ---- write ----
const nodeCounts = nodeList.reduce((a, n) => (a[n.type] = (a[n.type] || 0) + 1, a), {});
const edgeCounts = edges.reduce((a, e) => (a[e.type] = (a[e.type] || 0) + 1, a), {});
const nodesDoc = { version: 2, production: "Star Trek: Deep Space Nine", captured_at: CAPTURED_AT, counts: nodeCounts, nodes: nodeList };
const edgesDoc = { version: 2, production: "Star Trek: Deep Space Nine",
  predicates: {
    portrayed: "performer wore character (episode-credited)", is_species: "character is of species (infobox/category)",
    affiliated_with: "character affiliated with organization (infobox/category)", member_of: "character belongs to House/family (infobox/category)",
    parent_of: "character is parent of character (infobox)", sibling_of: "characters are siblings (infobox)",
    spouse_of: "characters are/were married (infobox)", host_of: "symbiont hosted character (symbiont page)",
    succeeded_by: "character succeeded by character (successor page names the predecessor; cited per edge)",
    clone_instance_of: "clone is an instance of a character line, with a designation number",
    commands: "species commands species (Dominion doctrine, cited)",
    allied_with: "power is a curated member of a coalition (verified present on the coalition page)",
    belligerent_in: "coalition fought in war (war infobox)" },
  counts: edgeCounts, edges };

// nodes, edges and relationships are the authoritative artifacts; projections and
// summary derive from them. All five are written in both modes so --project-only
// can never leave a stale file behind, and all five are hashed into the manifest.
const relationshipsDoc = { version: 2,
  note: "Explicitly-predicated relationship charts, each a pure projection of edges.json. Every edge is separately cited to the infobox field, category, curated table, or named page that states it. Directed: parent_of (parent→child), host_of (symbiont→host), succeeded_by (predecessor→successor), commands (commander→commanded), clone_instance_of (clone→line). sibling_of/spouse_of/allied_with are undirected.",
  charts: relationships };
const projectionsDoc = { version: 2,
  note: "Mechanical VIEWS over the crawl — filters, not relationship claims. Power-bloc membership is a regex projection of sourced species/affiliation/lineage; a character in more than one bloc appears in each. The real relationship charts are in relationships.json.",
  bloc_rules: BLOCS.map((b) => ({ key: b.key, label: b.label, species: String(b.species), affiliation: String(b.affil) })),
  projections: Object.fromEntries(Object.entries(projections).map(([k, g]) => [k, { label: g.label, node_count: g.node_count, edge_count: g.edge_count }])),
  detail: projections };
const familyReviewDoc = { version: 1, production: "Star Trek: Deep Space Nine",
  note: "One-sided family claims: an infobox on one page names the relative, but the relative's own page does not corroborate it. Held for audit — NOT asserted as edges. Reciprocally-corroborated relationships are in edges.json.",
  count: familyReview.length, review: familyReview.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
const summaryDoc = { version: 2,
  generated_from: ["data/ds9/graph/nodes.json", "data/ds9/graph/edges.json"],
  node_counts: nodeCounts, edge_counts: edgeCounts,
  characters_with_species: characterNodes.filter((n) => (n.species || []).length).length,
  characters_without_species: characterNodes.filter((n) => !(n.species || []).length).length,
  family_edges_corroborated: edges.filter((e) => ["parent_of", "sibling_of", "spouse_of"].includes(e.type)).length,
  family_claims_one_sided_in_review: PROJECT_ONLY
    ? JSON.parse(await readFile("data/ds9/graph/family-review.json", "utf8")).count
    : familyReview.length,
  projections: Object.fromEntries(Object.entries(projections).map(([k, g]) => [k, { node_count: g.node_count, edge_count: g.edge_count }])),
  relationships: Object.fromEntries(Object.entries(relationships).map(([k, g]) => [k, { node_count: g.node_count, edge_count: g.edge_count }])) };

const write = async (name, doc) => {
  const path = "data/ds9/graph/" + name;
  await writeFile(path, JSON.stringify(doc, null, 1) + "\n");
  return { path, sha256: digest(JSON.stringify(doc, null, 1) + "\n") };
};
// In project-only mode nodes/edges are inputs, not outputs — leave them untouched
// so the manifest can prove the derived files match the committed nodes/edges.
const snapshots = {};
const hashOnly = async (name) => ({ path: "data/ds9/graph/" + name, sha256: digest(await readFile("data/ds9/graph/" + name, "utf8")) });
if (!PROJECT_ONLY) {
  snapshots.nodes = await write("nodes.json", nodesDoc);
  snapshots.edges = await write("edges.json", edgesDoc);
  snapshots.family_review = await write("family-review.json", familyReviewDoc);
} else {
  snapshots.nodes = await hashOnly("nodes.json");
  snapshots.edges = await hashOnly("edges.json");
  snapshots.family_review = await hashOnly("family-review.json");
}
snapshots.relationships = await write("relationships.json", relationshipsDoc);
snapshots.projections = await write("projections.json", projectionsDoc);
snapshots.summary = await write("graph-summary.json", summaryDoc);
// captured_at reflects when the graph was crawled — in --project-only nothing was
// re-crawled, so preserve the committed value instead of stamping null.
const capturedAt = PROJECT_ONLY
  ? JSON.parse(await readFile("data/ds9/graph/manifest.json", "utf8")).captured_at
  : CAPTURED_AT;
await writeFile("data/ds9/graph/manifest.json", JSON.stringify({ version: 1,
  generator: "scripts/ds9-graph.mjs", production: "Star Trek: Deep Space Nine", captured_at: capturedAt,
  note: "sha256 of every graph artifact, so the whole evidence package is auditable — not only the roster.",
  snapshots }, null, 1) + "\n");

console.log(`\nnodes: ${JSON.stringify(nodeCounts)}`);
console.log(`edges: ${JSON.stringify(edgeCounts)}`);
console.log(`relationships: ${Object.entries(relationships).map(([k, g]) => `${k}(${g.node_count}n/${g.edge_count}e)`).join(" ")}`);
