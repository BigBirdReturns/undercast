#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-080-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-080-render';
const PACKET = join(OUT, 'UC-080');
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

const control = await readJson(CONTROL);
assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-080', 'UC-080 render scope drift');
assert(control.actor === 'Louis Gossett Jr.' && control.character === "Jeriba 'Jerry' Shigan" && control.side === 'still', 'UC-080 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8669409887 && control.discovery_artifact?.head_sha === '10f68d31bdb6d1bb71ea932167aa75d26430b897', 'UC-080 discovery custody drift');
assert(control.selected_source?.sha256 === '0defb8e781dbeeb885a9b7d8177f5e6ab732686cf3d7a00a1483b800d0d8087b', 'UC-080 selected source drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.candidate_gravity === 'west', 'UC-080 render geometry drift');
await mkdir(PACKET, { recursive: true });

const discoveryManifest = await receipt(join(SOURCE_ROOT, 'manifest.json'), { sha256: control.discovery_artifact.manifest_sha256 });
const discoverySummary = await receipt(join(SOURCE_ROOT, 'summary.json'), { sha256: control.discovery_artifact.summary_sha256 });
const discoveryContact = await receipt(join(SOURCE_ROOT, 'contact-sheet.jpg'), { sha256: control.discovery_artifact.contact_sheet_sha256 });
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
const moriaPage = await retainFile(control.selected_source.page_artifact_path, control.selected_source.page_output_path, {
  sha256: control.selected_source.page_sha256,
  mime: 'image/png',
  bytes: control.selected_source.page_bytes,
  width: control.selected_source.page_width,
  height: control.selected_source.page_height
});
const historicImage = await retainFile(control.corroboration.historic_images.image_artifact_path, control.corroboration.historic_images.image_output_path, {
  sha256: control.corroboration.historic_images.image_sha256,
  mime: control.corroboration.historic_images.image_mime,
  bytes: control.corroboration.historic_images.image_bytes,
  width: control.corroboration.historic_images.image_width,
  height: control.corroboration.historic_images.image_height
});
const historicText = await retainFile(control.corroboration.historic_images.text_artifact_path, control.corroboration.historic_images.text_output_path, {
  sha256: control.corroboration.historic_images.text_sha256,
  bytes: control.corroboration.historic_images.text_bytes
});
const appleText = await retainFile(control.corroboration.apple_tv.text_artifact_path, control.corroboration.apple_tv.text_output_path, {
  sha256: control.corroboration.apple_tv.text_sha256,
  bytes: control.corroboration.apple_tv.text_bytes
});
const purepeopleText = await retainFile(control.corroboration.purepeople.text_artifact_path, control.corroboration.purepeople.text_output_path, {
  sha256: control.corroboration.purepeople.text_sha256,
  bytes: control.corroboration.purepeople.text_bytes
});
const purepeoplePage = await retainFile(control.corroboration.purepeople.page_artifact_path, control.corroboration.purepeople.page_output_path, {
  sha256: control.corroboration.purepeople.page_sha256,
  mime: 'image/png',
  bytes: control.corroboration.purepeople.page_bytes,
  width: control.corroboration.purepeople.page_width,
  height: control.corroboration.purepeople.page_height
});

const candidatePath = join(PACKET, 'uc-080-still-candidate.jpg');
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
const candidate = { path: 'uc-080-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: 1260, height: 1000 })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: 1246, height: 1000 })) };

const duplicateItems = [
  { label: 'Moria Jeriba source', path: selected.path, sha256: selected.sha256, matches: repository.get(selected.sha256) || [] },
  { label: 'Historic Images Fox press-photo evidence', path: historicImage.path, sha256: historicImage.sha256, matches: repository.get(historicImage.sha256) || [] },
  { label: 'UC-080 still candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-080 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-080 exact-byte duplicate detected');
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
  'The selected Moria image carries an image-local caption naming Jeriba Shigan as Louis Gossett Jr. and Davidge as Dennis Quaid.',
  'Historic Images independently retains a Twentieth Century Fox press caption naming Gossett as Jeriba Shigan, while Apple TV binds Gossett to Jeriba in the licensed cast record.',
  'Purepeople independently captions Gossett in the transformed Jeriba role and retains a visual before-and-after corroboration page.',
  'The west-anchored 1260x1000 crop preserves Jeriba\'s complete designed head, eye, facial texture, neck, shoulders, chest armor, and profile; Davidge remains partial scene context at the right edge.',
  'The 1246x1000 wall simulation removes seven pixels from each outside edge without changing the identity or body-legibility ruling.',
  `Exact-byte duplicate screening passes against ${repositoryCount.toLocaleString('en-US')} canonical repository hashes.`
];
const review = {
  version: 1,
  record_id: 'UC-080',
  actor: 'Louis Gossett Jr.',
  character: "Jeriba 'Jerry' Shigan",
  production: 'Enemy Mine',
  side: 'still',
  expected_subject: "Jeriba 'Jerry' Shigan",
  source_sha256: selected.sha256,
  corroborating_press_photo_sha256: historicImage.sha256,
  candidate_sha256: candidate.sha256,
  crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-subject',
  presentation_ruling: 'character-depiction',
  crop_ruling: 'pass-single-role-west-crop',
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  reviewed_at: control.reviewed_at,
  canonical_mutation: false,
  disposition: 'reviewed-evidence-candidate',
  notes
};
await writeJson(join(PACKET, 'review.json'), review);
await writeFile(join(PACKET, 'review.md'), `# UC-080 reviewed Louis Gossett Jr. / Jeriba Shigan still candidate\n\n- **Record:** UC-080\n- **Performer:** Louis Gossett Jr.\n- **Displayed role:** Jeriba "Jerry" Shigan\n- **Production:** Enemy Mine (1985)\n- **Selected source:** [Moria](${control.selected_source.page_url})\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass, single-role west crop\n- **Canonical mutation:** none\n\n## Visual and identity ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe clean selected still, exact caption-local source page, Fox press-photo record, Apple cast record, Purepeople role corroboration, deterministic candidate, wall simulation, and duplicate receipt remain evidence-only pending independent canonical acceptance.\n`);

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-080',
  actor: 'Louis Gossett Jr.',
  character: "Jeriba 'Jerry' Shigan",
  production: 'Enemy Mine',
  year: 1985,
  side: 'still',
  expected_subject: "Jeriba 'Jerry' Shigan",
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    discovery_artifact: control.discovery_artifact,
    failed_checkpoints: control.failed_checkpoints,
    render_control_sha256: sha(await readFile(CONTROL)),
    discovery_manifest_sha256: discoveryManifest.sha256,
    discovery_summary_sha256: discoverySummary.sha256,
    discovery_contact_sheet_sha256: discoveryContact.sha256,
    render_artifact: null,
    apply_control_sha256: null
  },
  selected_source: {
    provider: control.selected_source.provider,
    source_page: control.selected_source.page_url,
    asset_url: control.selected_source.asset_url,
    caption: control.selected_source.caption,
    original: selected,
    source_page_screenshot: moriaPage
  },
  corroboration: {
    historic_images: {
      provider: control.corroboration.historic_images.provider,
      source_page: control.corroboration.historic_images.page_url,
      caption: control.corroboration.historic_images.caption,
      press_photo: historicImage,
      product_record: historicText,
      boundary: 'Watermarked press-photo evidence retained for identity and production custody; not used as the final display source.'
    },
    apple_tv: {
      provider: control.corroboration.apple_tv.provider,
      source_page: control.corroboration.apple_tv.page_url,
      role_binding: control.corroboration.apple_tv.role_binding,
      page_record: appleText
    },
    purepeople: {
      provider: control.corroboration.purepeople.provider,
      source_page: control.corroboration.purepeople.page_url,
      caption: control.corroboration.purepeople.caption,
      page_record: purepeopleText,
      page_screenshot: purepeoplePage
    }
  },
  candidate: {
    ...candidate,
    recipe: `auto-orient; cover-resize to ${control.render.candidate_width}x${control.render.candidate_height}; ${control.render.candidate_gravity} crop; strip metadata; JPEG quality ${control.render.jpeg_quality}`
  },
  crop_preview: {
    ...cropPreview,
    gravity: control.render.wall_gravity,
    semantics: 'The current wall simulation removes seven pixels from each outside edge. It preserves the complete designed head, eye, facial texture, neck, shoulders, chest armor, and profile while retaining only partial Davidge scene context.'
  },
  rejected_orbit_summary: [
    'Untransformed Louis Gossett Jr., Davidge or Dennis Quaid alone, Zammis, generic Drac imagery without exact role binding, posters, illustrations, merchandise, and unrelated recommendation assets were rejected.',
    'IMDb browser responses remained Human Verification transport failures rather than identity evidence.',
    'The Historic Images press-photo preview and Purepeople collage remain corroborating evidence only because of watermarking or composite presentation.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: repositoryCount, status: 'pass' },
  exact_subject_review: { identity: review.identity_ruling, presentation: review.presentation_ruling, crop_ruling: review.crop_ruling, notes },
  disposition: 'reviewed-evidence-candidate',
  canonical_mutation: false
};
await writeJson(join(PACKET, 'manifest.json'), manifest);

const packetFiles = [
  'apple-tv-role.txt',
  'card-crop-preview.jpg',
  'duplicate-scan.json',
  'historic-images-press-photo.webp',
  'historic-images-product.txt',
  'jeriba-original.jpg',
  'manifest.json',
  'purepeople-role.txt',
  'review.json',
  'review.md',
  'source-page-moria.png',
  'source-page-purepeople.png',
  'uc-080-still-candidate.jpg'
].sort();
const sums = [];
for (const file of packetFiles) sums.push(`${sha(await readFile(join(PACKET, file)))}  ${file}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-080',
  source: selected,
  corroborating_press_photo: historicImage,
  candidate,
  crop_preview: cropPreview,
  packet_file_count: packetFiles.length + 1,
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))),
  duplicate_scan_sha256: sha(await readFile(join(PACKET, 'duplicate-scan.json'))),
  review_json_sha256: sha(await readFile(join(PACKET, 'review.json'))),
  review_md_sha256: sha(await readFile(join(PACKET, 'review.md'))),
  sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))),
  canonical_mutation: false
});
console.log(`PASS — UC-080 exact Jeriba render packet created at ${PACKET}`);
console.log(`source ${selected.sha256} ${selected.width}x${selected.height} ${selected.bytes}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height} ${candidate.bytes}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height} ${cropPreview.bytes}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
console.log(`files ${packetFiles.length + 1}`);
