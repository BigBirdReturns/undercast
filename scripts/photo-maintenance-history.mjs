#!/usr/bin/env node
// Replay immutable collection receipts at their recorded pre-maintenance tree,
// while checking the exact reviewed media successor in the current tree.
// Current queue/corpus/audit validation remains in the ordinary release gate.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
const BASELINE_COMMIT = '962ab3cd71483310e7d93da5e95f0c83fafeb78f';
const BASE=BASELINE_COMMIT;
const LEDGER='data/review/catalog-photo-quality/changes.json';
const CONFIG={
 '005':{id:'UC-1350',checker:'scripts/doctor-who-cycle-005.mjs',receipt:'data/review/adapter-sdk/doctor-who-cycle-005-kaarsh.json'},
 '007':{id:'UC-1352',checker:'scripts/doctor-who-cycle-007.mjs',receipt:'data/review/adapter-sdk/doctor-who-cycle-007-kragar.json'},
};
const c=CONFIG[process.argv[2]];assert(c,'usage: photo-maintenance-history.mjs 005|007');
const root=process.cwd(),hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:128*1024*1024});
const historical=p=>git('show',`${BASE}:${p}`);
const oldJson=p=>JSON.parse(historical(p));const read=p=>JSON.parse(fs.readFileSync(p));
const nonMedia=r=>Object.fromEntries(Object.entries(r).filter(([key])=>!['still','portrait','fetched_at'].includes(key)));
const oldRecord=oldJson('data/specimens.json').find(r=>r.id===c.id);
const record=read('data/specimens.json').find(r=>r.id===c.id);
const source=read('data/SOURCES.json').find(r=>r.id===c.id);
const oldSource=oldJson('data/SOURCES.json').find(r=>r.id===c.id);
const prepared=read(LEDGER).changes.find(r=>r.id===c.id&&r.side==='portrait');
assert(prepared&&prepared.before==null,'only the reviewed formerly absent portrait may supersede this cycle');
function currentSuccessor(current,ledger){
 assert.deepEqual(nonMedia(current),nonMedia(oldRecord),'historical record identity and prose changed');
 assert.deepEqual(current.portrait,ledger.after,'current portrait differs from reviewed successor');
 assert.equal(current.still.src,oldRecord.still.src,'historical character image changed');
 assert.equal(current.still.origin,oldRecord.still.origin,'historical character source changed');
 assert.equal(current.still.kind,oldRecord.still.kind);
 assert.equal(current.still.pin,oldRecord.still.pin);
}
currentSuccessor(record,prepared);
assert.deepEqual(nonMedia(source),nonMedia(oldSource),'historical source identity changed');
assert.deepEqual(source.portrait,record.portrait);assert.deepEqual(source.still,record.still);
assert.equal(hash(fs.readFileSync(prepared.source_path)),prepared.source_sha256,'source bytes changed');
assert.equal(hash(fs.readFileSync(record.portrait.src)),prepared.display_sha256,'display bytes changed');
const audit=read('data/MEDIA-AUDIT.json').items.find(i=>i.wall_id===c.id&&i.side==='portrait');
assert.equal(audit.asset.sha256,prepared.display_sha256);assert.equal(audit.asset.origin,record.portrait.origin);
assert.equal(audit.expected_subject,record.actor);assert.equal(audit.status,'verified');
for(const namespace of ['identity','presentation'])assert(audit.votes.some(v=>v.reviewer_kind==='agent'&&v.namespace===namespace&&v.asset_sha256===prepared.display_sha256&&v.evidence.some(e=>e.type==='preparation-ledger'&&e.value===LEDGER+'#'+c.id+'/portrait')),'reviewed successor evidence missing');
// A new portrait does not authorize rewriting any historical task or receipt.
const priorJobs=oldJson('data/AUTOPILOT.json').jobs.filter(j=>j.wall_ids?.includes(c.id));assert(priorJobs.length>0);
for(const previous of priorJobs){const current=read('data/AUTOPILOT.json').jobs.find(j=>j.id===previous.id);assert.deepEqual(current,previous,'sealed task changed');}
for(const p of [c.checker,c.receipt])assert.equal(hash(fs.readFileSync(p)),hash(historical(p)),'sealed historical input changed: '+p);
for(const p of ['data/journal/autopilot.jsonl','data/journal/waterline.jsonl']){
 const current=new Map(fs.readFileSync(p,'utf8').trim().split('\n').map(s=>{const r=JSON.parse(s);return[r.id,r];}));
 for(const line of historical(p).toString().trim().split('\n')){const row=JSON.parse(line);assert.deepEqual(current.get(row.id),row,'historical event changed');}
}
// Negative controls prove the current-tree boundary is checked separately.
for(const mutate of [r=>{r.actor='Wrong performer';},r=>{r.portrait.origin='https://example.invalid/other';},r=>{r.portrait=null;},r=>{r.still.src='images/unreviewed.jpg';}]){
 const bad=structuredClone(record);mutate(bad);assert.throws(()=>currentSuccessor(bad,prepared));
}
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'undercast-photo-history-')),tree=path.join(parent,'tree');let added=false;
try{
 execFileSync('git',['worktree','add','--detach',tree,BASE],{cwd:root,stdio:'pipe',maxBuffer:128*1024*1024});added=true;
 const result=spawnSync(process.execPath,[c.checker],{cwd:tree,encoding:'utf8',maxBuffer:128*1024*1024,env:process.env});
 assert.equal(result.status,0,result.stderr||result.stdout);process.stdout.write(result.stdout);
 console.log(`photo-maintenance-history: PASS ${c.id}; immutable cycle replay at ${BASE}; exact documentary portrait successor checked in current tree`);
}finally{
 if(added){const result=spawnSync('git',['worktree','remove','--force',tree],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
 fs.rmSync(parent,{recursive:true,force:true});
}
