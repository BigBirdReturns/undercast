#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const args=process.argv.slice(2);
const option=(name,fallback=null)=>{const index=args.indexOf(name);if(index<0)return fallback;const value=args[index+1];if(!value||value.startsWith("--"))throw new Error(`${name} requires a value`);return value;};
const out=option("--out");
if(!out)throw new Error("--out required");
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));
const sha256=value=>createHash("sha256").update(value).digest("hex");
const norm=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").replace(/[^a-zA-Z0-9']+/g," ").trim().toLowerCase();
const stripWiki=value=>String(value||"").replace(/<!--.*?-->/gs," ").replace(/<ref\b[^>]*>.*?<\/ref>/gis," ").replace(/<ref\b[^>]*\/>/gi," ").replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,"$2").replace(/\[\[([^\]]+)\]\]/g,"$1").replace(/\{\{[^{}]*\}\}/g," ").replace(/'{2,}/g,"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const UA=`undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT||"ferengi-integrity"})`;

const [specimens,species,autopilot,sources,tombstones]=await Promise.all([
  readJson("data/specimens.json"),readJson("data/species.json"),readJson("data/AUTOPILOT.json"),readJson("data/SOURCES.json"),readJson("data/tombstones.json").catch(()=>({records:[]}))
]);
const ids=new Set(["UC-298","UC-1285","UC-1317"]);
const records=specimens.filter(row=>ids.has(row.id));
const sourceRows=sources.filter(row=>ids.has(row.id));
const taxon=(species.taxa||[]).find(row=>row.franchise==="Star Trek"&&norm(row.source_category)==="ferengi");
if(!taxon)throw new Error("Ferengi species projection missing");
const relatedCredit=row=>{
  const text=norm([row.character,row.performer,...(row.wall_ids||[])].join(" "));
  return (row.wall_ids||[]).some(id=>ids.has(id))||["nandi","bok","gral","prak"].some(value=>text.includes(value));
};
const credits=(taxon.credits||[]).filter(relatedCredit);
const jobs=(autopilot.jobs||[]).filter(job=>{
  const text=norm([job.character,job.performer,...(job.wall_ids||[])].join(" "));
  return (job.wall_ids||[]).some(id=>ids.has(id))||["nandi","bok","gral","prak"].some(value=>text.includes(value));
});

function apiFor(source){const url=new URL(source);return /(^|\.)fandom\.com$/i.test(url.hostname)?`${url.protocol}//${url.hostname}/api.php`:`${url.protocol}//${url.hostname}/w/api.php`;}
function revisionContent(revision){return revision?.slots?.main?.content??revision?.slots?.main?.["*"]??revision?.["*"]??revision?.content??null;}
async function fetchRevision({source,revision=null}){
  const api=apiFor(source);
  const params=new URLSearchParams({action:"query",format:"json",formatversion:"2",origin:"*",prop:"revisions",rvprop:"ids|timestamp|content",rvslots:"main"});
  if(revision)params.set("revids",String(revision));else params.set("titles",decodeURIComponent(new URL(source).pathname.replace(/^\/wiki\//,"")));
  let last;
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const response=await fetch(`${api}?${params}`,{headers:{"User-Agent":UA,Accept:"application/json"},signal:AbortSignal.timeout(45000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const json=await response.json();if(json?.error)throw new Error(`${json.error.code||"api"}: ${json.error.info||JSON.stringify(json.error)}`);
      const page=(json?.query?.pages||[])[0];const rev=page?.revisions?.[0];const content=revisionContent(rev);
      if(typeof content!=="string")throw new Error("revision content unavailable");
      return {source,pageid:page.pageid,title:page.title,revision:rev.revid,timestamp:rev.timestamp,content_sha256:sha256(Buffer.from(content,"utf8")),content};
    }catch(error){last=error;if(attempt<4)await sleep(attempt*1000);}
  }
  throw last;
}
const nandiSource="https://memory-alpha.fandom.com/wiki/Nandi";
const nandiJobs=jobs.filter(job=>norm(job.character)==="nandi");
const retainedReceipts=nandiJobs.flatMap(job=>(job.source_receipts||[]).map(receipt=>({task_id:job.id,performer:job.performer,...receipt}))).filter(row=>row.source===nandiSource);
const revisions=[];
try{revisions.push({kind:"current",...(await fetchRevision({source:nandiSource}))});}catch(error){revisions.push({kind:"current",error:error.message});}
for(const receipt of retainedReceipts){
  try{const row=await fetchRevision({source:receipt.source,revision:receipt.revision});revisions.push({kind:"retained",task_id:receipt.task_id,performer:receipt.performer,expected_sha256:receipt.content_sha256,...row,hash_matches:row.content_sha256===receipt.content_sha256});}
  catch(error){revisions.push({kind:"retained",task_id:receipt.task_id,performer:receipt.performer,error:error.message,expected_sha256:receipt.content_sha256});}
}
const relevantLines=revisions.map(row=>{
  if(!row.content)return {...row,content:undefined,evidence_lines:[]};
  const evidence=[];
  for(const [index,line] of row.content.split(/\r?\n/).entries()){
    const plain=stripWiki(line);const normalized=norm(plain);
    if(["grey griffin","melissa villasenor","credit","played by","voice"].some(needle=>normalized.includes(needle)))evidence.push({line:index+1,text:plain.slice(0,700)});
  }
  return {...row,content:undefined,evidence_lines:evidence.slice(0,30)};
});
const report={
  version:1,generated_at:new Date().toISOString(),scope:"star-trek",species:"Ferengi",
  records,source_rows:sourceRows,taxon_counts:taxon.counts,credits,jobs,
  existing_tombstones:(tombstones.records||[]).filter(row=>ids.has(row.id)),
  nandi:{source:nandiSource,revisions:relevantLines},
  findings:{
    nandi_duplicate:{keep_record:"UC-1285",retirement_candidate:"UC-1317",basis:"Memory Alpha retains Grey Griffin and notes that Melissa Villaseñor's initial credit was later removed; the two canonical cards may not share one performance or one still."},
    composite_record:{record:"UC-298",displayed_roles:["Bok","Gral","Prak"],requirement:"A single-role still cannot stand for all three displayed roles. Use a three-source composite with retained component provenance or split the record without reusing one portrait asset."}
  }
};
await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({records:records.map(row=>({id:row.id,actor:row.actor,character:row.character})),credits:credits.length,jobs:jobs.length,nandi_revisions:relevantLines.map(row=>({kind:row.kind,revision:row.revision,performer:row.performer,hash_matches:row.hash_matches,error:row.error}))},null,2));
