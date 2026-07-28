#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-126-DISCOVER.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-126-discover';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha = value => createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[’‘]/g, "'")
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(?:[a-z][a-z0-9]{1,31}|#\d{1,7}|#x[0-9a-f]{1,6});/gi, ' ')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
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
  if (bytes.length >= 6 && ['GIF87a','GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif';
  return 'unknown';
}
function extensionFor(mime) {
  return mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/gif' ? 'gif' : 'bin';
}
function frameInput(path, mime = '') {
  return mime === 'image/gif' ? `${path}[0]` : path;
}
function identify(path, mime = '') {
  const text = execFileSync(process.env.MAGICK_CMD || 'magick', ['identify', '-format', '%w %h', frameInput(path, mime)], { encoding: 'utf8' }).trim();
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
async function acceptBanners(page) {
  for (const label of ['CONTINUE','Accept','I Accept','Agree','Allow all','Accept All','Accept Cookies','Close']) {
    const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
    if (await button.count().catch(() => 0)) {
      await button.first().click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(250);
    }
  }
}
async function navigateWithFallback(context, page, url, timeout) {
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    return { response, transport: 'browser-navigation' };
  } catch (browserError) {
    const response = await context.request.get(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
      timeout,
      failOnStatusCode: false
    });
    if (!response.ok()) throw browserError;
    const html = await response.text();
    const base = `<base href="${url}">`;
    const patched = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : `${base}${html}`;
    await page.setContent(patched, { waitUntil: 'domcontentloaded', timeout });
    return { response, transport: 'request-fallback' };
  }
}
function responseStatus(response) {
  if (!response) return null;
  return typeof response.status === 'function' ? response.status() : response.status;
}
async function inspectPage(context, spec, supplementalText = '') {
  const page = await context.newPage();
  const screenshot = `pages/${spec.key}.png`;
  try {
    const { response, transport } = await navigateWithFallback(context, page, spec.url, control.transport_timeout_ms);
    await page.waitForTimeout(1500);
    await acceptBanners(page);
    for (let index = 0; index < 8; index++) {
      await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(160);
    }
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content().catch(() => '');
    const title = await page.title();
    const hay = norm(`${title} ${body} ${html} ${supplementalText}`);
    const missing = (spec.required_terms || []).filter(term => !hay.includes(norm(term)));
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: false }).catch(() => {});
    let screenshotRecord = null;
    try {
      const bytes = await readFile(join(OUT, screenshot));
      screenshotRecord = { path: screenshot, sha256: sha(bytes), bytes: bytes.length, ...identify(join(OUT, screenshot), 'image/png') };
    } catch {}
    return {
      status: 'loaded',
      http_status: responseStatus(response),
      transport,
      title,
      resolved_url: page.url() || spec.url,
      required_terms: spec.required_terms || [],
      required_terms_missing: missing,
      body_text: body.slice(0, 60000),
      body_sha256: sha(Buffer.from(body.slice(0, 60000), 'utf8')),
      supplemental_text_sha256: supplementalText ? sha(Buffer.from(supplementalText, 'utf8')) : null,
      screenshot: screenshotRecord
    };
  } catch (error) {
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: false }).catch(() => {});
    let screenshotRecord = null;
    try {
      const bytes = await readFile(join(OUT, screenshot));
      screenshotRecord = { path: screenshot, sha256: sha(bytes), bytes: bytes.length, ...identify(join(OUT, screenshot), 'image/png') };
    } catch {}
    return {
      status: 'error',
      error: error.message,
      required_terms: spec.required_terms || [],
      required_terms_missing: spec.required_terms || [],
      supplemental_text_sha256: supplementalText ? sha(Buffer.from(supplementalText, 'utf8')) : null,
      screenshot: screenshotRecord
    };
  } finally {
    await page.close();
  }
}
function apiUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.href;
}
async function requestJson(context, url, referer) {
  const response = await context.request.get(url, {
    headers: { 'User-Agent': UA, Referer: referer, Accept: 'application/json,text/plain,*/*' },
    timeout: control.transport_timeout_ms,
    failOnStatusCode: false
  });
  assert(response.ok(), `API HTTP ${response.status()} for ${url}`);
  return response.json();
}
function pageArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}
function revisionContent(page) {
  const revision = page?.revisions?.[0];
  return revision?.slots?.main?.content ?? revision?.slots?.main?.['*'] ?? revision?.content ?? revision?.['*'] ?? '';
}
function metadataText(info) {
  const ext = info?.extmetadata || {};
  return [
    ext.ImageDescription?.value,
    ext.ObjectName?.value,
    ext.Categories?.value,
    ext.DateTimeOriginal?.value,
    ext.DateTime?.value,
    ext.Artist?.value,
    ext.Credit?.value,
    ext.UsageTerms?.value
  ].filter(Boolean).join(' ');
}
function scoreImage(role, row, pageImageTitle) {
  const text = norm(`${row.title} ${row.url} ${row.thumburl || ''} ${row.metadata_text || ''}`);
  const positive = role.positive_era_terms.filter(term => text.includes(norm(term)));
  const negative = role.negative_era_terms.filter(term => text.includes(norm(term)));
  const filenameMatches = role.filename_terms.filter(term => text.includes(norm(term)));
  let score = 0;
  score += filenameMatches.length * 70;
  score += positive.length * 26;
  score -= negative.length * 70;
  if (row.title === pageImageTitle) score += 45;
  if (row.width >= 1000 || row.height >= 1000) score += 12;
  if (row.width >= 600 && row.height >= 600) score += 8;
  if (/poster|cover|logo|icon|banner|wordmark|title card|dvd|blu ray|toy|figure|game|merch|cosplay|fan art|template/i.test(`${row.title} ${row.metadata_text || ''}`)) score -= 100;
  const roleSignal = filenameMatches.length > 0 || row.title === pageImageTitle;
  return { score, positive, negative, filenameMatches, roleSignal };
}
async function fetchRoleApi(context, role) {
  const primaryUrl = apiUrl(role.api_url, {
    action: 'query', format: 'json', formatversion: 2, redirects: 1,
    prop: 'revisions|pageimages', rvprop: 'content', rvslots: 'main', rvlimit: 1,
    piprop: 'name|original|thumbnail', pithumbsize: 1600,
    titles: role.api_title, origin: '*'
  });
  const primary = await requestJson(context, primaryUrl, role.url);
  const page = pageArray(primary?.query?.pages)[0];
  assert(page && !page.missing, `${role.key} API page missing`);
  const rawWikitext = revisionContent(page);
  assert(rawWikitext.length > 100, `${role.key} raw revision missing`);

  const imageTitles = [];
  const seenTitles = new Set();
  const addTitle = title => {
    if (title && !seenTitles.has(title)) {
      seenTitles.add(title);
      imageTitles.push(title);
    }
  };
  if (page.pageimage) addTitle(`File:${page.pageimage}`);
  let imcontinue = null;
  for (let pageIndex = 0; pageIndex < 12; pageIndex++) {
    const imageUrl = apiUrl(role.api_url, {
      action: 'query', format: 'json', formatversion: 2, redirects: 1,
      prop: 'images', imlimit: 'max', imcontinue, titles: role.api_title, origin: '*'
    });
    const imageResult = await requestJson(context, imageUrl, role.url);
    const imagePage = pageArray(imageResult?.query?.pages)[0];
    for (const row of imagePage?.images || []) addTitle(row.title);
    imcontinue = imageResult?.continue?.imcontinue || null;
    if (!imcontinue || imageTitles.length >= 1600) break;
  }

  const rows = [];
  for (let start = 0; start < imageTitles.length; start += 40) {
    const batch = imageTitles.slice(start, start + 40);
    const detailUrl = apiUrl(role.api_url, {
      action: 'query', format: 'json', formatversion: 2, redirects: 1,
      prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: 1600,
      titles: batch.join('|'), origin: '*'
    });
    const detail = await requestJson(context, detailUrl, role.url);
    for (const imagePage of pageArray(detail?.query?.pages)) {
      const info = imagePage.imageinfo?.[0];
      if (!info?.url) continue;
      rows.push({
        title: imagePage.title,
        url: info.url,
        thumburl: info.thumburl || null,
        mime: info.mime || null,
        width: info.width || 0,
        height: info.height || 0,
        metadata_text: metadataText(info),
        extmetadata: info.extmetadata || {}
      });
    }
  }
  if (page.original?.source && !rows.some(row => row.url === page.original.source)) {
    rows.push({
      title: page.pageimage ? `File:${page.pageimage}` : `PageImage:${role.api_title}`,
      url: page.original.source,
      thumburl: page.thumbnail?.source || null,
      mime: null,
      width: page.original.width || 0,
      height: page.original.height || 0,
      metadata_text: '',
      extmetadata: {}
    });
  }
  const pageImageTitle = page.pageimage ? `File:${page.pageimage}` : null;
  const scored = rows.map(row => ({ ...row, ...scoreImage(role, row, pageImageTitle) }));
  const filtered = scored
    .filter(row => row.roleSignal)
    .filter(row => row.score > -100)
    .sort((a, b) => b.score - a.score || (b.width * b.height - a.width * a.height) || a.title.localeCompare(b.title))
    .slice(0, control.maximum_candidates_per_role);
  return {
    api_title: role.api_title,
    resolved_title: page.title,
    page_id: page.pageid || null,
    raw_wikitext: rawWikitext,
    raw_wikitext_sha256: sha(Buffer.from(rawWikitext, 'utf8')),
    pageimage: page.pageimage || null,
    original: page.original || null,
    thumbnail: page.thumbnail || null,
    image_title_count: imageTitles.length,
    raw_image_info_count: rows.length,
    candidates: filtered
  };
}
async function downloadCandidate(context, role, row, index) {
  const probes = [];
  const add = (url, kind) => { if (url && !probes.some(probe => probe.url === url)) probes.push({ url, kind }); };
  add(row.thumburl, 'api-1600-thumbnail');
  add(row.url, 'api-original');
  for (const probe of probes) {
    try {
      const response = await context.request.get(probe.url, {
        headers: { 'User-Agent': UA, Referer: role.url, Accept: 'image/jpeg,image/webp,image/png,image/gif,image/*,*/*;q=0.2' },
        timeout: control.transport_timeout_ms,
        failOnStatusCode: false
      });
      if (!response.ok()) continue;
      const bytes = Buffer.from(await response.body());
      const mime = signatureMime(bytes);
      if (bytes.length < 7000 || mime === 'unknown') continue;
      const local = `candidates/${role.key}/${String(index).padStart(3, '0')}-${slug(row.title)}.${extensionFor(mime)}`;
      const path = join(OUT, local);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
      let dimensions = { width: 0, height: 0 };
      try { dimensions = identify(path, mime); } catch {}
      if (dimensions.width < 180 || dimensions.height < 180) continue;
      return {
        role_key: role.key,
        role: role.role,
        display_label: role.display_label,
        provider: role.provider,
        source_page: role.url,
        api_title: role.api_title,
        file_title: row.title,
        declared_url: row.url,
        probe_url: probe.url,
        probe_kind: probe.kind,
        resolved_url: response.url() || probe.url,
        local,
        mime,
        bytes: bytes.length,
        sha256: sha(bytes),
        ...dimensions,
        score: row.score,
        positive_era_terms: row.positive,
        negative_era_terms: row.negative,
        filename_terms: row.filenameMatches,
        metadata_text: row.metadata_text || '',
        role_signal: row.roleSignal === true
      };
    } catch {}
  }
  return { role_key: role.key, role: role.role, file_title: row.title, declared_url: row.url, download_error: 'no usable image delivery' };
}
async function buildContactSheet(role, candidates) {
  const thumbs = [];
  await mkdir(join(OUT, 'thumbs', role.key), { recursive: true });
  for (let index = 0; index < candidates.length; index++) {
    const row = candidates[index];
    const thumb = join(OUT, 'thumbs', role.key, `${String(index + 1).padStart(2, '0')}.jpg`);
    const label = `${index + 1} · ${row.width}x${row.height} · score ${row.score} · ${row.file_title.replace(/^File:/, '').slice(0, 42)}`;
    magick(frameInput(join(OUT, row.local), row.mime), '-auto-orient', '-thumbnail', '520x380>', '-background', '#171512', '-gravity', 'center', '-extent', '520x380', '-fill', 'white', '-undercolor', '#171512dd', '-gravity', 'south', '-pointsize', '13', '-annotate', '+0+6', label, '-strip', '-quality', '88', thumb);
    thumbs.push(thumb);
  }
  const relative = `contact-sheet-${role.key}.jpg`;
  const path = join(OUT, relative);
  execFileSync('montage', [...thumbs, '-tile', '3x', '-geometry', '520x380+10+10', '-background', '#e8e3d9', path], { stdio: 'inherit' });
  return { path: relative, sha256: sha(await readFile(path)), ...identify(path, 'image/jpeg'), count: candidates.length };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-126', 'UC-126 discovery scope drift');
assert(control.actor === 'Tara Strong' && control.character === 'Bubbles, Timmy, Harley & Twilight' && control.production === 'Powerpuff Girls / Fairly OddParents / etc.' && control.year === 1998 && control.side === 'still', 'UC-126 discovery identity drift');
assert(control.selector_artifact?.artifact_id === 8706098863 && control.scope_artifact?.artifact_id === 8706377703 && control.scope_artifact?.scope_sha256 === '231d0799b8cd0d980fb7d406258eb9bd79b021d0ec9b70fad9d893f0070c35f4', 'UC-126 discovery custody drift');
assert(control.actor_role_pages?.length === 5 && control.actor_role_pages.filter(row => row.strict).length === 3 && control.actor_role_pages.filter(row => row.reference_only).length === 2, 'UC-126 actor-role denominator drift');
assert(control.role_pages?.length === 4 && control.role_pages.every(row => row.strict) && control.selection_contract?.required_role_keys?.length === 4, 'UC-126 role denominator drift');
assert(control.selection_contract?.exact_four_role_composite_required === true && control.selection_contract?.original_1998_bubbles_required === true && control.selection_contract?.tara_strong_timmy_main_series_required === true && control.selection_contract?.named_dc_super_hero_girls_harley_continuity_required === true && control.selection_contract?.friendship_is_magic_twilight_required === true && control.selection_contract?.canonical_1998_is_bubbles_chronology_only === true && control.selection_contract?.all_four_panels_required === true && control.selection_contract?.canonical_mutation === false, 'UC-126 selection contract drift');
const specimen = (await readJson('data/specimens.json')).find(row => row.id === 'UC-126');
const source = (await readJson('data/SOURCES.json')).find(row => row.id === 'UC-126');
const audit = (await readJson('data/MEDIA-AUDIT.json')).items.find(row => row.id === control.audit_id);
assert(specimen && specimen.actor === 'Tara Strong' && specimen.character === 'Bubbles, Timmy, Harley & Twilight' && specimen.production === 'Powerpuff Girls / Fairly OddParents / etc.' && specimen.years === '1998' && !specimen.still, 'UC-126 specimen boundary drift');
assert(!source?.still && audit?.status === 'absent' && !audit?.asset, 'UC-126 canonical absence drift');
await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US', ignoreHTTPSErrors: true });
try {
  const page_evidence = {};
  const page_screenshots = [];
  for (const pageSpec of control.actor_role_pages) {
    if (pageSpec.reference_only === true) {
      page_evidence[pageSpec.key] = {
        status: 'reference-only-external-verification',
        provider: pageSpec.provider,
        resolved_url: pageSpec.url,
        required_terms: pageSpec.required_terms,
        required_terms_missing: [],
        externally_verified: pageSpec.externally_verified === true
      };
      continue;
    }
    const evidence = await inspectPage(context, pageSpec);
    page_evidence[pageSpec.key] = evidence;
    assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${pageSpec.key} actor-role transport failed`);
    assert(evidence.required_terms_missing.length === 0, `${pageSpec.key} actor-role terms missing: ${evidence.required_terms_missing.join(', ')}`);
    if (evidence.screenshot) page_screenshots.push({ key: pageSpec.key, provider: pageSpec.provider, ...evidence.screenshot });
  }

  const api_evidence = {};
  const attempted = [];
  const candidates = [];
  const role_contacts = {};
  const seenHashes = new Map();
  for (const role of control.role_pages) {
    const api = await fetchRoleApi(context, role);
    const rawPath = `api-wikitext/${role.key}.txt`;
    await mkdir(join(OUT, 'api-wikitext'), { recursive: true });
    await writeFile(join(OUT, rawPath), api.raw_wikitext + '\n');
    const retainedRawBytes = await readFile(join(OUT, rawPath));
    const evidenceHay = norm(`${api.resolved_title} ${api.raw_wikitext}`);
    const missingWikitextTerms = role.required_wikitext_terms.filter(term => !evidenceHay.includes(norm(term)));
    api_evidence[role.key] = {
      requested_api_title: role.api_title,
      resolved_title: api.resolved_title,
      page_id: api.page_id,
      raw_wikitext_sha256: api.raw_wikitext_sha256,
      retained_wikitext_path: rawPath,
      retained_wikitext_sha256: sha(retainedRawBytes),
      retained_wikitext_bytes: retainedRawBytes.length,
      required_wikitext_terms: role.required_wikitext_terms,
      required_wikitext_terms_missing: missingWikitextTerms,
      pageimage: api.pageimage,
      original: api.original,
      thumbnail: api.thumbnail,
      image_title_count: api.image_title_count,
      raw_image_info_count: api.raw_image_info_count,
      filtered_candidate_count: api.candidates.length
    };
    assert(missingWikitextTerms.length === 0, `${role.key} raw revision terms missing: ${missingWikitextTerms.join(', ')}`);

    const browserEvidence = await inspectPage(context, { ...role, required_terms: [] }, api.raw_wikitext);
    page_evidence[role.key] = browserEvidence;
    if (browserEvidence.screenshot) page_screenshots.push({ key: role.key, provider: role.provider, browser_optional: true, ...browserEvidence.screenshot });

    let index = 0;
    const roleCandidates = [];
    for (const row of api.candidates) {
      const result = await downloadCandidate(context, role, row, ++index);
      attempted.push(result);
      if (!result.sha256 || result.download_error) continue;
      if (seenHashes.has(result.sha256)) {
        result.visual_byte_duplicate = true;
        result.duplicate_of = seenHashes.get(result.sha256);
        continue;
      }
      seenHashes.set(result.sha256, result.local);
      result.repository_matches = repository.get(result.sha256) || [];
      roleCandidates.push(result);
      candidates.push(result);
    }
    assert(roleCandidates.length >= control.minimum_candidates_per_role, `UC-126 ${role.key} orbit produced only ${roleCandidates.length} usable candidate(s)`);
    roleCandidates.sort((a, b) => b.score - a.score || (b.width * b.height - a.width * a.height) || a.local.localeCompare(b.local));
    role_contacts[role.key] = await buildContactSheet(role, roleCandidates);
  }

  const roleCounts = Object.fromEntries(control.role_pages.map(role => [role.key, candidates.filter(row => row.role_key === role.key).length]));
  assert(control.selection_contract.required_role_keys.every(key => roleCounts[key] >= control.minimum_candidates_per_role), `UC-126 role coverage drift ${JSON.stringify(roleCounts)}`);
  const allContactPath = join(OUT, 'contact-sheet-all-roles.jpg');
  execFileSync('montage', control.role_pages.flatMap(role => [join(OUT, role_contacts[role.key].path)]).concat(['-tile', '2x2', '-geometry', '+12+12', '-background', '#d5d0c7', allContactPath]), { stdio: 'inherit' });
  const allContact = { path: 'contact-sheet-all-roles.jpg', sha256: sha(await readFile(allContactPath)), ...identify(allContactPath, 'image/jpeg'), role_counts: roleCounts };

  const manifest = {
    version: 1,
    lane: 'card-backfill',
    record_id: 'UC-126',
    actor: 'Tara Strong',
    character: 'Bubbles, Timmy, Harley & Twilight',
    production: 'Powerpuff Girls / Fairly OddParents / etc.',
    year: 1998,
    side: 'still',
    expected_subject: 'Bubbles, Timmy, Harley & Twilight',
    generated_at: new Date().toISOString(),
    control_sha256: sha(await readFile(CONTROL)),
    selector_artifact: control.selector_artifact,
    scope_artifact: control.scope_artifact,
    repository_hash_count: repository.size,
    actor_role_bindings: control.actor_role_pages.map(row => ({ key: row.key, provider: row.provider, source_page: row.url, binding: row.binding, strict: row.strict === true, reference_only: row.reference_only === true, page_evidence_key: row.key })),
    chronology_boundary: {
      canonical_year_semantics: '1998 is original Powerpuff Girls and Bubbles chronology only.',
      timmy_boundary: 'Timmy Turner requires independent main-series Fairly OddParents and Tara Strong custody.',
      harley_boundary: 'Harley Quinn is fixed to the named DC Super Hero Girls continuity used by the role evidence.',
      twilight_boundary: 'Twilight Sparkle is fixed to the Friendship is Magic-era role performed by Tara Strong.'
    },
    page_evidence,
    page_screenshots,
    api_evidence,
    attempted,
    candidates,
    candidate_count: candidates.length,
    role_counts: roleCounts,
    role_contact_sheets: role_contacts,
    contact_sheet: allContact,
    selection_contract: control.selection_contract,
    disposition: 'four-role-candidate-orbit-pending-visual-second-desk',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-126',
    actor: 'Tara Strong',
    character: 'Bubbles, Timmy, Harley & Twilight',
    production: 'Powerpuff Girls / Fairly OddParents / etc.',
    role_counts: roleCounts,
    candidate_count: candidates.length,
    candidates: candidates.map(row => ({ role_key: row.role_key, role: row.role, file_title: row.file_title, local: row.local, mime: row.mime, bytes: row.bytes, sha256: row.sha256, width: row.width, height: row.height, score: row.score, positive_era_terms: row.positive_era_terms, negative_era_terms: row.negative_era_terms, repository_matches: row.repository_matches })),
    actor_role_pages: control.actor_role_pages.map(row => ({ key: row.key, provider: row.provider, url: row.url, strict: row.strict === true, reference_only: row.reference_only === true, screenshot_sha256: page_evidence[row.key]?.screenshot?.sha256 || null, body_sha256: page_evidence[row.key]?.body_sha256 || null })),
    role_contact_sheets: role_contacts,
    contact_sheet: allContact,
    canonical_1998_is_bubbles_chronology_only: true,
    canonical_mutation: false
  });
  const roleSections = control.role_pages.map(role => {
    const rows = candidates.filter(row => row.role_key === role.key).map((row, index) => `<article><img src="${row.local}" alt=""><h3>${index + 1}. ${row.file_title}</h3><p>${row.width}×${row.height} · score ${row.score}</p><p>positive: ${row.positive_era_terms.join(', ') || 'none'}<br>negative: ${row.negative_era_terms.join(', ') || 'none'}</p><code>${row.sha256}</code></article>`).join('');
    return `<h2>${role.role}</h2><div class="grid">${rows}</div>`;
  }).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}article{background:white;padding:10px}article img{width:100%;height:320px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-126 · Tara Strong four-role image orbit</h1><p>1998 remains original Powerpuff Girls and Bubbles chronology only.</p>${roleSections}`);
  console.log(`PASS — UC-126 discovery retained ${candidates.length} byte-distinct role candidate(s)`);
  console.log(`ROLES — ${JSON.stringify(roleCounts)}`);
  console.log(`MANIFEST — ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`SUMMARY — ${sha(await readFile(join(OUT, 'summary.json')))}`);
  console.log(`CONTACT — ${allContact.sha256}`);
  console.log(`OUTPUT — ${OUT}`);
} finally {
  await browser.close();
}
