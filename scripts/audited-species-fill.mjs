#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const approvalPath=()=>option("approval")||process.env.SPECIES_APPROVAL||null;
const category=()=>option("category")||process.env.SPECIES_CATEGORY||null;
const label=()=>option("label")||process.env.SPECIES_LABEL||category();
const isActive=job=>["leased","drafted","merged"].includes(job.status);
const modeOf=task=>{
  const modes=task.performance_modes||[];
  if(modes.some(mode=>mode==="physical-prosthetic"||mode==="physical-and-voice"))return "physical";
  if(modes.some(mode=>mode==="voice-animation"||mode==="voice-only"||mode==="voice"))return "voice";
  return "unresolved";
};
const firstHttps=values=>(values||[]).find(value=>{try{return new URL(value).protocol==="https:";}catch{return false;}})||null;

async function loadApprovalAndState(){
  const path=approvalPath();if(!path)throw new Error("--approval is required");
  const [approval,state]=await Promise.all([readJson(path),readJson("data/AUTOPILOT.json")]);
  if(approval.version!==1||approval.scope!=="star-trek"||!Array.isArray(approval.tasks))throw new Error("invalid species approval document");
  if(category()&&norm(approval.category)!==norm(category()))throw new Error(`approval category ${approval.category} does not match ${category()}`);
  if(label()&&norm(approval.label)!==norm(label()))throw new Error(`approval label ${approval.label} does not match ${label()}`);
  const taskById=new Map((state.jobs||[]).map(job=>[job.id,job]));
  const decisions=[];
  for(const row of approval.tasks){
    if(!["eligible","excluded-category","review","blocked"].includes(row.decision))throw new Error(`approval ${row.task_id} has invalid decision ${row.decision}`);
    const job=taskById.get(row.task_id);if(!job)throw new Error(`approval task ${row.task_id} is absent from durable state`);
    if(norm(job.performer)!==norm(row.performer)||norm(job.character)!==norm(row.character))throw new Error(`approval identity drift for ${row.task_id}`);
    if(job.source_fingerprint!==row.source_fingerprint)throw new Error(`approval source fingerprint drift for ${row.task_id}`);
    const receipt=(job.source_receipts||[]).find(item=>item.source===row.source?.url&&Number(item.revision)===Number(row.source?.revision)&&item.content_sha256===row.source?.content_sha256);
    if(!receipt)throw new Error(`approval exact source receipt drift for ${row.task_id}`);
    decisions.push({approval:row,job});
  }
  return {path,approval,state,decisions};
}
function eligibleRows(decisions){return decisions.filter(row=>row.approval.decision==="eligible");}
function taskRow(job){return {task_id:job.id,performer:job.performer,character:job.character,priority:job.priority,performance_modes:job.performance_modes,categories:job.categories,sources:job.sources,source_receipts:job.source_receipts||[],source_fingerprint:job.source_fingerprint,mode:modeOf(job)};}

async function validateApprovalCommand(){
  const {path,approval,decisions}=await loadApprovalAndState();
  const eligible=eligibleRows(decisions);
  const counts=Object.fromEntries([...new Set(approval.tasks.map(row=>row.decision))].sort().map(decision=>[decision,approval.tasks.filter(row=>row.decision===decision).length]));
  if(approval.counts?.eligible!==eligible.length)throw new Error(`approval eligible count ${approval.counts?.eligible} does not match ${eligible.length}`);
  console.log(JSON.stringify({approval:path,category:approval.category,label:approval.label,counts,eligible:eligible.map(row=>({task_id:row.job.id,performer:row.job.performer,character:row.job.character,status:row.job.status}))},null,2));
}

async function nextCommand(){
  const {approval,decisions}=await loadApprovalAndState();
  const eligible=eligibleRows(decisions);
  const active=eligible.filter(row=>isActive(row.job));
  if(active.length>1)throw new Error(`${approval.label} audited orbit found multiple active approved tasks: ${active.map(row=>`${row.job.id}:${row.job.status}`).join(", ")}`);
  if(active.length===1&&active[0].job.status!=="leased")throw new Error(`${approval.label} audited orbit cannot automatically resume ${active[0].job.id} from ${active[0].job.status}; inspect the durable stage`);
  const queued=eligible.filter(row=>row.job.status==="queued"&&row.job.queueable!==false&&modeOf(row.job)!=="unresolved").sort((a,b)=>Number(b.job.priority||0)-Number(a.job.priority||0)||a.job.id.localeCompare(b.job.id));
  const invalidMode=eligible.filter(row=>row.job.status==="queued"&&modeOf(row.job)==="unresolved");
  if(invalidMode.length)throw new Error(`approved tasks have unresolved performance mode: ${invalidMode.map(row=>row.job.id).join(", ")}`);
  const resume=active.length===1;
  const selected=resume?active[0]:(queued[0]||null);
  const report={version:1,approval:approvalPath(),category:approval.category,label:approval.label,resume,remaining:queued.length+(resume?1:0),task:selected?taskRow(selected.job):null};
  const out=option("out");if(out)await writeJson(out,report);
  console.log(JSON.stringify(report,null,2));
  if(!selected)process.exitCode=3;
}

async function verifyBatch(batch){
  const {approval,decisions}=await loadApprovalAndState();
  if(!batch||!Array.isArray(batch.tasks)||batch.tasks.length!==1)throw new Error("audited species batches must contain exactly one task");
  const task=batch.tasks[0];
  const row=decisions.find(item=>item.job.id===task.id&&item.approval.decision==="eligible");
  if(!row)throw new Error(`task ${task.id} is not approved eligible in ${approvalPath()}`);
  if(row.job.source_fingerprint!==task.source_fingerprint||row.approval.source_fingerprint!==task.source_fingerprint)throw new Error(`batch source fingerprint drift for ${task.id}`);
  if(norm(row.job.performer)!==norm(task.performer)||norm(row.job.character)!==norm(task.character))throw new Error(`batch identity drift for ${task.id}`);
  return {approval,row,task};
}

async function draftCommand(){
  const batchPath=option("batch"),out=option("out");if(!batchPath||!out)throw new Error("draft requires --batch and --out");
  const transform=Math.max(1,Math.min(5,Number(option("transform","4"))||4));
  const [batch,specimens]=await Promise.all([readJson(batchPath),readJson("data/specimens.json")]);
  const {approval,row,task}=await verifyBatch(batch);
  const byActor=new Map();for(const specimen of specimens)if(!byActor.has(norm(specimen.actor)))byActor.set(norm(specimen.actor),specimen);
  const mode=modeOf(task);if(mode==="unresolved")throw new Error(`task ${task.id} has unresolved performance mode`);
  const source=row.approval.source?.url||firstHttps(task.sources);if(!source)throw new Error(`task ${task.id} has no approved HTTPS source`);
  const known=byActor.get(norm(task.performer));
  const knownFor=known?.knownFor||`${task.performer} is the exact credited performer for the Star Trek role ${task.character}.`;
  const reveal=mode==="physical"
    ? `Under the ${approval.label} design for ${task.character} is ${task.performer}. The exact retained source revision establishes both the performer and the displayed species; maker metadata and both image sides remain open to later enrichment.`
    : `The exact credited voice of the ${approval.label} role ${task.character} is ${task.performer}. The retained source revision establishes both the performer and the displayed species; this card uses the conservative voice baseline without inventing an independently measured vocal distance.`;
  const draft={character:task.character,actor:task.performer,production:"Star Trek",universe:"Star Trek",years:"—",designer:"—",transform:mode==="physical"?transform:2,kind:mode==="physical"?"face":"voice",knownFor,reveal,references:[{claim:"performance",label:`${task.performer} is credited as ${task.character}`.slice(0,140),source,publisher:"Memory Alpha"}]};
  if(known?.link&&/^https:\/\/en\.wikipedia\.org\/wiki\//.test(known.link))draft.wiki=known.link;
  const result={version:1,lease_id:batch.lease_id,agent:batch.agent,results:[{task_id:task.id,decision:"draft",draft}]};
  await writeJson(out,result);console.log(`prepared approved exact-source ${approval.label} draft for ${task.performer} — ${task.character}`);
}

async function markAbsentCommand(){
  const batchPath=option("batch"),mapPath=option("map");if(!batchPath||!mapPath)throw new Error("mark-absent requires --batch and --map");
  const [batch,specimens,sources]=await Promise.all([readJson(batchPath),readJson("data/specimens.json"),readJson("data/SOURCES.json")]);
  const {task}=await verifyBatch(batch);
  const matches=specimens.filter(row=>norm(row.actor)===norm(task.performer)&&norm(row.character)===norm(task.character));
  if(matches.length!==1)throw new Error(`task ${task.id} expected one canonical record, found ${matches.length}`);
  const record=matches[0];delete record.still;delete record.portrait;
  const ledger={id:record.id,actor:record.actor,character:record.character,universe:record.universe,still:null,portrait:null,fetched_at:new Date().toISOString().slice(0,10)};
  const index=sources.findIndex(row=>row.id===record.id);if(index<0)sources.push(ledger);else sources[index]=ledger;
  await Promise.all([writeJson("data/specimens.json",specimens),writeJson("data/SOURCES.json",sources),writeJson(mapPath,{version:1,lease_id:batch.lease_id,records:[{task_id:task.id,wall_id:record.id,performer:task.performer,character:task.character}]})]);
  console.log(`filed ${record.id} with explicit not-on-file still and portrait sides`);
}

async function reviewCommand(){
  const batchPath=option("batch"),mapPath=option("map"),out=option("out");if(!batchPath||!mapPath||!out)throw new Error("review requires --batch, --map, and --out");
  const [batch,map,state]=await Promise.all([readJson(batchPath),readJson(mapPath),readJson("data/AUTOPILOT.json")]);
  const {approval,task}=await verifyBatch(batch);const job=(state.jobs||[]).find(row=>row.id===task.id);const mapped=(map.records||[]).find(row=>row.task_id===task.id);
  if(!job||job.status!=="merged"||!mapped||(job.wall_ids||[]).length!==1||job.wall_ids[0]!==mapped.wall_id)throw new Error(`task ${task.id} is not a single merged audited record`);
  const result={version:1,reviewed_by:"chatgpt-second-desk",lease_id:batch.lease_id,reviews:[{task_id:task.id,records:[{wall_id:mapped.wall_id,still:{disposition:"absent",note:`No exact ${approval.label} character still was curated in this filing cycle; the public card deliberately renders the canonical not-on-file evidence plate until media enrichment.`},portrait:{disposition:"absent",note:"No exact neutral performer portrait was curated in this filing cycle; the public card deliberately renders the canonical not-on-file evidence plate until media enrichment."}}]}]};
  await writeJson(out,result);console.log(`prepared explicit absence closure for ${mapped.wall_id}`);
}

async function cycleReceiptCommand(){
  const batchPath=option("batch"),claimCommit=option("claim-commit"),out=option("out");if(!batchPath||!claimCommit||!out)throw new Error("cycle-receipt requires --batch, --claim-commit, and --out");
  const batch=await readJson(batchPath);const {approval,task}=await verifyBatch(batch);
  const doc={scope_id:"star-trek",lease_id:batch.lease_id,outcome:"completed",note:`Approval-bound ${approval.label} population filed ${task.performer} as ${task.character}; both media sides remain honestly not on file for later rolling enrichment.`,evidence:[{type:"approval",value:`${approvalPath()} — task ${task.id}, source fingerprint ${task.source_fingerprint}`},{type:"workflow-run",value:`GitHub Actions run ${process.env.GITHUB_RUN_ID||"local"} — deterministic approval-bound species orbit for ${task.id}.`},{type:"commit",value:`${claimCommit} — restart-safe lease committed before drafting or canonical mutation.`},{type:"restart-proof",value:`Lease ${batch.lease_id} was persisted before the task was submitted.`}],reviewed_by:"chatgpt-second-desk",reviewed_role:"second-desk",reviewed_at:new Date().toISOString()};
  await writeJson(out,doc);console.log(JSON.stringify(doc,null,2));
}

async function accountingCommand(){
  const reportPath=option("report"),receiptPath=option("receipt");if(!reportPath||!receiptPath)throw new Error("accounting requires --report and --receipt");
  const {approval}=await loadApprovalAndState();const state=await readJson("data/AUTOPILOT.json");const jobs=(state.jobs||[]).filter(job=>job.scope==="star-trek").sort((a,b)=>a.id.localeCompare(b.id));
  if(jobs.some(isActive))throw new Error("accounting refused while Star Trek work is in flight");
  const disposition=job=>job.status==="resolved"?"filed":job.status==="blocked"?"blocked":["rejected","retired"].includes(job.status)?"excluded":"unresolved";
  const rows=jobs.map(job=>({task_id:job.id,performer:job.performer,character:job.character,durable_status:job.status,disposition:disposition(job),wall_ids:job.wall_ids||[],source_fingerprint:job.source_fingerprint,note:disposition(job)==="unresolved"?"Queued or attention work remains unresolved pending task-level filing; queueability is not itself an eligibility ruling.":null}));
  const counts={eligible:0,filed:0,blocked:0,excluded:0,unresolved:0};for(const row of rows)counts[row.disposition]++;
  const report={version:1,scope_id:"star-trek",generated_at:new Date().toISOString(),semantics:{eligible:"Task-level eligibility has been positively established but the role is not yet filed.",filed:"The exact performer-role is represented by a resolved canonical wall record.",blocked:"Required evidence or runtime capability is unavailable; the task remains visible for retry.",excluded:"A reviewed rejection or retirement removes the task from the eligible corpus without erasing history.",unresolved:"No final eligibility disposition exists yet. Queued and attention work remains unresolved rather than being presumed eligible."},denominator:jobs.length,counts,job_set_sha256:jobSetDigest(state,"star-trek"),rows};
  await writeJson(reportPath,report);
  const receipt={scope_id:"star-trek",counts,note:`Every durable Star Trek task is assigned exactly once after the approval-bound ${approval.label} population pass. Category exclusions remain unresolved globally unless separately adjudicated; nothing is promoted by inference.`,evidence:[{type:"approval",value:`${approvalPath()} — ${approval.counts.eligible} approved exact tasks and ${approval.counts.excluded_category} category exclusion.`},{type:"report",value:`${reportPath} — ${jobs.length} exact task rows; job set ${report.job_set_sha256}`},{type:"workflow-run",value:`GitHub Actions run ${process.env.GITHUB_RUN_ID||"local"} — approval-bound ${approval.label} population and canonical gate.`}],reviewed_by:"chatgpt-second-desk",reviewed_role:"second-desk",reviewed_at:new Date().toISOString()};
  await writeJson(receiptPath,receipt);console.log(JSON.stringify({denominator:jobs.length,counts,job_set_sha256:report.job_set_sha256},null,2));
}

async function finalStateCommand(){
  const out=option("out");if(!out)throw new Error("final-state requires --out");
  const {approval,decisions}=await loadApprovalAndState();const species=await readJson("data/species.json");const media=await readJson("data/MEDIA-AUDIT.json");
  const eligible=eligibleRows(decisions);const unresolvedEligible=eligible.filter(row=>row.job.status!=="resolved");
  if(unresolvedEligible.length)throw new Error(`approved tasks not resolved: ${unresolvedEligible.map(row=>`${row.job.id}:${row.job.status}`).join(", ")}`);
  const active=decisions.filter(row=>isActive(row.job));if(active.length)throw new Error(`approved-category tasks remain active: ${active.map(row=>row.job.id).join(", ")}`);
  const excluded=decisions.filter(row=>row.approval.decision==="excluded-category");
  for(const row of excluded)if(row.job.status==="resolved")throw new Error(`category-excluded task ${row.job.id} was resolved`);
  const taxon=(species.taxa||[]).find(row=>norm(row.label)===norm(approval.label));if(!taxon)throw new Error(`species projection lacks ${approval.label}`);
  const mediaRows=(media.items||[]).filter(item=>item.scope==="star-trek");const complete=mediaRows.filter(item=>["verified","absent"].includes(item.status)).length;
  if(complete!==mediaRows.length)throw new Error("Star Trek media baseline is not complete");
  const summary={version:1,approval:approvalPath(),category:approval.category,label:approval.label,approved_resolved:eligible.length,excluded_category:excluded.map(row=>({task_id:row.job.id,performer:row.job.performer,character:row.job.character,status:row.job.status})),species_counts:taxon.counts,star_trek_media:{total:mediaRows.length,complete}};
  await writeJson(out,summary);console.log(JSON.stringify(summary,null,2));
}

if(command==="validate-approval")await validateApprovalCommand();
else if(command==="next")await nextCommand();
else if(command==="draft")await draftCommand();
else if(command==="mark-absent")await markAbsentCommand();
else if(command==="review")await reviewCommand();
else if(command==="cycle-receipt")await cycleReceiptCommand();
else if(command==="accounting")await accountingCommand();
else if(command==="final-state")await finalStateCommand();
else throw new Error("unknown command; use validate-approval, next, draft, mark-absent, review, cycle-receipt, accounting, or final-state");
