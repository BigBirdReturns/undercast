#!/usr/bin/env python3
from __future__ import annotations

import hashlib
from pathlib import Path

SOURCE = Path("scripts/card-backfill-uc-176-discover.mjs")
OUTPUT = Path("scripts/.card-backfill-uc-176-discover-source-dom-run.mjs")
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
"""
new = """    const title = await page.title();
    const visibleBody = await page.locator('body').innerText().catch(() => '');
    const samePageDomValidation = source.key === 'afi-catalog' || source.key === 'asc-history';
    const samePageDomText = samePageDomValidation
      ? await page.locator('body').textContent().catch(() => '')
      : '';
    const body = samePageDomValidation
      ? `${visibleBody}\n\n--- SAME-PAGE DOM TEXTCONTENT ---\n\n${samePageDomText}`
      : visibleBody;
    const normalizedBody = normalized(body);
    const missing = source.required_terms.filter(term => !normalizedBody.toLowerCase().includes(normalized(term).toLowerCase()));
"""
if text.count(old) != 1:
    raise SystemExit("UC-176 source validation surface anchor drift")
text = text.replace(old, new, 1)

old_return = """      title, required_terms: source.required_terms, required_terms_missing: missing,
"""
new_return = """      title,
      validation_surfaces: samePageDomValidation ? ['visible-innerText', 'same-page-body-textContent'] : ['visible-innerText'],
      required_terms: source.required_terms, required_terms_missing: missing,
"""
if text.count(old_return) != 1:
    raise SystemExit("UC-176 source receipt surface anchor drift")
text = text.replace(old_return, new_return, 1)

OUTPUT.write_text(text, encoding="utf-8")
print(f"PASS — materialized exact-blob UC-176 AFI and ASC same-page DOM repair at {OUTPUT}")
