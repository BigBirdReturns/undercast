#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-124-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-124-render';
const PACKET = join(OUT, 'UC-124');
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
};
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
function magick(...args) {
  execFileSync(process.env.MAGICK_CMD || 'magick', args, { stdio: 'inherit' });
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
async function receipt(path, expected = {}) {
  const bytes = await readFile(path);
  const mime = signatureMime(bytes);
  const image = mime !== 'unknown';
  const row = { bytes: bytes.length, sha256: sha(bytes), mime, ...(image ? identify(path) : {}) };
  if (expected.sha256) assert(row.sha256 === expected.sha256, `${path} hash drift ${row.sha256}`);
  if (expected.mime) assert(row.mime === expected.mime, `${path} MIME drift ${row.mime}`);
  if (expected.bytes !== undefined) assert(row.bytes === expected.bytes, `${path} byte drift ${row.bytes}`);
  if (expected.width !== undefined) assert(row.width === expected.width, `${path} width drift ${row.width}`);
  if (expected.height !== undefined) assert(row.height === expected.height, `${path} height drift ${row.height}`);
  return row;
}
async function retain(inputRel, outputName, expected) {
  const output = join(PACKET, outputName);
  await copyFile(join(SOURCE_ROOT, inputRel), output);
  return { path: outputName, ...(await receipt(output, expected)) };
}
function evidenceByKey(manifest, key) {
  const row = manifest.page_evidence?.[key];
  assert(row, `missing page evidence ${key}`);
  return row;
}
function verifyEvidence(evidence, row, label) {
  assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${label} transport drift`);
  assert(evidence.title === row.page_title, `${label} title drift`);
  if (row.required_terms) assert(JSON.stringify(evidence.required_terms) === JSON.stringify(row.required_terms) && evidence.required_terms_missing.length === 0, `${label} term drift`);
  assert(sha(Buffer.from(evidence.body_text || '', 'utf8')) === row.body_sha256, `${label} body receipt drift`);
  assert(evidence.screenshot?.sha256 === row.sha256 && evidence.screenshot?.bytes === row.bytes && evidence.screenshot?.width === row.width && evidence.screenshot?.height === row.height, `${label} screenshot receipt drift`);
}

const control = await readJson(CONTROL);
assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-124', 'UC-124 render scope drift');
assert(control.actor === 'James Earl Jones' && control.character === 'Mufasa (and Darth Vader)' && control.production === 'The Lion King / Star Wars' && control.year === 1994 && control.side === 'still', 'UC-124 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8701028244 && control.discovery_artifact?.head_sha === 'ff6abc352fd56a14c02758a487c643f3ec97d802', 'UC-124 discovery custody drift');
assert(control.roles?.length === 2 && control.actor_role_custody?.length === 3, 'UC-124 render denominator drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.panel_width === 624 && control.render?.divider_width === 12 && control.render?.face_height === 572 && control.render?.internal_rule_height === 8 && control.render?.context_height === 420, 'UC-124 render geometry drift');
await mkdir(PACKET, { recursive: true });

const discoveryManifestPath = join(SOURCE_ROOT, 'manifest.json');
const discoverySummaryPath = join(SOURCE_ROOT, 'summary.json');
const manifestReceipt = await receipt(discoveryManifestPath, { sha256: control.discovery_artifact.manifest_sha256 });
const summaryReceipt = await receipt(discoverySummaryPath, { sha256: control.discovery_artifact.summary_sha256 });
const contactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-all-roles.jpg'), { sha256: control.discovery_artifact.contact_sheet_sha256 });
const mufasaContactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-mufasa.jpg'), { sha256: control.discovery_artifact.mufasa_contact_sha256 });
const vaderContactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-vader.jpg'), { sha256: control.discovery_artifact.vader_contact_sha256 });
const discoveryManifest = await readJson(discoveryManifestPath);
