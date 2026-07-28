#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-113-FRAME.json';
const SOURCE_ROOT = process.env.SOURCE_ROOT || '';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-113-frame';
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
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
};
function signatureMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return 'unknown';
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
async function receipt(path, expected = {}) {
  const bytes = await readFile(path);
  const row = { bytes: bytes.length, sha256: sha(bytes), mime: signatureMime(bytes), ...(signatureMime(bytes) !== 'unknown' ? identify(path) : {}) };
  if (expected.sha256) assert(row.sha256 === expected.sha256, `${path} hash drift ${row.sha256}`);
  if (expected.bytes !== undefined) assert(row.bytes === expected.bytes, `${path} byte drift ${row.bytes}`);
  if (expected.width !== undefined) assert(row.width === expected.width, `${path} width drift ${row.width}`);
  if (expected.height !== undefined) assert(row.height === expected.height, `${path} height drift ${row.height}`);
  return row;
}
async function acceptBanners(page) {
  for (const label of ['CONTINUE', 'Accept', 'I Accept', 'Agree', 'Allow all', 'Accept All']) {
    const button = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') });
    if (await button.count().catch(() => 0)) {
      await button.first().click({ timeout: 1800 }).catch(() => {});
      await page.waitForTimeout(350);
    }
  }
}
async function clickPlay(page) {
  const selectors = [
    'button[aria-label*="play" i]',
    'button[title*="play" i]',
    '.vjs-big-play-button',
    '[data-testid*="play" i]',
    '[class*="play-button" i]',
    '[class*="playbutton" i]'
  ];
  for (const frame of page.frames()) {
    for (const selector of selectors) {
      const locator = frame.locator(selector).first();
      if (await locator.count().catch(() => 0) && await locator.isVisible().catch(() => false)) {
        if (await locator.click({ force: true, timeout: 1800 }).then(() => true).catch(() => false)) return true;
      }
    }
  }
  return false;
}
async function locateVideo(page) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidates = [];
    for (const frame of page.frames()) {
      const videos = frame.locator('video');
      const count = await videos.count().catch(() => 0);
      for (let index = 0; index < count; index++) {
        const video = videos.nth(index);
        const visible = await video.isVisible().catch(() => false);
        if (!visible) continue;
        const row = await video.evaluate(element => ({
          width: element.videoWidth || element.clientWidth || 0,
          height: element.videoHeight || element.clientHeight || 0,
          ready_state: element.readyState,
          current_src: element.currentSrc || element.src || ''
        })).catch(() => ({ width: 0, height: 0, ready_state: 0, current_src: '' }));
        candidates.push({ frame, video, index, area: row.width * row.height, row });
      }
    }
    candidates.sort((a, b) => b.area - a.area);
    if (candidates[0]) return candidates[0];
    await clickPlay(page);
    await page.waitForTimeout(500);
  }
  throw new Error('official Marvel player exposed no visible HTML5 video element');
}
async function prepareVideo(video) {
  return video.evaluate(async element => {
    const wait = (event, timeout = 15000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${event} timeout`)), timeout);
      element.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    element.muted = true;
    element.playsInline = true;
    element.controls = false;
    if (element.readyState < 1) {
      try { element.load(); } catch {}
      await Promise.race([wait('loadedmetadata'), wait('durationchange')]).catch(() => {});
    }
    await element.play().catch(() => {});
    if (element.readyState < 2) await Promise.race([wait('loadeddata'), wait('canplay')]).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 900));
    element.pause();
    return {
      duration: Number.isFinite(element.duration) ? element.duration : null,
      current_src: element.currentSrc || element.src || '',
      poster: element.poster || '',
      ready_state: element.readyState,
      video_width: element.videoWidth,
      video_height: element.videoHeight
    };
  });
}
async function extractFrame(video, targetTime) {
  return video.evaluate(async (element, requested) => {
    const wait = (event, timeout = 15000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${event} timeout`)), timeout);
      element.addEventListener(event, () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    element.muted = true;
    element.playsInline = true;
    element.controls = false;
    if (element.readyState < 1) {
      try { element.load(); } catch {}
      await Promise.race([wait('loadedmetadata'), wait('durationchange')]).catch(() => {});
    }
    const duration = Number.isFinite(element.duration) && element.duration > 0 ? element.duration : 45;
    const target = Math.max(0, Math.min(Number(requested), Math.max(0, duration - 0.2)));
    const seeking = wait('seeked').catch(() => {});
    element.currentTime = target;
    await seeking;
    await new Promise(resolve => setTimeout(resolve, 350));
    element.pause();
    const canvas = document.createElement('canvas');
    canvas.width = element.videoWidth;
    canvas.height = element.videoHeight;
    const context = canvas.getContext('2d', { alpha: false });
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    return {
      requested_time: Number(requested),
      actual_time: element.currentTime,
      duration: Number.isFinite(element.duration) ? element.duration : null,
      video_width: element.videoWidth,
      video_height: element.videoHeight,
      current_src: element.currentSrc || element.src || '',
      data_url: dataUrl
    };
  }, targetTime);
}

const control = await readJson(CONTROL);
assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-113', 'UC-113 raw-frame scope drift');
assert(control.actor === 'Taika Waititi' && control.character === 'Korg' && control.production === 'Thor: Ragnarok' && control.year === 2017 && control.side === 'still', 'UC-113 raw-frame identity drift');
assert(control.video_orbit_artifact?.artifact_id === 8677109493 && control.video_orbit_artifact?.head_sha === 'a7a40afb233d04ffbe95b673a3be7535d63c8edd', 'UC-113 video-orbit custody drift');
assert(control.selected_orbit_frame?.artifact_sha256 === '74e104696d9c58274171f745340afd38c3499e9d69aeb0861baefee30ec3b42d' && control.selected_orbit_frame?.raw_extract_time_seconds === 33.62111, 'UC-113 selected-frame authorization drift');
assert(control.selection_contract?.raw_video_canvas_extract_required === true && control.selection_contract?.browser_controls_forbidden_in_retained_source === true && control.selection_contract?.performance_capture_thumbnail_rejected === true && control.selection_contract?.canonical_mutation === false, 'UC-113 raw-frame contract drift');
const specimen = (await readJson('data/specimens.json')).find(row => row.id === 'UC-113');
const source = (await readJson('data/SOURCES.json')).find(row => row.id === 'UC-113');
const audit = (await readJson('data/MEDIA-AUDIT.json')).items.find(row => row.id === control.audit_id);
assert(specimen && !specimen.still && !source?.still && audit?.status === 'absent' && !audit?.asset, 'UC-113 canonical absence drift');
await mkdir(OUT, { recursive: true });

const orbitManifest = await receipt(join(SOURCE_ROOT, 'manifest.json'), { sha256: control.video_orbit_artifact.manifest_sha256 });
const orbitSummary = await receipt(join(SOURCE_ROOT, 'summary.json'), { sha256: control.video_orbit_artifact.summary_sha256 });
const orbitContact = await receipt(join(SOURCE_ROOT, 'contact-sheet-video-frames.jpg'), { sha256: control.video_orbit_artifact.contact_sheet_sha256 });
const orbitPage = await receipt(join(SOURCE_ROOT, 'pages', 'marvel-finding-korg-video-orbit.png'), { sha256: control.video_orbit_artifact.page_screenshot_sha256 });
const orbitProbe = await receipt(join(SOURCE_ROOT, 'video-probe.json'), { sha256: control.video_orbit_artifact.video_probe_sha256 });
const selectedReference = await receipt(join(SOURCE_ROOT, control.selected_orbit_frame.artifact_path), {
  sha256: control.selected_orbit_frame.artifact_sha256,
  bytes: control.selected_orbit_frame.artifact_bytes,
  width: control.selected_orbit_frame.artifact_width,
  height: control.selected_orbit_frame.artifact_height
});
const summary = await readJson(join(SOURCE_ROOT, 'summary.json'));
const selectedSummary = (summary.unique_frames || []).find(row => row.path === control.selected_orbit_frame.artifact_path);
assert(selectedSummary?.sha256 === control.selected_orbit_frame.artifact_sha256 && selectedSummary?.requested_time === control.selected_orbit_frame.requested_time_seconds, 'UC-113 orbit selected-frame receipt drift');
assert(summary.unique_frame_count === control.video_orbit_artifact.unique_frame_count && summary.video?.video_width === control.video_orbit_artifact.video_width && summary.video?.video_height === control.video_orbit_artifact.video_height, 'UC-113 orbit video denominator drift');

await copyFile(join(SOURCE_ROOT, control.selected_orbit_frame.artifact_path), join(OUT, 'selected-orbit-reference-with-controls.png'));
await copyFile(join(SOURCE_ROOT, 'contact-sheet-video-frames.jpg'), join(OUT, 'video-orbit-contact-sheet.jpg'));
await copyFile(join(SOURCE_ROOT, 'pages', 'marvel-finding-korg-video-orbit.png'), join(OUT, 'source-page-marvel-finding-korg.png'));

const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US', ignoreHTTPSErrors: true });
try {
  const page = await context.newPage();
  let response = await page.goto(control.video_page.url, { waitUntil: 'domcontentloaded', timeout: control.transport_timeout_ms });
  await page.waitForTimeout(1800);
  await acceptBanners(page);
  let body = '';
  let missing = [...control.video_page.required_terms];
  for (let attempt = 0; attempt < 12; attempt++) {
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    for (let index = 0; index < 4; index++) {
      await page.mouse.wheel(0, 1200);
      await page.waitForTimeout(180);
    }
    body = await page.locator('body').innerText().catch(() => '');
    const html = await page.content().catch(() => '');
    const hay = norm(`${body} ${html}`);
    missing = control.video_page.required_terms.filter(term => !hay.includes(norm(term)));
    if (!missing.length) break;
    if (attempt === 5) {
      response = await page.reload({ waitUntil: 'domcontentloaded', timeout: control.transport_timeout_ms }).catch(() => response);
      await page.waitForTimeout(1800);
      await acceptBanners(page);
    }
    await page.waitForTimeout(1000);
  }
  assert(response && response.status() >= 200 && response.status() < 400, `official Marvel video page HTTP ${response?.status()}`);
  assert(missing.length === 0, `official Marvel video page terms missing: ${missing.join(', ')}`);
  const mainPoster = page.locator('img[src*="poster_5793447558001"]').first();
  let mainPosterClicked = false;
  if (await mainPoster.count().catch(() => 0)) {
    await mainPoster.scrollIntoViewIfNeeded().catch(() => {});
    const box = await mainPoster.boundingBox().catch(() => null);
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      mainPosterClicked = true;
      await page.waitForTimeout(2200);
    }
  }
  await clickPlay(page);
  await page.waitForTimeout(2200);
  const located = await locateVideo(page);
  const initial = await prepareVideo(located.video);
  assert(initial.video_width === control.video_orbit_artifact.video_width && initial.video_height === control.video_orbit_artifact.video_height, `official Marvel video geometry drift ${initial.video_width}x${initial.video_height}`);
  assert(initial.duration !== null && Math.abs(initial.duration - control.video_orbit_artifact.video_duration_seconds) < 0.05, `official Marvel video duration drift ${initial.duration}`);
  const extracted = await extractFrame(located.video, control.selected_orbit_frame.raw_extract_time_seconds);
  assert(extracted.video_width === 960 && extracted.video_height === 540, `raw Korg frame geometry drift ${extracted.video_width}x${extracted.video_height}`);
  assert(Math.abs(extracted.actual_time - control.selected_orbit_frame.raw_extract_time_seconds) < 0.05, `raw Korg frame timestamp drift ${extracted.actual_time}`);
  assert(/^data:image\/png;base64,/.test(extracted.data_url), 'raw Korg frame was not a PNG data URL');
  const rawBytes = Buffer.from(extracted.data_url.split(',', 2)[1], 'base64');
  const rawPath = join(OUT, control.selected_orbit_frame.output_path);
  await writeFile(rawPath, rawBytes);
  const raw = await receipt(rawPath, { width: 960, height: 540 });
  assert(raw.mime === 'image/png', `raw Korg frame MIME drift ${raw.mime}`);
  assert(raw.sha256 !== control.discovery_artifact.rejected_thumbnail_sha256, 'raw Korg frame equals rejected performance-capture thumbnail');
  assert(raw.sha256 !== control.selected_orbit_frame.artifact_sha256, 'raw Korg frame unexpectedly equals browser-control reference');
  assert(!(repository.get(raw.sha256) || []).length, `raw Korg frame duplicates canonical media: ${(repository.get(raw.sha256) || []).join(', ')}`);

  const previewPath = join(OUT, 'raw-frame-review-preview.jpg');
  magick(rawPath, '-strip', '-quality', '94', previewPath);
  const preview = await receipt(previewPath);
  const manifest = {
    version: 1,
    lane: 'card-backfill',
    record_id: 'UC-113',
    actor: 'Taika Waititi',
    character: 'Korg',
    production: 'Thor: Ragnarok',
    year: 2017,
    side: 'still',
    expected_subject: 'Korg',
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    reviewed_role: control.reviewed_role,
    control_sha256: sha(await readFile(CONTROL)),
    discovery_artifact: control.discovery_artifact,
    video_orbit_artifact: control.video_orbit_artifact,
    failed_video_orbit_checkpoints: control.failed_video_orbit_checkpoints,
    selected_orbit_frame: {
      ...control.selected_orbit_frame,
      reference_receipt: selectedReference
    },
    orbit_receipts: {
      manifest: orbitManifest,
      summary: orbitSummary,
      contact_sheet: orbitContact,
      page_screenshot: orbitPage,
      video_probe: orbitProbe
    },
    live_video_receipt: {
      provider: control.video_page.provider,
      source_page: control.video_page.url,
      page_title: await page.title(),
      http_status: response.status(),
      required_terms: control.video_page.required_terms,
      required_terms_missing: [],
      main_poster_clicked: mainPosterClicked,
      frame_url: located.frame.url(),
      frame_index: located.index,
      initial_video: initial
    },
    raw_frame: {
      path: control.selected_orbit_frame.output_path,
      ...raw,
      requested_time_seconds: extracted.requested_time,
      actual_time_seconds: extracted.actual_time,
      extraction: 'HTML5 video canvas drawImage at the second-desk-selected official Marvel timestamp; browser controls excluded from retained pixels',
      repository_matches: []
    },
    review_preview: { path: 'raw-frame-review-preview.jpg', ...preview },
    selection_contract: control.selection_contract,
    disposition: 'official-raw-video-frame-pending-deterministic-card-render',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-113',
    actor: 'Taika Waititi',
    character: 'Korg',
    production: 'Thor: Ragnarok',
    selected_time_seconds: control.selected_orbit_frame.raw_extract_time_seconds,
    raw_frame: manifest.raw_frame,
    visual_ruling: control.selected_orbit_frame.visual_ruling,
    rejected_thumbnail_sha256: control.discovery_artifact.rejected_thumbnail_sha256,
    canonical_mutation: false
  });
  const names = [
    control.selected_orbit_frame.output_path,
    'selected-orbit-reference-with-controls.png',
    'video-orbit-contact-sheet.jpg',
    'source-page-marvel-finding-korg.png',
    'raw-frame-review-preview.jpg',
    'manifest.json',
    'summary.json'
  ];
  const sums = [];
  for (const name of names) sums.push(`${sha(await readFile(join(OUT, name)))}  ${name}`);
  await writeFile(join(OUT, 'SHA256SUMS'), sums.join('\n') + '\n');
  console.log(`PASS — UC-113 raw official Korg frame extracted at ${extracted.actual_time.toFixed(5)}s`);
  console.log(`raw ${raw.sha256} ${raw.width}x${raw.height} ${raw.bytes} bytes`);
  console.log(`manifest ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`summary ${sha(await readFile(join(OUT, 'summary.json')))}`);
  console.log(`sums ${sha(await readFile(join(OUT, 'SHA256SUMS')))}`);
  console.log(`artifact ${OUT}`);
} finally {
  await browser.close();
}
