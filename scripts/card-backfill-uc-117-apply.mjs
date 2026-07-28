#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-117-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-117';
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
function trailingWhitespaceLines(text) {
  return text.split('\n').map((line, index) => line.replace(/\r$/, '').match(/[ \t]+$/) ? index + 1 : null).filter(Boolean);
}

const expectedFiles = [
  'SHA256SUMS',
  'card-crop-preview.jpg',
  'duplicate-scan.json',
  'exact-role-record.json',
  'manifest.json',
  'megatron-original.jpg',
  'review.json',
  'review.md',
  'scooby-original.webp',
  'source-page-cw-frank-welker-scooby.png',
  'source-page-frank-welker-official.png',
  'source-page-megatron.png',
  'source-page-scooby.png',
  'source-wikitext-megatron.txt',
  'source-wikitext-scooby.txt',
  'uc-117-still-candidate.jpg'
];

async function loadControl() {
  const control = await readJson(CONTROL);
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-117', 'UC-117 apply scope drift');
  assert(control.actor === 'Frank Welker' && control.character === 'Megatron & Scooby-Doo' && control.production === 'Transformers / Scooby-Doo' && control.year === 1969 && control.side === 'still' && control.reviewed_role === 'second-desk', 'UC-117 apply authority drift');
  assert(control.render_artifact?.artifact_id === 8694458431 && control.render_artifact?.head_sha === '341386b3e4c6e1ce9a47c597585a431b1e86edd3' && control.render_artifact?.zip_sha256 === '516d5bbd1114345a471fa062853d29280075d9af6e35f6d1b1c660841ca2cd68', 'UC-117 render custody drift');
  assert(control.expected?.packet_file_count === 16 && control.expected?.duplicate_item_count === 4 && control.expected?.duplicate_repository_hash_count === 2070 && control.expected?.selected_asset_count === 2 && control.expected?.failed_discovery_count === 11, 'UC-117 packet denominator drift');
  assert(control.ruling?.identity === 'expected-subjects' && control.ruling?.presentation === 'two-role-character-composite' && control.ruling?.crop_ruling === 'pass-two-panel-face-and-context-layout' && control.ruling?.chronology_ruling === 'pass-1969-franchise-origin-separated-from-2002-plus-welker-scooby-tenure' && control.ruling?.canonical_mutation === false, 'UC-117 ruling drift');
  const exception = control.immutable_source_exceptions?.['source-wikitext-megatron.txt'];
  assert(exception?.sha256 === control.expected.megatron_wikitext.sha256 && JSON.stringify(exception.trailing_whitespace_lines) === JSON.stringify([22,138,148,242,267,269,310,336,380,437,471,491]), 'UC-117 immutable source exception drift');
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
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-117 source packet file set drift: ${names.join(', ')}`);
  const map = {
    'manifest.json': control.expected.source_manifest,
    'duplicate-scan.json': control.expected.source_duplicate_scan,
    'review.json': control.expected.source_review_json,
    'review.md': control.expected.source_review_md,
    'SHA256SUMS': control.expected.source_sums,
    'exact-role-record.json': control.expected.exact_role_record,
    'megatron-original.jpg': control.expected.megatron_source,
    'scooby-original.webp': control.expected.scooby_source,
    'source-page-frank-welker-official.png': control.expected.frank_page,
    'source-page-cw-frank-welker-scooby.png': control.expected.cw_page,
    'source-page-megatron.png': control.expected.megatron_page,
    'source-page-scooby.png': control.expected.scooby_page,
    'source-wikitext-megatron.txt': control.expected.megatron_wikitext,
    'source-wikitext-scooby.txt': control.expected.scooby_wikitext,
    'uc-117-still-candidate.jpg': control.expected.candidate,
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
  assert(manifest.record_id === 'UC-117' && manifest.actor === 'Frank Welker' && manifest.character === 'Megatron & Scooby-Doo' && manifest.production === 'Transformers / Scooby-Doo' && manifest.year === 1969 && manifest.side === 'still', 'source manifest identity drift');
  assert(manifest.custody?.failed_discovery_checkpoints?.length === 11 && manifest.custody?.megatron_transport_probe?.probe_artifact?.artifact_id === 8692632509 && manifest.custody?.discovery_artifact?.artifact_id === 8693789087, 'source discovery custody drift');
  assert(manifest.actor_role_custody?.frank_welker_official?.page_screenshot?.sha256 === control.expected.frank_page.sha256 && manifest.actor_role_custody?.cw_scooby?.page_screenshot?.sha256 === control.expected.cw_page.sha256 && manifest.actor_role_custody?.hasbro_reference?.reference_only === true, 'source actor-role custody drift');
  assert(manifest.roles?.megatron?.original?.sha256 === control.expected.megatron_source.sha256 && manifest.roles?.megatron?.original_welker_signal === true && manifest.roles?.megatron?.source_mode === 'hash-pinned-probe-parse-live-imageinfo', 'source Megatron role drift');
  assert(manifest.roles?.scooby?.original?.sha256 === control.expected.scooby_source.sha256 && manifest.roles?.scooby?.welker_tenure_signal === true && manifest.identity_boundary?.canonical_year_semantics?.includes('franchise origin'), 'source Scooby role or chronology drift');
  assert(manifest.exact_role_record?.sha256 === control.expected.exact_role_record.sha256, 'source exact-role receipt drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.candidate?.bytes === control.expected.candidate.bytes && manifest.candidate?.width === 1260 && manifest.candidate?.height === 1000, 'source candidate receipt drift');
  assert(manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256 && manifest.crop_preview?.bytes === control.expected.crop_preview.bytes && manifest.crop_preview?.width === 1246 && manifest.crop_preview?.height === 1000, 'source crop receipt drift');
  assert(review.source_sha256s?.megatron === control.expected.megatron_source.sha256 && review.source_sha256s?.scooby === control.expected.scooby_source.sha256 && review.exact_role_record_sha256 === control.expected.exact_role_record.sha256, 'source review source receipt drift');
  assert(review.candidate_sha256 === control.expected.candidate.sha256 && review.crop_preview_sha256 === control.expected.crop_preview.sha256, 'source review candidate drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.canonical_mutation === false, 'source review ruling drift');
  assert(role.record_id === 'UC-117' && role.actor === 'Frank Welker' && role.character === 'Megatron & Scooby-Doo' && role.roles?.megatron?.selected_image?.sha256 === control.expected.megatron_source.sha256 && role.roles?.scooby?.selected_image?.sha256 === control.expected.scooby_source.sha256, 'exact role record drift');
  assert(role.composite_boundary?.both_roles_required === true && role.composite_boundary?.selected_asset_count === 2 && role.composite_boundary?.scooby_1969_franchise_origin_not_voice_start === true && role.canonical_mutation === false, 'exact role composite or chronology drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && (duplicates.items || []).length === 4 && duplicates.items.every(item => Array.isArray(item.matches) && item.matches.length === 0), 'source duplicate boundary drift');
  const megatronText = await readFile(join(SOURCE_ROOT, 'source-wikitext-megatron.txt'), 'utf8');
  assert(sha(Buffer.from(megatronText, 'utf8')) === control.expected.megatron_wikitext.sha256, 'source Megatron transcript hash drift');
  assert(JSON.stringify(trailingWhitespaceLines(megatronText)) === JSON.stringify(control.immutable_source_exceptions['source-wikitext-megatron.txt'].trailing_whitespace_lines), 'source Megatron transcript whitespace ledger drift');
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
  for (const hash of [control.expected.megatron_source.sha256, control.expected.scooby_source.sha256, control.expected.candidate.sha256, control.expected.crop_preview.sha256]) {
    assert(!(repository.get(hash) || []).length, `authorized evidence duplicates canonical media: ${(repository.get(hash) || []).join(', ')}`);
  }
  const sums = [];
  for (const file of expectedFiles.filter(name => name !== 'SHA256SUMS')) sums.push(`${sha(await readFile(join(DEST, file)))}  ${file}`);
  await writeFile(join(DEST, 'SHA256SUMS'), sums.join('\n') + '\n');
  await validate();
  console.log(`MATERIALIZED ${DEST}: ${expectedFiles.length} reviewed evidence files`);
  console.log(`candidate ${control.expected.candidate.sha256}`);
  console.log(`crop ${control.expected.crop_preview.sha256}`);
  console.log('both roles and 1969/2002 chronology boundary preserved');
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
  assert(manifest.record_id === 'UC-117' && manifest.actor === 'Frank Welker' && manifest.character === 'Megatron & Scooby-Doo' && manifest.production === 'Transformers / Scooby-Doo' && manifest.year === 1969 && manifest.side === 'still', 'permanent manifest identity drift');
  assert(manifest.custody?.render_artifact?.artifact_id === control.render_artifact.artifact_id && manifest.custody?.render_artifact?.zip_sha256 === control.render_artifact.zip_sha256, 'permanent render custody drift');
  assert(manifest.custody?.apply_control_sha256 === sha(await readFile(CONTROL)), 'permanent apply control receipt drift');
  assert(manifest.custody?.source_manifest_sha256 === control.expected.source_manifest.sha256 && manifest.custody?.source_sums_sha256 === control.expected.source_sums.sha256, 'permanent source custody drift');
  assert(manifest.roles?.megatron?.original?.sha256 === control.expected.megatron_source.sha256 && manifest.roles?.megatron?.original_welker_signal === true, 'permanent Megatron source drift');
  assert(manifest.roles?.scooby?.original?.sha256 === control.expected.scooby_source.sha256 && manifest.roles?.scooby?.welker_tenure_signal === true && manifest.identity_boundary?.canonical_year_semantics?.includes('franchise origin'), 'permanent Scooby source or chronology drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256, 'permanent candidate drift');
  assert(manifest.exact_subject_review?.identity === control.ruling.identity && manifest.exact_subject_review?.presentation === control.ruling.presentation && manifest.exact_subject_review?.crop_ruling === control.ruling.crop_ruling && manifest.exact_subject_review?.chronology_ruling === control.ruling.chronology_ruling && manifest.canonical_mutation === false, 'permanent review boundary drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.canonical_mutation === false, 'permanent review drift');
  assert(role.composite_boundary?.both_roles_required === true && role.composite_boundary?.selected_asset_count === 2 && role.composite_boundary?.selected_assets_byte_distinct === true && role.composite_boundary?.scooby_1969_franchise_origin_not_voice_start === true && role.canonical_mutation === false, 'permanent exact-role composite drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && duplicates.items.length === 4 && duplicates.items.every(item => item.matches.length === 0), 'permanent duplicate boundary drift');
  const megatronText = await readFile(join(DEST, 'source-wikitext-megatron.txt'), 'utf8');
  assert(sha(Buffer.from(megatronText, 'utf8')) === control.expected.megatron_wikitext.sha256, 'permanent Megatron transcript hash drift');
  assert(JSON.stringify(trailingWhitespaceLines(megatronText)) === JSON.stringify(control.immutable_source_exceptions['source-wikitext-megatron.txt'].trailing_whitespace_lines), 'permanent Megatron transcript whitespace ledger drift');
  console.log(`VALIDATED ${DEST}`);
  console.log(`manifest ${sha(await readFile(join(DEST, 'manifest.json')))}`);
  console.log(`sums ${sha(await readFile(join(DEST, 'SHA256SUMS')))}`);
}

if (command === 'materialize') await materialize();
else if (command === 'validate') await validate();
else throw new Error(`unknown command ${command}`);
