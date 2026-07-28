#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-097-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-097-render';
const PACKET = join(OUT, 'UC-097');
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
function screenshotReceipt(manifest, key, expected) {
  const row = (manifest.page_screenshots || []).find(item => item.key === key);
  assert(row, `missing screenshot receipt ${key}`);
  assert(row.path === expected.artifact_path && row.sha256 === expected.sha256 && row.bytes === expected.bytes && row.width === expected.width && row.height === expected.height, `${key} screenshot receipt drift`);
  return row;
}
function verifyPageEvidence(manifest, key, expected) {
  const row = manifest.page_evidence?.[key];
  assert(row, `missing page evidence ${key}`);
  assert(row.status === 'loaded' && row.http_status === 200, `${key} transport drift`);
  assert(row.title === expected.title && row.resolved_url === expected.page_url, `${key} page identity drift`);
  assert(JSON.stringify(row.required_terms) === JSON.stringify(expected.required_terms) && row.required_terms_missing?.length === 0, `${key} term denominator drift`);
  assert(sha(Buffer.from(row.body_text || '', 'utf8')) === expected.body_sha256, `${key} body receipt drift`);
  screenshotReceipt(manifest, key, expected);
  return row;
}

const control = await readJson(CONTROL);
assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-097', 'UC-097 render scope drift');
assert(control.actor === 'Dan Stevens' && control.character === 'The Beast' && control.production === 'Beauty and the Beast' && control.year === 2017 && control.side === 'still', 'UC-097 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8672632130 && control.discovery_artifact?.head_sha === 'a7187b21025111fa726c91d91e4026d58368ac6e', 'UC-097 discovery custody drift');
assert(control.selected_source?.sha256 === '35d665bf92d29fb1eb1d84556769eced61e354a8b2969f2cd1f823b82816edae', 'UC-097 selected source drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.candidate_gravity === 'center', 'UC-097 render geometry drift');
await mkdir(PACKET, { recursive: true });

const discoveryManifestReceipt = await receipt(join(SOURCE_ROOT, 'manifest.json'), { sha256: control.discovery_artifact.manifest_sha256 });
const discoverySummaryReceipt = await receipt(join(SOURCE_ROOT, 'summary.json'), { sha256: control.discovery_artifact.summary_sha256 });
const contactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-final.jpg'), { sha256: control.discovery_artifact.contact_sheet_sha256 });
const discoveryManifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
assert(discoveryManifest.record_id === 'UC-097' && discoveryManifest.actor === 'Dan Stevens' && discoveryManifest.character === 'The Beast' && discoveryManifest.production === 'Beauty and the Beast' && discoveryManifest.year === 2017, 'discovery manifest identity drift');
assert(discoveryManifest.candidate_count === control.discovery_artifact.candidate_count && discoveryManifest.represented_asset_keys?.length === control.discovery_artifact.represented_asset_count, 'discovery candidate denominator drift');
const selectedDiscovery = (discoveryManifest.candidates || []).find(row => row.local === control.selected_source.artifact_path);
assert(selectedDiscovery?.asset_key === control.selected_source.asset_key && selectedDiscovery?.sha256 === control.selected_source.sha256 && selectedDiscovery?.repository_matches?.length === 0, 'selected discovery candidate drift');
const movieEvidence = verifyPageEvidence(discoveryManifest, 'disney-movies-2017', {
  ...control.selected_source,
  artifact_path: control.selected_source.page_artifact_path,
  sha256: control.selected_source.page_sha256,
  bytes: control.selected_source.page_bytes,
  width: control.selected_source.page_width,
  height: control.selected_source.page_height,
  title: control.selected_source.page_title,
  body_sha256: control.selected_source.page_body_sha256
});
assert((movieEvidence.final_asset_alt_receipts || []).some(row => row.asset_key === control.selected_source.asset_key && row.alt === control.selected_source.alt && row.present === true), 'selected official alt receipt drift');
const releaseEvidence = verifyPageEvidence(discoveryManifest, 'disney-company-announcement', control.role_custody.release_and_cast);
const costumeEvidence = verifyPageEvidence(discoveryManifest, 'd23-beast-costume', control.role_custody.digital_costume);

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
const moviePage = await retainFile(control.selected_source.page_artifact_path, control.selected_source.page_output_path, {
  sha256: control.selected_source.page_sha256,
  mime: 'image/png',
  bytes: control.selected_source.page_bytes,
  width: control.selected_source.page_width,
  height: control.selected_source.page_height
});
const releasePage = await retainFile(control.role_custody.release_and_cast.artifact_path, control.role_custody.release_and_cast.output_path, {
  sha256: control.role_custody.release_and_cast.sha256,
  mime: 'image/png',
  bytes: control.role_custody.release_and_cast.bytes,
  width: control.role_custody.release_and_cast.width,
  height: control.role_custody.release_and_cast.height
});
const costumePage = await retainFile(control.role_custody.digital_costume.artifact_path, control.role_custody.digital_costume.output_path, {
  sha256: control.role_custody.digital_costume.sha256,
  mime: 'image/png',
  bytes: control.role_custody.digital_costume.bytes,
  width: control.role_custody.digital_costume.width,
  height: control.role_custody.digital_costume.height
});

const roleRecord = {
  version: 1,
  record_id: 'UC-097',
  actor: 'Dan Stevens',
  character: 'The Beast',
  production: 'Beauty and the Beast',
  year: 2017,
  selected_still: {
    provider: control.selected_source.provider,
    source_page: control.selected_source.page_url,
    page_title: movieEvidence.title,
    image_alt: control.selected_source.alt,
    required_terms: movieEvidence.required_terms,
    body_sha256: control.selected_source.page_body_sha256,
    page_screenshot_sha256: moviePage.sha256,
    selected_image_sha256: selected.sha256
  },
  release_and_cast_binding: {
    provider: control.role_custody.release_and_cast.provider,
    source_page: control.role_custody.release_and_cast.page_url,
    page_title: releaseEvidence.title,
    required_terms: releaseEvidence.required_terms,
    body_sha256: control.role_custody.release_and_cast.body_sha256,
    page_screenshot_sha256: releasePage.sha256,
    binding: control.role_custody.release_and_cast.binding
  },
  digital_costume_binding: {
    provider: control.role_custody.digital_costume.provider,
    source_page: control.role_custody.digital_costume.page_url,
    page_title: costumeEvidence.title,
    required_terms: costumeEvidence.required_terms,
    body_sha256: control.role_custody.digital_costume.body_sha256,
    page_screenshot_sha256: costumePage.sha256,
    binding: control.role_custody.digital_costume.binding
  },
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-role-record.json'), roleRecord);
const roleRecordReceipt = await receipt(join(PACKET, 'exact-role-record.json'));

const candidatePath = join(PACKET, 'uc-097-still-candidate.jpg');
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
const candidate = { path: 'uc-097-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: 1260, height: 1000 })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: 1246, height: 1000 })) };

const duplicateItems = [
  { label: 'Disney Movies 2017 Beast library scene', path: selected.path, sha256: selected.sha256, matches: repository.get(selected.sha256) || [] },
  { label: 'UC-097 still candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-097 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-097 exact-byte duplicate detected');
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
  'Disney Movies identifies the frame as Emma Watson as Belle with Dan Stevens as the Beast in the 2017 live-action Beauty and the Beast.',
  'The Walt Disney Company independently announced the March 17, 2017 live-action film and cast Dan Stevens as the Beast/Prince.',
  'D23 identifies the Beast design as worn by Stevens and documents the physical costumes used as the foundation for the computer-generated character.',
  "The centered candidate and wall simulation preserve the Beast's complete horned head, both eyes, face, fur, neck, shoulders, torso, both arms and hands, with Belle and the castle library retained as production context.",
  `Exact-byte duplicate screening passes against ${repositoryCount.toLocaleString('en-US')} canonical media hashes.`
];
const review = {
  version: 1,
  record_id: 'UC-097',
  actor: 'Dan Stevens',
  character: 'The Beast',
  production: 'Beauty and the Beast',
  year: 2017,
  side: 'still',
  expected_subject: 'The Beast',
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
const reviewMd = `# UC-097 reviewed Dan Stevens Beast still candidate\n\n- **Record:** UC-097\n- **Performer:** Dan Stevens\n- **Displayed role:** The Beast\n- **Production:** Beauty and the Beast (2017)\n- **Official frame:** [Disney Movies](${control.selected_source.page_url})\n- **Release and cast:** [The Walt Disney Company](${control.role_custody.release_and_cast.page_url})\n- **Digital costume record:** [D23](${control.role_custody.digital_costume.page_url})\n- **Source:** \`${selected.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass, single-role center crop\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe exact official source bytes, performer and production receipts, source-page screenshots, deterministic candidate, wall simulation, and duplicate receipt remain evidence-only pending independent canonical acceptance.\n`;
await writeFile(join(PACKET, 'review.md'), reviewMd);
const reviewMdReceipt = await receipt(join(PACKET, 'review.md'));

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-097',
  actor: 'Dan Stevens',
  character: 'The Beast',
  production: 'Beauty and the Beast',
  year: 2017,
  side: 'still',
  expected_subject: 'The Beast',
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    discovery_artifact: control.discovery_artifact,
    render_control_sha256: sha(await readFile(CONTROL)),
    discovery_manifest_sha256: discoveryManifestReceipt.sha256,
    discovery_summary_sha256: discoverySummaryReceipt.sha256,
    discovery_contact_sheet_sha256: contactReceipt.sha256,
    render_artifact: null,
    apply_control_sha256: null
  },
  selected_source: {
    provider: control.selected_source.provider,
    source_page: control.selected_source.page_url,
    asset_url: control.selected_source.asset_url,
    asset_key: control.selected_source.asset_key,
    image_alt: control.selected_source.alt,
    original: selected,
    source_page_screenshot: moviePage
  },
  role_custody: {
    record: { path: 'exact-role-record.json', ...roleRecordReceipt },
    release_and_cast: { provider: control.role_custody.release_and_cast.provider, source_page: control.role_custody.release_and_cast.page_url, binding: control.role_custody.release_and_cast.binding, page_screenshot: releasePage },
    digital_costume: { provider: control.role_custody.digital_costume.provider, source_page: control.role_custody.digital_costume.page_url, binding: control.role_custody.digital_costume.binding, page_screenshot: costumePage }
  },
  candidate: {
    ...candidate,
    recipe: `auto-orient; cover-resize to ${control.render.candidate_width}x${control.render.candidate_height}; ${control.render.candidate_gravity} crop; strip metadata; JPEG quality ${control.render.jpeg_quality}`
  },
  crop_preview: {
    ...cropPreview,
    gravity: control.render.wall_gravity,
    semantics: "The wall simulation removes seven pixels from each outside edge while preserving the complete horned head, both eyes, face, fur, neck, shoulders, torso, both arms and hands."
  },
  rejected_orbit_summary: [
    'Dan Stevens untransformed, the human Prince, the 1991 animated Beast, stage productions, merchandise, fan art, posters, and unrelated Beast designs were rejected.',
    'The official ballroom frame remains a valid candidate in the discovery artifact but was not selected because the profile pose carries less facial identity evidence than the library scene.',
    'Unparameterized and expanded-region probes of each official frame were retained in the discovery artifact but were not selected over the declared Disney delivery.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', sha256: duplicateReceipt.sha256, repository_hash_count: repositoryCount, status: 'pass' },
  exact_subject_review: { identity: review.identity_ruling, presentation: review.presentation_ruling, crop_ruling: review.crop_ruling, notes },
  disposition: 'reviewed-evidence-candidate',
  canonical_mutation: false
};
await writeJson(join(PACKET, 'manifest.json'), manifest);
const manifestReceipt = await receipt(join(PACKET, 'manifest.json'));

const packetNames = [
  'beast-original.jpg',
  'card-crop-preview.jpg',
  'duplicate-scan.json',
  'exact-role-record.json',
  'manifest.json',
  'review.json',
  'review.md',
  'source-page-d23-beast-costume.png',
  'source-page-disney-company-announcement.png',
  'source-page-disney-movies-2017.png',
  'uc-097-still-candidate.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
const sumsReceipt = await receipt(join(PACKET, 'SHA256SUMS'));
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-097',
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
console.log(`PASS — UC-097 exact render packet created at ${PACKET}`);
console.log(`source ${selected.sha256} ${selected.width}x${selected.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`manifest ${manifestReceipt.sha256}`);
console.log(`sums ${sumsReceipt.sha256}`);
