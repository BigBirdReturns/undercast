#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-117-RENDER.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-117-render';
const PACKET = join(OUT, 'UC-117');
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
  if (bytes.length >= 6 && ['GIF87a','GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  return 'unknown';
}
function frameInput(path, mime = '') {
  return mime === 'image/gif' ? `${path}[0]` : path;
}
function identify(path, mime = '') {
  const text = execFileSync(process.env.MAGICK_CMD || 'magick', ['identify', '-format', '%w %h', frameInput(path, mime)], { encoding: 'utf8' }).trim();
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
  const row = { bytes: bytes.length, sha256: sha(bytes), mime };
  if (mime !== 'unknown') Object.assign(row, identify(path, mime));
  if (expected.sha256) assert(row.sha256 === expected.sha256, `${path} hash drift ${row.sha256}`);
  if (expected.mime) assert(row.mime === expected.mime, `${path} MIME drift ${row.mime}`);
  if (expected.bytes !== undefined) assert(row.bytes === expected.bytes, `${path} byte drift ${row.bytes}`);
  if (expected.width !== undefined) assert(row.width === expected.width, `${path} width drift ${row.width}`);
  if (expected.height !== undefined) assert(row.height === expected.height, `${path} height drift ${row.height}`);
  return row;
}
async function retain(inputRel, outputName, expected) {
  const output = join(PACKET, outputName);
  await mkdir(dirname(output), { recursive: true });
  await copyFile(join(SOURCE_ROOT, inputRel), output);
  return { path: outputName, ...(await receipt(output, expected)) };
}
function normalizeRetainedWikitext(text) {
  return text.endsWith('\n') ? text.slice(0, -1) : text;
}
function immutableFailureReceipt(row) {
  return {
    run_id: row.run_id,
    artifact_id: row.artifact_id ?? null,
    name: row.name,
    head_sha: row.head_sha,
    artifact_digest_sha256: row.artifact_digest_sha256 ?? null
  };
}

const control = await readJson(CONTROL);
assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-117', 'UC-117 render scope drift');
assert(control.actor === 'Frank Welker' && control.character === 'Megatron & Scooby-Doo' && control.production === 'Transformers / Scooby-Doo' && control.year === 1969 && control.side === 'still', 'UC-117 render identity drift');
assert(control.discovery_artifact?.artifact_id === 8693789087 && control.discovery_artifact?.head_sha === '038935653d882802f14d5d10e497f767c550f719', 'UC-117 discovery custody drift');
assert(control.discovery_artifact?.candidate_count === 42 && control.discovery_artifact?.role_counts?.megatron === 24 && control.discovery_artifact?.role_counts?.scooby === 18, 'UC-117 discovery denominator drift');
assert(control.failed_discovery_checkpoints?.length === 11 && control.roles?.length === 2, 'UC-117 evidence denominator drift');
assert(control.megatron_transport_probe?.probe_artifact?.artifact_id === 8692632509 && control.megatron_transport_probe?.exact_parse?.sha256 === '911d42d129cba989927bef27ac2c434ebaf84113e1ee55e175ab87527eee81cb', 'UC-117 Megatron probe drift');
assert(control.render?.candidate_width === 1260 && control.render?.candidate_height === 1000 && control.render?.panel_width === 624 && control.render?.gap_width === 12 && control.render?.wall_width === 1246, 'UC-117 render geometry drift');
await mkdir(PACKET, { recursive: true });

const manifestReceipt = await receipt(join(SOURCE_ROOT, 'manifest.json'), { sha256: control.discovery_artifact.manifest_sha256 });
const summaryReceipt = await receipt(join(SOURCE_ROOT, 'summary.json'), { sha256: control.discovery_artifact.summary_sha256 });
const contactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-all-roles.jpg'), { sha256: control.discovery_artifact.contact_sheet_sha256 });
const megatronContactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-megatron.jpg'), { sha256: control.discovery_artifact.megatron_contact_sha256 });
const scoobyContactReceipt = await receipt(join(SOURCE_ROOT, 'contact-sheet-scooby.jpg'), { sha256: control.discovery_artifact.scooby_contact_sha256 });
const discoveryManifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
const discoverySummary = await readJson(join(SOURCE_ROOT, 'summary.json'));
assert(discoveryManifest.record_id === 'UC-117' && discoveryManifest.actor === 'Frank Welker' && discoveryManifest.character === 'Megatron & Scooby-Doo' && discoveryManifest.production === 'Transformers / Scooby-Doo', 'UC-117 discovery identity drift');
assert(discoveryManifest.candidate_count === 42 && discoveryManifest.role_counts?.megatron === 24 && discoveryManifest.role_counts?.scooby === 18, 'UC-117 manifest denominator drift');
assert(discoverySummary.candidate_count === 42 && discoverySummary.role_counts?.megatron === 24 && discoverySummary.role_counts?.scooby === 18, 'UC-117 summary denominator drift');
assert(JSON.stringify((discoveryManifest.failed_discovery_checkpoints || []).map(immutableFailureReceipt)) === JSON.stringify(control.failed_discovery_checkpoints.map(immutableFailureReceipt)), 'UC-117 failed discovery custody drift');
assert(discoveryManifest.megatron_transport_probe?.probe_artifact?.artifact_id === control.megatron_transport_probe.probe_artifact.artifact_id && discoveryManifest.megatron_transport_probe?.exact_parse?.sha256 === control.megatron_transport_probe.exact_parse.sha256, 'UC-117 discovery probe custody drift');

const repository = await repositoryHashes();
const repositoryCount = process.env.REPOSITORY_HASH_COUNT_OVERRIDE ? Number(process.env.REPOSITORY_HASH_COUNT_OVERRIDE) : repository.size;
assert(repositoryCount === control.expected_repository_hash_count, `repository hash denominator drift ${repositoryCount}`);

const actorRolePages = {};
for (const [key, spec] of Object.entries(control.actor_role_custody)) {
  if (spec.reference_only) {
    const evidence = discoveryManifest.page_evidence?.['hasbro-original-megatron'];
    assert(evidence?.status === 'reference-only-external-verification' && evidence.externally_verified === true && evidence.runtime_transport_blocked === true, 'Hasbro reference-only custody drift');
    actorRolePages[key] = {
      provider: spec.provider,
      source_page: spec.page_url,
      required_terms: spec.required_terms,
      binding: spec.binding,
      reference_only: true,
      externally_verified: true,
      runtime_transport_blocked: true
    };
    continue;
  }
  const evidenceKey = key === 'frank_welker_official' ? 'frank-welker-official' : 'cw-frank-welker-scooby';
  const evidence = discoveryManifest.page_evidence?.[evidenceKey];
  assert(evidence?.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${key} actor-role transport drift`);
  assert(evidence.title === spec.page_title && JSON.stringify(evidence.required_terms) === JSON.stringify(spec.required_terms) && evidence.required_terms_missing.length === 0, `${key} actor-role denominator drift`);
  assert(sha(Buffer.from(evidence.body_text || '', 'utf8')) === spec.body_sha256, `${key} body receipt drift`);
  const retained = await retain(spec.artifact_path, spec.output_path, { sha256: spec.sha256, mime: 'image/png', bytes: spec.bytes, width: spec.width, height: spec.height });
  actorRolePages[key] = {
    provider: spec.provider,
    source_page: spec.page_url,
    page_title: spec.page_title,
    required_terms: spec.required_terms,
    body_sha256: spec.body_sha256,
    binding: spec.binding,
    page_screenshot: retained
  };
}

const roleRows = [];
for (const role of control.roles) {
  const api = discoveryManifest.api_evidence?.[role.key];
  assert(api, `missing API evidence for ${role.key}`);
  assert(api.api_title === role.api_title && api.page_id === role.page_id && api.raw_wikitext_sha256 === role.raw_wikitext_sha256, `${role.key} API identity drift`);
  assert(JSON.stringify(api.required_wikitext_terms) === JSON.stringify(role.required_wikitext_terms) && api.required_wikitext_terms_missing.length === 0, `${role.key} wikitext term drift`);
  if (role.key === 'megatron') {
    assert(api.source_mode === 'hash-pinned-probe-parse-live-imageinfo' && api.probe_artifact?.artifact_id === 8692632509 && api.probe_parse_sha256 === control.megatron_transport_probe.exact_parse.sha256 && api.image_title_count === 77 && api.raw_image_info_count === 77 && api.filtered_candidate_count === 24, 'Megatron probe-seed API drift');
  } else {
    assert(api.source_mode === 'live-action-api' && api.image_title_count === 17 && api.raw_image_info_count === 18 && api.filtered_candidate_count === 18, 'Scooby live API drift');
  }
  const retainedWikitext = await retain(role.wikitext_artifact_path, role.wikitext_output_path, { sha256: role.wikitext_sha256, bytes: role.wikitext_bytes });
  const retainedWikitextText = await readFile(join(PACKET, role.wikitext_output_path), 'utf8');
  assert(sha(Buffer.from(normalizeRetainedWikitext(retainedWikitextText), 'utf8')) === role.raw_wikitext_sha256, `${role.key} raw wikitext body drift`);
  const pageRow = (discoveryManifest.page_screenshots || []).find(row => row.key === role.key);
  assert(pageRow?.sha256 === role.page_sha256 && pageRow?.bytes === role.page_bytes && pageRow?.width === role.page_width && pageRow?.height === role.page_height, `${role.key} source-page receipt drift`);
  const retainedPage = await retain(role.page_artifact_path, role.page_output_path, { sha256: role.page_sha256, mime: 'image/png', bytes: role.page_bytes, width: role.page_width, height: role.page_height });
  const selected = (discoveryManifest.candidates || []).find(row => row.role_key === role.key && row.file_title === role.file_title && row.sha256 === role.sha256);
  assert(selected, `${role.key} selected candidate missing`);
  assert(selected.local === role.artifact_path && selected.declared_url === role.declared_url && selected.probe_url === role.probe_url && selected.probe_kind === role.probe_kind && selected.resolved_url === role.resolved_url, `${role.key} selected transport drift`);
  assert(selected.mime === role.mime && selected.bytes === role.bytes && selected.width === role.width && selected.height === role.height && selected.score === role.score, `${role.key} selected geometry or score drift`);
  assert(selected.original_welker_signal === role.original_welker_signal && selected.welker_tenure_signal === role.welker_tenure_signal && selected.repository_matches.length === 0, `${role.key} selected role or duplicate signal drift`);
  assert(!(repository.get(role.sha256) || []).length, `${role.key} source duplicates canonical media`);
  const retainedSource = await retain(role.artifact_path, role.source_output_path, { sha256: role.sha256, mime: role.mime, bytes: role.bytes, width: role.width, height: role.height });
  roleRows.push({ role, api, source: retainedSource, page: retainedPage, wikitext: retainedWikitext });
}
assert(new Set(roleRows.map(row => row.source.sha256)).size === 2, 'UC-117 selected sources are not byte-distinct');

const exactRoleRecord = {
  version: 1,
  record_id: 'UC-117',
  actor: 'Frank Welker',
  character: 'Megatron & Scooby-Doo',
  production: 'Transformers / Scooby-Doo',
  year: 1969,
  canonical_year_boundary: control.identity_boundary.canonical_year_semantics,
  actor_role_bindings: actorRolePages,
  megatron_transport_probe: {
    artifact: control.megatron_transport_probe.probe_artifact,
    exact_query: control.megatron_transport_probe.exact_query,
    exact_parse: control.megatron_transport_probe.exact_parse,
    page_html: control.megatron_transport_probe.page_html,
    browser_page: control.megatron_transport_probe.browser_page,
    ruling: control.megatron_transport_probe.ruling
  },
  roles: Object.fromEntries(roleRows.map(({ role, api, source, page, wikitext }) => [role.key, {
    role: role.role,
    display_label: role.display_label,
    provider: role.provider,
    source_page: role.page_url,
    source_mode: api.source_mode,
    api_title: role.api_title,
    page_id: role.page_id,
    required_wikitext_terms: role.required_wikitext_terms,
    raw_wikitext_sha256: role.raw_wikitext_sha256,
    retained_wikitext: wikitext,
    browser_page_screenshot: page,
    browser_transport_status: role.browser_transport_status,
    selected_file_title: role.file_title,
    selected_source_url: role.declared_url,
    selected_probe_url: role.probe_url,
    selected_image: source,
    original_welker_signal: role.original_welker_signal,
    welker_tenure_signal: role.welker_tenure_signal,
    selection_ruling: role.selection_ruling
  }])),
  composite_boundary: {
    both_roles_required: true,
    selected_asset_count: 2,
    selected_assets_byte_distinct: true,
    single_role_candidate_forbidden: true,
    later_megatron_performer_or_redesign_forbidden: true,
    scrappy_or_other_dog_for_scooby_forbidden: true,
    live_action_performer_substitution_forbidden: true,
    scooby_1969_franchise_origin_not_voice_start: true
  },
  canonical_mutation: false
};
await writeJson(join(PACKET, 'exact-role-record.json'), exactRoleRecord);
const roleRecordReceipt = await receipt(join(PACKET, 'exact-role-record.json'));

const panelPaths = [];
for (const { role } of roleRows) {
  const recipe = control.render.role_recipes[role.key];
  const sourcePath = join(PACKET, role.source_output_path);
  const facePath = join(OUT, `${role.key}-face.png`);
  const bodyPath = join(OUT, `${role.key}-body.png`);
  const rulePath = join(OUT, `${role.key}-rule.png`);
  const panelPath = join(OUT, `${role.key}-panel.png`);
  magick(frameInput(sourcePath, role.mime), '-crop', recipe.face_crop, '+repage', '-filter', control.render.filter, '-resize', `${control.render.panel_width}x${control.render.face_height}^`, '-gravity', 'center', '-extent', `${control.render.panel_width}x${control.render.face_height}`, facePath);
  magick(frameInput(sourcePath, role.mime), '-filter', control.render.filter, '-resize', recipe.body_resize, '-gravity', recipe.body_gravity, '-extent', `${control.render.panel_width}x${control.render.body_height}`, bodyPath);
  magick('-size', `${control.render.panel_width}x${control.render.rule_height}`, `xc:${control.render.rule_color}`, rulePath);
  magick(facePath, rulePath, bodyPath, '-append', panelPath);
  const dimensions = identify(panelPath, 'image/png');
  assert(dimensions.width === control.render.panel_width && dimensions.height === control.render.panel_height, `${role.key} panel geometry drift`);
  panelPaths.push(panelPath);
}
const gapPath = join(OUT, 'gap.png');
magick('-size', `${control.render.gap_width}x${control.render.candidate_height}`, `xc:${control.render.rule_color}`, gapPath);
const candidatePath = join(PACKET, 'uc-117-still-candidate.jpg');
magick(panelPaths[0], gapPath, panelPaths[1], '+append', '-strip', '-quality', String(control.render.jpeg_quality), candidatePath);
const candidate = { path: 'uc-117-still-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: control.render.candidate_width, height: control.render.candidate_height })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: control.render.wall_width, height: control.render.wall_height })) };

const duplicateItems = [
  ...roleRows.map(({ role, source }) => ({ label: `${role.display_label} selected source`, path: source.path, sha256: source.sha256, matches: repository.get(source.sha256) || [] })),
  { label: 'UC-117 two-role candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-117 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-117 exact-byte duplicate detected');
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
  "Frank Welker's official biography identifies him as the voice of both Scooby-Doo and Megatron; Hasbro independently identifies him as the original voice of Megatron, and the CW and Warner Bros. Animation independently credit him as Scooby-Doo in 2021.",
  'The Megatron source is a G1 cartoon throne frame declared on the exact Megatron Generation 1 cartoon-continuity page. It preserves the face, fusion cannon, Decepticon insignia, torso, arms, and legs while excluding later performers, continuities, films, comics, toys, games, and redesigns.',
  "The Scooby source is the 2021 character pageimage. Its raw revision identifies Frank Welker taking over Scooby beginning with What's New, Scooby-Doo? in 2002, so the canonical 1969 field remains franchise-origin metadata rather than a claim that Welker voiced the debut series.",
  'Each 624-pixel panel presents a large face crop above a complete body or production-context view. The twelve-pixel divider keeps both roles distinct and simultaneously legible.',
  'The 1246x1000 wall simulation removes seven pixels from each outside edge without changing either face, body, or role-identity ruling.',
  `Exact-byte duplicate screening passes against ${repositoryCount.toLocaleString('en-US')} canonical repository hashes.`
];
const review = {
  version: 1,
  record_id: 'UC-117',
  actor: 'Frank Welker',
  character: 'Megatron & Scooby-Doo',
  production: 'Transformers / Scooby-Doo',
  year: 1969,
  side: 'still',
  expected_subject: 'Megatron & Scooby-Doo',
  source_sha256s: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, source.sha256])),
  exact_role_record_sha256: roleRecordReceipt.sha256,
  candidate_sha256: candidate.sha256,
  crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-subjects',
  presentation_ruling: 'two-role-character-composite',
  crop_ruling: 'pass-two-panel-face-and-context-layout',
  chronology_ruling: 'pass-1969-franchise-origin-separated-from-2002-plus-welker-scooby-tenure',
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  reviewed_at: control.reviewed_at,
  canonical_mutation: false,
  disposition: 'reviewed-evidence-candidate',
  notes
};
await writeJson(join(PACKET, 'review.json'), review);
const reviewMd = `# UC-117 reviewed Frank Welker two-role still candidate\n\n- **Record:** UC-117\n- **Performer:** Frank Welker\n- **Displayed roles:** Megatron and Scooby-Doo\n- **Productions:** The Transformers / Scooby-Doo\n- **Megatron source:** \`${review.source_sha256s.megatron}\`\n- **Scooby-Doo source:** \`${review.source_sha256s.scooby}\`\n- **Exact role record:** \`${roleRecordReceipt.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** both expected subjects\n- **Presentation ruling:** two-role character composite\n- **Crop ruling:** pass, two face-and-context panels\n- **Chronology ruling:** 1969 franchise origin is separate from Welker's 2002-or-later Scooby tenure\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe selected sources, exact raw revisions, actor-role pages, transport-probe receipts, deterministic diptych, wall simulation, duplicate receipt, and exact-role record remain evidence-only pending independent canonical acceptance.\n`;
await writeFile(join(PACKET, 'review.md'), reviewMd);

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-117',
  actor: 'Frank Welker',
  character: 'Megatron & Scooby-Doo',
  production: 'Transformers / Scooby-Doo',
  year: 1969,
  side: 'still',
  expected_subject: 'Megatron & Scooby-Doo',
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    selector_artifact: control.selector_artifact,
    scope_artifact: control.scope_artifact,
    discovery_artifact: control.discovery_artifact,
    failed_discovery_checkpoints: discoveryManifest.failed_discovery_checkpoints,
    discovery_repair_boundary: discoveryManifest.discovery_repair_boundary,
    megatron_transport_probe: control.megatron_transport_probe,
    render_control_sha256: sha(await readFile(CONTROL)),
    discovery_manifest_sha256: manifestReceipt.sha256,
    discovery_summary_sha256: summaryReceipt.sha256,
    discovery_contact_sheet_sha256: contactReceipt.sha256,
    role_contact_sheet_sha256s: { megatron: megatronContactReceipt.sha256, scooby: scoobyContactReceipt.sha256 },
    render_artifact: null,
    apply_control_sha256: null
  },
  actor_role_custody: actorRolePages,
  identity_boundary: control.identity_boundary,
  roles: Object.fromEntries(roleRows.map(({ role, api, source, page, wikitext }) => [role.key, {
    role: role.role,
    display_label: role.display_label,
    provider: role.provider,
    source_page: role.page_url,
    source_mode: api.source_mode,
    api_title: role.api_title,
    page_id: role.page_id,
    raw_wikitext_sha256: role.raw_wikitext_sha256,
    retained_wikitext: wikitext,
    browser_page_screenshot: page,
    browser_transport_status: role.browser_transport_status,
    selected_file_title: role.file_title,
    selected_source_url: role.declared_url,
    selected_probe_url: role.probe_url,
    original: source,
    original_welker_signal: role.original_welker_signal,
    welker_tenure_signal: role.welker_tenure_signal,
    selection_ruling: role.selection_ruling
  }])),
  exact_role_record: { path: 'exact-role-record.json', ...roleRecordReceipt },
  candidate: {
    ...candidate,
    recipe: `Two ${control.render.panel_width}x${control.render.panel_height} face-and-context panels, ${control.render.gap_width}px divider, Lanczos scaling, JPEG quality ${control.render.jpeg_quality}`
  },
  crop_preview: {
    ...cropPreview,
    gravity: control.render.wall_gravity,
    semantics: 'The wall simulation removes seven pixels from each outside edge while preserving both face crops and both body or production-context views.'
  },
  rejected_orbit_summary: [
    'The official CW Scooby title card remains in the discovery orbit but was rejected because title graphics dominate the frame.',
    'Later Megatron performers and redesigns, live-action Transformers, comics, toys, games, posters, Scrappy-Doo, other Hanna-Barbera dogs, live-action performers, cosplay, merchandise, and fan art were rejected.',
    'Eleven discovery checkpoints failed closed before the successful exact-title probe, revision normalization, imageinfo collection, and two-role orbit.'
  ],
  rejected_sources: control.rejected_sources,
  duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: repositoryCount, status: 'pass' },
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
  'manifest.json',
  'megatron-original.jpg',
  'review.json',
  'review.md',
  'scooby-original.webp',
  'source-page-cw-frank-welker-scooby.png',
  'source-page-frank-welker-official.png',
  'source-page-megatron.png',
  'source-page-scooby.png',
  'source-wikitext-megatron.txt',
  'source-wikitext-scooby.txt',
  'uc-117-still-candidate.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-117',
  sources: Object.fromEntries(roleRows.map(({ role, source }) => [role.key, source])),
  exact_role_record: { path: 'exact-role-record.json', ...roleRecordReceipt },
  candidate,
  crop_preview: cropPreview,
  actor_role_pages: actorRolePages,
  role_pages: Object.fromEntries(roleRows.map(({ role, page }) => [role.key, page])),
  role_wikitexts: Object.fromEntries(roleRows.map(({ role, wikitext }) => [role.key, wikitext])),
  repository_hash_count: repositoryCount,
  packet_files: [...packetNames, 'SHA256SUMS'],
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))),
  review_sha256: sha(await readFile(join(PACKET, 'review.json'))),
  sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))),
  canonical_mutation: false
});
console.log(`PASS — UC-117 exact two-role render packet created at ${PACKET}`);
for (const { role, source } of roleRows) console.log(`${role.key} ${source.sha256} ${source.width}x${source.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`role ${roleRecordReceipt.sha256}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
console.log(`sums ${sha(await readFile(join(PACKET, 'SHA256SUMS')))}`);
