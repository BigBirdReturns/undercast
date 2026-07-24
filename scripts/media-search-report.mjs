#!/usr/bin/env node
import { appendFileSync,copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync } from "node:fs";
import path from "node:path";
import { fileHash } from "./lib/media-search.mjs";
const args=process.argv.slice(2),option=(name,fallback=null)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const baseline=path.resolve(option("--baseline",".")),candidate=path.resolve(option("--candidate")),plan=JSON.parse(readFileSync(option("--plan"),"utf8"));
const out=path.resolve(option("--out","media-search-candidates")),journal=path.resolve(option("--journal","data/journal/media-search.jsonl")),latest=path.resolve(option("--latest","data/MEDIA-SEARCH-LATEST.json")),runId=option("--run-id","local"),now=option("--now",new Date().toISOString());
const load=(root,file)=>JSON.parse(readFileSync(path.join(root,file),"utf8"));const before=load(baseline,"data/specimens.json"),after=load(candidate,"data/specimens.json"),beforeById=new Map(before.map(row=>[row.id,row])),afterById=new Map(after.map(row=>[row.id,row]));
let manifest={assets:{}};try{manifest=load(baseline,"data/media-manifest.json");}catch{}
mkdirSync(out,{recursive:true});mkdirSync(path.dirname(journal),{recursive:true});const results=[];
for(const item of plan.candidates||[]){const old=beforeById.get(item.wall_id)?.[item.side]||null,proposed=afterById.get(item.wall_id)?.[item.side]||null;let status="not-found",candidateSha=null;
  if(proposed?.src){const sourcePath=path.join(candidate,proposed.src),baselineSha=old?.src?(manifest.assets?.[old.src]?.sha256||fileHash(path.join(baseline,old.src))):null;candidateSha=fileHash(sourcePath);if(candidateSha&&(candidateSha!==baselineSha||proposed.origin!==old?.origin)){status="candidate";const dest=path.join(out,proposed.src);mkdirSync(path.dirname(dest),{recursive:true});copyFileSync(sourcePath,dest);}else status="unchanged";}
  const row={wall_id:item.wall_id,side:item.side,expected_subject:item.expected_subject,reason:item.reason,status,baseline:old,candidate:proposed,candidate_sha256:candidateSha};results.push(row);
  appendFileSync(journal,JSON.stringify({version:1,op:"media-search.attempted",at:now,run_id:runId,wall_id:item.wall_id,side:item.side,reason:item.reason,result:status,candidate_sha256:candidateSha})+"\n");
}
const counts=Object.fromEntries(["candidate","unchanged","not-found"].map(key=>[key,results.filter(row=>row.status===key).length]));const report={version:1,generated_at:now,run_id:runId,artifact:`media-search-candidates-${runId}`,canonical_write:false,counts,results};writeFileSync(path.join(out,"report.json"),JSON.stringify(report,null,2)+"\n");writeFileSync(latest,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
