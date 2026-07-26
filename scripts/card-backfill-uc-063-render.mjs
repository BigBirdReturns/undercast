#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-063-RENDER.json';
const SOURCE_ROOT=process.env.SOURCE_ROOT||'';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-063-render';
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
assert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-063','UC-063 render control scope drift');
assert(control.actor==='Jim Carrey'&&control.character==='The Grinch'&&control.side==='still'&&control.reviewed_role==='second-desk','UC-063 render authority drift');
assert(control.ruling?.identity==='expected-subject'&&control.ruling?.presentation==='character-depiction'&&control.ruling?.crop_ruling==='pass-east-focus'&&control.ruling?.canonical_mutation===false,'UC-063 render ruling drift');
assert(control.crop?.gravity==='east'&&control.crop?.width===1246&&control.crop?.height===1000,'UC-063 crop authorization drift');

const sourceManifestPath=join(SOURCE_ROOT,'manifest.json');
const sourceManifestBytes=await readFile(sourceManifestPath);
assert(sha(sourceManifestBytes)===control.selection.source_manifest_sha256,'official manifest custody drift');
const sourceManifest=JSON.parse(sourceManifestBytes.toString('utf8'));
assert(sourceManifest.record_id==='UC-063'&&sourceManifest.actor==='Jim Carrey'&&sourceManifest.character==='The Grinch'&&sourceManifest.side==='still','official manifest identity drift');
assert(sourceManifest.source?.provider===control.selection.provider&&sourceManifest.source?.source_page===control.selection.source_page,'official source identity drift');
assert(sourceManifest.source?.page_screenshot?.sha256===control.selection.source_page_screenshot_sha256,'official page screenshot receipt drift');
assert(Array.isArray(sourceManifest.source?.required_terms)&&['Jim Carrey','The Grinch','2000','Universal Studios'].every(term=>sourceManifest.source.required_terms.includes(term)),'official page evidence drift');

const selected=(sourceManifest.candidates||[]).find(row=>row.local===control.selection.artifact_path);
assert(selected,'authorized official Grinch candidate is absent from manifest');
assert(selected.url===control.selection.asset_url&&selected.resolved_url===control.selection.asset_url,'official candidate URL drift');
assert(selected.mime===control.selection.mime&&selected.bytes===control.selection.bytes&&selected.width===control.selection.width&&selected.height===control.selection.height&&selected.sha256===control.selection.sha256,'official candidate byte receipt drift');
assert(Array.isArray(selected.repository_matches)&&selected.repository_matches.length===0,'official candidate duplicates canonical media');
assert((selected.kinds||[]).includes('pinned-official'),'official candidate lost pinned-source status');
assert((selected.contexts||[]).some(value=>String(value).includes('Extended Preview')),'official gallery context drift');

const sourcePath=join(SOURCE_ROOT,control.selection.artifact_path);
const sourcePagePath=join(SOURCE_ROOT,control.selection.source_page_screenshot_path);
const sourceBytes=await readFile(sourcePath),pageBytes=await readFile(sourcePagePath);
assert(signatureMime(sourceBytes)==='image/jpeg'&&sourceBytes.length===control.selection.bytes&&sha(sourceBytes)===control.selection.sha256,'official candidate byte custody drift');
assert(signatureMime(pageBytes)==='image/png'&&sha(pageBytes)===control.selection.source_page_screenshot_sha256,'official page screenshot custody drift');
const sourceDimensions=identify(sourcePath);
assert(sourceDimensions.width===control.selection.width&&sourceDimensions.height===control.selection.height,'official candidate geometry drift');

await rm(OUT,{recursive:true,force:true});
await mkdir(OUT,{recursive:true});
const candidatePath=join(OUT,'uc-063-still-candidate.jpg');
const pageDest=join(OUT,'source-page.png');
await copyFile(sourcePath,candidatePath);
await copyFile(sourcePagePath,pageDest);
const candidate=await fileMeta(candidatePath);
assert(candidate.sha256===control.selection.sha256&&candidate.mime==='image/jpeg','candidate copy drift');

const cropPath=join(OUT,'card-crop-preview.jpg');
magick(candidatePath,'-auto-orient','-resize',`${control.crop.width}x${control.crop.height}^`,'-gravity',control.crop.gravity,'-extent',`${control.crop.width}x${control.crop.height}`,'-strip','-quality',String(control.crop.quality),cropPath);
const crop=await fileMeta(cropPath);
assert(crop.mime==='image/jpeg'&&crop.width===control.crop.width&&crop.height===control.crop.height,'crop preview geometry drift');

const repository=await repositoryHashes();
assert(repository.size===control.expected_repository_hash_count,`repository hash denominator drift ${repository.size}`);
const duplicateScan={version:1,repository_hash_count:repository.size,items:[{label:'Official Universal Grinch source / candidate',path:'uc-063-still-candidate.jpg',sha256:candidate.sha256,matches:repository.get(candidate.sha256)||[]},{label:'east-focused wall crop preview',path:'card-crop-preview.jpg',sha256:crop.sha256,matches:repository.get(crop.sha256)||[]}]};
for(const row of duplicateScan.items)assert(row.matches.length===0,`${row.label} duplicates canonical media: ${row.matches.join(', ')}`);
await writeJson(join(OUT,'duplicate-scan.json'),duplicateScan);

const manifest={
  version:1,lane:'card-backfill',record_id:'UC-063',actor:'Jim Carrey',character:'The Grinch',production:'How the Grinch Stole Christmas',year:2000,side:'still',expected_subject:'The Grinch',
  reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,
  custody:{official_artifact:control.official_artifact,render_control_sha256:sha(await readFile(CONTROL)),official_manifest_sha256:control.selection.source_manifest_sha256},
  source:{provider:control.selection.provider,source_page:control.selection.source_page,asset_url:control.selection.asset_url,page_title:sourceManifest.source.title,resolved_page:sourceManifest.source.resolved_page,page_screenshot:{path:'source-page.png',sha256:control.selection.source_page_screenshot_sha256},gallery_context:control.selection.source_context,required_terms:sourceManifest.source.required_terms},
  candidate:{path:'uc-063-still-candidate.jpg',...candidate},
  crop_preview:{path:'card-crop-preview.jpg',...crop,gravity:control.crop.gravity,semantics:control.crop.semantics},
  duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:repository.size,status:'pass'},
  exact_subject_review:{identity:control.ruling.identity,presentation:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,notes:control.ruling.notes},
  disposition:control.ruling.candidate_disposition,
  canonical_mutation:false
};
await writeJson(join(OUT,'manifest.json'),manifest);
await writeJson(join(OUT,'review.json'),{version:1,record_id:'UC-063',actor:'Jim Carrey',character:'The Grinch',side:'still',expected_subject:'The Grinch',candidate_sha256:candidate.sha256,crop_preview_sha256:crop.sha256,identity_ruling:control.ruling.identity,presentation_ruling:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,reviewed_at:control.reviewed_at,canonical_mutation:false,disposition:control.ruling.candidate_disposition,notes:control.ruling.notes});
await writeFile(join(OUT,'review.md'),`# UC-063 reviewed Grinch still candidate\n\n- **Record:** UC-063\n- **Performer:** Jim Carrey\n- **Displayed role:** The Grinch\n- **Production:** How the Grinch Stole Christmas (2000)\n- **Source:** [Universal Pictures At Home](${control.selection.source_page})\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${crop.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass — east focus\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${control.ruling.notes.map(note=>`- ${note}`).join('\n')}\n\nThe exact 2560×1440 Universal gallery JPEG is retained unchanged as \`uc-063-still-candidate.jpg\`. The east-focused crop preview simulates the current wall geometry and preserves the full expression. This remains an evidence-only candidate pending independent canonical acceptance.\n`);
console.log(`RENDERED UC-063 official Grinch candidate ${candidate.sha256}`);
console.log(`crop ${crop.sha256} ${crop.width}x${crop.height} gravity=${control.crop.gravity}`);
console.log(`duplicate scan PASS against ${repository.size} canonical hashes`);
console.log(`artifact ${OUT}`);
