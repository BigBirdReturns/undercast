#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-171-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-171';
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
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-171', 'UC-171 apply scope drift');
  assert(control.kind === 'voice' && control.actor === 'Rob Paulsen' && control.character === 'Yakko Warner, Pinky, Raphael' && control.production === 'Animaniacs / TMNT' && control.years === '1980s–' && control.side === 'still', 'UC-171 apply identity drift');
  assert(control.reviewed_role === 'second-desk' && control.render_artifact?.artifact_id === 8714744115 && control.render_artifact?.head_sha === '2bd6a22c521ba365e60367e1e39a7066d92699e1' && control.render_artifact?.zip_sha256 === 'a8bd543c2ff9bc19bb99614642051b8fb276aa03f522b1cebcf4ef39355054d7', 'UC-171 render custody drift');
  assert(Object.keys(control.expected_files || {}).length === control.denominators?.packet_file_count && control.denominators?.packet_file_count === 23 && control.denominators?.checksum_row_count === 22, 'UC-171 packet denominator drift');
  assert(control.denominators?.selected_role_count === 3 && control.denominators?.actor_role_binding_count === 4 && control.denominators?.strict_actor_role_page_count === 3 && control.denominators?.reference_only_actor_role_page_count === 1 && control.denominators?.raw_revision_count === 3 && control.denominators?.api_receipt_count === 6 && control.denominators?.failed_discovery_checkpoint_count === 3 && control.denominators?.duplicate_item_count === 5 && control.denominators?.repository_hash_count === 2070 && control.denominators?.discovery_candidate_count === 10, 'UC-171 evidence denominator drift');
  assert(control.ruling?.identity === 'exact-three-role-subject-set' && control.ruling?.presentation === 'three-role-animated-character-composite' && control.ruling?.crop_ruling === 'pass-face-and-full-character-triptych' && control.ruling?.chronology_ruling === 'pass-role-specific-1987-and-1993-boundaries' && control.ruling?.raphael_ruling === 'pass-original-1987-raphael-distinct-from-later-donatello' && control.ruling?.reference_only_ruling === 'pass-blocked-paramount-release-retained-as-reference-only' && control.ruling?.portrait_separation_ruling === 'pass-existing-performer-portrait-unchanged' && control.ruling?.canonical_mutation === false, 'UC-171 review ruling drift');
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
  assert(lines.length === expectedRows, `UC-171 checksum row count drift ${lines.length}`);
  const names = [];
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match, `malformed UC-171 checksum row ${line}`);
    names.push(match[2]);
    assert(sha(await readFile(join(root, match[2]))) === match[1], `${match[2]} checksum drift`);
  }
  assert(JSON.stringify(names.sort()) === JSON.stringify(expectedNames.filter(name => name !== 'SHA256SUMS').sort()), 'UC-171 checksum filename set drift');
}
async function verifySourcePacket(control) {
  assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
  const expectedNames = Object.keys(control.expected_files).sort();
  const names = (await readdir(SOURCE_ROOT)).sort();
  assert(JSON.stringify(names) === JSON.stringify(expectedNames), `UC-171 source packet file set drift: ${names.join(', ')}`);
  for (const name of expectedNames) await verifyFile(SOURCE_ROOT, name, exactExpected(control, name));
  await verifyChecksums(SOURCE_ROOT, expectedNames, control.denominators.checksum_row_count);

  const manifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
  const review = await readJson(join(SOURCE_ROOT, 'review.json'));
  const voice = await readJson(join(SOURCE_ROOT, 'exact-voice-record.json'));
  const duplicates = await readJson(join(SOURCE_ROOT, 'duplicate-scan.json'));
  const yakkoRaw = String(await readFile(join(SOURCE_ROOT, 'source-raw-yakko.wikitext'), 'utf8')).toLowerCase();
  assert(manifest.record_id === 'UC-171' && manifest.kind === 'voice' && manifest.actor === 'Rob Paulsen' && manifest.character === 'Yakko Warner, Pinky, Raphael' && manifest.production === 'Animaniacs / TMNT' && manifest.years === '1980s–' && manifest.side === 'still', 'UC-171 source manifest identity drift');
  assert(manifest.custody?.discovery_artifact?.artifact_id === 8714560470 && manifest.custody?.discovery_artifact?.candidate_count === control.denominators.discovery_candidate_count && manifest.custody?.failed_discovery_checkpoints?.length === control.denominators.failed_discovery_checkpoint_count, 'UC-171 source discovery custody drift');
  const bindings = Object.values(manifest.actor_role_custody || {});
  assert(bindings.length === control.denominators.actor_role_binding_count && bindings.filter(row => row.strict === true).length === control.denominators.strict_actor_role_page_count && bindings.filter(row => row.reference_only === true).length === control.denominators.reference_only_actor_role_page_count, 'UC-171 source actor-role denominator drift');
  assert(manifest.actor_role_custody?.['paramount-rise-cast']?.reference_only === true && manifest.actor_role_custody?.['paramount-rise-cast']?.externally_verified === true, 'UC-171 reference-only Paramount custody drift');
  assert(Object.keys(manifest.roles || {}).length === control.denominators.selected_role_count, 'UC-171 source role denominator drift');
  assert(manifest.roles?.yakko?.original?.sha256 === exactExpected(control, 'yakko-original.webp').sha256 && manifest.roles?.yakko?.file_title === 'File:Yakko main model.png', 'UC-171 Yakko source drift');
  assert(manifest.roles?.pinky?.original?.sha256 === exactExpected(control, 'pinky-original.webp').sha256 && manifest.roles?.pinky?.file_title === 'File:Pinky official art.png', 'UC-171 Pinky source drift');
  assert(manifest.roles?.raphael?.original?.sha256 === exactExpected(control, 'raphael-1987-original.webp').sha256 && manifest.roles?.raphael?.file_title === 'File:1987 raph 01.jpg', 'UC-171 Raphael source drift');
  assert(manifest.chronology_boundary?.yakko === 'Animaniacs, 1993' && manifest.chronology_boundary?.pinky.includes('1993') && manifest.chronology_boundary?.raphael.includes('1987') && manifest.chronology_boundary?.later_donatello_cannot_substitute === true, 'UC-171 source chronology drift');
  assert(manifest.composite_boundary?.required_roles?.join(',') === 'yakko,pinky,raphael' && manifest.composite_boundary?.existing_performer_portrait === 'images/uc-171-portrait.jpg' && manifest.composite_boundary?.existing_performer_portrait_must_remain_unchanged === true, 'UC-171 source composite boundary drift');
  assert(manifest.candidate?.sha256 === exactExpected(control, 'uc-171-still-candidate.jpg').sha256 && manifest.crop_preview?.sha256 === exactExpected(control, 'card-crop-preview.jpg').sha256, 'UC-171 source candidate drift');
  assert(manifest.exact_voice_record?.sha256 === exactExpected(control, 'exact-voice-record.json').sha256 && manifest.canonical_mutation === false, 'UC-171 source exact voice receipt drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.raphael_ruling === control.ruling.raphael_ruling && review.reference_only_ruling === control.ruling.reference_only_ruling && review.portrait_separation_ruling === control.ruling.portrait_separation_ruling && review.canonical_mutation === false, 'UC-171 source review drift');
  assert(voice.record_id === 'UC-171' && voice.actor === 'Rob Paulsen' && Object.keys(voice.roles || {}).length === 3 && voice.roles?.raphael?.selected_image?.sha256 === exactExpected(control, 'raphael-1987-original.webp').sha256 && voice.chronology_boundary?.later_donatello_cannot_substitute === true && voice.composite_boundary?.existing_performer_portrait === 'images/uc-171-portrait.jpg' && voice.canonical_mutation === false, 'UC-171 source exact voice boundary drift');
  assert(yakkoRaw.includes('voiced by'), 'UC-171 Yakko exact revision lost voiced-by evidence');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && (duplicates.items || []).length === control.denominators.duplicate_item_count && duplicates.items.every(item => Array.isArray(item.matches) && item.matches.length === 0), 'UC-171 source duplicate boundary drift');
  return { manifest, review, voice, duplicates };
}
