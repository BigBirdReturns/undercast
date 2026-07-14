#!/usr/bin/env node
/**
 * ds9-graph.mjs — the DS9 relationship graph, built on the sourced roster.
 *
 * Reads data/ds9/roster.json, fetches each distinct character's Memory Alpha
 * page, and reads its infobox + categories into an explicit node/edge graph.
 * Every edge carries its own citation: the page (URL, revision, content hash)
 * whose infobox states the species/affiliation, or the category whose
 * membership states the lineage. Nothing here is inferred from prose — the
 * relationship is only recorded where the wiki states it as structured data.
 *
 *   node scripts/ds9-graph.mjs            # crawl character pages -> data/ds9/graph/*
 *   node scripts/ds9-graph.mjs --project-only  # rebuild projections from nodes/edges
 *
 * Output (under data/ds9/graph/):
 *   nodes.json    every performer / character / species / organization / lineage
 *                 node, with the character's raw category list kept for audit.
 *   edges.json    typed, individually-cited edges: portrayed, is_species,
 *                 affiliated_with, member_of.
 *   graphs.json   seven named sub-graphs projected from nodes/edges: portrayal,
 *                 species, and the five DS9 power blocs.
 *   graph-summary.json  reproducible counts per node type / edge type / graph.
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
// Used as a category-cited fallback so unnamed background aliens whose stub page
// carries no infobox species field still get their race from the wiki's own
// species category. Every mapping is a real MA category name.
const SPECIES_CATEGORIES = {
  "Bajorans": "Bajoran", "Cardassians": "Cardassian", "Ferengi": "Ferengi", "Klingons": "Klingon",
  "Trill": "Trill", "Vorta": "Vorta", "Jem'Hadar": "Jem'Hadar", "Changelings": "Changeling",
  "Vulcans": "Vulcan", "Romulans": "Romulan", "Bolians": "Bolian", "Betazoids": "Betazoid",
  "Breen": "Breen", "Lurians": "Lurian", "Hupyrians": "Hupyrian", "Nausicaans": "Nausicaan",
  "Andorians": "Andorian", "Humans": "Human", "Orions": "Orion", "Talaxians": "Talaxian",
  "Tellarites": "Tellarite", "El-Aurians": "El-Aurian", "Karemma": "Karemma", "Wadi": "Wadi",
  "Skrreea": "Skrreea", "Paradans": "Paradan", "Rakhari": "Rakhari", "Dosi": "Dosi",
};

// a noble House or a named family — the "lineage" edges. Houses show up in the
// infobox affiliation field; families show up as categories. Both are matched
// with the same test and routed to member_of.
const lineageOf = (name) => /^House of /i.test(name) || / family$/i.test(name);
// categories that name an organization a character belongs to (station and ship
// rosters, militaries, governments). The trailing role word is trimmed so the
// membership aligns with the infobox affiliation node of the same body:
// "Bajoran Militia personnel" -> "Bajoran Militia". Everything else stays in
// raw_categories and never becomes an edge.
const orgCategory = (cat) => {
  if (lineageOf(cat)) return null;
  if (/(personnel|residents)$/i.test(cat)) return cat.replace(/ (personnel|residents)$/i, "");
  if (/ government officials$/i.test(cat)) return cat.replace(/ officials$/i, "");
  if (/^(Guls|Legates|Vedeks|Kais)$/i.test(cat)) return cat;
  return null;
};

async function crawl(characterPages) {
  const chars = new Map();
  for (let i = 0; i < characterPages.length; i += 20) {
    const j = await mw({ action: "query", prop: "revisions|categories", rvprop: "ids|timestamp|content",
      rvslots: "main", cllimit: "500", clshow: "!hidden", titles: characterPages.slice(i, i + 20).join("|") });
    for (const page of Object.values(j?.query?.pages || {})) {
      if (page.missing !== undefined) { chars.set(page.title, { title: page.title, missing: true }); continue; }
      const revision = page?.revisions?.[0] || {};
      const wt = revision?.slots?.main?.["*"] || "";
      const head = wt.split(/\n==[^=]/)[0];
      const cats = (page.categories || []).map((c) => c.title.replace(/^Category:/, ""));
      chars.set(page.title, {
        title: page.title, source: wikiUrl(page.title), pageid: page.pageid,
        revision: revision.revid, timestamp: revision.timestamp, content_sha256: digest(wt),
        species: fieldLinks(infoboxField(head, "species").split(";")[0]),
        affiliations: fieldLinks(infoboxField(head, "affiliation")),
        rank: fieldLinks(infoboxField(head, "rank"))[0] || null,
        status: infoboxField(head, "status").replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1").replace(/<[^>]+>/g, "").trim().slice(0, 60) || null,
        raw_categories: cats,
      });
    }
    console.log(`  character pages ${i + 1}-${Math.min(i + 20, characterPages.length)} read`);
  }
  return chars;
}

// ---- power-bloc projection rules (deterministic, from sourced species/affiliation) ----
const BLOCS = [
  { key: "dominion", label: "Dominion", species: /^(Changeling|Founder|Vorta|Jem'Hadar)$/i, affil: /Dominion/i },
  { key: "cardassian", label: "Cardassian Union", species: /^Cardassian$/i, affil: /Cardassian|Obsidian Order/i },
  { key: "bajoran", label: "Bajoran", species: /^Bajoran$/i, affil: /Bajoran|Militia|Resistance|Vedek|Kai\b/i },
  { key: "klingon", label: "Klingon Empire", species: /^Klingon$/i, affil: /Klingon|House of|Defense Force/i },
  { key: "ferengi", label: "Ferengi Alliance", species: /^Ferengi$/i, affil: /Ferengi|Nagus/i },
];
const inBloc = (bloc, node) => node.species.some((s) => bloc.species.test(s))
  || node.affiliations.some((a) => bloc.affil.test(a))
  || node.lineages.some((l) => bloc.affil.test(l));

// ================= run =================
await mkdir("data/ds9/graph", { recursive: true });
const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const characterPages = [...new Set(roster.map((r) => r.character_page).filter(Boolean))].sort();

let charData;
if (PROJECT_ONLY) {
  const prior = JSON.parse(await readFile("data/ds9/graph/nodes.json", "utf8"));
  charData = new Map(prior.nodes.filter((n) => n.type === "character")
    .map((n) => [n.page, { title: n.page, source: n.source, pageid: n.pageid, revision: n.revision,
      timestamp: n.timestamp, content_sha256: n.content_sha256, species: n.species, affiliations: n.affiliations,
      rank: n.rank, status: n.status, raw_categories: n.raw_categories, lineages: n.lineages, missing: n.missing }]));
} else {
  console.log(`== reading ${characterPages.length} DS9 character pages ==`);
  charData = await crawl(characterPages);
}

// ---- build nodes + typed, cited edges ----
const nodes = new Map();
const addNode = (type, id, extra = {}) => {
  const key = type + ":" + id;
  if (!nodes.has(key)) nodes.set(key, { type, id, label: id, ...extra });
  return nodes.get(key);
};
const edges = [];
const addEdge = (type, from, to, citation) =>
  edges.push({ type, from, to, ...citation });

// performer -> character (episode-cited, from the roster)
for (const row of roster) {
  const cid = row.character_page || row.character;
  addNode("performer", row.performer, { roles: 0 });
  nodes.get("performer:" + row.performer).roles++;
  addNode("character", cid, { label: row.character, page: row.character_page,
    source: row.character_source, named: row.named, unnamed: row.unnamed });
  addEdge("portrayed", "performer:" + row.performer, "character:" + cid, {
    citation_type: "episode-credit",
    episodes: row.episodes.map((e) => ({ episode: e.episode, source: e.source, revision: e.revision })),
  });
}

// enrich character nodes + species / affiliation / lineage edges (page/category-cited)
for (const [page, c] of charData) {
  const node = nodes.get("character:" + page);
  if (!node) continue;
  const infoboxCite = { citation_type: "infobox", source: c.source, revision: c.revision, content_sha256: c.content_sha256 };
  // collect orgs and lineages from BOTH the infobox affiliation field and the
  // category list; the infobox citation wins when the same body appears in both.
  const orgs = new Map(), lineages = new Map(), species = new Map();
  for (const s of c.species || []) species.set(s, infoboxCite);
  for (const a of c.affiliations || []) (lineageOf(a) ? lineages : orgs).set(a, infoboxCite);
  for (const cat of c.raw_categories || []) {
    if (SPECIES_CATEGORIES[cat] && !species.has(SPECIES_CATEGORIES[cat]))
      species.set(SPECIES_CATEGORIES[cat], { citation_type: "category-membership", source: catUrl(cat), category: cat });
    if (lineageOf(cat)) { if (!lineages.has(cat)) lineages.set(cat, { citation_type: "category-membership", source: catUrl(cat), category: cat }); continue; }
    const org = orgCategory(cat);
    if (org && !orgs.has(org)) orgs.set(org, { citation_type: "category-membership", source: catUrl(cat), category: cat });
  }
  Object.assign(node, { source: c.source, pageid: c.pageid, revision: c.revision, timestamp: c.timestamp,
    content_sha256: c.content_sha256, species: [...species.keys()].sort(), affiliations: [...orgs.keys()].sort(),
    rank: c.rank || null, status: c.status || null, raw_categories: c.raw_categories || [],
    lineages: [...lineages.keys()].sort(), missing: c.missing || false });
  for (const [s, cite] of species) { addNode("species", s); addEdge("is_species", "character:" + page, "species:" + s, cite); }
  for (const [a, cite] of orgs) { addNode("organization", a); addEdge("affiliated_with", "character:" + page, "organization:" + a, cite); }
  for (const [l, cite] of lineages) { addNode("lineage", l); addEdge("member_of", "character:" + page, "lineage:" + l, cite); }
}
// default empty structured fields on characters whose page was page-less/prose-only
for (const node of nodes.values()) if (node.type === "character") {
  node.species ??= []; node.affiliations ??= []; node.lineages ??= []; node.raw_categories ??= [];
  node.rank ??= null; node.status ??= null; node.missing ??= false;
}

const nodeList = [...nodes.values()].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
edges.sort((a, b) => a.type.localeCompare(b.type) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

// ---- seven named projections ----
const characterNodes = nodeList.filter((n) => n.type === "character");
const projection = (label, includeChar, edgeTypes) => {
  const keep = new Set(characterNodes.filter(includeChar).map((n) => "character:" + n.id));
  const subEdges = edges.filter((e) => edgeTypes.includes(e.type) && (keep.has(e.from) || keep.has(e.to)));
  const nodeIds = new Set();
  for (const e of subEdges) { nodeIds.add(e.from); nodeIds.add(e.to); }
  return { label, node_count: nodeIds.size, edge_count: subEdges.length,
    nodes: nodeList.filter((n) => nodeIds.has(n.type + ":" + n.id)).map((n) => n.type + ":" + n.id),
    edges: subEdges };
};
const graphs = {
  portrayal: projection("Portrayal — who wore which face", () => true, ["portrayed"]),
  species: projection("Species — character to alien race", () => true, ["is_species"]),
};
for (const bloc of BLOCS)
  graphs[bloc.key] = projection(bloc.label, (n) => inBloc(bloc, n), ["is_species", "affiliated_with", "member_of", "portrayed"]);

// ---- write ----
const nodesDoc = { version: 1, production: "Star Trek: Deep Space Nine", captured_at: CAPTURED_AT,
  counts: nodeList.reduce((a, n) => (a[n.type] = (a[n.type] || 0) + 1, a), {}), nodes: nodeList };
const edgesDoc = { version: 1, production: "Star Trek: Deep Space Nine",
  edge_types: { portrayed: "performer wore character (episode-credited)", is_species: "character is of species (infobox)",
    affiliated_with: "character affiliated with organization (infobox)", member_of: "character belongs to lineage/House/family (category)" },
  counts: edges.reduce((a, e) => (a[e.type] = (a[e.type] || 0) + 1, a), {}), edges };
if (!PROJECT_ONLY) {
  await writeFile("data/ds9/graph/nodes.json", JSON.stringify(nodesDoc, null, 1) + "\n");
  await writeFile("data/ds9/graph/edges.json", JSON.stringify(edgesDoc, null, 1) + "\n");
}
await writeFile("data/ds9/graph/graphs.json", JSON.stringify({ version: 1,
  note: "Seven projections over nodes.json/edges.json. Each lists node ids and the cited edges. Power-bloc membership is a deterministic projection of sourced species/affiliation/lineage; a character in more than one bloc appears in each.",
  bloc_rules: BLOCS.map((b) => ({ key: b.key, label: b.label, species: String(b.species), affiliation: String(b.affil) })),
  graphs: Object.fromEntries(Object.entries(graphs).map(([k, g]) => [k, { label: g.label, node_count: g.node_count, edge_count: g.edge_count }])),
  detail: graphs }, null, 1) + "\n");
await writeFile("data/ds9/graph/graph-summary.json", JSON.stringify({ version: 1,
  generated_from: ["data/ds9/graph/nodes.json", "data/ds9/graph/edges.json"],
  node_counts: nodesDoc.counts, edge_counts: edgesDoc.counts,
  characters_with_species: characterNodes.filter((n) => n.species.length).length,
  characters_without_species: characterNodes.filter((n) => !n.species.length).length,
  missing_pages: characterNodes.filter((n) => n.missing).length,
  graphs: Object.fromEntries(Object.entries(graphs).map(([k, g]) => [k, { node_count: g.node_count, edge_count: g.edge_count }])) }, null, 1) + "\n");

console.log(`\nnodes: ${JSON.stringify(nodesDoc.counts)}`);
console.log(`edges: ${JSON.stringify(edgesDoc.counts)}`);
console.log(`graphs: ${Object.entries(graphs).map(([k, g]) => `${k}(${g.node_count}n/${g.edge_count}e)`).join(" ")}`);
