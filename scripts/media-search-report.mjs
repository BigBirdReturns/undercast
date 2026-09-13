#!/usr/bin/env node
import { appendFileSync,copyFileSync,mkdirSync,readFileSync,writeFileSync } from "node:fs";
import path from "node:path";
import { classifyMediaCandidate,fileHash } from "./lib/media-search.mjs";
import { indexMediaRejections } from "./lib/media-rejections.mjs";

const args=process.argv.slice(2),option=(name,fallback=null)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];};
const baseline=path.resolve(option("--baseline",".")),candidate=path.resolve(option("--candidate")),plan=JSON.parse(readFileSync(option("--plan"),"utf8"));
const out=path.resolve(option("--out","media-search-candidates")),journal=path.resolve(option("--journal","data/journal/media-search.jsonl")),latest=path.resolve(option("--latest","data/MEDIA-SEARCH-LATEST.json")),runId=option("--run-id","local"),now=option("--now",new Date().toISOString());
const load=(root,file)=>JSON.parse(readFileSync(path.join(root,file),"utf8"));
const before=load(baseline,"data/specimens.json"),after=load(candidate,"data/specimens.json"),beforeById=new Map(before.map(row=>[row.id,row])),afterById=new Map(after.map(row=>[row.id,row]));
const rejectionIndex=indexMediaRejections(load(baseline,"data/MEDIA-REJECTIONS.json"));
let manifest={assets:{}};try{manifest=load(baseline,"data/media-manifest.json");}catch{}
mkdirSync(out,{recursive:true});mkdirSync(path.dirname(journal),{recursive:true});const results=[];
for(const item of plan.candidates||[]){
  const old=beforeById.get(item.wall_id)?.[item.side]||null,proposed=afterById.get(item.wall_id)?.[item.side]||null;
  const sourcePath=proposed?.src?path.join(candidate,proposed.src):null;
  const baselineSha=old?.src?(manifest.assets?.[old.src]?.sha256||fileHash(path.join(baseline,old.src))):null;
  const candidateSha=sourcePath?fileHash(sourcePath):null;
  const classified=classifyMediaCandidate({item,old,proposed,candidateSha,baselineSha,rejectionIndex});
  if(classified.status==="candidate"){
    const dest=path.join(out,proposed.src);mkdirSync(path.dirname(dest),{recursive:true});copyFileSync(sourcePath,dest);
  }
  const row={wall_id:item.wall_id,side:item.side,expected_subject:item.expected_subject,reason:item.reason,status:classified.status,baseline:old,candidate:proposed,candidate_sha256:candidateSha,rejection:classified.rejection};results.push(row);
  appendFileSync(journal,JSON.stringify({version:1,op:"media-search.attempted",at:now,run_id:runId,wall_id:item.wall_id,side:item.side,reason:item.reason,result:classified.status,candidate_sha256:candidateSha,rejection_rule_id:classified.rejection?.rule_id||null})+"\n");
}
const statuses=["candidate","rejected","unchanged","not-found"];
const counts=Object.fromEntries(statuses.map(key=>[key,results.filter(row=>row.status===key).length]));
const report={version:1,generated_at:now,run_id:runId,artifact:`media-search-candidates-${runId}`,canonical_write:false,rejection_contract:"data/MEDIA-REJECTIONS.json",counts,results};
writeFileSync(path.join(out,"report.json"),JSON.stringify(report,null,2)+"\n");writeFileSync(latest,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
