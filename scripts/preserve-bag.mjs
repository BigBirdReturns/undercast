#!/usr/bin/env node
/**
 * Export pre-R1 original image bytes from the pinned git commit into a verified
 * BagIt bag. The output is intended for independent preservation storage, not
 * for committing the ~1 GB payload back into the repository.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { rightsClass, sha256, verifyBag } from './lib/preservation.mjs';

function option(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value`);
  return value;
}
const rawArgs = process.argv.slice(2);
const out = option('out', rawArgs.find((arg, index) => !arg.startsWith('--') && (index === 0 || !rawArgs[index - 1].startsWith('--'))));
if (!out) throw new Error('usage: node scripts/preserve-bag.mjs <out-dir> [--baseline preservation/baseline-manifest.json]');
const baselinePath = option('baseline', 'preservation/baseline-manifest.json');
const baselineBytes = await readFile(baselinePath);
const baseline = JSON.parse(baselineBytes);
const commit = baseline.baseline_commit_pre_r1;
if (!/^[0-9a-f]{40}$/i.test(commit || '')) throw new Error('baseline manifest lacks a pinned 40-hex pre-R1 commit');

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'data', 'images'), { recursive: true });

const originals = new Map();
for (const asset of baseline.assets || []) {
  if (!asset.original) continue;
  const prior = originals.get(asset.original.path);
  const value = { ...asset.original, id: asset.id, side: asset.side, origin: asset.origin || null,
    license: asset.license || null, kind: asset.kind || null, rights_class: rightsClass(asset) };
  if (prior && (prior.sha256 !== value.sha256 || prior.bytes !== value.bytes)) {
    throw new Error(`baseline manifest has conflicting originals for ${asset.original.path}`);
  }
  originals.set(asset.original.path, value);
}
if (!originals.size) throw new Error('baseline manifest has no recoverable originals');

let bytes = 0;
const payloadLines = [];
const indexRows = [];
for (const [sourcePath, original] of [...originals].sort(([a], [b]) => a.localeCompare(b))) {
  const result = spawnSync('git', ['show', `${commit}:${sourcePath}`], { encoding: null, maxBuffer: 512 * 1024 * 1024 });
  if (result.error) throw new Error(`git show ${sourcePath} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`git show ${commit}:${sourcePath} failed: ${String(result.stderr || '').trim()}`);
  const buffer = result.stdout;
  const got = sha256(buffer);
  if (got !== original.sha256) throw new Error(`HASH MISMATCH ${sourcePath}: manifest ${original.sha256}, got ${got}`);
  if (buffer.length !== original.bytes) throw new Error(`BYTE COUNT MISMATCH ${sourcePath}: manifest ${original.bytes}, got ${buffer.length}`);
  const archivePath = `data/${sourcePath.replace(/^images\//, 'images/')}`;
  const target = join(out, archivePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);
  payloadLines.push(`${got}  ${archivePath}`);
  indexRows.push({
    id: original.id,
    side: original.side,
    source_path: sourcePath,
    archive_path: archivePath,
    sha256: got,
    bytes: buffer.length,
    extension: extname(sourcePath).toLowerCase(),
    origin: original.origin,
    license: original.license,
    kind: original.kind,
    rights_class: original.rights_class,
  });
  bytes += buffer.length;
}

await writeFile(join(out, 'manifest-sha256.txt'), payloadLines.join('\n') + '\n');
await writeFile(join(out, 'undercast-baseline-manifest.json'), baselineBytes);
await writeFile(join(out, 'originals-index.jsonl'), indexRows.map((row) => JSON.stringify(row)).join('\n') + '\n');
await writeFile(join(out, 'rights-notice.txt'),
  'This preservation bag contains pre-R1 original image bytes recovered from UNDERCAST git history.\n' +
  'originals-index.jsonl records origin, known license metadata, and a conservative rights class.\n' +
  'copyright-or-unknown payloads remain takedown-sensitive and must not be placed in immutable public storage.\n' +
  'Metadata, hashes, and audit receipts remain retainable after any required byte purge.\n');
const snapshot = {
  schema: 'undercast.preservation.originals/1',
  created_at: new Date().toISOString(),
  repository_commit: process.env.PRESERVATION_COMMIT || process.env.GITHUB_SHA || null,
  baseline_manifest_path: baselinePath,
  baseline_manifest_sha256: sha256(baselineBytes),
  baseline_commit_pre_r1: commit,
  originals: originals.size,
  payload_bytes: bytes,
  rights_classes: Object.fromEntries([...new Set(indexRows.map((row) => row.rights_class))].sort()
    .map((kind) => [kind, indexRows.filter((row) => row.rights_class === kind).length])),
};
await writeFile(join(out, 'originals-snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');
await writeFile(join(out, 'bagit.txt'), 'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n');
await writeFile(join(out, 'bag-info.txt'),
  `Source-Organization: UNDERCAST\n` +
  `Bagging-Date: ${snapshot.created_at.slice(0, 10)}\n` +
  `External-Description: Pre-R1 original UNDERCAST assets recovered from git ${commit}\n` +
  `Payload-Oxum: ${bytes}.${originals.size}\n` +
  `Bag-Count: 1 of 1\n`);
const tagNames = ['bagit.txt', 'bag-info.txt', 'manifest-sha256.txt', 'undercast-baseline-manifest.json', 'originals-index.jsonl', 'rights-notice.txt', 'originals-snapshot.json'];
const tagLines = [];
for (const name of tagNames) tagLines.push(`${sha256(await readFile(join(out, name)))}  ${name}`);
await writeFile(join(out, 'tagmanifest-sha256.txt'), tagLines.join('\n') + '\n');
const verified = await verifyBag(out);
console.log(`PASS — originals bag ${out}: ${originals.size} originals, ${bytes} bytes, ${verified.tag_files} tag files; all bytes match baseline ${commit}`);
