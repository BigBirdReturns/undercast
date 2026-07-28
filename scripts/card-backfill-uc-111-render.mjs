#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-111-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-111-render';
const PACKET = join(OUT, 'UC-111');
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
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-111', 'UC-111 render scope drift');
assert(control.actor === 'Deep Roy' && control.character === 'The Oompa Loompas' && control.production === 'Charlie and the Chocolate Factory' && control.year === 2005 && control.side === 'still', 'UC-111 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8676143515 && control.discovery_artifact?.head_sha === '977425e638c6367d4fc304e0775e4183f20a3d86', 'UC-111 discovery custody drift');
assert(control.failed_discovery_checkpoints?.length === 4, 'UC-111 failed checkpoint denominator drift');
assert(control.selected_source?.sha256 === '6e2a8ec0f5edd7c3c28d495ab928ae2055bc97667dfff8b209eed48e7d5cef6d', 'UC-111 selected source drift');
assert(control.multiplicity_boundary?.collective_display_required === true && control.multiplicity_boundary?.visible_repeated_bodies_required === true && control.multiplicity_boundary?.single_isolated_body_insufficient === true, 'UC-111 multiplicity boundary drift');
assert(control.render?.pre_resize_width === 1534 && control.render?.pre_resize_height === 1200 && control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.candidate_gravity === 'east', 'UC-111 render geometry drift');
await mkdir(PACKET, { recursive: true });

const discoveryManifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
await receipt(join(SOURCE_ROOT, 'manifest.json'), { sha256: control.discovery_artifact.manifest_sha256 });
await receipt(join(SOURCE_ROOT, 'summary.json'), { sha256: control.discovery_artifact.summary_sha256 });
await receipt(join(SOURCE_ROOT, 'contact-sheet-collective.jpg'), { sha256: control.discovery_artifact.contact_sheet_sha256 });
assert(discoveryManifest.record_id === 'UC-111' && discoveryManifest.actor === 'Deep Roy' && discoveryManifest.character === 'The Oompa Loompas' && discoveryManifest.production === 'Charlie and the Chocolate Factory' && discoveryManifest.year === 2005, 'discovery manifest identity drift');
assert(discoveryManifest.candidate_count === control.discovery_artifact.candidate_count, 'discovery candidate count drift');
assert(discoveryManifest.selection_contract?.collective_many_body_frame_required === true && discoveryManifest.selection_contract?.single_isolated_body_insufficient_for_final_candidate === true, 'discovery multiplicity contract drift');
const selectedDiscovery = (discoveryManifest.candidates || []).find(row => row.local === control.selected_source.artifact_path);
assert(selectedDiscovery?.sha256 === control.selected_source.sha256 && selectedDiscovery?.admission_class === 'collective-final-frame' && selectedDiscovery?.caption_local === true && selectedDiscovery?.repository_matches?.length === 0, 'selected discovery candidate drift');

const frameEvidence = verifyPageEvidence(discoveryManifest, 'chocolate-river-collective-frame', {
  title: control.selected_source.page_title,
  required_terms: control.selected_source.required_terms,
  body_sha256: control.selected_source.page_body_sha256
});
const mechanismEvidence = verifyPageEvidence(discoveryManifest, 'warner-production-notes', control.role_custody.performance_mechanism);
const productionEvidence = verifyPageEvidence(discoveryManifest, 'afi-production-record', control.role_custody.production);

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
const mechanismPage = await retainFile(control.role_custody.performance_mechanism.artifact_path, control.role_custody.performance_mechanism.output_path, {
  sha256: control.role_custody.performance_mechanism.sha256,
  mime: 'image/png', bytes: control.role_custody.performance_mechanism.bytes, width: control.role_custody.performance_mechanism.width, height: control.role_custody.performance_mechanism.height
});
const productionPage = await retainFile(control.role_custody.production.artifact_path, control.role_custody.production.output_path, {
  sha256: control.role_custody.production.sha256,
  mime: 'image/png', bytes: control.role_custody.production.bytes, width: control.role_custody.production.width, height: control.role_custody.production.height
});

const roleRecord = {
  version: 1,
  record_id: 'UC-111',
  actor: 'Deep Roy',
  character: 'The Oompa Loompas',
  production: 'Charlie and the Chocolate Factory',
  year: 2005,
  collective_frame: {
    provider: control.selected_source.provider,
    source_page: control.selected_source.page_url,
    page_title: frameEvidence.title,
    required_terms: frameEvidence.required_terms,
    body_sha256: control.selected_source.page_body_sha256,
    page_screenshot_sha256: framePage.sha256,
    selected_image_sha256: selected.sha256,
    caption: control.selected_source.caption,
    binding: 'The retained frame visibly presents a group of blue-clad Oompa Loompas rowing the 2005 film galley and identifies every visible Oompa as a Deep Roy performance multiplied digitally.'
  },
  performance_mechanism: {
    provider: control.role_custody.performance_mechanism.provider,
    source_page: control.role_custody.performance_mechanism.page_url,
    page_title: mechanismEvidence.title,
    required_terms: mechanismEvidence.required_terms,
    body_sha256: control.role_custody.performance_mechanism.body_sha256,
    page_screenshot_sha256: mechanismPage.sha256,
    binding: control.role_custody.performance_mechanism.binding
  },
  production: {
    provider: control.role_custody.production.provider,
    source_page: control.role_custody.production.page_url,
    page_title: productionEvidence.title,
    required_terms: productionEvidence.required_terms,
    body_sha256: control.role_custody.production.body_sha256,
    page_screenshot_sha256: productionPage.sha256,
    binding: control.role_custody.production.binding
  },
  multiplicity_boundary: control.multiplicity_boundary,
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-role-record.json'), roleRecord);
const roleRecordReceipt = await receipt(join(PACKET, 'exact-role-record.json'));

const candidatePath = join(PACKET, 'uc-111-still-candidate.jpg');
magick(
  join(PACKET, selected.path),
  '-auto-orient',
  '-filter', 'Lanczos',
  '-resize', `${control.render.pre_resize_width}x${control.render.pre_resize_height}^`,
  '-gravity', control.render.candidate_gravity,
  '-extent', `${control.render.candidate_width}x${control.render.candidate_height}`,
  '-strip',
  '-quality', String(control.render.jpeg_quality),
  candidatePath
);
const candidate = { path: 'uc-111-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: 1260, height: 1000 })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: 1246, height: 1000 })) };

const duplicateItems = [
  { label: 'Caption-bound collective Oompa Loompa source', path: selected.path, sha256: selected.sha256, matches: repository.get(selected.sha256) || [] },
  { label: 'UC-111 still candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-111 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-111 exact-byte duplicate detected');
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
  'The selected 2005 Chocolate River frame presents a synchronized group of blue-clad Oompa Loompas rather than an isolated worker, so the card displays the authored collective role.',
  'The caption identifies every visible Oompa as a Deep Roy performance that was miniaturized and multiplied digitally; Warner Bros. independently states that Roy supplied the entire community and performed each visible body separately.',
  'The 120-percent east-anchored enlargement preserves the repeated rowing bodies, synchronized oars, passenger scale, pink galley and Chocolate River while making the many-body mechanism legible at card size.',
  'The 1246x1000 wall simulation removes seven pixels from each outside edge without changing the repeated-body count, collective-role identity or production-context ruling.',
  `Exact-byte duplicate screening passes against ${repositoryCount.toLocaleString('en-US')} canonical repository hashes.`
];
const review = {
  version: 1,
  record_id: 'UC-111',
  actor: 'Deep Roy',
  character: 'The Oompa Loompas',
  production: 'Charlie and the Chocolate Factory',
  year: 2005,
  side: 'still',
  expected_subject: 'The Oompa Loompas',
  source_sha256: selected.sha256,
  exact_role_record_sha256: roleRecordReceipt.sha256,
  candidate_sha256: candidate.sha256,
  crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-subject',
  presentation_ruling: 'collective-character-depiction',
  crop_ruling: 'pass-collective-east-zoom-crop',
  multiplicity_ruling: 'pass-many-body-single-performer-mechanism',
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  reviewed_at: control.reviewed_at,
  canonical_mutation: false,
  disposition: 'reviewed-evidence-candidate',
  notes
};
await writeJson(join(PACKET, 'review.json'), review);
await writeFile(join(PACKET, 'review.md'), `# UC-111 reviewed Deep Roy / Oompa Loompas collective still candidate\n\n- **Record:** UC-111\n- **Performer:** Deep Roy\n- **Displayed role:** The Oompa Loompas\n- **Production:** Charlie and the Chocolate Factory (2005)\n- **Source:** Hear The Boat Sing Blogspot archive / American Cinematographer caption reprint\n- **Source bytes:** \`${selected.sha256}\`\n- **Exact role record:** \`${roleRecordReceipt.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** collective character depiction\n- **Multiplicity ruling:** pass, many visible bodies generated from separate Deep Roy performances\n- **Crop ruling:** pass, collective east-zoom crop\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe exact source bytes, source-page receipts, deterministic candidate, wall simulation, role record, review and duplicate receipt remain evidence-only pending independent canonical acceptance.\n`);

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-111',
  actor: 'Deep Roy',
  character: 'The Oompa Loompas',
  production: 'Charlie and the Chocolate Factory',
  year: 2005,
  side: 'still',
  expected_subject: 'The Oompa Loompas',
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    selector_artifact: control.selector_artifact,
    scope_artifact: control.scope_artifact,
    discovery_artifact: control.discovery_artifact,
    failed_discovery_checkpoints: control.failed_discovery_checkpoints,
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
    caption: control.selected_source.caption,
    original: selected,
    source_page_screenshot: framePage
  },
  role_custody: {
    record: { path: 'exact-role-record.json', ...roleRecordReceipt },
    performance_mechanism: { provider: control.role_custody.performance_mechanism.provider, source_page: control.role_custody.performance_mechanism.page_url, binding: control.role_custody.performance_mechanism.binding, page_screenshot: mechanismPage },
    production: { provider: control.role_custody.production.provider, source_page: control.role_custody.production.page_url, binding: control.role_custody.production.binding, page_screenshot: productionPage },
    multiplicity_boundary: control.multiplicity_boundary
  },
  candidate: { ...candidate, recipe: `auto-orient; Lanczos cover-resize to ${control.render.pre_resize_width}x${control.render.pre_resize_height}; ${control.render.candidate_gravity} extent to ${control.render.candidate_width}x${control.render.candidate_height}; strip metadata; JPEG quality ${control.render.jpeg_quality}` },
  crop_preview: { ...cropPreview, gravity: control.render.wall_gravity, semantics: 'The wall simulation removes seven pixels from each outside edge while preserving the synchronized blue-clad rowers, their oars, the passenger scale, galley and Chocolate River.' },
  rejected_orbit_summary: [
    'The 1971 film boat, book illustrations, production sketches, stage versions, advertising mascots, toys, cosplay, posters and untransformed Deep Roy were rejected.',
    'The discovery orbit was restricted to the exact Blogger-hosted 2005 blue-clad boat image family after the broader archival page exposed both adaptations and unrelated rowing illustrations.',
    'The smaller alternate JPEG delivery remains in the discovery artifact but was not selected over the higher-byte s0 delivery of the same 400x313 frame.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: repositoryCount, status: 'pass' },
  exact_subject_review: { identity: review.identity_ruling, presentation: review.presentation_ruling, crop_ruling: review.crop_ruling, multiplicity_ruling: review.multiplicity_ruling, notes },
  disposition: 'reviewed-evidence-candidate',
  canonical_mutation: false
};
await writeJson(join(PACKET, 'manifest.json'), manifest);

const packetNames = ['card-crop-preview.jpg','duplicate-scan.json','exact-role-record.json','manifest.json','oompa-loompas-original.jpg','review.json','review.md','source-page-afi-production-record.png','source-page-chocolate-river-collective-frame.png','source-page-warner-production-notes.png','uc-111-still-candidate.jpg'];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-111',
  source: selected,
  exact_role_record: { path: 'exact-role-record.json', ...roleRecordReceipt },
  candidate,
  crop_preview: cropPreview,
  source_pages: [framePage, mechanismPage, productionPage],
  failed_discovery_checkpoints: control.failed_discovery_checkpoints,
  repository_hash_count: repositoryCount,
  packet_files: [...packetNames, 'SHA256SUMS'],
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))),
  review_sha256: sha(await readFile(join(PACKET, 'review.json'))),
  sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))),
  canonical_mutation: false
});
console.log(`PASS — UC-111 collective render packet created at ${PACKET}`);
console.log(`source ${selected.sha256} ${selected.width}x${selected.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`role ${roleRecordReceipt.sha256}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
