#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const REVIEW="data/review/species-eligibility/tellarites-2026-07-25.json";
const RECEIPT="data/review/ferengi-gold/dal-rel-tellarite-exclusion-2026-07-25.json";
const TASK_ID="ap_ef68ddaea0eef666ab0d8a05";
const SOURCE="https://memory-alpha.fandom.com/wiki/Dal_R'El";
const REASON="The exact retained source identifies Dal R'El as a hybrid Human Augment. Kate Mulgrew is credited only for Dal while he occupied Kathryn Janeway's body; dormant Tellarite genes and category membership do not make this a displayed Tellarite designed-face performance.";
const norm=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").replace(/[^a-zA-Z0-9']+/g," ").trim().toLowerCase();
const sha256=value=>createHash("sha256").update(value).digest("hex");
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));
const writeJson=async(path,value,space=1)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,space)+"\n");};
const key=row=>[row.franchise,row.category,row.character,row.performer].map(norm).join("|");
const TARGET=key({franchise:"Star Trek",category:"Tellarites",character:"Dal R'El",performer:"Kate Mulgrew"});

const [approval,exclusions,state]=await Promise.all([readJson(REVIEW),readJson("data/CENSUS-EXCLUSIONS.json"),readJson("data/AUTOPILOT.json")]);
const approved=(approval.tasks||[]).find(row=>row.task_id===TASK_ID);
if(!approved||approved.decision!=="excluded-category")throw new Error(`${TASK_ID} is not an approved category exclusion`);
const expected={url:SOURCE,pageid:273380,revision:3484683,content_sha256:"b8a655090f9cfb34eb5e2f9b9f1bd51b8e364f7c9cf2eee48291b87b318bbbe5"};
for(const [field,value] of Object.entries(expected))if(approved.source?.[field]!==value)throw new Error(`${TASK_ID} approval source drift at ${field}`);
if(approved.source_fingerprint!=="e24b57c423583be4c7f20e5f8e5d7f14468efe18265b1122d982da3354680317")throw new Error(`${TASK_ID} approval fingerprint drift`);
const job=(state.jobs||[]).find(row=>row.id===TASK_ID);
if(!job||norm(job.performer)!=="kate mulgrew"||norm(job.character)!=="dal r'el")throw new Error(`${TASK_ID} durable identity drift`);
if(job.source_fingerprint!==approved.source_fingerprint)throw new Error(`${TASK_ID} durable source fingerprint drift`);
const receipt=(job.source_receipts||[]).find(row=>row.source===SOURCE&&Number(row.revision)===expected.revision&&row.content_sha256===expected.content_sha256);
if(!receipt)throw new Error(`${TASK_ID} lacks the exact retained source receipt`);

const rows=Array.isArray(exclusions)?exclusions:exclusions.records;
if(!rows.some(row=>key(row)===TARGET))rows.push({franchise:"Star Trek",category:"Tellarites",character:"Dal R'El",performer:"Kate Mulgrew",reason:REASON,source:SOURCE});
rows.sort((a,b)=>key(a).localeCompare(key(b)));
const now=new Date().toISOString();
job.status="rejected";
job.performer_on_wall=false;
job.role_on_wall=false;
job.wall_ids=[];
job.outcome={kind:"reviewed-category-exclusion",decided_at:approval.reviewed_at||now,decided_by:approval.reviewed_by||"chatgpt-second-desk",reason:REASON,source:SOURCE,source_fingerprint:job.source_fingerprint,approval_path:REVIEW};
delete job.lease;delete job.next_retry_at;
await Promise.all([writeJson("data/CENSUS-EXCLUSIONS.json",exclusions,1),writeJson("data/AUTOPILOT.json",state,2),writeJson(RECEIPT,{version:1,scope:"star-trek",species:"Tellarite",task_id:TASK_ID,disposition:"excluded-category",decided_at:approval.reviewed_at,decided_by:approval.reviewed_by,reason:REASON,source:approved.source,source_fingerprint:approved.source_fingerprint,audit_workflow_run:approval.audit_workflow_run,audit_artifact_sha256:approval.audit_artifact_sha256},2)]);
const journalPath="data/journal/autopilot.jsonl";
const body={version:1,op:"task.rejected",task_id:TASK_ID,at:now,scope:"star-trek",performer:"Kate Mulgrew",character:"Dal R'El",reason:"reviewed_category_exclusion",source:SOURCE,source_revision:expected.revision,source_content_sha256:expected.content_sha256,approval_path:REVIEW};
const id=`apj_${sha256(JSON.stringify(body)).slice(0,24)}`;
let journal=await readFile(journalPath,"utf8");
if(!journal.includes(`\"id\":\"${id}\"`))await writeFile(journalPath,journal.replace(/\s*$/,"\n")+JSON.stringify({id,...body})+"\n");
console.log(`bound ${TASK_ID} to the retained Tellarite category exclusion`);
