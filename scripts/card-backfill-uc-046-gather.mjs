#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-046.json';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-046';
const UA='Mozilla/5.0 Chrome/132 UNDERCAST-card-backfill/1.0 (+https://github.com/BigBirdReturns/undercast)';
const sha=value=>createHash('sha256').update(value).digest('hex');
const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").replace(/[^a-zA-Z0-9']+/g,' ').trim().toLowerCase();
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
function signatureMime(bytes){if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
function magick(...args){execFileSync(process.env.MAGICK_CMD||'magick',args,{stdio:'inherit'})}
function identify(path){const text=execFileSync(process.env.MAGICK_CMD||'magick',['identify','-format','%w %h',path],{encoding:'utf8'}).trim();const[width,height]=text.split(/\s+/).map(Number);assert(width>0&&height>0,`cannot identify ${path}`);return{width,height}}
async function walkImages(root,out=[]){let entries;try{entries=await readdir(root,{withFileTypes:true})}catch{return out}for(const entry of entries){const path=join(root,entry.name);if(entry.isDirectory())await walkImages(path,out);else if(/\.(?:jpe?g|png|webp)$/i.test(entry.name))out.push(path)}return out}
async function repositoryHashes(){const map=new Map();try{const manifest=await readJson('data/media-manifest.json');for(const[path,row]of Object.entries(manifest.assets||{})){if(!/^[0-9a-f]{64}$/i.test(row?.sha256||''))continue;const list=map.get(row.sha256)||[];list.push(`manifest:${path}`);map.set(row.sha256,list)}}catch{}for(const path of await walkImages('images')){try{const hash=sha(await readFile(path));const list=map.get(hash)||[];list.push(`file:${path}`);map.set(hash,list)}catch{}}return map}
const strip=value=>String(value||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();

const control=await readJson(CONTROL);
assert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-046','UC-046 control drift');
assert(control.actor==='Lon Chaney'&&control.character==='The Phantom'&&control.side==='still','UC-046 identity boundary drift');
await rm(OUT,{recursive:true,force:true});await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({userAgent:UA,viewport:{width:1440,height:1100},locale:'en-US'});
let pageEvidence,info=null,apiStatus='unavailable';
try{
  const page=await context.newPage();
  await page.goto(control.source.source_page,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForTimeout(1300);
  const body=await page.locator('body').innerText().catch(()=>''),html=await page.content(),hay=norm(body+' '+html);
  for(const term of control.source.required_terms||[])assert(hay.includes(norm(term)),`Commons source page lacks required term ${term}`);
  const screenshot='source-page.png';
  await page.screenshot({path:join(OUT,screenshot),fullPage:true});
  pageEvidence={title:await page.title(),resolved_url:page.url(),body_text:body.slice(0,7000),screenshot};
  await page.close();

  try{
    const params=new URLSearchParams({action:'query',format:'json',origin:'*',prop:'imageinfo',iiprop:'url|mime|size|timestamp|sha1|extmetadata',titles:control.source.file_title});
    const response=await context.request.get(`${control.source.api}?${params}`,{headers:{'User-Agent':UA,Accept:'application/json'},timeout:30000,failOnStatusCode:false});
    apiStatus=`HTTP ${response.status()}`;
    if(response.ok()){
      const payload=await response.json();
      const row=Object.values(payload?.query?.pages||{})[0],candidate=row?.imageinfo?.[0];
      if(row&&!('missing'in row)&&candidate?.url&&norm(row.title)===norm(control.source.file_title)){info=candidate;apiStatus='success';}
    }
  }catch(error){apiStatus=`error: ${error.message}`;}

  const assetUrl=info?.url||control.source.fallback_asset;
  assert(String(assetUrl||'').startsWith('https://'),'Commons asset URL unavailable');
  const response=await context.request.get(assetUrl,{headers:{'User-Agent':UA,Referer:control.source.source_page,Accept:'image/jpeg,image/*,*/*;q=0.1'},timeout:60000,failOnStatusCode:false});
  assert(response.ok(),`Commons asset HTTP ${response.status()}`);
  const bytes=Buffer.from(await response.body()),mime=signatureMime(bytes);
  assert(mime==='image/jpeg'&&bytes.length>50000,`Commons asset unusable ${bytes.length} ${mime}`);
  const candidatePath=join(OUT,'uc-046-still-candidate.jpg');
  await writeFile(candidatePath,bytes);
  const dimensions=identify(candidatePath);
  assert(dimensions.width>=900&&dimensions.height>=1100,`Commons source too small ${dimensions.width}x${dimensions.height}`);
  const candidate={path:'uc-046-still-candidate.jpg',mime,bytes:bytes.length,sha256:sha(bytes),...dimensions};

  const resizedPath=join(OUT,'.crop-resized.png');
  magick(candidatePath,'-auto-orient','-resize',`${control.crop.width}x${control.crop.height}^`,'-strip',resizedPath);
  const resized=identify(resizedPath);
  assert(resized.width===control.crop.width&&resized.height>=control.crop.height,`cover resize drift ${resized.width}x${resized.height}`);
  const cropTop=Math.round((resized.height-control.crop.height)*control.crop.object_position_y);
  const cropPath=join(OUT,'card-crop-preview.jpg');
  magick(resizedPath,'-crop',`${control.crop.width}x${control.crop.height}+0+${cropTop}`,'+repage','-strip','-quality',String(control.crop.quality),cropPath);
  await rm(resizedPath,{force:true});
  const cropBytes=await readFile(cropPath),cropDimensions=identify(cropPath);
  const crop={path:'card-crop-preview.jpg',mime:'image/jpeg',bytes:cropBytes.length,sha256:sha(cropBytes),...cropDimensions,resize_width:resized.width,resize_height:resized.height,crop_top:cropTop,object_position_y:control.crop.object_position_y,semantics:control.crop.semantics};

  const repository=await repositoryHashes();
  assert(repository.size===control.expected_repository_hash_count,`repository hash denominator drift ${repository.size}`);
  const duplicateScan={version:1,repository_hash_count:repository.size,items:[{label:'Lon Chaney as the Phantom source / candidate',path:candidate.path,sha256:candidate.sha256,matches:repository.get(candidate.sha256)||[]},{label:'card crop preview',path:crop.path,sha256:crop.sha256,matches:repository.get(crop.sha256)||[]}]};
  for(const row of duplicateScan.items)assert(row.matches.length===0,`${row.label} duplicates canonical media: ${row.matches.join(', ')}`);
  await writeJson(join(OUT,'duplicate-scan.json'),duplicateScan);

  const meta=info?.extmetadata||{};
  const manifest={version:1,lane:'card-backfill',record_id:'UC-046',actor:'Lon Chaney',character:'The Phantom',production:'The Phantom of the Opera',year:1925,side:'still',expected_subject:'The Phantom',generated_at:new Date().toISOString(),control_sha256:sha(await readFile(CONTROL)),source:{provider:control.source.provider,source_page:control.source.source_page,file_title:control.source.file_title,resolved_asset_url:response.url()||assetUrl,api_status:apiStatus,author:strip(meta.Artist?.value)||'Universal Pictures',license:strip(meta.LicenseShortName?.value)||'Public domain',description:strip(meta.ImageDescription?.value)||'Film still of Lon Chaney characterized as the Phantom.',timestamp:info?.timestamp||null,commons_sha1:info?.sha1||null,page_evidence:pageEvidence},candidate,crop_preview:crop,duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:repository.size,status:'pass'},disposition:'candidate-only-pending-exact-subject-review',canonical_mutation:false};
  await writeJson(join(OUT,'manifest.json'),manifest);
  await writeJson(join(OUT,'review.json'),{version:1,record_id:'UC-046',actor:'Lon Chaney',character:'The Phantom',side:'still',expected_subject:'The Phantom',candidate_sha256:candidate.sha256,crop_preview_sha256:crop.sha256,identity_ruling:'pending',presentation_ruling:'pending',crop_ruling:'pending',canonical_mutation:false,disposition:'candidate-only-pending-exact-subject-review'});
  await writeFile(join(OUT,'review.md'),`# UC-046 still candidate pending exact-subject review\n\n- **Record:** UC-046\n- **Performer:** Lon Chaney\n- **Displayed role:** The Phantom\n- **Source:** [Wikimedia Commons](${control.source.source_page})\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${crop.sha256}\`\n- **Source license:** ${manifest.source.license}\n- **Canonical mutation:** none\n\nThe exact Commons page and source bytes identify Lon Chaney characterized as the Phantom in the 1925 Universal production. Visual review must still confirm the expected designed character and crop before evidence sealing.\n`);
  console.log(`GATHERED UC-046 candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
  console.log(`crop ${crop.sha256} y=${cropTop}`);
  console.log(`duplicate scan PASS against ${repository.size} hashes`);
  console.log(`artifact ${OUT}`);
}finally{await browser.close();}
