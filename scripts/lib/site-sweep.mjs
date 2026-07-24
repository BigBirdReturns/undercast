import { readFileSync, existsSync } from "node:fs";
import { normalizeCensusKey as normalize } from "../census-key.mjs";

export const PUBLIC_SURFACES=Object.freeze([
  {path:"index.html",kind:"wall"},{path:"recognition.html",kind:"recognition"},
  {path:"coverage.html",kind:"coverage"},{path:"constellation.html",kind:"constellation"},
  {path:"404.html",kind:"error"},
]);

export function wallSpeciesById(projection){
  const map=new Map();
  for(const taxon of projection.taxa||[])for(const record of taxon.wall_records||[]){
    const labels=map.get(record.id)||[];labels.push(taxon.label);map.set(record.id,[...new Set(labels)].sort());
  }
  return map;
}

export function validateSpeciesProjection({projection,index,specimens}){
  const errors=[];const byId=new Map(specimens.map(row=>[row.id,row]));const expected=wallSpeciesById(projection);
  for(const entry of index){const want=expected.get(entry.id)||[],got=[...(entry.sp||[])].sort();if(JSON.stringify(got)!==JSON.stringify(want))errors.push(`${entry.id} wall species ${got.join(",")||"none"}; expected ${want.join(",")||"none"}`);}
  for(const taxon of projection.taxa||[]){
    const filed=new Set((taxon.records||[]).map(row=>row.id));const primary=new Set((taxon.wall_records||[]).map(row=>row.id));
    for(const id of primary)if(!filed.has(id))errors.push(`${taxon.label} primary wall record ${id} is absent from filed records`);
    const primaryKeys=new Set((taxon.credits||[]).filter(row=>row.status==="primary-card").flatMap(row=>(row.wall_ids||[]).map(id=>`${id}|${normalize(row.character)}|${normalize(row.performer)}`)));
    for(const record of taxon.wall_records||[])for(const credit of record.credits||[]){
      const key=`${record.id}|${normalize(credit.character)}|${normalize(credit.performer)}`;
      if(!primaryKeys.has(key))errors.push(`${taxon.label} ${record.id} wall credit is not primary-card: ${credit.character} / ${credit.performer}`);
      if(!byId.has(record.id))errors.push(`${taxon.label} points at missing ${record.id}`);
    }
    for(const row of taxon.credits||[])if(!["primary-card","additional-performance","unfiled"].includes(row.status))errors.push(`${taxon.label} has unknown credit status ${row.status}`);
  }
  return errors;
}

export function validateSurfaceSources(root=process.cwd()){
  const errors=[];
  for(const surface of PUBLIC_SURFACES){
    const path=`${root}/${surface.path}`;if(!existsSync(path)){errors.push(`${surface.path} is missing`);continue;}
    const text=readFileSync(path,"utf8");
    if(!/site-tokens\.css/.test(text))errors.push(`${surface.path} bypasses shared tokens`);
    if(!/site-shell\.css/.test(text))errors.push(`${surface.path} bypasses shared shell`);
    if(!/class=["']archive-map["']/.test(text))errors.push(`${surface.path} lacks the shared archive map`);
  }
  for(const asset of ["assets/placeholder-light-clean.png","assets/placeholder-dark-clean.png","assets/absence-offline.svg"])if(!existsSync(`${root}/${asset}`))errors.push(`${asset} is missing`);
  for(const path of ["index.html","recognition.html","scripts/build-record-pages.mjs"]){
    const text=readFileSync(`${root}/${path}`,"utf8");
    for(const signature of ["reliefBase(","voiceGlyph(","NO CAST"])if(text.includes(signature))errors.push(`${path} retains retired fallback ${signature}`);
    if(!text.includes("assets/placeholder-light-clean.png")||!text.includes("assets/placeholder-dark-clean.png"))errors.push(`${path} does not consume both approved light/dark absence plates`);
  }
  for(const path of ["recognition.html","scripts/build-record-pages.mjs"]){
    const text=readFileSync(`${root}/${path}`,"utf8");
    if(/taxon\.records/.test(text))errors.push(`${path} still derives public species from person-level records`);
    if(!/taxon\.wall_records/.test(text))errors.push(`${path} does not consume exact primary-role wall_records`);
    if(!/class=["']archive-map["']/.test(text))errors.push(`${path} lacks the shared archive-map contract`);
  }
  return errors;
}
