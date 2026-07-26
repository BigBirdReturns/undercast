#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-070-RENDER.json';
const SOURCE_ROOT=process.env.SOURCE_ROOT||'';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-070-render';
const sha=value=>createHash('sha256').update(value).digest('hex');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
function signatureMime(bytes){if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
function identify(path){const text=execFileSync(process.env.MAGICK_CMD||'magick',['identify','-format','%w %h',path],{encoding:'utf8'}).trim();const[width,height]=text.split(/\s+/).map(Number);assert(width>0&&height>0,`cannot identify ${path}`);return{width,height}}
function magick(...args){execFileSync(process.env.MAGICK_CMD||'magick',args,{stdio:'inherit'})}
async function fileMeta(path){const bytes=await readFile(path);return{bytes:bytes.length,sha256:sha(bytes),mime:signatureMime(bytes),...identify(path)}}
async function walkImages(root,out=[]){let entries;try{entries=await readdir(root,{withFileTypes:true})}catch{return out}for(const entry of entries){const path=join(root,entry.name);if(entry.isDirectory())await walkImages(path,out);else if(/\.(?:jpe?g|png|webp)$/i.test(entry.name))out.push(path)}return out}
async function repositoryHashes(){const map=new Map();try{const manifest=await readJson('data/media-manifest.json');for(const[path,row]of Object.entries(manifest.assets||{})){if(!/^[0-9a-f]{64}$/i.test(row?.sha256||''))continue;const list=map.get(row.sha256)||[];list.push(`manifest:${path}`);map.set(row.sha256,list)}}catch{}for(const path of await walkImages('images')){try{const hash=sha(await readFile(path));const list=map.get(hash)||[];list.push(`file:${path}`);map.set(hash,list)}catch{}}return map}

assert(SOURCE_ROOT,'SOURCE_ROOT is required');
const control=await readJson(CONTROL);
assert(control.version===1&&control.record_id==='UC-070'&&control.actor==='Bill Nighy'&&control.side==='still','UC-070 render scope drift');
assert(control.discovery_artifact?.artifact_id===8636699882&&control.discovery_artifact?.head_sha==='892b45b6d78bcbe9476009d1ff01ebc02851210b','UC-070 discovery artifact custody drift');
assert(control.failed_render_checkpoint?.artifact_id===8636751669&&control.failed_render_checkpoint?.head_sha==='1e900d6e06a2ab75230f3f16ece56afd5f65c03a','UC-070 failed-render checkpoint drift');
assert(control.ruling?.identity==='expected-subject'&&control.ruling?.presentation==='character-depiction'&&control.ruling?.crop_ruling==='pass-center-focus'&&control.ruling?.canonical_mutation===false,'UC-070 ruling drift');
assert(control.crop?.gravity==='center'&&control.rejected_visual_duplicates?.length===4,'UC-070 crop or visual-duplicate boundary drift');

const sourceManifestPath=join(SOURCE_ROOT,'manifest.json');
const sourceManifestBytes=await readFile(sourceManifestPath);
assert(sha(sourceManifestBytes)===control.selection.source_manifest_sha256,'discovery manifest custody drift');
const sourceManifest=JSON.parse(sourceManifestBytes.toString('utf8'));
assert(sourceManifest.record_id==='UC-070'&&sourceManifest.actor==='Bill Nighy'&&sourceManifest.character==='Davy Jones','discovery manifest identity drift');
const selected=(sourceManifest.candidates||[]).find(row=>row.local===control.selection.artifact_path);
assert(selected,'authorized Davy Jones candidate absent from discovery manifest');
assert(selected.provider===control.selection.provider&&selected.source_key===control.selection.source_key,'selected source identity drift');
assert(selected.source_page===control.selection.source_page&&selected.url===control.selection.asset_url,'selected source URL drift');
assert(selected.mime===control.selection.mime&&selected.bytes===control.selection.bytes&&selected.width===control.selection.width&&selected.height===control.selection.height&&selected.sha256===control.selection.sha256,'selected Davy Jones byte receipt drift');
assert(Array.isArray(selected.repository_matches)&&selected.repository_matches.length===0,'selected Davy Jones candidate duplicates canonical media');
assert(String(selected.local_context||'').includes('Davy Jones (Bill Nighy)')&&String(selected.local_context||'').includes('ILM & Disney'),'selected source caption drift');
const pageEvidence=sourceManifest.page_evidence?.[control.selection.source_key];
assert(pageEvidence?.status==='loaded'&&Array.isArray(pageEvidence?.required_terms_missing)&&pageEvidence.required_terms_missing.length===0,'selected ILM page evidence incomplete');
assert(String(pageEvidence.title||'').includes('ILM Evolutions'),'selected ILM page title drift');

const sourcePath=join(SOURCE_ROOT,control.selection.artifact_path),pagePath=join(SOURCE_ROOT,control.selection.source_page_screenshot_path);
const sourceBytes=await readFile(sourcePath),pageBytes=await readFile(pagePath);
assert(signatureMime(sourceBytes)==='image/jpeg'&&sourceBytes.length===control.selection.bytes&&sha(sourceBytes)===control.selection.sha256,'source Davy Jones byte custody drift');
assert(signatureMime(pageBytes)==='image/png'&&sha(pageBytes)===control.selection.source_page_screenshot_sha256,'source page screenshot custody drift');
const sourceDimensions=identify(sourcePath);assert(sourceDimensions.width===2045&&sourceDimensions.height===1147,'source Davy Jones geometry drift');

await rm(OUT,{recursive:true,force:true});await mkdir(OUT,{recursive:true});
const candidatePath=join(OUT,'uc-070-still-candidate.jpg'),pageDest=join(OUT,'source-page.png');
await copyFile(sourcePath,candidatePath);await copyFile(pagePath,pageDest);
const candidate=await fileMeta(candidatePath);assert(candidate.sha256===control.selection.sha256,'candidate copy drift');
const cropPath=join(OUT,'card-crop-preview.jpg');
magick(candidatePath,'-auto-orient','-resize',`${control.crop.width}x${control.crop.height}^`,'-gravity',control.crop.gravity,'-extent',`${control.crop.width}x${control.crop.height}`,'-strip','-quality',String(control.crop.quality),cropPath);
const crop=await fileMeta(cropPath);assert(crop.mime==='image/jpeg'&&crop.width===1246&&crop.height===1000,'crop geometry drift');

const repository=await repositoryHashes();assert(repository.size===control.expected_repository_hash_count,`repository hash denominator drift ${repository.size}`);
const duplicateScan={version:1,repository_hash_count:repository.size,items:[{label:'ILM and Disney Davy Jones source / candidate',path:'uc-070-still-candidate.jpg',sha256:candidate.sha256,matches:repository.get(candidate.sha256)||[]},{label:'center-focused wall crop preview',path:'card-crop-preview.jpg',sha256:crop.sha256,matches:repository.get(crop.sha256)||[]}]};
for(const row of duplicateScan.items)assert(row.matches.length===0,`${row.label} duplicates canonical media: ${row.matches.join(', ')}`);
await writeJson(join(OUT,'duplicate-scan.json'),duplicateScan);

const manifest={version:1,lane:'card-backfill',record_id:'UC-070',actor:'Bill Nighy',character:'Davy Jones',production:'Pirates of the Caribbean',year:2006,side:'still',expected_subject:'Davy Jones',reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,custody:{discovery_artifact:control.discovery_artifact,failed_render_checkpoint:control.failed_render_checkpoint,render_control_sha256:sha(await readFile(CONTROL)),discovery_manifest_sha256:control.selection.source_manifest_sha256},source:{provider:control.selection.provider,source_key:control.selection.source_key,source_page:control.selection.source_page,asset_url:control.selection.asset_url,page_title:pageEvidence.title,resolved_page:pageEvidence.resolved_url,page_screenshot:{path:'source-page.png',sha256:control.selection.source_page_screenshot_sha256},caption:control.selection.source_caption,credit:'ILM & Disney'},candidate:{path:'uc-070-still-candidate.jpg',...candidate},crop_preview:{path:'card-crop-preview.jpg',...crop,gravity:control.crop.gravity,semantics:control.crop.semantics},rejected_visual_duplicates:control.rejected_visual_duplicates,duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:repository.size,status:'pass'},exact_subject_review:{identity:control.ruling.identity,presentation:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,notes:control.ruling.notes},disposition:control.ruling.candidate_disposition,canonical_mutation:false};
await writeJson(join(OUT,'manifest.json'),manifest);
await writeJson(join(OUT,'review.json'),{version:1,record_id:'UC-070',actor:'Bill Nighy',character:'Davy Jones',side:'still',expected_subject:'Davy Jones',candidate_sha256:candidate.sha256,crop_preview_sha256:crop.sha256,identity_ruling:control.ruling.identity,presentation_ruling:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,reviewed_at:control.reviewed_at,canonical_mutation:false,disposition:control.ruling.candidate_disposition,notes:control.ruling.notes});
await writeFile(join(OUT,'review.md'),`# UC-070 reviewed Davy Jones still candidate\n\n- **Record:** UC-070\n- **Performer:** Bill Nighy\n- **Displayed role:** Davy Jones\n- **Production:** Pirates of the Caribbean: Dead Man's Chest (2006)\n- **Source:** [ILM animation-history article](${control.selection.source_page})\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${crop.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass — center focus\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${control.ruling.notes.map(note=>`- ${note}`).join('\n')}\n\nThe exact source-native 2045×1147 ILM JPEG is retained unchanged. Three usable resized deliveries and one thumbnail are recorded as rejected visual duplicates. The centered crop preserves the complete designed face and tentacle beard symmetrically. The failed first render is retained as a diagnostic checkpoint and changed no packet or canonical state.\n`);
console.log(`RENDERED UC-070 Davy Jones candidate ${candidate.sha256}`);
console.log(`crop ${crop.sha256} ${crop.width}x${crop.height} gravity=${control.crop.gravity}`);
console.log(`duplicate scan PASS against ${repository.size} canonical hashes`);
console.log(`artifact ${OUT}`);
