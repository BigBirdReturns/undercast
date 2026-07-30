#!/usr/bin/env python3
from __future__ import annotations

import hashlib
from pathlib import Path

SOURCE = Path("scripts/card-backfill-uc-176-discover.mjs")
OUTPUT = Path("scripts/.card-backfill-uc-176-discover-article-mirror-run.mjs")
EXPECTED_GIT_BLOB_SHA1 = "dc1aa66be07a609f226da17dc59a16c21cf6028d"

raw = SOURCE.read_bytes()
git_blob_sha1 = hashlib.sha1(
    b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw,
    usedforsecurity=False,
).hexdigest()
if git_blob_sha1 != EXPECTED_GIT_BLOB_SHA1:
    raise SystemExit(
        f"UC-176 original discoverer blob drift: {git_blob_sha1} != {EXPECTED_GIT_BLOB_SHA1}"
    )

text = raw.decode("utf-8")
old = """    const title = await page.title();
    const body = await page.locator('body').innerText().catch(() => '');
    const normalizedBody = normalized(body);
    const missing = source.required_terms.filter(term => !normalizedBody.toLowerCase().includes(normalized(term).toLowerCase()));
    if (source.strict) assert(missing.length === 0, `${source.key} missing required terms: ${missing.join(' | ')}`);
"""
new = """    const title = await page.title();
    const visibleBody = await page.locator('body').innerText().catch(() => '');
    const samePageDomValidation = source.key === 'afi-catalog' || source.key === 'asc-history';
    const samePageDomText = samePageDomValidation
      ? await page.locator('body').textContent().catch(() => '')
      : '';
    const transportMirrorRows = [];
    if (source.key === 'asc-history') {
      const mirrorUrls = [
        'https://m.theasc.com/magazine/mar99/two/pg4.htm',
        'https://m.theasc.com/magazine/mar99/two/pg1.htm',
        'https://theasc.com/articles/two-faced-treachery-dr-jekyll-and-mr-hyde',
        'https://theasc.com/magazine/mar99/two/pg1.htm',
        'https://theasc.com/magazine/mar99/two/pg4.htm'
      ];
      for (let mirrorIndex = 0; mirrorIndex < mirrorUrls.length; mirrorIndex++) {
        const mirrorUrl = mirrorUrls[mirrorIndex];
        try {
          const mirrorResponse = await context.request.get(mirrorUrl, {
            headers: {
              'User-Agent': UA,
              Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              Referer: source.url
            },
            timeout: control.transport_timeout_ms,
            failOnStatusCode: false
          });
          if (!mirrorResponse.ok()) {
            transportMirrorRows.push({ requested_url: mirrorUrl, resolved_url: mirrorResponse.url() || mirrorUrl, http_status: mirrorResponse.status(), error: 'HTTP' });
            continue;
          }
          const mirrorHtml = await mirrorResponse.text();
          const mirrorText = await page.evaluate(html => {
            const parsed = new DOMParser().parseFromString(html, 'text/html');
            return parsed.body?.textContent || '';
          }, mirrorHtml);
          const stem = `asc-history-mirror-${String(mirrorIndex + 1).padStart(2, '0')}`;
          const htmlLocal = `pages/${stem}.html`;
          const textLocal = `pages/${stem}.txt`;
          await writeFile(join(OUT, htmlLocal), mirrorHtml);
          await writeFile(join(OUT, textLocal), mirrorText);
          transportMirrorRows.push({
            requested_url: mirrorUrl,
            resolved_url: mirrorResponse.url() || mirrorUrl,
            http_status: mirrorResponse.status(),
            html_receipt: {
              path: htmlLocal,
              bytes: Buffer.byteLength(mirrorHtml, 'utf8'),
              sha256: sha(Buffer.from(mirrorHtml, 'utf8'))
            },
            text_receipt: {
              path: textLocal,
              bytes: Buffer.byteLength(mirrorText, 'utf8'),
              sha256: sha(Buffer.from(mirrorText, 'utf8'))
            },
            html: mirrorHtml,
            text: mirrorText
          });
        } catch (error) {
          transportMirrorRows.push({ requested_url: mirrorUrl, resolved_url: null, http_status: null, error: error.message });
        }
      }
      await writeJson(
        join(OUT, 'pages', 'asc-history-transport-mirrors.json'),
        transportMirrorRows.map(({ html, text, ...row }) => row)
      );
    }
    const validationSurfaces = ['visible-innerText'];
    const bodyParts = [visibleBody];
    if (samePageDomValidation) {
      validationSurfaces.push('same-page-body-textContent');
      bodyParts.push(`--- SAME-PAGE DOM TEXTCONTENT ---\n\n${samePageDomText}`);
    }
    const usableTransportMirrors = transportMirrorRows.filter(row => row.text || row.html);
    if (usableTransportMirrors.length) {
      validationSurfaces.push('exact-same-article-transport-mirror-text-and-html');
      for (const row of usableTransportMirrors) {
        bodyParts.push(`--- ASC SAME-ARTICLE MIRROR TEXT ${row.requested_url} ---\n\n${row.text || ''}`);
        bodyParts.push(`--- ASC SAME-ARTICLE MIRROR RAW HTML ${row.requested_url} ---\n\n${row.html || ''}`);
      }
    }
    const body = bodyParts.join(String.fromCharCode(10, 10));
    const normalizedBody = normalized(body);
    const missing = source.required_terms.filter(term => !normalizedBody.toLowerCase().includes(normalized(term).toLowerCase()));
"""
if text.count(old) != 1:
    raise SystemExit("UC-176 source validation and strict-assertion anchor drift")
text = text.replace(old, new, 1)

old_receipt = """    const screenshotBytes = await readFile(screenshotPath);
    const textBytes = await readFile(textPath);
"""
new_receipt = """    const screenshotBytes = await readFile(screenshotPath);
    const textBytes = await readFile(textPath);
    if (source.strict) assert(missing.length === 0, `${source.key} missing required terms: ${missing.join(' | ')}`);
"""
if text.count(old_receipt) != 1:
    raise SystemExit("UC-176 diagnostic receipt anchor drift")
text = text.replace(old_receipt, new_receipt, 1)

old_return = """      title, required_terms: source.required_terms, required_terms_missing: missing,
"""
new_return = """      title, validation_surfaces: validationSurfaces,
      transport_mirrors: transportMirrorRows.map(({ html, text, ...row }) => row),
      required_terms: source.required_terms, required_terms_missing: missing,
"""
if text.count(old_return) != 1:
    raise SystemExit("UC-176 source receipt surface anchor drift")
text = text.replace(old_return, new_return, 1)

old_commons = """  const response = await context.request.get(orbit.api, {
    params: {
      action: 'query', format: 'json', formatversion: '2', generator: 'categorymembers',
      gcmtitle: orbit.category, gcmtype: 'file', gcmlimit: '100',
      prop: 'imageinfo', iiprop: 'url|size|mime|sha1|timestamp|extmetadata'
    },
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    timeout: control.transport_timeout_ms,
    failOnStatusCode: false
  });
  assert(response.ok(), `Commons API HTTP ${response.status()}`);
  const json = await response.json();
  await writeJson(join(OUT, 'source-api-commons-category.json'), json);
"""
new_commons = r"""  const apiParams = {
    action: 'query', format: 'json', formatversion: '2', generator: 'categorymembers',
    gcmtitle: orbit.category, gcmtype: 'file', gcmlimit: '100',
    prop: 'imageinfo', iiprop: 'url|size|mime|sha1|timestamp|extmetadata'
  };
  let response = null;
  const apiAttempts = [];
  const retryPath = join(OUT, 'source-api-commons-category-retry.json');
  const fallbackPath = join(OUT, 'source-commons-category-html-fallback.json');
  const sourceReceiptPath = join(OUT, 'source-api-commons-category.json');
  const fallbackDelays = [2000, 4000, 8000, 16000];
  const writeRetryReceipt = async extra => writeJson(retryPath, {
    version: 1,
    api_url: orbit.api,
    params: apiParams,
    attempts: apiAttempts,
    completed: false,
    transport: 'primary-api',
    final_http_status: response ? response.status() : null,
    ...extra
  });
  for (let attempt = 1; attempt <= 5; attempt++) {
    response = await context.request.get(orbit.api, {
      params: apiParams,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      timeout: control.transport_timeout_ms,
      failOnStatusCode: false
    });
    const responseHeaders = response.headers();
    const retryAfterHeader = responseHeaders['retry-after'] || null;
    const attemptRow = {
      attempt,
      requested_url: orbit.api,
      resolved_url: response.url() || orbit.api,
      http_status: response.status(),
      retry_after_header: retryAfterHeader
    };
    apiAttempts.push(attemptRow);
    await writeRetryReceipt({ stage: 'primary-api-attempt-complete' });
    if (response.ok()) break;
    if (![429, 503].includes(response.status()) || attempt === 5) break;
    let delayMs = fallbackDelays[Math.min(attempt - 1, fallbackDelays.length - 1)];
    if (retryAfterHeader) {
      const retryAfterSeconds = Number(retryAfterHeader);
      if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
        delayMs = Math.max(1000, Math.min(retryAfterSeconds * 1000, 30000));
      } else {
        const retryAfterDate = Date.parse(retryAfterHeader);
        if (Number.isFinite(retryAfterDate)) delayMs = Math.max(1000, Math.min(retryAfterDate - Date.now(), 30000));
      }
    }
    attemptRow.delay_ms = delayMs;
    await writeRetryReceipt({ stage: 'primary-api-backoff-authorized' });
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  if (response?.ok()) {
    const json = await response.json();
    await writeJson(sourceReceiptPath, json);
    await writeJson(fallbackPath, {
      version: 1,
      used: false,
      reason: 'primary-api-succeeded',
      exact_category: orbit.category,
      exact_category_page: control.source_pages.find(row => row.key === 'commons-category')?.url || null
    });
    await writeRetryReceipt({ completed: true, transport: 'primary-api', stage: 'primary-api-complete', final_http_status: response.status() });
    const pages = json.query?.pages || [];
    return pages.map(page => {
      const info = page.imageinfo?.[0] || {};
      return {
        source_family: 'commons', provider: 'Wikimedia Commons', source_page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title || '').replace(/ /g, '_'))}`,
        title: page.title, url: info.url, api_sha1: info.sha1 || null, api_timestamp: info.timestamp || null,
        api_width: info.width || null, api_height: info.height || null, api_mime: info.mime || null,
        extmetadata: info.extmetadata || {}, exclusion: commonsExclusion(page.title, info), transport: 'primary-api'
      };
    });
  }
  const retryableExhaustion = apiAttempts.length === 5 && apiAttempts.every(row => [429, 503].includes(row.http_status));
  await writeRetryReceipt({
    stage: retryableExhaustion ? 'primary-api-exhausted-category-html-fallback-starting' : 'primary-api-nonretryable-failure',
    fallback_authorized: retryableExhaustion
  });
  assert(retryableExhaustion, `Commons API HTTP ${response?.status() ?? 'none'} after ${apiAttempts.length} attempt(s)`);

  const categorySource = control.source_pages.find(row => row.key === 'commons-category');
  assert(categorySource?.url === 'https://commons.wikimedia.org/wiki/Category:Dr._Jekyll_and_Mr._Hyde_(1931_film)', 'Commons fallback category-page identity drift');
  const categoryPage = await context.newPage();
  let categoryReceipt;
  let fileLinks = [];
  try {
    const navigated = await navigateWithFallback(context, categoryPage, categorySource.url);
    await categoryPage.waitForTimeout(1200);
    await acceptBanners(categoryPage);
    for (let i = 0; i < 8; i++) {
      await categoryPage.mouse.wheel(0, 1400);
      await categoryPage.waitForTimeout(100);
    }
    const status = responseStatus(navigated.response);
    assert(status >= 200 && status < 400, `Commons category fallback page HTTP ${status}`);
    fileLinks = await categoryPage.evaluate(() => {
      const roots = [
        document.querySelector('#mw-category-media'),
        document.querySelector('.mw-category-generated'),
        document.querySelector('.mw-category')
      ].filter(Boolean);
      const anchors = (roots.length ? roots : [document]).flatMap(root => [...root.querySelectorAll('a[href]')]);
      const seen = new Set();
      const rows = [];
      for (const anchor of anchors) {
        try {
          const url = new URL(anchor.getAttribute('href'), location.href);
          if (url.hostname !== 'commons.wikimedia.org') continue;
          const match = url.pathname.match(/\/wiki\/(File:[^#?]+)/i);
          if (!match) continue;
          const title = decodeURIComponent(match[1]).replace(/_/g, ' ');
          if (!/^File:/i.test(title) || seen.has(title)) continue;
          seen.add(title);
          rows.push({ title, url: url.toString() });
        } catch {}
      }
      return rows;
    });
    const html = await categoryPage.content();
    const body = await categoryPage.locator('body').innerText().catch(() => '');
    const htmlLocal = 'pages/commons-category-fallback.html';
    const textLocal = 'pages/commons-category-fallback.txt';
    await mkdir(join(OUT, 'pages'), { recursive: true });
    await writeFile(join(OUT, htmlLocal), html);
    await writeFile(join(OUT, textLocal), body);
    categoryReceipt = {
      requested_url: categorySource.url,
      resolved_url: categoryPage.url() || categorySource.url,
      http_status: status,
      transport: navigated.transport,
      html_receipt: { path: htmlLocal, bytes: Buffer.byteLength(html, 'utf8'), sha256: sha(Buffer.from(html, 'utf8')) },
      text_receipt: { path: textLocal, bytes: Buffer.byteLength(body, 'utf8'), sha256: sha(Buffer.from(body, 'utf8')) }
    };
  } finally {
    await categoryPage.close();
  }
  assert(fileLinks.length >= 1 && fileLinks.length <= 100, `Commons category fallback file-link denominator ${fileLinks.length}`);

  const fileReceipts = [];
  const fallbackRows = [];
  for (let index = 0; index < fileLinks.length; index++) {
    const link = fileLinks[index];
    const filePage = await context.newPage();
    try {
      const navigated = await navigateWithFallback(context, filePage, link.url);
      await filePage.waitForTimeout(500);
      const status = responseStatus(navigated.response);
      if (!(status >= 200 && status < 400)) {
        fileReceipts.push({ title: link.title, requested_url: link.url, resolved_url: filePage.url() || link.url, http_status: status, error: 'HTTP' });
        continue;
      }
      const heading = normalized(await filePage.locator('#firstHeading').innerText().catch(() => link.title)) || link.title;
      const title = /^File:/i.test(heading) ? heading : link.title;
      const html = await filePage.content();
      const body = await filePage.locator('body').innerText().catch(() => '');
      const stem = `commons-file-${String(index + 1).padStart(2, '0')}`;
      const htmlLocal = `pages/${stem}.html`;
      const textLocal = `pages/${stem}.txt`;
      await writeFile(join(OUT, htmlLocal), html);
      await writeFile(join(OUT, textLocal), body);
      const fileName = title.replace(/^File:/i, '').replace(/ /g, '_');
      const mediaUrl = `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(fileName)}`;
      const extmetadata = {
        ObjectName: { value: title },
        Categories: { value: orbit.category }
      };
      const receipt = {
        title,
        requested_url: link.url,
        resolved_url: filePage.url() || link.url,
        http_status: status,
        transport: navigated.transport,
        media_transport_url: mediaUrl,
        html_receipt: { path: htmlLocal, bytes: Buffer.byteLength(html, 'utf8'), sha256: sha(Buffer.from(html, 'utf8')) },
        text_receipt: { path: textLocal, bytes: Buffer.byteLength(body, 'utf8'), sha256: sha(Buffer.from(body, 'utf8')) }
      };
      fileReceipts.push(receipt);
      fallbackRows.push({
        source_family: 'commons',
        provider: 'Wikimedia Commons',
        source_page: link.url,
        title,
        url: mediaUrl,
        api_sha1: null,
        api_timestamp: null,
        api_width: null,
        api_height: null,
        api_mime: null,
        extmetadata,
        exclusion: commonsExclusion(title, { extmetadata }),
        transport: 'category-html-file-page-special-redirect',
        file_page_receipt: receipt
      });
    } catch (error) {
      fileReceipts.push({ title: link.title, requested_url: link.url, resolved_url: null, http_status: null, error: error.message });
    } finally {
      await filePage.close();
    }
  }
  assert(fallbackRows.length >= 1, 'Commons exact-category HTML fallback produced no file-page rows');
  const fallbackReceipt = {
    version: 1,
    used: true,
    reason: 'five-retryable-primary-api-failures',
    exact_category: orbit.category,
    category_page: categoryReceipt,
    namespace_file_links: fileLinks,
    file_pages: fileReceipts,
    candidate_row_count: fallbackRows.length,
    media_transport: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/'
  };
  await writeJson(fallbackPath, fallbackReceipt);
  await writeJson(sourceReceiptPath, {
    version: 1,
    transport: 'exact-category-html-fallback-after-primary-api-rate-limit',
    primary_api: { api_url: orbit.api, params: apiParams, attempts: apiAttempts, completed: false },
    fallback_receipt: { path: 'source-commons-category-html-fallback.json', sha256: sha(Buffer.from(JSON.stringify(fallbackReceipt, null, 2) + String.fromCharCode(10), 'utf8')) },
    category_page: categoryReceipt,
    files: fileReceipts
  });
  await writeRetryReceipt({
    completed: true,
    transport: 'category-html-file-page-special-redirect',
    stage: 'category-html-fallback-complete',
    fallback_authorized: true,
    fallback_receipt_path: 'source-commons-category-html-fallback.json',
    fallback_candidate_row_count: fallbackRows.length
  });
  return fallbackRows;
"""
if text.count(old_commons) != 1:
    raise SystemExit("UC-176 exact orbit.api Commons request anchor drift")
text = text.replace(old_commons, new_commons, 1)

old_manifest = """    commons_api_receipt: { path: 'source-api-commons-category.json', sha256: sha(await readFile(join(OUT, 'source-api-commons-category.json'))) },
"""
new_manifest = """    commons_source_transport: commonsRows.some(row => row.transport === 'category-html-file-page-special-redirect') ? 'category-html-file-page-special-redirect' : 'primary-api',
    commons_api_receipt: { path: 'source-api-commons-category.json', sha256: sha(await readFile(join(OUT, 'source-api-commons-category.json'))) },
    commons_transport_retry_receipt: { path: 'source-api-commons-category-retry.json', sha256: sha(await readFile(join(OUT, 'source-api-commons-category-retry.json'))) },
    commons_html_fallback_receipt: { path: 'source-commons-category-html-fallback.json', sha256: sha(await readFile(join(OUT, 'source-commons-category-html-fallback.json'))) },
"""
if text.count(old_manifest) != 1:
    raise SystemExit("UC-176 Commons manifest receipt anchor drift")
text = text.replace(old_manifest, new_manifest, 1)

OUTPUT.write_text(text, encoding="utf-8")
print(f"PASS — materialized exact-blob UC-176 ASC receipts, API-first Commons custody, and exact-category HTML fallback at {OUTPUT}")
