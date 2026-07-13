#!/usr/bin/env node
/**
 * Project the source-scoped Ferengi census into the maintained evidence graph.
 *
 * This is the durable discovery layer between a raw census lead and a polished
 * specimen card: every named performer-role credit remains findable and
 * citable without pretending that every lead already has a complete record.
 */
import { readFile, writeFile } from "node:fs/promises";
import { normalizeCensusKey as normalize } from "./census-key.mjs";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const slug = (value) => normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
const unique = (values) => [...new Set(values)];

const coverage = (await readJson("data/CENSUS-COVERAGE.json"))
  .filter((row) => normalize(row.franchise) === "star trek" && normalize(row.category) === "ferengi");
const unresolved = (await readJson("data/CENSUS-UNRESOLVED.json"))
  .filter((row) => normalize(row.franchise) === "star trek" && normalize(row.category) === "ferengi");
const graph = await readJson("data/constellations.json");
const specimens = await readJson("data/specimens.json");
const specimenById = new Map(specimens.map((row) => [row.id, row]));
const recordMatchesCredit = (record, row) => record
  && [record.actor, ...(record.aliases || [])].some((name) => normalize(name) === normalize(row.performer))
  && [record.character, ...(record.performances || []).map((item) => item.character)]
    .some((character) => normalize(character) === normalize(row.character));
const constellationId = "constellation:every-ferengi-performer";
const previous = graph.constellations.find((item) => item.id === constellationId);
const previousNodeIds = new Set(previous?.node_ids || []);
const previousEdgeIds = new Set(previous?.edge_ids || []);
const nodesUsedElsewhere = new Set(graph.constellations.filter((item) => item.id !== constellationId).flatMap((item) => item.node_ids));

graph.nodes = graph.nodes.filter((node) => !previousNodeIds.has(node.id) || nodesUsedElsewhere.has(node.id));
graph.edges = graph.edges.filter((edge) => !previousEdgeIds.has(edge.id));
graph.constellations = graph.constellations.filter((item) => item.id !== constellationId);

const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
const addNode = (node) => {
  const existing = nodes.get(node.id);
  if (existing) {
    if (node.record_ids?.length) existing.record_ids = unique([...(existing.record_ids || []), ...node.record_ids]).sort();
    return existing;
  }
  nodes.set(node.id, node);
  graph.nodes.push(node);
  return node;
};

addNode({
  id: "franchise:star-trek", kind: "franchise", label: "Star Trek",
  description: "The licensed-media franchise containing the source-scoped Ferengi performer census.",
  source: "https://www.startrek.com/",
});

const ferengiNodeIds = new Set(["franchise:star-trek"]);
const ferengiEdgeIds = [];
const characterRows = new Map();
for (const row of coverage) {
  const key = normalize(row.character);
  if (!characterRows.has(key)) characterRows.set(key, []);
  characterRows.get(key).push(row);
}

for (const rows of characterRows.values()) {
  const first = rows[0];
  const characterId = `character:ferengi-${slug(first.character)}`;
  const wallIds = unique(rows.flatMap((row) => (row.wall_ids || []).filter((id) => {
    const record = specimenById.get(id);
    return recordMatchesCredit(record, row);
  }))).sort();
  addNode({
    id: characterId, kind: "character", label: first.character,
    description: `A Ferengi role with ${rows.length} named performer credit${rows.length === 1 ? "" : "s"} in the maintained census.`,
    source: first.source,
    ...(wallIds.length ? { record_ids: wallIds } : {}),
  });
  ferengiNodeIds.add(characterId);

  const belongsId = `edge:ferengi-${slug(first.character)}-belongs-to-star-trek`;
  graph.edges.push({
    id: belongsId, from: characterId, to: "franchise:star-trek", predicate: "belongs_to", scope: "structure",
    note: "Places this sourced Ferengi role inside the Star Trek franchise census.",
    evidence: [{ label: `${first.character} is filed as a Ferengi role`, source: first.source, publisher: "Memory Alpha" }],
  });
  ferengiEdgeIds.push(belongsId);

  for (const row of rows) {
    const personId = `person:${slug(row.performer)}`;
    const exactRecordId = (row.wall_ids || []).find((id) => {
      const record = specimenById.get(id);
      return recordMatchesCredit(record, row);
    });
    addNode({
      id: personId, kind: "person", label: row.performer,
      description: `A credited performer in the source-scoped Ferengi census.`,
      source: row.source,
      ...(exactRecordId ? { record_ids: [exactRecordId] } : {}),
    });
    ferengiNodeIds.add(personId);
    const edgeId = `edge:ferengi-${slug(row.performer)}-performed-${slug(row.character)}`;
    graph.edges.push({
      id: edgeId, from: personId, to: characterId, predicate: "performed",
      scope: exactRecordId ? "specimen" : "context",
      note: exactRecordId
        ? "Qualifying Ferengi performance with a polished UNDERCAST specimen."
        : row.performance_mode === "voice-animation"
          ? "Source-scoped voice credit retained as census context; it is not a claim that the performer wore a physical face."
          : "Qualifying physical Ferengi performance retained as a sourced discovery anchor while its polished card remains open.",
      ...(exactRecordId ? { record_id: exactRecordId } : {}),
      evidence: [{ label: `${row.performer} is credited as ${row.character}`, source: row.source, publisher: "Memory Alpha" }],
    });
    ferengiEdgeIds.push(edgeId);
  }
}

for (const row of unresolved) {
  const characterId = `character:ferengi-${slug(row.character)}`;
  addNode({
    id: characterId, kind: "character", label: row.character,
    description: `Ferengi census page with no named performer field; retained explicitly unresolved.`,
    source: row.source,
  });
  ferengiNodeIds.add(characterId);
  const edgeId = `edge:ferengi-${slug(row.character)}-belongs-to-star-trek`;
  if (!ferengiEdgeIds.includes(edgeId)) {
    graph.edges.push({
      id: edgeId, from: characterId, to: "franchise:star-trek", predicate: "belongs_to", scope: "structure",
      note: "Retains an unresolved Ferengi role without inventing a performer.",
      evidence: [{ label: `${row.character} remains an unresolved Ferengi census page`, source: row.source, publisher: "Memory Alpha" }],
    });
    ferengiEdgeIds.push(edgeId);
  }
}

const physical = coverage.filter((row) => row.performance_mode.startsWith("physical-"));
const voices = coverage.filter((row) => row.performance_mode === "voice-animation");
graph.constellations.push({
  id: constellationId,
  title: "Every filed Ferengi performer",
  kicker: "THE FERENGI TEST",
  summary: `${unique(coverage.map((row) => normalize(row.performer))).length} named performers across ${coverage.length} sourced role credits: ${physical.length} physical performances and ${voices.length} voice credits. Polished wall records and filed discovery anchors remain visibly distinct.`,
  node_ids: [...ferengiNodeIds].sort(),
  edge_ids: ferengiEdgeIds.sort(),
});
graph.version = Math.max(2, Number(graph.version) || 1);

await writeFile("data/constellations.json", JSON.stringify(graph, null, 2) + "\n");
console.log(`Ferengi constellation: ${coverage.length} named credits, ${unresolved.length} unresolved character pages, ${ferengiNodeIds.size} nodes, ${ferengiEdgeIds.length} edges`);
