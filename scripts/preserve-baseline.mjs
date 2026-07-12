#!/usr/bin/env node
// Phase 0 rescue: inventory every pre-R1 original still recoverable from git history,
// hash it (sha256), pair it with the resized derivative now on the wall, and emit a
// verifiable baseline manifest. Non-destructive. Run BEFORE any .git gc / history rewrite.
import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REPO = process.cwd();
const TMP = require('node:os').tmpdir() + '/undercast-orig';
// The pre-R1 baseline is a FIXED commit — NEVER a moving ref. `origin/main~1` drifts as
// new commits land, and would inventory today's RESIZED derivatives as "originals",
// defeating the HISTORY GUARD (a later BagIt export would bag resized bytes and green-light
// destroying the real originals). Pin it: prefer the committed manifest's recorded SHA,
// else the known baseline SHA.
const PINNED_BASELINE = '17cc010a5ec6cba29189ce92165d1f226961b33f';
let PREV = PINNED_BASELINE;
try { PREV = JSON.parse(readFileSync(REPO + '/preservation/baseline-manifest.json', 'utf8')).baseline_commit_pre_r1 || PINNED_BASELINE; } catch {}
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

process.chdir(REPO);
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
// extract the pre-R1 image tree from history (fast, non-destructive)
execSync(`git archive ${PREV} -- images/ | tar -x -C ${TMP}`, { shell: '/bin/bash', stdio: 'inherit', maxBuffer: 1 << 30 });

const origDir = TMP + '/images';
const origFiles = readdirSync(origDir).filter((f) => /^uc-/.test(f));
// index originals by basename-without-ext (uc-###-side) — R1 converted some .png -> .jpg
const origByStem = {};
let origBytes = 0;
for (const f of origFiles) {
  const buf = readFileSync(origDir + '/' + f);
  const stem = f.replace(/\.(jpe?g|png|gif|webp)$/i, '');
  origByStem[stem] = { path: 'images/' + f, sha256: sha256(buf), bytes: buf.length };
  origBytes += buf.length;
}

// GUARD: the pre-R1 tree is ~1GB of originals. If what we extracted is small, PREV is
// pointed at resized derivatives — REFUSE to overwrite the inventory rather than silently
// record the resized bytes as the "originals" to preserve.
if (origBytes < 500e6) {
  console.error(`REFUSING: images/ at ${PREV.slice(0, 12)} is only ${(origBytes / 1e6).toFixed(0)}MB — expected ~1GB of pre-R1 originals.`);
  console.error('The baseline commit is wrong (resized derivatives?). preservation/baseline-manifest.json left untouched.');
  rmSync(TMP, { recursive: true, force: true });
  process.exit(1);
}

// current (resized) assets referenced by the wall
const specimens = JSON.parse(readFileSync('data/specimens.json', 'utf8'));
const ledger = JSON.parse(readFileSync('data/SOURCES.json', 'utf8'));
const ledById = Object.fromEntries(ledger.map((r) => [r.id, r]));
const rows = [];
let newBytes = 0, matched = 0, unmatched = 0;
for (const c of specimens) {
  for (const side of ['still', 'portrait']) {
    const a = c[side]; if (!a?.src) continue;
    const cur = REPO + '/' + a.src;
    let curSha = null, curBytes = null;
    try { const b = readFileSync(cur); curSha = sha256(b); curBytes = b.length; newBytes += b.length; } catch {}
    const stem = a.src.replace(/^images\//, '').replace(/\.(jpe?g|png|gif|webp)$/i, '');
    const orig = origByStem[stem] || null;
    if (orig) matched++; else unmatched++;
    const led = ledById[c.id] || {};
    rows.push({
      id: c.id, side,
      current: { path: a.src, sha256: curSha, bytes: curBytes },
      original: orig,             // null if this side was added AFTER the R1 baseline (no original to rescue)
      transform: orig ? 'resize<=640 fit:inside; jpeg q82 mozjpeg; flatten #e4dfd5' : null,
      origin: (led[side] && led[side].origin) || a.origin || null,
      license: a.license || (led[side] && led[side].license) || null,
      kind: a.kind || null,
    });
  }
}

const manifest = {
  schema: 'undercast.preservation.baseline/1',
  created_for: 'Phase 0 rescue — inventory of pre-R1 originals recoverable from git history',
  baseline_commit_pre_r1: execSync(`git rev-parse ${PREV}`).toString().trim(),
  r1_commit: execSync('git rev-parse origin/main').toString().trim(),
  counts: { asset_sides: rows.length, originals_recoverable: matched, no_original: unmatched, original_files_in_history: origFiles.length },
  bytes: { originals_total: origBytes, current_total: newBytes, reduction_pct: Math.round(100 - newBytes / origBytes * 100) },
  warning: 'The original bytes live ONLY in git history (commit above) until exported. Do NOT gc/rewrite history until a verified BagIt export exists in preservation storage (GhostBox/object store).',
  assets: rows,
};
mkdirSync(REPO + '/preservation', { recursive: true });
writeFileSync(REPO + '/preservation/baseline-manifest.json', JSON.stringify(manifest, null, 1) + '\n');
console.log(`originals in history: ${origFiles.length} (${(origBytes/1e6).toFixed(0)}MB)`);
console.log(`asset-sides on wall: ${rows.length} | with recoverable original: ${matched} | added post-R1: ${unmatched}`);
console.log(`reduction: ${(origBytes/1e6).toFixed(0)}MB -> ${(newBytes/1e6).toFixed(0)}MB (${manifest.bytes.reduction_pct}%)`);
console.log('wrote preservation/baseline-manifest.json');
rmSync(TMP, { recursive: true, force: true });
