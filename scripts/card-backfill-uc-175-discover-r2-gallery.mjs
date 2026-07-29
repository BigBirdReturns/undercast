#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-175-DISCOVER.json';
const FAILURES = '.github/CARD-BACKFILL-UC-175-DISCOVER-FAILURES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-175-r2-gallery';
const GALLERY = 'https://www.starwars.com/databank/r2-d2-biography-gallery';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';

const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};

function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return 'unknown';
}
function extensionFor(mime) {
  return mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'bin';
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
function responseStatus(response) {
  return response ? (typeof response.status === 'function' ? response.status() : response.status) : null;
}
async function acceptBanners(page) {
  for (const label of ['CONTINUE', 'Accept', 'I Accept', 'Agree', 'Allow all', 'Accept All', 'Accept Cookies', 'Close']) {
    const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
    if (await button.count().catch(() => 0)) {
      await button.first().click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(250);
    }
  }
}
async function navigateWithFallback(context, page, url) {
  try {
    return { response: await page.goto(url, { waitUntil: 'domcontentloaded', timeout: control.transport_timeout_ms }), transport: 'browser-navigation' };
  } catch (browserError) {
    const response = await context.request.get(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
      timeout: control.transport_timeout_ms,
      failOnStatusCode: false,
    });
    if (!response.ok()) throw browserError;
    const html = await response.text();
    const base = `<base href="${url}">`;
    const patched = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : `${base}${html}`;
    await page.setContent(patched, { waitUntil: 'domcontentloaded', timeout: control.transport_timeout_ms });
    return { response, transport: 'request-fallback' };
  }
}
function normalizeCdnUrl(value) {
  if (!value) return null;
  const raw = String(value).replace(/&amp;/g, '&').trim();
  try {
    const url = new URL(raw, GALLERY);
    if (url.hostname !== 'lumiere-a.akamaihd.net') return null;
    if (!url.pathname.startsWith('/v1/images/')) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}
function urlsFromSet(value) {
  if (!value) return [];
  return String(value).split(',').map(part => part.trim().split(/\s+/)[0]).filter(Boolean);
}
async function inspectGalleryPage(context, pageNumber) {
  const page = await context.newPage();
  const url = pageNumber === 1 ? GALLERY : `${GALLERY}?page=${pageNumber}`;
  const screenshotPath = join(OUT, 'pages', `r2-d2-biography-gallery-${String(pageNumber).padStart(2, '0')}.png`);
  try {
    const { response, transport } = await navigateWithFallback(context, page, url);
    await page.waitForTimeout(1800);
    await acceptBanners(page);
    for (let i = 0; i < 14; i++) {
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(140);
    }
    await page.waitForTimeout(500);
    const title = await page.title();
    const body = await page.locator('body').innerText().catch(() => '');
    const values = await page.evaluate(() => {
      const out = [];
      const push = value => { if (value) out.push(String(value)); };
      for (const anchor of document.querySelectorAll('a[href]')) push(anchor.href);
      for (const image of document.querySelectorAll('img')) {
        push(image.currentSrc);
        for (const name of ['src', 'data-src', 'data-lazy-src', 'data-original', 'srcset', 'data-srcset']) push(image.getAttribute(name));
      }
      for (const source of document.querySelectorAll('source')) {
        for (const name of ['src', 'srcset', 'data-srcset']) push(source.getAttribute(name));
      }
      for (const element of document.querySelectorAll('[style]')) push(element.getAttribute('style'));
      for (const entry of performance.getEntriesByType('resource')) push(entry.name);
      return out;
    });
    const discovered = new Set();
    for (const value of values) {
      for (const candidate of urlsFromSet(value)) {
        const direct = normalizeCdnUrl(candidate);
        if (direct) discovered.add(direct);
        for (const match of candidate.matchAll(/https?:\/\/lumiere-a\.akamaihd\.net\/v1\/images\/[^)'"\s,]+/g)) {
          const nested = normalizeCdnUrl(match[0]);
          if (nested) discovered.add(nested);
        }
      }
    }
    await mkdir(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const screenshotBytes = await readFile(screenshotPath);
    return {
      status: 'loaded',
      page_number: pageNumber,
      requested_url: url,
      resolved_url: page.url() || url,
      http_status: responseStatus(response),
      transport,
      title,
      body_contains_gallery_title: body.includes('R2-D2 Biography Gallery'),
      body_sha256: sha(Buffer.from(body.slice(0, 60000), 'utf8')),
      discovered_urls: [...discovered].sort(),
      screenshot: {
        path: `pages/${screenshotPath.split('/').pop()}`,
        sha256: sha(screenshotBytes),
        bytes: screenshotBytes.length,
        ...identify(screenshotPath),
      },
    };
  } catch (error) {
    return { status: 'error', page_number: pageNumber, requested_url: url, error: error.message, discovered_urls: [] };
  } finally {
    await page.close();
  }
}
async function downloadGalleryCandidate(context, url, index, repository) {
  const response = await context.request.get(url, {
    headers: {
      'User-Agent': UA,
      Referer: GALLERY,
      Accept: 'image/jpeg,image/webp,image/png,image/*,*/*;q=0.2',
    },
    timeout: control.transport_timeout_ms,
    failOnStatusCode: false,
  });
  if (!response.ok()) return { url, http_status: response.status(), retained: false, error: 'HTTP' };
  const bytes = Buffer.from(await response.body());
  const mime = signatureMime(bytes);
  if (bytes.length < 12000 || mime === 'unknown') return { url, http_status: response.status(), bytes: bytes.length, mime, retained: false, error: 'unusable' };
  const hash = sha(bytes);
  const local = `candidates/r2-gallery/${String(index).padStart(2, '0')}.${extensionFor(mime)}`;
  const path = join(OUT, local);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  const dimensions = identify(path);
  const repository_matches = repository.get(hash) || [];
  const retained = dimensions.width >= 300 && dimensions.height >= 300 && repository_matches.length === 0;
  return {
    role_key: 'r2d2',
    role: 'R2-D2',
    provider: 'StarWars.com / Lucasfilm',
    source_page: GALLERY,
    declared_url: url,
    resolved_url: response.url() || url,
    local,
    mime,
    bytes: bytes.length,
    sha256: hash,
    ...dimensions,
    aspect_ratio: Number((dimensions.width / dimensions.height).toFixed(6)),
    portrait_or_square_priority: dimensions.height >= dimensions.width * 0.8,
    repository_matches,
    retained,
  };
}

const control = await readJson(CONTROL);
const failures = await readJson(FAILURES);
assert(control.version === 1 && control.record_id === 'UC-175' && control.actor === 'Ben Burtt', 'UC-175 discovery control drift');
assert(control.scope_artifact?.artifact_id === 8735112701 && control.scope_artifact?.scope_sha256 === '1304300caac883990f9a03dcd0605e7f0f345ed4e4483339336ba2e2109e3ac0', 'UC-175 scope custody drift');
assert(control.selection_contract?.both_characters_faces_bodies_and_design_silhouettes_must_be_legible === true, 'UC-175 visual contract drift');
assert(failures.version === 1 && failures.record_id === 'UC-175' && failures.failed_discovery_checkpoints?.length === 1, 'UC-175 failed checkpoint custody drift');
const failed = failures.failed_discovery_checkpoints[0];
assert(failed.run_id === 30480498637 && failed.artifact_id === 8735470319 && failed.head_sha === 'fc17835fe99562c8ca62c9f182c3a9acb009554c', 'UC-175 failed run identity drift');
assert(failed.artifact_digest_sha256 === 'e8f682cf8747ea805047e1c392c08ac2d3ac0b5d96d6d46b339aa37b50567ab1', 'UC-175 failed artifact digest drift');
assert(failed.selected_r2d2_sha256 === '08016e63cbed95fec653e31b3ab94555e9cf223b62fb7ac3a634d542feb1f981', 'UC-175 rejected R2-D2 bytes drift');
assert(failed.accepted_walle_sha256 === 'd93d4066c4b72e0e2323ca7e9f294bd349a9142d6e356950a115c35471109c15', 'UC-175 held WALL-E bytes drift');
assert(failures.repair_boundary?.official_starwars_biography_gallery_only === true && failures.repair_boundary?.general_source_floor_unchanged === true && failures.repair_boundary?.canonical_mutation === false, 'UC-175 repair boundary drift');

const specimen = (await readJson('data/specimens.json')).find(row => row.id === 'UC-175');
const source = (await readJson('data/SOURCES.json')).find(row => row.id === 'UC-175');
const audit = (await readJson('data/MEDIA-AUDIT.json')).items.find(row => row.id === control.audit_id);
assert(specimen && !specimen.still && specimen.portrait?.src === 'images/uc-175-portrait.jpg', 'UC-175 specimen boundary drift');
assert(source && !source.still && source.portrait?.src === 'images/uc-175-portrait.jpg', 'UC-175 source-ledger boundary drift');
assert(audit && audit.wall_id === 'UC-175' && audit.side === 'still' && audit.status === 'absent' && !audit.asset, 'UC-175 audit boundary drift');

await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US', ignoreHTTPSErrors: true });
try {
  const pageEvidence = [];
  const urlSet = new Set();
  for (let pageNumber = 1; pageNumber <= 6; pageNumber++) {
    const evidence = await inspectGalleryPage(context, pageNumber);
    pageEvidence.push(evidence);
    for (const url of evidence.discovered_urls || []) urlSet.add(url);
    if (pageNumber >= 2 && evidence.status === 'error') break;
    if (pageNumber >= 3 && evidence.status === 'loaded' && evidence.discovered_urls.length === 0) break;
  }
  assert(pageEvidence.some(row => row.status === 'loaded' && row.body_contains_gallery_title), 'R2-D2 gallery never loaded');
  assert(urlSet.size >= 12, `R2-D2 gallery denominator too small: ${urlSet.size}`);

  const attempts = [];
  const retainedByHash = new Map();
  let index = 0;
  for (const url of [...urlSet].sort()) {
    try {
      const row = await downloadGalleryCandidate(context, url, ++index, repository);
      attempts.push(row);
      if (row.retained && !retainedByHash.has(row.sha256)) retainedByHash.set(row.sha256, row);
    } catch (error) {
      attempts.push({ url, retained: false, error: error.message });
    }
  }
  const candidates = [...retainedByHash.values()].sort((a, b) => {
    if (a.portrait_or_square_priority !== b.portrait_or_square_priority) return a.portrait_or_square_priority ? -1 : 1;
    return (b.height * b.width - a.height * a.width) || a.local.localeCompare(b.local);
  });
  assert(candidates.length >= 8, `R2-D2 retained gallery orbit too small: ${candidates.length}`);

  const thumbs = [];
  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    const thumb = join(OUT, 'thumbs', `r2-gallery-${String(i + 1).padStart(2, '0')}.jpg`);
    await mkdir(dirname(thumb), { recursive: true });
    magick(
      join(OUT, row.local),
      '-auto-orient',
      '-thumbnail', '340x340>',
      '-background', '#171512',
      '-gravity', 'center',
      '-extent', '340x340',
      '-fill', 'white',
      '-undercolor', '#171512dd',
      '-gravity', 'south',
      '-pointsize', '14',
      '-annotate', '+0+7', `R2 ${String(i + 1).padStart(2, '0')} · ${row.width}x${row.height}`,
      '-strip',
      '-quality', '88',
      thumb,
    );
    thumbs.push(thumb);
  }
  const contactPath = join(OUT, 'contact-sheet-r2-gallery.jpg');
  execFileSync('montage', [...thumbs, '-tile', '4x', '-geometry', '340x340+8+8', '-background', '#d5d0c7', contactPath], { stdio: 'inherit' });
  const contactBytes = await readFile(contactPath);
  const contactSheet = {
    path: 'contact-sheet-r2-gallery.jpg',
    sha256: sha(contactBytes),
    bytes: contactBytes.length,
    ...identify(contactPath),
    candidate_count: candidates.length,
  };

  const manifest = {
    version: 1,
    lane: 'card-backfill',
    record_id: 'UC-175',
    actor: 'Ben Burtt',
    role: 'R2-D2',
    production: 'Star Wars',
    generated_at: new Date().toISOString(),
    control_sha256: sha(await readFile(CONTROL)),
    failure_ledger_sha256: sha(await readFile(FAILURES)),
    prior_failed_checkpoint: failed,
    repair_boundary: failures.repair_boundary,
    repository_hash_count: repository.size,
    gallery_url: GALLERY,
    gallery_pages: pageEvidence,
    discovered_url_count: urlSet.size,
    attempts,
    candidates,
    candidate_count: candidates.length,
    contact_sheet: contactSheet,
    disposition: 'official-r2-d2-biography-gallery-orbit-pending-visual-second-desk',
    selected_candidate: null,
    held_walle_sha256: failed.accepted_walle_sha256,
    canonical_mutation: false,
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-175',
    role: 'R2-D2',
    prior_failed_run_id: failed.run_id,
    prior_rejected_r2d2_sha256: failed.selected_r2d2_sha256,
    held_walle_sha256: failed.accepted_walle_sha256,
    discovered_url_count: urlSet.size,
    candidate_count: candidates.length,
    candidates,
    contact_sheet: contactSheet,
    selected_candidate: null,
    canonical_mutation: false,
  });
  const cards = candidates.map((row, i) => `<article><img src="${row.local}" alt=""><h2>R2 ${String(i + 1).padStart(2, '0')}</h2><p>${row.width}×${row.height}</p><code>${row.sha256}</code><p>${row.declared_url}</p></article>`).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}article{background:white;padding:10px}img{width:100%;height:520px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}p{overflow-wrap:anywhere}</style><h1>UC-175 · official R2-D2 Biography Gallery repair orbit</h1><p>The prior Databank hero image failed visual second desk because it omitted the legs, center foot, and complete silhouette. No candidate is selected here. WALL·E remains held by exact hash.</p><div class="grid">${cards}</div>`);
  console.log(`PASS — retained ${candidates.length} byte-distinct official R2-D2 gallery candidates from ${urlSet.size} discovered URLs`);
} finally {
  await context.close();
  await browser.close();
}
