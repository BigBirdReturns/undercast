#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-170-DISCOVER.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-170-discover';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha = value => createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/<[^>]+>/g, ' ').replace(/&(?:[a-z][a-z0-9]{1,31}|#\d{1,7}|#x[0-9a-f]{1,6});/gi, ' ').replace(/[^a-zA-Z0-9']+/g, ' ').trim().toLowerCase();
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
  try {
    const manifest = await readJson('data/media-manifest.json');
    for (const [path, row] of Object.entries(manifest.assets || {})) {
      if (!/^[0-9a-f]{64}$/i.test(row?.sha256 || '')) continue;
      const list = map.get(row.sha256) || []; list.push(`manifest:${path}`); map.set(row.sha256, list);
    }
  } catch {}
  for (const path of await walkImages('images')) { try { const hash = sha(await readFile(path)); const list = map.get(hash) || []; list.push(`file:${path}`); map.set(hash, list); } catch {} }
  return map;
}
function apiUrl(base, params) { const url = new URL(base); for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined) url.searchParams.set(key, String(value)); return url.href; }
function responseStatus(response) { return response ? (typeof response.status === 'function' ? response.status() : response.status) : null; }
function revisionContent(page) { return page?.revisions?.[0]?.slots?.main?.content ?? page?.revisions?.[0]?.['*'] ?? ''; }
async function acceptBanners(page) {
  for (const label of ['CONTINUE','Accept','I Accept','Agree','Allow all','Accept All','Accept Cookies','Close']) {
    const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
    if (await button.count().catch(() => 0)) { await button.first().click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(250); }
  }
}
async function navigateWithFallback(context, page, url) {
  try { return { response: await page.goto(url, { waitUntil: 'domcontentloaded', timeout: control.transport_timeout_ms }), transport: 'browser-navigation' }; }
  catch (browserError) {
    const response = await context.request.get(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }, timeout: control.transport_timeout_ms, failOnStatusCode: false });
    if (!response.ok()) throw browserError;
    const html = await response.text();
    const base = `<base href="${url}">`;
    const patched = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : `${base}${html}`;
    await page.setContent(patched, { waitUntil: 'domcontentloaded', timeout: control.transport_timeout_ms });
    return { response, transport: 'request-fallback' };
  }
}
async function inspectPage(context, spec) {
  const page = await context.newPage();
  const screenshotPath = join(OUT, 'pages', `${spec.key}.png`);
  try {
    const { response, transport } = await navigateWithFallback(context, page, spec.url);
    await page.waitForTimeout(1400); await acceptBanners(page);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(140); }
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content().catch(() => '');
    const title = await page.title();
    const hay = norm(`${title} ${body} ${html}`);
    const missing = spec.required_terms.filter(term => !hay.includes(norm(term)));
    await mkdir(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const bytes = await readFile(screenshotPath);
    return {
      status: 'loaded', http_status: responseStatus(response), transport, title, resolved_url: page.url() || spec.url,
      required_terms: spec.required_terms, required_terms_missing: missing,
      body_text: body.slice(0, 60000), body_sha256: sha(Buffer.from(body.slice(0, 60000), 'utf8')),
      screenshot: { path: `pages/${spec.key}.png`, sha256: sha(bytes), bytes: bytes.length, ...identify(screenshotPath) }
    };
  } catch (error) {
    await mkdir(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
    let screenshot = null;
    try { const bytes = await readFile(screenshotPath); screenshot = { path: `pages/${spec.key}.png`, sha256: sha(bytes), bytes: bytes.length, ...identify(screenshotPath) }; } catch {}
    return { status: 'error', error: error.message, required_terms: spec.required_terms, required_terms_missing: spec.required_terms, screenshot };
  } finally { await page.close(); }
}
async function requestJson(context, url, referer) {
  const response = await context.request.get(url, { headers: { 'User-Agent': UA, Referer: referer, Accept: 'application/json,*/*;q=0.8' }, timeout: control.transport_timeout_ms, failOnStatusCode: false });
  assert(response.ok(), `API HTTP ${response.status()} for ${url}`);
  return response.json();
}
function imageMetadata(info) {
  const ext = info?.extmetadata || {};
  return [ext.ObjectName?.value, ext.ImageDescription?.value, ext.Categories?.value, ext.Artist?.value, ext.Credit?.value, ext.LicenseShortName?.value, ext.UsageTerms?.value].filter(Boolean).join(' ');
}
function titleAllowed(role, title, metadata = '') {
  const hay = norm(`${title} ${metadata}`);
  if (!role.required_image_title_terms.some(term => hay.includes(norm(term)))) return false;
  return !role.forbidden_image_title_terms.some(term => hay.includes(norm(term)));
}
async function downloadImage(context, role, source, index) {
  const urls = [...new Set([source.original_url, source.thumbnail_url].filter(Boolean))];
  const attempts = [];
  for (const url of urls) {
    try {
      const response = await context.request.get(url, { headers: { 'User-Agent': UA, Referer: role.page_url, Accept: 'image/jpeg,image/png,image/webp,image/*,*/*;q=0.2' }, timeout: control.transport_timeout_ms, failOnStatusCode: false });
      if (!response.ok()) { attempts.push({ url, status: response.status(), error: 'http' }); continue; }
      const bytes = Buffer.from(await response.body());
      const mime = signatureMime(bytes);
      if (bytes.length < 9000 || mime === 'unknown') { attempts.push({ url, status: response.status(), bytes: bytes.length, mime, error: 'unusable' }); continue; }
      const hash = sha(bytes);
      const local = `candidates/${role.key}/${String(index).padStart(3, '0')}-${slug(source.file_title)}.${extensionFor(mime)}`;
      const path = join(OUT, local); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
      const dimensions = identify(path);
      const row = { url, resolved_url: response.url() || url, local, mime, bytes: bytes.length, sha256: hash, ...dimensions };
      attempts.push(row);
      if (dimensions.width >= control.minimum_width && dimensions.height >= control.minimum_height) return { selected: row, attempts };
    } catch (error) { attempts.push({ url, error: error.message }); }
  }
  return { selected: null, attempts };
}
async function fetchRole(context, role) {
  const primaryUrl = apiUrl(role.api_url, {
    action: 'query', format: 'json', formatversion: 2, redirects: 1,
    prop: 'revisions|pageimages|images', rvprop: 'content', rvslots: 'main', rvlimit: 1,
    piprop: 'name|original|thumbnail', pithumbsize: 1600, imlimit: 'max', titles: role.api_title, origin: '*'
  });
  const primary = await requestJson(context, primaryUrl, role.page_url);
  const page = primary?.query?.pages?.[0];
  assert(page && !page.missing, `${role.key} API page missing`);
  const raw = revisionContent(page);
  assert(raw, `${role.key} raw revision missing`);
  const missingTerms = role.required_terms.filter(term => !norm(raw).includes(norm(term)));
  assert(missingTerms.length === 0, `${role.key} raw terms missing: ${missingTerms.join(', ')}`);
  await mkdir(join(OUT, 'api'), { recursive: true });
  await mkdir(join(OUT, 'raw'), { recursive: true });
  const primaryPath = `api/${role.key}-page.json`;
  const rawPath = `raw/${role.key}.wikitext`;
  await writeJson(join(OUT, primaryPath), primary);
  await writeFile(join(OUT, rawPath), raw);

  const titles = [];
  const addTitle = value => { if (value && !titles.includes(value)) titles.push(value); };
  addTitle(page.pageimage ? `File:${String(page.pageimage).replace(/^File:/i, '')}` : null);
  for (const row of page.images || []) addTitle(row.title);
  const filteredTitles = titles.filter(title => titleAllowed(role, title));
  assert(filteredTitles.length >= 1, `${role.key} image title inventory empty after role filter`);
  const imagePages = [];
  for (let offset = 0; offset < filteredTitles.length; offset += 40) {
    const batch = filteredTitles.slice(offset, offset + 40);
    const imageUrl = apiUrl(role.api_url, {
      action: 'query', format: 'json', formatversion: 2, redirects: 1,
      prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: 1600,
      titles: batch.join('|'), origin: '*'
    });
    const imageJson = await requestJson(context, imageUrl, role.page_url);
    const batchPath = `api/${role.key}-images-${String(offset / 40 + 1).padStart(2, '0')}.json`;
    await writeJson(join(OUT, batchPath), imageJson);
    for (const imagePage of imageJson?.query?.pages || []) imagePages.push({ ...imagePage, api_path: batchPath });
  }
  if (page.original?.source && page.pageimage) {
    imagePages.unshift({
      title: `File:${String(page.pageimage).replace(/^File:/i, '')}`,
      imageinfo: [{ url: page.original.source, thumburl: page.thumbnail?.source || null, width: page.original.width, height: page.original.height, mime: null, extmetadata: {} }],
      api_path: primaryPath,
      pageimage_source: true
    });
  }

  const candidates = [];
  const attempts = [];
  const seenHashes = new Set();
  let index = 0;
  for (const imagePage of imagePages) {
    if (candidates.length >= control.selection_contract.maximum_candidates_per_role) break;
    const info = imagePage.imageinfo?.[0];
    if (!info?.url) continue;
    const metadata = imageMetadata(info);
    if (!titleAllowed(role, imagePage.title, metadata)) continue;
    const source = {
      file_title: imagePage.title,
      original_url: info.url,
      thumbnail_url: info.thumburl || null,
      metadata,
      license_short_name: info.extmetadata?.LicenseShortName?.value || null,
      artist: info.extmetadata?.Artist?.value || null,
      description: info.extmetadata?.ImageDescription?.value || null,
      api_path: imagePage.api_path,
      pageimage_source: imagePage.pageimage_source === true
    };
    const result = await downloadImage(context, role, source, ++index);
    attempts.push({ file_title: source.file_title, ...result, source });
    if (!result.selected || seenHashes.has(result.selected.sha256)) continue;
    seenHashes.add(result.selected.sha256);
    const repositoryMatches = repository.get(result.selected.sha256) || [];
    if (repositoryMatches.length) continue;
    candidates.push({
      role_key: role.key, role: role.role, display_label: role.display_label,
      provider: `${new URL(role.api_url).hostname} MediaWiki`, source_page: role.page_url, resolved_title: page.title,
      file_title: source.file_title, original_url: source.original_url, thumbnail_url: source.thumbnail_url,
      metadata: source.metadata, license_short_name: source.license_short_name, artist: source.artist,
      description: source.description, api_path: source.api_path, pageimage_source: source.pageimage_source,
      raw_revision_path: rawPath, raw_revision_sha256: sha(Buffer.from(raw, 'utf8')),
      chronology: role.chronology, required_actor_role_page_key: role.required_actor_role_page_key,
      ...result.selected, repository_matches
    });
  }
  assert(candidates.length >= control.selection_contract.minimum_candidates_per_role, `${role.key} produced ${candidates.length} usable candidate(s)`);
  candidates.sort((a, b) => Number(Boolean(b.pageimage_source)) - Number(Boolean(a.pageimage_source)) || (b.width * b.height - a.width * a.height) || b.bytes - a.bytes || a.file_title.localeCompare(b.file_title));
  return {
    role_key: role.key, role: role.role, display_label: role.display_label,
    page_url: role.page_url, api_url: role.api_url, requested_title: role.api_title, resolved_title: page.title,
    required_terms: role.required_terms, raw_revision_path: rawPath, raw_revision_sha256: sha(Buffer.from(raw, 'utf8')),
    primary_api_path: primaryPath, primary_api_sha256: sha(await readFile(join(OUT, primaryPath))),
    image_title_count: titles.length, filtered_image_title_count: filteredTitles.length,
    attempts, candidates
  };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-170', 'UC-170 discovery scope drift');
assert(control.kind === 'voice' && control.actor === 'Maurice LaMarche' && control.character === 'The Brain, Kif Kroker, Egon Spengler' && control.production === 'Animaniacs / Futurama' && control.years === '1980s–' && control.side === 'still', 'UC-170 discovery identity drift');
assert(control.selector_artifact?.artifact_id === 8712290331 && control.scope_artifact?.artifact_id === 8712363186 && control.scope_artifact?.scope_sha256 === '34a98dd77320a26cc03f156375a35a11a3eaec8fd8cbefd8746aa27bf58e56ec', 'UC-170 discovery custody drift');
assert(control.actor_role_pages?.length === 4 && control.actor_role_pages.every(row => row.strict) && control.roles?.length === 3, 'UC-170 discovery denominator drift');
assert(control.selection_contract?.exact_three_role_animated_character_composite_required === true && JSON.stringify(control.selection_contract?.required_roles) === JSON.stringify(['brain','kif','egon']) && control.selection_contract?.minimum_candidates_per_role === 1 && control.selection_contract?.maximum_candidates_per_role === 24 && control.selection_contract?.raw_revision_and_image_metadata_required_for_each_role === true && control.selection_contract?.canonical_mutation === false, 'UC-170 selection contract drift');
const specimen = (await readJson('data/specimens.json')).find(row => row.id === 'UC-170');
const source = (await readJson('data/SOURCES.json')).find(row => row.id === 'UC-170');
const audit = (await readJson('data/MEDIA-AUDIT.json')).items.find(row => row.id === control.audit_id);
assert(specimen && specimen.kind === 'voice' && specimen.actor === 'Maurice LaMarche' && specimen.character === 'The Brain, Kif Kroker, Egon Spengler' && specimen.production === 'Animaniacs / Futurama' && specimen.years === '1980s–' && !specimen.still && specimen.portrait?.src === 'images/uc-170-portrait.jpg', 'UC-170 specimen boundary drift');
assert(!source?.still && source?.portrait?.src === 'images/uc-170-portrait.jpg' && audit?.status === 'absent' && !audit?.asset, 'UC-170 canonical still absence drift');
await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US', ignoreHTTPSErrors: true });
try {
  const page_evidence = {};
  const page_screenshots = [];
  for (const spec of control.actor_role_pages) {
    const evidence = await inspectPage(context, spec); page_evidence[spec.key] = evidence;
    assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${spec.key} page transport failed`);
    assert(evidence.required_terms_missing.length === 0, `${spec.key} terms missing: ${evidence.required_terms_missing.join(', ')}`);
    page_screenshots.push({ key: spec.key, provider: spec.provider, ...evidence.screenshot });
  }
  const roleRows = [];
  for (const role of control.roles) roleRows.push(await fetchRole(context, role));
  const candidates = roleRows.flatMap(row => row.candidates);
  const roleCounts = Object.fromEntries(roleRows.map(row => [row.role_key, row.candidates.length]));
  assert(Object.values(roleCounts).every(count => count >= 1), `UC-170 role candidate denominator drift ${JSON.stringify(roleCounts)}`);

  const roleContacts = {};
  for (const roleRow of roleRows) {
    const thumbs = [];
    for (let index = 0; index < roleRow.candidates.length; index++) {
      const row = roleRow.candidates[index];
      const thumb = join(OUT, 'thumbs', roleRow.role_key, `${String(index + 1).padStart(2, '0')}.jpg`); await mkdir(dirname(thumb), { recursive: true });
      const label = `${index + 1} · ${row.width}x${row.height} · ${row.file_title.replace(/^File:/, '').slice(0, 44)}`;
      magick(join(OUT, row.local), '-auto-orient', '-thumbnail', '440x420>', '-background', '#171512', '-gravity', 'center', '-extent', '440x420', '-fill', 'white', '-undercolor', '#171512dd', '-gravity', 'south', '-pointsize', '12', '-annotate', '+0+6', label, '-strip', '-quality', '88', thumb);
      thumbs.push(thumb);
    }
    const contactPath = join(OUT, `contact-sheet-${roleRow.role_key}.jpg`);
    execFileSync('montage', [...thumbs, '-tile', '3x', '-geometry', '440x420+10+10', '-background', '#e8e3d9', contactPath], { stdio: 'inherit' });
    roleContacts[roleRow.role_key] = { path: `contact-sheet-${roleRow.role_key}.jpg`, sha256: sha(await readFile(contactPath)), ...identify(contactPath), candidate_count: roleRow.candidates.length };
  }
  const allThumbs = [];
  for (const roleRow of roleRows) {
    const row = roleRow.candidates[0];
    const thumb = join(OUT, 'thumbs', `selected-${roleRow.role_key}.jpg`);
    magick(join(OUT, row.local), '-auto-orient', '-thumbnail', '520x620>', '-background', '#171512', '-gravity', 'center', '-extent', '520x620', '-fill', 'white', '-undercolor', '#171512dd', '-gravity', 'south', '-pointsize', '15', '-annotate', '+0+7', `${roleRow.display_label} · top ranked discovery object`, '-strip', '-quality', '90', thumb);
    allThumbs.push(thumb);
  }
  const allContactPath = join(OUT, 'contact-sheet-all-roles.jpg');
  execFileSync('montage', [...allThumbs, '-tile', '3x1', '-geometry', '520x620+12+12', '-background', '#d5d0c7', allContactPath], { stdio: 'inherit' });
  const allContact = { path: 'contact-sheet-all-roles.jpg', sha256: sha(await readFile(allContactPath)), ...identify(allContactPath), candidate_count: candidates.length, displayed_top_ranked_roles: 3 };

  const manifest = {
    version: 1, lane: 'card-backfill', record_id: 'UC-170', kind: 'voice', actor: 'Maurice LaMarche', character: 'The Brain, Kif Kroker, Egon Spengler', production: 'Animaniacs / Futurama', years: '1980s–', side: 'still', expected_subject: 'The Brain, Kif Kroker, Egon Spengler',
    generated_at: new Date().toISOString(), control_sha256: sha(await readFile(CONTROL)), selector_artifact: control.selector_artifact, scope_artifact: control.scope_artifact,
    repository_hash_count: repository.size,
    actor_role_bindings: control.actor_role_pages.map(row => ({ key: row.key, provider: row.provider, source_page: row.url, binding: row.binding, page_evidence_key: row.key })),
    chronology_boundary: {
      egon: 'The Real Ghostbusters, 1986–1991',
      brain: 'Animaniacs origin in 1993; later Pinky and the Brain and reboot work remain the same voice role.',
      kif: 'Futurama original television run beginning in 1999.',
      canonical_years_semantics: '1980s– is a broad Maurice LaMarche career envelope and is not projected onto Brain or Kif.'
    },
    page_evidence, page_screenshots,
    role_pages: Object.fromEntries(roleRows.map(row => [row.role_key, {
      role: row.role, display_label: row.display_label, page_url: row.page_url, api_url: row.api_url,
      requested_title: row.requested_title, resolved_title: row.resolved_title, required_terms: row.required_terms,
      raw_revision_path: row.raw_revision_path, raw_revision_sha256: row.raw_revision_sha256,
      primary_api_path: row.primary_api_path, primary_api_sha256: row.primary_api_sha256,
      image_title_count: row.image_title_count, filtered_image_title_count: row.filtered_image_title_count,
      chronology: control.roles.find(role => role.key === row.role_key).chronology,
      required_actor_role_page_key: control.roles.find(role => role.key === row.role_key).required_actor_role_page_key
    }])),
    attempts: Object.fromEntries(roleRows.map(row => [row.role_key, row.attempts])),
    candidates, candidate_count: candidates.length, role_counts: roleCounts,
    contact_sheets: roleContacts, all_role_contact_sheet: allContact,
    selection_contract: control.selection_contract,
    disposition: 'three-role-mediawiki-orbit-pending-visual-second-desk', canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-170', actor: 'Maurice LaMarche', character: 'The Brain, Kif Kroker, Egon Spengler', production: 'Animaniacs / Futurama', years: '1980s–',
    candidate_count: candidates.length, role_counts: roleCounts,
    roles: Object.fromEntries(roleRows.map(row => [row.role_key, { resolved_title: row.resolved_title, raw_revision_path: row.raw_revision_path, raw_revision_sha256: row.raw_revision_sha256, candidates: row.candidates }])),
    contact_sheets: roleContacts, all_role_contact_sheet: allContact, canonical_mutation: false
  });
  const cards = candidates.map(row => `<article><img src="${row.local}" alt=""><h2>${row.display_label}: ${row.file_title}</h2><p>${row.width}×${row.height}</p><p>${row.description || row.metadata || ''}</p><code>${row.sha256}</code></article>`).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}article{background:white;padding:10px}article img{width:100%;height:420px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-170 · Maurice LaMarche three-role character orbit</h1><p>Brain, Kif, and animated Egon each require exact role and production custody. Live-action Egon, Pinky, other Futurama characters, toys, games, posters, and incomplete composites are forbidden.</p><div class="grid">${cards}</div>`);
  console.log(`PASS — UC-170 discovery retained ${candidates.length} byte-distinct candidate(s)`);
  console.log(`ROLES — ${JSON.stringify(roleCounts)}`);
  console.log(`MANIFEST — ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`SUMMARY — ${sha(await readFile(join(OUT, 'summary.json')))}`);
  console.log(`CONTACT — ${allContact.sha256}`);
  console.log(`OUTPUT — ${OUT}`);
} finally { await browser.close(); }
