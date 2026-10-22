#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  collapseSourceObservations,
  loadReusableSourceBag,
  scopePreservationReceipt,
  sha256,
  validateSnapshotRegistry,
  verifyBag,
} from './lib/preservation.mjs';

let failures = 0;
function expect(label, got, want) {
  const same = JSON.stringify(got) === JSON.stringify(want);
  if (!same) { failures++; console.error(`FAIL ${label}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`); }
  else console.log(`PASS ${label}`);
}
async function rejects(label, fn, pattern = null) {
  try { await fn(); failures++; console.error(`FAIL ${label}: did not reject`); }
  catch (error) {
    if (pattern && !pattern.test(error.message)) { failures++; console.error(`FAIL ${label}: ${error.message}`); }
    else console.log(`PASS ${label}`);
  }
}

const observation = {
  franchise: 'Star Trek', category: 'Ferengi', title: 'Brunt',
  source: 'https://memory-alpha.fandom.com/wiki/Brunt', observed_at: '2026-07-21T00:00:00Z',
  pageid: 123, revision: 456, timestamp: '2026-07-20T00:00:00Z',
  content_sha256: sha256('brunt source'), disposition: 'credited',
};
const collapsed = collapseSourceObservations({ observations: [observation, { ...observation, category: 'Officials' }] });
expect('duplicate category observations collapse to one exact revision', collapsed.length, 1);
expect('collapsed revision retains both observation facets', collapsed[0].facets.length, 2);
await rejects('unknown source hosts fail closed', async () => collapseSourceObservations({ observations: [{ ...observation, source: 'https://example.test/wiki/Brunt' }] }), /no preservation adapter/);
await rejects('one revision cannot map to two page ids', async () => collapseSourceObservations({ observations: [observation, { ...observation, pageid: 999 }] }), /multiple page ids/);

const root = await mkdtemp(join(tmpdir(), 'undercast-preservation-'));
try {
  await mkdir(join(root, 'data'), { recursive: true });
  await writeFile(join(root, 'data', 'source.txt'), 'evidence');
  const payloadHash = sha256('evidence');
  await writeFile(join(root, 'manifest-sha256.txt'), `${payloadHash}  data/source.txt\n`);
  await writeFile(join(root, 'bagit.txt'), 'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n');
  await writeFile(join(root, 'bag-info.txt'), 'Payload-Oxum: 8.1\n');
  const tagNames = ['bagit.txt', 'bag-info.txt', 'manifest-sha256.txt'];
  const tagLines = [];
  for (const name of tagNames) tagLines.push(`${sha256(await readFile(join(root, name)))}  ${name}`);
  await writeFile(join(root, 'tagmanifest-sha256.txt'), tagLines.join('\n') + '\n');
  const verified = await verifyBag(root);
  expect('valid tiny BagIt verifies', verified.payload_files, 1);
  await writeFile(join(root, 'data', 'source.txt'), 'corrupt');
  await rejects('payload mutation is detected', () => verifyBag(root), /hash mismatch/);
  await writeFile(join(root, 'data', 'source.txt'), 'evidence');
  await writeFile(join(root, 'tagmanifest-sha256.txt'), tagLines.filter((line) => !line.endsWith('manifest-sha256.txt')).join('\n') + '\n');
  await rejects('tag manifest must cover payload manifest', () => verifyBag(root), /must hash manifest-sha256/);
} finally {
  await rm(root, { recursive: true, force: true });
}

// Real source-capture CLI with network disabled: retained bytes must suffice,
// while a changed identity, unbound index or corruption never becomes evidence.
const reuseRoot = await mkdtemp(join(tmpdir(), 'undercast-preserved-source-'));
try {
  const bag = join(reuseRoot, 'prior');
  const record = collapsed[0];
  await mkdir(dirname(join(bag, record.path)), { recursive: true });
  await writeFile(join(bag, record.path), 'brunt source');
  await writeFile(join(bag, 'manifest-sha256.txt'), `${record.content_sha256}  ${record.path}\n`);
  await writeFile(join(bag, 'bagit.txt'), 'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n');
  const original = {...record, retrieval: 'current-hash-match', revision_user: 'source-author', revision_comment: 'retained attribution'};
  await writeFile(join(bag, 'source-index.jsonl'), JSON.stringify(original)+'\n');
  await writeFile(join(bag, 'source-sites.json'), JSON.stringify({[record.api]:{api:record.api, rights_text:'CC BY-SA'}}));
  await writeFile(join(bag, 'source-snapshot.json'), JSON.stringify({exact_revisions:1, repository_commit:'a'.repeat(40)}));
  const tagNames = ['bagit.txt','manifest-sha256.txt','source-index.jsonl','source-sites.json','source-snapshot.json'];
  const seal = async (names=tagNames) => {
    const lines=[];
    for(const name of names) lines.push(`${sha256(await readFile(join(bag,name)))}  ${name}`);
    await writeFile(join(bag,'tagmanifest-sha256.txt'),lines.join('\n')+'\n');
  };
  await seal();
  const reusable = await loadReusableSourceBag(bag);
  const value = await reusable.read(record);
  expect('retained exact bytes preserve source authorship',value.user,'source-author');
  expect('reuse never upgrades current-hash provenance to a fresh exact retrieval',value.preserved_from.original_retrieval,'current-hash-match');
  expect('reuse is labelled separately from network retrieval',value.retrieval,'preserved-hash-match');
  for(const key of ['api','pageid','revision','timestamp','path','content_sha256']) {
    const altered={...record,[key]:typeof record[key]==='number'?record[key]+1:record[key]+'-changed'};
    expect(`retained evidence refuses changed ${key}`,await reusable.read(altered),null);
  }
  const manifest=join(reuseRoot,'manifest.json'),coverage=join(reuseRoot,'coverage.json'),scopes=join(reuseRoot,'scopes.json');
  await writeFile(manifest,JSON.stringify({observations:[observation]}));
  await writeFile(coverage,'[]');await writeFile(scopes,'[]');
  const preload=join(reuseRoot,'network-disabled.mjs');
  await writeFile(preload,'globalThis.fetch=()=>{throw new Error("unexpected network request in retained-source replay");};');
  const output=join(reuseRoot,'output');
  const script=fileURLToPath(new URL('./preserve-sources.mjs',import.meta.url));
  const replay=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,script,output,'--manifest',manifest,'--coverage',coverage,'--scopes',scopes,'--reuse-bag',bag],{encoding:'utf8'});
  expect('real source-capture CLI succeeds with all networking disabled',replay.status,0);
  if(replay.status!==0)console.error(replay.stderr);
  else {
    expect('offline replay emits a complete verified bag',(await verifyBag(output)).payload_files,1);
    const captured=JSON.parse(await readFile(join(output,'source-snapshot.json'),'utf8'));
    expect('offline replay records retained, not fresh, retrieval',{...captured.retrieval},{exact_revision:0,current_hash_match:0,preserved_hash_match:1});
  }
  await writeFile(join(bag,record.path),'corrupt');
  await rejects('changed retained payload stops reuse',()=>loadReusableSourceBag(bag),/hash mismatch/);
  await writeFile(join(bag,record.path),'brunt source');
  await seal(tagNames.filter(name=>name!=='source-index.jsonl'));
  await rejects('unhashed retained index cannot confer provenance',()=>loadReusableSourceBag(bag),/must hash source-index/);
  await writeFile(join(bag,'source-index.jsonl'),JSON.stringify({...original,path:'../../outside'})+'\n');await seal();
  await rejects('retained index cannot point outside the verified payload',()=>loadReusableSourceBag(bag),/unbound/);
} finally {await rm(reuseRoot,{recursive:true,force:true});}

const baseRegistry = {
  version: 1,
  updated_at: '',
  history_guard: {
    baseline_manifest_sha256: 'a'.repeat(64), status: 'awaiting-independent-copy',
    precondition_met: false, destructive_rewrite_authorized: false,
  },
  snapshots: [{
    id: 'preservation-test', status: 'pending', created_at: '2026-07-21T00:00:00Z',
    repository_commit: 'b'.repeat(40), census_manifest_sha256: 'c'.repeat(64), baseline_manifest_sha256: 'a'.repeat(64),
    scopes: { 'star-trek': { manifest_sha256: 'd'.repeat(64) } },
    public_release: { tag: 'preservation-test', assets: [{ kind: 'source-bag', name: 'sources.tar.gz', url: 'https://example.test/sources', sha256: 'e'.repeat(64), bytes: 1 }, { kind: 'repository-snapshot', name: 'repo.tar.gz', url: 'https://example.test/repo', sha256: 'f'.repeat(64), bytes: 1 }] },
    independent_copies: [],
  }],
};
expect('pending snapshot may precede offsite replication', validateSnapshotRegistry(baseRegistry), true);
expect('scope preservation lookup accepts a published pending snapshot', scopePreservationReceipt(baseRegistry, 'star-trek', 'd'.repeat(64))?.snapshot.id, 'preservation-test');
const invalidVerified = structuredClone(baseRegistry); invalidVerified.snapshots[0].status = 'verified';
await rejects('verified snapshot requires an independent public bundle', async () => validateSnapshotRegistry(invalidVerified), /public-bundle/);
const verifiedRegistry = structuredClone(invalidVerified);
verifiedRegistry.snapshots[0].independent_copies.push({ kind: 'public-bundle', provider: 'google-drive', file_id: 'drive-public', name: 'public.zip', sha256: '1'.repeat(64), bytes: 10, verified_at: '2026-07-21T01:00:00Z' });
expect('verified snapshot with independent public bundle is valid', validateSnapshotRegistry(verifiedRegistry), true);
verifiedRegistry.snapshots[0].independent_copies.push({ kind: 'originals-bag', provider: 'google-drive', file_id: 'drive-originals', name: 'originals.zip', sha256: '2'.repeat(64), bytes: 20, verified_at: '2026-07-21T01:01:00Z' });
expect('verified snapshot may also receipt controlled originals', validateSnapshotRegistry(verifiedRegistry), true);

const receiptRoot = await mkdtemp(join(tmpdir(), 'undercast-preservation-receipt-'));
try {
  const registryPath = join(receiptRoot, 'SNAPSHOTS.json');
  await writeFile(registryPath, JSON.stringify(baseRegistry, null, 2) + '\n');
  const script = fileURLToPath(new URL('./preserve-offsite.mjs', import.meta.url));
  const invoke = (args) => {
    const result = spawnSync(process.execPath, [script, '--registry', registryPath, '--snapshot', 'preservation-test', ...args], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`offsite fixture exited ${result.status}: ${result.stderr}`);
  };
  invoke(['--provider', 'google-drive', '--file-id', 'public-id', '--name', 'public.zip', '--kind', 'public-bundle', '--sha256', '3'.repeat(64), '--bytes', '30', '--verified-at', '2026-07-21T02:00:00Z']);
  let receipted = JSON.parse(await readFile(registryPath, 'utf8'));
  expect('public offsite receipt verifies the source/repository snapshot', receipted.snapshots[0].status, 'verified');
  expect('public receipt alone does not release the original-history guard', receipted.history_guard.precondition_met, false);
  invoke(['--provider', 'google-drive', '--file-id', 'originals-id', '--name', 'originals.zip', '--kind', 'originals-bag', '--sha256', '4'.repeat(64), '--bytes', '40', '--verified-at', '2026-07-21T02:01:00Z']);
  receipted = JSON.parse(await readFile(registryPath, 'utf8'));
  expect('independent originals receipt releases the preservation precondition', receipted.history_guard.status, 'offsite-verified');
  expect('offsite originals still never authorize a destructive history rewrite', receipted.history_guard.destructive_rewrite_authorized, false);
} finally {
  await rm(receiptRoot, { recursive: true, force: true });
}

const workflowPath = fileURLToPath(new URL('../.github/workflows/preserve.yml', import.meta.url));
const workflow = await readFile(workflowPath, 'utf8');
expect('preservation workflow does not swallow required receipt staging errors', /git add preservation\/SNAPSHOTS\.json[\s\S]*data\/journal\/autopilot\.jsonl\n\s*if \[ -e preservation\/BOOTSTRAP-PENDING \]; then/.test(workflow), true);
expect('source export binds retained package hash and size', workflow.includes("digest.hexdigest() != asset['sha256']") && workflow.includes("package.stat().st_size != asset['bytes']"), true);
expect('source export reuses the verified bag through the existing collector', workflow.includes('--reuse-bag /tmp/undercast-preservation/reuse/source-bag') && workflow.includes('\"${reuse_args[@]}\"'), true);
expect('optional bootstrap marker is staged conditionally', workflow.includes('if [ -e preservation/BOOTSTRAP-PENDING ]; then\n            git add preservation/BOOTSTRAP-PENDING\n          fi'), true);
expect('preservation workflow has no broad git-add error suppression', /git add preservation\/SNAPSHOTS\.json[\s\S]{0,400}\|\| true/.test(workflow), false);

const retiredRecoveryPaths = [
  fileURLToPath(new URL('../.github/workflows/reconcile-estate-preservation.yml', import.meta.url)),
  fileURLToPath(new URL('../.github/workflows/repair-estate-preservation-reconciliation.yml', import.meta.url)),
  fileURLToPath(new URL('../.github/workflows/repair-estate-preservation-reconciliation-v3.yml', import.meta.url)),
  fileURLToPath(new URL('./repair-preservation-receipt-staging.py', import.meta.url)),
];
for (const retiredPath of retiredRecoveryPaths) {
  await rejects(`retired preservation recovery path stays absent: ${retiredPath.split('/').pop()}`, () => readFile(retiredPath), /ENOENT/);
}

console.log(failures ? `\n${failures} preservation fixture(s) FAILED` : '\nall preservation fixtures pass');
process.exit(failures ? 1 : 0);
