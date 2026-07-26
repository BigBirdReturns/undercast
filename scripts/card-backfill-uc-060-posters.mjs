#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-060-POSTERS.json';
const SOURCE_ROOT=process.env.SOURCE_ROOT||'';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-060-posters';
const UA='Mozilla/5.0 Chrome/132 UNDERCAST-card-backfill/1.0';
const sha=v=>createHash('sha256').update(v).digest('hex');
const assert=(c,m)=>{if(!c)throw new Error(m)};
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const writeJson=async(p,v)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(v,null,2)+'\n')};
function mime(b){if(b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return'image/jpeg';if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return'image/png';if(b.length>=12&&b.subarray(0,4).toString('ascii')==='RIFF'&&b.subarray(8,12).toString('ascii')==='WEBP')return'image/webp';return'unknown'}
function ext(m){return m==='image/jpeg'?'jpg':m==='image/png'?'png':m==='image/webp'?'webp':'bin'}
function identify(p){const s=execFileSync(process.env.MAGICK_CMD||'magick',['identify','-format','%w %h',p],{encoding:'utf8'}).trim();const[w,h]=s.split(/\s+/).map(Number);assert(w>0&&h>0,`cannot identify ${p}`);return{width:w,height:h}}
function magick(...a){execFileSync(process.env.MAGICK_CMD||'magick',a,{stdio:'inherit'})}
async function walk(root,out=[]){let es;try{es=await readdir(root,{withFileTypes:true})}catch{return out}for(const e of es){const p=join(root,e.name);if(e.isDirectory())await walk(p,out);else if(/\.(?:jpe?g|png|webp)$/i.test(e.name))out.push(p)}return out}
async function repositoryHashes(){const m=new Map();try{const x=await readJson('data/media-manifest.json');for(const[p,r]of Object.entries(x.assets||{})){if(!/^[0-9a-f]{64}$/i.test(r?.sha256||''))continue;const a=m.get(r.sha256)||[];a.push(`manifest:${p}`);m.set(r.sha256,a)}}catch{}for(const p of await walk('images')){try{const h=sha(await readFile(p));const a=m.get(h)||[];a.push(`file:${p}`);m.set(h,a)}catch{}}return m}
async function download(url,referer){const r=await fetch(url,{headers:{'User-Agent':UA,Referer:referer,Accept:'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.2'},redirect:'follow',signal:AbortSignal.timeout(60000)});assert(r.ok,`HTTP ${r.status} for ${url}`);return{bytes:Buffer.from(await r.arrayBuffer()),resolved_url:r.url}}

assert(SOURCE_ROOT,'SOURCE_ROOT is required');
const control=await readJson(CONTROL);assert(control.version===1&&control.record_id==='UC-060'&&control.actor==='Ray Park'&&control.character==='Darth Maul','second-desk control drift');
const manifestPath=join(SOURCE_ROOT,'manifest.json'),manifestBytes=await readFile(manifestPath);assert(sha(manifestBytes)===control.discovery_artifact.manifest_sha256,'discovery manifest custody drift');const discovery=JSON.parse(manifestBytes.toString('utf8'));assert(discovery.record_id==='UC-060'&&discovery.actor==='Ray Park','discovery identity drift');
const repo=await repositoryHashes();assert(repo.size===control.expected_repository_hash_count,`repository denominator drift ${repo.size}`);await mkdir(OUT,{recursive:true});await mkdir(join(OUT,'candidates'),{recursive:true});const rows=[];
for(const key of control.source_keys){const page=discovery.page_evidence?.[key];assert(page?.status==='loaded'&&page.required_terms_missing?.length===0,`${key} page evidence incomplete`);const hero=(page.images||[]).find(x=>x.kind==='metadata'&&/^https:/.test(x.url||''));assert(hero,`${key} has no exact metadata hero`);const fetched=await download(hero.url,page.resolved_url||page.source_page||'https://www.starwars.com/');const m=mime(fetched.bytes);assert(fetched.bytes.length>10000&&m!=='unknown',`${key} hero unusable`);const local=`candidates/${String(rows.length+1).padStart(2,'0')}-${key}.${ext(m)}`,p=join(OUT,local);await writeFile(p,fetched.bytes);const d=identify(p);assert(d.width>=400&&d.height>=300,`${key} hero below floor ${d.width}x${d.height}`);const h=sha(fetched.bytes);rows.push({source_key:key,provider:'StarWars.com',source_page:page.resolved_url,source_title:page.title,source_page_screenshot:page.screenshot,asset_url:hero.url,resolved_asset_url:fetched.resolved_url,local,mime:m,bytes:fetched.bytes.length,sha256:h,...d,repository_matches:repo.get(h)||[]})}
const thumbs=[];for(let i=0;i<rows.length;i++){const r=rows[i],p=join(OUT,'thumbs',`${String(i+1).padStart(2,'0')}.jpg`);await mkdir(dirname(p),{recursive:true});magick(join(OUT,r.local),'-auto-orient','-thumbnail','420x300>','-background','#171512','-gravity','center','-extent','420x300','-fill','white','-undercolor','#171512cc','-gravity','south','-pointsize','14','-annotate','+0+4',`${String(i+1).padStart(2,'0')} ${r.source_key}`,'-strip','-quality','90',p);thumbs.push(p)}
const contact=join(OUT,'contact-sheet.jpg');execFileSync('montage',[...thumbs,'-tile','3x','-geometry','420x300+12+12','-background','#e8e3d9',contact],{stdio:'inherit'});
await writeJson(join(OUT,'manifest.json'),{version:1,lane:'card-backfill',record_id:'UC-060',actor:'Ray Park',character:'Darth Maul',side:'still',generated_at:new Date().toISOString(),custody:{discovery_artifact:control.discovery_artifact,control_sha256:sha(await readFile(CONTROL))},candidates:rows,contact_sheet:{path:'contact-sheet.jpg',...identify(contact)},repository_hash_count:repo.size,disposition:'candidate-only-official-hero-second-desk',canonical_mutation:false});
await writeJson(join(OUT,'summary.json'),{record_id:'UC-060',candidate_count:rows.length,candidates:rows.map(r=>({source_key:r.source_key,local:r.local,sha256:r.sha256,width:r.width,height:r.height,repository_matches:r.repository_matches}))});
console.log(`UC-060 official hero second desk: ${rows.length} source-balanced candidates`);console.log(`artifact ${OUT}`);
