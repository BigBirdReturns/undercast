#!/usr/bin/env node
import { request } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL='.github/CARD-BACKFILL-UC-025-RENDER.json';
const OUT=process.env.OUT||'/tmp/card-backfill-uc-025-render';
const UA='Mozilla/5.0 Chrome/132 UNDERCAST-card-backfill/1.0';
const sha=v=>createHash('sha256').update(v).digest('hex');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const writeJson=async(p,v)=>{await mkdir(dirname(p),{recursive:true});await writeFile(p,JSON.stringify(v,null,2)+'\n')};
function mime(b){if(b[0]===0xff&&b[1]===0xd8)return'image/jpeg';if(b[0]===0x89&&b[1]===0x50)return'image/png';if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP')return'image/webp';return'unknown'}
function magick(...a){execFileSync(process.env.MAGICK_CMD||'magick',a,{stdio:'inherit'})}
function identify(p){const [w,h]=execFileSync(process.env.MAGICK_CMD||'magick',['identify','-format','%w %h',p],{encoding:'utf8'}).trim().split(/\s+/).map(Number);assert(w>0&&h>0,'cannot identify '+p);return{width:w,height:h}}
async function walk(root,out=[]){let es;try{es=await readdir(root,{withFileTypes:true})}catch{return out}for(const e of es){const p=join(root,e.name);if(e.isDirectory())await walk(p,out);else if(/\.(jpe?g|png|webp)$/i.test(e.name))out.push(p)}return out}
async function repoHashes(){const m=new Map();try{const x=await json('data/media-manifest.json');for(const[p,r]of Object.entries(x.assets||{}))if(/^[0-9a-f]{64}$/i.test(r.sha256||'')){const a=m.get(r.sha256)||[];a.push('manifest:'+p);m.set(r.sha256,a)}}catch{}for(const p of await walk('images')){try{const h=sha(await readFile(p));const a=m.get(h)||[];a.push('file:'+p);m.set(h,a)}catch{}}return m}

const control=await json(CONTROL);
assert(control.version===1&&control.record_id==='UC-025'&&control.actor==='Javier Botet'&&control.side==='still','render control drift');
assert(control.reviewed_role==='second-desk'&&control.sources?.length===3,'render authorization incomplete');
assert(control.composition?.width===1260&&control.composition?.height===1000&&control.composition?.divider_height===12,'render geometry drift');
assert(control.sources.reduce((n,s)=>n+s.band_height,0)+control.composition.divider_height*2===control.composition.height,'band heights do not close');
await mkdir(join(OUT,'originals'),{recursive:true});
await mkdir(join(OUT,'bands'),{recursive:true});
const api=await request.newContext({userAgent:UA});
const rows=[];
try{
  for(const source of control.sources){
    const response=await api.get(source.asset_url,{headers:{Referer:source.source_page,Accept:source.expected_mime==='image/webp'?'image/webp,image/*,*/*;q=0.1':'image/jpeg,image/*,*/*;q=0.1'},timeout:45000,failOnStatusCode:false});
    assert(response.ok(),`${source.key} source HTTP ${response.status()}`);
    const bytes=Buffer.from(await response.body());
    assert(mime(bytes)===source.expected_mime,`${source.key} MIME drift ${mime(bytes)}`);
    assert(bytes.length===source.expected_bytes,`${source.key} byte drift ${bytes.length} != ${source.expected_bytes}`);
    assert(sha(bytes)===source.expected_sha256,`${source.key} hash drift`);
    const original=`originals/${source.key}.${source.extension}`,originalPath=join(OUT,original);
    await writeFile(originalPath,bytes);
    const dimensions=identify(originalPath);
    assert(dimensions.width===source.expected_width&&dimensions.height===source.expected_height,`${source.key} dimension drift`);
    const band=`bands/${source.key}.jpg`,bandPath=join(OUT,band);
    magick(originalPath,'-auto-orient','-resize',`${control.composition.width}x${source.band_height}^`,'-gravity',source.gravity,'-extent',`${control.composition.width}x${source.band_height}`,'-strip','-quality','92',bandPath);
    const bandBytes=await readFile(bandPath);
    rows.push({...source,resolved_asset_url:response.url()||source.asset_url,original:{path:original,mime:source.expected_mime,bytes:bytes.length,sha256:sha(bytes),...dimensions},band:{path:band,mime:'image/jpeg',bytes:bandBytes.length,sha256:sha(bandBytes),...identify(bandPath)}});
  }
}finally{await api.dispose()}
const divider=join(OUT,'bands','divider.png');
magick('-size',`${control.composition.width}x${control.composition.divider_height}`,`xc:${control.composition.divider_color}`,divider);
const byKey=new Map(rows.map(r=>[r.key,r]));
const ordered=control.composition.order.map(k=>byKey.get(k));
assert(ordered.every(Boolean),'composition order references missing source');
const candidate=join(OUT,'uc-025-still-candidate.jpg');
magick(join(OUT,ordered[0].band.path),divider,join(OUT,ordered[1].band.path),divider,join(OUT,ordered[2].band.path),'-append','-strip','-quality','94',candidate);
const candidateBytes=await readFile(candidate),candidateDimensions=identify(candidate);
assert(candidateDimensions.width===1260&&candidateDimensions.height===1000,'candidate geometry drift');
const crop=join(OUT,'card-crop-preview.jpg');
magick(candidate,'-gravity','center','-crop','1246x1000+0+0','+repage','-strip','-quality','94',crop);
const cropBytes=await readFile(crop),cropDimensions=identify(crop);
const existing=await repoHashes();
const checks=[...rows.map(r=>({label:r.key,path:r.original.path,sha256:r.original.sha256})),{label:'candidate',path:'uc-025-still-candidate.jpg',sha256:sha(candidateBytes)}];
const duplicate={repository_hash_count:existing.size,items:checks.map(r=>({...r,matches:existing.get(r.sha256)||[]}))};
for(const r of duplicate.items)assert(r.matches.length===0,`${r.label} duplicates ${r.matches.join(', ')}`);
await writeJson(join(OUT,'duplicate-scan.json'),duplicate);
const manifest={version:1,lane:control.lane,record_id:control.record_id,actor:control.actor,character:control.character,side:control.side,expected_subject:control.character,reviewed_at:control.reviewed_at,control_sha256:sha(await readFile(CONTROL)),sources:rows,composition:control.composition,candidate:{path:'uc-025-still-candidate.jpg',mime:'image/jpeg',bytes:candidateBytes.length,sha256:sha(candidateBytes),...candidateDimensions},crop_preview:{path:'card-crop-preview.jpg',mime:'image/jpeg',bytes:cropBytes.length,sha256:sha(cropBytes),...cropDimensions},duplicate_scan:duplicate,disposition:'candidate-only-pending-exact-byte-visual-review'};
await writeJson(join(OUT,'manifest.json'),manifest);
await writeJson(join(OUT,'review.json'),{version:1,record_id:control.record_id,side:control.side,expected_subject:control.character,candidate_sha256:manifest.candidate.sha256,identity_ruling:'pending',presentation_ruling:'pending',canonical_mutation:false,notes:control.sources.map(s=>s.review_note)});
await writeFile(join(OUT,'review.md'),`# UC-025 candidate review\n\n- Record: UC-025\n- Actor: Javier Botet\n- Displayed roles: Mama, Crooked Man, KeyFace\n- Candidate SHA-256: \`${manifest.candidate.sha256}\`\n- Crop preview SHA-256: \`${manifest.crop_preview.sha256}\`\n- Canonical mutation: none\n\nThe top band depicts Mama, the middle band depicts the Crooked Man, and the bottom band depicts KeyFace. The images are role stills, not an unmasked performer portrait. Exact-byte visual approval remains required before the evidence packet is committed.\n`);
await writeFile(join(OUT,'SHA256SUMS'),[...rows.map(r=>`${r.original.sha256}  ${r.original.path}`),`${manifest.candidate.sha256}  uc-025-still-candidate.jpg`,`${manifest.crop_preview.sha256}  card-crop-preview.jpg`].join('\n')+'\n');
console.log(`UC-025 candidate ${manifest.candidate.sha256}`);
console.log(`crop ${manifest.crop_preview.sha256}`);
console.log(`duplicate scan PASS across ${existing.size} repository hashes`);
console.log(`artifact ${OUT}`);
