#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = '.github/CARD-BACKFILL-UC-077-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = 'data/review/card-backfill/UC-077';
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
  'card-crop-preview.jpg',
  'duplicate-scan.json',
  'manifest.json',
  'monster-original.jpg',
  'review.json',
  'review.md',
  'source-page-los-angeles-times.png',
  'uc-077-still-candidate.jpg'
];

async function loadControl() {
  const control = await readJson(CONTROL);
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-077', 'UC-077 apply scope drift');
  assert(control.actor === 'Peter Boyle' && control.character === 'The Monster' && control.side === 'still' && control.reviewed_role === 'second-desk', 'UC-077 apply authority drift');
  assert(control.render_artifact?.artifact_id === 8643063266 && control.render_artifact?.head_sha === '0e59796f6f3c126142d3a702a047dab13ad91b3d', 'UC-077 render custody drift');
  for (const key of [
    'original_sha256',
    'candidate_sha256',
    'crop_preview_sha256',
    'page_sha256',
    'source_manifest_sha256',
    'source_duplicate_scan_sha256',
    'source_review_json_sha256',
    'source_review_md_sha256',
    'source_sums_sha256'
  ]) assert(/^[0-9a-f]{64}$/.test(control.expected?.[key] || ''), `missing expected ${key}`);
  assert(control.ruling?.identity === 'expected-subject' && control.ruling?.presentation === 'character-depiction' && control.ruling?.crop_ruling === 'pass-single-role-center-crop' && control.ruling?.canonical_mutation === false, 'UC-077 apply ruling drift');
  return control;
}

async function materialize() {
  assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
  const control = await loadControl();
  const sourceFiles = {
    manifest: 'manifest.json',
    duplicates: 'duplicate-scan.json',
    review: 'review.json',
    reviewMd: 'review.md',
    sums: 'SHA256SUMS',
    original: 'monster-original.jpg',
    candidate: 'uc-077-still-candidate.jpg',
    crop: 'card-crop-preview.jpg',
    page: 'source-page-los-angeles-times.png'
  };
  const meta = {};
  for (const [name, file] of Object.entries(sourceFiles)) meta[name] = await receipt(join(SOURCE_ROOT, file));

  assert(meta.manifest.sha256 === control.expected.source_manifest_sha256, 'source manifest custody drift');
  assert(meta.duplicates.sha256 === control.expected.source_duplicate_scan_sha256, 'source duplicate receipt custody drift');
  assert(meta.review.sha256 === control.expected.source_review_json_sha256, 'source review JSON custody drift');
  assert(meta.reviewMd.sha256 === control.expected.source_review_md_sha256, 'source review Markdown custody drift');
  assert(meta.sums.sha256 === control.expected.source_sums_sha256, 'source checksum receipt custody drift');
  assert(meta.original.sha256 === control.expected.original_sha256 && meta.original.mime === control.expected.original_mime && meta.original.bytes === control.expected.original_bytes, 'Monster original custody drift');
  assert(meta.candidate.sha256 === control.expected.candidate_sha256 && meta.candidate.mime === control.expected.candidate_mime && meta.candidate.bytes === control.expected.candidate_bytes, 'candidate custody drift');
  assert(meta.crop.sha256 === control.expected.crop_preview_sha256 && meta.crop.mime === control.expected.crop_preview_mime && meta.crop.bytes === control.expected.crop_preview_bytes, 'crop custody drift');
  assert(meta.page.sha256 === control.expected.page_sha256 && meta.page.mime === control.expected.page_mime && meta.page.bytes === control.expected.page_bytes, 'source-page custody drift');

  const sourceManifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
  const sourceDuplicate = await readJson(join(SOURCE_ROOT, 'duplicate-scan.json'));
  const sourceReview = await readJson(join(SOURCE_ROOT, 'review.json'));
  assert(sourceManifest.record_id === 'UC-077' && sourceManifest.actor === 'Peter Boyle' && sourceManifest.character === 'The Monster' && sourceManifest.side === 'still', 'source manifest identity drift');
  assert(sourceManifest.source?.provider === 'Los Angeles Times', 'source provenance drift');
  assert(sourceManifest.original?.sha256 === control.expected.original_sha256 && sourceManifest.original?.width === control.expected.original_width && sourceManifest.original?.height === control.expected.original_height, 'source original receipt drift');
  assert(sourceManifest.candidate?.sha256 === control.expected.candidate_sha256 && sourceManifest.candidate?.width === control.expected.candidate_width && sourceManifest.candidate?.height === control.expected.candidate_height, 'source candidate receipt drift');
  assert(sourceManifest.crop_preview?.sha256 === control.expected.crop_preview_sha256 && sourceManifest.crop_preview?.width === control.expected.crop_width && sourceManifest.crop_preview?.height === control.expected.crop_height, 'source crop receipt drift');
  assert(sourceManifest.source?.page_evidence?.page_screenshot?.sha256 === control.expected.page_sha256, 'source page receipt drift');
  assert(sourceDuplicate.repository_hash_count === control.expected.duplicate_repository_hash_count && (sourceDuplicate.items || []).length === 3 && (sourceDuplicate.items || []).every(item => Array.isArray(item.matches) && item.matches.length === 0), 'source duplicate boundary drift');
  assert(sourceReview.identity_ruling === 'expected-subject' && sourceReview.presentation_ruling === 'character-depiction' && sourceReview.crop_ruling === 'pass-single-role-center-crop' && sourceReview.canonical_mutation === false, 'source review disposition drift');

  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });
  for (const file of ['monster-original.jpg', 'uc-077-still-candidate.jpg', 'card-crop-preview.jpg', 'source-page-los-angeles-times.png']) {
    await copyFile(join(SOURCE_ROOT, file), join(DEST, file));
  }

  const duplicateScan = {
    ...sourceDuplicate,
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    status: 'pass',
    semantics: 'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'
  };
  await writeJson(join(DEST, 'duplicate-scan.json'), duplicateScan);

  const manifest = {
    ...sourceManifest,
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    reviewed_role: control.reviewed_role,
    custody: {
      ...sourceManifest.custody,
      render_artifact: control.render_artifact,
      failed_render_checkpoints: control.failed_render_checkpoints,
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
    ...sourceReview,
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

  await writeFile(join(DEST, 'review.md'), `# UC-077 reviewed Peter Boyle Monster still candidate\n\n- **Record:** UC-077\n- **Performer:** Peter Boyle\n- **Displayed role:** The Monster\n- **Production:** Young Frankenstein (1974)\n- **Source:** [Los Angeles Times](${manifest.source.source_page})\n- **Source bytes:** \`${control.expected.original_sha256}\`\n- **Candidate:** \`${control.expected.candidate_sha256}\`\n- **Wall-crop preview:** \`${control.expected.crop_preview_sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass, single-role center crop\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${control.ruling.notes.map(note => `- ${note}`).join('\n')}\n\nThe exact source bytes, source-page screenshot, deterministic candidate, wall simulation, and duplicate receipt remain evidence-only pending independent canonical acceptance.\n`);

  const repository = await repositoryHashes();
  assert(repository.size === control.expected.duplicate_repository_hash_count, `repository hash denominator drift ${repository.size}`);
  for (const hash of [control.expected.original_sha256, control.expected.candidate_sha256, control.expected.crop_preview_sha256]) {
    assert(!(repository.get(hash) || []).length, `authorized evidence duplicates canonical media: ${(repository.get(hash) || []).join(', ')}`);
  }

  const sums = [];
  for (const file of expectedFiles.filter(name => name !== 'SHA256SUMS')) {
    const bytes = await readFile(join(DEST, file));
    sums.push(`${sha(bytes)}  ${file}`);
  }
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
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-077 evidence file set drift: ${names.join(', ')}`);
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
  assert(manifest.record_id === 'UC-077' && manifest.actor === 'Peter Boyle' && manifest.candidate?.sha256 === control.expected.candidate_sha256 && review.candidate_sha256 === control.expected.candidate_sha256, 'candidate receipt drift');
  assert(manifest.original?.sha256 === control.expected.original_sha256, 'original receipt drift');
  assert(manifest.crop_preview?.sha256 === control.expected.crop_preview_sha256 && review.crop_preview_sha256 === control.expected.crop_preview_sha256, 'crop receipt drift');
  assert(manifest.source?.provider === 'Los Angeles Times' && manifest.source?.page_evidence?.page_screenshot?.sha256 === control.expected.page_sha256, 'source receipt drift');
  assert(manifest.custody?.render_artifact?.artifact_id === control.render_artifact.artifact_id && manifest.custody?.source_manifest_sha256 === control.expected.source_manifest_sha256, 'custody receipt drift');
  assert(review.identity_ruling === 'expected-subject' && review.presentation_ruling === 'character-depiction' && review.crop_ruling === 'pass-single-role-center-crop' && review.canonical_mutation === false, 'review receipt drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && (duplicates.items || []).length === 3 && (duplicates.items || []).every(item => item.matches?.length === 0), 'duplicate receipt drift');
  assert((await receipt(join(DEST, 'monster-original.jpg'))).sha256 === control.expected.original_sha256, 'original bytes drift');
  assert((await receipt(join(DEST, 'uc-077-still-candidate.jpg'))).sha256 === control.expected.candidate_sha256, 'candidate bytes drift');
  assert((await receipt(join(DEST, 'card-crop-preview.jpg'))).sha256 === control.expected.crop_preview_sha256, 'crop bytes drift');
  assert((await receipt(join(DEST, 'source-page-los-angeles-times.png'))).sha256 === control.expected.page_sha256, 'source-page bytes drift');
  for (const file of names) assert((await stat(join(DEST, file))).isFile(), `${file} is not a regular file`);
  console.log(`VALID ${DEST}: exact reviewed Peter Boyle Monster evidence packet; no canonical mutation`);
}

if (command === 'materialize') await materialize();
else if (command === 'validate') await validate();
else throw new Error(`unknown command ${command}`);
