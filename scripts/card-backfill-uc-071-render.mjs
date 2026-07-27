#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-071-RENDER.json';
const SOURCE_ROOT=process.env.SOURCE_ROOT||'';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-071-render';
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
assert(control.version===1&&control.record_id==='UC-071'&&control.actor==='Warwick Davis'&&control.side==='still','UC-071 render scope drift');
assert(control.discovery_artifact?.artifact_id===8640459921&&control.discovery_artifact?.head_sha==='5dae1c8829fe59e2d99c3c9f833c62b210c28db7','UC-071 discovery custody drift');
assert(control.discovery_artifact?.manifest_sha256==='08868a97a2459b5aed1b9df3fe2972cdff93028264994fa0b217547f54fe2c76','UC-071 discovery manifest drift');
assert(control.failed_discovery_checkpoint?.artifact_id===8640403158,'UC-071 failed discovery checkpoint drift');
assert(control.ruling?.identity==='expected-subject-set'&&control.ruling?.presentation==='three-role-character-depiction'&&control.ruling?.crop_ruling==='pass-three-panel-center'&&control.ruling?.canonical_mutation===false,'UC-071 ruling drift');
assert(control.composition?.candidate_width===1260&&control.composition?.candidate_height===1000&&control.composition?.order?.join(',')==='wicket,flitwick,griphook','UC-071 composition drift');

const discoveryManifestPath=join(SOURCE_ROOT,'manifest.json');
const discoveryManifestBytes=await readFile(discoveryManifestPath);
assert(sha(discoveryManifestBytes)===control.discovery_artifact.manifest_sha256,'UC-071 discovery manifest custody drift');
const discovery=JSON.parse(discoveryManifestBytes.toString('utf8'));
assert(discovery.record_id==='UC-071'&&discovery.actor==='Warwick Davis'&&discovery.character==='Wicket, Flitwick, Griphook & more','UC-071 discovery identity drift');

const roleKeys=control.composition.order;
const selected={};
for(const role of roleKeys){
  const expected=control.selections[role];
  const row=discovery.roles?.[role]?.usable?.find(candidate=>candidate.local===expected.artifact_path);
  assert(row,`${role} selected candidate absent from discovery manifest`);
  assert(row.url===expected.asset_url&&row.resolved_url===expected.asset_url,`${role} source URL drift`);
  assert(row.mime===expected.mime&&row.bytes===expected.bytes&&row.width===expected.width&&row.height===expected.height&&row.sha256===expected.sha256,`${role} selected byte receipt drift`);
  assert(Array.isArray(row.repository_matches)&&row.repository_matches.length===0,`${role} source duplicates canonical media`);
  selected[role]=row;
}

const wicketImage=discovery.page_evidence?.wicket?.image;
const wicketIdentity=discovery.page_evidence?.wicket?.identity;
const flitwickImage=discovery.page_evidence?.flitwick?.image;
const potterIdentity=discovery.page_evidence?.flitwick?.identity;
const griphookImage=discovery.page_evidence?.griphook?.image;
for(const [key,page] of Object.entries({wicketImage,wicketIdentity,flitwickImage,potterIdentity,griphookImage}))assert(page?.status==='loaded'&&Array.isArray(page.required_terms_missing)&&page.required_terms_missing.length===0,`${key} page evidence incomplete`);
assert(wicketImage.title==='Wicket W. Warrick Biography Gallery | StarWars.com','Wicket image page title drift');
assert(String(wicketIdentity.body_text||'').includes('actor who brought Wicket to life')&&String(wicketIdentity.body_text||'').includes('Warwick Davis'),'Wicket performer evidence drift');
assert(flitwickImage.title==='Filius Flitwick | Official Harry Potter Encyclopedia','Flitwick image page title drift');
assert(griphookImage.title==='Griphook | Official Harry Potter Encyclopedia','Griphook image page title drift');
assert(String(potterIdentity.body_text||'').includes('Warwick Davis')&&String(potterIdentity.body_text||'').includes('Professor Filius Flitwick and Griphook'),'Harry Potter performer evidence drift');

await rm(OUT,{recursive:true,force:true});
await mkdir(OUT,{recursive:true});
const outputNames={
  wicket:{original:'wicket-original.jpg',panel:'wicket-panel.jpg'},
  flitwick:{original:'flitwick-original.jpg',panel:'flitwick-panel.jpg'},
  griphook:{original:'griphook-original.jpg',panel:'griphook-panel.jpg'}
};
const sourceAssets={},panelCrops={};
for(const role of roleKeys){
  const expected=control.selections[role];
  const sourcePath=join(SOURCE_ROOT,expected.artifact_path);
  const sourceBytes=await readFile(sourcePath);
  assert(signatureMime(sourceBytes)===expected.mime&&sourceBytes.length===expected.bytes&&sha(sourceBytes)===expected.sha256,`${role} source byte custody drift`);
  const originalPath=join(OUT,outputNames[role].original);
  await copyFile(sourcePath,originalPath);
  sourceAssets[role]={path:outputNames[role].original,...await fileMeta(originalPath),provider:expected.provider,source_page:expected.image_page,identity_page:expected.identity_page,asset_url:expected.asset_url};
  const panelPath=join(OUT,outputNames[role].panel);
  magick(originalPath,'-auto-orient','-resize',`${control.composition.panel_width}x${control.composition.panel_height}^`,'-gravity',expected.panel_gravity,'-extent',`${control.composition.panel_width}x${control.composition.panel_height}`,'-strip','-quality',String(control.composition.quality),panelPath);
  const panel=await fileMeta(panelPath);
  assert(panel.mime==='image/jpeg'&&panel.width===control.composition.panel_width&&panel.height===control.composition.panel_height,`${role} panel geometry drift`);
  panelCrops[role]={path:outputNames[role].panel,...panel,gravity:expected.panel_gravity};
}

const pageCopies=[
  ['source-page-wicket.png',control.selections.wicket.image_page_screenshot_path,control.selections.wicket.image_page_screenshot_sha256],
  ['identity-page-wicket.png',control.selections.wicket.identity_page_screenshot_path,control.selections.wicket.identity_page_screenshot_sha256],
  ['source-page-flitwick.png',control.selections.flitwick.image_page_screenshot_path,control.selections.flitwick.image_page_screenshot_sha256],
  ['identity-page-potter.png',control.selections.flitwick.identity_page_screenshot_path,control.selections.flitwick.identity_page_screenshot_sha256],
  ['source-page-griphook.png',control.selections.griphook.image_page_screenshot_path,control.selections.griphook.image_page_screenshot_sha256]
];
const pageScreenshots={};
for(const [dest,source,expectedHash] of pageCopies){const sourcePath=join(SOURCE_ROOT,source),bytes=await readFile(sourcePath);assert(signatureMime(bytes)==='image/png'&&sha(bytes)===expectedHash,`${dest} screenshot custody drift`);await copyFile(sourcePath,join(OUT,dest));pageScreenshots[dest]={path:dest,...await fileMeta(join(OUT,dest))}}

const dividerPath=join(OUT,'.divider.png');
magick('-size',`${control.composition.divider_width}x${control.composition.panel_height}`,`xc:${control.composition.divider_color}`,dividerPath);
const candidatePath=join(OUT,'uc-071-still-candidate.jpg');
magick(join(OUT,outputNames.wicket.panel),dividerPath,join(OUT,outputNames.flitwick.panel),dividerPath,join(OUT,outputNames.griphook.panel),'+append','-strip','-quality',String(control.composition.quality),candidatePath);
await rm(dividerPath,{force:true});
const candidate=await fileMeta(candidatePath);
assert(candidate.mime==='image/jpeg'&&candidate.width===control.composition.candidate_width&&candidate.height===control.composition.candidate_height,'triptych candidate geometry drift');
const cropPath=join(OUT,'card-crop-preview.jpg');
magick(candidatePath,'-resize',`${control.composition.wall_crop_width}x${control.composition.wall_crop_height}^`,'-gravity',control.composition.wall_crop_gravity,'-extent',`${control.composition.wall_crop_width}x${control.composition.wall_crop_height}`,'-strip','-quality',String(control.composition.quality),cropPath);
const crop=await fileMeta(cropPath);
assert(crop.mime==='image/jpeg'&&crop.width===control.composition.wall_crop_width&&crop.height===control.composition.wall_crop_height,'triptych wall crop geometry drift');

const repository=await repositoryHashes();
assert(repository.size===control.expected_repository_hash_count,`repository hash denominator drift ${repository.size}`);
const duplicateItems=[];
for(const role of roleKeys){duplicateItems.push({label:`${role} official source`,path:sourceAssets[role].path,sha256:sourceAssets[role].sha256,matches:repository.get(sourceAssets[role].sha256)||[]});duplicateItems.push({label:`${role} panel crop`,path:panelCrops[role].path,sha256:panelCrops[role].sha256,matches:repository.get(panelCrops[role].sha256)||[]})}
duplicateItems.push({label:'UC-071 three-role candidate',path:'uc-071-still-candidate.jpg',sha256:candidate.sha256,matches:repository.get(candidate.sha256)||[]});
duplicateItems.push({label:'UC-071 wall crop preview',path:'card-crop-preview.jpg',sha256:crop.sha256,matches:repository.get(crop.sha256)||[]});
for(const item of duplicateItems)assert(item.matches.length===0,`${item.label} duplicates canonical media: ${item.matches.join(', ')}`);
const duplicateScan={version:1,repository_hash_count:repository.size,items:duplicateItems,status:'pass'};
await writeJson(join(OUT,'duplicate-scan.json'),duplicateScan);

const manifest={
  version:1,
  lane:'card-backfill',
  record_id:'UC-071',
  actor:'Warwick Davis',
  character:'Wicket, Flitwick, Griphook & more',
  production:'Star Wars / Willow / Harry Potter',
  side:'still',
  expected_subject:'Wicket, Flitwick, Griphook & more',
  reviewed_at:control.reviewed_at,
  reviewed_by:control.reviewed_by,
  reviewed_role:control.reviewed_role,
  named_role_denominator:['Wicket W. Warrick','Professor Filius Flitwick','Griphook'],
  custody:{discovery_artifact:control.discovery_artifact,failed_discovery_checkpoint:control.failed_discovery_checkpoint,render_control_sha256:sha(await readFile(CONTROL)),discovery_manifest_sha256:control.discovery_artifact.manifest_sha256},
  sources:{
    wicket:{provider:'StarWars.com',image_page:control.selections.wicket.image_page,identity_page:control.selections.wicket.identity_page,image_page_title:wicketImage.title,identity_page_title:wicketIdentity.title,identity_evidence:'StarWars.com describes Warwick Davis as the actor who brought Wicket to life.',image_page_screenshot:'source-page-wicket.png',identity_page_screenshot:'identity-page-wicket.png'},
    flitwick:{provider:'HarryPotter.com',image_page:control.selections.flitwick.image_page,identity_page:control.selections.flitwick.identity_page,image_page_title:flitwickImage.title,identity_page_title:potterIdentity.title,identity_evidence:'HarryPotter.com identifies Warwick Davis as the performer who famously played Professor Filius Flitwick and Griphook.',image_page_screenshot:'source-page-flitwick.png',identity_page_screenshot:'identity-page-potter.png'},
    griphook:{provider:'HarryPotter.com',image_page:control.selections.griphook.image_page,identity_page:control.selections.griphook.identity_page,image_page_title:griphookImage.title,identity_page_title:potterIdentity.title,identity_evidence:'HarryPotter.com identifies Warwick Davis as the performer who famously played Professor Filius Flitwick and Griphook.',image_page_screenshot:'source-page-griphook.png',identity_page_screenshot:'identity-page-potter.png'}
  },
  page_screenshots:pageScreenshots,
  source_assets:sourceAssets,
  panel_crops:panelCrops,
  composition:{...control.composition,recipe:'Three independently cropped 412x1000 panels, separated by two 12px neutral dividers, appended left-to-right as Wicket / Flitwick / Griphook.'},
  candidate:{path:'uc-071-still-candidate.jpg',...candidate},
  crop_preview:{path:'card-crop-preview.jpg',...crop,gravity:control.composition.wall_crop_gravity,semantics:'Current 1246x1000 wall simulation; removes seven pixels from each outer edge of the 1260x1000 triptych and preserves all three named roles.'},
  rejected_visual_duplicates:control.rejected_visual_duplicates,
  rejected_non_live_action:control.rejected_non_live_action,
  duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:repository.size,status:'pass'},
  exact_subject_review:{identity:control.ruling.identity,presentation:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,notes:control.ruling.notes},
  disposition:control.ruling.candidate_disposition,
  canonical_mutation:false
};
await writeJson(join(OUT,'manifest.json'),manifest);
await writeJson(join(OUT,'review.json'),{version:1,record_id:'UC-071',actor:'Warwick Davis',character:'Wicket, Flitwick, Griphook & more',side:'still',expected_subject:'Wicket, Flitwick, Griphook & more',named_role_denominator:manifest.named_role_denominator,source_asset_sha256:Object.fromEntries(roleKeys.map(role=>[role,sourceAssets[role].sha256])),panel_sha256:Object.fromEntries(roleKeys.map(role=>[role,panelCrops[role].sha256])),candidate_sha256:candidate.sha256,crop_preview_sha256:crop.sha256,identity_ruling:control.ruling.identity,presentation_ruling:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,reviewed_at:control.reviewed_at,canonical_mutation:false,disposition:control.ruling.candidate_disposition,notes:control.ruling.notes});
await writeFile(join(OUT,'review.md'),`# UC-071 reviewed Warwick Davis role-triptych candidate\n\n- **Record:** UC-071\n- **Performer:** Warwick Davis\n- **Displayed role line:** Wicket, Flitwick, Griphook & more\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${crop.sha256}\`\n- **Identity ruling:** expected subject set\n- **Presentation ruling:** three-role character depiction\n- **Crop ruling:** pass — three-panel center\n- **Canonical mutation:** none\n\n## Named visual denominator\n\n1. Wicket W. Warrick\n2. Professor Filius Flitwick\n3. Griphook\n\nThe trailing “& more” is non-exhaustive career prose and is not treated as an invented fourth visual subject.\n\n## Visual ruling\n\n${control.ruling.notes.map(note=>`- ${note}`).join('\n')}\n\nThe packet retains the three exact official source images, their independently reviewed panel crops, five source/identity screenshots, the deterministic triptych, and its current wall simulation. It remains evidence-only pending independent canonical acceptance.\n`);
console.log(`RENDERED UC-071 triptych ${candidate.sha256}`);
console.log(`crop ${crop.sha256} ${crop.width}x${crop.height}`);
console.log(`panels ${roleKeys.map(role=>`${role}=${panelCrops[role].sha256}`).join(' ')}`);
console.log(`duplicate scan PASS against ${repository.size} canonical hashes`);
console.log(`artifact ${OUT}`);
