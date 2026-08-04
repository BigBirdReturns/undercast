#!/usr/bin/env python3
from pathlib import Path
import subprocess

PRODUCT_SHA = "4fe485057180d3b3947bc5c70c5241ae21e5a106"
PRODUCT_PATHS = [
    "404.html",
    "assets/site-navigation.js",
    "assets/site-shell.css",
    "constellation.html",
    "coverage.html",
    "data/archive.json",
    "docs/UX-READINESS.md",
    "index.html",
    "recognition.html",
    "scripts/build-record-pages.mjs",
    "scripts/site-seams.mjs",
    "tests/rendered/site.spec.mjs",
    "tests/rendered/ux-journeys.spec.mjs",
]

# Restore the exact fully-qualified UX product onto current main. The transport
# branch is a descendant of PRODUCT_SHA, so these objects are available without
# copying any workflow or carrier file into the permanent result.
for relative in PRODUCT_PATHS:
    payload = subprocess.check_output(["git", "show", f"{PRODUCT_SHA}:{relative}"])
    path = Path(relative)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)

# The collection-only policy correctly requires an explicit owner decision for
# protected public surfaces. Add one bounded decision; do not edit or supersede
# the existing contextual-Connections rule.
decisions_path = Path("docs/DECISIONS.md")
decisions = decisions_path.read_text()
if "## DEC-0015" in decisions:
    raise SystemExit("DEC-0015 already exists; refuse duplicate decision numbering")

decision = r'''
## DEC-0015 — Compact navigation and current-location semantics are part of the frozen product contract

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
Coverage, Makers and About remain the permanent primary destinations.
Connections and Constellations remain contextual or secondary under DEC-0009. The
correction adds no reveal mechanic, specimen field, schema concept, account layer,
service, corpus interpretation or aesthetic system, and it does not reopen general
product development under DEC-0012.
'''.strip()

decisions_path.write_text(decisions.rstrip() + "\n\n---\n\n" + decision + "\n")

# Bind the implementation note to its explicit constitutional authority.
readiness_path = Path("docs/UX-READINESS.md")
readiness = readiness_path.read_text()
needle = "## UX-02A — navigation continuity without promoting Connections\n"
if readiness.count(needle) != 1:
    raise SystemExit("UX-02A readiness heading changed")
replacement = needle + "\nThis bounded product implements DEC-0015 while preserving DEC-0009 and DEC-0012.\n"
readiness_path.write_text(readiness.replace(needle, replacement, 1))
