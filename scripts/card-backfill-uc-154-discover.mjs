#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-154-DISCOVER.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-154-discover';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha = value => createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'")
  .replace(/<[^>]+>/g, ' ').replace(/&(?:[a-z][a-z0-9]{1,31}|#\d{1,7}|#x[0-9a-f]{1,6});/gi, ' ')
  .replace(/[^a-zA-Z0-9']+/g, ' ').trim().toLowerCase();
const slug = value => norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); };

function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return 'unknown';
}
function extensionFor(mime) { return mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'bin'; }
function identify(path) {
  const text = execFileSync(process.env.MAGICK_CMD || 'magick', ['identify', '-format', '%w %h', path], { encoding: 'utf8' }).trim();
  const [width, height] = text.split(/\s+/).map(Number);
  assert(width > 0 && height > 0, `cannot identify ${path}`);
  return { width, height };
}
function frameInput(path, mime) { return mime === 'image/gif' ? `${path}[0]` : path; }
function magick(...args) { execFileSync(process.env.MAGICK_CMD || 'magick', args, { stdio: 'inherit' }); }
async function walkImages(root, out = []) {
  let entries; try { entries = await readdir(root, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) { const path = join(root, entry.name); if (entry.isDirectory()) await walkImages(path, out); else if (/\.(?:jpe?g|png|webp)$/i.test(entry.name)) out.push(path); }
  return out;
}
async function repositoryHashes() {
  const map = new Map();
  try {
    const manifest = await readJson('data/media-manifest.json');
    for (const [path, row] of Object.entries(manifest.assets || {})) {
      if (!/^[0-9a-f]{64}$/i.test(row?.sha256 || '')) continue;
      const list = map.get(row.sha256) || []; list.push(`manifest:${path}`); map.set(row.sha256, list);
    }
  } catch {}
  for (const path of await walkImages('images')) {
    try { const hash = sha(await readFile(path)); const list = map.get(hash) || []; list.push(`file:${path}`); map.set(hash, list); } catch {}
  }
  return map;
}
function cleanUrl(value, base) {
  if (!value) return '';
  const text = String(value).replace(/\\u002F/g, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  try { return new URL(text, base).href; } catch { return ''; }
}
function imageVariants(url) {
  const rows = [];
  const add = (value, kind) => { if (value && !rows.some(row => row.url === value)) rows.push({ url: value, kind }); };
  add(url, 'declared');
  try {
    const parsed = new URL(url);
    const noQuery = new URL(url); noQuery.search = ''; add(noQuery.href, 'queryless');
    const original = noQuery.href.replace(/-\d{2,5}x\d{2,5}(?=\.(?:jpe?g|png|webp)$)/i, '');
    add(original, 'wordpress-original');
    add(original.replace(/-scaled(?=\.(?:jpe?g|png|webp)$)/i, ''), 'wordpress-unscaled');
    if (parsed.hostname === 'm.media-amazon.com' && /_V1_/.test(parsed.pathname)) add(parsed.href.replace(/_V1_[^/]*\.(?:jpe?g|png|webp)(?:\?.*)?$/i, '_V1_.jpg'), 'imdb-original-probe');
  } catch {}
  return rows;
}
function responseStatus(response) { return response ? (typeof response.status === 'function' ? response.status() : response.status) : null; }
async function acceptBanners(page) {
  for (const label of ['CONTINUE','Accept','I Accept','Agree','Allow all','Accept All','Accept Cookies','Close']) {
    const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
    if (await button.count().catch(() => 0)) { await button.first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(250); }
  }
}
async function navigateWithFallback(context, page, url, timeout) {
  try { return { response: await page.goto(url, { waitUntil: 'domcontentloaded', timeout }), transport: 'browser-navigation' }; }
  catch (browserError) {
    const response = await context.request.get(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }, timeout, failOnStatusCode: false });
    if (!response.ok()) throw browserError;
    const html = await response.text();
    const base = `<base href="${url}">`;
    const patched = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : `${base}${html}`;
    await page.setContent(patched, { waitUntil: 'domcontentloaded', timeout });
    return { response, transport: 'request-fallback' };
  }
}
async function inspectPage(context, spec) {
  const page = await context.newPage();
  const screenshot = `pages/${spec.key}.png`;
  try {
    const { response, transport } = await navigateWithFallback(context, page, spec.url, control.transport_timeout_ms);
    await page.waitForTimeout(1600); await acceptBanners(page);
    await page.evaluate(() => {
      for (const img of document.querySelectorAll('img')) {
        for (const attr of ['data-src','data-lazy-src','data-original','data-image','data-url']) { const value = img.getAttribute(attr); if (value && !img.src) img.src = value; }
        const srcset = img.getAttribute('data-srcset'); if (srcset && !img.srcset) img.srcset = srcset;
      }
    }).catch(() => {});
    for (let index = 0; index < 12; index++) { await page.mouse.wheel(0, 1400); await page.waitForTimeout(180); }
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content().catch(() => '');
    const title = await page.title();
    const hay = norm(`${title} ${body} ${html}`);
    const missing = (spec.required_terms || []).filter(term => !hay.includes(norm(term)));
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: false });
    const screenshotBytes = await readFile(join(OUT, screenshot));
    const extracted = await page.evaluate(({ mode, phrase }) => {
      const rows = [];
      const seen = new Set();
      const absolute = value => { try { return new URL(value, document.baseURI).href; } catch { return ''; } };
      const add = (url, context, origin, label = '') => {
        url = absolute(url);
        if (!url || seen.has(`${url}|${origin}`)) return;
        seen.add(`${url}|${origin}`);
        rows.push({ url, context: String(context || '').replace(/\s+/g, ' ').slice(0, 3000), origin, label: String(label || '').slice(0, 500) });
      };
      const addNode = (node, context, origin) => {
        if (!node) return;
        for (const attr of ['src','data-src','data-lazy-src','data-original','href','poster']) add(node.getAttribute?.(attr), context, `${origin}:${attr}`, node.getAttribute?.('alt') || node.getAttribute?.('title') || '');
        for (const attr of ['srcset','data-srcset']) {
          for (const part of String(node.getAttribute?.(attr) || '').split(',')) add(part.trim().split(/\s+/)[0], context, `${origin}:${attr}`, node.getAttribute?.('alt') || '');
        }
        if (node.currentSrc) add(node.currentSrc, context, `${origin}:currentSrc`, node.alt || '');
      };
      if (mode === 'caption-local') {
        const needle = String(phrase || '').toLowerCase();
        const matches = [...document.querySelectorAll('figcaption,p,div,span,h1,h2,h3')].filter(node => String(node.textContent || '').toLowerCase().includes(needle));
        for (const match of matches) {
          let current = match;
          for (let depth = 0; depth < 7 && current; depth++, current = current.parentElement) {
            const context = current.textContent || document.title;
            addNode(current, context, 'caption-container');
            for (const node of current.querySelectorAll('img,source,a,video')) addNode(node, context, 'caption-nearby');
            for (const found of String(current.outerHTML || '').matchAll(/https?:\\?\/\\?\/[^"'<>\s]+?\.(?:jpe?g|png|webp)(?:\?[^"'<>\s]*)?/gi)) add(found[0], context, 'caption-html');
          }
        }
      } else {
        for (const node of document.querySelectorAll('img,source,a,video')) {
          const context = node.closest('figure,article,li,div')?.textContent || document.title;
          addNode(node, context, 'gallery-dom');
        }
        for (const entry of performance.getEntriesByType('resource')) {
          const url = String(entry.name || '');
          if (/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url)) add(url, document.title, 'gallery-resource');
        }
      }
      return rows;
    }, { mode: spec.mode || 'identity', phrase: spec.caption_phrase || '' });
    return {
      evidence: {
        status: 'loaded', http_status: responseStatus(response), transport, title, resolved_url: page.url() || spec.url,
        required_terms: spec.required_terms || [], required_terms_missing: missing,
        body_text: body.slice(0, 60000), body_sha256: sha(Buffer.from(body.slice(0, 60000), 'utf8')),
        screenshot: { path: screenshot, sha256: sha(screenshotBytes), bytes: screenshotBytes.length, ...identify(join(OUT, screenshot)) }
      },
      extracted
    };
  } catch (error) {
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: false }).catch(() => {});
    let screenshotRecord = null;
    try { const bytes = await readFile(join(OUT, screenshot)); screenshotRecord = { path: screenshot, sha256: sha(bytes), bytes: bytes.length, ...identify(join(OUT, screenshot)) }; } catch {}
    return { evidence: { status: 'error', error: error.message, required_terms: spec.required_terms || [], required_terms_missing: spec.required_terms || [], screenshot: screenshotRecord }, extracted: [] };
  } finally { await page.close(); }
}
function plausibleImage(row) {
  const url = String(row.url || '');
  if (!/^https?:\/\//i.test(url)) return false;
  if (!/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(url)) return false;
  if (/(?:logo|favicon|avatar|emoji|icon|sprite|badge|pixel|tracking|advert|banner|wordmark|placeholder|loading|gravatar|youtube|vimeo)/i.test(`${url} ${row.label || ''}`)) return false;
  if (/halloweenmovies\.com/i.test(url) && !/\/wp-content\/uploads\//i.test(url)) return false;
  return true;
}
async function downloadCandidate(context, row, index) {
  for (const variant of imageVariants(row.url)) {
    try {
      const response = await context.request.get(variant.url, {
        headers: { 'User-Agent': UA, Referer: row.source_page, Accept: 'image/jpeg,image/webp,image/png,image/*,*/*;q=0.2' },
        timeout: control.transport_timeout_ms, failOnStatusCode: false
      });
      if (!response.ok()) continue;
      const bytes = Buffer.from(await response.body());
      const mime = signatureMime(bytes);
      if (bytes.length < 12000 || mime === 'unknown') continue;
      const local = `candidates/${String(index).padStart(3, '0')}-${slug(row.source_page_key)}-${slug(row.origin)}.${extensionFor(mime)}`;
      const path = join(OUT, local); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
      let dimensions = { width: 0, height: 0 }; try { dimensions = identify(path); } catch {}
      if (dimensions.width < control.minimum_width || dimensions.height < control.minimum_height) continue;
      return {
        source_page_key: row.source_page_key, provider: row.provider, source_page: row.source_page,
        declared_url: row.url, probe_url: variant.url, probe_kind: variant.kind, resolved_url: response.url() || variant.url,
        origin: row.origin, label: row.label || '', local_context: row.context || '', pinned_key: row.pinned_key || null,
        first_film_2007: row.first_film_2007 === true, local, mime, bytes: bytes.length, sha256: sha(bytes), ...dimensions
      };
    } catch {}
  }
  return { source_page_key: row.source_page_key, provider: row.provider, source_page: row.source_page, declared_url: row.url, origin: row.origin, pinned_key: row.pinned_key || null, download_error: 'no usable image delivery' };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-154', 'UC-154 discovery scope drift');
assert(control.actor === 'Tyler Mane' && control.character === 'Michael Myers' && control.production === 'Halloween (2007)' && control.years === '2007–2009' && control.side === 'still', 'UC-154 discovery identity drift');
assert(control.selector_artifact?.artifact_id === 8710537497 && control.scope_artifact?.artifact_id === 8710630547 && control.scope_artifact?.scope_sha256 === '6450cc15412afc4f9075aa277ef738896327fa659ed6a15f0bfb955d3063fdbb', 'UC-154 discovery custody drift');
assert(control.actor_role_pages?.length === 2 && control.actor_role_pages.every(row => row.strict) && control.image_pages?.length === 2 && control.image_pages.every(row => row.strict) && control.pinned_candidates?.length === 1, 'UC-154 discovery denominator drift');
assert(control.selection_contract?.exact_completed_michael_myers_character_still_required === true && control.selection_contract?.tyler_mane_performance_required === true && control.selection_contract?.halloween_2007_first_film_required === true && control.selection_contract?.halloween_ii_2009_substitute_forbidden === true && control.selection_contract?.actor_role_and_frame_custody_must_be_separate === true && control.selection_contract?.canonical_mutation === false, 'UC-154 selection contract drift');
const specimen = (await readJson('data/specimens.json')).find(row => row.id === 'UC-154');
const source = (await readJson('data/SOURCES.json')).find(row => row.id === 'UC-154');
const audit = (await readJson('data/MEDIA-AUDIT.json')).items.find(row => row.id === control.audit_id);
assert(specimen && specimen.actor === 'Tyler Mane' && specimen.character === 'Michael Myers' && specimen.production === 'Halloween (2007)' && specimen.years === '2007–2009' && !specimen.still && specimen.portrait?.src === 'images/uc-154-portrait.jpg', 'UC-154 specimen boundary drift');
assert(!source?.still && audit?.status === 'absent' && !audit?.asset, 'UC-154 canonical still absence drift');
await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US', ignoreHTTPSErrors: true });
try {
  const page_evidence = {};
  const page_screenshots = [];
  for (const spec of control.actor_role_pages) {
    const inspected = await inspectPage(context, spec); page_evidence[spec.key] = inspected.evidence;
    assert(inspected.evidence.status === 'loaded' && inspected.evidence.http_status >= 200 && inspected.evidence.http_status < 400, `${spec.key} actor-role transport failed`);
    assert(inspected.evidence.required_terms_missing.length === 0, `${spec.key} actor-role terms missing: ${inspected.evidence.required_terms_missing.join(', ')}`);
    if (inspected.evidence.screenshot) page_screenshots.push({ key: spec.key, provider: spec.provider, ...inspected.evidence.screenshot });
  }
  const rawRows = [];
  for (const spec of control.image_pages) {
    const inspected = await inspectPage(context, spec); page_evidence[spec.key] = inspected.evidence;
    assert(inspected.evidence.status === 'loaded' && inspected.evidence.http_status >= 200 && inspected.evidence.http_status < 400, `${spec.key} image-page transport failed`);
    assert(inspected.evidence.required_terms_missing.length === 0, `${spec.key} image-page terms missing: ${inspected.evidence.required_terms_missing.join(', ')}`);
    if (inspected.evidence.screenshot) page_screenshots.push({ key: spec.key, provider: spec.provider, ...inspected.evidence.screenshot });
    for (const row of inspected.extracted) if (plausibleImage(row)) rawRows.push({ ...row, source_page_key: spec.key, provider: spec.provider, source_page: spec.url, first_film_2007: true });
  }
  for (const pinned of control.pinned_candidates) rawRows.unshift({
    url: pinned.url, context: pinned.caption, origin: 'pinned-caption-local', label: pinned.caption,
    source_page_key: pinned.source_page_key, provider: pinned.provider, source_page: pinned.source_page,
    pinned_key: pinned.key, first_film_2007: pinned.first_film_2007 === true
  });
  const uniqueRows = [];
  const seenDeclared = new Set();
  for (const row of rawRows) {
    const url = cleanUrl(row.url, row.source_page);
    if (!plausibleImage({ ...row, url }) || seenDeclared.has(url)) continue;
    seenDeclared.add(url); uniqueRows.push({ ...row, url });
  }
  const attempted = [];
  const candidates = [];
  const seenHashes = new Map();
  let index = 0;
  for (const row of uniqueRows.slice(0, control.maximum_candidates * 4)) {
    if (candidates.length >= control.maximum_candidates) break;
    const result = await downloadCandidate(context, row, ++index); attempted.push(result);
    if (!result.sha256 || result.download_error) continue;
    if (seenHashes.has(result.sha256)) { result.visual_byte_duplicate = true; result.duplicate_of = seenHashes.get(result.sha256); continue; }
    seenHashes.set(result.sha256, result.local);
    result.repository_matches = repository.get(result.sha256) || [];
    if (result.repository_matches.length) continue;
    candidates.push(result);
  }
  assert(candidates.length >= control.minimum_candidates, `UC-154 discovery produced only ${candidates.length} usable candidate(s)`);
  const pinned = candidates.find(row => row.pinned_key === 'official-caption-local-mane-myers-klebe');
  assert(pinned, 'UC-154 official caption-local Tyler Mane Michael Myers image failed to survive discovery');
  assert(candidates.every(row => row.first_film_2007 === true), 'UC-154 candidate escaped first-film custody');
  candidates.sort((a, b) => Number(Boolean(b.pinned_key)) - Number(Boolean(a.pinned_key)) || (b.width * b.height - a.width * a.height) || a.local.localeCompare(b.local));

  const thumbs = [];
  for (let position = 0; position < candidates.length; position++) {
    const row = candidates[position];
    const thumb = join(OUT, 'thumbs', `${String(position + 1).padStart(2, '0')}.jpg`); await mkdir(dirname(thumb), { recursive: true });
    const label = `${position + 1} · ${row.width}x${row.height} · ${row.pinned_key ? 'PINNED · ' : ''}${row.source_page_key}`;
    magick(frameInput(join(OUT, row.local), row.mime), '-auto-orient', '-thumbnail', '520x380>', '-background', '#171512', '-gravity', 'center', '-extent', '520x380', '-fill', 'white', '-undercolor', '#171512dd', '-gravity', 'south', '-pointsize', '13', '-annotate', '+0+6', label, '-strip', '-quality', '88', thumb);
    thumbs.push(thumb);
  }
  const contactPath = join(OUT, 'contact-sheet.jpg');
  execFileSync('montage', [...thumbs, '-tile', '3x', '-geometry', '520x380+10+10', '-background', '#e8e3d9', contactPath], { stdio: 'inherit' });
  const contactSheet = { path: 'contact-sheet.jpg', sha256: sha(await readFile(contactPath)), ...identify(contactPath), candidate_count: candidates.length };
  const sourceCounts = Object.fromEntries(control.image_pages.map(spec => [spec.key, candidates.filter(row => row.source_page_key === spec.key).length]));
  const manifest = {
    version: 1, lane: 'card-backfill', record_id: 'UC-154', actor: 'Tyler Mane', character: 'Michael Myers', production: 'Halloween (2007)', years: '2007–2009', side: 'still', expected_subject: 'Michael Myers',
    generated_at: new Date().toISOString(), control_sha256: sha(await readFile(CONTROL)), selector_artifact: control.selector_artifact, scope_artifact: control.scope_artifact,
    repository_hash_count: repository.size,
    actor_role_bindings: control.actor_role_pages.map(row => ({ key: row.key, provider: row.provider, source_page: row.url, binding: row.binding, page_evidence_key: row.key })),
    production_image_bindings: control.image_pages.map(row => ({ key: row.key, provider: row.provider, source_page: row.url, mode: row.mode, binding: row.binding, page_evidence_key: row.key })),
    chronology_boundary: {
      canonical_years_semantics: '2007–2009 records Tyler Mane’s two-film tenure.',
      selected_frame_requirement: 'Every candidate in this artifact is source-bound to Halloween (2007), not Halloween II (2009).',
      halloween_ii_2009_substitute_forbidden: true,
      other_continuities_and_performers_forbidden: true
    },
    page_evidence, page_screenshots, extracted_row_count: rawRows.length, unique_declared_url_count: uniqueRows.length,
    attempted, candidates, candidate_count: candidates.length, source_counts: sourceCounts, pinned_candidate_sha256: pinned.sha256,
    contact_sheet: contactSheet, selection_contract: control.selection_contract,
    disposition: 'official-first-film-candidate-orbit-pending-visual-second-desk', canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-154', actor: 'Tyler Mane', character: 'Michael Myers', production: 'Halloween (2007)', years: '2007–2009',
    candidate_count: candidates.length, source_counts: sourceCounts, pinned_candidate_sha256: pinned.sha256,
    candidates: candidates.map(row => ({ source_page_key: row.source_page_key, provider: row.provider, source_page: row.source_page, declared_url: row.declared_url, probe_url: row.probe_url, probe_kind: row.probe_kind, resolved_url: row.resolved_url, origin: row.origin, label: row.label, local_context: row.local_context, pinned_key: row.pinned_key, local: row.local, mime: row.mime, bytes: row.bytes, sha256: row.sha256, width: row.width, height: row.height, repository_matches: row.repository_matches })),
    contact_sheet: contactSheet, canonical_mutation: false
  });
  const cards = candidates.map((row, position) => `<article><img src="${row.local}" alt=""><h2>${position + 1}. ${row.pinned_key || row.source_page_key}</h2><p>${row.width}×${row.height} · ${row.origin}</p><p>${row.local_context.slice(0, 700)}</p><code>${row.sha256}</code></article>`).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}article{background:white;padding:10px}article img{width:100%;height:380px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-154 · Tyler Mane Michael Myers first-film image orbit</h1><p>All retained bytes are source-bound to Halloween (2007). Halloween II (2009), other performers, other continuities, young Michael, unmasked Tyler Mane, standalone masks, cosplay, merchandise, posters, and montages are forbidden.</p><div class="grid">${cards}</div>`);
  console.log(`PASS — UC-154 discovery retained ${candidates.length} byte-distinct first-film candidate(s)`);
  console.log(`PINNED — ${pinned.sha256} ${pinned.width}x${pinned.height}`);
  console.log(`SOURCES — ${JSON.stringify(sourceCounts)}`);
  console.log(`MANIFEST — ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`SUMMARY — ${sha(await readFile(join(OUT, 'summary.json')))}`);
  console.log(`CONTACT — ${contactSheet.sha256}`);
  console.log(`OUTPUT — ${OUT}`);
} finally { await browser.close(); }
