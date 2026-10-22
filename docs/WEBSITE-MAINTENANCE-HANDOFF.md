# Website maintenance handoff

## 2026-10-22: visible evidence and first retirement batch

The current product correction is PR #976, based on merged media correction
#975. It exposes exact-image review separately from claim references, repairs
card clipping and focus, restores DEC-0013 light-first theme behavior, publishes
`og.png`, supplies correction/rights intake, pauses five daily schedules and
removes the obsolete privileged DEC-0016 transaction. Product commit:
`3b649191d689a835df8ba744187438285639b799`; attached visual review:
`data/review/visible-evidence-20261022/README.md`.

The first reviewed retirement batch removes 331 Clifford Number research,
schema, script and fixture files, plus nine workflows explicitly named retired.
The dependency scan found no live website or gate dependency on those files;
the only live textual reference was a publication-denial fixture, whose synthetic
private path is now project-neutral. The whole canonical gate remains the
acceptance boundary. No specimen, claim, image binding or historical cycle receipt
is deleted or re-adjudicated. Actual performers and characters named Clifford
remain in the corpus. Nothing in the separate Clifford Number project is changed.

The first cleanup gate exposed a separate local runtime defect: npm 9.2.0
`ci --dry-run` deleted the installed browser-test dependencies. The same real
command reproduced the deletion in a disposable probe. The existing lockfile
step now checks exact copied manifests in a temporary directory; real-npm
fixtures cover dependency preservation and invalid-lock refusal. No gate step is
skipped and no package version is changed.

Seven consumed execution PRs (#965, #964, #956, #955, #954, #953, #948) were
closed without merge on 2026-10-22 with per-PR successor/rejection proof. Their
branches remain retained pending reachability review.

All removed bytes remain recoverable in Git at
`f4d3fd1f4149dfc0f65156531afd870c895dad8a`. Retained cycle receipts are historical
evidence, not authority to restart an old workflow. Current CI, media rejection,
publication and preservation machinery remain. Broader cycle-checker retirement
and unmerged research branches require their own dependency/custody review.

Merge, CI, preservation and live deployment are observed separately; inspect the
current repository and `release.json` instead of treating this handoff as proof.
The older checkpoints below explain lineage, not present operating state.


**Original checkpoint:** 2026-07-25 on `agent/sitewide-truth-maintenance-handoff`

**Current successor:** `agent/estate-consolidation-001` / PR #132

**Replay status:** The ownership boundary and integration law are retained. The original checkpoint counts, generated data, and implementation bytes are historical evidence and must not be treated as current state. Surviving changes are replayed semantically onto current `main` and revalidated there.

## Ownership split

The website-maintenance controller owns:

- the public shell, navigation, accessibility, responsive behavior, and performance;
- canonical builds, rendered-browser checks, routes, recovery, and deployment;
- the sitewide media-audit framework and truthful absence presentation;
- operational reliability, public correction, rights handling, and read-only data interfaces;
- the operating-lessons inventory in [`E-HENTAI-LESSONS-INVENTORY.md`](E-HENTAI-LESSONS-INVENTORY.md).

The card-backfill controller owns:

- one bounded missing still or portrait obligation at a time;
- exact-subject candidate search and source-revision capture;
- local screening and deterministic duplicate checks;
- candidate and evidence packets for canonical review.

The card lane does not own the public shell, navigation, deployment, roadmap, schema, quality floors, audit consensus, or activation and gold decisions. The website lane does not invent media identity or consume unreviewed candidates as canonical facts.

## Historical lineage and current ruling

The historical stack was:

```text
PR #86 / 6c2b52d  Ferengi gold root
8de38f3              reopen false Ferengi portrait gold
1ad8cda              make the canonical gate portable on Windows
6831afd              sitewide truth and bounded website polish
df1bd8d              document the maintenance and backfill lanes
```

PR #87 stated that these objects should be replayed onto the resulting current `main` after the Ferengi transaction was resolved. That instruction now governs the replay. PRs #86 and #87 are not valid as-is merge candidates.

The exact current ruling is retained in:

```text
data/review/estate-debt/COLLECT-001-ROOT-RULING.json
data/review/estate-debt/COLLECT-001-PR87-REPLAY-AUDIT.json
```

## Canonical conflict surface

Card applications legitimately regenerate or modify:

```text
data/specimens.json
data/SOURCES.json
data/MEDIA-AUDIT.json
data/archive.json
data/entities.json
data/quality.json
data/search/
data/shards/
data/species.json
```

Therefore:

1. The card controller returns a bounded evidence packet, never a rewritten website branch.
2. The website controller applies an accepted packet to the current exact head.
3. Deterministic projections are rebuilt once from current canonical sources.
4. The complete gate decides repository acceptance.
5. Gold, merge, deployment, and activation remain separate lifecycle states.

Generated files from an old branch may not be copied into a current branch. Source-level corrections and candidate bytes must first be re-adjudicated against the current record, duplicate denominator, and policy.

## Estate payment rule

A candidate is not payment when it is merely found, packetized, or preserved. An estate-facing obligation is collected only after the relevant object is:

```text
canonically adopted
→ integrated to main
→ deployed where applicable
→ verified on the live object
→ protected against quiet recurrence
```

## Resume boundary

The website-maintenance controller must:

1. inspect current `main` before every replay;
2. preserve historical correction receipts without copying stale generated outputs;
3. reconcile the Ferengi correction before any gold assertion;
4. keep website work and card evidence in their assigned lanes;
5. report merged and deployed state only from current GitHub and live receipts;
6. close a superseded PR only after its surviving objects have exact successor proof.
