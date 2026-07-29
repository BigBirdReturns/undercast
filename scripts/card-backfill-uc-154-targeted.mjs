#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-154-TARGETED.json';
const FAILURES = '.github/CARD-BACKFILL-UC-154-DISCOVER-FAILURES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-154-targeted';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha = value => createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/<[^>]+>/g, ' ').replace(/&(?:[a-z][a-z0-9]{1,31}|#\d{1,7}|#x[0-9a-f]{1,6});/gi, ' ').replace(/[^a-zA-Z0-9']+/g, ' ').trim().toLowerCase();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); };
function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return 'unknown';
}
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
function responseStatus(response) { return response ? (typeof response.status === 'function' ? response.status() : response.status) : null; }
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
    await page.waitForTimeout(1500); await acceptBanners(page);
    for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 1400); await page.waitForTimeout(150); }
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content().catch(() => '');
    const title = await page.title();
    const hay = norm(`${title} ${body} ${html}`);
    const missing = spec.required_terms.filter(term => !hay.includes(norm(term)));
    await mkdir(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const screenshotBytes = await readFile(screenshotPath);
    return {
      status: 'loaded', http_status: responseStatus(response), transport, title, resolved_url: page.url() || spec.url,
      required_terms: spec.required_terms, required_terms_missing: missing,
      body_text: body.slice(0, 60000), body_sha256: sha(Buffer.from(body.slice(0, 60000), 'utf8')),
      screenshot: { path: `pages/${spec.key}.png`, sha256: sha(screenshotBytes), bytes: screenshotBytes.length, ...identify(screenshotPath) }
    };
  } catch (error) {
    await mkdir(dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
    let screenshot = null;
    try { const bytes = await readFile(screenshotPath); screenshot = { path: `pages/${spec.key}.png`, sha256: sha(bytes), bytes: bytes.length, ...identify(screenshotPath) }; } catch {}
    return { status: 'error', error: error.message, required_terms: spec.required_terms, required_terms_missing: spec.required_terms, screenshot };
  } finally { await page.close(); }
}

const control = await readJson(CONTROL);
const failureLedger = await readJson(FAILURES);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-154', 'UC-154 targeted scope drift');
assert(control.actor === 'Tyler Mane' && control.character === 'Michael Myers' && control.production === 'Halloween (2007)' && control.years === '2007–2009' && control.side === 'still', 'UC-154 targeted identity drift');
assert(control.selector_artifact?.artifact_id === 8710537497 && control.scope_artifact?.artifact_id === 8710630547 && control.rejected_broad_discovery?.artifact_id === 8710917909, 'UC-154 targeted custody drift');
assert(failureLedger.version === 1 && failureLedger.record_id === 'UC-154' && failureLedger.failed_discovery_checkpoints?.length === 1 && failureLedger.failed_discovery_checkpoints[0]?.artifact_id === 8710917909, 'UC-154 failed checkpoint custody drift');
assert(control.pages?.length === 4 && control.exact_candidate?.sha256 === 'a40a077d146d698d699b9cbc5e10d1c41be6be4f25202638b82cb64daeaada28', 'UC-154 targeted denominator drift');
assert(control.selection_contract?.exact_single_candidate_required === true && control.selection_contract?.halloween_2007_first_film_required === true && control.selection_contract?.mixed_gallery_inventory_forbidden === true && control.selection_contract?.halloween_ii_2009_substitute_forbidden === true && control.selection_contract?.canonical_mutation === false, 'UC-154 targeted selection contract drift');
const specimen = (await readJson('data/specimens.json')).find(row => row.id === 'UC-154');
const source = (await readJson('data/SOURCES.json')).find(row => row.id === 'UC-154');
const audit = (await readJson('data/MEDIA-AUDIT.json')).items.find(row => row.id === control.audit_id);
assert(specimen && specimen.actor === 'Tyler Mane' && specimen.character === 'Michael Myers' && specimen.production === 'Halloween (2007)' && specimen.years === '2007–2009' && !specimen.still && specimen.portrait?.src === 'images/uc-154-portrait.jpg', 'UC-154 targeted specimen boundary drift');
assert(!source?.still && audit?.status === 'absent' && !audit?.asset, 'UC-154 targeted canonical absence drift');
await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US', ignoreHTTPSErrors: true });
try {
  const page_evidence = {};
  const page_screenshots = [];
  for (const pageSpec of control.pages) {
    const evidence = await inspectPage(context, pageSpec); page_evidence[pageSpec.key] = evidence;
    assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${pageSpec.key} targeted page transport failed`);
    assert(evidence.required_terms_missing.length === 0, `${pageSpec.key} targeted page terms missing: ${evidence.required_terms_missing.join(', ')}`);
    page_screenshots.push({ key: pageSpec.key, provider: pageSpec.provider, ...evidence.screenshot });
  }
  const exact = control.exact_candidate;
  const response = await context.request.get(exact.url, {
    headers: { 'User-Agent': UA, Referer: exact.source_page, Accept: 'image/jpeg,image/png,image/webp,image/*,*/*;q=0.2' },
    timeout: control.transport_timeout_ms, failOnStatusCode: false
  });
  assert(response.ok(), `UC-154 exact candidate HTTP ${response.status()}`);
  const bytes = Buffer.from(await response.body());
  const mime = signatureMime(bytes);
  assert(mime === exact.mime && bytes.length === exact.bytes && sha(bytes) === exact.sha256, `UC-154 exact candidate byte drift ${mime} ${bytes.length} ${sha(bytes)}`);
  const local = 'michael-myers-2007-original.jpg';
  await writeFile(join(OUT, local), bytes);
  const dimensions = identify(join(OUT, local));
  assert(dimensions.width === exact.width && dimensions.height === exact.height, `UC-154 exact candidate geometry drift ${dimensions.width}x${dimensions.height}`);
  const repositoryMatches = repository.get(exact.sha256) || [];
  assert(repositoryMatches.length === 0, `UC-154 exact candidate duplicates canonical media: ${repositoryMatches.join(', ')}`);
  const candidate = {
    key: exact.key, provider: exact.provider, source_page_key: exact.source_page_key, source_page: exact.source_page,
    declared_url: exact.url, resolved_url: response.url() || exact.url, caption: exact.caption,
    local, mime, bytes: bytes.length, sha256: sha(bytes), ...dimensions,
    first_film_2007: true, actor_role_custody_separate: true, repository_matches: repositoryMatches
  };
  const contactPath = join(OUT, 'contact-sheet.jpg');
  magick(join(OUT, local), '-auto-orient', '-thumbnail', '900x650>', '-background', '#171512', '-gravity', 'center', '-extent', '900x650', '-fill', 'white', '-undercolor', '#171512dd', '-gravity', 'south', '-pointsize', '15', '-annotate', '+0+8', `Tyler Mane as Michael Myers · Halloween (2007) · ${dimensions.width}x${dimensions.height}`, '-strip', '-quality', '90', contactPath);
  const contactSheet = { path: 'contact-sheet.jpg', sha256: sha(await readFile(contactPath)), ...identify(contactPath), candidate_count: 1 };
  const manifest = {
    version: 1, lane: 'card-backfill', record_id: 'UC-154', actor: 'Tyler Mane', character: 'Michael Myers', production: 'Halloween (2007)', years: '2007–2009', side: 'still', expected_subject: 'Michael Myers',
    generated_at: new Date().toISOString(), control_sha256: sha(await readFile(CONTROL)), failure_ledger_sha256: sha(await readFile(FAILURES)),
    selector_artifact: control.selector_artifact, scope_artifact: control.scope_artifact, rejected_broad_discovery: control.rejected_broad_discovery,
    failed_discovery_checkpoints: failureLedger.failed_discovery_checkpoints, repair_boundary: failureLedger.repair_boundary,
    repository_hash_count: repository.size,
    page_bindings: Object.fromEntries(control.pages.map(row => [row.key, { provider: row.provider, source_page: row.url, binding: row.binding, page_evidence_key: row.key }])),
    chronology_boundary: {
      canonical_years_semantics: '2007–2009 records Tyler Mane’s two-film tenure.',
      selected_frame_production: 'Halloween (2007)',
      halloween_ii_2009_substitute_forbidden: true,
      mixed_gallery_inventory_forbidden: true,
      actor_role_custody_separate_from_frame_custody: true
    },
    page_evidence, page_screenshots, candidate, candidate_count: 1, contact_sheet: contactSheet,
    selection_contract: control.selection_contract,
    disposition: 'exact-caption-local-first-film-candidate-pending-visual-second-desk', canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-154', actor: 'Tyler Mane', character: 'Michael Myers', production: 'Halloween (2007)', years: '2007–2009',
    failed_discovery_checkpoints: failureLedger.failed_discovery_checkpoints,
    candidate_count: 1, candidate, contact_sheet: contactSheet, canonical_mutation: false
  });
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}article{background:white;padding:16px;max-width:1100px}img{width:100%;max-height:760px;object-fit:contain;background:#171512}code{display:block;font-size:10px;word-break:break-all}</style><h1>UC-154 · exact Tyler Mane Michael Myers candidate</h1><article><img src="${local}" alt=""><h2>Official caption-local Halloween (2007) frame</h2><p>${exact.caption}</p><p>${dimensions.width}×${dimensions.height}</p><code>${candidate.sha256}</code></article>`);
  console.log('PASS — UC-154 targeted discovery retained exactly one caption-local first-film candidate');
  console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height} ${candidate.bytes}`);
  console.log(`manifest ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`summary ${sha(await readFile(join(OUT, 'summary.json')))}`);
  console.log(`contact ${contactSheet.sha256}`);
  console.log(`output ${OUT}`);
} finally { await browser.close(); }
