# UX readiness and parallel corpus work

UX work is a presentation and interaction lane. It may proceed beside one corpus cycle when the changed paths and semantic authority are disjoint.

## Authority split

The corpus lane owns canonical records, source identity, media rulings, coverage, queue state, cycle receipts, and derived corpus projections. The UX lane owns public layout, navigation, state continuity, responsive behavior, accessibility, failure recovery, and rendered compatibility evidence.

UX tests may read canonical data. They may not create a second canonical dataset or reinterpret an unresolved source, maker credit, media absence, or performer-role identity.

## Test tiers

`npm run test:rendered` remains the required fast gate. It runs the complete established desktop Chromium suite plus the core narrow-mobile UX journeys.

`npm run test:ux:chromium` runs the core journeys in desktop and mobile Chromium.

`npm run test:ux` runs the same bounded journeys in:

- desktop Chromium;
- desktop Firefox;
- desktop WebKit;
- mobile Chromium;
- mobile WebKit.

The compatibility suite is intentionally smaller than the canonical rendered suite. It tests user outcomes and engine compatibility without multiplying every corpus assertion across five browsers.

## First protected journey

The wall carries its exact query, shelf, decade, species, maker, face-or-voice lens, sort, selected record, loaded-page depth, and remembered position into Recognition. Recognition exposes a same-origin, index-only `Back to your wall` control. Related-record navigation retains that original return target. External or non-wall return values are ignored.

Browser Back remains supported. The explicit return control is an additional recovery route, not a replacement for browser history.

## Remaining UX-01 work

The next bounded harness product should add deterministic screenshot baselines for stable root and representative record states, then add failure-injection coverage for slow index, failed graph, failed shard, and offline image delivery across the compatibility projects.

## System preference custody

Without an explicit saved choice, the shared theme follows the operating-system color preference and responds to later preference changes. Once a reader chooses a theme, that explicit choice persists across root surfaces and takes precedence over subsequent system changes.
