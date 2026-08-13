#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
const RECEIPT="data/review/adapter-sdk/star-trek-m5-cycle.json", HISTORICAL="scripts/star-trek-m5-cycle-historical.mjs", COMP="data/review/adapter-sdk/star-trek-m5-composability-v1.json";
const TASK='ap_119c89efb9edbdd49dc78cf0', LEASE='lease_46fdacd28599204ed928e66b', WALL='UC-1361', CYCLE='cycle_10e448014c8cc536405c949b', REVIEW='2026-08-12T18:20:00.000Z';
const ORIGINAL="7fbd9abe5cc58e061157b17d07c529594a96fd0ecf23e90d38c43ecd2654cc89", RECEIPT_FILE="8d7057b5771de07cd46e874132dca182c309c95dcff2b9d8f1a0e458ba9a4989", RECEIPT_ID="3d7fa1d75e9007dc0605a2369ac2e812e109a11b87be834fb0359d480ddcd65c", COMP_FILE="d3ff61e160d28c0977b6be34a9e83d1ed9b54f267c0477a056201ef0707f3a8d", COMP_ID="c89de4b1027cd3ba70599462839a4f231715f6749203828054904a6690af26b9";
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const sj=v=>JSON.stringify(stable(v)), pretty=v=>JSON.stringify(stable(v),null,2)+'\n';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8')), jsonl=f=>fs.readFileSync(f,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ok=(x,m)=>{if(!x)throw Error(m)}, same=(a,b,m)=>ok(sj(a)===sj(b),m);
const receipt=read(RECEIPT), rb=structuredClone(receipt);delete rb.receipt_sha256;
ok(receipt.receipt_sha256===sha(pretty(rb))&&receipt.receipt_sha256===RECEIPT_ID&&sha(fs.readFileSync(RECEIPT))===RECEIPT_FILE,'M-5 receipt drifted');
ok(receipt.qualification?.checker_sha256===ORIGINAL&&sha(fs.readFileSync(HISTORICAL))===ORIGINAL,'M-5 historical checker custody drifted');
const comp=read(COMP), cb=structuredClone(comp);delete cb.receipt_sha256;
ok(comp.receipt_sha256===sha(pretty(cb))&&comp.receipt_sha256===COMP_ID&&sha(fs.readFileSync(COMP))===COMP_FILE,'M-5 composability receipt drifted');
ok(comp.prior?.receipt_identity===receipt.receipt_sha256&&comp.prior?.historical_checker_sha256===ORIGINAL&&comp.current?.armus_cycle_id==="cycle_625c026fc1c1082b960ca764",'M-5 composability bindings drifted');
const state=read('data/AUTOPILOT.json'), trek=state.jobs.filter(x=>x.scope==='star-trek'), task=trek.find(x=>x.id===TASK);
ok(task?.status==='resolved'&&task.wall_ids?.includes(WALL),'M-5 task drifted');
const card=read('data/specimens.json').find(x=>x.id===WALL);ok(card?.actor==='James Doohan'&&card?.character==='M-5 multitronic unit'&&card?.kind==='voice','M-5 canonical record drifted');
const facets=read('data/MEDIA-AUDIT.json').items.filter(x=>x.wall_id===WALL);ok(facets.length===2&&facets.every(x=>x.status==='verified'),'M-5 media custody drifted');
const claims=jsonl('data/journal/autopilot.jsonl').filter(x=>x.op==='lease.claimed'&&x.scope==='star-trek');for(const row of claims){const b=structuredClone(row);delete b.id;ok(row.id==='apj_'+sha(JSON.stringify(b)).slice(0,24),'Star Trek claim is not content-addressed')}
const water=read('data/WATERLINE-STATE.json'), receipts=water.cycles.filter(x=>x.scope_id==='star-trek'), byLease=new Map();for(const row of receipts){ok(!byLease.has(row.lease_id),'duplicate Star Trek cycle receipt');byLease.set(row.lease_id,row)}
const m5=receipts.find(x=>x.lease_id===LEASE);ok(m5?.id===CYCLE&&m5.outcome==='completed'&&m5.task_statuses?.[TASK]==='resolved','M-5 cycle drifted');
const later=claims.filter(x=>Date.parse(x.at)>Date.parse(REVIEW)), unreceipted=later.filter(x=>!byLease.has(x.lease_id));ok(unreceipted.length<=1,'more than one later Star Trek cycle is unreceipted');ok(trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length<=1,'more than one later Star Trek task is active');
for(const row of later.filter(x=>byLease.has(x.lease_id))){const c=byLease.get(row.lease_id),j=trek.find(x=>x.id===row.task_id);ok(c.task_ids?.length===1&&c.task_ids[0]===row.task_id&&j?.status==='resolved','later receipted Star Trek cycle drifted')}
const resolved=trek.filter(x=>x.status==='resolved').length, queued=trek.filter(x=>x.status==='queued').length;ok(resolved>=392,'Star Trek resolved floor regressed');
const latest=receipts.at(-1), registry=read('data/ESTATE-REGISTRY.json'), estate=registry.estates.find(x=>x.id==='star-trek');ok(latest&&estate?.next_gate?.includes(latest.id)&&estate.next_gate.includes(queued.toLocaleString('en-US')+' tasks remain queued'),'Star Trek registry gate drifted');
const baseline=read('data/review/adapter-sdk/BASELINE.json');ok(baseline.inputs?.estate_registry?.sha256===sha(fs.readFileSync('data/ESTATE-REGISTRY.json')),'adapter baseline registry binding drifted');
ok(read('package.json').scripts?.['star-trek:m5-cycle:check']==='node scripts/star-trek-m5-cycle.mjs','M-5 checker route drifted');
ok(comp.boundary?.m5_receipt_immutable===true&&comp.boundary?.armus_cycle_receipted===true&&comp.boundary?.outside_human_dependency===false&&comp.boundary?.owner_physical_action_required===false,'M-5 composability boundary drifted');
console.log('star-trek-m5-cycle: PASS — immutable M-5 custody and later receipted Star Trek cycles are composable under the current registry floor');
