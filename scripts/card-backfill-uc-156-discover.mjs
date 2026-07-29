#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-156-DISCOVER.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-156-discover';
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
    await page.waitForTimeout(1400); await acceptBanners(page);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 1300); await page.waitForTimeout(140); }
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
async function downloadRole(context, role) {
  const attempts = [];
  const usable = [];
  for (const declaredUrl of role.declared_urls) {
    try {
      const response = await context.request.get(declaredUrl, {
        headers: { 'User-Agent': UA, Referer: role.page_url, Accept: 'image/jpeg,image/png,image/webp,image/*,*/*;q=0.2' },
        timeout: control.transport_timeout_ms, failOnStatusCode: false
      });
      if (!response.ok()) { attempts.push({ declared_url: declaredUrl, status: response.status(), error: 'http' }); continue; }
      const bytes = Buffer.from(await response.body());
      const mime = signatureMime(bytes);
      if (bytes.length < 12000 || mime === 'unknown') { attempts.push({ declared_url: declaredUrl, status: response.status(), bytes: bytes.length, mime, error: 'unusable-bytes' }); continue; }
      const hash = sha(bytes);
      const local = `candidates/${role.key}-${hash.slice(0, 12)}.${extensionFor(mime)}`;
      const path = join(OUT, local); await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
      const dimensions = identify(path);
      const row = { declared_url: declaredUrl, resolved_url: response.url() || declaredUrl, local, mime, bytes: bytes.length, sha256: hash, ...dimensions };
      attempts.push(row);
      if (dimensions.width >= control.minimum_width && dimensions.height >= control.minimum_height) usable.push(row);
    } catch (error) { attempts.push({ declared_url: declaredUrl, error: error.message }); }
  }
  assert(usable.length >= 1, `${role.key} produced no usable official character asset`);
  usable.sort((a, b) => (b.width * b.height - a.width * a.height) || b.bytes - a.bytes || a.declared_url.localeCompare(b.declared_url));
  const selected = usable[0];
  return { role_key: role.key, role: role.role, display_label: role.display_label, provider: role.provider, source_page_key: role.source_page_key, source_page: role.page_url, asset_title: role.asset_title, chronology: role.chronology, required_actor_role_page_key: role.required_actor_role_page_key, attempts, selected };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-156', 'UC-156 discovery scope drift');
assert(control.kind === 'voice' && control.actor === 'Nicholas Briggs' && control.character === 'The voice of the Daleks & Cybermen' && control.production === 'Doctor Who (2005– )' && control.years === '2005–' && control.side === 'still', 'UC-156 discovery identity drift');
assert(control.selector_artifact?.artifact_id === 8711475187 && control.scope_artifact?.artifact_id === 8711713144 && control.scope_artifact?.scope_sha256 === '8137be7e415847645be645c0b468f4605c1bda3a3108d51a76a93ba89fc4a20b', 'UC-156 discovery custody drift');
assert(control.actor_role_pages?.length === 2 && control.actor_role_pages.every(row => row.strict) && control.character_pages?.length === 2 && control.character_pages.every(row => row.strict) && control.roles?.length === 2, 'UC-156 discovery denominator drift');
assert(control.selection_contract?.exact_two_role_character_composite_required === true && JSON.stringify(control.selection_contract?.required_roles) === JSON.stringify(['dalek','cyberman']) && control.selection_contract?.nicholas_briggs_voice_performance_required_for_both_roles === true && control.selection_contract?.visible_operator_and_suit_performer_separation_required === true && control.selection_contract?.official_doctorwho_character_asset_required === true && control.selection_contract?.canonical_mutation === false, 'UC-156 selection contract drift');
const specimen = (await readJson('data/specimens.json')).find(row => row.id === 'UC-156');
const source = (await readJson('data/SOURCES.json')).find(row => row.id === 'UC-156');
const audit = (await readJson('data/MEDIA-AUDIT.json')).items.find(row => row.id === control.audit_id);
assert(specimen && specimen.kind === 'voice' && specimen.actor === 'Nicholas Briggs' && specimen.character === 'The voice of the Daleks & Cybermen' && specimen.production === 'Doctor Who (2005– )' && specimen.years === '2005–' && !specimen.still && specimen.portrait?.src === 'images/uc-156-portrait.jpg', 'UC-156 specimen boundary drift');
assert(!source?.still && source?.portrait?.src === 'images/uc-156-portrait.jpg' && audit?.status === 'absent' && !audit?.asset, 'UC-156 canonical still absence drift');
await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US', ignoreHTTPSErrors: true });
try {
  const page_evidence = {};
  const page_screenshots = [];
  for (const spec of [...control.actor_role_pages, ...control.character_pages]) {
    const evidence = await inspectPage(context, spec); page_evidence[spec.key] = evidence;
    assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${spec.key} page transport failed`);
    assert(evidence.required_terms_missing.length === 0, `${spec.key} terms missing: ${evidence.required_terms_missing.join(', ')}`);
    page_screenshots.push({ key: spec.key, provider: spec.provider, ...evidence.screenshot });
  }
  const roleRows = [];
  for (const role of control.roles) roleRows.push(await downloadRole(context, role));
  assert(new Set(roleRows.map(row => row.role_key)).size === 2, 'UC-156 role denominator drift');
  assert(new Set(roleRows.map(row => row.selected.sha256)).size === 2, 'UC-156 role assets are not byte-distinct');
  for (const row of roleRows) {
    row.selected.repository_matches = repository.get(row.selected.sha256) || [];
    assert(row.selected.repository_matches.length === 0, `${row.role_key} asset duplicates canonical media`);
  }

  const thumbs = [];
  for (let index = 0; index < roleRows.length; index++) {
    const row = roleRows[index];
    const thumb = join(OUT, 'thumbs', `${String(index + 1).padStart(2, '0')}-${row.role_key}.jpg`); await mkdir(dirname(thumb), { recursive: true });
    magick(join(OUT, row.selected.local), '-auto-orient', '-thumbnail', '620x760>', '-background', '#171512', '-gravity', 'center', '-extent', '620x760', '-fill', 'white', '-undercolor', '#171512dd', '-gravity', 'south', '-pointsize', '16', '-annotate', '+0+8', `${row.display_label} · ${row.selected.width}x${row.selected.height}`, '-strip', '-quality', '90', thumb);
    thumbs.push(thumb);
  }
  const contactPath = join(OUT, 'contact-sheet.jpg');
  execFileSync('montage', [...thumbs, '-tile', '2x1', '-geometry', '620x760+12+12', '-background', '#e8e3d9', contactPath], { stdio: 'inherit' });
  const contactSheet = { path: 'contact-sheet.jpg', sha256: sha(await readFile(contactPath)), ...identify(contactPath), candidate_count: roleRows.length };
  const roleCounts = Object.fromEntries(roleRows.map(row => [row.role_key, 1]));
  const candidates = roleRows.map(row => ({
    role_key: row.role_key, role: row.role, display_label: row.display_label, provider: row.provider,
    source_page_key: row.source_page_key, source_page: row.source_page, asset_title: row.asset_title,
    chronology: row.chronology, required_actor_role_page_key: row.required_actor_role_page_key,
    declared_url: row.selected.declared_url, resolved_url: row.selected.resolved_url, local: row.selected.local,
    mime: row.selected.mime, bytes: row.selected.bytes, sha256: row.selected.sha256,
    width: row.selected.width, height: row.selected.height, repository_matches: row.selected.repository_matches,
    official_character_asset: true, performance_mode: 'voice'
  }));
  const manifest = {
    version: 1, lane: 'card-backfill', record_id: 'UC-156', kind: 'voice', actor: 'Nicholas Briggs', character: 'The voice of the Daleks & Cybermen', production: 'Doctor Who (2005– )', years: '2005–', side: 'still', expected_subject: 'The voice of the Daleks & Cybermen',
    generated_at: new Date().toISOString(), control_sha256: sha(await readFile(CONTROL)), selector_artifact: control.selector_artifact, scope_artifact: control.scope_artifact,
    repository_hash_count: repository.size,
    actor_role_bindings: control.actor_role_pages.map(row => ({ key: row.key, provider: row.provider, source_page: row.url, binding: row.binding, page_evidence_key: row.key })),
    character_bindings: control.character_pages.map(row => ({ key: row.key, role_key: row.role_key, role: row.role, provider: row.provider, source_page: row.url, binding: row.binding, page_evidence_key: row.key })),
    chronology_boundary: {
      dalek_voice_start: 'Dalek, 30 April 2005',
      cyberman_voice_credit: 'Army of Ghosts, 1 July 2006',
      canonical_years_semantics: '2005– identifies Nicholas Briggs’s revived-era television voice tenure; it does not assign him classic-series voices.',
      operator_and_suit_performer_separation: 'Army of Ghosts separately credits Paul Kasey as Cyber Leader and Nicholas Briggs with Dalek/Cybermen voices.'
    },
    page_evidence, page_screenshots, role_attempts: Object.fromEntries(roleRows.map(row => [row.role_key, row.attempts])),
    candidates, candidate_count: candidates.length, role_counts: roleCounts, contact_sheet: contactSheet,
    selection_contract: control.selection_contract,
    disposition: 'official-two-role-character-orbit-pending-visual-second-desk', canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-156', actor: 'Nicholas Briggs', character: 'The voice of the Daleks & Cybermen', production: 'Doctor Who (2005– )', years: '2005–',
    candidate_count: candidates.length, role_counts: roleCounts, candidates, contact_sheet: contactSheet, canonical_mutation: false
  });
  const cards = candidates.map(row => `<article><img src="${row.local}" alt=""><h2>${row.display_label}</h2><p>${row.width}×${row.height}</p><p>${row.chronology}</p><code>${row.sha256}</code></article>`).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.grid{display:grid;grid-template-columns:repeat(2,minmax(360px,1fr));gap:16px}article{background:white;padding:12px}article img{width:100%;height:720px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-156 · Nicholas Briggs Dalek and Cyberman voice composite</h1><p>The character images are official DoctorWho.tv assets. Voice custody is separate from visible operators and suit performers.</p><div class="grid">${cards}</div>`);
  console.log(`PASS — UC-156 discovery retained ${candidates.length} official byte-distinct role asset(s)`);
  for (const row of candidates) console.log(`${row.role_key} ${row.sha256} ${row.width}x${row.height} ${row.bytes}`);
  console.log(`MANIFEST — ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`SUMMARY — ${sha(await readFile(join(OUT, 'summary.json')))}`);
  console.log(`CONTACT — ${contactSheet.sha256}`);
  console.log(`OUTPUT — ${OUT}`);
} finally { await browser.close(); }
