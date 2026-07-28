#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-113-DISCOVER.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-113-discover';
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
function variants(url) {
  const rows = [];
  const push = (value, kind) => {
    if (value && !rows.some(row => row.url === value)) rows.push({ url: value, kind });
  };
  push(url, 'declared-delivery');
  try {
    const noQuery = new URL(url);
    noQuery.search = '';
    push(noQuery.href, 'unparameterized-original-probe');
  } catch {}
  return rows;
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
async function inspectPage(context, pageSpec) {
  const page = await context.newPage();
  const screenshot = `pages/${pageSpec.key}.png`;
  try {
    const { response, transport } = await navigateWithFallback(context, page, pageSpec.url, control.transport_timeout_ms);
    await page.waitForTimeout(1800);
    for (const label of ['CONTINUE', 'Accept', 'I Accept', 'Agree', 'Allow all', 'Accept All']) {
      const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
      if (await button.count().catch(() => 0)) {
        await button.first().click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(350);
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
      for (const source of document.querySelectorAll('source')) {
        const srcset = source.getAttribute('data-srcset');
        if (srcset && !source.srcset) source.srcset = srcset;
      }
    }).catch(() => {});
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 1600);
      await page.waitForTimeout(240);
    }
    await page.waitForTimeout(700);
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content();
    const title = await page.title();
    const hay = norm(`${body} ${html}`);
    const missing = pageSpec.required_terms.filter(term => !hay.includes(norm(term)));
    const captionReceipts = (pageSpec.final_assets || []).map(asset => ({
      asset_key: asset.key,
      caption: asset.caption,
      present: hay.includes(norm(asset.caption))
    }));
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: true }).catch(async () => {
      await page.screenshot({ path: join(OUT, screenshot), fullPage: false });
    });
    const screenshotBytes = await readFile(join(OUT, screenshot));
    return {
      status: 'loaded',
      http_status: response?.status?.() || response?.status || null,
      transport,
      title,
      resolved_url: page.url() || pageSpec.url,
      required_terms: pageSpec.required_terms,
      required_terms_missing: missing,
      body_text: body.slice(0, 50000),
      screenshot,
      screenshot_sha256: sha(screenshotBytes),
      screenshot_bytes: screenshotBytes.length,
      screenshot_geometry: identify(join(OUT, screenshot)),
      final_asset_caption_receipts: captionReceipts
    };
  } catch (error) {
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: false }).catch(() => {});
    return {
      status: 'error',
      error: error.message,
      required_terms: pageSpec.required_terms,
      required_terms_missing: pageSpec.required_terms,
      screenshot,
      final_asset_caption_receipts: (pageSpec.final_assets || []).map(asset => ({ asset_key: asset.key, caption: asset.caption, present: false }))
    };
  } finally {
    await page.close();
  }
}
async function downloadCandidate(context, pageSpec, asset, variant, index) {
  let response;
  try {
    response = await context.request.get(variant.url, {
      headers: {
        'User-Agent': UA,
        Referer: pageSpec.url,
        Accept: 'image/jpeg,image/webp,image/png,image/*,*/*;q=0.2'
      },
      timeout: control.transport_timeout_ms,
      failOnStatusCode: false
    });
  } catch (error) {
    return { page_key: pageSpec.key, asset_key: asset.key, probe_url: variant.url, probe_kind: variant.kind, download_error: error.message };
  }
  if (!response.ok()) return { page_key: pageSpec.key, asset_key: asset.key, probe_url: variant.url, probe_kind: variant.kind, download_error: `HTTP ${response.status()}` };
  const bytes = Buffer.from(await response.body());
  const mime = signatureMime(bytes);
  if (bytes.length < 12000 || mime === 'unknown') return { page_key: pageSpec.key, asset_key: asset.key, probe_url: variant.url, probe_kind: variant.kind, download_error: `unusable ${bytes.length} ${mime}` };
  const local = `candidates/${String(index).padStart(3, '0')}-${slug(asset.key)}-${slug(variant.kind)}.${extensionFor(mime)}`;
  const path = join(OUT, local);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  let dimensions = { width: 0, height: 0 };
  try { dimensions = identify(path); } catch {}
  if (dimensions.width < 400 || dimensions.height < 225) {
    return {
      page_key: pageSpec.key,
      provider: pageSpec.provider,
      source_page: pageSpec.url,
      asset_key: asset.key,
      caption: asset.caption,
      admission_class: asset.admission_class,
      expected_subject: asset.expected_subject,
      probe_url: variant.url,
      probe_kind: variant.kind,
      resolved_url: response.url() || variant.url,
      local,
      mime,
      bytes: bytes.length,
      sha256: sha(bytes),
      ...dimensions,
      download_error: 'image below 400x225 floor'
    };
  }
  return {
    page_key: pageSpec.key,
    provider: pageSpec.provider,
    source_page: pageSpec.url,
    asset_key: asset.key,
    caption: asset.caption,
    admission_class: asset.admission_class,
    expected_subject: asset.expected_subject,
    declared_url: asset.url,
    probe_url: variant.url,
    probe_kind: variant.kind,
    resolved_url: response.url() || variant.url,
    local,
    mime,
    bytes: bytes.length,
    sha256: sha(bytes),
    ...dimensions
  };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-113', 'UC-113 discovery scope drift');
assert(control.actor === 'Taika Waititi' && control.character === 'Korg' && control.production === 'Thor: Ragnarok' && control.year === 2017 && control.side === 'still', 'UC-113 discovery identity drift');
assert(control.selector_artifact?.artifact_id === 8676461183 && control.scope_artifact?.artifact_id === 8676501540, 'UC-113 discovery custody drift');
assert(control.pages?.length === 4 && control.pages.filter(page => page.strict).length === 4, 'UC-113 page denominator drift');
assert(control.pages.filter(page => page.admission_lane === 'final-character-frame').length === 1 && control.pages.find(page => page.admission_lane === 'final-character-frame')?.final_assets?.length === 1 && control.minimum_final_candidates === 1, 'UC-113 final candidate denominator drift');
assert(control.selection_contract?.official_marvel_final_frame_required === true && control.selection_contract?.exact_2017_thor_ragnarok_korg_required === true && control.selection_contract?.taika_waititi_actor_role_binding_required === true && control.selection_contract?.character_frame_and_actor_role_custody_separate === true && control.selection_contract?.final_character_image_not_performance_capture_image === true && control.selection_contract?.canonical_mutation === false, 'UC-113 selection contract drift');
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
    const evidence = await inspectPage(context, pageSpec);
    page_evidence[pageSpec.key] = evidence;
    if (evidence.screenshot_sha256) {
      page_screenshots.push({
        key: pageSpec.key,
        provider: pageSpec.provider,
        path: evidence.screenshot,
        sha256: evidence.screenshot_sha256,
        bytes: evidence.screenshot_bytes,
        ...evidence.screenshot_geometry
      });
    }
    if (pageSpec.strict) {
      assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${pageSpec.key} transport failed`);
      assert(evidence.required_terms_missing.length === 0, `${pageSpec.key} required terms missing: ${evidence.required_terms_missing.join(', ')}`);
      assert((evidence.final_asset_caption_receipts || []).every(row => row.present), `${pageSpec.key} final image caption custody failed`);
    }
    for (const asset of pageSpec.final_assets || []) {
      for (const variant of variants(asset.url)) {
        const result = await downloadCandidate(context, pageSpec, asset, variant, ++index);
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
  const represented = new Set(candidates.map(row => row.asset_key));
  assert(represented.size === 1, `UC-113 discovery represented ${represented.size} official final assets instead of 1`);
  assert(candidates.length >= control.minimum_final_candidates, `UC-113 discovery produced only ${candidates.length} usable candidate(s)`);
  candidates.sort((a, b) => (b.width * b.height - a.width * a.height) || (b.bytes - a.bytes) || a.local.localeCompare(b.local));
  const thumbs = [];
  for (let position = 0; position < candidates.length; position++) {
    const row = candidates[position];
    const thumb = join(OUT, 'thumbs', `${String(position + 1).padStart(2, '0')}-${slug(row.asset_key)}.jpg`);
    await mkdir(dirname(thumb), { recursive: true });
    magick(join(OUT, row.local), '-auto-orient', '-thumbnail', '640x420>', '-background', '#171512', '-gravity', 'center', '-extent', '640x420', '-fill', 'white', '-undercolor', '#171512cc', '-gravity', 'south', '-pointsize', '15', '-annotate', '+0+7', `${position + 1} · ${row.asset_key} · ${row.width}x${row.height}`, '-strip', '-quality', '88', thumb);
    thumbs.push(thumb);
  }
  const contactPath = join(OUT, 'contact-sheet-final.jpg');
  execFileSync('montage', [...thumbs, '-tile', '2x', '-geometry', '640x420+10+10', '-background', '#e8e3d9', contactPath], { stdio: 'inherit' });
  const contactSheet = { path: 'contact-sheet-final.jpg', sha256: sha(await readFile(contactPath)), ...identify(contactPath), count: candidates.length };
  const manifest = {
    version: 1,
    lane: 'card-backfill',
    record_id: 'UC-113',
    actor: 'Taika Waititi',
    character: 'Korg',
    production: 'Thor: Ragnarok',
    year: 2017,
    side: 'still',
    expected_subject: 'Korg',
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
    represented_asset_keys: [...represented],
    contact_sheet: contactSheet,
    selection_contract: control.selection_contract,
    identity_boundary: {
      character_frame_custody: 'The official Marvel Finding Korg page supplies the final Korg image candidate from Thor: Ragnarok.',
      actor_role_custody: 'Marvel separately states that Taika Waititi voiced Korg and performed the character through motion capture.',
      prohibited_inference: 'The final Korg frame is not treated as actor-role evidence by itself.'
    },
    disposition: 'official-candidate-only-pending-visual-second-desk',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-113',
    actor: 'Taika Waititi',
    character: 'Korg',
    production: 'Thor: Ragnarok',
    year: 2017,
    candidate_count: candidates.length,
    represented_asset_keys: [...represented],
    candidates,
    contact_sheet: contactSheet,
    page_receipts: page_screenshots,
    actor_role_and_frame_custody_separate: true,
    canonical_mutation: false
  });
  const cards = candidates.map((row, i) => `<article><img src="${row.local}" alt=""><h2>${i + 1}. ${row.asset_key}</h2><p>${row.width}×${row.height} · ${row.bytes} bytes · ${row.probe_kind}</p><p>${row.caption}</p><code>${row.sha256}</code></article>`).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:12px}article{background:white;padding:10px}article img{width:100%;height:460px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-113 · Taika Waititi / Korg · Thor: Ragnarok (2017)</h1><p>Official Marvel final-frame orbit. The visual second desk must confirm final Korg, not Taika Waititi in performance-capture equipment or a later MCU substitute.</p><div class="grid">${cards}</div>`);
  console.log(`PASS — UC-113 official Marvel discovery retained ${candidates.length} candidate delivery or probe(s)`);
  console.log(`manifest ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`summary ${sha(await readFile(join(OUT, 'summary.json')))}`);
  console.log(`contact ${contactSheet.sha256}`);
  console.log(`artifact ${OUT}`);
} finally {
  await browser.close();
}
