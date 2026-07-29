#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-172-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-172';
const sha = value => createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/<[^>]+>/g, ' ').replace(/&(?:[a-z][a-z0-9]{1,31}|#\d{1,7}|#x[0-9a-f]{1,6});/gi, ' ').replace(/[^a-zA-Z0-9']+/g, ' ').trim().toLowerCase();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); };

function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP') return 'image/webp';
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
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-172', 'UC-172 apply scope drift');
  assert(control.kind === 'voice' && control.actor === 'Jim Cummings' && control.character === 'Winnie the Pooh, Tigger, Darkwing Duck' && control.production === 'Disney' && control.years === '1980s–' && control.side === 'still', 'UC-172 apply identity drift');
  assert(control.reviewed_role === 'second-desk' && control.render_artifact?.artifact_id === 8731415645 && control.render_artifact?.head_sha === 'e646764d6905235ebd570f2aab426191860ef716' && control.render_artifact?.upload_digest_sha256 === '862ec8e873f5c5e2f9dc2292b2fe40bb006d002f82e204789c49e46551ea71b9', 'UC-172 render custody drift');
  assert(Object.keys(control.expected_files || {}).length === 23 && control.denominators?.packet_file_count === 23 && control.denominators?.checksum_row_count === 22, 'UC-172 packet denominator drift');
  assert(control.denominators?.selected_role_count === 3 && control.denominators?.actor_role_binding_count === 3 && control.denominators?.strict_actor_role_page_count === 3 && control.denominators?.raw_revision_count === 3 && control.denominators?.api_receipt_count === 6 && control.denominators?.failed_discovery_checkpoint_count === 0 && control.denominators?.duplicate_item_count === 5 && control.denominators?.repository_hash_count === 2070 && control.denominators?.discovery_candidate_count === 25, 'UC-172 evidence denominator drift');
  assert(control.ruling?.identity === 'exact-three-role-subject-set' && control.ruling?.presentation === 'three-role-animated-character-composite' && control.ruling?.crop_ruling === 'pass-face-and-full-source-triptych' && control.ruling?.chronology_ruling === 'pass-cummings-era-inheritance-and-1991-boundaries' && control.ruling?.inheritance_ruling === 'pass-pooh-and-tigger-predecessor-separation' && control.ruling?.portrait_separation_ruling === 'pass-existing-performer-portrait-unchanged' && control.ruling?.canonical_mutation === false, 'UC-172 review ruling drift');
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
  assert(lines.length === expectedRows, `UC-172 checksum row count drift ${lines.length}`);
  const names = [];
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match, `malformed UC-172 checksum row ${line}`);
    names.push(match[2]);
    assert(sha(await readFile(join(root, match[2]))) === match[1], `${match[2]} checksum drift`);
  }
  assert(JSON.stringify(names.sort()) === JSON.stringify(expectedNames.filter(name => name !== 'SHA256SUMS').sort()), 'UC-172 checksum filename set drift');
}
async function verifySourcePacket(control) {
  assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
  const expectedNames = Object.keys(control.expected_files).sort();
  const names = (await readdir(SOURCE_ROOT)).sort();
  assert(JSON.stringify(names) === JSON.stringify(expectedNames), `UC-172 source packet file set drift: ${names.join(', ')}`);
  for (const name of expectedNames) await verifyFile(SOURCE_ROOT, name, exactExpected(control, name));
  await verifyChecksums(SOURCE_ROOT, expectedNames, control.denominators.checksum_row_count);

  const manifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
  const review = await readJson(join(SOURCE_ROOT, 'review.json'));
  const voice = await readJson(join(SOURCE_ROOT, 'exact-voice-record.json'));
  const duplicates = await readJson(join(SOURCE_ROOT, 'duplicate-scan.json'));
  const poohRaw = norm(await readFile(join(SOURCE_ROOT, 'source-raw-pooh.wikitext'), 'utf8'));
  const tiggerRaw = norm(await readFile(join(SOURCE_ROOT, 'source-raw-tigger.wikitext'), 'utf8'));
  const darkwingRaw = norm(await readFile(join(SOURCE_ROOT, 'source-raw-darkwing.wikitext'), 'utf8'));

  assert(manifest.record_id === 'UC-172' && manifest.kind === 'voice' && manifest.actor === 'Jim Cummings' && manifest.character === 'Winnie the Pooh, Tigger, Darkwing Duck' && manifest.production === 'Disney' && manifest.years === '1980s–' && manifest.side === 'still', 'UC-172 source manifest identity drift');
  assert(manifest.custody?.discovery_artifact?.artifact_id === 8731043623 && manifest.custody?.discovery_artifact?.candidate_count === 25 && manifest.custody?.failed_discovery_checkpoints?.length === 0, 'UC-172 source discovery custody drift');
  const bindings = Object.values(manifest.actor_role_custody || {});
  assert(bindings.length === 3 && bindings.every(row => row.strict === true), 'UC-172 source actor-role denominator drift');
  assert(Object.keys(manifest.roles || {}).length === 3, 'UC-172 source role denominator drift');
  assert(manifest.roles?.pooh?.original?.sha256 === exactExpected(control, 'pooh-original.webp').sha256 && manifest.roles?.pooh?.file_title === 'File:Profile - Winnie the Pooh.png', 'UC-172 Pooh source drift');
  assert(manifest.roles?.tigger?.original?.sha256 === exactExpected(control, 'tigger-original.webp').sha256 && manifest.roles?.tigger?.file_title === 'File:Profile - Tigger.png', 'UC-172 Tigger source drift');
  assert(manifest.roles?.darkwing?.original?.sha256 === exactExpected(control, 'darkwing-original.webp').sha256 && manifest.roles?.darkwing?.file_title === 'File:Darkwing Duck keyart.png', 'UC-172 Darkwing source drift');
  assert(manifest.chronology_boundary?.sterling_holloway_pooh_cannot_substitute === true && manifest.chronology_boundary?.paul_winchell_tigger_cannot_substitute === true && manifest.chronology_boundary?.darkwing.includes('1991'), 'UC-172 source chronology drift');
  assert(manifest.composite_boundary?.required_roles?.join(',') === 'pooh,tigger,darkwing' && manifest.composite_boundary?.earlier_pooh_and_tigger_voice_performers_cannot_substitute === true && manifest.composite_boundary?.existing_performer_portrait === 'images/uc-172-portrait.jpg' && manifest.composite_boundary?.existing_performer_portrait_must_remain_unchanged === true, 'UC-172 source composite boundary drift');
  assert(manifest.candidate?.sha256 === exactExpected(control, 'uc-172-still-candidate.jpg').sha256 && manifest.crop_preview?.sha256 === exactExpected(control, 'card-crop-preview.jpg').sha256, 'UC-172 source candidate drift');
  assert(manifest.exact_voice_record?.sha256 === exactExpected(control, 'exact-voice-record.json').sha256 && manifest.canonical_mutation === false, 'UC-172 source exact voice receipt drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.inheritance_ruling === control.ruling.inheritance_ruling && review.portrait_separation_ruling === control.ruling.portrait_separation_ruling && review.canonical_mutation === false, 'UC-172 source review drift');
  assert(voice.record_id === 'UC-172' && voice.actor === 'Jim Cummings' && Object.keys(voice.roles || {}).length === 3 && voice.roles?.pooh?.selected_image?.sha256 === exactExpected(control, 'pooh-original.webp').sha256 && voice.roles?.tigger?.selected_image?.sha256 === exactExpected(control, 'tigger-original.webp').sha256 && voice.roles?.darkwing?.selected_image?.sha256 === exactExpected(control, 'darkwing-original.webp').sha256 && voice.chronology_boundary?.sterling_holloway_pooh_cannot_substitute === true && voice.chronology_boundary?.paul_winchell_tigger_cannot_substitute === true && voice.composite_boundary?.existing_performer_portrait === 'images/uc-172-portrait.jpg' && voice.canonical_mutation === false, 'UC-172 source exact voice boundary drift');
  assert(poohRaw.includes('sterling holloway') && poohRaw.includes('jim cummings'), 'UC-172 Pooh predecessor ledger missing');
  assert(tiggerRaw.includes('paul winchell') && tiggerRaw.includes('jim cummings'), 'UC-172 Tigger predecessor ledger missing');
  assert(darkwingRaw.includes('jim cummings'), 'UC-172 Darkwing voice ledger missing');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && (duplicates.items || []).length === 5 && duplicates.items.every(item => Array.isArray(item.matches) && item.matches.length === 0), 'UC-172 source duplicate boundary drift');
  return { manifest, review, voice, duplicates };
}
