#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-063-OFFICIAL.json';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-063-official';
const REFERENCE_ROOT=process.env.REFERENCE_ROOT||'';
const UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha=value=>createHash('sha256').update(value).digest('hex');
const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").replace(/[^a-zA-Z0-9']+/g,' ').trim().toLowerCase();
const slug=value=>norm(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'unknown';
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
function signatureMime(bytes){if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
function extensionFor(mime){return mime==='image/jpeg'?'jpg':mime==='image/png'?'png':mime==='image/webp'?'webp':'bin'}
function identify(path){const text=execFileSync(process.env.MAGICK_CMD||'magick',['identify','-format','%w %h',path],{encoding:'utf8'}).trim();const[width,height]=text.split(/\s+/).map(Number);assert(width>0&&height>0,`cannot identify ${path}`);return{width,height}}
function magick(...args){execFileSync(process.env.MAGICK_CMD||'magick',args,{stdio:'inherit'})}
async function walkImages(root,out=[]){let entries;try{entries=await readdir(root,{withFileTypes:true})}catch{return out}for(const entry of entries){const path=join(root,entry.name);if(entry.isDirectory())await walkImages(path,out);else if(/\.(?:jpe?g|png|webp)$/i.test(entry.name))out.push(path)}return out}
async function repositoryHashes(){const map=new Map();try{const manifest=await readJson('data/media-manifest.json');for(const[path,row]of Object.entries(manifest.assets||{})){if(!/^[0-9a-f]{64}$/i.test(row?.sha256||''))continue;const list=map.get(row.sha256)||[];list.push(`manifest:${path}`);map.set(row.sha256,list)}}catch{}for(const path of await walkImages('images')){try{const hash=sha(await readFile(path));const list=map.get(hash)||[];list.push(`file:${path}`);map.set(hash,list)}catch{}}return map}
function addUrl(map,value,kind,context=''){if(!value)return;for(const raw of String(value).split(',')){const token=raw.trim().split(/\s+/)[0].replace(/\\u002F/gi,'/').replace(/\\\//g,'/').replace(/&amp;/g,'&');let url;try{url=new URL(token,control.source_page).href}catch{continue}if(!/^https?:/.test(url))continue;const prior=map.get(url)||{url,kinds:[],contexts:[]};if(!prior.kinds.includes(kind))prior.kinds.push(kind);if(context&&!prior.contexts.includes(context))prior.contexts.push(context.slice(0,1200));map.set(url,prior)}}
function scoreUrl(row){const hay=norm([row.url,...row.kinds,...row.contexts].join(' '));let score=0;if(/grinch/.test(hay))score+=60;if(/universal/.test(hay))score+=25;if(/hero|gallery|still|thumbnail|video/.test(hay))score+=12;if(/keyart|poster|packshot|retailer|logo|icon|play|arrow|privacy|social/.test(hay))score-=80;return score}
function visualDistance(referencePath,candidatePath,index){const root=join(OUT,'compare');mkdirSync(root,{recursive:true});const a=join(root,'reference.png'),b=join(root,`${String(index).padStart(3,'0')}.png`);try{magick(referencePath,'-auto-orient','-resize','192x108^','-gravity','center','-extent','192x108','-colorspace','sRGB',a);magick(candidatePath,'-auto-orient','-resize','192x108^','-gravity','center','-extent','192x108','-colorspace','sRGB',b);let text='';try{execFileSync('compare',['-metric','RMSE',a,b,'null:'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})}catch(error){text=String(error.stderr||error.stdout||'')}const match=text.match(/\((0?\.\d+)\)/);return match?Number(match[1]):null}catch{return null}}

const control=await readJson(CONTROL);
assert(control.version===1&&control.record_id==='UC-063'&&control.actor==='Jim Carrey'&&control.side==='still','UC-063 official control drift');
assert(REFERENCE_ROOT,'REFERENCE_ROOT is required');
const referencePath=join(REFERENCE_ROOT,control.reference_candidate.artifact_path);
const referenceBytes=await readFile(referencePath);
assert(sha(referenceBytes)===control.reference_candidate.sha256,'reference candidate custody drift');
await rm(OUT,{recursive:true,force:true});await mkdir(OUT,{recursive:true});
const repository=await repositoryHashes();
assert(repository.size===control.expected_repository_hash_count,`repository hash denominator drift ${repository.size}`);
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({userAgent:UA,viewport:{width:1440,height:1100},locale:'en-US'});
try{
  const page=await context.newPage();
  await page.goto(control.source_page,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForTimeout(1800);
  for(let i=0;i<5;i++){await page.mouse.wheel(0,1600);await page.waitForTimeout(250)}
  const body=await page.locator('body').innerText().catch(()=>''),html=await page.content(),hay=norm(body+' '+html);
  for(const term of control.required_terms)assert(hay.includes(norm(term)),`official page lacks ${term}`);
  const screenshot='source-page.png';await page.screenshot({path:join(OUT,screenshot),fullPage:true});
  const extracted=await page.evaluate(()=>{const abs=value=>{try{return new URL(value,document.baseURI).href}catch{return''}};const rows=[];for(const selector of['meta[property="og:image"]','meta[property="og:image:secure_url"]','meta[name="twitter:image"]','meta[name="twitter:image:src"]'])for(const meta of document.querySelectorAll(selector))rows.push({value:abs(meta.content),kind:'metadata',context:document.title});for(const image of document.images){for(const value of[image.currentSrc,image.src,image.dataset.src,image.dataset.lazySrc,image.dataset.original,image.dataset.image].filter(Boolean))rows.push({value:abs(value),kind:'dom-image',context:[image.alt,image.closest('figure')?.textContent,image.parentElement?.textContent,document.title].filter(Boolean).join(' ')});for(const part of String(image.srcset||image.dataset.srcset||'').split(',')){const value=part.trim().split(/\s+/)[0];if(value)rows.push({value:abs(value),kind:'srcset',context:image.alt||document.title})}}for(const element of document.querySelectorAll('*')){const bg=getComputedStyle(element).backgroundImage;for(const match of String(bg||'').matchAll(/url\(["']?([^"')]+)["']?\)/g))rows.push({value:abs(match[1]),kind:'computed-background',context:[element.getAttribute('aria-label'),element.textContent?.slice(0,300),document.title].filter(Boolean).join(' ')})}return rows});
  const urlMap=new Map();for(const row of extracted)addUrl(urlMap,row.value,row.kind,row.context);
  for(const match of html.replace(/\\u002F/gi,'/').replace(/\\\//g,'/').matchAll(/https?:[^"'<>\s)]+/g))addUrl(urlMap,match[0],'html-regex','page source');
  const urls=[...urlMap.values()].map(row=>({...row,source_score:scoreUrl(row)})).sort((a,b)=>b.source_score-a.source_score||a.url.localeCompare(b.url)).slice(0,120);
  const downloaded=[],seenHashes=new Set();let index=0;
  for(const row of urls){let response;try{response=await context.request.get(row.url,{headers:{'User-Agent':UA,Referer:control.source_page,Accept:'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.2'},timeout:45000,failOnStatusCode:false})}catch(error){continue}if(!response.ok())continue;const bytes=Buffer.from(await response.body()),mime=signatureMime(bytes);if(bytes.length<8000||mime==='unknown')continue;const local=`candidates/${String(++index).padStart(3,'0')}-${slug(row.kinds[0]||'image')}.${extensionFor(mime)}`,path=join(OUT,local);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);let dimensions;try{dimensions=identify(path)}catch{continue}if(dimensions.width<320||dimensions.height<240)continue;const hash=sha(bytes);if(seenHashes.has(hash))continue;seenHashes.add(hash);const distance=visualDistance(referencePath,path,index);downloaded.push({...row,local,mime,bytes:bytes.length,sha256:hash,...dimensions,resolved_url:response.url()||row.url,repository_matches:repository.get(hash)||[],reference_rmse:distance})}
  downloaded.sort((a,b)=>(a.reference_rmse??99)-(b.reference_rmse??99)||b.source_score-a.source_score||b.width*b.height-a.width*a.height);
  assert(downloaded.length>0,'official Universal probe produced no usable images');
  const thumbs=[];for(let i=0;i<downloaded.length;i++){const row=downloaded[i],thumb=join(OUT,'thumbs',`${String(i+1).padStart(2,'0')}.jpg`);await mkdir(dirname(thumb),{recursive:true});magick(join(OUT,row.local),'-auto-orient','-thumbnail','360x300>','-background','#171512','-gravity','center','-extent','360x300','-fill','white','-undercolor','#171512cc','-gravity','south','-pointsize','12','-annotate','+0+4',`${String(i+1).padStart(2,'0')} d=${row.reference_rmse===null?'n/a':row.reference_rmse.toFixed(4)} ${row.width}x${row.height}`,'-strip','-quality','88',thumb);thumbs.push(thumb)}
  const contact=join(OUT,'contact-sheet.jpg');execFileSync('montage',[...thumbs,'-tile','4x','-geometry','360x300+10+10','-background','#e8e3d9',contact],{stdio:'inherit'});
  const pageBytes=await readFile(join(OUT,screenshot));
  const manifest={version:1,lane:'card-backfill',record_id:'UC-063',actor:'Jim Carrey',character:'The Grinch',production:'How the Grinch Stole Christmas',year:2000,side:'still',source:{provider:'Universal Pictures At Home',source_page:control.source_page,resolved_page:page.url(),title:await page.title(),required_terms:control.required_terms,page_screenshot:{path:screenshot,sha256:sha(pageBytes)}},checkpoint:{control_sha256:sha(await readFile(CONTROL)),discovery_artifact:control.discovery_artifact,reference_candidate:control.reference_candidate},repository_hash_count:repository.size,candidates:downloaded,contact_sheet:{path:'contact-sheet.jpg',...identify(contact)},disposition:'candidate-only-pending-visual-selection',canonical_mutation:false};
  await writeJson(join(OUT,'manifest.json'),manifest);
  await writeJson(join(OUT,'summary.json'),{record_id:'UC-063',source:'Universal Pictures At Home',candidate_count:downloaded.length,ranked:downloaded.map(({local,url,sha256,width,height,bytes,mime,reference_rmse,repository_matches,source_score})=>({local,url,sha256,width,height,bytes,mime,reference_rmse,repository_matches,source_score}))});
  console.log(`UC-063 official probe retained ${downloaded.length} candidate(s)`);console.log(`source-page ${sha(pageBytes)}`);console.log(`artifact ${OUT}`);
}finally{await browser.close()}
