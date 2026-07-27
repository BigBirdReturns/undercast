#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-077-RENDER.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-077-render';
const PACKET = join(OUT, 'UC-077');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); };
const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/[^a-zA-Z0-9']+/g, ' ').trim().toLowerCase();

function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
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
async function fileRecord(path, relative, mime = 'image/jpeg') {
  const bytes = await readFile(path);
  return { path: relative, bytes: bytes.length, sha256: sha(bytes), mime, ...identify(path) };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-077', 'UC-077 render scope drift');
assert(control.actor === 'Peter Boyle' && control.character === 'The Monster' && control.side === 'still', 'UC-077 render identity drift');
assert(control.targeted_artifact?.artifact_id === 8642853136 && control.targeted_artifact?.head_sha === '00bba40e71a212e66aa940a975c26a0375b6df03', 'UC-077 targeted custody drift');
assert(control.source?.sha256 === '3e8e920111381dbb6281de245a69513e3e8739d9f19fcb6510053c455658762f', 'UC-077 source authorization drift');
await mkdir(PACKET, { recursive: true });

const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US' });
let pageEvidence;
try {
  const page = await context.newPage();
  const response = await page.goto(control.source.page_url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(1600);
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, 1600);
    await page.waitForTimeout(250);
  }
  const body = await page.locator('body').innerText().catch(() => '');
  const html = await page.content();
  const hay = norm(body + ' ' + html);
  const missing = control.source.required_terms.filter(term => !hay.includes(norm(term)));
  assert(response && response.status() >= 200 && response.status() < 400, `LA Times source page HTTP ${response?.status()}`);
  assert(missing.length === 0, `LA Times source terms missing: ${missing.join(', ')}`);
  const screenshotPath = join(PACKET, 'source-page-los-angeles-times.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const screenshotBytes = await readFile(screenshotPath);
  pageEvidence = {
    provider: control.source.provider,
    source_page: control.source.page_url,
    resolved_page: page.url(),
    page_title: await page.title(),
    http_status: response.status(),
    required_terms: control.source.required_terms,
    required_terms_missing: [],
    page_screenshot: {
      path: 'source-page-los-angeles-times.png',
      sha256: sha(screenshotBytes),
      bytes: screenshotBytes.length
    },
    caption_evidence: control.source.caption,
    credit_evidence: control.source.credit
  };
  await page.close();

  const imageResponse = await context.request.get(control.source.asset_url, {
    headers: { 'User-Agent': UA, Referer: control.source.page_url, Accept: 'image/jpeg,image/*,*/*;q=0.2' },
    timeout: 60000,
    failOnStatusCode: false
  });
  assert(imageResponse.ok(), `LA Times source image HTTP ${imageResponse.status()}`);
  const sourceBytes = Buffer.from(await imageResponse.body());
  assert(signatureMime(sourceBytes) === control.source.mime, 'LA Times source MIME drift');
  assert(sourceBytes.length === control.source.bytes, `LA Times source byte drift ${sourceBytes.length}`);
  assert(sha(sourceBytes) === control.source.sha256, `LA Times source hash drift ${sha(sourceBytes)}`);
  const originalPath = join(PACKET, 'monster-original.jpg');
  await writeFile(originalPath, sourceBytes);
  const originalDimensions = identify(originalPath);
  assert(originalDimensions.width === control.source.width && originalDimensions.height === control.source.height, 'LA Times source geometry drift');

  const candidatePath = join(PACKET, 'uc-077-still-candidate.jpg');
  magick(originalPath, '-auto-orient', '-resize', `${control.render.candidate_width}x${control.render.candidate_height}^`, '-gravity', control.render.candidate_gravity, '-extent', `${control.render.candidate_width}x${control.render.candidate_height}`, '-strip', '-quality', String(control.render.jpeg_quality), candidatePath);
  const cropPath = join(PACKET, 'card-crop-preview.jpg');
  magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);

  const original = await fileRecord(originalPath, 'monster-original.jpg');
  const candidate = await fileRecord(candidatePath, 'uc-077-still-candidate.jpg');
  const cropPreview = await fileRecord(cropPath, 'card-crop-preview.jpg');
  assert(candidate.width === 1260 && candidate.height === 1000, 'UC-077 candidate geometry drift');
  assert(cropPreview.width === 1246 && cropPreview.height === 1000, 'UC-077 wall crop geometry drift');

  const duplicateItems = [
    ['Los Angeles Times Peter Boyle Monster source', original],
    ['UC-077 still candidate', candidate],
    ['UC-077 wall crop preview', cropPreview]
  ].map(([label, row]) => ({ label, path: row.path, sha256: row.sha256, matches: repository.get(row.sha256) || [] }));
  assert(duplicateItems.every(item => item.matches.length === 0), 'UC-077 exact-byte duplicate detected');
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
    'The Los Angeles Times caption identifies Peter Boyle as the Monster on the Young Frankenstein set and credits Marianna Diamos.',
    'The retained frame visibly preserves the squared prosthetic forehead, heavy brow and eyes, facial makeup, hair treatment, costume, hands, and laboratory context.',
    'The 1260x1000 center crop removes peripheral set material while preserving the complete designed face, shoulders, torso, both hands, and seated lower-body silhouette.',
    'The 1246x1000 wall simulation removes seven pixels from each outside edge without changing the identity or body-legibility ruling.',
    `Exact-byte duplicate screening passes against ${repository.size.toLocaleString('en-US')} canonical repository hashes.`
  ];
  const review = {
    version: 1,
    record_id: 'UC-077',
    actor: 'Peter Boyle',
    character: 'The Monster',
    production: 'Young Frankenstein',
    side: 'still',
    expected_subject: 'The Monster',
    source_sha256: original.sha256,
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
  const reviewMd = `# UC-077 reviewed Peter Boyle Monster still candidate\n\n- **Record:** UC-077\n- **Performer:** Peter Boyle\n- **Displayed role:** The Monster\n- **Production:** Young Frankenstein (1974)\n- **Source:** [Los Angeles Times](${control.source.page_url})\n- **Source bytes:** \`${original.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** character depiction\n- **Crop ruling:** pass, single-role center crop\n- **Canonical mutation:** none\n\n## Visual ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe exact source bytes, source-page screenshot, deterministic candidate, wall simulation, and duplicate receipt remain evidence-only pending independent canonical acceptance.\n`;
  await writeFile(join(PACKET, 'review.md'), reviewMd);

  const manifest = {
    version: 1,
    lane: 'card-backfill',
    record_id: 'UC-077',
    actor: 'Peter Boyle',
    character: 'The Monster',
    production: 'Young Frankenstein',
    year: 1974,
    side: 'still',
    expected_subject: 'The Monster',
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    reviewed_role: control.reviewed_role,
    custody: {
      targeted_artifact: control.targeted_artifact,
      failed_checkpoints: control.failed_checkpoints,
      render_control_sha256: sha(await readFile(CONTROL)),
      targeted_manifest_sha256: control.targeted_artifact.manifest_sha256,
      render_artifact: null,
      apply_control_sha256: null
    },
    source: {
      provider: control.source.provider,
      source_page: control.source.page_url,
      asset_url: control.source.asset_url,
      caption: control.source.caption,
      credit: control.source.credit,
      page_evidence: pageEvidence
    },
    original,
    candidate: {
      ...candidate,
      recipe: `auto-orient; cover-resize to ${control.render.candidate_width}x${control.render.candidate_height}; ${control.render.candidate_gravity} crop; strip metadata; JPEG quality ${control.render.jpeg_quality}`
    },
    crop_preview: {
      ...cropPreview,
      gravity: control.render.wall_gravity,
      semantics: 'The current wall simulation removes seven pixels from each outside edge. It preserves the complete designed face, shoulders, torso, both hands, and seated lower-body silhouette.'
    },
    rejected_orbit_summary: [
      'Recommendation art, posters, title cards, cast ensembles, unrelated page resources, and the page video poster were rejected.',
      'Boris Karloff, other Frankenstein adaptations, Peter Boyle without Monster makeup, Gene Wilder alone, stage productions, illustrations, merchandise, colorized derivatives, and memes remained outside the authorization boundary.',
      'Lower-resolution deliveries of the exact Los Angeles Times frame were retained in the targeted discovery artifact but not selected over the caption-local 1200x798 JPEG.'
    ],
    duplicate_scan: {
      path: 'duplicate-scan.json',
      repository_hash_count: repository.size,
      status: 'pass'
    },
    exact_subject_review: {
      identity: review.identity_ruling,
      presentation: review.presentation_ruling,
      crop_ruling: review.crop_ruling,
      notes
    },
    disposition: 'reviewed-evidence-candidate',
    canonical_mutation: false
  };
  await writeJson(join(PACKET, 'manifest.json'), manifest);

  const packetNames = ['card-crop-preview.jpg', 'duplicate-scan.json', 'manifest.json', 'monster-original.jpg', 'review.json', 'review.md', 'source-page-los-angeles-times.png', 'uc-077-still-candidate.jpg'];
  const sums = [];
  for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
  await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
  await writeJson(join(OUT, 'render-summary.json'), {
    record_id: 'UC-077',
    source: original,
    candidate,
    crop_preview: cropPreview,
    source_page_screenshot: pageEvidence.page_screenshot,
    repository_hash_count: repository.size,
    packet_files: [...packetNames, 'SHA256SUMS'],
    manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json')),
    review_sha256: sha(await readFile(join(PACKET, 'review.json')),
    sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS')),
    canonical_mutation: false
  });
  console.log(`PASS — UC-077 exact render packet created at ${PACKET}`);
  console.log(`source ${original.sha256} ${original.width}x${original.height}`);
  console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
  console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
  console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
} finally {
  await browser.close();
}
