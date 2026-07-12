#!/usr/bin/env node
/**
 * preserve-bag.mjs — export the pre-R1 original assets from git history as a portable
 * BagIt bag (RFC 8493), so the originals survive even a future .git rewrite/gc and can
 * be moved to preservation storage (GhostBox / object store) independent of this repo.
 *
 *   node scripts/preserve-bag.mjs <out-dir>
 *
 * Reads preservation/baseline-manifest.json, extracts each recoverable original from the
 * baseline commit, writes a BagIt structure with sha256 payload manifest, and verifies
 * every extracted byte against the hash recorded at inventory time. Non-destructive.
 * This does NOT commit the ~1GB payload to the repo — the bag is meant to leave the repo.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

const out = process.argv[2];
if (!out) { console.error('usage: node scripts/preserve-bag.mjs <out-dir>'); process.exit(1); }
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const man = JSON.parse(readFileSync('preservation/baseline-manifest.json', 'utf8'));
const commit = man.baseline_commit_pre_r1;

rmSync(out, { recursive: true, force: true });
mkdirSync(out + '/data', { recursive: true });

// unique originals (dedupe by path) that are recoverable
const originals = new Map();
for (const r of man.assets) if (r.original) originals.set(r.original.path, r.original);

const payloadLines = [];
let bytes = 0, mismatch = 0;
for (const [path, orig] of originals) {
  // read the exact blob from the baseline commit
  const buf = execSync(`git show ${commit}:${path}`, { maxBuffer: 1 << 30 });
  const got = sha256(buf);
  if (got !== orig.sha256) { mismatch++; console.error('HASH MISMATCH', path, 'manifest', orig.sha256, 'got', got); continue; }
  const rel = 'data/' + path.replace(/^images\//, '');
  writeFileSync(out + '/' + rel, buf);
  payloadLines.push(`${got}  ${rel}`);
  bytes += buf.length;
}

const bagInfo =
  `Source-Organization: UNDERCAST\n` +
  `Bagging-Date: ${new Date().toISOString().slice(0, 10)}\n` +
  `External-Description: Pre-R1 original full-resolution UNDERCAST assets recovered from git ${commit.slice(0, 12)}\n` +
  `Payload-Oxum: ${bytes}.${originals.size}\n` +
  `Bag-Count: 1 of 1\n`;
writeFileSync(out + '/bagit.txt', 'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n');
writeFileSync(out + '/manifest-sha256.txt', payloadLines.join('\n') + '\n');
writeFileSync(out + '/bag-info.txt', bagInfo);
// copy the baseline manifest into the bag as a tag file (the provenance of the bag)
writeFileSync(out + '/undercast-baseline-manifest.json', JSON.stringify(man, null, 1) + '\n');
const tagLines = ['bagit.txt', 'bag-info.txt', 'undercast-baseline-manifest.json'].map((f) => `${sha256(readFileSync(out + '/' + f))}  ${f}`);
writeFileSync(out + '/tagmanifest-sha256.txt', tagLines.join('\n') + '\n');

console.log(`bag: ${out}`);
console.log(`  ${originals.size} originals, ${(bytes / 1e6).toFixed(0)}MB, hash mismatches: ${mismatch}`);
console.log(mismatch ? 'FAIL: originals in history diverge from inventory — investigate before any gc.' :
  'OK: every original verified against inventory. Move this bag to GhostBox/object storage, THEN history may be gc\'d.');
