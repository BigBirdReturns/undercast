#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const args=process.argv.slice(2);
const option=(name,fallback=null)=>{const at=args.indexOf(`--${name}`);if(at<0)return fallback;const value=args[at+1];if(!value||value.startsWith("--"))throw new Error(`--${name} requires a value`);return value;};
const CONTROL=".github/FERENGI-GOLD-BROWSER-PORTRAIT-ORBIT-004.json";
const OUT=option("out",process.env.OUT||"/tmp/ferengi-gold-browser-portrait-orbit-004");
const sha256=value=>createHash("sha256").update(value).digest("hex");
const norm=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[’‘]/g,"'").replace(/[^a-zA-Z0-9']+/g," ").trim().toLowerCase();
const slug=value=>norm(value).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"unknown";
const esc=value=>String(value||"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+"\n");};
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function mimeOf(bytes){
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return "image/png";
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return "image/jpeg";
  if(bytes.length>=6&&["GIF87a","GIF89a"].includes(bytes.toString("ascii",0,6)))return "image/gif";
  if(bytes.length>=12&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP")return "image/webp";
  return "unknown";
}
const extension=mime=>mime==="image/jpeg"?"jpg":mime==="image/png"?"png":mime==="image/gif"?"gif":mime==="image/webp"?"webp":"bin";
function actorScore(actor,text,url=""){
  const hay=norm(`${text} ${url}`);let score=0;
  for(const alias of actor.aliases||[actor.actor])if(hay.includes(norm(alias)))score+=18;
  const last=norm(actor.actor).split(" ").at(-1);if(last&&hay.includes(last))score+=3;
  for(const term of actor.context_terms||[])if(hay.includes(norm(term)))score+=3;
  if(/portrait|headshot|profile photo|myspace|actor photo|cast photo|person photo/.test(hay))score+=9;
  if(/logo|sprite|icon|banner|advert|poster|trailer|placeholder|noimage|default person|footer|header|social share|favicon|avatar default/.test(hay))score-=25;
  return score;
}
function uniqueCandidates(rows){
  const map=new Map();
  for(const row of rows){let url;try{const parsed=new URL(row.url);parsed.hash="";url=parsed.href;}catch{continue;}const previous=map.get(url);if(!previous||row.score>previous.score)map.set(url,{...row,url});}
  return [...map.values()].sort((a,b)=>b.score-a.score||(b.width||0)*(b.height||0)-(a.width||0)*(a.height||0)||a.url.localeCompare(b.url));
}
async function requestJson(request,url){
  try{const response=await request.get(url,{timeout:30000,headers:{Accept:"application/json"}});if(!response.ok())return null;return await response.json();}catch{return null;}
}
async function archiveSnapshots(request,pattern,limit=3){
  const query=new URLSearchParams({url:pattern,output:"json",fl:"timestamp,original,statuscode,mimetype,digest",filter:"statuscode:200",collapse:"digest",limit:String(limit),from:"2003",to:"2026"});
  const payload=await requestJson(request,`https://web.archive.org/cdx/search/cdx?${query}`);
  if(!Array.isArray(payload)||payload.length<2)return [];
  const header=payload[0];return payload.slice(1).map(row=>Object.fromEntries(header.map((key,index)=>[key,row[index]]))).filter(row=>row.timestamp&&row.original);
}
async function scrollPage(page){
  for(let pass=0;pass<6;pass++){
    await page.evaluate(()=>window.scrollBy(0,Math.max(700,window.innerHeight*.9))).catch(()=>{});
    await page.waitForTimeout(350);
  }
  await page.evaluate(()=>window.scrollTo(0,0)).catch(()=>{});
}
async function dismissConsent(page){
  const patterns=[/accept all/i,/allow all/i,/agree/i,/accept cookies/i,/consent/i,/continue without/i];
  for(const pattern of patterns){
    const locator=page.getByRole("button",{name:pattern}).first();
    if(await locator.count().catch(()=>0)){await locator.click({timeout:1200}).catch(()=>{});break;}
  }
}
async function extractPage(context,actor,url,label,ordinal){
  const page=await context.newPage();
  const network=[];
  page.on("response",response=>{
    const type=response.request().resourceType();const content=response.headers()["content-type"]||"";
    if(type==="image"||/^image\//i.test(content))network.push({url:response.url(),source:"network",context:`${label} ${content}`,score:actorScore(actor,label,response.url())});
  });
  const result={label,requested_url:url,resolved_url:null,status:"unknown",title:"",body_text:"",links:[],images:[],network_count:0,error:null,screenshot:null,html:null};
  try{
    const response=await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
    result.status=response?String(response.status()):"no-response";result.resolved_url=page.url();
    await dismissConsent(page);await page.waitForTimeout(1800);await scrollPage(page);await page.waitForTimeout(900);
    result.title=await page.title().catch(()=>"");
    result.body_text=(await page.locator("body").innerText({timeout:3000}).catch(()=>"")).replace(/\s+/g," ").slice(0,12000);
    const extracted=await page.evaluate(()=>{
      const absolute=value=>{try{return new URL(value,document.baseURI).href;}catch{return "";}};
      const contextFor=element=>{
        let node=element;const parts=[];
        for(let depth=0;node&&depth<4;depth++,node=node.parentElement){const text=(node.innerText||node.textContent||"").replace(/\s+/g," ").trim();if(text)parts.push(text.slice(0,900));}
        return parts.join(" | ");
      };
      const images=[...document.querySelectorAll("img")].map(img=>({url:absolute(img.currentSrc||img.src||img.getAttribute("data-src")||img.getAttribute("data-original")||""),alt:img.alt||"",title:img.title||"",width:img.naturalWidth||img.width||0,height:img.naturalHeight||img.height||0,context:contextFor(img),parent_href:absolute(img.closest("a")?.href||"")})).filter(row=>row.url);
      for(const node of document.querySelectorAll("[style*='background-image']")){const style=getComputedStyle(node).backgroundImage;for(const match of style.matchAll(/url\(["']?([^"')]+)["']?\)/g))images.push({url:absolute(match[1]),alt:"",title:"background-image",width:node.clientWidth||0,height:node.clientHeight||0,context:contextFor(node),parent_href:absolute(node.closest("a")?.href||"")});}
      const links=[...document.querySelectorAll("a[href]")].map(a=>({href:absolute(a.href),text:(a.innerText||a.textContent||"").replace(/\s+/g," ").trim().slice(0,500),title:a.title||""})).filter(row=>row.href&&/(myspace|portrait|headshot|photo|fotk|image|gallery|actor|performer)/i.test(`${row.href} ${row.text} ${row.title}`));
      return {images,links};
    });
    result.links=extracted.links;
    const pageContext=`${result.title} ${result.body_text}`;
    const dom=extracted.images.map(row=>({...row,source:"dom",score:actorScore(actor,`${row.alt} ${row.title} ${row.context} ${pageContext}`,row.url)}));
    result.images=uniqueCandidates([...dom,...network]).slice(0,40);result.network_count=network.length;
    const stem=`${String(ordinal).padStart(2,"0")}-${slug(label)}`;result.html=`pages/${stem}.html`;result.screenshot=`pages/${stem}.png`;
    await mkdir(join(OUT,"pages"),{recursive:true});await writeFile(join(OUT,result.html),await page.content());
    await page.screenshot({path:join(OUT,result.screenshot),fullPage:true,animations:"disabled"}).catch(error=>{result.screenshot_error=error.message;});
  }catch(error){result.error=error.message;result.resolved_url=page.url();}
  await page.close();return result;
}
async function downloadCandidates(context,actor,pageRows,globalHashes){
  const candidates=uniqueCandidates(pageRows.flatMap(page=>page.images.map(image=>({...image,page_label:page.label,source_page:page.resolved_url||page.requested_url,page_status:page.status})))).filter(row=>row.score>=0).slice(0,70);
  const downloaded=[];
  for(let index=0;index<candidates.length;index++){
    const candidate=candidates[index];
    try{
      const response=await context.request.get(candidate.url,{timeout:30000,headers:{Referer:candidate.source_page,Accept:"image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.2"}});
      if(!response.ok())continue;const bytes=Buffer.from(await response.body());const mime=mimeOf(bytes);if(bytes.length<700||mime==="unknown")continue;const digest=sha256(bytes);if(globalHashes.has(digest))continue;globalHashes.add(digest);
      const local=`thumbs/${slug(actor.actor)}-${String(downloaded.length+1).padStart(3,"0")}.${extension(mime)}`;await mkdir(join(OUT,"thumbs"),{recursive:true});await writeFile(join(OUT,local),bytes);
      downloaded.push({...candidate,local,mime,bytes:bytes.length,sha256:digest,resolved_url:response.url()});if(downloaded.length>=30)break;
    }catch{}
  }
  return downloaded;
}

const [control,plan,species,specimens,media]=await Promise.all([readJson(CONTROL),readJson("data/STAR-TREK-GOLD.json"),readJson("data/species.json"),readJson("data/specimens.json"),readJson("data/MEDIA-AUDIT.json")]);
assert(control.version===1&&control.scope==="star-trek"&&control.species==="ferengi","browser orbit scope drift");assert(control.reviewed_role==="second-desk","browser orbit requires second-desk authorization");assert(plan.sequence?.find(row=>row.id==="ferengi")?.state==="active","Ferengi is not active");
const taxon=species.taxa?.find(row=>row.key==="species:star-trek:ferengi");assert(taxon,"Ferengi taxon missing");const specimenById=new Map(specimens.map(row=>[row.id,row]));const auditByKey=new Map((media.items||[]).map(row=>[`${row.wall_id}|${row.side}`,row]));
const open=(taxon.wall_records||[]).map(row=>row.id).filter(id=>!specimenById.get(id)?.portrait?.src||auditByKey.get(`${id}|portrait`)?.status!=="verified").sort((a,b)=>Number(a.match(/\d+/)?.[0])-Number(b.match(/\d+/)?.[0]));const controlled=control.actors.flatMap(actor=>actor.cards).sort((a,b)=>Number(a.match(/\d+/)?.[0])-Number(b.match(/\d+/)?.[0]));assert(open.length===control.expected_cards,`expected ${control.expected_cards} open portrait cards, found ${open.length}`);assert(JSON.stringify(open)===JSON.stringify(controlled),`browser orbit control mismatch: open=${open.join(",")} controlled=${controlled.join(",")}`);
await mkdir(OUT,{recursive:true});const browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000},userAgent:"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36",locale:"en-US",javaScriptEnabled:true,ignoreHTTPSErrors:true});
const entries=[];const globalHashes=new Set();let pageOrdinal=0;
for(const actor of control.actors){
  console.log(`browser portrait orbit: ${actor.actor} for ${actor.cards.join(", ")}`);const pages=[];
  for(const url of actor.pages||[]){pageOrdinal++;pages.push(await extractPage(context,actor,url,`${actor.actor} current ${new URL(url).hostname}`,pageOrdinal));}
  for(const pattern of actor.archive_patterns||[]){
    const snapshots=await archiveSnapshots(context.request,pattern,3);for(const snap of snapshots){pageOrdinal++;const url=`https://web.archive.org/web/${snap.timestamp}/${snap.original}`;pages.push(await extractPage(context,actor,url,`${actor.actor} archive ${snap.timestamp} ${snap.original}`,pageOrdinal));}
  }
  for(const source of actor.pages||[]){
    const snapshots=await archiveSnapshots(context.request,source,1);for(const snap of snapshots){pageOrdinal++;const url=`https://web.archive.org/web/${snap.timestamp}/${snap.original}`;pages.push(await extractPage(context,actor,url,`${actor.actor} archived source ${snap.timestamp}`,pageOrdinal));}
  }
  const downloaded=await downloadCandidates(context,actor,pages,globalHashes);entries.push({actor:actor.actor,aliases:actor.aliases,cards:actor.cards,page_count:pages.length,pages,candidate_count:downloaded.length,candidates:downloaded});console.log(`  ${pages.length} rendered pages / ${downloaded.length} unique image candidates`);
}
await browser.close();
const manifest={version:1,scope:control.scope,species:control.species,generated_at:new Date().toISOString(),control_sha256:sha256(await readFile(CONTROL)),target_cards:open,actor_count:entries.length,card_count:controlled.length,entries};await writeJson(join(OUT,"manifest.json"),manifest);await writeJson(join(OUT,"summary.json"),{actor_count:entries.length,card_count:controlled.length,pages_rendered:entries.reduce((sum,row)=>sum+row.page_count,0),candidates_downloaded:entries.reduce((sum,row)=>sum+row.candidate_count,0),actors_without_candidates:entries.filter(row=>row.candidate_count===0).map(row=>row.actor),entries:entries.map(row=>({actor:row.actor,cards:row.cards,page_count:row.page_count,candidate_count:row.candidate_count,failed_pages:row.pages.filter(page=>page.error).length,myspace_links:[...new Set(row.pages.flatMap(page=>page.links.filter(link=>/myspace/i.test(link.href)).map(link=>link.href)))].slice(0,20)}))});
const cards=entries.flatMap(entry=>entry.candidates.map((candidate,index)=>`<article><div class="identity">${esc(entry.actor)} · ${esc(entry.cards.join(" / "))}</div><img src="${esc(candidate.local)}" alt=""><h2>${index+1} · score ${esc(candidate.score)}</h2><p>${esc(candidate.page_label)}</p><p><a href="${esc(candidate.source_page)}">source page</a></p><p>${esc(candidate.context||candidate.title||candidate.alt||"")}</p><code>${esc(candidate.sha256)}</code></article>`)).join("\n");await writeFile(join(OUT,"sheet.html"),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Ferengi browser portrait orbit</title><style>body{font:14px system-ui;margin:24px;background:#e9e9e9;color:#111}header{max-width:1100px;margin:0 auto 24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}article{background:#fff;padding:12px;border:1px solid #aaa}img{display:block;width:100%;height:330px;object-fit:contain;background:#222}.identity{font-weight:700;margin-bottom:8px}h2{font-size:16px}p{font-size:11px;line-height:1.4;word-break:break-word}code{font-size:10px;word-break:break-all}a{color:#0645ad}</style></head><body><header><h1>Ferengi browser-level residual portraits</h1><p>Candidate-only. Browser rendering and archived-page attribution approve nothing. Each selected final image still needs a source page identifying the performer and visual confirmation of a single, unmasked, neutral-human presentation.</p></header><main>${cards}</main></body></html>`);console.log(`browser portrait orbit: ${entries.length} performers / ${controlled.length} cards / ${entries.reduce((sum,row)=>sum+row.page_count,0)} pages / ${entries.reduce((sum,row)=>sum+row.candidate_count,0)} unique images -> ${OUT}`);
