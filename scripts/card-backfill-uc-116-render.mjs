#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-116-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-116-render';
const PACKET = join(OUT, 'UC-116');
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
function normalizeRawWikitext(fileText) {
  return fileText.endsWith('\n') ? fileText.slice(0, -1) : fileText;
}

const control = await readJson(CONTROL);
assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-116', 'UC-116 render scope drift');
assert(control.actor === 'June Foray' && control.character === 'Rocky, Natasha & Granny' && control.production === 'Rocky & Bullwinkle / Looney Tunes' && control.year === 1959 && control.side === 'still', 'UC-116 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8677975755 && control.discovery_artifact?.head_sha === 'd3d8da27ae7774d112602e732ce0e9c0a1dc468c', 'UC-116 discovery custody drift');
assert(control.failed_discovery_checkpoints?.length === 3 && control.roles?.length === 3, 'UC-116 render denominator drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.panel_width === 412 && control.render?.gap_width === 12, 'UC-116 render geometry drift');
await mkdir(PACKET, { recursive: true });

const manifestReceipt = await receipt(join(SOURCE_ROOT, 'manifest.json'), { sha256: control.discovery_artifact.manifest_sha256 });
const summaryReceipt = await receipt(join(SOURCE_ROOT, 'summary.json'), { sha256: control.discovery_artifact.summary_sha256 });
const contactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-all-roles.jpg'), { sha256: control.discovery_artifact.contact_sheet_sha256 });
const rockyContactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-rocky.jpg'), { sha256: control.discovery_artifact.rocky_contact_sha256 });
const natashaContactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-natasha.jpg'), { sha256: control.discovery_artifact.natasha_contact_sha256 });
const grannyContactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-granny.jpg'), { sha256: control.discovery_artifact.granny_contact_sha256 });
const discoveryManifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
const discoverySummary = await readJson(join(SOURCE_ROOT, 'summary.json'));
assert(discoveryManifest.record_id === 'UC-116' && discoveryManifest.actor === 'June Foray' && discoveryManifest.character === 'Rocky, Natasha & Granny' && discoveryManifest.production === 'Rocky & Bullwinkle / Looney Tunes', 'UC-116 discovery manifest identity drift');
assert(discoveryManifest.candidate_count === control.discovery_artifact.candidate_count && JSON.stringify(discoveryManifest.role_counts) === JSON.stringify(control.discovery_artifact.role_counts), 'UC-116 discovery candidate denominator drift');
assert(discoverySummary.candidate_count === control.discovery_artifact.candidate_count && JSON.stringify(discoverySummary.role_counts) === JSON.stringify(control.discovery_artifact.role_counts), 'UC-116 discovery summary denominator drift');
assert(JSON.stringify(discoveryManifest.failed_discovery_checkpoints) === JSON.stringify(control.failed_discovery_checkpoints), 'UC-116 failed discovery custody drift');

const actorEvidence = discoveryManifest.page_evidence?.['television-academy-june-foray'];
assert(actorEvidence?.status === 'loaded' && actorEvidence.http_status >= 200 && actorEvidence.http_status < 400, 'Television Academy role evidence transport drift');
assert(actorEvidence.title === control.actor_role_custody.page_title, 'Television Academy title drift');
assert(JSON.stringify(actorEvidence.required_terms) === JSON.stringify(control.actor_role_custody.required_terms) && actorEvidence.required_terms_missing.length === 0, 'Television Academy role denominator drift');
assert(sha(Buffer.from(actorEvidence.body_text || '', 'utf8')) === control.actor_role_custody.body_sha256, 'Television Academy body receipt drift');
const actorPage = await retain(control.actor_role_custody.artifact_path, control.actor_role_custody.output_path, {
  sha256: control.actor_role_custody.sha256,
  mime: 'image/png',
  bytes: control.actor_role_custody.bytes,
  width: control.actor_role_custody.width,
  height: control.actor_role_custody.height
});

const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);
const roleRows = [];
for (const role of control.roles) {
  const api = discoveryManifest.api_evidence?.[role.key];
  assert(api, `missing API evidence for ${role.key}`);
  assert(api.api_title === role.api_title && api.pageimage === role.pageimage, `${role.key} API identity drift`);
  assert(api.wikitext_sha256 === role.raw_wikitext_sha256, `${role.key} raw wikitext receipt drift`);
  assert(JSON.stringify(api.strict_api_terms) === JSON.stringify(role.required_terms) && api.strict_api_terms_missing.length === 0, `${role.key} strict API term drift`);
  const wikitextText = await readFile(join(SOURCE_ROOT, role.wikitext_artifact_path), 'utf8');
  const wikitextReceipt = await receipt(join(SOURCE_ROOT, role.wikitext_artifact_path), { sha256: role.wikitext_file_sha256, bytes: role.wikitext_bytes });
  assert(sha(Buffer.from(normalizeRawWikitext(wikitextText), 'utf8')) === role.raw_wikitext_sha256, `${role.key} raw wikitext body drift`);
  const retainedWikitext = await retain(role.wikitext_artifact_path, role.wikitext_output_path, { sha256: role.wikitext_file_sha256, bytes: role.wikitext_bytes });

  const pageRow = (discoveryManifest.page_screenshots || []).find(row => row.key === role.key);
  assert(pageRow?.sha256 === role.page_sha256 && pageRow?.bytes === role.page_bytes && pageRow?.width === role.page_width && pageRow?.height === role.page_height, `${role.key} page screenshot receipt drift`);
  assert(pageRow.transport_status === role.browser_transport_status, `${role.key} browser transport status drift`);
  const pageReceipt = await retain(role.page_artifact_path, role.page_output_path, {
    sha256: role.page_sha256,
    mime: 'image/png',
    bytes: role.page_bytes,
    width: role.page_width,
    height: role.page_height
  });

  const selectedPath = join(SOURCE_ROOT, role.artifact_path);
  const selectedReceipt = await receipt(selectedPath, {
    sha256: role.sha256,
    mime: role.mime,
    bytes: role.bytes,
    width: role.width,
    height: role.height
  });
  const attempted = (discoveryManifest.attempted || []).find(row => row.role_key === role.key && row.file_title === role.file_title && row.declared_url === role.declared_url);
  assert(attempted, `${role.key} selected file transport receipt missing`);
  if (role.generic_width_floor_exception) {
    assert(selectedReceipt.width < 250 && selectedReceipt.height >= 250, `${role.key} floor exception geometry drift`);
    assert(attempted.download_error === 'no usable image delivery', `${role.key} floor exception transport ruling drift`);
  } else {
    const selectedCandidate = (discoveryManifest.candidates || []).find(row => row.role_key === role.key && row.sha256 === role.sha256);
    assert(selectedCandidate?.repository_matches?.length === 0, `${role.key} selected discovery candidate drift`);
  }
  assert(!(repository.get(role.sha256) || []).length, `${role.key} selected source duplicates canonical media`);
  const retainedSource = await retain(role.artifact_path, role.output_path, {
    sha256: role.sha256,
    mime: role.mime,
    bytes: role.bytes,
    width: role.width,
    height: role.height
  });
  roleRows.push({ role, source: retainedSource, page: pageReceipt, wikitext: retainedWikitext, source_wikitext_receipt: wikitextReceipt });
}
assert(new Set(roleRows.map(row => row.source.sha256)).size === 3, 'UC-116 selected role assets are not byte-distinct');

const exactRoleRecord = {
  version: 1,
  record_id: 'UC-116',
  actor: 'June Foray',
  character: 'Rocky, Natasha & Granny',
  production: 'Rocky & Bullwinkle / Looney Tunes',
  year: 1959,
  actor_role_binding: {
    provider: control.actor_role_custody.provider,
    source_page: control.actor_role_custody.page_url,
    page_title: actorEvidence.title,
    required_terms: actorEvidence.required_terms,
    body_sha256: control.actor_role_custody.body_sha256,
    page_screenshot_sha256: actorPage.sha256,
    binding: control.actor_role_custody.binding
  },
  roles: Object.fromEntries(roleRows.map(({ role, source, page, wikitext }) => [role.key, {
    role: role.role,
    display_label: role.display_label,
    provider: role.provider,
    source_page: role.page_url,
    api_title: role.api_title,
    pageimage: role.pageimage,
    required_terms: role.required_terms,
    raw_wikitext_sha256: role.raw_wikitext_sha256,
    retained_wikitext_sha256: wikitext.sha256,
    page_screenshot_sha256: page.sha256,
    selected_file_title: role.file_title,
    selected_source_url: role.declared_url,
    selected_image_sha256: source.sha256,
    selected_image_width: source.width,
    selected_image_height: source.height,
    generic_width_floor_exception: role.generic_width_floor_exception,
    floor_exception_ruling: role.floor_exception_ruling || null,
    selection_ruling: role.selection_ruling
  }])),
  composite_boundary: {
    all_three_roles_required: true,
    selected_asset_count: 3,
    selected_assets_byte_distinct: true,
    single_role_or_two_role_candidate_forbidden: true,
    bullwinkle_for_rocky_forbidden: true,
    boris_for_natasha_forbidden: true,
    tweety_or_sylvester_for_granny_forbidden: true,
    later_reboot_substitution_forbidden: true
  },
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-role-record.json'), exactRoleRecord);
const roleRecordReceipt = await receipt(join(PACKET, 'exact-role-record.json'));

const panelPaths = [];
for (const { role } of roleRows) {
  const recipe = control.render.role_recipes[role.key];
  const sourcePath = join(PACKET, role.output_path);
  const facePath = join(OUT, `${role.key}-face.png`);
  const bodyForegroundPath = join(OUT, `${role.key}-body-foreground.png`);
  const bodyPath = join(OUT, `${role.key}-body.png`);
  const rulePath = join(OUT, `${role.key}-rule.png`);
  const panelPath = join(OUT, `${role.key}-panel.png`);
  magick(sourcePath, '-crop', recipe.face_crop, '+repage', '-filter', control.render.filter, '-resize', `${control.render.panel_width}x${control.render.face_height}^`, '-gravity', 'center', '-extent', `${control.render.panel_width}x${control.render.face_height}`, facePath);
  magick(sourcePath, '-filter', control.render.filter, '-resize', recipe.body_fit, bodyForegroundPath);
  magick('-size', `${control.render.panel_width}x${control.render.body_height}`, `xc:${recipe.background}`, bodyForegroundPath, '-gravity', 'center', '-composite', bodyPath);
  magick('-size', `${control.render.panel_width}x${control.render.rule_height}`, `xc:${control.render.rule_color}`, rulePath);
  magick(facePath, rulePath, bodyPath, '-append', panelPath);
  const dimensions = identify(panelPath);
  assert(dimensions.width === control.render.panel_width && dimensions.height === control.render.panel_height, `${role.key} panel geometry drift`);
  panelPaths.push(panelPath);
}
const gap1 = join(OUT, 'gap-1.png');
const gap2 = join(OUT, 'gap-2.png');
magick('-size', `${control.render.gap_width}x${control.render.candidate_height}`, `xc:${control.render.rule_color}`, gap1);
magick('-size', `${control.render.gap_width}x${control.render.candidate_height}`, `xc:${control.render.rule_color}`, gap2);
const candidatePath = join(PACKET, 'uc-116-still-candidate.jpg');
magick(panelPaths[0], gap1, panelPaths[1], gap2, panelPaths[2], '+append', '-strip', '-quality', String(control.render.jpeg_quality), candidatePath);
const candidate = { path: 'uc-116-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: control.render.candidate_width, height: control.render.candidate_height })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: control.render.wall_width, height: control.render.wall_height })) };

const duplicateItems = [
  ...roleRows.map(({ role, source }) => ({ label: `${role.display_label} selected source`, path: source.path, sha256: source.sha256, matches: repository.get(source.sha256) || [] })),
  { label: 'UC-116 three-role candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-116 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-116 exact-byte duplicate detected');
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
  'The Television Academy independently identifies June Foray as the voice of Rocky the Flying Squirrel, Natasha Fatale, and Granny.',
  'Rocky uses the second 1959 design recorded in the Rocky raw revision; Natasha uses the exact 1959 pageimage; Granny uses the canonical pageimage from the character record that identifies Foray as the voice from 1955 through 2014.',
  'Natasha and Granny are explicit historical-image floor exceptions: their sources miss the generic 250-pixel width floor by fourteen and forty-six pixels respectively, while preserving clear faces and full figures in the reviewed two-tier panels.',
  'Each 412-pixel panel presents a large face crop above a complete character view. Twelve-pixel dividers keep all three roles visually distinct without substituting Bullwinkle, Boris, Tweety, or Sylvester for the named roles.',
  'The 1246x1000 wall simulation removes seven pixels from each outside edge without changing the three-role count or the face-and-body legibility of Rocky, Natasha, and Granny.',
  'Exact-byte duplicate screening passes against 2,070 canonical repository hashes.'
];
const review = {
  version: 1,
  record_id: 'UC-116',
  actor: 'June Foray',
  character: 'Rocky, Natasha & Granny',
  production: 'Rocky & Bullwinkle / Looney Tunes',
  year: 1959,
  side: 'still',
  expected_subject: 'Rocky, Natasha & Granny',
  source_sha256s: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, source.sha256])),
  exact_role_record_sha256: roleRecordReceipt.sha256,
  candidate_sha256: candidate.sha256,
  crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-subjects',
  presentation_ruling: 'three-role-character-composite',
  crop_ruling: 'pass-three-panel-face-and-body-layout',
  floor_exception_ruling: 'pass-two-explicit-historical-width-exceptions',
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  reviewed_at: control.reviewed_at,
  canonical_mutation: false,
  disposition: 'reviewed-evidence-candidate',
  notes
};
await writeJson(join(PACKET, 'review.json'), review);
const reviewMd = `# UC-116 reviewed June Foray three-role still candidate\n\n- **Record:** UC-116\n- **Performer:** June Foray\n- **Displayed roles:** Rocky the Flying Squirrel, Natasha Fatale, and Granny\n- **Productions:** Rocky & Bullwinkle / Looney Tunes\n- **Rocky source:** \`${review.source_sha256s.rocky}\`\n- **Natasha source:** \`${review.source_sha256s.natasha}\`\n- **Granny source:** \`${review.source_sha256s.granny}\`\n- **Exact role record:** \`${roleRecordReceipt.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** all three expected subjects\n- **Presentation ruling:** three-role character composite\n- **Crop ruling:** pass, three face-and-body panels\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe three selected sources, Academy role spine, raw revisions, page receipts, deterministic triptych, wall simulation, duplicate receipt, and exact-role record remain evidence-only pending independent canonical acceptance.\n`;
await writeFile(join(PACKET, 'review.md'), reviewMd);

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-116',
  actor: 'June Foray',
  character: 'Rocky, Natasha & Granny',
  production: 'Rocky & Bullwinkle / Looney Tunes',
  year: 1959,
  side: 'still',
  expected_subject: 'Rocky, Natasha & Granny',
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    discovery_artifact: control.discovery_artifact,
    failed_discovery_checkpoints: control.failed_discovery_checkpoints,
    render_control_sha256: sha(await readFile(CONTROL)),
    discovery_manifest_sha256: manifestReceipt.sha256,
    discovery_summary_sha256: summaryReceipt.sha256,
    discovery_contact_sheet_sha256: contactReceipt.sha256,
    role_contact_sheet_sha256s: {
      rocky: rockyContactReceipt.sha256,
      natasha: natashaContactReceipt.sha256,
      granny: grannyContactReceipt.sha256
    },
    render_artifact: null,
    apply_control_sha256: null
  },
  actor_role_custody: {
    provider: control.actor_role_custody.provider,
    source_page: control.actor_role_custody.page_url,
    binding: control.actor_role_custody.binding,
    page_screenshot: actorPage
  },
  roles: Object.fromEntries(roleRows.map(({ role, source, page, wikitext }) => [role.key, {
    role: role.role,
    display_label: role.display_label,
    provider: role.provider,
    source_page: role.page_url,
    api_title: role.api_title,
    pageimage: role.pageimage,
    raw_wikitext_sha256: role.raw_wikitext_sha256,
    retained_wikitext: wikitext,
    page_screenshot: page,
    selected_file_title: role.file_title,
    selected_source_url: role.declared_url,
    original: source,
    generic_width_floor_exception: role.generic_width_floor_exception,
    floor_exception_ruling: role.floor_exception_ruling || null,
    selection_ruling: role.selection_ruling
  }])),
  exact_role_record: { path: 'exact-role-record.json', ...roleRecordReceipt },
  candidate: {
    ...candidate,
    recipe: `Three ${control.render.panel_width}x${control.render.panel_height} face-and-body panels, ${control.render.gap_width}px dividers, Lanczos scaling, JPEG quality ${control.render.jpeg_quality}`
  },
  crop_preview: {
    ...cropPreview,
    gravity: control.render.wall_gravity,
    semantics: 'The wall simulation removes seven pixels from each outside edge while preserving all three face crops and all three complete character views.'
  },
  rejected_orbit_summary: [
    'Bullwinkle standing in for Rocky, Boris standing in for Natasha, and Tweety or Sylvester standing in for Granny were rejected.',
    '2014 and 2018 Rocky and Natasha redesigns, live-action Natasha, Space Jam: A New Legacy Granny, game art, toys, cosplay, merchandise, posters, and fan art were rejected.',
    'Three discovery checkpoints failed closed before the successful raw-revision and first-frame-thumbnail orbit.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: repository.size, status: 'pass' },
  exact_subject_review: {
    identity: review.identity_ruling,
    presentation: review.presentation_ruling,
    crop_ruling: review.crop_ruling,
    floor_exception_ruling: review.floor_exception_ruling,
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
  'granny-original.webp',
  'manifest.json',
  'natasha-original.webp',
  'review.json',
  'review.md',
  'rocky-original.webp',
  'source-page-granny.png',
  'source-page-natasha.png',
  'source-page-rocky.png',
  'source-page-television-academy-june-foray.png',
  'source-wikitext-granny.txt',
  'source-wikitext-natasha.txt',
  'source-wikitext-rocky.txt',
  'uc-116-still-candidate.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-116',
  sources: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, source])),
  exact_role_record: { path: 'exact-role-record.json', ...roleRecordReceipt },
  candidate,
  crop_preview: cropPreview,
  actor_role_page: actorPage,
  role_pages: Object.fromEntries(roleRows.map(({ role, page }) => [role.key, page])),
  role_wikitexts: Object.fromEntries(roleRows.map(({ role, wikitext }) => [role.key, wikitext])),
  repository_hash_count: repository.size,
  packet_files: [...packetNames, 'SHA256SUMS'],
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))),
  review_sha256: sha(await readFile(join(PACKET, 'review.json'))),
  sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))),
  canonical_mutation: false
});
console.log(`PASS — UC-116 exact three-role render packet created at ${PACKET}`);
for (const { role, source } of roleRows) console.log(`${role.key} ${source.sha256} ${source.width}x${source.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`role ${roleRecordReceipt.sha256}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
console.log(`sums ${sha(await readFile(join(PACKET, 'SHA256SUMS')))}`);
