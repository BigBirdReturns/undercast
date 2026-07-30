import { createHash } from "node:crypto";
import { existsSync,readFileSync } from "node:fs";
export const sha256=value=>createHash("sha256").update(value).digest("hex");
const DAY=86400000;
export function attemptsByFacet(lines){const map=new Map();for(const line of lines||[]){if(!String(line).trim())continue;const row=JSON.parse(line);if(row.op==="media-search.attempted")map.set(`${row.wall_id}/${row.side}`,row);}return map;}
export function buildMediaPlan({specimens,sources,auditItems,attempts,now,policy,limit}){
  const sourceById=new Map((sources||[]).map(row=>[row.id,row])),auditByKey=new Map((auditItems||[]).map(row=>[`${row.wall_id}/${row.side}`,row]));
  const at=Date.parse(now),rows=[];
  for(const record of specimens||[])for(const side of ["still","portrait"]){
    const key=`${record.id}/${side}`,image=record[side]||null,audit=auditByKey.get(key),previous=attempts.get(key),last=previous?Date.parse(previous.at):0;
    let reason,days,priority;
    if(!image){reason="missing-evidence";days=policy.missing_retry_days;priority=10000;}
    else if(["review","attention"].includes(audit?.status)){reason="open-audit-debt";days=policy.attention_retry_days;priority=9000;}
    else if(side==="portrait"&&(image.kind!=="free"||/fandom\.com/i.test(image.origin||""))){reason="portrait-source-upgrade";days=policy.nonfree_portrait_retry_days;priority=5000;}
    else if(side==="portrait"){reason="verified-portrait-refresh";days=policy.verified_portrait_retry_days;priority=1000;}
    else{reason="verified-still-refresh";days=policy.verified_still_retry_days;priority=100;}
    if(last&&at-last<days*DAY)continue;
    rows.push({wall_id:record.id,side,expected_subject:side==="still"?record.character:record.actor,reason,retry_days:days,replace_existing:Boolean(image),current:image,source_receipt:sourceById.get(record.id)?.[side]||null,last_attempt_at:previous?.at||null,priority});
  }
  return rows.sort((a,b)=>b.priority-a.priority||String(a.last_attempt_at||"").localeCompare(String(b.last_attempt_at||""))||a.wall_id.localeCompare(b.wall_id,undefined,{numeric:true})||a.side.localeCompare(b.side)).slice(0,limit);
}
export function parseFacetSelector(value){
  const facets=new Set();
  for(const token of String(value||"").split(",").map(row=>row.trim()).filter(Boolean)){
    const match=token.match(/^([^/]+)\/(still|portrait)$/i);
    if(!match)throw new Error(`invalid media facet selector ${JSON.stringify(token)}; expected RECORD/still or RECORD/portrait`);
    facets.add(`${match[1].toUpperCase()}/${match[2].toLowerCase()}`);
  }
  return facets;
}
export function facetSelectorIds(facets){return new Set([...facets].map(row=>row.split("/")[0]));}
export function facetRequested(facets,recordId,side){return !facets?.size||facets.has(`${String(recordId).toUpperCase()}/${side}`);}
export function fileHash(path){return existsSync(path)?sha256(readFileSync(path)):null;}

export const COHORT_SKIP_SENTINEL="urn:undercast:cohort-skip";
export function maskUnselectedFacets({specimens,sources,candidates}){
  const selected=new Map();
  for(const row of candidates||[]){const sides=selected.get(row.wall_id)||new Set();sides.add(row.side);selected.set(row.wall_id,sides);}
  const sourceById=new Map((sources||[]).map(row=>[row.id,row])),restore=[];
  for(const record of specimens||[]){
    const sides=selected.get(record.id);if(!sides)continue;
    const source=sourceById.get(record.id)||null;
    for(const side of ["still","portrait"]){
      if(sides.has(side)||record[side])continue;
      restore.push({wall_id:record.id,side,specimen_value:null,source_value:source?.[side]??null});
      const sentinel={src:COHORT_SKIP_SENTINEL,kind:"cohort-sentinel",origin:COHORT_SKIP_SENTINEL};
      record[side]=sentinel;if(source)source[side]=sentinel;
    }
  }
  return restore;
}
export function restoreMaskedFacets({specimens,sources,restore}){
  const specimenById=new Map((specimens||[]).map(row=>[row.id,row])),sourceById=new Map((sources||[]).map(row=>[row.id,row]));
  for(const row of restore||[]){
    const record=specimenById.get(row.wall_id),source=sourceById.get(row.wall_id);
    if(record?.[row.side]?.src===COHORT_SKIP_SENTINEL)record[row.side]=row.specimen_value??null;
    if(source?.[row.side]?.src===COHORT_SKIP_SENTINEL)source[row.side]=row.source_value??null;
  }
}
