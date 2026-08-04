#!/usr/bin/env python3
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


# Root pages already have one primary-navigation page marker. Their secondary
# archive maps identify the containing archive location without claiming a
# second current page. Constellation has no primary destination and therefore
# keeps the page marker in the secondary map.
for filename, old, new in [
    ("index.html", '<a href="./index.html" aria-current="page">The wall</a>', '<a href="./index.html" aria-current="location">The wall</a>'),
    ("recognition.html", '<a href="./recognition.html" aria-current="page">Recognition records</a>', '<a href="./recognition.html" aria-current="location">Recognition records</a>'),
    ("coverage.html", '<a href="./coverage.html" aria-current="page">Coverage &amp; gaps</a>', '<a href="./coverage.html" aria-current="location">Coverage &amp; gaps</a>'),
]:
    path = Path(filename)
    path.write_text(replace_once(path.read_text(), old, new, f"{filename} archive current location"))

css_path = Path("assets/site-shell.css")
css = css_path.read_text()
style = r'''
/* UX-02A: the secondary archive map exposes a visible current location without
   claiming a second current page on surfaces whose primary navigation already
   owns aria-current="page". */
.archive-map [aria-current]{
  border-color:var(--shell-accent,var(--grease));
  font-weight:700;
  text-decoration:underline;
  text-decoration-thickness:2px;
  text-underline-offset:4px;
}
'''.strip()
if ".archive-map [aria-current]" in css:
    raise SystemExit("archive-map current-location style already exists")
css_path.write_text(css.rstrip() + "\n\n" + style + "\n")

seams_path = Path("scripts/site-seams.mjs")
seams = seams_path.read_text()
seams = replace_once(
    seams,
    '''const archiveCurrent = {
  "index.html": "The wall",
  "recognition.html": "Recognition records",
  "coverage.html": "Coverage &amp; gaps",
  "constellation.html": "Evidence paths",
  "404.html": ""
};
for (const [path, label] of Object.entries(archiveCurrent)) {
  const map = files[path].match(/<nav[^>]*class="[^"]*\\barchive-map\\b[^"]*"[^>]*>[\\s\\S]*?<\\/nav>/)?.[0] || "";
  expect(Boolean(map), `${path}: secondary archive map is missing`);
  if (label) expect(map.includes(`aria-current="page">${label}</a>`), `${path}: archive map does not identify ${label} as current`);
  else expect(!/aria-current=/.test(map), `${path}: recovery map invents a current archive section`);
}''',
    '''const archiveCurrent = {
  "index.html": {label:"The wall", value:"location"},
  "recognition.html": {label:"Recognition records", value:"location"},
  "coverage.html": {label:"Coverage &amp; gaps", value:"location"},
  "constellation.html": {label:"Evidence paths", value:"page"},
  "404.html": null
};
for (const [path, current] of Object.entries(archiveCurrent)) {
  const map = files[path].match(/<nav[^>]*class="[^"]*\\barchive-map\\b[^"]*"[^>]*>[\\s\\S]*?<\\/nav>/)?.[0] || "";
  expect(Boolean(map), `${path}: secondary archive map is missing`);
  if (current) expect(map.includes(`aria-current="${current.value}">${current.label}</a>`), `${path}: archive map does not identify ${current.label} as current ${current.value}`);
  else expect(!/aria-current=/.test(map), `${path}: recovery map invents a current archive section`);
}''',
    "archive-map page-versus-location semantics",
)
seams = replace_once(
    seams,
    'expect(has("assets/site-shell.css", /min-height:44px/), "navigation: compact targets are below the required size");',
    'expect(has("assets/site-shell.css", /min-height:44px/), "navigation: compact targets are below the required size");\nexpect(has("assets/site-shell.css", /\\.archive-map \\[aria-current\\][\\s\\S]{0,260}text-decoration:underline/), "navigation: archive-map current location is not visibly styled");',
    "visible archive-current seam",
)
seams_path.write_text(seams)

site_path = Path("tests/rendered/site.spec.mjs")
site = site_path.read_text()
site = replace_once(
    site,
    '''  const surfaces=[
    {path:"index.html",ready:"#result-status",align:".controls",current:1},
    {path:"recognition.html#UC-001",ready:"#record-title",align:".uc-record",current:1},
    {path:"coverage.html",ready:"#rows tr",align:".eyebrow",current:1},
    {path:"constellation.html",ready:".person-row",align:".hero",current:0},
    {path:"records/UC-001/",ready:"#record-main",align:".record-meta",current:1},
    {path:"404.html",ready:"#recovery",align:".kicker",current:0}
  ];''',
    '''  const surfaces=[
    {path:"index.html",ready:"#result-status",align:".controls",current:1,pageCurrent:1,archiveCurrent:{label:"The wall",value:"location"}},
    {path:"recognition.html#UC-001",ready:"#record-title",align:".uc-record",current:1,pageCurrent:1,archiveCurrent:{label:"Recognition records",value:"location"}},
    {path:"coverage.html",ready:"#rows tr",align:".eyebrow",current:1,pageCurrent:1,archiveCurrent:{label:"Coverage & gaps",value:"location"}},
    {path:"constellation.html",ready:".person-row",align:".hero",current:0,pageCurrent:1,archiveCurrent:{label:"Evidence paths",value:"page"}},
    {path:"records/UC-001/",ready:"#record-main",align:".record-meta",current:1,pageCurrent:1,archiveCurrent:{label:"Recognition records",value:"location"}},
    {path:"404.html",ready:"#recovery",align:".kicker",current:0,pageCurrent:0,archiveCurrent:null}
  ];''',
    "navigation current-location fixtures",
)
site = replace_once(
    site,
    '''      await expect(nav.locator('[aria-current="page"]')).toHaveCount(surface.current);''',
    '''      await expect(nav.locator('[aria-current="page"]')).toHaveCount(surface.current);
      await expect(page.locator('[aria-current="page"]')).toHaveCount(surface.pageCurrent);
      const archiveMap=page.getByRole("navigation",{name:"Archive paths",exact:true});
      if(surface.archiveCurrent){
        const archiveCurrent=archiveMap.locator(`[aria-current="${surface.archiveCurrent.value}"]`);
        await expect(archiveCurrent).toHaveCount(1);
        await expect(archiveCurrent).toHaveText(surface.archiveCurrent.label);
        await expect(archiveCurrent).toHaveCSS("text-decoration-line","underline");
      }else{
        await expect(archiveMap.locator("[aria-current]")).toHaveCount(0);
      }''',
    "single page-current and visible archive-current assertions",
)
site_path.write_text(site)

readiness_path = Path("docs/UX-READINESS.md")
readiness = readiness_path.read_text()
readiness = replace_once(
    readiness,
    '''the full existing navigation remains visible. Static `aria-current` values identify
the current primary page or containing archive section without depending on script
execution.''',
    '''the full existing navigation remains visible. Exactly one `aria-current="page"`
marker identifies the current page. The secondary archive map uses
`aria-current="location"` for its containing section when primary navigation already
owns the page state, and every archive-map current marker is visibly underlined
without depending on script execution.''',
    "UX readiness current-location contract",
)
readiness_path.write_text(readiness)
