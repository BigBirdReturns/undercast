#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-146-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-146';
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
  'exact-portrait-record.json',
  'manifest.json',
  'review.json',
  'review.md',
  'source-api-commons-celebration-europe-ii.json',
  'source-api-commons-phoenix-2016.json',
  'source-page-commons-category-timothy-m-rose.png',
  'source-page-commons-celebration-europe-ii.png',
  'source-page-commons-phoenix-2016.png',
  'source-page-mediamikes-tim-rose-interview.png',
  'source-page-wikipedia-tim-rose-actor.png',
  'tim-rose-alternative-celebration-europe-ii.jpg',
  'tim-rose-original.jpg',
  'uc-146-portrait-candidate.jpg'
];

async function loadControl() {
  const control = await readJson(CONTROL);
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-146', 'UC-146 apply scope drift');
  assert(control.actor === 'Tim Rose' && control.character === 'Admiral Ackbar / Salacious B. Crumb' && control.production === 'Return of the Jedi' && control.years === '1983–2019' && control.side === 'portrait' && control.reviewed_role === 'second-desk', 'UC-146 apply authority drift');
  assert(control.render_artifact?.artifact_id === 8709951246 && control.render_artifact?.head_sha === '33f3c003f836292abe29b82215ca7d1a7d0bf611' && control.render_artifact?.zip_sha256 === 'bfef5a56b443bfcbd3eb6350287b62f3f617a2fe1c5586d2ff53d7327ceee431', 'UC-146 render custody drift');
  assert(control.expected?.packet_file_count === 17 && control.expected?.duplicate_item_count === 4 && control.expected?.duplicate_repository_hash_count === 2070 && control.expected?.discovery_candidate_count === 2 && control.expected?.failed_discovery_checkpoint_count === 2 && control.expected?.strict_identity_page_count === 2 && control.expected?.reference_only_identity_page_count === 2, 'UC-146 packet denominator drift');
  assert(control.ruling?.identity === 'expected-person' && control.ruling?.presentation === 'untransformed-performer-portrait' && control.ruling?.crop_ruling === 'pass-centered-contain-portrait-layout' && control.ruling?.collision_ruling === 'pass-disambiguated-tim-rose-actor-identity' && control.ruling?.character_separation_ruling === 'pass-portrait-separated-from-existing-character-still' && control.ruling?.canonical_mutation === false, 'UC-146 ruling drift');
  return control;
}
async function verifyFile(name, expected = {}) {
  const row = await receipt(join(SOURCE_ROOT, name));
  if (expected.sha256) assert(row.sha256 === expected.sha256, `${name} source hash drift`);
  if (expected.mime) assert(row.mime === expected.mime, `${name} source MIME drift`);
  if (expected.bytes !== undefined) assert(row.bytes === expected.bytes, `${name} source byte drift`);
  return row;
}
function identityCounts(bindings) {
  const rows = Object.values(bindings || {});
  return {
    total: rows.length,
    strict: rows.filter(row => row.strict === true).length,
    reference_only: rows.filter(row => row.reference_only === true).length
  };
}
async function verifySourcePacket(control) {
  assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
  const names = (await readdir(SOURCE_ROOT)).sort();
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-146 source packet file set drift: ${names.join(', ')}`);
  const map = {
    'manifest.json': control.expected.source_manifest,
    'duplicate-scan.json': control.expected.source_duplicate_scan,
    'review.json': control.expected.source_review_json,
    'review.md': control.expected.source_review_md,
    'SHA256SUMS': control.expected.source_sums,
    'exact-portrait-record.json': control.expected.exact_portrait_record,
    'tim-rose-original.jpg': control.expected.selected_source,
    'tim-rose-alternative-celebration-europe-ii.jpg': control.expected.alternative_source,
    'source-api-commons-phoenix-2016.json': control.expected.selected_api,
    'source-api-commons-celebration-europe-ii.json': control.expected.alternative_api,
    'source-page-commons-category-timothy-m-rose.png': control.expected.commons_category_page,
    'source-page-commons-phoenix-2016.png': control.expected.selected_commons_page,
    'source-page-commons-celebration-europe-ii.png': control.expected.alternative_commons_page,
    'source-page-wikipedia-tim-rose-actor.png': control.expected.wikipedia_page,
    'source-page-mediamikes-tim-rose-interview.png': control.expected.mediamikes_page,
    'uc-146-portrait-candidate.jpg': control.expected.candidate,
    'card-crop-preview.jpg': control.expected.crop_preview
  };
  for (const [name, expected] of Object.entries(map)) await verifyFile(name, expected);

  const sums = String(await readFile(join(SOURCE_ROOT, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length === expectedFiles.length - 1, 'UC-146 source checksum row count drift');
  const sumNames = [];
  for (const line of sums) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match, `malformed UC-146 source checksum ${line}`);
    sumNames.push(match[2]);
    assert(sha(await readFile(join(SOURCE_ROOT, match[2]))) === match[1], `${match[2]} source checksum drift`);
  }
  assert(JSON.stringify(sumNames.sort()) === JSON.stringify(expectedFiles.filter(name => name !== 'SHA256SUMS').sort()), 'UC-146 source checksum filename set drift');

  const manifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
  const review = await readJson(join(SOURCE_ROOT, 'review.json'));
  const portrait = await readJson(join(SOURCE_ROOT, 'exact-portrait-record.json'));
  const duplicates = await readJson(join(SOURCE_ROOT, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-146' && manifest.actor === 'Tim Rose' && manifest.character === 'Admiral Ackbar / Salacious B. Crumb' && manifest.production === 'Return of the Jedi' && manifest.years === '1983–2019' && manifest.side === 'portrait' && manifest.expected_subject === 'Tim Rose', 'UC-146 source manifest identity drift');
  assert(manifest.custody?.discovery_artifact?.artifact_id === 8709781190 && manifest.custody?.discovery_artifact?.candidate_count === control.expected.discovery_candidate_count && manifest.custody?.failed_discovery_checkpoints?.length === control.expected.failed_discovery_checkpoint_count, 'UC-146 source discovery custody drift');
  const counts = identityCounts(manifest.identity_custody);
  assert(counts.total === 4 && counts.strict === control.expected.strict_identity_page_count && counts.reference_only === control.expected.reference_only_identity_page_count, 'UC-146 source identity denominator drift');
  assert(manifest.identity_custody?.['tim-rose-official']?.reference_only === true && manifest.identity_custody?.['power-of-the-force-tim-rose']?.reference_only === true, 'UC-146 source owner-page reference boundary drift');
  assert(manifest.identity_custody?.['wikipedia-tim-rose-actor']?.page_screenshot?.sha256 === control.expected.wikipedia_page.sha256 && manifest.identity_custody?.['mediamikes-tim-rose-interview']?.page_screenshot?.sha256 === control.expected.mediamikes_page.sha256, 'UC-146 source strict identity page drift');
  assert(manifest.commons_category?.page_screenshot?.sha256 === control.expected.commons_category_page.sha256, 'UC-146 Commons category custody drift');
  assert(manifest.selected_portrait?.original?.sha256 === control.expected.selected_source.sha256 && manifest.selected_portrait?.original?.width === control.expected.selected_source.width && manifest.selected_portrait?.original?.height === control.expected.selected_source.height && manifest.selected_portrait?.license_short_name === 'CC BY-SA 3.0', 'UC-146 source selected portrait drift');
  assert(manifest.selected_portrait?.api_receipt?.sha256 === control.expected.selected_api.sha256 && manifest.selected_portrait?.page_receipt?.sha256 === control.expected.selected_commons_page.sha256, 'UC-146 source selected metadata drift');
  assert(manifest.rejected_alternative?.original?.sha256 === control.expected.alternative_source.sha256 && manifest.rejected_alternative?.license_short_name === 'CC BY-SA 4.0', 'UC-146 source alternative portrait drift');
  assert(manifest.rejected_alternative?.api_receipt?.sha256 === control.expected.alternative_api.sha256 && manifest.rejected_alternative?.page_receipt?.sha256 === control.expected.alternative_commons_page.sha256, 'UC-146 source alternative metadata drift');
  assert(manifest.portrait_boundary?.exact_untransformed_performer_portrait_required === true && manifest.portrait_boundary?.other_people_named_tim_rose_forbidden === true && manifest.portrait_boundary?.existing_character_still === 'images/uc-146-still.jpg' && manifest.portrait_boundary?.existing_character_still_must_remain_unchanged === true, 'UC-146 source portrait boundary drift');
  assert(manifest.exact_portrait_record?.sha256 === control.expected.exact_portrait_record.sha256, 'UC-146 source exact-portrait receipt drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.candidate?.bytes === control.expected.candidate.bytes && manifest.candidate?.width === 1260 && manifest.candidate?.height === 1000, 'UC-146 source candidate receipt drift');
  assert(manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256 && manifest.crop_preview?.bytes === control.expected.crop_preview.bytes && manifest.crop_preview?.width === 1246 && manifest.crop_preview?.height === 1000, 'UC-146 source crop receipt drift');
  assert(review.source_sha256 === control.expected.selected_source.sha256 && review.rejected_alternative_sha256 === control.expected.alternative_source.sha256 && review.exact_portrait_record_sha256 === control.expected.exact_portrait_record.sha256, 'UC-146 source review source receipt drift');
  assert(review.candidate_sha256 === control.expected.candidate.sha256 && review.crop_preview_sha256 === control.expected.crop_preview.sha256, 'UC-146 source review candidate drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.collision_ruling === control.ruling.collision_ruling && review.character_separation_ruling === control.ruling.character_separation_ruling && review.canonical_mutation === false, 'UC-146 source review ruling drift');
  assert(portrait.record_id === 'UC-146' && portrait.actor === 'Tim Rose' && portrait.side === 'portrait' && portrait.expected_subject === 'Tim Rose', 'UC-146 exact portrait identity drift');
  assert(portrait.portrait_boundary?.exact_untransformed_performer_portrait_required === true && portrait.portrait_boundary?.other_people_named_tim_rose_forbidden === true && portrait.portrait_boundary?.admiral_ackbar_or_salacious_crumb_character_image_forbidden === true && portrait.portrait_boundary?.existing_character_still === 'images/uc-146-still.jpg' && portrait.portrait_boundary?.existing_character_still_must_remain_unchanged === true, 'UC-146 exact portrait boundary drift');
  assert(portrait.selected_portrait?.image?.sha256 === control.expected.selected_source.sha256 && portrait.rejected_alternative?.image?.sha256 === control.expected.alternative_source.sha256 && portrait.selected_and_alternative_byte_distinct === true && portrait.canonical_mutation === false, 'UC-146 exact portrait selection drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && (duplicates.items || []).length === 4 && duplicates.items.every(item => Array.isArray(item.matches) && item.matches.length === 0), 'UC-146 source duplicate boundary drift');
  return { manifest, review, portrait, duplicates };
}
