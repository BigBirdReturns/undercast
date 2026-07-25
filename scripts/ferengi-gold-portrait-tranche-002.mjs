#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

const args=process.argv.slice(2);
const command=args.shift()||"apply";
const CONTROL=".github/FERENGI-GOLD-PORTRAIT-TRANCHE-002.json";
const SPECIMENS="data/specimens.json";
const SOURCES="data/SOURCES.json";
const MEDIA="data/MEDIA-AUDIT.json";
const MEDIA_MANIFEST="data/media-manifest.json";
const REVIEW_DIR="data/review/ferengi-gold";
const RECEIPT=`${REVIEW_DIR}/portrait-tranche-002-applied-2026-07-25.json`;
const RESOLUTION=`${REVIEW_DIR}/portrait-tranche-002-media-resolution-2026-07-25.json`;
const OUT=process.env.OUT_DIR||"build/review/ferengi-gold-portrait-tranche-002";
const UA=`undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT||"bigbirdreturns@proton.me"})`;

const sha256=value=>createHash("sha256").update(value).digest("hex");
const norm=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").replace(/[^a-zA-Z0-9']+/g," ").trim().toLowerCase();
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+"\n");};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

function signature(bytes){
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return "image/png";
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return "image/jpeg";
  if(bytes.length>=6&&["GIF87a","GIF89a"].includes(bytes.toString("ascii",0,6)))return "image/gif";
  if(bytes.length>=12&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP")return "image/webp";
  return "unknown";
}
const extension=mime=>mime==="image/jpeg"?"jpg":mime==="image/png"?"png":mime==="image/gif"?"gif":mime==="image/webp"?"webp":"bin";
const slug=value=>norm(value).replace(/\s+/g,"-")||"candidate";
const decode=value=>String(value||"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\\u0026/g,"&").replace(/\\\//g,"/");
const esc=value=>String(value||"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);

async function fetchRetry(url,options={},label=url){
  let last;
  for(let attempt=1;attempt<=5;attempt++){
    try{
      const response=await fetch(url,{...options,redirect:"follow",signal:AbortSignal.timeout(60_000)});
      if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);
      return response;
    }catch(error){last=error;if(attempt<5)await sleep(attempt*1500);}
  }
  throw new Error(`${label} unavailable after retries: ${last?.message||last}`);
}
async function downloadImage(url,source,label){
  const response=await fetchRetry(url,{headers:{"User-Agent":UA,Referer:source,Accept:"image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8","Accept-Language":"en-US,en;q=0.8"}},label);
  const bytes=Buffer.from(await response.arrayBuffer());
  const mime=signature(bytes);
  assert(mime!=="unknown",`${label} returned non-image bytes; content-type=${response.headers.get("content-type")||"unknown"}`);
  assert(bytes.length>700,`${label} returned implausibly small image bytes (${bytes.length})`);
  return {bytes,mime,sha256:sha256(bytes),resolved_url:response.url||url};
}
async function existingHashes(){
  const hashes=new Map();let manifest={assets:{}};
  try{manifest=await readJson(MEDIA_MANIFEST);}catch{}
  for(const [path,row] of Object.entries(manifest.assets||{}))if(/^[0-9a-f]{64}$/i.test(row?.sha256||""))hashes.set(row.sha256.toLowerCase(),path);
  try{for(const name of await readdir("images")){const path=join("images",name);if(!/\.(?:jpe?g|png|gif|webp)$/i.test(extname(path)))continue;try{const bytes=await readFile(path);if(bytes.length)hashes.set(sha256(bytes),path);}catch{}}}catch{}
  return hashes;
}

async function apply(){
  const [control,specimens,sources]=await Promise.all([readJson(CONTROL),readJson(SPECIMENS),readJson(SOURCES)]);
  assert(control.version===1&&control.scope==="star-trek"&&control.species==="ferengi","portrait tranche scope drift");
  assert(control.reviewed_role==="second-desk","portrait tranche requires second-desk review");
  assert(Array.isArray(control.apply)&&control.apply.length===3,"portrait tranche must apply exactly three entries");
  const specimenById=new Map(specimens.map(row=>[row.id,row]));
  const sourceById=new Map(sources.map(row=>[row.id,row]));
  const oldHashes=await existingHashes();const newHashes=new Map();const applied=[];
  for(const entry of control.apply){
    const specimen=specimenById.get(entry.id),ledger=sourceById.get(entry.id);
    assert(specimen&&ledger,`${entry.id} missing canonical or source row`);
    assert(norm(specimen.actor)===norm(entry.actor)&&norm(ledger.actor)===norm(entry.actor),`${entry.id} actor identity drift`);
    assert(norm(specimen.character)===norm(entry.character)&&norm(ledger.character)===norm(entry.character),`${entry.id} character identity drift: ${specimen.character} / ${ledger.character} != ${entry.character}`);
    assert(!specimen.portrait&&!ledger.portrait,`${entry.id} already has a portrait; refusing overwrite`);
    const downloaded=await downloadImage(entry.asset_url,entry.source_page,`${entry.provider} portrait for ${entry.actor}`);
    assert(downloaded.mime===entry.mime,`${entry.id} MIME drift: ${downloaded.mime} != ${entry.mime}`);
    assert(downloaded.bytes.length===entry.bytes,`${entry.id} byte count drift: ${downloaded.bytes.length} != ${entry.bytes}`);
    assert(downloaded.sha256===entry.sha256,`${entry.id} SHA-256 drift: ${downloaded.sha256} != ${entry.sha256}`);
    const duplicate=oldHashes.get(entry.sha256)||newHashes.get(entry.sha256);assert(!duplicate,`${entry.id} portrait duplicates ${duplicate}`);
    const output=`images/${entry.id.toLowerCase()}-portrait.${extension(downloaded.mime)}`;
    await writeFile(output,downloaded.bytes);
    const retained=await readFile(output);assert(retained.length===entry.bytes&&sha256(retained)===entry.sha256,`${entry.id} retained bytes drift`);
    const asset={src:output,kind:"copyright",origin:entry.source_page,author:"",license:"",pin:true};
    specimen.portrait=asset;ledger.portrait=asset;ledger.fetched_at=control.reviewed_at.slice(0,10);newHashes.set(entry.sha256,output);
    applied.push({...entry,output,resolved_url:downloaded.resolved_url});
    console.log(`applied ${entry.id} ${entry.actor} portrait -> ${output}`);
  }
  await writeJson(SPECIMENS,specimens);await writeJson(SOURCES,sources);
  await writeJson(RECEIPT,{version:1,scope:control.scope,species:control.species,operation:"apply-playbill-and-corsentino-portraits",reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,reviewed_at:control.reviewed_at,applied_at:new Date().toISOString(),authorization_sha256:sha256(await readFile(CONTROL)),entries:applied});
}

function score(url,context,actor,aliases=[]){
  const hay=`${url} ${context}`.toLowerCase();let n=0;
  for(const name of [actor,...aliases])for(const token of norm(name).split(" "))if(token.length>2&&hay.includes(token))n+=3;
  if(/head[-_ ]?shot|portrait|profile|person|actor|cast|people|photo/.test(hay))n+=4;
  if(/logo|sprite|icon|banner|advert|pixel|provider|poster|trailer|facebook|twitter|instagram|youtube|favicon|placeholder|noimage|default-person/.test(hay))n-=12;
  if(/\.svg(?:\?|$)/i.test(url))n-=20;
  return n;
}
function extract(html,page,actor,aliases=[]){
  const rows=new Map();
  const add=(raw,context="")=>{
    const value=decode(raw).trim();if(!value||value.startsWith("data:"))return;let url;
    try{url=new URL(value,page).href;}catch{return;}
    if(!/^https:\/\//.test(url))return;
    if(!/\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(url)&&!/(?:image|photo|headshot|portrait|person|people|actor|cast)/i.test(url))return;
    const candidate={url,score:score(url,context,actor,aliases),context:String(context).replace(/\s+/g," ").slice(0,500)};
    if(!rows.has(url)||candidate.score>rows.get(url).score)rows.set(url,candidate);
  };
  for(const match of html.matchAll(/<(?:meta|img|source)[^>]+>/gi)){
    const tag=match[0];
    for(const attr of tag.matchAll(/(?:content|src|data-src|data-lazy-src|data-original|srcset)\s*=\s*["']([^"']+)["']/gi))for(const part of attr[1].split(/\s*,\s*/))add(part.trim().split(/\s+/)[0],tag);
  }
  for(const match of html.matchAll(/https?:\\?\/\\?\/[^"'<>\s]+/gi))add(match[0],html.slice(Math.max(0,match.index-220),match.index+match[0].length+220));
  return [...rows.values()].sort((a,b)=>b.score-a.score||a.url.localeCompare(b.url)).slice(0,40);
}
async function gather(){
  const control=await readJson(CONTROL);assert(Array.isArray(control.gather)&&control.gather.length===8,"gather target set drift");
  await mkdir(join(OUT,"candidates"),{recursive:true});
  const manifest={version:1,scope:control.scope,species:control.species,generated_at:new Date().toISOString(),semantics:"Candidate-only exact-page harvest. Download success is not visual approval and cannot mutate canonical media.",authorization_sha256:sha256(await readFile(CONTROL)),entries:[]};
  const seen=new Set();
  for(const target of control.gather){
    const entry={actor:target.actor,aliases:target.aliases||[],cards:target.cards,pages:[],candidates:[],errors:[]};let ordinal=0;
    for(const page of target.pages){
      try{
        const response=await fetchRetry(page,{headers:{"User-Agent":UA,Accept:"text/html,application/xhtml+xml","Accept-Language":"en-US,en;q=0.8"}},`${target.actor} source page`);
        const html=await response.text();const resolved=response.url||page;const pageSlug=`${slug(target.actor)}-${String(entry.pages.length+1).padStart(2,"0")}`;
        await writeFile(join(OUT,`${pageSlug}.html`),html);const candidates=extract(html,resolved,target.actor,target.aliases||[]);
        entry.pages.push({requested_url:page,resolved_url:resolved,bytes:Buffer.byteLength(html),candidate_urls:candidates.length});
        for(const candidate of candidates){
          ordinal++;
          try{
            const downloaded=await downloadImage(candidate.url,resolved,`${target.actor} candidate ${ordinal}`);if(seen.has(downloaded.sha256))continue;seen.add(downloaded.sha256);
            const file=`${slug(target.actor)}-${String(entry.candidates.length+1).padStart(3,"0")}.${extension(downloaded.mime)}`;
            await writeFile(join(OUT,"candidates",file),downloaded.bytes);
            entry.candidates.push({source_page:resolved,requested_url:candidate.url,resolved_url:downloaded.resolved_url,local:`candidates/${file}`,mime:downloaded.mime,bytes:downloaded.bytes.length,sha256:downloaded.sha256,score:candidate.score,context:candidate.context});
          }catch(error){entry.errors.push({page:resolved,url:candidate.url,error:error.message});}
        }
      }catch(error){entry.errors.push({page,error:error.message});}
    }
    manifest.entries.push(entry);console.log(`gathered ${entry.candidates.length} unique ${target.actor} candidate(s) from ${entry.pages.length}/${target.pages.length} pages; errors=${entry.errors.length}`);
  }
  await writeJson(join(OUT,"manifest.json"),manifest);
  const cards=manifest.entries.flatMap(entry=>entry.candidates.map(candidate=>`<article><img src="${esc(candidate.local)}" alt=""><h2>${esc(entry.actor)}</h2><p>cards ${esc(entry.cards.join(", "))}</p><p><code>${esc(candidate.sha256)}</code></p><p>${esc(candidate.source_page)}</p><p>${esc(candidate.requested_url)}</p></article>`)).join("\n");
  await writeFile(join(OUT,"sheet.html"),`<!doctype html><meta charset="utf-8"><title>Ferengi residual portrait orbit</title><style>body{font:14px system-ui;margin:24px;background:#eee}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px}article{background:#fff;border:1px solid #aaa;padding:10px}img{width:100%;height:300px;object-fit:contain;background:#222}code,p{font-size:10px;word-break:break-all}</style><h1>Ferengi residual portrait candidates</h1><p>Candidate-only. Identity and neutral-human presentation require visual review.</p><main>${cards}</main>`);
}

async function resolution(){
  const [receipt,media]=await Promise.all([readJson(RECEIPT),readJson(MEDIA)]);const votes=[];
  for(const entry of receipt.entries){
    const item=(media.items||[]).find(row=>row.scope==="star-trek"&&row.wall_id===entry.id&&row.side==="portrait");assert(item?.asset?.sha256===entry.sha256,`${entry.id} media item does not bind applied bytes`);
    votes.push({item_id:item.id,namespace:"identity",value:"expected",enforced:true,note:`${entry.provider} exact-name record and retained source context identify the expected performer ${entry.actor}.`,evidence:[entry.source_page,entry.asset_url,`sha256:${entry.sha256}`]});
    votes.push({item_id:item.id,namespace:"presentation",value:"neutral-human",enforced:true,note:`The reviewed image presents ${entry.actor} unmasked as a single identifiable person rather than a role depiction, group, or non-person image.`,evidence:[entry.source_page,entry.review_note]});
  }
  await writeJson(RESOLUTION,{version:2,reviewed_by:receipt.reviewed_by,reviewed_role:receipt.reviewed_role,reviewed_at:receipt.reviewed_at,votes});
}
async function validate(){
  const [receipt,specimens,sources,media,plan]=await Promise.all([readJson(RECEIPT),readJson(SPECIMENS),readJson(SOURCES),readJson(MEDIA),readJson("data/STAR-TREK-GOLD.json")]);
  for(const entry of receipt.entries){
    const specimen=specimens.find(row=>row.id===entry.id),ledger=sources.find(row=>row.id===entry.id);assert(JSON.stringify(specimen?.portrait)===JSON.stringify(ledger?.portrait),`${entry.id} source/canonical portrait drift`);
    const bytes=await readFile(entry.output);assert(bytes.length===entry.bytes&&sha256(bytes)===entry.sha256,`${entry.id} retained portrait drift`);
    const item=(media.items||[]).find(row=>row.scope==="star-trek"&&row.wall_id===entry.id&&row.side==="portrait");assert(item?.status==="verified",`${entry.id} portrait is ${item?.status||"missing"}`);assert(item.asset?.sha256===entry.sha256,`${entry.id} audit hash drift`);
  }
  assert(plan.sequence?.find(row=>row.id==="ferengi")?.state==="active","Ferengi active lock changed");console.log(`PASS — ${receipt.entries.length} tranche-002 portraits retained and exact-subject verified`);
}

if(command==="apply")await apply();
else if(command==="gather")await gather();
else if(command==="resolution")await resolution();
else if(command==="validate")await validate();
else throw new Error("unknown command; use apply, gather, resolution, or validate");
