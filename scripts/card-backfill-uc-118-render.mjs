#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-118-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-118-render';
const PACKET = join(OUT, 'UC-118');
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
function evidenceByKey(manifest, key) {
  const row = manifest.page_evidence?.[key];
  assert(row, `missing page evidence ${key}`);
  return row;
}

const control = await readJson(CONTROL);
assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-118', 'UC-118 render scope drift');
assert(control.actor === 'Frank Oz' && control.character === 'Yoda, Miss Piggy & Fozzie' && control.production === 'The Muppets / Star Wars' && control.year === 1976 && control.side === 'still', 'UC-118 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8699303205 && control.discovery_artifact?.head_sha === '2a1edb5871757ae5d0d990b4bc1d397943074673', 'UC-118 discovery custody drift');
assert(control.roles?.length === 3 && control.actor_role_custody?.length === 2, 'UC-118 render denominator drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.top_height === 490 && control.render?.bottom_width === 624 && control.render?.horizontal_gap === 12 && control.render?.vertical_gap === 12, 'UC-118 render geometry drift');
await mkdir(PACKET, { recursive: true });

const discoveryManifestPath = join(SOURCE_ROOT, 'manifest.json');
const discoverySummaryPath = join(SOURCE_ROOT, 'summary.json');
const manifestReceipt = await receipt(discoveryManifestPath, { sha256: control.discovery_artifact.manifest_sha256 });
const summaryReceipt = await receipt(discoverySummaryPath, { sha256: control.discovery_artifact.summary_sha256 });
const contactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-all-roles.jpg'), { sha256: control.discovery_artifact.contact_sheet_sha256 });
const yodaContactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-yoda.jpg'), { sha256: control.discovery_artifact.yoda_contact_sha256 });
const piggyContactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-miss-piggy.jpg'), { sha256: control.discovery_artifact.miss_piggy_contact_sha256 });
const fozzieContactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-fozzie.jpg'), { sha256: control.discovery_artifact.fozzie_contact_sha256 });
const discoveryManifest = await readJson(discoveryManifestPath);
const discoverySummary = await readJson(discoverySummaryPath);
assert(discoveryManifest.record_id === 'UC-118' && discoveryManifest.actor === 'Frank Oz' && discoveryManifest.character === 'Yoda, Miss Piggy & Fozzie' && discoveryManifest.production === 'The Muppets / Star Wars', 'UC-118 discovery manifest identity drift');
assert(discoveryManifest.candidate_count === control.discovery_artifact.candidate_count && JSON.stringify(discoveryManifest.role_counts) === JSON.stringify(control.discovery_artifact.role_counts), 'UC-118 discovery candidate denominator drift');
assert(discoverySummary.candidate_count === control.discovery_artifact.candidate_count && JSON.stringify(discoverySummary.role_counts) === JSON.stringify(control.discovery_artifact.role_counts), 'UC-118 discovery summary denominator drift');
assert(discoveryManifest.chronology_boundary?.canonical_year === 1976 && discoveryManifest.chronology_boundary?.yoda_requires_independent_empire_strikes_back_custody === true, 'UC-118 discovery chronology boundary drift');

const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);
const actorRoleRows = [];
for (const row of control.actor_role_custody) {
  const evidence = evidenceByKey(discoveryManifest, row.key);
  assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${row.key} actor-role transport drift`);
  assert(evidence.title === row.page_title, `${row.key} actor-role title drift`);
  assert(JSON.stringify(evidence.required_terms) === JSON.stringify(row.required_terms) && evidence.required_terms_missing.length === 0, `${row.key} actor-role term drift`);
  assert(sha(Buffer.from(evidence.body_text || '', 'utf8')) === row.body_sha256, `${row.key} actor-role body receipt drift`);
  assert(evidence.screenshot?.sha256 === row.sha256 && evidence.screenshot?.bytes === row.bytes && evidence.screenshot?.width === row.width && evidence.screenshot?.height === row.height, `${row.key} actor-role screenshot receipt drift`);
  const screenshot = await retain(row.artifact_path, row.output_path, { sha256: row.sha256, mime: 'image/png', bytes: row.bytes, width: row.width, height: row.height });
  actorRoleRows.push({ control: row, evidence, screenshot });
}

const roleRows = [];
for (const role of control.roles) {
  const evidence = evidenceByKey(discoveryManifest, role.source_page_key);
  assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${role.key} source-page transport drift`);
  assert(evidence.title === role.page_title, `${role.key} source-page title drift`);
  assert(JSON.stringify(evidence.required_terms) === JSON.stringify(role.required_terms) && evidence.required_terms_missing.length === 0, `${role.key} source-page term drift`);
  assert(sha(Buffer.from(evidence.body_text || '', 'utf8')) === role.page_body_sha256, `${role.key} source-page body receipt drift`);
  assert(evidence.screenshot?.sha256 === role.page_sha256 && evidence.screenshot?.bytes === role.page_bytes && evidence.screenshot?.width === role.page_width && evidence.screenshot?.height === role.page_height, `${role.key} source-page screenshot drift`);
  const page = await retain(role.page_artifact_path, role.page_output_path, { sha256: role.page_sha256, mime: 'image/png', bytes: role.page_bytes, width: role.page_width, height: role.page_height });

  const selected = (discoveryManifest.candidates || []).find(row => row.role_key === role.key && row.sha256 === role.sha256);
  assert(selected, `${role.key} selected discovery candidate missing`);
  assert(selected.local === role.artifact_path && selected.source_page_key === role.source_page_key && selected.source_page === role.page_url && selected.declared_url === role.declared_url, `${role.key} selected source custody drift`);
  assert(selected.label === role.label && selected.mime === role.mime && selected.bytes === role.bytes && selected.width === role.width && selected.height === role.height, `${role.key} selected source metadata drift`);
  assert(Array.isArray(selected.repository_matches) && selected.repository_matches.length === 0, `${role.key} selected discovery duplicate drift`);
  assert(!(repository.get(role.sha256) || []).length, `${role.key} selected source duplicates canonical media`);
  const source = await retain(role.artifact_path, role.output_path, { sha256: role.sha256, mime: role.mime, bytes: role.bytes, width: role.width, height: role.height });
  roleRows.push({ role, evidence, page, source, selected });
}
assert(new Set(roleRows.map(row => row.source.sha256)).size === 3, 'UC-118 selected role assets are not byte-distinct');

const exactRoleRecord = {
  version: 1,
  record_id: 'UC-118',
  actor: 'Frank Oz',
  character: 'Yoda, Miss Piggy & Fozzie',
  production: 'The Muppets / Star Wars',
  canonical_year: 1976,
  canonical_year_semantics: 'Muppet-era chronology only; it is not Yoda debut or Frank Oz Yoda performance chronology.',
  actor_role_bindings: Object.fromEntries(actorRoleRows.map(({ control: row, evidence, screenshot }) => [row.key, {
    provider: row.provider,
    source_page: row.page_url,
    page_title: evidence.title,
    required_terms: row.required_terms,
    body_sha256: row.body_sha256,
    page_screenshot_sha256: screenshot.sha256,
    binding: row.binding
  }])),
  roles: Object.fromEntries(roleRows.map(({ role, page, source }) => [role.key, {
    role: role.role,
    display_label: role.display_label,
    provider: role.provider,
    source_page: role.page_url,
    source_page_key: role.source_page_key,
    source_page_title: role.page_title,
    page_screenshot_sha256: page.sha256,
    selected_file_label: role.label,
    selected_source_url: role.declared_url,
    selected_image_sha256: source.sha256,
    selected_image_width: source.width,
    selected_image_height: source.height,
    selection_ruling: role.selection_ruling
  }])),
  composite_boundary: {
    all_three_roles_required: true,
    selected_asset_count: 3,
    selected_assets_byte_distinct: true,
    yoda_empire_strikes_back_custody_required: true,
    miss_piggy_and_fozzie_henson_archive_custody_required: true,
    canonical_1976_is_muppet_chronology_not_yoda_debut: true,
    single_role_or_two_role_candidate_forbidden: true,
    grogu_or_other_star_wars_creature_for_yoda_forbidden: true,
    other_muppet_substitution_forbidden: true
  },
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-role-record.json'), exactRoleRecord);
const roleRecordReceipt = await receipt(join(PACKET, 'exact-role-record.json'));

const yodaSource = join(PACKET, 'yoda-original.jpg');
const piggySource = join(PACKET, 'miss-piggy-original.jpg');
const fozzieSource = join(PACKET, 'fozzie-original.jpg');
const yodaRow = join(OUT, 'yoda-top.jpg');
const piggyRow = join(OUT, 'miss-piggy-bottom.jpg');
const fozzieRow = join(OUT, 'fozzie-bottom.jpg');
magick(yodaSource, '-filter', control.render.filter, '-resize', `${control.render.yoda_resize_width}x${control.render.yoda_resize_height}!`, '-crop', `${control.render.top_width}x${control.render.top_height}+${control.render.yoda_crop_x}+${control.render.yoda_crop_y}`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), yodaRow);
magick(piggySource, '-filter', control.render.filter, '-resize', `${control.render.miss_piggy_resize_width}x${control.render.miss_piggy_resize_height}!`, '-crop', `${control.render.bottom_width}x${control.render.bottom_height}+${control.render.miss_piggy_crop_x}+${control.render.miss_piggy_crop_y}`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), piggyRow);
magick(fozzieSource, '-filter', control.render.filter, '-resize', `${control.render.fozzie_resize_width}x${control.render.fozzie_resize_height}!`, '-crop', `${control.render.bottom_width}x${control.render.bottom_height}+${control.render.fozzie_crop_x}+${control.render.fozzie_crop_y}`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), fozzieRow);
assert(JSON.stringify(identify(yodaRow)) === JSON.stringify({ width: control.render.top_width, height: control.render.top_height }), 'UC-118 Yoda row geometry drift');
assert(JSON.stringify(identify(piggyRow)) === JSON.stringify({ width: control.render.bottom_width, height: control.render.bottom_height }), 'UC-118 Miss Piggy row geometry drift');
assert(JSON.stringify(identify(fozzieRow)) === JSON.stringify({ width: control.render.bottom_width, height: control.render.bottom_height }), 'UC-118 Fozzie row geometry drift');

const candidatePath = join(PACKET, 'uc-118-still-candidate.jpg');
magick('-size', `${control.render.candidate_width}x${control.render.candidate_height}`, `xc:${control.render.rule_color}`, yodaRow, '-geometry', '+0+0', '-composite', piggyRow, '-geometry', `+0+${control.render.top_height + control.render.vertical_gap}`, '-composite', fozzieRow, '-geometry', `+${control.render.bottom_width + control.render.horizontal_gap}+${control.render.top_height + control.render.vertical_gap}`, '-composite', '-strip', '-quality', String(control.render.jpeg_quality), candidatePath);
const candidate = { path: 'uc-118-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: control.render.candidate_width, height: control.render.candidate_height })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: control.render.wall_width, height: control.render.wall_height })) };

const duplicateItems = [
  ...roleRows.map(({ role, source }) => ({ label: `${role.display_label} selected source`, path: source.path, sha256: source.sha256, matches: repository.get(source.sha256) || [] })),
  { label: 'UC-118 three-role candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-118 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-118 exact-byte duplicate detected');
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
  'Lucasfilm independently identifies Frank Oz as Yoda’s voice performer and operator of the original Empire Strikes Back and Return of the Jedi puppet; the Jim Henson Company independently identifies Miss Piggy and Fozzie Bear as Frank Oz performances.',
  'Yoda uses the official Size Matters Not Episode V clip thumbnail; Miss Piggy uses the caption-local 1981 Great Muppet Caper pool publicity still; Fozzie uses the caption-local 1980 behind-the-camera archive image.',
  'The canonical 1976 field remains Muppet-era chronology and is not used as evidence of Yoda’s debut or the beginning of Frank Oz’s Yoda performance.',
  'The 1260x1000 layout gives the landscape Yoda source the complete upper field and gives Miss Piggy and Fozzie separate 624x498 lower panels. The twelve-pixel rules preserve three-role separation without clipping Yoda into a portrait slot.',
  'The 1246x1000 wall simulation removes seven pixels from each outside edge without changing Yoda’s face and gesture, Miss Piggy’s face and seated silhouette, or Fozzie’s face, hat, scarf, hands, and camera context.',
  'Exact-byte duplicate screening passes against 2,070 canonical repository hashes.'
];
const review = {
  version: 1,
  record_id: 'UC-118',
  actor: 'Frank Oz',
  character: 'Yoda, Miss Piggy & Fozzie',
  production: 'The Muppets / Star Wars',
  year: 1976,
  side: 'still',
  expected_subject: 'Yoda, Miss Piggy & Fozzie',
  source_sha256s: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, source.sha256])),
  exact_role_record_sha256: roleRecordReceipt.sha256,
  candidate_sha256: candidate.sha256,
  crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-subjects',
  presentation_ruling: 'three-role-character-composite',
  crop_ruling: 'pass-landscape-top-two-panel-bottom-layout',
  chronology_ruling: 'pass-1976-muppet-chronology-separated-from-yoda-performance',
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  reviewed_at: control.reviewed_at,
  canonical_mutation: false,
  disposition: 'reviewed-evidence-candidate',
  notes
};
await writeJson(join(PACKET, 'review.json'), review);
const reviewMd = `# UC-118 reviewed Frank Oz three-role still candidate\n\n- **Record:** UC-118\n- **Performer:** Frank Oz\n- **Displayed roles:** Yoda, Miss Piggy, and Fozzie Bear\n- **Productions:** The Muppets / Star Wars\n- **Yoda source:** \`${review.source_sha256s.yoda}\`\n- **Miss Piggy source:** \`${review.source_sha256s['miss-piggy']}\`\n- **Fozzie source:** \`${review.source_sha256s.fozzie}\`\n- **Exact role record:** \`${roleRecordReceipt.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** all three expected subjects\n- **Presentation ruling:** three-role character composite\n- **Crop ruling:** pass, landscape top with two lower role panels\n- **Chronology ruling:** 1976 Muppet chronology separated from Yoda performance chronology\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe three selected sources, Lucasfilm and Henson role spines, source-page receipts, deterministic composite, wall simulation, duplicate receipt, and exact-role record remain evidence-only pending independent canonical acceptance.\n`;
await writeFile(join(PACKET, 'review.md'), reviewMd);

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-118',
  actor: 'Frank Oz',
  character: 'Yoda, Miss Piggy & Fozzie',
  production: 'The Muppets / Star Wars',
  year: 1976,
  side: 'still',
  expected_subject: 'Yoda, Miss Piggy & Fozzie',
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    discovery_artifact: control.discovery_artifact,
    render_control_sha256: sha(await readFile(CONTROL)),
    discovery_manifest_sha256: manifestReceipt.sha256,
    discovery_summary_sha256: summaryReceipt.sha256,
    discovery_contact_sheet_sha256: contactReceipt.sha256,
    role_contact_sheet_sha256s: {
      yoda: yodaContactReceipt.sha256,
      'miss-piggy': piggyContactReceipt.sha256,
      fozzie: fozzieContactReceipt.sha256
    },
    render_artifact: null,
    apply_control_sha256: null
  },
  actor_role_custody: Object.fromEntries(actorRoleRows.map(({ control: row, screenshot }) => [row.key, {
    provider: row.provider,
    source_page: row.page_url,
    binding: row.binding,
    body_sha256: row.body_sha256,
    page_screenshot: screenshot
  }])),
  chronology_boundary: exactRoleRecord.composite_boundary,
  roles: Object.fromEntries(roleRows.map(({ role, source, page }) => [role.key, {
    role: role.role,
    display_label: role.display_label,
    provider: role.provider,
    source_page: role.page_url,
    source_page_key: role.source_page_key,
    source_page_title: role.page_title,
    source_page_body_sha256: role.page_body_sha256,
    page_screenshot: page,
    selected_file_label: role.label,
    selected_source_url: role.declared_url,
    original: source,
    selection_ruling: role.selection_ruling
  }])),
  exact_role_record: { path: 'exact-role-record.json', ...roleRecordReceipt },
  candidate: {
    ...candidate,
    recipe: `One ${control.render.top_width}x${control.render.top_height} Yoda field above two ${control.render.bottom_width}x${control.render.bottom_height} Muppet fields, ${control.render.horizontal_gap}px rules, ${control.render.filter} scaling, JPEG quality ${control.render.jpeg_quality}`
  },
  crop_preview: {
    ...cropPreview,
    gravity: control.render.wall_gravity,
    semantics: 'The wall simulation removes seven pixels from each outside edge while preserving all three named roles and the chronology boundary.'
  },
  rejected_orbit_summary: [
    'StarWars.com recommendation thumbnails for Grogu, Mandalorian, Maul, and Visions were rejected; the selected Yoda object is the official Episode V Size Matters Not clip image.',
    'Henson production memos, costume drawings, archive headers, Miss Piggy ballroom images on the Fozzie page, and lower-resolution duplicate deliveries were rejected.',
    'Rowlf remains contextual in the selected Fozzie source and does not substitute for Fozzie; the final crop favors Fozzie and the camera context.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: repository.size, status: 'pass' },
  exact_subject_review: {
    identity: review.identity_ruling,
    presentation: review.presentation_ruling,
    crop_ruling: review.crop_ruling,
    chronology_ruling: review.chronology_ruling,
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
  'fozzie-original.jpg',
  'manifest.json',
  'miss-piggy-original.jpg',
  'review.json',
  'review.md',
  'source-page-henson-founders-frank-oz-muppets.png',
  'source-page-henson-fozzie-behind-camera.png',
  'source-page-henson-miss-piggy-pool.png',
  'source-page-starwars-frank-oz-yoda.png',
  'source-page-starwars-size-matters-not.png',
  'uc-118-still-candidate.jpg',
  'yoda-original.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-118',
  sources: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, source])),
  exact_role_record: { path: 'exact-role-record.json', ...roleRecordReceipt },
  candidate,
  crop_preview: cropPreview,
  actor_role_pages: Object.fromEntries(actorRoleRows.map(({ control: row, screenshot }) => [row.key, screenshot])),
  role_pages: Object.fromEntries(roleRows.map(({ role, page }) => [role.key, page])),
  repository_hash_count: repository.size,
  packet_files: [...packetNames, 'SHA256SUMS'],
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))),
  review_sha256: sha(await readFile(join(PACKET, 'review.json'))),
  sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))),
  canonical_mutation: false
});
console.log(`PASS — UC-118 exact three-role render packet created at ${PACKET}`);
for (const { role, source } of roleRows) console.log(`${role.key} ${source.sha256} ${source.width}x${source.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`role ${roleRecordReceipt.sha256}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
console.log(`sums ${sha(await readFile(join(PACKET, 'SHA256SUMS')))}`);
