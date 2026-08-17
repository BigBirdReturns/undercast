#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const WRAPPER='scripts/star-trek-arex-cycle-composable.mjs', RECEIPT='data/review/adapter-sdk/star-trek-arex-cycle.json', CHECKER='scripts/star-trek-arex-cycle.mjs';
const RECEIPT_FILE='d1a72e17935a01180cec0cfc35726be8586249e24dd0e579e6bb19cd6b7b8c10', RECEIPT_ID='903821d2be9f3f1316dcf61eabefe2f91343aba568d4e829de7e36b922146f74', CHECKER_SHA='bf2d3151edb559e07217f4c2b95917874fc2c3357594c199cb3e276d14b968bc', AREX_PRODUCT='a339abfc2bf4c51699562259180fb62142c6a368';
const TASK='ap_90fc241310970bc2c6fd5aba', WALL='UC-684', LEASE='lease_cc1744f35853a9f460c6b5e0', CYCLE='cycle_c1948e7d12f278d9b1f1b7c3', TOTAL=2228, RESOLVED_FLOOR=414;
const ACTIVE=new Set(['leased','drafted','merged']);
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const sj=v=>JSON.stringify(stable(v)), pretty=v=>JSON.stringify(stable(v),null,2)+'\n';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')), jsonl=f=>fs.readFileSync(f,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ok=(x,m)=>{if(!x)throw Error(m)};
const run=(cmd,args,{cwd=process.cwd()}={})=>{const r=spawnSync(cmd,args,{cwd,encoding:'utf8',maxBuffer:256*1024*1024});if(r.status!==0)throw Error(cmd+' '+args.join(' ')+' failed: '+(r.stderr||r.stdout||r.status));return r.stdout||''};
const receipt=read(RECEIPT), body=structuredClone(receipt);delete body.receipt_sha256;
ok(sha(fs.readFileSync(RECEIPT))===RECEIPT_FILE&&receipt.receipt_sha256===RECEIPT_ID&&receipt.receipt_sha256===sha(pretty(body)),'Arex immutable receipt drifted');
ok(sha(fs.readFileSync(CHECKER))===CHECKER_SHA&&receipt.qualification?.checker_sha256===CHECKER_SHA,'Arex immutable checker drifted');
const card=read('data/specimens.json').find(x=>x.id===WALL), source=read('data/SOURCES.json').find(x=>x.id===WALL), facets=read('data/MEDIA-AUDIT.json').items.filter(x=>x.wall_id===WALL).sort((a,b)=>a.side.localeCompare(b.side));
ok(card&&sha(pretty(card))===receipt.canonical?.record_sha256,'current Arex card drifted');
ok(source&&sha(pretty(source))===receipt.media?.source_ledger_sha256,'current Arex source ledger drifted');
ok(facets.length===2&&facets.every(x=>x.status==='verified')&&sha(pretty(facets))===receipt.media?.facets_sha256,'current Arex media drifted');
const state=read('data/AUTOPILOT.json'), trek=state.jobs.filter(x=>x.scope==='star-trek'), task=trek.find(x=>x.id===TASK);
ok(trek.length===TOTAL&&task?.status==='resolved'&&task.performer==='James Doohan'&&task.character==='Arex'&&task.wall_ids?.length===1&&task.wall_ids[0]===WALL,'current Arex task drifted');
const claims=jsonl('data/journal/autopilot.jsonl').filter(x=>x.op==='lease.claimed'&&x.scope==='star-trek');
for(const row of claims){const b=structuredClone(row);delete b.id;ok(row.id==='apj_'+sha(JSON.stringify(b)).slice(0,24),'Star Trek claim is not content-addressed')}
const water=read('data/WATERLINE-STATE.json'), receipts=water.cycles.filter(x=>x.scope_id==='star-trek'), byLease=new Map();
for(const row of receipts){ok(!byLease.has(row.lease_id),'duplicate Star Trek cycle receipt');byLease.set(row.lease_id,row)}
ok(byLease.get(LEASE)?.id===CYCLE,'Arex reviewed cycle disappeared');
const reviewAt=Date.parse(receipt.reviewed_cycle?.reviewed_at||'');
ok(Number.isFinite(reviewAt),'Arex review timestamp drifted');
const later=claims.filter(x=>Date.parse(x.at)>reviewAt), unreceipted=later.filter(x=>!byLease.has(x.lease_id));
ok(unreceipted.length<=1,'more than one later Star Trek cycle is unreceipted');
ok(trek.filter(x=>ACTIVE.has(x.status)).length<=1,'more than one later Star Trek task is active');
for(const row of later.filter(x=>byLease.has(x.lease_id))){const c=byLease.get(row.lease_id),j=trek.find(x=>x.id===row.task_id);ok(c.task_ids?.length===1&&c.task_ids[0]===row.task_id&&j?.status==='resolved','later receipted Star Trek cycle drifted')}
const queued=trek.filter(x=>x.status==='queued').length, resolved=trek.filter(x=>x.status==='resolved').length;
ok(resolved>=RESOLVED_FLOOR,'Star Trek resolved floor regressed');
const latest=[...receipts].sort((a,b)=>Date.parse(a.reviewed_at)-Date.parse(b.reviewed_at)).at(-1), estate=read('data/ESTATE-REGISTRY.json').estates.find(x=>x.id==='star-trek');
ok(latest&&estate?.next_gate?.includes(latest.id)&&estate.next_gate.includes((queued+unreceipted.length).toLocaleString('en-US')+' tasks remain queued'),'current Star Trek registry gate drifted');
ok(read('data/review/adapter-sdk/BASELINE.json').inputs?.estate_registry?.sha256===sha(fs.readFileSync('data/ESTATE-REGISTRY.json')),'current adapter baseline registry binding drifted');
const pkg=read('package.json');
ok(pkg.scripts?.['star-trek:arex-cycle:check']==='node '+WRAPPER&&pkg.scripts?.['autopilot:fixtures']?.includes('npm run star-trek:arex-cycle:check'),'Arex composable package route drifted');
run('git',['fetch','--no-tags','--depth=3','origin','main']);
run('git',['cat-file','-e',AREX_PRODUCT+'^{commit}']);
const parent=fs.mkdtempSync(path.join(os.tmpdir(),'undercast-arex-historical-')), historical=path.join(parent,'worktree');
let added=false;
try{run('git',['worktree','add','--detach',historical,AREX_PRODUCT]);added=true;run(process.execPath,[CHECKER],{cwd:historical})}finally{if(added)spawnSync('git',['worktree','remove','--force',historical],{encoding:'utf8'});fs.rmSync(parent,{recursive:true,force:true})}
console.log('star-trek-arex-cycle-composable: PASS — immutable Arex checker and receipt pass at the exact Arex product while current card, source, media, queue, registry, and later-cycle custody remain bounded');
