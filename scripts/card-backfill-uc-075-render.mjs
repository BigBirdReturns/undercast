#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-075-RENDER.json';
const SOURCE_ROOT=process.env.SOURCE_ROOT||'';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-075-render';
const MAGICK=process.env.MAGICK_CMD||'magick';
const sha=value=>createHash('sha256').update(value).digest('hex');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
function signatureMime(bytes){if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
function identify(path){const text=execFileSync(MAGICK,['identify','-format','%w %h',path],{encoding:'utf8'}).trim();const[width,height]=text.split(/\s+/).map(Number);assert(width>0&&height>0,`cannot identify ${path}`);return{width,height}}
function magick(...args){execFileSync(MAGICK,args,{stdio:'inherit'})}
async function fileMeta(path){const bytes=await readFile(path);return{bytes:bytes.length,sha256:sha(bytes),mime:signatureMime(bytes),...identify(path)}}
async function walkImages(root,out=[]){let entries;try{entries=await readdir(root,{withFileTypes:true})}catch{return out}for(const entry of entries){const path=join(root,entry.name);if(entry.isDirectory())await walkImages(path,out);else if(/\.(?:jpe?g|png|webp)$/i.test(entry.name))out.push(path)}return out}
async function repositoryHashes(){const map=new Map();try{const manifest=await readJson('data/media-manifest.json');for(const[path,row]of Object.entries(manifest.assets||{})){if(!/^[0-9a-f]{64}$/i.test(row?.sha256||''))continue;const list=map.get(row.sha256)||[];list.push(`manifest:${path}`);map.set(row.sha256,list)}}catch{}for(const path of await walkImages('images')){try{const hash=sha(await readFile(path));const list=map.get(hash)||[];list.push(`file:${path}`);map.set(hash,list)}catch{}}return map}

assert(SOURCE_ROOT,'SOURCE_ROOT is required');
const control=await readJson(CONTROL);
assert(control.version===1&&control.record_id==='UC-075'&&control.actor==='Lou Ferrigno'&&control.character==='The Hulk'&&control.side==='still','UC-075 render scope drift');
assert(control.discovery_artifact?.artifact_id===8640959874&&control.discovery_artifact?.head_sha==='06d754912a15610c0cfc2794799652fb2db50269','UC-075 discovery custody drift');
assert(control.discovery_artifact?.manifest_sha256==='15337473b924a3e025f9b7c1c12dcc7c647416097155b2fc95aa1852df817fd3','UC-075 discovery manifest drift');
assert(control.ruling?.identity==='expected-subject'&&control.ruling?.presentation==='character-depiction'&&control.ruling?.crop_ruling==='pass-custom-y350'&&control.ruling?.canonical_mutation===false,'UC-075 ruling drift');
assert(control.crop?.offset_y===350&&control.crop?.expected_scaled_height===1993,'UC-075 crop recipe drift');

const discoveryManifestPath=join(SOURCE_ROOT,'manifest.json');
const discoveryManifestBytes=await readFile(discoveryManifestPath);
assert(sha(discoveryManifestBytes)===control.discovery_artifact.manifest_sha256,'UC-075 discovery manifest custody drift');
const discovery=JSON.parse(discoveryManifestBytes.toString('utf8'));
assert(discovery.record_id==='UC-075'&&discovery.actor==='Lou Ferrigno'&&discovery.character==='The Hulk','UC-075 discovery identity drift');
assert(discovery.failed_discovery_checkpoints?.length===3,'UC-075 failed-checkpoint receipt drift');
const selected=(discovery.candidates||[]).find(row=>row.key==='solo');
const alternative=(discovery.candidates||[]).find(row=>row.key==='banner-hulk');
assert(selected&&alternative,'UC-075 discovery candidates missing');
for(const [label,row,expected] of [['selected',selected,control.selection],['alternative',alternative,control.rejected_alternative]]){
  assert(row.source_page===expected.source_page&&row.original_url===expected.original_url,`${label} source URL drift`);
  assert(row.local===expected.artifact_path&&row.mime===expected.mime&&row.bytes===expected.bytes&&row.width===expected.width&&row.height===expected.height&&row.sha256===expected.sha256,`${label} byte receipt drift`);
  assert(Array.isArray(row.repository_matches)&&row.repository_matches.length===0,`${label} source duplicates canonical media`);
}
const identityEvidence=discovery.identity_source?.evidence;
const soloEvidence=discovery.image_sources?.solo?.page;
const alternativeEvidence=discovery.image_sources?.['banner-hulk']?.page;
for(const [label,evidence] of [['identity',identityEvidence],['solo',soloEvidence],['alternative',alternativeEvidence]])assert(evidence?.status==='loaded'&&Array.isArray(evidence.required_terms_missing)&&evidence.required_terms_missing.length===0,`${label} page evidence incomplete`);
assert(String(identityEvidence.body_text||'').includes('Hulk (Lou Ferrigno)')&&String(identityEvidence.body_text||'').includes('Bill Bixby, Lou Ferrigno'),'Universal identity evidence drift');
assert(String(soloEvidence.body_text||'').includes('Photo of Lou Ferrigno as The Incredible Hulk')&&String(soloEvidence.body_text||'').includes('CBS Television'),'solo Commons evidence drift');
assert(String(alternativeEvidence.body_text||'').includes('Bill Bixby as David Banner and Lou Ferrigno as The Incredible Hulk'),'alternative Commons evidence drift');

const selectedPath=join(SOURCE_ROOT,control.selection.artifact_path);
const alternativePath=join(SOURCE_ROOT,control.rejected_alternative.artifact_path);
const selectedBytes=await readFile(selectedPath),alternativeBytes=await readFile(alternativePath);
assert(signatureMime(selectedBytes)==='image/jpeg'&&selectedBytes.length===control.selection.bytes&&sha(selectedBytes)===control.selection.sha256,'selected source byte custody drift');
assert(signatureMime(alternativeBytes)==='image/jpeg'&&alternativeBytes.length===control.rejected_alternative.bytes&&sha(alternativeBytes)===control.rejected_alternative.sha256,'alternative source byte custody drift');

const pageSources=[
  ['source-page.png',control.selection.source_page_screenshot_path,control.selection.source_page_screenshot_sha256],
  ['identity-page.png',control.selection.identity_page_screenshot_path,control.selection.identity_page_screenshot_sha256],
  ['alternative-page.png',control.rejected_alternative.source_page_screenshot_path,control.rejected_alternative.source_page_screenshot_sha256]
];
await rm(OUT,{recursive:true,force:true});
await mkdir(OUT,{recursive:true});
const candidatePath=join(OUT,'uc-075-still-candidate.jpg');
const alternativeDest=join(OUT,'rejected-banner-hulk.jpg');
await copyFile(selectedPath,candidatePath);
await copyFile(alternativePath,alternativeDest);
const candidate=await fileMeta(candidatePath),rejectedAlternative=await fileMeta(alternativeDest);
assert(candidate.sha256===control.selection.sha256&&candidate.width===554&&candidate.height===886,'candidate copy drift');
assert(rejectedAlternative.sha256===control.rejected_alternative.sha256&&rejectedAlternative.width===1150&&rejectedAlternative.height===890,'alternative copy drift');
const pageScreenshots={};
for(const [dest,source,expectedHash] of pageSources){const sourcePath=join(SOURCE_ROOT,source),bytes=await readFile(sourcePath);assert(signatureMime(bytes)==='image/png'&&sha(bytes)===expectedHash,`${dest} screenshot custody drift`);await copyFile(sourcePath,join(OUT,dest));pageScreenshots[dest]={path:dest,...await fileMeta(join(OUT,dest))}}

const scaledPath=join(OUT,'.scaled.jpg');
magick(candidatePath,'-auto-orient','-resize',control.crop.resize_geometry,scaledPath);
const scaled=identify(scaledPath);
assert(scaled.width===control.crop.expected_scaled_width&&scaled.height===control.crop.expected_scaled_height,`scaled geometry drift ${scaled.width}x${scaled.height}`);
const cropPath=join(OUT,'card-crop-preview.jpg');
magick(scaledPath,'-crop',`${control.crop.width}x${control.crop.height}+${control.crop.offset_x}+${control.crop.offset_y}`,'+repage','-strip','-quality',String(control.crop.quality),cropPath);
await rm(scaledPath,{force:true});
const crop=await fileMeta(cropPath);
assert(crop.mime==='image/jpeg'&&crop.width===1246&&crop.height===1000,'custom crop geometry drift');

const repository=await repositoryHashes();
assert(repository.size===control.expected_repository_hash_count,`repository hash denominator drift ${repository.size}`);
const duplicateScan={version:1,repository_hash_count:repository.size,items:[
  {label:'CBS Lou Ferrigno Hulk source / candidate',path:'uc-075-still-candidate.jpg',sha256:candidate.sha256,matches:repository.get(candidate.sha256)||[]},
  {label:'custom y350 wall crop',path:'card-crop-preview.jpg',sha256:crop.sha256,matches:repository.get(crop.sha256)||[]},
  {label:'rejected CBS Banner/Hulk alternative',path:'rejected-banner-hulk.jpg',sha256:rejectedAlternative.sha256,matches:repository.get(rejectedAlternative.sha256)||[]}
],status:'pass'};
for(const item of duplicateScan.items)assert(item.matches.length===0,`${item.label} duplicates canonical media: ${item.matches.join(', ')}`);
await writeJson(join(OUT,'duplicate-scan.json'),duplicateScan);

const manifest={version:1,lane:'card-backfill',record_id:'UC-075',actor:'Lou Ferrigno',character:'The Hulk',production:'The Incredible Hulk',year_range:'1977–82',side:'still',expected_subject:'The Hulk',reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,custody:{discovery_artifact:control.discovery_artifact,failed_discovery_checkpoints:discovery.failed_discovery_checkpoints,render_control_sha256:sha(await readFile(CONTROL)),discovery_manifest_sha256:control.discovery_artifact.manifest_sha256},identity_source:{provider:'Universal Pictures At Home',source_page:control.selection.identity_page,page_title:identityEvidence.title,resolved_page:identityEvidence.resolved_url,page_screenshot:{path:'identity-page.png',sha256:control.selection.identity_page_screenshot_sha256},evidence:'The exact Universal complete-series page identifies Lou Ferrigno as the transformed Hulk and includes him in the cast.'},source:{provider:control.selection.provider,source_page:control.selection.source_page,original_url:control.selection.original_url,page_title:soloEvidence.title,resolved_page:soloEvidence.resolved_url,page_screenshot:{path:'source-page.png',sha256:control.selection.source_page_screenshot_sha256},description:control.selection.description,date:control.selection.date,author:control.selection.author,license:control.selection.license},candidate:{path:'uc-075-still-candidate.jpg',...candidate},rejected_alternative:{path:'rejected-banner-hulk.jpg',...rejectedAlternative,provider:control.rejected_alternative.provider,source_page:control.rejected_alternative.source_page,original_url:control.rejected_alternative.original_url,page_screenshot:{path:'alternative-page.png',sha256:control.rejected_alternative.source_page_screenshot_sha256},ruling:control.rejected_alternative.ruling},page_screenshots:pageScreenshots,crop_preview:{path:'card-crop-preview.jpg',...crop,resize_geometry:control.crop.resize_geometry,scaled_geometry:scaled,offset_x:control.crop.offset_x,offset_y:control.crop.offset_y,semantics:control.crop.semantics},duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:repository.size,status:'pass'},exact_subject_review:{identity:control.ruling.identity,presentation:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,notes:control.ruling.notes},disposition:control.ruling.candidate_disposition,canonical_mutation:false};
await writeJson(join(OUT,'manifest.json'),manifest);
await writeJson(join(OUT,'review.json'),{version:1,record_id:'UC-075',actor:'Lou Ferrigno',character:'The Hulk',side:'still',expected_subject:'The Hulk',candidate_sha256:candidate.sha256,crop_preview_sha256:crop.sha256,rejected_alternative_sha256:rejectedAlternative.sha256,identity_ruling:control.ruling.identity,presentation_ruling:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,reviewed_at:control.reviewed_at,canonical_mutation:false,disposition:control.ruling.candidate_disposition,notes:control.ruling.notes});
await writeFile(join(OUT,'review.md'),`# UC-075 reviewed Lou Ferrigno Hulk still candidate\n\n- **Record:** UC-075\n- **Performer:** Lou Ferrigno\n- **Displayed role:** The Hulk\n- **Production:** The Incredible Hulk (1977–82)\n- **Source:** [Wikimedia Commons / CBS Television](${control.selection.source_page})\n- **Identity source:** [Universal Pictures At Home](${control.selection.identity_page})\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${crop.sha256}\`\n- **Rejected alternative:** \`${rejectedAlternative.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass — custom y=350\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${control.ruling.notes.map(note=>`- ${note}`).join('\n')}\n\nThe exact 1977 CBS publicity original is retained unchanged. The valid Banner/Hulk two-shot is retained as an explicit rejected alternative. The custom crop preserves Ferrigno's complete transformed face and upper-body context more effectively than stock gravity choices.\n`);
console.log(`RENDERED UC-075 Hulk candidate ${candidate.sha256}`);
console.log(`crop ${crop.sha256} ${crop.width}x${crop.height} offset-y=${control.crop.offset_y}`);
console.log(`alternative ${rejectedAlternative.sha256}`);
console.log(`duplicate scan PASS against ${repository.size} canonical hashes`);
console.log(`artifact ${OUT}`);
