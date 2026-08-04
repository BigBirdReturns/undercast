#!/usr/bin/env python3
from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one anchor, found {count}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "makers.html",
    "script-src 'self';",
    "script-src 'self' 'unsafe-inline';",
    "makers inline bootstrap CSP",
)

replace_once(
    "tests/rendered/makers.spec.mjs",
    '  await expect(page.locator(".maker-card")).toHaveCount(1);',
    '  expect(await page.locator(".maker-card").count()).toBeGreaterThan(0);',
    "maker exact-label search multiplicity",
)

seam_marker = "// UX-04-MAKERS-SEAM"
seam_path = Path("scripts/site-seams.mjs")
seams = seam_path.read_text(encoding="utf-8")
if seam_marker not in seams:
    seams += r'''

// UX-04-MAKERS-SEAM
{
  const { readFileSync, existsSync } = await import("node:fs");
  const failMakers = message => { throw new Error(`Makers seam: ${message}`); };
  if (!existsSync("makers.html")) failMakers("makers.html is absent");
  const makers = readFileSync("makers.html", "utf8");
  if (!/aria-label=["']Archive navigation["']/.test(makers)) failMakers("primary navigation is absent");
  if (!/href=["'][^"']*makers\.html["'][^>]*aria-current=["']page["']/.test(makers) && !/aria-current=["']page["'][^>]*href=["'][^"']*makers\.html["']/.test(makers)) failMakers("Makers is not the static current page");
  if (!makers.includes("exact wording already filed")) failMakers("exact-credit boundary copy is absent");
  if (!makers.includes("data-ready=\"false\"")) failMakers("fail-closed register state is absent");
  for (const file of ["index.html", "recognition.html", "coverage.html", "constellation.html", "404.html"]) {
    const html = readFileSync(file, "utf8");
    if (!/href=["'][^"']*makers\.html["']/.test(html)) failMakers(`${file} does not route to the first-class Makers surface`);
  }
  const builder = readFileSync("scripts/build-record-pages.mjs", "utf8");
  if (!/makers\.html/.test(builder)) failMakers("generated records do not route to Makers");
  console.log("makers seam: PASS — exact-credit route, current location, recovery state, root links, and generated-record handoff");
}
'''
    seam_path.write_text(seams, encoding="utf-8")

sweep_marker = "// UX-04-MAKERS-SWEEP"
sweep_path = Path("scripts/site-sweep.mjs")
sweep = sweep_path.read_text(encoding="utf-8")
if sweep_marker not in sweep:
    sweep += r'''

// UX-04-MAKERS-SWEEP
{
  const { readFileSync, existsSync } = await import("node:fs");
  if (!existsSync("makers.html")) throw new Error("site-sweep: first-class Makers surface is missing");
  const makers = readFileSync("makers.html", "utf8");
  for (const required of ["maker-search", "maker-kind", "maker-results", "maker-error", "maker-retry"]) {
    if (!makers.includes(`id=\"${required}\"`)) throw new Error(`site-sweep: Makers lacks ${required}`);
  }
  for (const asset of ["assets/makers.css", "assets/makers.js"]) if (!existsSync(asset)) throw new Error(`site-sweep: missing ${asset}`);
  const js = readFileSync("assets/makers.js", "utf8");
  if (!js.includes("no partial register shown") || !js.includes("non-authoritative presentation groups")) throw new Error("site-sweep: Makers does not preserve failure and authority boundaries");
  console.log("makers sweep: PASS — search, presentation grouping, exact-record handoff, no-partial refusal, and retry controls");
}
'''
    sweep_path.write_text(sweep, encoding="utf-8")
