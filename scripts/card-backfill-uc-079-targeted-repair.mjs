#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-079-TARGETED.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-079-targeted-repair';
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
    if (parsed.hostname === 'images.paramount.tech') {
      for (const width of [2400, 2048, 1600, 1200]) {
        const copy = new URL(url);
        copy.searchParams.set('format', 'jpg');
        copy.searchParams.set('width', String(width));
        copy.searchParams.delete('height');
        copy.searchParams.delete('crop');
        push(copy.href, `paramount-width-${width}`);
      }
    }
    if (/brightspotcdn\.com|nbcuni\.com|syfy\.com/i.test(parsed.hostname) || /\/resize\/\d+x\d+!/i.test(parsed.pathname)) {
      for (const width of [2400, 2048, 1600, 1200]) {
        const copy = new URL(url);
        if (/\/resize\/\d+x\d+!/i.test(copy.pathname)) copy.pathname = copy.pathname.replace(/\/resize\/\d+x\d+!/i, `/resize/${width}x${Math.round(width * 0.75)}!`);
        if (copy.searchParams.has('width') || copy.hostname.includes('syfy')) copy.searchParams.set('width', String(width));
        copy.searchParams.delete('w');
        push(copy.href, `syfy-width-${width}`);
      }
    }
    for (const param of ['w', 'width', 'resize', 'quality', 'q', 'fit', 'crop']) {
      if (!parsed.searchParams.has(param)) continue;
      const copy = new URL(url);
      copy.searchParams.delete(param);
      push(copy.href, `without-${param}`);
    }
  } catch {}
  return rows;
}

async function dismissObstructions(page) {
  for (const label of ['OK', 'CONTINUE', 'Accept', 'Accept All', 'I Accept', 'Agree', 'Allow all']) {
    const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
    const count = await button.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      if (await button.nth(i).isVisible().catch(() => false)) {
        await button.nth(i).click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(250);
      }
    }
  }
  for (const selector of [
    'button[aria-label*="close" i]',
    'button[title*="close" i]',
    '[role="dialog"] button',
    '[class*="modal" i] button[role="button"]'
  ]) {
    const nodes = page.locator(selector);
    const count = await nodes.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 8); i++) {
      if (await nodes.nth(i).isVisible().catch(() => false)) {
        await nodes.nth(i).click({ timeout: 1200 }).catch(() => {});
        await page.waitForTimeout(200);
      }
    }
  }
  await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('dialog,section,div')]
      .map(node => ({ node, text: String(node.textContent || '').replace(/\s+/g, ' ').trim() }))
      .filter(row => row.text.includes('Keep Watching Your Favorite BET Shows') && row.text.length < 1800)
      .sort((a, b) => a.text.length - b.text.length);
    if (candidates[0]) candidates[0].node.remove();
    for (const node of document.querySelectorAll('[class*="overlay" i],[class*="backdrop" i]')) {
      const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.includes('Keep Watching Your Favorite BET Shows')) node.remove();
    }
    document.documentElement.style.overflow = 'auto';
    if (document.body) document.body.style.overflow = 'auto';
  }).catch(() => {});
}

async function inspectTarget(context, target) {
  const page = await context.newPage();
  try {
    const response = await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(1300);
    await dismissObstructions(page);
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
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(260);
    }
    await dismissObstructions(page);
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content();
    const title = await page.title();
    const hay = norm(body + ' ' + html);
    const missing = target.required_terms.filter(term => !hay.includes(norm(term)));
    const screenshot = `pages/${target.key}.png`;
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: true });

    const extracted = await page.evaluate(({ phrases, minimum }) => {
      const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/[^a-zA-Z0-9']+/g, ' ').trim().toLowerCase();
      const phraseNorm = phrases.map(normalize);
      const absolute = value => { try { return new URL(value, document.baseURI).href; } catch { return ''; } };
      const rows = [];
      const seen = new Set();
      const add = (url, label, context, origin, depth) => {
        const resolved = absolute(url);
        if (!resolved || seen.has(`${resolved}|${origin}`)) return;
        const normalized = normalize([label, context].join(' '));
        const phraseMatches = phraseNorm.filter(phrase => normalized.includes(phrase)).length;
        if (phraseMatches < minimum) return;
        seen.add(`${resolved}|${origin}`);
        rows.push({ url: resolved, label: label || '', context: String(context || '').replace(/\s+/g, ' ').slice(0, 5000), origin, phrase_matches: phraseMatches, association_depth: depth });
      };
      const imageUrls = image => {
        const values = [image.currentSrc, image.src, image.dataset?.src, image.dataset?.lazySrc, image.dataset?.original, image.dataset?.image, image.getAttribute?.('data-src')].filter(Boolean);
        for (const part of String(image.srcset || image.dataset?.srcset || '').split(',')) {
          const value = part.trim().split(/\s+/)[0];
          if (value) values.push(value);
        }
        return values;
      };
      const mediaFromContainer = (container, context, depth, origin) => {
        for (const image of container.querySelectorAll('img')) {
          for (const value of imageUrls(image)) add(value, image.alt || image.title || '', context, `${origin}-image`, depth);
        }
        for (const source of container.querySelectorAll('source')) {
          for (const part of String(source.srcset || source.getAttribute('data-srcset') || '').split(',')) {
            const value = part.trim().split(/\s+/)[0];
            if (value) add(value, '', context, `${origin}-source`, depth);
          }
        }
        for (const element of [container, ...container.querySelectorAll('*')]) {
          const background = getComputedStyle(element).backgroundImage;
          for (const match of String(background || '').matchAll(/url\(["']?([^"')]+)["']?\)/g)) add(match[1], element.getAttribute?.('aria-label') || '', context, `${origin}-background`, depth);
        }
      };

      for (const image of document.images) {
        const direct = [image.alt, image.title, image.getAttribute('aria-label'), image.closest('figure')?.querySelector('figcaption')?.textContent].filter(Boolean).join(' ');
        const normalized = normalize(direct);
        const phraseMatches = phraseNorm.filter(phrase => normalized.includes(phrase)).length;
        if (phraseMatches < minimum) continue;
        for (const value of imageUrls(image)) add(value, image.alt || image.title || '', direct, 'direct-image-label', 0);
      }

      const textNodes = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,figcaption,span,div')]
        .map(node => ({ node, text: String(node.textContent || '').replace(/\s+/g, ' ').trim() }))
        .filter(row => row.text.length > 0 && row.text.length <= 1500)
        .map(row => ({ ...row, normalized: normalize(row.text) }))
        .filter(row => phraseNorm.filter(phrase => row.normalized.includes(phrase)).length >= minimum)
        .sort((a, b) => a.text.length - b.text.length);

      for (const match of textNodes.slice(0, 80)) {
        let current = match.node;
        for (let depth = 0; depth < 7 && current; depth++, current = current.parentElement) {
          const text = String(current.textContent || '').replace(/\s+/g, ' ').trim();
          if (text.length > 6500) break;
          const mediaCount = current.querySelectorAll('img,source').length;
          let hasBackground = false;
          for (const element of [current, ...current.querySelectorAll('*')]) {
            if (getComputedStyle(element).backgroundImage !== 'none') { hasBackground = true; break; }
          }
          if (!mediaCount && !hasBackground) continue;
          mediaFromContainer(current, text, depth, 'nearest-phrase-container');
          break;
        }
      }
      return rows.sort((a, b) => (b.phrase_matches - a.phrase_matches) || (a.association_depth - b.association_depth) || a.context.length - b.context.length);
    }, { phrases: target.match_phrases, minimum: target.minimum_phrase_matches });

    const rows = [];
    const seen = new Set();
    for (const row of extracted) {
      const url = cleanUrl(row.url, page.url());
      if (!/^https?:\/\//.test(url) || seen.has(url)) continue;
      if (/(?:logo|icon|sprite|favicon|pixel|tracking|avatar|badge|rating|privacy|cookie|spacer|placeholder)/i.test(url)) continue;
      seen.add(url);
      rows.push({ ...row, url });
    }
    return {
      evidence: {
        status: 'loaded',
        http_status: response?.status() || null,
        title,
        resolved_url: page.url(),
        required_terms: target.required_terms,
        required_terms_missing: missing,
        match_phrases: target.match_phrases,
        extracted_nearest_media_urls: rows.length,
        body_text: body.slice(0, 18000),
        screenshot
      },
      rows
    };
  } catch (error) {
    return { evidence: { status: 'error', error: error.message, required_terms: target.required_terms, required_terms_missing: target.required_terms, match_phrases: target.match_phrases }, rows: [] };
  } finally {
    await page.close();
  }
}

async function download(context, target, row, variant, index) {
  let response;
  try {
    response = await context.request.get(variant.url, {
      headers: { 'User-Agent': UA, Referer: target.url, Accept: 'image/jpeg,image/webp,image/png,image/*,*/*;q=0.2' },
      timeout: 60000,
      failOnStatusCode: false
    });
  } catch (error) {
    return { target_key: target.key, family: target.family, provider: target.provider, source_page: target.url, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, phrase_matches: row.phrase_matches, association_depth: row.association_depth, local_context: row.context || '', download_error: error.message };
  }
  if (!response.ok()) return { target_key: target.key, family: target.family, provider: target.provider, source_page: target.url, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, phrase_matches: row.phrase_matches, association_depth: row.association_depth, local_context: row.context || '', download_error: `HTTP ${response.status()}` };
  const bytes = Buffer.from(await response.body());
  const mime = signatureMime(bytes);
  if (bytes.length < 12000 || mime === 'unknown') return { target_key: target.key, family: target.family, provider: target.provider, source_page: target.url, probe_url: variant.url, probe_kind: variant.kind, origin: row.origin, phrase_matches: row.phrase_matches, association_depth: row.association_depth, local_context: row.context || '', download_error: `unusable ${bytes.length} ${mime}` };
  const local = `candidates/${String(index).padStart(3, '0')}-${slug(target.key)}-${slug(row.origin)}.${extensionFor(mime)}`;
  const path = join(OUT, local);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  let dimensions = { width: 0, height: 0 };
  try { dimensions = identify(path); } catch {}
  if (dimensions.width < 360 || dimensions.height < 240) return { target_key: target.key, family: target.family, provider: target.provider, source_page: target.url, probe_url: variant.url, probe_kind: variant.kind, resolved_url: response.url() || variant.url, origin: row.origin, phrase_matches: row.phrase_matches, association_depth: row.association_depth, local_context: row.context || '', local, mime, bytes: bytes.length, sha256: sha(bytes), ...dimensions, download_error: 'image below 360x240 floor' };
  return {
    target_key: target.key,
    family: target.family,
    expected_roles: target.expected_roles,
    provider: target.provider,
    source_page: target.url,
    probe_url: variant.url,
    probe_kind: variant.kind,
    resolved_url: response.url() || variant.url,
    origin: row.origin,
    label: row.label || '',
    phrase_matches: row.phrase_matches,
    association_depth: row.association_depth,
    local_context: row.context || '',
    local,
    mime,
    bytes: bytes.length,
    sha256: sha(bytes),
    ...dimensions
  };
}

async function buildContactSheet(rows, target) {
  const thumbs = [];
  for (let position = 0; position < rows.length; position++) {
    const row = rows[position];
    const thumb = join(OUT, 'thumbs', `${slug(target.key)}-${String(position + 1).padStart(2, '0')}.jpg`);
    await mkdir(dirname(thumb), { recursive: true });
    magick(join(OUT, row.local), '-auto-orient', '-thumbnail', '460x345>', '-background', '#171512', '-gravity', 'center', '-extent', '460x345', '-fill', 'white', '-undercolor', '#171512cc', '-gravity', 'south', '-pointsize', '13', '-annotate', '+0+5', `${String(position + 1).padStart(2, '0')} ${row.width}x${row.height} d${row.association_depth}`, '-strip', '-quality', '88', thumb);
    thumbs.push(thumb);
  }
  const path = join(OUT, `contact-sheet-${target.key}.jpg`);
  execFileSync('montage', [...thumbs, '-tile', '3x', '-geometry', '460x345+10+10', '-background', '#e8e3d9', path], { stdio: 'inherit' });
  return { path: `contact-sheet-${target.key}.jpg`, target_key: target.key, expected_roles: target.expected_roles, candidate_count: rows.length, ...identify(path), sha256: sha(await readFile(path)) };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-079', 'UC-079 targeted repair scope drift');
assert(control.actor === 'Eddie Murphy' && control.character === 'Barbershop crowd & Saul' && control.side === 'still', 'UC-079 targeted repair identity drift');
assert(control.selector_artifact?.artifact_id === 8658596662 && control.scope_artifact?.artifact_id === 8658730962 && control.broad_discovery_artifact?.artifact_id === 8659221908, 'UC-079 targeted repair custody drift');
assert(control.role_targets?.length === 6 && control.selection_contract?.required_target_keys?.length === 6, 'UC-079 targeted repair denominator drift');
await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US' });

try {
  const targetEvidence = {};
  const pageScreenshots = [];
  const attempted = [];
  const candidates = [];
  const candidatesByTarget = {};
  const contactSheets = {};
  const hashTargets = new Map();
  let index = 0;

  for (const target of control.role_targets) {
    const inspected = await inspectTarget(context, target);
    targetEvidence[target.key] = inspected.evidence;
    if (inspected.evidence?.screenshot) {
      const bytes = await readFile(join(OUT, inspected.evidence.screenshot));
      pageScreenshots.push({ target_key: target.key, family: target.family, provider: target.provider, path: inspected.evidence.screenshot, sha256: sha(bytes), bytes: bytes.length });
    }
    if (target.strict) {
      assert(inspected.evidence.status === 'loaded' && inspected.evidence.required_terms_missing.length === 0, `${target.key} required page evidence failed: ${inspected.evidence.required_terms_missing.join(', ')}`);
      assert(inspected.rows.length >= 1, `${target.key} produced no nearest phrase-bearing media URL`);
    }
    const targetCandidates = [];
    const targetSeen = new Set();
    for (const row of inspected.rows) {
      if (targetCandidates.length >= target.max_candidates) break;
      for (const variant of variants(row.url)) {
        if (targetCandidates.length >= target.max_candidates) break;
        const result = await download(context, target, row, variant, ++index);
        attempted.push(result);
        if (!result.sha256 || result.download_error || targetSeen.has(result.sha256)) continue;
        targetSeen.add(result.sha256);
        result.repository_matches = repository.get(result.sha256) || [];
        const targets = hashTargets.get(result.sha256) || [];
        targets.push(target.key);
        hashTargets.set(result.sha256, targets);
        targetCandidates.push(result);
        candidates.push(result);
      }
    }
    targetCandidates.sort((a, b) => (b.phrase_matches - a.phrase_matches) || (a.association_depth - b.association_depth) || (b.width * b.height - a.width * a.height) || a.local.localeCompare(b.local));
    assert(targetCandidates.length >= 1, `${target.key} produced no usable target-local candidate`);
    candidatesByTarget[target.key] = targetCandidates;
    contactSheets[target.key] = await buildContactSheet(targetCandidates, target);
  }

  const requiredKeys = control.selection_contract.required_target_keys;
  assert(requiredKeys.every(key => (candidatesByTarget[key] || []).length >= 1), 'UC-079 repaired target candidate floor failed');
  assert(candidates.every(row => row.repository_matches.length === 0), 'UC-079 repaired target orbit contains exact canonical duplicate');
  const crossTargetDuplicateGroups = [...hashTargets.entries()].filter(([, targets]) => new Set(targets).size > 1).map(([hash, targets]) => ({ sha256: hash, target_keys: [...new Set(targets)] }));
  for (const row of candidates) row.cross_target_keys = hashTargets.get(row.sha256) || [];

  const manifest = {
    version: 2,
    lane: 'card-backfill',
    record_id: 'UC-079',
    actor: 'Eddie Murphy',
    character: 'Barbershop crowd & Saul',
    production: 'Coming to America / The Nutty Professor',
    side: 'still',
    expected_subject: 'Barbershop crowd & Saul',
    generated_at: new Date().toISOString(),
    control_sha256: sha(await readFile(CONTROL)),
    selector_artifact: control.selector_artifact,
    scope_artifact: control.scope_artifact,
    broad_discovery_artifact: control.broad_discovery_artifact,
    failed_targeted_checkpoints: control.failed_targeted_checkpoints || [],
    selection_contract: control.selection_contract,
    repository_hash_count: repository.size,
    target_evidence: targetEvidence,
    page_screenshots: pageScreenshots,
    attempted,
    candidates,
    candidate_count: candidates.length,
    candidate_count_by_target: Object.fromEntries(Object.entries(candidatesByTarget).map(([key, rows]) => [key, rows.length])),
    cross_target_duplicate_groups: crossTargetDuplicateGroups,
    contact_sheets: contactSheets,
    disposition: 'repaired-nearest-container-role-candidates-pending-visual-selection',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-079',
    actor: 'Eddie Murphy',
    candidate_count: candidates.length,
    candidate_count_by_target: manifest.candidate_count_by_target,
    cross_target_duplicate_groups: crossTargetDuplicateGroups,
    candidates: candidates.map(({ target_key, family, expected_roles, provider, source_page, probe_url, probe_kind, resolved_url, origin, label, phrase_matches, association_depth, local_context, local, mime, bytes, sha256, width, height, repository_matches, cross_target_keys }) => ({ target_key, family, expected_roles, provider, source_page, probe_url, probe_kind, resolved_url, origin, label, phrase_matches, association_depth, local_context, local, mime, bytes, sha256, width, height, repository_matches, cross_target_keys }))
  });
  const sections = control.role_targets.map(target => {
    const rows = candidatesByTarget[target.key];
    const cards = rows.map((row, position) => `<article><img src="${row.local}" alt=""><h3>${position + 1} · ${target.key}</h3><p>${row.width}×${row.height} · depth ${row.association_depth}</p><p>${row.local_context.slice(0, 700)}</p><p>cross-target: ${row.cross_target_keys.join(', ')}</p><code>${row.sha256}</code></article>`).join('');
    return `<section><h2>${target.key}</h2><p>${target.provider} · expected roles: ${target.expected_roles.join(', ')}</p><div class="grid">${cards}</div></section>`;
  }).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}section{margin:0 0 48px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}article{background:white;padding:10px}article img{width:100%;height:380px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-079 repaired caption-bound role targets</h1><p>Candidate-only. Association is limited to the smallest phrase-bearing media container. Cross-target duplicate bytes remain visible and may not silently satisfy distinct roles.</p>${sections}`);

  console.log(`PASS — UC-079 repaired role discovery complete: ${candidates.length} target-local candidate(s)`);
  for (const [key, rows] of Object.entries(candidatesByTarget)) console.log(`${key}=${rows.length}`);
  console.log(`cross-target-duplicate-groups=${crossTargetDuplicateGroups.length}`);
  console.log(`manifest ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`artifact ${OUT}`);
} finally {
  await browser.close();
}
