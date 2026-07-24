import { existsSync, readFileSync } from "node:fs";

export const ESTATE_STATES = Object.freeze(["inventory","source-model-review","adapter-build","adapter-review","certified-paused","active-corpus","gold-reference","retired"]);
export const IN_FLIGHT = Object.freeze(new Set(["leased","drafted","merged"]));

export function validateCollectionMode(mode){
  const errors=[];
  if(mode?.version!==1)errors.push("collection mode must be version 1");
  if(mode?.mode!=="collection-only")errors.push("collection mode is not collection-only");
  if(mode?.product_contract!=="frozen-v1")errors.push("product contract is not frozen-v1");
  if(mode?.authority!=="owner")errors.push("collection mode lacks owner authority");
  if(!Array.isArray(mode?.protected_paths)||mode.protected_paths.length<8)errors.push("collection mode protected path set is incomplete");
  if(mode?.rolling_media_search?.canonical_write!==false)errors.push("rolling media search may not write canonical media directly");
  if(mode?.growth?.one_cycle_at_a_time!==true||mode?.growth?.require_zero_media_debt_before_next_cycle!==true)errors.push("bounded zero-debt growth contract is missing");
  return errors;
}

export function validateEstateRegistry(registry,scopes){
  const errors=[];
  if(registry?.version!==1)errors.push("estate registry must be version 1");
  const ids=new Set(),priorities=new Set(),scopeMap=new Map();
  for(const estate of registry?.estates||[]){
    if(!/^[a-z0-9-]+$/.test(estate.id||""))errors.push(`estate has unsafe id ${estate.id}`);
    if(ids.has(estate.id))errors.push(`duplicate estate ${estate.id}`);ids.add(estate.id);
    if(!ESTATE_STATES.includes(estate.state))errors.push(`${estate.id} has unknown state ${estate.state}`);
    if(!Number.isInteger(estate.priority)||priorities.has(estate.priority))errors.push(`${estate.id} has invalid or duplicate priority`);priorities.add(estate.priority);
    if(!Array.isArray(estate.source_hosts)||!estate.source_hosts.length)errors.push(`${estate.id} lacks source hosts`);
    if(estate.autopilot_scope){if(scopeMap.has(estate.autopilot_scope))errors.push(`scope ${estate.autopilot_scope} belongs to multiple estates`);scopeMap.set(estate.autopilot_scope,estate);}
  }
  for(const scope of scopes?.scopes||[]){
    const scopeId=scope.id||scope.scope_id;const estate=scopeMap.get(scopeId);
    if(!estate)errors.push(`autopilot scope ${scopeId} has no estate registry row`);
    else if(scope.status==="active"&&!['active-corpus','gold-reference'].includes(estate.state))errors.push(`${scopeId} is active while estate is ${estate.state}`);
    else if(scope.status!=="active"&&estate.state==="active-corpus")errors.push(`${estate.id} is active-corpus while scope is ${scope.status}`);
  }
  return errors;
}

export function jobCounts(jobs,scope){
  const counts={total:0,queued:0,blocked:0,resolved:0,attention:0,leased:0,drafted:0,merged:0};
  for(const job of jobs||[]){if(scope&&job.scope!==scope)continue;counts.total++;counts[job.status]=(counts[job.status]||0)+1;}
  counts.in_flight=counts.leased+counts.drafted+counts.merged;
  return counts;
}

export function auditCounts(items,scope){
  const counts={total:0,verified:0,absent:0,review:0,attention:0,debt:0};
  for(const item of items||[]){if(scope&&item.scope!==scope)continue;counts.total++;counts[item.status]=(counts[item.status]||0)+1;}
  counts.debt=counts.review+counts.attention;
  return counts;
}

export function nextOperation({registry,jobs,audit,claimAllowed}){
  const active=(registry.estates||[]).filter(row=>["active-corpus","gold-reference"].includes(row.state)).sort((a,b)=>b.priority-a.priority);
  for(const estate of active){
    const counts=jobCounts(jobs,estate.autopilot_scope),media=auditCounts(audit,estate.autopilot_scope);
    if(counts.in_flight)return {kind:"close-cycle",estate:estate.id,reason:`${counts.in_flight} task(s) in flight`,command:`npm run waterline -- status --scope ${estate.autopilot_scope}`};
    if(media.debt)return {kind:"close-media-debt",estate:estate.id,reason:`${media.debt} media facet(s) open`,command:`npm run media:audit -- status --scope ${estate.autopilot_scope}`};
    if(counts.queued){
      if(claimAllowed===false)return {kind:"inspect-waterline",estate:estate.id,reason:"queue exists but the rolling waterline refuses a claim",command:`npm run waterline -- status --scope ${estate.autopilot_scope}`};
      return {kind:"lease-one-cycle",estate:estate.id,reason:`${counts.queued} queued task(s), zero in flight and zero media debt`,command:`npm run autopilot -- next --agent luna --scope ${estate.autopilot_scope} --capability-profile text-vision --limit 1 --out .luna/batch.json --prompt .luna/PROMPT.md`};
    }
  }
  const frontier=(registry.estates||[]).filter(row=>!['active-corpus','gold-reference','retired'].includes(row.state)).sort((a,b)=>b.priority-a.priority)[0];
  return frontier?{kind:"advance-estate-gate",estate:frontier.id,reason:frontier.next_gate,command:"npm run corpus -- status"}:{kind:"collection-complete",estate:null,reason:"No active queue or registered estate frontier remains",command:"npm run corpus -- status"};
}

export function evaluateProtectedChanges({files,labels,body,decisionDiff,mode}){
  const protectedSet=new Set(mode.protected_paths||[]);
  const protectedFiles=(files||[]).filter(path=>protectedSet.has(path));
  if(!protectedFiles.length)return {ok:true,protected_files:[],basis:"corpus-or-operations-only"};
  const set=new Set(labels||[]),owner=mode.override_labels?.owner_product_change,hotfixes=mode.override_labels?.narrow_hotfixes||[];
  if(owner&&set.has(owner)){
    if(!/^\+## DEC-/m.test(decisionDiff||""))return {ok:false,protected_files:protectedFiles,error:"owner product change lacks a new DEC entry"};
    return {ok:true,protected_files:protectedFiles,basis:owner};
  }
  const hotfix=hotfixes.find(label=>set.has(label));
  if(hotfix){
    if(!/Incident:/i.test(body||"")||!/Return-to-collection-mode:/i.test(body||""))return {ok:false,protected_files:protectedFiles,error:`${hotfix} requires Incident: and Return-to-collection-mode: receipts in the PR body`};
    return {ok:true,protected_files:protectedFiles,basis:hotfix};
  }
  return {ok:false,protected_files:protectedFiles,error:`collection-only mode protects ${protectedFiles.join(", ")}; add an authorized narrow-hotfix label or an owner-approved product decision`};
}

export function readJson(path){return JSON.parse(readFileSync(path,"utf8"));}
export function requireFile(path,errors){if(!existsSync(path))errors.push(`${path} is missing`);}
