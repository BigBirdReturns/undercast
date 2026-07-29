#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const command = process.argv[2] || 'materialize';
const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-126-APPLY.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const DEST = process.env.DEST || 'data/review/card-backfill/UC-126';
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
  try { const manifest = await readJson('data/media-manifest.json'); for (const [path, row] of Object.entries(manifest.assets || {})) { if (!/^[0-9a-f]{64}$/i.test(row?.sha256 || '')) continue; const list = map.get(row.sha256) || []; list.push(`manifest:${path}`); map.set(row.sha256, list); } } catch {}
  for (const path of await walkImages('images')) { try { const hash = sha(await readFile(path)); const list = map.get(hash) || []; list.push(`file:${path}`); map.set(hash, list); } catch {} }
  return map;
}
function trailingWhitespaceLines(text) { return text.split('\n').map((line, index) => line.replace(/\r$/, '').match(/[ \t]+$/) ? index + 1 : null).filter(Boolean); }

const expectedFiles = [
  'SHA256SUMS','bubbles-original.webp','card-crop-preview.jpg','duplicate-scan.json','exact-role-record.json','harley-original.webp','manifest.json','review.json','review.md',
  'source-page-bubbles.png','source-page-dc-tara-strong-harley.png','source-page-harley.png','source-page-timmy.png','source-page-twilight.png','source-page-vanity-fair-tara-strong-roles.png',
  'source-wikitext-bubbles.txt','source-wikitext-harley.txt','source-wikitext-timmy.txt','source-wikitext-twilight.txt','timmy-original.webp','twilight-original.webp','uc-126-still-candidate.jpg'
];

async function loadControl() {
  const control = await readJson(CONTROL);
  assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-126', 'UC-126 apply scope drift');
  assert(control.actor === 'Tara Strong' && control.character === 'Bubbles, Timmy, Harley & Twilight' && control.production === 'Powerpuff Girls / Fairly OddParents / etc.' && control.year === 1998 && control.side === 'still' && control.reviewed_role === 'second-desk', 'UC-126 apply authority drift');
  assert(control.render_artifact?.artifact_id === 8708945847 && control.render_artifact?.head_sha === 'bb45549262a7604769f9d3342e7e31374c6e0b24' && control.render_artifact?.zip_sha256 === 'ad2bdf9539fc5624c29877363d10b3b1e9827e6b510b5983e411d3d55f723bf7', 'UC-126 render custody drift');
  assert(control.expected?.packet_file_count === 22 && control.expected?.duplicate_item_count === 6 && control.expected?.duplicate_repository_hash_count === 2070 && control.expected?.selected_asset_count === 4 && control.expected?.discovery_candidate_count === 30 && control.expected?.failed_discovery_count === 6 && control.expected?.strict_actor_role_page_count === 2 && control.expected?.reference_only_actor_role_page_count === 3 && control.expected?.controlled_resolution_exception_count === 1, 'UC-126 packet denominator drift');
  assert(control.ruling?.identity === 'expected-subjects' && control.ruling?.presentation === 'four-role-character-composite' && control.ruling?.crop_ruling === 'pass-four-panel-grid-layout' && control.ruling?.chronology_ruling === 'pass-1998-bubbles-chronology-separated-from-timmy-harley-and-twilight' && control.ruling?.resolution_ruling === 'pass-bubbles-controlled-historical-source-enlargement' && control.ruling?.canonical_mutation === false, 'UC-126 ruling drift');
  const immutableExpectations = {
    'source-wikitext-bubbles.txt': { expected: control.expected.bubbles_wikitext, lines: [29,105,107,109] },
    'source-wikitext-timmy.txt': { expected: control.expected.timmy_wikitext, lines: [20,47,82,83,144] },
    'source-wikitext-twilight.txt': { expected: control.expected.twilight_wikitext, lines: [25,301,307,324] }
  };
  for (const [name, row] of Object.entries(immutableExpectations)) {
    const exception = control.immutable_source_exceptions?.[name];
    assert(exception?.sha256 === row.expected.sha256, `${name} immutable exception hash drift`);
    assert(JSON.stringify(exception?.trailing_whitespace_lines) === JSON.stringify(row.lines), `${name} immutable whitespace ledger drift`);
  }
  return control;
}
async function verifyFile(name, expected = {}) {
  const row = await receipt(join(SOURCE_ROOT, name));
  if (expected.sha256) assert(row.sha256 === expected.sha256, `${name} source hash drift`);
  if (expected.mime) assert(row.mime === expected.mime, `${name} source MIME drift`);
  if (expected.bytes !== undefined) assert(row.bytes === expected.bytes, `${name} source byte drift`);
  return row;
}
