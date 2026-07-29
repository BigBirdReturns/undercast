#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-176-DISCOVER.json';
const SCOPE_CONTROL = '.github/CARD-BACKFILL-UC-176.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-176-discover';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
};
const normalized = value => String(value || '').replace(/\s+/g, ' ').trim();

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
      const matches = map.get(row.sha256) || [];
      matches.push(`manifest:${path}`);
      map.set(row.sha256, matches);
    }
  } catch {}
  for (const path of await walkImages('images')) {
    try {
      const hash = sha(await readFile(path));
      const matches = map.get(hash) || [];
      matches.push(`file:${path}`);
      map.set(hash, matches);
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
      await page.waitForTimeout(200);
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
      failOnStatusCode: false
    });
    if (!response.ok()) throw browserError;
    const html = await response.text();
    const base = `<base href="${url}">`;
    const patched = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : `${base}${html}`;
    await page.setContent(patched, { waitUntil: 'domcontentloaded', timeout: control.transport_timeout_ms });
    return { response, transport: 'request-fallback' };
  }
}
function canonicalAscUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value).replace(/&amp;/g, '&'));
    if (url.hostname !== 'theasc.com' || !url.pathname.includes('/wp-content/uploads/') || !/Jekyll-Hyde-/i.test(url.pathname)) return null;
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/-\d+x\d+(?=\.(?:jpe?g|png|webp)$)/i, '');
    return url.toString();
  } catch {
    return null;
  }
}
function ascObviousExclusion(row) {
  const text = `${row.url} ${row.alt || ''} ${row.caption || ''}`.toLowerCase();
  const blocked = [
    '1920', 'john barrymore', 'stage play', 'promotional illustration', 'lab set', 'street set',
    'shooting', 'cast and crew', 'cinematographer', 'karl struss', 'take tea', 'servant',
    'ivy in the bedroom', 'jekyll and his fiancée', 'jekyll and his fiancee', 'table-2'
  ];
  return blocked.find(term => text.includes(term)) || null;
}
async function inspectSourcePage(context, source) {
  const page = await context.newPage();
  const screenshotPath = join(OUT, 'pages', `${source.key}.png`);
  const textPath = join(OUT, 'pages', `${source.key}.txt`);
  try {
    const { response, transport } = await navigateWithFallback(context, page, source.url);
    await page.waitForTimeout(1400);
    await acceptBanners(page);
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, 1400);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(300);
    const title = await page.title();
    const body = await page.locator('body').innerText().catch(() => '');
    const normalizedBody = normalized(body);
    const missing = source.required_terms.filter(term => !normalizedBody.toLowerCase().includes(normalized(term).toLowerCase()));
    if (source.strict) assert(missing.length === 0, `${source.key} missing required terms: ${missing.join(' | ')}`);
    const firstTerm = source.required_terms[0];
    const locator = page.getByText(firstTerm, { exact: false }).first();
    if (await locator.count().catch(() => 0)) await locator.scrollIntoViewIfNeeded().catch(() => {});
    await mkdir(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await writeFile(textPath, body.slice(0, 200000));
    const screenshotBytes = await readFile(screenshotPath);
    const textBytes = await readFile(textPath);
    let articleImages = [];
    if (source.key === 'asc-history') {
      articleImages = await page.evaluate(() => {
        const rows = [];
        for (const img of document.querySelectorAll('img')) {
          const figure = img.closest('figure');
          const caption = figure?.querySelector('figcaption')?.innerText || img.closest('div')?.querySelector('figcaption')?.innerText || '';
          const values = [img.currentSrc, img.src, img.getAttribute('data-src'), img.getAttribute('data-lazy-src')];
          for (const setName of ['srcset', 'data-srcset']) {
            const value = img.getAttribute(setName);
            if (value) for (const part of value.split(',')) values.push(part.trim().split(/\s+/)[0]);
          }
          for (const url of values.filter(Boolean)) rows.push({ url, alt: img.alt || '', caption });
        }
        for (const entry of performance.getEntriesByType('resource')) rows.push({ url: entry.name, alt: '', caption: '' });
        return rows;
      });
    }
    return {
      status: 'loaded', key: source.key, provider: source.provider, source_page: source.url,
      requested_url: source.url, resolved_url: page.url() || source.url, http_status: responseStatus(response), transport,
      title, required_terms: source.required_terms, required_terms_missing: missing,
      body_sha256: sha(Buffer.from(body, 'utf8')), body_excerpt: normalizedBody.slice(0, 4000),
      custody_type: source.custody_type, binding: source.binding,
      screenshot: { path: `pages/${basename(screenshotPath)}`, sha256: sha(screenshotBytes), bytes: screenshotBytes.length, ...identify(screenshotPath) },
      text_receipt: { path: `pages/${basename(textPath)}`, sha256: sha(textBytes), bytes: textBytes.length },
      article_images: articleImages
    };
  } finally {
    await page.close();
  }
}
function extValue(metadata, key) {
  return String(metadata?.[key]?.value || '');
}
function commonsExclusion(title, info) {
  const metadata = info.extmetadata || {};
  const text = `${title} ${extValue(metadata, 'ImageDescription')} ${extValue(metadata, 'Categories')} ${extValue(metadata, 'ObjectName')}`.toLowerCase();
  const blocked = ['poster', 'lobby card', 'transformation effect', 'sculpture', 'academy museum', 'replica', 'life mask'];
  return blocked.find(term => text.includes(term)) || null;
}
async function commonsOrbit(context) {
  const orbit = control.candidate_orbits.find(row => row.key === 'commons-1931-film-files');
  const response = await context.request.get(orbit.api, {
    params: {
      action: 'query', format: 'json', formatversion: '2', generator: 'categorymembers',
      gcmtitle: orbit.category, gcmtype: 'file', gcmlimit: '100',
      prop: 'imageinfo', iiprop: 'url|size|mime|sha1|timestamp|extmetadata'
    },
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    timeout: control.transport_timeout_ms,
    failOnStatusCode: false
  });
  assert(response.ok(), `Commons API HTTP ${response.status()}`);
  const json = await response.json();
  await writeJson(join(OUT, 'source-api-commons-category.json'), json);
  const pages = json.query?.pages || [];
  return pages.map(page => {
    const info = page.imageinfo?.[0] || {};
    return {
      source_family: 'commons', provider: 'Wikimedia Commons', source_page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title || '').replace(/ /g, '_'))}`,
      title: page.title, url: info.url, api_sha1: info.sha1 || null, api_timestamp: info.timestamp || null,
      api_width: info.width || null, api_height: info.height || null, api_mime: info.mime || null,
      extmetadata: info.extmetadata || {}, exclusion: commonsExclusion(page.title, info)
    };
  });
}
async function downloadCandidate(context, row, familyIndex, repository) {
  if (!row.url) return { ...row, retained: false, error: 'missing-url' };
  const response = await context.request.get(row.url, {
    headers: { 'User-Agent': UA, Referer: row.source_page, Accept: 'image/jpeg,image/png,image/webp,image/*,*/*;q=0.2' },
    timeout: control.transport_timeout_ms, failOnStatusCode: false
  });
  if (!response.ok()) return { ...row, retained: false, http_status: response.status(), error: 'HTTP' };
  const imageBytes = Buffer.from(await response.body());
  const detectedMime = signatureMime(imageBytes);
  if (imageBytes.length < 12000 || imageBytes.length > 25000000 || detectedMime === 'unknown') {
    return { ...row, retained: false, http_status: response.status(), bytes: imageBytes.length, detected_mime: detectedMime, error: 'unusable-bytes' };
  }
  const hash = sha(imageBytes);
  const local = `candidates/${row.source_family}/${String(familyIndex).padStart(2, '0')}.${extensionFor(detectedMime)}`;
  const path = join(OUT, local);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, imageBytes);
  const dimensions = identify(path);
  const repositoryMatches = repository.get(hash) || [];
  const meetsFloor = dimensions.width >= control.minimum_width && dimensions.height >= control.minimum_height;
  const retained = !row.exclusion && meetsFloor && repositoryMatches.length === 0;
  return {
    ...row, resolved_url: response.url() || row.url, local, detected_mime: detectedMime, bytes: imageBytes.length,
    sha256: hash, ...dimensions, aspect_ratio: Number((dimensions.width / dimensions.height).toFixed(6)),
    repository_matches: repositoryMatches, meets_floor: meetsFloor, retained,
    exclusion: row.exclusion || (!meetsFloor ? `below-source-floor-${control.minimum_width}x${control.minimum_height}` : repositoryMatches.length ? 'canonical-byte-duplicate' : null)
  };
}

const [controlBytes, scopeControlBytes] = await Promise.all([readFile(CONTROL), readFile(SCOPE_CONTROL)]);
const control = JSON.parse(controlBytes);
const scopeControl = JSON.parse(scopeControlBytes);
assert(control.version === 1 && control.record_id === 'UC-176' && control.actor === 'Fredric March' && control.character === 'Mr. Hyde' && control.production === 'Dr. Jekyll and Mr. Hyde (1931)' && control.years === '1931' && control.side === 'still', 'UC-176 discovery identity drift');
assert(control.selector_artifact?.artifact_id === 8742861304 && control.scope_artifact?.artifact_id === 8742954377 && control.scope_artifact?.scope_sha256 === '4eeebbb48fd8676285e368c1c9d56dabef31d034d1cd9328555014d11fbd337a', 'UC-176 upstream custody drift');
assert(control.source_pages?.length === 4 && control.candidate_orbits?.length === 2 && control.minimum_width === 500 && control.minimum_height === 400 && control.maximum_candidates === 40, 'UC-176 source denominator drift');
assert(control.selection_contract?.actor_role_evidence_must_be_independent_from_selected_image === true && control.selection_contract?.asc_makeup_design_custody_required === true && control.selection_contract?.visual_second_desk_required === true && control.selection_contract?.canonical_mutation === false, 'UC-176 selection contract drift');
assert(scopeControl.selector_artifact?.artifact_id === control.selector_artifact.artifact_id && sha(scopeControlBytes) === '0f1981c1257caa69fd46481d6486e3d6f8fbb4443ca9674ac43c9db2cd3277ab', 'UC-176 scope-control drift');
const specimen = (await readJson('data/specimens.json')).find(row => row.id === 'UC-176');
const source = (await readJson('data/SOURCES.json')).find(row => row.id === 'UC-176');
const audit = (await readJson('data/MEDIA-AUDIT.json')).items.find(row => row.id === control.audit_id);
assert(specimen && specimen.actor === 'Fredric March' && specimen.character === 'Mr. Hyde' && specimen.production === 'Dr. Jekyll and Mr. Hyde (1931)' && specimen.years === '1931' && specimen.designer === 'Wally Westmore' && specimen.transform === 4 && !specimen.still, 'UC-176 specimen drift');
assert(source && !source.still && source.portrait?.src === 'images/uc-176-portrait.jpg', 'UC-176 source-ledger drift');
assert(audit && audit.wall_id === 'UC-176' && audit.side === 'still' && audit.status === 'absent' && !audit.asset, 'UC-176 audit drift');

await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US', ignoreHTTPSErrors: true });
try {
  const pageEvidence = {};
  const ascRows = [];
  for (const sourcePage of control.source_pages) {
    const evidence = await inspectSourcePage(context, sourcePage);
    pageEvidence[sourcePage.key] = evidence;
    if (sourcePage.key === 'asc-history') {
      for (const row of evidence.article_images || []) {
        const url = canonicalAscUrl(row.url);
        if (!url) continue;
        ascRows.push({ source_family: 'asc', provider: sourcePage.provider, source_page: sourcePage.url, url, alt: row.alt, caption: row.caption, exclusion: ascObviousExclusion({ ...row, url }) });
      }
    }
  }
  for (const url of control.seed_urls) ascRows.push({ source_family: 'asc', provider: 'American Society of Cinematographers / American Cinematographer', source_page: control.source_pages.find(row => row.key === 'asc-history').url, url: canonicalAscUrl(url), alt: '', caption: 'Control-bound ASC historical-image seed', exclusion: null });
  const ascByUrl = new Map();
  for (const row of ascRows) {
    if (!row.url) continue;
    const prior = ascByUrl.get(row.url);
    if (!prior || (prior.exclusion && !row.exclusion)) ascByUrl.set(row.url, row);
  }
  const commonsRows = await commonsOrbit(context);
  const sourceRows = [...ascByUrl.values(), ...commonsRows];
  const attempts = [];
  const retainedByHash = new Map();
  const familyCounters = new Map();
  for (const row of sourceRows) {
    const nextIndex = (familyCounters.get(row.source_family) || 0) + 1;
    familyCounters.set(row.source_family, nextIndex);
    try {
      const result = await downloadCandidate(context, row, nextIndex, repository);
      attempts.push(result);
      if (result.retained && !retainedByHash.has(result.sha256)) retainedByHash.set(result.sha256, result);
    } catch (error) {
      attempts.push({ ...row, retained: false, error: error.message });
    }
  }
  const candidates = [...retainedByHash.values()].sort((a, b) => a.source_family.localeCompare(b.source_family) || (b.width * b.height - a.width * a.height) || a.local.localeCompare(b.local)).slice(0, control.maximum_candidates);
  assert(candidates.length >= 4, `UC-176 retained candidate orbit too small: ${candidates.length}`);
  assert(candidates.some(row => row.source_family === 'asc'), 'UC-176 ASC historical-image orbit empty');
  assert(pageEvidence['afi-catalog']?.required_terms_missing?.length === 0 && pageEvidence['oscars-1933']?.required_terms_missing?.length === 0 && pageEvidence['asc-history']?.required_terms_missing?.length === 0, 'UC-176 independent evidence pages incomplete');

  const thumbs = [];
  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    const label = `${row.source_family.toUpperCase()} ${String(i + 1).padStart(2, '0')} · ${row.width}x${row.height}`;
    const thumb = join(OUT, 'thumbs', `${row.source_family}-${String(i + 1).padStart(2, '0')}.jpg`);
    await mkdir(dirname(thumb), { recursive: true });
    magick(join(OUT, row.local), '-auto-orient', '-thumbnail', '340x360>', '-background', '#171512', '-gravity', 'center', '-extent', '340x360', '-fill', 'white', '-undercolor', '#171512dd', '-gravity', 'south', '-pointsize', '14', '-annotate', '+0+7', label, '-strip', '-quality', '88', thumb);
    thumbs.push(thumb);
  }
  const contactPath = join(OUT, 'contact-sheet.jpg');
  execFileSync('montage', [...thumbs, '-tile', '4x', '-geometry', '340x360+8+8', '-background', '#d5d0c7', contactPath], { stdio: 'inherit' });
  const contactBytes = await readFile(contactPath);
  const contactSheet = { path: 'contact-sheet.jpg', sha256: sha(contactBytes), bytes: contactBytes.length, ...identify(contactPath), candidate_count: candidates.length };
  const counts = candidates.reduce((out, row) => { out[row.source_family] = (out[row.source_family] || 0) + 1; return out; }, {});
  const exclusions = attempts.filter(row => !row.retained).map(row => ({ source_family: row.source_family, title: row.title || null, url: row.url || null, exclusion: row.exclusion || row.error || 'not-retained', width: row.width || null, height: row.height || null, sha256: row.sha256 || null }));
  const manifest = {
    version: 1, lane: 'card-backfill', record_id: 'UC-176', actor: 'Fredric March', character: 'Mr. Hyde', production: 'Dr. Jekyll and Mr. Hyde (1931)', years: '1931', side: 'still', generated_at: new Date().toISOString(),
    custody: { selector_artifact: control.selector_artifact, scope_artifact: control.scope_artifact, control_sha256: sha(controlBytes), scope_control_sha256: sha(scopeControlBytes) },
    repository_hash_count: repository.size, source_floor: { minimum_width: control.minimum_width, minimum_height: control.minimum_height },
    typed_evidence: {
      actor_role_performance: ['afi-catalog', 'oscars-1933', 'asc-history'],
      character_production_chronology: ['afi-catalog', 'asc-history'],
      makeup_design: ['asc-history'],
      visual_source_publication: ['asc-history', 'commons-category'],
      selected_image_must_not_prove_actor_role: true
    },
    chronology_boundary: {
      canonical_value: '1931',
      afi_new_york_opening: '31 Dec 1931',
      afi_release_date: '2 January 1932',
      ruling: 'The canonical 1931 production label remains intact while AFI’s exact opening and release-date boundary is retained rather than flattened.'
    },
    page_evidence: pageEvidence,
    commons_api_receipt: { path: 'source-api-commons-category.json', sha256: sha(await readFile(join(OUT, 'source-api-commons-category.json'))) },
    candidate_source_count: sourceRows.length, attempts, exclusions, candidates, candidate_count: candidates.length, candidate_counts: counts,
    contact_sheet: contactSheet, selected_candidate: null,
    selection_contract: control.selection_contract,
    disposition: 'independent-performance-production-design-and-visual-orbits-complete-pending-visual-second-desk',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-176', actor: 'Fredric March', character: 'Mr. Hyde', production: 'Dr. Jekyll and Mr. Hyde (1931)',
    independent_evidence_pages: Object.keys(pageEvidence), chronology_boundary: manifest.chronology_boundary,
    candidate_source_count: sourceRows.length, candidate_count: candidates.length, candidate_counts: counts,
    candidates, contact_sheet: contactSheet, selected_candidate: null, canonical_mutation: false
  });
  const cards = candidates.map((row, index) => `<article><img src="${row.local}" alt=""><h2>${row.source_family.toUpperCase()} ${String(index + 1).padStart(2, '0')}</h2><p>${row.width}×${row.height} · ${row.bytes} bytes</p><code>${row.sha256}</code><p>${row.title || row.alt || row.caption || ''}</p><p>${row.url}</p></article>`).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}article{background:white;padding:10px}img{width:100%;height:520px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}p{overflow-wrap:anywhere}</style><h1>UC-176 · Fredric March as Mr. Hyde · 1931 discovery orbit</h1><p>No candidate is selected. AFI, the Academy, and American Cinematographer separately establish performance, production, chronology, and makeup-design custody. Posters, lobby-card illustrations, modern replica sculptures, Jekyll-only images, other actors, and other adaptations remain forbidden.</p><div class="grid">${cards}</div>`);
  console.log(`PASS — UC-176 independent evidence pages complete`);
  console.log(`PASS — retained ${candidates.length} byte-distinct visual candidates: ${JSON.stringify(counts)}`);
  console.log(`PASS — duplicate screen against ${repository.size} canonical hashes`);
  console.log(`PENDING — visual second desk; no candidate selected; no canonical mutation`);
} finally {
  await context.close();
  await browser.close();
}
