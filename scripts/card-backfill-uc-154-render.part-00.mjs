#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-154-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-154-render';
const PACKET = join(OUT, 'UC-154');
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
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-154', 'UC-154 render scope drift');
assert(control.actor === 'Tyler Mane' && control.character === 'Michael Myers' && control.production === 'Halloween (2007)' && control.years === '2007–2009' && control.side === 'still', 'UC-154 render identity drift');
assert(control.targeted_artifact?.artifact_id === 8711102405 && control.targeted_artifact?.head_sha === 'a85d2a15a4c3c7c132449069b2dc0510abd33700' && control.targeted_artifact?.candidate_count === 1, 'UC-154 targeted custody drift');
assert(control.failed_discovery_checkpoints?.length === 1 && control.source_pages?.length === 4, 'UC-154 render denominator drift');
assert(control.selected?.sha256 === 'a40a077d146d698d699b9cbc5e10d1c41be6be4f25202638b82cb64daeaada28', 'UC-154 selected source custody drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.gravity === 'east' && control.render?.wall_width === 1246 && control.render?.wall_height === 1000, 'UC-154 render geometry drift');
await mkdir(PACKET, { recursive: true });

const manifestReceipt = await receipt(join(SOURCE_ROOT, 'manifest.json'), { sha256: control.targeted_artifact.manifest_sha256 });
const summaryReceipt = await receipt(join(SOURCE_ROOT, 'summary.json'), { sha256: control.targeted_artifact.summary_sha256 });
const contactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet.jpg'), { sha256: control.targeted_artifact.contact_sheet_sha256, mime: 'image/jpeg', width: 900, height: 650 });
const targetedManifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
const targetedSummary = await readJson(join(SOURCE_ROOT, 'summary.json'));
assert(targetedManifest.record_id === 'UC-154' && targetedManifest.actor === 'Tyler Mane' && targetedManifest.character === 'Michael Myers' && targetedManifest.production === 'Halloween (2007)' && targetedManifest.side === 'still', 'UC-154 targeted manifest identity drift');
assert(targetedManifest.candidate_count === 1 && targetedManifest.failed_discovery_checkpoints?.length === 1, 'UC-154 targeted manifest denominator drift');
assert(targetedSummary.candidate_count === 1 && targetedSummary.candidate?.sha256 === control.selected.sha256, 'UC-154 targeted summary denominator drift');
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const pageRows = [];
for (const row of control.source_pages) {
  const evidence = targetedManifest.page_evidence?.[row.key];
  assert(evidence?.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${row.key} page transport drift`);
  assert(evidence.title === row.page_title && evidence.body_sha256 === row.body_sha256 && evidence.required_terms_missing.length === 0, `${row.key} page evidence drift`);
  const screenshot = await retain(row.artifact_path, row.output_path, { sha256: row.sha256, mime: 'image/png', bytes: row.bytes, width: row.width, height: row.height });
  pageRows.push({ control: row, evidence, screenshot });
}
const targetCandidate = targetedManifest.candidate;
assert(targetCandidate?.sha256 === control.selected.sha256 && targetCandidate?.local === control.selected.artifact_path && targetCandidate?.source_page === control.selected.source_page && targetCandidate?.caption === control.selected.caption, 'UC-154 selected target manifest drift');
assert(targetCandidate.first_film_2007 === true && targetCandidate.actor_role_custody_separate === true && Array.isArray(targetCandidate.repository_matches) && targetCandidate.repository_matches.length === 0, 'UC-154 selected target boundary drift');
assert(!(repository.get(control.selected.sha256) || []).length, 'UC-154 selected source duplicates canonical media');
const selectedSource = await retain(control.selected.artifact_path, control.selected.output_path, { sha256: control.selected.sha256, mime: control.selected.mime, bytes: control.selected.bytes, width: control.selected.width, height: control.selected.height });

const exactStillRecord = {
  version: 1,
  record_id: 'UC-154', actor: 'Tyler Mane', character: 'Michael Myers', production: 'Halloween (2007)', canonical_years: '2007–2009', side: 'still', expected_subject: 'Michael Myers',
  chronology_boundary: {
    canonical_years_semantics: '2007–2009 records Tyler Mane’s two-film tenure.',
    selected_frame_production: 'Halloween (2007)',
    halloween_ii_2009_substitute_forbidden: true,
    original_1978_and_other_continuities_forbidden: true,
    other_michael_myers_performers_forbidden: true
  },
  actor_role_bindings: Object.fromEntries(pageRows.slice(0, 2).map(({ control: row, evidence, screenshot }) => [row.key, {
    provider: row.provider, source_page: row.page_url, page_title: evidence.title, required_terms: row.required_terms,
    body_sha256: evidence.body_sha256, page_screenshot_sha256: screenshot.sha256, binding: row.binding
  }])),
  frame_custody: Object.fromEntries(pageRows.slice(2).map(({ control: row, evidence, screenshot }) => [row.key, {
    provider: row.provider, source_page: row.page_url, page_title: evidence.title, required_terms: row.required_terms,
    body_sha256: evidence.body_sha256, page_screenshot_sha256: screenshot.sha256, binding: row.binding
  }])),
  selected_frame: {
    provider: control.selected.provider, source_page: control.selected.source_page, selected_source_url: control.selected.declared_url,
    caption: control.selected.caption, selected_image_sha256: selectedSource.sha256, selected_image_width: selectedSource.width, selected_image_height: selectedSource.height,
    selection_ruling: control.selected.selection_ruling
  },
  rejected_broad_orbit: control.failed_discovery_checkpoints,
  still_boundary: {
    exact_completed_michael_myers_character_still_required: true,
    mask_face_torso_arms_costume_and_body_silhouette_legible: true,
    young_michael_and_unmasked_tyler_mane_forbidden: true,
    standalone_mask_cosplay_merchandise_game_poster_and_montage_forbidden: true,
    mixed_gallery_inventory_forbidden: true,
    existing_performer_portrait: 'images/uc-154-portrait.jpg',
    existing_performer_portrait_must_remain_unchanged: true
  },
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-still-record.json'), exactStillRecord);
const stillRecordReceipt = await receipt(join(PACKET, 'exact-still-record.json'));

const candidatePath = join(PACKET, 'uc-154-still-candidate.jpg');
magick(join(PACKET, selectedSource.path), '-auto-orient', '-filter', control.render.filter, '-resize', control.render.resize, '-gravity', control.render.gravity, '-extent', `${control.render.candidate_width}x${control.render.candidate_height}`, '-strip', '-quality', String(control.render.jpeg_quality), candidatePath);
const candidate = { path: 'uc-154-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: control.render.candidate_width, height: control.render.candidate_height })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: control.render.wall_width, height: control.render.wall_height })) };
