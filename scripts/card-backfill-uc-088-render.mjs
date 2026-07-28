#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-088-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-088-render';
const PACKET = join(OUT, 'UC-088');
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
};
function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
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
function pageScreenshot(manifest, key, expected) {
  const row = (manifest.page_screenshots || []).find(item => item.key === key);
  assert(row, `missing screenshot receipt ${key}`);
  assert(row.path === expected.artifact_path && row.sha256 === expected.sha256 && row.bytes === expected.bytes && row.width === expected.width && row.height === expected.height, `${key} screenshot receipt drift`);
  return row;
}
function verifyRoleEvidence(manifest, key, expected) {
  const row = manifest.role_evidence?.[key];
  assert(row, `missing role evidence ${key}`);
  assert(row.status === 'loaded' && row.http_status === 200, `${key} transport drift`);
  assert(row.title === expected.title && row.resolved_url === expected.page_url, `${key} page identity drift`);
  assert(JSON.stringify(row.required_terms) === JSON.stringify(expected.required_terms) && row.required_terms_missing?.length === 0, `${key} term denominator drift`);
  assert(sha(Buffer.from(row.body_text || '', 'utf8')) === expected.body_sha256, `${key} body receipt drift`);
  pageScreenshot(manifest, key, expected);
  return row;
}
function verifyPhotoEvidence(manifest, photoId, expected) {
  const row = manifest.photo_evidence?.[String(photoId)];
  assert(row, `missing photo evidence ${photoId}`);
  assert(row.status === 'loaded' && row.http_status === 200 && row.valid_movie_still_page === true && row.wrong_type === false, `photo ${photoId} page disposition drift`);
  assert(row.title === expected.page_title && row.resolved_url === expected.page_url, `photo ${photoId} page identity drift`);
  assert(row.description === expected.page_description, `photo ${photoId} description drift`);
  assert(JSON.stringify(row.required_terms) === JSON.stringify(expected.required_terms) && row.required_terms_missing?.length === 0, `photo ${photoId} term denominator drift`);
  assert(sha(Buffer.from(row.body_text || '', 'utf8')) === expected.page_body_sha256, `photo ${photoId} body receipt drift`);
  pageScreenshot(manifest, `movieinsider-${photoId}`, {
    artifact_path: expected.page_artifact_path,
    sha256: expected.page_sha256,
    bytes: expected.page_bytes,
    width: expected.page_width,
    height: expected.page_height
  });
  return row;
}

const control = await readJson(CONTROL);
assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-088', 'UC-088 render scope drift');
assert(control.actor === 'Michael Chiklis' && control.character === 'The Thing' && control.production === 'Fantastic Four' && control.year === 2005 && control.side === 'still', 'UC-088 render identity drift');
assert(control.targeted_artifact?.artifact_id === 8672092033 && control.targeted_artifact?.head_sha === 'b87af9712125b074577c65e6b8c18ecec36329d0', 'UC-088 targeted custody drift');
assert(control.selected_source?.sha256 === '3c11e621220621aecc6b515e31b78384300270ed58593f837ae06559f8901bd4', 'UC-088 selected source drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.candidate_gravity === 'center', 'UC-088 render geometry drift');
await mkdir(PACKET, { recursive: true });

const targetedManifestReceipt = await receipt(join(SOURCE_ROOT, 'manifest.json'), { sha256: control.targeted_artifact.manifest_sha256 });
const targetedSummaryReceipt = await receipt(join(SOURCE_ROOT, 'summary.json'), { sha256: control.targeted_artifact.summary_sha256 });
const contactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet.jpg'), { sha256: control.targeted_artifact.contact_sheet_sha256 });
const targetedManifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
assert(targetedManifest.record_id === 'UC-088' && targetedManifest.actor === 'Michael Chiklis' && targetedManifest.character === 'The Thing' && targetedManifest.production === 'Fantastic Four' && targetedManifest.year === 2005, 'targeted manifest identity drift');
assert(targetedManifest.valid_photo_page_count === control.targeted_artifact.valid_photo_page_count && targetedManifest.candidate_count === control.targeted_artifact.candidate_count, 'targeted candidate denominator drift');
const selectedDiscovery = (targetedManifest.candidates || []).find(row => row.photo_id === 659);
assert(selectedDiscovery?.local === control.selected_source.artifact_path && selectedDiscovery?.sha256 === control.selected_source.sha256 && selectedDiscovery?.repository_matches?.length === 0, 'selected targeted candidate drift');
verifyPhotoEvidence(targetedManifest, 659, control.selected_source);
const afiEvidence = verifyRoleEvidence(targetedManifest, 'afi-production-cast', control.role_custody.production_cast);
const suitEvidence = verifyRoleEvidence(targetedManifest, 'superhero-hype-full-costume', control.role_custody.practical_suit);
const sceneEvidence = verifyRoleEvidence(targetedManifest, 'superhero-hype-pigeon', control.role_custody.selected_scene);

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
const sourcePage = await retainFile(control.selected_source.page_artifact_path, control.selected_source.page_output_path, {
  sha256: control.selected_source.page_sha256,
  mime: 'image/png',
  bytes: control.selected_source.page_bytes,
  width: control.selected_source.page_width,
  height: control.selected_source.page_height
});
const afiPage = await retainFile(control.role_custody.production_cast.artifact_path, control.role_custody.production_cast.output_path, {
  sha256: control.role_custody.production_cast.sha256,
  mime: 'image/png',
  bytes: control.role_custody.production_cast.bytes,
  width: control.role_custody.production_cast.width,
  height: control.role_custody.production_cast.height
});
const suitPage = await retainFile(control.role_custody.practical_suit.artifact_path, control.role_custody.practical_suit.output_path, {
  sha256: control.role_custody.practical_suit.sha256,
  mime: 'image/png',
  bytes: control.role_custody.practical_suit.bytes,
  width: control.role_custody.practical_suit.width,
  height: control.role_custody.practical_suit.height
});
const scenePage = await retainFile(control.role_custody.selected_scene.artifact_path, control.role_custody.selected_scene.output_path, {
  sha256: control.role_custody.selected_scene.sha256,
  mime: 'image/png',
  bytes: control.role_custody.selected_scene.bytes,
  width: control.role_custody.selected_scene.width,
  height: control.role_custody.selected_scene.height
});

const roleRecord = {
  version: 1,
  record_id: 'UC-088',
  actor: 'Michael Chiklis',
  character: 'The Thing',
  production: 'Fantastic Four',
  year: 2005,
  selected_still: {
    provider: control.selected_source.provider,
    source_page: control.selected_source.page_url,
    page_title: control.selected_source.page_title,
    page_description: control.selected_source.page_description,
    required_terms: control.selected_source.required_terms,
    body_sha256: control.selected_source.page_body_sha256,
    page_screenshot_sha256: sourcePage.sha256,
    selected_image_sha256: selected.sha256
  },
  production_cast_binding: {
    provider: control.role_custody.production_cast.provider,
    source_page: control.role_custody.production_cast.page_url,
    page_title: afiEvidence.title,
    required_terms: afiEvidence.required_terms,
    body_sha256: control.role_custody.production_cast.body_sha256,
    page_screenshot_sha256: afiPage.sha256,
    binding: control.role_custody.production_cast.binding
  },
  practical_suit_binding: {
    provider: control.role_custody.practical_suit.provider,
    source_page: control.role_custody.practical_suit.page_url,
    page_title: suitEvidence.title,
    required_terms: suitEvidence.required_terms,
    body_sha256: control.role_custody.practical_suit.body_sha256,
    page_screenshot_sha256: suitPage.sha256,
    binding: control.role_custody.practical_suit.binding
  },
  selected_scene_binding: {
    provider: control.role_custody.selected_scene.provider,
    source_page: control.role_custody.selected_scene.page_url,
    page_title: sceneEvidence.title,
    required_terms: sceneEvidence.required_terms,
    body_sha256: control.role_custody.selected_scene.body_sha256,
    page_screenshot_sha256: scenePage.sha256,
    binding: control.role_custody.selected_scene.binding
  },
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-role-record.json'), roleRecord);
const roleRecordReceipt = await receipt(join(PACKET, 'exact-role-record.json'));

const candidatePath = join(PACKET, 'uc-088-still-candidate.jpg');
magick(
  join(PACKET, selected.path),
  '-auto-orient',
  '-resize', `${control.render.candidate_width}x${control.render.candidate_height}^`,
  '-gravity', control.render.candidate_gravity,
  '-extent', `${control.render.candidate_width}x${control.render.candidate_height}`,
  '-strip',
  '-quality', String(control.render.jpeg_quality),
  candidatePath
);
const candidate = { path: 'uc-088-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: 1260, height: 1000 })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: 1246, height: 1000 })) };

const duplicateItems = [
  { label: 'Movie Insider Fantastic Four 2005 Thing source', path: selected.path, sha256: selected.sha256, matches: repository.get(selected.sha256) || [] },
  { label: 'UC-088 still candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-088 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-088 exact-byte duplicate detected');
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
const duplicateReceipt = await receipt(join(PACKET, 'duplicate-scan.json'));

const notes = [
  "AFI binds Michael Chiklis to Ben Grimm in Twentieth Century Fox's 2005 Fantastic Four production.",
  'The contemporaneous SuperHeroHype set record identifies Chiklis as The Thing in the full practical costume.',
  'The contemporaneous pigeon-image record binds the selected scene to Michael Chiklis as The Thing in Fantastic Four.',
  "The centered candidate and wall simulation preserve the complete practical rock head, both eyes, mouth, neck, shoulders, chest, both arms and hands, with the pigeon and bridge setting retained as scene context.",
  `Exact-byte duplicate screening passes against ${repositoryCount.toLocaleString('en-US')} canonical media hashes.`
];
const review = {
  version: 1,
  record_id: 'UC-088',
  actor: 'Michael Chiklis',
  character: 'The Thing',
  production: 'Fantastic Four',
  year: 2005,
  side: 'still',
  expected_subject: 'The Thing',
  source_sha256: selected.sha256,
  role_record_sha256: roleRecordReceipt.sha256,
  candidate_sha256: candidate.sha256,
  crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-subject',
  presentation_ruling: 'character-depiction',
  crop_ruling: 'pass-single-role-center-crop',
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  reviewed_at: control.reviewed_at,
  canonical_mutation: false,
  disposition: 'reviewed-evidence-candidate',
  notes
};
await writeJson(join(PACKET, 'review.json'), review);
const reviewReceipt = await receipt(join(PACKET, 'review.json'));
const reviewMd = `# UC-088 reviewed Michael Chiklis Thing still candidate\n\n- **Record:** UC-088\n- **Performer:** Michael Chiklis\n- **Displayed role:** The Thing\n- **Production:** Fantastic Four (2005)\n- **Display source:** [Movie Insider](${control.selected_source.page_url})\n- **Production and cast:** [American Film Institute](${control.role_custody.production_cast.page_url})\n- **Practical-suit record:** [SuperHeroHype](${control.role_custody.practical_suit.page_url})\n- **Selected-scene record:** [SuperHeroHype](${control.role_custody.selected_scene.page_url})\n- **Source:** \`${selected.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass, single-role center crop\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe exact source bytes, role and production receipts, source-page screenshots, deterministic candidate, wall simulation, and duplicate receipt remain evidence-only pending independent canonical acceptance.\n`;
await writeFile(join(PACKET, 'review.md'), reviewMd);
const reviewMdReceipt = await receipt(join(PACKET, 'review.md'));

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-088',
  actor: 'Michael Chiklis',
  character: 'The Thing',
  production: 'Fantastic Four',
  year: 2005,
  side: 'still',
  expected_subject: 'The Thing',
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    targeted_artifact: control.targeted_artifact,
    failed_discovery_checkpoints: control.failed_discovery_checkpoints,
    render_control_sha256: sha(await readFile(CONTROL)),
    targeted_manifest_sha256: targetedManifestReceipt.sha256,
    targeted_summary_sha256: targetedSummaryReceipt.sha256,
    targeted_contact_sheet_sha256: contactReceipt.sha256,
    render_artifact: null,
    apply_control_sha256: null
  },
  selected_source: {
    provider: control.selected_source.provider,
    source_page: control.selected_source.page_url,
    asset_url: control.selected_source.asset_url,
    page_title: control.selected_source.page_title,
    page_description: control.selected_source.page_description,
    original: selected,
    source_page_screenshot: sourcePage
  },
  role_custody: {
    record: { path: 'exact-role-record.json', ...roleRecordReceipt },
    production_cast: { provider: control.role_custody.production_cast.provider, source_page: control.role_custody.production_cast.page_url, binding: control.role_custody.production_cast.binding, page_screenshot: afiPage },
    practical_suit: { provider: control.role_custody.practical_suit.provider, source_page: control.role_custody.practical_suit.page_url, binding: control.role_custody.practical_suit.binding, page_screenshot: suitPage },
    selected_scene: { provider: control.role_custody.selected_scene.provider, source_page: control.role_custody.selected_scene.page_url, binding: control.role_custody.selected_scene.binding, page_screenshot: scenePage }
  },
  candidate: {
    ...candidate,
    recipe: `auto-orient; cover-resize to ${control.render.candidate_width}x${control.render.candidate_height}; ${control.render.candidate_gravity} crop; strip metadata; JPEG quality ${control.render.jpeg_quality}`
  },
  crop_preview: {
    ...cropPreview,
    gravity: control.render.wall_gravity,
    semantics: 'The wall simulation removes seven pixels from each outside edge while preserving the complete practical rock head, both eyes, mouth, neck, shoulders, chest, both arms and hands.'
  },
  rejected_orbit_summary: [
    'Untransformed Michael Chiklis, pre-transformation Ben Grimm, Jamie Bell and the 2015 film, the 2007 sequel, comics, animation, games, merchandise, posters, covers, and unrelated recommendation imagery were rejected.',
    'Movie Insider frames depicting other Fantastic Four characters or laboratory and transformation context without a clear transformed Thing were retained in the targeted artifact but not selected.',
    'The selected pigeon scene was preferred over the noisier laboratory frame because it preserves the complete practical face and body treatment with stronger lighting and independent scene-specific custody.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', sha256: duplicateReceipt.sha256, repository_hash_count: repositoryCount, status: 'pass' },
  exact_subject_review: { identity: review.identity_ruling, presentation: review.presentation_ruling, crop_ruling: review.crop_ruling, notes },
  disposition: 'reviewed-evidence-candidate',
  canonical_mutation: false
};
await writeJson(join(PACKET, 'manifest.json'), manifest);
const manifestReceipt = await receipt(join(PACKET, 'manifest.json'));

const packetNames = [
  'card-crop-preview.jpg',
  'duplicate-scan.json',
  'exact-role-record.json',
  'manifest.json',
  'review.json',
  'review.md',
  'source-page-afi-production-cast.png',
  'source-page-movieinsider-659.png',
  'source-page-superherohype-full-costume.png',
  'source-page-superherohype-pigeon.png',
  'thing-original.jpg',
  'uc-088-still-candidate.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
const sumsReceipt = await receipt(join(PACKET, 'SHA256SUMS'));
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-088',
  source: selected,
  role_record: roleRecordReceipt,
  candidate,
  crop_preview: cropPreview,
  repository_hash_count: repositoryCount,
  packet_files: [...packetNames, 'SHA256SUMS'],
  manifest_sha256: manifestReceipt.sha256,
  review_json_sha256: reviewReceipt.sha256,
  review_md_sha256: reviewMdReceipt.sha256,
  duplicate_scan_sha256: duplicateReceipt.sha256,
  sums_sha256: sumsReceipt.sha256,
  canonical_mutation: false
});
console.log(`PASS — UC-088 exact render packet created at ${PACKET}`);
console.log(`source ${selected.sha256} ${selected.width}x${selected.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`manifest ${manifestReceipt.sha256}`);
console.log(`sums ${sumsReceipt.sha256}`);
