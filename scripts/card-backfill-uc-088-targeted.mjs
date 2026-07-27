#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-088-TARGETED.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-088-targeted';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha = value => createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[’‘]/g, "'")
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[^;]+;/g, ' ')
  .replace(/[^a-zA-Z0-9']+/g, ' ')
  .trim()
  .toLowerCase();
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
function cleanUrl(value, base) {
  if (!value) return '';
  try { return new URL(String(value).replace(/&amp;/g, '&'), base).href; } catch { return ''; }
}
function imageVariants(url) {
  const rows = [];
  const push = (value, kind) => {
    if (value && !rows.some(row => row.url === value)) rows.push({ url: value, kind });
  };
  push(url, 'declared-delivery');
  try {
    const parsed = new URL(url);
    const noQuery = new URL(url);
    noQuery.search = '';
    push(noQuery.href, 'unparameterized');
    for (const width of [2400, 2000, 1600, 1200]) {
      push(parsed.href.replace(/\/p\/(?:400|600|800|1000|1200)\//i, `/p/${width}/`), `movieinsider-width-${width}`);
      push(parsed.href.replace(/\/images\/(?:400|600|800|1000|1200)\//i, `/images/${width}/`), `movieinsider-images-width-${width}`);
      const copy = new URL(url);
      for (const key of ['w', 'width']) if (copy.searchParams.has(key)) copy.searchParams.set(key, String(width));
      push(copy.href, `query-width-${width}`);
    }
    push(parsed.href.replace(/-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|webp)(?:\?|$))/i, ''), 'filename-original-probe');
  } catch {}
  return rows;
}
async function inspectPage(context, key, url, requiredTerms, timeout) {
  const page = await context.newPage();
  const screenshot = `pages/${key}.png`;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(1200);
    for (const label of ['CONTINUE', 'Accept', 'I Accept', 'Agree', 'Allow all', 'Accept All']) {
      const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
      if (await button.count().catch(() => 0)) {
        await button.first().click({ timeout: 1200 }).catch(() => {});
        await page.waitForTimeout(300);
      }
    }
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(180);
    }
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content();
    const title = await page.title();
    const hay = norm(body + ' ' + html);
    const missing = requiredTerms.filter(term => !hay.includes(norm(term)));
    const metadata = await page.evaluate(() => {
      const get = selector => document.querySelector(selector)?.getAttribute('content') || document.querySelector(selector)?.getAttribute('href') || '';
      return {
        og_image: get('meta[property="og:image"]') || get('meta[property="og:image:secure_url"]') || get('link[rel="image_src"]'),
        twitter_image: get('meta[name="twitter:image"]') || get('meta[name="twitter:image:src"]'),
        description: get('meta[property="og:description"]') || get('meta[name="description"]'),
        canonical: document.querySelector('link[rel="canonical"]')?.href || location.href
      };
    }).catch(() => ({ og_image: '', twitter_image: '', description: '', canonical: page.url() }));
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: true }).catch(async () => {
      await page.screenshot({ path: join(OUT, screenshot), fullPage: false }).catch(() => {});
    });
    return {
      status: 'loaded',
      http_status: response?.status() || null,
      title,
      resolved_url: page.url(),
      canonical_url: metadata.canonical,
      description: metadata.description,
      required_terms: requiredTerms,
      required_terms_missing: missing,
      body_text: body.slice(0, 32000),
      screenshot,
      image_urls: [...new Set([metadata.og_image, metadata.twitter_image].map(value => cleanUrl(value, page.url())).filter(Boolean))]
    };
  } catch (error) {
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: false }).catch(() => {});
    return { status: 'error', error: error.message, http_status: null, title: '', resolved_url: page.url(), required_terms: requiredTerms, required_terms_missing: requiredTerms, body_text: '', screenshot, image_urls: [] };
  } finally {
    await page.close();
  }
}
async function downloadVariant(context, pageUrl, photoId, variant, index, timeout) {
  let response;
  try {
    response = await context.request.get(variant.url, {
      headers: { 'User-Agent': UA, Referer: pageUrl, Accept: 'image/jpeg,image/webp,image/png,image/*,*/*;q=0.2' },
      timeout,
      failOnStatusCode: false
    });
  } catch (error) {
    return { photo_id: photoId, probe_url: variant.url, probe_kind: variant.kind, download_error: error.message };
  }
  if (!response.ok()) return { photo_id: photoId, probe_url: variant.url, probe_kind: variant.kind, download_error: `HTTP ${response.status()}` };
  const bytes = Buffer.from(await response.body());
  const mime = signatureMime(bytes);
  if (bytes.length < 12000 || mime === 'unknown') return { photo_id: photoId, probe_url: variant.url, probe_kind: variant.kind, download_error: `unusable ${bytes.length} ${mime}` };
  const local = `candidates/${String(index).padStart(3, '0')}-photo-${photoId}-${variant.kind}.${extensionFor(mime)}`;
  const path = join(OUT, local);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  let dimensions = { width: 0, height: 0 };
  try { dimensions = identify(path); } catch {}
  if (dimensions.width < 400 || dimensions.height < 250) return { photo_id: photoId, probe_url: variant.url, probe_kind: variant.kind, resolved_url: response.url() || variant.url, local, mime, bytes: bytes.length, sha256: sha(bytes), ...dimensions, download_error: 'image below 400x250 floor' };
  return { photo_id: photoId, probe_url: variant.url, probe_kind: variant.kind, resolved_url: response.url() || variant.url, local, mime, bytes: bytes.length, sha256: sha(bytes), ...dimensions };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-088', 'UC-088 targeted scope drift');
assert(control.actor === 'Michael Chiklis' && control.character === 'The Thing' && control.production === 'Fantastic Four' && control.year === 2005 && control.side === 'still', 'UC-088 targeted identity drift');
assert(control.selector_artifact?.artifact_id === 8671229850 && control.scope_artifact?.artifact_id === 8671280407 && control.failed_broad_discovery?.artifact_id === 8671483959, 'UC-088 targeted custody drift');
assert(control.role_pages?.length === 3 && control.photo_pages?.length === 15, 'UC-088 targeted denominator drift');
assert(control.page_contract?.minimum_valid_pages === 10 && control.page_contract?.minimum_unique_candidates === 8 && control.selection_contract?.visual_second_desk_required === true && control.selection_contract?.canonical_mutation === false, 'UC-088 targeted contract drift');

await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US' });
try {
  const role_evidence = {};
  const photo_evidence = {};
  const page_screenshots = [];
  const attempted = [];
  const candidates = [];
  const seenHashes = new Set();
  let index = 0;

  for (const pageSpec of control.role_pages) {
    const evidence = await inspectPage(context, `role-${pageSpec.key}`, pageSpec.url, pageSpec.required_terms, control.transport_timeout_ms);
    role_evidence[pageSpec.key] = evidence;
    if (pageSpec.strict) {
      assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${pageSpec.key} role page transport failed`);
      assert(evidence.required_terms_missing.length === 0, `${pageSpec.key} role evidence failed: ${evidence.required_terms_missing.join(', ')}`);
    }
    try {
      const bytes = await readFile(join(OUT, evidence.screenshot));
      page_screenshots.push({ key: pageSpec.key, type: 'role', path: evidence.screenshot, sha256: sha(bytes), bytes: bytes.length, ...identify(join(OUT, evidence.screenshot)) });
    } catch {}
  }

  let validPages = 0;
  for (const pageSpec of control.photo_pages) {
    const key = `movieinsider-${pageSpec.photo_id}`;
    const evidence = await inspectPage(context, key, pageSpec.url, control.page_contract.required_terms, control.transport_timeout_ms);
    const pageHay = norm([evidence.title, evidence.description, evidence.body_text].join(' '));
    const wrongType = /(poster|dvd cover|soundtrack cover)/.test(pageHay);
    const valid = evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400 && evidence.required_terms_missing.length === 0 && !wrongType && /movie still/.test(pageHay);
    photo_evidence[String(pageSpec.photo_id)] = { ...evidence, valid_movie_still_page: valid, wrong_type: wrongType };
    try {
      const bytes = await readFile(join(OUT, evidence.screenshot));
      page_screenshots.push({ key, type: 'photo', path: evidence.screenshot, sha256: sha(bytes), bytes: bytes.length, ...identify(join(OUT, evidence.screenshot)) });
    } catch {}
    if (!valid) continue;
    validPages += 1;
    const pageCandidates = [];
    for (const imageUrl of evidence.image_urls) {
      for (const variant of imageVariants(imageUrl).slice(0, 8)) {
        const result = await downloadVariant(context, pageSpec.url, pageSpec.photo_id, variant, ++index, control.transport_timeout_ms);
        attempted.push(result);
        if (!result.sha256 || result.download_error) continue;
        if (seenHashes.has(result.sha256)) continue;
        seenHashes.add(result.sha256);
        result.repository_matches = repository.get(result.sha256) || [];
        pageCandidates.push(result);
      }
    }
    pageCandidates.sort((a, b) => (b.width * b.height - a.width * a.height) || (b.bytes - a.bytes));
    const selected = pageCandidates[0];
    if (!selected) continue;
    selected.source_page = pageSpec.url;
    selected.page_title = evidence.title;
    selected.page_description = evidence.description;
    selected.page_screenshot = evidence.screenshot;
    selected.disposition = 'visual-second-desk-pending';
    candidates.push(selected);
  }

  assert(validPages >= control.page_contract.minimum_valid_pages, `UC-088 targeted orbit found only ${validPages} valid movie-still page(s)`);
  assert(candidates.length >= control.page_contract.minimum_unique_candidates, `UC-088 targeted orbit retained only ${candidates.length} unique still candidate(s)`);
  candidates.sort((a, b) => a.photo_id - b.photo_id);

  const thumbs = [];
  for (let position = 0; position < candidates.length; position++) {
    const row = candidates[position];
    const thumb = join(OUT, 'thumbs', `${String(position + 1).padStart(2, '0')}-photo-${row.photo_id}.jpg`);
    await mkdir(dirname(thumb), { recursive: true });
    magick(join(OUT, row.local), '-auto-orient', '-thumbnail', '480x360>', '-background', '#171512', '-gravity', 'center', '-extent', '480x360', '-fill', 'white', '-undercolor', '#171512cc', '-gravity', 'south', '-pointsize', '15', '-annotate', '+0+7', `photo ${row.photo_id} · ${row.width}x${row.height}`, '-strip', '-quality', '88', thumb);
    thumbs.push(thumb);
  }
  const contactPath = join(OUT, 'contact-sheet.jpg');
  execFileSync('montage', [...thumbs, '-tile', '3x', '-geometry', '480x360+10+10', '-background', '#e8e3d9', contactPath], { stdio: 'inherit' });
  const contactSheet = { path: 'contact-sheet.jpg', sha256: sha(await readFile(contactPath)), ...identify(contactPath), count: candidates.length };

  const manifest = {
    version: 1,
    lane: 'card-backfill',
    record_id: 'UC-088',
    actor: 'Michael Chiklis',
    character: 'The Thing',
    production: 'Fantastic Four',
    year: 2005,
    side: 'still',
    expected_subject: 'The Thing',
    generated_at: new Date().toISOString(),
    control_sha256: sha(await readFile(CONTROL)),
    selector_artifact: control.selector_artifact,
    scope_artifact: control.scope_artifact,
    failed_broad_discovery: control.failed_broad_discovery,
    repository_hash_count: repository.size,
    role_evidence,
    photo_evidence,
    page_screenshots,
    attempted,
    valid_photo_page_count: validPages,
    candidates,
    candidate_count: candidates.length,
    contact_sheet: contactSheet,
    selection_contract: control.selection_contract,
    disposition: 'candidate-only-pending-visual-second-desk',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-088',
    actor: 'Michael Chiklis',
    character: 'The Thing',
    production: 'Fantastic Four',
    year: 2005,
    valid_photo_page_count: validPages,
    candidate_count: candidates.length,
    candidates,
    contact_sheet: contactSheet,
    canonical_mutation: false
  });
  const cards = candidates.map(row => `<article><img src="${row.local}" alt=""><h2>Movie Insider photo ${row.photo_id}</h2><p>${row.page_title} · ${row.width}×${row.height} · ${row.bytes} bytes</p><code>${row.sha256}</code></article>`).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}article{background:white;padding:10px}article img{width:100%;height:380px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-088 · Michael Chiklis / The Thing · Fantastic Four (2005)</h1><p>Page-addressed movie-still orbit. Visual second desk must select only the transformed practical-suit Thing and reject every other cast member, untransformed Ben Grimm, poster, cover, sequel, reboot, animation, game, and merchandise image.</p><div class="grid">${cards}</div>`);
  console.log(`PASS — UC-088 targeted orbit retained ${candidates.length} unique still candidate(s) from ${validPages} valid page(s)`);
  console.log(`manifest ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`contact ${contactSheet.sha256}`);
  console.log(`artifact ${OUT}`);
} finally {
  await browser.close();
}
