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
assert(control.failed_apply_checkpoints?.length===1&&control.failed_apply_checkpoints[0]?.run_id===30505760356&&control.failed_apply_checkpoints[0]?.artifact_id===8745247314&&control.failed_apply_checkpoints[0]?.artifact_digest_sha256==='20439cca4f71bfb782f57725238d04e66afd6cdf41ea622282d624f96dc2d86a'&&control.failed_apply_checkpoints[0]?.materialization_passed===true&&control.failed_apply_checkpoints[0]?.final_evidence_only_denominator_passed===true&&control.failed_apply_checkpoints[0]?.canonical_gate_started===false&&control.failed_apply_checkpoints[0]?.permanent_commit_created===false&&control.failed_apply_checkpoints[0]?.branch_pushed===false,'UC-176 failed apply custody drift');
assert(control.apply_repair_boundary?.source_receipt_trailing_whitespace_must_remain_byte_exact===true&&control.apply_repair_boundary?.cached_diff_source_code_whitespace_check_must_not_normalize_evidence_payload===true&&control.apply_repair_boundary?.full_canonical_gate_including_rendered_browser_tests_required===true&&control.apply_repair_boundary?.canonical_mutation===false,'UC-176 apply repair boundary drift');
assert(control.expected_permanent_packet?.file_count===25,'UC-176 expected permanent packet denominator drift');
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

const permanentFailurePath=join(output,'source-discovery-failures.json');
const permanentFailures=await readJson(permanentFailurePath);
permanentFailures.failed_permanent_apply_checkpoints=control.failed_apply_checkpoints;
permanentFailures.permanent_apply_repair_boundary=control.apply_repair_boundary;
permanentFailures.checkpoint_status='nine-discovery-failures-and-one-permanent-apply-failure-retained';
await writeJson(permanentFailurePath,permanentFailures);

const permanentReviewPath=join(output,'review.json');
const permanentReview=await readJson(permanentReviewPath);
permanentReview.disposition='reviewed-evidence-candidate';
permanentReview.failed_permanent_apply_checkpoints=control.failed_apply_checkpoints;
permanentReview.permanent_apply_repair_boundary=control.apply_repair_boundary;
permanentReview.canonical_mutation=false;
await writeJson(permanentReviewPath,permanentReview);

const permanentReviewMdPath=join(output,'review.md');
const permanentReviewMd=(await readFile(permanentReviewMdPath,'utf8')).trimEnd();
await writeFile(permanentReviewMdPath,permanentReviewMd+`

## Failed permanent-apply checkpoint

The first permanent-apply run verified the exact render artifact, materialized all 25 permanent evidence files, retired all 17 temporary production paths, and proved the exact evidence-only changed-file denominator. It then failed before the canonical gate, commit, or push because a cached-diff source-code whitespace check was applied to byte-exact source-text receipts containing historically published trailing spaces. The repair preserves those source bytes unchanged, retains the failed run and artifact in this packet, and removes only the inapplicable cached-diff whitespace normalization. The full canonical gate, including rendered browser tests, remains mandatory.
`);

const permanentManifestPath=join(output,'manifest.json');
const permanentManifest=await readJson(permanentManifestPath);
permanentManifest.failure_ledger.retained_sha256=await fileSha(permanentFailurePath);
permanentManifest.permanent_apply_custody={failed_checkpoints:control.failed_apply_checkpoints,repair_boundary:control.apply_repair_boundary,retained_path:'source-discovery-failures.json',retained_sha256:await fileSha(permanentFailurePath)};
permanentManifest.disposition='reviewed-evidence-candidate';
permanentManifest.canonical_mutation=false;
await writeJson(permanentManifestPath,permanentManifest);

const permanentNames=(await readdir(output)).filter(name=>name!=='SHA256SUMS').sort();
const permanentSumLines=[];
for(const name of permanentNames)permanentSumLines.push(`${await fileSha(join(output,name))}  ${name}`);
await writeFile(join(output,'SHA256SUMS'),permanentSumLines.join('\n')+'\n');
const permanentPacket={
  file_count:(await readdir(output)).length,
  manifest_sha256:await fileSha(permanentManifestPath),
  checksum_ledger_sha256:await fileSha(join(output,'SHA256SUMS')),
  review_sha256:await fileSha(permanentReviewPath),
  review_md_sha256:await fileSha(permanentReviewMdPath),
  failure_ledger_sha256:await fileSha(permanentFailurePath)
};
assert(JSON.stringify(permanentPacket)===JSON.stringify(control.expected_permanent_packet),`UC-176 permanent packet hash drift\nactual=${JSON.stringify(permanentPacket)}\nexpected=${JSON.stringify(control.expected_permanent_packet)}`);
const permanentSumRows=(await readFile(join(output,'SHA256SUMS'),'utf8')).trim().split(/\r?\n/).filter(Boolean);
assert(permanentSumRows.length===24,'UC-176 permanent checksum row-count drift');
for(const line of permanentSumRows){const match=line.match(/^([0-9a-f]{64})  (.+)$/);assert(match,`invalid permanent checksum row ${line}`);const [,expected,name]=match;assert(await fileSha(join(output,name))===expected,`permanent checksum mismatch ${name}`);}

for(const path of control.temporary_changed_files)await rm(resolve(path),{recursive:true,force:true});

execFileSync('git',['add','-A'],{stdio:'inherit'});
const finalChanged=git('diff','--cached','--name-only',control.base.sha).split(/\r?\n/).filter(Boolean).sort();
const expectedFinal=[...control.final_changed_files].sort();
assert(JSON.stringify(finalChanged)===JSON.stringify(expectedFinal),`UC-176 final changed-file denominator drift\nactual=${finalChanged.join(',')}\nexpected=${expectedFinal.join(',')}`);
assert(finalChanged.length===25&&finalChanged.every(path=>path.startsWith(`${control.output_directory}/`)),'UC-176 final evidence-only boundary drift');
await writeJson(join(RECEIPTS,'materialize.json'),{version:1,record_id:'UC-176',base:control.base,branch:control.branch,authorization_head:git('rev-parse','HEAD'),render_run:control.render_run,render_artifact:control.render_artifact,render_packet:control.render_packet,failed_apply_checkpoints:control.failed_apply_checkpoints,apply_repair_boundary:control.apply_repair_boundary,permanent_packet:permanentPacket,removed_temporary_files:control.temporary_changed_files,final_changed_files:finalChanged,canonical_mutation:false});
console.log(`PASS — UC-176 exact 25-file permanent packet materialized with failed-apply custody; ${control.temporary_changed_files.length} temporary paths retired`);
