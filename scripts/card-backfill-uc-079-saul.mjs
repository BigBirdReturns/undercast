#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-079-SAUL.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-079-saul';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
};
const norm = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[’‘]/g, "'")
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[^;]+;/g, ' ')
  .replace(/[^a-zA-Z0-9\u0400-\u04FF']+/g, ' ')
  .trim()
  .toLowerCase();

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
async function inspectPage(context, source) {
  const page = await context.newPage();
  try {
    const response = await page.goto(source.page_url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(1500);
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(250);
    }
    const body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content();
    const hay = norm(body + ' ' + html);
    const missing = source.required_terms.filter(term => !hay.includes(norm(term)));
    const screenshot = `pages/${source.key}.png`;
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await page.screenshot({ path: join(OUT, screenshot), fullPage: true });
    return {
      status: 'loaded',
      http_status: response?.status() || null,
      title: await page.title(),
      resolved_url: page.url(),
      required_terms: source.required_terms,
      required_terms_missing: missing,
      body_text: body.slice(0, 24000),
      screenshot
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
      required_terms: source.required_terms,
      required_terms_missing: source.required_terms
    };
  } finally {
    await page.close();
  }
}
async function downloadAsset(context, source) {
  const response = await context.request.get(source.asset_url, {
    headers: {
      'User-Agent': UA,
      Referer: source.page_url,
      Accept: 'image/jpeg,image/webp,image/png,image/*,*/*;q=0.2'
    },
    timeout: 90000,
    failOnStatusCode: false
  });
  assert(response.ok(), `${source.key} asset HTTP ${response.status()}`);
  const bytes = Buffer.from(await response.body());
  const mime = signatureMime(bytes);
  assert(mime !== 'unknown' && bytes.length >= 20000, `${source.key} unusable asset ${bytes.length} ${mime}`);
  const local = `sources/${source.key}.${extensionFor(mime)}`;
  const path = join(OUT, local);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  const dimensions = identify(path);
  return {
    provider: source.provider,
    source_page: source.page_url,
    asset_url: source.asset_url,
    resolved_url: response.url() || source.asset_url,
    local,
    bytes: bytes.length,
    sha256: sha(bytes),
    mime,
    ...dimensions,
    repository_matches: []
  };
}
function quadrantGeometry(width, height, quadrant) {
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);
  const rightW = width - halfW;
  const bottomH = height - halfH;
  if (quadrant === 'top_left') return { x: 0, y: 0, width: halfW, height: halfH };
  if (quadrant === 'top_right') return { x: halfW, y: 0, width: rightW, height: halfH };
  if (quadrant === 'bottom_left') return { x: 0, y: halfH, width: halfW, height: bottomH };
  if (quadrant === 'bottom_right') return { x: halfW, y: halfH, width: rightW, height: bottomH };
  throw new Error(`unknown quadrant ${quadrant}`);
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-079', 'UC-079 Saul scope drift');
assert(control.actor === 'Eddie Murphy' && control.character === 'Barbershop crowd & Saul' && control.side === 'still', 'UC-079 Saul identity drift');
assert(control.direct_role_artifact?.artifact_id === 8660410939 && control.direct_role_artifact?.head_sha === '317350429efce56a8307f165d4a9a2b6de032fa9', 'UC-079 direct-role custody drift');
assert(control.sources?.length === 3 && control.sources.filter(source => source.asset_url).length === 2, 'UC-079 Saul source denominator drift');

await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US' });
try {
  const page_evidence = {};
  const page_screenshots = [];
  const sources = [];
  const quadrants = [];
  const thumbs = [];

  for (const source of control.sources) {
    const evidence = await inspectPage(context, source);
    page_evidence[source.key] = evidence;
    if (evidence.screenshot) {
      const bytes = await readFile(join(OUT, evidence.screenshot));
      page_screenshots.push({ source_key: source.key, provider: source.provider, path: evidence.screenshot, sha256: sha(bytes), bytes: bytes.length });
    }
    if (source.strict) {
      assert(evidence.status === 'loaded' && evidence.http_status >= 200 && evidence.http_status < 400, `${source.key} page transport failed`);
      assert(evidence.required_terms_missing.length === 0, `${source.key} required terms missing: ${evidence.required_terms_missing.join(', ')}`);
    }
    if (!source.asset_url) continue;

    const asset = await downloadAsset(context, source);
    assert(asset.width >= control.minimum_source_width && asset.height >= control.minimum_source_height, `${source.key} source below floor ${asset.width}x${asset.height}`);
    asset.repository_matches = repository.get(asset.sha256) || [];
    sources.push(asset);

    for (const [quadrant, role] of Object.entries(source.layout)) {
      const geometry = quadrantGeometry(asset.width, asset.height, quadrant);
      const local = `quadrants/${source.key}-${quadrant}.jpg`;
      const path = join(OUT, local);
      await mkdir(dirname(path), { recursive: true });
      magick(
        join(OUT, asset.local),
        '-crop', `${geometry.width}x${geometry.height}+${geometry.x}+${geometry.y}`,
        '+repage',
        '-strip',
        '-quality', '96',
        path
      );
      const bytes = await readFile(path);
      const row = {
        source_key: source.key,
        provider: source.provider,
        source_page: source.page_url,
        source_sha256: asset.sha256,
        quadrant,
        role,
        selected_for_saul: quadrant === source.saul_quadrant,
        local,
        bytes: bytes.length,
        sha256: sha(bytes),
        mime: 'image/jpeg',
        ...identify(path),
        repository_matches: repository.get(sha(bytes)) || []
      };
      quadrants.push(row);

      const thumb = join(OUT, 'thumbs', `${source.key}-${quadrant}.jpg`);
      await mkdir(dirname(thumb), { recursive: true });
      magick(
        path,
        '-thumbnail', '480x360>',
        '-background', '#171512',
        '-gravity', 'center',
        '-extent', '480x360',
        '-fill', 'white',
        '-undercolor', '#171512cc',
        '-gravity', 'south',
        '-pointsize', '13',
        '-annotate', '+0+5', `${source.key} · ${role}`,
        '-strip',
        '-quality', '90',
        thumb
      );
      thumbs.push(thumb);
    }
  }

  assert(sources.length >= 1, 'UC-079 Saul orbit produced no source asset');
  const saulCandidates = quadrants.filter(row => row.selected_for_saul);
  assert(saulCandidates.length >= 1, 'UC-079 Saul orbit produced no mapped Saul quadrant');
  assert(saulCandidates.every(row => row.repository_matches.length === 0), 'UC-079 Saul quadrant duplicates canonical media');
  const contact = join(OUT, 'contact-sheet.jpg');
  execFileSync('montage', [...thumbs, '-tile', '4x', '-geometry', '480x360+10+10', '-background', '#e8e3d9', contact], { stdio: 'inherit' });

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
    direct_role_artifact: control.direct_role_artifact,
    repository_hash_count: repository.size,
    page_evidence,
    page_screenshots,
    sources,
    quadrants,
    saul_candidates: saulCandidates,
    contact_sheet: { path: 'contact-sheet.jpg', sha256: sha(await readFile(contact)), ...identify(contact) },
    disposition: 'candidate-only-pending-visual-selection',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-079',
    source_count: sources.length,
    saul_candidate_count: saulCandidates.length,
    saul_candidates: saulCandidates,
    contact_sheet: manifest.contact_sheet,
    canonical_mutation: false
  });
  console.log(`PASS — UC-079 explicit Saul orbit retained ${saulCandidates.length} mapped candidate(s)`);
  console.log(`manifest ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`contact ${manifest.contact_sheet.sha256}`);
} finally {
  await browser.close();
}
