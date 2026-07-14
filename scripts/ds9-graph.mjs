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
const FAMILY_PEER_FIELDS = { sibling_of: ["sibling", "siblings", "brother", "sister"], spouse_of: ["spouse", "partner"] };

async function fetchPages(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 20) {
    const j = await mw({ action: "query", prop: "revisions|categories", rvprop: "ids|timestamp|content",
      rvslots: "main", cllimit: "500", clshow: "!hidden", redirects: "1", titles: titles.slice(i, i + 20).join("|") });
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

function parseCharacter(page) {
  const head = page.wikitext.split(/\n==[^=]/)[0];
  const family = { parents: [], children: [], sibling_of: [], spouse_of: [] };
  for (const f of FAMILY_PARENT_FIELDS) family.parents.push(...fieldLinks(infoboxField(head, f)));
  for (const f of FAMILY_CHILD_FIELDS) family.children.push(...fieldLinks(infoboxField(head, f)));
  for (const [pred, fields] of Object.entries(FAMILY_PEER_FIELDS))
    for (const f of fields) family[pred].push(...fieldLinks(infoboxField(head, f)));
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

let charData;
if (PROJECT_ONLY) {
  const prior = JSON.parse(await readFile("data/ds9/graph/nodes.json", "utf8"));
  charData = new Map(prior.nodes.filter((n) => n.type === "character" && n.page)
    .map((n) => [n.page, { title: n.page, source: n.source, pageid: n.pageid, revision: n.revision,
      timestamp: n.timestamp, content_sha256: n.content_sha256, species: n.species || [], affiliations: n.affiliations || [],
      rank: n.rank, status: n.status, raw_categories: n.raw_categories || [], family: n.family || { parents: [], children: [], sibling_of: [], spouse_of: [] } }]));
} else {
  console.log(`== reading ${characterPages.length} DS9 character pages ==`);
  const pages = await fetchPages(characterPages);
  charData = new Map();
  for (const [title, page] of pages) charData.set(title, page.missing ? { title, missing: true } : parseCharacter(page));
}

// ---- performer -> character (episode-cited) + base character nodes ----
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

  // family edges (parent_of parent->child; sibling_of / spouse_of undirected, sorted)
  const famNode = (title) => { addNode("character", title, nodes.has("character:" + title) ? {} : { label: title, in_cast: false }); return "character:" + title; };
  for (const p of c.family.parents) addEdge("parent_of", famNode(p), "character:" + page, { ...infoboxCite, predicate: "parent_of", read_from: c.title });
  for (const ch of c.family.children) addEdge("parent_of", "character:" + page, famNode(ch), { ...infoboxCite, predicate: "parent_of", read_from: c.title });
  for (const pred of ["sibling_of", "spouse_of"]) for (const other of c.family[pred]) {
    const [a, b] = ["character:" + page, famNode(other)].sort();
    addEdge(pred, a, b, { ...infoboxCite, predicate: pred, read_from: c.title });
  }
}

// ---- sourced doctrine + succession edges (from named pages, not prose inference) ----
// In --project-only mode these are not re-derivable (they came from doctrine pages),
// so re-seed them and their non-cast nodes from the prior graph to keep the
// relationship charts intact.
if (PROJECT_ONLY) {
  // member_of Houses come from the infobox affiliation field, which nodes.json
  // stores already split out — so re-seed those too, not just the doctrine edges.
  const DOCTRINE = new Set(["host_of", "commands", "allied_with", "belligerent_in", "succeeded_by", "member_of"]);
  const prior = JSON.parse(await readFile("data/ds9/graph/edges.json", "utf8")).edges;
  const priorNodes = JSON.parse(await readFile("data/ds9/graph/nodes.json", "utf8")).nodes;
  const nodeById = new Map(priorNodes.map((n) => [n.type + ":" + n.id, n]));
  for (const e of prior) if (DOCTRINE.has(e.type)) {
    for (const ref of [e.from, e.to]) { const n = nodeById.get(ref); if (n && !nodes.has(ref)) addNode(n.type, n.id, { label: n.label, ...(n.in_cast === false ? { in_cast: false } : {}) }); }
    const { type, from, to, ...cite } = e; addEdge(type, from, to, cite);
  }
}
if (!PROJECT_ONLY) {
  const special = await fetchPages(["Dax (symbiont)", "Vorta", "Jem'Hadar", "Dominion War", "Federation Alliance", "Breen-Dominion Alliance"]);
  const cite = (t) => { const p = special.get(t); return p && !p.missing ? { citation_type: "page", source: wikiUrl(t), revision: p.revision, content_sha256: digest(p.wikitext) } : { citation_type: "page", source: wikiUrl(t) }; };

  // host_of: the Trill symbiont Dax and its hosts. A Dax host is a character whose
  // canonical page is "<name> Dax" — the wiki's naming convention for a joined
  // host — confirmed present as a link on the symbiont page. Order is NOT machine-
  // extractable from the source, so no succeeded_by is fabricated for the hosts.
  const dax = special.get("Dax (symbiont)");
  if (dax && !dax.missing) {
    addNode("symbiont", "Dax", { label: "Dax (symbiont)" });
    const daxHosts = [...nodes.values()].filter((n) => n.type === "character" && /^[A-Z][a-zà-þ'.-]+ Dax$/.test(n.id));
    for (const h of daxHosts) addEdge("host_of", "symbiont:Dax", "character:" + h.id, { ...cite("Dax (symbiont)"), predicate: "host_of",
      basis: "canonical page titled '<host> Dax' — Memory Alpha's joined-host naming convention" });
  }

  // succeeded_by: Weyoun clones are numbered; consecutive existing clones succeed.
  const clones = [...nodes.keys()].filter((k) => /^character:Weyoun \d+$/.test(k)).map((k) => ({ k, n: +k.match(/(\d+)$/)[1] })).sort((a, b) => a.n - b.n);
  for (let i = 0; i + 1 < clones.length; i++)
    addEdge("succeeded_by", clones[i].k, clones[i + 1].k, { citation_type: "page", source: wikiUrl(clones[i + 1].k.replace("character:", "")), predicate: "succeeded_by", basis: "Vorta clone succession (numbered)" });

  // commands: Dominion chain of command, species-level doctrine, each edge cited to
  // the page that states it.
  for (const s of ["Changeling", "Vorta", "Jem'Hadar"]) addNode("species", s);
  addEdge("commands", "species:Changeling", "species:Vorta", { ...cite("Vorta"), predicate: "commands",
    basis: 'Vorta "genetically-engineered by the Founders of the Dominion... served the Founders"' });
  addEdge("commands", "species:Vorta", "species:Jem'Hadar", { ...cite("Vorta"), predicate: "commands",
    basis: 'Vorta act as "field commanders"; Jem\'Hadar are "the military arm of the Dominion"' });

  // allied_with: the two Dominion War coalitions, from the war infobox, and their
  // member powers from each coalition page's lead links.
  // The two coalition pages state their membership in prose, not a members= field.
  // For each coalition we name the major powers that formed it and emit an edge
  // ONLY for those actually linked on that coalition's page — the page is the
  // citation and the gate, so the enemy power mentioned in passing is never
  // mis-assigned.
  const COALITION_MEMBERS = {
    "Federation Alliance": ["United Federation of Planets", "Klingon Empire", "Romulan Star Empire"],
    "Breen-Dominion Alliance": ["Dominion", "Cardassian Union", "Breen Confederacy"],
  };
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
      if (!cpage || cpage.missing) continue;
      for (const m of COALITION_MEMBERS[coalition] || []) {
        if (!cpage.wikitext.includes("[[" + m)) continue;   // verified against the coalition page
        addNode("power", m);
        addEdge("allied_with", "power:" + m, "coalition:" + coalition, { ...cite(coalition), predicate: "allied_with", verified_on: coalition });
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
const chart = (label, predicates, nodeFilter) => {
  let subEdges = edges.filter((e) => predicates.includes(e.type));
  if (nodeFilter) subEdges = subEdges.filter((e) => nodeFilter(e));
  const ids = new Set(); for (const e of subEdges) { ids.add(e.from); ids.add(e.to); }
  return { label, predicates, node_count: ids.size, edge_count: subEdges.length,
    nodes: nodeList.filter((n) => ids.has(n.type + ":" + n.id)).map((n) => ({ id: n.type + ":" + n.id, label: n.label })),
    edges: subEdges };
};
const orgIn = (re) => (e) => e.to.startsWith("organization:") && re.test(e.to) || e.to.startsWith("lineage:") && re.test(e.to);
const relationships = {
  family: chart("Family & marriage web", ["parent_of", "sibling_of", "spouse_of"]),
  klingon_houses: chart("Klingon Houses", ["member_of"], (e) => /^lineage:House of/.test(e.to)),
  dax_hosts: chart("Dax symbiont host line", ["host_of", "succeeded_by"], (e) => e.from === "symbiont:Dax" || /Dax/.test(e.from) || /Dax/.test(e.to)),
  dominion_command: chart("Dominion chain of command", ["commands", "member_of", "affiliated_with"], (e) => e.type === "commands" || /Dominion|Vorta|Jem'Hadar|Founder/i.test(e.to)),
  cardassian_web: chart("Cardassian political & military web", ["affiliated_with", "member_of"], orgIn(/Cardassian|Obsidian Order|Detapa|Gul|Legate/i)),
  bajoran_orders: chart("Bajoran militia, government & religious orders", ["affiliated_with", "member_of"], orgIn(/Bajoran|Militia|Vedek|Kai|Resistance/i)),
  war_coalitions: chart("Dominion War coalitions", ["allied_with", "belligerent_in"]),
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
    succeeded_by: "character succeeded by character (numbered clone succession)", commands: "species commands species (Dominion doctrine, cited)",
    allied_with: "power allied within coalition (coalition page)", belligerent_in: "coalition fought in war (war infobox)" },
  counts: edgeCounts, edges };

if (!PROJECT_ONLY) {
  await writeFile("data/ds9/graph/nodes.json", JSON.stringify(nodesDoc, null, 1) + "\n");
  await writeFile("data/ds9/graph/edges.json", JSON.stringify(edgesDoc, null, 1) + "\n");
  await writeFile("data/ds9/graph/relationships.json", JSON.stringify({ version: 1,
    note: "Explicitly-predicated relationship charts. Every edge is separately cited to the infobox field, category, or named page that states it. Directed predicates: parent_of (parent→child), host_of (symbiont→host), succeeded_by (earlier→later), commands (commander→commanded). sibling_of/spouse_of/allied_with are undirected.",
    charts: relationships }, null, 1) + "\n");
}
await writeFile("data/ds9/graph/projections.json", JSON.stringify({ version: 2,
  note: "Mechanical VIEWS over the crawl — filters, not relationship claims. Power-bloc membership is a regex projection of sourced species/affiliation/lineage; a character in more than one bloc appears in each. The real relationship charts are in relationships.json.",
  bloc_rules: BLOCS.map((b) => ({ key: b.key, label: b.label, species: String(b.species), affiliation: String(b.affil) })),
  projections: Object.fromEntries(Object.entries(projections).map(([k, g]) => [k, { label: g.label, node_count: g.node_count, edge_count: g.edge_count }])),
  detail: projections }, null, 1) + "\n");
await writeFile("data/ds9/graph/graph-summary.json", JSON.stringify({ version: 2,
  generated_from: ["data/ds9/graph/nodes.json", "data/ds9/graph/edges.json"],
  node_counts: nodeCounts, edge_counts: edgeCounts,
  characters_with_species: characterNodes.filter((n) => (n.species || []).length).length,
  characters_without_species: characterNodes.filter((n) => !(n.species || []).length).length,
  projections: Object.fromEntries(Object.entries(projections).map(([k, g]) => [k, { node_count: g.node_count, edge_count: g.edge_count }])),
  relationships: Object.fromEntries(Object.entries(relationships).map(([k, g]) => [k, { node_count: g.node_count, edge_count: g.edge_count }])) }, null, 1) + "\n");

console.log(`\nnodes: ${JSON.stringify(nodeCounts)}`);
console.log(`edges: ${JSON.stringify(edgeCounts)}`);
console.log(`relationships: ${Object.entries(relationships).map(([k, g]) => `${k}(${g.node_count}n/${g.edge_count}e)`).join(" ")}`);
