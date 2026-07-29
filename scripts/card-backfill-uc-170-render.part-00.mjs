#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-170-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-170-render';
const PACKET = join(OUT, 'UC-170');
const TMP = join(OUT, 'tmp');
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); };
function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (bytes.length >= 6 && ['GIF87a','GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  return 'unknown';
}
function identify(path, mime = '') {
  const input = mime === 'image/gif' ? `${path}[0]` : path;
  const text = execFileSync(process.env.MAGICK_CMD || 'magick', ['identify', '-format', '%w %h', input], { encoding: 'utf8' }).trim();
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
  const bytes = await readFile(path); const mime = signatureMime(bytes); const row = { bytes: bytes.length, sha256: sha(bytes), mime };
  if (mime !== 'unknown') Object.assign(row, identify(path, mime));
  if (expected.sha256) assert(row.sha256 === expected.sha256, `${path} hash drift ${row.sha256}`);
  if (expected.mime) assert(row.mime === expected.mime, `${path} MIME drift ${row.mime}`);
  if (expected.bytes !== undefined) assert(row.bytes === expected.bytes, `${path} byte drift ${row.bytes}`);
  if (expected.width !== undefined) assert(row.width === expected.width, `${path} width drift ${row.width}`);
  if (expected.height !== undefined) assert(row.height === expected.height, `${path} height drift ${row.height}`);
  return row;
}
async function retain(inputRel, outputName, expected = {}) { const output = join(PACKET, outputName); await mkdir(dirname(output), { recursive: true }); await copyFile(join(SOURCE_ROOT, inputRel), output); return { path: outputName, ...(await receipt(output, expected)) }; }

const control = await readJson(CONTROL);
assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-170', 'UC-170 render scope drift');
assert(control.kind === 'voice' && control.actor === 'Maurice LaMarche' && control.character === 'The Brain, Kif Kroker, Egon Spengler' && control.production === 'Animaniacs / Futurama' && control.years === '1980s–' && control.side === 'still', 'UC-170 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8713451891 && control.discovery_artifact?.head_sha === 'bf9cec9fdaf8b9c8ac89010b1b66d9ae0d61764b' && control.discovery_artifact?.candidate_count === 89, 'UC-170 discovery custody drift');
assert(control.failed_discovery_checkpoints?.length === 3 && control.actor_role_pages?.length === 4 && control.selected_roles?.length === 3, 'UC-170 render denominator drift');
assert(JSON.stringify(control.selected_roles.map(row => row.key)) === JSON.stringify(['brain','kif','egon']), 'UC-170 selected role order drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.panel_width === 412 && control.render?.divider_width === 12 && control.render?.top_height === 560 && control.render?.internal_rule_height === 8 && control.render?.bottom_height === 432, 'UC-170 render geometry drift');
await rm(OUT, { recursive: true, force: true });
await mkdir(PACKET, { recursive: true }); await mkdir(TMP, { recursive: true });

const discoveryManifestReceipt = await receipt(join(SOURCE_ROOT, 'manifest.json'), { sha256: control.discovery_artifact.manifest_sha256 });
const discoverySummaryReceipt = await receipt(join(SOURCE_ROOT, 'summary.json'), { sha256: control.discovery_artifact.summary_sha256 });
const contactSheet = await retain('contact-sheet-all-roles.jpg', 'source-contact-sheet-all-roles.jpg', { sha256: control.discovery_artifact.contact_sheet_sha256, mime: 'image/jpeg', bytes: 142006, width: 1632, height: 644 });
const discoveryManifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
const discoverySummary = await readJson(join(SOURCE_ROOT, 'summary.json'));
assert(discoveryManifest.record_id === 'UC-170' && discoveryManifest.actor === 'Maurice LaMarche' && discoveryManifest.candidate_count === 89, 'UC-170 discovery manifest drift');
assert(JSON.stringify(discoveryManifest.role_counts) === JSON.stringify({ brain: 8, kif: 1, egon: 80 }), 'UC-170 discovery role counts drift');
assert(discoveryManifest.failed_discovery_checkpoints?.length === 3 && discoverySummary.failed_discovery_checkpoints?.length === 3, 'UC-170 discovery failure custody drift');
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const pageRows = [];
for (const row of control.actor_role_pages) {
  const evidence = discoveryManifest.page_evidence?.[row.key];
  assert(evidence?.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${row.key} page transport drift`);
  assert(evidence.title === row.page_title && evidence.body_sha256 === row.body_sha256 && evidence.required_terms_missing.length === 0, `${row.key} page evidence drift`);
  const screenshot = await retain(row.artifact_path, row.output_path, { sha256: row.sha256, mime: 'image/png', bytes: row.bytes, width: row.width, height: row.height });
  pageRows.push({ control: row, evidence, screenshot });
}

const selectedRows = [];
for (const row of control.selected_roles) {
  const candidate = (discoveryManifest.candidates || []).find(item => item.role_key === row.key && item.sha256 === row.sha256);
  assert(candidate, `${row.key} selected candidate missing`);
  assert(candidate.file_title === row.file_title && candidate.source_page === row.source_page && candidate.local === row.artifact_path && candidate.mime === row.mime && candidate.bytes === row.bytes && candidate.width === row.width && candidate.height === row.height, `${row.key} selected candidate custody drift`);
  assert(candidate.raw_revision_sha256 === row.raw_revision_sha256 && candidate.api_sha256 === row.image_api_sha256 && Array.isArray(candidate.repository_matches) && candidate.repository_matches.length === 0, `${row.key} selected evidence drift`);
  assert(!(repository.get(row.sha256) || []).length, `${row.key} source duplicates canonical media`);
  if (row.key === 'kif') assert(candidate.pageimage_source === true && candidate.generic_width_floor_exception === true && candidate.sha256 === '5261c4cddb408a3f18f2bc8c321ff8f7ad6edfcdc82c66cb614e82ec672f2f2e', 'UC-170 Kif exception drift');
  const source = await retain(row.artifact_path, row.output_path, { sha256: row.sha256, mime: row.mime, bytes: row.bytes, width: row.width, height: row.height });
  const raw = await retain(row.raw_revision_path, row.raw_output_path, { sha256: row.raw_revision_sha256, bytes: row.raw_revision_bytes });
  const primaryApi = await retain(row.primary_api_path, row.primary_api_output_path, { sha256: row.primary_api_sha256, bytes: row.primary_api_bytes });
  const imageApi = await retain(row.image_api_path, row.image_api_output_path, { sha256: row.image_api_sha256, bytes: row.image_api_bytes });
  selectedRows.push({ control: row, candidate, source, raw, primaryApi, imageApi });
}

const exactVoiceRecord = {
  version: 1,
  record_id: 'UC-170', kind: 'voice', actor: 'Maurice LaMarche', character: 'The Brain, Kif Kroker, Egon Spengler', production: 'Animaniacs / Futurama', canonical_years: '1980s–', side: 'still',
  chronology_boundary: {
    egon: 'The Real Ghostbusters, 1986–1991',
    brain: 'Animaniacs origin in 1993',
    kif: 'Futurama original television run beginning in 1999',
    canonical_years_semantics: '1980s– is a broad Maurice LaMarche career envelope and is not projected onto Brain or Kif.'
  },
  actor_role_bindings: Object.fromEntries(pageRows.map(({ control: row, evidence, screenshot }) => [row.key, { provider: row.provider, source_page: row.source_page, page_title: evidence.title, body_sha256: evidence.body_sha256, page_screenshot_sha256: screenshot.sha256, binding: row.binding }])),
  selected_roles: Object.fromEntries(selectedRows.map(({ control: row, source, raw, primaryApi, imageApi, candidate }) => [row.key, {
    role: row.role, provider: row.provider, source_page: row.source_page, file_title: row.file_title, original_url: row.original_url,
    image: source, raw_revision: raw, primary_api: primaryApi, image_api: imageApi, pageimage_source: candidate.pageimage_source,
    generic_width_floor_exception: candidate.generic_width_floor_exception === true, chronology: row.chronology, selection_ruling: row.selection_ruling
  }])),
  voice_boundary: {
    exact_three_role_composite_required: true,
    all_three_roles_independently_legible: true,
    live_action_egon_and_harold_ramis_imagery_forbidden: true,
    Pinky_and_other_character_substitutes_forbidden: true,
    Kif_exception_bound_to_exact_bytes: true,
    existing_performer_portrait: 'images/uc-170-portrait.jpg',
    existing_performer_portrait_must_remain_unchanged: true
  },
  failed_discovery_checkpoints: control.failed_discovery_checkpoints,
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-voice-record.json'), exactVoiceRecord);
const voiceRecordReceipt = await receipt(join(PACKET, 'exact-voice-record.json'));
