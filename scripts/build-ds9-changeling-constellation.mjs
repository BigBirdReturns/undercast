#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const slug = (value) => String(value || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "") || "unknown";
const unique = (values) => [...new Set(values)];

const census = await readJson("data/DS9-CHANGELING-CENSUS.json");
const graph = await readJson("data/constellations.json");
const records = await readJson("data/specimens.json");
const recordById = new Map(records.map((record) => [record.id, record]));
const constellationId = "constellation:ds9-changeling-performers";
const previous = graph.constellations.find((item) => item.id === constellationId);

if (!Array.isArray(census.rows) || !census.rows.length) throw new Error("DS9 Changeling census has no rows");
const keys = new Set();
for (const row of census.rows) {
  if (!row.key || keys.has(row.key)) throw new Error(`duplicate or missing census key: ${row.key}`);
  keys.add(row.key);
  if (!row.role || !/^https:\/\//.test(row.source || "")) throw new Error(`${row.key} lacks an exact role or HTTPS evidence`);
  if (row.disposition === "unresolved-performer" && row.performer !== null) throw new Error(`${row.key} must preserve a null performer`);
  if (row.disposition !== "unresolved-performer" && !row.performer) throw new Error(`${row.key} lacks a named performer`);
  if (row.disposition === "specimen") {
    const record = recordById.get(row.record_id);
    const roles = record ? [record.character, ...(record.performances || []).map((item) => item.character)] : [];
    if (!record || record.actor !== row.performer || !roles.includes(row.role)) throw new Error(`${row.key} specimen anchor does not match ${row.record_id}`);
  } else if (row.record_id) throw new Error(`${row.key} non-specimen row must not claim ${row.record_id}`);
}
for (const key of census.benchmark?.required_keys || []) if (!keys.has(key)) throw new Error(`DS9 Changeling benchmark is missing required row ${key}`);
const namedCreditCount = census.rows.filter((row) => row.performer).length;
const unresolvedCount = census.rows.filter((row) => row.disposition === "unresolved-performer").length;
if (namedCreditCount < (census.benchmark?.minimum_named_credits || 0)) throw new Error(`DS9 Changeling named-credit floor failed: ${namedCreditCount}`);
if (unresolvedCount < (census.benchmark?.minimum_unresolved_performers || 0)) throw new Error(`DS9 Changeling unresolved-performer floor failed: ${unresolvedCount}`);

graph.constellations = graph.constellations.filter((item) => item.id !== constellationId);
const retainedNodeIds = new Set(graph.constellations.flatMap((item) => item.node_ids));
const previousNodeIds = new Set(previous?.node_ids || []);
const previousEdgeIds = new Set(previous?.edge_ids || []);
graph.nodes = graph.nodes.filter((node) => !previousNodeIds.has(node.id) || retainedNodeIds.has(node.id));
graph.edges = graph.edges.filter((edge) => !previousEdgeIds.has(edge.id));

const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
const addNode = (node) => {
  const existing = nodes.get(node.id);
  if (!existing) nodes.set(node.id, node);
  else if (node.record_ids?.length) existing.record_ids = unique([...(existing.record_ids || []), ...node.record_ids]);
};
const addEdge = (edge) => {
  if (edges.has(edge.id)) throw new Error(`duplicate generated edge ${edge.id}`);
  edges.set(edge.id, edge);
};

addNode({
  id: "franchise:star-trek", kind: "franchise", label: "Star Trek",
  description: "The science-fiction franchise containing Star Trek: Deep Space Nine.",
  source: "https://en.wikipedia.org/wiki/Star_Trek"
});
addNode({
  id: "production:star-trek-deep-space-nine", kind: "production", label: "Star Trek: Deep Space Nine",
  description: "The Star Trek series in which this Changeling performer census is scoped.",
  source: "https://memory-alpha.fandom.com/wiki/Star_Trek:_Deep_Space_Nine"
});
if (!edges.has("edge:deep-space-nine-belongs-to-star-trek")) addEdge({
  id: "edge:deep-space-nine-belongs-to-star-trek",
  from: "production:star-trek-deep-space-nine", to: "franchise:star-trek",
  predicate: "belongs_to", scope: "structure", note: "Series-to-franchise relationship.",
  evidence: [{ label: "Deep Space Nine is a Star Trek series", source: "https://memory-alpha.fandom.com/wiki/Star_Trek:_Deep_Space_Nine", publisher: "Memory Alpha" }]
});

const nodeIds = new Set(["franchise:star-trek", "production:star-trek-deep-space-nine"]);
const edgeIds = new Set(["edge:deep-space-nine-belongs-to-star-trek"]);

for (const row of census.rows) {
  const characterId = `character:ds9-changeling-${slug(row.key)}`;
  addNode({
    id: characterId, kind: "character", label: row.role,
    description: row.note, source: row.source,
    ...(row.record_id ? { record_ids: [row.record_id] } : {})
  });
  nodeIds.add(characterId);

  const structureId = `edge:ds9-changeling-${slug(row.key)}-belongs-to-deep-space-nine`;
  addEdge({
    id: structureId, from: characterId, to: "production:star-trek-deep-space-nine",
    predicate: "belongs_to", scope: "structure", note: "Places this exact Changeling performer/form credit in Deep Space Nine.",
    evidence: [{ label: `${row.role} is documented in Deep Space Nine`, source: row.source, publisher: "Memory Alpha" }]
  });
  edgeIds.add(structureId);

  if (!row.performer) continue;
  const personId = `person:${slug(row.performer)}`;
  addNode({
    id: personId, kind: "person", label: row.performer,
    description: `Performer with an exact on-screen Changeling form credit in Deep Space Nine.`,
    source: row.performer_source || row.source,
    ...(row.record_id ? { record_ids: [row.record_id] } : {})
  });
  nodeIds.add(personId);
  const performanceId = `edge:ds9-changeling-${slug(row.key)}-performed-by-${slug(row.performer)}`;
  addEdge({
    id: performanceId, from: personId, to: characterId, predicate: "performed",
    scope: row.disposition === "specimen" ? "specimen" : "context",
    ...(row.record_id ? { record_id: row.record_id } : {}),
    note: row.note,
    evidence: [{ label: `${row.role} was performed by ${row.performer}`, source: row.source, publisher: "Memory Alpha" }]
  });
  edgeIds.add(performanceId);
}

const namedRows = census.rows.filter((row) => row.performer);
const physical = namedRows.filter((row) => row.performance_mode === "physical-prosthetic");
const context = namedRows.filter((row) => row.disposition === "context-human-form");
const unresolved = census.rows.filter((row) => row.disposition === "unresolved-performer");
graph.nodes = [...nodes.values()];
graph.edges = [...edges.values()];
graph.constellations.push({
  id: constellationId,
  title: "Every filed DS9 Changeling performer",
  kicker: "THE CHANGELING CENSUS",
  summary: `${unique(namedRows.map((row) => row.performer)).length} named performers across ${namedRows.length} exact on-screen form credits: ${physical.length} practical designed-face credits, ${context.length} visible Human impersonations retained as context, and ${unresolved.length} practical performer explicitly unresolved. CGI-only and prop-only manifestations are outside this performer census.`,
  node_ids: [...nodeIds],
  edge_ids: [...edgeIds]
});

await writeFile("data/constellations.json", JSON.stringify(graph, null, 2) + "\n");
console.log(`DS9 Changeling constellation: ${namedRows.length} named credits, ${unresolved.length} unresolved, ${nodeIds.size} nodes, ${edgeIds.size} edges`);
