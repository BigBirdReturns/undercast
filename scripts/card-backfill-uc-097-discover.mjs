#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-097-DISCOVER.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-097-discover';
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
function variants(url) {
  const rows = [];
  const push = (value, kind) => {
    if (value && !rows.some(row => row.url === value)) rows.push({ url: value, kind });
  };
  push(url, 'declared-delivery');
  try {
    const parsed = new URL(url);
    const noQuery = new URL(url);
    noQuery.search = '';
    push(noQuery.href, 'unparameterized-original-probe');
    if (parsed.hostname === 'lumiere-a.akamaihd.net' && parsed.searchParams.has('region')) {
      const expanded = new URL(url);
      expanded.searchParams.set('region', '0,0,2400,1120');
      push(expanded.href, 'expanded-region-probe');
    }
  } catch {}
  return rows;
}
async function inspectPage(context, pageSpec) {
  const page = await context.newPage();
  try {
    const response = await page.goto(pageSpec.url, { waitUntil: 'domcontentloaded', timeout: control.transport_timeout_ms });
    await page.waitForTimeout(1600);
    for (const label of ['CONTINUE', 'Accept', 'I Accept', 'Agree', 'Allow all']) {
      const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
      if (await button.count().catch(() => 0)) {
        await button.first().click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(350);
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
    const hay = norm(`${body} ${html}`);
    const missing = pageSpec.required_terms.filter(term => !hay.includes(norm(term)));
    const alt_receipts = (pageSpec.final_assets || []).map(asset => ({
      asset_key: asset.key,
      alt: asset.alt,
      present: hay.includes(norm(asset.alt))
    }));
    const screenshot = `pages/${pageSpec.key}.png`;
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: true });
    const screenshotBytes = await readFile(join(OUT, screenshot));
    return {
      status: 'loaded',
      http_status: response?.status() || null,
      title,
      resolved_url: page.url(),
      required_terms: pageSpec.required_terms,
      required_terms_missing: missing,
      body_text: body.slice(0, 30000),
      screenshot,
      screenshot_sha256: sha(screenshotBytes),
      screenshot_bytes: screenshotBytes.length,
      screenshot_geometry: identify(join(OUT, screenshot)),
      final_asset_alt_receipts: alt_receipts
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
      required_terms: pageSpec.required_terms,
      required_terms_missing: pageSpec.required_terms,
      final_asset_alt_receipts: (pageSpec.final_assets || []).map(asset => ({ asset_key: asset.key, alt: asset.alt, present: false }))
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
  if (dimensions.width < 600 || dimensions.height < 350) {
    return {
      page_key: pageSpec.key,
      provider: pageSpec.provider,
      source_page: pageSpec.url,
      asset_key: asset.key,
      alt: asset.alt,
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
      download_error: 'image below 600x350 floor'
    };
  }
  return {
    page_key: pageSpec.key,
    provider: pageSpec.provider,
    source_page: pageSpec.url,
    asset_key: asset.key,
    alt: asset.alt,
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
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-097', 'UC-097 discovery scope drift');
assert(control.actor === 'Dan Stevens' && control.character === 'The Beast' && control.production === 'Beauty and the Beast' && control.year === 2017 && control.side === 'still', 'UC-097 discovery identity drift');
assert(control.selector_artifact?.artifact_id === 8672452482 && control.scope_artifact?.artifact_id === 8672497758, 'UC-097 discovery custody drift');
assert(control.pages?.length === 3 && control.pages.filter(page => page.strict).length === 3, 'UC-097 page denominator drift');
assert(control.pages[0]?.final_assets?.length === 2 && control.minimum_final_candidates === 2, 'UC-097 final candidate denominator drift');
assert(control.selection_contract?.official_disney_final_frame_required === true && control.selection_contract?.exact_2017_live_action_beast_required === true && control.selection_contract?.canonical_mutation === false, 'UC-097 selection contract drift');
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
    const evidence = await inspectPage(context, pageSpec);
    page_evidence[pageSpec.key] = evidence;
    if (evidence.screenshot) {
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
      assert((evidence.final_asset_alt_receipts || []).every(row => row.present), `${pageSpec.key} final image alt custody failed`);
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
  assert(represented.size === 2, `UC-097 discovery represented only ${represented.size} official final assets`);
  assert(candidates.length >= control.minimum_final_candidates, `UC-097 discovery produced only ${candidates.length} usable candidates`);
  candidates.sort((a, b) => a.asset_key.localeCompare(b.asset_key) || (b.width * b.height - a.width * a.height) || a.local.localeCompare(b.local));

  const thumbs = [];
  for (let position = 0; position < candidates.length; position++) {
    const row = candidates[position];
    const thumb = join(OUT, 'thumbs', `${String(position + 1).padStart(2, '0')}.jpg`);
    await mkdir(dirname(thumb), { recursive: true });
    magick(
      join(OUT, row.local),
      '-auto-orient',
      '-thumbnail', '560x360>',
      '-background', '#171512',
      '-gravity', 'center',
      '-extent', '560x360',
      '-fill', 'white',
      '-undercolor', '#171512cc',
      '-gravity', 'south',
      '-pointsize', '14',
      '-annotate', '+0+6', `${String(position + 1).padStart(2, '0')} ${row.asset_key} ${row.width}x${row.height}`,
      '-strip',
      '-quality', '88',
      thumb
    );
    thumbs.push(thumb);
  }
  const contact = join(OUT, 'contact-sheet-final.jpg');
  execFileSync('montage', [...thumbs, '-tile', '2x', '-geometry', '560x360+12+12', '-background', '#e8e3d9', contact], { stdio: 'inherit' });

  const manifest = {
    version: 1,
    lane: 'card-backfill',
    record_id: 'UC-097',
    actor: 'Dan Stevens',
    character: 'The Beast',
    production: 'Beauty and the Beast',
    year: 2017,
    side: 'still',
    expected_subject: 'The Beast',
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
    represented_asset_keys: [...represented].sort(),
    contact_sheet: { path: 'contact-sheet-final.jpg', sha256: sha(await readFile(contact)), ...identify(contact) },
    disposition: 'candidate-only-pending-visual-selection',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-097',
    actor: 'Dan Stevens',
    character: 'The Beast',
    candidate_count: candidates.length,
    represented_asset_keys: [...represented].sort(),
    candidates: candidates.map(({ page_key, provider, source_page, asset_key, alt, admission_class, expected_subject, declared_url, probe_url, probe_kind, resolved_url, local, mime, bytes, sha256, width, height, repository_matches }) => ({ page_key, provider, source_page, asset_key, alt, admission_class, expected_subject, declared_url, probe_url, probe_kind, resolved_url, local, mime, bytes, sha256, width, height, repository_matches }))
  });
  const cards = candidates.map((row, position) => `<article><img src="${row.local}" alt=""><h2>${position + 1} · ${row.asset_key}</h2><p>${row.provider} · ${row.width}×${row.height} · ${row.bytes} bytes</p><p>${row.alt}</p><p>${row.repository_matches.length ? `duplicate: ${row.repository_matches.join(', ')}` : 'no exact canonical duplicate'}</p><code>${row.sha256}</code></article>`).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.sheet{max-width:100%}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:12px}article{background:white;padding:10px}article img{width:100%;height:360px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-097 · Dan Stevens / The Beast</h1><p>Candidate-only. Approve only the 2017 live-action Beast. Reject the human Prince, 1991 animation, stage, merchandise, art, posters, and unrelated Beast designs.</p><img class="sheet" src="contact-sheet-final.jpg" alt=""><div class="grid">${cards}</div>`);
  console.log(`PASS — UC-097 official Disney discovery retained ${candidates.length} candidate delivery or original probe(s) across ${represented.size} final frames`);
  console.log(`manifest ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`summary ${sha(await readFile(join(OUT, 'summary.json')))}`);
  console.log(`contact ${sha(await readFile(contact))}`);
  console.log(`artifact ${OUT}`);
} finally {
  await browser.close();
}
