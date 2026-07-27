#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const command=process.argv[2]||'materialize';
const CONTROL='.github/CARD-BACKFILL-UC-076-APPLY.json';
const SOURCE_ROOT=process.env.SOURCE_ROOT||'';
const DEST='data/review/card-backfill/UC-076';
const sha=value=>createHash('sha256').update(value).digest('hex');
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{await mkdir(DEST,{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
function signatureMime(bytes){if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return'image/jpeg';if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
async function receipt(path){const bytes=await readFile(path);return{bytes:bytes.length,sha256:sha(bytes),mime:signatureMime(bytes)}}
async function walkImages(root,out=[]){let entries;try{entries=await readdir(root,{withFileTypes:true})}catch{return out}for(const entry of entries){const path=join(root,entry.name);if(entry.isDirectory())await walkImages(path,out);else if(/\.(?:jpe?g|png|webp)$/i.test(entry.name))out.push(path)}return out}
async function repositoryHashes(){const map=new Map();try{const manifest=await readJson('data/media-manifest.json');for(const[path,row]of Object.entries(manifest.assets||{})){if(!/^[0-9a-f]{64}$/i.test(row?.sha256||''))continue;const list=map.get(row.sha256)||[];list.push(`manifest:${path}`);map.set(row.sha256,list)}}catch{}for(const path of await walkImages('images')){try{const hash=sha(await readFile(path));const list=map.get(hash)||[];list.push(`file:${path}`);map.set(hash,list)}catch{}}return map}
const expectedFiles=['SHA256SUMS','card-crop-preview.jpg','cousin-itt-original.webp','cousin-itt-panel.jpg','duplicate-scan.json','manifest.json','review.json','review.md','source-page-cousin-itt.png','source-page-twiki.png','twiki-original.jpg','twiki-panel.jpg','uc-076-still-candidate.jpg'];

async function loadControl(){
  const control=await readJson(CONTROL);
  assert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-076','UC-076 apply scope drift');
  assert(control.actor==='Felix Silla'&&control.character==='Twiki & Cousin Itt'&&control.side==='still'&&control.reviewed_role==='second-desk','UC-076 apply authority drift');
  assert(control.render_artifact?.artifact_id===8642086128&&control.render_artifact?.head_sha==='b60fc0323777238964d18c28cba5405e65c9e16c','UC-076 render custody drift');
  for(const key of['twiki_original_sha256','cousin_itt_original_sha256','twiki_panel_sha256','cousin_itt_panel_sha256','candidate_sha256','crop_preview_sha256','twiki_page_sha256','cousin_itt_page_sha256','source_manifest_sha256','source_duplicate_scan_sha256','source_review_json_sha256','source_review_md_sha256'])assert(/^[0-9a-f]{64}$/.test(control.expected?.[key]||''),`missing expected ${key}`);
  assert(control.ruling?.identity==='expected-subject'&&control.ruling?.presentation==='character-depiction'&&control.ruling?.crop_ruling==='pass-two-role-diptych'&&control.ruling?.canonical_mutation===false,'UC-076 apply ruling drift');
  return control;
}

async function materialize(){
  assert(SOURCE_ROOT,'SOURCE_ROOT is required');
  const control=await loadControl();
  const sourceFiles={manifest:'manifest.json',duplicates:'duplicate-scan.json',review:'review.json',reviewMd:'review.md',twikiOriginal:'twiki-original.jpg',ittOriginal:'cousin-itt-original.webp',twikiPanel:'twiki-panel.jpg',ittPanel:'cousin-itt-panel.jpg',candidate:'uc-076-still-candidate.jpg',crop:'card-crop-preview.jpg',twikiPage:'source-page-twiki.png',ittPage:'source-page-cousin-itt.png'};
  const meta={};for(const[name,file]of Object.entries(sourceFiles))meta[name]=await receipt(join(SOURCE_ROOT,file));
  assert(meta.manifest.sha256===control.expected.source_manifest_sha256,'source manifest custody drift');
  assert(meta.duplicates.sha256===control.expected.source_duplicate_scan_sha256,'source duplicate receipt custody drift');
  assert(meta.review.sha256===control.expected.source_review_json_sha256,'source review JSON custody drift');
  assert(meta.reviewMd.sha256===control.expected.source_review_md_sha256,'source review Markdown custody drift');
  assert(meta.twikiOriginal.sha256===control.expected.twiki_original_sha256&&meta.twikiOriginal.mime===control.expected.twiki_original_mime&&meta.twikiOriginal.bytes===control.expected.twiki_original_bytes,'Twiki original custody drift');
  assert(meta.ittOriginal.sha256===control.expected.cousin_itt_original_sha256&&meta.ittOriginal.mime===control.expected.cousin_itt_original_mime&&meta.ittOriginal.bytes===control.expected.cousin_itt_original_bytes,'Cousin Itt original custody drift');
  assert(meta.twikiPanel.sha256===control.expected.twiki_panel_sha256&&meta.twikiPanel.mime==='image/jpeg'&&meta.twikiPanel.bytes===control.expected.twiki_panel_bytes,'Twiki panel custody drift');
  assert(meta.ittPanel.sha256===control.expected.cousin_itt_panel_sha256&&meta.ittPanel.mime==='image/jpeg'&&meta.ittPanel.bytes===control.expected.cousin_itt_panel_bytes,'Cousin Itt panel custody drift');
  assert(meta.candidate.sha256===control.expected.candidate_sha256&&meta.candidate.mime===control.expected.candidate_mime&&meta.candidate.bytes===control.expected.candidate_bytes,'candidate custody drift');
  assert(meta.crop.sha256===control.expected.crop_preview_sha256&&meta.crop.mime===control.expected.crop_preview_mime&&meta.crop.bytes===control.expected.crop_preview_bytes,'crop custody drift');
  assert(meta.twikiPage.sha256===control.expected.twiki_page_sha256&&meta.twikiPage.mime==='image/png','Twiki page custody drift');
  assert(meta.ittPage.sha256===control.expected.cousin_itt_page_sha256&&meta.ittPage.mime==='image/png','Cousin Itt page custody drift');

  const sourceManifest=await readJson(join(SOURCE_ROOT,'manifest.json'));
  const sourceDuplicate=await readJson(join(SOURCE_ROOT,'duplicate-scan.json'));
  const sourceReview=await readJson(join(SOURCE_ROOT,'review.json'));
  assert(sourceManifest.record_id==='UC-076'&&sourceManifest.actor==='Felix Silla'&&sourceManifest.character==='Twiki & Cousin Itt'&&sourceManifest.side==='still','source manifest identity drift');
  assert(sourceManifest.sources?.twiki?.provider==='Buck Wiki'&&sourceManifest.sources?.cousin_itt?.provider==='TMZ','source provenance drift');
  assert(sourceManifest.originals?.twiki?.sha256===control.expected.twiki_original_sha256&&sourceManifest.originals?.cousin_itt?.sha256===control.expected.cousin_itt_original_sha256,'source originals receipt drift');
  assert(sourceManifest.panels?.twiki?.sha256===control.expected.twiki_panel_sha256&&sourceManifest.panels?.cousin_itt?.sha256===control.expected.cousin_itt_panel_sha256,'source panel receipt drift');
  assert(sourceManifest.candidate?.sha256===control.expected.candidate_sha256&&sourceManifest.candidate?.width===control.expected.candidate_width&&sourceManifest.candidate?.height===control.expected.candidate_height,'source candidate receipt drift');
  assert(sourceManifest.crop_preview?.sha256===control.expected.crop_preview_sha256&&sourceManifest.crop_preview?.width===control.expected.crop_width&&sourceManifest.crop_preview?.height===control.expected.crop_height,'source crop receipt drift');
  assert(sourceDuplicate.repository_hash_count===control.expected.duplicate_repository_hash_count&&(sourceDuplicate.items||[]).length===6&&(sourceDuplicate.items||[]).every(item=>Array.isArray(item.matches)&&item.matches.length===0),'source duplicate boundary drift');
  assert(sourceReview.identity_ruling==='expected-subject'&&sourceReview.presentation_ruling==='character-depiction'&&sourceReview.crop_ruling==='pass-two-role-diptych'&&sourceReview.canonical_mutation===false,'source review disposition drift');

  await rm(DEST,{recursive:true,force:true});await mkdir(DEST,{recursive:true});
  for(const file of['twiki-original.jpg','cousin-itt-original.webp','twiki-panel.jpg','cousin-itt-panel.jpg','uc-076-still-candidate.jpg','card-crop-preview.jpg','source-page-twiki.png','source-page-cousin-itt.png'])await copyFile(join(SOURCE_ROOT,file),join(DEST,file));
  const duplicateScan={...sourceDuplicate,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,status:'pass',semantics:'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'};
  await writeJson(join(DEST,'duplicate-scan.json'),duplicateScan);
  const manifest={...sourceManifest,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,custody:{...sourceManifest.custody,render_artifact:control.render_artifact,apply_control_sha256:sha(await readFile(CONTROL)),source_manifest_sha256:control.expected.source_manifest_sha256},duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:duplicateScan.repository_hash_count,status:'pass'},exact_subject_review:{identity:control.ruling.identity,presentation:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,notes:control.ruling.notes},disposition:control.ruling.candidate_disposition,canonical_mutation:false};
  await writeJson(join(DEST,'manifest.json'),manifest);
  const review={...sourceReview,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,identity_ruling:control.ruling.identity,presentation_ruling:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,canonical_mutation:false,disposition:control.ruling.candidate_disposition,notes:control.ruling.notes};
  await writeJson(join(DEST,'review.json'),review);
  await writeFile(join(DEST,'review.md'),`# UC-076 reviewed Twiki / Cousin Itt still candidate\n\n- **Record:** UC-076\n- **Performer:** Felix Silla\n- **Displayed roles:** Twiki and Cousin Itt\n- **Productions:** Buck Rogers in the 25th Century / The Addams Family\n- **Twiki source:** [Buck Wiki](${manifest.sources.twiki.source_page})\n- **Cousin Itt source:** [TMZ](${manifest.sources.cousin_itt.source_page})\n- **Candidate:** \`${control.expected.candidate_sha256}\`\n- **Wall-crop preview:** \`${control.expected.crop_preview_sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass — two-role diptych\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${control.ruling.notes.map(note=>`- ${note}`).join('\n')}\n\nThe exact source bytes and two independently rendered panels are retained with both source-page screenshots. The diptych remains evidence-only pending independent canonical acceptance.\n`);

  const repository=await repositoryHashes();assert(repository.size===control.expected.duplicate_repository_hash_count,`repository hash denominator drift ${repository.size}`);
  for(const hash of[control.expected.twiki_original_sha256,control.expected.cousin_itt_original_sha256,control.expected.twiki_panel_sha256,control.expected.cousin_itt_panel_sha256,control.expected.candidate_sha256,control.expected.crop_preview_sha256])assert(!(repository.get(hash)||[]).length,`authorized evidence duplicates canonical media: ${(repository.get(hash)||[]).join(', ')}`);
  const sums=[];for(const file of expectedFiles.filter(name=>name!=='SHA256SUMS')){const bytes=await readFile(join(DEST,file));sums.push(`${sha(bytes)}  ${file}`)}
  await writeFile(join(DEST,'SHA256SUMS'),sums.join('\n')+'\n');
  await validate();
  console.log(`MATERIALIZED ${DEST}: ${expectedFiles.length} reviewed evidence files`);
  console.log(`candidate ${control.expected.candidate_sha256}`);
  console.log(`crop ${control.expected.crop_preview_sha256}`);
  console.log('canonical mutation false');
}

async function validate(){
  const control=await loadControl();
  const names=(await readdir(DEST)).sort();assert(JSON.stringify(names)===JSON.stringify([...expectedFiles].sort()),`UC-076 evidence file set drift: ${names.join(', ')}`);
  const sums=String(await readFile(join(DEST,'SHA256SUMS'),'utf8')).trim().split('\n').filter(Boolean);assert(sums.length===expectedFiles.length-1,'SHA256SUMS row count drift');
  for(const line of sums){const match=line.match(/^([0-9a-f]{64})  (.+)$/);assert(match,`malformed checksum ${line}`);assert(sha(await readFile(join(DEST,match[2])))===match[1],`${match[2]} checksum drift`)}
  const manifest=await readJson(join(DEST,'manifest.json')),review=await readJson(join(DEST,'review.json')),duplicates=await readJson(join(DEST,'duplicate-scan.json'));
  assert(manifest.record_id==='UC-076'&&manifest.actor==='Felix Silla'&&manifest.candidate?.sha256===control.expected.candidate_sha256&&review.candidate_sha256===control.expected.candidate_sha256,'candidate receipt drift');
  assert(manifest.originals?.twiki?.sha256===control.expected.twiki_original_sha256&&manifest.originals?.cousin_itt?.sha256===control.expected.cousin_itt_original_sha256,'original receipt drift');
  assert(manifest.panels?.twiki?.sha256===control.expected.twiki_panel_sha256&&manifest.panels?.cousin_itt?.sha256===control.expected.cousin_itt_panel_sha256,'panel receipt drift');
  assert(manifest.crop_preview?.sha256===control.expected.crop_preview_sha256&&review.crop_preview_sha256===control.expected.crop_preview_sha256,'crop receipt drift');
  assert(manifest.sources?.twiki?.provider==='Buck Wiki'&&manifest.sources?.cousin_itt?.provider==='TMZ','source receipt drift');
  assert(review.identity_ruling==='expected-subject'&&review.presentation_ruling==='character-depiction'&&review.crop_ruling==='pass-two-role-diptych'&&review.canonical_mutation===false,'review receipt drift');
  assert(duplicates.status==='pass'&&duplicates.repository_hash_count===2070&&(duplicates.items||[]).length===6&&(duplicates.items||[]).every(item=>item.matches?.length===0),'duplicate receipt drift');
  assert((await receipt(join(DEST,'twiki-original.jpg'))).sha256===control.expected.twiki_original_sha256,'Twiki bytes drift');
  assert((await receipt(join(DEST,'cousin-itt-original.webp'))).sha256===control.expected.cousin_itt_original_sha256,'Cousin Itt bytes drift');
  assert((await receipt(join(DEST,'uc-076-still-candidate.jpg'))).sha256===control.expected.candidate_sha256,'candidate bytes drift');
  assert((await receipt(join(DEST,'card-crop-preview.jpg'))).sha256===control.expected.crop_preview_sha256,'crop bytes drift');
  for(const file of names)assert((await stat(join(DEST,file))).isFile(),`${file} is not a regular file`);
  console.log(`VALID ${DEST}: exact reviewed two-role evidence packet; no canonical mutation`);
}

if(command==='materialize')await materialize();else if(command==='validate')await validate();else throw new Error(`unknown command ${command}`);
