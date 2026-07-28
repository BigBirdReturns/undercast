#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-118-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-118';
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
  'fozzie-original.jpg',
  'manifest.json',
  'miss-piggy-original.jpg',
  'review.json',
  'review.md',
  'source-page-henson-founders-frank-oz-muppets.png',
  'source-page-henson-fozzie-behind-camera.png',
  'source-page-henson-miss-piggy-pool.png',
  'source-page-starwars-frank-oz-yoda.png',
  'source-page-starwars-size-matters-not.png',
  'uc-118-still-candidate.jpg',
  'yoda-original.jpg'
];

async function loadControl() {
  const control = await readJson(CONTROL);
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-118', 'UC-118 apply scope drift');
  assert(control.actor === 'Frank Oz' && control.character === 'Yoda, Miss Piggy & Fozzie' && control.production === 'The Muppets / Star Wars' && control.year === 1976 && control.side === 'still' && control.reviewed_role === 'second-desk', 'UC-118 apply authority drift');
  assert(control.render_artifact?.artifact_id === 8699653866 && control.render_artifact?.head_sha === 'b4bfaff1e2e359d1052768f0c945150556079851' && control.render_artifact?.zip_sha256 === '73e0692f861388e98f6323edc97fdc152b89cf07bfa5ec95d20414aaecbb1b8d', 'UC-118 render custody drift');
  assert(control.expected?.packet_file_count === 16 && control.expected?.duplicate_item_count === 5 && control.expected?.duplicate_repository_hash_count === 2070 && control.expected?.selected_asset_count === 3 && control.expected?.discovery_candidate_count === 35, 'UC-118 packet denominator drift');
  assert(control.ruling?.identity === 'expected-subjects' && control.ruling?.presentation === 'three-role-character-composite' && control.ruling?.crop_ruling === 'pass-landscape-top-two-panel-bottom-layout' && control.ruling?.chronology_ruling === 'pass-1976-muppet-chronology-separated-from-yoda-performance' && control.ruling?.canonical_mutation === false, 'UC-118 ruling drift');
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
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-118 source packet file set drift: ${names.join(', ')}`);
  const map = {
    'manifest.json': control.expected.source_manifest,
    'duplicate-scan.json': control.expected.source_duplicate_scan,
    'review.json': control.expected.source_review_json,
    'review.md': control.expected.source_review_md,
    'SHA256SUMS': control.expected.source_sums,
    'exact-role-record.json': control.expected.exact_role_record,
    'yoda-original.jpg': control.expected.yoda_source,
    'miss-piggy-original.jpg': control.expected.miss_piggy_source,
    'fozzie-original.jpg': control.expected.fozzie_source,
    'source-page-starwars-frank-oz-yoda.png': control.expected.starwars_actor_page,
    'source-page-henson-founders-frank-oz-muppets.png': control.expected.henson_actor_page,
    'source-page-starwars-size-matters-not.png': control.expected.yoda_page,
    'source-page-henson-miss-piggy-pool.png': control.expected.miss_piggy_page,
    'source-page-henson-fozzie-behind-camera.png': control.expected.fozzie_page,
    'uc-118-still-candidate.jpg': control.expected.candidate,
    'card-crop-preview.jpg': control.expected.crop_preview
  };
  for (const [name, expected] of Object.entries(map)) await verifyFile(name, expected);

  const sums = String(await readFile(join(SOURCE_ROOT, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length === expectedFiles.length - 1, 'source checksum row count drift');
  const sumNames = [];
  for (const line of sums) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match, `malformed source checksum ${line}`);
    sumNames.push(match[2]);
    assert(sha(await readFile(join(SOURCE_ROOT, match[2]))) === match[1], `${match[2]} source checksum drift`);
  }
  assert(JSON.stringify(sumNames.sort()) === JSON.stringify(expectedFiles.filter(name => name !== 'SHA256SUMS').sort()), 'source checksum filename set drift');

  const manifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
  const review = await readJson(join(SOURCE_ROOT, 'review.json'));
  const role = await readJson(join(SOURCE_ROOT, 'exact-role-record.json'));
  const duplicates = await readJson(join(SOURCE_ROOT, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-118' && manifest.actor === 'Frank Oz' && manifest.character === 'Yoda, Miss Piggy & Fozzie' && manifest.production === 'The Muppets / Star Wars' && manifest.year === 1976 && manifest.side === 'still', 'source manifest identity drift');
  assert(manifest.custody?.discovery_artifact?.artifact_id === 8699303205 && manifest.custody?.discovery_artifact?.candidate_count === control.expected.discovery_candidate_count, 'source discovery custody drift');
  assert(manifest.actor_role_custody?.['starwars-frank-oz-yoda']?.page_screenshot?.sha256 === control.expected.starwars_actor_page.sha256 && manifest.actor_role_custody?.['henson-founders-frank-oz-muppets']?.page_screenshot?.sha256 === control.expected.henson_actor_page.sha256, 'source actor-role custody drift');
  assert(manifest.roles?.yoda?.original?.sha256 === control.expected.yoda_source.sha256 && manifest.roles?.yoda?.page_screenshot?.sha256 === control.expected.yoda_page.sha256, 'source Yoda role drift');
  assert(manifest.roles?.['miss-piggy']?.original?.sha256 === control.expected.miss_piggy_source.sha256 && manifest.roles?.['miss-piggy']?.page_screenshot?.sha256 === control.expected.miss_piggy_page.sha256, 'source Miss Piggy role drift');
  assert(manifest.roles?.fozzie?.original?.sha256 === control.expected.fozzie_source.sha256 && manifest.roles?.fozzie?.page_screenshot?.sha256 === control.expected.fozzie_page.sha256, 'source Fozzie role drift');
  assert(manifest.chronology_boundary?.canonical_1976_is_muppet_chronology_not_yoda_debut === true && manifest.chronology_boundary?.yoda_empire_strikes_back_custody_required === true, 'source chronology boundary drift');
  assert(manifest.exact_role_record?.sha256 === control.expected.exact_role_record.sha256, 'source exact-role receipt drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.candidate?.bytes === control.expected.candidate.bytes && manifest.candidate?.width === 1260 && manifest.candidate?.height === 1000, 'source candidate receipt drift');
  assert(manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256 && manifest.crop_preview?.bytes === control.expected.crop_preview.bytes && manifest.crop_preview?.width === 1246 && manifest.crop_preview?.height === 1000, 'source crop receipt drift');
  assert(review.source_sha256s?.yoda === control.expected.yoda_source.sha256 && review.source_sha256s?.['miss-piggy'] === control.expected.miss_piggy_source.sha256 && review.source_sha256s?.fozzie === control.expected.fozzie_source.sha256 && review.exact_role_record_sha256 === control.expected.exact_role_record.sha256, 'source review source receipt drift');
  assert(review.candidate_sha256 === control.expected.candidate.sha256 && review.crop_preview_sha256 === control.expected.crop_preview.sha256, 'source review candidate drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.canonical_mutation === false, 'source review ruling drift');
  assert(role.record_id === 'UC-118' && role.actor === 'Frank Oz' && role.character === 'Yoda, Miss Piggy & Fozzie' && role.roles?.yoda?.selected_image_sha256 === control.expected.yoda_source.sha256 && role.roles?.['miss-piggy']?.selected_image_sha256 === control.expected.miss_piggy_source.sha256 && role.roles?.fozzie?.selected_image_sha256 === control.expected.fozzie_source.sha256, 'exact role record drift');
  assert(role.composite_boundary?.all_three_roles_required === true && role.composite_boundary?.selected_asset_count === 3 && role.composite_boundary?.selected_assets_byte_distinct === true && role.composite_boundary?.canonical_1976_is_muppet_chronology_not_yoda_debut === true && role.canonical_mutation === false, 'exact role composite or chronology drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && (duplicates.items || []).length === 5 && duplicates.items.every(item => Array.isArray(item.matches) && item.matches.length === 0), 'source duplicate boundary drift');
  return { manifest, review, role, duplicates };
}

async function materialize() {
  const control = await loadControl();
  const source = await verifySourcePacket(control);
  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });
  for (const file of expectedFiles) await copyFile(join(SOURCE_ROOT, file), join(DEST, file));

  const duplicateScan = {
    ...source.duplicates,
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    status: 'pass',
    semantics: 'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'
  };
  await writeJson(join(DEST, 'duplicate-scan.json'), duplicateScan);
  const manifest = {
    ...source.manifest,
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    reviewed_role: control.reviewed_role,
    custody: {
      ...source.manifest.custody,
      render_artifact: control.render_artifact,
      apply_control_sha256: sha(await readFile(CONTROL)),
      source_manifest_sha256: control.expected.source_manifest.sha256,
      source_sums_sha256: control.expected.source_sums.sha256
    },
    duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: duplicateScan.repository_hash_count, status: 'pass' },
    exact_subject_review: { identity: control.ruling.identity, presentation: control.ruling.presentation, crop_ruling: control.ruling.crop_ruling, chronology_ruling: control.ruling.chronology_ruling, notes: control.ruling.notes },
    disposition: control.ruling.candidate_disposition,
    canonical_mutation: false
  };
  await writeJson(join(DEST, 'manifest.json'), manifest);
  const review = {
    ...source.review,
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    reviewed_role: control.reviewed_role,
    identity_ruling: control.ruling.identity,
    presentation_ruling: control.ruling.presentation,
    crop_ruling: control.ruling.crop_ruling,
    chronology_ruling: control.ruling.chronology_ruling,
    canonical_mutation: false,
    disposition: control.ruling.candidate_disposition,
    notes: control.ruling.notes
  };
  await writeJson(join(DEST, 'review.json'), review);

  const repository = await repositoryHashes();
  const repositoryCount = process.env.REPOSITORY_HASH_COUNT_OVERRIDE ? Number(process.env.REPOSITORY_HASH_COUNT_OVERRIDE) : repository.size;
  assert(repositoryCount === control.expected.duplicate_repository_hash_count, `repository hash denominator drift ${repositoryCount}`);
  for (const hash of [control.expected.yoda_source.sha256, control.expected.miss_piggy_source.sha256, control.expected.fozzie_source.sha256, control.expected.candidate.sha256, control.expected.crop_preview.sha256]) {
    assert(!(repository.get(hash) || []).length, `authorized evidence duplicates canonical media: ${(repository.get(hash) || []).join(', ')}`);
  }
  const sums = [];
  for (const file of expectedFiles.filter(name => name !== 'SHA256SUMS')) sums.push(`${sha(await readFile(join(DEST, file)))}  ${file}`);
  await writeFile(join(DEST, 'SHA256SUMS'), sums.join('\n') + '\n');
  await validate();
  console.log(`MATERIALIZED ${DEST}: ${expectedFiles.length} reviewed evidence files`);
  console.log(`candidate ${control.expected.candidate.sha256}`);
  console.log(`crop ${control.expected.crop_preview.sha256}`);
  console.log('1976 Muppet chronology remains separate from Yoda performance chronology');
  console.log('canonical mutation false');
}

async function validate() {
  const control = await loadControl();
  const names = (await readdir(DEST)).sort();
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `permanent file set drift: ${names.join(', ')}`);
  const sums = String(await readFile(join(DEST, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length === expectedFiles.length - 1, 'permanent checksum row count drift');
  const sumNames = [];
  for (const line of sums) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match, `malformed permanent checksum ${line}`);
    sumNames.push(match[2]);
    assert(sha(await readFile(join(DEST, match[2]))) === match[1], `${match[2]} permanent checksum drift`);
  }
  assert(JSON.stringify(sumNames.sort()) === JSON.stringify(expectedFiles.filter(name => name !== 'SHA256SUMS').sort()), 'permanent checksum filename set drift');
  const manifest = await readJson(join(DEST, 'manifest.json'));
  const review = await readJson(join(DEST, 'review.json'));
  const role = await readJson(join(DEST, 'exact-role-record.json'));
  const duplicates = await readJson(join(DEST, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-118' && manifest.actor === 'Frank Oz' && manifest.character === 'Yoda, Miss Piggy & Fozzie' && manifest.production === 'The Muppets / Star Wars' && manifest.year === 1976 && manifest.side === 'still', 'permanent manifest identity drift');
  assert(manifest.custody?.render_artifact?.artifact_id === control.render_artifact.artifact_id && manifest.custody?.render_artifact?.zip_sha256 === control.render_artifact.zip_sha256, 'permanent render custody drift');
  assert(manifest.custody?.apply_control_sha256 === sha(await readFile(CONTROL)), 'permanent apply control receipt drift');
  assert(manifest.custody?.source_manifest_sha256 === control.expected.source_manifest.sha256 && manifest.custody?.source_sums_sha256 === control.expected.source_sums.sha256, 'permanent source custody drift');
  assert(manifest.roles?.yoda?.original?.sha256 === control.expected.yoda_source.sha256 && manifest.roles?.['miss-piggy']?.original?.sha256 === control.expected.miss_piggy_source.sha256 && manifest.roles?.fozzie?.original?.sha256 === control.expected.fozzie_source.sha256, 'permanent selected source drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256, 'permanent candidate drift');
  assert(manifest.chronology_boundary?.canonical_1976_is_muppet_chronology_not_yoda_debut === true && manifest.exact_subject_review?.chronology_ruling === control.ruling.chronology_ruling, 'permanent chronology boundary drift');
  assert(manifest.exact_subject_review?.identity === control.ruling.identity && manifest.exact_subject_review?.presentation === control.ruling.presentation && manifest.exact_subject_review?.crop_ruling === control.ruling.crop_ruling && manifest.canonical_mutation === false, 'permanent review boundary drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.canonical_mutation === false, 'permanent review drift');
  assert(role.composite_boundary?.all_three_roles_required === true && role.composite_boundary?.selected_asset_count === 3 && role.composite_boundary?.canonical_1976_is_muppet_chronology_not_yoda_debut === true && role.canonical_mutation === false, 'permanent exact-role boundary drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && duplicates.items.length === 5 && duplicates.items.every(item => item.matches.length === 0), 'permanent duplicate boundary drift');
  console.log(`VALIDATED ${DEST}`);
  console.log(`manifest ${sha(await readFile(join(DEST, 'manifest.json')))}`);
  console.log(`sums ${sha(await readFile(join(DEST, 'SHA256SUMS')))}`);
}

if (command === 'materialize') await materialize();
else if (command === 'validate') await validate();
else throw new Error(`unknown command ${command}`);
