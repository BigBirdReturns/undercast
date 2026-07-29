#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-156-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-156';
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => { await mkdir(DEST, { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); };
function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return 'unknown';
}
async function receipt(path) { const bytes = await readFile(path); return { bytes: bytes.length, sha256: sha(bytes), mime: signatureMime(bytes) }; }
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

const expectedFiles = [
  'SHA256SUMS',
  'card-crop-preview.jpg',
  'cyberman-original.jpg',
  'dalek-original.jpg',
  'duplicate-scan.json',
  'exact-voice-record.json',
  'manifest.json',
  'review.json',
  'review.md',
  'source-page-doctorwho-army-of-ghosts-2006.png',
  'source-page-doctorwho-cybermen-character.png',
  'source-page-doctorwho-dalek-2005.png',
  'source-page-doctorwho-daleks-character.png',
  'uc-156-still-candidate.jpg'
];

async function loadControl() {
  const control = await readJson(CONTROL);
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-156', 'UC-156 apply scope drift');
  assert(control.kind === 'voice' && control.actor === 'Nicholas Briggs' && control.character === 'The voice of the Daleks & Cybermen' && control.production === 'Doctor Who (2005– )' && control.years === '2005–' && control.side === 'still' && control.reviewed_role === 'second-desk', 'UC-156 apply authority drift');
  assert(control.render_artifact?.artifact_id === 8712085173 && control.render_artifact?.head_sha === '9f27c7a57bc64e6e9e6ff7a306022c7435f995da' && control.render_artifact?.zip_sha256 === 'cc71d9ff0e786eb85f1777e3961e93ecf33a86894fc6c7e23f89816d396b29e6', 'UC-156 render custody drift');
  assert(control.expected?.packet_file_count === 14 && control.expected?.duplicate_item_count === 4 && control.expected?.duplicate_repository_hash_count === 2070 && control.expected?.selected_asset_count === 2 && control.expected?.discovery_candidate_count === 2 && control.expected?.failed_discovery_checkpoint_count === 1 && control.expected?.focused_page_receipt_count === 4, 'UC-156 packet denominator drift');
  assert(control.ruling?.identity === 'expected-subjects' && control.ruling?.presentation === 'two-role-dalek-cyberman-voice-composite' && control.ruling?.crop_ruling === 'pass-two-panel-centered-contain-layout' && control.ruling?.chronology_ruling === 'pass-2005-dalek-start-and-2006-cyberman-credit' && control.ruling?.operator_separation_ruling === 'pass-voice-credit-separated-from-visible-operators-and-suit-performers' && control.ruling?.screenshot_repair_ruling === 'pass-four-distinct-term-focused-page-receipts' && control.ruling?.portrait_separation_ruling === 'pass-existing-performer-portrait-unchanged' && control.ruling?.canonical_mutation === false, 'UC-156 ruling drift');
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
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-156 source packet file set drift: ${names.join(', ')}`);
  const map = {
    'manifest.json': control.expected.source_manifest,
    'duplicate-scan.json': control.expected.source_duplicate_scan,
    'review.json': control.expected.source_review_json,
    'review.md': control.expected.source_review_md,
    'SHA256SUMS': control.expected.source_sums,
    'exact-voice-record.json': control.expected.exact_voice_record,
    'dalek-original.jpg': control.expected.dalek_source,
    'cyberman-original.jpg': control.expected.cyberman_source,
    'source-page-doctorwho-dalek-2005.png': control.expected.dalek_story_page,
    'source-page-doctorwho-army-of-ghosts-2006.png': control.expected.army_of_ghosts_page,
    'source-page-doctorwho-daleks-character.png': control.expected.daleks_character_page,
    'source-page-doctorwho-cybermen-character.png': control.expected.cybermen_character_page,
    'uc-156-still-candidate.jpg': control.expected.candidate,
    'card-crop-preview.jpg': control.expected.crop_preview
  };
  for (const [name, expected] of Object.entries(map)) await verifyFile(name, expected);
  const sums = String(await readFile(join(SOURCE_ROOT, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length === expectedFiles.length - 1, 'UC-156 source checksum row count drift');
  const sumNames = [];
  for (const line of sums) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match, `malformed UC-156 source checksum ${line}`);
    sumNames.push(match[2]);
    assert(sha(await readFile(join(SOURCE_ROOT, match[2]))) === match[1], `${match[2]} source checksum drift`);
  }
  assert(JSON.stringify(sumNames.sort()) === JSON.stringify(expectedFiles.filter(name => name !== 'SHA256SUMS').sort()), 'UC-156 source checksum filename set drift');

  const manifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
  const review = await readJson(join(SOURCE_ROOT, 'review.json'));
  const voice = await readJson(join(SOURCE_ROOT, 'exact-voice-record.json'));
  const duplicates = await readJson(join(SOURCE_ROOT, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-156' && manifest.kind === 'voice' && manifest.actor === 'Nicholas Briggs' && manifest.character === 'The voice of the Daleks & Cybermen' && manifest.production === 'Doctor Who (2005– )' && manifest.years === '2005–' && manifest.side === 'still', 'UC-156 source manifest identity drift');
  assert(manifest.custody?.discovery_artifact?.artifact_id === 8711951936 && manifest.custody?.discovery_artifact?.candidate_count === control.expected.discovery_candidate_count && manifest.custody?.failed_discovery_checkpoints?.length === control.expected.failed_discovery_checkpoint_count, 'UC-156 source discovery custody drift');
  assert(Object.keys(manifest.source_custody || {}).length === control.expected.focused_page_receipt_count && new Set(Object.values(manifest.source_custody || {}).map(row => row.page_screenshot?.sha256)).size === control.expected.focused_page_receipt_count, 'UC-156 source focused page receipt drift');
  assert(manifest.source_custody?.['doctorwho-dalek-2005']?.page_screenshot?.sha256 === control.expected.dalek_story_page.sha256 && manifest.source_custody?.['doctorwho-army-of-ghosts-2006']?.page_screenshot?.sha256 === control.expected.army_of_ghosts_page.sha256, 'UC-156 source actor-role custody drift');
  assert(manifest.source_custody?.['doctorwho-daleks-character']?.page_screenshot?.sha256 === control.expected.daleks_character_page.sha256 && manifest.source_custody?.['doctorwho-cybermen-character']?.page_screenshot?.sha256 === control.expected.cybermen_character_page.sha256, 'UC-156 source character custody drift');
  assert(manifest.roles?.dalek?.original?.sha256 === control.expected.dalek_source.sha256 && manifest.roles?.cyberman?.original?.sha256 === control.expected.cyberman_source.sha256, 'UC-156 selected role source drift');
  assert(manifest.actor_role_bindings?.cyberman?.visible_suit_performer === 'Paul Kasey as Cyber Leader' && manifest.actor_role_bindings?.cyberman?.voice_credit === 'Nicholas Briggs as Dalek/Cybermen voices', 'UC-156 operator separation drift');
  assert(manifest.chronology_boundary?.dalek_voice_start_2005_required === true && manifest.chronology_boundary?.cyberman_voice_credit_2006_or_later_required === true && manifest.chronology_boundary?.operator_and_suit_performer_separation_required === true && manifest.chronology_boundary?.no_claim_nicholas_briggs_visible_in_selected_images === true && manifest.chronology_boundary?.existing_performer_portrait === 'images/uc-156-portrait.jpg' && manifest.chronology_boundary?.existing_performer_portrait_must_remain_unchanged === true, 'UC-156 source chronology or portrait boundary drift');
  assert(manifest.exact_voice_record?.sha256 === control.expected.exact_voice_record.sha256, 'UC-156 source exact-voice receipt drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.candidate?.bytes === control.expected.candidate.bytes && manifest.candidate?.width === 1260 && manifest.candidate?.height === 1000, 'UC-156 source candidate receipt drift');
  assert(manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256 && manifest.crop_preview?.bytes === control.expected.crop_preview.bytes && manifest.crop_preview?.width === 1246 && manifest.crop_preview?.height === 1000, 'UC-156 source crop receipt drift');
  assert(review.source_sha256s?.dalek === control.expected.dalek_source.sha256 && review.source_sha256s?.cyberman === control.expected.cyberman_source.sha256 && review.exact_voice_record_sha256 === control.expected.exact_voice_record.sha256, 'UC-156 source review source receipt drift');
  assert(review.candidate_sha256 === control.expected.candidate.sha256 && review.crop_preview_sha256 === control.expected.crop_preview.sha256, 'UC-156 source review candidate drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.operator_separation_ruling === control.ruling.operator_separation_ruling && review.screenshot_repair_ruling === control.ruling.screenshot_repair_ruling && review.portrait_separation_ruling === control.ruling.portrait_separation_ruling && review.canonical_mutation === false, 'UC-156 source review ruling drift');
  assert(voice.record_id === 'UC-156' && voice.kind === 'voice' && voice.actor === 'Nicholas Briggs' && voice.character === 'The voice of the Daleks & Cybermen' && voice.roles?.dalek?.selected_image_sha256 === control.expected.dalek_source.sha256 && voice.roles?.cyberman?.selected_image_sha256 === control.expected.cyberman_source.sha256, 'UC-156 exact voice record identity drift');
  assert(voice.composite_boundary?.exact_two_role_character_composite_required === true && JSON.stringify(voice.composite_boundary?.required_roles) === JSON.stringify(['dalek','cyberman']) && voice.composite_boundary?.selected_asset_count === 2 && voice.composite_boundary?.selected_assets_byte_distinct === true && voice.composite_boundary?.operator_and_suit_performer_separation_required === true && voice.composite_boundary?.no_claim_nicholas_briggs_visible_in_selected_images === true && voice.composite_boundary?.existing_performer_portrait === 'images/uc-156-portrait.jpg' && voice.composite_boundary?.existing_performer_portrait_must_remain_unchanged === true && voice.canonical_mutation === false, 'UC-156 exact voice composite boundary drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && (duplicates.items || []).length === 4 && duplicates.items.every(item => Array.isArray(item.matches) && item.matches.length === 0), 'UC-156 source duplicate boundary drift');
  return { manifest, review, voice, duplicates };
}
