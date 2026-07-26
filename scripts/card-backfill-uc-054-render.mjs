#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-054-RENDER.json';
const SOURCE_ROOT=process.env.SOURCE_ROOT||'';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-054-render';
const sha=v=>createHash('sha256').update(v).digest('hex');
const assert=(c,m)=>{if(!c)throw new Error(m)};
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const writeJson=async(p,v)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(v,null,2)+'\n')};
function mime(b){if(b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return'image/jpeg';if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(b.length>=12&&b.subarray(0,4).toString('ascii')==='RIFF'&&b.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
function identify(p){const s=execFileSync(process.env.MAGICK_CMD||'magick',['identify','-format','%w %h',p],{encoding:'utf8'}).trim();const[w,h]=s.split(/\s+/).map(Number);assert(w>0&&h>0,`cannot identify ${p}`);return{width:w,height:h}}
function magick(...a){execFileSync(process.env.MAGICK_CMD||'magick',a,{stdio:'inherit'})}
async function meta(p){const b=await readFile(p);return{bytes:b.length,sha256:sha(b),mime:mime(b),...identify(p)}}
async function walk(root,out=[]){let es;try{es=await readdir(root,{withFileTypes:true})}catch{return out}for(const e of es){const p=join(root,e.name);if(e.isDirectory())await walk(p,out);else if(/\.(?:jpe?g|png|webp)$/i.test(e.name))out.push(p)}return out}
async function repositoryHashes(){const m=new Map();try{const x=await readJson('data/media-manifest.json');for(const[p,r]of Object.entries(x.assets||{})){if(!/^[0-9a-f]{64}$/i.test(r?.sha256||''))continue;const a=m.get(r.sha256)||[];a.push(`manifest:${p}`);m.set(r.sha256,a)}}catch{}for(const p of await walk('images')){try{const h=sha(await readFile(p));const a=m.get(h)||[];a.push(`file:${p}`);m.set(h,a)}catch{}}return m}

assert(SOURCE_ROOT,'SOURCE_ROOT is required');
const control=await readJson(CONTROL);
assert(control.version===1&&control.record_id==='UC-054'&&control.actor==='Michael Keaton'&&control.character==='Betelgeuse'&&control.side==='still','render control drift');
assert(control.reviewed_role==='second-desk'&&control.ruling?.identity==='expected-subject'&&control.ruling?.presentation==='character-depiction'&&control.ruling?.canonical_mutation===false,'render ruling drift');
const manifestPath=join(SOURCE_ROOT,'manifest.json');
const manifestBytes=await readFile(manifestPath);
assert(sha(manifestBytes)===control.selection.source_manifest_sha256,'discovery manifest custody drift');
const sourceManifest=JSON.parse(manifestBytes.toString('utf8'));
assert(sourceManifest.record_id==='UC-054'&&sourceManifest.actor==='Michael Keaton'&&sourceManifest.character==='Betelgeuse','discovery identity drift');
const selected=(sourceManifest.candidates||[]).find(r=>r.local===control.selection.artifact_path);
const alternate=(sourceManifest.candidates||[]).find(r=>r.local===control.alternate_visual_duplicate.artifact_path);
assert(selected&&alternate,'selected or alternate candidate missing');
assert(selected.provider===control.selection.provider&&selected.source_key===control.selection.source_key&&selected.source_page===control.selection.source_page&&selected.url===control.selection.asset_url,'selected source identity drift');
assert(selected.mime===control.selection.mime&&selected.bytes===control.selection.bytes&&selected.width===control.selection.width&&selected.height===control.selection.height&&selected.sha256===control.selection.sha256,'selected byte receipt drift');
assert(alternate.mime===control.alternate_visual_duplicate.mime&&alternate.bytes===control.alternate_visual_duplicate.bytes&&alternate.width===control.alternate_visual_duplicate.width&&alternate.height===control.alternate_visual_duplicate.height&&alternate.sha256===control.alternate_visual_duplicate.sha256,'alternate byte receipt drift');
assert(selected.url.includes(control.selection.underlying_asset_id)&&alternate.url.includes(control.alternate_visual_duplicate.underlying_asset_id)&&control.selection.underlying_asset_id===control.alternate_visual_duplicate.underlying_asset_id,'underlying visual identity drift');
assert((selected.repository_matches||[]).length===0&&(alternate.repository_matches||[]).length===0,'candidate already exists in canonical media');
const page=sourceManifest.page_evidence?.[control.selection.source_key];
assert(page?.status==='loaded'&&page?.required_terms_missing?.length===0,'source page evidence incomplete');
const pageText=String(page.body_text||'');
assert(pageText.includes('Michael Keaton')&&pageText.includes('Beetlejuice')&&pageText.includes('makeup'),'article evidence drift');

const sourcePath=join(SOURCE_ROOT,control.selection.artifact_path);
const pagePath=join(SOURCE_ROOT,control.selection.source_page_screenshot_path);
const sb=await readFile(sourcePath),pb=await readFile(pagePath);
assert(mime(sb)==='image/webp'&&sb.length===control.selection.bytes&&sha(sb)===control.selection.sha256,'source byte custody drift');
assert(mime(pb)==='image/png'&&sha(pb)===control.selection.source_page_screenshot_sha256,'source-page screenshot custody drift');
const dims=identify(sourcePath);assert(dims.width===control.selection.width&&dims.height===control.selection.height,'source geometry drift');

await rm(OUT,{recursive:true,force:true});await mkdir(OUT,{recursive:true});
const candidatePath=join(OUT,'uc-054-still-candidate.webp');
const pageDest=join(OUT,'source-page.png');
await copyFile(sourcePath,candidatePath);await copyFile(pagePath,pageDest);
const candidate=await meta(candidatePath);assert(candidate.sha256===control.selection.sha256&&candidate.mime==='image/webp','candidate copy drift');
const cropPath=join(OUT,'card-crop-preview.jpg');
magick(candidatePath,'-auto-orient','-resize',`${control.crop.width}x${control.crop.height}^`,'-gravity',control.crop.gravity,'-extent',`${control.crop.width}x${control.crop.height}`,'-strip','-quality',String(control.crop.quality),cropPath);
const crop=await meta(cropPath);assert(crop.mime==='image/jpeg'&&crop.width===1246&&crop.height===1000,'crop geometry drift');
const repo=await repositoryHashes();assert(repo.size===control.expected_repository_hash_count,`repository hash denominator drift ${repo.size}`);
const duplicateScan={version:1,repository_hash_count:repo.size,items:[{label:'Betelgeuse source / candidate',path:'uc-054-still-candidate.webp',sha256:candidate.sha256,matches:repo.get(candidate.sha256)||[]},{label:'card crop preview',path:'card-crop-preview.jpg',sha256:crop.sha256,matches:repo.get(crop.sha256)||[]}]};
for(const r of duplicateScan.items)assert(r.matches.length===0,`${r.label} duplicates canonical media: ${r.matches.join(', ')}`);
await writeJson(join(OUT,'duplicate-scan.json'),duplicateScan);
const manifest={version:1,lane:'card-backfill',record_id:'UC-054',actor:'Michael Keaton',character:'Betelgeuse',production:'Beetlejuice',year:1988,side:'still',expected_subject:'Betelgeuse',reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,custody:{discovery_artifact:control.discovery_artifact,render_control_sha256:sha(await readFile(CONTROL)),discovery_manifest_sha256:control.selection.source_manifest_sha256},source:{provider:control.selection.provider,source_key:control.selection.source_key,source_page:control.selection.source_page,asset_url:control.selection.asset_url,page_title:page.title,resolved_page:page.resolved_url,page_screenshot:{path:'source-page.png',sha256:control.selection.source_page_screenshot_sha256},article_evidence:'Yahoo Entertainment identifies Michael Keaton in Beetlejuice and documents the makeup, false teeth, wig and moss treatment used to create the character.',source_note:selected.source_note},candidate:{path:'uc-054-still-candidate.webp',...candidate},alternate_visual_duplicate:{...control.alternate_visual_duplicate,reason:'Same Yahoo underlying asset at a lower delivery resolution; rejected as a second evidence candidate.'},crop_preview:{path:'card-crop-preview.jpg',...crop,gravity:control.crop.gravity,semantics:control.crop.semantics},duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:repo.size,status:'pass'},exact_subject_review:{identity:'expected-subject',presentation:'character-depiction',crop_ruling:'pass',notes:control.ruling.notes},disposition:control.ruling.candidate_disposition,canonical_mutation:false};
await writeJson(join(OUT,'manifest.json'),manifest);
await writeJson(join(OUT,'review.json'),{version:1,record_id:'UC-054',actor:'Michael Keaton',character:'Betelgeuse',side:'still',expected_subject:'Betelgeuse',candidate_sha256:candidate.sha256,crop_preview_sha256:crop.sha256,identity_ruling:'expected-subject',presentation_ruling:'character-depiction',crop_ruling:'pass',reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,reviewed_at:control.reviewed_at,canonical_mutation:false,disposition:control.ruling.candidate_disposition,notes:control.ruling.notes});
await writeFile(join(OUT,'review.md'),`# UC-054 reviewed Betelgeuse still candidate\n\n- **Record:** UC-054\n- **Performer:** Michael Keaton\n- **Displayed role:** Betelgeuse\n- **Production:** Beetlejuice (1988)\n- **Source:** [Yahoo Entertainment transformation article](${control.selection.source_page})\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${crop.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${control.ruling.notes.map(n=>`- ${n}`).join('\n')}\n\nThe 1200-pixel WebP is retained unchanged. The lower-resolution encoding of the same underlying Yahoo asset is documented and rejected as a visual duplicate. This packet remains evidence-only pending independent canonical acceptance.\n`);
console.log(`RENDERED UC-054 Betelgeuse candidate ${candidate.sha256}`);console.log(`crop ${crop.sha256} ${crop.width}x${crop.height}`);console.log(`duplicate scan PASS against ${repo.size} repository hashes`);console.log(`artifact ${OUT}`);
