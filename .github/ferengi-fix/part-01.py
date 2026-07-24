      const row=records.get(id)||{id,credits:[]};
      row.credits.push({character:credit.character,performer:credit.performer,
        performance_mode:credit.performance_mode,source:credit.source});
      records.set(id,row);
    }
  }
  const filed=[...records.values()].map(row=>({...row,credits:row.credits.sort((a,b)=>a.character.localeCompare(b.character)||a.performer.localeCompare(b.performer))})).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
  const primaryKeys=new Set();
  const wallRecords=[];
  for(const row of filed){
    const specimen=specimensById.get(row.id);
    const primary=primaryCreditsFor(specimen,row.credits);
    if(!primary.length) continue;
    for(const credit of primary) primaryKeys.add(creditKey(credit));
    wallRecords.push({id:row.id,credits:primary});
  }
  const creditRows=credits.map(credit=>{
    const key=creditKey(credit);
    const wallIds=[...(credit.wall_ids||[])].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const status=!credit.role_on_wall?"unfiled":primaryKeys.has(key)?"primary-card":"additional-performance";
    return {character:credit.character,performer:credit.performer,performance_mode:credit.performance_mode,
      source:credit.source,status,wall_ids:wallIds};
  }).sort((a,b)=>a.character.localeCompare(b.character)||a.performer.localeCompare(b.performer));
  const physical=credits.filter(row=>row.performance_mode.startsWith("physical-"));
  const voice=credits.filter(row=>row.performance_mode==="voice-animation");
  const unresolvedMode=credits.filter(row=>row.performance_mode==="unresolved");
  const primaryCount=creditRows.filter(row=>row.status==="primary-card").length;
  const additionalCount=creditRows.filter(row=>row.status==="additional-performance").length;
  const unfiledCount=creditRows.filter(row=>row.status==="unfiled").length;
  if(primaryCount+additionalCount+unfiledCount!==credits.length) throw new Error(`${taxon.key} role disposition accounting drift`);
  return {
    ...taxon,
    wall_route:route("index.html",{species:taxon.label}),
    coverage_route:route("coverage.html",{franchise:taxon.franchise,category:taxon.source_category,mode:"physical-any"}),
    counts:{named_credits:credits.length,distinct_performers:new Set(credits.map(row=>row.performer.normalize("NFKC").toLowerCase())).size,
      physical_credits:physical.length,voice_credits:voice.length,unresolved_mode_credits:unresolvedMode.length,
      unresolved_characters:unknowns.length,filed_role_credits:credits.filter(row=>row.role_on_wall).length,
      filed_records:filed.length,primary_card_credits:primaryCount,primary_card_records:wallRecords.length,
      additional_performance_credits:additionalCount,unfiled_named_credits:unfiledCount},
    records:filed,
    wall_records:wallRecords,
    credits:creditRows,
    unresolved_characters:unknowns
  };
}).sort((a,b)=>a.franchise.localeCompare(b.franchise)||a.label.localeCompare(b.label));

const sourceInputs=[coverageInput,unresolvedInput,vocabularyInput,specimensInput];
const inputs=Object.fromEntries(Object.keys(paths).map((key,index)=>[key,{path:paths[key],sha256:sha256(sourceInputs[index].body)}]));
const projection={version:2,schema:"schema/species.schema.json",generated_from:inputs,
  semantics:"Exact source-category role projection. The wall facet contains only records whose displayed primary role is in the taxon; additional filed performances and unfiled named credits remain visible in the complete role ledger. Counts describe the captured community-wiki scope, not all licensed media.",taxa};
await writeFile("data/species.json",JSON.stringify(projection,null,1)+"\n");
console.log(`built species navigation: ${taxa.map(taxon=>`${taxon.label} ${taxon.counts.primary_card_records} primary cards / ${taxon.counts.named_credits} named credits`).join(", ")}`);
''')

# Shard and browser species facets must use primary displayed roles only.
replace_once(
    'scripts/shard.mjs',
    'for (const taxon of speciesProjectionData.taxa || []) for (const record of taxon.records || []) {',
    'for (const taxon of speciesProjectionData.taxa || []) {\n  if (!Array.isArray(taxon.wall_records)) throw new Error(`species taxon ${taxon.key || taxon.label || "<unknown>"} lacks exact wall_records`);\n  for (const record of taxon.wall_records) {',
)
replace_once(
    'scripts/shard.mjs',
    '  speciesByRecord.set(record.id, labels);\n}',
    '    speciesByRecord.set(record.id, labels);\n  }\n}',
)

# ---- Species schema v2 ----
species_schema_path = ROOT / 'schema/species.schema.json'
species_schema = json.loads(species_schema_path.read_text())
species_schema['properties']['version'] = {'const': 2}
counts = species_schema['$defs']['counts']
for key in ['primary_card_credits', 'primary_card_records', 'additional_performance_credits']:
    if key not in counts['required']:
        counts['required'].append(key)
    counts['properties'][key] = {'type': 'integer', 'minimum': 0}
species_schema['$defs']['taxonomyCredit'] = {
    'type': 'object',
    'additionalProperties': False,
    'required': ['character', 'performer', 'performance_mode', 'source', 'status', 'wall_ids'],
    'properties': {
        'character': {'type': 'string', 'minLength': 1},
        'performer': {'type': 'string', 'minLength': 2},
        'performance_mode': {'enum': ['physical-prosthetic', 'physical-and-voice', 'voice-animation', 'unresolved']},
        'source': {'type': 'string', 'format': 'uri', 'pattern': '^https://'},
        'status': {'enum': ['primary-card', 'additional-performance', 'unfiled']},
        'wall_ids': {'type': 'array', 'items': {'type': 'string', 'pattern': '^UC-G?\\d+$'}, 'uniqueItems': True},
    },
}
taxon = species_schema['$defs']['taxon']
for key in ['wall_records', 'credits']:
    if key not in taxon['required']:
        taxon['required'].append(key)
taxon['properties']['wall_records'] = {'type': 'array', 'items': {'$ref': '#/$defs/record'}}
taxon['properties']['credits'] = {'type': 'array', 'items': {'$ref': '#/$defs/taxonomyCredit'}}
species_schema_path.write_text(json.dumps(species_schema, ensure_ascii=False, indent=2) + '\n')

