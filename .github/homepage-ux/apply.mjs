import { readFile, writeFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const write = (path, value) => writeFile(path, value.endsWith("\n") ? value : `${value}\n`);

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return text.replace(from, to);
}

function replaceAllExact(text, from, to, expected, label) {
  const count = text.split(from).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  return text.split(from).join(to);
}

function appendOnce(text, marker, block, label) {
  if (text.includes(marker)) return text;
  if (!text.endsWith("\n")) text += "\n";
  return `${text}\n${block.trim()}\n`;
}

const themeScript = `(() => {
  "use strict";
  const root = document.documentElement;
  const storageKey = "uc-theme";
  const media = matchMedia("(prefers-color-scheme: dark)");
  root.classList.add("js");

  const storedTheme = () => {
    try {
      const value = localStorage.getItem(storageKey);
      return value === "dark" || value === "light" ? value : null;
    } catch (_) {
      return null;
    }
  };

  const applyTheme = (theme, persist = false) => {
    const dark = theme === "dark";
    root.dataset.theme = dark ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#15120D" : "#E8E3D9");
    for (const button of document.querySelectorAll("[data-theme-toggle]")) {
      button.textContent = dark ? "☀ Light" : "☾ Dark";
      button.setAttribute("aria-pressed", String(dark));
      button.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      button.title = dark ? "Switch to light theme" : "Switch to dark theme";
    }
    if (persist) {
      try { localStorage.setItem(storageKey, dark ? "dark" : "light"); } catch (_) {}
    }
  };

  const initial = storedTheme() || (media.matches ? "dark" : "light");
  applyTheme(initial, false);

  const wire = () => {
    applyTheme(root.dataset.theme || initial, false);
    for (const button of document.querySelectorAll("[data-theme-toggle]")) {
      if (button.dataset.themeWired) continue;
      button.dataset.themeWired = "1";
      button.addEventListener("click", () => applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true));
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire, { once: true });
  else wire();

  media.addEventListener?.("change", (event) => {
    if (!storedTheme()) applyTheme(event.matches ? "dark" : "light", false);
  });
})();`;

const homeCss = `.archive-doors{
  display:grid;
  grid-template-columns:minmax(220px,.72fr) minmax(0,1.28fr);
  gap:clamp(22px,4vw,48px);
  border-top:1.5px solid var(--ink);
  margin-top:32px;
  padding-top:24px;
}
.archive-doors__kicker{font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--grease)}
.archive-doors h2{font-family:"Fraunces",serif;font-size:clamp(28px,3.7vw,46px);font-weight:600;line-height:1;letter-spacing:-.02em;margin:8px 0 0}
.archive-doors__intro{font-family:"Fraunces",serif;font-size:16px;line-height:1.5;color:var(--ink-soft);max-width:35ch;margin:14px 0 0}
.archive-doors__grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.archive-door{
  min-height:190px;
  display:flex;
  flex-direction:column;
  padding:16px;
  border:1px solid var(--line);
  background:var(--plaster-2);
  color:var(--ink);
  text-decoration:none;
  transition:transform .15s ease,background .15s ease,color .15s ease,border-color .15s ease;
}
.archive-door:hover,.archive-door:focus-visible{background:var(--ink);border-color:var(--ink);color:var(--plaster);transform:translateY(-2px);outline:none}
.archive-door__top{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--grease)}
.archive-door:hover .archive-door__top,.archive-door:focus-visible .archive-door__top{color:var(--plaster)}
.archive-door strong{font-family:"Fraunces",serif;font-size:24px;line-height:1.02;font-weight:600;margin-top:22px}
.archive-door p{font-size:11px;line-height:1.55;color:var(--ink-soft);margin:8px 0 18px}
.archive-door:hover p,.archive-door:focus-visible p{color:var(--plaster)}
.archive-door b{margin-top:auto;font-size:9px;letter-spacing:.15em;text-transform:uppercase;font-weight:700}
body.is-directed .archive-doors{display:none}
@media(max-width:820px){.archive-doors{grid-template-columns:1fr}.archive-doors__intro{max-width:60ch}}
@media(max-width:560px){.archive-doors__grid{grid-template-columns:1fr}.archive-door{min-height:164px}}`;

await write("assets/site-theme.js", themeScript);
await write("assets/home-entrypoints.css", homeCss);

let tokens = await read("assets/site-tokens.css");
tokens = appendOnce(tokens, "--absence-image-filter", `
:root{
  --texture-dot:rgba(28,26,22,.055);
  --absence-bg:#D8D0C2;
  --absence-frame:#A6402F;
  --absence-stamp-bg:#1B1915;
  --absence-stamp-fg:#EEE9DF;
  --absence-image-filter:contrast(1.55) saturate(.72) brightness(.84);
}
[data-theme="dark"]{
  --bg:#15120D;
  --paper:#1B1711;
  --ink:#EAE3D4;
  --ink2:#D1C8B5;
  --muted:#B4AA96;
  --rule:#3C352C;
  --rule2:#2B261F;
  --well:#0D0B08;
  --accent:#C96B58;
  --acc:#C96B58;
  --grease:#D16F5B;
  --seam:#90A8A3;
  --ink-soft:#C8BEAC;
  --ink-faint:#AAA08E;
  --line:#4A4237;
  --plaster:#15120D;
  --plaster-2:#1E1912;
  --relief:#2C261D;
  --relief-hi:#3B3328;
  --relief-lo:#0D0B08;
  --serif:#B4AA96;
  --label:#AAA08E;
  --faint:#918772;
  --shell-bg:#15120D;
  --image-filter:contrast(1.08) saturate(.78) brightness(.94);
  --texture-dot:rgba(234,227,212,.065);
  --absence-bg:#241E16;
  --absence-frame:#C96B58;
  --absence-stamp-bg:#EAE3D4;
  --absence-stamp-fg:#15120D;
  --absence-image-filter:contrast(1.58) saturate(.72) brightness(1.2);
}
@media(prefers-color-scheme:dark){
  :root:not([data-theme]){
    --bg:#15120D;--paper:#1B1711;--ink:#EAE3D4;--ink2:#D1C8B5;--muted:#B4AA96;
    --rule:#3C352C;--rule2:#2B261F;--well:#0D0B08;--accent:#C96B58;--acc:#C96B58;
    --grease:#D16F5B;--seam:#90A8A3;--ink-soft:#C8BEAC;--ink-faint:#AAA08E;--line:#4A4237;
    --plaster:#15120D;--plaster-2:#1E1912;--relief:#2C261D;--relief-hi:#3B3328;--relief-lo:#0D0B08;
    --serif:#B4AA96;--label:#AAA08E;--faint:#918772;--shell-bg:#15120D;
    --image-filter:contrast(1.08) saturate(.78) brightness(.94);--texture-dot:rgba(234,227,212,.065);
    --absence-bg:#241E16;--absence-frame:#C96B58;--absence-stamp-bg:#EAE3D4;--absence-stamp-fg:#15120D;
    --absence-image-filter:contrast(1.58) saturate(.72) brightness(1.2);
  }
}`, "site tokens dark theme");
await write("assets/site-tokens.css", tokens);

let shell = await read("assets/site-shell.css");
shell = appendOnce(shell, "Evidence absence must read as an intentional archive state", `
/* Evidence absence must read as an intentional archive state, not a faded disabled card. */
html{color-scheme:light}
[data-theme="dark"]{color-scheme:dark}
@media(prefers-color-scheme:dark){html:not([data-theme]){color-scheme:dark}}
html:not(.js) .requires-js,html:not(.js) .theme-toggle{display:none!important}
.theme-toggle{color:var(--shell-accent,currentColor)!important}
.absence-plate,.record-absence,.uc-absence{background:var(--absence-bg)!important;color:var(--ink);isolation:isolate;overflow:hidden}
.absence-plate{position:relative}
.absence-plate>img,.record-absence>img,.record-absence picture img,.uc-absence img{
  filter:var(--absence-image-filter)!important;
  transform:scale(1.035);
}
.absence-plate>img,.record-absence>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.absence-dark{display:none!important}
[data-theme="dark"] .absence-light{display:none!important}
[data-theme="dark"] .absence-dark{display:block!important}
@media(prefers-color-scheme:dark){
  html:not([data-theme]) .absence-light{display:none!important}
  html:not([data-theme]) .absence-dark{display:block!important}
}
.absence-plate::before,.record-absence::before,.uc-absence-inner::before{
  content:"";
  position:absolute;
  inset:6%;
  z-index:2;
  border:1px solid var(--absence-frame);
  box-shadow:0 0 0 1px color-mix(in srgb,var(--absence-frame) 28%,transparent);
  pointer-events:none;
}
.absence-stamp,.record-absence span,.uc-absence-stamp{
  position:absolute!important;
  z-index:3!important;
  left:50%!important;
  right:auto!important;
  bottom:7%!important;
  width:max-content;
  max-width:calc(100% - 24px);
  transform:translateX(-50%)!important;
  padding:6px 9px!important;
  border:1px solid var(--absence-frame)!important;
  background:var(--absence-stamp-bg)!important;
  color:var(--absence-stamp-fg)!important;
  font-family:var(--sans,Arial,sans-serif)!important;
  font-size:8.5px!important;
  line-height:1.2!important;
  letter-spacing:.16em!important;
  text-align:center!important;
  text-transform:uppercase!important;
  white-space:nowrap;
}
.uc-absence-inner{position:relative}
`, "shared absence treatment");
await write("assets/site-shell.css", shell);

let index = await read("index.html");
index = replaceOnce(index, '<meta name="theme-color" content="#E4DFD5" />', '<meta name="theme-color" id="theme-color" content="#E8E3D9" />', "index theme meta");
index = replaceOnce(index,
  '<link rel="stylesheet" href="./assets/site-tokens.css" />\n<link rel="stylesheet" href="./assets/site-shell.css" />',
  '<script src="./assets/site-theme.js"></script>\n<link rel="stylesheet" href="./assets/site-tokens.css" />\n<link rel="stylesheet" href="./assets/site-shell.css" />\n<link rel="stylesheet" href="./assets/home-entrypoints.css" />',
  "index shared theme assets");
index = replaceOnce(index,
  '  :root{--ink:#1C1A16;--shell-ink:var(--ink);--shell-muted:var(--ink-soft);--shell-accent:var(--grease);--shell-rule:var(--line);}',
  '  :root{--shell-ink:var(--ink);--shell-muted:var(--ink-soft);--shell-accent:var(--grease);--shell-rule:var(--line);}',
  "index token override");
index = replaceOnce(index, 'rgba(28,26,22,.05)', 'var(--texture-dot)', "index texture token");
index = replaceOnce(index,
  '        <a href="#about">About</a>\n',
  '        <a href="#about">About</a>\n        <button class="theme-toggle requires-js" type="button" data-theme-toggle aria-pressed="false">☾ Dark</button>\n',
  "index theme control");
const doorSection = `    </nav>
    <section class="archive-doors" aria-labelledby="archive-doors-title">
      <div>
        <div class="archive-doors__kicker">Choose a trail</div>
        <h2 id="archive-doors-title">Every page answers a different question.</h2>
        <p class="archive-doors__intro">The wall is the catalog. These paths turn it into recognition, an audit, a makers index, and an evidence map.</p>
      </div>
      <div class="archive-doors__grid">
        <a class="archive-door" href="./recognition.html#UC-001"><span class="archive-door__top"><span>01</span><span>Who is under this face?</span></span><strong>Recognition Loop</strong><p>Hold one character and performer together, then follow the same person, maker, species, and method.</p><b>Place one face →</b></a>
        <a class="archive-door" href="./coverage.html"><span class="archive-door__top"><span>02</span><span>What is still missing?</span></span><strong>Coverage &amp; gaps</strong><p>See which performer-role credits have cards, which are filed gaps, and what the sources do not name.</p><b>Audit the gaps →</b></a>
        <a class="archive-door" href="#makers"><span class="archive-door__top"><span>03</span><span>Who built the look?</span></span><strong>The makers</strong><p>Follow makeup artists, sculptors, creature shops, and design teams across every face credited to them.</p><b>Follow the hands →</b></a>
        <a class="archive-door" href="./constellation.html"><span class="archive-door__top"><span>04</span><span>Where does the evidence lead?</span></span><strong>Connections</strong><p>Trace sourced paths from performers to roles, works, franchises, and context without turning context into a card.</p><b>Open the map →</b></a>
      </div>
    </section>
  </div>
</header>

<main class="wrap" id="archive">`;
index = replaceOnce(index,
  '    </nav>\n  </div>\n</header>\n\n<main class="wrap" id="archive">',
  doorSection,
  "index route entry points");
index = replaceOnce(index,
  '  return `<picture class="portrait absence-plate" role="img" aria-label="${esc(aria)}"><source media="(prefers-color-scheme: dark)" srcset="${ABSENCE_PLATES.dark}"><img src="${ABSENCE_PLATES.light}" alt="" aria-hidden="true" loading="lazy"></picture>`;',
  '  return `<span class="portrait absence-plate" role="img" aria-label="${esc(aria)}"><img class="absence-light" src="${ABSENCE_PLATES.light}" alt="" aria-hidden="true" loading="lazy"><img class="absence-dark" src="${ABSENCE_PLATES.dark}" alt="" aria-hidden="true" loading="lazy"><span class="absence-stamp" aria-hidden="true">${esc(what)} not on file</span></span>`;',
  "index absence markup");
await write("index.html", index);

let coverage = await read("coverage.html");
coverage = replaceOnce(coverage,
  '  <meta name="viewport" content="width=device-width,initial-scale=1">',
  '  <meta name="viewport" content="width=device-width,initial-scale=1">\n  <meta name="theme-color" id="theme-color" content="#E8E3D9">',
  "coverage theme meta");
coverage = replaceOnce(coverage,
  '  <link rel="stylesheet" href="assets/site-tokens.css">',
  '  <script src="assets/site-theme.js"></script>\n  <link rel="stylesheet" href="assets/site-tokens.css">',
  "coverage theme script");
coverage = replaceOnce(coverage,
  '<nav class="site-nav" aria-label="Archive navigation"><a href="index.html#archive">Browse</a><a href="recognition.html">Recognition Loop</a><a class="site-primary" href="coverage.html" aria-current="page">Coverage</a><a href="index.html#makers">Makers</a><a href="index.html#about">About</a></nav>',
  '<nav class="site-nav" aria-label="Archive navigation"><a href="index.html#archive">Browse</a><a href="recognition.html">Recognition Loop</a><a class="site-primary" href="coverage.html" aria-current="page">Coverage</a><a href="index.html#makers">Makers</a><a href="index.html#about">About</a><button class="theme-toggle requires-js" type="button" data-theme-toggle aria-pressed="false">☾ Dark</button></nav>',
  "coverage theme control");
await write("coverage.html", coverage);

let coverageCss = await read("assets/coverage.css");
coverageCss = replaceOnce(coverageCss,
  ':root{--paper:#e9e4d8;--ink:#201f1b;--muted:#69655b;--line:#b9b1a2;--red:#b73a29}',
  ':root{--paper:#e9e4d8;--ink:#201f1b;--muted:#69655b;--line:#b9b1a2;--red:#b73a29;--copy:#4f4b43;--pass:#387151;--shell-bg:var(--paper)}',
  "coverage color variables");
coverageCss = replaceAllExact(coverageCss, 'color:#4f4b43', 'color:var(--copy)', 2, "coverage copy colors");
coverageCss = replaceAllExact(coverageCss, '#387151', 'var(--pass)', 2, "coverage pass colors");
coverageCss = appendOnce(coverageCss, '[data-theme="dark"]{--paper:', `
[data-theme="dark"]{--paper:#15120D;--ink:#EAE3D4;--muted:#B4AA96;--line:#3C352C;--red:#C96B58;--copy:#D1C8B5;--pass:#79B797;--shell-bg:#15120D}
@media(prefers-color-scheme:dark){html:not([data-theme]){--paper:#15120D;--ink:#EAE3D4;--muted:#B4AA96;--line:#3C352C;--red:#C96B58;--copy:#D1C8B5;--pass:#79B797;--shell-bg:#15120D}}
`, "coverage dark theme");
await write("assets/coverage.css", coverageCss);

let constellation = await read("constellation.html");
constellation = replaceOnce(constellation,
  '  <meta name="viewport" content="width=device-width,initial-scale=1">',
  '  <meta name="viewport" content="width=device-width,initial-scale=1">\n  <meta name="theme-color" id="theme-color" content="#E8E3D9">',
  "constellation theme meta");
constellation = replaceOnce(constellation,
  '  <link rel="stylesheet" href="assets/site-tokens.css">',
  '  <script src="assets/site-theme.js"></script>\n  <link rel="stylesheet" href="assets/site-tokens.css">',
  "constellation theme script");
constellation = replaceOnce(constellation,
  '<nav class="site-nav" aria-label="Archive navigation"><a href="index.html#archive">Browse</a><a href="recognition.html">Recognition Loop</a><a href="coverage.html">Coverage</a><a href="index.html#makers">Makers</a><a href="index.html#about">About</a></nav>',
  '<nav class="site-nav" aria-label="Archive navigation"><a href="index.html#archive">Browse</a><a href="recognition.html">Recognition Loop</a><a href="coverage.html">Coverage</a><a href="index.html#makers">Makers</a><a href="index.html#about">About</a><button class="theme-toggle requires-js" type="button" data-theme-toggle aria-pressed="false">☾ Dark</button></nav>',
  "constellation theme control");
await write("constellation.html", constellation);

let constellationCss = await read("assets/constellation.css");
constellationCss = replaceOnce(constellationCss,
  '  --paper:#e9e4d8;--ink:#201f1b;--muted:#605b51;--rule:#c9c1b1;\n  --red:#a93023;--night:#1e1f1d;--gold:#b28b43;--white:#f7f3e9;\n  --shell-rule:#c9c1b1;--shell-muted:var(--muted);--shell-ink:#201f1b;--shell-accent:var(--red);',
  '  --paper:#e9e4d8;--ink:#201f1b;--muted:#605b51;--rule:#c9c1b1;\n  --red:#a93023;--night:#1e1f1d;--gold:#b28b43;--white:#f7f3e9;\n  --copy:#514d44;--node-copy:#686256;--person-copy:#aaa598;--person-foot:#d8d0c1;\n  --node-surface:rgba(247,243,233,.56);--node-hover:#f7f3e9;--person-hover:#292a27;--dot:rgba(32,31,27,.08);\n  --shell-rule:#c9c1b1;--shell-muted:var(--muted);--shell-ink:#201f1b;--shell-accent:var(--red);--shell-bg:var(--paper);',
  "constellation variables");
constellationCss = replaceOnce(constellationCss, 'rgba(32,31,27,.08)', 'var(--dot)', "constellation texture");
constellationCss = replaceOnce(constellationCss, 'color:#514d44', 'color:var(--copy)', "constellation intro copy");
constellationCss = replaceOnce(constellationCss, 'background:rgba(247,243,233,.56)', 'background:var(--node-surface)', "constellation node surface");
constellationCss = replaceOnce(constellationCss, 'background:var(--white);transform', 'background:var(--node-hover);transform', "constellation node hover");
constellationCss = replaceOnce(constellationCss, 'color:#686256', 'color:var(--node-copy)', "constellation node copy");
constellationCss = replaceOnce(constellationCss, 'background:#292a27', 'background:var(--person-hover)', "constellation person hover");
constellationCss = replaceOnce(constellationCss, 'color:#aaa598', 'color:var(--person-copy)', "constellation person copy");
constellationCss = replaceOnce(constellationCss, 'color:#d8d0c1', 'color:var(--person-foot)', "constellation person foot");
constellationCss = appendOnce(constellationCss, '[data-theme="dark"]{\n  --paper:', `
[data-theme="dark"]{
  --paper:#15120D;--ink:#EAE3D4;--muted:#B4AA96;--rule:#3C352C;--red:#C96B58;
  --night:#0D0B08;--gold:#D6AD62;--copy:#D1C8B5;--node-copy:#C5BAA7;--person-copy:#BDB3A2;--person-foot:#D8D0C1;
  --node-surface:rgba(36,30,22,.78);--node-hover:#2B241B;--person-hover:#211C15;--dot:rgba(234,227,212,.07);
  --shell-rule:#3C352C;--shell-muted:#B4AA96;--shell-ink:#EAE3D4;--shell-accent:#C96B58;--shell-bg:#15120D;
}
@media(prefers-color-scheme:dark){html:not([data-theme]){
  --paper:#15120D;--ink:#EAE3D4;--muted:#B4AA96;--rule:#3C352C;--red:#C96B58;
  --night:#0D0B08;--gold:#D6AD62;--copy:#D1C8B5;--node-copy:#C5BAA7;--person-copy:#BDB3A2;--person-foot:#D8D0C1;
  --node-surface:rgba(36,30,22,.78);--node-hover:#2B241B;--person-hover:#211C15;--dot:rgba(234,227,212,.07);
  --shell-rule:#3C352C;--shell-muted:#B4AA96;--shell-ink:#EAE3D4;--shell-accent:#C96B58;--shell-bg:#15120D;
}}
`, "constellation dark theme");
await write("assets/constellation.css", constellationCss);

let notFound = await read("404.html");
notFound = replaceOnce(notFound,
  '  <meta name="viewport" content="width=device-width,initial-scale=1">',
  '  <meta name="viewport" content="width=device-width,initial-scale=1">\n  <meta name="theme-color" id="theme-color" content="#E8E3D9">',
  "404 theme meta");
notFound = replaceOnce(notFound,
  '  <link rel="stylesheet" href="/undercast/assets/site-tokens.css">',
  '  <script src="/undercast/assets/site-theme.js"></script>\n  <link rel="stylesheet" href="/undercast/assets/site-tokens.css">',
  "404 theme script");
notFound = replaceOnce(notFound, ':root{--muted:#6e685c;--shell-muted:var(--muted);--shell-bg:var(--bg)}', ':root{--shell-muted:var(--muted);--shell-bg:var(--bg)}', "404 token override");
notFound = replaceOnce(notFound,
  '<nav class="site-nav" aria-label="Archive navigation"><a href="/undercast/index.html#archive">Browse</a><a href="/undercast/recognition.html">Recognition Loop</a><a href="/undercast/coverage.html">Coverage</a><a href="/undercast/index.html#makers">Makers</a><a href="/undercast/index.html#about">About</a></nav>',
  '<nav class="site-nav" aria-label="Archive navigation"><a href="/undercast/index.html#archive">Browse</a><a href="/undercast/recognition.html">Recognition Loop</a><a href="/undercast/coverage.html">Coverage</a><a href="/undercast/index.html#makers">Makers</a><a href="/undercast/index.html#about">About</a><button class="theme-toggle requires-js" type="button" data-theme-toggle aria-pressed="false">☾ Dark</button></nav>',
  "404 theme control");
await write("404.html", notFound);

let recordCss = await read("assets/record-page.css");
recordCss = replaceOnce(recordCss,
  '.record-absence{position:relative;background:var(--bg) url("./placeholder-light-clean.png") center/contain no-repeat;color:var(--ink)}',
  '.record-absence{position:relative;background:var(--absence-bg);color:var(--ink)}',
  "record absence background");
recordCss = replaceOnce(recordCss,
  '.record-absence span{position:absolute;right:12px;bottom:12px;left:12px;padding:8px;background:rgba(232,227,217,.94);border:1px solid var(--rule);font-size:10px;letter-spacing:.14em;text-align:center;text-transform:uppercase}',
  '.record-absence span{position:absolute;right:12px;bottom:12px;left:12px;padding:8px;background:var(--absence-stamp-bg);color:var(--absence-stamp-fg);border:1px solid var(--absence-frame);font-size:10px;letter-spacing:.14em;text-align:center;text-transform:uppercase}',
  "record absence stamp");
await write("assets/record-page.css", recordCss);

let builder = await read("scripts/build-record-pages.mjs");
builder = replaceOnce(builder,
  '  : `<div class="record-absence not-filed" role="img" aria-label="${esc(`${label} image is not on file`)}"><picture><source media="(prefers-color-scheme: dark)" srcset="../../assets/placeholder-dark-clean.png"><img src="../../assets/placeholder-light-clean.png" alt=""></picture><span>Evidence not on file</span></div>`;',
  '  : `<div class="record-absence not-filed" role="img" aria-label="${esc(`${label} image is not on file`)}"><img class="absence-light" src="../../assets/placeholder-light-clean.png" alt="" aria-hidden="true"><img class="absence-dark" src="../../assets/placeholder-dark-clean.png" alt="" aria-hidden="true"><span>${esc(label)} evidence not on file</span></div>`;',
  "record builder absence markup");
builder = replaceAllExact(builder,
  '<link rel="stylesheet" href="../../assets/site-tokens.css"><link rel="stylesheet" href="../../assets/site-shell.css"><link rel="stylesheet" href="../../assets/record-page.css"></head>',
  '<meta name="theme-color" id="theme-color" content="#E8E3D9"><script src="../../assets/site-theme.js"></script><link rel="stylesheet" href="../../assets/site-tokens.css"><link rel="stylesheet" href="../../assets/site-shell.css"><link rel="stylesheet" href="../../assets/record-page.css"></head>',
  3,
  "record builder theme assets");
builder = replaceAllExact(builder,
  '<a href="../../index.html#about">About</a></nav>',
  '<a href="../../index.html#about">About</a><button class="theme-toggle requires-js" type="button" data-theme-toggle aria-pressed="false">☾ Dark</button></nav>',
  3,
  "record builder theme controls");
await write("scripts/build-record-pages.mjs", builder);

let tests = await read("tests/rendered/site.spec.mjs");
tests = appendOnce(tests, 'homepage purpose and theme are explicit', `
test("homepage purpose and theme are explicit across the archive",async({page})=>{
  await open(page,"index.html");
  await waitForWall(page);
  const doors=page.locator(".archive-door");
  await expect(doors).toHaveCount(4);
  await expect(doors.nth(0)).toContainText("Who is under this face?");
  await expect(doors.nth(1)).toContainText("What is still missing?");
  await expect(doors.nth(2)).toContainText("Who built the look?");
  await expect(doors.nth(3)).toContainText("Where does the evidence lead?");
  await expect(doors.nth(0)).toHaveAttribute("href","./recognition.html#UC-001");
  await expect(doors.nth(1)).toHaveAttribute("href","./coverage.html");
  await expect(doors.nth(2)).toHaveAttribute("href","#makers");
  await expect(doors.nth(3)).toHaveAttribute("href","./constellation.html");

  const toggle=page.locator("[data-theme-toggle]");
  await expect(toggle).toHaveText(/Dark/);
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  await expect(toggle).toHaveText(/Light/);

  const missing=await page.evaluate(async()=>{const rows=await fetch("./data/specimens.json").then(r=>r.json());return rows.find(record=>!record.still||!record.portrait).id;});
  await open(page,`index.html#${missing}`);
  const absence=page.locator(`[data-uid="${missing}"] .absence-plate`).first();
  await expect(absence).toBeVisible();
  await expect(absence.locator(".absence-stamp")).toContainText(/not on file/i);
  const treatment=await absence.evaluate(node=>({filter:getComputedStyle(node.querySelector(".absence-dark")).filter,frame:getComputedStyle(node,"::before").borderTopStyle}));
  expect(treatment.filter).not.toBe("none");
  expect(treatment.frame).toBe("solid");

  for(const route of ["coverage.html","constellation.html","404.html","records/UC-040/"]){
    await open(page,route);
    await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
    await expect(page.locator("[data-theme-toggle]")).toHaveText(/Light/);
  }
});
`, "homepage UX regression");
await write("tests/rendered/site.spec.mjs", tests);

console.log("homepage UX pass applied");
