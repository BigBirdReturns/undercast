#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const FLOOR="47ccb38eab6a4b6e2a16ed92b04f1259b95de783";
const V1_MAIN="759589336a140487ebf3baad8c3f95fd9943b16b";
const V2_MAIN="a9b1a29098e36f03340ff6678b3edd06f1d1d3e2";
const ORIGINAL="data/review/adapter-sdk/doctor-who-cycle-008-kreg.json";
const HISTORICAL="scripts/doctor-who-cycle-008-historical.mjs";
const RECEIPT_V1="data/review/adapter-sdk/doctor-who-cycle-008-composability.json";
const RECEIPT_V2="data/review/adapter-sdk/doctor-who-cycle-008-composability-v2.json";
const RECEIPT_V3="data/review/adapter-sdk/doctor-who-cycle-008-composability-v3.json";
const ORIGINAL_RECEIPT_BLOB="4cedad28d75abbdfdeaa833f8fc907de344e8e34";
const ORIGINAL_CHECKER_BLOB="2c567d6cadf881fbbe14273c03ced87301222869";
const ORIGINAL_RECEIPT_SHA="97acf91823081791f72ed82969a95faf0019726530fc9a49d3db5b175e6b70b6";
const ORIGINAL_RECEIPT_ID="55561b077fa88fc7f868f139b30c868ef26d4cd7a53751a96a5236159252c41f";
const ORIGINAL_CHECKER_SHA="e91fbac23f6758368aef908626bada08a816b7cc46c103a46b7abb72d022f82c";
const V1_RECEIPT_BLOB="1134c9c112a52df4943c2066f39febfc23c4da97";
const V1_CHECKER_BLOB="4e5bdae7b4cc48403d8843070e0662482f062ea0";
const V1_RECEIPT_SHA="eb2879003303297bdbaef3dc7da7aaa14c054a55e39be59433b43cec5fdd341f";
const V1_CHECKER_SHA="3e371db7e8aaf98c68c386bd5813b67da0bec4c4dbfb9164b67b668f6b5d9de6";
const V2_RECEIPT_BLOB="7fde0741ad91f45a7637b01e4dd64c69948c95d6";
const V2_CHECKER_BLOB="7264d7e9cc995db157033f2150d58b7c985933e1";
const V2_RECEIPT_SHA="16f96616de6f7ac9039814f9bb25d6b0a34fe25411ff06a3439ca9d25278187a";
const V2_CHECKER_SHA="9f808b600c3a63ed4a2ef9f05acf551e1ad040c90b6eb91d17ff1d8cd73107d0";
const TASK="ap_469d79ea29fd7f877395d20f", LEASE="lease_e65f837070361eacbb1abd46", WALL="UC-1353", CYCLE="cycle_89daa03cca72b8522c76725c";
const REVIEW="2026-08-07T20:42:01.000Z", TOTAL=316, RESOLVED_FLOOR=8;
const ACTIVE=new Set(["leased","drafted","merged"]), PENDING=new Set([...ACTIVE,"resolved"]);
const sha=v=>crypto.createHash("sha256").update(v).digest("hex");
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const sj=v=>JSON.stringify(stable(v)), pretty=v=>JSON.stringify(stable(v),null,2)+"\n";
const read=f=>JSON.parse(fs.readFileSync(f,"utf8"));
const jsonl=f=>fs.readFileSync(f,"utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const clone=structuredClone, ok=(x,m)=>{if(!x)throw Error(m)};
const time=(x,m)=>{const n=Date.parse(x||"");ok(Number.isFinite(n),m);return n};
const same=(a,b,m)=>ok(sj(a)===sj(b),m);
const fail=(name,fn,re)=>{let e;try{fn()}catch(x){e=x}ok(e&&re.test(String(e.message||e)),`fixture did not fail: ${name}`)};
const claimId=r=>{const x=clone(r);delete x.id;return `apj_${sha(JSON.stringify(x)).slice(0,24)}`};
const cycleId=r=>{const x=clone(r);delete x.id;return `cycle_${sha(sj(x)).slice(0,24)}`};

function assertHistorical(commit,path,blob,fileSha,label){
  if(process.env.SKIP_IMMUTABLE_GIT_CHECK==="1"||!fs.existsSync(".git"))return;
  ok(execFileSync("git",["rev-parse",`${commit}:${path}`],{encoding:"utf8"}).trim()===blob,`${label} blob changed`);
  ok(sha(execFileSync("git",["show",`${commit}:${path}`]))===fileSha,`${label} bytes unavailable`);
}
function immutable(){
  ok(sha(fs.readFileSync(ORIGINAL))===ORIGINAL_RECEIPT_SHA,"cycle 008 receipt bytes changed");
  ok(sha(fs.readFileSync(HISTORICAL))===ORIGINAL_CHECKER_SHA,"cycle 008 historical checker bytes changed");
  ok(sha(fs.readFileSync(RECEIPT_V1))===V1_RECEIPT_SHA,"composability-v1 receipt bytes changed");
  ok(sha(fs.readFileSync(RECEIPT_V2))===V2_RECEIPT_SHA,"composability-v2 receipt bytes changed");
  const r=read(ORIGINAL), b=clone(r);delete b.receipt_sha256;
  ok(r.receipt_sha256===ORIGINAL_RECEIPT_ID&&r.receipt_sha256===sha(pretty(b)),"cycle 008 receipt identity changed");
  ok(r.transaction==="DOCTOR-WHO-CYCLE-008-KREG"&&r.task?.id===TASK&&r.lease?.id===LEASE&&r.canonical?.wall_id===WALL&&r.reviewed_cycle?.id===CYCLE,"cycle 008 identity changed");
  ok(r.reviewed_cycle?.reviewed_at===REVIEW&&r.reviewed_cycle?.outcome==="completed","cycle 008 review changed");
  same(r.queue?.after,{total:316,queued:308,resolved:8,in_flight:0},"cycle 008 queue receipt changed");
  ok(r.boundary?.ninth_lease_issued===false&&r.boundary?.cycle_009_authorized===false&&r.boundary?.outside_human_dependency===false&&r.boundary?.owner_physical_action_required===false,"cycle 008 authority changed");
  assertHistorical(FLOOR,ORIGINAL,ORIGINAL_RECEIPT_BLOB,ORIGINAL_RECEIPT_SHA,"historical receipt");
  assertHistorical(FLOOR,"scripts/doctor-who-cycle-008.mjs",ORIGINAL_CHECKER_BLOB,ORIGINAL_CHECKER_SHA,"historical checker");
  assertHistorical(V1_MAIN,RECEIPT_V1,V1_RECEIPT_BLOB,V1_RECEIPT_SHA,"composability-v1 receipt");
  assertHistorical(V1_MAIN,"scripts/doctor-who-cycle-008.mjs",V1_CHECKER_BLOB,V1_CHECKER_SHA,"composability-v1 checker");
  assertHistorical(V2_MAIN,RECEIPT_V2,V2_RECEIPT_BLOB,V2_RECEIPT_SHA,"composability-v2 receipt");
  assertHistorical(V2_MAIN,"scripts/doctor-who-cycle-008.mjs",V2_CHECKER_BLOB,V2_CHECKER_SHA,"composability-v2 checker");
}
function verifyFacet(facet,expected,label){
  ok(facet&&typeof facet==="object"&&!Array.isArray(facet),`${label} review missing`);
  ok(["absent","verified"].includes(facet.disposition),`${label} disposition invalid`);
  ok(String(facet.note||"").trim().length>=12,`${label} review note missing`);
  if(facet.disposition==="verified"){
    ok(String(facet.subject||"").trim().toLowerCase()===String(expected||"").trim().toLowerCase(),`${label} subject changed`);
    ok(/^https:\/\//.test(String(facet.source||"")),`${label} source is not HTTPS`);
  }else ok(!facet.subject&&!facet.source,`${label} absent facet carries subject or source`);
}
function activeCustody(job,claim){
  ok(job.id===claim.task_id,"active task id does not match claim");
  const claimed=time(claim.at,"active claim"), later=(v,m)=>ok(time(v,m)>claimed,`${m} does not follow claim`);
  if(job.status==="leased"){
    ok(job.lease?.id===claim.lease_id&&job.lease?.claimed_at===claim.at&&job.lease?.readiness_token===claim.readiness_token&&job.lease?.agent===claim.agent,"leased task does not match claim");
    ok(!job.outcome||!["draft","merged","audited-wall"].includes(job.outcome.kind),"leased task carries transitioned outcome custody");return;
  }
  ok(!job.lease,"transitioned active task retained lease custody");
  const o=job.outcome||{};
  ok(o.lease_id===claim.lease_id&&o.readiness_token===claim.readiness_token,"transitioned task receipt does not match claim");
  ok(o.source_fingerprint===job.source_fingerprint,"transitioned task receipt has stale source fingerprint");
  if(job.status==="drafted"){
    ok(o.kind==="draft","drafted task lacks draft outcome custody");later(o.submitted_at,"draft submission");
    ok(String(o.submitted_by||"").trim()&&String(o.draft_identity||"").trim(),"drafted task lacks submission identity");return;
  }
  ok(job.status==="merged"&&o.kind==="merged","merged task lacks merged outcome custody");
  later(o.submitted_at,"merge submission");ok(time(o.merged_at,"merge time")>=time(o.submitted_at,"merge submission"),"merge predates submission");
  ok(Array.isArray(job.wall_ids)&&job.wall_ids.length>0,"merged task has no wall custody");same(o.wall_ids,job.wall_ids,"merged task outcome wall custody");
}
function resolvedCustody(job,claim){
  ok(job.id===claim.task_id&&job.status==="resolved"&&job.role_on_wall===true,"resolved task identity or wall state does not match claim");
  ok(!job.lease,"resolved task retained lease custody");
  ok(Array.isArray(job.wall_ids)&&job.wall_ids.length>0&&new Set(job.wall_ids).size===job.wall_ids.length,"resolved task has no unique wall custody");
  const o=job.outcome||{}, review=o.media_review||{};
  ok(o.kind==="audited-wall","resolved task lacks audited-wall outcome custody");same(o.wall_ids,job.wall_ids,"resolved outcome wall custody");
  ok(review.lease_id===claim.lease_id,"resolved media review does not match claim lease");
  ok(String(review.reviewed_by||"").trim(),"resolved media review lacks reviewer identity");
  ok(o.resolved_at===review.reviewed_at&&time(review.reviewed_at,"resolved review")>time(claim.at,"resolved claim"),"resolved review chronology changed");
  ok(/^[0-9a-f]{64}$/i.test(review.corpus_sha256||""),"resolved media review lacks corpus receipt");
  ok(Array.isArray(review.records)&&review.records.length===job.wall_ids.length,"resolved media review record denominator changed");
  const ids=review.records.map(x=>x?.wall_id);ok(new Set(ids).size===ids.length,"resolved media review repeats a wall ID");same([...ids].sort(),[...job.wall_ids].sort(),"resolved media review wall IDs changed");
  for(const row of review.records){time(row.fetched_at,"resolved media fetched_at");verifyFacet(row.still,job.character,"still");verifyFacet(row.portrait,job.performer,"portrait")}
  ok(o.review_sha256===sha(JSON.stringify(review)),"resolved media review hash changed");
}
function validate({jobs,journal,cycles}){
  const doctor=jobs.filter(x=>x.scope==="doctor-who"), byTask=new Map(doctor.map(x=>[x.id,x]));
  ok(doctor.length===TOTAL,"Doctor Who denominator changed");
  const kreg=byTask.get(TASK);ok(kreg?.status==="resolved"&&sj(kreg.wall_ids)===sj([WALL]),"Kreg task was reopened or rebound");
  ok(doctor.filter(x=>x.status==="resolved").length>=RESOLVED_FLOOR,"resolved floor regressed");
  const claims=journal.filter(x=>x.op==="lease.claimed"&&x.scope==="doctor-who");
  for(const c of claims){ok(c.id===claimId(c),"claim is not content-addressed");time(c.at,"invalid claim time");ok(c.lease_id&&c.task_id&&byTask.has(c.task_id),"claim references unknown task")}
  const historical=claims.filter(c=>time(c.at,"claim")<=time(REVIEW,"review"));ok(historical.length===8,"historical claim denominator changed");
  const kc=historical.filter(c=>c.lease_id===LEASE&&c.task_id===TASK);ok(kc.length===1&&kc[0].at==="2026-08-07T01:31:00.000Z","Kreg claim changed");
  const receipts=cycles.filter(x=>x.scope_id==="doctor-who"), byLease=new Map();
  for(const c of receipts){ok(!byLease.has(c.lease_id),"duplicate cycle receipt");byLease.set(c.lease_id,c)}
  const kr=receipts.filter(c=>c.lease_id===LEASE);ok(kr.length===1&&kr[0].id===CYCLE&&kr[0].outcome==="completed"&&kr[0].task_statuses?.[TASK]==="resolved"&&kr[0].reviewed_at===REVIEW&&kr[0].id===cycleId(kr[0]),"Kreg cycle receipt changed");
  const byClaimLease=new Map();for(const c of claims){const rows=byClaimLease.get(c.lease_id)||[];rows.push(c);byClaimLease.set(c.lease_id,rows)}
  for(const [lease,rows] of byClaimLease)ok(rows.length===1,`lease ${lease} claims more than one task`);for(const c of receipts)ok(byClaimLease.has(c.lease_id),"cycle has no claim");
  const active=doctor.filter(x=>ACTIVE.has(x.status));ok(active.length<=1,"more than one later Doctor Who task is active");
  const open=[];
  for(const c of claims.filter(x=>time(x.at,"later claim")>time(REVIEW,"review"))){
    const receipt=byLease.get(c.lease_id), job=byTask.get(c.task_id);
    if(receipt){ok(receipt.task_ids?.length===1&&receipt.task_ids[0]===c.task_id&&receipt.claimed_at===c.at,"later cycle changed task or claim");ok(job.status==="resolved","receipted cycle task is not resolved")}
    else open.push(c);
  }
  ok(open.length<=1,"more than one later Doctor Who task is unreceipted");
  const pending=open.map(c=>byTask.get(c.task_id));ok(pending.every(Boolean),"unreceipted claim references unknown task");
  ok(active.length===pending.filter(x=>ACTIVE.has(x.status)).length,"lease/cycle receipt boundary is inconsistent");
  if(open.length){const job=pending[0],claim=open[0];ok(PENDING.has(job.status),"unreceipted task has unsupported status");ACTIVE.has(job.status)?activeCustody(job,claim):resolvedCustody(job,claim);ok(time(claim.at,"pending claim")>time(REVIEW,"review"),"later task predates cycle 008")}
  const claimedTasks=new Set(claims.map(x=>x.task_id));for(const job of doctor.filter(x=>x.status==="resolved"))ok(claimedTasks.has(job.id),"resolved task has no claim");
}

function claim(job,lease,at){const b={version:1,at,op:"lease.claimed",task_id:job.id,scope:"doctor-who",performer:job.performer,character:job.character,lease_id:lease,agent:"luna",expires_at:new Date(Date.parse(at)+86400000).toISOString(),readiness_token:"282a013eb9ce501b80a2e548b78f48915cb3e1e21df3c25c664382fcf975046e",capability_profile:"text-vision",capability_policy_sha256:"07fcbefca2326ec964a2a8ca3bdb29924976bbe4c906d6ef5cc019a1b1889c19",required_capabilities:[],selection_strategy:"priority-compatible",selection_basis:"Highest-priority queued tasks compatible with the reviewed capability profile."};return{id:`apj_${sha(JSON.stringify(b)).slice(0,24)}`,...b}}
function activate(x,n=0,lease="lease_future",at="2026-08-08T02:00:00.000Z"){const q=x.jobs.filter(j=>j.scope==="doctor-who"&&j.status==="queued")[n],j=x.jobs.find(y=>y.id===q.id),c=claim(j,lease,at);j.status="leased";j.lease={id:lease,agent:c.agent,claimed_at:at,expires_at:c.expires_at,readiness_token:c.readiness_token};x.journal.push(c);return{j,c}}
function draft(a,at="2026-08-08T02:01:00.000Z"){const {j,c}=a;j.status="drafted";j.outcome={kind:"draft",submitted_at:at,submitted_by:c.agent,draft_identity:`future-${j.id}`,lease_id:c.lease_id,readiness_token:c.readiness_token,source_fingerprint:j.source_fingerprint};delete j.lease;return a}
function merge(a,at="2026-08-08T02:02:00.000Z"){if(a.j.status!=="drafted")draft(a);const {j,c}=a;j.status="merged";j.role_on_wall=true;j.wall_ids=["UC-FUTURE"];j.outcome={kind:"merged",merged_at:at,submitted_at:j.outcome.submitted_at,submitted_by:j.outcome.submitted_by,lease_id:c.lease_id,readiness_token:c.readiness_token,source_fingerprint:j.source_fingerprint,wall_ids:[...j.wall_ids]};return a}
function resolve(a,at="2026-08-08T02:03:00.000Z"){merge(a);const {j,c}=a,records=j.wall_ids.map(wall_id=>({wall_id,fetched_at:"2026-08-08",still:{disposition:"absent",note:"No exact character still was recovered for this fixture task."},portrait:{disposition:"absent",note:"No exact performer portrait was recovered for this fixture task."}})),media_review={reviewed_by:"fixture-second-desk",reviewed_at:at,lease_id:c.lease_id,corpus_sha256:"a".repeat(64),records};j.status="resolved";j.outcome={kind:"audited-wall",resolved_at:at,wall_ids:[...j.wall_ids],media_review,review_sha256:sha(JSON.stringify(media_review))};return a}
function fixtureTerminal(source){
  const x=clone(source), receiptKeys=new Set(x.cycles.map(c=>`${c.scope_id}|${c.lease_id}`));
  const open=x.journal.filter(c=>c.op==="lease.claimed"&&c.scope==="doctor-who"&&time(c.at,"fixture claim")>time(REVIEW,"review")&&!receiptKeys.has(`doctor-who|${c.lease_id}`));
  const ids=new Set(open.map(c=>c.id)), tasks=new Set(open.map(c=>c.task_id));x.journal=x.journal.filter(c=>!ids.has(c.id));
  for(const j of x.jobs.filter(j=>tasks.has(j.id))){j.status="queued";j.role_on_wall=false;j.wall_ids=[];delete j.lease;delete j.outcome;delete j.next_retry_at}return x;
}
function validateReceipts(){
  const v1=read(RECEIPT_V1), b1=clone(v1);delete b1.receipt_sha256;ok(v1.transaction==="DOCTOR-WHO-CYCLE-008-COMPOSABILITY-001"&&v1.receipt_sha256===sha(pretty(b1)),"composability-v1 receipt changed");
  ok(v1.base_main===FLOOR&&v1.original?.receipt_git_blob===ORIGINAL_RECEIPT_BLOB&&v1.original?.checker_git_blob===ORIGINAL_CHECKER_BLOB&&v1.qualification?.checker_sha256===V1_CHECKER_SHA,"composability-v1 custody changed");
  const v2=read(RECEIPT_V2), b2=clone(v2);delete b2.receipt_sha256;ok(v2.transaction==="DOCTOR-WHO-CYCLE-008-COMPOSABILITY-002"&&v2.version===2&&v2.receipt_sha256===sha(pretty(b2)),"composability-v2 receipt changed");
  ok(v2.base_main==="2a29ca99a3cd1a455cd20ce6195076162c918edc"&&v2.prior?.canonical_commit===V1_MAIN&&v2.prior?.receipt_git_blob===V1_RECEIPT_BLOB&&v2.prior?.checker_git_blob===V1_CHECKER_BLOB&&v2.qualification?.checker_sha256===V2_CHECKER_SHA,"composability-v2 custody changed");
  same(v2.boundary?.later_active_states,["leased","drafted","merged"],"composability-v2 active-state denominator");
  const v3=read(RECEIPT_V3), b3=clone(v3);delete b3.receipt_sha256;ok(v3.transaction==="DOCTOR-WHO-CYCLE-008-COMPOSABILITY-003"&&v3.version===3&&v3.receipt_sha256===sha(pretty(b3)),"composability-v3 receipt changed");
  ok(v3.base_main===V2_MAIN&&v3.prior?.canonical_commit===V2_MAIN&&v3.prior?.receipt_git_blob===V2_RECEIPT_BLOB&&v3.prior?.checker_git_blob===V2_CHECKER_BLOB&&v3.prior?.receipt_file_sha256===V2_RECEIPT_SHA&&v3.prior?.checker_sha256===V2_CHECKER_SHA,"composability-v3 prior custody changed");
  ok(v3.qualification?.checker_sha256===sha(fs.readFileSync("scripts/doctor-who-cycle-008.mjs")),"composability-v3 checker binding changed");
  same(v3.boundary?.later_pending_states,["leased","drafted","merged","resolved"],"composability-v3 pending-state denominator");
  ok(v3.boundary?.later_cycles_allowed===true&&v3.boundary?.maximum_unreceipted_tasks===1&&v3.boundary?.resolved_pending_requires_audited_wall===true&&v3.boundary?.cycle_009_lease_issued===false&&v3.boundary?.outside_human_dependency===false,"composability-v3 authority changed");
}

immutable();validateReceipts();
const current={jobs:read("data/AUTOPILOT.json").jobs,journal:jsonl("data/journal/autopilot.jsonl"),cycles:read("data/WATERLINE-STATE.json").cycles};validate(current);
const base=fixtureTerminal(current);validate(base);
for(const step of [a=>a,a=>draft(a),a=>merge(a),a=>resolve(a)]){const x=clone(base);step(activate(x));validate(x)}
const two=clone(base);activate(two);activate(two,1,"lease_second","2026-08-08T02:05:00.000Z");fail("two active",()=>validate(two),/more than one later/);
const twoResolved=clone(base);resolve(activate(twoResolved));resolve(activate(twoResolved,1,"lease_second","2026-08-08T02:05:00.000Z"),"2026-08-08T02:08:00.000Z");fail("two resolved pending",()=>validate(twoResolved),/more than one later Doctor Who task is unreceipted/);
const orphan=clone(base), oj=orphan.jobs.find(j=>j.scope==="doctor-who"&&j.status==="queued");orphan.journal.push(claim(oj,"lease_orphan","2026-08-08T02:10:00.000Z"));fail("orphan",()=>validate(orphan),/unsupported status|receipt boundary/);
const noClaim=clone(base), nj=noClaim.jobs.find(j=>j.scope==="doctor-who"&&j.status==="queued");nj.status="leased";nj.lease={id:"lease_missing"};fail("active without claim",()=>validate(noClaim),/receipt boundary/);
const reopened=clone(base);reopened.jobs.find(j=>j.id===TASK).status="queued";fail("Kreg reopen",()=>validate(reopened),/Kreg task/);
const denom=clone(base);denom.jobs=denom.jobs.filter(j=>j.id!==TASK);fail("denominator",()=>validate(denom),/denominator/);
const dup=clone(base);dup.journal.push(clone(dup.journal.find(c=>c.op==="lease.claimed"&&c.lease_id===LEASE)));fail("duplicate",()=>validate(dup),/historical claim|claims more than one/);
const pre=clone(base), pj=pre.jobs.find(j=>j.scope==="doctor-who"&&j.status==="queued");pre.journal.push(claim(pj,"lease_pre","2026-08-07T20:41:59.000Z"));fail("pre-boundary",()=>validate(pre),/historical claim/);
const retained=clone(base), rd=draft(activate(retained));rd.j.lease={id:rd.c.lease_id};fail("draft retained lease",()=>validate(retained),/retained lease custody/);
const wrongDraft=clone(base), wd=draft(activate(wrongDraft));wd.j.outcome.lease_id="wrong";fail("draft wrong lease",()=>validate(wrongDraft),/does not match claim/);
const noWalls=clone(base), nw=merge(activate(noWalls));nw.j.wall_ids=[];nw.j.outcome.wall_ids=[];fail("merge no walls",()=>validate(noWalls),/no wall custody/);
const wrongWalls=clone(base), ww=merge(activate(wrongWalls));ww.j.outcome.wall_ids=["UC-OTHER"];fail("merge wrong walls",()=>validate(wrongWalls),/outcome wall custody/);
const early=clone(base), em=merge(activate(early));em.j.outcome.merged_at="2026-08-08T01:59:00.000Z";fail("merge chronology",()=>validate(early),/merge predates submission/);
const resolvedNoClaim=clone(base), rn=resolve(activate(resolvedNoClaim));resolvedNoClaim.journal=resolvedNoClaim.journal.filter(x=>x.id!==rn.c.id);fail("resolved without claim",()=>validate(resolvedNoClaim),/resolved task has no claim|receipt boundary/);
const resolvedLease=clone(base), rl=resolve(activate(resolvedLease));rl.j.lease={id:rl.c.lease_id};fail("resolved retained lease",()=>validate(resolvedLease),/retained lease custody/);
const resolvedWrong=clone(base), rw=resolve(activate(resolvedWrong));rw.j.outcome.media_review.lease_id="wrong";rw.j.outcome.review_sha256=sha(JSON.stringify(rw.j.outcome.media_review));fail("resolved wrong lease",()=>validate(resolvedWrong),/does not match claim lease/);
const resolvedHash=clone(base), rh=resolve(activate(resolvedHash));rh.j.outcome.review_sha256="0".repeat(64);fail("resolved hash",()=>validate(resolvedHash),/review hash changed/);
const resolvedWall=clone(base), rwall=resolve(activate(resolvedWall));rwall.j.outcome.media_review.records[0].wall_id="UC-OTHER";rwall.j.outcome.review_sha256=sha(JSON.stringify(rwall.j.outcome.media_review));fail("resolved wall",()=>validate(resolvedWall),/wall IDs changed/);
const resolvedTime=clone(base), rt=resolve(activate(resolvedTime));rt.j.outcome.resolved_at=rt.j.outcome.media_review.reviewed_at="2026-08-08T01:59:00.000Z";rt.j.outcome.review_sha256=sha(JSON.stringify(rt.j.outcome.media_review));fail("resolved chronology",()=>validate(resolvedTime),/chronology changed/);
console.log("doctor-who-cycle-008: PASS — immutable Kreg, composability-v1, and composability-v2 custody are preserved; one later Doctor Who task is composable across leased, drafted, merged, or audited resolved-pending custody; adversarial transition, receipt, media-review, reopen, denominator, duplicate, orphan, pre-boundary, and multi-pending fixtures are refused");
