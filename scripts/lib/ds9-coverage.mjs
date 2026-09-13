// Queue wall membership has one owner: current DS9 coverage, joined by key.
export function coverageByKey(coverage, roster) {
  const byKey = new Map();
  for (const row of coverage) {
    if (!row.duplicate_key || byKey.has(row.duplicate_key) ||
        !Array.isArray(row.wall_ids) || typeof row.role_on_wall !== "boolean" ||
        row.role_on_wall !== (row.wall_ids.length > 0)) throw new Error("Invalid/duplicate DS9 coverage key " + row.duplicate_key);
    byKey.set(row.duplicate_key, row);
  }
  if (byKey.size !== roster.length || roster.some(row => !byKey.has(row.duplicate_key)))
    throw new Error("DS9 coverage and current roster keys differ; rebuild coverage first");
  return byKey;
}

export function resolveDS9Key(key, aliases) {
  const seen = new Set();
  while (Object.hasOwn(aliases, key)) {
    if (seen.has(key)) throw new Error("Cyclic DS9 migration alias " + key);
    seen.add(key); key = aliases[key];
  }
  return key;
}
