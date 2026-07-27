#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-079-DIRECT.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-079-direct';
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
function variants(target, url) {
  const rows = [];
  const push = (value, kind) => {
    if (value && !rows.some(row => row.url === value)) rows.push({ url: value, kind });
  };
  push(url, 'declared-delivery');
  try {
    const parsed = new URL(url);
    const unparameterized = new URL(url);
    unparameterized.search = '';
    push(unparameterized.href, 'unparameterized');

    if (parsed.hostname === 'images.paramount.tech') {
      for (const width of [2400, 2048, 1600, 1200]) {
        const copy = new URL(url);
        copy.searchParams.set('format', 'jpg');
        copy.searchParams.set('width', String(width));
        copy.searchParams.delete('height');
        copy.searchParams.delete('crop');
        copy.searchParams.delete('quality');
        push(copy.href, `paramount-width-${width}`);
      }
    }

    if (parsed.hostname === 'www.syfy.com' && parsed.pathname.includes('/styles/scale_862/public/')) {
      const original = new URL(url);
      original.pathname = original.pathname.replace('/styles/scale_862/public/', '/');
      push(original.href, 'syfy-original-file');
    }
  } catch {}
  return rows;
}
async function inspectPage(context, target) {
  const page = await context.newPage();
  try {
    const response = await page.goto(target.page_url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(1400);
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content();
    const title = await page.title();
    const hay = norm(body + ' ' + html);
    const missing = target.required_terms.filter(term => !hay.includes(norm(term)));
    const screenshot = `pages/${target.key}.png`;
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: true });

    const metadata = target.asset_mode === 'active-page-metadata'
      ? await page.evaluate(selectors => {
          const rows = [];
          for (const selector of selectors) {
            for (const node of document.querySelectorAll(selector)) {
              const value = node.getAttribute('content') || node.getAttribute('href') || '';
              if (value) rows.push({ selector, value });
            }
          }
          for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
            try {
              const value = JSON.parse(script.textContent || 'null');
              const stack = [value];
              while (stack.length) {
                const current = stack.pop();
                if (!current) continue;
                if (typeof current === 'string') {
                  if (/^https?:\/\//.test(current) && /\.(?:jpe?g|png|webp)(?:\?|$)|images\.paramount\.tech/i.test(current)) rows.push({ selector: 'json-ld', value: current });
                  continue;
                }
                if (Array.isArray(current)) stack.push(...current);
                else if (typeof current === 'object') stack.push(...Object.values(current));
              }
            } catch {}
          }
          return rows;
        }, target.metadata_selectors)
      : [];

    const screenshotBytes = await readFile(join(OUT, screenshot));
    return {
      evidence: {
        status: 'loaded',
        http_status: response?.status() || null,
        title,
        resolved_url: page.url(),
        required_terms: target.required_terms,
        required_terms_missing: missing,
        body_text: body.slice(0, 20000),
        screenshot: { path: screenshot, sha256: sha(screenshotBytes), bytes: screenshotBytes.length },
        metadata
      },
      metadata
    };
  } catch (error) {
    return { evidence: { status: 'error', error: error.message, required_terms: target.required_terms, required_terms_missing: target.required_terms }, metadata: [] };
  } finally {
    await page.close();
  }
}
async function download(context, target, variant, index) {
  let response;
  try {
    response = await context.request.get(variant.url, {
      headers: { 'User-Agent': UA, Referer: target.page_url, Accept: 'image/jpeg,image/webp,image/png,image/*,*/*;q=0.2' },
      timeout: 60000,
      failOnStatusCode: false
    });
  } catch (error) {
    return { target_key: target.key, source_page: target.page_url, probe_url: variant.url, probe_kind: variant.kind, download_error: error.message };
  }
  if (!response.ok()) return { target_key: target.key, source_page: target.page_url, probe_url: variant.url, probe_kind: variant.kind, download_error: `HTTP ${response.status()}` };
  const bytes = Buffer.from(await response.body());
  const mime = signatureMime(bytes);
  if (bytes.length < 12000 || mime === 'unknown') return { target_key: target.key, source_page: target.page_url, probe_url: variant.url, probe_kind: variant.kind, download_error: `unusable ${bytes.length} ${mime}` };
  const local = `candidates/${String(index).padStart(3, '0')}-${slug(target.key)}-${slug(variant.kind)}.${extensionFor(mime)}`;
  const path = join(OUT, local);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  let dimensions = { width: 0, height: 0 };
  try { dimensions = identify(path); } catch {}
  if (dimensions.width < 360 || dimensions.height < 240) return { target_key: target.key, source_page: target.page_url, probe_url: variant.url, probe_kind: variant.kind, local, mime, bytes: bytes.length, sha256: sha(bytes), ...dimensions, download_error: 'image below 360x240 floor' };
  return {
    target_key: target.key,
    family: target.family,
    expected_roles: target.expected_roles,
    provider: target.provider,
    source_page: target.page_url,
    asset_mode: target.asset_mode,
    declared_caption: target.asset_caption || null,
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
async function buildContactSheet(rows, target) {
  const thumbs = [];
  for (let position = 0; position < rows.length; position++) {
    const row = rows[position];
    const thumb = join(OUT, 'thumbs', `${slug(target.key)}-${String(position + 1).padStart(2, '0')}.jpg`);
    await mkdir(dirname(thumb), { recursive: true });
    magick(join(OUT, row.local), '-auto-orient', '-thumbnail', '460x345>', '-background', '#171512', '-gravity', 'center', '-extent', '460x345', '-fill', 'white', '-undercolor', '#171512cc', '-gravity', 'south', '-pointsize', '13', '-annotate', '+0+5', `${String(position + 1).padStart(2, '0')} ${row.probe_kind} ${row.width}x${row.height}`, '-strip', '-quality', '88', thumb);
    thumbs.push(thumb);
  }
  const path = join(OUT, `contact-sheet-${target.key}.jpg`);
  execFileSync('montage', [...thumbs, '-tile', '3x', '-geometry', '460x345+10+10', '-background', '#e8e3d9', path], { stdio: 'inherit' });
  return { path: `contact-sheet-${target.key}.jpg`, target_key: target.key, expected_roles: target.expected_roles, candidate_count: rows.length, ...identify(path), sha256: sha(await readFile(path)) };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-079', 'UC-079 direct scope drift');
assert(control.actor === 'Eddie Murphy' && control.character === 'Barbershop crowd & Saul' && control.side === 'still', 'UC-079 direct identity drift');
assert(control.selector_artifact?.artifact_id === 8658596662 && control.scope_artifact?.artifact_id === 8658730962 && control.broad_discovery_artifact?.artifact_id === 8659221908, 'UC-079 direct custody drift');
assert(control.failed_targeted_checkpoints?.length === 2 && control.targets?.length === 6, 'UC-079 direct checkpoint or target denominator drift');
assert(control.selection_contract?.required_target_keys?.length === 6 && control.selection_contract?.canonical_mutation === false, 'UC-079 direct selection contract drift');
await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US' });

try {
  const pageEvidence = {};
  const attempted = [];
  const candidates = [];
  const candidatesByTarget = {};
  const contactSheets = {};
  let index = 0;

  for (const target of control.targets) {
    const inspected = await inspectPage(context, target);
    pageEvidence[target.key] = inspected.evidence;
    assert(inspected.evidence.status === 'loaded' && inspected.evidence.required_terms_missing.length === 0, `${target.key} required page evidence failed: ${inspected.evidence.required_terms_missing.join(', ')}`);

    const declaredUrls = [];
    if (target.asset_mode === 'active-page-metadata') {
      for (const row of inspected.metadata) {
        try {
          const value = new URL(row.value, inspected.evidence.resolved_url).href;
          if (!declaredUrls.includes(value)) declaredUrls.push(value);
        } catch {}
      }
      assert(declaredUrls.length >= 1, `${target.key} exposed no page-specific metadata image`);
    } else {
      assert(target.asset_mode === 'declared-direct-asset' && target.asset_url && target.asset_caption, `${target.key} direct asset declaration drift`);
      declaredUrls.push(target.asset_url);
    }

    const targetCandidates = [];
    const targetSeen = new Set();
    for (const declaredUrl of declaredUrls) {
      for (const variant of variants(target, declaredUrl)) {
        const result = await download(context, target, variant, ++index);
        attempted.push(result);
        if (!result.sha256 || result.download_error || targetSeen.has(result.sha256)) continue;
        targetSeen.add(result.sha256);
        result.repository_matches = repository.get(result.sha256) || [];
        targetCandidates.push(result);
        candidates.push(result);
      }
    }
    targetCandidates.sort((a, b) => (b.width * b.height - a.width * a.height) || b.bytes - a.bytes || a.probe_kind.localeCompare(b.probe_kind));
    assert(targetCandidates.length >= 1, `${target.key} produced no usable explicit candidate`);
    assert(targetCandidates.every(row => row.repository_matches.length === 0), `${target.key} contains an exact canonical duplicate`);
    candidatesByTarget[target.key] = targetCandidates;
    contactSheets[target.key] = await buildContactSheet(targetCandidates, target);
  }

  const comingClarence = candidatesByTarget['coming-clarence-saul'];
  const comingRandy = candidatesByTarget['coming-randy-watson'];
  assert(!comingClarence.some(left => comingRandy.some(right => left.sha256 === right.sha256)), 'BET page metadata did not distinguish Clarence/Saul from Randy Watson');
  assert(control.selection_contract.required_target_keys.every(key => (candidatesByTarget[key] || []).length >= 1), 'UC-079 direct candidate floor failed');

  const manifest = {
    version: 1,
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
    failed_targeted_checkpoints: control.failed_targeted_checkpoints,
    selection_contract: control.selection_contract,
    repository_hash_count: repository.size,
    page_evidence: pageEvidence,
    attempted,
    candidates,
    candidate_count: candidates.length,
    candidate_count_by_target: Object.fromEntries(Object.entries(candidatesByTarget).map(([key, rows]) => [key, rows.length])),
    contact_sheets: contactSheets,
    disposition: 'explicit-role-assets-pending-visual-selection',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-079',
    actor: 'Eddie Murphy',
    candidate_count: candidates.length,
    candidate_count_by_target: manifest.candidate_count_by_target,
    candidates: candidates.map(({ target_key, family, expected_roles, provider, source_page, asset_mode, declared_caption, probe_url, probe_kind, resolved_url, local, mime, bytes, sha256, width, height, repository_matches }) => ({ target_key, family, expected_roles, provider, source_page, asset_mode, declared_caption, probe_url, probe_kind, resolved_url, local, mime, bytes, sha256, width, height, repository_matches }))
  });

  const sections = control.targets.map(target => {
    const rows = candidatesByTarget[target.key];
    const cards = rows.map((row, position) => `<article><img src="${row.local}" alt=""><h3>${position + 1} · ${target.key}</h3><p>${row.probe_kind} · ${row.width}×${row.height} · ${row.bytes} bytes</p><p>${row.declared_caption || pageEvidence[target.key].title}</p><code>${row.sha256}</code></article>`).join('');
    return `<section><h2>${target.key}</h2><p>${target.provider} · expected roles: ${target.expected_roles.join(', ')}</p><div class="grid">${cards}</div></section>`;
  }).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}section{margin:0 0 48px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}article{background:white;padding:10px}article img{width:100%;height:380px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-079 explicit role assets</h1><p>Candidate-only. BET candidates come only from the active slide's page metadata. SYFY candidates come only from the direct image asset attached to the named role caption.</p>${sections}`);

  console.log(`PASS — UC-079 explicit role asset collection complete: ${candidates.length} candidate(s)`);
  for (const [key, rows] of Object.entries(candidatesByTarget)) console.log(`${key}=${rows.length}`);
  console.log(`manifest ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`artifact ${OUT}`);
} finally {
  await browser.close();
}
