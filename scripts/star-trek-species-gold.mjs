#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const args=process.argv.slice(2);
const command=args.shift()||"status";
const option=(name,fallback=null)=>{const index=args.indexOf(`--${name}`);if(index<0)return fallback;const value=args[index+1];if(!value||value.startsWith("--"))throw new Error(`--${name} requires a value`);return value;};
const flag=name=>args.includes(`--${name}`);
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+"\n");};
const norm=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").replace(/[^a-zA-Z0-9']+/g," ").trim().toLowerCase();

const [plan,species,vocabulary,specimens,media]=await Promise.all([
  readJson("data/STAR-TREK-GOLD.json"),
  readJson("data/species.json"),
  readJson("data/vocabularies/species.json"),
  readJson("data/specimens.json"),
  readJson("data/MEDIA-AUDIT.json")
]);

const specimenById=new Map(specimens.map(row=>[row.id,row]));
const auditByKey=new Map((media.items||[]).map(row=>[`${row.wall_id}|${row.side}`,row]));
const taxonByCategory=new Map((species.taxa||[]).filter(row=>row.franchise==="Star Trek").map(row=>[norm(row.source_category),row]));
const planById=new Map((plan.sequence||[]).map(row=>[row.id,row]));
const allowed=new Set(plan.allowed_states||[]);

function speciesStatus(entry){
  const taxon=taxonByCategory.get(norm(entry.source_category));
  if(!taxon)return {entry,error:`species projection lacks source category ${entry.source_category}`};
  const ids=[...new Set((taxon.wall_records||[]).map(row=>row.id))];
  const records=ids.map(id=>specimenById.get(id)).filter(Boolean);
  const missingRecords=ids.filter(id=>!specimenById.has(id));
  const targets=[];
  let verifiedFacets=0,nonVerifiedFacets=0,missingAuditRows=0;
  for(const record of records){
    const stillAudit=auditByKey.get(`${record.id}|still`)||null;
    const portraitAudit=auditByKey.get(`${record.id}|portrait`)||null;
    for(const row of [stillAudit,portraitAudit]){
      if(!row)missingAuditRows++;
      else if(row.status==="verified")verifiedFacets++;
      else nonVerifiedFacets++;
    }
    const missingStill=!record.still||stillAudit?.status!=="verified";
    const missingPortrait=!record.portrait||portraitAudit?.status!=="verified";
    if(missingStill||missingPortrait)targets.push({
      id:record.id,actor:record.actor,character:record.character,
      missing_still:missingStill,missing_portrait:missingPortrait,
      still_status:stillAudit?.status||"missing-audit-row",
      portrait_status:portraitAudit?.status||"missing-audit-row"
    });
  }
  const named=Number(taxon.counts?.named_credits||0);
  const unfiled=Number(taxon.counts?.unfiled_named_credits||0);
  const exclusions=Number(taxon.counts?.excluded_named_credits||0);
  const plannedExclusions=Number(entry.reviewed_category_exclusions||0);
  const eligibleUnfiled=unfiled;
  const missingStill=targets.filter(row=>row.missing_still).length;
  const missingPortrait=targets.filter(row=>row.missing_portrait).length;
  const goldReady=!missingRecords.length&&eligibleUnfiled===0&&missingStill===0&&missingPortrait===0&&missingAuditRows===0&&nonVerifiedFacets===0;
  return {
    id:entry.id,label:entry.label,source_category:entry.source_category,state:entry.state,
    named_credits:named,filed_role_credits:Number(taxon.counts?.filed_role_credits||0),
    unfiled_named_credits:unfiled,reviewed_category_exclusions:exclusions,planned_category_exclusions:plannedExclusions,eligible_unfiled_named_credits:eligibleUnfiled,
    primary_card_records:Number(taxon.counts?.primary_card_records||0),wall_records:ids.length,
    missing_still:missingStill,missing_portrait:missingPortrait,
    audited_facets:verifiedFacets+nonVerifiedFacets,verified_facets:verifiedFacets,
    non_verified_facets:nonVerifiedFacets,missing_audit_rows:missingAuditRows,
    missing_record_ids:missingRecords,targets,gold_ready:goldReady,
    receipt:entry.receipt||null
  };
}

function validatePlan(statuses){
  const errors=[];
  if(plan.scope!=="star-trek")errors.push(`plan scope is ${plan.scope||"missing"}, expected star-trek`);
  const vocab=(vocabulary.taxa||[]).filter(row=>row.franchise==="Star Trek");
  const plannedCategories=new Set((plan.sequence||[]).map(row=>norm(row.source_category)));
  for(const row of vocab)if(!plannedCategories.has(norm(row.source_category)))errors.push(`plan omits maintained species ${row.label}`);
  for(const entry of plan.sequence||[]){
    if(!allowed.has(entry.state))errors.push(`${entry.id} has unknown state ${entry.state}`);
    if(!entry.id||!entry.label||!entry.source_category)errors.push(`species entry lacks id, label or source category: ${JSON.stringify(entry)}`);
  }
  if(planById.size!==(plan.sequence||[]).length)errors.push("species ids are not unique");
  if(plannedCategories.size!==(plan.sequence||[]).length)errors.push("source categories are not unique");
  const active=statuses.filter(row=>row.state==="active"||row.state==="candidate-gold");
  const allGold=statuses.every(row=>row.state==="gold");
  if(!allGold&&active.length!==1)errors.push(`expected exactly one active species, found ${active.length}`);
  if(allGold&&active.length)errors.push("all species are gold but an active species remains");
  const activeIndex=statuses.findIndex(row=>row.state==="active"||row.state==="candidate-gold");
  if(activeIndex>=0){
    for(let i=0;i<activeIndex;i++)if(statuses[i].state!=="gold")errors.push(`${statuses[i].label} precedes active ${statuses[activeIndex].label} but is not gold`);
    for(let i=activeIndex+1;i<statuses.length;i++)if(statuses[i].state==="gold")errors.push(`${statuses[i].label} is marked gold after active ${statuses[activeIndex].label}`);
  }
  for(const row of statuses){
    if(row.error)errors.push(`${row.entry?.id||"unknown"}: ${row.error}`);
    if(row.reviewed_category_exclusions!==row.planned_category_exclusions)errors.push(`${row.label} exclusion count ${row.reviewed_category_exclusions} does not match planned ${row.planned_category_exclusions}`);
    if(row.state==="gold"){
      if(!row.gold_ready)errors.push(`${row.label} is marked gold but current corpus/media state is not gold-ready`);
      if(!row.receipt?.merged_main_sha||!row.receipt?.live_verified_at)errors.push(`${row.label} is marked gold without merged-main and live-deployment receipt`);
    }
    if(row.state==="candidate-gold"&&!row.gold_ready)errors.push(`${row.label} is candidate-gold but current corpus/media state is not gold-ready`);
  }
  return errors;
}

const statuses=(plan.sequence||[]).map(speciesStatus);
const errors=validatePlan(statuses);
const report={
  version:1,scope:"star-trek",generated_at:new Date().toISOString(),
  active_species:(statuses.find(row=>row.state==="active"||row.state==="candidate-gold")||null)?.id||null,
  complete:statuses.every(row=>row.state==="gold"),errors,statuses:statuses.map(({targets,...row})=>row)
};

if(command==="targets"){
  const id=option("species",report.active_species);
  const row=statuses.find(item=>item.id===id);
  if(!row)throw new Error(`unknown species ${id}`);
  const output={version:1,generated_at:report.generated_at,species:id,label:row.label,state:row.state,gold_ready:row.gold_ready,targets:row.targets};
  const out=option("out");if(out)await writeJson(out,output);
  console.log(JSON.stringify(output,null,2));
  if(!row.targets.length)process.exitCode=3;
}else if(command==="validate"){
  if(flag("--json")||flag("json"))console.log(JSON.stringify(report,null,2));
  else{
    console.log(`Star Trek species gold: active=${report.active_species||"none"}; complete=${report.complete}; errors=${errors.length}`);
    for(const row of report.statuses)console.log(`  ${row.label}: state=${row.state}; named=${row.named_credits}; eligible-unfiled=${row.eligible_unfiled_named_credits}; still-open=${row.missing_still}; portrait-open=${row.missing_portrait}; verified=${row.verified_facets}/${row.wall_records*2}; gold-ready=${row.gold_ready}`);
    for(const error of errors)console.error(`  ERROR ${error}`);
  }
  if(errors.length)process.exitCode=2;
}else if(command==="status"){
  console.log(JSON.stringify(report,null,2));
}else throw new Error("unknown command; use status, validate, or targets");
