#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

const args=process.argv.slice(2);
const option=(name,fallback=null)=>{const index=args.indexOf(name);if(index<0)return fallback;const value=args[index+1];if(!value||value.startsWith("--"))throw new Error(`${name} requires a value`);return value;};
const controlPath=option("--control");
const out=option("--out");
if(!controlPath||!out)throw new Error("usage: node scripts/direct-media-candidates.mjs --control <control.json> --out <directory>");
const control=JSON.parse(await readFile(controlPath,"utf8"));
const UA=`undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT||"direct-media-candidates"})`;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
const slug=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"candidate";
function magic(bytes){
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return {type:"image/jpeg",ext:"jpg"};
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return {type:"image/png",ext:"png"};
  if(bytes.length>=12&&bytes.subarray(0,4).toString("ascii")==="RIFF"&&bytes.subarray(8,12).toString("ascii")==="WEBP")return {type:"image/webp",ext:"webp"};
  if(bytes.length>=6&&["GIF87a","GIF89a"].includes(bytes.subarray(0,6).toString("ascii")))return {type:"image/gif",ext:"gif"};
  return null;
}
async function download(candidate){
  let last;
  for(let attempt=1;attempt<=4;attempt++){
    try{
      const headers={"User-Agent":UA,Accept:"image/avif,image/webp,image/apng,image/*,*/*;q=0.8","Accept-Language":"en-US,en;q=0.8"};
      if(candidate.referer)headers.Referer=candidate.referer;
      const response=await fetch(candidate.url,{headers,redirect:"follow",signal:AbortSignal.timeout(45000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const bytes=Buffer.from(await response.arrayBuffer());
      const detected=magic(bytes);
      if(!detected)throw new Error(`downloaded ${bytes.length} bytes but image signature is unknown; content-type=${response.headers.get("content-type")||"missing"}`);
      return {bytes,detected,final_url:response.url,declared_type:response.headers.get("content-type")||null};
    }catch(error){last=error;if(attempt<4)await sleep(attempt*1500);}
  }
  throw last;
}

await mkdir(join(out,"files"),{recursive:true});
const results=[];
for(const [entryIndex,entry] of (control.entries||[]).entries()){
  for(const [candidateIndex,candidate] of (entry.candidates||[]).entries()){
    const label=candidate.label||`c${candidateIndex+1}`;
    try{
      const got=await download(candidate);
      const file=`${slug(entry.id)}-${slug(entry.side)}-${slug(label)}.${got.detected.ext}`;
      const relative=`files/${file}`;
      await writeFile(join(out,relative),got.bytes);
      results.push({
        status:"downloaded",entry_index:entryIndex,candidate_index:candidateIndex,label,
        id:entry.id,side:entry.side,expected_subject:entry.expected_subject,actor:entry.actor||null,character:entry.character||null,
        source_page:candidate.source_page,source_label:candidate.source_label||null,review_note:candidate.review_note||null,
        requested_url:candidate.url,final_url:got.final_url,referer:candidate.referer||null,
        local:relative,bytes:got.bytes.length,sha256:sha256(got.bytes),content_type:got.detected.type,declared_type:got.declared_type
      });
    }catch(error){
      results.push({status:"failed",entry_index:entryIndex,candidate_index:candidateIndex,label,id:entry.id,side:entry.side,expected_subject:entry.expected_subject,source_page:candidate.source_page,requested_url:candidate.url,error:error instanceof Error?error.message:String(error)});
    }
  }
}
const counts={downloaded:results.filter(row=>row.status==="downloaded").length,failed:results.filter(row=>row.status==="failed").length};
const manifest={version:1,generated_at:new Date().toISOString(),control_path:controlPath,scope:control.scope,species:control.species,pass:control.pass,counts,results};
await writeFile(join(out,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
const grouped=new Map();
for(const row of results){const key=`${row.id}|${row.side}`;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);}
const sections=[...grouped.entries()].map(([key,rows])=>{
  const first=rows[0];
  const figures=rows.map(row=>row.status==="downloaded"?`<figure><img src="${esc(row.local)}" alt=""><figcaption><b>${esc(row.label)}</b> · ${esc(row.bytes)} bytes<br>${esc(row.source_label||row.source_page||"")}<br><code>${esc(row.sha256)}</code></figcaption></figure>`:`<figure class="failed"><div>download failed</div><figcaption><b>${esc(row.label)}</b><br>${esc(row.error)}</figcaption></figure>`).join("");
  return `<section><h2>${esc(first.id)} · ${esc(first.side)} · expected ${esc(first.expected_subject)}</h2><div class="row">${figures}</div></section>`;
}).join("\n");
const html=`<!doctype html><meta charset="utf-8"><title>Direct media candidates</title><style>body{font-family:ui-monospace,monospace;background:#e6e0d5;color:#191715;padding:18px}section{padding:16px 0;border-bottom:2px solid #8f887d}h2{font-size:16px}.row{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0;width:320px}img{display:block;width:320px;height:220px;object-fit:contain;background:#181716;border:1px solid #181716}.failed>div{width:318px;height:218px;display:grid;place-items:center;border:1px solid #a23d30}figcaption{font-size:11px;line-height:1.35;margin-top:5px;overflow-wrap:anywhere}code{font-size:9px}</style>${sections}`;
await writeFile(join(out,"sheet.html"),html);
console.log(JSON.stringify({counts,entries:(control.entries||[]).length,out},null,2));
if(counts.downloaded===0)process.exitCode=2;
