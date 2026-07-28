#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-107-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-107-render';
const PACKET = join(OUT, 'UC-107');
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
function magick(...args) { execFileSync(process.env.MAGICK_CMD || 'magick', args, { stdio: 'inherit' }); }
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
  const image = /\.(?:jpe?g|png|webp)$/i.test(path);
  const row = { bytes: bytes.length, sha256: sha(bytes), mime: signatureMime(bytes), ...(image ? identify(path) : {}) };
  if (expected.sha256) assert(row.sha256 === expected.sha256, `${path} hash drift ${row.sha256}`);
  if (expected.mime) assert(row.mime === expected.mime, `${path} MIME drift ${row.mime}`);
  if (expected.bytes !== undefined) assert(row.bytes === expected.bytes, `${path} byte drift ${row.bytes}`);
  if (expected.width !== undefined) assert(row.width === expected.width, `${path} width drift ${row.width}`);
  if (expected.height !== undefined) assert(row.height === expected.height, `${path} height drift ${row.height}`);
  return row;
}
async function retainFile(inputRel, outputName, expected) {
  const output = join(PACKET, outputName);
  await copyFile(join(SOURCE_ROOT, inputRel), output);
  return { path: outputName, ...(await receipt(output, expected)) };
}
function verifyPageEvidence(manifest, key, expected) {
  const row = manifest.page_evidence?.[key];
  assert(row, `missing discovery page evidence ${key}`);
  assert(row.status === 'loaded' && row.http_status === 200, `${key} transport drift`);
  assert(row.title === expected.title, `${key} title drift`);
  assert(Array.isArray(row.required_terms_missing) && row.required_terms_missing.length === 0, `${key} required-term drift`);
  assert(JSON.stringify(row.required_terms) === JSON.stringify(expected.required_terms), `${key} required-term denominator drift`);
  assert(sha(Buffer.from(row.body_text || '', 'utf8')) === expected.body_sha256, `${key} body receipt drift`);
  return row;
}

const control = await readJson(CONTROL);
assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-107', 'UC-107 render scope drift');
assert(control.actor === 'Pedro Pascal' && control.character === 'The Mandalorian' && control.production === 'The Mandalorian' && control.year === 2019 && control.side === 'still', 'UC-107 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8673117402 && control.discovery_artifact?.head_sha === 'b640488402fcd6b619402cf40bb8913525121c4b', 'UC-107 discovery custody drift');
assert(control.selected_source?.sha256 === '0305588c69ada14b52dde327ec4ea71cc7ab8c97d3b88a97f7dbd9a8db9f6bfd', 'UC-107 selected source drift');
assert(control.embodiment_boundary?.frame_specific_physical_occupant === 'not asserted', 'UC-107 embodiment boundary drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.candidate_gravity === 'east', 'UC-107 render geometry drift');
await mkdir(PACKET, { recursive: true });

const discoveryManifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
await receipt(join(SOURCE_ROOT, 'manifest.json'), { sha256: control.discovery_artifact.manifest_sha256 });
await receipt(join(SOURCE_ROOT, 'summary.json'), { sha256: control.discovery_artifact.summary_sha256 });
await receipt(join(SOURCE_ROOT, 'contact-sheet-final.jpg'), { sha256: control.discovery_artifact.contact_sheet_sha256 });
assert(discoveryManifest.record_id === 'UC-107' && discoveryManifest.actor === 'Pedro Pascal' && discoveryManifest.character === 'The Mandalorian' && discoveryManifest.production === 'The Mandalorian', 'discovery manifest identity drift');
assert(discoveryManifest.candidate_count === control.discovery_artifact.candidate_count, 'discovery candidate count drift');
assert(discoveryManifest.represented_asset_keys?.length === control.discovery_artifact.represented_asset_count, 'discovery represented asset count drift');
assert(discoveryManifest.identity_boundary?.prohibited_inference === 'The evidence does not claim that Pascal was the physical occupant of the armor in any selected frame.', 'discovery embodiment boundary drift');
const selectedDiscovery = (discoveryManifest.candidates || []).find(row => row.local === control.selected_source.artifact_path);
assert(selectedDiscovery?.sha256 === control.selected_source.sha256 && selectedDiscovery?.asset_key === control.selected_source.asset_key && selectedDiscovery?.admission_class === 'final-character-frame' && selectedDiscovery?.repository_matches?.length === 0, 'selected discovery candidate drift');

const frameEvidence = verifyPageEvidence(discoveryManifest, 'disney-plus-first-look', {
  title: control.selected_source.page_title,
  required_terms: control.selected_source.required_terms,
  body_sha256: control.selected_source.page_body_sha256
});
const actorEvidence = verifyPageEvidence(discoveryManifest, 'lucasfilm-cast-announcement', control.role_custody.actor_role);
const launchEvidence = verifyPageEvidence(discoveryManifest, 'star-wars-celebration-2019', control.role_custody.production_launch);

const repository = await repositoryHashes();
const repositoryCount = process.env.REPOSITORY_HASH_COUNT_OVERRIDE ? Number(process.env.REPOSITORY_HASH_COUNT_OVERRIDE) : repository.size;
assert(repositoryCount === control.expected_repository_hash_count, `repository hash denominator drift ${repositoryCount}`);

const selected = await retainFile(control.selected_source.artifact_path, control.selected_source.output_path, {
  sha256: control.selected_source.sha256,
  mime: control.selected_source.mime,
  bytes: control.selected_source.bytes,
  width: control.selected_source.width,
  height: control.selected_source.height
});
const framePage = await retainFile(control.selected_source.page_artifact_path, control.selected_source.page_output_path, {
  sha256: control.selected_source.page_sha256,
  mime: 'image/png', bytes: control.selected_source.page_bytes, width: control.selected_source.page_width, height: control.selected_source.page_height
});
const actorPage = await retainFile(control.role_custody.actor_role.artifact_path, control.role_custody.actor_role.output_path, {
  sha256: control.role_custody.actor_role.sha256,
  mime: 'image/png', bytes: control.role_custody.actor_role.bytes, width: control.role_custody.actor_role.width, height: control.role_custody.actor_role.height
});
const launchPage = await retainFile(control.role_custody.production_launch.artifact_path, control.role_custody.production_launch.output_path, {
  sha256: control.role_custody.production_launch.sha256,
  mime: 'image/png', bytes: control.role_custody.production_launch.bytes, width: control.role_custody.production_launch.width, height: control.role_custody.production_launch.height
});

const roleRecord = {
  version: 1,
  record_id: 'UC-107',
  actor: 'Pedro Pascal',
  character: 'The Mandalorian',
  production: 'The Mandalorian',
  year: 2019,
  character_frame: {
    provider: control.selected_source.provider,
    source_page: control.selected_source.page_url,
    page_title: frameEvidence.title,
    required_terms: frameEvidence.required_terms,
    body_sha256: control.selected_source.page_body_sha256,
    page_screenshot_sha256: framePage.sha256,
    selected_image_sha256: selected.sha256,
    caption: control.selected_source.caption,
    binding: control.embodiment_boundary.character_frame_custody
  },
  actor_role: {
    provider: control.role_custody.actor_role.provider,
    source_page: control.role_custody.actor_role.page_url,
    page_title: actorEvidence.title,
    required_terms: actorEvidence.required_terms,
    body_sha256: control.role_custody.actor_role.body_sha256,
    page_screenshot_sha256: actorPage.sha256,
    binding: control.role_custody.actor_role.binding
  },
  production_launch: {
    provider: control.role_custody.production_launch.provider,
    source_page: control.role_custody.production_launch.page_url,
    page_title: launchEvidence.title,
    required_terms: launchEvidence.required_terms,
    body_sha256: control.role_custody.production_launch.body_sha256,
    page_screenshot_sha256: launchPage.sha256,
    binding: control.role_custody.production_launch.binding
  },
  embodiment_boundary: control.embodiment_boundary,
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-role-record.json'), roleRecord);
const roleRecordReceipt = await receipt(join(PACKET, 'exact-role-record.json'));

const candidatePath = join(PACKET, 'uc-107-still-candidate.jpg');
magick(join(PACKET, selected.path), '-auto-orient', '-resize', `${control.render.candidate_width}x${control.render.candidate_height}^`, '-gravity', control.render.candidate_gravity, '-extent', `${control.render.candidate_width}x${control.render.candidate_height}`, '-strip', '-quality', String(control.render.jpeg_quality), candidatePath);
const candidate = { path: 'uc-107-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: 1260, height: 1000 })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: 1246, height: 1000 })) };

const duplicateItems = [
  { label: 'Disney Plus Press Mandalorian source', path: selected.path, sha256: selected.sha256, matches: repository.get(selected.sha256) || [] },
  { label: 'UC-107 still candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-107 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-107 exact-byte duplicate detected');
const duplicateScan = {
  version: 1,
  repository_hash_count: repositoryCount,
  items: duplicateItems,
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  status: 'pass',
  semantics: 'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'
};
await writeJson(join(PACKET, 'duplicate-scan.json'), duplicateScan);

const notes = [
  'Disney Plus Press identifies the selected 2019 first-look frame as The Mandalorian and captions the character with Pedro Pascal while Lucasfilm separately credits Pascal in the title role.',
  'The evidence separates actor-role custody from character-frame custody and does not claim that Pascal was physically inside the armor when the selected photograph was made.',
  'The east-anchored candidate preserves the complete helmet and T-visor, neck, shoulder and chest armor, raised blaster and glove, both forearms, bandolier, belt, holster, waist and upper-leg armor with the original launch-season setting retained.',
  'The 1246x1000 wall simulation removes seven pixels from each outside edge without changing the character, armor, weapon, or body-legibility ruling.',
  `Exact-byte duplicate screening passes against ${repositoryCount.toLocaleString('en-US')} canonical repository hashes.`
];
const review = {
  version: 1,
  record_id: 'UC-107',
  actor: 'Pedro Pascal',
  character: 'The Mandalorian',
  production: 'The Mandalorian',
  year: 2019,
  side: 'still',
  expected_subject: 'The Mandalorian',
  source_sha256: selected.sha256,
  exact_role_record_sha256: roleRecordReceipt.sha256,
  candidate_sha256: candidate.sha256,
  crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-subject',
  presentation_ruling: 'character-depiction',
  crop_ruling: 'pass-single-role-east-crop',
  embodiment_ruling: 'actor-role-bound-frame-occupant-not-asserted',
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  reviewed_at: control.reviewed_at,
  canonical_mutation: false,
  disposition: 'reviewed-evidence-candidate',
  notes
};
await writeJson(join(PACKET, 'review.json'), review);
await writeFile(join(PACKET, 'review.md'), `# UC-107 reviewed Pedro Pascal / The Mandalorian still candidate\n\n- **Record:** UC-107\n- **Performer credit:** Pedro Pascal\n- **Displayed role:** The Mandalorian\n- **Production:** The Mandalorian (2019)\n- **Source:** Disney Plus Press / Lucasfilm\n- **Source bytes:** \`${selected.sha256}\`\n- **Exact role record:** \`${roleRecordReceipt.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Embodiment ruling:** actor-role bound; physical occupant of this frame not asserted\n- **Crop ruling:** pass, single-role east crop\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe exact source bytes, official source-page receipts, deterministic candidate, wall simulation, role record, review, and duplicate receipt remain evidence-only pending independent canonical acceptance.\n`);

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-107',
  actor: 'Pedro Pascal',
  character: 'The Mandalorian',
  production: 'The Mandalorian',
  year: 2019,
  side: 'still',
  expected_subject: 'The Mandalorian',
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    selector_artifact: control.selector_artifact,
    scope_artifact: control.scope_artifact,
    discovery_artifact: control.discovery_artifact,
    render_control_sha256: sha(await readFile(CONTROL)),
    discovery_manifest_sha256: control.discovery_artifact.manifest_sha256,
    discovery_summary_sha256: control.discovery_artifact.summary_sha256,
    discovery_contact_sheet_sha256: control.discovery_artifact.contact_sheet_sha256,
    render_artifact: null,
    apply_control_sha256: null
  },
  selected_source: {
    provider: control.selected_source.provider,
    source_page: control.selected_source.page_url,
    asset_url: control.selected_source.asset_url,
    asset_key: control.selected_source.asset_key,
    caption: control.selected_source.caption,
    original: selected,
    source_page_screenshot: framePage
  },
  role_custody: {
    record: { path: 'exact-role-record.json', ...roleRecordReceipt },
    actor_role: { provider: control.role_custody.actor_role.provider, source_page: control.role_custody.actor_role.page_url, binding: control.role_custody.actor_role.binding, page_screenshot: actorPage },
    production_launch: { provider: control.role_custody.production_launch.provider, source_page: control.role_custody.production_launch.page_url, binding: control.role_custody.production_launch.binding, page_screenshot: launchPage },
    embodiment_boundary: control.embodiment_boundary
  },
  candidate: { ...candidate, recipe: `auto-orient; cover-resize to ${control.render.candidate_width}x${control.render.candidate_height}; ${control.render.candidate_gravity} crop; strip metadata; JPEG quality ${control.render.jpeg_quality}` },
  crop_preview: { ...cropPreview, gravity: control.render.wall_gravity, semantics: 'The wall simulation removes seven pixels from each outside edge while preserving the complete helmet and T-visor, neck, shoulder and chest armor, raised blaster and glove, both forearms, bandolier, belt, holster, waist and upper-leg armor.' },
  rejected_orbit_summary: [
    'The official snow-doorway silhouette remains a valid candidate in the discovery artifact but was not selected because it suppresses the helmet, visor, armor and weapon detail required for the card.',
    'Untransformed Pedro Pascal, helmet-off portraits, other Mandalorians, Boba Fett, later costume variants without 2019 custody, animation, games, toys, cosplay, fan art and posters were excluded.',
    'The lower-byte unparameterized probes were retained in the discovery artifact but were not selected over the declared Disney Plus Press delivery.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: repositoryCount, status: 'pass' },
  exact_subject_review: { identity: review.identity_ruling, presentation: review.presentation_ruling, crop_ruling: review.crop_ruling, embodiment_ruling: review.embodiment_ruling, notes },
  disposition: 'reviewed-evidence-candidate',
  canonical_mutation: false
};
await writeJson(join(PACKET, 'manifest.json'), manifest);

const packetNames = ['card-crop-preview.jpg','duplicate-scan.json','exact-role-record.json','mandalorian-original.jpg','manifest.json','review.json','review.md','source-page-disney-plus-first-look.png','source-page-lucasfilm-cast-announcement.png','source-page-star-wars-celebration-2019.png','uc-107-still-candidate.jpg'];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-107',
  source: selected,
  exact_role_record: { path: 'exact-role-record.json', ...roleRecordReceipt },
  candidate,
  crop_preview: cropPreview,
  source_pages: [framePage, actorPage, launchPage],
  repository_hash_count: repositoryCount,
  packet_files: [...packetNames, 'SHA256SUMS'],
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))),
  review_sha256: sha(await readFile(join(PACKET, 'review.json'))),
  sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))),
  canonical_mutation: false
});
console.log(`PASS — UC-107 exact render packet created at ${PACKET}`);
console.log(`source ${selected.sha256} ${selected.width}x${selected.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`role ${roleRecordReceipt.sha256}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
