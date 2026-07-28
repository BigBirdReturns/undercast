#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-124-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-124';
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
  'manifest.json',
  'mufasa-original.jpg',
  'review.json',
  'review.md',
  'source-page-d23-lion-king-1994-film.png',
  'source-page-d23-remembering-james-earl-jones.png',
  'source-page-disney-james-earl-jones.png',
  'source-page-starwars-james-earl-jones-vader.png',
  'uc-124-still-candidate.jpg',
  'vader-original.jpg'
];

async function loadControl() {
  const control = await readJson(CONTROL);
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-124', 'UC-124 apply scope drift');
  assert(control.actor === 'James Earl Jones' && control.character === 'Mufasa (and Darth Vader)' && control.production === 'The Lion King / Star Wars' && control.year === 1994 && control.side === 'still' && control.reviewed_role === 'second-desk', 'UC-124 apply authority drift');
  assert(control.render_artifact?.artifact_id === 8704655432 && control.render_artifact?.head_sha === '1a0430c850117cf27cb3707e83e72b258887a90f' && control.render_artifact?.zip_sha256 === '91a426ee4ddf36a692650fb788dfa77618331cb1d847748d4a20c875259d834c', 'UC-124 render custody drift');
  assert(control.expected?.packet_file_count === 14 && control.expected?.duplicate_item_count === 4 && control.expected?.duplicate_repository_hash_count === 2070 && control.expected?.selected_asset_count === 2 && control.expected?.discovery_candidate_count === 2 && control.expected?.failed_discovery_count === 2, 'UC-124 packet denominator drift');
  assert(control.ruling?.identity === 'expected-subjects' && control.ruling?.presentation === 'two-role-voice-character-composite' && control.ruling?.crop_ruling === 'pass-two-panel-face-and-context-layout' && control.ruling?.chronology_ruling === 'pass-1994-lion-king-chronology-separated-from-vader-history' && control.ruling?.embodiment_ruling === 'pass-jones-voice-separated-from-vader-suit-occupancy' && control.ruling?.canonical_mutation === false, 'UC-124 ruling drift');
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
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-124 source packet file set drift: ${names.join(', ')}`);
  const map = {
    'manifest.json': control.expected.source_manifest,
    'duplicate-scan.json': control.expected.source_duplicate_scan,
    'review.json': control.expected.source_review_json,
    'review.md': control.expected.source_review_md,
    'SHA256SUMS': control.expected.source_sums,
    'exact-role-record.json': control.expected.exact_role_record,
    'mufasa-original.jpg': control.expected.mufasa_source,
    'vader-original.jpg': control.expected.vader_source,
    'source-page-disney-james-earl-jones.png': control.expected.disney_actor_page,
    'source-page-starwars-james-earl-jones-vader.png': control.expected.starwars_actor_page,
    'source-page-d23-lion-king-1994-film.png': control.expected.d23_film_page,
    'source-page-d23-remembering-james-earl-jones.png': control.expected.d23_role_page,
    'uc-124-still-candidate.jpg': control.expected.candidate,
    'card-crop-preview.jpg': control.expected.crop_preview
  };
  for (const [name, expected] of Object.entries(map)) await verifyFile(name, expected);

  const sums = String(await readFile(join(SOURCE_ROOT, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length === expectedFiles.length - 1, 'source checksum row count drift');
