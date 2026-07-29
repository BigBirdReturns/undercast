#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-154-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-154';
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => { await mkdir(DEST, { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); };
function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return 'unknown';
}
async function receipt(path) { const bytes = await readFile(path); return { bytes: bytes.length, sha256: sha(bytes), mime: signatureMime(bytes) }; }
async function walkImages(root, out = []) {
  let entries; try { entries = await readdir(root, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) { const path = join(root, entry.name); if (entry.isDirectory()) await walkImages(path, out); else if (/\.(?:jpe?g|png|webp)$/i.test(entry.name)) out.push(path); }
  return out;
}
async function repositoryHashes() {
  const map = new Map();
  try {
    const manifest = await readJson('data/media-manifest.json');
    for (const [path, row] of Object.entries(manifest.assets || {})) {
      if (!/^[0-9a-f]{64}$/i.test(row?.sha256 || '')) continue;
      const list = map.get(row.sha256) || []; list.push(`manifest:${path}`); map.set(row.sha256, list);
    }
  } catch {}
  for (const path of await walkImages('images')) { try { const hash = sha(await readFile(path)); const list = map.get(hash) || []; list.push(`file:${path}`); map.set(hash, list); } catch {} }
  return map;
}

const expectedFiles = [
  'SHA256SUMS',
  'card-crop-preview.jpg',
  'duplicate-scan.json',
  'exact-still-record.json',
  'manifest.json',
  'michael-myers-2007-original.jpg',
  'review.json',
  'review.md',
  'source-page-afi-halloween-2007.png',
  'source-page-halloweenmovies-2007-trailer.png',
  'source-page-halloweenmovies-kristina-klebe.png',
  'source-page-tyler-mane-official-halloween-interview.png',
  'uc-154-still-candidate.jpg'
];

async function loadControl() {
  const control = await readJson(CONTROL);
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-154', 'UC-154 apply scope drift');
  assert(control.actor === 'Tyler Mane' && control.character === 'Michael Myers' && control.production === 'Halloween (2007)' && control.years === '2007–2009' && control.side === 'still' && control.reviewed_role === 'second-desk', 'UC-154 apply authority drift');
  assert(control.render_artifact?.artifact_id === 8711230585 && control.render_artifact?.head_sha === '4f277f3e36682351dab95e2372d86f17c6282d6b' && control.render_artifact?.zip_sha256 === '2b13535c985294f2bf6e6aa8e5c424155f883a41b04ef375e0ae99ca5d1cfb2e', 'UC-154 render custody drift');
  assert(control.expected?.packet_file_count === 13 && control.expected?.duplicate_item_count === 3 && control.expected?.duplicate_repository_hash_count === 2070 && control.expected?.targeted_candidate_count === 1 && control.expected?.failed_discovery_checkpoint_count === 1 && control.expected?.source_page_count === 4, 'UC-154 packet denominator drift');
  assert(control.ruling?.identity === 'expected-subject' && control.ruling?.presentation === 'completed-2007-michael-myers-character-still' && control.ruling?.crop_ruling === 'pass-east-anchored-mask-body-action-crop' && control.ruling?.chronology_ruling === 'pass-2007-first-film-separated-from-2009-sequel' && control.ruling?.mixed_gallery_ruling === 'pass-rejected-mixed-gallery-denominator' && control.ruling?.portrait_separation_ruling === 'pass-existing-performer-portrait-unchanged' && control.ruling?.canonical_mutation === false, 'UC-154 ruling drift');
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
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-154 source packet file set drift: ${names.join(', ')}`);
  const map = {
    'manifest.json': control.expected.source_manifest,
    'duplicate-scan.json': control.expected.source_duplicate_scan,
    'review.json': control.expected.source_review_json,
    'review.md': control.expected.source_review_md,
    'SHA256SUMS': control.expected.source_sums,
    'exact-still-record.json': control.expected.exact_still_record,
    'michael-myers-2007-original.jpg': control.expected.selected_source,
    'source-page-afi-halloween-2007.png': control.expected.afi_page,
    'source-page-tyler-mane-official-halloween-interview.png': control.expected.tyler_mane_page,
    'source-page-halloweenmovies-kristina-klebe.png': control.expected.halloweenmovies_article_page,
    'source-page-halloweenmovies-2007-trailer.png': control.expected.halloweenmovies_trailer_page,
    'uc-154-still-candidate.jpg': control.expected.candidate,
    'card-crop-preview.jpg': control.expected.crop_preview
  };
  for (const [name, expected] of Object.entries(map)) await verifyFile(name, expected);
  const sums = String(await readFile(join(SOURCE_ROOT, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length === expectedFiles.length - 1, 'UC-154 source checksum row count drift');
  const sumNames = [];
  for (const line of sums) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match, `malformed UC-154 source checksum ${line}`);
    sumNames.push(match[2]);
    assert(sha(await readFile(join(SOURCE_ROOT, match[2]))) === match[1], `${match[2]} source checksum drift`);
  }
  assert(JSON.stringify(sumNames.sort()) === JSON.stringify(expectedFiles.filter(name => name !== 'SHA256SUMS').sort()), 'UC-154 source checksum filename set drift');

  const manifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
  const review = await readJson(join(SOURCE_ROOT, 'review.json'));
  const still = await readJson(join(SOURCE_ROOT, 'exact-still-record.json'));
  const duplicates = await readJson(join(SOURCE_ROOT, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-154' && manifest.actor === 'Tyler Mane' && manifest.character === 'Michael Myers' && manifest.production === 'Halloween (2007)' && manifest.years === '2007–2009' && manifest.side === 'still', 'UC-154 source manifest identity drift');
  assert(manifest.custody?.targeted_artifact?.artifact_id === 8711102405 && manifest.custody?.targeted_artifact?.candidate_count === control.expected.targeted_candidate_count && manifest.custody?.failed_discovery_checkpoints?.length === control.expected.failed_discovery_checkpoint_count, 'UC-154 source targeted custody drift');
  assert(Object.keys(manifest.source_custody || {}).length === control.expected.source_page_count, 'UC-154 source page denominator drift');
  assert(manifest.source_custody?.['afi-halloween-2007']?.page_screenshot?.sha256 === control.expected.afi_page.sha256 && manifest.source_custody?.['tyler-mane-official-halloween-interview']?.page_screenshot?.sha256 === control.expected.tyler_mane_page.sha256, 'UC-154 source actor-role custody drift');
  assert(manifest.source_custody?.['official-kristina-klebe-archive']?.page_screenshot?.sha256 === control.expected.halloweenmovies_article_page.sha256 && manifest.source_custody?.['official-halloween-2007-trailer']?.page_screenshot?.sha256 === control.expected.halloweenmovies_trailer_page.sha256, 'UC-154 source frame custody drift');
  assert(manifest.selected_frame?.original?.sha256 === control.expected.selected_source.sha256 && manifest.selected_frame?.caption.includes('Tyler Mane as Michael Myers'), 'UC-154 selected source drift');
  assert(manifest.chronology_boundary?.selected_frame_production === 'Halloween (2007)' && manifest.chronology_boundary?.halloween_ii_2009_substitute_forbidden === true && manifest.chronology_boundary?.other_michael_myers_performers_forbidden === true, 'UC-154 source chronology boundary drift');
  assert(manifest.still_boundary?.exact_completed_michael_myers_character_still_required === true && manifest.still_boundary?.mixed_gallery_inventory_forbidden === true && manifest.still_boundary?.existing_performer_portrait === 'images/uc-154-portrait.jpg' && manifest.still_boundary?.existing_performer_portrait_must_remain_unchanged === true, 'UC-154 source still boundary drift');
  assert(manifest.exact_still_record?.sha256 === control.expected.exact_still_record.sha256, 'UC-154 source exact-still receipt drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.candidate?.bytes === control.expected.candidate.bytes && manifest.candidate?.width === 1260 && manifest.candidate?.height === 1000, 'UC-154 source candidate receipt drift');
  assert(manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256 && manifest.crop_preview?.bytes === control.expected.crop_preview.bytes && manifest.crop_preview?.width === 1246 && manifest.crop_preview?.height === 1000, 'UC-154 source crop receipt drift');
  assert(review.source_sha256 === control.expected.selected_source.sha256 && review.exact_still_record_sha256 === control.expected.exact_still_record.sha256, 'UC-154 source review source receipt drift');
  assert(review.candidate_sha256 === control.expected.candidate.sha256 && review.crop_preview_sha256 === control.expected.crop_preview.sha256, 'UC-154 source review candidate drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.mixed_gallery_ruling === control.ruling.mixed_gallery_ruling && review.portrait_separation_ruling === control.ruling.portrait_separation_ruling && review.canonical_mutation === false, 'UC-154 source review ruling drift');
  assert(still.record_id === 'UC-154' && still.actor === 'Tyler Mane' && still.character === 'Michael Myers' && still.production === 'Halloween (2007)' && still.selected_frame?.selected_image_sha256 === control.expected.selected_source.sha256, 'UC-154 exact still identity drift');
  assert(still.chronology_boundary?.selected_frame_production === 'Halloween (2007)' && still.chronology_boundary?.halloween_ii_2009_substitute_forbidden === true && still.still_boundary?.mixed_gallery_inventory_forbidden === true && still.still_boundary?.existing_performer_portrait === 'images/uc-154-portrait.jpg' && still.canonical_mutation === false, 'UC-154 exact still boundary drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && (duplicates.items || []).length === 3 && duplicates.items.every(item => Array.isArray(item.matches) && item.matches.length === 0), 'UC-154 source duplicate boundary drift');
  return { manifest, review, still, duplicates };
}
