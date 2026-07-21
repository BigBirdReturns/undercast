#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyBag, sha256, parseManifest } from './lib/preservation.mjs';

const root = process.argv.find((arg) => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]);
if (!root) {
  console.error('usage: node scripts/preserve-verify.mjs <bag-dir> [--json]');
  process.exit(1);
}

const result = await verifyBag(root);
const sourceSnapshotPath = join(root, 'source-snapshot.json');
const originalsSnapshotPath = join(root, 'originals-snapshot.json');
let detail = null;
try {
  const snapshot = JSON.parse(await readFile(sourceSnapshotPath, 'utf8'));
  const indexText = await readFile(join(root, 'source-index.jsonl'), 'utf8');
  const rows = indexText.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`source-index.jsonl:${index + 1}: ${error.message}`); }
  });
  if (rows.length !== snapshot.exact_revisions) throw new Error(`source index count ${rows.length} != receipt ${snapshot.exact_revisions}`);
  const payload = new Map(parseManifest(await readFile(join(root, 'manifest-sha256.txt'), 'utf8')).map((row) => [row.path, row.sha256]));
  for (const row of rows) {
    if (payload.get(row.path) !== row.content_sha256) throw new Error(`source index/payload mismatch for ${row.path}`);
  }
  const manifestBytes = await readFile(join(root, 'undercast-census-manifest.json'));
  if (sha256(manifestBytes) !== snapshot.census_manifest_sha256) throw new Error('embedded census manifest hash does not match source receipt');
  detail = { kind: 'source', ...snapshot };
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
try {
  const snapshot = JSON.parse(await readFile(originalsSnapshotPath, 'utf8'));
  const baselineBytes = await readFile(join(root, 'undercast-baseline-manifest.json'));
  if (sha256(baselineBytes) !== snapshot.baseline_manifest_sha256) throw new Error('embedded baseline manifest hash does not match originals receipt');
  if (snapshot.originals !== result.payload_files) throw new Error(`originals receipt count ${snapshot.originals} != payload ${result.payload_files}`);
  detail = { kind: 'originals', ...snapshot };
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const output = { status: 'verified', bag: root, ...result, detail };
if (process.argv.includes('--json')) console.log(JSON.stringify(output, null, 2));
else console.log(`PASS — ${root}: ${result.payload_files} payload files, ${result.payload_bytes} bytes, ${result.tag_files} tag files${detail ? ` (${detail.kind})` : ''}`);
