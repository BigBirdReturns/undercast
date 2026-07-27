#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-085-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-085-render';
const PACKET = join(OUT, 'UC-085');
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
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-085', 'UC-085 render scope drift');
assert(control.actor === 'Ahmed Best' && control.character === 'Jar Jar Binks' && control.production === 'The Phantom Menace' && control.side === 'still', 'UC-085 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8670831392 && control.discovery_artifact?.head_sha === '00b30c1ed12bf78ee223b81ee86f942e6a28bd90', 'UC-085 discovery custody drift');
assert(control.selected_source?.sha256 === '7429128d9e5c95477b39e7fe6625e4e582d7c3b828b62db7c7e1fe5dc31e49f6', 'UC-085 selected source drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.candidate_gravity === 'center', 'UC-085 render geometry drift');
await mkdir(PACKET, { recursive: true });

const discoveryManifestReceipt = await receipt(join(SOURCE_ROOT, 'manifest.json'), { sha256: control.discovery_artifact.manifest_sha256 });
const discoverySummaryReceipt = await receipt(join(SOURCE_ROOT, 'summary.json'), { sha256: control.discovery_artifact.summary_sha256 });
const finalContactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-final.jpg'), { sha256: control.discovery_artifact.final_contact_sheet_sha256 });
const identityContactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-identity.jpg'), { sha256: control.discovery_artifact.identity_contact_sheet_sha256 });
const unresolvedContactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-unresolved.jpg'), { sha256: control.discovery_artifact.unresolved_contact_sheet_sha256 });
const discoveryManifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
assert(discoveryManifest.record_id === 'UC-085' && discoveryManifest.actor === 'Ahmed Best' && discoveryManifest.character === 'Jar Jar Binks' && discoveryManifest.production === 'The Phantom Menace', 'discovery manifest identity drift');
assert(JSON.stringify(discoveryManifest.counts) === JSON.stringify(control.discovery_artifact.candidate_counts), 'discovery candidate count drift');
const selectedDiscovery = (discoveryManifest.candidates || []).find(row => row.local === control.selected_source.artifact_path);
assert(selectedDiscovery?.sha256 === control.selected_source.sha256 && selectedDiscovery?.admission_class === 'final' && selectedDiscovery?.repository_matches?.length === 0, 'selected discovery candidate drift');

const galleryEvidence = verifyPageEvidence(discoveryManifest, 'starwars-jar-jar-biography-gallery', {
  title: control.selected_source.page_title,
  required_terms: control.selected_source.required_terms,
  body_sha256: control.selected_source.page_body_sha256
});
const performerEvidence = verifyPageEvidence(discoveryManifest, 'starwars-ahmed-best-phantom', control.role_custody.performer);
const productionEvidence = verifyPageEvidence(discoveryManifest, 'starwars-phantom-film', control.role_custody.production);
const characterEvidence = verifyPageEvidence(discoveryManifest, 'starwars-jar-jar-databank', control.role_custody.character);

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
const galleryPage = await retainFile(control.selected_source.page_artifact_path, control.selected_source.page_output_path, {
  sha256: control.selected_source.page_sha256,
  mime: 'image/png',
  bytes: control.selected_source.page_bytes,
  width: control.selected_source.page_width,
  height: control.selected_source.page_height
});
const performerPage = await retainFile(control.role_custody.performer.artifact_path, control.role_custody.performer.output_path, {
  sha256: control.role_custody.performer.sha256,
  mime: 'image/png',
  bytes: control.role_custody.performer.bytes,
  width: control.role_custody.performer.width,
  height: control.role_custody.performer.height
});
const productionPage = await retainFile(control.role_custody.production.artifact_path, control.role_custody.production.output_path, {
  sha256: control.role_custody.production.sha256,
  mime: 'image/png',
  bytes: control.role_custody.production.bytes,
  width: control.role_custody.production.width,
  height: control.role_custody.production.height
});
const characterPage = await retainFile(control.role_custody.character.artifact_path, control.role_custody.character.output_path, {
  sha256: control.role_custody.character.sha256,
  mime: 'image/png',
  bytes: control.role_custody.character.bytes,
  width: control.role_custody.character.width,
  height: control.role_custody.character.height
});

const roleRecord = {
  version: 1,
  record_id: 'UC-085',
  actor: 'Ahmed Best',
  character: 'Jar Jar Binks',
  production: 'The Phantom Menace',
  year: 1999,
  selected_gallery: {
    provider: control.selected_source.provider,
    source_page: control.selected_source.page_url,
    page_title: galleryEvidence.title,
    required_terms: galleryEvidence.required_terms,
    body_sha256: control.selected_source.page_body_sha256,
    page_screenshot_sha256: galleryPage.sha256,
    selected_image_sha256: selected.sha256
  },
  performer_binding: {
    provider: control.role_custody.performer.provider,
    source_page: control.role_custody.performer.page_url,
    page_title: performerEvidence.title,
    required_terms: performerEvidence.required_terms,
    body_sha256: control.role_custody.performer.body_sha256,
    page_screenshot_sha256: performerPage.sha256,
    binding: control.role_custody.performer.binding
  },
  production_binding: {
    provider: control.role_custody.production.provider,
    source_page: control.role_custody.production.page_url,
    page_title: productionEvidence.title,
    required_terms: productionEvidence.required_terms,
    body_sha256: control.role_custody.production.body_sha256,
    page_screenshot_sha256: productionPage.sha256,
    binding: control.role_custody.production.binding
  },
  character_binding: {
    provider: control.role_custody.character.provider,
    source_page: control.role_custody.character.page_url,
    page_title: characterEvidence.title,
    required_terms: characterEvidence.required_terms,
    body_sha256: control.role_custody.character.body_sha256,
    page_screenshot_sha256: characterPage.sha256,
    binding: control.role_custody.character.binding
  },
  canonical_mutation: false
};
await writeJson(join(PACKET, 'official-role-record.json'), roleRecord);
const roleRecordReceipt = await receipt(join(PACKET, 'official-role-record.json'));

const candidatePath = join(PACKET, 'uc-085-still-candidate.jpg');
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
const candidate = { path: 'uc-085-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: 1260, height: 1000 })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: 1246, height: 1000 })) };

const duplicateItems = [
  { label: 'Lucasfilm Jar Jar Episode I source', path: selected.path, sha256: selected.sha256, matches: repository.get(selected.sha256) || [] },
  { label: 'UC-085 still candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-085 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-085 exact-byte duplicate detected');
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
  'The selected frame is the hero image of Lucasfilm\'s official Jar Jar Binks Biography Gallery and depicts Jar Jar between Obi-Wan Kenobi and Qui-Gon Jinn in the Naboo forest.',
  'Lucasfilm\'s Ahmed Best anniversary interview binds Best to Jar Jar Binks and documents his motion-capture, on-set physical, and voice performance for The Phantom Menace.',
  'Lucasfilm\'s Episode I film record fixes the production to the live-action feature released May 19, 1999, while the Databank identifies Jar Jar as a Gungan and lists The Phantom Menace as an appearance.',
  'The centered 1260x1000 crop preserves the complete designed head, both eye stalks, ears, face, neck, shoulders, vest, arms, and torso; Obi-Wan and Qui-Gon remain only as partial Episode I scene context.',
  'The 1246x1000 wall simulation removes seven pixels from each outside edge without changing the identity, designed-face, or body-legibility ruling.',
  `Exact-byte duplicate screening passes against ${repositoryCount.toLocaleString('en-US')} canonical repository hashes.`
];
const review = {
  version: 1,
  record_id: 'UC-085',
  actor: 'Ahmed Best',
  character: 'Jar Jar Binks',
  production: 'The Phantom Menace',
  year: 1999,
  side: 'still',
  expected_subject: 'Jar Jar Binks',
  source_sha256: selected.sha256,
  official_role_record_sha256: roleRecordReceipt.sha256,
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
await writeFile(join(PACKET, 'review.md'), `# UC-085 reviewed Ahmed Best / Jar Jar Binks still candidate\n\n- **Record:** UC-085\n- **Performer:** Ahmed Best\n- **Displayed role:** Jar Jar Binks\n- **Production:** The Phantom Menace (1999)\n- **Selected source:** [Lucasfilm Jar Jar Binks Biography Gallery](${control.selected_source.page_url})\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass, single-role center crop\n- **Canonical mutation:** none\n\n## Visual and identity ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe exact official image, selected gallery page, Ahmed Best performance record, Episode I film record, Jar Jar Databank record, deterministic candidate, wall simulation, and duplicate receipt remain evidence-only pending independent canonical acceptance.\n`);
const reviewMdReceipt = await receipt(join(PACKET, 'review.md'));

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-085',
  actor: 'Ahmed Best',
  character: 'Jar Jar Binks',
  production: 'The Phantom Menace',
  year: 1999,
  side: 'still',
  expected_subject: 'Jar Jar Binks',
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    discovery_artifact: control.discovery_artifact,
    superseded_discovery_checkpoints: control.superseded_discovery_checkpoints,
    render_control_sha256: sha(await readFile(CONTROL)),
    discovery_manifest_sha256: discoveryManifestReceipt.sha256,
    discovery_summary_sha256: discoverySummaryReceipt.sha256,
    discovery_final_contact_sheet_sha256: finalContactReceipt.sha256,
    discovery_identity_contact_sheet_sha256: identityContactReceipt.sha256,
    discovery_unresolved_contact_sheet_sha256: unresolvedContactReceipt.sha256,
    render_artifact: null,
    apply_control_sha256: null
  },
  selected_source: {
    provider: control.selected_source.provider,
    source_page: control.selected_source.page_url,
    asset_url: control.selected_source.asset_url,
    original: selected,
    source_page_screenshot: galleryPage
  },
  official_role_record: {
    path: 'official-role-record.json',
    sha256: roleRecordReceipt.sha256,
    bytes: roleRecordReceipt.bytes
  },
  corroboration: {
    performer: { ...control.role_custody.performer, page_screenshot: performerPage },
    production: { ...control.role_custody.production, page_screenshot: productionPage },
    character: { ...control.role_custody.character, page_screenshot: characterPage }
  },
  candidate: {
    ...candidate,
    recipe: `auto-orient; cover-resize to ${control.render.candidate_width}x${control.render.candidate_height}; ${control.render.candidate_gravity} crop; strip metadata; JPEG quality ${control.render.jpeg_quality}`
  },
  crop_preview: {
    ...cropPreview,
    gravity: control.render.wall_gravity,
    semantics: 'The wall simulation removes seven pixels from each outside edge while preserving Jar Jar\'s complete designed head, eye stalks, ears, face, neck, shoulders, vest, arms, and torso.'
  },
  rejected_orbit_summary: [
    'Untransformed Ahmed Best photographs, motion-capture reference imagery, behind-the-scenes plates, later-era Jar Jar, Clone Wars animation, game renders, merchandise, illustrations, posters, key art, and unrelated Episode I images were not admitted as the final source.',
    'The complete official discovery orbit remains in the workflow artifact; only the selected Episode I frame and its independent Lucasfilm identity, production, and character receipts were retained in this packet.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', sha256: duplicateReceipt.sha256, repository_hash_count: repositoryCount, status: 'pass' },
  exact_subject_review: {
    identity: review.identity_ruling,
    presentation: review.presentation_ruling,
    crop_ruling: review.crop_ruling,
    notes
  },
  source_review_receipts: {
    review_json_sha256: reviewReceipt.sha256,
    review_md_sha256: reviewMdReceipt.sha256
  },
  disposition: 'reviewed-evidence-candidate',
  canonical_mutation: false
};
await writeJson(join(PACKET, 'manifest.json'), manifest);

const packetNames = [
  'card-crop-preview.jpg',
  'duplicate-scan.json',
  'jar-jar-original.jpg',
  'manifest.json',
  'official-role-record.json',
  'review.json',
  'review.md',
  'source-page-ahmed-best-phantom.png',
  'source-page-jar-jar-biography-gallery.png',
  'source-page-jar-jar-databank.png',
  'source-page-phantom-film.png',
  'uc-085-still-candidate.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-085',
  source: selected,
  candidate,
  crop_preview: cropPreview,
  official_role_record: roleRecordReceipt,
  source_pages: { gallery: galleryPage, performer: performerPage, production: productionPage, character: characterPage },
  repository_hash_count: repositoryCount,
  packet_files: [...packetNames, 'SHA256SUMS'],
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))),
  review_sha256: sha(await readFile(join(PACKET, 'review.json'))),
  sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))),
  canonical_mutation: false
});
console.log(`PASS — UC-085 exact render packet created at ${PACKET}`);
console.log(`source ${selected.sha256} ${selected.width}x${selected.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
console.log(`sums ${sha(await readFile(join(PACKET, 'SHA256SUMS')))}`);
