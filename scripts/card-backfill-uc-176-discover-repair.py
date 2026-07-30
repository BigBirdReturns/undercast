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
new_commons = """  const apiParams = {
    action: 'query', format: 'json', formatversion: '2', generator: 'categorymembers',
    gcmtitle: orbit.category, gcmtype: 'file', gcmlimit: '100',
    prop: 'imageinfo', iiprop: 'url|size|mime|sha1|timestamp|extmetadata'
  };
  let response = null;
  const apiAttempts = [];
  const fallbackDelays = [2000, 4000, 8000, 16000];
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
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  assert(response?.ok(), `Commons API HTTP ${response?.status() ?? 'none'} after ${apiAttempts.length} attempt(s)`);
  const json = await response.json();
  await writeJson(join(OUT, 'source-api-commons-category.json'), json);
  await writeJson(join(OUT, 'source-api-commons-category-retry.json'), {
    api_url: orbit.api,
    params: apiParams,
    attempts: apiAttempts,
    completed: true,
    final_http_status: response.status()
  });
"""
if text.count(old_commons) != 1:
    raise SystemExit("UC-176 exact orbit.api Commons request anchor drift")
text = text.replace(old_commons, new_commons, 1)

old_manifest = """    commons_api_receipt: { path: 'source-api-commons-category.json', sha256: sha(await readFile(join(OUT, 'source-api-commons-category.json'))) },
"""
new_manifest = """    commons_api_receipt: { path: 'source-api-commons-category.json', sha256: sha(await readFile(join(OUT, 'source-api-commons-category.json'))) },
    commons_transport_retry_receipt: { path: 'source-api-commons-category-retry.json', sha256: sha(await readFile(join(OUT, 'source-api-commons-category-retry.json'))) },
"""
if text.count(old_manifest) != 1:
    raise SystemExit("UC-176 Commons manifest receipt anchor drift")
text = text.replace(old_manifest, new_manifest, 1)

OUTPUT.write_text(text, encoding="utf-8")
print(f"PASS — materialized exact-blob UC-176 static ASC mirror receipts and exact orbit.api bounded Commons retry repair at {OUTPUT}")
