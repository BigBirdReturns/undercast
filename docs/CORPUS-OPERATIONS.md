# UNDERCAST corpus operations

UNDERCAST v1 is in **collection-only operating mode**. The reader product, archive contract, preservation layer, certified queue, media-audit machinery, and rolling waterline are the platform. The default work is now to make the corpus broader, deeper, more accurate, and more durable—not to keep inventing product surfaces.

The machine-readable authority is `data/CORPUS-OPERATIONS.json`; the estate pipeline is `data/ESTATE-REGISTRY.json`.

## Operator entrypoint

```bash
npm run corpus:ops -- validate
npm run corpus:ops -- status
npm run corpus:ops -- plan
npm run corpus:ops -- next-estate
```

`plan` names the single blocking or mutating operation. Lead harvesting and noncanonical media search may run in parallel because neither can promote a record or image into canonical truth.

## The steady-state loop

```text
known correctness / rights / incident debt
→ repair and receipt it
→ refresh a due certified source scope
→ reconcile the durable queue
→ lease one bounded capability-compatible batch
→ research and merge exact performer-role records
→ retrieve targeted media
→ close exact identity and presentation debt
→ record the reviewed cycle receipt
→ search old absences for better candidate evidence
→ repeat
```

A cycle is not complete because a script exited or a card was added. It is complete only when the task is terminal, every resulting media facet is verified or honestly absent, the canonical gate passes, and the waterline has a reviewed receipt.

## Product freeze

Without an explicit exception or owner decision, repository work must fit one of these classes:

- corpus addition;
- source refresh;
- evidence or media improvement;
- correction or rights response;
- preservation;
- adapter construction or certification;
- security, accessibility, performance, or operations.

The following remain owner decisions: a new reader surface, primary-navigation destination, character→performer reveal mechanic, runtime service, canonical entity type, account/contributor system, or public write interface.

This freeze is not neglect. Correctness, accessibility, performance, preservation, and rights work remain mandatory. The purpose is to stop the archive from repeatedly rebuilding its shell while the collection remains incomplete.

## Three mutation lanes

### 1. Certified corpus growth

Only Autopilot may choose autonomous performer-role work. `nightly.yml` may harvest leads, but it may not call `grow.mjs`, use a model key, or write new specimens. A lead becomes canonical only through a certified scope, bounded lease, evidence-backed submission, canonical merge, exact-subject closure, and reviewed cycle receipt.

### 2. Rolling media improvement

Scheduled media search runs `scripts/media-search.mjs` in an isolated temporary copy of the corpus. It may download candidate bytes and write attempt receipts, but it cannot modify `data/specimens.json`, `data/SOURCES.json`, or canonical `images/`.

Candidate bytes live only in a retained workflow artifact. Promotion requires a hash-bound media-audit campaign with source identity, exact-subject review, presentation review, and the canonical gate. Verified media is never automatically overwritten.

The retry clock is deliberate:

- honestly absent media: retry after 90 days;
- blocked task evidence: retry after 30 days or when its source-change condition becomes true;
- verified media: no automated replacement search.

### 3. Source and estate expansion

An IP estate advances one reviewed stage at a time:

```text
discovered
→ inventory
→ adapter-build
→ adapter-review
→ certified-paused
→ active
→ retired
```

Activation requires all of:

1. documented source model;
2. adapter-specific adversarial fixtures;
3. exact source revisions preserved;
4. regenerated corpus semantically reviewed;
5. current producer certification;
6. baseline media policy defined;
7. explicit activation.

A configuration row is not a certified estate. A performer-only category is not an exact role adapter. A source URL is not subject identity. A source failure is never a zero.

## Estate frontier

Star Trek remains the sole active reference estate. The current registry then prioritizes Doctor Who, Star Wars, Muppets & Henson, Power Rangers, Kaiju, Tokusatsu, Babylon 5, and Farscape according to their actual adapter stage.

`next-estate` reports the highest-priority candidate but cannot authorize it until both `star-trek-gold-shard` and `operational-reliability` have reviewed completion receipts. This lets the repository prepare the adapter SDK and estate inventory now without pretending the dependency frontier has already moved.

Unmapped productions in `data/specimens.json` remain visible inventory. Machines may not infer that two production strings share an IP estate merely because their names look related.

## Automation responsibilities

| Workflow | Allowed effect |
|---|---|
| `autopilot.yml` | refresh one due certified scope, reconcile queue state |
| `nightly.yml` | harvest sourced leads only |
| `retrieve.yml` | search old absences in isolation, upload candidate artifact, record attempts |
| `corpus-operations.yml` | validate and report the current plan; read-only |
| bounded Luna cycle | add or terminally disposition exact leased tasks |
| media-audit campaign | promote, replace, null, or verify exact media with review receipts |

No scheduled workflow may silently bypass these lanes.

## Definition of “as complete as possible”

Completeness is not a fixed card count. For each active estate, every captured source observation must be accounted for as one of:

```text
filed
eligible but unfiled
blocked
excluded
unresolved
retired
```

Every public media facet must be verified or honestly absent. Every absence and blocked item retains a dated retry policy. Every source scope has a refresh cadence and preserved exact revision evidence. The archive can therefore improve forever without pretending that unknown work is complete.

## Canonical enforcement

`npm run gate` executes:

- corpus-operations fixtures;
- media-search fixtures;
- collection-only contract validation;
- current status and plan generation;
- legacy workflow bypass checks;
- all existing archive, Autopilot, media, waterline, preservation, semantic, browser, route, and DS9 gates.

A future change that reintroduces direct nightly growth or canonical scheduled image mutation turns the canonical gate red.
