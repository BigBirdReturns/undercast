#!/usr/bin/env node
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";

const args=process.argv.slice(2);
function option(name,fallback=null){const i=args.indexOf(name);if(i<0)return fallback;const value=args[i+1];if(!value||value.startsWith("--"))throw new Error(`${name} requires a value`);return value;}
async function readJson(path){return JSON.parse(await readFile(path,"utf8"));}
async function findReports(root,current=root,out=[]){for(const entry of await readdir(current,{withFileTypes:true})){const path=join(current,entry.name);if(entry.isDirectory())await findReports(root,path,out);else if(entry.isFile()&&entry.name==="report.json")out.push(path);}return out;}
async function hashFile(path){return createHash("sha256").update(await readFile(path)).digest("hex");}
async function copyCandidate(source,destination){await mkdir(dirname(destination),{recursive:true});try{const [a,b]=await Promise.all([hashFile(source),hashFile(destination)]);if(a!==b)throw new Error(`candidate path collision at ${destination}`);return;}catch(error){if(error.code!=="ENOENT")throw error;}await copyFile(source,destination);}

async function main(){
  const batch=await readJson(resolve(option("--batch"))),shardsRoot=resolve(option("--shards-root")),out=resolve(option("--out")),runId=option("--run-id","merged");
  const reportPaths=(await findReports(shardsRoot)).sort();
  if(!reportPaths.length)throw new Error(`no shard report.json files under ${shardsRoot}`);
  const byFacet=new Map(),shards=[];
  for(const reportPath of reportPaths){
    const report=await readJson(reportPath),candidateRoot=dirname(reportPath),reportSha=await hashFile(reportPath);
    shards.push({path:relative(shardsRoot,reportPath).replaceAll("\\","/"),sha256:reportSha,run_id:report.run_id||null,result_count:(report.results||[]).length});
    for(const row of report.results||[]){
      const key=`${row.wall_id}/${row.side}`;
      if(byFacet.has(key))throw new Error(`duplicate shard result ${key}`);
      byFacet.set(key,row);
      if(row.status==="candidate"&&row.candidate?.src)await copyCandidate(join(candidateRoot,row.candidate.src),join(out,row.candidate.src));
    }
  }
  const results=[];
  for(const obligation of batch.obligations||[]){const row=byFacet.get(obligation.obligation_id);if(!row)throw new Error(`missing shard result ${obligation.obligation_id}`);results.push(row);byFacet.delete(obligation.obligation_id);}
  if(byFacet.size)throw new Error(`unexpected shard result(s): ${[...byFacet.keys()].join(", ")}`);
  const counts=Object.fromEntries(["candidate","unchanged","not-found"].map(key=>[key,results.filter(row=>row.status===key).length]));
  await mkdir(out,{recursive:true});
  const merged={version:1,generated_at:new Date().toISOString(),run_id:runId,artifact:`card-backfill-cohort-candidates-${runId}`,campaign_id:batch.campaign_id,estate_sha256:batch.estate_sha256,batch_sha256:batch.batch_sha256,cohort_key:batch.cohort_key,canonical_write:false,counts,shards,results};
  await writeFile(join(out,"report.json"),JSON.stringify(merged,null,2)+"\n");
  console.log(`PASS — merged ${reportPaths.length} shard report(s) into ${results.length} ordered result(s): ${JSON.stringify(counts)}`);
}
main().catch(error=>{console.error(`card-backfill merge: ${error.message}`);process.exit(1);});
