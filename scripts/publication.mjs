#!/usr/bin/env node
// Offline publication boundary. archive.json remains the public contract; this
// module adds packaging policy, not another corpus or projection authority.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256, stableJson } from './lib/preservation.mjs';
import { routeIds, assertRoutes } from './publication-routes.mjs';
import { validateMediaRejections } from './lib/media-rejections.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const TEXT = /\.(?:html|css|js|mjs|json|jsonld|xml|txt|md|svg)$/;
// Exact admitted contract paths, inventoried from archive.json. A new public
// resource requires review of this allowlist, not merely an injected contract row.
const CONTRACT_PATHS = new Set([
  "404.html",
  "assets/constellation.css",
  "assets/coverage.css",
  "assets/record-page.css",
  "assets/site-navigation.js",
  "assets/site-shell.css",
  "constellation.html",
  "coverage.html",
  "data/CENSUS-COVERAGE.json",
  "data/CENSUS-EXCLUSIONS.json",
  "data/CENSUS-FERENGI-TEST.json",
  "data/CENSUS-GAPS.json",
  "data/CENSUS-MANIFEST.json",
  "data/CENSUS-SUMMARY.json",
  "data/CENSUS-UNRESOLVED.json",
  "data/CENSUS.json",
  "data/DS9-CHANGELING-CENSUS.json",
  "data/SOURCES.json",
  "data/constellations.json",
  "data/entities.json",
  "data/index.json",
  "data/media-live.json",
  "data/quality.json",
  "data/search/manifest.json",
  "data/shard-manifest.json",
  "data/species.json",
  "data/specimens.json",
  "data/tombstones.json",
  "data/vocabularies/conditions.json",
  "data/vocabularies/species.json",
  "index.html",
  "recognition.html",
  "schema/archive.schema.json",
  "schema/census-manifest.schema.json",
  "schema/census-test.schema.json",
  "schema/constellations.schema.json",
  "schema/entities.schema.json",
  "schema/source.schema.json",
  "schema/species-vocabulary.schema.json",
  "schema/species.schema.json",
  "schema/specimen.schema.json",
  "schema/tombstones.schema.json"
]);
export const FONT_ASSETS = [
  'assets/site-fonts.css',
  'assets/fonts/SOURCES.json',
  'assets/fonts/2d46bd159b53f55c41167a4f1540a074649464194fd1e416f5b4694a6c0f282c.woff2',
  'assets/fonts/44ad50c760fa8f5b62da3d489edb40adebabaf97988b9b0adbbc3f0be859050a.woff2',
  'assets/fonts/52edd9a8959ec3e68d618e2a4757182c0e61bfeea61679850cad8744a68cadf3.woff2',
  'assets/fonts/7234ed860a9cc83045413c4faee63c960a8f2d1917adcf728119307d56e0d783.woff2',
  'assets/fonts/97f6df0559c6393b851812484ae859b7c539815d5fcdab7d17234492480fa16c.woff2',
  'assets/fonts/a2930b27d13a228bd9ab6a49269b5f800237892ad560cb9dd7fab01b1620f88e.woff2',
  'assets/fonts/a748973d5d192a27d69862f5af5f9182d4420d3a924e7b992ae82182e9b12cd8.woff2',
  'assets/fonts/f18853f63a870ebef013e30e789d8d544f102e4acd94988e57c223d9c796ddf4.woff2',
  'assets/fonts/fb4a81a2d0a893e5c38c394a7e716a1cef0b24610a0af49c96f6d529bd66bf2b.woff2',
  'assets/fonts/fraunces-OFL.txt',
  'assets/fonts/spacemono-OFL.txt',
];
const EXTRA = [
  'assets/site-theme.js', 'assets/site-tokens.css', 'assets/home-entrypoints.css',
  'assets/absence-offline.svg', 'assets/placeholder-dark-clean.png', 'assets/placeholder-light-clean.png',
  ...FONT_ASSETS,
];
// Gate/intake inputs participate in the release identity without becoming public
// artifact paths. This binds exact-subject rejection mechanics to the tested
// commit while preserving private review evidence outside the Pages payload.
export const PRIVATE_RELEASE_INPUTS = [
  'data/MEDIA-REJECTIONS.json',
  'data/review/estate-debt/UC-1.0-INTEGRATION-20260912.json',
  'scripts/lib/media-rejections.mjs',
  'scripts/lib/media-search.mjs',
  'scripts/media-search-fixtures.mjs',
  'scripts/media-search-report.mjs',
  'scripts/retrieve.mjs',
];
// Exact public evidence citations, including the baseline receipt's ledger closure.
const EVIDENCE = [
  'data/review/card-backfill/UC-116/source-wikitext-granny.txt',
  ...['025','071','076','079','116','117','118','124','125','126','154','156','170','171','172','174','175']
    .map(id => `data/review/card-backfill/UC-${id}/manifest.json`),
  'data/review/estate-debt/COLLECT-001-QUALITY-BASELINE-RESET.json',
  'data/review/estate-debt/COLLECT-001-KNOWN-MEDIA-CORRECTIONS-APPLY.json',
  'data/review/sitewide-actor-origin-vlm-correction-2026-07-25.json',
  'data/review/sitewide-media-correction-2026-07-25.json',
  'data/review/sitewide-near-duplicate-correction-2026-07-25.json',
];
export function safePath(file) {
  assert.equal(typeof file, 'string', 'path must be a string');
  assert.ok(file && !/[\\:%?#<>"|*\x00-\x20\x7f]/.test(file) && !file.startsWith('/') &&
    file.split('/').every(part => part && part !== '.' && part !== '..' && !part.startsWith('.') && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part)), `unsafe path: ${file}`);
  return file;
}
function assertNoSymlinkParents(target) {
  const absolute = path.resolve(target);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current)) assert.ok(!fs.lstatSync(current).isSymbolicLink(), `symlink ancestor: ${target}`);
  }
}
function read(root, file, normalize = true) {
  safePath(file);
  let current = root;
  assert.ok(!fs.lstatSync(root).isSymbolicLink(), 'symlink input root');
  for (const part of file.split('/')) {
    current = path.join(current, part);
    assert.ok(!fs.lstatSync(current).isSymbolicLink(), `symlink: ${file}`);
  }
  const stat = fs.lstatSync(current);
  assert.ok(stat.isFile() && stat.nlink === 1, `non-regular or hardlinked file: ${file}`);
  const bytes = fs.readFileSync(current);
  return normalize && TEXT.test(file) ? Buffer.from(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/\r\n/g, '\n')) : bytes;
}
const json = (root, file) => JSON.parse(read(root, file));
const meta = (file, bytes) => ({ path: file, bytes: bytes.length, sha256: sha256(bytes) });
export function validateFontAssets(root = ROOT, packaged = null) {
  const ledger = json(root, 'assets/fonts/SOURCES.json');
  assert.equal(ledger.schema_version, 1, 'unsupported font source ledger');
  assert.equal(ledger.typography_change, false, 'font intake must preserve approved typography');
  assert.match(ledger.upstream_license_revision || '', /^[a-f0-9]{40}$/, 'font license revision must be immutable');
  assert.equal(typeof ledger.intake_operation, 'string');
  assert.ok(ledger.intake_operation.includes('no font retrieval'), 'ordinary builds must not retrieve fonts');
  const rows = [...(ledger.fonts || []), ...(ledger.licenses || [])];
  const expected = FONT_ASSETS.filter(file => file.startsWith('assets/fonts/') && file !== 'assets/fonts/SOURCES.json').sort();
  const declared = rows.map(row => row.path).sort();
  assert.deepEqual(declared, expected, 'font source ledger path set drifted');
  assert.equal(new Set(declared).size, declared.length, 'duplicate font source ledger path');
  for (const row of rows) {
    safePath(row.path);
    assert.ok(row.path.startsWith('assets/fonts/'), `font ledger path escaped: ${row.path}`);
    assert.match(row.sha256 || '', /^[a-f0-9]{64}$/, `invalid font ledger hash: ${row.path}`);
    assert.ok(Number.isInteger(row.bytes) && row.bytes > 0, `invalid font ledger size: ${row.path}`);
    const bytes = read(root, row.path, !row.path.endsWith('.woff2'));
    assert.equal(bytes.length, row.bytes, `font ledger size mismatch: ${row.path}`);
    assert.equal(sha256(bytes), row.sha256, `font ledger hash mismatch: ${row.path}`);
    if (row.path.endsWith('.woff2')) {
      assert.equal(path.basename(row.path, '.woff2'), row.sha256, `font filename is not content-addressed: ${row.path}`);
      assert.equal(row.transformation, 'none', `undeclared font transformation: ${row.path}`);
      assert.match(row.permitted_use || '', /SIL Open Font License 1\.1/, `font use status missing: ${row.path}`);
      const source = new URL(row.source_url);
      assert.equal(source.protocol, 'https:');
      assert.equal(source.hostname, 'fonts.gstatic.com', `unapproved font byte origin: ${row.path}`);
    } else {
      const source = new URL(row.source_url);
      assert.equal(source.protocol, 'https:');
      assert.equal(source.hostname, 'raw.githubusercontent.com', `unapproved font license origin: ${row.path}`);
      assert.ok(source.pathname.includes(`/${ledger.upstream_license_revision}/`), `font license is not revision-pinned: ${row.path}`);
    }
    if (packaged) assert.ok(packaged.has(row.path), `font asset omitted from artifact: ${row.path}`);
  }
  const stylesheet = read(root, 'assets/site-fonts.css').toString();
  assert.ok(!/@import|https?:|\/\//i.test(stylesheet), 'font stylesheet must be fully local');
  const references = new Set([...stylesheet.matchAll(/url\((?:["']?)(\.\/fonts\/[a-f0-9]{64}\.woff2)(?:["']?)\)/g)]
    .map(match => `assets/${match[1].replace(/^\.\//, '')}`));
  assert.deepEqual([...references].sort(), (ledger.fonts || []).map(row => row.path).sort(), 'font stylesheet reference set drifted');
  if (packaged) assert.ok(packaged.has('assets/site-fonts.css') && packaged.has('assets/fonts/SOURCES.json'), 'font custody files omitted from artifact');
  return true;
}
export function externalMedia(src, entry) {
  safePath(src);
  assert.match(src, /^images\/[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/);
  assert.match(entry.sha256 || '', /^[a-f0-9]{64}$/);
  assert.ok(Number.isInteger(entry.bytes) && entry.bytes > 0, `invalid media size: ${src}`);
  assert.match(entry.release || '', /^media-[a-zA-Z0-9_-]+$/);
  safePath(entry.asset);
  assert.ok(!entry.asset.includes('/') && entry.asset.includes(entry.sha256.slice(0, 8)), 'media asset identity mismatch');
  assert.equal(entry.url, `https://github.com/BigBirdReturns/undercast/releases/download/${entry.release}/${entry.asset}`, `unapproved media URL: ${src}`);
  return entry.url;
}
function inspectImported(value) {
  if (typeof value === 'string') {
    assert.ok(!/^(?:\s*(?:javascript|vbscript|data):|\/\/)/i.test(value.replace(/[\t\r\n]/g, '')), 'unsafe imported URL');
    assert.ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value), 'control character in imported content');
    assert.ok(!/<\s*\/?(?:script|iframe|object|embed)\b/i.test(value), 'active imported markup');
    assert.ok(!/(?:[A-Z]:\\|file:\/\/|\/Users\/|\/home\/)/i.test(value), 'private local path in public content');
    if (/^https?:/i.test(value)) {
      const url = new URL(value);
      assert.ok(!url.username && !url.password && !/[\r\n\\]/.test(value), 'unsafe imported URL authority');
    }
  } else if (Array.isArray(value)) value.forEach(inspectImported);
  else if (value && typeof value === 'object') Object.values(value).forEach(inspectImported);
}
export function inventory(root = ROOT) {
  assertNoSymlinkParents(root);
  const files = new Map();
  const add = (file, expected = null) => {
    safePath(file);
    assert.ok(!file.startsWith('data/review/') || EVIDENCE.includes(file), `disallowed evidence: ${file}`);
    assert.ok(CONTRACT_PATHS.has(file) || EXTRA.includes(file) || EVIDENCE.includes(file) ||
      ['data/archive.json', 'robots.txt', 'sitemap.xml', 'data/dataset.jsonld', 'CRAWLERS.md'].includes(file) ||
      /^data\/(?:shards\/\d{4}|media-shards\/\d{4}|search\/[a-z0-9_])\.json$/.test(file), `disallowed publication path: ${file}`);
    const bytes = read(root, file);
    if (expected) {
      assert.equal(sha256(bytes), expected.sha256, `corrupt contract dependency: ${file}`);
      assert.equal(bytes.length, expected.bytes, `contract size mismatch: ${file}`);
    }
    if (/\.json$/.test(file)) { try { inspectImported(JSON.parse(bytes)); } catch (error) { throw new Error(`${file}: ${error.message}`); } }
    files.set(file, bytes);
  };
  add('data/archive.json');
  const archive = json(root, 'data/archive.json');
  assert.equal(archive.canonical_url, 'https://bigbirdreturns.github.io/undercast/');
  const traverse = value => {
    if (!value || typeof value !== 'object') return;
    if (value.path && value.sha256) add(value.path, value);
    for (const child of Object.values(value)) traverse(child);
  };
  traverse(archive);
  for (const file of CONTRACT_PATHS) assert.ok(files.has(file), `missing contract path: ${file}`);
  assert.deepEqual(archive.web_assets.filter(row => row.path.endsWith('.html')).map(row => row.path).sort(), ['404.html','constellation.html','coverage.html','index.html','recognition.html']);
  for (const file of Object.values(archive.discovery)) add(file);
  for (const row of json(root, 'data/shard-manifest.json').shards) {
    add(`data/${row.file}`, row);
    if (row.media_file) add(`data/${row.media_file}`, { sha256: row.media_sha256, bytes: row.media_bytes });
  }
  for (const row of json(root, 'data/search/manifest.json').shards) add(row.file, row);
  for (const file of [...EXTRA, ...EVIDENCE]) add(file);
  validateFontAssets(root, files);
  // Refuse newly introduced evidence citations until their exact public closure is reviewed.
  for (const [file, bytes] of files) {
    if (!TEXT.test(file)) continue;
    for (const match of bytes.toString().matchAll(/data\/review\/[A-Za-z0-9_./-]+/g)) {
      assert.ok(files.has(match[0]), `unpackaged public evidence citation: ${match[0]}`);
    }
  }
  const specimens = json(root, 'data/specimens.json');
  const ids = routeIds(specimens, json(root, 'data/tombstones.json'));
  const manifest = json(root, 'data/media-manifest.json');
  assert.equal(manifest.repo, 'BigBirdReturns/undercast');
  const live = json(root, 'data/media-live.json').urls;
  const audit = json(root, 'data/MEDIA-AUDIT.json').items;
  // Validate the complete live mapping, including retained historical entries.
  for (const [src, url] of Object.entries(live)) {
    const entry = manifest.assets[src];
    assert.equal(entry?.location, 'release', `unknown live media: ${src}`);
    assert.equal(url, externalMedia(src, entry));
  }
  for (const [src, entry] of Object.entries(manifest.assets)) {
    if (entry.location === 'release') assert.equal(live[src], externalMedia(src, entry), `missing live mapping: ${src}`);
  }
  const staticImages = new Set();
  for (const row of archive.web_assets.filter(row => row.path.endsWith('.html'))) {
    for (const match of files.get(row.path).toString().matchAll(/<img\b[^>]*\bsrc=["'](?:\.\/)?(images\/[^"']+)["']/g)) staticImages.add(match[1]);
  }
  const media = new Map();
  for (const record of specimens) for (const side of ['still', 'portrait']) {
    const src = record[side]?.src;
    if (!src) continue;
    safePath(src);
    assert.match(src, /^images\/[a-zA-Z0-9_.-]+\.(jpg|jpeg|png|webp)$/);
    if (live[src]) {
      const entry = manifest.assets[src];
      media.set(src, { path: src, location: 'release', url: live[src], sha256: entry.sha256, bytes: entry.bytes });
      // Only the two already-public homepage image dependencies remain local.
      // Other release mirrors are excluded; no remote bytes are fetched or rehosted.
      if (staticImages.has(src)) {
        const bytes = read(root, src);
        assert.equal(sha256(bytes), entry.sha256, `corrupt static media: ${src}`);
        files.set(src, bytes);
        media.get(src).static_dependency = true;
      }
      if (fs.existsSync(path.join(root, src))) assert.equal(sha256(read(root, src)), entry.sha256, `corrupt media mirror: ${src}`);
    } else {
      const receipts = audit.filter(row => row.wall_id === record.id && row.side === side && row.asset?.src === src);
      assert.equal(receipts.length, 1, `unknown local media: ${src}`);
      const bytes = read(root, src);
      assert.equal(sha256(bytes), receipts[0].asset.sha256, `corrupt local media: ${src}`);
      assert.equal(bytes.length, receipts[0].asset.bytes, `corrupt local media size: ${src}`);
      files.set(src, bytes);
      media.set(src, { ...meta(src, bytes), location: 'local' });
    }
  }
  for (const src of staticImages) assert.ok(files.has(src), `unknown static image dependency: ${src}`);
  const inputs = [...files].map(([file, bytes]) => meta(file, bytes));
  for (const file of ['data/media-manifest.json', 'data/MEDIA-AUDIT.json', 'scripts/build-record-pages.mjs', 'scripts/publication.mjs', 'scripts/publication-routes.mjs', 'scripts/lib/preservation.mjs', ...PRIVATE_RELEASE_INPUTS]) inputs.push(meta(file, read(root, file)));
  const rejectionDocument = json(root, 'data/MEDIA-REJECTIONS.json');
  validateMediaRejections(rejectionDocument);
  for (const ledger of rejectionDocument.source_ledgers) {
    const bytes = read(root, ledger.path);
    assert.equal(sha256(bytes), ledger.sha256, `media rejection evidence hash mismatch: ${ledger.path}`);
    inputs.push(meta(ledger.path, bytes));
  }
  const uniqueInputs = new Map();
  for (const row of inputs) {
    const prior = uniqueInputs.get(row.path);
    if (prior) assert.deepEqual(row, prior, `input identity conflict: ${row.path}`);
    else uniqueInputs.set(row.path, row);
  }
  inputs.length = 0;
  inputs.push(...uniqueInputs.values());
  inputs.sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { files, ids, inputs, media: [...media.values()].sort((a,b) => a.path < b.path ? -1 : 1) };
}
function write(root, file, bytes) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), bytes);
}
export function payloadManifest(root) {
  assertNoSymlinkParents(root);
  const rows = [];
  const walk = prefix => {
    for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
      const file = prefix ? `${prefix}/${entry.name}` : entry.name;
      assert.ok(!entry.isSymbolicLink(), `symlink artifact: ${file}`);
      if (entry.isDirectory()) walk(file);
      else rows.push(meta(file, read(root, file, false)));
    }
  };
  walk('');
  return rows.sort((a,b) => a.path < b.path ? -1 : 1);
}
export function verifyLinks(root, payload, ids) {
  const paths = new Set(payload.map(row => row.path));
  const base = 'https://bigbirdreturns.github.io/undercast/';
  for (const row of payload.filter(row => /\.(?:html|css)$/.test(row.path))) {
    // Script-generated links are checked by the rendered gate. This check covers
    // the actual static document, including the no-JavaScript hero and records.
    const text = read(root, row.path).toString().replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>');
    const refs = [...text.matchAll(/\b(?:href|src)=["']([^"']+)["']|url\(\s*["']?([^\s)"']+)["']?\s*\)/g)].map(match => match[1] || match[2]);
    for (const ref of refs) {
      if (/^(?:#|data:|mailto:)/i.test(ref)) continue;
      const url = new URL(ref.replace(/&amp;/g, '&'), base + row.path);
      if (url.origin !== new URL(base).origin) continue;
      assert.ok(url.href.startsWith(base), `public link escapes site: ${row.path}: ${ref}`);
      let file = decodeURIComponent(url.pathname.slice(new URL(base).pathname.length));
      if (!file || file.endsWith('/')) file += 'index.html';
      assert.ok(paths.has(file), `unpackaged static dependency: ${row.path}: ${ref}`);
    }
  }
  const sitemap = read(root, 'sitemap.xml').toString();
  const routes = [...sitemap.matchAll(/<loc>https:\/\/bigbirdreturns\.github\.io\/undercast\/records\/([^/]+)\/<\/loc>/g)].map(match => match[1]).sort();
  const merged = new Set(json(root, 'data/tombstones.json').records.filter(row => row.status === 'merged').map(row => row.id));
  assert.deepEqual(routes, ids.filter(id => !merged.has(id)), 'sitemap must list live and removed records; merged aliases retain routes');
}
export function build(root = ROOT, output = path.join(root, '.ci/site')) {
  root = path.resolve(root);
  output = path.resolve(output);
  assertNoSymlinkParents(output);
  assert.ok(!fs.existsSync(output), 'build output must be absent; use a fresh output directory');
  const source = inventory(root);
  const parent = path.dirname(output);
  fs.mkdirSync(parent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(parent, 'publication-'));
  try {
    for (const [file, bytes] of source.files) write(stage, file, bytes);
    write(stage, 'scripts/build-record-pages.mjs', read(root, 'scripts/build-record-pages.mjs'));
    const result = spawnSync(process.execPath, [path.join(stage, 'scripts/build-record-pages.mjs')], { cwd: stage, stdio: 'inherit' });
    assert.equal(result.status, 0, `record build failed: ${result.error?.message || result.status}`);
    fs.rmSync(path.join(stage, 'scripts'), { recursive: true });
    assertRoutes({ recordsRoot: path.join(stage, 'records'), specimensPath: path.join(stage, 'data/specimens.json'), tombstonesPath: path.join(stage, 'data/tombstones.json') });
    const payload = payloadManifest(stage);
    const expected = [...source.files.keys(), ...source.ids.map(id => `records/${id}/index.html`)].sort();
    assert.deepEqual(payload.map(row => row.path), expected, 'artifact path set drifted');
    verifyLinks(stage, payload, source.ids);
    const identity = { version: 1, input_sha256: sha256(stableJson(source.inputs)), media_sha256: sha256(stableJson(source.media)), payload_sha256: sha256(stableJson(payload)), inputs: source.inputs, media: source.media, payload };
    // Source race detection before publishing a completed local output.
    const after = inventory(root);
    assert.equal(sha256(stableJson(after.inputs)), identity.input_sha256, 'inputs changed during build');
    fs.renameSync(stage, output);
    return identity;
  } finally { if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true }); }
}
export function verifyArtifact(output, identity) {
  assert.equal(sha256(stableJson(identity.inputs)), identity.input_sha256, 'input manifest tampered');
  assert.equal(sha256(stableJson(identity.media)), identity.media_sha256, 'media manifest tampered');
  assert.equal(sha256(stableJson(identity.payload)), identity.payload_sha256, 'payload manifest tampered');
  assert.deepEqual(payloadManifest(output), identity.payload, 'artifact missing, corrupt or unexpected content');
  return true;
}
// Explicit bounded online verification, never called by build or gate. Responses
// are checked in memory and discarded; this does not acquire/rehost an asset.
async function verifyExternal(offset, limit) {
  assert.ok(Number.isInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit >= 1 && limit <= 10, 'verification requires OFFSET >= 0 and LIMIT 1..10');
  const entries = inventory().media.filter(row => row.location === 'release');
  assert.ok(offset < entries.length, 'verification offset is outside the media set');
  let failed = 0;
  for (const row of entries.slice(offset, offset + limit)) {
    try {
      const signal = AbortSignal.timeout(15000);
      let url = row.url, response;
      for (let redirect = 0; redirect <= 3; redirect++) {
        response = await fetch(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'undercast-release-verification/1.0' } });
        if (![301,302,303,307,308].includes(response.status)) break;
        const next = new URL(response.headers.get('location'), url);
        await response.body?.cancel();
        assert.ok(next.protocol === 'https:' && !next.username && !next.password && !next.port &&
          ['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(next.hostname), 'unapproved release redirect');
        url = next.href;
      }
      assert.equal(response.status, 200, `HTTP ${response.status}`);
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; assert.ok(size <= row.bytes, 'response exceeds declared media size'); chunks.push(chunk); }
      assert.equal(size, row.bytes, 'external media size mismatch');
      assert.equal(sha256(Buffer.concat(chunks)), row.sha256, 'external media hash mismatch');
      console.log(`verified ${row.path} ${row.sha256}`);
    } catch (error) { failed++; console.error(`unverified ${row.path}: ${error.message}`); }
  }
  console.log(`external verification: ${Math.min(limit, entries.length - offset)} of ${entries.length} entries attempted at offset ${offset}; ${failed} unverified; no publication receipt`);
  if (failed) process.exitCode = 1;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--verify-external') {
      assert.equal(process.argv.length, 5, 'use --verify-external OFFSET LIMIT');
      await verifyExternal(Number(process.argv[3]), Number(process.argv[4]));
    } else {
      assert.equal(process.argv.length, 2, 'build accepts no arguments');
      const identity = build();
      write(ROOT, '.ci/build-identity.json', `${stableJson(identity)}\n`);
      console.log(`build: PASS (offline, not a gate receipt) ${identity.payload.length} files; payload ${identity.payload_sha256}; inputs ${identity.input_sha256}; media ${identity.media_sha256}`);
    }
  } catch (error) { console.error(`build: ${error.message}`); process.exitCode = 1; }
}
