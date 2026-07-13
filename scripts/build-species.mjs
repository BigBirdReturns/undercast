#!/usr/bin/env node
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
      const exactRole=[specimen?.character,...(specimen?.performances||[]).map(performance=>performance.character)].some(role=>normalize(role)===normalize(credit.character));
      if(!specimen||!exactPerformer||!exactRole) throw new Error(`${taxon.key} ${credit.character} / ${credit.performer} leaked through non-exact wall join ${id}`);
      const row=records.get(id)||{id,credits:[]};
      row.credits.push({character:credit.character,performer:credit.performer,
        performance_mode:credit.performance_mode,source:credit.source});
      records.set(id,row);
    }
  }
  const filed=[...records.values()].map(row=>({...row,credits:row.credits.sort((a,b)=>a.character.localeCompare(b.character)||a.performer.localeCompare(b.performer))})).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
  const physical=credits.filter(row=>row.performance_mode.startsWith("physical-"));
  const voice=credits.filter(row=>row.performance_mode==="voice-animation");
  const unresolvedMode=credits.filter(row=>row.performance_mode==="unresolved");
  return {
    ...taxon,
    wall_route:route("index.html",{species:taxon.label}),
    coverage_route:route("coverage.html",{franchise:taxon.franchise,category:taxon.source_category,mode:"physical-any"}),
    counts:{named_credits:credits.length,distinct_performers:new Set(credits.map(row=>row.performer.normalize("NFKC").toLowerCase())).size,
      physical_credits:physical.length,voice_credits:voice.length,unresolved_mode_credits:unresolvedMode.length,
      unresolved_characters:unknowns.length,filed_role_credits:credits.filter(row=>row.role_on_wall).length,
      filed_records:filed.length,unfiled_named_credits:credits.filter(row=>!row.role_on_wall).length},
    records:filed,
    unresolved_characters:unknowns
  };
}).sort((a,b)=>a.franchise.localeCompare(b.franchise)||a.label.localeCompare(b.label));

const sourceInputs=[coverageInput,unresolvedInput,vocabularyInput,specimensInput];
const inputs=Object.fromEntries(Object.keys(paths).map((key,index)=>[key,{path:paths[key],sha256:sha256(sourceInputs[index].body)}]));
const projection={version:1,schema:"schema/species.schema.json",generated_from:inputs,
  semantics:"Exact source-category projection. Filed records are joined only by exact performer plus exact role; physical, voice, unresolved-mode and source pages without a named performer remain separate. Counts describe the captured community-wiki scope, not all licensed media.",taxa};
await writeFile("data/species.json",JSON.stringify(projection,null,1)+"\n");
console.log(`built species navigation: ${taxa.map(taxon=>`${taxon.label} ${taxon.counts.filed_records}/${taxon.counts.named_credits}`).join(", ")}`);
