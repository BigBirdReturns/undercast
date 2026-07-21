#!/usr/bin/env node
/**
 * Capture the exact MediaWiki revisions named by data/CENSUS-MANIFEST.json.
 * The resulting BagIt bag is self-contained evidence: every wikitext byte is
 * re-fetched by revision id and must match the producer's recorded sha256.
 */
import { mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  collapseSourceObservations,
  scopeReceiptRows,
  sha256,
  stableJson,
  sourceKey,
  verifyBag,
} from './lib/preservation.mjs';

function option(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value`);
  return value;
}
function flag(name) { return process.argv.includes(`--${name}`); }
const positional = process.argv.slice(2).filter((arg, index, all) => !arg.startsWith('--') && (index === 0 || !all[index - 1].startsWith('--')));
const out = option('out', positional[0]);
if (!out) throw new Error('usage: node scripts/preserve-sources.mjs <out-dir> [--manifest path] [--coverage path] [--scopes path]');
const manifestPath = option('manifest', 'data/CENSUS-MANIFEST.json');
const coveragePath = option('coverage', 'data/CENSUS-COVERAGE.json');
const scopesPath = option('scopes', 'data/AUTOPILOT-SCOPES.json');
const batchSize = Number(option('batch-size', '50'));
const retries = Number(option('retries', '4'));
const timeoutMs = Number(option('timeout-ms', '45000'));
const franchise = option('franchise');
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) throw new Error('--batch-size must be 1..50');
if (!Number.isInteger(retries) || retries < 1 || retries > 10) throw new Error('--retries must be 1..10');

const manifestBytes = await readFile(manifestPath);
const manifest = JSON.parse(manifestBytes);
const coverage = JSON.parse(await readFile(coveragePath, 'utf8'));
const scopesDoc = JSON.parse(await readFile(scopesPath, 'utf8'));
const scopes = Array.isArray(scopesDoc) ? scopesDoc : scopesDoc.scopes;
const records = collapseSourceObservations(manifest, { franchise });
if (!records.length) throw new Error('selected census manifest contains no exact revisions');

if (!flag('resume')) await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'data', 'sources'), { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const USER_AGENT = `undercast-preservation/1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || 'preservation'})`;

function revisionContent(revision) {
  return revision?.slots?.main?.content
    ?? revision?.slots?.main?.['*']
    ?? revision?.['*']
    ?? revision?.content
    ?? null;
}

async function requestJson(url, label) {
  let last;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (json?.error) throw new Error(`${json.error.code || 'api'}: ${json.error.info || JSON.stringify(json.error)}`);
      return json;
    } catch (error) {
      last = error;
      if (attempt < retries) await sleep(Math.min(10_000, 750 * 2 ** (attempt - 1)));
    }
  }
  throw new Error(`${label} failed after ${retries} attempts: ${last?.message || last}`);
}

function pagesFrom(json) {
  const pages = json?.query?.pages;
  if (Array.isArray(pages)) return pages;
  if (pages && typeof pages === 'object') return Object.values(pages);
  return [];
}

async function fetchExactBatch(api, batch) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*', prop: 'revisions',
    revids: batch.map((row) => row.revision).join('|'),
    rvprop: 'ids|timestamp|user|userid|comment|sha1|content', rvslots: 'main',
  });
  const json = await requestJson(`${api}?${params}`, `${api} revisions ${batch[0].revision}..${batch.at(-1).revision}`);
  const found = new Map();
  for (const page of pagesFrom(json)) for (const revision of page?.revisions || []) {
    const content = revisionContent(revision);
    if (Number.isInteger(revision?.revid) && typeof content === 'string') {
      found.set(revision.revid, { pageid: page.pageid, title: page.title, timestamp: revision.timestamp, parentid: revision.parentid ?? null, user: revision.user || null, userid: revision.userid ?? null, comment: revision.comment || '', mediawiki_sha1: revision.sha1 || null, content });
    }
  }
  const missing = batch.filter((row) => !found.has(row.revision));
  if (missing.length) {
    const fallback = await fetchCurrentByPageId(api, missing);
    for (const [revision, value] of fallback) found.set(revision, value);
  }
  return found;
}

async function fetchCurrentByPageId(api, records) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*', prop: 'revisions',
    pageids: [...new Set(records.map((row) => row.pageid))].join('|'),
    rvprop: 'ids|timestamp|user|userid|comment|sha1|content', rvslots: 'main',
  });
  const json = await requestJson(`${api}?${params}`, `${api} current-page fallback`);
  const currentByPage = new Map();
  for (const page of pagesFrom(json)) {
    const revision = page?.revisions?.[0];
    const content = revisionContent(revision);
    if (Number.isInteger(page?.pageid) && typeof content === 'string') {
      currentByPage.set(page.pageid, { pageid: page.pageid, title: page.title, timestamp: revision.timestamp, parentid: revision.parentid ?? null, user: revision.user || null, userid: revision.userid ?? null, comment: revision.comment || '', mediawiki_sha1: revision.sha1 || null, current_revision: revision.revid, content });
    }
  }
  const result = new Map();
  for (const record of records) {
    const value = currentByPage.get(record.pageid);
    if (value && sha256(Buffer.from(value.content, 'utf8')) === record.content_sha256) {
      result.set(record.revision, { ...value, retrieval: 'current-hash-match' });
    }
  }
  return result;
}

async function fetchSiteInfo(api) {
  const params = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', meta: 'siteinfo', siprop: 'general|rights' });
  const json = await requestJson(`${api}?${params}`, `${api} siteinfo`);
  const general = json?.query?.general || {};
  const rights = json?.query?.rightsinfo || {};
  return {
    api,
    sitename: general.sitename || null,
    lang: general.lang || null,
    generator: general.generator || null,
    server: general.server || null,
    articlepath: general.articlepath || null,
    rights_text: rights.text || null,
    rights_url: rights.url || null,
  };
}

const byApi = new Map();
for (const record of records) {
  if (!byApi.has(record.api)) byApi.set(record.api, []);
  byApi.get(record.api).push(record);
}

const sourceSites = Object.fromEntries(await Promise.all([...byApi.keys()].map(async (api) => [api, await fetchSiteInfo(api)])));

let payloadBytes = 0;
let exact = 0;
let currentHashMatches = 0;
const failures = [];
const indexRows = [];
const payloadLines = [];

async function processApi(api, rows) {
  console.log(`source snapshot: ${new URL(api).hostname} — ${rows.length} exact revisions`);
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const found = await fetchExactBatch(api, batch);
    for (const record of batch) {
      const value = found.get(record.revision);
      if (!value) {
        failures.push({ api, pageid: record.pageid, revision: record.revision, content_sha256: record.content_sha256, reason: 'exact revision unavailable and current page hash differs' });
        continue;
      }
      const bytes = Buffer.from(value.content, 'utf8');
      const got = sha256(bytes);
      if (got !== record.content_sha256) {
        failures.push({ api, pageid: record.pageid, revision: record.revision, content_sha256: record.content_sha256, got, reason: 'content hash mismatch' });
        continue;
      }
      const target = join(out, record.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
      payloadLines.push(`${got}  ${record.path}`);
      payloadBytes += bytes.length;
      if (value.retrieval === 'current-hash-match') currentHashMatches++;
      else exact++;
      indexRows.push({
        archive_id: record.archive_id,
        path: record.path,
        api: record.api,
        host: record.host,
        pageid: record.pageid,
        revision: record.revision,
        timestamp: record.timestamp,
        parentid: value.parentid,
        revision_user: value.user,
        revision_userid: value.userid,
        revision_comment: value.comment,
        mediawiki_sha1: value.mediawiki_sha1,
        content_sha256: record.content_sha256,
        retrieval: value.retrieval || 'exact-revision',
        oldid_urls: [...new Set(record.facets.map((facet) => `${sourceKey(facet.source)}?oldid=${record.revision}`))],
        history_urls: [...new Set(record.facets.map((facet) => `${sourceKey(facet.source)}?action=history`))],
        facets: record.facets,
      });
    }
    if ((offset / batchSize + 1) % 20 === 0 || offset + batchSize >= rows.length) {
      console.log(`  ${Math.min(offset + batchSize, rows.length)}/${rows.length}`);
    }
    await sleep(200);
  }
}

await Promise.all([...byApi].map(([api, rows]) => processApi(api, rows)));
if (failures.length) {
  await writeFile(join(out, 'source-failures.json'), JSON.stringify(failures, null, 2) + '\n');
  throw new Error(`${failures.length} exact source revision(s) could not be recovered; refusing an incomplete evidence bag`);
}

indexRows.sort((a, b) => a.api.localeCompare(b.api) || a.revision - b.revision || a.archive_id.localeCompare(b.archive_id));
payloadLines.sort();
await writeFile(join(out, 'manifest-sha256.txt'), payloadLines.join('\n') + '\n');
await writeFile(join(out, 'undercast-census-manifest.json'), manifestBytes);
await writeFile(join(out, 'source-index.jsonl'), indexRows.map((row) => JSON.stringify(row)).join('\n') + '\n');
await writeFile(join(out, 'source-sites.json'), JSON.stringify(sourceSites, null, 2) + '\n');
await writeFile(join(out, 'source-notice.txt'),
  'This bag preserves exact revision wikitext named by UNDERCAST CENSUS-MANIFEST.json.\n' +
  'Original URLs, revision identifiers, timestamps, content hashes, and observation facets are retained in source-index.jsonl.\n' +
  'Source text remains subject to each source community\'s license and attribution requirements, recorded in source-sites.json. Revision authors, oldid URLs, history URLs, and source facets are retained in source-index.jsonl.\n' +
  'No source images are copied into this evidence bag. This wikitext copy is retained for evidentiary, preservation, attribution, and reproducibility purposes.\n');

const sourceSetsByFranchise = new Map();
for (const row of coverage) {
  const source = sourceKey(row?.source);
  if (!source) continue;
  if (!sourceSetsByFranchise.has(row.franchise)) sourceSetsByFranchise.set(row.franchise, new Set());
  sourceSetsByFranchise.get(row.franchise).add(source);
}
const scopeReceipts = {};
for (const scope of scopes || []) {
  const franchiseLabel = scope?.coverage_match?.franchise;
  const sources = sourceSetsByFranchise.get(franchiseLabel) || new Set();
  if (!sources.size) continue;
  const receiptRows = scopeReceiptRows(manifest, franchiseLabel, sources);
  const completeSources = new Set(receiptRows.filter((row) => Number.isInteger(row.pageid) && Number.isInteger(row.revision) && /^[0-9a-f]{64}$/i.test(row.content_sha256)).map((row) => sourceKey(row.source)));
  scopeReceipts[scope.id] = {
    franchise: franchiseLabel,
    coverage_sources: sources.size,
    complete_receipts: completeSources.size,
    manifest_sha256: sha256(stableJson(receiptRows)),
  };
}
const snapshot = {
  schema: 'undercast.preservation.sources/1',
  created_at: new Date().toISOString(),
  repository_commit: process.env.PRESERVATION_COMMIT || process.env.GITHUB_SHA || null,
  census_manifest_path: manifestPath,
  census_manifest_sha256: sha256(manifestBytes),
  observations: (manifest.observations || []).length,
  exact_revisions: records.length,
  unique_source_urls: new Set(records.flatMap((row) => row.facets.map((facet) => sourceKey(facet.source)))).size,
  payload_bytes: payloadBytes,
  retrieval: { exact_revision: exact, current_hash_match: currentHashMatches },
  source_apis: Object.fromEntries([...byApi].map(([api, rows]) => [api, rows.length])),
  source_sites: sourceSites,
  scopes: scopeReceipts,
};
await writeFile(join(out, 'source-snapshot.json'), JSON.stringify(snapshot, null, 2) + '\n');
await writeFile(join(out, 'bagit.txt'), 'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n');
await writeFile(join(out, 'bag-info.txt'),
  `Source-Organization: UNDERCAST\n` +
  `Bagging-Date: ${snapshot.created_at.slice(0, 10)}\n` +
  `External-Description: Exact MediaWiki revision evidence for UNDERCAST census manifest ${snapshot.census_manifest_sha256}\n` +
  `Payload-Oxum: ${payloadBytes}.${records.length}\n` +
  `Bag-Count: 1 of 1\n`);
const tagNames = ['bagit.txt', 'bag-info.txt', 'manifest-sha256.txt', 'undercast-census-manifest.json', 'source-index.jsonl', 'source-sites.json', 'source-notice.txt', 'source-snapshot.json'];
const tagLines = [];
for (const name of tagNames) tagLines.push(`${sha256(await readFile(join(out, name)))}  ${name}`);
await writeFile(join(out, 'tagmanifest-sha256.txt'), tagLines.join('\n') + '\n');
const verified = await verifyBag(out);
const onDisk = (await stat(join(out, 'manifest-sha256.txt'))).size;
console.log(`PASS — source evidence bag ${out}: ${records.length} exact revisions, ${snapshot.unique_source_urls} source URLs, ${payloadBytes} payload bytes, ${verified.tag_files} tag files (manifest ${onDisk} bytes)`);
