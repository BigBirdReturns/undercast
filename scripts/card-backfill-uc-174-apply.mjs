#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-174-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-174';
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => { await mkdir(DEST, { recursive:true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); };
function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP') return 'image/webp';
  return 'unknown';
}
async function walkImages(root,out=[]){let entries;try{entries=await readdir(root,{withFileTypes:true})}catch{return out}for(const entry of entries){const path=join(root,entry.name);if(entry.isDirectory())await walkImages(path,out);else if(/\.(?:jpe?g|png|webp)$/i.test(entry.name))out.push(path)}return out;}
async function repositoryHashes(){const map=new Map();try{const manifest=await readJson('data/media-manifest.json');for(const[path,row]of Object.entries(manifest.assets||{})){if(!/^[0-9a-f]{64}$/i.test(row?.sha256||''))continue;const list=map.get(row.sha256)||[];list.push(`manifest:${path}`);map.set(row.sha256,list)}}catch{}for(const path of await walkImages('images')){try{const hash=sha(await readFile(path));const list=map.get(hash)||[];list.push(`file:${path}`);map.set(hash,list)}catch{}}return map;}

async function loadControl(){
  const c=await readJson(CONTROL);
  assert(c.version===1&&c.lane==='card-backfill'&&c.record_id==='UC-174','UC-174 apply scope drift');
  assert(c.kind==='voice'&&c.actor==='John DiMaggio'&&c.character==='Bender, Jake the Dog, Marcus Fenix'&&c.production==='Futurama / Adventure Time / Gears of War'&&c.years==='1990s–'&&c.side==='still'&&c.reviewed_role==='second-desk','UC-174 apply authority drift');
  assert(c.render_artifact?.artifact_id===8734554129&&c.render_artifact?.head_sha==='3fcfb9c1aa122ac947d37f13084cde6b875f7e5a'&&c.render_artifact?.zip_sha256==='781977bad924c61ee23f769a6de5d06d57409e3a490e7c911bb92e695856cd35','UC-174 render custody drift');
  assert(Object.keys(c.expected_files||{}).length===24&&c.expected?.packet_file_count===24&&c.expected?.checksum_row_count===23&&c.expected?.duplicate_item_count===5&&c.expected?.duplicate_repository_hash_count===2070&&c.expected?.discovery_candidate_count===43&&JSON.stringify(c.expected?.role_counts)===JSON.stringify({bender:2,jake:24,marcus:17})&&c.expected?.failed_discovery_checkpoint_count===1&&c.expected?.source_page_count===4&&c.expected?.role_count===3,'UC-174 packet denominator drift');
  assert(c.ruling?.identity==='exact-three-role-subject-set'&&c.ruling?.presentation==='three-role-cross-medium-character-composite'&&c.ruling?.crop_ruling==='pass-face-and-full-source-triptych'&&c.ruling?.chronology_ruling==='pass-role-specific-production-medium-and-career-envelope'&&c.ruling?.marcus_selection_ruling==='pass-full-body-object-over-chest-only-pageimage'&&c.ruling?.portrait_separation_ruling==='pass-existing-performer-portrait-unchanged'&&c.ruling?.canonical_mutation===false,'UC-174 ruling drift');
  return c;
}
async function verifyExpectedFile(root,name,expected){
  const path=join(root,name),bytes=await readFile(path),row={bytes:bytes.length,sha256:sha(bytes),mime:signatureMime(bytes)};
  assert(row.sha256===expected.sha256,`${name} hash drift`);assert(row.bytes===expected.bytes,`${name} byte drift`);if(expected.mime)assert(row.mime===expected.mime,`${name} MIME drift`);
  if(expected.width!==undefined||expected.height!==undefined){const{execFileSync}=await import('node:child_process');const text=execFileSync(process.env.MAGICK_CMD||'magick',['identify','-format','%w %h',path],{encoding:'utf8'}).trim();const[width,height]=text.split(/\s+/).map(Number);assert(width===expected.width&&height===expected.height,`${name} geometry drift ${width}x${height}`)}
  return row;
}
async function verifySourcePacket(root,control){
  const expectedNames=Object.keys(control.expected_files).sort(),names=(await readdir(root)).sort();assert(JSON.stringify(names)===JSON.stringify(expectedNames),`UC-174 source file set drift: ${names.join(', ')}`);
  for(const name of expectedNames)await verifyExpectedFile(root,name,control.expected_files[name]);
  const sums=String(await readFile(join(root,'SHA256SUMS'),'utf8')).trim().split('\n').filter(Boolean);assert(sums.length===23,'UC-174 source checksum row count drift');const sumNames=[];for(const line of sums){const match=line.match(/^([0-9a-f]{64})  (.+)$/);assert(match,`malformed source checksum ${line}`);sumNames.push(match[2]);assert(sha(await readFile(join(root,match[2])))===match[1],`${match[2]} source checksum drift`)}assert(JSON.stringify(sumNames.sort())===JSON.stringify(expectedNames.filter(n=>n!=='SHA256SUMS').sort()),'UC-174 source checksum filename set drift');
  const manifest=await readJson(join(root,'manifest.json')),review=await readJson(join(root,'review.json')),voice=await readJson(join(root,'exact-voice-record.json')),duplicates=await readJson(join(root,'duplicate-scan.json'));
  assert(manifest.record_id==='UC-174'&&manifest.actor==='John DiMaggio'&&manifest.character==='Bender, Jake the Dog, Marcus Fenix'&&manifest.production==='Futurama / Adventure Time / Gears of War'&&manifest.years==='1990s–'&&manifest.side==='still','UC-174 manifest identity drift');
  assert(manifest.custody?.discovery_artifact?.artifact_id===8734052507&&manifest.custody?.discovery_artifact?.candidate_count===43&&manifest.custody?.failed_discovery_checkpoints?.length===1,'UC-174 discovery custody drift');
  assert(Object.keys(manifest.actor_role_custody||{}).length===4&&Object.keys(manifest.roles||{}).length===3,'UC-174 custody denominator drift');
  assert(manifest.roles?.bender?.original?.sha256===control.expected_files['bender-original.webp'].sha256&&manifest.roles?.bender?.pageimage_source===true,'UC-174 Bender drift');
  assert(manifest.roles?.jake?.original?.sha256===control.expected_files['jake-original.webp'].sha256&&manifest.roles?.jake?.pageimage_source===true,'UC-174 Jake drift');
  assert(manifest.roles?.marcus?.original?.sha256===control.expected_files['marcus-original.webp'].sha256&&manifest.roles?.marcus?.pageimage_source===false&&manifest.roles?.marcus?.file_title==='File:Marcus UE.png','UC-174 Marcus drift');
  assert(manifest.candidate?.sha256===control.expected_files['uc-174-still-candidate.jpg'].sha256&&manifest.crop_preview?.sha256===control.expected_files['card-crop-preview.jpg'].sha256,'UC-174 candidate drift');
  assert(manifest.chronology_boundary?.cross_medium_separation_required===true&&manifest.chronology_boundary?.replacement_performers_and_other_continuities_forbidden===true&&manifest.composite_boundary?.existing_performer_portrait==='images/uc-174-portrait.jpg','UC-174 chronology or portrait boundary drift');
  assert(review.identity_ruling===control.ruling.identity&&review.presentation_ruling===control.ruling.presentation&&review.crop_ruling===control.ruling.crop_ruling&&review.chronology_ruling===control.ruling.chronology_ruling&&review.marcus_selection_ruling===control.ruling.marcus_selection_ruling&&review.portrait_separation_ruling===control.ruling.portrait_separation_ruling&&review.canonical_mutation===false,'UC-174 review ruling drift');
  assert(voice.record_id==='UC-174'&&voice.roles?.bender?.selected_image?.sha256===control.expected_files['bender-original.webp'].sha256&&voice.roles?.jake?.selected_image?.sha256===control.expected_files['jake-original.webp'].sha256&&voice.roles?.marcus?.selected_image?.sha256===control.expected_files['marcus-original.webp'].sha256&&voice.roles?.marcus?.pageimage_source===false&&voice.failed_discovery_checkpoints?.length===1&&voice.canonical_mutation===false,'UC-174 exact voice record drift');
  assert(duplicates.status==='pass'&&duplicates.repository_hash_count===2070&&duplicates.items?.length===5&&duplicates.items.every(item=>Array.isArray(item.matches)&&item.matches.length===0),'UC-174 duplicate boundary drift');
  return{manifest,review,voice,duplicates};
}

async function materialize(){
  const control=await loadControl();assert(SOURCE_ROOT,'SOURCE_ROOT is required');const source=await verifySourcePacket(SOURCE_ROOT,control);
  await rm(DEST,{recursive:true,force:true});await mkdir(DEST,{recursive:true});for(const name of Object.keys(control.expected_files))await copyFile(join(SOURCE_ROOT,name),join(DEST,name));
  await writeJson(join(DEST,'duplicate-scan.json'),{...source.duplicates,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,status:'pass',semantics:'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'});
  await writeJson(join(DEST,'manifest.json'),{...source.manifest,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,custody:{...source.manifest.custody,render_artifact:control.render_artifact,apply_control_sha256:sha(await readFile(CONTROL)),source_manifest_sha256:control.expected_files['manifest.json'].sha256,source_sums_sha256:control.expected_files.SHA256SUMS.sha256},duplicate_scan:{path:'duplicate-scan.json',repository_hash_count:2070,status:'pass'},disposition:control.ruling.candidate_disposition,canonical_mutation:false});
  await writeJson(join(DEST,'review.json'),{...source.review,reviewed_at:control.reviewed_at,reviewed_by:control.reviewed_by,reviewed_role:control.reviewed_role,identity_ruling:control.ruling.identity,presentation_ruling:control.ruling.presentation,crop_ruling:control.ruling.crop_ruling,chronology_ruling:control.ruling.chronology_ruling,marcus_selection_ruling:control.ruling.marcus_selection_ruling,portrait_separation_ruling:control.ruling.portrait_separation_ruling,canonical_mutation:false,disposition:control.ruling.candidate_disposition});
  const repository=await repositoryHashes();assert(repository.size===2070,`repository hash denominator drift ${repository.size}`);for(const name of ['bender-original.webp','jake-original.webp','marcus-original.webp','uc-174-still-candidate.jpg','card-crop-preview.jpg']){const hash=control.expected_files[name].sha256;assert(!(repository.get(hash)||[]).length,`${name} duplicates canonical media`)}
  const names=Object.keys(control.expected_files).filter(n=>n!=='SHA256SUMS'),sums=[];for(const name of names)sums.push(`${sha(await readFile(join(DEST,name)))}  ${name}`);await writeFile(join(DEST,'SHA256SUMS'),sums.join('\n')+'\n');
  await validate();console.log(`MATERIALIZED ${DEST}: 24 reviewed evidence files`);console.log(`candidate ${control.expected_files['uc-174-still-candidate.jpg'].sha256}`);console.log(`crop ${control.expected_files['card-crop-preview.jpg'].sha256}`);console.log('canonical mutation false');
}
async function validate(){
  const control=await loadControl(),names=(await readdir(DEST)).sort();assert(names.length===24,'UC-174 permanent file count drift');
  const immutable={...control.expected_files};delete immutable['manifest.json'];delete immutable['review.json'];delete immutable['duplicate-scan.json'];delete immutable.SHA256SUMS;for(const[name,expected]of Object.entries(immutable))await verifyExpectedFile(DEST,name,expected);
  const sums=String(await readFile(join(DEST,'SHA256SUMS'),'utf8')).trim().split('\n').filter(Boolean);assert(sums.length===23,'UC-174 permanent checksum row count drift');const listed=[];for(const line of sums){const m=line.match(/^([0-9a-f]{64})  (.+)$/);assert(m,`malformed permanent checksum ${line}`);listed.push(m[2]);assert(sha(await readFile(join(DEST,m[2])))===m[1],`${m[2]} permanent checksum drift`)}assert(listed.includes('manifest.json')&&listed.includes('review.json')&&listed.includes('duplicate-scan.json'),'UC-174 permanent mutable receipt coverage drift');
  const manifest=await readJson(join(DEST,'manifest.json')),review=await readJson(join(DEST,'review.json')),voice=await readJson(join(DEST,'exact-voice-record.json')),duplicates=await readJson(join(DEST,'duplicate-scan.json'));
  assert(manifest.custody?.render_artifact?.artifact_id===control.render_artifact.artifact_id&&manifest.custody?.render_artifact?.zip_sha256===control.render_artifact.zip_sha256&&manifest.custody?.apply_control_sha256===sha(await readFile(CONTROL)),'UC-174 permanent render/apply custody drift');
  assert(manifest.custody?.source_manifest_sha256===control.expected_files['manifest.json'].sha256&&manifest.custody?.source_sums_sha256===control.expected_files.SHA256SUMS.sha256,'UC-174 permanent source custody drift');
  assert(manifest.roles?.marcus?.pageimage_source===false&&manifest.roles?.marcus?.file_title==='File:Marcus UE.png'&&manifest.candidate?.sha256===control.expected_files['uc-174-still-candidate.jpg'].sha256&&manifest.crop_preview?.sha256===control.expected_files['card-crop-preview.jpg'].sha256&&manifest.canonical_mutation===false,'UC-174 permanent manifest drift');
  assert(review.identity_ruling===control.ruling.identity&&review.presentation_ruling===control.ruling.presentation&&review.crop_ruling===control.ruling.crop_ruling&&review.chronology_ruling===control.ruling.chronology_ruling&&review.marcus_selection_ruling===control.ruling.marcus_selection_ruling&&review.portrait_separation_ruling===control.ruling.portrait_separation_ruling&&review.canonical_mutation===false,'UC-174 permanent review drift');
  assert(voice.roles?.marcus?.pageimage_source===false&&voice.composite_boundary?.existing_performer_portrait==='images/uc-174-portrait.jpg'&&voice.canonical_mutation===false,'UC-174 permanent voice record drift');
  assert(duplicates.status==='pass'&&duplicates.repository_hash_count===2070&&duplicates.items.length===5&&duplicates.items.every(item=>item.matches.length===0),'UC-174 permanent duplicate drift');
  console.log(`VALIDATED ${DEST}`);console.log(`manifest ${sha(await readFile(join(DEST,'manifest.json')))}`);console.log(`sums ${sha(await readFile(join(DEST,'SHA256SUMS')))}`);
}
if(command==='materialize')await materialize();else if(command==='validate')await validate();else throw new Error(`unknown command ${command}`);
