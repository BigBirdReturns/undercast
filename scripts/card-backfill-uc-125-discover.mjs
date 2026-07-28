#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-125-DISCOVER.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-125-discover';
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
async function inspectPage(context, spec) {
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
    const hay = norm(`${title} ${body} ${html}`);
    const missing = spec.required_terms.filter(term => !hay.includes(norm(term)));
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: false });
    const bytes = await readFile(join(OUT, screenshot));
    return {
      status: 'loaded',
      http_status: responseStatus(response),
      transport,
      title,
      resolved_url: page.url() || spec.url,
      required_terms: spec.required_terms,
      required_terms_missing: missing,
      body_text: body.slice(0, 60000),
      body_sha256: sha(Buffer.from(body.slice(0, 60000), 'utf8')),
      screenshot: { path: screenshot, sha256: sha(bytes), bytes: bytes.length, ...identify(join(OUT, screenshot), 'image/png') }
    };
  } catch (error) {
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: false }).catch(() => {});
    let screenshotRecord = null;
    try {
      const bytes = await readFile(join(OUT, screenshot));
      screenshotRecord = { path: screenshot, sha256: sha(bytes), bytes: bytes.length, ...identify(join(OUT, screenshot), 'image/png') };
    } catch {}
    return { status: 'error', error: error.message, required_terms: spec.required_terms, required_terms_missing: spec.required_terms, screenshot: screenshotRecord };
  } finally {
    await page.close();
  }
}
function assetVariants(url) {
  const rows = [];
  const push = (value, kind) => { if (value && !rows.some(row => row.url === value)) rows.push({ url: value, kind }); };
  push(url, 'declared-official-asset');
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'billywest.com') {
      parsed.hostname = 'www.billywest.com';
      push(parsed.href, 'www-host-fallback');
    }
  } catch {}
  return rows;
}
async function downloadRole(context, role) {
  const attempts = [];
  for (const variant of assetVariants(role.asset_url)) {
    try {
      const response = await context.request.get(variant.url, {
        headers: { 'User-Agent': UA, Referer: role.source_page, Accept: 'image/jpeg,image/webp,image/png,image/gif,image/*,*/*;q=0.2' },
        timeout: control.transport_timeout_ms,
        failOnStatusCode: false
      });
      if (!response.ok()) {
        attempts.push({ url: variant.url, kind: variant.kind, error: `HTTP ${response.status()}` });
        continue;
      }
      const bytes = Buffer.from(await response.body());
      const mime = signatureMime(bytes);
      if (bytes.length < 5000 || mime === 'unknown') {
        attempts.push({ url: variant.url, kind: variant.kind, error: `unusable ${bytes.length} ${mime}` });
        continue;
      }
      const local = `candidates/${role.key}/001-${slug(role.asset_title)}.${extensionFor(mime)}`;
      const path = join(OUT, local);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
      const dimensions = identify(path, mime);
      if (dimensions.width < role.minimum_width || dimensions.height < role.minimum_height) {
        attempts.push({ url: variant.url, kind: variant.kind, error: `below floor ${dimensions.width}x${dimensions.height}`, sha256: sha(bytes) });
        continue;
      }
      return {
        candidate: {
          role_key: role.key,
          role: role.role,
          display_label: role.display_label,
          provider: role.provider,
          source_page_key: role.source_page_key,
          source_page: role.source_page,
          asset_title: role.asset_title,
          role_history: role.role_history,
          declared_url: role.asset_url,
          probe_url: variant.url,
          probe_kind: variant.kind,
          resolved_url: response.url() || variant.url,
          local,
          mime,
          bytes: bytes.length,
          sha256: sha(bytes),
          ...dimensions,
          official_direct_asset: true
        },
        attempts
      };
    } catch (error) {
      attempts.push({ url: variant.url, kind: variant.kind, error: error.message });
    }
  }
  return { candidate: null, attempts };
}
async function buildContactSheet(role, candidate) {
  const thumb = join(OUT, 'thumbs', `${role.key}.jpg`);
  await mkdir(dirname(thumb), { recursive: true });
  const label = `${role.display_label} · ${candidate.width}x${candidate.height} · ${candidate.asset_title}`;
  magick(frameInput(join(OUT, candidate.local), candidate.mime), '-auto-orient', '-thumbnail', '600x420>', '-background', '#171512', '-gravity', 'center', '-extent', '600x420', '-fill', 'white', '-undercolor', '#171512dd', '-gravity', 'south', '-pointsize', '13', '-annotate', '+0+6', label, '-strip', '-quality', '88', thumb);
  const relative = `contact-sheet-${role.key}.jpg`;
  const path = join(OUT, relative);
  await writeFile(path, await readFile(thumb));
  return { path: relative, sha256: sha(await readFile(path)), ...identify(path, 'image/jpeg'), count: 1 };
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-125', 'UC-125 discovery scope drift');
assert(control.actor === 'Billy West' && control.character === 'Ren, Stimpy & Fry' && control.production === 'Ren & Stimpy / Futurama' && control.year === 1991 && control.side === 'still', 'UC-125 discovery identity drift');
assert(control.selector_artifact?.artifact_id === 8705167567 && control.scope_artifact?.artifact_id === 8705284505 && control.scope_artifact?.scope_sha256 === '7f44e5c6818fc19d11355dfea7645c930dc5e6312900232223931ab5f3f411c3', 'UC-125 discovery custody drift');
assert(control.actor_role_pages?.length === 4 && control.actor_role_pages.every(row => row.strict) && control.roles?.length === 3 && control.selection_contract?.required_role_keys?.length === 3, 'UC-125 discovery denominator drift');
assert(control.selection_contract?.exact_three_role_composite_required === true && control.selection_contract?.ren_1993_takeover_boundary_required === true && control.selection_contract?.stimpy_1991_role_boundary_required === true && control.selection_contract?.fry_1999_role_boundary_required === true && control.selection_contract?.canonical_1991_is_ren_and_stimpy_chronology_not_fry_debut === true && control.selection_contract?.all_three_panels_required === true && control.selection_contract?.canonical_mutation === false, 'UC-125 selection contract drift');
const specimen = (await readJson('data/specimens.json')).find(row => row.id === 'UC-125');
const source = (await readJson('data/SOURCES.json')).find(row => row.id === 'UC-125');
const audit = (await readJson('data/MEDIA-AUDIT.json')).items.find(row => row.id === control.audit_id);
assert(specimen && specimen.actor === 'Billy West' && specimen.character === 'Ren, Stimpy & Fry' && specimen.production === 'Ren & Stimpy / Futurama' && specimen.years === '1991' && !specimen.still, 'UC-125 specimen boundary drift');
assert(!source?.still && audit?.status === 'absent' && !audit?.asset, 'UC-125 canonical absence drift');
await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US', ignoreHTTPSErrors: true });
try {
  const page_evidence = {};
  const page_screenshots = [];
  for (const page of control.actor_role_pages) {
    const evidence = await inspectPage(context, page);
    page_evidence[page.key] = evidence;
    assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${page.key} official page transport failed`);
    assert(evidence.required_terms_missing.length === 0, `${page.key} official terms missing: ${evidence.required_terms_missing.join(', ')}`);
    page_screenshots.push({ key: page.key, provider: page.provider, ...evidence.screenshot });
  }

  const candidates = [];
  const attempted = [];
  const role_contacts = {};
  const seenHashes = new Map();
  for (const role of control.roles) {
    const result = await downloadRole(context, role);
    attempted.push(...result.attempts.map(row => ({ role_key: role.key, ...row })));
    assert(result.candidate, `UC-125 ${role.key} official asset produced no usable candidate`);
    const candidate = result.candidate;
    assert(!seenHashes.has(candidate.sha256), `UC-125 ${role.key} duplicates ${seenHashes.get(candidate.sha256)}`);
    seenHashes.set(candidate.sha256, role.key);
    candidate.repository_matches = repository.get(candidate.sha256) || [];
    assert(candidate.repository_matches.length === 0, `UC-125 ${role.key} official asset duplicates canonical media`);
    candidates.push(candidate);
    role_contacts[role.key] = await buildContactSheet(role, candidate);
  }
  assert(candidates.length === 3 && new Set(candidates.map(row => row.sha256)).size === 3, 'UC-125 three-role byte distinction drift');
  const roleCounts = Object.fromEntries(control.roles.map(role => [role.key, candidates.filter(row => row.role_key === role.key).length]));
  assert(JSON.stringify(roleCounts) === JSON.stringify({ ren: 1, stimpy: 1, fry: 1 }), `UC-125 role coverage drift ${JSON.stringify(roleCounts)}`);
  const allContactPath = join(OUT, 'contact-sheet-all-roles.jpg');
  execFileSync('montage', [join(OUT, role_contacts.ren.path), join(OUT, role_contacts.stimpy.path), join(OUT, role_contacts.fry.path), '-tile', '3x1', '-geometry', '600x420+10+10', '-background', '#d5d0c7', allContactPath], { stdio: 'inherit' });
  const allContact = { path: 'contact-sheet-all-roles.jpg', sha256: sha(await readFile(allContactPath)), ...identify(allContactPath, 'image/jpeg'), role_counts: roleCounts };

  const manifest = {
    version: 1,
    lane: 'card-backfill',
    record_id: 'UC-125',
    actor: 'Billy West',
    character: 'Ren, Stimpy & Fry',
    production: 'Ren & Stimpy / Futurama',
    year: 1991,
    side: 'still',
    expected_subject: 'Ren, Stimpy & Fry',
    generated_at: new Date().toISOString(),
    control_sha256: sha(await readFile(CONTROL)),
    selector_artifact: control.selector_artifact,
    scope_artifact: control.scope_artifact,
    repository_hash_count: repository.size,
    actor_role_bindings: control.actor_role_pages.map(row => ({ key: row.key, provider: row.provider, source_page: row.url, binding: row.binding, page_evidence_key: row.key })),
    chronology_boundary: {
      canonical_year_semantics: '1991 is the Ren & Stimpy era, not Philip J. Fry or Futurama debut chronology.',
      ren_role_history: 'Billy West official history begins his Ren performance in 1993.',
      stimpy_role_history: 'Billy West official history carries Stimpy from the 1991 series start.',
      fry_role_history: 'Billy West official history carries Philip J. Fry from Futurama beginning in 1999.'
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
    disposition: 'three-role-official-candidate-orbit-pending-visual-second-desk',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-125',
    actor: 'Billy West',
    character: 'Ren, Stimpy & Fry',
    production: 'Ren & Stimpy / Futurama',
    role_counts: roleCounts,
    candidate_count: candidates.length,
    candidates: candidates.map(row => ({ role_key: row.role_key, role: row.role, asset_title: row.asset_title, role_history: row.role_history, local: row.local, mime: row.mime, bytes: row.bytes, sha256: row.sha256, width: row.width, height: row.height, repository_matches: row.repository_matches })),
    actor_role_pages: control.actor_role_pages.map(row => ({ key: row.key, provider: row.provider, url: row.url, screenshot_sha256: page_evidence[row.key]?.screenshot?.sha256 || null, body_sha256: page_evidence[row.key]?.body_sha256 || null })),
    role_contact_sheets: role_contacts,
    contact_sheet: allContact,
    canonical_1991_is_ren_and_stimpy_chronology_not_fry_debut: true,
    canonical_mutation: false
  });
  const cards = candidates.map(row => `<article><img src="${row.local}" alt=""><h2>${row.display_label}</h2><p>${row.width}×${row.height}</p><p>${row.role_history}</p><code>${row.sha256}</code></article>`).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.grid{display:grid;grid-template-columns:repeat(3,minmax(280px,1fr));gap:12px}article{background:white;padding:10px}article img{width:100%;height:420px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-125 · Billy West official three-role image orbit</h1><p>1991 remains Ren & Stimpy chronology; Ren begins in 1993 and Fry in 1999.</p><div class="grid">${cards}</div>`);
  console.log(`PASS — UC-125 official discovery retained ${candidates.length} byte-distinct role candidate(s)`);
  console.log(`ROLES — ${JSON.stringify(roleCounts)}`);
  console.log(`MANIFEST — ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`SUMMARY — ${sha(await readFile(join(OUT, 'summary.json')))}`);
  console.log(`CONTACT — ${allContact.sha256}`);
  console.log(`OUTPUT — ${OUT}`);
} finally {
  await browser.close();
}
