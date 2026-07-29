#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-170-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-170';
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
async function receipt(path) {
  const bytes = await readFile(path);
  return { sha256: sha(bytes), bytes: bytes.length, mime: signatureMime(bytes) };
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
async function loadControl() {
  const control = await readJson(CONTROL);
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-170', 'UC-170 apply scope drift');
  assert(control.kind === 'voice' && control.actor === 'Maurice LaMarche' && control.character === 'The Brain, Kif Kroker, Egon Spengler' && control.production === 'Animaniacs / Futurama' && control.years === '1980s–' && control.side === 'still', 'UC-170 apply identity drift');
  assert(control.reviewed_role === 'second-desk' && control.render_artifact?.artifact_id === 8713612162 && control.render_artifact?.head_sha === '31a80f7db85f0cc1394c984f8d05b950bb5247e8' && control.render_artifact?.zip_sha256 === 'ccddec31b21a0b56fed02222c80ba1e56cf922c28fa3c8a34f93565fb23b72f1', 'UC-170 render custody drift');
  assert(Object.keys(control.expected_files || {}).length === control.denominators?.packet_file_count && control.denominators?.packet_file_count === 25 && control.denominators?.checksum_row_count === 24, 'UC-170 packet denominator drift');
  assert(control.denominators?.selected_role_count === 3 && control.denominators?.actor_role_page_count === 4 && control.denominators?.raw_revision_count === 3 && control.denominators?.api_receipt_count === 6 && control.denominators?.failed_discovery_checkpoint_count === 3 && control.denominators?.duplicate_item_count === 5 && control.denominators?.repository_hash_count === 2070, 'UC-170 evidence denominator drift');
  assert(control.ruling?.identity === 'expected-three-role-subject' && control.ruling?.presentation === 'three-role-animated-character-composite' && control.ruling?.crop_ruling === 'pass-three-face-and-body-panels' && control.ruling?.chronology_ruling === 'pass-role-specific-1986-1993-1999-boundaries' && control.ruling?.Kif_source_floor_ruling === 'pass-exact-hash-and-geometry-bound-exception' && control.ruling?.live_action_egon_exclusion_ruling === 'pass-animated-egon-only' && control.ruling?.portrait_separation_ruling === 'pass-existing-performer-portrait-unchanged' && control.ruling?.canonical_mutation === false, 'UC-170 review ruling drift');
  return control;
}
function exactExpected(control, name) {
  const expected = control.expected_files?.[name];
  assert(expected, `missing expected receipt for ${name}`);
  return expected;
}
async function verifyFile(root, name, expected) {
  const row = await receipt(join(root, name));
  assert(row.sha256 === expected.sha256, `${name} hash drift ${row.sha256}`);
  assert(row.bytes === expected.bytes, `${name} byte drift ${row.bytes}`);
  if (expected.mime) assert(row.mime === expected.mime, `${name} MIME drift ${row.mime}`);
  return row;
}
async function verifyChecksums(root, expectedNames, expectedRows) {
  const lines = String(await readFile(join(root, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(lines.length === expectedRows, `UC-170 checksum row count drift ${lines.length}`);
  const names = [];
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match, `malformed UC-170 checksum row ${line}`);
    names.push(match[2]);
    assert(sha(await readFile(join(root, match[2]))) === match[1], `${match[2]} checksum drift`);
  }
  assert(JSON.stringify(names.sort()) === JSON.stringify(expectedNames.filter(name => name !== 'SHA256SUMS').sort()), 'UC-170 checksum filename set drift');
}
async function verifySourcePacket(control) {
  assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
  const expectedNames = Object.keys(control.expected_files).sort();
  const names = (await readdir(SOURCE_ROOT)).sort();
  assert(JSON.stringify(names) === JSON.stringify(expectedNames), `UC-170 source packet file set drift: ${names.join(', ')}`);
  for (const name of expectedNames) await verifyFile(SOURCE_ROOT, name, exactExpected(control, name));
  await verifyChecksums(SOURCE_ROOT, expectedNames, control.denominators.checksum_row_count);

  const manifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
  const review = await readJson(join(SOURCE_ROOT, 'review.json'));
  const voice = await readJson(join(SOURCE_ROOT, 'exact-voice-record.json'));
  const duplicates = await readJson(join(SOURCE_ROOT, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-170' && manifest.kind === 'voice' && manifest.actor === 'Maurice LaMarche' && manifest.character === 'The Brain, Kif Kroker, Egon Spengler' && manifest.production === 'Animaniacs / Futurama' && manifest.years === '1980s–' && manifest.side === 'still', 'UC-170 source manifest identity drift');
  assert(manifest.custody?.discovery_artifact?.artifact_id === 8713451891 && manifest.custody?.discovery_artifact?.candidate_count === 89 && manifest.custody?.failed_discovery_checkpoints?.length === 3, 'UC-170 source discovery custody drift');
  assert(Object.keys(manifest.actor_role_custody || {}).length === control.denominators.actor_role_page_count && Object.keys(manifest.selected_roles || {}).length === control.denominators.selected_role_count, 'UC-170 source role denominator drift');
  assert(manifest.selected_roles?.brain?.original?.sha256 === exactExpected(control, 'brain-original.webp').sha256, 'UC-170 Brain source drift');
  assert(manifest.selected_roles?.kif?.original?.sha256 === exactExpected(control, 'kif-original.webp').sha256 && manifest.selected_roles?.kif?.generic_width_floor_exception === true, 'UC-170 Kif source exception drift');
  assert(manifest.selected_roles?.egon?.original?.sha256 === exactExpected(control, 'egon-original.webp').sha256 && manifest.selected_roles?.egon?.file_title === 'File:EgonColorPMS.png', 'UC-170 Egon source drift');
  assert(manifest.candidate?.sha256 === exactExpected(control, 'uc-170-still-candidate.jpg').sha256 && manifest.crop_preview?.sha256 === exactExpected(control, 'card-crop-preview.jpg').sha256, 'UC-170 source candidate drift');
  assert(manifest.exact_voice_record?.sha256 === exactExpected(control, 'exact-voice-record.json').sha256 && manifest.canonical_mutation === false, 'UC-170 source exact voice receipt drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.Kif_source_floor_ruling === control.ruling.Kif_source_floor_ruling && review.live_action_egon_exclusion_ruling === control.ruling.live_action_egon_exclusion_ruling && review.portrait_separation_ruling === control.ruling.portrait_separation_ruling && review.canonical_mutation === false, 'UC-170 source review drift');
  assert(voice.record_id === 'UC-170' && voice.actor === 'Maurice LaMarche' && Object.keys(voice.selected_roles || {}).length === 3 && voice.selected_roles?.kif?.generic_width_floor_exception === true && voice.voice_boundary?.Kif_exception_bound_to_exact_bytes === true && voice.voice_boundary?.existing_performer_portrait === 'images/uc-170-portrait.jpg' && voice.canonical_mutation === false, 'UC-170 source exact voice boundary drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && (duplicates.items || []).length === control.denominators.duplicate_item_count && duplicates.items.every(item => Array.isArray(item.matches) && item.matches.length === 0), 'UC-170 source duplicate boundary drift');
  return { manifest, review, voice, duplicates };
}
