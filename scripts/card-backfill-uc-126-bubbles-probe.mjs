#!/usr/bin/env node
import { request } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-126-BUBBLES-PROBE.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-126-bubbles-probe';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha = value => createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/<[^>]+>/g, ' ').replace(/&(?:[a-z][a-z0-9]{1,31}|#\d{1,7}|#x[0-9a-f]{1,6});/gi, ' ').replace(/[^a-zA-Z0-9]+/g, ' ').trim().toLowerCase();
const slug = value => norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unknown';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); };

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
function frameInput(path, mime = '') { return mime === 'image/gif' ? `${path}[0]` : path; }
function identify(path, mime = '') {
  const text = execFileSync(process.env.MAGICK_CMD || 'magick', ['identify', '-format', '%w %h', frameInput(path, mime)], { encoding: 'utf8' }).trim();
  const [width, height] = text.split(/\s+/).map(Number);
  assert(width > 0 && height > 0, `cannot identify ${path}`);
  return { width, height };
}
function magick(...args) { execFileSync(process.env.MAGICK_CMD || 'magick', args, { stdio: 'inherit' }); }
function apiUrl(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  return url.href;
}
function pages(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}
function revisionContent(page) {
  const revision = page?.revisions?.[0];
  return revision?.slots?.main?.content ?? revision?.slots?.main?.['*'] ?? revision?.content ?? revision?.['*'] ?? '';
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

const control = await readJson(CONTROL);
assert(control.version === 1 && control.record_id === 'UC-126' && control.role_key === 'bubbles', 'UC-126 Bubbles probe scope drift');
assert(control.actor === 'Tara Strong' && control.production === 'The Powerpuff Girls (1998)' && control.file_titles?.length === 6, 'UC-126 Bubbles probe denominator drift');
assert(control.selector_artifact_id === 8706098863 && control.scope_artifact_id === 8706377703 && control.failed_discovery_count === 5 && control.canonical_mutation === false, 'UC-126 Bubbles probe custody drift');
await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);
const context = await request.newContext({ userAgent: UA, ignoreHTTPSErrors: true, extraHTTPHeaders: { Referer: control.source_page } });
try {
  const revisionUrl = apiUrl(control.api_url, {
    action: 'query', format: 'json', formatversion: 2, redirects: 1,
    prop: 'revisions|pageimages', rvprop: 'content', rvslots: 'main', rvlimit: 1,
    piprop: 'name|original|thumbnail', pithumbsize: 1600,
    titles: control.api_title, origin: '*'
  });
  const revisionResponse = await context.get(revisionUrl, { failOnStatusCode: false, timeout: 90000 });
  assert(revisionResponse.ok(), `Bubbles revision API HTTP ${revisionResponse.status()}`);
  const revisionJson = await revisionResponse.json();
  const page = pages(revisionJson?.query?.pages)[0];
  assert(page && !page.missing, 'Bubbles revision page missing');
  const wikitext = revisionContent(page);
  assert(wikitext.length > 1000, 'Bubbles revision body missing');
  const revisionMissing = control.required_revision_terms.filter(term => !norm(`${page.title} ${wikitext}`).includes(norm(term)));
  assert(revisionMissing.length === 0, `Bubbles revision terms missing: ${revisionMissing.join(', ')}`);
  const wikitextPath = join(OUT, 'bubbles-source-wikitext.txt');
  await writeFile(wikitextPath, wikitext + '\n');
  const declaredFiles = [...wikitext.matchAll(/\[\[(?:File|Image):([^|\]\n]+)/gi)].map(match => `File:${match[1].trim()}`);

  const detailUrl = apiUrl(control.api_url, {
    action: 'query', format: 'json', formatversion: 2, redirects: 1,
    prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: 1600,
    titles: control.file_titles.join('|'), origin: '*'
  });
  const detailResponse = await context.get(detailUrl, { failOnStatusCode: false, timeout: 90000 });
  assert(detailResponse.ok(), `Bubbles imageinfo API HTTP ${detailResponse.status()}`);
  const detailJson = await detailResponse.json();
  await writeJson(join(OUT, 'imageinfo-response.json'), detailJson);

  const imageRows = pages(detailJson?.query?.pages).map(imagePage => {
    const info = imagePage.imageinfo?.[0] || null;
    return {
      requested_or_resolved_title: imagePage.title || null,
      pageid: imagePage.pageid || null,
      missing: imagePage.missing === true,
      info: info ? {
        url: info.url || null,
        thumburl: info.thumburl || null,
        mime: info.mime || null,
        width: info.width || 0,
        height: info.height || 0,
        thumbwidth: info.thumbwidth || 0,
        thumbheight: info.thumbheight || 0,
        metadata: info.extmetadata || {}
      } : null
    };
  });

  const attempts = [];
  const usable = [];
  const seen = new Set();
  for (const row of imageRows) {
    const title = row.requested_or_resolved_title || 'unknown';
    const info = row.info;
    const probes = [];
    const add = (url, kind) => { if (url && !probes.some(probe => probe.url === url)) probes.push({ url, kind }); };
    add(info?.thumburl, 'api-1600-thumbnail');
    add(info?.url, 'api-original');
    const encoded = encodeURIComponent(title.replace(/^File:/i, ''));
    add(`https://powerpuffgirls.fandom.com/wiki/Special:Redirect/file/${encoded}`, 'special-redirect-file');
    for (const probe of probes) {
      const record = { title, probe_url: probe.url, probe_kind: probe.kind };
      try {
        const response = await context.get(probe.url, {
          failOnStatusCode: false,
          timeout: 90000,
          headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif,image/*,*/*;q=0.2', Referer: control.source_page }
        });
        record.http_status = response.status();
        record.resolved_url = response.url();
        const bytes = Buffer.from(await response.body());
        record.bytes = bytes.length;
        record.mime = signatureMime(bytes);
        record.sha256 = sha(bytes);
        if (!response.ok() || record.mime === 'unknown' || bytes.length < 1000) {
          record.disposition = 'unusable-transport';
          attempts.push(record);
          continue;
        }
        const local = `candidates/${String(attempts.length + 1).padStart(3, '0')}-${slug(title)}.${extensionFor(record.mime)}`;
        const path = join(OUT, local);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, bytes);
        try { Object.assign(record, identify(path, record.mime)); } catch (error) { record.identify_error = error.message; }
        if ((record.width || 0) < control.minimum_width || (record.height || 0) < control.minimum_height) {
          record.local = local;
          record.disposition = 'below-probe-floor';
          attempts.push(record);
          continue;
        }
        record.local = local;
        record.repository_matches = repository.get(record.sha256) || [];
        record.generic_180_floor_exception = record.width < 180 || record.height < 180;
        record.declared_in_revision = declaredFiles.some(file => norm(file) === norm(title));
        record.disposition = 'usable';
        attempts.push(record);
        if (!seen.has(record.sha256)) {
          seen.add(record.sha256);
          usable.push(record);
        }
      } catch (error) {
        record.error = error.message;
        record.disposition = 'request-error';
        attempts.push(record);
      }
    }
  }

  assert(usable.length >= 1, 'UC-126 Bubbles probe found no usable image delivery');
  usable.sort((a, b) => Number(b.declared_in_revision) - Number(a.declared_in_revision) || Number(a.generic_180_floor_exception) - Number(b.generic_180_floor_exception) || (b.width * b.height - a.width * a.height) || a.title.localeCompare(b.title));
  const thumbs = [];
  await mkdir(join(OUT, 'thumbs'), { recursive: true });
  for (let index = 0; index < usable.length; index++) {
    const row = usable[index];
    const thumb = join(OUT, 'thumbs', `${String(index + 1).padStart(2, '0')}.jpg`);
    magick(frameInput(join(OUT, row.local), row.mime), '-auto-orient', '-thumbnail', '560x420>', '-background', '#171512', '-gravity', 'center', '-extent', '560x420', '-fill', 'white', '-undercolor', '#171512dd', '-gravity', 'south', '-pointsize', '13', '-annotate', '+0+6', `${index + 1} · ${row.width}x${row.height} · ${row.title.replace(/^File:/, '').slice(0, 45)}`, '-strip', '-quality', '88', thumb);
    thumbs.push(thumb);
  }
  const contactPath = join(OUT, 'contact-sheet.jpg');
  execFileSync('montage', [...thumbs, '-tile', '3x', '-geometry', '560x420+10+10', '-background', '#e8e3d9', contactPath], { stdio: 'inherit' });

  const manifest = {
    version: 1,
    lane: 'card-backfill',
    record_id: 'UC-126',
    role_key: 'bubbles',
    actor: 'Tara Strong',
    production: 'The Powerpuff Girls (1998)',
    generated_at: new Date().toISOString(),
    control_sha256: sha(await readFile(CONTROL)),
    revision: {
      api_url: revisionUrl,
      page_id: page.pageid || null,
      resolved_title: page.title,
      raw_wikitext_sha256: sha(Buffer.from(wikitext, 'utf8')),
      retained_wikitext_path: 'bubbles-source-wikitext.txt',
      retained_wikitext_sha256: sha(await readFile(wikitextPath)),
      declared_files: declaredFiles,
      pageimage: page.pageimage || null,
      original: page.original || null,
      thumbnail: page.thumbnail || null
    },
    imageinfo_url: detailUrl,
    image_rows: imageRows,
    attempts,
    usable,
    usable_count: usable.length,
    repository_hash_count: repository.size,
    contact_sheet: { path: 'contact-sheet.jpg', sha256: sha(await readFile(contactPath)), ...identify(contactPath, 'image/jpeg') },
    disposition: 'transport-probe-complete-pending-main-discovery-consumption',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-126',
    role_key: 'bubbles',
    page_id: page.pageid || null,
    resolved_title: page.title,
    pageimage: page.pageimage || null,
    declared_files: declaredFiles,
    image_rows: imageRows,
    usable_count: usable.length,
    usable,
    contact_sheet: manifest.contact_sheet,
    canonical_mutation: false
  });
  console.log(`PASS — UC-126 Bubbles probe retained ${usable.length} usable delivery or deliveries`);
  console.log(`MANIFEST — ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`SUMMARY — ${sha(await readFile(join(OUT, 'summary.json')))}`);
  console.log(`CONTACT — ${manifest.contact_sheet.sha256}`);
  console.log(`OUTPUT — ${OUT}`);
} finally {
  await context.dispose();
}
