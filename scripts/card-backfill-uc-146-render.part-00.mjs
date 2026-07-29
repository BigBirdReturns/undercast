#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-146-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-146-render';
const PACKET = join(OUT, 'UC-146');
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); };
function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return 'unknown';
}
function identify(path) {
  const text = execFileSync(process.env.MAGICK_CMD || 'magick', ['identify', '-format', '%w %h', path], { encoding: 'utf8' }).trim();
  const [width, height] = text.split(/\s+/).map(Number);
  assert(width > 0 && height > 0, `cannot identify ${path}`);
  return { width, height };
}
function magick(...args) { execFileSync(process.env.MAGICK_CMD || 'magick', args, { stdio: 'inherit' }); }
async function walkImages(root, out = []) {
  let entries; try { entries = await readdir(root, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) { const path = join(root, entry.name); if (entry.isDirectory()) await walkImages(path, out); else if (/\.(?:jpe?g|png|webp)$/i.test(entry.name)) out.push(path); }
  return out;
}
async function repositoryHashes() {
  const map = new Map();
  try { const manifest = await readJson('data/media-manifest.json'); for (const [path, row] of Object.entries(manifest.assets || {})) { if (!/^[0-9a-f]{64}$/i.test(row?.sha256 || '')) continue; const list = map.get(row.sha256) || []; list.push(`manifest:${path}`); map.set(row.sha256, list); } } catch {}
  for (const path of await walkImages('images')) { try { const hash = sha(await readFile(path)); const list = map.get(hash) || []; list.push(`file:${path}`); map.set(hash, list); } catch {} }
  return map;
}
async function receipt(path, expected = {}) {
  const bytes = await readFile(path); const mime = signatureMime(bytes); const image = mime !== 'unknown';
  const row = { bytes: bytes.length, sha256: sha(bytes), mime, ...(image ? identify(path) : {}) };
  if (expected.sha256) assert(row.sha256 === expected.sha256, `${path} hash drift ${row.sha256}`);
  if (expected.mime) assert(row.mime === expected.mime, `${path} MIME drift ${row.mime}`);
  if (expected.bytes !== undefined) assert(row.bytes === expected.bytes, `${path} byte drift ${row.bytes}`);
  if (expected.width !== undefined) assert(row.width === expected.width, `${path} width drift ${row.width}`);
  if (expected.height !== undefined) assert(row.height === expected.height, `${path} height drift ${row.height}`);
  return row;
}
async function retain(inputRel, outputName, expected) { const output = join(PACKET, outputName); await copyFile(join(SOURCE_ROOT, inputRel), output); return { path: outputName, ...(await receipt(output, expected)) }; }

const control = await readJson(CONTROL);
assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-146', 'UC-146 render scope drift');
assert(control.actor === 'Tim Rose' && control.character === 'Admiral Ackbar / Salacious B. Crumb' && control.production === 'Return of the Jedi' && control.years === '1983–2019' && control.side === 'portrait', 'UC-146 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8709781190 && control.discovery_artifact?.head_sha === 'd3775ee17905027cb8acf763920bb40a68fef679' && control.discovery_artifact?.candidate_count === 2, 'UC-146 discovery custody drift');
assert(control.failed_discovery_checkpoints?.length === 2 && control.identity_custody?.length === 4, 'UC-146 render denominator drift');
assert(control.selected?.sha256 === '76ed05827a4175c0443b6b6aa1a031832a2ceabb43b2557e8e0f04aee485eefc' && control.alternative?.sha256 === '7d850403d4313f35ff0cf8e265ac480707a5c99b03671d667cd25f776a3d01a2', 'UC-146 selected portrait custody drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.wall_width === 1246 && control.render?.wall_height === 1000, 'UC-146 render geometry drift');
await mkdir(PACKET, { recursive: true });

const manifestReceipt = await receipt(join(SOURCE_ROOT, 'manifest.json'), { sha256: control.discovery_artifact.manifest_sha256 });
const summaryReceipt = await receipt(join(SOURCE_ROOT, 'summary.json'), { sha256: control.discovery_artifact.summary_sha256 });
const contactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet.jpg'), { sha256: control.discovery_artifact.contact_sheet_sha256, mime: 'image/jpeg', width: 1288, height: 644 });
const discoveryManifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
const discoverySummary = await readJson(join(SOURCE_ROOT, 'summary.json'));
assert(discoveryManifest.record_id === 'UC-146' && discoveryManifest.actor === 'Tim Rose' && discoveryManifest.side === 'portrait', 'UC-146 discovery manifest identity drift');
assert(discoveryManifest.candidate_count === 2 && discoveryManifest.failed_discovery_checkpoints?.length === 2, 'UC-146 discovery manifest denominator drift');
assert(discoverySummary.candidate_count === 2 && discoverySummary.failed_discovery_checkpoints?.length === 2, 'UC-146 discovery summary denominator drift');
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const identityRows = [];
for (const row of control.identity_custody) {
  const evidence = discoveryManifest.page_evidence?.[row.key];
  assert(evidence, `missing identity evidence ${row.key}`);
  if (row.reference_only === true) {
    assert(evidence.status === 'reference-only-external-verification' && evidence.externally_verified === true, `${row.key} reference-only custody drift`);
    identityRows.push({ control: row, evidence, screenshot: null });
    continue;
  }
  assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${row.key} strict transport drift`);
  assert(evidence.title === row.page_title && evidence.body_sha256 === row.body_sha256 && evidence.required_terms_missing.length === 0, `${row.key} strict page evidence drift`);
  const screenshot = await retain(row.artifact_path, row.output_path, { sha256: row.sha256, mime: 'image/png', bytes: row.bytes, width: row.width, height: row.height });
  identityRows.push({ control: row, evidence, screenshot });
}
const categoryEvidence = discoveryManifest.page_evidence?.['commons-category-timothy-m-rose'];
assert(categoryEvidence?.status === 'loaded' && categoryEvidence.http_status === 200 && categoryEvidence.title === control.commons_category.page_title && categoryEvidence.body_sha256 === control.commons_category.body_sha256, 'UC-146 Commons category evidence drift');
const categoryPage = await retain(control.commons_category.artifact_path, control.commons_category.output_path, { sha256: control.commons_category.sha256, mime: 'image/png', bytes: control.commons_category.bytes, width: control.commons_category.width, height: control.commons_category.height });

async function retainCandidate(spec, selected) {
  const candidate = (discoveryManifest.candidates || []).find(row => row.key === spec.key && row.sha256 === spec.sha256);
  assert(candidate, `${spec.key} discovery candidate missing`);
  assert(candidate.file_title === spec.file_title && candidate.source_page === spec.source_page && candidate.original_url === spec.original_url && candidate.local === spec.artifact_path, `${spec.key} candidate source custody drift`);
  assert(candidate.mime === spec.mime && candidate.bytes === spec.bytes && candidate.width === spec.width && candidate.height === spec.height && candidate.license_short_name === spec.license_short_name && Array.isArray(candidate.repository_matches) && candidate.repository_matches.length === 0, `${spec.key} candidate metadata drift`);
  assert(!(repository.get(spec.sha256) || []).length, `${spec.key} duplicates canonical media`);
  const apiEvidence = discoveryManifest.api_evidence?.[spec.key];
  assert(apiEvidence?.api_sha256 === spec.api_sha256 && apiEvidence?.file_title === spec.file_title && apiEvidence?.metadata_terms_missing?.length === 0 && apiEvidence?.license_short_name === spec.license_short_name, `${spec.key} API evidence drift`);
  const pageEvidence = discoveryManifest.page_evidence?.[`commons-${spec.key}`];
  assert(pageEvidence?.status === 'loaded' && pageEvidence.http_status === 200 && pageEvidence.title === spec.page_title && pageEvidence.body_sha256 === spec.page_body_sha256, `${spec.key} Commons page evidence drift`);
  const source = await retain(spec.artifact_path, spec.output_path, { sha256: spec.sha256, mime: spec.mime, bytes: spec.bytes, width: spec.width, height: spec.height });
  const api = await retain(spec.api_artifact_path, spec.api_output_path, { sha256: spec.api_sha256, bytes: spec.api_bytes });
  const page = await retain(spec.page_artifact_path, spec.page_output_path, { sha256: spec.page_sha256, mime: 'image/png', bytes: spec.page_bytes, width: spec.page_width, height: spec.page_height });
  return { spec, candidate, apiEvidence, pageEvidence, source, api, page, selected };
}
const selectedRow = await retainCandidate(control.selected, true);
const alternativeRow = await retainCandidate(control.alternative, false);
assert(selectedRow.source.sha256 !== alternativeRow.source.sha256, 'UC-146 portrait candidates are not byte-distinct');

const exactPortraitRecord = {
  version: 1,
  record_id: 'UC-146', actor: 'Tim Rose', character: 'Admiral Ackbar / Salacious B. Crumb', production: 'Return of the Jedi', years: '1983–2019', side: 'portrait', expected_subject: 'Tim Rose',
  portrait_boundary: {
    exact_untransformed_performer_portrait_required: true, other_people_named_tim_rose_forbidden: true,
    admiral_ackbar_or_salacious_crumb_character_image_forbidden: true, masked_or_costumed_character_substitute_forbidden: true,
    unlabeled_group_image_forbidden: true, caption_or_metadata_must_identify_tim_rose: true, face_must_be_independently_legible: true,
    existing_character_still: 'images/uc-146-still.jpg', existing_character_still_must_remain_unchanged: true
  },
  identity_bindings: Object.fromEntries(identityRows.map(({ control: row, evidence, screenshot }) => [row.key, {
    provider: row.provider, source_page: row.page_url, required_terms: row.required_terms, binding: row.binding,
    strict: row.strict === true, reference_only: row.reference_only === true, externally_verified: row.externally_verified === true,
    ...(screenshot ? { page_title: evidence.title, body_sha256: evidence.body_sha256, page_screenshot_sha256: screenshot.sha256 } : {})
  }])),
  commons_category: { source_page: control.commons_category.page_url, page_title: categoryEvidence.title, body_sha256: categoryEvidence.body_sha256, page_screenshot_sha256: categoryPage.sha256 },
  selected_portrait: {
    provider: control.selected.provider, file_title: control.selected.file_title, source_page: control.selected.source_page, original_url: control.selected.original_url,
    image: selectedRow.source, api_receipt: selectedRow.api, page_receipt: selectedRow.page,
    license_short_name: control.selected.license_short_name, artist: control.selected.artist, description: control.selected.description, selection_ruling: control.selected.selection_ruling
  },
  rejected_alternative: {
    provider: control.alternative.provider, file_title: control.alternative.file_title, source_page: control.alternative.source_page, original_url: control.alternative.original_url,
    image: alternativeRow.source, api_receipt: alternativeRow.api, page_receipt: alternativeRow.page,
    license_short_name: control.alternative.license_short_name, artist: control.alternative.artist, description: control.alternative.description, rejection_ruling: control.alternative.rejection_ruling
  },
  selected_and_alternative_byte_distinct: true,
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-portrait-record.json'), exactPortraitRecord);
const portraitRecordReceipt = await receipt(join(PACKET, 'exact-portrait-record.json'));
