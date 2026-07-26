#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-066.json';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-066';
const UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha=value=>createHash('sha256').update(value).digest('hex');
const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").replace(/[^a-zA-Z0-9']+/g,' ').trim().toLowerCase();
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
function signatureMime(bytes){if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
function identify(path){const text=execFileSync(process.env.MAGICK_CMD||'magick',['identify','-format','%w %h',path],{encoding:'utf8'}).trim();const[width,height]=text.split(/\s+/).map(Number);assert(width>0&&height>0,`cannot identify ${path}`);return{width,height}}
function magick(...args){execFileSync(process.env.MAGICK_CMD||'magick',args,{stdio:'inherit'})}
async function walkImages(root,out=[]){let entries;try{entries=await readdir(root,{withFileTypes:true})}catch{return out}for(const entry of entries){const path=join(root,entry.name);if(entry.isDirectory())await walkImages(path,out);else if(/\.(?:jpe?g|png|webp)$/i.test(entry.name))out.push(path)}return out}
async function repositoryHashes(){const map=new Map();try{const manifest=await readJson('data/media-manifest.json');for(const[path,row]of Object.entries(manifest.assets||{})){if(!/^[0-9a-f]{64}$/i.test(row?.sha256||''))continue;const list=map.get(row.sha256)||[];list.push(`manifest:${path}`);map.set(row.sha256,list)}}catch{}for(const path of await walkImages('images')){try{const hash=sha(await readFile(path));const list=map.get(hash)||[];list.push(`file:${path}`);map.set(hash,list)}catch{}}return map}

const control=await readJson(CONTROL);
assert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-066','UC-066 control scope drift');
assert(control.actor==='John Hurt'&&control.character==='John Merrick'&&control.side==='still','UC-066 identity boundary drift');
assert(control.selector_artifact?.artifact_id===8635870595&&control.selector_artifact?.head_sha==='cb1f9ebafb44ba59a8bf2a2a4c995ac60e250e60','UC-066 selector custody drift');
assert(control.source?.provider==='The Criterion Collection'&&control.source?.gallery_assets?.length===7,'UC-066 source set drift');
await mkdir(OUT,{recursive:true});
const repository=await repositoryHashes();
assert(repository.size===control.expected_repository_hash_count,`repository hash denominator drift ${repository.size}`);
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({userAgent:UA,viewport:{width:1440,height:1100},locale:'en-US'});
try{
  const page=await context.newPage();
  await page.goto(control.source.source_page,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForTimeout(1400);
  const body=await page.locator('body').innerText().catch(()=>''),html=await page.content(),hay=norm(body+' '+html);
  for(const term of control.source.required_terms)assert(hay.includes(norm(term)),`Criterion page lacks ${term}`);
  for(const asset of control.source.gallery_assets)assert(html.includes(asset.url),`Criterion page no longer exposes ${asset.key}`);
  const screenshot='source-page.png';
  await page.screenshot({path:join(OUT,screenshot),fullPage:true});
  const pageBytes=await readFile(join(OUT,screenshot));
  const candidates=[];
  for(let index=0;index<control.source.gallery_assets.length;index++){
    const asset=control.source.gallery_assets[index];
    const response=await context.request.get(asset.url,{headers:{'User-Agent':UA,Referer:control.source.source_page,Accept:'image/jpeg,image/*,*/*;q=0.2'},timeout:60000,failOnStatusCode:false});
    assert(response.ok(),`${asset.key} HTTP ${response.status()}`);
    const bytes=Buffer.from(await response.body()),mime=signatureMime(bytes);
    assert(mime==='image/jpeg'&&bytes.length>10000,`${asset.key} unusable ${bytes.length} ${mime}`);
    const local=`candidates/${asset.key}.jpg`,path=join(OUT,local);
    await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);
    const dimensions=identify(path);
    assert(dimensions.width>=600&&dimensions.height>=300,`${asset.key} geometry too small ${dimensions.width}x${dimensions.height}`);
    const hash=sha(bytes);
    candidates.push({key:asset.key,provider:control.source.provider,source_page:control.source.source_page,url:asset.url,resolved_url:response.url()||asset.url,local,mime,bytes:bytes.length,sha256:hash,...dimensions,repository_matches:repository.get(hash)||[],disposition:'candidate-only-pending-visual-selection'});
  }
  assert(new Set(candidates.map(row=>row.sha256)).size===candidates.length,'Criterion gallery contains exact-byte duplicates');
  const thumbs=[];
  for(let index=0;index<candidates.length;index++){
    const row=candidates[index],thumb=join(OUT,'thumbs',`${String(index+1).padStart(2,'0')}.jpg`);
    await mkdir(dirname(thumb),{recursive:true});
    magick(join(OUT,row.local),'-auto-orient','-thumbnail','420x300>','-background','#171512','-gravity','center','-extent','420x300','-fill','white','-undercolor','#171512cc','-gravity','south','-pointsize','16','-annotate','+0+5',`${String(index+1).padStart(2,'0')} ${row.key} ${row.width}x${row.height}`,'-strip','-quality','88',thumb);
    thumbs.push(thumb);
  }
  const contact=join(OUT,'contact-sheet.jpg');
  execFileSync('montage',[...thumbs,'-tile','3x','-geometry','420x300+10+10','-background','#e8e3d9',contact],{stdio:'inherit'});
  const manifest={version:1,lane:'card-backfill',record_id:'UC-066',actor:'John Hurt',character:'John Merrick',production:'The Elephant Man',year:1980,side:'still',expected_subject:'John Merrick',generated_at:new Date().toISOString(),control_sha256:sha(await readFile(CONTROL)),selector_artifact:control.selector_artifact,repository_hash_count:repository.size,source:{provider:control.source.provider,source_page:control.source.source_page,resolved_page:page.url(),page_title:await page.title(),required_terms:control.source.required_terms,page_screenshot:{path:screenshot,sha256:sha(pageBytes)},evidence:'Criterion identifies John Merrick as John Hurt and credits Christopher Tucker with designing and creating the Elephant Man makeup.'},candidates,contact_sheet:{path:'contact-sheet.jpg',...identify(contact)},disposition:'candidate-only-pending-visual-selection',canonical_mutation:false};
  await writeJson(join(OUT,'manifest.json'),manifest);
  await writeJson(join(OUT,'summary.json'),{record_id:'UC-066',actor:'John Hurt',character:'John Merrick',candidate_count:candidates.length,candidates:candidates.map(({key,local,sha256,width,height,bytes,repository_matches})=>({key,local,sha256,width,height,bytes,repository_matches}))});
  const cards=candidates.map((row,index)=>`<article><img src="${row.local}" alt=""><h2>${index+1} · ${row.key}</h2><p>${row.width}×${row.height} · ${row.bytes} bytes</p><p>${row.repository_matches.length?`duplicate: ${row.repository_matches.join(', ')}`:'no exact repository duplicate'}</p><code>${row.sha256}</code></article>`).join('');
  await writeFile(join(OUT,'review.html'),`<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.sheet{max-width:100%}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}article{background:white;padding:10px}article img{width:100%;height:340px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-066 · John Hurt / John Merrick Criterion gallery</h1><p>Candidate-only. Approve only John Hurt as John Merrick; reject other cast, the historical Joseph Merrick, stage adaptations, cover art, posters, or ambiguous masked figures.</p><img class="sheet" src="contact-sheet.jpg"><div class="grid">${cards}</div>`);
  console.log(`UC-066 Criterion orbit: ${candidates.length} exact gallery candidates`);
  console.log(`source-page ${sha(pageBytes)}`);
  console.log(`artifact ${OUT}`);
}finally{await browser.close()}
