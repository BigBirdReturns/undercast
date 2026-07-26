#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const command=process.argv[2]||'materialize';
const CONTROL='.github/CARD-BACKFILL-UC-025-APPLY.json';
const SOURCE_ROOT=process.env.SOURCE_ROOT||'';
const DEST='data/review/card-backfill/UC-025';
const sha=value=>createHash('sha256').update(value).digest('hex');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
function signatureMime(bytes){if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
async function fileMeta(path){const bytes=await readFile(path);return{bytes:bytes.length,sha256:sha(bytes),mime:signatureMime(bytes)}}
async function walkImages(root,out=[]){let entries;try{entries=await readdir(root,{withFileTypes:true})}catch{return out}for(const entry of entries){const path=join(root,entry.name);if(entry.isDirectory())await walkImages(path,out);else if(/\.(?:jpe?g|png|webp)$/i.test(entry.name))out.push(path)}return out}
async function repositoryHashes(){const map=new Map();try{const manifest=await readJson('data/media-manifest.json');for(const[path,row]of Object.entries(manifest.assets||{})){if(!/^[0-9a-f]{64}$/i.test(row?.sha256||''))continue;const list=map.get(row.sha256)||[];list.push(`manifest:${path}`);map.set(row.sha256,list)}}catch{}for(const path of await walkImages('images')){try{const hash=sha(await readFile(path));const list=map.get(hash)||[];list.push(`file:${path}`);map.set(hash,list)}catch{}}return map}
const expectedFiles=['SHA256SUMS','card-crop-preview.jpg','crooked-man-original.jpg','duplicate-scan.json','keyface-original.jpg','mama-original.webp','manifest.json','review.json','review.md','uc-025-still-candidate.jpg'];

async function loadControl(){const control=await readJson(CONTROL);assert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-025','apply control scope drift');assert(control.actor==='Javier Botet'&&control.side==='still'&&control.reviewed_role==='second-desk','apply review authority drift');assert(control.render_artifact?.artifact_id===8627036627&&control.render_artifact?.head_sha==='aa864ae758e2ed19cccb8b2ceb0517715fa88f27','render artifact custody drift');for(const key of['mama_sha256','crooked_man_sha256','keyface_sha256','candidate_sha256','crop_preview_sha256'])assert(/^[0-9a-f]{64}$/.test(control.expected?.[key]||''),`missing expected ${key}`);assert(control.ruling?.identity==='expected-subject'&&control.ruling?.presentation==='character-depiction'&&control.ruling?.canonical_mutation===false,'review ruling drift');return control}

async function materialize(){assert(SOURCE_ROOT,'SOURCE_ROOT is required');const control=await loadControl();const sourceManifest=await readJson(join(SOURCE_ROOT,'manifest.json'));const sourceDuplicate=await readJson(join(SOURCE_ROOT,'duplicate-scan.json'));assert(sourceManifest.record_id==='UC-025'&&sourceManifest.actor==='Javier Botet'&&sourceManifest.side==='still','source manifest identity drift');assert(sourceManifest.candidate?.sha256===control.expected.candidate_sha256,'candidate hash differs from authorization');assert(sourceManifest.crop_preview?.sha256===control.expected.crop_preview_sha256,'crop-preview hash differs from authorization');assert(sourceManifest.candidate?.width===control.expected.candidate_width&&sourceManifest.candidate?.height===control.expected.candidate_height,'candidate geometry differs from authorization');assert(sourceManifest.crop_preview?.width===control.expected.crop_width&&sourceManifest.crop_preview?.height===control.expected.crop_height,'crop geometry differs from authorization');assert(sourceDuplicate.repository_hash_count===control.expected.duplicate_repository_hash_count,'duplicate denominator drift');for(const item of sourceDuplicate.items||[])assert(Array.isArray(item.matches)&&item.matches.length===0,`${item.label} has repository duplicate matches`);

const copyPlan=[
  ['originals/mama.webp','mama-original.webp','image/webp',control.expected.mama_sha256],
  ['originals/crooked-man.jpg','crooked-man-original.jpg','image/jpeg',control.expected.crooked_man_sha256],
  ['originals/keyface.jpg','keyface-original.jpg','image/jpeg',control.expected.keyface_sha256],
  ['uc-025-still-candidate.jpg','uc-025-still-candidate.jpg','image/jpeg',control.expected.candidate_sha256],
  ['card-crop-preview.jpg','card-crop-preview.jpg','image/jpeg',control.expected.crop_preview_sha256],
];
await rm(DEST,{recursive:true,force:true});await mkdir(DEST,{recursive:true});
for(const[sourceName,destName,mime,hash]of copyPlan){const source=join(SOURCE_ROOT,sourceName),meta=await fileMeta(source);assert(meta.mime===mime,`${sourceName} MIME drift ${meta.mime}`);assert(meta.sha256===hash,`${sourceName} hash drift`);await copyFile(source,join(DEST,destName));const after=await fileMeta(join(DEST,destName));assert(after.sha256===hash&&after.bytes===meta.bytes,`${destName} copy verification failed`)}

const sourceNames={mama:'mama-original.webp','crooked-man':'crooked-man-original.jpg',keyface:'keyface-original.jpg'};
const sources=(sourceManifest.sources||[]).map(source=>{
  const original={...source.original,path:sourceNames[source.key]};
  const renderBand=source.band?{artifact_path:source.band.path,mime:source.band.mime,bytes:source.band.bytes,sha256:source.band.sha256,width:source.band.width,height:source.band.height}:null;
  const row={...source,original};delete row.band;if(renderBand)row.render_band=renderBand;return row;
});
const duplicateScan={...sourceDuplicate,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,status:'pass',semantics:'Exact SHA-256 comparison against the repository media manifest and present canonical image tree at render time. Evidence-packet files are not canonical media bindings.'};
await writeJson(join(DEST,'duplicate-scan.json'),duplicateScan);
const manifest={
  version:1,lane:'card-backfill',record_id:'UC-025',actor:'Javier Botet',character:'Mama, the Crooked Man & others',side:'still',expected_subject:'Mama, the Crooked Man & others',
  reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,
  custody:{render_artifact:control.render_artifact,discovery_artifact:sourceManifest.discovery_artifact,apply_control_sha256:sha(await readFile(CONTROL))},
  sources,
  composition:sourceManifest.composition,
  candidate:{...sourceManifest.candidate,path:'uc-025-still-candidate.jpg'},
  crop_preview:{...sourceManifest.crop_preview,path:'card-crop-preview.jpg',semantics:'Exact 1246x1000 simulation of the current wall image-box crop; all three designed characters remain legible.'},
  duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:duplicateScan.repository_hash_count,status:'pass'},
  exact_subject_review:{identity:control.ruling.identity,presentation:control.ruling.presentation,notes:control.ruling.notes},
  disposition:control.ruling.candidate_disposition,
  canonical_mutation:false,
};
await writeJson(join(DEST,'manifest.json'),manifest);
const review={version:1,record_id:'UC-025',actor:'Javier Botet',character:'Mama, the Crooked Man & others',side:'still',expected_subject:'Mama, the Crooked Man & others',candidate_sha256:control.expected.candidate_sha256,crop_preview_sha256:control.expected.crop_preview_sha256,identity_ruling:control.ruling.identity,presentation_ruling:control.ruling.presentation,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,reviewed_at:control.reviewed_at,canonical_mutation:false,disposition:control.ruling.candidate_disposition,notes:control.ruling.notes};
await writeJson(join(DEST,'review.json'),review);
await writeFile(join(DEST,'review.md'),`# UC-025 reviewed still candidate\n\n- **Record:** UC-025\n- **Performer:** Javier Botet\n- **Displayed roles:** Mama, the Crooked Man & others\n- **Candidate:** \`${control.expected.candidate_sha256}\`\n- **Wall-crop preview:** \`${control.expected.crop_preview_sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Canonical mutation:** none\n\n## Composition\n\nThe exact 1260×1000 candidate uses three horizontal role bands: Mama on top, the Crooked Man in the middle, and KeyFace on the bottom. Two neutral 12-pixel dividers preserve the evidence boundary between roles.\n\n## Visual ruling\n\n${control.ruling.notes.map(note=>`- ${note}`).join('\n')}\n\n## Source custody\n\n- Mama: [Bloody Disgusting](${sources.find(row=>row.key==='mama')?.source_page})\n- Crooked Man: [/Film](${sources.find(row=>row.key==='crooked-man')?.source_page})\n- KeyFace: [/Film](${sources.find(row=>row.key==='keyface')?.source_page})\n\nThis packet is an evidence-backed card candidate for the website-maintenance controller. It does not itself alter the canonical specimen, source ledger, media audit, site, deployment, gold state, or activation state.\n`);
const repository=await repositoryHashes();for(const[,, ,hash]of copyPlan){assert(!(repository.get(hash)||[]).length,`authorized evidence bytes duplicate canonical repository media: ${(repository.get(hash)||[]).join(', ')}`)}
const sumNames=expectedFiles.filter(name=>name!=='SHA256SUMS');const sums=[];for(const name of sumNames){const bytes=await readFile(join(DEST,name));sums.push(`${sha(bytes)}  ${name}`)}await writeFile(join(DEST,'SHA256SUMS'),sums.join('\n')+'\n');
await validate();console.log(`MATERIALIZED ${DEST}: ${expectedFiles.length} reviewed evidence files`);console.log(`candidate ${control.expected.candidate_sha256}`);console.log(`crop ${control.expected.crop_preview_sha256}`);console.log(`canonical mutation false`)}

async function validate(){const control=await loadControl();const names=(await readdir(DEST)).sort();assert(JSON.stringify(names)===JSON.stringify([...expectedFiles].sort()),`UC-025 evidence file set drift: ${names.join(', ')}`);const sums=String(await readFile(join(DEST,'SHA256SUMS'),'utf8')).trim().split('\n').filter(Boolean);assert(sums.length===expectedFiles.length-1,'SHA256SUMS row count drift');for(const line of sums){const match=line.match(/^([0-9a-f]{64})  (.+)$/);assert(match,`malformed SHA256SUMS line ${line}`);const bytes=await readFile(join(DEST,match[2]));assert(sha(bytes)===match[1],`${match[2]} checksum drift`)}const manifest=await readJson(join(DEST,'manifest.json')),review=await readJson(join(DEST,'review.json')),duplicates=await readJson(join(DEST,'duplicate-scan.json'));assert(manifest.candidate?.sha256===control.expected.candidate_sha256&&review.candidate_sha256===control.expected.candidate_sha256,'candidate receipt drift');assert(manifest.crop_preview?.sha256===control.expected.crop_preview_sha256&&review.crop_preview_sha256===control.expected.crop_preview_sha256,'crop receipt drift');assert(manifest.sources?.length===3&&new Set(manifest.sources.map(row=>row.key)).size===3,'source receipt drift');assert(review.identity_ruling==='expected-subject'&&review.presentation_ruling==='character-depiction'&&review.canonical_mutation===false,'review disposition drift');assert(duplicates.status==='pass'&&duplicates.repository_hash_count===2070&&(duplicates.items||[]).every(item=>item.matches?.length===0),'duplicate receipt drift');const candidate=await fileMeta(join(DEST,'uc-025-still-candidate.jpg')),crop=await fileMeta(join(DEST,'card-crop-preview.jpg'));assert(candidate.sha256===control.expected.candidate_sha256&&candidate.mime==='image/jpeg','candidate bytes drift');assert(crop.sha256===control.expected.crop_preview_sha256&&crop.mime==='image/jpeg','crop bytes drift');for(const name of names)assert((await stat(join(DEST,name))).isFile(),`${name} is not a regular file`);console.log(`VALID ${DEST}: exact reviewed evidence packet; no canonical mutation`)}

if(command==='materialize')await materialize();else if(command==='validate')await validate();else throw new Error(`unknown command ${command}`);
