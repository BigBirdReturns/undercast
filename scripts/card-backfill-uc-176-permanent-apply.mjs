#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const CONTROL=process.env.CONTROL||'.github/CARD-BACKFILL-UC-176-PERMANENT-APPLY.json';
const PACKET=process.env.PACKET;
const RECEIPTS=process.env.RECEIPTS;
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const sha=value=>createHash('sha256').update(value).digest('hex');
const readJson=async path=>JSON.parse(await readFile(path,'utf8'));
const writeJson=async(path,value)=>{await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n')};
const fileSha=async path=>sha(await readFile(path));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();

assert(PACKET&&RECEIPTS,'UC-176 packet or receipt directory missing');
const control=await readJson(CONTROL);
assert(control.version===1&&control.lane==='card-backfill'&&control.record_id==='UC-176','UC-176 apply identity drift');
assert(control.kind==='film'&&control.actor==='Fredric March'&&control.character==='Mr. Hyde'&&control.production==='Dr. Jekyll and Mr. Hyde (1931)'&&control.years==='1931'&&control.universe==='Film'&&control.side==='still','UC-176 apply record drift');
assert(control.audit_id==='ma_214b44ba458987517acdd2b8'&&control.pull_request===128&&control.branch==='agent/card-backfill-next-040','UC-176 branch or audit drift');
assert(control.render_run?.run_id===30505241214&&control.render_run?.head_sha==='6ab8ec13e9f3dcd26c51e2d9c6a8f836feb352ac'&&control.render_run?.status==='completed'&&control.render_run?.conclusion==='success','UC-176 render-run custody drift');
assert(control.render_artifact?.artifact_id===8745055647&&control.render_artifact?.name==='card-backfill-uc-176-render-30505241214'&&control.render_artifact?.digest==='sha256:7f9fbc15edb27f87d09cb897b929fa84d7f8598f9b5a0a4f69d0bbbccf50cedb'&&control.render_artifact?.expired===false,'UC-176 render-artifact custody drift');
assert(control.render_packet?.file_count===25&&control.render_packet?.exact_files?.length===25&&control.render_packet?.discovery_failure_count===9&&control.render_packet?.repository_hash_count===2070,'UC-176 packet denominator drift');
assert(control.canonical_mutation===false,'UC-176 canonical-mutation authorization drift');
assert(git('rev-parse','--abbrev-ref','HEAD')===control.branch,'UC-176 checked-out branch drift');
assert(git('rev-parse','HEAD')!==control.head_before_apply_authorization,'UC-176 apply authorization commit missing');
execFileSync('git',['merge-base','--is-ancestor',control.head_before_apply_authorization,'HEAD'],{stdio:'inherit'});

const changed=git('diff','--name-only',`${control.base.sha}...HEAD`).split(/\r?\n/).filter(Boolean).sort();
const expectedTemporary=[...control.temporary_changed_files].sort();
assert(JSON.stringify(changed)===JSON.stringify(expectedTemporary),`UC-176 temporary diff drift\nactual=${changed.join(',')}\nexpected=${expectedTemporary.join(',')}`);

const packetRoot=resolve(PACKET);
const packetEntries=await readdir(packetRoot,{withFileTypes:true});
assert(packetEntries.every(row=>row.isFile()),'UC-176 render packet must be flat');
const packetFiles=packetEntries.map(row=>row.name).sort();
const expectedFiles=[...control.render_packet.exact_files].sort();
assert(JSON.stringify(packetFiles)===JSON.stringify(expectedFiles),'UC-176 render packet file-set drift');
for(const [name,expected] of [['manifest.json',control.render_packet.manifest_sha256],['SHA256SUMS',control.render_packet.checksum_ledger_sha256],['review.json',control.render_packet.review_sha256],['duplicate-scan.json',control.render_packet.duplicate_scan_sha256],['source-discovery-failures.json',control.render_packet.discovery_failure_ledger_sha256]])assert(await fileSha(join(packetRoot,name))===expected,`UC-176 ${name} hash drift`);
for(const key of ['selected_source','candidate','wall_crop']){
  const row=control.render_packet[key], path=join(packetRoot,row.path);
  assert(await fileSha(path)===row.sha256,`UC-176 ${key} hash drift`);
  assert((await stat(path)).size===row.bytes,`UC-176 ${key} byte-count drift`);
}
const sumLines=(await readFile(join(packetRoot,'SHA256SUMS'),'utf8')).trim().split(/\r?\n/).filter(Boolean);
assert(sumLines.length===24,'UC-176 checksum row-count drift');
const sumNames=[];
for(const line of sumLines){
  const match=line.match(/^([0-9a-f]{64})  (.+)$/);assert(match,`invalid checksum row ${line}`);
  const [,expected,name]=match;assert(expectedFiles.includes(name)&&name!=='SHA256SUMS',`checksum filename drift ${name}`);
  assert(await fileSha(join(packetRoot,name))===expected,`checksum mismatch ${name}`);sumNames.push(name);
}
assert(JSON.stringify(sumNames.sort())===JSON.stringify(expectedFiles.filter(name=>name!=='SHA256SUMS').sort()),'UC-176 checksum filename denominator drift');

const manifest=await readJson(join(packetRoot,'manifest.json'));
const review=await readJson(join(packetRoot,'review.json'));
const duplicate=await readJson(join(packetRoot,'duplicate-scan.json'));
const failures=await readJson(join(packetRoot,'source-discovery-failures.json'));
assert(manifest.record_id==='UC-176'&&manifest.actor==='Fredric March'&&manifest.character==='Mr. Hyde'&&manifest.production==='Dr. Jekyll and Mr. Hyde (1931)'&&manifest.canonical_mutation===false,'UC-176 manifest identity drift');
assert(manifest.failure_ledger?.checkpoint_count===9&&manifest.failure_ledger?.retained_sha256===control.render_packet.discovery_failure_ledger_sha256,'UC-176 manifest failure custody drift');
assert(manifest.permanent_packet_contract?.expected_file_count===25&&JSON.stringify([...manifest.permanent_packet_contract.exact_output_files].sort())===JSON.stringify(expectedFiles),'UC-176 manifest packet contract drift');
assert(review.record_id==='UC-176'&&review.disposition==='accept-render-for-permanent-evidence'&&review.canonical_mutation===false,'UC-176 review disposition drift');
assert(failures.record_id==='UC-176'&&failures.failed_discovery_checkpoints?.length===9&&failures.repair_boundary?.canonical_mutation===false,'UC-176 retained discovery failure ledger drift');
assert(duplicate.repository_hash_count===2070&&duplicate.items?.length===3&&duplicate.items.every(row=>Array.isArray(row.matches)&&row.matches.length===0),'UC-176 duplicate scan drift');
assert(new Set(duplicate.items.map(row=>row.sha256)).size===3,'UC-176 selected/candidate/wall byte-distinction drift');

const specimen=(await readJson('data/specimens.json')).find(row=>row.id==='UC-176');
const source=(await readJson('data/SOURCES.json')).find(row=>row.id==='UC-176');
const audits=(await readJson('data/MEDIA-AUDIT.json')).items.filter(row=>row.id===control.audit_id);
assert(specimen&&specimen.actor==='Fredric March'&&specimen.character==='Mr. Hyde'&&specimen.production==='Dr. Jekyll and Mr. Hyde (1931)'&&specimen.years==='1931'&&specimen.designer==='Wally Westmore'&&specimen.transform===4&&!specimen.still&&specimen.portrait?.src==='images/uc-176-portrait.jpg','UC-176 specimen boundary drift');
assert(source&&!source.still&&source.portrait?.src==='images/uc-176-portrait.jpg','UC-176 source-ledger boundary drift');
assert(audits.length===1&&audits[0].wall_id==='UC-176'&&audits[0].side==='still'&&audits[0].status==='absent'&&!audits[0].asset,'UC-176 media-audit boundary drift');

const output=resolve(control.output_directory);
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});
for(const name of expectedFiles)await copyFile(join(packetRoot,name),join(output,name));
for(const name of expectedFiles)assert(await fileSha(join(output,name))===await fileSha(join(packetRoot,name)),`UC-176 materialized byte drift ${name}`);
for(const path of control.temporary_changed_files)await rm(resolve(path),{recursive:true,force:true});

execFileSync('git',['add','-A'],{stdio:'inherit'});
const finalChanged=git('diff','--cached','--name-only',control.base.sha).split(/\r?\n/).filter(Boolean).sort();
const expectedFinal=[...control.final_changed_files].sort();
assert(JSON.stringify(finalChanged)===JSON.stringify(expectedFinal),`UC-176 final changed-file denominator drift\nactual=${finalChanged.join(',')}\nexpected=${expectedFinal.join(',')}`);
assert(finalChanged.length===25&&finalChanged.every(path=>path.startsWith(`${control.output_directory}/`)),'UC-176 final evidence-only boundary drift');
await writeJson(join(RECEIPTS,'materialize.json'),{version:1,record_id:'UC-176',base:control.base,branch:control.branch,authorization_head:git('rev-parse','HEAD'),render_run:control.render_run,render_artifact:control.render_artifact,packet:control.render_packet,removed_temporary_files:control.temporary_changed_files,final_changed_files:finalChanged,canonical_mutation:false});
console.log(`PASS — UC-176 exact 25-file render packet materialized; ${control.temporary_changed_files.length} temporary paths retired`);
