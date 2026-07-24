# The inlined archive validator does not implement JSON Schema `const`; use enum.
species_schema_path = ROOT / 'schema/species.schema.json'
species_schema = json.loads(species_schema_path.read_text())
species_schema['properties']['version'] = {'type': 'integer', 'enum': [2]}
species_schema_path.write_text(json.dumps(species_schema, ensure_ascii=False, indent=2) + '\n')

replace_once(
    'scripts/validate.mjs',
    '''    const expectedIds = new Set(credits.flatMap((row) => row.wall_ids || []));
    const filedIds = new Set((taxon.records || []).map((row) => row.id));
    if (expectedIds.size !== filedIds.size || [...expectedIds].some((id) => !filedIds.has(id)))
      fail("species.navigation_integrity", `${taxon.label} filed record set is not the exact census join`);
    for (const record of taxon.records || []) {
''',
    '''    const expectedIds = new Set(credits.flatMap((row) => row.wall_ids || []));
    const filedIds = new Set((taxon.records || []).map((row) => row.id));
    if (expectedIds.size !== filedIds.size || [...expectedIds].some((id) => !filedIds.has(id)))
      fail("species.navigation_integrity", `${taxon.label} filed record set is not the exact census join`);
    const wallRecords = taxon.wall_records || [];
    const wallIds = new Set(wallRecords.map((row) => row.id));
    if (taxon.counts?.filed_records !== filedIds.size || taxon.counts?.primary_card_records !== wallIds.size)
      fail("species.navigation_integrity", `${taxon.label} filed/primary record counts drifted`);
    for (const id of wallIds) {
      if (!filedIds.has(id)) fail("species.navigation_integrity", `${taxon.label} wall facet points outside its exact filed join: ${id}`);
      if (!Array.isArray(indexById.get(id)?.sp) || !indexById.get(id).sp.includes(taxon.label))
        fail("species.navigation_integrity", `${id} is missing ${taxon.label} from the lean index`);
    }
    for (const id of filedIds) if (!wallIds.has(id) && indexById.get(id)?.sp?.includes(taxon.label))
      fail("species.navigation_integrity", `${id} inherits ${taxon.label} from an additional performance instead of its displayed role`);
    const dispositionKey = (row) => [row.character, row.performer, row.source].map(normalizeCensusKey).join("|");
    const primaryKeys = new Set(wallRecords.flatMap((record) => (record.credits || []).map(dispositionKey)));
    const ledger = taxon.credits || [];
    if (ledger.length !== credits.length) fail("species.navigation_integrity", `${taxon.label} complete credit ledger count drifted`);
    const dispositionCounts = { "primary-card": 0, "additional-performance": 0, unfiled: 0 };
    for (const row of ledger) {
      const exact = credits.find((credit) => credit.character === row.character && credit.performer === row.performer && credit.performance_mode === row.performance_mode && credit.source === row.source);
      if (!exact) { fail("species.navigation_integrity", `${taxon.label} ledger carries a non-source credit ${row.character} / ${row.performer}`); continue; }
      const expectedStatus = !exact.role_on_wall ? "unfiled" : primaryKeys.has(dispositionKey(row)) ? "primary-card" : "additional-performance";
      if (row.status !== expectedStatus) fail("species.navigation_integrity", `${taxon.label} ${row.character} / ${row.performer} is ${row.status}; expected ${expectedStatus}`);
      const expectedWallIds = [...(exact.wall_ids || [])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (JSON.stringify(row.wall_ids || []) !== JSON.stringify(expectedWallIds)) fail("species.navigation_integrity", `${taxon.label} ${row.character} / ${row.performer} wall binding drifted`);
      if (row.status in dispositionCounts) dispositionCounts[row.status]++;
    }
    if (taxon.counts?.primary_card_credits !== dispositionCounts["primary-card"] || taxon.counts?.additional_performance_credits !== dispositionCounts["additional-performance"] || taxon.counts?.unfiled_named_credits !== dispositionCounts.unfiled)
      fail("species.navigation_integrity", `${taxon.label} role disposition counts drifted`);
    for (const record of taxon.records || []) {
''',
)
replace_once(
    'scripts/validate.mjs',
    '''      if (!specIds.has(record.id)) fail("species.navigation_integrity", `${taxon.label} points at missing ${record.id}`);
      if (!Array.isArray(indexById.get(record.id)?.sp) || !indexById.get(record.id).sp.includes(taxon.label))
        fail("species.navigation_integrity", `${record.id} is missing ${taxon.label} from the lean index`);
      for (const credit of record.credits || []) {
''',
    '''      if (!specIds.has(record.id)) fail("species.navigation_integrity", `${taxon.label} points at missing ${record.id}`);
      for (const credit of record.credits || []) {
''',
)
replace_once(
    'scripts/validate.mjs',
    '        const exactRole = [specimen?.character, ...(specimen?.performances || []).map((performance) => performance.character)].some((role) => normalizeCensusKey(role) === normalizeCensusKey(credit.character));',
    '        const exactRole = [specimen?.character, ...(specimen?.roleAliases || []).map((alias) => alias.character), ...(specimen?.performances || []).map((performance) => performance.character)].some((role) => normalizeCensusKey(role) === normalizeCensusKey(credit.character));',
)
