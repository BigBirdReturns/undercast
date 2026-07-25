# Website maintenance handoff

**Recorded:** 2026-07-25
**Checkpoint branch:** `agent/sitewide-truth-maintenance-handoff`
**Stacked base:** `agent/star-trek-ferengi-gold` (`6c2b52d`)
**Status:** implementation and local validation complete; not merged or deployed

## Ownership split

The website-maintenance controller owns:

- the public shell, navigation, accessibility, responsive behavior and performance;
- canonical build, rendered-browser, route, recovery and deployment behavior;
- the sitewide media-audit framework and truthful absence presentation;
- operational reliability, public correction, rights and read-only data-interface work;
- the E-Hentai-derived maintenance inventory in
  [`E-HENTAI-LESSONS-INVENTORY.md`](E-HENTAI-LESSONS-INVENTORY.md).

The card-backfill controller owns:

- one bounded missing still or portrait obligation at a time;
- exact-subject candidate search and source-revision capture;
- local CPU/GPU screening and deterministic duplicate checks;
- Luna candidate generation only when a real validator exists and local floors leave
  residue;
- submission of candidate and evidence artifacts for canonical review.

The card lane does **not** own the public shell, navigation, deployment, roadmap,
schema, quality floors, audit consensus rules or activation/gold decisions. The
website lane does **not** silently invent media identity or consume unreviewed card
candidates as canonical facts.

## Exact handoff lineage

The remote PR #86 branch stopped at:

```text
6c2b52d  Star Trek species gold: seal Ferengi candidate
```

This checkpoint adds, in dependency order:

```text
8de38f3  fix(media): reopen false Ferengi portrait gold
1ad8cda  fix(test): make canonical gate portable on Windows
6831afd  Sitewide truth and bounded website polish
```

`8de38f3` is semantically first: it reopens a false Ferengi portrait-gold state.
Do not merge, deploy or activate Jem'Hadar from `6c2b52d` without reconciling that
repair and rerunning the exact-head gold contract.

The branch is stacked on PR #86 for review visibility. It is not permission to
silently enlarge or merge PR #86. After the Ferengi transaction is resolved, the
website-maintenance commits may be replayed onto the resulting `main` in a fresh
worktree and revalidated there.

## Website checkpoint

The sitewide pass:

- assigns every public media facet to a first-match Star Trek or sitewide audit
  scope;
- removes 61 visually or source-proven wrong active bindings while retaining the
  immutable historical bytes;
- records three correction receipts under `data/review/`;
- renders honest absence instead of a wrong subject;
- reduces the initial wall batch from 120 cards to 30;
- gives each filter group one keyboard Tab stop with arrow, Home and End movement;
- exposes one current-location marker on every public surface;
- keeps the existing information architecture and character-first card flip.

Current media state at the checkpoint:

```text
Star Trek: 880 / 880 complete
  verified 634 · absent 246 · review 0 · attention 0

Sitewide fallback: 472 / 1744 complete
  verified 0 · absent 472 · review 1272 · attention 0
```

The 1,272 sitewide review facets are visible debt, not a website-maintenance
failure and not permission to mass-accept media.

## Validation receipt

The exact combined tree passed:

```text
canonical gate:              PASS — all 25 steps
rendered interaction suite:  PASS — 24 / 24
visual audit:                12 / 12 pages HTTP 200
console errors:              0
page errors:                 0
failed requests:             0
horizontal overflow:         0
```

The full gate was exercised on the intended-change index because the projection
step correctly refuses unstaged generated drift. Gate fixtures and lockfile
consistency passed under the ordinary index; the remaining 23 canonical steps
passed against the exact intended tree. After this checkpoint is committed, the
ordinary command is authoritative:

```powershell
npm.cmd ci
npm.cmd run gate
npm.cmd run media:audit -- status --scope star-trek
npm.cmd run media:audit -- status --scope sitewide
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

1. The card controller returns one small evidence-backed commit or candidate
   packet, never a rewritten website branch.
2. The website controller applies it to the current exact head.
3. Deterministic projections are rebuilt once by the website controller.
4. The canonical gate decides acceptance.
5. Gold, merge, deployment and activation remain separate lifecycle states.

## Local producer evidence

The correction receipts contain the canonical item IDs, preserved asset paths,
SHA-256 values and rulings. Additional contact sheets, VLM screening output,
router rejection receipts and rendered screenshots were producer-local diagnostics
under `S:\Temp` and the Tier-Bench export directory. They are not canonical facts
and are not required to rebuild or serve the site.

If an independent custody review needs those diagnostics, package them separately,
hash the package and attach it as a review artifact. Do not add the multi-megabyte
screenshots to normal repository history merely to make the handoff look complete.

## Resume boundary

The website-maintenance controller should:

1. fetch this checkpoint branch;
2. inspect PR #86 and current `main` before mutation;
3. run the canonical gate on the exact checkpoint;
4. reconcile `8de38f3` before any Ferengi gold or Jem'Hadar action;
5. keep website work and card-backfill candidates in their assigned lanes;
6. report merged and deployed state only from current GitHub and live receipts.
