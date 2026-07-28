#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-111-DISCOVER.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-111-discover';
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
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
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
  const text = String(value).replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').replace(/["'<>]+$/g, '');
  try { return new URL(text, base).href; } catch { return ''; }
}
function variants(url) {
  const rows = [];
  const push = (value, kind) => {
    if (value && !rows.some(row => row.url === value)) rows.push({ url: value, kind });
  };
  push(url, 'page-delivery');
  try {
    const noQuery = new URL(url);
    noQuery.search = '';
    push(noQuery.href, 'unparameterized');
  } catch {}
  return rows;
}
async function navigateWithFallback(context, page, url, timeout) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    return { response, transport: 'browser-navigation' };
  } catch (browserError) {
    const response = await context.request.get(url, { headers: { 'User-Agent': UA }, timeout, failOnStatusCode: false });
    if (!response.ok()) throw browserError;
    const html = await response.text();
    const base = `<base href="${url}">`;
    const patched = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : `${base}${html}`;
    await page.setContent(patched, { waitUntil: 'domcontentloaded', timeout });
    return { response, transport: 'request-fallback' };
  }
}
async function inspectPage(context, pageSpec) {
  const page = await context.newPage();
  const screenshot = `pages/${pageSpec.key}.png`;
  try {
    const { response, transport } = await navigateWithFallback(context, page, pageSpec.url, control.transport_timeout_ms);
    await page.waitForTimeout(1200);
    for (const label of ['CONTINUE','Accept','I Accept','Agree','Allow all','Accept All']) {
      const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
      if (await button.count().catch(() => 0)) {
        await button.first().click({ timeout: 1200 }).catch(() => {});
        await page.waitForTimeout(300);
      }
    }
    await page.evaluate(() => {
      for (const image of document.querySelectorAll('img')) {
        for (const attr of ['data-src','data-lazy-src','data-original','data-image','data-url','data-full','data-large']) {
          const value = image.getAttribute(attr);
          if (value && !image.src) image.src = value;
        }
        const srcset = image.getAttribute('data-srcset');
        if (srcset && !image.srcset) image.srcset = srcset;
      }
    }).catch(() => {});
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(220);
    }
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content();
    const title = await page.title();
    const hay = norm(`${body} ${html}`);
    const missing = pageSpec.required_terms.filter(term => !hay.includes(norm(term)));
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: true }).catch(async () => {
      await page.screenshot({ path: join(OUT, screenshot), fullPage: false });
    });
    const screenshotBytes = await readFile(join(OUT, screenshot));
    const extracted = await page.evaluate(({ captionPhrase }) => {
      const absolute = value => { try { return new URL(value, document.baseURI).href; } catch { return ''; } };
      const rows = [];
      const add = (url, label, context, origin) => {
        url = absolute(url);
        if (!url) return;
        rows.push({ url, label: label || '', context: String(context || '').replace(/\s+/g, ' ').slice(0, 5000), origin });
      };
      for (const selector of ['meta[property="og:image"]','meta[property="og:image:secure_url"]','meta[name="twitter:image"]','meta[name="twitter:image:src"]','link[rel="image_src"]']) {
        for (const node of document.querySelectorAll(selector)) add(node.content || node.href, node.getAttribute('content') || node.getAttribute('href') || '', document.title, `metadata:${selector}`);
      }
      for (const image of document.images) {
        const values = [image.currentSrc,image.src,image.dataset.src,image.dataset.lazySrc,image.dataset.original,image.dataset.image,image.dataset.url,image.dataset.full,image.dataset.large].filter(Boolean);
        for (const part of String(image.srcset || image.dataset.srcset || '').split(',')) {
          const value = part.trim().split(/\s+/)[0];
          if (value) values.push(value);
        }
        let current = image;
        const contextBits = [image.alt,image.title];
        for (let depth = 0; depth < 6 && current; depth++, current = current.parentElement) {
          const text = String(current.textContent || '').replace(/\s+/g, ' ').trim();
          if (text) contextBits.push(text.slice(0, 2500));
          if (captionPhrase && text.toLowerCase().includes(String(captionPhrase).toLowerCase())) break;
        }
        for (const value of values) add(value, image.alt || image.title || '', contextBits.join(' '), 'dom-image');
      }
      for (const link of document.querySelectorAll('a[href]')) {
        const href = link.href;
        if (/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(href)) add(href, link.textContent || '', link.closest('td,figure,div,body')?.textContent || document.title, 'image-link');
      }
      for (const node of document.querySelectorAll('[style*="background"]')) {
        const style = getComputedStyle(node).backgroundImage;
        for (const match of String(style || '').matchAll(/url\(["']?([^"')]+)["']?\)/g)) add(match[1], node.getAttribute('aria-label') || '', node.textContent || document.title, 'background-image');
      }
      for (const entry of performance.getEntriesByType('resource')) {
        const url = String(entry.name || '');
        if (/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url)) add(url, '', document.title, 'performance-resource');
      }
      for (const match of String(document.documentElement.outerHTML || '').matchAll(/(?:src|href)=["']([^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi)) add(match[1], '', document.title, 'html-attribute');
      return rows;
    }, { captionPhrase: pageSpec.caption_phrase || '' }).catch(() => []);
    const rows = [];
    const seen = new Set();
    for (const row of extracted) {
      const url = cleanUrl(row.url, page.url() || pageSpec.url);
      if (!/^https?:\/\//.test(url) || seen.has(url)) continue;
      if (/(?:logo|icon|sprite|favicon|pixel|tracking|avatar|badge|rating|privacy|cookie|button|scroll_|close\.|spacer|clear\.|1x1)/i.test(url)) continue;
      seen.add(url);
      rows.push({ ...row, url });
    }
    for (const url of pageSpec.legacy_asset_probes || []) {
      if (!seen.has(url)) rows.push({ url, label: pageSpec.caption_phrase || '', context: body.slice(0, 5000), origin: 'legacy-probe' });
    }
    return {
      evidence: {
        status: 'loaded',
        http_status: response?.status?.() || response?.status || null,
        transport,
        title,
        resolved_url: page.url() || pageSpec.url,
        required_terms: pageSpec.required_terms,
        required_terms_missing: missing,
        body_text: body.slice(0, 40000),
        screenshot,
        screenshot_sha256: sha(screenshotBytes),
        screenshot_bytes: screenshotBytes.length,
        screenshot_geometry: identify(join(OUT, screenshot)),
        caption_phrase: pageSpec.caption_phrase || null,
        extracted_image_count: rows.length
      },
      rows
    };
  } catch (error) {
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: false }).catch(() => {});
    return {
      evidence: { status: 'error', error: error.message, required_terms: pageSpec.required_terms, required_terms_missing: pageSpec.required_terms, screenshot, caption_phrase: pageSpec.caption_phrase || null, extracted_image_count: 0 },
      rows: []
    };
  } finally {
    await page.close();
  }
}
async function downloadCandidate(context, pageSpec, row, variant, index) {
  let response;
  try {
    response = await context.request.get(variant.url, {
      headers: { 'User-Agent': UA, Referer: pageSpec.url, Accept: 'image/jpeg,image/webp,image/png,image/*,*/*;q=0.2' },
      timeout: control.transport_timeout_ms,
      failOnStatusCode: false
    });
  } catch (error) {
    return { page_key: pageSpec.key, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, download_error: error.message };
  }
  if (!response.ok()) return { page_key: pageSpec.key, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, download_error: `HTTP ${response.status()}` };
  const bytes = Buffer.from(await response.body());
  const mime = signatureMime(bytes);
  if (bytes.length < 10000 || mime === 'unknown') return { page_key: pageSpec.key, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, download_error: `unusable ${bytes.length} ${mime}` };
  const local = `candidates/${String(index).padStart(3, '0')}-${slug(pageSpec.key)}-${slug(row.origin)}-${slug(variant.kind)}.${extensionFor(mime)}`;
  const path = join(OUT, local);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  let dimensions = { width: 0, height: 0 };
  try { dimensions = identify(path); } catch {}
  const captionLocal = norm(`${row.label} ${row.context}`).includes(norm(pageSpec.caption_phrase || '')) || row.origin === 'legacy-probe';
  if (dimensions.width < 400 || dimensions.height < 250 || !captionLocal) {
    return {
      page_key: pageSpec.key,
      provider: pageSpec.provider,
      source_page: pageSpec.url,
      caption_phrase: pageSpec.caption_phrase || null,
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
      caption_local: captionLocal,
      download_error: dimensions.width < 400 || dimensions.height < 250 ? 'image below 400x250 floor' : 'image not caption-local'
    };
  }
  return {
    page_key: pageSpec.key,
    provider: pageSpec.provider,
    source_page: pageSpec.url,
    caption_phrase: pageSpec.caption_phrase,
    admission_class: pageSpec.admission_lane,
    expected_subject: control.expected_subject,
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
    caption_local: true
  };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-111', 'UC-111 discovery scope drift');
assert(control.actor === 'Deep Roy' && control.character === 'The Oompa Loompas' && control.production === 'Charlie and the Chocolate Factory' && control.year === 2005 && control.side === 'still', 'UC-111 discovery identity drift');
assert(control.selector_artifact?.artifact_id === 8675638059 && control.scope_artifact?.artifact_id === 8675683603, 'UC-111 discovery custody drift');
assert(control.pages?.length === 3 && control.pages.filter(page => page.strict).length === 3, 'UC-111 page denominator drift');
assert(control.pages.filter(page => page.admission_lane === 'collective-final-frame').length === 1 && control.minimum_collective_candidates === 1, 'UC-111 collective candidate denominator drift');
assert(control.selection_contract?.exact_2005_burton_oompa_loompas_required === true && control.selection_contract?.collective_many_body_frame_required === true && control.selection_contract?.deep_roy_entire_population_binding_required === true && control.selection_contract?.single_isolated_body_insufficient_for_final_candidate === true && control.selection_contract?.canonical_mutation === false, 'UC-111 selection contract drift');
await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US', ignoreHTTPSErrors: true });
try {
  const page_evidence = {};
  const page_screenshots = [];
  const attempted = [];
  const candidates = [];
  const seenHashes = new Set();
  let index = 0;
  for (const pageSpec of control.pages) {
    const inspected = await inspectPage(context, pageSpec);
    page_evidence[pageSpec.key] = inspected.evidence;
    if (inspected.evidence.screenshot_sha256) {
      page_screenshots.push({
        key: pageSpec.key,
        provider: pageSpec.provider,
        path: inspected.evidence.screenshot,
        sha256: inspected.evidence.screenshot_sha256,
        bytes: inspected.evidence.screenshot_bytes,
        ...inspected.evidence.screenshot_geometry
      });
    }
    if (pageSpec.strict) {
      assert(inspected.evidence.status === 'loaded' && inspected.evidence.http_status >= 200 && inspected.evidence.http_status < 400, `${pageSpec.key} transport failed`);
      assert(inspected.evidence.required_terms_missing.length === 0, `${pageSpec.key} required terms missing: ${inspected.evidence.required_terms_missing.join(', ')}`);
    }
    if (pageSpec.admission_lane !== 'collective-final-frame') continue;
    for (const row of inspected.rows) {
      for (const variant of variants(row.url)) {
        const result = await downloadCandidate(context, pageSpec, row, variant, ++index);
        attempted.push(result);
        if (!result.sha256 || result.download_error) continue;
        if (seenHashes.has(result.sha256)) {
          result.visual_byte_duplicate = true;
          continue;
        }
        seenHashes.add(result.sha256);
        result.repository_matches = repository.get(result.sha256) || [];
        candidates.push(result);
      }
    }
  }
  assert(candidates.length >= control.minimum_collective_candidates, `UC-111 discovery produced only ${candidates.length} collective candidate(s)`);
  candidates.sort((a, b) => (b.width * b.height - a.width * a.height) || (b.bytes - a.bytes) || a.local.localeCompare(b.local));
  const thumbs = [];
  for (let position = 0; position < candidates.length; position++) {
    const row = candidates[position];
    const thumb = join(OUT, 'thumbs', `${String(position + 1).padStart(2, '0')}-${slug(row.page_key)}.jpg`);
    await mkdir(dirname(thumb), { recursive: true });
    magick(join(OUT, row.local), '-auto-orient', '-thumbnail', '640x420>', '-background', '#171512', '-gravity', 'center', '-extent', '640x420', '-fill', 'white', '-undercolor', '#171512cc', '-gravity', 'south', '-pointsize', '15', '-annotate', '+0+7', `${position + 1} · ${row.width}x${row.height} · ${row.origin}`, '-strip', '-quality', '88', thumb);
    thumbs.push(thumb);
  }
  const contactPath = join(OUT, 'contact-sheet-collective.jpg');
  execFileSync('montage', [...thumbs, '-tile', '2x', '-geometry', '640x420+10+10', '-background', '#e8e3d9', contactPath], { stdio: 'inherit' });
  const contactSheet = { path: 'contact-sheet-collective.jpg', sha256: sha(await readFile(contactPath)), ...identify(contactPath), count: candidates.length };
  const manifest = {
    version: 1,
    lane: 'card-backfill',
    record_id: 'UC-111',
    actor: 'Deep Roy',
    character: 'The Oompa Loompas',
    production: 'Charlie and the Chocolate Factory',
    year: 2005,
    side: 'still',
    expected_subject: 'The Oompa Loompas',
    generated_at: new Date().toISOString(),
    control_sha256: sha(await readFile(CONTROL)),
    selector_artifact: control.selector_artifact,
    scope_artifact: control.scope_artifact,
    repository_hash_count: repository.size,
    page_evidence,
    page_screenshots,
    attempted,
    candidates,
    candidate_count: candidates.length,
    contact_sheet: contactSheet,
    selection_contract: control.selection_contract,
    disposition: 'collective-candidate-only-pending-visual-second-desk',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-111',
    actor: 'Deep Roy',
    character: 'The Oompa Loompas',
    production: 'Charlie and the Chocolate Factory',
    year: 2005,
    candidate_count: candidates.length,
    candidates,
    contact_sheet: contactSheet,
    page_receipts: page_screenshots,
    collective_many_body_display_required: true,
    single_isolated_body_insufficient: true,
    canonical_mutation: false
  });
  const cards = candidates.map((row, i) => `<article><img src="${row.local}" alt=""><h2>${i + 1}. ${row.width}×${row.height}</h2><p>${row.provider} · ${row.origin} · ${row.probe_kind}</p><p>${row.caption_phrase}</p><code>${row.sha256}</code></article>`).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:12px}article{background:white;padding:10px}article img{width:100%;height:460px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-111 · Deep Roy / The Oompa Loompas · Charlie and the Chocolate Factory (2005)</h1><p>The final card must show the authored collective mechanism. A single isolated Oompa Loompa cannot satisfy this checkpoint.</p><div class="grid">${cards}</div>`);
  console.log(`PASS — UC-111 discovery retained ${candidates.length} caption-local collective candidate(s)`);
  console.log(`manifest ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`summary ${sha(await readFile(join(OUT, 'summary.json')))}`);
  console.log(`contact ${contactSheet.sha256}`);
  console.log(`artifact ${OUT}`);
} finally {
  await browser.close();
}
