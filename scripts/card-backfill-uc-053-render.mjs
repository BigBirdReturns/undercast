#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-053-RENDER.json';
const SOURCE_ROOT=process.env.SOURCE_ROOT||'';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-053-render';
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
assert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-053','render control scope drift');
assert(control.actor==='Gary Oldman'&&control.character==='Dracula'&&control.side==='still'&&control.reviewed_role==='second-desk','render authority drift');
assert(control.ruling?.identity==='expected-subject'&&control.ruling?.presentation==='character-depiction'&&control.ruling?.canonical_mutation===false,'render ruling drift');
const sourceManifestPath=join(SOURCE_ROOT,'manifest.json');
const sourceManifestBytes=await readFile(sourceManifestPath);
assert(sha(sourceManifestBytes)===control.selection.source_manifest_sha256,'discovery manifest custody drift');
const sourceManifest=JSON.parse(sourceManifestBytes.toString('utf8'));
assert(sourceManifest.record_id==='UC-053'&&sourceManifest.actor==='Gary Oldman'&&sourceManifest.character==='Dracula'&&sourceManifest.side==='still','discovery manifest identity drift');
const selected=(sourceManifest.candidates||[]).find(row=>row.local===control.selection.artifact_path);
assert(selected,'authorized old Count candidate is absent from discovery manifest');
assert(selected.provider===control.selection.provider&&selected.source_key===control.selection.source_key,'selected source identity drift');
assert(selected.source_page===control.selection.source_page&&selected.url===control.selection.asset_url,'selected source URL drift');
assert(selected.mime===control.selection.mime&&selected.bytes===control.selection.bytes&&selected.width===control.selection.width&&selected.height===control.selection.height&&selected.sha256===control.selection.sha256,'selected candidate byte receipt drift');
assert(Array.isArray(selected.repository_matches)&&selected.repository_matches.length===0,'selected candidate duplicates canonical repository media');
const alternate=(sourceManifest.candidates||[]).find(row=>row.local===control.alternate_visual_duplicate.artifact_path);
assert(alternate,'alternate encoding receipt is absent from discovery manifest');
assert(alternate.source_key===selected.source_key&&alternate.source_page===selected.source_page&&alternate.label===selected.label,'alternate encoding source identity drift');
assert(alternate.mime===control.alternate_visual_duplicate.mime&&alternate.bytes===control.alternate_visual_duplicate.bytes&&alternate.width===control.alternate_visual_duplicate.width&&alternate.height===control.alternate_visual_duplicate.height&&alternate.sha256===control.alternate_visual_duplicate.sha256,'alternate encoding byte receipt drift');
assert(alternate.sha256!==selected.sha256&&alternate.width===selected.width&&alternate.height===selected.height,'alternate encoding boundary drift');
const pageEvidence=sourceManifest.page_evidence?.[control.selection.source_key];
assert(pageEvidence?.status==='loaded'&&pageEvidence?.required_terms_missing?.length===0,'selected source page evidence is incomplete');
assert(String(pageEvidence.title||'').includes('Bram Stoker')&&String(pageEvidence.title||'').includes('Dracula'),'selected source-page title drift');

const sourcePath=join(SOURCE_ROOT,control.selection.artifact_path);
const sourcePagePath=join(SOURCE_ROOT,control.selection.source_page_screenshot_path);
const sourceBytes=await readFile(sourcePath),pageBytes=await readFile(sourcePagePath);
assert(signatureMime(sourceBytes)===control.selection.mime&&sourceBytes.length===control.selection.bytes&&sha(sourceBytes)===control.selection.sha256,'source byte custody drift');
const sourceDimensions=identify(sourcePath);
assert(sourceDimensions.width===control.selection.width&&sourceDimensions.height===control.selection.height,'source geometry drift');
assert(signatureMime(pageBytes)==='image/png'&&sha(pageBytes)===control.selection.source_page_screenshot_sha256,'source-page screenshot custody drift');

await rm(OUT,{recursive:true,force:true});await mkdir(OUT,{recursive:true});
const candidatePath=join(OUT,'uc-053-still-candidate.jpg');
const pageDest=join(OUT,'source-page.png');
await copyFile(sourcePath,candidatePath);await copyFile(sourcePagePath,pageDest);
const candidate=await fileMeta(candidatePath);
assert(candidate.sha256===control.selection.sha256&&candidate.mime==='image/jpeg','candidate copy drift');

const cropPath=join(OUT,'card-crop-preview.jpg');
magick(candidatePath,'-auto-orient','-resize',`${control.crop.width}x${control.crop.height}^`,'-gravity',control.crop.gravity,'-extent',`${control.crop.width}x${control.crop.height}`,'-strip','-quality',String(control.crop.quality),cropPath);
const crop=await fileMeta(cropPath);
assert(crop.mime==='image/jpeg'&&crop.width===control.crop.width&&crop.height===control.crop.height,'crop preview geometry drift');

const repository=await repositoryHashes();
assert(repository.size===control.expected_repository_hash_count,`repository hash denominator drift ${repository.size}`);
const duplicateScan={version:1,repository_hash_count:repository.size,items:[{label:'Gary Oldman old Count source / candidate',path:'uc-053-still-candidate.jpg',sha256:candidate.sha256,matches:repository.get(candidate.sha256)||[]},{label:'card crop preview',path:'card-crop-preview.jpg',sha256:crop.sha256,matches:repository.get(crop.sha256)||[]}]};
for(const row of duplicateScan.items)assert(row.matches.length===0,`${row.label} duplicates canonical repository media: ${row.matches.join(', ')}`);
await writeJson(join(OUT,'duplicate-scan.json'),duplicateScan);

const manifest={version:1,lane:'card-backfill',record_id:'UC-053',actor:'Gary Oldman',character:'Dracula',production:"Bram Stoker's Dracula",year:1992,side:'still',expected_subject:'Dracula',reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,custody:{discovery_artifact:control.discovery_artifact,render_control_sha256:sha(await readFile(CONTROL)),discovery_manifest_sha256:control.selection.source_manifest_sha256},source:{provider:control.selection.provider,source_key:control.selection.source_key,source_page:control.selection.source_page,asset_url:control.selection.asset_url,page_title:pageEvidence.title,resolved_page:pageEvidence.resolved_url,page_screenshot:{path:'source-page.png',sha256:control.selection.source_page_screenshot_sha256},article_evidence:"The exact /Film page is about Bram Stoker's Dracula; retained required-term verification includes Gary Oldman, Dracula and Columbia Pictures, and the selected image is captioned 'Old dracula'.",source_note:selected.source_note},candidate:{path:'uc-053-still-candidate.jpg',...candidate},alternate_visual_duplicate:{...control.alternate_visual_duplicate,reason:'Same source image and composition exposed as a WebP encoding; rejected to prevent one frame from becoming two evidence candidates.'},crop_preview:{path:'card-crop-preview.jpg',...crop,gravity:control.crop.gravity,semantics:control.crop.semantics},duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:repository.size,status:'pass'},exact_subject_review:{identity:control.ruling.identity,presentation:control.ruling.presentation,crop_ruling:'pass',notes:control.ruling.notes},disposition:control.ruling.candidate_disposition,canonical_mutation:false};
await writeJson(join(OUT,'manifest.json'),manifest);
await writeJson(join(OUT,'review.json'),{version:1,record_id:'UC-053',actor:'Gary Oldman',character:'Dracula',side:'still',expected_subject:'Dracula',candidate_sha256:candidate.sha256,crop_preview_sha256:crop.sha256,identity_ruling:control.ruling.identity,presentation_ruling:control.ruling.presentation,crop_ruling:'pass',reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,reviewed_at:control.reviewed_at,canonical_mutation:false,disposition:control.ruling.candidate_disposition,notes:control.ruling.notes});
await writeFile(join(OUT,'review.md'),`# UC-053 reviewed Dracula still candidate\n\n- **Record:** UC-053\n- **Performer:** Gary Oldman\n- **Displayed role:** Dracula\n- **Production:** Bram Stoker's Dracula (1992)\n- **Source:** [/Film old-Count article image](${control.selection.source_page})\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${crop.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${control.ruling.notes.map(note=>`- ${note}`).join('\n')}\n\nThe exact JPEG source byte is retained unchanged as \`uc-053-still-candidate.jpg\`. The same source stem's alternate WebP encoding is recorded and rejected as a visual duplicate, not counted as a second candidate. The source-page screenshot is retained as \`source-page.png\`. This remains an evidence-only candidate for independent canonical acceptance.\n`);
console.log(`RENDERED UC-053 old Count candidate ${candidate.sha256}`);
console.log(`crop ${crop.sha256} ${crop.width}x${crop.height}`);
console.log(`alternate visual encoding rejected ${alternate.sha256}`);
console.log(`duplicate scan PASS against ${repository.size} repository hashes`);
console.log(`artifact ${OUT}`);
