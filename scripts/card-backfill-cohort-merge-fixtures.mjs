#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root=await mkdtemp(join(tmpdir(),"undercast-merge-fixture-"));
try{
  const shards=join(root,"shards"),out=join(root,"out");
  const obligations=[{obligation_id:"UC-001/still"},{obligation_id:"UC-002/still"}];
  await writeFile(join(root,"batch.json"),JSON.stringify({campaign_id:"fixture",estate_sha256:"a".repeat(64),batch_sha256:"b".repeat(64),cohort_key:"fixture",obligations}));
  for(const n of [1,2]){
    const dir=join(shards,`artifact-${n}`,"candidates","images");await mkdir(dir,{recursive:true});
    await writeFile(join(dir,`uc-00${n}-still.jpg`),`candidate-${n}`);
    await writeFile(join(shards,`artifact-${n}`,"candidates","report.json"),JSON.stringify({run_id:`shard-${n}`,results:[{wall_id:`UC-00${n}`,side:"still",status:"candidate",candidate:{src:`images/uc-00${n}-still.jpg`,origin:`https://example.test/${n}`}}]}));
  }
  const script=fileURLToPath(new URL("./card-backfill-cohort-merge.mjs",import.meta.url));
  execFileSync(process.execPath,[script,"--batch",join(root,"batch.json"),"--shards-root",shards,"--out",out,"--run-id","fixture"],{stdio:"inherit"});
  const report=JSON.parse(await readFile(join(out,"report.json"),"utf8"));
  assert.deepEqual(report.results.map(row=>`${row.wall_id}/${row.side}`),["UC-001/still","UC-002/still"]);
  assert.equal(report.counts.candidate,2);
  assert.equal((await readFile(join(out,"images","uc-001-still.jpg"),"utf8")),"candidate-1");
  console.log("card-backfill merge fixtures: PASS");
}finally{await rm(root,{recursive:true,force:true});}
