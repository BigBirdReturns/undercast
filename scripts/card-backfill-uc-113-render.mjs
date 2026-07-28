#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-113-RENDER.json';
const DISCOVERY_ROOT = process.env.DISCOVERY_ROOT || '';
const FRAME_ROOT = process.env.FRAME_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-113-render';
const PACKET = join(OUT, 'UC-113');
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
  const row = { bytes: bytes.length, sha256: sha(bytes), mime, ...(mime !== 'unknown' ? identify(path) : {}) };
  if (expected.sha256) assert(row.sha256 === expected.sha256, `${path} hash drift ${row.sha256}`);
  if (expected.mime) assert(row.mime === expected.mime, `${path} MIME drift ${row.mime}`);
  if (expected.bytes !== undefined) assert(row.bytes === expected.bytes, `${path} byte drift ${row.bytes}`);
  if (expected.width !== undefined) assert(row.width === expected.width, `${path} width drift ${row.width}`);
  if (expected.height !== undefined) assert(row.height === expected.height, `${path} height drift ${row.height}`);
  return row;
}
async function retain(inputRoot, inputRel, outputName, expected) {
  const output = join(PACKET, outputName);
  await copyFile(join(inputRoot, inputRel), output);
  return { path: outputName, ...(await receipt(output, expected)) };
}
function verifyPageEvidence(manifest, key, expected) {
  const row = manifest.page_evidence?.[key];
  assert(row, `missing discovery page evidence ${key}`);
  assert(row.status === 'loaded' && row.http_status >= 200 && row.http_status < 400, `${key} transport drift`);
  assert(Array.isArray(row.required_terms_missing) && row.required_terms_missing.length === 0, `${key} required-term drift`);
  assert(JSON.stringify(row.required_terms) === JSON.stringify(expected.required_terms), `${key} required-term denominator drift`);
  assert(sha(Buffer.from(row.body_text || '', 'utf8')) === expected.body_sha256, `${key} body receipt drift`);
  return row;
}

const control = await readJson(CONTROL);
assert(DISCOVERY_ROOT && FRAME_ROOT, 'DISCOVERY_ROOT and FRAME_ROOT are required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-113', 'UC-113 render scope drift');
assert(control.actor === 'Taika Waititi' && control.character === 'Korg' && control.production === 'Thor: Ragnarok' && control.year === 2017 && control.side === 'still', 'UC-113 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8676847359 && control.frame_artifact?.artifact_id === 8677207332, 'UC-113 render custody drift');
assert(control.selected_source?.sha256 === 'bf640376328e03e9e7930d83182dc1e3b82746f1533bec15feb9ee17419880eb', 'UC-113 selected source drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.crop_x === 170 && control.render?.filter === 'Lanczos', 'UC-113 render geometry drift');
await mkdir(PACKET, { recursive: true });

const discoveryManifestReceipt = await receipt(join(DISCOVERY_ROOT, 'manifest.json'), { sha256: control.discovery_artifact.manifest_sha256 });
const discoverySummaryReceipt = await receipt(join(DISCOVERY_ROOT, 'summary.json'), { sha256: control.discovery_artifact.summary_sha256 });
const discoveryContactReceipt = await receipt(join(DISCOVERY_ROOT, 'contact-sheet-final.jpg'), { sha256: control.discovery_artifact.contact_sheet_sha256 });
const discoveryManifest = await readJson(join(DISCOVERY_ROOT, 'manifest.json'));
assert(discoveryManifest.record_id === 'UC-113' && discoveryManifest.actor === 'Taika Waititi' && discoveryManifest.character === 'Korg' && discoveryManifest.production === 'Thor: Ragnarok', 'UC-113 discovery manifest identity drift');
const rejected = (discoveryManifest.candidates || []).find(row => row.sha256 === control.discovery_artifact.rejected_thumbnail_sha256);
assert(rejected?.asset_key === 'finding-korg-final-frame' && rejected?.width === 640 && rejected?.height === 360, 'UC-113 rejected thumbnail receipt drift');

const productionEvidence = verifyPageEvidence(discoveryManifest, 'marvel-ragnarok-film', control.role_custody.production);
const actorEvidence = verifyPageEvidence(discoveryManifest, 'marvel-waititi-korg-performance', control.role_custody.actor_role);
const designEvidence = verifyPageEvidence(discoveryManifest, 'marvel-finding-korg-design', control.role_custody.design_and_effects);

const frameManifestReceipt = await receipt(join(FRAME_ROOT, 'manifest.json'), { sha256: control.frame_artifact.manifest_sha256 });
const frameSummaryReceipt = await receipt(join(FRAME_ROOT, 'summary.json'), { sha256: control.frame_artifact.summary_sha256 });
const frameSumsReceipt = await receipt(join(FRAME_ROOT, 'SHA256SUMS'), { sha256: control.frame_artifact.sums_sha256 });
const frameManifest = await readJson(join(FRAME_ROOT, 'manifest.json'));
const frameSummary = await readJson(join(FRAME_ROOT, 'summary.json'));
assert(frameManifest.record_id === 'UC-113' && frameManifest.raw_frame?.sha256 === control.selected_source.sha256, 'UC-113 raw-frame manifest drift');
assert(frameSummary.raw_frame?.sha256 === control.selected_source.sha256 && frameSummary.selected_time_seconds === control.selected_source.timestamp_seconds, 'UC-113 raw-frame summary drift');
assert(frameManifest.discovery_artifact?.rejected_thumbnail_sha256 === control.discovery_artifact.rejected_thumbnail_sha256, 'UC-113 rejected-thumbnail boundary drift');

const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const selected = await retain(FRAME_ROOT, control.selected_source.artifact_path, control.selected_source.output_path, {
  sha256: control.selected_source.sha256,
  mime: control.selected_source.mime,
  bytes: control.selected_source.bytes,
  width: control.selected_source.width,
  height: control.selected_source.height
});
const sourcePage = await retain(FRAME_ROOT, control.selected_source.page_artifact_path, control.selected_source.page_output_path, {
  sha256: control.selected_source.page_sha256,
  mime: 'image/png',
  bytes: control.selected_source.page_bytes,
  width: control.selected_source.page_width,
  height: control.selected_source.page_height
});
const selectedReference = await retain(FRAME_ROOT, control.selected_source.reference_artifact_path, control.selected_source.reference_output_path, {
  sha256: control.selected_source.reference_sha256,
  mime: 'image/png',
  bytes: control.selected_source.reference_bytes,
  width: control.selected_source.reference_width,
  height: control.selected_source.reference_height
});
const productionPage = await retain(DISCOVERY_ROOT, control.role_custody.production.artifact_path, control.role_custody.production.output_path, {
  sha256: control.role_custody.production.sha256,
  mime: 'image/png',
  bytes: control.role_custody.production.bytes,
  width: control.role_custody.production.width,
  height: control.role_custody.production.height
});
const actorPage = await retain(DISCOVERY_ROOT, control.role_custody.actor_role.artifact_path, control.role_custody.actor_role.output_path, {
  sha256: control.role_custody.actor_role.sha256,
  mime: 'image/png',
  bytes: control.role_custody.actor_role.bytes,
  width: control.role_custody.actor_role.width,
  height: control.role_custody.actor_role.height
});
const designPage = await retain(DISCOVERY_ROOT, control.role_custody.design_and_effects.artifact_path, control.role_custody.design_and_effects.output_path, {
  sha256: control.role_custody.design_and_effects.sha256,
  mime: 'image/png',
  bytes: control.role_custody.design_and_effects.bytes,
  width: control.role_custody.design_and_effects.width,
  height: control.role_custody.design_and_effects.height
});

const roleRecord = {
  version: 1,
  record_id: 'UC-113',
  actor: 'Taika Waititi',
  character: 'Korg',
  production: 'Thor: Ragnarok',
  year: 2017,
  character_frame: {
    provider: control.selected_source.provider,
    source_page: control.selected_source.page_url,
    video_title: control.selected_source.video_title,
    timestamp_seconds: control.selected_source.timestamp_seconds,
    selected_image_sha256: selected.sha256,
    source_page_screenshot_sha256: sourcePage.sha256,
    timestamp_reference_sha256: selectedReference.sha256,
    binding: 'The official Marvel Finding Korg featurette supplies the completed 2017 Korg image at the retained timestamp.'
  },
  production_binding: {
    provider: control.role_custody.production.provider,
    source_page: control.role_custody.production.page_url,
    required_terms: productionEvidence.required_terms,
    body_sha256: control.role_custody.production.body_sha256,
    page_screenshot_sha256: productionPage.sha256,
    binding: control.role_custody.production.binding
  },
  actor_role_binding: {
    provider: control.role_custody.actor_role.provider,
    source_page: control.role_custody.actor_role.page_url,
    required_terms: actorEvidence.required_terms,
    body_sha256: control.role_custody.actor_role.body_sha256,
    page_screenshot_sha256: actorPage.sha256,
    binding: control.role_custody.actor_role.binding
  },
  design_and_effects_binding: {
    provider: control.role_custody.design_and_effects.provider,
    source_page: control.role_custody.design_and_effects.page_url,
    required_terms: designEvidence.required_terms,
    body_sha256: control.role_custody.design_and_effects.body_sha256,
    page_screenshot_sha256: designPage.sha256,
    binding: control.role_custody.design_and_effects.binding
  },
  identity_boundary: {
    character_frame_and_actor_role_custody_separate: true,
    rejected_performance_capture_thumbnail_sha256: control.discovery_artifact.rejected_thumbnail_sha256,
    rejected_performance_capture_thumbnail_ruling: 'The official page thumbnail depicts Taika Waititi in performance-capture equipment and is not a final Korg character image.',
    retained_source_has_browser_controls: false,
    retained_source_is_completed_character: true
  },
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-role-record.json'), roleRecord);
const roleReceipt = await receipt(join(PACKET, 'exact-role-record.json'));

const candidatePath = join(PACKET, 'uc-113-still-candidate.jpg');
magick(
  join(PACKET, selected.path),
  '-filter', control.render.filter,
  '-resize', `x${control.render.normalized_height}`,
  '-crop', `${control.render.candidate_width}x${control.render.candidate_height}+${control.render.crop_x}+${control.render.crop_y}`,
  '+repage',
  '-strip',
  '-quality', String(control.render.jpeg_quality),
  candidatePath
);
const candidate = { path: 'uc-113-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: 1260, height: 1000 })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: 1246, height: 1000 })) };

const duplicateItems = [
  { label: 'Official Marvel Korg raw video frame', path: selected.path, sha256: selected.sha256, matches: repository.get(selected.sha256) || [] },
  { label: 'UC-113 still candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-113 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-113 exact-byte duplicate detected');
const duplicateScan = {
  version: 1,
  repository_hash_count: repository.size,
  items: duplicateItems,
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  status: 'pass',
  semantics: 'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'
};
await writeJson(join(PACKET, 'duplicate-scan.json'), duplicateScan);

const notes = [
  'The retained source is a raw 960x540 canvas extraction from Marvel\'s official Finding Korg featurette at 33.62111 seconds; browser controls are excluded from the retained pixels.',
  'The selected moment shows completed 2017 Korg in a near-full-body pose beside a large facial close-up, preserving the rock head, both eyes, mouth, shoulders, torso, armor, hands, and weapon.',
  'Marvel separately binds Taika Waititi to Korg through voice and motion-capture performance, while Marvel Studios fixes the production to Thor: Ragnarok and documents Korg\'s character-design and visual-effects development.',
  'The official Marvel performance-capture thumbnail was rejected and remains visible only as a custody hash; it is not used as the final character still.',
  'The fixed 170-pixel horizontal crop after height-normalization preserves both the body and facial views; the 1246x1000 wall simulation removes seven pixels from each outside edge without changing the identity or body-legibility ruling.',
  'Exact-byte duplicate screening passes against 2,070 canonical repository hashes.'
];
const review = {
  version: 1,
  record_id: 'UC-113',
  actor: 'Taika Waititi',
  character: 'Korg',
  production: 'Thor: Ragnarok',
  year: 2017,
  side: 'still',
  expected_subject: 'Korg',
  source_sha256: selected.sha256,
  exact_role_record_sha256: roleReceipt.sha256,
  candidate_sha256: candidate.sha256,
  crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-subject',
  presentation_ruling: 'character-depiction',
  crop_ruling: 'pass-dual-view-offset-crop',
  source_ruling: 'official-marvel-raw-video-frame-browser-controls-excluded',
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  reviewed_at: control.reviewed_at,
  canonical_mutation: false,
  disposition: 'reviewed-evidence-candidate',
  notes
};
await writeJson(join(PACKET, 'review.json'), review);
const reviewMd = `# UC-113 reviewed Taika Waititi Korg still candidate\n\n- **Record:** UC-113\n- **Performer:** Taika Waititi\n- **Displayed role:** Korg\n- **Production:** Thor: Ragnarok (2017)\n- **Source:** Marvel Studios' Thor: Ragnarok | Bonus Feature - Finding Korg\n- **Timestamp:** 33.62111 seconds\n- **Raw source:** \`${selected.sha256}\`\n- **Exact role record:** \`${roleReceipt.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** completed character depiction\n- **Crop ruling:** pass, dual-view offset crop\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe raw official frame, timestamp reference, source pages, deterministic candidate, wall simulation, duplicate receipt, and role record remain evidence-only pending independent canonical acceptance.\n`;
await writeFile(join(PACKET, 'review.md'), reviewMd);

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-113',
  actor: 'Taika Waititi',
  character: 'Korg',
  production: 'Thor: Ragnarok',
  year: 2017,
  side: 'still',
  expected_subject: 'Korg',
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    discovery_artifact: control.discovery_artifact,
    frame_artifact: control.frame_artifact,
    failed_video_orbit_checkpoints: control.failed_video_orbit_checkpoints,
    render_control_sha256: sha(await readFile(CONTROL)),
    discovery_manifest_sha256: discoveryManifestReceipt.sha256,
    discovery_summary_sha256: discoverySummaryReceipt.sha256,
    discovery_contact_sheet_sha256: discoveryContactReceipt.sha256,
    frame_manifest_sha256: frameManifestReceipt.sha256,
    frame_summary_sha256: frameSummaryReceipt.sha256,
    frame_sums_sha256: frameSumsReceipt.sha256,
    render_artifact: null,
    apply_control_sha256: null
  },
  selected_source: {
    provider: control.selected_source.provider,
    source_page: control.selected_source.page_url,
    video_title: control.selected_source.video_title,
    video_duration_seconds: control.selected_source.video_duration_seconds,
    timestamp_seconds: control.selected_source.timestamp_seconds,
    original: selected,
    source_page_screenshot: sourcePage,
    timestamp_reference: selectedReference,
    extraction: 'Raw HTML5 video canvas frame from the official Marvel featurette; browser controls excluded.'
  },
  role_custody: {
    record: { path: 'exact-role-record.json', ...roleReceipt },
    production: { provider: control.role_custody.production.provider, source_page: control.role_custody.production.page_url, binding: control.role_custody.production.binding, page_screenshot: productionPage },
    actor_role: { provider: control.role_custody.actor_role.provider, source_page: control.role_custody.actor_role.page_url, binding: control.role_custody.actor_role.binding, page_screenshot: actorPage },
    design_and_effects: { provider: control.role_custody.design_and_effects.provider, source_page: control.role_custody.design_and_effects.page_url, binding: control.role_custody.design_and_effects.binding, page_screenshot: designPage },
    identity_boundary: roleRecord.identity_boundary
  },
  candidate: {
    ...candidate,
    recipe: `Lanczos resize to ${control.render.normalized_height}px height; crop ${control.render.candidate_width}x${control.render.candidate_height}+${control.render.crop_x}+${control.render.crop_y}; strip metadata; JPEG quality ${control.render.jpeg_quality}`
  },
  crop_preview: {
    ...cropPreview,
    gravity: control.render.wall_gravity,
    semantics: 'The wall simulation removes seven pixels from each outside edge while preserving the completed Korg body view and the complete facial close-up.'
  },
  rejected_orbit_summary: [
    'The official Marvel video thumbnail was rejected because it depicts Taika Waititi in performance-capture equipment rather than the completed Korg.',
    'Later MCU Korg variants, comics, animation, games, toys, cosplay, posters, merchandise, and untransformed Waititi were excluded.',
    'Three video-orbit transport and bookkeeping checkpoints failed closed before the successful sixteen-frame orbit and raw-frame extraction.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: repository.size, status: 'pass' },
  exact_subject_review: {
    identity: review.identity_ruling,
    presentation: review.presentation_ruling,
    crop_ruling: review.crop_ruling,
    source_ruling: review.source_ruling,
    notes
  },
  disposition: 'reviewed-evidence-candidate',
  canonical_mutation: false
};
await writeJson(join(PACKET, 'manifest.json'), manifest);

const packetNames = [
  'card-crop-preview.jpg',
  'duplicate-scan.json',
  'exact-role-record.json',
  'korg-original.png',
  'manifest.json',
  'review.json',
  'review.md',
  'selected-video-frame-reference.png',
  'source-page-marvel-finding-korg.png',
  'source-page-marvel-finding-korg-design.png',
  'source-page-marvel-ragnarok-film.png',
  'source-page-marvel-waititi-korg-performance.png',
  'uc-113-still-candidate.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-113',
  source: selected,
  exact_role_record: { path: 'exact-role-record.json', ...roleReceipt },
  candidate,
  crop_preview: cropPreview,
  source_page_screenshot: sourcePage,
  timestamp_reference: selectedReference,
  production_page: productionPage,
  actor_role_page: actorPage,
  design_page: designPage,
  repository_hash_count: repository.size,
  packet_files: [...packetNames, 'SHA256SUMS'],
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))),
  review_sha256: sha(await readFile(join(PACKET, 'review.json'))),
  sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))),
  canonical_mutation: false
});
console.log(`PASS — UC-113 exact render packet created at ${PACKET}`);
console.log(`source ${selected.sha256} ${selected.width}x${selected.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`role ${roleReceipt.sha256}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
console.log(`sums ${sha(await readFile(join(PACKET, 'SHA256SUMS')))}`);
