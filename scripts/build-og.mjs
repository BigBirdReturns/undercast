#!/usr/bin/env node
/**
 * build-og.mjs — regenerate og.png (the 1200×630 social-share card) from the
 * LIVE specimen count.
 *
 * Why this exists: og.png used to be a hand-made PNG with the count baked in as
 * pixels. It froze at "139 SPECIMENS ON FILE" while the roster grew to a
 * thousand-plus, so every shared link undersold the project and — under a
 * tagline that literally reads "THE CATALOG GROWS" — made it look abandoned.
 *
 * A frozen integer in a static asset is exactly the kind of un-pinned truth the
 * archive contract exists to kill. So og.png is now a generated artifact: this
 * script renders an on-brand HTML card (real Fraunces + Space Mono via Google
 * Fonts) and screenshots it. It runs inside `build:site`, so the count is
 * always current at deploy; the file is gitignored like the records/ pages.
 *
 * Requires @playwright/test (installed for the rendered suite) and network
 * access to Google Fonts (already allow-listed in the site CSP).
 */
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const specimens = JSON.parse(await readFile("data/specimens.json", "utf8"));
const count = specimens.length;

// The blank casting relief — the site's actual "no evidence yet" mark (the
// halftone head with the registration centerline). Embedded from the real asset
// so the card art tracks the site's blank-card language instead of drifting.
const faceUri = "data:image/png;base64," + (await readFile("assets/placeholder-light-clean.png")).toString("base64");

const card = (id, shelf, cls) =>
  `<div class="card ${cls}"><div class="card-head"><span class="card-id">${id}</span><span class="card-shelf">${shelf}</span></div><div class="card-face"><img src="${faceUri}" alt=""></div></div>`;

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
    border:14px solid #1C1A16;
    position:relative;overflow:hidden;
  }
  .field{position:absolute;inset:0;padding:46px 66px}
  .kicker{display:flex;align-items:center;gap:14px;font-size:15px;letter-spacing:.34em;text-transform:uppercase;color:#5B564C}
  .kicker .no{border:1px solid #8B8577;padding:3px 9px;letter-spacing:.2em;font-size:13px}
  h1{font-family:"Fraunces",serif;font-weight:900;font-size:132px;line-height:.86;letter-spacing:-.01em;margin-top:20px}
  h1 .under{color:#1C1A16;display:block}
  h1 .cast{color:#7C918D;display:block}
  .lede{font-size:20px;line-height:1.5;color:#5B564C;max-width:33ch;margin-top:26px}
  .lede .grease{color:#A83E30;font-weight:700}
  .count{position:absolute;left:66px;bottom:30px;display:flex;align-items:baseline;gap:16px}
  .count .n{font-family:"Fraunces",serif;font-weight:900;font-size:58px;line-height:1;color:#1C1A16}
  .count .l{font-size:15px;letter-spacing:.24em;text-transform:uppercase;color:#8B8577}
  /* card fan */
  .fan{position:absolute;right:44px;top:96px;width:430px;height:470px}
  .card{position:absolute;display:flex;flex-direction:column;background:#DAD4C7;border:2px solid #1C1A16;box-shadow:0 10px 26px rgba(20,16,10,.22)}
  .card-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;font-size:14px;letter-spacing:.08em;flex:none}
  .card-id{color:#A83E30;font-weight:700}
  .card-shelf{color:#1C1A16;letter-spacing:.18em}
  .card-face{flex:1;min-height:0;overflow:hidden;display:flex;align-items:flex-start;justify-content:center}
  .card-face img{width:100%;height:100%;object-fit:cover;object-position:center 20%}
  .card-1{width:250px;height:300px;top:0;right:150px;transform:rotate(-9deg)}
  .card-2{width:250px;height:300px;top:64px;right:96px;transform:rotate(-3deg)}
  .card-front{width:290px;height:360px;top:130px;right:0;transform:rotate(4deg);background:#E4DFD5}
</style></head>
<body>
  <div class="field">
    <div class="kicker"><span>A Field Index</span><span class="no">No.01</span></div>
    <h1><span class="under">UNDER</span><span class="cast">CAST</span></h1>
    <p class="lede">The performers you've watched for hours and would walk past on the street. One rule for entry, and it isn't fame: <span class="grease">someone designed a face for them.</span></p>
  </div>
  <div class="fan">
    ${card("UC-001", "STAR TREK", "card-1")}
    ${card("UC-067", "X-MEN", "card-2")}
    ${card("UC-008", "LOTR", "card-front")}
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
  await page.waitForTimeout(150); // let the last glyphs paint
  await page.screenshot({ path: "og.png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log(`built og.png — ${count.toLocaleString("en-US")} specimens on file`);
} finally {
  await browser.close();
}
