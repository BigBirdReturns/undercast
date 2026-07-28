#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-125-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-125';
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(DEST, { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
};
function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return 'unknown';
}
async function receipt(path) {
  const bytes = await readFile(path);
  return { bytes: bytes.length, sha256: sha(bytes), mime: signatureMime(bytes) };
}
async function walkImages(root, out = []) {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await walkImages(path, out);
    else if (/\.(?:jpe?g|png|webp)$/i.test(entry.name)) out.push(path);
  }
  return out;
}
async function repositoryHashes() {
  const map = new Map();
  try {
    const manifest = await readJson('data/media-manifest.json');
    for (const [path, row] of Object.entries(manifest.assets || {})) {
      if (!/^[0-9a-f]{64}$/i.test(row?.sha256 || '')) continue;
      const list = map.get(row.sha256) || [];
      list.push(`manifest:${path}`);
      map.set(row.sha256, list);
    }
  } catch {}
  for (const path of await walkImages('images')) {
    try {
      const hash = sha(await readFile(path));
      const list = map.get(hash) || [];
      list.push(`file:${path}`);
      map.set(hash, list);
    } catch {}
  }
  return map;
}

const expectedFiles = [
  'SHA256SUMS',
  'card-crop-preview.jpg',
  'duplicate-scan.json',
  'exact-role-record.json',
  'fry-original.jpg',
  'manifest.json',
  'ren-original.jpg',
  'review.json',
  'review.md',
  'source-page-billy-west-current-official.png',
  'source-page-billy-west-role-history.png',
  'source-page-hulu-futurama.png',
  'source-page-paramount-ren-stimpy.png',
  'stimpy-original.jpg',
  'uc-125-still-candidate.jpg'
];

async function loadControl() {
  const control = await readJson(CONTROL);
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-125', 'UC-125 apply scope drift');
  assert(control.actor === 'Billy West' && control.character === 'Ren, Stimpy & Fry' && control.production === 'Ren & Stimpy / Futurama' && control.year === 1991 && control.side === 'still' && control.reviewed_role === 'second-desk', 'UC-125 apply authority drift');
  assert(control.render_artifact?.artifact_id === 8705735419 && control.render_artifact?.head_sha === '0900387f752adedf4c5bb652b37fc7952bb75f31' && control.render_artifact?.zip_sha256 === 'f0218a60384ad7d52cbb82b9cdf522fd398dd6c119264f5c6547a8ae9d48580d', 'UC-125 render custody drift');
  assert(control.expected?.packet_file_count === 15 && control.expected?.duplicate_item_count === 5 && control.expected?.duplicate_repository_hash_count === 2070 && control.expected?.selected_asset_count === 3 && control.expected?.discovery_candidate_count === 3 && control.expected?.official_source_width_exception_count === 3, 'UC-125 packet denominator drift');
  assert(control.ruling?.identity === 'expected-subjects' && control.ruling?.presentation === 'three-role-character-composite' && control.ruling?.crop_ruling === 'pass-three-panel-face-and-body-layout' && control.ruling?.chronology_ruling === 'pass-1991-ren-stimpy-era-separated-from-ren-takeover-and-fry-debut' && control.ruling?.floor_exception_ruling === 'pass-three-explicit-official-source-width-exceptions' && control.ruling?.canonical_mutation === false, 'UC-125 ruling drift');
  return control;
}
async function verifyFile(name, expected = {}) {
  const row = await receipt(join(SOURCE_ROOT, name));
  if (expected.sha256) assert(row.sha256 === expected.sha256, `${name} source hash drift`);
  if (expected.mime) assert(row.mime === expected.mime, `${name} source MIME drift`);
  if (expected.bytes !== undefined) assert(row.bytes === expected.bytes, `${name} source byte drift`);
  return row;
}
async function verifySourcePacket(control) {
  assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
  const names = (await readdir(SOURCE_ROOT)).sort();
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-125 source packet file set drift: ${names.join(', ')}`);
  const map = {
    'manifest.json': control.expected.source_manifest,
    'duplicate-scan.json': control.expected.source_duplicate_scan,
    'review.json': control.expected.source_review_json,
    'review.md': control.expected.source_review_md,
    'SHA256SUMS': control.expected.source_sums,
    'exact-role-record.json': control.expected.exact_role_record,
    'ren-original.jpg': control.expected.ren_source,
    'stimpy-original.jpg': control.expected.stimpy_source,
    'fry-original.jpg': control.expected.fry_source,
    'source-page-billy-west-current-official.png': control.expected.current_official_page,
    'source-page-billy-west-role-history.png': control.expected.role_history_page,
    'source-page-paramount-ren-stimpy.png': control.expected.paramount_page,
    'source-page-hulu-futurama.png': control.expected.hulu_page,
    'uc-125-still-candidate.jpg': control.expected.candidate,
    'card-crop-preview.jpg': control.expected.crop_preview
  };
  for (const [name, expected] of Object.entries(map)) await verifyFile(name, expected);

  const sums = String(await readFile(join(SOURCE_ROOT, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length === expectedFiles.length - 1, 'source checksum row count drift');
