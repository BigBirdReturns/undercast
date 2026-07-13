#!/usr/bin/env node
/**
 * build-og.mjs — regenerate og.png (the 1200×630 social-share card) from the
 * LIVE specimen count, demonstrating the one fully art-directed comparison the
 * archive has: Morn (the character) → Mark Allen Shepherd (the performer).
 *
 * Why this exists: og.png used to be a hand-made PNG with the count baked in as
 * pixels. It froze at "139 SPECIMENS ON FILE" while the roster grew past a
 * thousand, so every shared link undersold the project under a tagline that
 * literally reads "THE CATALOG GROWS." A frozen integer in a static asset is
 * exactly the kind of un-pinned truth the archive contract exists to kill.
 *
 * og.png is now a generated artifact: this script renders an on-brand card
 * (real Fraunces + Space Mono via Google Fonts) with the live count and the
 * Morn/Mark seam, then screenshots it. It runs inside `build:site`, so the card
 * is always current at deploy; the file is gitignored like the records/ pages.
 *
 * The seam shows Morn because Morn is the single comparison with reviewed
 * positioning — the card demonstrates the real interaction, not a placeholder.
 *
 * Requires @playwright/test (installed for the rendered suite) and network
 * access to Google Fonts (already allow-listed in the site CSP).
 */
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const specimens = JSON.parse(await readFile("data/specimens.json", "utf8"));
const count = specimens.length;

const dataUri = async (path, mime) =>
  `data:${mime};base64,` + (await readFile(path)).toString("base64");
const mornStill = await dataUri("images/uc-001-still.jpg", "image/jpeg");   // the character
const markPortrait = await dataUri("images/uc-001-portrait.jpg", "image/jpeg"); // the person

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1200px;height:630px}
  body{
    font-family:"Space Mono",monospace;color:#5B564C;
    background:#E4DFD5;
    background-image:radial-gradient(#c9c2b3 1px,transparent 1px);
    background-size:22px 22px;
    border:14px solid #1C1A16;position:relative;overflow:hidden;
  }
  .col{position:absolute;left:66px;top:52px;width:600px}
  .mark{font-family:"Fraunces",serif;font-weight:900;font-size:38px;letter-spacing:.01em;line-height:1}
  .mark .u{color:#1C1A16}.mark .c{color:#7C918D}
  .kicker{margin-top:14px;font-size:13px;letter-spacing:.28em;text-transform:uppercase;color:#8B8577}
  h1{font-family:"Fraunces",serif;font-weight:900;font-size:52px;line-height:1.02;letter-spacing:-.01em;margin-top:40px;color:#1C1A16}
  h1 em{font-style:italic;color:#7C918D;font-weight:600}
  .sub{font-size:18px;line-height:1.5;color:#5B564C;max-width:30ch;margin-top:22px}
  .sub b{color:#A83E30;font-weight:700}
  .count{position:absolute;left:66px;bottom:32px;display:flex;align-items:baseline;gap:16px}
  .count .n{font-family:"Fraunces",serif;font-weight:900;font-size:52px;line-height:1;color:#1C1A16}
  .count .l{font-size:14px;letter-spacing:.24em;text-transform:uppercase;color:#8B8577}
  /* the Morn -> Mark seam */
  .frame{position:absolute;right:66px;top:62px;width:406px;height:506px;border:1px solid #1C1A16;overflow:hidden;background:#141109;box-shadow:0 12px 30px rgba(20,16,10,.24)}
  .layer{position:absolute;inset:0;overflow:hidden}
  .layer img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .layer.char img{object-position:58% 30%}
  .layer.person img{object-position:50% 26%}
  .layer.char{clip-path:inset(0 50% 0 0)}
  .layer.person{clip-path:inset(0 0 0 50%);z-index:2}
  .seam{position:absolute;top:0;bottom:0;left:50%;width:2px;background:#A6402F;transform:translateX(-1px);z-index:3}
  .handle{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:46px;height:46px;border-radius:50%;background:#1C1A16;color:#E4DFD5;display:grid;place-items:center;z-index:4;border:1px solid #E4DFD5;font-size:17px;box-shadow:0 2px 14px rgba(0,0,0,.3)}
  .plabel{position:absolute;bottom:12px;font-size:10px;letter-spacing:.14em;text-transform:uppercase;background:#1C1A16;color:#E4DFD5;padding:3px 8px;z-index:5}
  .plabel.l{left:12px}.plabel.r{right:12px}
</style></head>
<body>
  <div class="col">
    <div class="mark"><span class="u">UNDER</span><span class="c">CAST</span></div>
    <div class="kicker">A Field Index · No.01</div>
    <h1>You remember Morn.<br>Now meet <em>Mark Allen Shepherd.</em></h1>
    <p class="sub">Some performers disappear under a face. <b>Undercast brings the person back into view.</b></p>
  </div>
  <div class="frame">
    <div class="layer char"><img src="${mornStill}" alt=""></div>
    <div class="layer person"><img src="${markPortrait}" alt=""></div>
    <div class="seam"></div>
    <div class="handle">↔</div>
    <span class="plabel l">The character</span>
    <span class="plabel r">The person</span>
  </div>
  <div class="count"><span class="n">${count.toLocaleString("en-US")}</span><span class="l">specimens on file · the catalog grows</span></div>
</body></html>`;

// In CI, `playwright install` provides the matching browser and the default
// launch works. PW_CHROMIUM_PATH lets a host with a pre-pinned browser point at
// it instead of downloading a version-matched one.
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: "og.png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log(`built og.png — Morn → Mark, ${count.toLocaleString("en-US")} specimens on file`);
} finally {
  await browser.close();
}
