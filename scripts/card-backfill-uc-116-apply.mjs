#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-116-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-116';
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
  'granny-original.webp',
  'manifest.json',
  'natasha-original.webp',
  'review.json',
  'review.md',
  'rocky-original.webp',
  'source-page-granny.png',
  'source-page-natasha.png',
  'source-page-rocky.png',
  'source-page-television-academy-june-foray.png',
  'source-wikitext-granny.txt',
  'source-wikitext-natasha.txt',
  'source-wikitext-rocky.txt',
  'uc-116-still-candidate.jpg'
];

async function loadControl() {
  const control = await readJson(CONTROL);
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-116', 'UC-116 apply scope drift');
  assert(control.actor === 'June Foray' && control.character === 'Rocky, Natasha & Granny' && control.production === 'Rocky & Bullwinkle / Looney Tunes' && control.year === 1959 && control.side === 'still' && control.reviewed_role === 'second-desk', 'UC-116 apply authority drift');
  assert(control.render_artifact?.artifact_id === 8678505225 && control.render_artifact?.head_sha === '8ef2ff1b0c69761fefe288d42ba3c0378d933485', 'UC-116 render custody drift');
  const hashKeys = [
    'source_manifest_sha256','source_duplicate_scan_sha256','source_review_json_sha256','source_review_md_sha256','source_sums_sha256','exact_role_record_sha256',
    'rocky_source_sha256','natasha_source_sha256','granny_source_sha256','actor_role_page_sha256','rocky_page_sha256','natasha_page_sha256','granny_page_sha256',
    'rocky_wikitext_sha256','natasha_wikitext_sha256','granny_wikitext_sha256','candidate_sha256','crop_preview_sha256'
  ];
  for (const key of hashKeys) assert(/^[0-9a-f]{64}$/.test(control.expected?.[key] || ''), `missing expected ${key}`);
  assert(control.expected?.packet_file_count === 18 && control.expected?.duplicate_item_count === 5 && control.expected?.duplicate_repository_hash_count === 2070, 'UC-116 packet denominator drift');
  assert(control.expected?.selected_asset_count === 3 && control.expected?.historical_floor_exception_count === 2 && control.expected?.failed_discovery_count === 3 && control.expected?.failed_render_count === 1, 'UC-116 evidence denominator drift');
  assert(control.ruling?.identity === 'expected-subjects' && control.ruling?.presentation === 'three-role-character-composite' && control.ruling?.crop_ruling === 'pass-three-panel-face-and-body-layout' && control.ruling?.floor_exception_ruling === 'pass-two-explicit-historical-width-exceptions' && control.ruling?.canonical_mutation === false, 'UC-116 apply ruling drift');
  return control;
}
async function verifyFile(name, expected = {}) {
  const row = await receipt(join(SOURCE_ROOT, name));
  if (expected.sha256) assert(row.sha256 === expected.sha256, `${name} source hash drift`);
  if (expected.mime) assert(row.mime === expected.mime, `${name} source MIME drift`);
  if (expected.bytes !== undefined) assert(row.bytes === expected.bytes, `${name} source byte drift`);
  return row;
}
function expectedRole(control, key) {
  const prefix = `${key}_source`;
  return {
    sha256: control.expected[`${prefix}_sha256`],
    mime: control.expected[`${prefix}_mime`],
    bytes: control.expected[`${prefix}_bytes`],
    width: control.expected[`${prefix}_width`],
    height: control.expected[`${prefix}_height`]
  };
}
async function verifySourcePacket(control) {
  assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
  const names = (await readdir(SOURCE_ROOT)).sort();
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-116 source packet file set drift: ${names.join(', ')}`);
  await verifyFile('manifest.json', { sha256: control.expected.source_manifest_sha256 });
  await verifyFile('duplicate-scan.json', { sha256: control.expected.source_duplicate_scan_sha256 });
  await verifyFile('review.json', { sha256: control.expected.source_review_json_sha256 });
  await verifyFile('review.md', { sha256: control.expected.source_review_md_sha256 });
  await verifyFile('SHA256SUMS', { sha256: control.expected.source_sums_sha256 });
  await verifyFile('exact-role-record.json', { sha256: control.expected.exact_role_record_sha256, bytes: control.expected.exact_role_record_bytes });
  for (const key of ['rocky','natasha','granny']) {
    const expected = expectedRole(control, key);
    await verifyFile(`${key}-original.webp`, { sha256: expected.sha256, mime: expected.mime, bytes: expected.bytes });
    await verifyFile(`source-page-${key}.png`, { sha256: control.expected[`${key}_page_sha256`], mime: 'image/png', bytes: control.expected[`${key}_page_bytes`] });
    await verifyFile(`source-wikitext-${key}.txt`, { sha256: control.expected[`${key}_wikitext_sha256`], bytes: control.expected[`${key}_wikitext_bytes`] });
  }
  await verifyFile('source-page-television-academy-june-foray.png', { sha256: control.expected.actor_role_page_sha256, mime: 'image/png', bytes: control.expected.actor_role_page_bytes });
  await verifyFile('uc-116-still-candidate.jpg', { sha256: control.expected.candidate_sha256, mime: control.expected.candidate_mime, bytes: control.expected.candidate_bytes });
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
  assert(manifest.record_id === 'UC-116' && manifest.actor === 'June Foray' && manifest.character === 'Rocky, Natasha & Granny' && manifest.production === 'Rocky & Bullwinkle / Looney Tunes' && manifest.year === 1959 && manifest.side === 'still', 'source manifest identity drift');
  assert(manifest.custody?.failed_discovery_checkpoints?.length === control.expected.failed_discovery_count && manifest.custody?.failed_render_checkpoints?.length === control.expected.failed_render_count, 'source failed-checkpoint custody drift');
  assert(manifest.custody.failed_render_checkpoints[0]?.artifact_id === 8678436132 && manifest.custody.failed_render_checkpoints[0]?.artifact_digest_sha256 === 'dfeaef6636a670d8136ca365d1f5cec36cdf87e14b771b9435ad659c498758df', 'source failed render receipt drift');
  assert(manifest.actor_role_custody?.page_screenshot?.sha256 === control.expected.actor_role_page_sha256, 'source actor-role receipt drift');
  for (const key of ['rocky','natasha','granny']) {
    const expected = expectedRole(control, key);
    const row = manifest.roles?.[key];
    assert(row?.original?.sha256 === expected.sha256 && row.original.bytes === expected.bytes && row.original.width === expected.width && row.original.height === expected.height, `${key} source manifest drift`);
    assert(row.page_screenshot?.sha256 === control.expected[`${key}_page_sha256`] && row.retained_wikitext?.sha256 === control.expected[`${key}_wikitext_sha256`], `${key} page or wikitext drift`);
  }
  assert(manifest.roles.natasha.generic_width_floor_exception === true && manifest.roles.granny.generic_width_floor_exception === true && manifest.roles.rocky.generic_width_floor_exception === false, 'source floor exception drift');
  assert(manifest.exact_role_record?.sha256 === control.expected.exact_role_record_sha256, 'source exact-role receipt drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate_sha256 && manifest.candidate?.bytes === control.expected.candidate_bytes && manifest.candidate?.width === control.expected.candidate_width && manifest.candidate?.height === control.expected.candidate_height, 'source candidate receipt drift');
  assert(manifest.crop_preview?.sha256 === control.expected.crop_preview_sha256 && manifest.crop_preview?.bytes === control.expected.crop_preview_bytes && manifest.crop_preview?.width === control.expected.crop_width && manifest.crop_preview?.height === control.expected.crop_height, 'source crop receipt drift');
  assert(review.source_sha256s?.rocky === control.expected.rocky_source_sha256 && review.source_sha256s?.natasha === control.expected.natasha_source_sha256 && review.source_sha256s?.granny === control.expected.granny_source_sha256, 'source review role receipt drift');
  assert(review.exact_role_record_sha256 === control.expected.exact_role_record_sha256 && review.candidate_sha256 === control.expected.candidate_sha256 && review.crop_preview_sha256 === control.expected.crop_preview_sha256, 'source review candidate drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.floor_exception_ruling === control.ruling.floor_exception_ruling && review.canonical_mutation === false, 'source review ruling drift');
  assert(role.record_id === 'UC-116' && role.actor === 'June Foray' && role.character === 'Rocky, Natasha & Granny' && role.year === 1959, 'exact role record identity drift');
  assert(role.composite_boundary?.all_three_roles_required === true && role.composite_boundary?.selected_asset_count === 3 && role.composite_boundary?.selected_assets_byte_distinct === true && role.composite_boundary?.single_role_or_two_role_candidate_forbidden === true, 'exact role composite boundary drift');
  assert(role.roles?.natasha?.generic_width_floor_exception === true && role.roles?.granny?.generic_width_floor_exception === true && role.roles?.rocky?.generic_width_floor_exception === false && role.canonical_mutation === false, 'exact role floor boundary drift');
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
    exact_subject_review: { identity: control.ruling.identity, presentation: control.ruling.presentation, crop_ruling: control.ruling.crop_ruling, floor_exception_ruling: control.ruling.floor_exception_ruling, notes: control.ruling.notes },
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
    floor_exception_ruling: control.ruling.floor_exception_ruling,
    canonical_mutation: false,
    disposition: control.ruling.candidate_disposition,
    notes: control.ruling.notes
  };
  await writeJson(join(DEST, 'review.json'), review);

  const repository = await repositoryHashes();
  const repositoryCount = process.env.REPOSITORY_HASH_COUNT_OVERRIDE ? Number(process.env.REPOSITORY_HASH_COUNT_OVERRIDE) : repository.size;
  assert(repositoryCount === control.expected.duplicate_repository_hash_count, `repository hash denominator drift ${repositoryCount}`);
  for (const hash of [control.expected.rocky_source_sha256, control.expected.natasha_source_sha256, control.expected.granny_source_sha256, control.expected.candidate_sha256, control.expected.crop_preview_sha256]) {
    assert(!(repository.get(hash) || []).length, `authorized evidence duplicates canonical media: ${(repository.get(hash) || []).join(', ')}`);
  }
  const sums = [];
  for (const file of expectedFiles.filter(name => name !== 'SHA256SUMS')) sums.push(`${sha(await readFile(join(DEST, file)))}  ${file}`);
  await writeFile(join(DEST, 'SHA256SUMS'), sums.join('\n') + '\n');
  await validate();
  console.log(`MATERIALIZED ${DEST}: ${expectedFiles.length} reviewed evidence files`);
  console.log(`candidate ${control.expected.candidate_sha256}`);
  console.log(`crop ${control.expected.crop_preview_sha256}`);
  console.log('three-role composite and two historical width exceptions preserved');
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
  assert(manifest.record_id === 'UC-116' && manifest.actor === 'June Foray' && manifest.character === 'Rocky, Natasha & Granny' && manifest.production === 'Rocky & Bullwinkle / Looney Tunes' && manifest.year === 1959 && manifest.side === 'still', 'permanent manifest identity drift');
  assert(manifest.custody?.render_artifact?.artifact_id === control.render_artifact.artifact_id && manifest.custody?.render_artifact?.zip_sha256 === control.render_artifact.zip_sha256, 'permanent render custody drift');
  assert(manifest.custody?.apply_control_sha256 === sha(await readFile(CONTROL)), 'permanent apply control receipt drift');
  assert(manifest.custody?.source_manifest_sha256 === control.expected.source_manifest_sha256 && manifest.custody?.source_sums_sha256 === control.expected.source_sums_sha256, 'permanent source custody drift');
  assert(manifest.custody?.failed_discovery_checkpoints?.length === 3 && manifest.custody?.failed_render_checkpoints?.length === 1, 'permanent failed checkpoint custody drift');
  assert(manifest.actor_role_custody?.page_screenshot?.sha256 === control.expected.actor_role_page_sha256, 'permanent actor-role receipt drift');
  assert(manifest.roles?.rocky?.original?.sha256 === control.expected.rocky_source_sha256 && manifest.roles?.natasha?.original?.sha256 === control.expected.natasha_source_sha256 && manifest.roles?.granny?.original?.sha256 === control.expected.granny_source_sha256, 'permanent selected role source drift');
  assert(manifest.roles.rocky.generic_width_floor_exception === false && manifest.roles.natasha.generic_width_floor_exception === true && manifest.roles.granny.generic_width_floor_exception === true, 'permanent floor exception drift');
  assert(manifest.exact_role_record?.sha256 === control.expected.exact_role_record_sha256, 'permanent exact role receipt drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate_sha256 && manifest.crop_preview?.sha256 === control.expected.crop_preview_sha256, 'permanent candidate drift');
  assert(manifest.exact_subject_review?.identity === control.ruling.identity && manifest.exact_subject_review?.presentation === control.ruling.presentation && manifest.exact_subject_review?.crop_ruling === control.ruling.crop_ruling && manifest.exact_subject_review?.floor_exception_ruling === control.ruling.floor_exception_ruling && manifest.canonical_mutation === false, 'permanent review boundary drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.floor_exception_ruling === control.ruling.floor_exception_ruling && review.canonical_mutation === false, 'permanent review drift');
  assert(role.composite_boundary?.all_three_roles_required === true && role.composite_boundary?.selected_asset_count === 3 && role.composite_boundary?.selected_assets_byte_distinct === true && role.composite_boundary?.single_role_or_two_role_candidate_forbidden === true && role.canonical_mutation === false, 'permanent exact-role composite drift');
  assert(role.roles?.natasha?.generic_width_floor_exception === true && role.roles?.granny?.generic_width_floor_exception === true && role.roles?.rocky?.generic_width_floor_exception === false, 'permanent exact-role floor drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && duplicates.items.length === 5 && duplicates.items.every(item => item.matches.length === 0), 'permanent duplicate boundary drift');
  console.log(`VALIDATED ${DEST}`);
  console.log(`manifest ${sha(await readFile(join(DEST, 'manifest.json')))}`);
  console.log(`sums ${sha(await readFile(join(DEST, 'SHA256SUMS')))}`);
}

if (command === 'materialize') await materialize();
else if (command === 'validate') await validate();
else throw new Error(`unknown command ${command}`);
