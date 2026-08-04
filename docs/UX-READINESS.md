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

## UX-02 — deterministic visual and recovery contracts

UX-02 adds a test-owned visual contract without changing corpus, source, media, queue, lease, or public-record authority.

The deterministic Chromium baseline covers five root surfaces:

- wall
- Recognition
- Coverage
- Constellation
- not-found recovery

It also pins four distinct permanent-record states through `tests/rendered/fixtures/visual-records.json`:

- complete portrait and still
- exactly one present media facet
- voice-only performance
- both media facets honestly absent

Root screenshots mask corpus-variable result regions so ordinary evidence growth does not become visual churn. Permanent-record fixtures remain exact IDs and fail closed when an ID disappears or no longer satisfies its declared state.

The recovery matrix injects and proves:

- manifest/index failure with canonical-specimen fallback
- simultaneous index and canonical fallback failure, followed by in-page retry
- shard failure with zero partial filtered results, followed by retry
- constellation graph failure with an honest unavailable state, followed by reload recovery
- offline cited-image fallback, followed by successful reload

The complete repository gate retains the established desktop Chromium suite, runs the mobile Chromium UX and recovery journeys, and then checks the committed visual baselines. The full compatibility command runs the behavioral journeys across desktop Chromium, Firefox, and WebKit plus mobile Chromium and mobile WebKit.

```text
npm run test:visual
npm run test:visual:update
npm run test:ux
npm run gate
```

Snapshot updates are product changes: they require an explicit diff, the exact fixture-state contract, and the complete gate. They are never regenerated as an unreviewed side effect.

## UX-02A — navigation continuity without promoting Connections

UX-02A normalizes the existing archive navigation while preserving DEC-0009. Browse, Recognition Loop, Coverage, Makers, and About remain the permanent primary destinations. Connections stays contextual: Recognition retains its record-local control, and the secondary archive map retains Evidence paths without promoting it into top navigation.

Every root page and generated live or retired permanent record loads one shared navigation controller. At narrow widths JavaScript progressively enhances the complete link set into an explicit disclosure with `aria-expanded`, 44-pixel-plus targets, link-close behavior, and Escape-key focus recovery. With JavaScript disabled the full existing navigation remains visible. Static `aria-current` values identify the current primary page or containing archive section without depending on script execution.

Generated permanent-record pages remain disposable outputs. Qualification counts them from canonical live and tombstone records, validates every generated page, records a byte manifest, regenerates, and requires exact manifest replay; they are not misrepresented as committed product paths.
