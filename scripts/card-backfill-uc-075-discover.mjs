#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-075.json';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-075';
const UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha=value=>createHash('sha256').update(value).digest('hex');
const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').replace(/[^a-zA-Z0-9']+/g,' ').trim().toLowerCase();
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
function signatureMime(bytes){if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
function identify(path){const text=execFileSync(process.env.MAGICK_CMD||'magick',['identify','-format','%w %h',path],{encoding:'utf8'}).trim();const[width,height]=text.split(/\s+/).map(Number);assert(width>0&&height>0,`cannot identify ${path}`);return{width,height}}
function magick(...args){execFileSync(process.env.MAGICK_CMD||'magick',args,{stdio:'inherit'})}
async function walkImages(root,out=[]){let entries;try{entries=await readdir(root,{withFileTypes:true})}catch{return out}for(const entry of entries){const path=join(root,entry.name);if(entry.isDirectory())await walkImages(path,out);else if(/\.(?:jpe?g|png|webp)$/i.test(entry.name))out.push(path)}return out}
async function repositoryHashes(){const map=new Map();try{const manifest=await readJson('data/media-manifest.json');for(const[path,row]of Object.entries(manifest.assets||{})){if(!/^[0-9a-f]{64}$/i.test(row?.sha256||''))continue;const list=map.get(row.sha256)||[];list.push(`manifest:${path}`);map.set(row.sha256,list)}}catch{}for(const path of await walkImages('images')){try{const hash=sha(await readFile(path));const list=map.get(hash)||[];list.push(`file:${path}`);map.set(hash,list)}catch{}}return map}
async function inspectPage(context,url,requiredTerms,key){const page=await context.newPage();try{const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForTimeout(1600);for(let i=0;i<4;i++){await page.mouse.wheel(0,1600);await page.waitForTimeout(250)}const body=await page.locator('body').innerText().catch(()=>''),html=await page.content(),hay=norm(body+' '+html),missing=requiredTerms.filter(term=>!hay.includes(norm(term)));const screenshot=`pages/${key}.png`;await mkdir(join(OUT,'pages'),{recursive:true});await page.screenshot({path:join(OUT,screenshot),fullPage:true});return{status:'loaded',http_status:response?.status()||null,title:await page.title(),resolved_url:page.url(),required_terms:requiredTerms,required_terms_missing:missing,body_text:body.slice(0,16000),screenshot}}catch(error){return{status:'error',error:error.message,required_terms:requiredTerms,required_terms_missing:requiredTerms}}finally{await page.close()}}
async function download(context,source){const response=await context.request.get(source.original_url,{headers:{'User-Agent':UA,Referer:source.source_page,Accept:'image/jpeg,image/*,*/*;q=0.2'},timeout:60000,failOnStatusCode:false});assert(response.ok(),`${source.key} original HTTP ${response.status()}`);const bytes=Buffer.from(await response.body()),mime=signatureMime(bytes);assert(mime==='image/jpeg'&&bytes.length>50000,`${source.key} original unusable ${bytes.length} ${mime}`);const local=`candidates/${source.key}.jpg`,path=join(OUT,local);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);const dimensions=identify(path);assert(dimensions.width===source.expected_width&&dimensions.height===source.expected_height,`${source.key} geometry drift ${dimensions.width}x${dimensions.height} vs ${source.expected_width}x${source.expected_height}`);return{key:source.key,provider:source.provider,title:source.title,source_page:source.source_page,original_url:source.original_url,local,mime,bytes:bytes.length,sha256:sha(bytes),...dimensions,description:source.description,date:source.date,author:source.author,license:source.license}}

const control=await readJson(CONTROL);
assert(control.version===1&&control.record_id==='UC-075'&&control.actor==='Lou Ferrigno'&&control.character==='The Hulk'&&control.side==='still','UC-075 discovery scope drift');
assert(control.selector_artifact?.artifact_id===8640701810&&control.selector_artifact?.head_sha==='8d2bd0c49c708fe0e4fddde69a55fdc3d74d249c','UC-075 selector custody drift');
assert(control.failed_discovery_checkpoints?.length===2,'UC-075 failed checkpoint ledger drift');
assert(control.image_sources?.length===2&&control.image_sources.every(source=>source.original_url&&source.expected_width&&source.expected_height)&&control.identity_source?.provider==='Universal Pictures At Home','UC-075 source-set drift');
assert(control.commons_api?.required_for_acceptance===false,'UC-075 Commons API must remain optional');
await mkdir(OUT,{recursive:true});
const repository=await repositoryHashes();
assert(repository.size===control.expected_repository_hash_count,`repository hash denominator drift ${repository.size}`);
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({userAgent:UA,viewport:{width:1440,height:1100},locale:'en-US'});
try{
  const identityEvidence=await inspectPage(context,control.identity_source.source_page,control.identity_source.required_terms,'universal-identity');
  assert(identityEvidence.status==='loaded'&&identityEvidence.required_terms_missing.length===0,`Universal identity evidence failed: ${identityEvidence.required_terms_missing.join(', ')}`);
  const fileEvidence={},candidates=[];
  for(const source of control.image_sources){
    const pageEvidence=await inspectPage(context,source.source_page,source.required_terms,`commons-${source.key}`);
    assert(pageEvidence.status==='loaded'&&pageEvidence.required_terms_missing.length===0,`${source.key} Commons page evidence failed: ${pageEvidence.required_terms_missing.join(', ')}`);
    const candidate=await download(context,source);
    candidate.repository_matches=repository.get(candidate.sha256)||[];
    fileEvidence[source.key]={page:pageEvidence,pinned_original:{url:source.original_url,width:source.expected_width,height:source.expected_height,description:source.description,date:source.date,author:source.author,license:source.license},api_status:'not-required-after-rate-limit'};
    candidates.push(candidate);
  }
  assert(new Set(candidates.map(row=>row.sha256)).size===candidates.length,'UC-075 candidate bytes are unexpectedly identical');
  for(const candidate of candidates)assert(candidate.repository_matches.length===0,`${candidate.key} duplicates canonical media: ${candidate.repository_matches.join(', ')}`);
  const thumbs=[];
  for(let index=0;index<candidates.length;index++){
    const row=candidates[index],thumb=join(OUT,'thumbs',`${String(index+1).padStart(2,'0')}-${row.key}.jpg`);
    await mkdir(dirname(thumb),{recursive:true});
    magick(join(OUT,row.local),'-auto-orient','-thumbnail','520x620>','-background','#171512','-gravity','center','-extent','520x620','-fill','white','-undercolor','#171512cc','-gravity','south','-pointsize','16','-annotate','+0+6',`${String(index+1).padStart(2,'0')} ${row.key} ${row.width}x${row.height}`,'-strip','-quality','88',thumb);
    thumbs.push(thumb);
  }
  const contact=join(OUT,'contact-sheet.jpg');
  execFileSync('montage',[...thumbs,'-tile','2x','-geometry','520x620+12+12','-background','#e8e3d9',contact],{stdio:'inherit'});
  const pageScreenshots={universal:{path:identityEvidence.screenshot,sha256:sha(await readFile(join(OUT,identityEvidence.screenshot)))}};
  for(const source of control.image_sources){const screenshotPath=fileEvidence[source.key].page.screenshot;pageScreenshots[source.key]={path:screenshotPath,sha256:sha(await readFile(join(OUT,screenshotPath)))}}
  const manifest={version:1,lane:'card-backfill',record_id:'UC-075',actor:'Lou Ferrigno',character:'The Hulk',production:'The Incredible Hulk',year_range:'1977–82',side:'still',expected_subject:'The Hulk',generated_at:new Date().toISOString(),control_sha256:sha(await readFile(CONTROL)),selector_artifact:control.selector_artifact,failed_discovery_checkpoints:control.failed_discovery_checkpoints,repository_hash_count:repository.size,identity_source:{...control.identity_source,evidence:identityEvidence},image_sources:fileEvidence,page_screenshots,candidates,contact_sheet:{path:'contact-sheet.jpg',...identify(contact)},disposition:'candidate-only-pending-visual-selection',canonical_mutation:false};
  await writeJson(join(OUT,'manifest.json'),manifest);
  await writeJson(join(OUT,'summary.json'),{record_id:'UC-075',actor:'Lou Ferrigno',character:'The Hulk',candidates:candidates.map(({key,title,source_page,original_url,local,mime,bytes,sha256,width,height,repository_matches,description,author,license})=>({key,title,source_page,original_url,local,mime,bytes,sha256,width,height,repository_matches,description,author,license}))});
  console.log(`UC-075 discovery complete: ${candidates.map(row=>`${row.key}=${row.width}x${row.height}`).join(' ')}`);
  console.log(`artifact ${OUT}`);
}finally{await browser.close()}
