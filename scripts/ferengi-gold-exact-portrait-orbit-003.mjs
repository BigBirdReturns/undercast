#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const args=process.argv.slice(2);
const option=(name,fallback=null)=>{const at=args.indexOf(`--${name}`);if(at<0)return fallback;const value=args[at+1];if(!value||value.startsWith("--"))throw new Error(`--${name} requires a value`);return value;};
const CONTROL=".github/FERENGI-GOLD-EXACT-PORTRAIT-ORBIT-003.json";
const OUT=option("out",process.env.OUT||"/tmp/ferengi-gold-exact-portrait-orbit-003");
const UA=`Mozilla/5.0 (compatible; undercast/0.1; +https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT||"bigbirdreturns@proton.me"})`;
const IMDB_ENDPOINTS=["https://api.graphql.imdb.com/","https://caching.graphql.imdb.com/"];
const sha256=value=>createHash("sha256").update(value).digest("hex");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+"\n");};
const norm=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").replace(/[^a-zA-Z0-9']+/g," ").trim().toLowerCase();
const slug=value=>norm(value).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"unknown";
const esc=value=>String(value||"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
function decode(value){
  return String(value||"")
    .replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&#x([0-9a-f]+);/gi,(_,hex)=>String.fromCodePoint(parseInt(hex,16)))
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/\\u0026/g,"&").replace(/\\u002F/gi,"/").replace(/\\\//g,"/");
}
function mimeOf(bytes){
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return "image/png";
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return "image/jpeg";
  if(bytes.length>=6&&["GIF87a","GIF89a"].includes(bytes.toString("ascii",0,6)))return "image/gif";
  if(bytes.length>=12&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP")return "image/webp";
  return "unknown";
}
const extension=mime=>mime==="image/jpeg"?"jpg":mime==="image/png"?"png":mime==="image/gif"?"gif":mime==="image/webp"?"webp":"bin";
const aliases=actor=>new Set((actor.aliases||[actor.actor]).map(norm).filter(Boolean));
const exactAlias=(actor,value)=>aliases(actor).has(norm(value));
const surname=actor=>norm(actor.actor).split(" ").at(-1)||"";
let lastRequest=0;
async function fetchRetry(url,options={},label=url,{attempts=2,quiet=false,timeout=30000}={}){
  let last;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const wait=Math.max(0,100-(Date.now()-lastRequest));if(wait)await sleep(wait);lastRequest=Date.now();
      const response=await fetch(url,{...options,redirect:"follow",signal:AbortSignal.timeout(timeout)});
      if(!response.ok)throw new Error(`${response.status} ${response.statusText}`);
      return response;
    }catch(error){last=error;if(attempt<attempts)await sleep(attempt*700);}
  }
  if(quiet)return null;
  throw new Error(`${label} unavailable after retries: ${last?.message||last}`);
}
async function fetchText(url,config={}){
  const response=await fetchRetry(url,{headers:{"User-Agent":UA,Accept:"text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.2",...(config.headers||{})}},config.label||url,{quiet:config.quiet===true,attempts:config.attempts||2,timeout:config.timeout||30000});
  if(!response)return null;return {body:await response.text(),url:response.url||url,content_type:response.headers.get("content-type")||""};
}
async function fetchJson(url,config={}){
  const response=await fetchRetry(url,{method:config.method||"GET",headers:{"User-Agent":UA,Accept:"application/json",...(config.headers||{})},body:config.body},config.label||url,{quiet:config.quiet===true,attempts:config.attempts||2,timeout:config.timeout||30000});
  if(!response)return null;try{return await response.json();}catch(error){if(config.quiet)return null;throw new Error(`${config.label||url} invalid JSON: ${error.message}`);}
}
function contextScore(actor,text){
  const hay=norm(text);let score=0;
  for(const alias of actor.aliases||[actor.actor])if(hay.includes(norm(alias)))score+=10;
  if(surname(actor)&&hay.includes(surname(actor)))score+=2;
  for(const term of actor.context_terms||[])if(hay.includes(norm(term)))score+=2;
  if(/headshot|portrait|profile photo|actor photo|cast photo/.test(hay))score+=5;
  if(/logo|sprite|icon|banner|advert|poster|trailer|placeholder|noimage|default person|social share/.test(hay))score-=20;
  return score;
}
function collectImageObjects(value,path=[],rows=[]){
  if(Array.isArray(value)){value.forEach((item,index)=>collectImageObjects(item,[...path,index],rows));return rows;}
  if(!value||typeof value!=="object")return rows;
  const url=value.url||value.imageUrl||value.contentUrl||value.src;
  if(typeof url==="string"&&/^https?:\/\//i.test(url)&&/(?:m\.media-amazon\.com|media-amazon\.com|imdb-media)/i.test(url))rows.push({id:value.id||null,url:decode(url),width:Number(value.width||value.w||0)||null,height:Number(value.height||value.h||0)||null,path:path.join(".")});
  for(const [key,child] of Object.entries(value))collectImageObjects(child,[...path,key],rows);
  return rows;
}
async function imdbCandidates(actor){
  const candidates=[];const receipts=[];
  for(const imdbId of actor.imdb_ids||[]){
    const query=`query UnderCastNameImages($id: ID!, $first: Int!) { name(id: $id) { id nameText { text } primaryImage { id url width height } images(first: $first) { total edges { node { id url width height } } } } }`;
    for(const endpoint of IMDB_ENDPOINTS){
      const payload=await fetchJson(endpoint,{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://www.imdb.com",Referer:`https://www.imdb.com/name/${imdbId}/mediaindex/`,"x-imdb-client-name":"imdb-web-next","x-imdb-client-version":"1.0.0","x-imdb-user-language":"en-US","x-imdb-user-country":"US"},body:JSON.stringify({query,variables:{id:imdbId,first:100}}),quiet:true,label:`IMDb GraphQL ${imdbId}`});
      const name=payload?.data?.name?.nameText?.text||"";receipts.push({imdb_id:imdbId,endpoint,returned_data:Boolean(payload?.data),name,errors:payload?.errors||null});
      if(!payload?.data||(name&&!exactAlias(actor,name)))continue;
      for(const row of collectImageObjects(payload.data))candidates.push({provider:"IMDb GraphQL",rank:0,exact_identity:true,imdb_id:imdbId,image_id:row.id||"",label:`${actor.actor} — IMDb ${row.id||"image"}`,source_page:row.id?`https://www.imdb.com/name/${imdbId}/mediaviewer/${row.id}/`:`https://www.imdb.com/name/${imdbId}/mediaindex/`,url:row.url,width:row.width,height:row.height,score:20,note:`Image attached to exact IMDb identity ${imdbId}; visual review must distinguish portrait, role still, title art and unrelated imagery.`});
    }
    const page=await fetchText(`https://www.imdb.com/name/${imdbId}/`,{quiet:true,label:`IMDb HTML ${imdbId}`});
    if(page){
      receipts.push({imdb_id:imdbId,page:page.url,bytes:Buffer.byteLength(page.body)});
      for(const match of page.body.matchAll(/https?:\\?\/\\?\/(?:m\.)?media-amazon\.com\/images\/M\/[^"'<>\s\\]+/gi)){
        const url=decode(match[0]);candidates.push({provider:"IMDb HTML",rank:1,exact_identity:true,imdb_id:imdbId,image_id:"",label:`${actor.actor} — exact IMDb page image`,source_page:page.url,url,score:12,note:`Image embedded by exact IMDb identity ${imdbId}; visual review required.`});
      }
    }
  }
  return {candidates,receipts};
}
async function tvmazeCandidates(actor){
  const candidates=[];const receipts=[];
  for(const alias of actor.aliases||[actor.actor]){
    const payload=await fetchJson(`https://api.tvmaze.com/search/people?q=${encodeURIComponent(alias)}`,{quiet:true,label:`TVMaze ${alias}`});
    receipts.push({alias,results:Array.isArray(payload)?payload.length:0});
    for(const row of Array.isArray(payload)?payload:[]){
      const person=row?.person;if(!person||!exactAlias(actor,person.name))continue;
      for(const [size,url] of Object.entries(person.image||{}))if(url)candidates.push({provider:"TVMaze API",rank:1,exact_identity:true,label:`${actor.actor} — TVMaze ${size}`,source_page:person.url||`https://www.tvmaze.com/people/${person.id}`,url,score:18,note:`TVMaze exact-name person record ${person.id}; visual review must confirm neutral-human presentation.`});
    }
  }
  return {candidates,receipts};
}
function imageUrlsFromHtml(html,page,actor){
  const rows=[];const add=(raw,context="")=>{
    const value=decode(raw).trim();if(!value||value.startsWith("data:"))return;let url;
    try{url=new URL(value,page).href;}catch{return;}
    if(!/^https:\/\//i.test(url))return;
    if(!/\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(url)&&!/(?:image|photo|headshot|portrait|person|people|actor|cast)/i.test(url))return;
    rows.push({url,context:String(context).replace(/\s+/g," ").slice(0,700),score:contextScore(actor,context)});
  };
  for(const match of html.matchAll(/<(?:meta|img|source)[^>]+>/gi)){
    const tag=match[0];
    for(const attr of tag.matchAll(/(?:content|src|data-src|data-lazy-src|data-original|srcset)\s*=\s*["']([^"']+)["']/gi))for(const part of attr[1].split(/\s*,\s*/))add(part.trim().split(/\s+/)[0],tag);
  }
  for(const match of html.matchAll(/"(?:image|imageUrl|contentUrl|photo|thumbnailUrl|src)"\s*:\s*"(https?:\\?\/\\?\/[^"\\]+)"/gi))add(match[1],html.slice(Math.max(0,match.index-250),match.index+match[0].length+250));
  return rows;
}
async function namedPageCandidates(actor){
  const candidates=[];const receipts=[];
  for(const page of actor.pages||[]){
    if(/imdb\.com\/name\//i.test(page))continue;
    const result=await fetchText(page,{quiet:true,label:`named page ${page}`});
    if(!result){receipts.push({page,status:"unavailable"});continue;}
    const pageScore=contextScore(actor,result.body);receipts.push({page,resolved_url:result.url,bytes:Buffer.byteLength(result.body),context_score:pageScore});
    for(const [index,row] of imageUrlsFromHtml(result.body,result.url,actor).entries())candidates.push({provider:`Named page (${new URL(result.url).hostname})`,rank:2,exact_identity:true,label:`${actor.actor} — named page image ${index+1}`,source_page:result.url,url:row.url,score:row.score+pageScore,note:`Image embedded by a manually approved performer or exact-credit page; visual review must reject logos, recommendations, role stills, groups, placeholders and namesakes.`});
  }
  return {candidates,receipts};
}
async function bingCandidates(actor){
  const candidates=[];const receipts=[];
  for(const query of actor.queries||[]){
    const url=`https://www.bing.com/images/search?${new URLSearchParams({q:query,form:"HDRSC2",first:"1",tsc:"ImageBasicHover"})}`;
    const result=await fetchText(url,{quiet:true,label:`Bing images ${query}`,headers:{"Accept-Language":"en-US,en;q=0.8"}});
    if(!result){receipts.push({query,status:"unavailable"});continue;}
    let found=0;
    for(const match of result.body.matchAll(/\bm="([^"]*?(?:murl|mUrl)[^"]*?)"/gi)){
      try{
        const meta=JSON.parse(decode(match[1]));const image=meta.murl||meta.mUrl;const page=meta.purl||meta.pUrl;if(!/^https?:\/\//i.test(image||"")||!/^https?:\/\//i.test(page||""))continue;
        const context=[meta.t||meta.title||"",meta.desc||"",page].join(" ");
        candidates.push({provider:"Bing Images",rank:4,exact_identity:false,label:meta.t||meta.title||`${actor.actor} — Bing result`,source_page:page,url:image,score:contextScore(actor,context),search_query:query,note:`Image/source pair returned for an exact-name query. The source page must itself identify ${actor.actor} before any visual approval.`});found++;
      }catch{}
    }
    receipts.push({query,page:result.url,bytes:Buffer.byteLength(result.body),results:found});
  }
  return {candidates,receipts};
}
async function ddgCandidates(actor){
  const candidates=[];const receipts=[];
  for(const query of actor.queries||[]){
    const landing=await fetchText(`https://duckduckgo.com/?${new URLSearchParams({q:query,iax:"images",ia:"images"})}`,{quiet:true,label:`DuckDuckGo ${query}`});
    const token=landing?.body.match(/vqd=['"]?([\d-]+)/)?.[1];if(!token){receipts.push({query,status:"no-token"});continue;}
    const api=`https://duckduckgo.com/i.js?${new URLSearchParams({l:"us-en",o:"json",q:query,vqd:token,f:",,,,,",p:"1"})}`;
    const payload=await fetchJson(api,{quiet:true,label:`DuckDuckGo images ${query}`,headers:{Referer:landing.url,"X-Requested-With":"XMLHttpRequest"}});
    let found=0;
    for(const row of payload?.results||[]){if(!/^https?:\/\//i.test(row.image||"")||!/^https?:\/\//i.test(row.url||""))continue;const context=[row.title||"",row.source||"",row.url].join(" ");candidates.push({provider:"DuckDuckGo Images",rank:4,exact_identity:false,label:row.title||`${actor.actor} — DuckDuckGo result`,source_page:row.url,url:row.image,score:contextScore(actor,context),search_query:query,note:`Image/source pair returned for an exact-name query. Source-page identity and neutral-human presentation require separate review.`});found++;}
    receipts.push({query,api,results:found});
  }
  return {candidates,receipts};
}
function dedupe(candidates){
  const map=new Map();
  for(const candidate of candidates){let image,source;try{const u=new URL(candidate.url);u.hash="";image=u.href;const p=new URL(candidate.source_page);p.hash="";source=p.href;}catch{continue;}const key=`${image}|${source}`;const old=map.get(key);if(!old||candidate.rank<old.rank||candidate.score>old.score)map.set(key,candidate);}
  return [...map.values()].sort((a,b)=>a.rank-b.rank||b.score-a.score||a.label.localeCompare(b.label));
}
function normalizeImageUrl(value){
  try{const url=new URL(value);if(/media-amazon\.com$/i.test(url.hostname)&&/\._V1_/.test(url.pathname))url.pathname=url.pathname.replace(/\._V1_.*?(?=\.(?:jpe?g|png|webp)$)/i,"._V1_");return url.href;}catch{return value;}
}
async function download(actor,candidate,index){
  const urls=[candidate.url,normalizeImageUrl(candidate.url)].filter((value,at,all)=>value&&all.indexOf(value)===at);const errors=[];
  for(const url of urls){
    const response=await fetchRetry(url,{headers:{"User-Agent":UA,Referer:candidate.source_page,Accept:"image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.2"}},`${candidate.provider} image`,{quiet:true,attempts:2,timeout:30000});
    if(!response){errors.push(`${url}: request failed`);continue;}const bytes=Buffer.from(await response.arrayBuffer());const mime=mimeOf(bytes);
    if(bytes.length<700||mime==="unknown"){errors.push(`${url}: ${bytes.length} bytes ${mime}`);continue;}
    const local=`thumbs/${slug(actor.actor)}-${String(index+1).padStart(3,"0")}-${slug(candidate.provider)}.${extension(mime)}`;await mkdir(join(OUT,"thumbs"),{recursive:true});await writeFile(join(OUT,local),bytes);
    return {...candidate,requested_url:candidate.url,resolved_url:response.url||url,local,mime,bytes:bytes.length,sha256:sha256(bytes)};
  }
  return {...candidate,download_error:errors.join(" | ")||"unavailable"};
}
async function gatherActor(actor,globalHashes){
  const [imdb,tvmaze,named,bing,ddg]=await Promise.all([imdbCandidates(actor),tvmazeCandidates(actor),namedPageCandidates(actor),bingCandidates(actor),ddgCandidates(actor)]);
  const raw=[...imdb.candidates,...tvmaze.candidates,...named.candidates,...bing.candidates,...ddg.candidates];const candidates=dedupe(raw).slice(0,120);const downloaded=[];const localHashes=new Set();
  for(let index=0;index<candidates.length;index++){
    const row=await download(actor,candidates[index],index);if(row.sha256&&(localHashes.has(row.sha256)||globalHashes.has(row.sha256)))continue;if(row.sha256){localHashes.add(row.sha256);globalHashes.add(row.sha256);}downloaded.push(row);if(downloaded.filter(item=>item.sha256).length>=24)break;
  }
  return {actor:actor.actor,aliases:actor.aliases,cards:actor.cards,imdb_ids:actor.imdb_ids,context_terms:actor.context_terms,candidate_count:downloaded.filter(row=>row.sha256).length,providers:[...new Set(downloaded.map(row=>row.provider))],candidates:downloaded,provider_receipts:{imdb:imdb.receipts,tvmaze:tvmaze.receipts,named_pages:named.receipts,bing:bing.receipts,duckduckgo:ddg.receipts}};
}

const [control,plan,species,specimens,media]=await Promise.all([readJson(CONTROL),readJson("data/STAR-TREK-GOLD.json"),readJson("data/species.json"),readJson("data/specimens.json"),readJson("data/MEDIA-AUDIT.json")]);
assert(control.version===1&&control.scope==="star-trek"&&control.species==="ferengi","exact orbit control scope drift");
assert(control.reviewed_role==="second-desk","exact orbit requires second-desk authorization");
assert(plan.sequence?.find(row=>row.id==="ferengi")?.state==="active","Ferengi is not active");
const taxon=species.taxa?.find(row=>row.key==="species:star-trek:ferengi");assert(taxon,"Ferengi taxon missing");
const specimenById=new Map(specimens.map(row=>[row.id,row]));const auditByKey=new Map((media.items||[]).map(row=>[`${row.wall_id}|${row.side}`,row]));
const open=(taxon.wall_records||[]).map(row=>row.id).filter(id=>!specimenById.get(id)?.portrait?.src||auditByKey.get(`${id}|portrait`)?.status!=="verified").sort((a,b)=>Number(a.match(/\d+/)?.[0])-Number(b.match(/\d+/)?.[0]));
const controlled=control.actors.flatMap(actor=>actor.cards).sort((a,b)=>Number(a.match(/\d+/)?.[0])-Number(b.match(/\d+/)?.[0]));
assert(open.length===control.expected_cards,`expected ${control.expected_cards} open Ferengi portrait cards, found ${open.length}`);assert(JSON.stringify(open)===JSON.stringify(controlled),`exact orbit control mismatch: open=${open.join(",")} controlled=${controlled.join(",")}`);
await mkdir(OUT,{recursive:true});const entries=[];const globalHashes=new Set();
for(const actor of control.actors){console.log(`exact portrait orbit: ${actor.actor} for ${actor.cards.join(", ")}`);entries.push(await gatherActor(actor,globalHashes));}
const manifest={version:1,scope:control.scope,species:control.species,generated_at:new Date().toISOString(),control_sha256:sha256(await readFile(CONTROL)),target_cards:open,actor_count:entries.length,card_count:controlled.length,entries};await writeJson(join(OUT,"manifest.json"),manifest);
await writeJson(join(OUT,"summary.json"),{actor_count:entries.length,card_count:controlled.length,candidates_downloaded:entries.reduce((sum,row)=>sum+row.candidate_count,0),actors_without_candidates:entries.filter(row=>row.candidate_count===0).map(row=>row.actor),entries:entries.map(row=>({actor:row.actor,cards:row.cards,candidate_count:row.candidate_count,providers:row.providers,imdb_ids:row.imdb_ids}))});
const cards=entries.flatMap(entry=>entry.candidates.map((candidate,index)=>`<article><div class="identity">${esc(entry.actor)} · ${esc(entry.cards.join(" / "))}</div>${candidate.local?`<img src="${esc(candidate.local)}" alt="">`:`<div class="missing">${esc(candidate.download_error||"unavailable")}</div>`}<h2>${esc(candidate.provider)} · ${index+1}</h2><p>${esc(candidate.label)}</p><p><b>score:</b> ${esc(candidate.score)}<br><b>IMDb:</b> ${esc(candidate.imdb_id||"—")}<br><b>Image:</b> ${esc(candidate.image_id||"—")}</p><p><a href="${esc(candidate.source_page)}">source page</a></p><p>${esc(candidate.note)}</p><code>${esc(candidate.sha256||candidate.download_error||"")}</code></article>`)).join("\n");
await writeFile(join(OUT,"sheet.html"),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ferengi exact residual portrait orbit</title><style>body{font:14px system-ui;margin:24px;background:#e9e9e9;color:#111}header{max-width:1100px;margin:0 auto 24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}article{background:#fff;padding:12px;border:1px solid #aaa}img,.missing{display:block;width:100%;height:330px;object-fit:contain;background:#222;color:#fff}.missing{display:grid;place-items:center;text-align:center}.identity{font-weight:700;margin-bottom:8px}h2{font-size:16px}p{font-size:12px;line-height:1.4}code{font-size:10px;word-break:break-all}a{color:#0645ad}</style></head><body><header><h1>Ferengi exact residual performer portraits</h1><p>Candidate-only. Exact identities and exact-name search results narrow discovery but approve nothing. Each card requires a source page identifying the performer plus a visually confirmed single, unmasked, neutral-human portrait. Repeated performers require distinct final bytes.</p></header><main>${cards}</main></body></html>`);
console.log(`exact portrait orbit: ${entries.length} actors / ${controlled.length} cards / ${entries.reduce((sum,row)=>sum+row.candidate_count,0)} unique downloaded candidates -> ${OUT}`);
