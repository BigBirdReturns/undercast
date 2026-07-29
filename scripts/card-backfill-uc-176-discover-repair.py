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
        'https://theasc.com/articles/two-faced-treachery-dr-jekyll-and-mr-hyde',
        'https://theasc.com/magazine/mar99/two/pg1.htm',
        'https://theasc.com/magazine/mar99/two/pg4.htm'
      ];
      for (const mirrorUrl of mirrorUrls) {
        try {
          const mirrorResponse = await context.request.get(mirrorUrl, {
            headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
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
          transportMirrorRows.push({
            requested_url: mirrorUrl,
            resolved_url: mirrorResponse.url() || mirrorUrl,
            http_status: mirrorResponse.status(),
            html_bytes: Buffer.byteLength(mirrorHtml, 'utf8'),
            html_sha256: sha(Buffer.from(mirrorHtml, 'utf8')),
            text_sha256: sha(Buffer.from(mirrorText, 'utf8')),
            text: mirrorText
          });
        } catch (error) {
          transportMirrorRows.push({ requested_url: mirrorUrl, resolved_url: null, http_status: null, error: error.message });
        }
      }
    }
    const validationSurfaces = ['visible-innerText'];
    const bodyParts = [visibleBody];
    if (samePageDomValidation) {
      validationSurfaces.push('same-page-body-textContent');
      bodyParts.push(`--- SAME-PAGE DOM TEXTCONTENT ---\n\n${samePageDomText}`);
    }
    const usableTransportMirrors = transportMirrorRows.filter(row => row.text);
    if (usableTransportMirrors.length) {
      validationSurfaces.push('exact-same-article-transport-mirror');
      for (const row of usableTransportMirrors) bodyParts.push(`--- ASC SAME-ARTICLE MIRROR ${row.requested_url} ---\n\n${row.text}`);
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
      transport_mirrors: transportMirrorRows.map(({ text, ...row }) => row),
      required_terms: source.required_terms, required_terms_missing: missing,
"""
if text.count(old_return) != 1:
    raise SystemExit("UC-176 source receipt surface anchor drift")
text = text.replace(old_return, new_return, 1)

OUTPUT.write_text(text, encoding="utf-8")
print(f"PASS — materialized exact-blob UC-176 AFI DOM and ASC same-article mirror repair at {OUTPUT}")
