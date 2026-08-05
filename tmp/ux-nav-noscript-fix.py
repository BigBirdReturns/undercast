#!/usr/bin/env python3
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


recognition = Path("recognition.html")
text = recognition.read_text()
text = replace_once(
    text,
    '      <noscript><section class="uc-error"><div class="uc-kicker">The durable archive</div><h1>The records are still here.</h1><p>Recognition resolves live catalog connections in the browser, and a URL fragment cannot select its record without JavaScript. Use a sample permanent record or the versioned archive instead.</p><a href="./records/UC-001/">Open sample permanent record</a> <a href="./data/archive.json">Open the machine archive</a> <a href="./index.html#archive">Open archive home</a></section></noscript>',
    '      <noscript><section class="uc-error"><div class="uc-kicker">The durable archive</div><h1>The records are still here.</h1><p>Recognition resolves live catalog connections in the browser, and a URL fragment cannot select its record without JavaScript. Use a sample permanent record or the versioned archive instead.</p><a href="./records/UC-001/">Open sample permanent record</a> <a href="./data/archive.json">Open the machine archive</a> <a href="./index.html#archive">Open archive home</a></section><nav class="archive-map" aria-label="Archive paths"><span class="archive-map__label">Archive paths</span><a href="./index.html">The wall</a><a href="./recognition.html" aria-current="location">Recognition records</a><a href="./coverage.html">Coverage &amp; gaps</a><a href="./constellation.html">Evidence paths</a><a href="./data/archive.json">Machine archive</a></nav></noscript>',
    "Recognition no-JavaScript archive map",
)
recognition.write_text(text)

journeys = Path("tests/rendered/ux-journeys.spec.mjs")
text = journeys.read_text()
text = replace_once(
    text,
    '''    await expect(archiveMap.getByRole("link",{name:"Coverage & gaps",exact:true})).toHaveAttribute("aria-current","location");
    await expect(page.locator(".site-nav-toggle")).toHaveCount(0);''',
    '''    await expect(archiveMap.getByRole("link",{name:"Coverage & gaps",exact:true})).toHaveAttribute("aria-current","location");
    await expect(page.locator(".site-nav-toggle")).toHaveCount(0);

    await page.goto(sitePath("recognition.html"),{waitUntil:"domcontentloaded"});
    const recognitionMap=page.getByRole("navigation",{name:"Archive paths",exact:true});
    await expect(recognitionMap).toBeVisible();
    await expect(recognitionMap.getByRole("link",{name:"Recognition records",exact:true})).toHaveAttribute("aria-current","location");''',
    "Recognition no-JavaScript journey",
)
journeys.write_text(text)
