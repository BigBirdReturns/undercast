#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-176-RENDER.json';
const DISCOVERY = process.env.DISCOVERY || '/tmp/card-backfill-uc-176-discovery/card-backfill-uc-176-discover-commons-category-html-fallback';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-176-render';
const MAGICK = process.env.MAGICK_CMD || 'magick';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
};
const fileSha = async path => sha256(await readFile(path));
const gitBlobSha1 = bytes => createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');

function magick(...args) {
  execFileSync(MAGICK, args, { stdio: 'inherit' });
}
function identify(path) {
  const text = execFileSync(MAGICK, ['identify', '-format', '%w %h', path], { encoding: 'utf8' }).trim();
  const [width, height] = text.split(/\s+/).map(Number);
  assert(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0, `cannot identify ${path}`);
  return { width, height };
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
    const media = await readJson('data/media-manifest.json');
    for (const [path, row] of Object.entries(media.assets || {})) {
      if (!/^[0-9a-f]{64}$/i.test(row?.sha256 || '')) continue;
      const list = map.get(row.sha256) || [];
      list.push(`manifest:${path}`);
      map.set(row.sha256, list);
    }
  } catch {}
  for (const path of await walkImages('images')) {
    try {
      const hash = await fileSha(path);
      const list = map.get(hash) || [];
      list.push(`file:${path}`);
      map.set(hash, list);
    } catch {}
  }
  return map;
}
async function copyVerified(source, outputName, expectedSha = null) {
  const bytes = await readFile(source);
  const hash = sha256(bytes);
  if (expectedSha) assert(hash === expectedSha, `${source} SHA-256 drift: ${hash}`);
  const output = join(OUT, outputName);
  await mkdir(dirname(output), { recursive: true });
  await copyFile(source, output);
  return { path: outputName, bytes: bytes.length, sha256: hash };
}
async function fileMetadata(path, relative) {
  const bytes = await readFile(path);
  const row = { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
  if (/\.(?:jpe?g|png|webp)$/i.test(path)) Object.assign(row, identify(path));
  return row;
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-176', 'UC-176 render control drift');
assert(control.kind === 'film' && control.actor === 'Fredric March' && control.character === 'Mr. Hyde', 'UC-176 render identity drift');
assert(control.production === 'Dr. Jekyll and Mr. Hyde (1931)' && control.years === '1931' && control.universe === 'Film' && control.side === 'still', 'UC-176 production boundary drift');
assert(control.audit_id === 'ma_214b44ba458987517acdd2b8', 'UC-176 audit identity drift');
assert(control.discovery_artifact?.run_id === 30502629259 && control.discovery_artifact?.artifact_id === 8744129770, 'UC-176 discovery artifact identity drift');
assert(control.discovery_artifact?.head_sha === '56c31a2c513f52a01460db5ef8efd518eafd65ab', 'UC-176 discovery head drift');
assert(control.discovery_artifact?.artifact_digest_sha256 === '7e6d16f079d96b610c0f5a12bd24853b21b8cb57c5ba8c8675c0ccf23d7e1f97', 'UC-176 artifact digest drift');
assert(control.failure_ledger?.git_blob_sha1 === '69b833c326a4be6462022ccce555b62867670e82' && control.failure_ledger?.checkpoint_count === 9, 'UC-176 failure-ledger control drift');
assert(control.selected_source?.artifact_path === 'candidates/asc/01.jpg' && control.selected_source?.sha256 === '099eea14fbaf17e91b6ab30a9778c4031ddfd42fc946c1edadc0aa0dfa6879ed', 'UC-176 selected source drift');
assert(control.selected_source?.width === 1728 && control.selected_source?.height === 1081 && control.selected_source?.bytes === 127987, 'UC-176 selected source geometry drift');
assert(control.visual_second_desk?.status === 'accepted-for-render' && control.visual_second_desk?.exact_fredric_march_transformed_hyde === true, 'UC-176 visual ruling drift');
assert(control.render_contract?.candidate_width === 1260 && control.render_contract?.candidate_height === 1000, 'UC-176 candidate geometry drift');
assert(control.render_contract?.wall_width === 1246 && control.render_contract?.wall_height === 1000, 'UC-176 wall geometry drift');
assert(control.render_contract?.wall_crop_left_pixels === 7 && control.render_contract?.wall_crop_right_pixels === 7, 'UC-176 wall crop drift');
assert(control.permanent_packet_contract?.expected_file_count === 25 && control.permanent_packet_contract?.exact_output_files?.length === 25, 'UC-176 permanent file contract drift');
assert(control.expected_repository_hash_count === 2070 && control.canonical_mutation === false, 'UC-176 canonical boundary drift');

const discoveryManifestPath = join(DISCOVERY, 'manifest.json');
const discoverySummaryPath = join(DISCOVERY, 'summary.json');
assert(await fileSha(discoveryManifestPath) === control.discovery_artifact.manifest_sha256, 'UC-176 discovery manifest hash drift');
assert(await fileSha(discoverySummaryPath) === control.discovery_artifact.summary_sha256, 'UC-176 discovery summary hash drift');
assert(await fileSha(join(DISCOVERY, 'contact-sheet.jpg')) === control.discovery_artifact.contact_sheet_sha256, 'UC-176 discovery contact-sheet hash drift');
assert(await fileSha(join(DISCOVERY, 'source-api-commons-category-retry.json')) === control.discovery_artifact.commons_retry_sha256, 'UC-176 Commons retry hash drift');
assert(await fileSha(join(DISCOVERY, 'source-commons-category-html-fallback.json')) === control.discovery_artifact.commons_fallback_sha256, 'UC-176 Commons fallback hash drift');

const discoveryManifest = await readJson(discoveryManifestPath);
const discoverySummary = await readJson(discoverySummaryPath);
assert(discoveryManifest.record_id === 'UC-176' && discoverySummary.record_id === 'UC-176', 'UC-176 discovery record drift');
assert(discoveryManifest.candidate_count === 11 && discoverySummary.candidate_count === 11, 'UC-176 candidate denominator drift');
assert(discoveryManifest.candidate_counts?.asc === 4 && discoveryManifest.candidate_counts?.commons === 7, 'UC-176 manifest candidate-count drift');
assert(discoverySummary.candidate_counts?.asc === 4 && discoverySummary.candidate_counts?.commons === 7, 'UC-176 summary candidate-count drift');
assert(discoveryManifest.repository_hash_count === 2070, 'UC-176 discovery repository denominator drift');
assert(discoveryManifest.canonical_mutation === false && discoverySummary.canonical_mutation === false, 'UC-176 discovery canonical mutation drift');
assert(discoveryManifest.selection_contract?.exact_fredric_march_mr_hyde_1931_still_required === true, 'UC-176 selection contract drift');
assert(discoveryManifest.selection_contract?.actor_role_evidence_must_be_independent_from_selected_image === true, 'UC-176 evidence separation drift');
assert(discoveryManifest.selection_contract?.visual_second_desk_required === true, 'UC-176 visual-second-desk drift');
for (const key of ['afi-catalog', 'oscars-1933', 'asc-history', 'commons-category']) {
  const evidence = discoveryManifest.page_evidence?.[key];
  assert(evidence?.status === 'loaded' && evidence.required_terms_missing?.length === 0, `UC-176 ${key} evidence drift`);
}
const ascEvidence = discoveryManifest.page_evidence['asc-history'];
const ascMirror = ascEvidence.transport_mirrors?.find(row => row.requested_url === 'https://theasc.com/articles/two-faced-treachery-dr-jekyll-and-mr-hyde' && row.http_status === 200);
assert(ascMirror?.html_receipt?.sha256 === 'ccca12619f84b97e931ee2f289ab5297873185f94c5892c8d54f1e61e0eccb64', 'UC-176 ASC article HTML receipt drift');
assert(ascMirror?.text_receipt?.sha256 === '1f187089888e9969bc9126d6f719738df9b07a4d1d714d14d45d38a5c4e46a22', 'UC-176 ASC article text receipt drift');

const selected = discoverySummary.candidates?.find(row => row.local === control.selected_source.artifact_path && row.sha256 === control.selected_source.sha256);
assert(selected, 'UC-176 selected candidate absent from discovery summary');
assert(selected.source_family === control.selected_source.source_family, 'UC-176 selected source family drift');
assert(selected.provider === control.selected_source.provider, 'UC-176 selected provider drift');
assert(selected.source_page === control.selected_source.source_page, 'UC-176 selected source page drift');
assert(selected.url === control.selected_source.declared_url && selected.resolved_url === control.selected_source.resolved_url, 'UC-176 selected URL drift');
assert(selected.local === control.selected_source.artifact_path && selected.detected_mime === control.selected_source.mime, 'UC-176 selected artifact identity drift');
for (const key of ['width', 'height', 'bytes', 'sha256']) assert(selected[key] === control.selected_source[key], `UC-176 selected source ${key} drift`);
assert(Array.isArray(selected.repository_matches) && selected.repository_matches.length === 0 && selected.meets_floor === true && selected.retained === true && selected.exclusion === null, 'UC-176 selected source eligibility drift');
const manifestSelected = discoveryManifest.candidates?.find(row => row.local === control.selected_source.artifact_path && row.sha256 === control.selected_source.sha256);
assert(manifestSelected, 'UC-176 selected candidate absent from discovery manifest');
assert(discoveryManifest.selected_candidate === null && discoverySummary.selected_candidate === null, 'UC-176 discovery must remain visually unselected before this render control');

const failureBytes = await readFile(control.failure_ledger.path);
assert(gitBlobSha1(failureBytes) === control.failure_ledger.git_blob_sha1, 'UC-176 failure-ledger blob drift');
const failureLedger = JSON.parse(failureBytes.toString('utf8'));
assert(failureLedger.failed_discovery_checkpoints?.length === 9, 'UC-176 failure checkpoint count drift');
assert(failureLedger.checkpoint_status === control.failure_ledger.checkpoint_status, 'UC-176 failure checkpoint status drift');

const specimen = (await readJson('data/specimens.json')).find(row => row.id === 'UC-176');
const sourceLedger = (await readJson('data/SOURCES.json')).find(row => row.id === 'UC-176');
const mediaAudit = (await readJson('data/MEDIA-AUDIT.json')).items.find(row => row.id === control.audit_id);
assert(specimen && specimen.actor === 'Fredric March' && specimen.character === 'Mr. Hyde' && specimen.production === 'Dr. Jekyll and Mr. Hyde (1931)' && specimen.years === '1931', 'UC-176 specimen identity drift');
assert(specimen.designer === 'Wally Westmore' && specimen.transform === 4 && !specimen.still && specimen.portrait?.src === 'images/uc-176-portrait.jpg', 'UC-176 specimen boundary drift');
assert(sourceLedger && !sourceLedger.still && sourceLedger.portrait?.src === 'images/uc-176-portrait.jpg', 'UC-176 source-ledger boundary drift');
assert(mediaAudit && mediaAudit.status === 'absent' && !mediaAudit.asset && mediaAudit.side === 'still', 'UC-176 media-audit boundary drift');

await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift: ${repository.size}`);
assert((repository.get(control.selected_source.sha256) || []).length === 0, 'UC-176 selected source already exists canonically');

const selectedSourcePath = join(DISCOVERY, control.selected_source.artifact_path);
await copyVerified(selectedSourcePath, control.selected_source.output_path, control.selected_source.sha256);
const selectedGeometry = identify(join(OUT, control.selected_source.output_path));
assert(selectedGeometry.width === control.selected_source.width && selectedGeometry.height === control.selected_source.height, 'UC-176 selected geometry drift after copy');

const pageCopies = [
  ['afi-catalog', 'source-page-afi-catalog.png', 'source-text-afi-catalog.txt'],
  ['oscars-1933', 'source-page-oscars-1933.png', 'source-text-oscars-1933.txt'],
  ['asc-history', 'source-page-asc-history.png', 'source-text-asc-history.txt'],
  ['commons-category', 'source-page-commons-category.png', 'source-text-commons-category.txt']
];
for (const [key, imageOut, textOut] of pageCopies) {
  const evidence = discoveryManifest.page_evidence[key];
  await copyVerified(join(DISCOVERY, evidence.screenshot.path), imageOut, evidence.screenshot.sha256);
  await copyVerified(join(DISCOVERY, evidence.text_receipt.path), textOut, evidence.text_receipt.sha256);
}
await copyVerified(join(DISCOVERY, 'pages/asc-history-mirror-03.html'), 'source-asc-history-article.html', ascMirror.html_receipt.sha256);
await copyVerified(join(DISCOVERY, 'pages/asc-history-mirror-03.txt'), 'source-asc-history-article.txt', ascMirror.text_receipt.sha256);
await copyVerified(join(DISCOVERY, 'pages/asc-history-transport-mirrors.json'), 'source-asc-history-transport-mirrors.json');
await copyVerified(join(DISCOVERY, 'source-api-commons-category.json'), 'source-api-commons-category.json');
await copyVerified(join(DISCOVERY, 'source-api-commons-category-retry.json'), 'source-api-commons-category-retry.json', control.discovery_artifact.commons_retry_sha256);
await copyVerified(join(DISCOVERY, 'source-commons-category-html-fallback.json'), 'source-commons-category-html-fallback.json', control.discovery_artifact.commons_fallback_sha256);
await copyVerified(join(DISCOVERY, 'contact-sheet.jpg'), 'contact-sheet.jpg', control.discovery_artifact.contact_sheet_sha256);
await writeFile(join(OUT, 'source-discovery-failures.json'), failureBytes);

const src = join(OUT, control.selected_source.output_path);
const work = join(OUT, '.render-work');
await mkdir(work, { recursive: true });
const identity = join(work, 'identity.jpg');
const backdrop = join(work, 'backdrop.jpg');
const inset = join(work, 'inset.png');
const lower = join(work, 'lower.jpg');
const divider = join(work, 'divider.png');
const candidate = join(OUT, control.render_contract.candidate_path);
const wall = join(OUT, control.render_contract.wall_crop_path);
const identityContract = control.render_contract.identity_region;
const fullContract = control.render_contract.full_source_region;
magick(src, '-auto-orient', '-crop', `${identityContract.source_crop_width}x${identityContract.source_crop_height}+${identityContract.source_crop_x}+${identityContract.source_crop_y}`, '+repage', '-resize', `${identityContract.output_width}x${identityContract.output_height}!`, '-colorspace', 'sRGB', '-strip', identity);
magick(src, '-auto-orient', '-resize', `${fullContract.output_width}x${fullContract.output_height}^`, '-gravity', 'center', '-extent', `${fullContract.output_width}x${fullContract.output_height}`, '-blur', `0x${fullContract.backdrop_blur_radius}`, '-brightness-contrast', `${fullContract.backdrop_brightness_adjustment}x0`, '-colorspace', 'sRGB', backdrop);
magick(src, '-auto-orient', '-resize', `${fullContract.inset_max_width}x${fullContract.inset_max_height}>`, '-bordercolor', fullContract.inset_border_color, '-border', String(fullContract.inset_border_pixels), '-colorspace', 'sRGB', inset);
const insetGeometry = identify(inset);
assert(insetGeometry.width <= fullContract.output_width && insetGeometry.height <= fullContract.output_height, 'UC-176 full-source inset overflow');
magick(backdrop, inset, '-gravity', 'center', '-composite', lower);
magick('-size', `${control.render_contract.candidate_width}x${control.render_contract.divider_height}`, `xc:${control.render_contract.divider_color}`, divider);
magick(identity, divider, lower, '-append', '-colorspace', 'sRGB', '-strip', '-quality', String(control.render_contract.jpeg_quality), candidate);
magick(candidate, '-gravity', 'center', '-crop', `${control.render_contract.wall_width}x${control.render_contract.wall_height}+0+0`, '+repage', '-colorspace', 'sRGB', '-strip', '-quality', String(control.render_contract.jpeg_quality), wall);
const candidateGeometry = identify(candidate);
const wallGeometry = identify(wall);
assert(candidateGeometry.width === 1260 && candidateGeometry.height === 1000, 'UC-176 candidate output geometry drift');
assert(wallGeometry.width === 1246 && wallGeometry.height === 1000, 'UC-176 wall output geometry drift');

const selectedHash = await fileSha(src);
const candidateHash = await fileSha(candidate);
const wallHash = await fileSha(wall);
const duplicateScan = {
  version: 1,
  repository_hash_count: repository.size,
  items: [
    { label: 'selected Mr. Hyde source', path: control.selected_source.output_path, sha256: selectedHash, matches: repository.get(selectedHash) || [] },
    { label: 'UC-176 rendered candidate', path: control.render_contract.candidate_path, sha256: candidateHash, matches: repository.get(candidateHash) || [] },
    { label: 'UC-176 wall crop', path: control.render_contract.wall_crop_path, sha256: wallHash, matches: repository.get(wallHash) || [] }
  ]
};
assert(duplicateScan.items.every(row => row.matches.length === 0), 'UC-176 exact-byte duplicate detected');
assert(new Set(duplicateScan.items.map(row => row.sha256)).size === 3, 'UC-176 selected/candidate/wall bytes are not distinct');
await writeJson(join(OUT, 'duplicate-scan.json'), duplicateScan);

const exactPerformanceRecord = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-176',
  identity: {
    actor: 'Fredric March', character: 'Mr. Hyde', production: 'Dr. Jekyll and Mr. Hyde (1931)', years: '1931', universe: 'Film', designer: 'Wally Westmore', transform: 4
  },
  canonical_rows: { specimen, source_ledger: sourceLedger, media_audit: mediaAudit },
  evidence_bindings: Object.fromEntries(Object.entries(discoveryManifest.page_evidence).map(([key, row]) => [key, {
    provider: row.provider,
    source_page: row.source_page,
    http_status: row.http_status,
    transport: row.transport,
    validation_surfaces: row.validation_surfaces,
    required_terms: row.required_terms,
    required_terms_missing: row.required_terms_missing,
    body_sha256: row.body_sha256,
    custody_type: row.custody_type,
    binding: row.binding,
    screenshot: row.screenshot,
    text_receipt: row.text_receipt,
    transport_mirrors: row.transport_mirrors
  }])),
  selected_image_boundary: {
    selected_source: control.selected_source,
    image_proves_visual_identity_only: true,
    actor_role_credit_is_bound_independently_by_afi_and_academy: true,
    makeup_and_transformation_design_are_bound_independently_by_asc: true,
    commons_supplies_file_level_visual_orbit_custody_only: true
  },
  canonical_mutation: false
};
await writeJson(join(OUT, 'exact-performance-record.json'), exactPerformanceRecord);

const review = {
  version: 1,
  record_id: 'UC-176',
  disposition: 'accept-render-for-permanent-evidence',
  selected_source: control.selected_source,
  visual_second_desk: control.visual_second_desk,
  render_contract: control.render_contract,
  render_result: {
    candidate: await fileMetadata(candidate, control.render_contract.candidate_path),
    wall_crop: await fileMetadata(wall, control.render_contract.wall_crop_path),
    full_source_inset: { ...insetGeometry, all_selected_source_edges_visible: true }
  },
  duplicate_scan: duplicateScan,
  canonical_mutation: false
};
await writeJson(join(OUT, 'review.json'), review);
await writeFile(join(OUT, 'review.md'), `# UC-176 render review\n\nFredric March's fully transformed Mr. Hyde from *Dr. Jekyll and Mr. Hyde* (1931) is retained from the exact ASC article image byte object \`${control.selected_source.sha256}\`.\n\nThe 1260 × 1000 candidate uses a 560-pixel identity crop, an eight-pixel divider, and a 432-pixel full-source field. The lower inset preserves every selected source edge; the blurred backdrop is decorative only. The 1246 × 1000 wall simulation removes seven pixels from each outside edge and does not change the face, teeth, ears, hands, coat, torso, source-edge ruling, or role identity.\n\nAFI and the Academy independently bind Fredric March to the 1931 dual Jekyll/Hyde performance. American Cinematographer independently binds the transformation and Wally Westmore makeup history. Wikimedia Commons remains visual-source custody only. Clean-faced Jekyll, other performers and adaptations, posters, lobby art, illustrations, colorizations, costumes, merchandise, and generic monsters remain excluded.\n\nExact-byte duplicate screening passed against ${repository.size} canonical media hashes. Canonical card data, source-ledger still state, media-audit disposition, and the existing performer portrait remain unchanged.\n`);

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-176',
  kind: 'film',
  actor: 'Fredric March',
  character: 'Mr. Hyde',
  production: 'Dr. Jekyll and Mr. Hyde (1931)',
  years: '1931',
  universe: 'Film',
  side: 'still',
  discovery_artifact: control.discovery_artifact,
  failure_ledger: {
    source_path: control.failure_ledger.path,
    git_blob_sha1: control.failure_ledger.git_blob_sha1,
    checkpoint_count: failureLedger.failed_discovery_checkpoints.length,
    checkpoint_status: failureLedger.checkpoint_status,
    retained_path: 'source-discovery-failures.json',
    retained_sha256: await fileSha(join(OUT, 'source-discovery-failures.json'))
  },
  selected_source: { ...control.selected_source, retained_path: control.selected_source.output_path, retained_sha256: selectedHash },
  evidence_pages: Object.fromEntries(pageCopies.map(([key, imageOut, textOut]) => [key, {
    provider: discoveryManifest.page_evidence[key].provider,
    source_page: discoveryManifest.page_evidence[key].source_page,
    validation_surfaces: discoveryManifest.page_evidence[key].validation_surfaces,
    required_terms_missing: discoveryManifest.page_evidence[key].required_terms_missing,
    body_sha256: discoveryManifest.page_evidence[key].body_sha256,
    screenshot: { path: imageOut, sha256: discoveryManifest.page_evidence[key].screenshot.sha256 },
    text_receipt: { path: textOut, sha256: discoveryManifest.page_evidence[key].text_receipt.sha256 }
  }])),
  transport_receipts: {
    asc_article_html: { path: 'source-asc-history-article.html', sha256: ascMirror.html_receipt.sha256 },
    asc_article_text: { path: 'source-asc-history-article.txt', sha256: ascMirror.text_receipt.sha256 },
    asc_transport_manifest: { path: 'source-asc-history-transport-mirrors.json', sha256: await fileSha(join(OUT, 'source-asc-history-transport-mirrors.json')) },
    commons_source: { path: 'source-api-commons-category.json', sha256: await fileSha(join(OUT, 'source-api-commons-category.json')) },
    commons_retry: { path: 'source-api-commons-category-retry.json', sha256: control.discovery_artifact.commons_retry_sha256 },
    commons_fallback: { path: 'source-commons-category-html-fallback.json', sha256: control.discovery_artifact.commons_fallback_sha256 }
  },
  visual_second_desk: control.visual_second_desk,
  render: {
    contract: control.render_contract,
    candidate: review.render_result.candidate,
    wall_crop: review.render_result.wall_crop,
    full_source_inset: review.render_result.full_source_inset
  },
  duplicate_scan: duplicateScan,
  exact_performance_record: { path: 'exact-performance-record.json', sha256: await fileSha(join(OUT, 'exact-performance-record.json')) },
  contact_sheet: { path: 'contact-sheet.jpg', sha256: control.discovery_artifact.contact_sheet_sha256 },
  repository_hash_count: repository.size,
  permanent_packet_contract: control.permanent_packet_contract,
  canonical_boundaries: {
    specimen_still_absent: !specimen.still,
    source_ledger_still_absent: !sourceLedger.still,
    media_audit_absent: mediaAudit.status === 'absent' && !mediaAudit.asset,
    existing_performer_portrait_unchanged: specimen.portrait?.src === 'images/uc-176-portrait.jpg' && sourceLedger.portrait?.src === 'images/uc-176-portrait.jpg'
  },
  disposition: 'single-role-render-complete-pending-permanent-apply',
  canonical_mutation: false
};
await writeJson(join(OUT, 'manifest.json'), manifest);

const { unlink, rmdir } = await import('node:fs/promises');
for (const file of await readdir(work)) await unlink(join(work, file));
await rmdir(work);

const beforeSums = (await readdir(OUT)).filter(name => name !== 'SHA256SUMS').sort();
assert(beforeSums.length === 24, `UC-176 pre-checksum file count drift: ${beforeSums.length}`);
const sumLines = [];
for (const name of beforeSums) sumLines.push(`${await fileSha(join(OUT, name))}  ${name}`);
await writeFile(join(OUT, 'SHA256SUMS'), sumLines.join('\n') + '\n');
const finalFiles = (await readdir(OUT)).sort();
const expectedFiles = [...control.permanent_packet_contract.exact_output_files].sort();
assert(JSON.stringify(finalFiles) === JSON.stringify(expectedFiles), `UC-176 output file set drift\nactual=${finalFiles.join(',')}\nexpected=${expectedFiles.join(',')}`);
for (const line of sumLines) {
  const [hash, , name] = line.split(' ');
  assert(await fileSha(join(OUT, name)) === hash, `UC-176 checksum drift for ${name}`);
}
console.log(`PASS — UC-176 deterministic Mr. Hyde candidate rendered with ${finalFiles.length} evidence files`);
console.log(JSON.stringify({
  selected_source_sha256: selectedHash,
  candidate_sha256: candidateHash,
  wall_crop_sha256: wallHash,
  manifest_sha256: await fileSha(join(OUT, 'manifest.json')),
  checksum_ledger_sha256: await fileSha(join(OUT, 'SHA256SUMS')),
  output_files: finalFiles.length,
  canonical_mutation: false
}, null, 2));
