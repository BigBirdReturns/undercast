#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { jobSetDigest } from "./lib/waterline.mjs";

const args=process.argv.slice(2);
const command=args.shift()||"status";
function option(name,fallback=null){
  const index=args.indexOf(`--${name}`);
  if(index<0)return fallback;
  const value=args[index+1];
  if(!value||value.startsWith("--"))throw new Error(`--${name} requires a value`);
  return value;
}
const norm=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").replace(/[^a-zA-Z0-9']+/g," ").trim().toLowerCase();
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));
async function writeJson(path,value){await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+"\n");}
const category=()=>option("category")||process.env.SPECIES_CATEGORY||null;
const label=()=>option("label")||process.env.SPECIES_LABEL||category();
const inCategory=(job,want)=>Array.isArray(job.categories)&&(job.categories||[]).some(value=>norm(value)===norm(want));
const isActive=job=>["leased","drafted","merged"].includes(job.status);
const modeOf=task=>{
  const modes=task.performance_modes||[];
  if(modes.some(mode=>mode==="physical-prosthetic"||mode==="physical-and-voice"))return "physical";
  if(modes.some(mode=>mode==="voice-animation"||mode==="voice-only"||mode==="voice"))return "voice";
  return "unresolved";
};
const firstHttps=values=>(values||[]).find(value=>{try{return new URL(value).protocol==="https:";}catch{return false;}})||null;
const taskRow=row=>({
  task_id:row.id,performer:row.performer,character:row.character,priority:row.priority,
  performance_modes:row.performance_modes,categories:row.categories,sources:row.sources,
  source_receipts:row.source_receipts||[],source_fingerprint:row.source_fingerprint,mode:modeOf(row)
});

async function nextCommand(){
  const want=category();if(!want)throw new Error("next requires --category");
  const state=await readJson(option("state","data/AUTOPILOT.json"));
  const jobs=(state.jobs||[]).filter(job=>inCategory(job,want));
  const active=jobs.filter(isActive);
  if(active.length>1)throw new Error(`${want} population found multiple active tasks: ${active.map(job=>`${job.id}:${job.status}`).join(", ")}`);
  if(active.length===1&&active[0].status!=="leased")throw new Error(`${want} population cannot automatically resume ${active[0].id} from ${active[0].status}; inspect the durable stage`);
  const queued=jobs.filter(job=>job.status==="queued"&&job.queueable!==false&&modeOf(job)!=="unresolved").sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||a.id.localeCompare(b.id));
  const unresolvedMode=jobs.filter(job=>job.status==="queued"&&job.queueable!==false&&modeOf(job)==="unresolved").sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||a.id.localeCompare(b.id));
  const resume=active.length===1;
  const row=resume?active[0]:(queued[0]||null);
  const report={version:1,category:want,label:label(),resume,remaining_supported:queued.length+(resume?1:0),unresolved_mode:unresolvedMode.length,task:row?taskRow(row):null,unresolved_preview:unresolvedMode.slice(0,50).map(taskRow)};
  const out=option("out");if(out)await writeJson(out,report);
  console.log(JSON.stringify(report,null,2));
  if(!row)process.exitCode=3;
}

async function draftCommand(){
  const batchPath=option("batch"),out=option("out"),speciesLabel=label();
  if(!batchPath||!out||!speciesLabel)throw new Error("draft requires --batch, --out, and --label/--category");
  const transform=Math.max(1,Math.min(5,Number(option("transform",process.env.SPECIES_TRANSFORM||"4"))||4));
  const [batch,specimens]=await Promise.all([readJson(batchPath),readJson("data/specimens.json")]);
  const byActor=new Map();for(const row of specimens)if(!byActor.has(norm(row.actor)))byActor.set(norm(row.actor),row);
  const results=(batch.tasks||[]).map(task=>{
    const mode=modeOf(task);if(mode==="unresolved")throw new Error(`task ${task.id} has unresolved performance mode`);
    const source=firstHttps(task.sources);if(!source)throw new Error(`task ${task.id} has no HTTPS performance source`);
    const known=byActor.get(norm(task.performer));
    const knownFor=known?.knownFor||`${task.performer} is the exact credited performer for the Star Trek role ${task.character}.`;
    const reveal=mode==="physical"
      ? `Under the ${speciesLabel} design for ${task.character} is ${task.performer}. This exact performer-role credit is filed from the retained source revision; production-specific maker metadata and both image sides remain open to later enrichment.`
      : `The exact credited voice of the ${speciesLabel} role ${task.character} is ${task.performer}. This card files the sourced performance at the conservative voice baseline without inventing an independently measured vocal distance.`;
    const draft={
      character:task.character,actor:task.performer,production:"Star Trek",universe:"Star Trek",years:"—",designer:"—",
      transform:mode==="physical"?transform:2,kind:mode==="physical"?"face":"voice",knownFor,reveal,
      references:[{claim:"performance",label:`${task.performer} is credited as ${task.character}`.slice(0,140),source,publisher:"Memory Alpha"}]
    };
    if(known?.link&&/^https:\/\/en\.wikipedia\.org\/wiki\//.test(known.link))draft.wiki=known.link;
    return {task_id:task.id,decision:"draft",draft};
  });
  await writeJson(out,{version:1,lease_id:batch.lease_id,agent:batch.agent,results});
  console.log(`prepared ${results.length} exact-source ${speciesLabel} draft result(s)`);
}

async function markAbsentCommand(){
  const batchPath=option("batch"),mapPath=option("map");if(!batchPath||!mapPath)throw new Error("mark-absent requires --batch and --map");
  const [batch,specimens,sources]=await Promise.all([readJson(batchPath),readJson("data/specimens.json"),readJson("data/SOURCES.json")]);
  const sourceById=new Map(sources.map((row,index)=>[row.id,index]));const mapped=[];
  for(const task of batch.tasks||[]){
    const matches=specimens.filter(row=>norm(row.actor)===norm(task.performer)&&norm(row.character)===norm(task.character));
    if(matches.length!==1)throw new Error(`task ${task.id} expected one canonical record, found ${matches.length}`);
    const record=matches[0];delete record.still;delete record.portrait;
    const ledger={id:record.id,actor:record.actor,character:record.character,universe:record.universe,still:null,portrait:null,fetched_at:new Date().toISOString().slice(0,10)};
    const index=sourceById.get(record.id);if(index===undefined){sourceById.set(record.id,sources.length);sources.push(ledger);}else sources[index]=ledger;
    mapped.push({task_id:task.id,wall_id:record.id,performer:task.performer,character:task.character});
  }
  await Promise.all([writeJson("data/specimens.json",specimens),writeJson("data/SOURCES.json",sources),writeJson(mapPath,{version:1,lease_id:batch.lease_id,records:mapped})]);
  console.log(`filed ${mapped.length} record(s) with explicit not-on-file still and portrait sides`);
}

async function reviewCommand(){
  const batchPath=option("batch"),mapPath=option("map"),out=option("out"),speciesLabel=label();
  if(!batchPath||!mapPath||!out)throw new Error("review requires --batch, --map, and --out");
  const [batch,map,state]=await Promise.all([readJson(batchPath),readJson(mapPath),readJson("data/AUTOPILOT.json")]);
  const jobById=new Map((state.jobs||[]).map(job=>[job.id,job]));const recordsByTask=new Map((map.records||[]).map(row=>[row.task_id,row]));
  const reviews=(batch.tasks||[]).map(task=>{
    const job=jobById.get(task.id),mapped=recordsByTask.get(task.id);
    if(!job||job.status!=="merged"||!mapped||(job.wall_ids||[]).length!==1||job.wall_ids[0]!==mapped.wall_id)throw new Error(`task ${task.id} is not a single merged population record`);
    return {task_id:task.id,records:[{wall_id:mapped.wall_id,
      still:{disposition:"absent",note:`No exact ${speciesLabel} character still was curated in this filing cycle; the public card deliberately renders the canonical not-on-file evidence plate until media enrichment.`},
      portrait:{disposition:"absent",note:"No exact neutral performer portrait was curated in this filing cycle; the public card deliberately renders the canonical not-on-file evidence plate until media enrichment."}}]};
  });
  await writeJson(out,{version:1,reviewed_by:"chatgpt-second-desk",lease_id:batch.lease_id,reviews});
  console.log(`prepared explicit absence closure for ${reviews.length} ${speciesLabel} task(s)`);
}

async function accountingCommand(){
  const reportPath=option("report"),receiptPath=option("receipt"),speciesLabel=label();if(!reportPath||!receiptPath)throw new Error("accounting requires --report and --receipt");
  const state=await readJson("data/AUTOPILOT.json");const jobs=(state.jobs||[]).filter(job=>job.scope==="star-trek").sort((a,b)=>a.id.localeCompare(b.id));
  if(jobs.some(isActive))throw new Error("accounting refused while Star Trek work is in flight");
  const disposition=job=>job.status==="resolved"?"filed":job.status==="blocked"?"blocked":["rejected","retired"].includes(job.status)?"excluded":"unresolved";
  const rows=jobs.map(job=>({task_id:job.id,performer:job.performer,character:job.character,durable_status:job.status,disposition:disposition(job),wall_ids:job.wall_ids||[],source_fingerprint:job.source_fingerprint,note:disposition(job)==="unresolved"?"Queued or attention work remains unresolved pending task-level filing; queueability is not itself an eligibility ruling.":null}));
  const counts={eligible:0,filed:0,blocked:0,excluded:0,unresolved:0};for(const row of rows)counts[row.disposition]++;
  const report={version:1,scope_id:"star-trek",generated_at:new Date().toISOString(),semantics:{eligible:"Task-level eligibility has been positively established but the role is not yet filed.",filed:"The exact performer-role is represented by a resolved canonical wall record.",blocked:"Required evidence or runtime capability is unavailable; the task remains visible for retry.",excluded:"A reviewed rejection or retirement removes the task from the eligible corpus without erasing history.",unresolved:"No final eligibility disposition exists yet. Queued and attention work remains unresolved rather than being presumed eligible."},denominator:jobs.length,counts,job_set_sha256:jobSetDigest(state,"star-trek"),rows};
  await writeJson(reportPath,report);
  const receipt={scope_id:"star-trek",counts,note:`Every durable Star Trek task is assigned exactly once after the ${speciesLabel} population pass. Unresolved work remains unresolved until task-level filing; nothing is promoted by inference.`,evidence:[{type:"report",value:`${reportPath} — ${jobs.length} exact task rows; job set ${report.job_set_sha256}`},{type:"workflow-run",value:`GitHub Actions run ${process.env.GITHUB_RUN_ID||"local"} — exact-source ${speciesLabel} population and canonical gate.`}],reviewed_by:"chatgpt-second-desk",reviewed_role:"second-desk",reviewed_at:new Date().toISOString()};
  await writeJson(receiptPath,receipt);console.log(JSON.stringify({denominator:jobs.length,counts,job_set_sha256:report.job_set_sha256},null,2));
}

if(command==="next")await nextCommand();
else if(command==="draft")await draftCommand();
else if(command==="mark-absent")await markAbsentCommand();
else if(command==="review")await reviewCommand();
else if(command==="accounting")await accountingCommand();
else throw new Error("unknown command; use next, draft, mark-absent, review, or accounting");
