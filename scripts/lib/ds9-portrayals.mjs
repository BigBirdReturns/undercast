// Reconcile episode-credit edges only. Relationship evidence is never regenerated.
export function reconcilePortrayals(nodeList, edgeList, roster, migration) {
  const affected = new Set(migration.changes.map(change => change.to));
  const retiredCharacters = new Set(migration.changes.flatMap(change => change.original_rows || [])
    .map(row => row.character_page || row.character));
  const nodes = new Map(nodeList.map(node => [node.type + ":" + node.id, node]));
  const groups = new Map();
  for (const row of roster) {
    const from = "performer:" + row.performer, to = "character:" + (row.character_page || row.character);
    const key = from + "|" + to;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
    if (!nodes.has(from)) nodes.set(from, { type: "performer", id: row.performer, label: row.performer, pageid: row.performer_pageid });
    if (!nodes.has(to)) nodes.set(to, { type: "character", id: row.character_page || row.character,
      label: row.character, page: row.character_page, character_named: row.character_named,
      background_role: row.background_role, in_cast: true });
  }
  const existing = new Map(edgeList.filter(edge => edge.type === "portrayed").map(edge => [edge.from + "|" + edge.to, edge]));
  const portrayals = [];
  for (const [key, rows] of groups) {
    const old = existing.get(key);
    if (old && !rows.some(row => affected.has(row.duplicate_key))) { portrayals.push(old); continue; }
    const first = rows[0];
    const episodes = [...new Map(rows.flatMap(row => row.episodes).map(e => [e.source + "|" + e.revision, e])).values()];
    portrayals.push({ type: "portrayed", from: "performer:" + first.performer,
      to: "character:" + (first.character_page || first.character), citation_type: "episode-credit",
      predicate: "portrayed", episodes, duplicate_keys: rows.map(row => row.duplicate_key),
      source_credits: rows.flatMap(row => row.source_credits || []) });
  }
  const edges = [...portrayals, ...edgeList.filter(edge => edge.type !== "portrayed")];
  for (const character of retiredCharacters) {
    const key = "character:" + character;
    if (!edges.some(edge => edge.from === key || edge.to === key)) nodes.delete(key);
  }
  return { nodes: [...nodes.values()], edges };
}
