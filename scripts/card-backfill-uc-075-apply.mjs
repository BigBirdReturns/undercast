#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const command=process.argv[2]||'materialize';
const CONTROL='.github/CARD-BACKFILL-UC-075-APPLY.json';
const SOURCE_ROOT=process.env.SOURCE_ROOT||'';
const DEST='data/review/card-backfill/UC-075';
const sha=value=>createHash('sha256').update(value).digest('hex');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
function signatureMime(bytes){if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
async function fileMeta(path){const bytes=await readFile(path);return{bytes:bytes.length,sha256:sha(bytes),mime:signatureMime(bytes)}}
async function walkImages(root,out=[]){let entries;try{entries=await readdir(root,{withFileTypes:true})}catch{return out}for(const entry of entries){const path=join(root,entry.name);if(entry.isDirectory())await walkImages(path,out);else if(/\.(?:jpe?g|png|webp)$/i.test(entry.name))out.push(path)}return out}
async function repositoryHashes(){const map=new Map();try{const manifest=await readJson('data/media-manifest.json');for(const[path,row]of Object.entries(manifest.assets||{})){if(!/^[0-9a-f]{64}$/i.test(row?.sha256||''))continue;const list=map.get(row.sha256)||[];list.push(`manifest:${path}`);map.set(row.sha256,list)}}catch{}for(const path of await walkImages('images')){try{const hash=sha(await readFile(path));const list=map.get(hash)||[];list.push(`file:${path}`);map.set(hash,list)}catch{}}return map}

async function loadControl(){
  const control=await readJson(CONTROL);
  assert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-075','UC-075 apply scope drift');
  assert(control.actor==='Lou Ferrigno'&&control.character==='The Hulk'&&control.side==='still'&&control.reviewed_role==='second-desk','UC-075 apply authority drift');
  assert(control.render_artifact?.artifact_id===8641041628&&control.render_artifact?.head_sha==='16a3b81080852f579872be8fcdb57d941191d9f4','UC-075 render artifact custody drift');
  assert(control.render_artifact?.zip_sha256==='bcf3709cd83bb3a81329f1673fae42287fa280213f0a7866e7bb22f6b9bf8eaf','UC-075 render ZIP drift');
  assert(Object.keys(control.expected||{}).length===10,'UC-075 expected render file count drift');
  for(const [name,row] of Object.entries(control.expected||{})){assert(/^[0-9a-f]{64}$/.test(row?.sha256||''),`missing ${name} sha256`);assert(Number.isInteger(row?.bytes)&&row.bytes>0,`missing ${name} bytes`)}
  assert(control.ruling?.identity==='expected-subject'&&control.ruling?.presentation==='character-depiction'&&control.ruling?.crop_ruling==='pass-custom-y350'&&control.ruling?.canonical_mutation===false,'UC-075 apply ruling drift');
  return control;
}

async function verifySource(control){
  assert(SOURCE_ROOT,'SOURCE_ROOT is required');
  for(const [name,expected] of Object.entries(control.expected)){
    const meta=await fileMeta(join(SOURCE_ROOT,name));
    assert(meta.sha256===expected.sha256&&meta.bytes===expected.bytes,`${name} source custody drift`);
    if(/\.jpe?g$/i.test(name))assert(meta.mime==='image/jpeg',`${name} MIME drift`);
    if(/\.png$/i.test(name))assert(meta.mime==='image/png',`${name} MIME drift`);
  }
  const manifest=await readJson(join(SOURCE_ROOT,'manifest.json'));
  const review=await readJson(join(SOURCE_ROOT,'review.json'));
  const duplicates=await readJson(join(SOURCE_ROOT,'duplicate-scan.json'));
  assert(manifest.record_id==='UC-075'&&manifest.actor==='Lou Ferrigno'&&manifest.character==='The Hulk'&&manifest.side==='still','source manifest identity drift');
  assert(manifest.source?.author==='CBS Television'&&String(manifest.source?.license||'').includes('Public domain'),'source provenance drift');
  assert(manifest.identity_source?.provider==='Universal Pictures At Home'&&String(manifest.identity_source?.evidence||'').includes('Lou Ferrigno'),'identity provenance drift');
  assert(manifest.candidate?.sha256===control.expected['uc-075-still-candidate.jpg'].sha256&&manifest.candidate?.width===554&&manifest.candidate?.height===886,'source candidate receipt drift');
  assert(manifest.crop_preview?.sha256===control.expected['card-crop-preview.jpg'].sha256&&manifest.crop_preview?.offset_y===350&&manifest.crop_preview?.width===1246&&manifest.crop_preview?.height===1000,'source crop receipt drift');
  assert(manifest.rejected_alternative?.sha256===control.expected['rejected-banner-hulk.jpg'].sha256&&String(manifest.rejected_alternative?.ruling||'').includes('Bill Bixby'),'source alternative receipt drift');
  assert(manifest.custody?.failed_discovery_checkpoints?.length===3,'failed discovery receipt drift');
  assert(review.identity_ruling==='expected-subject'&&review.presentation_ruling==='character-depiction'&&review.crop_ruling==='pass-custom-y350'&&review.canonical_mutation===false,'source review drift');
  assert(duplicates.status==='pass'&&duplicates.repository_hash_count===control.expected_repository_hash_count&&(duplicates.items||[]).length===3&&(duplicates.items||[]).every(item=>Array.isArray(item.matches)&&item.matches.length===0),'source duplicate boundary drift');
  return{manifest,review,duplicates};
}

async function materialize(){
  const control=await loadControl();
  const source=await verifySource(control);
  await rm(DEST,{recursive:true,force:true});
  await mkdir(DEST,{recursive:true});
  for(const name of Object.keys(control.expected))await copyFile(join(SOURCE_ROOT,name),join(DEST,name));
  const duplicateScan={...source.duplicates,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,status:'pass',semantics:'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'};
  await writeJson(join(DEST,'duplicate-scan.json'),duplicateScan);
  const manifest={...source.manifest,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,custody:{...source.manifest.custody,render_artifact:control.render_artifact,apply_control_sha256:sha(await readFile(CONTROL)),source_manifest_sha256:control.expected['manifest.json'].sha256},duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:duplicateScan.repository_hash_count,status:'pass'},exact_subject_review:{identity:control.ruling.identity,presentation:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,notes:control.ruling.notes},disposition:control.ruling.candidate_disposition,canonical_mutation:false};
  await writeJson(join(DEST,'manifest.json'),manifest);
  const review={...source.review,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,identity_ruling:control.ruling.identity,presentation_ruling:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,canonical_mutation:false,disposition:control.ruling.candidate_disposition,notes:control.ruling.notes};
  await writeJson(join(DEST,'review.json'),review);
  const repository=await repositoryHashes();
  assert(repository.size===control.expected_repository_hash_count,`repository hash denominator drift ${repository.size}`);
  for(const name of['uc-075-still-candidate.jpg','card-crop-preview.jpg','rejected-banner-hulk.jpg']){const hash=(await fileMeta(join(DEST,name))).sha256;assert(!(repository.get(hash)||[]).length,`${name} duplicates canonical media: ${(repository.get(hash)||[]).join(', ')}`)}
  const names=Object.keys(control.expected).sort(),sums=[];
  for(const name of names){const bytes=await readFile(join(DEST,name));sums.push(`${sha(bytes)}  ${name}`)}
  await writeFile(join(DEST,'SHA256SUMS'),sums.join('\n')+'\n');
  await validate();
  console.log(`MATERIALIZED ${DEST}: ${names.length+1} reviewed evidence files`);
  console.log(`candidate ${control.expected['uc-075-still-candidate.jpg'].sha256}`);
  console.log(`crop ${control.expected['card-crop-preview.jpg'].sha256}`);
  console.log('canonical mutation false');
}

async function validate(){
  const control=await loadControl();
  const expectedFiles=['SHA256SUMS',...Object.keys(control.expected)].sort();
  const names=(await readdir(DEST)).sort();
  assert(JSON.stringify(names)===JSON.stringify(expectedFiles),`UC-075 evidence file set drift: ${names.join(', ')}`);
  const sums=String(await readFile(join(DEST,'SHA256SUMS'),'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length===Object.keys(control.expected).length,'SHA256SUMS row count drift');
  for(const line of sums){const match=line.match(/^([0-9a-f]{64})  (.+)$/);assert(match,`malformed checksum ${line}`);assert(sha(await readFile(join(DEST,match[2])))===match[1],`${match[2]} checksum drift`)}
  const manifest=await readJson(join(DEST,'manifest.json')),review=await readJson(join(DEST,'review.json')),duplicates=await readJson(join(DEST,'duplicate-scan.json'));
  assert(manifest.candidate?.sha256===control.expected['uc-075-still-candidate.jpg'].sha256&&review.candidate_sha256===control.expected['uc-075-still-candidate.jpg'].sha256,'permanent candidate receipt drift');
  assert(manifest.crop_preview?.sha256===control.expected['card-crop-preview.jpg'].sha256&&review.crop_preview_sha256===control.expected['card-crop-preview.jpg'].sha256&&manifest.crop_preview?.offset_y===350,'permanent crop receipt drift');
  assert(manifest.rejected_alternative?.sha256===control.expected['rejected-banner-hulk.jpg'].sha256&&review.rejected_alternative_sha256===control.expected['rejected-banner-hulk.jpg'].sha256,'permanent alternative receipt drift');
  assert(manifest.custody?.render_artifact?.artifact_id===8641041628&&manifest.custody?.apply_control_sha256,'permanent custody drift');
  assert(review.identity_ruling==='expected-subject'&&review.presentation_ruling==='character-depiction'&&review.crop_ruling==='pass-custom-y350'&&review.canonical_mutation===false,'permanent review drift');
  assert(duplicates.status==='pass'&&duplicates.repository_hash_count===2070&&(duplicates.items||[]).every(item=>item.matches?.length===0),'permanent duplicate receipt drift');
  for(const name of['uc-075-still-candidate.jpg','card-crop-preview.jpg','rejected-banner-hulk.jpg','source-page.png','identity-page.png','alternative-page.png'])assert((await stat(join(DEST,name))).isFile(),`${name} is not a regular file`);
  console.log(`VALID ${DEST}: exact Hulk evidence packet; no canonical mutation`);
}

if(command==='materialize')await materialize();else if(command==='validate')await validate();else throw new Error(`unknown command ${command}`);
