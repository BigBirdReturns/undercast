#!/usr/bin/env python3
from pathlib import Path
from textwrap import dedent
import subprocess

PRODUCT_SHA = "4fe485057180d3b3947bc5c70c5241ae21e5a106"


def git_show(path: str) -> str:
    return subprocess.check_output(
        ["git", "show", f"{PRODUCT_SHA}:{path}"],
        text=True,
    )


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one anchor, found {count}")
    return text.replace(old, new, 1)


def replace_count(text: str, old: str, new: str, expected: int, label: str) -> str:
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{label}: expected {expected} anchors, found {count}")
    return text.replace(old, new)


# Reuse the already-qualified controller byte-for-byte. All other overlapping
# surfaces are patched semantically on current main so UX-03 remains intact.
Path("assets/site-navigation.js").write_text(git_show("assets/site-navigation.js"))

product_css = git_show("assets/site-shell.css")
css_marker = "/* UX-02A: compact navigation is progressive enhancement."
if css_marker not in product_css:
    raise SystemExit("qualified compact-navigation CSS marker is missing")
compact_css = product_css[product_css.index(css_marker):].rstrip()
css_path = Path("assets/site-shell.css")
css = css_path.read_text()
if css_marker in css:
    raise SystemExit("compact-navigation CSS already exists; refuse duplicate")
css_path.write_text(css.rstrip() + "\n\n" + compact_css + "\n")

script_insertions = {
    "index.html": (
        '<link rel="stylesheet" href="./assets/site-shell.css" />',
        '<script src="./assets/site-navigation.js" defer></script>',
    ),
    "recognition.html": (
        '<link rel="stylesheet" href="./assets/site-shell.css" />',
        '<script src="./assets/site-navigation.js" defer></script>',
    ),
    "coverage.html": (
        '<link rel="stylesheet" href="assets/site-shell.css">',
        '<script src="assets/site-navigation.js" defer></script>',
    ),
    "constellation.html": (
        '<link rel="stylesheet" href="assets/site-shell.css">',
        '<script src="assets/site-navigation.js" defer></script>',
    ),
    "404.html": (
        '<link rel="stylesheet" href="/undercast/assets/site-shell.css">',
        '<script src="/undercast/assets/site-navigation.js" defer></script>',
    ),
}
for filename, (anchor, script) in script_insertions.items():
    path = Path(filename)
    html = path.read_text()
    if script in html:
        raise SystemExit(f"{filename}: shared navigation controller already present")
    html = replace_once(html, anchor, anchor + "\n" + script, f"{filename} navigation controller")
    path.write_text(html)

current_links = {
    "index.html": (
        '<a href="./index.html">The wall</a>',
        '<a href="./index.html" aria-current="page">The wall</a>',
    ),
    "recognition.html": (
        '<a href="./recognition.html">Recognition records</a>',
        '<a href="./recognition.html" aria-current="page">Recognition records</a>',
    ),
    "coverage.html": (
        '<a href="./coverage.html">Coverage &amp; gaps</a>',
        '<a href="./coverage.html" aria-current="page">Coverage &amp; gaps</a>',
    ),
    "constellation.html": (
        '<a href="./constellation.html">Evidence paths</a>',
        '<a href="./constellation.html" aria-current="page">Evidence paths</a>',
    ),
}
for filename, (old, new) in current_links.items():
    path = Path(filename)
    html = path.read_text()
    html = replace_once(html, old, new, f"{filename} archive-map current location")
    path.write_text(html)

# Permanent record templates share the controller and identify Recognition as
# their containing archive section. Retired routes receive the same recovery map.
generator_path = Path("scripts/build-record-pages.mjs")
generator = generator_path.read_text()
generator_shell = '<link rel="stylesheet" href="../../assets/site-shell.css">'
generator = replace_count(
    generator,
    generator_shell,
    generator_shell + '<script src="../../assets/site-navigation.js" defer></script>',
    3,
    "record templates navigation controller",
)
generator = replace_once(
    generator,
    '<a href="../../recognition.html">Recognition records</a>',
    '<a href="../../recognition.html" aria-current="location">Recognition records</a>',
    "live record archive section",
)
record_map = (
    '<nav class="archive-map" aria-label="Archive paths">'
    '<span class="archive-map__label">Archive paths</span>'
    '<a href="../../index.html">The wall</a>'
    '<a href="../../recognition.html" aria-current="location">Recognition records</a>'
    '<a href="../../coverage.html">Coverage &amp; gaps</a>'
    '<a href="../../constellation.html">Evidence paths</a>'
    '<a href="../../data/archive.json">Machine archive</a>'
    '</nav>'
)
generator = replace_count(
    generator,
    '</main></div></body></html>`;',
    '</main></div>' + record_map + '</body></html>`;',
    2,
    "retired record archive maps",
)
generator_path.write_text(generator)

# These files were not touched by UX-03. Preserve the previously qualified
# structural and five-engine navigation contracts exactly.
Path("scripts/site-seams.mjs").write_text(git_show("scripts/site-seams.mjs"))
Path("tests/rendered/ux-journeys.spec.mjs").write_text(
    git_show("tests/rendered/ux-journeys.spec.mjs")
)

# Compose with UX-03's canonical rendered suite instead of replacing it.
site_tests_path = Path("tests/rendered/site.spec.mjs")
site_tests = site_tests_path.read_text()
old_navigation_assertion = '''      const nav=page.getByRole("navigation",{name:"Archive navigation",exact:true});
      await expect(nav).toBeVisible();'''
new_navigation_assertion = '''      const nav=page.getByRole("navigation",{name:"Archive navigation",exact:true});
      if(viewport.width<=700){
        const menu=page.locator(".site-nav-toggle");
        await expect(menu).toBeVisible();
        await expect(menu).toHaveAttribute("aria-expanded","false");
        await menu.click();
        await expect(menu).toHaveAttribute("aria-expanded","true");
      }
      await expect(nav).toBeVisible();'''
site_tests = replace_once(
    site_tests,
    old_navigation_assertion,
    new_navigation_assertion,
    "canonical rendered navigation assertion",
)
site_tests_path.write_text(site_tests)

# Record the composed UX contract without deleting the already-merged UX-03
# documentation or claiming that DEC-0015 authorizes a different mechanism.
readiness_path = Path("docs/UX-READINESS.md")
readiness = readiness_path.read_text()
if "## UX-02A — navigation continuity" in readiness:
    raise SystemExit("UX-02A navigation documentation already exists")
readiness_addition = dedent(r'''
## UX-02A — navigation continuity without promoting Connections

This bounded product implements DEC-0016 while preserving DEC-0009, DEC-0012 and
DEC-0015. Browse, Recognition Loop, Coverage, Makers and About remain the permanent
primary destinations. Connections stays contextual: Recognition retains its
record-local control, and the secondary archive map retains Evidence paths without
promoting it into top navigation.

Every root page and generated live or retired permanent record loads one shared
navigation controller. At narrow widths JavaScript progressively enhances the
complete link set into an explicit disclosure with `aria-expanded`, 44-pixel-plus
targets, link-close behavior and Escape-key focus recovery. With JavaScript disabled
the full existing navigation remains visible. Static `aria-current` values identify
the current primary page or containing archive section without depending on script
execution.

Generated permanent-record pages remain disposable outputs. Qualification counts
them from canonical live and tombstone records, validates every generated page,
records a byte manifest, regenerates and requires exact manifest replay; they are
not misrepresented as committed product paths.
''').strip()
readiness_path.write_text(readiness.rstrip() + "\n\n" + readiness_addition + "\n")

# Collection-only custody requires a distinct owner decision. DEC-0015 remains
# the active authority for dense mobile evidence and is not edited or reused.
decisions_path = Path("docs/DECISIONS.md")
decisions = decisions_path.read_text()
if "## DEC-0016" in decisions:
    raise SystemExit("DEC-0016 already exists; refuse duplicate decision numbering")
decision = dedent(r'''
## DEC-0016 — Compact archive navigation is progressive enhancement, not a new destination

**Status:** Active · Ratified by owner direction in issue #242, implemented by #255, 2026-08-04

DEC-0012 remains the default operating rule. This decision authorizes one bounded,
corpus-disjoint wayfinding correction under the UX finishing program in issue #242:

- Every root surface and generated live or retired permanent record may use one
  shared navigation controller for progressive enhancement only.
- At compact widths, the complete existing primary navigation may become an
  explicit disclosure with accurate expanded state, keyboard Escape recovery,
  focus return, link-close behavior and touch-sized targets.
- With JavaScript disabled, the complete existing primary navigation remains
  visible and usable; script failure must not erase an archive destination.
- Primary navigation and the secondary archive map identify the current page or
  containing archive section with static semantics that remain truthful without
  JavaScript.
- Generated permanent-record pages remain deterministic disposable outputs. They
  must be rebuilt and verified, but they do not become a second committed corpus
  or navigation authority.

This decision does **not** add a public destination. Browse, Recognition Loop,
Coverage, Makers and About remain the permanent primary destinations. Connections
and Constellations remain contextual or secondary under DEC-0009. DEC-0015 remains
the authority for dense mobile evidence; this decision neither supersedes it nor
changes its disclosure contracts. The correction adds no reveal mechanic, specimen
field, schema concept, account layer, service, corpus interpretation or aesthetic
system, and it does not reopen general product development under DEC-0012.
''').strip()
decisions_path.write_text(decisions.rstrip() + "\n\n---\n\n" + decision + "\n")
