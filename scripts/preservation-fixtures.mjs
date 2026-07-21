#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  collapseSourceObservations,
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

console.log(failures ? `\n${failures} preservation fixture(s) FAILED` : '\nall preservation fixtures pass');
process.exit(failures ? 1 : 0);
