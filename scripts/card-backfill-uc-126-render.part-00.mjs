#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-126-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-126-render';
const PACKET = join(OUT, 'UC-126');
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
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-126', 'UC-126 render scope drift');
assert(control.actor === 'Tara Strong' && control.character === 'Bubbles, Timmy, Harley & Twilight' && control.production === 'Powerpuff Girls / Fairly OddParents / etc.' && control.year === 1998 && control.side === 'still', 'UC-126 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8707338950 && control.discovery_artifact?.head_sha === '02acc54f5795219f8e2f4a4b851a2766c91a4a22' && control.discovery_artifact?.candidate_count === 30, 'UC-126 discovery custody drift');
assert(control.roles?.length === 4 && control.actor_role_custody?.length === 5 && control.failed_discovery_checkpoints?.length === 6, 'UC-126 render denominator drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.panel_width === 624 && control.render?.panel_height === 494 && control.render?.vertical_divider_width === 12 && control.render?.horizontal_divider_height === 12, 'UC-126 render geometry drift');
await mkdir(PACKET, { recursive: true });

const manifestReceipt = await receipt(join(SOURCE_ROOT, 'manifest.json'), { sha256: control.discovery_artifact.manifest_sha256 });
const summaryReceipt = await receipt(join(SOURCE_ROOT, 'summary.json'), { sha256: control.discovery_artifact.summary_sha256 });
const contactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-all-roles.jpg'), { sha256: control.discovery_artifact.contact_sheet_sha256 });
const roleContactReceipts = {};
for (const key of ['bubbles','timmy','harley','twilight']) roleContactReceipts[key] = await receipt(join(SOURCE_ROOT, `contact-sheet-${key}.jpg`), { sha256: control.discovery_artifact.role_contact_sheet_sha256s[key] });
const discoveryManifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
const discoverySummary = await readJson(join(SOURCE_ROOT, 'summary.json'));
assert(discoveryManifest.record_id === 'UC-126' && discoveryManifest.actor === 'Tara Strong' && discoveryManifest.character === 'Bubbles, Timmy, Harley & Twilight', 'UC-126 discovery manifest identity drift');
assert(discoveryManifest.candidate_count === 30 && JSON.stringify(discoveryManifest.role_counts) === JSON.stringify({ bubbles: 3, timmy: 3, harley: 8, twilight: 16 }), 'UC-126 discovery candidate denominator drift');
assert(discoverySummary.candidate_count === 30 && discoverySummary.bubbles_probe_artifact?.artifact_id === 8707180738 && discoverySummary.failed_discovery_checkpoints?.length === 6, 'UC-126 discovery summary custody drift');
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const actorRoleRows = [];
for (const row of control.actor_role_custody) {
  const evidence = discoveryManifest.page_evidence?.[row.key];
  assert(evidence, `missing actor-role evidence ${row.key}`);
  if (row.reference_only === true) {
    assert(evidence.status === 'reference-only-external-verification' && evidence.externally_verified === true, `${row.key} reference-only custody drift`);
    actorRoleRows.push({ control: row, evidence, screenshot: null });
    continue;
  }
  assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${row.key} transport drift`);
  assert(evidence.title === row.page_title && evidence.body_sha256 === row.body_sha256 && evidence.required_terms_missing.length === 0, `${row.key} page evidence drift`);
  const screenshot = await retain(row.artifact_path, row.output_path, { sha256: row.sha256, mime: 'image/png', bytes: row.bytes, width: row.width, height: row.height });
  actorRoleRows.push({ control: row, evidence, screenshot });
}
