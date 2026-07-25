#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const args=process.argv.slice(2);
const option=(name,fallback=null)=>{
  const index=args.indexOf(`--${name}`);
  if(index<0)return fallback;
  const value=args[index+1];
  if(!value||value.startsWith("--"))throw new Error(`--${name} requires a value`);
  return value;
};
const category=option("category");
const label=option("label",category);
const out=option("out");
const includeResolved=args.includes("--include-resolved");
const limit=Number(option("limit","500"));
if(!category||!label||!out)throw new Error("usage: node scripts/species-eligibility-audit.mjs --category <source category> --label <singular label> --out <report.json>");
if(!Number.isInteger(limit)||limit<1||limit>5000)throw new Error("--limit must be 1..5000");

const sha256=value=>createHash("sha256").update(value).digest("hex");
const norm=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").replace(/[^a-zA-Z0-9']+/g," ").trim().toLowerCase();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const USER_AGENT=`undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT||"species-eligibility-audit"})`;
const state=JSON.parse(await readFile("data/AUTOPILOT.json","utf8"));
const jobs=(state.jobs||[]).filter(job=>job.scope==="star-trek"
  &&(job.categories||[]).some(value=>norm(value)===norm(category))
  &&(includeResolved||job.status!=="resolved"))
  .sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||a.id.localeCompare(b.id))
  .slice(0,limit);

function apiFor(source){
  const url=new URL(source);
  return /(^|\.)fandom\.com$/i.test(url.hostname)
    ? `${url.protocol}//${url.hostname}/api.php`
    : `${url.protocol}//${url.hostname}/w/api.php`;
}
function revisionContent(revision){
  return revision?.slots?.main?.content??revision?.slots?.main?.["*"]??revision?.["*"]??revision?.content??null;
}
async function fetchExact(receipt){
  const api=apiFor(receipt.source);
  const params=new URLSearchParams({
    action:"query",format:"json",formatversion:"2",origin:"*",prop:"revisions",
    revids:String(receipt.revision),rvprop:"ids|timestamp|content",rvslots:"main"
  });
  let last;
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const response=await fetch(`${api}?${params}`,{headers:{"User-Agent":USER_AGENT,Accept:"application/json"},signal:AbortSignal.timeout(45000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const json=await response.json();
      if(json?.error)throw new Error(`${json.error.code||"api"}: ${json.error.info||JSON.stringify(json.error)}`);
      const page=(json?.query?.pages||[])[0]||null;
      const revision=page?.revisions?.[0]||null;
      const content=revisionContent(revision);
      if(typeof content!=="string")throw new Error("revision content unavailable");
      const got=sha256(Buffer.from(content,"utf8"));
      if(got!==receipt.content_sha256)throw new Error(`content hash mismatch ${got}`);
      return {api,pageid:page.pageid??receipt.pageid,title:page.title||null,revision:revision.revid??receipt.revision,timestamp:revision.timestamp||receipt.timestamp,content,content_sha256:got};
    }catch(error){last=error;if(attempt<4)await sleep(attempt*1000);}
  }
  throw new Error(last?.message||String(last));
}
function stripWiki(value){
  return String(value||"")
    .replace(/<!--.*?-->/gs," ")
    .replace(/<ref\b[^>]*>.*?<\/ref>/gis," ")
    .replace(/<ref\b[^>]*\/>/gi," ")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,"$2")
    .replace(/\[\[([^\]]+)\]\]/g,"$1")
    .replace(/\{\{(?:dis|d|ma|mirror|prime|alternate|alt|nowrap|sortname)\|([^{}|]+)(?:\|[^{}]*)?\}\}/gi,"$1")
    .replace(/\{\{[^{}]*\}\}/g," ")
    .replace(/[{}]+/g," ")
    .replace(/'{2,}/g,"")
    .replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ").trim();
}
function infoboxFields(content){
  const fields=[];
  for(const line of content.split(/\r?\n/)){
    const match=line.match(/^\s*\|\s*([^=|]+?)\s*=\s*(.*?)\s*$/);
    if(match)fields.push({key:norm(match[1]),raw:match[2],plain:stripWiki(match[2])});
  }
  return fields;
}
const fieldValues=(fields,keys)=>fields.filter(field=>keys.includes(field.key)).map(field=>field.plain).filter(Boolean);
function evidenceLines(content,needles){
  const rows=[];
  const normalizedNeedles=needles.map(norm).filter(Boolean);
  for(const [index,line] of content.split(/\r?\n/).entries()){
    const plain=stripWiki(line);
    const n=norm(plain);
    if(plain&&normalizedNeedles.some(needle=>n.includes(needle)))rows.push({line:index+1,text:plain.slice(0,500)});
    if(rows.length>=12)break;
  }
  return rows;
}
function modeOf(job){
  const modes=job.performance_modes||[];
  if(modes.some(mode=>mode==="physical-prosthetic"||mode==="physical-and-voice"))return "physical";
  if(modes.some(mode=>mode==="voice-animation"||mode==="voice-only"||mode==="voice"))return "voice";
  return "unresolved";
}
function actorTokens(value){
  return String(value||"").split(/\s*(?:<br\s*\/?>|;|\n|\band\b|\/)\s*/i).map(stripWiki).map(norm).filter(Boolean);
}
function classify(job,revision){
  const fields=infoboxFields(revision.content);
  const actorFields=fieldValues(fields,["actor","actors","played by","played_by","portrayed by","portrayed_by","performer","performers","voice actor","voice_actor"]);
  const speciesFields=fieldValues(fields,["species","race"]);
  const performer=norm(job.performer),target=norm(label);
  const actorList=actorFields.flatMap(actorTokens);
  const performerInActorField=actorList.some(value=>value===performer||value.includes(performer)||performer.includes(value));
  const firstChunk=stripWiki(revision.content.slice(0,12000));
  const firstNorm=norm(firstChunk);
  const performerSentence=new RegExp(`(?:played|portrayed|voiced|performed) by[^.]{0,160}${performer.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}`,"i").test(firstNorm);
  const speciesNorm=speciesFields.map(norm);
  const speciesExact=speciesNorm.some(value=>value===target||value.startsWith(`${target} `)||value.endsWith(` ${target}`));
  const speciesContains=speciesNorm.some(value=>value.includes(target));
  const leadSpecies=new RegExp(`\\b(?:was|is) (?:an? |the )?[^.]{0,100}\\b${target.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`,"i").test(firstNorm.slice(0,2500));
  const ambiguityPatterns=[
    ["body-swap",/\bin [^.;]{0,80} body\b|body swap|mind swap|consciousness transfer/i],
    ["genetic-trait-only",/genetic trait|recessive gene|dna (?:sample|blend)|hybrid speciation|dormant gene/i],
    ["disguise-or-impersonation",/disguised as|impersonat|masquerad|assumed the appearance/i],
    ["hologram-or-illusion",/hologram|holo-duplicate|illusion|simulation/i],
    ["possession",/possess(?:ed|ion)|inhabited the body/i],
  ];
  const creditedContext=`${actorFields.join(" ")} ${firstChunk.slice(0,2500)}`;
  const signals=ambiguityPatterns.filter(([,pattern])=>pattern.test(creditedContext)).map(([name])=>name);
  const multiplePerformers=actorList.length>1;
  const mode=modeOf(job);
  const reasons=[];
  let disposition="review";
  if(mode==="unresolved")reasons.push("performance mode is unresolved");
  if(!performerInActorField&&!performerSentence)reasons.push("exact performer is not established in the actor field or a direct performance sentence");
  if(speciesFields.length&& !speciesContains)reasons.push(`explicit species field does not identify ${label}: ${speciesFields.join(" | ")}`);
  if(!speciesFields.length&&!leadSpecies)reasons.push(`no explicit ${label} species assertion was found`);
  if(multiplePerformers)reasons.push(`source credits multiple performers: ${actorFields.join(" | ")}`);
  if(signals.length)reasons.push(`credit-context ambiguity signals: ${signals.join(", ")}`);

  if(speciesFields.length&&!speciesContains)disposition="excluded-category";
  else if(mode!=="unresolved"&&(performerInActorField||performerSentence)&&(speciesExact||(!speciesFields.length&&leadSpecies))&&!multiplePerformers&&!signals.length)disposition="eligible";
  else disposition="review";

  return {
    disposition,reasons,mode,
    performer_evidence:{actor_fields:actorFields,actor_tokens:actorList,performer_in_actor_field:performerInActorField,direct_sentence:performerSentence},
    species_evidence:{species_fields:speciesFields,exact:speciesExact,contains:speciesContains,lead_sentence:leadSpecies,target:label},
    ambiguity_signals:signals,
    evidence_lines:evidenceLines(revision.content,[job.performer,job.character,label,"played by","actor","species"])
  };
}

const results=[];
for(const [index,job] of jobs.entries()){
  const receipts=(job.source_receipts||[]).filter(receipt=>receipt?.source&&receipt?.revision&&receipt?.content_sha256);
  const receipt=receipts.find(row=>(job.sources||[]).includes(row.source))||receipts[0]||null;
  if(!receipt){
    results.push({task_id:job.id,source_fingerprint:job.source_fingerprint,performer:job.performer,character:job.character,status:job.status,priority:job.priority,disposition:"blocked",reasons:["no exact source receipt"],source:null});
    continue;
  }
  try{
    const revision=await fetchExact(receipt);
    const decision=classify(job,revision);
    results.push({
      task_id:job.id,source_fingerprint:job.source_fingerprint,performer:job.performer,character:job.character,status:job.status,priority:job.priority,
      categories:job.categories,performance_modes:job.performance_modes,source:{url:receipt.source,pageid:revision.pageid,title:revision.title,revision:revision.revision,timestamp:revision.timestamp,content_sha256:revision.content_sha256},
      ...decision
    });
  }catch(error){
    results.push({task_id:job.id,source_fingerprint:job.source_fingerprint,performer:job.performer,character:job.character,status:job.status,priority:job.priority,categories:job.categories,performance_modes:job.performance_modes,source:{url:receipt.source,pageid:receipt.pageid,revision:receipt.revision,timestamp:receipt.timestamp,content_sha256:receipt.content_sha256},disposition:"blocked",reasons:[error.message]});
  }
  if(index<jobs.length-1)await sleep(350);
}
const counts=Object.fromEntries([...new Set(results.map(row=>row.disposition))].sort().map(disposition=>[disposition,results.filter(row=>row.disposition===disposition).length]));
const report={
  version:1,generated_at:new Date().toISOString(),scope:"star-trek",category,label,
  semantics:{
    eligible:"The exact retained revision directly establishes the performer and explicitly identifies the displayed character as the selected species, without credit-context body-swap, genetic-trait-only, disguise, hologram, possession, multiple-performer, or unresolved-mode ambiguity.",
    review:"The source contains a potentially relevant credit but automatic filing is unsafe; independent task-level adjudication is required.",
    "excluded-category":"The source's explicit species field does not identify the selected species; category-page membership alone is insufficient.",
    blocked:"The exact revision could not be retrieved and hash-verified, or the task lacks an exact source receipt."
  },
  input:{autopilot_sha256:sha256(await readFile("data/AUTOPILOT.json")),jobs:jobs.length,include_resolved:includeResolved,limit},
  counts,results
};
await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({category,label,jobs:jobs.length,counts,eligible:results.filter(row=>row.disposition==="eligible").map(row=>({task_id:row.task_id,performer:row.performer,character:row.character}))},null,2));
