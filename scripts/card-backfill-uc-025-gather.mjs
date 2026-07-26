#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-025.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-025';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const norm = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, ' ').trim().toLowerCase();
const esc = (value) => String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); };

function signatureMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return 'unknown';
}
function extensionFor(mime) { return mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'bin'; }
function magick(...args) {
  const command = process.env.MAGICK_CMD || 'magick';
  execFileSync(command, args, { stdio: 'inherit' });
}
function identify(path) {
  const command = process.env.MAGICK_CMD || 'magick';
  const text = execFileSync(command, ['identify', '-format', '%w %h', path], { encoding: 'utf8' }).trim();
  const [width, height] = text.split(/\s+/).map(Number);
  assert(width > 0 && height > 0, `could not identify ${path}`);
  return { width, height };
}
async function fetchRetry(url, options = {}, label = url) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await fetch(url, { ...options, redirect: 'follow', signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      last = error;
      if (attempt < 4) await sleep(attempt * 900);
    }
  }
  throw new Error(`${label} unavailable after retries: ${last?.message || last}`);
}
async function walkImages(root) {
  const files = [];
  async function visit(path) {
    let entries;
    try { entries = await readdir(path, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (/\.(?:jpe?g|png|webp)$/i.test(entry.name)) files.push(child);
    }
  }
  await visit(root);
  return files;
}
async function existingHashes() {
  const hashes = new Map();
  try {
    const manifest = await readJson('data/media-manifest.json');
    for (const [path, row] of Object.entries(manifest.assets || {})) {
      if (/^[0-9a-f]{64}$/i.test(row?.sha256 || '')) {
        const key = row.sha256.toLowerCase();
        const list = hashes.get(key) || [];
        list.push(`manifest:${path}`);
        hashes.set(key, list);
      }
    }
  } catch {}
  for (const path of await walkImages('images')) {
    try {
      const bytes = await readFile(path);
      const key = sha256(bytes);
      const list = hashes.get(key) || [];
      list.push(`file:${path}`);
      hashes.set(key, list);
    } catch {}
  }
  return hashes;
}
function extractImageUrl(html, fallback = '') {
  const meta = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
  ];
  for (const pattern of meta) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].replace(/&amp;/g, '&').replace(/\\\//g, '/');
  }
  const amazon = html.match(/https:\/\/m\.media-amazon\.com\/images\/M\/[^"'\\\s<]+/i);
  return amazon?.[0]?.replace(/\\u0026/g, '&').replace(/\\\//g, '/') || fallback;
}

const control = await readJson(CONTROL);
assert(control.record_id === 'UC-025' && control.side === 'still', 'UC-025 authorization drift');
assert(control.actor === 'Javier Botet', 'actor authorization drift');
assert(Array.isArray(control.roles) && control.roles.length === 3, 'UC-025 requires exactly three role sources');
assert(control.composition?.width === 1260 && control.composition?.height === 1000 && control.composition?.divider === 12, 'composition geometry drift');
await mkdir(OUT, { recursive: true });
await mkdir(join(OUT, 'pages'), { recursive: true });
await mkdir(join(OUT, 'originals'), { recursive: true });
await mkdir(join(OUT, 'panels'), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US' });
const records = [];
try {
  for (const role of control.roles) {
    const creditPage = await context.newPage();
    await creditPage.goto(role.credit_page, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await creditPage.waitForTimeout(1500);
    const creditHtml = await creditPage.content();
    const creditText = norm(await creditPage.locator('body').innerText().catch(() => ''));
    for (const term of role.required_terms) assert(creditText.includes(norm(term)) || norm(creditHtml).includes(norm(term)), `${role.key} credit page lacks required term ${term}`);
    await creditPage.screenshot({ path: join(OUT, 'pages', `${role.key}-credit.png`), fullPage: true });
    const creditTitle = await creditPage.title();
    await creditPage.close();

    const mediaPage = await context.newPage();
    await mediaPage.goto(role.media_page, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await mediaPage.waitForTimeout(1800);
    const mediaHtml = await mediaPage.content();
    const mediaText = norm(await mediaPage.locator('body').innerText().catch(() => ''));
    assert(mediaText.includes(norm('Javier Botet')) || norm(mediaHtml).includes(norm('Javier Botet')), `${role.key} media page does not identify Javier Botet`);
    assert(mediaText.includes(norm(role.production)) || norm(mediaHtml).includes(norm(role.production)), `${role.key} media page does not identify ${role.production}`);
    const locatorUrl = await mediaPage.locator('meta[property="og:image"]').getAttribute('content').catch(() => null);
    const imageUrl = extractImageUrl(mediaHtml, locatorUrl || '');
    assert(/^https:\/\//.test(imageUrl), `${role.key} media page exposed no HTTPS image`);
    await mediaPage.screenshot({ path: join(OUT, 'pages', `${role.key}-media.png`), fullPage: true });
    const mediaTitle = await mediaPage.title();
    await mediaPage.close();

    const response = await fetchRetry(imageUrl, { headers: { 'User-Agent': UA, Referer: role.media_page, Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.2' } }, `${role.key} image`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const mime = signatureMime(bytes);
    assert(bytes.length > 10_000 && mime !== 'unknown', `${role.key} returned unusable image bytes (${bytes.length}, ${mime})`);
    const extension = extensionFor(mime);
    const originalRelative = `originals/${role.key}.${extension}`;
    const originalPath = join(OUT, originalRelative);
    await writeFile(originalPath, bytes);
    const dimensions = identify(originalPath);
    assert(dimensions.width >= 500 && dimensions.height >= 400, `${role.key} source is too small (${dimensions.width}x${dimensions.height})`);

    const panelRelative = `panels/${role.key}.jpg`;
    const panelPath = join(OUT, panelRelative);
    magick(originalPath, '-auto-orient', '-resize', '412x1000^', '-gravity', 'center', '-extent', '412x1000', '-strip', '-quality', '92', panelPath);
    const panelBytes = await readFile(panelPath);
    records.push({
      ...role,
      credit_title: creditTitle,
      media_title: mediaTitle,
      resolved_media_page: role.media_page,
      resolved_image_url: response.url || imageUrl,
      original: { path: originalRelative, mime, bytes: bytes.length, sha256: sha256(bytes), ...dimensions },
      panel: { path: panelRelative, mime: 'image/jpeg', bytes: panelBytes.length, sha256: sha256(panelBytes), ...identify(panelPath) },
    });
  }
} finally {
  await browser.close();
}

const divider = join(OUT, 'panels', 'divider.png');
magick('-size', '12x1000', 'xc:#e8e3d9', divider);
const composite = join(OUT, 'uc-025-still-candidate.jpg');
magick(
  join(OUT, records[0].panel.path), divider,
  join(OUT, records[1].panel.path), divider,
  join(OUT, records[2].panel.path),
  '+append', '-strip', '-quality', '94', composite,
);
const compositeDimensions = identify(composite);
assert(compositeDimensions.width === 1260 && compositeDimensions.height === 1000, `triptych geometry drifted to ${compositeDimensions.width}x${compositeDimensions.height}`);
const compositeBytes = await readFile(composite);

const cropPreview = join(OUT, 'card-crop-preview.jpg');
magick(composite, '-gravity', 'center', '-crop', '1246x1000+0+0', '+repage', '-strip', '-quality', '94', cropPreview);
const cropBytes = await readFile(cropPreview);

const existing = await existingHashes();
const checks = [
  ...records.map((row) => ({ label: row.key, path: row.original.path, sha256: row.original.sha256 })),
  { label: 'composite', path: 'uc-025-still-candidate.jpg', sha256: sha256(compositeBytes) },
];
const duplicateScan = {
  checked_manifest_and_image_hashes: existing.size,
  items: checks.map((row) => ({ ...row, matches: existing.get(row.sha256) || [] })),
};
for (const row of duplicateScan.items) assert(row.matches.length === 0, `${row.label} duplicates existing repository media: ${row.matches.join(', ')}`);
await writeJson(join(OUT, 'duplicate-scan.json'), duplicateScan);

const manifest = {
  version: 1,
  lane: control.lane,
  record_id: control.record_id,
  actor: control.actor,
  character: control.character,
  production: control.production,
  side: control.side,
  expected_subject: control.expected_subject,
  generated_at: new Date().toISOString(),
  control_sha256: sha256(await readFile(CONTROL)),
  sources: records,
  composite: {
    path: 'uc-025-still-candidate.jpg',
    mime: 'image/jpeg',
    bytes: compositeBytes.length,
    sha256: sha256(compositeBytes),
    ...compositeDimensions,
    recipe: 'three 412x1000 center-crop panels; Mama, 12px #e8e3d9 divider, Crooked Man, 12px #e8e3d9 divider, Keyface; stripped JPEG quality 94',
  },
  live_crop_preview: {
    path: 'card-crop-preview.jpg',
    mime: 'image/jpeg',
    bytes: cropBytes.length,
    sha256: sha256(cropBytes),
    ...identify(cropPreview),
    semantics: 'Simulation of the existing 58%-height wall image box at its approximately 1.246:1 aspect ratio.',
  },
  duplicate_scan: duplicateScan,
  disposition: 'candidate-only-pending-exact-subject-review',
};
await writeJson(join(OUT, 'manifest.json'), manifest);
await writeJson(join(OUT, 'review.json'), {
  version: 1,
  record_id: control.record_id,
  expected_subject: control.expected_subject,
  side: control.side,
  candidate_sha256: manifest.composite.sha256,
  identity_ruling: 'pending',
  presentation_ruling: 'pending',
  canonical_mutation: false,
  notes: [
    'Candidate must visibly and distinctly represent Mama, the Crooked Man and a third Javier Botet creature performance (Keyface).',
    'IMDb credit pages independently bind Javier Botet to each role; the media pages bind each downloaded image to the matching production.',
    'No panel or composite is a performer portrait.',
  ],
});

const cards = records.map((row) => `<article><h2>${esc(row.label)} · ${esc(row.production)}</h2><img src="${esc(row.original.path)}" alt=""><p><a href="${esc(row.credit_page)}">role credit</a> · <a href="${esc(row.media_page)}">media page</a></p><code>${esc(row.original.sha256)}</code></article>`).join('\n');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>UC-025 candidate review</title><style>body{font:14px system-ui;margin:24px;background:#e8e3d9;color:#171512}main{max-width:1260px;margin:auto}.sources{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.sources article{background:#fff;padding:12px;border:1px solid #777}.sources img{width:100%;height:420px;object-fit:contain;background:#111}.hero{width:100%;display:block;margin:24px 0;border:2px solid #111}.crop{width:100%;display:block;margin:24px 0;border:2px solid #806f59}code{font-size:10px;word-break:break-all}a{color:#574b3c}</style></head><body><main><h1>UC-025 · Mama, the Crooked Man &amp; others</h1><p>Candidate-only. Review exact role identity, panel order and wall crop before any canonical application.</p><section class="sources">${cards}</section><h2>Deterministic triptych</h2><img class="hero" src="uc-025-still-candidate.jpg" alt=""><h2>Live wall crop simulation</h2><img class="crop" src="card-crop-preview.jpg" alt=""></main></body></html>`;
await writeFile(join(OUT, 'review.html'), html);
await writeFile(join(OUT, 'SHA256SUMS'), [
  ...records.map((row) => `${row.original.sha256}  ${row.original.path}`),
  `${manifest.composite.sha256}  uc-025-still-candidate.jpg`,
  `${manifest.live_crop_preview.sha256}  card-crop-preview.jpg`,
].join('\n') + '\n');

console.log(`UC-025 candidate: ${manifest.composite.sha256}`);
console.log(`sources: ${records.map((row) => `${row.key}=${row.original.sha256}`).join(' ')}`);
console.log(`duplicate scan: PASS across ${existing.size} distinct repository hashes`);
console.log(`evidence -> ${OUT}`);
