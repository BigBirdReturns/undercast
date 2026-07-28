#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-113-VIDEO-ORBIT.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-113-video-orbit';
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
      if (await locator.count().catch(() => 0)) {
        const visible = await locator.isVisible().catch(() => false);
        if (visible && await locator.click({ force: true, timeout: 1800 }).then(() => true).catch(() => false)) return true;
      }
    }
    const poster = frame.locator('img[src*="poster_5793447558001"], img[src*="finding-korg" i]').first();
    if (await poster.count().catch(() => 0)) {
      if (await poster.click({ force: true, timeout: 1800 }).then(() => true).catch(() => false)) return true;
      const parent = poster.locator('xpath=..');
      if (await parent.click({ force: true, timeout: 1800 }).then(() => true).catch(() => false)) return true;
    }
  }
  return false;
}
async function locateVideo(page) {
  for (let attempt = 0; attempt < 40; attempt++) {
    for (const frame of page.frames()) {
      const videos = frame.locator('video');
      const count = await videos.count().catch(() => 0);
      for (let index = 0; index < count; index++) {
        const video = videos.nth(index);
        const visible = await video.isVisible().catch(() => false);
        if (visible) return { frame, video, index };
      }
    }
    await clickPlay(page);
    await page.waitForTimeout(500);
  }
  throw new Error('official Marvel player exposed no visible HTML5 video element');
}
async function prepareVideo(video) {
  await video.scrollIntoViewIfNeeded().catch(() => {});
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
async function seekVideo(video, requestedTime) {
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
    if (Math.abs(element.currentTime - target) > 0.08) {
      const seeking = wait('seeked').catch(() => {});
      element.currentTime = target;
      await seeking;
    }
    await element.play().catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 650));
    element.pause();
    return {
      requested_time: Number(requested),
      actual_time: element.currentTime,
      duration: Number.isFinite(element.duration) ? element.duration : null,
      ready_state: element.readyState,
      current_src: element.currentSrc || element.src || '',
      video_width: element.videoWidth,
      video_height: element.videoHeight
    };
  }, requestedTime);
}

const control = await readJson(CONTROL);
assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-113', 'UC-113 video orbit scope drift');
assert(control.actor === 'Taika Waititi' && control.character === 'Korg' && control.production === 'Thor: Ragnarok' && control.year === 2017 && control.side === 'still', 'UC-113 video orbit identity drift');
assert(control.discovery_checkpoint?.artifact_id === 8676847359 && control.discovery_checkpoint?.head_sha === '607c3ee8cf7e5d53f44513a157dd7136d8fe4285', 'UC-113 rejected-thumbnail custody drift');
assert(control.discovery_checkpoint?.rejected_thumbnail_sha256 === 'c53983eb193bae23bb37d440224fe2e6e38a5cefea23a820d58794c2b3acbc16', 'UC-113 rejected-thumbnail hash drift');
assert(control.video_page?.provider === 'Marvel' && control.video_page?.expected_duration_seconds === 45, 'UC-113 official video denominator drift');
assert(Array.isArray(control.sample_times_seconds) && control.sample_times_seconds.length === 16 && control.minimum_sample_frames === 10, 'UC-113 sample denominator drift');
assert(control.selection_contract?.official_marvel_video_required === true && control.selection_contract?.completed_korg_frame_required === true && control.selection_contract?.performance_capture_thumbnail_rejected === true && control.selection_contract?.character_frame_and_actor_role_custody_separate === true && control.selection_contract?.canonical_mutation === false, 'UC-113 video selection contract drift');
const specimen = (await readJson('data/specimens.json')).find(row => row.id === 'UC-113');
const source = (await readJson('data/SOURCES.json')).find(row => row.id === 'UC-113');
const audit = (await readJson('data/MEDIA-AUDIT.json')).items.find(row => row.id === 'ma_1d34489d543c01ca6616d57a');
assert(specimen && !specimen.still && !source?.still && audit?.status === 'absent' && !audit?.asset, 'UC-113 canonical absence drift');
await mkdir(OUT, { recursive: true });
const repository = await repositoryHashes();
assert(repository.size === control.expected_repository_hash_count, `repository hash denominator drift ${repository.size}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 1100 }, locale: 'en-US', ignoreHTTPSErrors: true });
try {
  const page = await context.newPage();
  const response = await page.goto(control.video_page.url, { waitUntil: 'domcontentloaded', timeout: control.transport_timeout_ms });
  await page.waitForTimeout(1800);
  await acceptBanners(page);
  const body = await page.locator('body').innerText().catch(() => '');
  const hay = norm(body);
  const missing = control.video_page.required_terms.filter(term => !hay.includes(norm(term)));
  assert(response && response.status() >= 200 && response.status() < 400, `official Marvel video page HTTP ${response?.status()}`);
  assert(missing.length === 0, `official Marvel video page terms missing: ${missing.join(', ')}`);
  await mkdir(join(OUT, 'pages'), { recursive: true });
  const pageShot = join(OUT, 'pages', 'marvel-finding-korg-video-orbit.png');
  await page.screenshot({ path: pageShot, fullPage: true });
  const pageShotBytes = await readFile(pageShot);

  const located = await locateVideo(page);
  const initialVideo = await prepareVideo(located.video);
  assert(initialVideo.video_width >= 640 && initialVideo.video_height >= 360, `official Marvel video geometry drift ${initialVideo.video_width}x${initialVideo.video_height}`);
  if (initialVideo.duration !== null) assert(initialVideo.duration >= 40 && initialVideo.duration <= 50, `official Marvel video duration drift ${initialVideo.duration}`);

  const frameRows = [];
  const seen = new Set();
  await mkdir(join(OUT, 'frames'), { recursive: true });
  for (const requestedTime of control.sample_times_seconds) {
    const seek = await seekVideo(located.video, requestedTime);
    const milliseconds = Math.round(requestedTime * 1000);
    const relative = `frames/frame-${String(milliseconds).padStart(5, '0')}ms.png`;
    const path = join(OUT, relative);
    await located.video.screenshot({ path });
    const bytes = await readFile(path);
    const hash = sha(bytes);
    const dimensions = identify(path);
    const duplicate_of = seen.has(hash) ? seen.get(hash) : null;
    if (!duplicate_of) seen.set(hash, relative);
    frameRows.push({
      requested_time: requestedTime,
      actual_time: seek.actual_time,
      duration: seek.duration,
      path: relative,
      bytes: bytes.length,
      sha256: hash,
      ...dimensions,
      duplicate_of,
      repository_matches: repository.get(hash) || [],
      current_src: seek.current_src,
      video_width: seek.video_width,
      video_height: seek.video_height
    });
  }
  const uniqueFrames = frameRows.filter(row => !row.duplicate_of);
  assert(uniqueFrames.length >= control.minimum_sample_frames, `UC-113 video orbit retained only ${uniqueFrames.length} unique frames`);
  assert(uniqueFrames.every(row => row.width >= 640 && row.height >= 360), 'UC-113 video frame geometry below floor');

  const thumbs = [];
  await mkdir(join(OUT, 'thumbs'), { recursive: true });
  for (let index = 0; index < uniqueFrames.length; index++) {
    const row = uniqueFrames[index];
    const thumb = join(OUT, 'thumbs', `${String(index + 1).padStart(2, '0')}-${String(Math.round(row.requested_time * 10)).padStart(3, '0')}.jpg`);
    magick(join(OUT, row.path), '-thumbnail', '640x360>', '-background', '#171512', '-gravity', 'center', '-extent', '640x360', '-fill', 'white', '-undercolor', '#171512cc', '-gravity', 'south', '-pointsize', '15', '-annotate', '+0+7', `${index + 1} · ${row.requested_time.toFixed(1)}s`, '-strip', '-quality', '88', thumb);
    thumbs.push(thumb);
  }
  const contactPath = join(OUT, 'contact-sheet-video-frames.jpg');
  execFileSync('montage', [...thumbs, '-tile', '4x', '-geometry', '640x360+10+10', '-background', '#e8e3d9', contactPath], { stdio: 'inherit' });
  const contactSheet = { path: 'contact-sheet-video-frames.jpg', sha256: sha(await readFile(contactPath)), ...identify(contactPath), count: uniqueFrames.length };
  const pageReceipt = { path: 'pages/marvel-finding-korg-video-orbit.png', bytes: pageShotBytes.length, sha256: sha(pageShotBytes), ...identify(pageShot) };
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
    generated_at: new Date().toISOString(),
    control_sha256: sha(await readFile(CONTROL)),
    discovery_checkpoint: control.discovery_checkpoint,
    repository_hash_count: repository.size,
    page_evidence: {
      provider: control.video_page.provider,
      source_page: control.video_page.url,
      page_title: await page.title(),
      http_status: response.status(),
      required_terms: control.video_page.required_terms,
      required_terms_missing: [],
      page_screenshot: pageReceipt
    },
    video: {
      frame_url: located.frame.url(),
      frame_index: located.index,
      ...initialVideo
    },
    sampled_frames: frameRows,
    unique_frames: uniqueFrames,
    unique_frame_count: uniqueFrames.length,
    contact_sheet: contactSheet,
    selection_contract: control.selection_contract,
    disposition: 'official-video-frame-orbit-pending-visual-second-desk',
    canonical_mutation: false
  };
  await writeJson(join(OUT, 'manifest.json'), manifest);
  await writeJson(join(OUT, 'summary.json'), {
    record_id: 'UC-113',
    actor: 'Taika Waititi',
    character: 'Korg',
    production: 'Thor: Ragnarok',
    video: manifest.video,
    unique_frame_count: uniqueFrames.length,
    unique_frames: uniqueFrames.map(row => ({ requested_time: row.requested_time, actual_time: row.actual_time, path: row.path, bytes: row.bytes, sha256: row.sha256, width: row.width, height: row.height, repository_matches: row.repository_matches })),
    contact_sheet: contactSheet,
    rejected_thumbnail_sha256: control.discovery_checkpoint.rejected_thumbnail_sha256,
    canonical_mutation: false
  });
  const cards = uniqueFrames.map((row, index) => `<article><img src="${row.path}" alt=""><h2>${index + 1}. ${row.requested_time.toFixed(1)}s</h2><p>${row.width}×${row.height} · ${row.bytes} bytes</p><code>${row.sha256}</code></article>`).join('');
  await writeFile(join(OUT, 'review.html'), `<!doctype html><meta charset="utf-8"><style>body{font:14px system-ui;background:#e8e3d9;margin:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:12px}article{background:white;padding:10px}article img{width:100%;height:360px;object-fit:contain;background:#171512}code{display:block;font-size:9px;word-break:break-all}</style><h1>UC-113 · official Marvel Finding Korg frame orbit</h1><p>The visual second desk must admit a completed 2017 Korg frame and reject Taika Waititi in performance-capture equipment.</p><div class="grid">${cards}</div>`);
  console.log(`PASS — UC-113 official video orbit retained ${uniqueFrames.length} unique frame(s)`);
  console.log(`manifest ${sha(await readFile(join(OUT, 'manifest.json')))}`);
  console.log(`summary ${sha(await readFile(join(OUT, 'summary.json')))}`);
  console.log(`contact ${contactSheet.sha256}`);
  console.log(`artifact ${OUT}`);
} finally {
  await browser.close();
}
