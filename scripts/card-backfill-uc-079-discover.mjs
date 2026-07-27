#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-079.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-079-discover';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha = value => createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/[^a-zA-Z0-9']+/g, ' ').trim().toLowerCase();
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
  if (/(?:logo|icon|sprite|favicon|pixel|tracking|avatar|badge|rating|privacy|cookie|spacer|placeholder)/i.test(url)) return;
  seen.add(url);
  rows.push({ ...row, url });
}

function variants(url) {
  const rows = [];
  const push = (value, kind) => { if (value && !rows.some(row => row.url === value)) rows.push({ url: value, kind }); };
  push(url, 'page-delivery');
  try {
    const parsed = new URL(url);
    const noQuery = new URL(url);
    noQuery.search = '';
    push(noQuery.href, 'unparameterized');
    if (parsed.hostname === 'm.media-amazon.com' && /_V1_/.test(parsed.pathname)) {
      push(parsed.href.replace(/_V1_[^/]*\.(?:jpg|jpeg|png|webp)(?:\?.*)?$/i, '_V1_.jpg'), 'imdb-original-probe');
    }
    if (/cdn\.shopify\.com|shopifycdn\.net/i.test(parsed.hostname)) {
      push(parsed.href.replace(/_(?:pico|icon|thumb|small|compact|medium|large|grande|original|master|\d+x\d*)\.(jpe?g|png|webp)(?:\?.*)?$/i, '.$1'), 'shopify-original-probe');
    }
    if (/\/resize\/\d+x\d+!/i.test(parsed.pathname)) {
      for (const width of [2400, 2048, 1600, 1200]) {
        push(parsed.href.replace(/\/resize\/\d+x\d+!/i, `/resize/${width}x${Math.round(width * 0.75)}!`), `brightspot-width-${width}`);
      }
    }
    for (const param of ['w', 'width', 'resize', 'quality', 'q', 'fit', 'crop', 'format']) {
      if (!parsed.searchParams.has(param)) continue;
      const copy = new URL(url);
      copy.searchParams.delete(param);
      push(copy.href, `without-${param}`);
    }
    for (const width of [2400, 2048, 1600, 1200]) {
      if (parsed.searchParams.has('width')) {
        const copy = new URL(url);
        copy.searchParams.set('width', String(width));
        push(copy.href, `width-${width}`);
      }
      if (parsed.searchParams.has('w')) {
        const copy = new URL(url);
        copy.searchParams.set('w', String(width));
        push(copy.href, `w-${width}`);
      }
    }
  } catch {}
  return rows;
}

async function inspectPage(context, pageSpec) {
  const page = await context.newPage();
  try {
    const response = await page.goto(pageSpec.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(1500);
    for (const label of ['CONTINUE', 'Accept', 'Accept All', 'I Accept', 'Agree', 'Allow all']) {
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
    for (let i = 0; i < 9; i++) {
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(300);
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
      const out = [];
      const add = (url, label, context, origin) => {
        const resolved = absolute(url);
        if (resolved) out.push({ url: resolved, label: label || '', context: String(context || '').replace(/\s+/g, ' ').slice(0, 2500), origin });
      };
      for (const selector of [
        'meta[property="og:image"]',
        'meta[property="og:image:secure_url"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:src"]',
        'link[rel="image_src"]'
      ]) {
        for (const node of document.querySelectorAll(selector)) add(node.content || node.href, node.getAttribute('content') || node.getAttribute('href') || '', document.title, 'metadata');
      }
      for (const image of document.images) {
        const values = [image.currentSrc, image.src, image.dataset.src, image.dataset.lazySrc, image.dataset.original, image.dataset.image, image.getAttribute('data-src')].filter(Boolean);
        for (const part of String(image.srcset || image.dataset.srcset || '').split(',')) {
          const value = part.trim().split(/\s+/)[0];
          if (value) values.push(value);
        }
        const figure = image.closest('figure');
        const article = image.closest('article');
        const context = [image.alt, image.title, figure?.querySelector('figcaption')?.textContent, figure?.textContent, article?.textContent?.slice(0, 1400), image.parentElement?.textContent?.slice(0, 1000), document.title].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 2500);
        for (const value of values) add(value, image.alt || image.title || '', context, 'dom-image');
      }
      for (const source of document.querySelectorAll('source')) {
        for (const part of String(source.srcset || source.getAttribute('data-srcset') || '').split(',')) {
          const value = part.trim().split(/\s+/)[0];
          if (value) add(value, '', source.closest('figure')?.textContent || document.title, 'dom-source');
        }
      }
      for (const video of document.querySelectorAll('video[poster]')) add(video.poster || video.getAttribute('poster'), '', video.closest('figure')?.textContent || document.title, 'video-poster');
      for (const element of document.querySelectorAll('*')) {
        const bg = getComputedStyle(element).backgroundImage;
        for (const match of String(bg || '').matchAll(/url\(["']?([^"')]+)["']?\)/g)) add(match[1], element.getAttribute('aria-label') || '', [element.textContent?.slice(0, 600), document.title].filter(Boolean).join(' '), 'background-image');
      }
      for (const entry of performance.getEntriesByType('resource')) {
        const url = String(entry.name || '');
        if (/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url)) add(url, '', document.title, 'performance-resource');
      }
      return out;
    });
    const rows = [];
    const seen = new Set();
    for (const row of extracted) addUrl(rows, seen, row, page.url());
    for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'<>\s]+?\.(?:jpe?g|png|webp)(?:\?[^"'<>\s]*)?/gi)) {
      addUrl(rows, seen, { url: match[0], label: '', context: title, origin: 'html-url' }, page.url());
    }
    return {
      evidence: {
        status: 'loaded',
        http_status: response?.status() || null,
        title,
        resolved_url: page.url(),
        required_terms: pageSpec.required_terms,
        required_terms_missing: missing,
        body_text: body.slice(0, 20000),
        screenshot,
        extracted_image_urls: rows.length
      },
      rows
    };
  } catch (error) {
    return {
      evidence: {
        status: 'error',
        error: error.message,
        required_terms: pageSpec.required_terms,
        required_terms_missing: pageSpec.required_terms
      },
      rows: []
    };
  } finally {
    await page.close();
  }
}

async function download(context, pageSpec, row, variant, index) {
  let response;
  try {
    response = await context.request.get(variant.url, {
      headers: {
        'User-Agent': UA,
        Referer: pageSpec.url,
        Accept: 'image/jpeg,image/webp,image/png,image/*,*/*;q=0.2'
      },
      timeout: 60000,
      failOnStatusCode: false
    });
  } catch (error) {
    return { family: pageSpec.family, page_key: pageSpec.key, provider: pageSpec.provider, source_page: pageSpec.url, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, local_context: row.context || '', download_error: error.message };
  }
  if (!response.ok()) return { family: pageSpec.family, page_key: pageSpec.key, provider: pageSpec.provider, source_page: pageSpec.url, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, local_context: row.context || '', download_error: `HTTP ${response.status()}` };
  const bytes = Buffer.from(await response.body());
  const mime = signatureMime(bytes);
  if (bytes.length < 12000 || mime === 'unknown') return { family: pageSpec.family, page_key: pageSpec.key, provider: pageSpec.provider, source_page: pageSpec.url, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, local_context: row.context || '', download_error: `unusable ${bytes.length} ${mime}` };
  const local = `candidates/${String(index).padStart(3, '0')}-${slug(pageSpec.family)}-${slug(pageSpec.key)}-${slug(row.origin)}.${extensionFor(mime)}`;
  const path = join(OUT, local);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  let dimensions = { width: 0, height: 0 };
  try { dimensions = identify(path); } catch {}
  if (dimensions.width < 300 || dimensions.height < 200) return { family: pageSpec.family, page_key: pageSpec.key, provider: pageSpec.provider, source_page: pageSpec.url, probe_url: variant.url, probe_kind: variant.kind, resolved_url: response.url() || variant.url, origin: row.origin, local_context: row.context || '', local, mime, bytes: bytes.length, sha256: sha(bytes), ...dimensions, download_error: 'image below 300x200 floor' };
  return {
    family: pageSpec.family,
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

function familyRegex(family) {
  return family === 'coming-to-america'
    ? /(coming to america|eddie murphy|clarence|saul|randy watson|prince akeem|barber|paramount|cvp60477)/
    : /(nutty professor|eddie murphy|sherman klump|buddy love|klump family|papa klump|mama klump|grandma klump|universal|syfy|american film institute|afi)/;
}

async function buildContactSheet(candidates, name, heading) {
  const thumbs = [];
  for (let position = 0; position < candidates.length; position++) {
    const row = candidates[position];
    const thumb = join(OUT, 'thumbs', `${slug(name)}-${String(position + 1).padStart(2, '0')}.jpg`);
    await mkdir(dirname(thumb), { recursive: true });
    magick(
      join(OUT, row.local),
      '-auto-orient',
      '-thumbnail', '420x315>',
      '-background', '#171512',
      '-gravity', 'center',
      '-extent', '420x315',
      '-fill', 'white',
      '-undercolor', '#171512cc',
      '-gravity', 'south',
      '-pointsize', '12',
      '-annotate', '+0+4', `${String(position + 1).padStart(2, '0')} ${row.page_key} ${row.width}x${row.height}`,
      '-strip',
      '-quality', '88',
      thumb
    );
    thumbs.push(thumb);
  }
  const contact = join(OUT, `${name}.jpg`);
  execFileSync('montage', [...thumbs, '-tile', '3x', '-geometry', '420x315+10+10', '-background', '#e8e3d9', contact], { stdio: 'inherit' });
  return { path: `${name}.jpg`, heading, candidate_count: candidates.length, ...identify(contact), sha256: sha(await readFile(contact)) };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-079', 'UC-079 discovery scope drift');
assert(control.actor === 'Eddie Murphy' && control.character === 'Barbershop crowd & Saul' && control.side === 'still', 'UC-079 discovery identity drift');
assert(control.selector_artifact?.artifact_id === 8658596662 && control.scope_artifact?.artifact_id === 8658730962, 'UC-079 selector or scope custody drift');
assert(control.performance_families?.length === 2 && control.pages?.length === 14, 'UC-079 family or page denominator drift');
assert(control.scope_contract?.composite_required === true && control.scope_contract?.reject_single_role_substitution === true, 'UC-079 composite contract drift');
await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US' });

try {
  const pageEvidence = {};
  const pageScreenshots = [];
  const attempted = [];
  const candidates = [];
  const seenHashes = new Set();
  const familyCounts = Object.fromEntries(control.performance_families.map(family => [family.key, 0]));
  const familyLimit = Math.floor(control.max_candidates / control.performance_families.length);
  let index = 0;

  for (const pageSpec of control.pages) {
    const inspected = await inspectPage(context, pageSpec);
    pageEvidence[pageSpec.key] = inspected.evidence;
    if (inspected.evidence?.screenshot) {
      const bytes = await readFile(join(OUT, inspected.evidence.screenshot));
      pageScreenshots.push({ family: pageSpec.family, page_key: pageSpec.key, provider: pageSpec.provider, path: inspected.evidence.screenshot, sha256: sha(bytes), bytes: bytes.length });
    }
    if (pageSpec.strict) {
      assert(inspected.evidence.status === 'loaded' && inspected.evidence.required_terms_missing.length === 0, `${pageSpec.key} required page evidence failed: ${inspected.evidence.required_terms_missing.join(', ')}`);
    }
    const tokenRegex = familyRegex(pageSpec.family);
    for (const row of inspected.rows) {
      if (candidates.length >= control.max_candidates || familyCounts[pageSpec.family] >= familyLimit) break;
      const localHay = norm([row.label, row.context, row.url, inspected.evidence.title].join(' '));
      if (!tokenRegex.test(localHay)) continue;
      for (const variant of variants(row.url)) {
        if (candidates.length >= control.max_candidates || familyCounts[pageSpec.family] >= familyLimit) break;
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
        familyCounts[pageSpec.family] += 1;
      }
    }
  }

  for (const family of control.performance_families) {
    assert(familyCounts[family.key] >= 2, `UC-079 discovery produced only ${familyCounts[family.key]} usable unique candidate(s) for ${family.key}`);
  }

  candidates.sort((a, b) => a.family.localeCompare(b.family) || (b.width * b.height - a.width * a.height) || a.page_key.localeCompare(b.page_key) || a.local.localeCompare(b.local));
  const familyContactSheets = {};
  for (const family of control.performance_families) {
    const rows = candidates.filter(row => row.family === family.key);
    familyContactSheets[family.key] = await buildContactSheet(rows, `contact-sheet-${family.key}`, family.presentation_requirement);
  }
  const contactSheet = await buildContactSheet(candidates, 'contact-sheet-all', 'UC-079 two-family candidate orbit');

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
    generated_at: new Date().toISOString(),
    control_sha256: sha(await readFile(CONTROL)),
    selector_artifact: control.selector_artifact,
    scope_artifact: control.scope_artifact,
    scope_contract: control.scope_contract,
    performance_families: control.performance_families,
    repository_hash_count: repository.size,
    page_evidence: pageEvidence,
    page_screenshots: pageScreenshots,
    attempted,
    candidates,
    candidate_count: candidates.length,
    candidate_count_by_family: familyCounts,
    contact_sheet: contactSheet,
    family_contact_sheets: familyContactSheets,
    disposition: 'candidate-only-two-family-orbit-pending-visual-selection',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-079',
    actor: 'Eddie Murphy',
    character: 'Barbershop crowd & Saul',
    candidate_count: candidates.length,
    candidate_count_by_family: familyCounts,
    candidates: candidates.map(({ family, page_key, provider, source_page, probe_url, probe_kind, resolved_url, origin, label, local_context, local, mime, bytes, sha256, width, height, repository_matches }) => ({ family, page_key, provider, source_page, probe_url, probe_kind, resolved_url, origin, label, local_context, local, mime, bytes, sha256, width, height, repository_matches }))
  });

  const sections = control.performance_families.map(family => {
    const rows = candidates.filter(row => row.family === family.key);
    const cards = rows.map((row, position) => `<article><img src="${row.local}" alt=""><h3>${position + 1} · ${row.page_key}</h3><p>${row.provider} · ${row.width}×${row.height} · ${row.bytes} bytes</p><p>${row.local_context.slice(0, 700)}</p><p>${row.repository_matches.length ? `duplicate: ${row.repository_matches.join(', ')}` : 'no exact canonical duplicate'}</p><code>${row.sha256}</code></article>`).join('');
    return `<section><h2>${family.production}</h2><p>${family.presentation_requirement}</p><div class="grid">${cards}</div></section>`;
  }).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}section{margin:0 0 48px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}article{background:white;padding:10px}article img{width:100%;height:360px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-079 · Eddie Murphy multi-role still discovery</h1><p>Candidate-only. A final packet must represent both declared performance families and may not substitute one role, a publicity portrait, a poster, a watermarked preview, or a sequel-only image for the complete obligation.</p>${sections}`);

  console.log(`PASS — UC-079 two-family discovery complete: ${candidates.length} unique candidate(s)`);
  for (const [family, count] of Object.entries(familyCounts)) console.log(`${family}=${count}`);
  console.log(`manifest ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`contact ${contactSheet.sha256}`);
  console.log(`artifact ${OUT}`);
} finally {
  await browser.close();
}
