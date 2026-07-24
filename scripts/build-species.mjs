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
