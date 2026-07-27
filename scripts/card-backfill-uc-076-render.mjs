#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-076-RENDER.json';
const SOURCE_ROOT=process.env.SOURCE_ROOT||'';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-076-render';
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
assert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-076','UC-076 render scope drift');
assert(control.actor==='Felix Silla'&&control.character==='Twiki & Cousin Itt'&&control.side==='still','UC-076 identity boundary drift');
assert(control.discovery_artifact?.artifact_id===8641884927&&control.discovery_artifact?.head_sha==='85ce78a0543ecea24b247a69c666e40acaed538b','UC-076 discovery custody drift');
assert(control.failed_discovery_checkpoints?.length===2,'UC-076 failed-discovery checkpoint drift');
assert(control.ruling?.identity==='expected-subject'&&control.ruling?.presentation==='character-depiction'&&control.ruling?.crop_ruling==='pass-two-role-diptych'&&control.ruling?.canonical_mutation===false,'UC-076 ruling drift');
assert(control.composite?.width===1260&&control.composite?.height===1000&&control.composite?.panel_width===624&&control.composite?.divider_width===12,'UC-076 composite geometry drift');
assert(control.wall_crop?.width===1246&&control.wall_crop?.height===1000&&control.wall_crop?.gravity==='center','UC-076 wall crop drift');

const sourceManifestPath=join(SOURCE_ROOT,'manifest.json');
const sourceManifestBytes=await readFile(sourceManifestPath);
assert(sha(sourceManifestBytes)===control.selection.source_manifest_sha256,'discovery manifest custody drift');
const sourceManifest=JSON.parse(sourceManifestBytes.toString('utf8'));
assert(sourceManifest.record_id==='UC-076'&&sourceManifest.actor==='Felix Silla'&&sourceManifest.character==='Twiki & Cousin Itt','discovery identity drift');
assert(sourceManifest.repository_hash_count===control.expected_repository_hash_count,'discovery repository denominator drift');

function selectedRow(roleKey,selection){const role=sourceManifest.roles?.[roleKey];assert(role,`missing ${roleKey} discovery role`);const row=(role.candidates||[]).find(candidate=>candidate.local===selection.artifact_path);assert(row,`authorized ${roleKey} source absent from discovery manifest`);assert(row.provider===selection.provider&&row.page_key===selection.page_key,`${roleKey} source identity drift`);assert(row.source_page===selection.source_page&&row.resolved_url===selection.asset_url,`${roleKey} source URL drift`);assert(row.mime===selection.mime&&row.bytes===selection.bytes&&row.width===selection.width&&row.height===selection.height&&row.sha256===selection.sha256,`${roleKey} byte receipt drift`);assert(Array.isArray(row.repository_matches)&&row.repository_matches.length===0,`${roleKey} source duplicates canonical media`);return row}
const twikiRow=selectedRow('twiki',control.selection.twiki);
const ittRow=selectedRow('cousin-itt',control.selection.cousin_itt);
const twikiEvidence=sourceManifest.page_evidence?.twiki?.[control.selection.twiki.page_key];
const ittEvidence=sourceManifest.page_evidence?.['cousin-itt']?.[control.selection.cousin_itt.page_key];
assert(twikiEvidence?.status==='loaded'&&twikiEvidence?.required_terms_missing?.length===0,'Twiki page evidence incomplete');
assert(String(twikiEvidence.body_text||'').includes('(Body) Felix Silla'),'Twiki performer evidence drift');
assert(ittEvidence?.status==='loaded'&&ittEvidence?.required_terms_missing?.length===0,'Cousin Itt page evidence incomplete');
assert(String(ittEvidence.body_text||'').includes('Felix Silla')&&String(ittEvidence.body_text||'').includes('Cousin Itt'),'Cousin Itt performer evidence drift');
const twikiShot=(sourceManifest.pageScreenshots||[]).find(row=>row.role_key==='twiki'&&row.page_key===control.selection.twiki.page_key);
const ittShot=(sourceManifest.pageScreenshots||[]).find(row=>row.role_key==='cousin-itt'&&row.page_key===control.selection.cousin_itt.page_key);
assert(twikiShot?.path===control.selection.twiki.source_page_screenshot_path&&twikiShot?.sha256===control.selection.twiki.source_page_screenshot_sha256,'Twiki page screenshot receipt drift');
assert(ittShot?.path===control.selection.cousin_itt.source_page_screenshot_path&&ittShot?.sha256===control.selection.cousin_itt.source_page_screenshot_sha256,'Cousin Itt page screenshot receipt drift');

const twikiSource=join(SOURCE_ROOT,control.selection.twiki.artifact_path);
const ittSource=join(SOURCE_ROOT,control.selection.cousin_itt.artifact_path);
const twikiPageSource=join(SOURCE_ROOT,control.selection.twiki.source_page_screenshot_path);
const ittPageSource=join(SOURCE_ROOT,control.selection.cousin_itt.source_page_screenshot_path);
const twikiBytes=await readFile(twikiSource),ittBytes=await readFile(ittSource),twikiPageBytes=await readFile(twikiPageSource),ittPageBytes=await readFile(ittPageSource);
assert(signatureMime(twikiBytes)==='image/jpeg'&&twikiBytes.length===control.selection.twiki.bytes&&sha(twikiBytes)===control.selection.twiki.sha256,'Twiki source custody drift');
assert(signatureMime(ittBytes)==='image/webp'&&ittBytes.length===control.selection.cousin_itt.bytes&&sha(ittBytes)===control.selection.cousin_itt.sha256,'Cousin Itt source custody drift');
assert(signatureMime(twikiPageBytes)==='image/png'&&sha(twikiPageBytes)===control.selection.twiki.source_page_screenshot_sha256,'Twiki page byte custody drift');
assert(signatureMime(ittPageBytes)==='image/png'&&sha(ittPageBytes)===control.selection.cousin_itt.source_page_screenshot_sha256,'Cousin Itt page byte custody drift');
assert(JSON.stringify(identify(twikiSource))===JSON.stringify({width:401,height:612}),'Twiki source geometry drift');
assert(JSON.stringify(identify(ittSource))===JSON.stringify({width:2048,height:1153}),'Cousin Itt source geometry drift');

await rm(OUT,{recursive:true,force:true});await mkdir(OUT,{recursive:true});
const twikiOriginal=join(OUT,'twiki-original.jpg'),ittOriginal=join(OUT,'cousin-itt-original.webp');
const twikiPage=join(OUT,'source-page-twiki.png'),ittPage=join(OUT,'source-page-cousin-itt.png');
await copyFile(twikiSource,twikiOriginal);await copyFile(ittSource,ittOriginal);await copyFile(twikiPageSource,twikiPage);await copyFile(ittPageSource,ittPage);
const twikiOriginalMeta=await fileMeta(twikiOriginal),ittOriginalMeta=await fileMeta(ittOriginal);
assert(twikiOriginalMeta.sha256===control.selection.twiki.sha256&&ittOriginalMeta.sha256===control.selection.cousin_itt.sha256,'source copy drift');

const panelGeometry=`${control.composite.panel_width}x${control.composite.height}`;
const twikiPanel=join(OUT,'twiki-panel.jpg'),ittPanel=join(OUT,'cousin-itt-panel.jpg');
magick(twikiOriginal,'-auto-orient','-resize',`${panelGeometry}^`,'-gravity','center','-extent',panelGeometry,'-strip','-quality',String(control.composite.quality),twikiPanel);
magick(ittOriginal,'-auto-orient','-resize',`${panelGeometry}^`,'-gravity','center','-extent',panelGeometry,'-strip','-quality',String(control.composite.quality),ittPanel);
const twikiPanelMeta=await fileMeta(twikiPanel),ittPanelMeta=await fileMeta(ittPanel);
assert(twikiPanelMeta.mime==='image/jpeg'&&twikiPanelMeta.width===624&&twikiPanelMeta.height===1000,'Twiki panel geometry drift');
assert(ittPanelMeta.mime==='image/jpeg'&&ittPanelMeta.width===624&&ittPanelMeta.height===1000,'Cousin Itt panel geometry drift');

const divider=join(OUT,'divider.png');
magick('-size',`${control.composite.divider_width}x${control.composite.height}`,`xc:${control.composite.divider_color}`,divider);
const candidatePath=join(OUT,'uc-076-still-candidate.jpg');
magick(twikiPanel,divider,ittPanel,'+append','-strip','-quality',String(control.composite.quality),candidatePath);
await rm(divider,{force:true});
const candidate=await fileMeta(candidatePath);
assert(candidate.mime==='image/jpeg'&&candidate.width===1260&&candidate.height===1000,'UC-076 candidate geometry drift');
const cropPath=join(OUT,'card-crop-preview.jpg');
magick(candidatePath,'-gravity',control.wall_crop.gravity,'-crop',`${control.wall_crop.width}x${control.wall_crop.height}+0+0`,'+repage','-strip','-quality',String(control.wall_crop.quality),cropPath);
const crop=await fileMeta(cropPath);
assert(crop.mime==='image/jpeg'&&crop.width===1246&&crop.height===1000,'UC-076 wall crop geometry drift');

const repository=await repositoryHashes();assert(repository.size===control.expected_repository_hash_count,`repository hash denominator drift ${repository.size}`);
const duplicateScan={version:1,repository_hash_count:repository.size,items:[
  {label:'Buck Wiki Twiki source',path:'twiki-original.jpg',sha256:twikiOriginalMeta.sha256,matches:repository.get(twikiOriginalMeta.sha256)||[]},
  {label:'TMZ Cousin Itt source',path:'cousin-itt-original.webp',sha256:ittOriginalMeta.sha256,matches:repository.get(ittOriginalMeta.sha256)||[]},
  {label:'Twiki panel',path:'twiki-panel.jpg',sha256:twikiPanelMeta.sha256,matches:repository.get(twikiPanelMeta.sha256)||[]},
  {label:'Cousin Itt panel',path:'cousin-itt-panel.jpg',sha256:ittPanelMeta.sha256,matches:repository.get(ittPanelMeta.sha256)||[]},
  {label:'UC-076 two-role diptych',path:'uc-076-still-candidate.jpg',sha256:candidate.sha256,matches:repository.get(candidate.sha256)||[]},
  {label:'UC-076 wall crop preview',path:'card-crop-preview.jpg',sha256:crop.sha256,matches:repository.get(crop.sha256)||[]}
]};
for(const row of duplicateScan.items)assert(row.matches.length===0,`${row.label} duplicates canonical media: ${row.matches.join(', ')}`);
await writeJson(join(OUT,'duplicate-scan.json'),duplicateScan);

const manifest={version:1,lane:'card-backfill',record_id:'UC-076',actor:'Felix Silla',character:'Twiki & Cousin Itt',production:'Buck Rogers / The Addams Family',side:'still',expected_subject:'Twiki & Cousin Itt',reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,custody:{discovery_artifact:control.discovery_artifact,failed_discovery_checkpoints:control.failed_discovery_checkpoints,render_control_sha256:sha(await readFile(CONTROL)),discovery_manifest_sha256:control.selection.source_manifest_sha256},sources:{twiki:{provider:control.selection.twiki.provider,source_page:control.selection.twiki.source_page,asset_url:control.selection.twiki.asset_url,page_title:twikiEvidence.title,resolved_page:twikiEvidence.resolved_url,page_screenshot:{path:'source-page-twiki.png',sha256:control.selection.twiki.source_page_screenshot_sha256},performer_evidence:'Buck Wiki identifies Twiki body performer as Felix Silla.'},cousin_itt:{provider:control.selection.cousin_itt.provider,source_page:control.selection.cousin_itt.source_page,asset_url:control.selection.cousin_itt.asset_url,page_title:ittEvidence.title,resolved_page:ittEvidence.resolved_url,page_screenshot:{path:'source-page-cousin-itt.png',sha256:control.selection.cousin_itt.source_page_screenshot_sha256},performer_evidence:'TMZ identifies Felix Silla as the performer of Cousin Itt.'}},originals:{twiki:{path:'twiki-original.jpg',...twikiOriginalMeta},cousin_itt:{path:'cousin-itt-original.webp',...ittOriginalMeta}},panels:{twiki:{path:'twiki-panel.jpg',...twikiPanelMeta,recipe:control.composite.panel_recipe},cousin_itt:{path:'cousin-itt-panel.jpg',...ittPanelMeta,recipe:control.composite.panel_recipe}},candidate:{path:'uc-076-still-candidate.jpg',...candidate,recipe:{width:control.composite.width,height:control.composite.height,panel_width:control.composite.panel_width,divider_width:control.composite.divider_width,divider_color:control.composite.divider_color,order:control.composite.order}},crop_preview:{path:'card-crop-preview.jpg',...crop,gravity:control.wall_crop.gravity,semantics:control.wall_crop.semantics},rejected_orbit_summary:['TheTVDB advertising and recommendation images were rejected despite appearing on an exact Twiki page.','Yahoo and TMZ recommendation-module imagery unrelated to Felix Silla was rejected.','The lower-resolution Sitcoms Online Cousin Itt page image was retained in the discovery artifact but not selected over the exact TMZ lead image.','IMDb anti-bot responses were retained as transport failures rather than identity evidence.'],duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:repository.size,status:'pass'},exact_subject_review:{identity:control.ruling.identity,presentation:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,notes:control.ruling.notes},disposition:control.ruling.candidate_disposition,canonical_mutation:false};
await writeJson(join(OUT,'manifest.json'),manifest);
await writeJson(join(OUT,'review.json'),{version:1,record_id:'UC-076',actor:'Felix Silla',character:'Twiki & Cousin Itt',side:'still',expected_subject:'Twiki & Cousin Itt',twiki_source_sha256:twikiOriginalMeta.sha256,cousin_itt_source_sha256:ittOriginalMeta.sha256,twiki_panel_sha256:twikiPanelMeta.sha256,cousin_itt_panel_sha256:ittPanelMeta.sha256,candidate_sha256:candidate.sha256,crop_preview_sha256:crop.sha256,identity_ruling:control.ruling.identity,presentation_ruling:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,reviewed_at:control.reviewed_at,canonical_mutation:false,disposition:control.ruling.candidate_disposition,notes:control.ruling.notes});
await writeFile(join(OUT,'review.md'),`# UC-076 reviewed Twiki / Cousin Itt still candidate\n\n- **Record:** UC-076\n- **Performer:** Felix Silla\n- **Displayed roles:** Twiki and Cousin Itt\n- **Productions:** Buck Rogers in the 25th Century / The Addams Family\n- **Twiki source:** [Buck Wiki](${control.selection.twiki.source_page})\n- **Cousin Itt source:** [TMZ](${control.selection.cousin_itt.source_page})\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${crop.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass — two-role diptych\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${control.ruling.notes.map(note=>`- ${note}`).join('\n')}\n\nThe exact Twiki JPEG and Cousin Itt WebP are retained unchanged, then independently rendered into two 624×1000 panels separated by a 12-pixel neutral divider. The 1246×1000 wall simulation removes only seven pixels from each outside edge and preserves both defining faces. This remains evidence-only pending independent canonical acceptance.\n`);
console.log(`RENDERED UC-076 diptych ${candidate.sha256}`);
console.log(`twiki ${twikiOriginalMeta.sha256} panel ${twikiPanelMeta.sha256}`);
console.log(`cousin-itt ${ittOriginalMeta.sha256} panel ${ittPanelMeta.sha256}`);
console.log(`crop ${crop.sha256} ${crop.width}x${crop.height}`);
console.log(`duplicate scan PASS against ${repository.size} canonical hashes`);
console.log(`artifact ${OUT}`);
