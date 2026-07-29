#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-156-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-156-render';
const PACKET = join(OUT, 'UC-156');
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
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-156', 'UC-156 render scope drift');
assert(control.kind === 'voice' && control.actor === 'Nicholas Briggs' && control.character === 'The voice of the Daleks & Cybermen' && control.production === 'Doctor Who (2005– )' && control.years === '2005–' && control.side === 'still', 'UC-156 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8711951936 && control.discovery_artifact?.head_sha === '30c9b02419d2ed0b793991b30fd2a72dbe03ff6d' && control.discovery_artifact?.candidate_count === 2, 'UC-156 discovery custody drift');
assert(control.failed_discovery_checkpoints?.length === 1 && control.source_pages?.length === 4 && control.roles?.length === 2, 'UC-156 render denominator drift');
assert(control.roles[0]?.sha256 === '518ed11a1e9a881517fa30ac07b8d18157c92bf099552b6b5308621e3919ab9f' && control.roles[1]?.sha256 === '413c79e2825bc588efb3341625976da9cb9045ff319850bdcc434b595d4c4ec4', 'UC-156 selected role custody drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.panel_width === 624 && control.render?.divider_width === 12 && control.render?.resize === '624x1000>' && control.render?.wall_width === 1246 && control.render?.wall_height === 1000, 'UC-156 render geometry drift');
await mkdir(PACKET, { recursive: true });

const manifestReceipt = await receipt(join(SOURCE_ROOT, 'manifest.json'), { sha256: control.discovery_artifact.manifest_sha256 });
const summaryReceipt = await receipt(join(SOURCE_ROOT, 'summary.json'), { sha256: control.discovery_artifact.summary_sha256 });
const contactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet.jpg'), { sha256: control.discovery_artifact.contact_sheet_sha256, mime: 'image/jpeg', width: 1288, height: 784 });
const discoveryManifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
const discoverySummary = await readJson(join(SOURCE_ROOT, 'summary.json'));
assert(discoveryManifest.record_id === 'UC-156' && discoveryManifest.actor === 'Nicholas Briggs' && discoveryManifest.character === 'The voice of the Daleks & Cybermen' && discoveryManifest.kind === 'voice' && discoveryManifest.side === 'still', 'UC-156 discovery manifest identity drift');
assert(discoveryManifest.candidate_count === 2 && JSON.stringify(discoveryManifest.role_counts) === JSON.stringify({ dalek: 1, cyberman: 1 }) && discoveryManifest.failed_discovery_checkpoints?.length === 1, 'UC-156 discovery manifest denominator drift');
assert(discoverySummary.candidate_count === 2 && JSON.stringify(discoverySummary.role_counts) === JSON.stringify({ dalek: 1, cyberman: 1 }) && discoverySummary.failed_discovery_checkpoints?.length === 1, 'UC-156 discovery summary denominator drift');
const screenshotHashes = control.source_pages.map(row => row.sha256);
assert(new Set(screenshotHashes).size === 4, 'UC-156 focused screenshot control collision');
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const pageRows = [];
for (const row of control.source_pages) {
  const evidence = discoveryManifest.page_evidence?.[row.key];
  assert(evidence?.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${row.key} page transport drift`);
  assert(evidence.title === row.page_title && evidence.body_sha256 === row.body_sha256 && evidence.required_terms_missing.length === 0 && JSON.stringify(evidence.required_terms) === JSON.stringify(row.required_terms), `${row.key} page evidence drift`);
  const screenshot = await retain(row.artifact_path, row.output_path, { sha256: row.sha256, mime: 'image/png', bytes: row.bytes, width: row.width, height: row.height });
  pageRows.push({ control: row, evidence, screenshot });
}
assert(new Set(pageRows.map(row => row.screenshot.sha256)).size === 4, 'UC-156 retained page screenshot collision');

const roleRows = [];
for (const role of control.roles) {
  const selected = (discoveryManifest.candidates || []).find(row => row.role_key === role.key && row.sha256 === role.sha256);
  assert(selected, `${role.key} selected discovery candidate missing`);
  assert(selected.local === role.artifact_path && selected.source_page_key === role.source_page_key && selected.required_actor_role_page_key === role.actor_role_page_key && selected.source_page === role.page_url && selected.declared_url === role.declared_url, `${role.key} selected source custody drift`);
  assert(selected.asset_title === role.asset_title && selected.chronology === role.chronology && selected.mime === role.mime && selected.bytes === role.bytes && selected.width === role.width && selected.height === role.height && selected.official_character_asset === true && selected.performance_mode === 'voice', `${role.key} selected source metadata drift`);
  assert(Array.isArray(selected.repository_matches) && selected.repository_matches.length === 0 && !(repository.get(role.sha256) || []).length, `${role.key} duplicate boundary drift`);
  const source = await retain(role.artifact_path, role.output_path, { sha256: role.sha256, mime: role.mime, bytes: role.bytes, width: role.width, height: role.height });
  roleRows.push({ role, selected, source });
}
assert(new Set(roleRows.map(row => row.source.sha256)).size === 2, 'UC-156 selected role assets are not byte-distinct');

const pageByKey = Object.fromEntries(pageRows.map(row => [row.control.key, row]));
const exactVoiceRecord = {
  version: 1,
  record_id: 'UC-156',
  kind: 'voice',
  actor: 'Nicholas Briggs',
  character: 'The voice of the Daleks & Cybermen',
  production: 'Doctor Who (2005– )',
  canonical_years: '2005–',
  canonical_years_semantics: 'The range identifies Nicholas Briggs’s revived-era television voice tenure. It does not assign him classic-series voices or treat an audio-only performance as television evidence.',
  performance_mode: 'voice',
  actor_role_bindings: {
    dalek: {
      provider: control.source_pages[0].provider,
      source_page: control.source_pages[0].page_url,
      page_title: pageByKey['doctorwho-dalek-2005'].evidence.title,
      required_terms: control.source_pages[0].required_terms,
      body_sha256: control.source_pages[0].body_sha256,
      page_screenshot_sha256: pageByKey['doctorwho-dalek-2005'].screenshot.sha256,
      binding: control.source_pages[0].binding,
      chronology: 'Dalek, 30 April 2005'
    },
    cyberman: {
      provider: control.source_pages[1].provider,
      source_page: control.source_pages[1].page_url,
      page_title: pageByKey['doctorwho-army-of-ghosts-2006'].evidence.title,
      required_terms: control.source_pages[1].required_terms,
      body_sha256: control.source_pages[1].body_sha256,
      page_screenshot_sha256: pageByKey['doctorwho-army-of-ghosts-2006'].screenshot.sha256,
      binding: control.source_pages[1].binding,
      chronology: 'Army of Ghosts, 1 July 2006',
      visible_suit_performer: 'Paul Kasey as Cyber Leader',
      voice_credit: 'Nicholas Briggs as Dalek/Cybermen voices'
    }
  },
  roles: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, {
    role: role.role,
    display_label: role.display_label,
    provider: role.provider,
    character_page: role.page_url,
    character_page_screenshot_sha256: pageByKey[role.source_page_key].screenshot.sha256,
    selected_asset_title: role.asset_title,
    selected_source_url: role.declared_url,
    selected_image_sha256: source.sha256,
    selected_image_width: source.width,
    selected_image_height: source.height,
    chronology: role.chronology,
    selection_ruling: role.selection_ruling
  }])),
  composite_boundary: {
    exact_two_role_character_composite_required: true,
    required_roles: ['dalek', 'cyberman'],
    selected_asset_count: 2,
    selected_assets_byte_distinct: true,
    official_doctorwho_character_assets_required: true,
    dalek_voice_start_2005_required: true,
    cyberman_voice_credit_2006_or_later_required: true,
    operator_and_suit_performer_separation_required: true,
    no_claim_nicholas_briggs_visible_in_selected_images: true,
    classic_series_voice_substitute_forbidden: true,
    audio_only_substitute_for_television_forbidden: true,
    dalek_only_or_cyberman_only_candidate_forbidden: true,
    existing_performer_portrait: 'images/uc-156-portrait.jpg',
    existing_performer_portrait_must_remain_unchanged: true
  },
  failed_discovery_checkpoints: control.failed_discovery_checkpoints,
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-voice-record.json'), exactVoiceRecord);
const voiceRecordReceipt = await receipt(join(PACKET, 'exact-voice-record.json'));

const panels = {};
for (const { role, source } of roleRows) {
  const panelPath = join(OUT, `${role.key}-panel.jpg`);
  magick(join(PACKET, source.path), '-auto-orient', '-filter', control.render.filter, '-resize', control.render.resize, '-background', control.render.panel_background, '-gravity', control.render.gravity, '-extent', `${control.render.panel_width}x${control.render.panel_height}`, '-strip', '-quality', String(control.render.jpeg_quality), panelPath);
  assert(JSON.stringify(identify(panelPath)) === JSON.stringify({ width: control.render.panel_width, height: control.render.panel_height }), `UC-156 ${role.key} panel geometry drift`);
  panels[role.key] = panelPath;
}
const candidatePath = join(PACKET, 'uc-156-still-candidate.jpg');
magick(panels.dalek, '-size', `${control.render.divider_width}x${control.render.candidate_height}`, `xc:${control.render.divider_color}`, panels.cyberman, '+append', '-strip', '-quality', String(control.render.jpeg_quality), candidatePath);
const candidate = { path: 'uc-156-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: control.render.candidate_width, height: control.render.candidate_height })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: control.render.wall_width, height: control.render.wall_height })) };
