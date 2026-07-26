#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-040-RENDER.json';
const SOURCE_ROOT=process.env.SOURCE_ROOT||'';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-040-render';
const sha=value=>createHash('sha256').update(value).digest('hex');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
function signatureMime(bytes){if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
function magick(...args){execFileSync(process.env.MAGICK_CMD||'magick',args,{stdio:'inherit'})}
function identify(path){const text=execFileSync(process.env.MAGICK_CMD||'magick',['identify','-format','%w %h',path],{encoding:'utf8'}).trim();const[width,height]=text.split(/\s+/).map(Number);assert(width>0&&height>0,`cannot identify ${path}`);return{width,height}}
async function fileMeta(path){const bytes=await readFile(path);return{bytes:bytes.length,sha256:sha(bytes),mime:signatureMime(bytes),...identify(path)}}
async function walkImages(root,out=[]){let entries;try{entries=await readdir(root,{withFileTypes:true})}catch{return out}for(const entry of entries){const path=join(root,entry.name);if(entry.isDirectory())await walkImages(path,out);else if(/\.(?:jpe?g|png|webp)$/i.test(entry.name))out.push(path)}return out}
async function repositoryHashes(){const map=new Map();try{const manifest=await readJson('data/media-manifest.json');for(const[path,row]of Object.entries(manifest.assets||{})){if(!/^[0-9a-f]{64}$/i.test(row?.sha256||''))continue;const list=map.get(row.sha256)||[];list.push(`manifest:${path}`);map.set(row.sha256,list)}}catch{}for(const path of await walkImages('images')){try{const hash=sha(await readFile(path));const list=map.get(hash)||[];list.push(`file:${path}`);map.set(hash,list)}catch{}}return map}

assert(SOURCE_ROOT,'SOURCE_ROOT is required');
const control=await readJson(CONTROL);
assert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-040','render control scope drift');
assert(control.actor==='Tim Choate'&&control.side==='portrait'&&control.reviewed_role==='second-desk','render authority drift');
assert(control.ruling?.identity==='expected-subject'&&control.ruling?.presentation==='performer-portrait'&&control.ruling?.canonical_mutation===false,'render ruling drift');
const sourceManifest=await readJson(join(SOURCE_ROOT,'manifest.json'));
assert(sourceManifest.record_id==='UC-040'&&sourceManifest.actor==='Tim Choate'&&sourceManifest.side==='portrait','gather manifest identity drift');
const selected=(sourceManifest.candidates||[]).find(row=>row.local===control.selection.artifact_path);
assert(selected,'authorized MUBI candidate is absent from the gather manifest');
for(const key of['provider','source_page','url','mime','bytes','width','height','sha256'])assert(selected[key]===control.selection[key==='url'?'asset_url':key],`selected candidate ${key} drift`);
assert(Array.isArray(selected.repository_matches)&&selected.repository_matches.length===0,'selected candidate duplicates canonical repository media');
const sourcePath=join(SOURCE_ROOT,control.selection.artifact_path);
const sourcePagePath=join(SOURCE_ROOT,control.selection.source_page_screenshot_path);
const sourceBytes=await readFile(sourcePath);
assert(signatureMime(sourceBytes)===control.selection.mime,'source MIME drift');
assert(sourceBytes.length===control.selection.bytes&&sha(sourceBytes)===control.selection.sha256,'source byte custody drift');
assert(identify(sourcePath).width===control.selection.width&&identify(sourcePath).height===control.selection.height,'source geometry drift');
const pageBytes=await readFile(sourcePagePath);
assert(sha(pageBytes)===control.selection.source_page_screenshot_sha256,'source-page screenshot custody drift');

await rm(OUT,{recursive:true,force:true});
await mkdir(OUT,{recursive:true});
const candidatePath=join(OUT,'uc-040-portrait-candidate.webp');
const pageDest=join(OUT,'source-page.png');
await copyFile(sourcePath,candidatePath);
await copyFile(sourcePagePath,pageDest);
const candidate=await fileMeta(candidatePath);
assert(candidate.sha256===control.selection.sha256&&candidate.mime==='image/webp','candidate copy drift');
assert((await fileMeta(pageDest)).sha256===control.selection.source_page_screenshot_sha256,'source page copy drift');

const resizedPath=join(OUT,'.crop-resized.png');
magick(candidatePath,'-auto-orient','-resize',`${control.crop.width}x${control.crop.height}^`,'-strip',resizedPath);
const resized=identify(resizedPath);
assert(resized.width===control.crop.width&&resized.height>=control.crop.height,`cover resize drift ${resized.width}x${resized.height}`);
const cropTop=Math.round((resized.height-control.crop.height)*control.crop.object_position_y);
assert(cropTop>=0&&cropTop+control.crop.height<=resized.height,'crop offset is outside resized image');
const cropPath=join(OUT,'card-crop-preview.jpg');
magick(resizedPath,'-crop',`${control.crop.width}x${control.crop.height}+0+${cropTop}`,'+repage','-strip','-quality',String(control.crop.quality),cropPath);
await rm(resizedPath,{force:true});
const crop=await fileMeta(cropPath);
assert(crop.mime==='image/jpeg'&&crop.width===control.crop.width&&crop.height===control.crop.height,'crop preview geometry drift');

const repository=await repositoryHashes();
assert(repository.size===control.expected_repository_hash_count,`repository hash denominator drift ${repository.size}`);
const duplicateScan={
  version:1,
  repository_hash_count:repository.size,
  items:[
    {label:'Tim Choate MUBI source / candidate',path:'uc-040-portrait-candidate.webp',sha256:candidate.sha256,matches:repository.get(candidate.sha256)||[]},
    {label:'card crop preview',path:'card-crop-preview.jpg',sha256:crop.sha256,matches:repository.get(crop.sha256)||[]}
  ]
};
for(const row of duplicateScan.items)assert(row.matches.length===0,`${row.label} duplicates canonical repository media: ${row.matches.join(', ')}`);
await writeJson(join(OUT,'duplicate-scan.json'),duplicateScan);
const manifest={
  version:1,
  lane:'card-backfill',
  record_id:'UC-040',
  actor:'Tim Choate',
  character:'Zathras',
  production:'Babylon 5',
  side:'portrait',
  expected_subject:'Tim Choate',
  reviewed_at:control.reviewed_at,
  reviewed_by:control.reviewed_by,
  reviewed_role:control.reviewed_role,
  custody:{gather_artifact:control.gather_artifact,render_control_sha256:sha(await readFile(CONTROL)),gather_manifest_sha256:sha(await readFile(join(SOURCE_ROOT,'manifest.json')))},
  source:{provider:control.selection.provider,source_page:control.selection.source_page,asset_url:control.selection.asset_url,page_title:selected.page_evidence?.title||'',page_screenshot:{path:'source-page.png',sha256:control.selection.source_page_screenshot_sha256},source_note:selected.source_note},
  candidate:{path:'uc-040-portrait-candidate.webp',...candidate},
  crop_preview:{path:'card-crop-preview.jpg',...crop,resize_width:resized.width,resize_height:resized.height,crop_top:cropTop,object_position_y:control.crop.object_position_y,semantics:control.crop.semantics},
  duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:repository.size,status:'pass'},
  exact_subject_review:{identity:control.ruling.identity,presentation:control.ruling.presentation,notes:control.ruling.notes},
  disposition:'candidate-only-reviewed-pending-evidence-seal',
  canonical_mutation:false
};
await writeJson(join(OUT,'manifest.json'),manifest);
await writeJson(join(OUT,'review.json'),{version:1,record_id:'UC-040',actor:'Tim Choate',character:'Zathras',side:'portrait',expected_subject:'Tim Choate',candidate_sha256:candidate.sha256,crop_preview_sha256:crop.sha256,identity_ruling:control.ruling.identity,presentation_ruling:control.ruling.presentation,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,reviewed_at:control.reviewed_at,canonical_mutation:false,disposition:'candidate-only-reviewed-pending-evidence-seal',notes:control.ruling.notes});
await writeFile(join(OUT,'review.md'),`# UC-040 reviewed portrait candidate\n\n- **Record:** UC-040\n- **Performer:** Tim Choate\n- **Displayed role:** Zathras\n- **Source:** [MUBI exact Tim Choate cast page](${control.selection.source_page})\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${crop.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** performer portrait\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${control.ruling.notes.map(note=>`- ${note}`).join('\n')}\n\nThe exact source bytes are retained unchanged as the portrait candidate. The crop preview simulates the existing wall image box and does not modify the source asset. This remains an evidence-only card-backfill candidate for independent canonical acceptance.\n`);
console.log(`RENDERED UC-040 portrait candidate ${candidate.sha256}`);
console.log(`crop ${crop.sha256} at y=${cropTop} from ${resized.width}x${resized.height}`);
console.log(`duplicate scan PASS against ${repository.size} repository hashes`);
console.log(`artifact ${OUT}`);
