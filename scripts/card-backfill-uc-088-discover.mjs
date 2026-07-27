#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-088-DISCOVER.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-088-discover';
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
const slug = value => norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
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
  const text = String(value)
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/["'<>]+$/g, '');
  try { return new URL(text, base).href; } catch { return ''; }
}
function addUrl(rows, seen, row, base) {
  const url = cleanUrl(row.url, base);
  if (!/^https?:\/\//.test(url) || seen.has(url)) return;
  if (/(?:logo|icon|sprite|favicon|pixel|tracking|avatar|badge|rating|privacy|cookie|placeholder|1x1\.gif|doubleclick|google-analytics|scorecardresearch|gravatar)/i.test(url)) return;
  seen.add(url);
  rows.push({ ...row, url });
}
function variants(url) {
  const rows = [];
  const push = (value, kind) => {
    if (value && !rows.some(row => row.url === value)) rows.push({ url: value, kind });
  };
  push(url, 'page-delivery');
  try {
    const parsed = new URL(url);
    const noQuery = new URL(url);
    noQuery.search = '';
    push(noQuery.href, 'unparameterized');
    if (parsed.hostname === 'm.media-amazon.com' && /_V1_/.test(parsed.pathname)) {
      push(parsed.href.replace(/_V1_[^/]*\.(?:jpg|jpeg|png|webp)(?:\?.*)?$/i, '_V1_.jpg'), 'imdb-original-probe');
    }
    const wordpressOriginal = parsed.href.replace(/-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|webp)(?:\?|$))/i, '');
    push(wordpressOriginal, 'wordpress-original-probe');
    for (const key of ['width', 'height', 'w', 'h', 'quality', 'q', 'format', 'fit', 'crop']) {
      if (!parsed.searchParams.has(key)) continue;
      const copy = new URL(url);
      copy.searchParams.delete(key);
      push(copy.href, `without-${key}`);
    }
  } catch {}
  return rows;
}

async function inspectPage(context, pageSpec, timeout) {
  const page = await context.newPage();
  const screenshot = `pages/${pageSpec.key}.png`;
  try {
    const response = await page.goto(pageSpec.url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(1400);
    for (const label of ['CONTINUE', 'Accept', 'I Accept', 'Agree', 'Allow all', 'Accept All']) {
      const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
      if (await button.count().catch(() => 0)) {
        await button.first().click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(350);
      }
    }
    await page.evaluate(() => {
      for (const image of document.querySelectorAll('img')) {
        for (const attr of ['data-src', 'data-lazy-src', 'data-original', 'data-image', 'data-url', 'data-src-large', 'data-full']) {
          const value = image.getAttribute(attr);
          if (value && !image.src) image.src = value;
        }
        const srcset = image.getAttribute('data-srcset');
        if (srcset && !image.srcset) image.srcset = srcset;
      }
      for (const source of document.querySelectorAll('source')) {
        const srcset = source.getAttribute('data-srcset');
        if (srcset && !source.srcset) source.srcset = srcset;
      }
    }).catch(() => {});
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 1600);
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(500);
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content();
    const title = await page.title();
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: true }).catch(async () => {
      await page.screenshot({ path: join(OUT, screenshot), fullPage: false }).catch(() => {});
    });
    const extracted = await page.evaluate(() => {
      const absolute = value => { try { return new URL(value, document.baseURI).href; } catch { return ''; } };
      const rows = [];
      const add = (url, label, context, origin) => {
        url = absolute(url);
        if (url) rows.push({ url, label: label || '', context: String(context || '').replace(/\s+/g, ' ').slice(0, 3500), origin });
      };
      for (const selector of ['meta[property="og:image"]', 'meta[property="og:image:secure_url"]', 'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]', 'link[rel="image_src"]']) {
        for (const node of document.querySelectorAll(selector)) add(node.content || node.href, node.getAttribute('content') || node.getAttribute('href') || '', document.title, `metadata:${selector}`);
      }
      for (const image of document.images) {
        const values = [image.currentSrc, image.src, image.dataset.src, image.dataset.lazySrc, image.dataset.original, image.dataset.image, image.dataset.url, image.dataset.srcLarge, image.dataset.full, image.getAttribute('data-src')].filter(Boolean);
        for (const part of String(image.srcset || image.dataset.srcset || '').split(',')) {
          const value = part.trim().split(/\s+/)[0];
          if (value) values.push(value);
        }
        const figure = image.closest('figure');
        const article = image.closest('article,main,section,li,div');
        const context = [image.alt, image.title, figure?.querySelector('figcaption')?.textContent, article?.textContent?.slice(0, 2400), document.title].filter(Boolean).join(' ');
        for (const value of values) add(value, image.alt || image.title || '', context, 'dom-image');
      }
      for (const source of document.querySelectorAll('source')) {
        for (const part of String(source.srcset || source.getAttribute('data-srcset') || '').split(',')) {
          const value = part.trim().split(/\s+/)[0];
          if (value) add(value, '', source.parentElement?.textContent || document.title, 'dom-source');
        }
      }
      for (const node of document.querySelectorAll('[style*="background"]')) {
        const style = getComputedStyle(node).backgroundImage;
        for (const match of String(style || '').matchAll(/url\(["']?([^"')]+)["']?\)/g)) add(match[1], node.getAttribute('aria-label') || '', node.textContent || document.title, 'background-image');
      }
      const visitJson = (value, context = '') => {
        if (!value) return;
        if (Array.isArray(value)) { for (const item of value) visitJson(item, context); return; }
        if (typeof value === 'string') {
          if (/^https?:\/\//i.test(value) && /(?:image|jpg|jpeg|png|webp|media-amazon|movieinsider|superherohype)/i.test(value)) add(value, '', context || document.title, 'json-ld');
          return;
        }
        if (typeof value !== 'object') return;
        const nextContext = [context, value.name, value.caption, value.description, value.headline].filter(Boolean).join(' ');
        for (const [key, child] of Object.entries(value)) {
          if (/(?:image|thumbnail|contentUrl|url)/i.test(key)) visitJson(child, nextContext);
          else if (typeof child === 'object') visitJson(child, nextContext);
        }
      };
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try { visitJson(JSON.parse(script.textContent || ''), document.title); } catch {}
      }
      for (const entry of performance.getEntriesByType('resource')) {
        const url = String(entry.name || '');
        if (/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url)) add(url, '', document.title, 'performance-resource');
      }
      return rows;
    }).catch(() => []);
    return { status: 'loaded', http_status: response?.status() || null, title, resolved_url: page.url(), body, html, screenshot, rows: extracted };
  } catch (error) {
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: false }).catch(() => {});
    return { status: 'error', error: error.message, http_status: null, title: '', resolved_url: page.url(), body: '', html: '', screenshot, rows: [] };
  } finally {
    await page.close();
  }
}

function classify(pageSpec, row) {
  const hay = norm([row.label, row.context, row.url].join(' '));
  if (/(fantastic four rise of the silver surfer|silver surfer|2007|fant4stic|2015|jamie bell|first steps|2025|ebon moss|comic|animation|animated|video game|game render|funko|lego|action figure|toy|merchandise|poster|key art|dvd cover|soundtrack cover|fan art|cosplay)/.test(hay)) {
    return { admission_class: 'rejected', reason: 'wrong production or non-film derivative' };
  }
  if (/(michael chiklis|the thing|ben grimm|benjamin grimm)/.test(hay) && /(fantastic four|tt0120667|thing picture|thing costume)/.test(hay)) {
    return { admission_class: 'final', reason: '2005 Michael Chiklis Thing-local image context' };
  }
  if (pageSpec.admission_lane === 'role-record') return { admission_class: 'role-record', reason: 'text-only production and cast custody' };
  if (pageSpec.admission_lane === 'final' && /(fantastic four|thing)/.test(hay)) return { admission_class: 'unresolved', reason: '2005 page association without image-local Michael Chiklis role binding' };
  return { admission_class: 'unresolved', reason: 'image-local role or production context unresolved' };
}

async function downloadCandidate(context, pageSpec, row, variant, index, timeout) {
  let response;
  try {
    response = await context.request.get(variant.url, {
      headers: { 'User-Agent': UA, Referer: pageSpec.url, Accept: 'image/jpeg,image/webp,image/png,image/*,*/*;q=0.2' },
      timeout,
      failOnStatusCode: false
    });
  } catch (error) {
    return { page_key: pageSpec.key, provider: pageSpec.provider, source_page: pageSpec.url, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, local_context: row.context || '', download_error: error.message };
  }
  if (!response.ok()) return { page_key: pageSpec.key, provider: pageSpec.provider, source_page: pageSpec.url, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, local_context: row.context || '', download_error: `HTTP ${response.status()}` };
  const bytes = Buffer.from(await response.body());
  const mime = signatureMime(bytes);
  if (bytes.length < 12000 || mime === 'unknown') return { page_key: pageSpec.key, provider: pageSpec.provider, source_page: pageSpec.url, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, local_context: row.context || '', download_error: `unusable ${bytes.length} ${mime}` };
  const classification = classify(pageSpec, row);
  const local = `candidates/${String(index).padStart(3, '0')}-${slug(pageSpec.key)}-${slug(classification.admission_class)}-${slug(row.origin)}.${extensionFor(mime)}`;
  const path = join(OUT, local);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  let dimensions = { width: 0, height: 0 };
  try { dimensions = identify(path); } catch {}
  if (dimensions.width < 300 || dimensions.height < 200) return { page_key: pageSpec.key, provider: pageSpec.provider, source_page: pageSpec.url, probe_url: variant.url, probe_kind: variant.kind, resolved_url: response.url() || variant.url, origin: row.origin, local_context: row.context || '', local, mime, bytes: bytes.length, sha256: sha(bytes), ...dimensions, ...classification, download_error: 'image below 300x200 floor' };
  return {
    page_key: pageSpec.key,
    provider: pageSpec.provider,
    source_page: pageSpec.url,
    page_admission_lane: pageSpec.admission_lane,
    probe_url: variant.url,
    probe_kind: variant.kind,
    resolved_url: response.url() || variant.url,
    origin: row.origin,
    label: row.label || '',
    local_context: row.context || '',
    local,
    mime,
    bytes: bytes.length,
    sha256: sha(bytes),
    ...dimensions,
    ...classification
  };
}

async function makeContactSheet(rows, basename, heading) {
  if (!rows.length) return null;
  const thumbs = [];
  for (let position = 0; position < rows.length; position++) {
    const row = rows[position];
    const thumb = join(OUT, 'thumbs', `${basename}-${String(position + 1).padStart(3, '0')}.jpg`);
    await mkdir(dirname(thumb), { recursive: true });
    magick(join(OUT, row.local), '-auto-orient', '-thumbnail', '480x360>', '-background', '#171512', '-gravity', 'center', '-extent', '480x360', '-fill', 'white', '-undercolor', '#171512cc', '-gravity', 'south', '-pointsize', '13', '-annotate', '+0+5', `${String(position + 1).padStart(2, '0')} ${row.page_key} ${row.width}x${row.height}`, '-strip', '-quality', '88', thumb);
    thumbs.push(thumb);
  }
  const path = join(OUT, `${basename}.jpg`);
  execFileSync('montage', [...thumbs, '-tile', '3x', '-geometry', '480x360+10+10', '-background', '#e8e3d9', path], { stdio: 'inherit' });
  return { path: `${basename}.jpg`, heading, sha256: sha(await readFile(path)), ...identify(path), count: rows.length };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-088', 'UC-088 discovery scope drift');
assert(control.actor === 'Michael Chiklis' && control.character === 'The Thing' && control.production === 'Fantastic Four' && control.year === 2005 && control.side === 'still', 'UC-088 discovery identity drift');
assert(control.selector_artifact?.artifact_id === 8671229850 && control.scope_artifact?.artifact_id === 8671280407, 'UC-088 discovery custody drift');
assert(control.pages?.length === 13 && control.pages.filter(row => row.strict).length === 5, 'UC-088 source denominator drift');
assert(control.selection_contract?.exact_2005_live_action_role_required === true && control.selection_contract?.reject_2007_sequel_substitution === true && control.selection_contract?.reject_2015_thing_substitution === true && control.selection_contract?.canonical_mutation === false, 'UC-088 selection contract drift');

await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US' });
try {
  const page_evidence = {};
  const page_screenshots = [];
  const attempted = [];
  const candidates = [];
  const seenHashes = new Set();
  let index = 0;

  for (const pageSpec of control.pages) {
    const inspected = await inspectPage(context, pageSpec, control.transport_timeout_ms);
    const combinedText = [inspected.body, inspected.html].filter(Boolean).join(' ');
    const missing = pageSpec.required_terms.filter(term => !norm(combinedText).includes(norm(term)));
    page_evidence[pageSpec.key] = {
      status: inspected.status,
      http_status: inspected.http_status,
      title: inspected.title,
      resolved_url: inspected.resolved_url,
      error: inspected.error || null,
      admission_lane: pageSpec.admission_lane,
      required_terms: pageSpec.required_terms,
      required_terms_missing: missing,
      body_text: String(inspected.body || '').slice(0, 32000),
      screenshot: inspected.screenshot
    };
    if (inspected.screenshot) {
      try {
        const bytes = await readFile(join(OUT, inspected.screenshot));
        page_screenshots.push({ page_key: pageSpec.key, provider: pageSpec.provider, path: inspected.screenshot, sha256: sha(bytes), bytes: bytes.length, ...identify(join(OUT, inspected.screenshot)) });
      } catch {}
    }
    if (pageSpec.strict) {
      assert(inspected.status === 'loaded' && inspected.http_status >= 200 && inspected.http_status < 400, `${pageSpec.key} page transport failed`);
      assert(missing.length === 0, `${pageSpec.key} page evidence failed: ${missing.join(', ')}`);
    }
    if (pageSpec.max_candidates === 0) continue;

    const rows = [];
    const seenUrls = new Set();
    for (const row of inspected.rows || []) addUrl(rows, seenUrls, row, inspected.resolved_url || pageSpec.url);
    for (const match of String(inspected.html || '').matchAll(/https?:\\?\/\\?\/[^"'<>\s]+?\.(?:jpe?g|png|webp)(?:\?[^"'<>\s]*)?/gi)) {
      addUrl(rows, seenUrls, { url: match[0], label: '', context: inspected.title || '', origin: 'html-url' }, pageSpec.url);
    }

    let acceptedForPage = 0;
    for (const row of rows) {
      if (candidates.length >= control.max_candidates || acceptedForPage >= pageSpec.max_candidates) break;
      const localHay = norm([row.label, row.context, row.url].join(' '));
      if (!/(fantastic four|michael chiklis|the thing|ben grimm|benjamin grimm|tt0120667)/.test(localHay)) continue;
      for (const variant of variants(row.url).slice(0, control.max_variants_per_url)) {
        if (candidates.length >= control.max_candidates || acceptedForPage >= pageSpec.max_candidates) break;
        const result = await downloadCandidate(context, pageSpec, row, variant, ++index, control.transport_timeout_ms);
        attempted.push(result);
        if (!result.sha256 || result.download_error) continue;
        if (seenHashes.has(result.sha256)) {
          result.visual_byte_duplicate = true;
          continue;
        }
        seenHashes.add(result.sha256);
        result.repository_matches = repository.get(result.sha256) || [];
        candidates.push(result);
        acceptedForPage += 1;
      }
    }
  }

  const finalCandidates = candidates.filter(row => row.admission_class === 'final');
  const unresolvedCandidates = candidates.filter(row => row.admission_class === 'unresolved');
  const rejectedCandidates = candidates.filter(row => row.admission_class === 'rejected');
  assert(finalCandidates.length >= 3, `UC-088 discovery produced only ${finalCandidates.length} exact-role final candidate(s)`);
  const afi = page_evidence['afi-production-cast'];
  assert(afi?.status === 'loaded' && afi.required_terms_missing.length === 0, 'AFI production and cast receipt missing');

  const sorter = (a, b) => (b.width * b.height - a.width * a.height) || a.page_key.localeCompare(b.page_key) || a.local.localeCompare(b.local);
  candidates.sort(sorter);
  finalCandidates.sort(sorter);
  unresolvedCandidates.sort(sorter);
  rejectedCandidates.sort(sorter);

  const contact_sheets = {
    final: await makeContactSheet(finalCandidates, 'contact-sheet-final', 'Exact 2005 Michael Chiklis Thing candidates'),
    unresolved: await makeContactSheet(unresolvedCandidates, 'contact-sheet-unresolved', '2005 publicity images requiring visual role resolution'),
    rejected: await makeContactSheet(rejectedCandidates, 'contact-sheet-rejected', 'Wrong-production or derivative images retained for rejection custody')
  };
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
    repository_hash_count: repository.size,
    page_evidence,
    page_screenshots,
    attempted,
    candidates,
    counts: { total: candidates.length, final: finalCandidates.length, unresolved: unresolvedCandidates.length, rejected: rejectedCandidates.length },
    contact_sheets,
    selection_contract: control.selection_contract,
    disposition: 'candidate-only-pending-visual-selection',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  const mapRow = ({ page_key, provider, source_page, probe_url, probe_kind, resolved_url, origin, label, local_context, local, mime, bytes, sha256, width, height, repository_matches, admission_class, reason }) => ({ page_key, provider, source_page, probe_url, probe_kind, resolved_url, origin, label, local_context, local, mime, bytes, sha256, width, height, repository_matches, admission_class, reason });
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-088',
    actor: 'Michael Chiklis',
    character: 'The Thing',
    production: 'Fantastic Four',
    year: 2005,
    counts: manifest.counts,
    final_candidates: finalCandidates.map(mapRow),
    unresolved_candidates: unresolvedCandidates.map(mapRow),
    rejected_candidates: rejectedCandidates.map(mapRow),
    contact_sheets,
    canonical_mutation: false
  });
  const cards = candidates.map((row, position) => `<article data-class="${row.admission_class}"><img src="${row.local}" alt=""><h2>${position + 1} · ${row.admission_class} · ${row.page_key}</h2><p>${row.provider} · ${row.width}×${row.height} · ${row.bytes} bytes</p><p>${String(row.local_context || '').slice(0, 700)}</p><p>${row.reason}</p><p>${row.repository_matches.length ? `duplicate: ${row.repository_matches.join(', ')}` : 'no exact canonical duplicate'}</p><code>${row.sha256}</code></article>`).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}article{background:white;padding:10px;border-top:6px solid #555}article[data-class="final"]{border-color:#25834b}article[data-class="unresolved"]{border-color:#a87818}article[data-class="rejected"]{border-color:#9a3131}article img{width:100%;height:360px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-088 · Michael Chiklis / The Thing · Fantastic Four (2005)</h1><p>Candidate-only. Green: exact-role image-local context. Amber: visual resolution required. Red: wrong production or derivative. Reject 2007, 2015, 2025, untransformed Chiklis, comics, animation, games, merchandise, and posters.</p><div class="grid">${cards}</div>`);
  console.log(`PASS — UC-088 discovery retained ${candidates.length} unique image(s)`);
  console.log(`final ${finalCandidates.length}; unresolved ${unresolvedCandidates.length}; rejected ${rejectedCandidates.length}`);
  console.log(`manifest ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`final contact ${contact_sheets.final?.sha256 || 'none'}`);
  console.log(`artifact ${OUT}`);
} finally {
  await browser.close();
}
