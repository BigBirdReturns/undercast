#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const command=process.argv[2]||'materialize';
const CONTROL='.github/CARD-BACKFILL-UC-053-APPLY.json';
const SOURCE_ROOT=process.env.SOURCE_ROOT||'';
const DEST='data/review/card-backfill/UC-053';
const sha=value=>createHash('sha256').update(value).digest('hex');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
function signatureMime(bytes){if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
async function fileMeta(path){const bytes=await readFile(path);return{bytes:bytes.length,sha256:sha(bytes),mime:signatureMime(bytes)}}
async function walkImages(root,out=[]){let entries;try{entries=await readdir(root,{withFileTypes:true})}catch{return out}for(const entry of entries){const path=join(root,entry.name);if(entry.isDirectory())await walkImages(path,out);else if(/\.(?:jpe?g|png|webp)$/i.test(entry.name))out.push(path)}return out}
async function repositoryHashes(){const map=new Map();try{const manifest=await readJson('data/media-manifest.json');for(const[path,row]of Object.entries(manifest.assets||{})){if(!/^[0-9a-f]{64}$/i.test(row?.sha256||''))continue;const list=map.get(row.sha256)||[];list.push(`manifest:${path}`);map.set(row.sha256,list)}}catch{}for(const path of await walkImages('images')){try{const hash=sha(await readFile(path));const list=map.get(hash)||[];list.push(`file:${path}`);map.set(hash,list)}catch{}}return map}
const expectedFiles=['SHA256SUMS','card-crop-preview.jpg','duplicate-scan.json','manifest.json','review.json','review.md','source-page.png','uc-053-still-candidate.jpg'];

async function loadControl(){
  const control=await readJson(CONTROL);
  assert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-053','apply control scope drift');
  assert(control.actor==='Gary Oldman'&&control.character==='Dracula'&&control.side==='still'&&control.reviewed_role==='second-desk','apply authority drift');
  assert(control.render_artifact?.artifact_id===8634693014&&control.render_artifact?.head_sha==='d83760c76ea7abadc03a0cec1737a829033300ed','render artifact custody drift');
  for(const key of['candidate_sha256','crop_preview_sha256','source_page_sha256','source_manifest_sha256','source_duplicate_scan_sha256','source_review_json_sha256','source_review_md_sha256'])assert(/^[0-9a-f]{64}$/.test(control.expected?.[key]||''),`missing expected ${key}`);
  assert(control.ruling?.identity==='expected-subject'&&control.ruling?.presentation==='character-depiction'&&control.ruling?.crop_ruling==='pass'&&control.ruling?.canonical_mutation===false,'review ruling drift');
  return control;
}

async function materialize(){
  assert(SOURCE_ROOT,'SOURCE_ROOT is required');
  const control=await loadControl();
  const sourceFiles={manifest:'manifest.json',duplicates:'duplicate-scan.json',review:'review.json',reviewMd:'review.md',candidate:'uc-053-still-candidate.jpg',crop:'card-crop-preview.jpg',page:'source-page.png'};
  const sourceMeta={};
  for(const[name,file]of Object.entries(sourceFiles))sourceMeta[name]=await fileMeta(join(SOURCE_ROOT,file));
  assert(sourceMeta.manifest.sha256===control.expected.source_manifest_sha256,'source manifest custody drift');
  assert(sourceMeta.duplicates.sha256===control.expected.source_duplicate_scan_sha256,'source duplicate receipt custody drift');
  assert(sourceMeta.review.sha256===control.expected.source_review_json_sha256,'source review JSON custody drift');
  assert(sourceMeta.reviewMd.sha256===control.expected.source_review_md_sha256,'source review Markdown custody drift');
  assert(sourceMeta.candidate.sha256===control.expected.candidate_sha256&&sourceMeta.candidate.mime===control.expected.candidate_mime&&sourceMeta.candidate.bytes===control.expected.candidate_bytes,'candidate byte custody drift');
  assert(sourceMeta.crop.sha256===control.expected.crop_preview_sha256&&sourceMeta.crop.mime===control.expected.crop_preview_mime&&sourceMeta.crop.bytes===control.expected.crop_preview_bytes,'crop byte custody drift');
  assert(sourceMeta.page.sha256===control.expected.source_page_sha256&&sourceMeta.page.mime==='image/png','source-page screenshot custody drift');

  const sourceManifest=await readJson(join(SOURCE_ROOT,'manifest.json'));
  const sourceDuplicate=await readJson(join(SOURCE_ROOT,'duplicate-scan.json'));
  const sourceReview=await readJson(join(SOURCE_ROOT,'review.json'));
  assert(sourceManifest.record_id==='UC-053'&&sourceManifest.actor==='Gary Oldman'&&sourceManifest.character==='Dracula'&&sourceManifest.side==='still','source manifest identity drift');
  assert(sourceManifest.source?.provider==='/Film'&&sourceManifest.source?.source_key==='slashfilm-scariest-scene'&&sourceManifest.source?.source_page==='https://www.slashfilm.com/981939/one-of-the-scariest-scenes-in-bram-stokers-dracula-goes-vampire-hunting/','source provenance drift');
  assert(String(sourceManifest.source?.article_evidence||'').includes('Gary Oldman')&&String(sourceManifest.source?.article_evidence||'').includes("'Old dracula'"),'article evidence drift');
  assert(sourceManifest.alternate_visual_duplicate?.sha256==='672e2c25d0612ae37c8b5a321660882a7ad3f8242a9824d05393b605bf5dd363'&&sourceManifest.alternate_visual_duplicate?.disposition==='rejected-alternate-encoding-of-selected-frame','alternate visual-duplicate receipt drift');
  assert(sourceManifest.candidate?.sha256===control.expected.candidate_sha256&&sourceManifest.candidate?.width===control.expected.candidate_width&&sourceManifest.candidate?.height===control.expected.candidate_height,'source candidate receipt drift');
  assert(sourceManifest.crop_preview?.sha256===control.expected.crop_preview_sha256&&sourceManifest.crop_preview?.width===control.expected.crop_width&&sourceManifest.crop_preview?.height===control.expected.crop_height,'source crop receipt drift');
  assert(sourceDuplicate.repository_hash_count===control.expected.duplicate_repository_hash_count&&(sourceDuplicate.items||[]).every(item=>Array.isArray(item.matches)&&item.matches.length===0),'source duplicate boundary drift');
  assert(sourceReview.identity_ruling==='expected-subject'&&sourceReview.presentation_ruling==='character-depiction'&&sourceReview.crop_ruling==='pass'&&sourceReview.canonical_mutation===false,'source review disposition drift');

  await rm(DEST,{recursive:true,force:true});
  await mkdir(DEST,{recursive:true});
  for(const file of['uc-053-still-candidate.jpg','card-crop-preview.jpg','source-page.png'])await copyFile(join(SOURCE_ROOT,file),join(DEST,file));

  const duplicateScan={...sourceDuplicate,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,status:'pass',semantics:'Exact SHA-256 comparison against the canonical media manifest and present image tree at render time. Evidence-packet files are not canonical media bindings.'};
  await writeJson(join(DEST,'duplicate-scan.json'),duplicateScan);
  const manifest={...sourceManifest,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,custody:{...sourceManifest.custody,render_artifact:control.render_artifact,apply_control_sha256:sha(await readFile(CONTROL)),source_manifest_sha256:control.expected.source_manifest_sha256},duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:duplicateScan.repository_hash_count,status:'pass'},exact_subject_review:{identity:control.ruling.identity,presentation:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,notes:control.ruling.notes},disposition:control.ruling.candidate_disposition,canonical_mutation:false};
  await writeJson(join(DEST,'manifest.json'),manifest);
  const review={...sourceReview,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,identity_ruling:control.ruling.identity,presentation_ruling:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,canonical_mutation:false,disposition:control.ruling.candidate_disposition,notes:control.ruling.notes};
  await writeJson(join(DEST,'review.json'),review);
  await writeFile(join(DEST,'review.md'),`# UC-053 reviewed Dracula still candidate\n\n- **Record:** UC-053\n- **Performer:** Gary Oldman\n- **Displayed role:** Dracula\n- **Production:** Bram Stoker's Dracula (1992)\n- **Source:** [/Film old-Count article image](${manifest.source.source_page})\n- **Candidate:** \`${control.expected.candidate_sha256}\`\n- **Wall-crop preview:** \`${control.expected.crop_preview_sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${control.ruling.notes.map(note=>`- ${note}`).join('\n')}\n\n## Custody\n\nThe exact JPEG source byte is retained unchanged as \`uc-053-still-candidate.jpg\`. The source-page screenshot is retained as \`source-page.png\`. The alternate WebP encoding of the same frame is documented as a rejected visual duplicate rather than a second candidate.\n\nThis packet is an evidence-backed card candidate for the website-maintenance controller. It does not itself alter the canonical specimen, source ledger, media audit, site shell, deployment, roadmap, gold state, or activation state.\n`);

  const repository=await repositoryHashes();
  assert(repository.size===control.expected.duplicate_repository_hash_count,`repository hash denominator drift ${repository.size}`);
  for(const hash of[control.expected.candidate_sha256,control.expected.crop_preview_sha256])assert(!(repository.get(hash)||[]).length,`authorized evidence bytes duplicate canonical media: ${(repository.get(hash)||[]).join(', ')}`);
  const sumNames=expectedFiles.filter(name=>name!=='SHA256SUMS'),sums=[];
  for(const name of sumNames){const bytes=await readFile(join(DEST,name));sums.push(`${sha(bytes)}  ${name}`)}
  await writeFile(join(DEST,'SHA256SUMS'),sums.join('\n')+'\n');
  await validate();
  console.log(`MATERIALIZED ${DEST}: ${expectedFiles.length} reviewed evidence files`);
  console.log(`candidate ${control.expected.candidate_sha256}`);
  console.log(`crop ${control.expected.crop_preview_sha256}`);
  console.log('canonical mutation false');
}

async function validate(){
  const control=await loadControl();
  const names=(await readdir(DEST)).sort();
  assert(JSON.stringify(names)===JSON.stringify([...expectedFiles].sort()),`UC-053 evidence file set drift: ${names.join(', ')}`);
  const sums=String(await readFile(join(DEST,'SHA256SUMS'),'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length===expectedFiles.length-1,'SHA256SUMS row count drift');
  for(const line of sums){const match=line.match(/^([0-9a-f]{64})  (.+)$/);assert(match,`malformed SHA256SUMS line ${line}`);const bytes=await readFile(join(DEST,match[2]));assert(sha(bytes)===match[1],`${match[2]} checksum drift`)}
  const manifest=await readJson(join(DEST,'manifest.json'));
  const review=await readJson(join(DEST,'review.json'));
  const duplicates=await readJson(join(DEST,'duplicate-scan.json'));
  assert(manifest.candidate?.sha256===control.expected.candidate_sha256&&review.candidate_sha256===control.expected.candidate_sha256,'candidate receipt drift');
  assert(manifest.crop_preview?.sha256===control.expected.crop_preview_sha256&&review.crop_preview_sha256===control.expected.crop_preview_sha256,'crop receipt drift');
  assert(manifest.source?.provider==='/Film'&&manifest.source?.source_page==='https://www.slashfilm.com/981939/one-of-the-scariest-scenes-in-bram-stokers-dracula-goes-vampire-hunting/','source receipt drift');
  assert(manifest.alternate_visual_duplicate?.sha256==='672e2c25d0612ae37c8b5a321660882a7ad3f8242a9824d05393b605bf5dd363','alternate encoding receipt drift');
  assert(review.identity_ruling==='expected-subject'&&review.presentation_ruling==='character-depiction'&&review.crop_ruling==='pass'&&review.canonical_mutation===false,'review disposition drift');
  assert(duplicates.status==='pass'&&duplicates.repository_hash_count===control.expected.duplicate_repository_hash_count&&(duplicates.items||[]).every(item=>item.matches?.length===0),'duplicate receipt drift');
  const candidate=await fileMeta(join(DEST,'uc-053-still-candidate.jpg'));
  const crop=await fileMeta(join(DEST,'card-crop-preview.jpg'));
  const page=await fileMeta(join(DEST,'source-page.png'));
  assert(candidate.sha256===control.expected.candidate_sha256&&candidate.mime==='image/jpeg','candidate bytes drift');
  assert(crop.sha256===control.expected.crop_preview_sha256&&crop.mime==='image/jpeg','crop bytes drift');
  assert(page.sha256===control.expected.source_page_sha256&&page.mime==='image/png','source page bytes drift');
  for(const name of names)assert((await stat(join(DEST,name))).isFile(),`${name} is not a regular file`);
  console.log(`VALID ${DEST}: exact reviewed evidence packet; no canonical mutation`);
}

if(command==='materialize')await materialize();else if(command==='validate')await validate();else throw new Error(`unknown command ${command}`);
