from pathlib import Path
import json

ROOT = Path('.')

def read(path):
    return (ROOT / path).read_text()

def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)

def replace_once(path, old, new):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one occurrence, found {count}: {old[:100]!r}')
    write(path, text.replace(old, new, 1))

# ---- Canonical role-alias evidence ----
schema_path = ROOT / 'schema/specimen.schema.json'
schema = json.loads(schema_path.read_text())
schema['properties']['roleAliases'] = {
    'type': 'array',
    'description': 'Evidence-backed alternate labels for the primary displayed role (for example a source title without an in-universe rank). These are identity-equivalent names for the same role, not additional performances.',
    'items': {'$ref': '#/$defs/roleAlias'},
    'minItems': 1,
    'uniqueItems': True,
}
schema['$defs']['roleAlias'] = {
    'type': 'object',
    'additionalProperties': False,
    'required': ['character', 'reason', 'source'],
    'properties': {
        'character': {'type': 'string', 'minLength': 1},
        'reason': {'type': 'string', 'minLength': 12},
        'source': {'type': 'string', 'format': 'uri', 'pattern': '^https://'},
    },
}
schema_path.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + '\n')

specimens_path = ROOT / 'data/specimens.json'
specimens = json.loads(specimens_path.read_text())
by_id = {row['id']: row for row in specimens}
for required in ['UC-677', 'UC-678', 'UC-679']:
    if required not in by_id:
        raise SystemExit(f'missing specimen {required}')
by_id['UC-677']['roleAliases'] = [{
    'character': 'Lurin',
    'reason': 'Memory Alpha files the same character without the in-universe DaiMon rank used by the displayed card title.',
    'source': 'https://memory-alpha.fandom.com/wiki/Lurin',
}]
for ident in ['UC-678', 'UC-679']:
    row = by_id[ident]
    row['universe'] = 'Star Trek'
    row.pop('kind', None)
specimens_path.write_text(json.dumps(specimens, ensure_ascii=False, indent=1) + '\n')

# Census coverage must recognize source-backed primary-role aliases.
replace_once(
    'scripts/census.mjs',
    '    const filedRoles = [record.character, ...(record.performances || []).map((item) => item.character)].map(normalize);',
    '    const filedRoles = [record.character, ...(record.roleAliases || []).map((item) => item.character), ...(record.performances || []).map((item) => item.character)].map(normalize);',
)

# ---- Exact role-aware species projection ----
write('scripts/build-species.mjs', r'''#!/usr/bin/env node
/** Build exact species navigation from maintained census categories. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { normalizeCensusKey as normalize } from "./census-key.mjs";

const paths={coverage:"data/CENSUS-COVERAGE.json",unresolved:"data/CENSUS-UNRESOLVED.json",vocabulary:"data/vocabularies/species.json",specimens:"data/specimens.json"};
const sha256=value=>createHash("sha256").update(value).digest("hex");
const read=async path=>{const body=await readFile(path);return {body,json:JSON.parse(body)};};
const [coverageInput,unresolvedInput,vocabularyInput,specimensInput]=await Promise.all(Object.values(paths).map(read));
const coverage=coverageInput.json;
const unresolved=unresolvedInput.json;
const vocabulary=vocabularyInput.json;
const specimens=specimensInput.json;
const specimensById=new Map(specimens.map(record=>[record.id,record]));
const same=(row,taxon)=>row.franchise===taxon.franchise&&row.category===taxon.source_category;
const route=(base,params)=>base+"?"+new URLSearchParams(params).toString();
const creditKey=credit=>[credit.character,credit.performer,credit.source].map(value=>normalize(value)).join("|");
const displayParts=value=>String(value||"").split(/\s*\/\s*/).map(normalize).filter(Boolean);

function primaryCreditsFor(specimen, credits){
  const direct=new Set([specimen.character,...(specimen.roleAliases||[]).map(row=>row.character)].map(normalize).filter(Boolean));
  const selected=new Map();
  for(const credit of credits) if(direct.has(normalize(credit.character))) selected.set(creditKey(credit),credit);

  // A composite front such as “Bok / Gral / Prak” is a primary taxon card only
  // when every displayed component resolves to an exact credit for this performer
  // inside the same source category. A mixed-species composite therefore receives
  // no species chip rather than being partially or heuristically classified.
  const parts=displayParts(specimen.character);
  if(parts.length>1){
    const matched=parts.map(part=>credits.find(credit=>normalize(credit.character)===part));
    if(matched.every(Boolean)) for(const credit of matched) selected.set(creditKey(credit),credit);
  }
  return [...selected.values()].sort((a,b)=>a.character.localeCompare(b.character)||a.performer.localeCompare(b.performer));
}

const taxa=vocabulary.taxa.map(taxon=>{
  const credits=coverage.filter(row=>same(row,taxon));
  if(!credits.length) throw new Error(`${taxon.key} has no census rows; refusing to publish an inferred zero`);
  const unknowns=unresolved.filter(row=>same(row,taxon)).map(row=>({
    character:row.character,performance_mode:row.performance_mode||"unresolved",source:row.source,reason:row.reason
  })).sort((a,b)=>a.character.localeCompare(b.character));
  const records=new Map();
  for(const credit of credits){
    for(const id of credit.wall_ids||[]){
      const specimen=specimensById.get(id);
      const exactPerformer=[specimen?.actor,...(specimen?.aliases||[])].some(name=>normalize(name)===normalize(credit.performer));
      const exactRole=[specimen?.character,...(specimen?.roleAliases||[]).map(row=>row.character),...(specimen?.performances||[]).map(performance=>performance.character)]
        .some(role=>normalize(role)===normalize(credit.character));
      if(!specimen||!exactPerformer||!exactRole) throw new Error(`${taxon.key} ${credit.character} / ${credit.performer} leaked through non-exact wall join ${id}`);
