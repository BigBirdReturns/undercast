#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-080-DISCOVER.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-080-discover';
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
  const text = String(value).replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  try { return new URL(text, base).href; } catch { return ''; }
}
function addUrl(rows, seen, row, base) {
  const url = cleanUrl(row.url, base);
  if (!/^https?:\/\//.test(url) || seen.has(url)) return;
  if (/(?:logo|icon|sprite|favicon|pixel|tracking|avatar|badge|rating|privacy|cookie|placeholder|1x1\.gif)/i.test(url)) return;
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
    if (/historicimages\.com$/.test(parsed.hostname) && /_\d+x\./.test(parsed.pathname)) {
      push(parsed.href.replace(/_\d+x\./, '_5000x.'), 'historic-5000x');
      push(parsed.href.replace(/_\d+x\./, '_2048x.'), 'historic-2048x');
      push(parsed.href.replace(/_\d+x\./, '_1200x.'), 'historic-1200x');
    }
  } catch {}
  return rows;
}
async function inspectPage(context, pageSpec) {
  const page = await context.newPage();
  try {
    const response = await page.goto(pageSpec.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(1600);
    for (const label of ['CONTINUE', 'Accept', 'I Accept', 'Agree', 'Allow all']) {
      const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
      if (await button.count().catch(() => 0)) {
        await button.first().click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(400);
      }
    }
    await page.evaluate(() => {
      for (const image of document.querySelectorAll('img')) {
        for (const attr of ['data-src', 'data-lazy-src', 'data-original', 'data-image', 'data-url']) {
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
      await page.waitForTimeout(250);
    }
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content();
    const title = await page.title();
    const hay = norm(body + ' ' + html);
    const missing = pageSpec.required_terms.filter(term => !hay.includes(norm(term)));
    const screenshot = `pages/${pageSpec.key}.png`;
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: true });

    const extracted = await page.evaluate(() => {
      const absolute = value => { try { return new URL(value, document.baseURI).href; } catch { return ''; } };
      const rows = [];
      const add = (url, label, context, origin) => {
        url = absolute(url);
        if (url) rows.push({ url, label: label || '', context: String(context || '').replace(/\s+/g, ' ').slice(0, 3000), origin });
      };
      for (const selector of ['meta[property="og:image"]', 'meta[property="og:image:secure_url"]', 'meta[name="twitter:image"]', 'meta[name="twitter:image:src"]', 'link[rel="image_src"]']) {
        for (const node of document.querySelectorAll(selector)) add(node.content || node.href, node.getAttribute('content') || node.getAttribute('href') || '', document.title, `metadata:${selector}`);
      }
      for (const image of document.images) {
        const values = [image.currentSrc, image.src, image.dataset.src, image.dataset.lazySrc, image.dataset.original, image.dataset.image, image.getAttribute('data-src')].filter(Boolean);
        for (const part of String(image.srcset || image.dataset.srcset || '').split(',')) {
          const value = part.trim().split(/\s+/)[0];
          if (value) values.push(value);
        }
        const figure = image.closest('figure');
        const context = [image.alt, image.title, figure?.querySelector('figcaption')?.textContent, image.closest('article')?.textContent?.slice(0, 1600), image.parentElement?.textContent?.slice(0, 1200), document.title].filter(Boolean).join(' ');
        for (const value of values) add(value, image.alt || image.title || '', context, 'dom-image');
      }
      for (const source of document.querySelectorAll('source')) {
        for (const part of String(source.srcset || source.getAttribute('data-srcset') || '').split(',')) {
          const value = part.trim().split(/\s+/)[0];
          if (value) add(value, '', source.parentElement?.textContent || document.title, 'dom-source');
        }
      }
      for (const entry of performance.getEntriesByType('resource')) {
        const url = String(entry.name || '');
        if (/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url)) add(url, '', document.title, 'performance-resource');
      }
      return rows;
    });
    const rows = [];
    const seen = new Set();
    for (const explicit of pageSpec.explicit_assets || []) addUrl(rows, seen, { url: explicit, label: 'explicit authorized asset', context: body.slice(0, 5000), origin: 'explicit-control' }, page.url());
    for (const row of extracted) addUrl(rows, seen, row, page.url());
    for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'<>\s]+?\.(?:jpe?g|png|webp)(?:\?[^"'<>\s]*)?/gi)) addUrl(rows, seen, { url: match[0], label: '', context: title, origin: 'html-url' }, page.url());
    return {
      evidence: {
        status: 'loaded',
        http_status: response?.status() || null,
        title,
        resolved_url: page.url(),
        required_terms: pageSpec.required_terms,
        required_terms_missing: missing,
        body_text: body.slice(0, 24000),
        screenshot
      },
      rows
    };
  } catch (error) {
    return { evidence: { status: 'error', error: error.message, required_terms: pageSpec.required_terms, required_terms_missing: pageSpec.required_terms }, rows: [] };
  } finally {
    await page.close();
  }
}
async function download(context, pageSpec, row, variant, index) {
  let response;
  try {
    response = await context.request.get(variant.url, {
      headers: { 'User-Agent': UA, Referer: pageSpec.url, Accept: 'image/jpeg,image/webp,image/png,image/*,*/*;q=0.2' },
      timeout: 90000,
      failOnStatusCode: false
    });
  } catch (error) {
    return { page_key: pageSpec.key, provider: pageSpec.provider, source_page: pageSpec.url, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, local_context: row.context || '', download_error: error.message };
  }
  if (!response.ok()) return { page_key: pageSpec.key, provider: pageSpec.provider, source_page: pageSpec.url, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, local_context: row.context || '', download_error: `HTTP ${response.status()}` };
  const bytes = Buffer.from(await response.body());
  const mime = signatureMime(bytes);
  if (bytes.length < 12000 || mime === 'unknown') return { page_key: pageSpec.key, provider: pageSpec.provider, source_page: pageSpec.url, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, local_context: row.context || '', download_error: `unusable ${bytes.length} ${mime}` };
  const local = `candidates/${String(index).padStart(3, '0')}-${slug(pageSpec.key)}-${slug(row.origin)}.${extensionFor(mime)}`;
  const path = join(OUT, local);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  let dimensions = { width: 0, height: 0 };
  try { dimensions = identify(path); } catch {}
  if (dimensions.width < 300 || dimensions.height < 200) return { page_key: pageSpec.key, provider: pageSpec.provider, source_page: pageSpec.url, probe_url: variant.url, probe_kind: variant.kind, resolved_url: response.url() || variant.url, origin: row.origin, local_context: row.context || '', local, mime, bytes: bytes.length, sha256: sha(bytes), ...dimensions, download_error: 'image below 300x200 floor' };
  return {
    page_key: pageSpec.key,
    provider: pageSpec.provider,
    source_page: pageSpec.url,
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
    ...dimensions
  };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-080', 'UC-080 discovery scope drift');
assert(control.actor === 'Louis Gossett Jr.' && control.character === "Jeriba 'Jerry' Shigan" && control.side === 'still', 'UC-080 discovery identity drift');
assert(control.selector_artifact?.artifact_id === 8668928932 && control.scope_artifact?.artifact_id === 8669004707, 'UC-080 discovery custody drift');
assert(control.pages?.length === 8 && control.pages.filter(row => row.strict).length === 3, 'UC-080 discovery source denominator drift');
assert(control.selection_contract?.exact_role_required === true && control.selection_contract?.reject_generic_drac_without_role_binding === true && control.selection_contract?.canonical_mutation === false, 'UC-080 discovery contract drift');

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
    const inspected = await inspectPage(context, pageSpec);
    page_evidence[pageSpec.key] = inspected.evidence;
    if (inspected.evidence?.screenshot) {
      const bytes = await readFile(join(OUT, inspected.evidence.screenshot));
      page_screenshots.push({ page_key: pageSpec.key, provider: pageSpec.provider, path: inspected.evidence.screenshot, sha256: sha(bytes), bytes: bytes.length });
    }
    if (pageSpec.strict) {
      assert(inspected.evidence.status === 'loaded' && inspected.evidence.http_status >= 200 && inspected.evidence.http_status < 400, `${pageSpec.key} required page transport failed`);
      assert(inspected.evidence.required_terms_missing.length === 0, `${pageSpec.key} required page evidence failed: ${inspected.evidence.required_terms_missing.join(', ')}`);
    }
    for (const row of inspected.rows) {
      if (candidates.length >= control.max_candidates) break;
      const localHay = norm([row.label, row.context, row.url, pageSpec.key].join(' '));
      const explicit = row.origin === 'explicit-control';
      if (!explicit && !/(jeriba|shigan|gossett|enemy mine|inimigo meu|drac)/.test(localHay)) continue;
      if (!explicit && /(poster|key art|cover|logo|icon|avatar|related|recommendation)/.test(localHay) && !/(jeriba|shigan|gossett)/.test(localHay)) continue;
      for (const variant of variants(row.url)) {
        if (candidates.length >= control.max_candidates) break;
        const result = await download(context, pageSpec, row, variant, ++index);
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
  assert(candidates.length >= 2, `UC-080 discovery produced only ${candidates.length} usable unique candidates`);
  candidates.sort((a, b) => (b.width * b.height - a.width * a.height) || a.page_key.localeCompare(b.page_key) || a.local.localeCompare(b.local));
  const thumbs = [];
  for (let position = 0; position < candidates.length; position++) {
    const row = candidates[position];
    const thumb = join(OUT, 'thumbs', `${String(position + 1).padStart(2, '0')}.jpg`);
    await mkdir(dirname(thumb), { recursive: true });
    magick(
      join(OUT, row.local),
      '-auto-orient',
      '-thumbnail', '480x360>',
      '-background', '#171512',
      '-gravity', 'center',
      '-extent', '480x360',
      '-fill', 'white',
      '-undercolor', '#171512cc',
      '-gravity', 'south',
      '-pointsize', '13',
      '-annotate', '+0+5', `${String(position + 1).padStart(2, '0')} ${row.page_key} ${row.width}x${row.height}`,
      '-strip',
      '-quality', '88',
      thumb
    );
    thumbs.push(thumb);
  }
  const contact = join(OUT, 'contact-sheet.jpg');
  execFileSync('montage', [...thumbs, '-tile', '3x', '-geometry', '480x360+10+10', '-background', '#e8e3d9', contact], { stdio: 'inherit' });
  const manifest = {
    version: 1,
    lane: 'card-backfill',
    record_id: 'UC-080',
    actor: 'Louis Gossett Jr.',
    character: "Jeriba 'Jerry' Shigan",
    production: 'Enemy Mine',
    year: 1985,
    side: 'still',
    expected_subject: "Jeriba 'Jerry' Shigan",
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
    contact_sheet: { path: 'contact-sheet.jpg', sha256: sha(await readFile(contact)), ...identify(contact) },
    selection_contract: control.selection_contract,
    disposition: 'candidate-only-pending-visual-selection',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-080',
    actor: 'Louis Gossett Jr.',
    character: "Jeriba 'Jerry' Shigan",
    candidate_count: candidates.length,
    candidates: candidates.map(({ page_key, provider, source_page, probe_url, probe_kind, resolved_url, origin, label, local_context, local, mime, bytes, sha256, width, height, repository_matches }) => ({ page_key, provider, source_page, probe_url, probe_kind, resolved_url, origin, label, local_context, local, mime, bytes, sha256, width, height, repository_matches })),
    contact_sheet: manifest.contact_sheet,
    canonical_mutation: false
  });
  const cards = candidates.map((row, position) => `<article><img src="${row.local}" alt=""><h2>${position + 1} · ${row.page_key}</h2><p>${row.provider} · ${row.width}×${row.height} · ${row.bytes} bytes</p><p>${String(row.local_context || '').slice(0, 600)}</p><p>${row.repository_matches.length ? `duplicate: ${row.repository_matches.join(', ')}` : 'no exact canonical duplicate'}</p><code>${row.sha256}</code></article>`).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}article{background:white;padding:10px}article img{width:100%;height:360px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-080 · Louis Gossett Jr. / Jeriba Shigan</h1><p>Candidate-only. Approve only the transformed Jeriba role. Reject untransformed Gossett, Davidge, Zammis, generic Dracs, posters, illustrations, merchandise, and watermarked final sources.</p><div class="grid">${cards}</div>`);
  console.log(`PASS — UC-080 exact-role discovery retained ${candidates.length} candidate(s)`);
  console.log(`manifest ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`contact ${manifest.contact_sheet.sha256}`);
  console.log(`artifact ${OUT}`);
} finally {
  await browser.close();
}
