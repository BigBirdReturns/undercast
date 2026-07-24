export const MAPPING_FIELDS = Object.freeze(new Set(["universe", "production"]));

export function validateEstateMappings({ mappings, registry }) {
  const errors = [];
  if (mappings?.version !== 1 || !Array.isArray(mappings?.mappings)) errors.push("ESTATE-MAPPINGS must be version 1 with mappings[]");
  const estateIds = new Set((registry?.estates || []).map((row) => row.id));
  const keys = new Set();
  for (const row of mappings?.mappings || []) {
    if (!MAPPING_FIELDS.has(row.field)) errors.push(`estate mapping has invalid field ${row.field}`);
    if (!String(row.value || "").trim()) errors.push("estate mapping has an empty exact value");
    if (!estateIds.has(row.estate_id)) errors.push(`estate mapping points at unknown estate ${row.estate_id}`);
    const key = `${row.field}|${row.value}`;
    if (keys.has(key)) errors.push(`duplicate exact estate mapping ${key}`); else keys.add(key);
  }
  return errors;
}

export function estateForRecord(record, mappings) {
  const matches = (mappings?.mappings || []).filter((row) => String(record?.[row.field] || "") === row.value);
  const estates = [...new Set(matches.map((row) => row.estate_id))];
  if (estates.length > 1) throw new Error(`${record.id} exact estate mappings conflict: ${estates.join(", ")}`);
  return estates[0] || null;
}

export function buildEstateInventory({ specimens, mappings, registry }) {
  const errors = validateEstateMappings({ mappings, registry });
  if (errors.length) throw new Error(errors.join("; "));
  const byEstate = new Map((registry.estates || []).map((row) => [row.id, row]));
  const groups = new Map();
  let mapped = 0;
  for (const record of specimens || []) {
    const estateId = estateForRecord(record, mappings);
    if (estateId) mapped++;
    const key = `${estateId || "unmapped"}|${record.universe}|${record.production}`;
    const group = groups.get(key) || {
      estate_id: estateId,
      estate_label: estateId ? byEstate.get(estateId)?.label || estateId : null,
      universe: record.universe,
      production: record.production,
      records: 0,
      sample_ids: [],
    };
    group.records++;
    if (group.sample_ids.length < 8) group.sample_ids.push(record.id);
    groups.set(key, group);
  }
  const rows = [...groups.values()].sort((a, b) => {
    if (Boolean(a.estate_id) !== Boolean(b.estate_id)) return a.estate_id ? 1 : -1;
    return b.records - a.records || a.universe.localeCompare(b.universe) || a.production.localeCompare(b.production);
  });
  return {
    version: 1,
    semantics: "Exact reviewed field mappings only. Unmapped production groups are an explicit estate-induction queue, not evidence of absence or automatic franchise membership.",
    records: specimens.length,
    mapped_records: mapped,
    unmapped_records: specimens.length - mapped,
    mapped_ratio: specimens.length ? mapped / specimens.length : 0,
    groups: rows,
  };
}
