#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-060-RENDER.json';
const HIRES_ROOT=process.env.HIRES_ROOT||'';
const DISCOVERY_ROOT=process.env.DISCOVERY_ROOT||'';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-060-render';
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

assert(HIRES_ROOT&&DISCOVERY_ROOT,'HIRES_ROOT and DISCOVERY_ROOT are required');
const control=await readJson(CONTROL);
assert(control.version===1&&control.record_id==='UC-060'&&control.actor==='Ray Park'&&control.character==='Darth Maul'&&control.side==='still','render control drift');
assert(control.reviewed_role==='second-desk'&&control.ruling?.identity==='expected-subject'&&control.ruling?.presentation==='character-depiction'&&control.ruling?.canonical_mutation===false,'render ruling drift');
const hiresManifestPath=join(HIRES_ROOT,'manifest.json'),discoveryManifestPath=join(DISCOVERY_ROOT,'manifest.json');
const hiresBytes=await readFile(hiresManifestPath),discoveryBytes=await readFile(discoveryManifestPath);
assert(sha(hiresBytes)===control.hires_artifact.manifest_sha256,'hires manifest custody drift');
assert(sha(discoveryBytes)===control.discovery_artifact.manifest_sha256,'discovery manifest custody drift');
const hires=JSON.parse(hiresBytes.toString('utf8')),discovery=JSON.parse(discoveryBytes.toString('utf8'));
assert(hires.record_id==='UC-060'&&hires.actor==='Ray Park'&&hires.character==='Darth Maul','hires identity drift');
assert(discovery.record_id==='UC-060'&&discovery.actor==='Ray Park'&&discovery.character==='Darth Maul','discovery identity drift');
const selected=(hires.candidates||[]).find(r=>r.key==='duel-into-core-original');
assert(selected,'selected hires row missing');
assert(selected.source_page===control.selection.source_page&&selected.original?.url===control.selection.asset_url,'selected source identity drift');
assert(selected.original?.local===control.selection.artifact_path&&selected.original?.mime===control.selection.mime&&selected.original?.bytes===control.selection.bytes&&selected.original?.width===control.selection.width&&selected.original?.height===control.selection.height&&selected.original?.sha256===control.selection.sha256,'selected byte receipt drift');
assert((selected.original?.repository_matches||[]).length===0,'selected source duplicates canonical media');
const rejectedHashes=new Set(control.rejected_visual_duplicates.map(r=>r.sha256));
assert(rejectedHashes.has(selected.attempts?.[1]?.sha256)&&rejectedHashes.has(selected.derivative?.sha256),'rejected visual-duplicate custody drift');
const page=discovery.page_evidence?.['duel-into-core'];
assert(page?.status==='loaded'&&page.required_terms_missing?.length===0,'source page evidence incomplete');
assert(page.title==='Duel Into The Core | Video | The Phantom Menace | StarWars.com','source title drift');
assert(String(page.body_text||'').includes('Qui-Gon and Obi-Wan team up against Darth Maul'),'source article evidence drift');
const sourcePath=join(HIRES_ROOT,control.selection.artifact_path),pagePath=join(DISCOVERY_ROOT,control.selection.source_page_screenshot_path);
const sb=await readFile(sourcePath),pb=await readFile(pagePath);
assert(mime(sb)==='image/jpeg'&&sb.length===control.selection.bytes&&sha(sb)===control.selection.sha256,'selected source byte custody drift');
assert(mime(pb)==='image/png'&&sha(pb)===control.selection.source_page_screenshot_sha256,'source-page screenshot custody drift');
const dims=identify(sourcePath);assert(dims.width===1280&&dims.height===720,'selected source geometry drift');

await rm(OUT,{recursive:true,force:true});await mkdir(OUT,{recursive:true});
const candidatePath=join(OUT,'uc-060-still-candidate.jpg'),pageDest=join(OUT,'source-page.png');
await copyFile(sourcePath,candidatePath);await copyFile(pagePath,pageDest);
const candidate=await meta(candidatePath);assert(candidate.sha256===control.selection.sha256&&candidate.mime==='image/jpeg','candidate copy drift');
const cropPath=join(OUT,'card-crop-preview.jpg');
magick(candidatePath,'-auto-orient','-resize',`${control.crop.width}x${control.crop.height}^`,'-gravity',control.crop.gravity,'-extent',`${control.crop.width}x${control.crop.height}`,'-strip','-quality',String(control.crop.quality),cropPath);
const crop=await meta(cropPath);assert(crop.mime==='image/jpeg'&&crop.width===1246&&crop.height===1000,'crop geometry drift');
const repo=await repositoryHashes();assert(repo.size===control.expected_repository_hash_count,`repository denominator drift ${repo.size}`);
const duplicateScan={version:1,repository_hash_count:repo.size,items:[{label:'Darth Maul Lucasfilm original / candidate',path:'uc-060-still-candidate.jpg',sha256:candidate.sha256,matches:repo.get(candidate.sha256)||[]},{label:'card crop preview',path:'card-crop-preview.jpg',sha256:crop.sha256,matches:repo.get(crop.sha256)||[]}]};
for(const r of duplicateScan.items)assert(r.matches.length===0,`${r.label} duplicates canonical media: ${r.matches.join(', ')}`);
await writeJson(join(OUT,'duplicate-scan.json'),duplicateScan);
const manifest={version:1,lane:'card-backfill',record_id:'UC-060',actor:'Ray Park',character:'Darth Maul',production:'The Phantom Menace',year:1999,side:'still',expected_subject:'Darth Maul',reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,custody:{discovery_artifact:control.discovery_artifact,hires_artifact:control.hires_artifact,render_control_sha256:sha(await readFile(CONTROL)),discovery_manifest_sha256:control.discovery_artifact.manifest_sha256,hires_manifest_sha256:control.hires_artifact.manifest_sha256},source:{provider:control.selection.provider,source_key:control.selection.source_key,source_page:control.selection.source_page,asset_url:control.selection.asset_url,page_title:page.title,resolved_page:page.resolved_url,page_screenshot:{path:'source-page.png',sha256:control.selection.source_page_screenshot_sha256},article_evidence:'The exact Lucasfilm page is a The Phantom Menace video and states that Qui-Gon and Obi-Wan team up against Darth Maul in the Theed Palace power core.'},candidate:{path:'uc-060-still-candidate.jpg',...candidate},rejected_visual_duplicates:control.rejected_visual_duplicates,crop_preview:{path:'card-crop-preview.jpg',...crop,gravity:control.crop.gravity,semantics:control.crop.semantics},duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:repo.size,status:'pass'},exact_subject_review:{identity:'expected-subject',presentation:'character-depiction',crop_ruling:'pass',notes:control.ruling.notes},disposition:control.ruling.candidate_disposition,canonical_mutation:false};
await writeJson(join(OUT,'manifest.json'),manifest);
await writeJson(join(OUT,'review.json'),{version:1,record_id:'UC-060',actor:'Ray Park',character:'Darth Maul',side:'still',expected_subject:'Darth Maul',candidate_sha256:candidate.sha256,crop_preview_sha256:crop.sha256,identity_ruling:'expected-subject',presentation_ruling:'character-depiction',crop_ruling:'pass',reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,reviewed_at:control.reviewed_at,canonical_mutation:false,disposition:control.ruling.candidate_disposition,notes:control.ruling.notes});
await writeFile(join(OUT,'review.md'),`# UC-060 reviewed Darth Maul still candidate\n\n- **Record:** UC-060\n- **Performer:** Ray Park\n- **Displayed role:** Darth Maul\n- **Production:** The Phantom Menace (1999)\n- **Source:** [Lucasfilm Duel Into The Core video](${control.selection.source_page})\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${crop.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${control.ruling.notes.map(n=>`- ${n}`).join('\n')}\n\nThe unparameterized 1280×720 Lucasfilm JPEG is retained unchanged. A same-size alternate encoding and the 630×354 public derivative are documented and rejected as visual duplicates. The west-focused crop preserves the left-positioned face. This packet remains evidence-only pending independent canonical acceptance.\n`);
console.log(`RENDERED UC-060 Darth Maul candidate ${candidate.sha256}`);console.log(`crop ${crop.sha256} ${crop.width}x${crop.height}`);console.log(`duplicate scan PASS against ${repo.size} canonical hashes`);console.log(`artifact ${OUT}`);
