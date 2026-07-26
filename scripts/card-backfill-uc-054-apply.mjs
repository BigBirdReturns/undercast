#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const command=process.argv[2]||'materialize';
const CONTROL='.github/CARD-BACKFILL-UC-054-APPLY.json';
const SOURCE_ROOT=process.env.SOURCE_ROOT||'';
const DEST='data/review/card-backfill/UC-054';
const sha=v=>createHash('sha256').update(v).digest('hex');
const assert=(c,m)=>{if(!c)throw new Error(m)};
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const writeJson=async(p,v)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(v,null,2)+'\n')};
function mime(b){if(b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return'image/jpeg';if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(b.length>=12&&b.subarray(0,4).toString('ascii')==='RIFF'&&b.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
async function meta(p){const b=await readFile(p);return{bytes:b.length,sha256:sha(b),mime:mime(b)}}
async function walk(root,out=[]){let es;try{es=await readdir(root,{withFileTypes:true})}catch{return out}for(const e of es){const p=join(root,e.name);if(e.isDirectory())await walk(p,out);else if(/\.(?:jpe?g|png|webp)$/i.test(e.name))out.push(p)}return out}
async function repositoryHashes(){const m=new Map();try{const x=await readJson('data/media-manifest.json');for(const[p,r]of Object.entries(x.assets||{})){if(!/^[0-9a-f]{64}$/i.test(r?.sha256||''))continue;const a=m.get(r.sha256)||[];a.push(`manifest:${p}`);m.set(r.sha256,a)}}catch{}for(const p of await walk('images')){try{const h=sha(await readFile(p));const a=m.get(h)||[];a.push(`file:${p}`);m.set(h,a)}catch{}}return m}
const expectedFiles=['SHA256SUMS','card-crop-preview.jpg','duplicate-scan.json','manifest.json','review.json','review.md','source-page.png','uc-054-still-candidate.webp'];

async function loadControl(){
 const c=await readJson(CONTROL);
 assert(c.version===1&&c.record_id==='UC-054'&&c.actor==='Michael Keaton'&&c.character==='Betelgeuse'&&c.side==='still','apply scope drift');
 assert(c.reviewed_role==='second-desk'&&c.render_artifact?.artifact_id===8634913781&&c.render_artifact?.head_sha==='7dcbb1e3964a77a9c15fcae00ccf2314251e35a6','apply custody drift');
 for(const k of['candidate_sha256','crop_preview_sha256','source_page_sha256','source_manifest_sha256','source_duplicate_scan_sha256','source_review_json_sha256','source_review_md_sha256'])assert(/^[0-9a-f]{64}$/.test(c.expected?.[k]||''),`missing ${k}`);
 assert(c.ruling?.identity==='expected-subject'&&c.ruling?.presentation==='character-depiction'&&c.ruling?.crop_ruling==='pass'&&c.ruling?.canonical_mutation===false,'apply ruling drift');
 return c;
}

async function materialize(){
 assert(SOURCE_ROOT,'SOURCE_ROOT is required');
 const c=await loadControl();
 const files={manifest:'manifest.json',duplicates:'duplicate-scan.json',review:'review.json',reviewMd:'review.md',candidate:'uc-054-still-candidate.webp',crop:'card-crop-preview.jpg',page:'source-page.png'};
 const m={};for(const[k,f]of Object.entries(files))m[k]=await meta(join(SOURCE_ROOT,f));
 assert(m.manifest.sha256===c.expected.source_manifest_sha256,'manifest custody drift');
 assert(m.duplicates.sha256===c.expected.source_duplicate_scan_sha256,'duplicate custody drift');
 assert(m.review.sha256===c.expected.source_review_json_sha256,'review JSON custody drift');
 assert(m.reviewMd.sha256===c.expected.source_review_md_sha256,'review markdown custody drift');
 assert(m.candidate.sha256===c.expected.candidate_sha256&&m.candidate.mime==='image/webp'&&m.candidate.bytes===c.expected.candidate_bytes,'candidate custody drift');
 assert(m.crop.sha256===c.expected.crop_preview_sha256&&m.crop.mime==='image/jpeg'&&m.crop.bytes===c.expected.crop_preview_bytes,'crop custody drift');
 assert(m.page.sha256===c.expected.source_page_sha256&&m.page.mime==='image/png','page custody drift');
 const sm=await readJson(join(SOURCE_ROOT,'manifest.json')),sd=await readJson(join(SOURCE_ROOT,'duplicate-scan.json')),sr=await readJson(join(SOURCE_ROOT,'review.json'));
 assert(sm.record_id==='UC-054'&&sm.actor==='Michael Keaton'&&sm.character==='Betelgeuse'&&sm.side==='still','source identity drift');
 assert(sm.source?.provider==='Yahoo Entertainment'&&sm.source?.source_key==='yahoo-transformation','source provenance drift');
 assert(sm.alternate_visual_duplicate?.sha256==='8447b68e2d5acfe07a9f0d782075f0289f19d6da14d1c8b85f828bde0bf0eab1','alternate receipt drift');
 assert(sm.candidate?.sha256===c.expected.candidate_sha256&&sm.candidate?.width===c.expected.candidate_width&&sm.candidate?.height===c.expected.candidate_height,'candidate receipt drift');
 assert(sm.crop_preview?.sha256===c.expected.crop_preview_sha256&&sm.crop_preview?.width===c.expected.crop_width&&sm.crop_preview?.height===c.expected.crop_height,'crop receipt drift');
 assert(sd.repository_hash_count===c.expected.duplicate_repository_hash_count&&(sd.items||[]).every(x=>Array.isArray(x.matches)&&x.matches.length===0),'duplicate boundary drift');
 assert(sr.identity_ruling==='expected-subject'&&sr.presentation_ruling==='character-depiction'&&sr.crop_ruling==='pass'&&sr.canonical_mutation===false,'review disposition drift');
 await rm(DEST,{recursive:true,force:true});await mkdir(DEST,{recursive:true});
 for(const f of['uc-054-still-candidate.webp','card-crop-preview.jpg','source-page.png'])await copyFile(join(SOURCE_ROOT,f),join(DEST,f));
 const duplicates={...sd,reviewed_at:c.reviewed_at,reviewed_by:c.reviewed_by,status:'pass',semantics:'Exact SHA-256 comparison against canonical media; packet files are not canonical bindings.'};
 await writeJson(join(DEST,'duplicate-scan.json'),duplicates);
 const manifest={...sm,reviewed_at:c.reviewed_at,reviewed_by:c.reviewed_by,reviewed_role:c.reviewed_role,custody:{...sm.custody,render_artifact:c.render_artifact,apply_control_sha256:sha(await readFile(CONTROL)),source_manifest_sha256:c.expected.source_manifest_sha256},duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:duplicates.repository_hash_count,status:'pass'},exact_subject_review:{identity:c.ruling.identity,presentation:c.ruling.presentation,crop_ruling:c.ruling.crop_ruling,notes:c.ruling.notes},disposition:c.ruling.candidate_disposition,canonical_mutation:false};
 await writeJson(join(DEST,'manifest.json'),manifest);
 const review={...sr,reviewed_at:c.reviewed_at,reviewed_by:c.reviewed_by,reviewed_role:c.reviewed_role,identity_ruling:c.ruling.identity,presentation_ruling:c.ruling.presentation,crop_ruling:c.ruling.crop_ruling,canonical_mutation:false,disposition:c.ruling.candidate_disposition,notes:c.ruling.notes};
 await writeJson(join(DEST,'review.json'),review);
 await writeFile(join(DEST,'review.md'),`# UC-054 reviewed Betelgeuse still candidate\n\n- **Record:** UC-054\n- **Performer:** Michael Keaton\n- **Displayed role:** Betelgeuse\n- **Production:** Beetlejuice (1988)\n- **Source:** [Yahoo Entertainment transformation article](${manifest.source.source_page})\n- **Candidate:** \`${c.expected.candidate_sha256}\`\n- **Wall-crop preview:** \`${c.expected.crop_preview_sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${c.ruling.notes.map(n=>`- ${n}`).join('\n')}\n\nThe 1200-pixel WebP source is retained unchanged. A lower-resolution delivery of the same underlying Yahoo asset is documented and rejected as a visual duplicate. This packet remains evidence-only pending independent canonical acceptance.\n`);
 const repo=await repositoryHashes();assert(repo.size===c.expected.duplicate_repository_hash_count,`repository denominator drift ${repo.size}`);for(const h of[c.expected.candidate_sha256,c.expected.crop_preview_sha256])assert(!(repo.get(h)||[]).length,`authorized evidence duplicates canonical media`);
 const sums=[];for(const f of expectedFiles.filter(x=>x!=='SHA256SUMS')){const b=await readFile(join(DEST,f));sums.push(`${sha(b)}  ${f}`)}await writeFile(join(DEST,'SHA256SUMS'),sums.join('\n')+'\n');
 await validate();console.log(`MATERIALIZED ${DEST}: ${expectedFiles.length} files`);
}

async function validate(){
 const c=await loadControl();const names=(await readdir(DEST)).sort();assert(JSON.stringify(names)===JSON.stringify([...expectedFiles].sort()),`file set drift: ${names.join(', ')}`);
 const sums=String(await readFile(join(DEST,'SHA256SUMS'),'utf8')).trim().split('\n').filter(Boolean);assert(sums.length===7,'checksum count drift');for(const line of sums){const x=line.match(/^([0-9a-f]{64})  (.+)$/);assert(x,`bad checksum ${line}`);assert(sha(await readFile(join(DEST,x[2])))===x[1],`${x[2]} checksum drift`)}
 const manifest=await readJson(join(DEST,'manifest.json')),review=await readJson(join(DEST,'review.json')),duplicates=await readJson(join(DEST,'duplicate-scan.json'));
 assert(manifest.candidate?.sha256===c.expected.candidate_sha256&&review.candidate_sha256===c.expected.candidate_sha256,'candidate receipt drift');
 assert(manifest.crop_preview?.sha256===c.expected.crop_preview_sha256&&review.crop_preview_sha256===c.expected.crop_preview_sha256,'crop receipt drift');
 assert(manifest.source?.provider==='Yahoo Entertainment'&&manifest.alternate_visual_duplicate?.sha256==='8447b68e2d5acfe07a9f0d782075f0289f19d6da14d1c8b85f828bde0bf0eab1','source receipt drift');
 assert(review.identity_ruling==='expected-subject'&&review.presentation_ruling==='character-depiction'&&review.crop_ruling==='pass'&&!review.canonical_mutation,'review drift');
 assert(duplicates.status==='pass'&&duplicates.repository_hash_count===2070&&(duplicates.items||[]).every(x=>x.matches?.length===0),'duplicate receipt drift');
 assert((await meta(join(DEST,'uc-054-still-candidate.webp'))).sha256===c.expected.candidate_sha256,'candidate bytes drift');
 assert((await meta(join(DEST,'card-crop-preview.jpg'))).sha256===c.expected.crop_preview_sha256,'crop bytes drift');
 assert((await meta(join(DEST,'source-page.png'))).sha256===c.expected.source_page_sha256,'page bytes drift');
 for(const f of names)assert((await stat(join(DEST,f))).isFile(),`${f} not regular`);console.log(`VALID ${DEST}: reviewed evidence only`);
}
if(command==='materialize')await materialize();else if(command==='validate')await validate();else throw new Error(`unknown command ${command}`);
