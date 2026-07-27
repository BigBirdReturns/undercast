#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-079-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-079';
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(DEST, { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
};
function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
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
  'anna-pearl-klump-original.jpg',
  'card-crop-preview.jpg',
  'clarence-original.jpg',
  'cletus-klump-original.webp',
  'duplicate-scan.json',
  'ida-mae-jenson-original.webp',
  'manifest.json',
  'panel-anna-pearl-klump.jpg',
  'panel-clarence.jpg',
  'panel-cletus-klump.jpg',
  'panel-ida-mae-jenson.jpg',
  'panel-randy-watson.jpg',
  'panel-saul.jpg',
  'panel-sherman-klump.jpg',
  'randy-watson-original.jpg',
  'review.json',
  'review.md',
  'saul-composite-original.jpg',
  'saul-quadrant-original.jpg',
  'sherman-klump-original.jpg',
  'source-page-coming-clarence-saul.png',
  'source-page-coming-randy-watson.png',
  'source-page-nevsedoma-four-role.png',
  'source-page-nutty-anna-pearl-klump.png',
  'source-page-nutty-cletus-klump.png',
  'source-page-nutty-ida-mae-jenson.png',
  'source-page-nutty-sherman-klump.png',
  'uc-079-still-candidate.jpg'
];

function sameMap(a, b) {
  return JSON.stringify(Object.fromEntries(Object.entries(a || {}).sort())) === JSON.stringify(Object.fromEntries(Object.entries(b || {}).sort()));
}
async function loadControl() {
  const control = await readJson(CONTROL);
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-079', 'UC-079 apply scope drift');
  assert(control.actor === 'Eddie Murphy' && control.character === 'Barbershop crowd & Saul' && control.side === 'still' && control.reviewed_role === 'second-desk', 'UC-079 apply authority drift');
  assert(control.render_artifact?.artifact_id === 8668644443 && control.render_artifact?.head_sha === 'a18d9c29989941aa000cc2767f7572b503285abf', 'UC-079 render custody drift');
  for (const key of ['source_manifest_sha256','source_duplicate_scan_sha256','source_review_json_sha256','source_review_md_sha256','source_sums_sha256','candidate_sha256','crop_preview_sha256','saul_composite_sha256']) {
    assert(/^[0-9a-f]{64}$/.test(control.expected?.[key] || ''), `missing expected ${key}`);
  }
  assert(Object.keys(control.expected?.source_sha256_by_role || {}).length === 7, 'UC-079 source role denominator drift');
  assert(Object.keys(control.expected?.panel_sha256_by_role || {}).length === 7, 'UC-079 panel role denominator drift');
  assert(Object.keys(control.expected?.page_sha256_by_role || {}).length === 7, 'UC-079 page role denominator drift');
  assert(control.expected?.packet_file_count === 29 && control.expected?.duplicate_item_count === 17 && control.expected?.duplicate_repository_hash_count === 2070, 'UC-079 packet denominator drift');
  assert(control.ruling?.identity === 'expected-composite-subject' && control.ruling?.presentation === 'seven-role-character-depiction' && control.ruling?.crop_ruling === 'pass-seven-role-two-row-composite' && control.ruling?.canonical_mutation === false, 'UC-079 apply ruling drift');
  return control;
}
async function verifySourcePacket(control) {
  assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
  const names = (await readdir(SOURCE_ROOT)).sort();
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-079 source packet file set drift: ${names.join(', ')}`);
  const manifestReceipt = await receipt(join(SOURCE_ROOT, 'manifest.json'));
  const duplicateReceipt = await receipt(join(SOURCE_ROOT, 'duplicate-scan.json'));
  const reviewReceipt = await receipt(join(SOURCE_ROOT, 'review.json'));
  const reviewMdReceipt = await receipt(join(SOURCE_ROOT, 'review.md'));
  const sumsReceipt = await receipt(join(SOURCE_ROOT, 'SHA256SUMS'));
  assert(manifestReceipt.sha256 === control.expected.source_manifest_sha256, 'source manifest custody drift');
  assert(duplicateReceipt.sha256 === control.expected.source_duplicate_scan_sha256, 'source duplicate scan custody drift');
  assert(reviewReceipt.sha256 === control.expected.source_review_json_sha256, 'source review JSON custody drift');
  assert(reviewMdReceipt.sha256 === control.expected.source_review_md_sha256, 'source review Markdown custody drift');
  assert(sumsReceipt.sha256 === control.expected.source_sums_sha256, 'source checksum ledger custody drift');

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
  const duplicates = await readJson(join(SOURCE_ROOT, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-079' && manifest.actor === 'Eddie Murphy' && manifest.character === 'Barbershop crowd & Saul' && manifest.side === 'still', 'source manifest identity drift');
  assert(review.record_id === 'UC-079' && review.actor === 'Eddie Murphy' && review.character === 'Barbershop crowd & Saul' && review.side === 'still', 'source review identity drift');
  assert(sameMap(review.source_sha256_by_role, control.expected.source_sha256_by_role), 'source role hash map drift');
  assert(sameMap(review.panel_sha256_by_role, control.expected.panel_sha256_by_role), 'panel role hash map drift');
  const pageMap = Object.fromEntries(Object.entries(manifest.sources || {}).map(([key, row]) => [key, row.source_page_screenshot?.sha256]));
  assert(sameMap(pageMap, control.expected.page_sha256_by_role), 'source page hash map drift');
  assert(manifest.sources?.saul?.composite_original?.sha256 === control.expected.saul_composite_sha256, 'Saul source composite drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate_sha256 && manifest.candidate?.bytes === control.expected.candidate_bytes && manifest.candidate?.width === control.expected.candidate_width && manifest.candidate?.height === control.expected.candidate_height, 'source candidate receipt drift');
  assert(manifest.crop_preview?.sha256 === control.expected.crop_preview_sha256 && manifest.crop_preview?.bytes === control.expected.crop_preview_bytes && manifest.crop_preview?.width === control.expected.crop_width && manifest.crop_preview?.height === control.expected.crop_height, 'source crop receipt drift');
  assert(review.candidate_sha256 === control.expected.candidate_sha256 && review.crop_preview_sha256 === control.expected.crop_preview_sha256, 'source review candidate drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.canonical_mutation === false, 'source review ruling drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === control.expected.duplicate_repository_hash_count && (duplicates.items || []).length === control.expected.duplicate_item_count && duplicates.items.every(item => Array.isArray(item.matches) && item.matches.length === 0), 'source duplicate boundary drift');
  const candidateReceipt = await receipt(join(SOURCE_ROOT, 'uc-079-still-candidate.jpg'));
  const cropReceipt = await receipt(join(SOURCE_ROOT, 'card-crop-preview.jpg'));
  assert(candidateReceipt.sha256 === control.expected.candidate_sha256 && candidateReceipt.mime === control.expected.candidate_mime && candidateReceipt.bytes === control.expected.candidate_bytes, 'candidate bytes drift');
  assert(cropReceipt.sha256 === control.expected.crop_preview_sha256 && cropReceipt.mime === control.expected.crop_preview_mime && cropReceipt.bytes === control.expected.crop_preview_bytes, 'crop bytes drift');
  return { manifest, review, duplicates };
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
    duplicate_scan: {
      path: 'duplicate-scan.json',
      repository_hash_count: duplicateScan.repository_hash_count,
      status: 'pass'
    },
    exact_subject_review: {
      identity: control.ruling.identity,
      presentation: control.ruling.presentation,
      crop_ruling: control.ruling.crop_ruling,
      notes: control.ruling.notes
    },
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
    canonical_mutation: false,
    disposition: control.ruling.candidate_disposition,
    notes: control.ruling.notes
  };
  await writeJson(join(DEST, 'review.json'), review);

  const repository = await repositoryHashes();
  const repositoryCount = process.env.REPOSITORY_HASH_COUNT_OVERRIDE ? Number(process.env.REPOSITORY_HASH_COUNT_OVERRIDE) : repository.size;
  assert(repositoryCount === control.expected.duplicate_repository_hash_count, `repository hash denominator drift ${repositoryCount}`);
  for (const hash of [
    ...Object.values(control.expected.source_sha256_by_role),
    control.expected.saul_composite_sha256,
    ...Object.values(control.expected.panel_sha256_by_role),
    control.expected.candidate_sha256,
    control.expected.crop_preview_sha256
  ]) assert(!(repository.get(hash) || []).length, `authorized evidence duplicates canonical media: ${(repository.get(hash) || []).join(', ')}`);

  const sums = [];
  for (const file of expectedFiles.filter(name => name !== 'SHA256SUMS')) sums.push(`${sha(await readFile(join(DEST, file)))}  ${file}`);
  await writeFile(join(DEST, 'SHA256SUMS'), sums.join('\n') + '\n');
  await validate();
  console.log(`MATERIALIZED ${DEST}: ${expectedFiles.length} reviewed evidence files`);
  console.log(`candidate ${control.expected.candidate_sha256}`);
  console.log(`crop ${control.expected.crop_preview_sha256}`);
  console.log('canonical mutation false');
}
async function validate() {
  const control = await loadControl();
  const names = (await readdir(DEST)).sort();
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-079 evidence file set drift: ${names.join(', ')}`);
  const sums = String(await readFile(join(DEST, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length === expectedFiles.length - 1, 'SHA256SUMS row count drift');
  for (const line of sums) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match, `malformed checksum ${line}`);
    assert(sha(await readFile(join(DEST, match[2]))) === match[1], `${match[2]} checksum drift`);
  }
  const manifest = await readJson(join(DEST, 'manifest.json'));
  const review = await readJson(join(DEST, 'review.json'));
  const duplicates = await readJson(join(DEST, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-079' && manifest.actor === 'Eddie Murphy' && manifest.candidate?.sha256 === control.expected.candidate_sha256 && review.candidate_sha256 === control.expected.candidate_sha256, 'candidate receipt drift');
  assert(manifest.crop_preview?.sha256 === control.expected.crop_preview_sha256 && review.crop_preview_sha256 === control.expected.crop_preview_sha256, 'crop receipt drift');
  const sourceMap = Object.fromEntries(Object.entries(manifest.sources || {}).map(([key, row]) => [key, row.original?.sha256]));
  const panelMap = Object.fromEntries(Object.entries(manifest.panels || {}).map(([key, row]) => [key, row.sha256]));
  const pageMap = Object.fromEntries(Object.entries(manifest.sources || {}).map(([key, row]) => [key, row.source_page_screenshot?.sha256]));
  assert(sameMap(sourceMap, control.expected.source_sha256_by_role), 'permanent source role hash map drift');
  assert(sameMap(panelMap, control.expected.panel_sha256_by_role), 'permanent panel role hash map drift');
  assert(sameMap(pageMap, control.expected.page_sha256_by_role), 'permanent source page hash map drift');
  assert(manifest.sources?.saul?.composite_original?.sha256 === control.expected.saul_composite_sha256, 'permanent Saul composite drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.canonical_mutation === false, 'review receipt drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && (duplicates.items || []).length === 17 && duplicates.items.every(item => item.matches?.length === 0), 'duplicate receipt drift');
  assert((await receipt(join(DEST, 'uc-079-still-candidate.jpg'))).sha256 === control.expected.candidate_sha256, 'candidate bytes drift');
  assert((await receipt(join(DEST, 'card-crop-preview.jpg'))).sha256 === control.expected.crop_preview_sha256, 'crop bytes drift');
  for (const file of names) assert((await stat(join(DEST, file))).isFile(), `${file} is not a regular file`);
  console.log(`VALID ${DEST}: exact reviewed seven-role evidence packet; no canonical mutation`);
}

if (command === 'materialize') await materialize();
else if (command === 'validate') await validate();
else throw new Error(`unknown command ${command}`);
