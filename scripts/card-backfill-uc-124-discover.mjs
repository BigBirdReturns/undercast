#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-124-DISCOVER.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-124-discover';
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
function cleanUrl(value, base) {
  if (!value) return '';
  const text = String(value).replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&').trim();
  try { return new URL(text, base).href; } catch { return ''; }
}
function variants(url) {
  const rows = [];
  const push = (value, kind) => { if (value && !rows.some(row => row.url === value)) rows.push({ url: value, kind }); };
  push(url, 'declared-delivery');
  try {
    const noHash = new URL(url); noHash.hash = ''; push(noHash.href, 'hashless-delivery');
    const noQuery = new URL(url); noQuery.search = ''; noQuery.hash = ''; push(noQuery.href, 'unparameterized-delivery');
    push(noQuery.href.replace(/-\d{2,5}x\d{2,5}(?=\.(?:jpe?g|png|webp|gif)$)/i, ''), 'wordpress-full-size-probe');
  } catch {}
  return rows;
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
async function inspectPage(context, spec) {
  const page = await context.newPage();
  const screenshot = `pages/${spec.key}.png`;
  try {
    const response = await page.goto(spec.url, { waitUntil: 'domcontentloaded', timeout: control.transport_timeout_ms });
    await page.waitForTimeout(1800);
    await acceptBanners(page);
    for (let index = 0; index < 10; index++) {
      await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(200);
    }
    await page.evaluate(() => {
      for (const img of document.querySelectorAll('img')) {
        for (const attr of ['data-src','data-lazy-src','data-original','data-image','data-url']) {
          const value = img.getAttribute(attr);
          if (value && !img.src) img.src = value;
        }
        const srcset = img.getAttribute('data-srcset');
        if (srcset && !img.srcset) img.srcset = srcset;
      }
      for (const source of document.querySelectorAll('source')) {
        const srcset = source.getAttribute('data-srcset');
        if (srcset && !source.srcset) source.srcset = srcset;
      }
    }).catch(() => {});
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content().catch(() => '');
    const title = await page.title();
    const hay = norm(`${title} ${body} ${html}`);
    const missing = (spec.required_terms || []).filter(term => !hay.includes(norm(term)));
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: false });
    const screenshotBytes = await readFile(join(OUT, screenshot));
    const rows = await page.evaluate(({ captionPhrase }) => {
      const output = [];
      const seen = new Set();
      const absolute = value => { try { return new URL(String(value || '').trim(), document.baseURI).href; } catch { return ''; } };
      const add = (value, label, context, origin) => {
        const url = absolute(value);
        if (!url) return;
        const key = `${url}\n${origin}\n${context}`;
        if (seen.has(key)) return;
        seen.add(key);
        output.push({ url, label: String(label || '').replace(/\s+/g, ' ').trim().slice(0, 1200), context: String(context || '').replace(/\s+/g, ' ').trim().slice(0, 5000), origin });
      };
      const addSrcset = (value, label, context, origin) => {
        for (const part of String(value || '').split(',')) {
          const url = part.trim().split(/\s+/)[0];
          if (url) add(url, label, context, origin);
        }
      };
      const contextFor = node => {
        const figure = node.closest?.('figure');
        const caption = figure?.querySelector?.('figcaption')?.textContent || '';
        const parent = node.closest?.('article,section,div,p')?.textContent || '';
        return `${caption} ${parent} ${document.title}`;
      };
      for (const meta of document.querySelectorAll('meta[property="og:image"],meta[property="og:image:url"],meta[name="twitter:image"],meta[name="twitter:image:src"],meta[itemprop="image"]')) add(meta.getAttribute('content'), meta.getAttribute('property') || meta.getAttribute('name') || meta.getAttribute('itemprop'), document.title, 'meta-image');
      for (const link of document.querySelectorAll('link[rel="image_src"],link[rel="preload"][as="image"]')) add(link.getAttribute('href'), link.getAttribute('rel'), document.title, 'link-image');
      for (const img of document.querySelectorAll('img')) {
        const label = img.getAttribute('alt') || img.getAttribute('title') || '';
        const context = contextFor(img);
        add(img.currentSrc || img.src, label, context, 'img-current');
        for (const attr of ['src','data-src','data-lazy-src','data-original','data-image','data-url']) add(img.getAttribute(attr), label, context, `img-${attr}`);
        addSrcset(img.getAttribute('srcset'), label, context, 'img-srcset');
        addSrcset(img.getAttribute('data-srcset'), label, context, 'img-data-srcset');
      }
      for (const source of document.querySelectorAll('source')) {
        addSrcset(source.getAttribute('srcset'), '', contextFor(source), 'source-srcset');
        addSrcset(source.getAttribute('data-srcset'), '', contextFor(source), 'source-data-srcset');
      }
      for (const node of document.querySelectorAll('[style*="background"]')) {
        for (const match of String(getComputedStyle(node).backgroundImage || '').matchAll(/url\(["']?([^"')]+)["']?\)/g)) add(match[1], '', contextFor(node), 'background-image');
      }
      const walk = (value, path = 'jsonld') => {
        if (typeof value === 'string') {
          if (/\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.test(value) || /wp-content\/uploads|image/i.test(value)) add(value, path, document.title, 'jsonld-image');
          return;
        }
        if (Array.isArray(value)) return value.forEach((item, index) => walk(item, `${path}[${index}]`));
        if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`);
      };
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) { try { walk(JSON.parse(script.textContent || '')); } catch {} }
      if (captionPhrase) {
        const needle = captionPhrase.toLowerCase();
        for (const node of document.querySelectorAll('figcaption,p,div,span,h1,h2,h3,h4')) {
          if (!String(node.textContent || '').toLowerCase().includes(needle)) continue;
          let current = node;
          for (let depth = 0; depth < 7 && current; depth++, current = current.parentElement) {
            for (const img of current.querySelectorAll('img')) {
              const label = img.getAttribute('alt') || img.getAttribute('title') || '';
              const context = `${node.textContent} ${contextFor(img)}`;
              add(img.currentSrc || img.src, label, context, 'caption-nearby');
              addSrcset(img.getAttribute('srcset'), label, context, 'caption-nearby-srcset');
              addSrcset(img.getAttribute('data-srcset'), label, context, 'caption-nearby-data-srcset');
            }
            for (const anchor of current.querySelectorAll('a[href]')) {
              if (/\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.test(anchor.href)) add(anchor.href, anchor.textContent || '', `${node.textContent} ${current.textContent}`, 'caption-nearby-link');
            }
          }
        }
      }
      for (const entry of performance.getEntriesByType('resource')) {
        const url = String(entry.name || '');
        if (/\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.test(url)) add(url, '', document.title, 'performance-resource');
      }
      return output;
    }, { captionPhrase: spec.caption_phrase || '' });
    return {
      evidence: {
        status: 'loaded',
        http_status: response?.status() || null,
        title,
        resolved_url: page.url(),
        required_terms: spec.required_terms || [],
        required_terms_missing: missing,
        body_text: body.slice(0, 60000),
        screenshot: { path: screenshot, sha256: sha(screenshotBytes), bytes: screenshotBytes.length, ...identify(join(OUT, screenshot), 'image/png') }
      },
      rows
    };
  } catch (error) {
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: false }).catch(() => {});
    let screenshotRecord = null;
    try { const bytes = await readFile(join(OUT, screenshot)); screenshotRecord = { path: screenshot, sha256: sha(bytes), bytes: bytes.length, ...identify(join(OUT, screenshot), 'image/png') }; } catch {}
    return { evidence: { status: 'error', error: error.message, required_terms: spec.required_terms || [], required_terms_missing: spec.required_terms || [], screenshot: screenshotRecord }, rows: [] };
  } finally {
    await page.close();
  }
}
function scoreRow(role, pageSpec, row) {
  const text = norm(`${row.url} ${row.label} ${row.context} ${row.origin} ${pageSpec.key}`);
  const positive = role.positive_terms.filter(term => text.includes(norm(term)));
  const negative = role.negative_terms.filter(term => text.includes(norm(term)));
  const captionMatch = pageSpec.caption_phrase ? text.includes(norm(pageSpec.caption_phrase)) : false;
  let score = positive.length * 65 - negative.length * 90;
  if (captionMatch) score += 260;
  if (row.origin.startsWith('caption-nearby')) score += 130;
  if (row.origin === 'meta-image') score += 25;
  if (/logo|icon|avatar|sprite|tracking|pixel|favicon|cookie|privacy|wordmark/i.test(`${row.url} ${row.label}`)) score -= 180;
  const roleSignal = role.key === 'mufasa' ? text.includes('mufasa') : text.includes('darth vader') || (text.includes('vader') && text.includes('empire strikes back'));
  if (roleSignal) score += 90;
  return { score, positive, negative, captionMatch, roleSignal };
}
async function downloadCandidate(context, role, pageSpec, row, index) {
  for (const variant of variants(row.url)) {
    let response;
    try {
      response = await context.request.get(variant.url, { headers: { 'User-Agent': UA, Referer: pageSpec.url, Accept: 'image/jpeg,image/webp,image/png,image/gif,image/*,*/*;q=0.2' }, timeout: control.transport_timeout_ms, failOnStatusCode: false });
    } catch { continue; }
    if (!response.ok()) continue;
    const bytes = Buffer.from(await response.body());
    const mime = signatureMime(bytes);
    if (bytes.length < 8000 || mime === 'unknown') continue;
    const local = `candidates/${role.key}/${String(index).padStart(3, '0')}-${slug(row.label || row.origin || pageSpec.key)}.${extensionFor(mime)}`;
    const path = join(OUT, local);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    let dimensions = { width: 0, height: 0 };
    try { dimensions = identify(path, mime); } catch {}
    if (dimensions.width < 300 || dimensions.height < 220) continue;
    return { role_key: role.key, role: role.role, display_label: role.display_label, provider: role.provider, source_page_key: pageSpec.key, source_page: pageSpec.url, declared_url: row.url, probe_url: variant.url, probe_kind: variant.kind, resolved_url: response.url() || variant.url, label: row.label, local_context: row.context, origin: row.origin, local, mime, bytes: bytes.length, sha256: sha(bytes), ...dimensions, score: row.score, positive_terms: row.positive, negative_terms: row.negative, caption_match: row.captionMatch, role_signal: row.roleSignal };
  }
  return { role_key: role.key, role: role.role, source_page_key: pageSpec.key, source_page: pageSpec.url, declared_url: row.url, label: row.label, origin: row.origin, download_error: 'no usable image delivery' };
}
async function buildContactSheet(role, candidates) {
  const thumbs = [];
  await mkdir(join(OUT, 'thumbs', role.key), { recursive: true });
  for (let index = 0; index < candidates.length; index++) {
    const row = candidates[index];
    const thumb = join(OUT, 'thumbs', role.key, `${String(index + 1).padStart(2, '0')}.jpg`);
    const label = `${index + 1} · ${row.width}x${row.height} · score ${row.score} · ${(row.label || row.origin).slice(0, 45)}`;
    magick(frameInput(join(OUT, row.local), row.mime), '-auto-orient', '-thumbnail', '640x420>', '-background', '#171512', '-gravity', 'center', '-extent', '640x420', '-fill', 'white', '-undercolor', '#171512dd', '-gravity', 'south', '-pointsize', '13', '-annotate', '+0+6', label, '-strip', '-quality', '88', thumb);
    thumbs.push(thumb);
  }
  const relative = `contact-sheet-${role.key}.jpg`;
  const path = join(OUT, relative);
  execFileSync('montage', [...thumbs, '-tile', '3x', '-geometry', '640x420+10+10', '-background', '#e8e3d9', path], { stdio: 'inherit' });
  return { path: relative, sha256: sha(await readFile(path)), ...identify(path, 'image/jpeg'), count: candidates.length };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-124', 'UC-124 discovery scope drift');
assert(control.actor === 'James Earl Jones' && control.character === 'Mufasa (and Darth Vader)' && control.production === 'The Lion King / Star Wars' && control.year === 1994 && control.side === 'still', 'UC-124 discovery identity drift');
assert(control.selector_artifact?.artifact_id === 8700225871 && control.scope_artifact?.artifact_id === 8700373533 && control.scope_artifact?.scope_sha256 === '05a54dbacffbf873513c0d41ce17a1743094e670370733edd28b0cacf51ea062', 'UC-124 discovery custody drift');
assert(control.actor_role_pages?.length === 3 && control.actor_role_pages.filter(row => row.strict).length === 3, 'UC-124 actor-role denominator drift');
assert(control.roles?.length === 2 && control.roles.filter(row => row.strict).length === 2 && control.selection_contract?.required_role_keys?.length === 2, 'UC-124 role denominator drift');
assert(control.selection_contract?.exact_two_role_composite_required === true && control.selection_contract?.original_1994_animated_mufasa_required === true && control.selection_contract?.original_trilogy_vader_frame_required === true && control.selection_contract?.voice_and_physical_embodiment_must_remain_separate === true && control.selection_contract?.darth_vader_frame_must_not_imply_jones_suit_occupancy === true && control.selection_contract?.canonical_1994_is_lion_king_chronology_not_vader_debut === true && control.selection_contract?.both_panels_required === true && control.selection_contract?.canonical_mutation === false, 'UC-124 selection contract drift');
const specimen = (await readJson('data/specimens.json')).find(row => row.id === 'UC-124');
const source = (await readJson('data/SOURCES.json')).find(row => row.id === 'UC-124');
const audit = (await readJson('data/MEDIA-AUDIT.json')).items.find(row => row.id === control.audit_id);
assert(specimen && specimen.actor === 'James Earl Jones' && specimen.character === 'Mufasa (and Darth Vader)' && specimen.production === 'The Lion King / Star Wars' && specimen.years === '1994' && !specimen.still, 'UC-124 specimen boundary drift');
assert(!source?.still && audit?.status === 'absent' && !audit?.asset, 'UC-124 canonical absence drift');
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
  const role_contacts = {};
  const seenHashes = new Map();

  for (const actorPage of control.actor_role_pages) {
    const inspected = await inspectPage(context, actorPage);
    page_evidence[actorPage.key] = inspected.evidence;
    assert(inspected.evidence.status === 'loaded' && inspected.evidence.http_status >= 200 && inspected.evidence.http_status < 400, `${actorPage.key} actor-role transport failed`);
    assert(inspected.evidence.required_terms_missing.length === 0, `${actorPage.key} actor-role terms missing: ${inspected.evidence.required_terms_missing.join(', ')}`);
    if (inspected.evidence.screenshot) page_screenshots.push({ key: actorPage.key, provider: actorPage.provider, ...inspected.evidence.screenshot });
  }

  for (const role of control.roles) {
    const scoredRows = [];
    for (const pageSpec of role.pages) {
      const inspected = await inspectPage(context, pageSpec);
      page_evidence[pageSpec.key] = inspected.evidence;
      assert(inspected.evidence.status === 'loaded' && inspected.evidence.http_status >= 200 && inspected.evidence.http_status < 400, `${pageSpec.key} role source transport failed`);
      assert(inspected.evidence.required_terms_missing.length === 0, `${pageSpec.key} role source terms missing: ${inspected.evidence.required_terms_missing.join(', ')}`);
      if (inspected.evidence.screenshot) page_screenshots.push({ key: pageSpec.key, provider: role.provider, role_key: role.key, ...inspected.evidence.screenshot });
      for (const row of inspected.rows) {
        const url = cleanUrl(row.url, pageSpec.url);
        if (!/^https?:\/\//.test(url)) continue;
        const scored = scoreRow(role, pageSpec, { ...row, url });
        if (!scored.roleSignal || scored.score < -60) continue;
        scoredRows.push({ ...row, url, pageSpec, ...scored });
      }
    }
    scoredRows.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
    const uniqueRows = [];
    const seenUrls = new Set();
    for (const row of scoredRows) {
      if (seenUrls.has(row.url)) continue;
      seenUrls.add(row.url);
      uniqueRows.push(row);
      if (uniqueRows.length >= control.maximum_candidates_per_role * 4) break;
    }
    let index = 0;
    const roleCandidates = [];
    for (const row of uniqueRows) {
      if (roleCandidates.length >= control.maximum_candidates_per_role) break;
      const result = await downloadCandidate(context, role, row.pageSpec, row, ++index);
      attempted.push(result);
      if (!result.sha256 || result.download_error) continue;
      if (seenHashes.has(result.sha256)) { result.visual_byte_duplicate = true; result.duplicate_of = seenHashes.get(result.sha256); continue; }
      seenHashes.set(result.sha256, result.local);
      result.repository_matches = repository.get(result.sha256) || [];
      roleCandidates.push(result);
      candidates.push(result);
    }
    assert(roleCandidates.length >= control.minimum_candidates_per_role, `UC-124 ${role.key} orbit produced only ${roleCandidates.length} usable candidate(s)`);
    assert(roleCandidates.some(row => row.caption_match === true), `UC-124 ${role.key} orbit lacks caption-local candidate`);
    roleCandidates.sort((a, b) => b.score - a.score || (b.width * b.height - a.width * a.height) || a.local.localeCompare(b.local));
    role_contacts[role.key] = await buildContactSheet(role, roleCandidates);
  }

  const roleCounts = Object.fromEntries(control.roles.map(role => [role.key, candidates.filter(row => row.role_key === role.key).length]));
  assert(control.selection_contract.required_role_keys.every(key => roleCounts[key] >= control.minimum_candidates_per_role), `UC-124 role coverage drift ${JSON.stringify(roleCounts)}`);
  assert(new Set(candidates.map(row => row.sha256)).size === candidates.length, 'UC-124 retained discovery candidates are not byte-distinct');
  const contactThumbs = control.roles.map(role => join(OUT, role_contacts[role.key].path));
  const allContactPath = join(OUT, 'contact-sheet-all-roles.jpg');
  execFileSync('montage', [...contactThumbs, '-tile', '1x', '-geometry', '+12+12', '-background', '#d5d0c7', allContactPath], { stdio: 'inherit' });
  const allContact = { path: 'contact-sheet-all-roles.jpg', sha256: sha(await readFile(allContactPath)), ...identify(allContactPath, 'image/jpeg'), role_counts: roleCounts };

  const manifest = {
    version: 1,
    lane: 'card-backfill',
    record_id: 'UC-124',
    actor: 'James Earl Jones',
    character: 'Mufasa (and Darth Vader)',
    production: 'The Lion King / Star Wars',
    year: 1994,
    side: 'still',
    expected_subject: 'Mufasa (and Darth Vader)',
    generated_at: new Date().toISOString(),
    control_sha256: sha(await readFile(CONTROL)),
    selector_artifact: control.selector_artifact,
    scope_artifact: control.scope_artifact,
    repository_hash_count: repository.size,
    actor_role_bindings: control.actor_role_pages.map(row => ({ key: row.key, provider: row.provider, source_page: row.url, binding: row.binding, page_evidence_key: row.key })),
    identity_boundary: {
      canonical_year_semantics: '1994 belongs to animated Mufasa and The Lion King. It is not Darth Vader debut or James Earl Jones Vader voice-start chronology.',
      james_earl_jones_role_mode: 'voice',
      darth_vader_frame_may_show_armored_character: true,
      darth_vader_frame_must_not_imply_jones_suit_occupancy: true,
      physical_suit_performance_separately_credited_to_david_prowse: true
    },
    page_evidence,
    page_screenshots,
    attempted,
    candidates,
    candidate_count: candidates.length,
    role_counts: roleCounts,
    role_contact_sheets: role_contacts,
    contact_sheet: allContact,
    selection_contract: control.selection_contract,
    disposition: 'two-role-official-caption-local-orbit-pending-visual-second-desk',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-124', actor: 'James Earl Jones', character: 'Mufasa (and Darth Vader)', production: 'The Lion King / Star Wars', role_counts: roleCounts, candidate_count: candidates.length,
    candidates: candidates.map(row => ({ role_key: row.role_key, role: row.role, source_page_key: row.source_page_key, source_page: row.source_page, label: row.label, local: row.local, mime: row.mime, bytes: row.bytes, sha256: row.sha256, width: row.width, height: row.height, score: row.score, positive_terms: row.positive_terms, negative_terms: row.negative_terms, caption_match: row.caption_match, repository_matches: row.repository_matches })),
    actor_role_pages: control.actor_role_pages.map(row => ({ key: row.key, provider: row.provider, url: row.url, screenshot_sha256: page_evidence[row.key]?.screenshot?.sha256 || null })), role_contact_sheets: role_contacts, contact_sheet: allContact,
    voice_and_physical_embodiment_separate: true, canonical_1994_is_lion_king_chronology_not_vader_debut: true, canonical_mutation: false
  });
  console.log(`PASS — UC-124 official-source discovery complete: ${candidates.length} candidate(s)`);
  console.log(`ROLES — ${JSON.stringify(roleCounts)}`);
  console.log(`MANIFEST — ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`SUMMARY — ${sha(await readFile(join(OUT, 'summary.json')))}`);
  console.log(`CONTACT — ${allContact.sha256}`);
  console.log(`OUTPUT — ${OUT}`);
} finally {
  await browser.close();
}
