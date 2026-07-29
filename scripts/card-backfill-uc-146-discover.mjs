#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-146-DISCOVER.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-146-discover';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha = value => createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[’‘]/g, "'")
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(?:[a-z][a-z0-9]{1,31}|#\d{1,7}|#x[0-9a-f]{1,6});/gi, ' ')
  .replace(/[^a-zA-Z0-9']+/g, ' ')
  .trim()
  .toLowerCase();
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
function magick(...args) { execFileSync(process.env.MAGICK_CMD || 'magick', args, { stdio: 'inherit' }); }
async function walkImages(root, out = []) {
  let entries; try { entries = await readdir(root, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) { const path = join(root, entry.name); if (entry.isDirectory()) await walkImages(path, out); else if (/\.(?:jpe?g|png|webp)$/i.test(entry.name)) out.push(path); }
  return out;
}
async function repositoryHashes() {
  const map = new Map();
  try { const manifest = await readJson('data/media-manifest.json'); for (const [path, row] of Object.entries(manifest.assets || {})) { if (!/^[0-9a-f]{64}$/i.test(row?.sha256 || '')) continue; const list = map.get(row.sha256) || []; list.push(`manifest:${path}`); map.set(row.sha256, list); } } catch {}
  for (const path of await walkImages('images')) { try { const hash = sha(await readFile(path)); const list = map.get(hash) || []; list.push(`file:${path}`); map.set(hash, list); } catch {} }
  return map;
}
function apiUrl(base, params) { const url = new URL(base); for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined) url.searchParams.set(key, String(value)); return url.href; }
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
    await page.waitForTimeout(1400);
    await acceptBanners(page);
    for (let index = 0; index < 6; index++) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(150); }
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content().catch(() => '');
    const title = await page.title();
    const hay = norm(`${title} ${body} ${html}`);
    const missing = (spec.required_terms || []).filter(term => !hay.includes(norm(term)));
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: false });
    const bytes = await readFile(join(OUT, screenshot));
    return {
      status: 'loaded', http_status: responseStatus(response), transport, title, resolved_url: page.url() || spec.url,
      required_terms: spec.required_terms || [], required_terms_missing: missing,
      body_text: body.slice(0, 60000), body_sha256: sha(Buffer.from(body.slice(0, 60000), 'utf8')),
      screenshot: { path: screenshot, sha256: sha(bytes), bytes: bytes.length, ...identify(join(OUT, screenshot)) }
    };
  } catch (error) {
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: false }).catch(() => {});
    let screenshotRecord = null;
    try { const bytes = await readFile(join(OUT, screenshot)); screenshotRecord = { path: screenshot, sha256: sha(bytes), bytes: bytes.length, ...identify(join(OUT, screenshot)) }; } catch {}
    return { status: 'error', error: error.message, required_terms: spec.required_terms || [], required_terms_missing: spec.required_terms || [], screenshot: screenshotRecord };
  } finally { await page.close(); }
}
async function requestJson(context, url, referer) {
  const response = await context.request.get(url, { headers: { 'User-Agent': UA, Referer: referer || 'https://commons.wikimedia.org/', Accept: 'application/json,*/*;q=0.8' }, timeout: control.transport_timeout_ms, failOnStatusCode: false });
  assert(response.ok(), `API HTTP ${response.status()} for ${url}`);
  return response.json();
}
function metadataText(info) {
  const ext = info?.extmetadata || {};
  return [ext.ImageDescription?.value, ext.ObjectName?.value, ext.Artist?.value, ext.Credit?.value, ext.LicenseShortName?.value, ext.UsageTerms?.value, ext.Categories?.value, ext.DateTimeOriginal?.value, ext.DateTime?.value].filter(Boolean).join(' ');
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-146', 'UC-146 discovery scope drift');
assert(control.actor === 'Tim Rose' && control.character === 'Admiral Ackbar / Salacious B. Crumb' && control.production === 'Return of the Jedi' && control.years === '1983–2019' && control.side === 'portrait', 'UC-146 discovery identity drift');
assert(control.selector_artifact?.artifact_id === 8709311632 && control.scope_artifact?.artifact_id === 8709403357 && control.scope_artifact?.scope_sha256 === 'c3827439f67776cff078fd431173b1a5820a9637effc89d84efa9f79a5052c5d', 'UC-146 discovery custody drift');
assert(control.actor_identity_pages?.length === 2 && control.actor_identity_pages.every(row => row.strict) && control.commons?.files?.length === 2 && control.selection_contract?.required_candidate_count === 2, 'UC-146 discovery denominator drift');
assert(control.selection_contract?.exact_untransformed_tim_rose_portrait_required === true && control.selection_contract?.other_tim_rose_people_forbidden === true && control.selection_contract?.admiral_ackbar_or_salacious_crumb_character_image_forbidden === true && control.selection_contract?.existing_character_still_must_remain_unchanged === true && control.selection_contract?.canonical_mutation === false, 'UC-146 selection contract drift');
const specimen = (await readJson('data/specimens.json')).find(row => row.id === 'UC-146');
const source = (await readJson('data/SOURCES.json')).find(row => row.id === 'UC-146');
const audit = (await readJson('data/MEDIA-AUDIT.json')).items.find(row => row.id === control.audit_id);
assert(specimen && specimen.actor === 'Tim Rose' && specimen.character === 'Admiral Ackbar / Salacious B. Crumb' && specimen.production === 'Return of the Jedi' && specimen.years === '1983–2019' && !specimen.portrait, 'UC-146 specimen portrait boundary drift');
assert(specimen.still?.src === 'images/uc-146-still.jpg', 'UC-146 existing still drift');
assert(!source?.portrait && audit?.status === 'absent' && !audit?.asset, 'UC-146 canonical portrait absence drift');
await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US', ignoreHTTPSErrors: true });
try {
  const page_evidence = {};
  const page_screenshots = [];
  for (const spec of control.actor_identity_pages) {
    const evidence = await inspectPage(context, spec);
    page_evidence[spec.key] = evidence;
    assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${spec.key} identity page transport failed`);
    assert(evidence.required_terms_missing.length === 0, `${spec.key} identity terms missing: ${evidence.required_terms_missing.join(', ')}`);
    page_screenshots.push({ key: spec.key, provider: spec.provider, ...evidence.screenshot });
  }
  const categoryEvidence = await inspectPage(context, { key: 'commons-category-timothy-m-rose', url: control.commons.category_page, required_terms: control.commons.required_category_terms });
  page_evidence['commons-category-timothy-m-rose'] = categoryEvidence;
  assert(categoryEvidence.status === 'loaded' && categoryEvidence.http_status >= 200 && categoryEvidence.http_status < 400, 'Commons category transport failed');
  assert(categoryEvidence.required_terms_missing.length === 0, `Commons category terms missing: ${categoryEvidence.required_terms_missing.join(', ')}`);
  page_screenshots.push({ key: 'commons-category-timothy-m-rose', provider: 'Wikimedia Commons', ...categoryEvidence.screenshot });

  const candidates = [];
  const api_evidence = {};
  const seenHashes = new Set();
  for (const fileSpec of control.commons.files) {
    const api = apiUrl(control.commons.api_url, {
      action: 'query', format: 'json', formatversion: 2, redirects: 1,
      prop: 'info|imageinfo', inprop: 'url', iiprop: 'url|mime|size|extmetadata', iiurlwidth: 1600,
      titles: fileSpec.title, origin: '*'
    });
    const json = await requestJson(context, api, control.commons.category_page);
    await mkdir(join(OUT, 'api'), { recursive: true });
    const apiPath = `api/${fileSpec.key}.json`;
    await writeJson(join(OUT, apiPath), json);
    const page = json?.query?.pages?.[0];
    assert(page && !page.missing && page.title === fileSpec.title, `${fileSpec.key} Commons file missing`);
    const info = page.imageinfo?.[0];
    assert(info?.url && info.width > 0 && info.height > 0, `${fileSpec.key} Commons imageinfo missing`);
    const metadata = metadataText(info);
    const hay = norm(`${page.title} ${metadata}`);
    const missingMetadata = fileSpec.required_metadata_terms.filter(term => !hay.includes(norm(term)));
    assert(missingMetadata.length === 0, `${fileSpec.key} Commons metadata terms missing: ${missingMetadata.join(', ')}`);
    const license = info.extmetadata?.LicenseShortName?.value || info.extmetadata?.UsageTerms?.value || '';
    assert(norm(license).includes('cc') || norm(license).includes('creative commons'), `${fileSpec.key} Commons license metadata missing`);
    const filePage = await inspectPage(context, { key: `commons-${fileSpec.key}`, url: page.fullurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(fileSpec.title.replace(/ /g, '_'))}`, required_terms: [fileSpec.title.replace(/^File:/, '').replace(/_/g, ' '), 'Tim'] });
    page_evidence[`commons-${fileSpec.key}`] = filePage;
    assert(filePage.status === 'loaded' && filePage.http_status >= 200 && filePage.http_status < 400, `${fileSpec.key} Commons file page transport failed`);
    page_screenshots.push({ key: `commons-${fileSpec.key}`, provider: 'Wikimedia Commons', ...filePage.screenshot });
    const response = await context.request.get(info.url, { headers: { 'User-Agent': UA, Referer: page.fullurl || control.commons.category_page, Accept: 'image/jpeg,image/png,image/webp,image/*,*/*;q=0.2' }, timeout: control.transport_timeout_ms, failOnStatusCode: false });
    assert(response.ok(), `${fileSpec.key} portrait HTTP ${response.status()}`);
    const bytes = Buffer.from(await response.body());
    const mime = signatureMime(bytes);
    assert(bytes.length > 50000 && mime !== 'unknown', `${fileSpec.key} portrait bytes unusable ${bytes.length} ${mime}`);
    const local = `candidates/${fileSpec.key}.${extensionFor(mime)}`;
    await mkdir(dirname(join(OUT, local)), { recursive: true });
    await writeFile(join(OUT, local), bytes);
    const dimensions = identify(join(OUT, local));
    assert(dimensions.width >= 1000 && dimensions.height >= 1000, `${fileSpec.key} portrait below 1000px floor ${dimensions.width}x${dimensions.height}`);
    const hash = sha(bytes);
    assert(!seenHashes.has(hash), `${fileSpec.key} duplicates another portrait candidate`);
    seenHashes.add(hash);
    const repositoryMatches = repository.get(hash) || [];
    assert(repositoryMatches.length === 0, `${fileSpec.key} portrait duplicates canonical media`);
    const candidate = {
      key: fileSpec.key, provider: 'Wikimedia Commons', file_title: page.title, source_page: page.fullurl || null,
      original_url: info.url, thumbnail_url: info.thumburl || null, local, mime, bytes: bytes.length, sha256: hash, ...dimensions,
      metadata_text: metadata, metadata_terms_missing: missingMetadata, license_short_name: info.extmetadata?.LicenseShortName?.value || null,
      usage_terms: info.extmetadata?.UsageTerms?.value || null, artist: info.extmetadata?.Artist?.value || null,
      credit: info.extmetadata?.Credit?.value || null, description: info.extmetadata?.ImageDescription?.value || null,
      api_path: apiPath, api_sha256: sha(await readFile(join(OUT, apiPath))), page_screenshot: filePage.screenshot,
      repository_matches: repositoryMatches, untransformed_performer_portrait: true
    };
    candidates.push(candidate);
    api_evidence[fileSpec.key] = { file_title: page.title, page_id: page.pageid || null, api_path: apiPath, api_sha256: candidate.api_sha256, metadata_terms_missing: missingMetadata, license_short_name: candidate.license_short_name, original_url: info.url, width: info.width, height: info.height };
  }
  assert(candidates.length === 2 && new Set(candidates.map(row => row.sha256)).size === 2, 'UC-146 two-candidate portrait denominator drift');
  const thumbs = [];
  for (let index = 0; index < candidates.length; index++) {
    const row = candidates[index];
    const thumb = join(OUT, 'thumbs', `${String(index + 1).padStart(2, '0')}.jpg`);
    await mkdir(dirname(thumb), { recursive: true });
    const label = `${index + 1} · ${row.width}x${row.height} · ${row.file_title.replace(/^File:/, '').slice(0, 52)}`;
    magick(join(OUT, row.local), '-auto-orient', '-thumbnail', '620x620>', '-background', '#171512', '-gravity', 'center', '-extent', '620x620', '-fill', 'white', '-undercolor', '#171512dd', '-gravity', 'south', '-pointsize', '14', '-annotate', '+0+7', label, '-strip', '-quality', '88', thumb);
    thumbs.push(thumb);
  }
  const contactPath = join(OUT, 'contact-sheet.jpg');
  execFileSync('montage', [...thumbs, '-tile', '2x1', '-geometry', '620x620+12+12', '-background', '#d5d0c7', contactPath], { stdio: 'inherit' });
  const contactSheet = { path: 'contact-sheet.jpg', sha256: sha(await readFile(contactPath)), ...identify(contactPath), candidate_count: candidates.length };
  const manifest = {
    version: 1, lane: 'card-backfill', record_id: 'UC-146', actor: 'Tim Rose', character: 'Admiral Ackbar / Salacious B. Crumb', production: 'Return of the Jedi', years: '1983–2019', side: 'portrait', expected_subject: 'Tim Rose',
    generated_at: new Date().toISOString(), control_sha256: sha(await readFile(CONTROL)), selector_artifact: control.selector_artifact, scope_artifact: control.scope_artifact,
    repository_hash_count: repository.size, actor_identity_bindings: control.actor_identity_pages.map(row => ({ key: row.key, provider: row.provider, source_page: row.url, binding: row.binding, page_evidence_key: row.key })),
    portrait_boundary: { exact_untransformed_tim_rose_portrait_required: true, other_tim_rose_people_forbidden: true, character_image_forbidden: true, caption_or_metadata_identity_required: true, existing_character_still_must_remain_unchanged: true },
    page_evidence, page_screenshots, api_evidence, candidates, candidate_count: candidates.length, contact_sheet: contactSheet,
    selection_contract: control.selection_contract, disposition: 'two-candidate-captioned-portrait-orbit-pending-visual-second-desk', canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-146', actor: 'Tim Rose', side: 'portrait', candidate_count: candidates.length,
    candidates: candidates.map(row => ({ key: row.key, file_title: row.file_title, source_page: row.source_page, local: row.local, mime: row.mime, bytes: row.bytes, sha256: row.sha256, width: row.width, height: row.height, license_short_name: row.license_short_name, artist: row.artist, api_sha256: row.api_sha256, repository_matches: row.repository_matches })),
    actor_identity_pages: control.actor_identity_pages.map(row => ({ key: row.key, provider: row.provider, url: row.url, screenshot_sha256: page_evidence[row.key]?.screenshot?.sha256 || null, body_sha256: page_evidence[row.key]?.body_sha256 || null })),
    contact_sheet: contactSheet, existing_character_still_unchanged: specimen.still, canonical_mutation: false
  });
  const cards = candidates.map((row, index) => `<article><img src="${row.local}" alt=""><h2>${index + 1}. ${row.file_title}</h2><p>${row.width}×${row.height}</p><p>${row.license_short_name || ''}</p><code>${row.sha256}</code></article>`).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.grid{display:grid;grid-template-columns:repeat(2,minmax(360px,1fr));gap:16px}article{background:white;padding:12px}article img{width:100%;height:620px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-146 · Tim Rose performer portrait orbit</h1><p>The portrait side requires the untransformed performer and excludes Ackbar, Salacious Crumb, other people named Tim Rose, and unlabeled group images.</p><div class="grid">${cards}</div>`);
  console.log(`PASS — UC-146 portrait discovery retained ${candidates.length} captioned Commons candidate(s)`);
  console.log(`CANDIDATES — ${candidates.map(row => `${row.key}:${row.width}x${row.height}:${row.sha256}`).join(' | ')}`);
  console.log(`MANIFEST — ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`SUMMARY — ${sha(await readFile(join(OUT, 'summary.json')))}`);
  console.log(`CONTACT — ${contactSheet.sha256}`);
  console.log(`OUTPUT — ${OUT}`);
} finally { await browser.close(); }
