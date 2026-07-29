#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-172-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-172-render';
const PACKET = join(OUT, 'UC-172');
const WORK = join(OUT, 'work');
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
  if (bytes.length >= 12 && bytes.subarray(0,4).toString('ascii') === 'RIFF' && bytes.subarray(8,12).toString('ascii') === 'WEBP') return 'image/webp';
  return 'unknown';
}
function identify(path) {
  const text = execFileSync(process.env.MAGICK_CMD || 'magick', ['identify','-format','%w %h',path], { encoding:'utf8' }).trim();
  const [width,height] = text.split(/\s+/).map(Number);
  assert(width > 0 && height > 0, `cannot identify ${path}`);
  return { width, height };
}
function magick(...args) {
  execFileSync(process.env.MAGICK_CMD || 'magick', args, { stdio:'inherit' });
}
async function walkImages(root, out = []) {
  let entries;
  try { entries = await readdir(root, { withFileTypes:true }); } catch { return out; }
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
    for (const [path,row] of Object.entries(manifest.assets || {})) {
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
  const row = { bytes:bytes.length, sha256:sha(bytes), mime, ...(image ? identify(path) : {}) };
  if (expected.sha256) assert(row.sha256 === expected.sha256, `${path} hash drift ${row.sha256}`);
  if (expected.mime) assert(row.mime === expected.mime, `${path} MIME drift ${row.mime}`);
  if (expected.bytes !== undefined) assert(row.bytes === expected.bytes, `${path} byte drift ${row.bytes}`);
  if (expected.width !== undefined) assert(row.width === expected.width, `${path} width drift ${row.width}`);
  if (expected.height !== undefined) assert(row.height === expected.height, `${path} height drift ${row.height}`);
  return row;
}
async function retain(inputRel, outputName, expected = {}) {
  const output = join(PACKET, outputName);
  await copyFile(join(SOURCE_ROOT, inputRel), output);
  return { path:outputName, ...(await receipt(output, expected)) };
}

const control = await readJson(CONTROL);
assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-172', 'UC-172 render scope drift');
assert(control.kind === 'voice' && control.actor === 'Jim Cummings' && control.character === 'Winnie the Pooh, Tigger, Darkwing Duck' && control.production === 'Disney' && control.years === '1980s–' && control.side === 'still', 'UC-172 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8731043623 && control.discovery_artifact?.head_sha === 'e02bb4a6e21fce4b4d1d4ccd861ce95d603aafe6' && control.discovery_artifact?.candidate_count === 25, 'UC-172 discovery custody drift');
assert(control.failed_discovery_checkpoints?.length === 0 && control.identity_custody?.length === 3 && control.roles?.length === 3, 'UC-172 render denominator drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.panel_width === 412 && control.render?.divider_width === 12 && control.render?.face_height === 560 && control.render?.internal_rule_height === 8 && control.render?.body_height === 432, 'UC-172 render geometry drift');
await mkdir(PACKET, { recursive:true });
await mkdir(WORK, { recursive:true });

const discoveryManifestReceipt = await receipt(join(SOURCE_ROOT,'manifest.json'), { sha256:control.discovery_artifact.manifest_sha256, bytes:control.discovery_artifact.manifest_bytes });
const discoverySummaryReceipt = await receipt(join(SOURCE_ROOT,'summary.json'), { sha256:control.discovery_artifact.summary_sha256, bytes:control.discovery_artifact.summary_bytes });
const discoveryContactReceipt = await receipt(join(SOURCE_ROOT,'contact-sheet-all-roles.jpg'), { sha256:control.discovery_artifact.contact_sheet_sha256, bytes:control.discovery_artifact.contact_sheet_bytes, mime:'image/jpeg', width:1632, height:644 });
const discoveryManifest = await readJson(join(SOURCE_ROOT,'manifest.json'));
const discoverySummary = await readJson(join(SOURCE_ROOT,'summary.json'));
assert(discoveryManifest.record_id === 'UC-172' && discoveryManifest.actor === 'Jim Cummings' && discoveryManifest.character === 'Winnie the Pooh, Tigger, Darkwing Duck' && discoveryManifest.side === 'still', 'UC-172 discovery manifest identity drift');
assert(discoveryManifest.candidate_count === 25 && JSON.stringify(discoveryManifest.role_counts) === JSON.stringify({pooh:10,tigger:8,darkwing:7}), 'UC-172 discovery manifest denominator drift');
assert(discoverySummary.candidate_count === 25 && JSON.stringify(discoverySummary.role_counts) === JSON.stringify({pooh:10,tigger:8,darkwing:7}), 'UC-172 discovery summary denominator drift');
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const identityRows = [];
for (const spec of control.identity_custody) {
  const evidence = discoveryManifest.page_evidence?.[spec.key];
  assert(evidence?.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${spec.key} strict transport drift`);
  assert(evidence.title === spec.page_title && evidence.body_sha256 === spec.body_sha256 && evidence.required_terms_missing.length === 0, `${spec.key} strict evidence drift`);
  const screenshot = await retain(spec.artifact_path, spec.output_path, { sha256:spec.sha256, mime:'image/png', bytes:spec.bytes, width:spec.width, height:spec.height });
  identityRows.push({ spec, evidence, screenshot });
}

const roleRows = [];
for (const spec of control.roles) {
  const candidate = (discoveryManifest.candidates || []).find(row => row.role_key === spec.key && row.sha256 === spec.sha256);
  assert(candidate, `${spec.key} selected candidate missing`);
  assert(candidate.file_title === spec.file_title && candidate.local === spec.artifact_path && candidate.pageimage_source === true && candidate.width === spec.width && candidate.height === spec.height && candidate.bytes === spec.bytes && candidate.mime === spec.mime, `${spec.key} selected candidate drift`);
  assert(Array.isArray(candidate.repository_matches) && candidate.repository_matches.length === 0, `${spec.key} repository duplicate drift`);
  const rolePage = discoveryManifest.role_pages?.[spec.key];
  assert(rolePage && rolePage.raw_revision_sha256 === spec.raw_sha256 && rolePage.primary_api_sha256 === spec.primary_api_sha256, `${spec.key} role page custody drift`);
  assert(!(repository.get(spec.sha256) || []).length, `${spec.key} selected source duplicates canonical media`);
  const source = await retain(spec.artifact_path, spec.output_path, { sha256:spec.sha256, mime:spec.mime, bytes:spec.bytes, width:spec.width, height:spec.height });
  const raw = await retain(spec.raw_artifact_path, spec.raw_output_path, { sha256:spec.raw_sha256, bytes:spec.raw_bytes });
  const primaryApi = await retain(spec.primary_api_artifact_path, spec.primary_api_output_path, { sha256:spec.primary_api_sha256, bytes:spec.primary_api_bytes });
  const imageApi = await retain(spec.image_api_artifact_path, spec.image_api_output_path, { sha256:spec.image_api_sha256, bytes:spec.image_api_bytes });
  roleRows.push({ spec, candidate, rolePage, source, raw, primaryApi, imageApi });
}

const exactVoiceRecord = {
  version:1,
  record_id:'UC-172',
  kind:'voice',
  actor:'Jim Cummings',
  character:'Winnie the Pooh, Tigger, Darkwing Duck',
  production:'Disney',
  canonical_years:'1980s–',
  side:'still',
  expected_subject:'Winnie the Pooh, Tigger, Darkwing Duck',
  chronology_boundary:{
    pooh:'Jim Cummings-era Winnie the Pooh, proven by the 2003 D23 cast record',
    tigger:'Jim Cummings-era Tigger, proven by the 2003 D23 cast record',
    darkwing:'Darkwing Duck animated television series, beginning in 1991',
    canonical_years_semantics:'1980s– is a broad Jim Cummings career envelope and is not a shared role-debut date.',
    sterling_holloway_pooh_cannot_substitute:true,
    paul_winchell_tigger_cannot_substitute:true
  },
  actor_role_bindings:Object.fromEntries(identityRows.map(({spec,evidence,screenshot}) => [spec.key, {
    provider:spec.provider,
    source_page:spec.page_url,
    binding:spec.binding,
    strict:true,
    page_title:evidence.title,
    body_sha256:evidence.body_sha256,
    page_screenshot_sha256:screenshot.sha256
  }])),
  roles:Object.fromEntries(roleRows.map(({spec,source,raw,primaryApi,imageApi}) => [spec.key, {
    role:spec.role,
    display_label:spec.display_label,
    source_page:spec.source_page,
    file_title:spec.file_title,
    selected_image:source,
    raw_revision:raw,
    primary_api_receipt:primaryApi,
    image_api_receipt:imageApi,
    chronology:spec.chronology,
    selection_ruling:spec.selection_ruling
  }])),
  composite_boundary:{
    required_roles:['pooh','tigger','darkwing'],
    all_three_faces_bodies_and_design_silhouettes_must_be_legible:true,
    earlier_pooh_and_tigger_voice_performers_cannot_substitute:true,
    park_costumes_live_action_merchandise_and_generic_disney_ensembles_forbidden:true,
    existing_performer_portrait:'images/uc-172-portrait.jpg',
    existing_performer_portrait_must_remain_unchanged:true
  },
  failed_discovery_checkpoints:[],
  canonical_mutation:false
};
await writeJson(join(PACKET,'exact-voice-record.json'), exactVoiceRecord);
const voiceRecordReceipt = await receipt(join(PACKET,'exact-voice-record.json'));

async function renderPanel(row) {
  const key = row.spec.key;
  const face = join(WORK, `${key}-face.png`);
  const body = join(WORK, `${key}-body.png`);
  const rule = join(WORK, `${key}-rule.png`);
  const panel = join(WORK, `${key}-panel.png`);
  magick(join(PACKET,row.source.path), '-auto-orient','-filter',control.render.filter,
    '-resize',`${control.render.panel_width}x${control.render.face_height}^`,
    '-gravity',control.render.face_gravity[key],
    '-background',control.render.background,
    '-extent',`${control.render.panel_width}x${control.render.face_height}`,
    '-flatten',face);
  magick(join(PACKET,row.source.path), '-auto-orient','-filter',control.render.filter,
    '-resize',`${control.render.body_box.width}x${control.render.body_box.height}`,
    '-gravity','center',
    '-background',control.render.background,
    '-extent',`${control.render.panel_width}x${control.render.body_height}`,
    '-flatten',body);
  magick('-size',`${control.render.panel_width}x${control.render.internal_rule_height}`,`xc:${control.render.divider}`,rule);
  magick(face,rule,body,'-append',panel);
  assert(identify(panel).width === control.render.panel_width && identify(panel).height === control.render.panel_height, `${key} panel geometry drift`);
  return panel;
}
const panels = [];
for (const row of roleRows) panels.push(await renderPanel(row));
const divider = join(WORK,'divider.png');
magick('-size',`${control.render.divider_width}x${control.render.panel_height}`,`xc:${control.render.divider}`,divider);
const candidatePath = join(PACKET,'uc-172-still-candidate.jpg');
magick(panels[0],divider,panels[1],divider,panels[2],'+append','-strip','-quality',String(control.render.jpeg_quality),candidatePath);
const candidate = { path:'uc-172-still-candidate.jpg', ...(await receipt(candidatePath,{mime:'image/jpeg',width:1260,height:1000})) };
const cropPath = join(PACKET,'card-crop-preview.jpg');
magick(candidatePath,'-gravity',control.render.wall_gravity,'-crop',`${control.render.wall_width}x${control.render.wall_height}+0+0`,'+repage','-strip','-quality',String(control.render.jpeg_quality),cropPath);
const cropPreview = { path:'card-crop-preview.jpg', ...(await receipt(cropPath,{mime:'image/jpeg',width:1246,height:1000})) };
