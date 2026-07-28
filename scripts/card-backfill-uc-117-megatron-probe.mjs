#!/usr/bin/env node
import { chromium, request } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-117-MEGATRON-PROBE.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-117-megatron-probe';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/132 Safari/537.36 UNDERCAST-card-backfill/1.0';
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); };
const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/<[^>]+>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/[^a-zA-Z0-9']+/g, ' ').trim().toLowerCase();
const slug = value => norm(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'route';

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-117' && control.role_key === 'megatron', 'UC-117 probe scope drift');
assert(control.actor === 'Frank Welker' && control.character === 'Megatron' && control.continuity === 'Generation 1 cartoon continuity', 'UC-117 probe identity drift');
assert(control.requested_title === 'Megatron (G1)/Generation 1 cartoon continuity' && control.api_bases?.length === 3 && control.page_routes?.length === 8, 'UC-117 probe denominator drift');
assert(control.failed_discovery_checkpoint?.artifact_id === 8692380398 && control.failed_discovery_checkpoint?.head_sha === 'c8e446eb487e6f00960ef2adace1fcca2786af2d', 'UC-117 probe custody drift');
assert(control.canonical_mutation === false, 'UC-117 probe mutation drift');
await mkdir(OUT, { recursive: true });

const api = await request.newContext({
  userAgent: UA,
  ignoreHTTPSErrors: true,
  extraHTTPHeaders: {
    Accept: 'application/json,text/xml,text/html,text/plain,*/*;q=0.5',
    'Accept-Language': 'en-US,en;q=0.9'
  }
});

const records = [];
const responseFiles = [];
const titleEvidence = [];
let sequence = 0;

function endpoint(base, params) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.href;
}

function collectTitles(value, out = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectTitles(item, out);
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if ((key === 'title' || key === 'displaytitle') && typeof item === 'string') out.add(item);
      collectTitles(item, out);
    }
  }
  return [...out];
}

async function probeUrl(kind, label, url) {
  const record = { sequence: ++sequence, kind, label, url, started_at: new Date().toISOString() };
  try {
    const response = await api.get(url, { timeout: control.transport_timeout_ms, failOnStatusCode: false });
    const bytes = Buffer.from(await response.body());
    const clipped = bytes.subarray(0, Math.min(bytes.length, control.maximum_response_bytes));
    const contentType = response.headers()['content-type'] || '';
    const extension = /json/i.test(contentType) ? 'json' : /xml/i.test(contentType) ? 'xml' : /html/i.test(contentType) ? 'html' : 'txt';
    const relative = `responses/${String(record.sequence).padStart(2, '0')}-${slug(label)}.${extension}`;
    await mkdir(join(OUT, 'responses'), { recursive: true });
    await writeFile(join(OUT, relative), clipped);
    const text = clipped.toString('utf8');
    let parsed = null;
    if (/json/i.test(contentType) || /^[\s\r\n]*[\[{]/.test(text)) {
      try { parsed = JSON.parse(text); } catch {}
    }
    const titles = parsed ? collectTitles(parsed) : [...text.matchAll(/(?:title|displaytitle)=["']?([^"'<>\n&]+)/gi)].map(match => match[1]);
    const hay = norm(text);
    const missingSignals = control.required_signals.filter(signal => !hay.includes(norm(signal)));
    const exactTitleSignal = hay.includes(norm(control.requested_title)) || titles.some(title => norm(title) === norm(control.requested_title));
    const cartoonTitleSignal = titles.some(title => {
      const normalized = norm(title);
      return normalized.includes('megatron') && (normalized.includes('g1') || normalized.includes('generation 1')) && normalized.includes('cartoon');
    });
    Object.assign(record, {
      status: 'loaded',
      http_status: response.status(),
      ok: response.ok(),
      resolved_url: response.url(),
      content_type: contentType,
      bytes: bytes.length,
      retained_bytes: clipped.length,
      sha256: sha(bytes),
      retained_sha256: sha(clipped),
      response_path: relative,
      titles: titles.slice(0, 200),
      exact_title_signal: exactTitleSignal,
      cartoon_title_signal: cartoonTitleSignal,
      required_signals_missing: missingSignals,
      body_preview: text.slice(0, 1200)
    });
    responseFiles.push({ path: relative, sha256: sha(clipped), bytes: clipped.length });
    if (exactTitleSignal || cartoonTitleSignal || missingSignals.length === 0) titleEvidence.push({ kind, label, url, response_path: relative, exact_title_signal: exactTitleSignal, cartoon_title_signal: cartoonTitleSignal, required_signals_missing: missingSignals });
  } catch (error) {
    Object.assign(record, { status: 'error', error: error.message });
  }
  records.push(record);
  return record;
}

for (const base of control.api_bases) {
  const baseLabel = new URL(base).pathname.replace(/^\//, '').replace(/\//g, '-') || 'root-api';
  await probeUrl('api-query', `${baseLabel}-query-exact`, endpoint(base, {
    action: 'query', format: 'json', formatversion: 2, redirects: 1,
    prop: 'revisions|pageimages|info', rvprop: 'content', rvslots: 'main', rvlimit: 1,
    piprop: 'name|original|thumbnail', pithumbsize: 1600,
    titles: control.requested_title, origin: '*'
  }));
  await probeUrl('api-parse', `${baseLabel}-parse-exact`, endpoint(base, {
    action: 'parse', format: 'json', formatversion: 2, redirects: 1,
    prop: 'wikitext|images|displaytitle|properties', page: control.requested_title, origin: '*'
  }));
  await probeUrl('api-prefix', `${baseLabel}-allpages-prefix`, endpoint(base, {
    action: 'query', format: 'json', formatversion: 2,
    list: 'allpages', apprefix: 'Megatron (G1)', aplimit: 100, apnamespace: 0, origin: '*'
  }));
  await probeUrl('api-search', `${baseLabel}-search-cartoon`, endpoint(base, {
    action: 'query', format: 'json', formatversion: 2,
    list: 'search', srsearch: 'Megatron G1 cartoon continuity Frank Welker', srnamespace: 0, srlimit: 50, origin: '*'
  }));
}

for (const [index, url] of control.page_routes.entries()) await probeUrl('page-route', `page-route-${index + 1}`, url);

const browserRecords = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US', ignoreHTTPSErrors: true });
  for (const [index, url] of control.page_routes.entries()) {
    if (index > 4 && index !== 7) continue;
    const page = await context.newPage();
    const row = { route_index: index + 1, url };
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: control.transport_timeout_ms });
      await page.waitForTimeout(1200);
      const title = await page.title();
      const body = await page.locator('body').innerText().catch(() => '');
      const screenshot = `browser/${String(index + 1).padStart(2, '0')}.png`;
      await mkdir(join(OUT, 'browser'), { recursive: true });
      await page.screenshot({ path: join(OUT, screenshot), fullPage: false });
      const screenshotBytes = await readFile(join(OUT, screenshot));
      Object.assign(row, {
        status: 'loaded',
        http_status: response?.status() || null,
        resolved_url: page.url(),
        title,
        body_text_sha256: sha(Buffer.from(body, 'utf8')),
        required_signals_missing: control.required_signals.filter(signal => !norm(`${title} ${body}`).includes(norm(signal))),
        screenshot: { path: screenshot, sha256: sha(screenshotBytes), bytes: screenshotBytes.length }
      });
    } catch (error) {
      Object.assign(row, { status: 'error', error: error.message });
    } finally {
      await page.close();
    }
    browserRecords.push(row);
  }
} finally {
  await browser.close();
  await api.dispose();
}

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-117',
  role_key: 'megatron',
  requested_title: control.requested_title,
  generated_at: new Date().toISOString(),
  control_sha256: sha(await readFile(CONTROL)),
  failed_discovery_checkpoint: control.failed_discovery_checkpoint,
  records,
  browser_records: browserRecords,
  response_files: responseFiles,
  title_evidence: titleEvidence,
  counts: {
    requests: records.length,
    loaded: records.filter(row => row.status === 'loaded').length,
    http_ok: records.filter(row => row.ok === true).length,
    exact_title_signals: records.filter(row => row.exact_title_signal === true).length,
    cartoon_title_signals: records.filter(row => row.cartoon_title_signal === true).length,
    complete_required_signals: records.filter(row => Array.isArray(row.required_signals_missing) && row.required_signals_missing.length === 0).length,
    browser_routes: browserRecords.length
  },
  disposition: 'transport-probe-only-no-source-selection',
  canonical_mutation: false
};
await writeJson(join(OUT, 'manifest.json'), manifest);
await writeJson(join(OUT, 'summary.json'), {
  record_id: manifest.record_id,
  requested_title: manifest.requested_title,
  counts: manifest.counts,
  title_evidence: manifest.title_evidence,
  route_summary: records.map(({ sequence, kind, label, url, status, http_status, ok, content_type, bytes, response_path, titles, exact_title_signal, cartoon_title_signal, required_signals_missing, error }) => ({ sequence, kind, label, url, status, http_status, ok, content_type, bytes, response_path, titles, exact_title_signal, cartoon_title_signal, required_signals_missing, error })),
  browser_summary: browserRecords,
  canonical_mutation: false
});
console.log(`PASS — UC-117 Megatron transport probe completed: ${records.length} request route(s), ${browserRecords.length} browser route(s)`);
console.log(`exact-title signals ${manifest.counts.exact_title_signals}`);
console.log(`cartoon-title signals ${manifest.counts.cartoon_title_signals}`);
console.log(`complete required signals ${manifest.counts.complete_required_signals}`);
console.log(`manifest ${sha(await readFile(join(OUT, 'manifest.json')))}`);
