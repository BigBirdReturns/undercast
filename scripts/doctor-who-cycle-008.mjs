#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const FLOOR="47ccb38eab6a4b6e2a16ed92b04f1259b95de783";
const RECEIPT="data/review/adapter-sdk/doctor-who-cycle-008-composability.json";
const ORIGINAL="data/review/adapter-sdk/doctor-who-cycle-008-kreg.json";
const HISTORICAL="scripts/doctor-who-cycle-008-historical.mjs";
const ORIGINAL_RECEIPT_BLOB="4cedad28d75abbdfdeaa833f8fc907de344e8e34";
const ORIGINAL_CHECKER_BLOB="2c567d6cadf881fbbe14273c03ced87301222869";
const ORIGINAL_RECEIPT_FILE_SHA="97acf91823081791f72ed82969a95faf0019726530fc9a49d3db5b175e6b70b6";
const ORIGINAL_RECEIPT_ID="55561b077fa88fc7f868f139b30c868ef26d4cd7a53751a96a5236159252c41f";
const ORIGINAL_CHECKER_SHA="e91fbac23f6758368aef908626bada08a816b7cc46c103a46b7abb72d022f82c";
const TASK="ap_469d79ea29fd7f877395d20f", LEASE="lease_e65f837070361eacbb1abd46", WALL="UC-1353", CYCLE="cycle_89daa03cca72b8522c76725c";
const REVIEW="2026-08-07T20:42:01.000Z", TOTAL=316, RESOLVED=8;
const ACTIVE=new Set(["leased","drafted","merged"]);
const sha=v=>crypto.createHash("sha256").update(v).digest("hex");
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const sj=v=>JSON.stringify(stable(v)), pretty=v=>JSON.stringify(stable(v),null,2)+"\n";
const read=f=>JSON.parse(fs.readFileSync(f,"utf8"));
const jsonl=f=>fs.readFileSync(f,"utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const clone=structuredClone, ok=(x,m)=>{if(!x)throw Error(m)}, time=(x,m)=>{const n=Date.parse(x||"");ok(Number.isFinite(n),m);return n};
const same=(a,b,m)=>ok(sj(a)===sj(b),m);
const fail=(name,fn,re)=>{let e;try{fn()}catch(x){e=x}ok(e&&re.test(String(e.message||e)),`fixture did not fail: ${name}`)};
const claimId=r=>{const x=clone(r);delete x.id;return `apj_${sha(JSON.stringify(x)).slice(0,24)}`};
const cycleId=r=>{const x=clone(r);delete x.id;return `cycle_${sha(sj(x)).slice(0,24)}`};

function immutable(){
  ok(sha(fs.readFileSync(ORIGINAL))===ORIGINAL_RECEIPT_FILE_SHA,"cycle 008 receipt bytes changed");
  ok(sha(fs.readFileSync(HISTORICAL))===ORIGINAL_CHECKER_SHA,"cycle 008 historical checker bytes changed");
  const r=read(ORIGINAL), b=clone(r);delete b.receipt_sha256;
  ok(r.receipt_sha256===ORIGINAL_RECEIPT_ID&&r.receipt_sha256===sha(pretty(b)),"cycle 008 receipt identity changed");
  ok(r.transaction==="DOCTOR-WHO-CYCLE-008-KREG"&&r.task?.id===TASK&&r.lease?.id===LEASE&&r.canonical?.wall_id===WALL&&r.reviewed_cycle?.id===CYCLE,"cycle 008 identity changed");
  ok(r.reviewed_cycle?.reviewed_at===REVIEW&&r.reviewed_cycle?.outcome==="completed","cycle 008 review changed");
  same(r.queue?.after,{total:316,queued:308,resolved:8,in_flight:0},"cycle 008 queue receipt changed");
  ok(r.boundary?.ninth_lease_issued===false&&r.boundary?.cycle_009_authorized===false&&r.boundary?.outside_human_dependency===false&&r.boundary?.owner_physical_action_required===false,"cycle 008 authority changed");
  if(process.env.SKIP_IMMUTABLE_GIT_CHECK!=="1"&&fs.existsSync(".git")){
    ok(execFileSync("git",["rev-parse",`${FLOOR}:${ORIGINAL}`],{encoding:"utf8"}).trim()===ORIGINAL_RECEIPT_BLOB,"historical receipt blob changed");
    ok(execFileSync("git",["rev-parse",`${FLOOR}:scripts/doctor-who-cycle-008.mjs`],{encoding:"utf8"}).trim()===ORIGINAL_CHECKER_BLOB,"historical checker blob changed");
    ok(sha(execFileSync("git",["show",`${FLOOR}:${ORIGINAL}`]))===ORIGINAL_RECEIPT_FILE_SHA,"historical receipt bytes unavailable");
    ok(sha(execFileSync("git",["show",`${FLOOR}:scripts/doctor-who-cycle-008.mjs`]))===ORIGINAL_CHECKER_SHA,"historical checker bytes unavailable");
  }
}

function validate({jobs,journal,cycles}){
  const d=jobs.filter(x=>x.scope==="doctor-who"), by=new Map(d.map(x=>[x.id,x]));
  ok(d.length===TOTAL,"Doctor Who denominator changed");
  const k=by.get(TASK);ok(k?.status==="resolved"&&sj(k.wall_ids)===sj([WALL]),"Kreg task was reopened or rebound");
  ok(d.filter(x=>x.status==="resolved").length>=RESOLVED,"resolved floor regressed");
  const claims=journal.filter(x=>x.op==="lease.claimed"&&x.scope==="doctor-who");
  for(const c of claims){ok(c.id===claimId(c),"claim is not content-addressed");time(c.at,"invalid claim time");ok(c.lease_id&&c.task_id&&by.has(c.task_id),"claim references unknown task")}
  const hist=claims.filter(c=>time(c.at,"claim")<=time(REVIEW,"review"));
  ok(hist.length===8,"historical claim denominator changed");
  const kc=hist.filter(c=>c.lease_id===LEASE&&c.task_id===TASK);ok(kc.length===1&&kc[0].at==="2026-08-07T01:31:00.000Z","Kreg claim changed");
  const dc=cycles.filter(x=>x.scope_id==="doctor-who"), byLease=new Map();
  for(const c of dc){ok(!byLease.has(c.lease_id),"duplicate cycle receipt");byLease.set(c.lease_id,c)}
  const kr=dc.filter(c=>c.lease_id===LEASE);ok(kr.length===1&&kr[0].id===CYCLE&&kr[0].outcome==="completed"&&kr[0].task_statuses?.[TASK]==="resolved"&&kr[0].reviewed_at===REVIEW&&kr[0].id===cycleId(kr[0]),"Kreg cycle receipt changed");
  const cb=new Map();for(const c of claims){const a=cb.get(c.lease_id)||[];a.push(c);cb.set(c.lease_id,a)}
  for(const [l,a] of cb)ok(a.length===1,`lease ${l} claims more than one task`);for(const c of dc)ok(cb.has(c.lease_id),"cycle has no claim");
  const active=d.filter(x=>ACTIVE.has(x.status));ok(active.length<=1,"more than one later Doctor Who task is active");
  const open=[];
  for(const c of claims.filter(x=>time(x.at,"later claim")>time(REVIEW,"review"))){const r=byLease.get(c.lease_id),j=by.get(c.task_id);if(r){ok(r.task_ids?.length===1&&r.task_ids[0]===c.task_id&&r.claimed_at===c.at,"later cycle changed task or claim");ok(!ACTIVE.has(j.status),"receipted cycle remains active")}else open.push(c)}
  ok(open.length===active.length,"lease/cycle receipt boundary is inconsistent");
  if(active.length){const j=active[0],c=open[0];ok(j.id===c.task_id&&j.lease?.id===c.lease_id&&j.lease?.claimed_at===c.at&&j.lease?.readiness_token===c.readiness_token,"active task does not match claim");ok(time(c.at,"active claim")>time(REVIEW,"review"),"later task predates cycle 008")}
}

function claim(job,lease,at){const b={version:1,at,op:"lease.claimed",task_id:job.id,scope:"doctor-who",performer:job.performer,character:job.character,lease_id:lease,agent:"luna",expires_at:new Date(Date.parse(at)+86400000).toISOString(),readiness_token:"282a013eb9ce501b80a2e548b78f48915cb3e1e21df3c25c664382fcf975046e",capability_profile:"text-vision",capability_policy_sha256:"07fcbefca2326ec964a2a8ca3bdb29924976bbe4c906d6ef5cc019a1b1889c19",required_capabilities:[],selection_strategy:"priority-compatible",selection_basis:"Highest-priority queued tasks compatible with the reviewed capability profile."};return{id:`apj_${sha(JSON.stringify(b)).slice(0,24)}`,...b}}
function activate(x,n=0,l="lease_future",at="2026-08-08T02:00:00.000Z"){const q=x.jobs.filter(j=>j.scope==="doctor-who"&&j.status==="queued")[n],j=x.jobs.find(y=>y.id===q.id),c=claim(j,l,at);j.status="leased";j.lease={id:l,claimed_at:at,expires_at:c.expires_at,readiness_token:c.readiness_token};x.journal.push(c);return{j,c}}

immutable();
const receipt=read(RECEIPT), rb=clone(receipt);delete rb.receipt_sha256;
ok(receipt.transaction==="DOCTOR-WHO-CYCLE-008-COMPOSABILITY-001"&&receipt.receipt_sha256===sha(pretty(rb)),"composability receipt changed");
ok(receipt.base_main===FLOOR&&receipt.original?.receipt_git_blob===ORIGINAL_RECEIPT_BLOB&&receipt.original?.checker_git_blob===ORIGINAL_CHECKER_BLOB,"composability floor custody changed");
ok(receipt.qualification?.checker_sha256===sha(fs.readFileSync("scripts/doctor-who-cycle-008.mjs")),"composable checker binding changed");
ok(receipt.boundary?.later_cycles_allowed===true&&receipt.boundary?.maximum_unreceipted_tasks===1&&receipt.boundary?.cycle_009_lease_issued===false&&receipt.boundary?.outside_human_dependency===false,"composability authority changed");
const cur={jobs:read("data/AUTOPILOT.json").jobs,journal:jsonl("data/journal/autopilot.jsonl"),cycles:read("data/WATERLINE-STATE.json").cycles};validate(cur);
const one=clone(cur);activate(one);validate(one);
const two=clone(one);activate(two,1,"lease_second","2026-08-08T02:05:00.000Z");fail("two active",()=>validate(two),/more than one later/);
const orphan=clone(cur);orphan.journal.push(claim(orphan.jobs.find(j=>j.scope==="doctor-who"&&j.status==="queued"),"lease_orphan","2026-08-08T02:10:00.000Z"));fail("orphan",()=>validate(orphan),/receipt boundary/);
const noClaim=clone(cur);const t=noClaim.jobs.find(j=>j.scope==="doctor-who"&&j.status==="queued");t.status="leased";t.lease={id:"lease_missing",claimed_at:"2026-08-08T02:20:00.000Z",readiness_token:"282a013eb9ce501b80a2e548b78f48915cb3e1e21df3c25c664382fcf975046e"};fail("active without claim",()=>validate(noClaim),/receipt boundary/);
const reopen=clone(cur);reopen.jobs.find(j=>j.id===TASK).status="queued";fail("reopen",()=>validate(reopen),/Kreg task/);
const denom=clone(cur);denom.jobs=denom.jobs.filter(j=>j.id!==TASK);fail("denominator",()=>validate(denom),/denominator/);
const dup=clone(cur);dup.journal.push(clone(dup.journal.find(c=>c.op==="lease.claimed"&&c.lease_id===LEASE)));fail("duplicate",()=>validate(dup),/historical claim|claims more than one/);
const pre=clone(cur);pre.journal.push(claim(pre.jobs.find(j=>j.scope==="doctor-who"&&j.status==="queued"),"lease_pre","2026-08-07T20:41:59.000Z"));fail("pre-boundary",()=>validate(pre),/historical claim/);
console.log("doctor-who-cycle-008: PASS — immutable Kreg custody is preserved; zero or one later receipt-bound Doctor Who task is composable; adversarial reopen, denominator, duplicate, orphan, pre-boundary, and multi-active fixtures are refused");
