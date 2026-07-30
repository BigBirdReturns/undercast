#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root=await mkdtemp(join(tmpdir(),"undercast-publication-fixture-"));
try{
  const candidates=join(root,"candidates"),packets=join(candidates,"packets");await mkdir(packets,{recursive:true});
  const batch='b'.repeat(64),results=[],decisions=[];
  for(let i=1;i<=20;i++){
    const id=`UC-${String(i).padStart(3,'0')}`,dir=join(packets,id);await mkdir(dir,{recursive:true});
    const review={version:1,campaign_id:'fixture',estate_sha256:'a'.repeat(64),batch_sha256:batch,cohort_key:'fixture',record_id:id,side:'still',disposition:'candidate-pending-independent-visual-adjudication',quarantine_reasons:[],visual_adjudication:{status:'pending',required_presentation_value:'character-depiction'},canonical_mutation:false};
    await writeFile(join(dir,'review.json'),JSON.stringify(review));await writeFile(join(dir,'scope.json'),'{}');await writeFile(join(dir,'source-receipt.json'),'{}');await writeFile(join(dir,'review.md'),'fixture\n');await writeFile(join(dir,'selected-source.jpg'),`bytes-${i}`);await writeFile(join(dir,'manifest.json'),'{}');await writeFile(join(dir,'checksums.sha256'),'');
    results.push({obligation_id:`${id}/still`,record_id:id,side:'still',disposition:'candidate-pending-independent-visual-adjudication',packet_path:`packets/${id}`});
    decisions.push({record_id:id,side:'still',disposition:'accept',identity:'expected',presentation:'character-depiction',note:'Exact fixture subject and filed presentation are independently confirmed.',evidence:[`https://example.test/${id}`],decided_at:'2026-07-29T00:00:00.000Z'});
  }
  await writeFile(join(candidates,'batch-result.json'),JSON.stringify({version:1,campaign_id:'fixture',estate_sha256:'a'.repeat(64),batch_sha256:batch,cohort_key:'fixture',selected_count:20,results,canonical_mutation:false}));
  await writeFile(join(root,'decisions.json'),JSON.stringify({version:1,batch_sha256:batch,adjudicator:{id:'fixture-second-desk',kind:'machine',independent_from_discovery:true},decisions}));
  await writeFile(join(root,'control.json'),JSON.stringify({batch:{minimum:20,maximum:50}}));
  const adjudicate=fileURLToPath(new URL('./card-backfill-cohort-adjudicate.mjs',import.meta.url)),materialize=fileURLToPath(new URL('./card-backfill-cohort-materialize.mjs',import.meta.url));
  const adjudicated=join(root,'adjudicated');execFileSync(process.execPath,[adjudicate,'--candidates',candidates,'--decisions',join(root,'decisions.json'),'--control',join(root,'control.json'),'--out',adjudicated],{stdio:'inherit'});
  const receipt=JSON.parse(await readFile(join(adjudicated,'batch-publication-receipt.json'),'utf8'));assert.equal(receipt.counts.accepted,20);assert.equal((await readdir(join(adjudicated,'permanent'))).length,20);
  const destination=join(root,'review');execFileSync(process.execPath,[materialize,'--input',adjudicated,'--destination',destination],{stdio:'inherit'});
  const dirs=(await readdir(destination,{withFileTypes:true})).filter(row=>row.isDirectory()&&row.name!=='batches');assert.equal(dirs.length,20);assert.equal((await readdir(join(destination,'batches'))).length,1);
  console.log('card-backfill publication fixtures: PASS');
}finally{await rm(root,{recursive:true,force:true});}
