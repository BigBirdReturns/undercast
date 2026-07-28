#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-107-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-107';
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
  'mandalorian-original.jpg',
  'manifest.json',
  'review.json',
  'review.md',
  'source-page-disney-plus-first-look.png',
  'source-page-lucasfilm-cast-announcement.png',
  'source-page-star-wars-celebration-2019.png',
  'uc-107-still-candidate.jpg'
];

async function loadControl() {
  const control = await readJson(CONTROL);
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-107', 'UC-107 apply scope drift');
  assert(control.actor === 'Pedro Pascal' && control.character === 'The Mandalorian' && control.production === 'The Mandalorian' && control.year === 2019 && control.side === 'still' && control.reviewed_role === 'second-desk', 'UC-107 apply authority drift');
  assert(control.render_artifact?.artifact_id === 8675463564 && control.render_artifact?.head_sha === '5e3225a76c04efa179119afb18bfdc21d862b86b', 'UC-107 render custody drift');
  for (const key of ['source_manifest_sha256','source_duplicate_scan_sha256','source_review_json_sha256','source_review_md_sha256','source_sums_sha256','exact_role_record_sha256','selected_source_sha256','frame_page_sha256','actor_page_sha256','launch_page_sha256','candidate_sha256','crop_preview_sha256']) {
    assert(/^[0-9a-f]{64}$/.test(control.expected?.[key] || ''), `missing expected ${key}`);
  }
  assert(control.expected?.packet_file_count === 12 && control.expected?.duplicate_item_count === 3 && control.expected?.duplicate_repository_hash_count === 2070, 'UC-107 packet denominator drift');
  assert(control.ruling?.identity === 'expected-subject' && control.ruling?.presentation === 'character-depiction' && control.ruling?.crop_ruling === 'pass-single-role-east-crop' && control.ruling?.embodiment_ruling === 'actor-role-bound-frame-occupant-not-asserted' && control.ruling?.canonical_mutation === false, 'UC-107 apply ruling drift');
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
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-107 source packet file set drift: ${names.join(', ')}`);
  await verifyFile('manifest.json', { sha256: control.expected.source_manifest_sha256 });
  await verifyFile('duplicate-scan.json', { sha256: control.expected.source_duplicate_scan_sha256 });
  await verifyFile('review.json', { sha256: control.expected.source_review_json_sha256 });
  await verifyFile('review.md', { sha256: control.expected.source_review_md_sha256 });
  await verifyFile('SHA256SUMS', { sha256: control.expected.source_sums_sha256 });
  await verifyFile('exact-role-record.json', { sha256: control.expected.exact_role_record_sha256, bytes: control.expected.exact_role_record_bytes });
  await verifyFile('mandalorian-original.jpg', { sha256: control.expected.selected_source_sha256, mime: control.expected.selected_source_mime, bytes: control.expected.selected_source_bytes });
  await verifyFile('source-page-disney-plus-first-look.png', { sha256: control.expected.frame_page_sha256, mime: 'image/png', bytes: control.expected.frame_page_bytes });
  await verifyFile('source-page-lucasfilm-cast-announcement.png', { sha256: control.expected.actor_page_sha256, mime: 'image/png', bytes: control.expected.actor_page_bytes });
  await verifyFile('source-page-star-wars-celebration-2019.png', { sha256: control.expected.launch_page_sha256, mime: 'image/png', bytes: control.expected.launch_page_bytes });
  await verifyFile('uc-107-still-candidate.jpg', { sha256: control.expected.candidate_sha256, mime: control.expected.candidate_mime, bytes: control.expected.candidate_bytes });
  await verifyFile('card-crop-preview.jpg', { sha256: control.expected.crop_preview_sha256, mime: control.expected.crop_preview_mime, bytes: control.expected.crop_preview_bytes });

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
  assert(manifest.record_id === 'UC-107' && manifest.actor === 'Pedro Pascal' && manifest.character === 'The Mandalorian' && manifest.production === 'The Mandalorian' && manifest.year === 2019 && manifest.side === 'still', 'source manifest identity drift');
  assert(manifest.selected_source?.original?.sha256 === control.expected.selected_source_sha256 && manifest.selected_source?.source_page_screenshot?.sha256 === control.expected.frame_page_sha256, 'source selection receipt drift');
  assert(manifest.role_custody?.record?.sha256 === control.expected.exact_role_record_sha256, 'source exact-role receipt drift');
  assert(manifest.role_custody?.actor_role?.page_screenshot?.sha256 === control.expected.actor_page_sha256, 'source actor-role receipt drift');
  assert(manifest.role_custody?.production_launch?.page_screenshot?.sha256 === control.expected.launch_page_sha256, 'source launch receipt drift');
  assert(manifest.role_custody?.embodiment_boundary?.frame_specific_physical_occupant === 'not asserted', 'source embodiment boundary drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate_sha256 && manifest.candidate?.bytes === control.expected.candidate_bytes && manifest.candidate?.width === control.expected.candidate_width && manifest.candidate?.height === control.expected.candidate_height, 'source candidate receipt drift');
  assert(manifest.crop_preview?.sha256 === control.expected.crop_preview_sha256 && manifest.crop_preview?.bytes === control.expected.crop_preview_bytes && manifest.crop_preview?.width === control.expected.crop_width && manifest.crop_preview?.height === control.expected.crop_height, 'source crop receipt drift');
  assert(review.source_sha256 === control.expected.selected_source_sha256 && review.exact_role_record_sha256 === control.expected.exact_role_record_sha256, 'source review source receipt drift');
  assert(review.candidate_sha256 === control.expected.candidate_sha256 && review.crop_preview_sha256 === control.expected.crop_preview_sha256, 'source review candidate drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.embodiment_ruling === control.ruling.embodiment_ruling && review.canonical_mutation === false, 'source review ruling drift');
  assert(role.record_id === 'UC-107' && role.actor === 'Pedro Pascal' && role.character === 'The Mandalorian' && role.production === 'The Mandalorian' && role.character_frame?.selected_image_sha256 === control.expected.selected_source_sha256 && role.embodiment_boundary?.frame_specific_physical_occupant === 'not asserted' && role.canonical_mutation === false, 'exact role record drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === control.expected.duplicate_repository_hash_count && (duplicates.items || []).length === control.expected.duplicate_item_count && duplicates.items.every(item => Array.isArray(item.matches) && item.matches.length === 0), 'source duplicate boundary drift');
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
      source_manifest_sha256: control.expected.source_manifest_sha256,
      source_sums_sha256: control.expected.source_sums_sha256
    },
    duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: duplicateScan.repository_hash_count, status: 'pass' },
    exact_subject_review: { identity: control.ruling.identity, presentation: control.ruling.presentation, crop_ruling: control.ruling.crop_ruling, embodiment_ruling: control.ruling.embodiment_ruling, notes: control.ruling.notes },
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
    embodiment_ruling: control.ruling.embodiment_ruling,
    canonical_mutation: false,
    disposition: control.ruling.candidate_disposition,
    notes: control.ruling.notes
  };
  await writeJson(join(DEST, 'review.json'), review);

  const repository = await repositoryHashes();
  const repositoryCount = process.env.REPOSITORY_HASH_COUNT_OVERRIDE ? Number(process.env.REPOSITORY_HASH_COUNT_OVERRIDE) : repository.size;
  assert(repositoryCount === control.expected.duplicate_repository_hash_count, `repository hash denominator drift ${repositoryCount}`);
  for (const hash of [control.expected.selected_source_sha256, control.expected.candidate_sha256, control.expected.crop_preview_sha256]) {
    assert(!(repository.get(hash) || []).length, `authorized evidence duplicates canonical media: ${(repository.get(hash) || []).join(', ')}`);
  }
  const sums = [];
  for (const file of expectedFiles.filter(name => name !== 'SHA256SUMS')) sums.push(`${sha(await readFile(join(DEST, file)))}  ${file}`);
  await writeFile(join(DEST, 'SHA256SUMS'), sums.join('\n') + '\n');
  await validate();
  console.log(`MATERIALIZED ${DEST}: ${expectedFiles.length} reviewed evidence files`);
  console.log(`candidate ${control.expected.candidate_sha256}`);
  console.log(`crop ${control.expected.crop_preview_sha256}`);
  console.log('frame occupant assertion none');
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
  assert(manifest.record_id === 'UC-107' && manifest.actor === 'Pedro Pascal' && manifest.character === 'The Mandalorian' && manifest.production === 'The Mandalorian' && manifest.year === 2019 && manifest.side === 'still', 'permanent manifest identity drift');
  assert(manifest.custody?.render_artifact?.artifact_id === control.render_artifact.artifact_id && manifest.custody?.render_artifact?.zip_sha256 === control.render_artifact.zip_sha256, 'permanent render custody drift');
  assert(manifest.custody?.apply_control_sha256 === sha(await readFile(CONTROL)), 'permanent apply control receipt drift');
  assert(manifest.custody?.source_manifest_sha256 === control.expected.source_manifest_sha256 && manifest.custody?.source_sums_sha256 === control.expected.source_sums_sha256, 'permanent source custody drift');
  assert(manifest.selected_source?.original?.sha256 === control.expected.selected_source_sha256, 'permanent selected source drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate_sha256 && manifest.crop_preview?.sha256 === control.expected.crop_preview_sha256, 'permanent candidate drift');
  assert(manifest.role_custody?.record?.sha256 === control.expected.exact_role_record_sha256 && manifest.role_custody?.embodiment_boundary?.frame_specific_physical_occupant === 'not asserted', 'permanent role or embodiment boundary drift');
  assert(manifest.exact_subject_review?.identity === control.ruling.identity && manifest.exact_subject_review?.presentation === control.ruling.presentation && manifest.exact_subject_review?.crop_ruling === control.ruling.crop_ruling && manifest.exact_subject_review?.embodiment_ruling === control.ruling.embodiment_ruling && manifest.canonical_mutation === false, 'permanent review boundary drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.embodiment_ruling === control.ruling.embodiment_ruling && review.canonical_mutation === false, 'permanent review drift');
  assert(role.embodiment_boundary?.frame_specific_physical_occupant === 'not asserted' && role.canonical_mutation === false, 'permanent exact-role boundary drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && duplicates.items.every(item => item.matches.length === 0), 'permanent duplicate boundary drift');
  console.log(`VALIDATED ${DEST}`);
  console.log(`manifest ${sha(await readFile(join(DEST, 'manifest.json')))}`);
  console.log(`sums ${sha(await readFile(join(DEST, 'SHA256SUMS')))}`);
}

if (command === 'materialize') await materialize();
else if (command === 'validate') await validate();
else throw new Error(`unknown command ${command}`);
