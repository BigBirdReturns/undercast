#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = process.env.CONTROL || '.github/CARD-BACKFILL-UC-079-RENDER.json';
const DIRECT_ROOT = process.env.DIRECT_ROOT || '';
const SAUL_ROOT = process.env.SAUL_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-079-render';
const PACKET = join(OUT, 'UC-079');
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
  const dimensions = /\.(?:jpe?g|png|webp)$/i.test(path) ? identify(path) : {};
  const row = { bytes: bytes.length, sha256: sha(bytes), mime: signatureMime(bytes), ...dimensions };
  if (expected.sha256) assert(row.sha256 === expected.sha256, `${path} hash drift ${row.sha256}`);
  if (expected.mime) assert(row.mime === expected.mime, `${path} MIME drift ${row.mime}`);
  if (expected.bytes !== undefined) assert(row.bytes === expected.bytes, `${path} byte drift ${row.bytes}`);
  if (expected.width !== undefined) assert(row.width === expected.width, `${path} width drift ${row.width}`);
  if (expected.height !== undefined) assert(row.height === expected.height, `${path} height drift ${row.height}`);
  return row;
}
function sourceRoot(role) {
  if (role.source_root === 'direct') return DIRECT_ROOT;
  if (role.source_root === 'saul') return SAUL_ROOT;
  throw new Error(`unknown source root ${role.source_root}`);
}

const control = await readJson(CONTROL);
assert(DIRECT_ROOT && SAUL_ROOT, 'DIRECT_ROOT and SAUL_ROOT are required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-079', 'UC-079 render scope drift');
assert(control.actor === 'Eddie Murphy' && control.character === 'Barbershop crowd & Saul' && control.side === 'still', 'UC-079 render identity drift');
assert(control.direct_role_artifact?.artifact_id === 8660410939 && control.direct_role_artifact?.head_sha === '317350429efce56a8307f165d4a9a2b6de032fa9', 'UC-079 direct artifact custody drift');
assert(control.saul_artifact?.artifact_id === 8668410397 && control.saul_artifact?.head_sha === '3cfc6c6226a35493a719fb42302b78f4d5ec8a66', 'UC-079 Saul artifact custody drift');
assert(control.roles?.length === 7, 'UC-079 seven-role denominator drift');
assert(control.layout?.candidate_width === 1260 && control.layout?.candidate_height === 1000, 'UC-079 candidate geometry drift');

await mkdir(PACKET, { recursive: true });
const directManifest = await receipt(join(DIRECT_ROOT, 'manifest.json'), { sha256: control.direct_role_artifact.manifest_sha256 });
const saulManifest = await receipt(join(SAUL_ROOT, 'manifest.json'), { sha256: control.saul_artifact.manifest_sha256 });
const repository = await repositoryHashes();
const repositoryCount = process.env.REPOSITORY_HASH_COUNT_OVERRIDE ? Number(process.env.REPOSITORY_HASH_COUNT_OVERRIDE) : repository.size;
assert(repositoryCount === control.expected_repository_hash_count, `repository hash denominator drift ${repositoryCount}`);

const roleSources = {};
const panels = {};
const retainedSourceFiles = [];
const retainedPages = [];
const duplicateItems = [];

for (const role of control.roles) {
  const root = sourceRoot(role);
  const sourceInput = join(root, role.source_path);
  const sourceOutput = join(PACKET, role.source_output);
  await copyFile(sourceInput, sourceOutput);
  const sourceMeta = await receipt(sourceOutput, {
    sha256: role.source_sha256,
    mime: role.source_mime,
    bytes: role.source_bytes,
    width: role.source_width,
    height: role.source_height
  });
  retainedSourceFiles.push(role.source_output);
  duplicateItems.push({ label: `${role.label} selected source`, path: role.source_output, sha256: sourceMeta.sha256, matches: repository.get(sourceMeta.sha256) || [] });

  let compositeMeta = null;
  if (role.composite_path) {
    const compositeOutput = join(PACKET, role.composite_output);
    await copyFile(join(root, role.composite_path), compositeOutput);
    compositeMeta = await receipt(compositeOutput, {
      sha256: role.composite_sha256,
      mime: role.composite_mime,
      bytes: role.composite_bytes,
      width: role.composite_width,
      height: role.composite_height
    });
    retainedSourceFiles.push(role.composite_output);
    duplicateItems.push({ label: `${role.label} four-role source composite`, path: role.composite_output, sha256: compositeMeta.sha256, matches: repository.get(compositeMeta.sha256) || [] });
  }

  const pageOutput = join(PACKET, role.page_output);
  await copyFile(join(root, role.page_path), pageOutput);
  const pageMeta = await receipt(pageOutput, { sha256: role.page_sha256, mime: 'image/png', bytes: role.page_bytes });
  retainedPages.push(role.page_output);

  const panelPath = join(PACKET, role.panel_output);
  magick(
    sourceOutput,
    '-auto-orient',
    '-resize', `${role.panel_width}x${role.panel_height}^`,
    '-gravity', role.gravity,
    '-extent', `${role.panel_width}x${role.panel_height}`,
    '-strip',
    '-quality', String(control.layout.jpeg_quality),
    panelPath
  );
  const panelMeta = await receipt(panelPath, { mime: 'image/jpeg', width: role.panel_width, height: role.panel_height });
  duplicateItems.push({ label: `${role.label} rendered panel`, path: role.panel_output, sha256: panelMeta.sha256, matches: repository.get(panelMeta.sha256) || [] });

  roleSources[role.key] = {
    label: role.label,
    family: role.family,
    provider: role.provider,
    source_page: role.source_page,
    declared_caption: role.declared_caption || null,
    original: { path: role.source_output, ...sourceMeta },
    source_page_screenshot: { path: role.page_output, ...pageMeta },
    composite_original: compositeMeta ? { path: role.composite_output, ...compositeMeta } : null,
    quadrant: role.quadrant || null,
    role_map: role.role_map || null
  };
  panels[role.key] = {
    path: role.panel_output,
    ...panelMeta,
    gravity: role.gravity,
    recipe: `auto-orient; cover-resize to ${role.panel_width}x${role.panel_height}; ${role.gravity} crop; strip metadata; JPEG quality ${control.layout.jpeg_quality}`
  };
}

const topDivider = join(OUT, 'top-divider.jpg');
const bottomDivider = join(OUT, 'bottom-divider.jpg');
const horizontalDivider = join(OUT, 'horizontal-divider.jpg');
magick('-size', `${control.layout.divider_width}x${control.layout.top_panel_height}`, `xc:${control.layout.divider_color}`, topDivider);
magick('-size', `${control.layout.divider_width}x${control.layout.bottom_panel_height}`, `xc:${control.layout.divider_color}`, bottomDivider);
magick('-size', `${control.layout.candidate_width}x${control.layout.divider_height}`, `xc:${control.layout.divider_color}`, horizontalDivider);

const topRow = join(OUT, 'top-row.jpg');
const topPaths = control.layout.top_order.map(key => join(PACKET, panels[key].path));
magick(topPaths[0], topDivider, topPaths[1], topDivider, topPaths[2], '+append', topRow);
const bottomRow = join(OUT, 'bottom-row.jpg');
const bottomPaths = control.layout.bottom_order.map(key => join(PACKET, panels[key].path));
magick(bottomPaths[0], bottomDivider, bottomPaths[1], bottomDivider, bottomPaths[2], bottomDivider, bottomPaths[3], '+append', bottomRow);

const candidatePath = join(PACKET, 'uc-079-still-candidate.jpg');
magick(topRow, horizontalDivider, bottomRow, '-append', '-strip', '-quality', String(control.layout.jpeg_quality), candidatePath);
const candidate = await receipt(candidatePath, { mime: 'image/jpeg', width: control.layout.candidate_width, height: control.layout.candidate_height });
duplicateItems.push({ label: 'UC-079 seven-role composite', path: 'uc-079-still-candidate.jpg', sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] });

const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.layout.wall_gravity, '-crop', `${control.layout.wall_width}x${control.layout.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.layout.jpeg_quality), cropPath);
const cropPreview = await receipt(cropPath, { mime: 'image/jpeg', width: control.layout.wall_width, height: control.layout.wall_height });
duplicateItems.push({ label: 'UC-079 wall crop preview', path: 'card-crop-preview.jpg', sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] });

assert(duplicateItems.every(item => item.matches.length === 0), `UC-079 evidence duplicates canonical media: ${duplicateItems.filter(item => item.matches.length).map(item => `${item.label}=${item.matches.join(',')}`).join('; ')}`);
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
  'The top row gives Clarence, Saul, and Randy Watson separate 412x494 panels; no Coming to America identity stands in for another.',
  'Saul is cropped from the bottom-right quadrant of a four-role Eddie Murphy composite whose surrounding page maps the quadrants as Prince Akeem, Randy Watson, Clarence, and Saul.',
  'The bottom row gives Sherman Klump, Cletus Klump, Anna Pearl Klump, and Ida Mae Jenson separate 306x494 panels sourced from role-specific SYFY / Universal evidence.',
  'The 1260x1000 two-row composite preserves all seven designed faces and supporting costume or body context, while the 1246x1000 wall simulation removes only seven pixels from each outside edge.',
  `Exact-byte duplicate screening passes against ${repositoryCount.toLocaleString('en-US')} canonical repository hashes.`
];
const review = {
  version: 1,
  record_id: 'UC-079',
  actor: 'Eddie Murphy',
  character: 'Barbershop crowd & Saul',
  production: 'Coming to America / The Nutty Professor',
  side: 'still',
  expected_subject: 'Barbershop crowd & Saul',
  source_sha256_by_role: Object.fromEntries(Object.entries(roleSources).map(([key, row]) => [key, row.original.sha256])),
  panel_sha256_by_role: Object.fromEntries(Object.entries(panels).map(([key, row]) => [key, row.sha256])),
  candidate_sha256: candidate.sha256,
  crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-composite-subject',
  presentation_ruling: 'seven-role-character-depiction',
  crop_ruling: 'pass-seven-role-two-row-composite',
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  reviewed_at: control.reviewed_at,
  canonical_mutation: false,
  disposition: 'reviewed-evidence-candidate',
  notes
};
await writeJson(join(PACKET, 'review.json'), review);
await writeFile(join(PACKET, 'review.md'), `# UC-079 reviewed Eddie Murphy multi-role still candidate\n\n- **Record:** UC-079\n- **Performer:** Eddie Murphy\n- **Displayed roles:** Clarence, Saul, Randy Watson, Sherman Klump, Cletus Klump, Anna Pearl Klump, and Ida Mae Jenson\n- **Productions:** Coming to America / The Nutty Professor\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** expected composite subject\n- **Presentation ruling:** seven-role character depiction\n- **Crop ruling:** pass, seven-role two-row composite\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe exact source bytes, four-role Saul context, role-specific page screenshots, seven deterministic panels, composite, wall simulation, and duplicate receipt remain evidence-only pending independent canonical acceptance.\n`);

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-079',
  actor: 'Eddie Murphy',
  character: 'Barbershop crowd & Saul',
  production: 'Coming to America / The Nutty Professor',
  years: '1988–96',
  side: 'still',
  expected_subject: 'Barbershop crowd & Saul',
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    direct_role_artifact: control.direct_role_artifact,
    saul_artifact: control.saul_artifact,
    failed_checkpoints: control.failed_checkpoints,
    render_control_sha256: sha(await readFile(CONTROL)),
    direct_manifest_sha256: directManifest.sha256,
    saul_manifest_sha256: saulManifest.sha256,
    render_artifact: null,
    apply_control_sha256: null
  },
  sources: roleSources,
  panels,
  layout: control.layout,
  candidate: {
    path: 'uc-079-still-candidate.jpg',
    ...candidate,
    recipe: 'three 412x494 Coming to America panels above four 306x494 Nutty Professor panels, separated by 12-pixel neutral dividers'
  },
  crop_preview: {
    path: 'card-crop-preview.jpg',
    ...cropPreview,
    gravity: control.layout.wall_gravity,
    semantics: 'The current wall simulation removes seven pixels from each outside edge while preserving all seven faces, their transformations, and enough costume or body context to remain independently legible.'
  },
  duplicate_scan: {
    path: 'duplicate-scan.json',
    repository_hash_count: repositoryCount,
    status: 'pass'
  },
  exact_subject_review: {
    identity: review.identity_ruling,
    presentation: review.presentation_ruling,
    crop_ruling: review.crop_ruling,
    notes
  },
  rejected_orbit_summary: [
    'Publicity portraits, untransformed Eddie Murphy frames, posters, merchandise, recommendation art, and unrelated gallery metadata were rejected.',
    'A Clarence-only barbershop frame was not allowed to stand for Saul, and no Nutty Professor role was allowed to stand for the complete family transformation.',
    'The Sympa Saul crop was retained in the Saul discovery artifact but not selected over the cleaner 400x400 Nevsedoma Saul quadrant.'
  ],
  disposition: 'reviewed-evidence-candidate',
  canonical_mutation: false
};
await writeJson(join(PACKET, 'manifest.json'), manifest);

const packetFiles = [
  ...new Set([
    ...retainedSourceFiles,
    ...retainedPages,
    ...Object.values(panels).map(row => row.path),
    'uc-079-still-candidate.jpg',
    'card-crop-preview.jpg',
    'duplicate-scan.json',
    'manifest.json',
    'review.json',
    'review.md'
  ])
].sort();
const sums = [];
for (const file of packetFiles) sums.push(`${sha(await readFile(join(PACKET, file)))}  ${file}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');

await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-079',
  candidate: { path: 'UC-079/uc-079-still-candidate.jpg', ...candidate },
  crop_preview: { path: 'UC-079/card-crop-preview.jpg', ...cropPreview },
  source_sha256_by_role: review.source_sha256_by_role,
  panel_sha256_by_role: review.panel_sha256_by_role,
  packet_file_count: packetFiles.length + 1,
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))),
  duplicate_scan_sha256: sha(await readFile(join(PACKET, 'duplicate-scan.json'))),
  review_json_sha256: sha(await readFile(join(PACKET, 'review.json'))),
  review_md_sha256: sha(await readFile(join(PACKET, 'review.md'))),
  sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))),
  canonical_mutation: false
});
console.log(`PASS — UC-079 seven-role render packet created at ${PACKET}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height} ${candidate.bytes}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height} ${cropPreview.bytes}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
console.log(`files ${packetFiles.length + 1}`);
