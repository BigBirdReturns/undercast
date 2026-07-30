# Card-backfill cohort operation

The card-backfill lane is a mass-production evidence system. Its unit of execution is a cohort of shape-equivalent missing-media obligations, not one card.

## What the serial lane proved

The first forty permanent packets established the law that must survive scaling:

1. A source URL and a file hash do not prove that an image shows the filed person or role.
2. Actor, character, production, chronology, maker credit, source publication, selected bytes, and visual judgment are separate claim types.
3. The selected image never proves its own attribution.
4. Existing opposite-side media stays immutable while a missing facet is researched.
5. Candidate bytes are screened against the complete canonical media hash set.
6. Renders are deterministic and preserve a full-source inset as well as the card crop.
7. Failures stop before canonical mutation and remain receipted.
8. Canonical acceptance is separate from evidence publication.
9. A complete repository gate is required before a permanent publication batch.

Those are durable invariants. Card-specific selectors, scope extractors, transport scripts, Base64 materializers, renderers, apply scripts, and workflows were implementation accidents.

## Frozen campaign

`.github/CARD-BACKFILL-COHORT.json` freezes the live selector-defined campaign observed on July 29, 2026:

```text
completed evidence packets:       40
open source-declared absences:    432
selector-defined estate:          472
completion:                      8.47%
```

The freeze intentionally preserves the live selector's packet-per-record completion rule. It is a lower bound, not a claim that every weak asset, replacement candidate, unindexed role, unbuilt IP estate, or canonical-acceptance candidate is represented.

A campaign run refuses silent denominator drift. A changed denominator requires an explicit new freeze or an explicit diagnostic override; it is never absorbed accidentally.

## One-pass planning

Run:

```bash
npm run card-backfill:cohort -- plan \
  --control .github/CARD-BACKFILL-COHORT.json \
  --out .card-backfill-cohort
```

The planner performs one canonical read and emits:

- `estate.json`: every open selector obligation, canonical snapshots, classifications, and a deterministic estate hash;
- `cohorts.json`: shape-equivalent source/evidence/render families and their counts;
- `quarantine.json`: genuine exceptions that cannot enter routine production;
- `scopes/`: one independent per-obligation scope receipt for the complete denominator;
- `batch.json`: 20–50 obligations from one ready cohort, defaulting to forty;
- `batch-scopes/`: batch-bound copies of the selected scope receipts;
- `retrieval-plan.json` and `retrieval-facets.txt`: exact inputs for the existing candidate-only rolling media crawler.

The cohort key includes facet, performance mode, source route, evidence tier, and render profile. The planner does not mix unlike source or adjudication shapes merely to fill a quota.

## Candidate production

The cohort workflow reuses the existing rolling-media worktree isolation:

1. the permanent checkout remains untouched;
2. only the exact selected `record/side` facets are cleared in a detached candidate worktree;
3. `retrieve.mjs` receives the facet allowlist and cannot opportunistically fill an unselected opposite side;
4. the existing report compares baseline and candidate worktrees;
5. the packetizer screens all candidate bytes against canonical media, renders deterministically, and creates one receipt directory per record;
6. failures and unsuitable results enter the batch quarantine without stopping unrelated obligations;
7. one contact sheet and one batch result cover the cohort.

Candidate production never writes canonical facts.

## Independent visual adjudication

Discovery cannot approve its own result. A second desk may be a qualified machine or person; it is not a requirement for an unspecified future rescuer. It must independently decide both claims required by `docs/MEDIA-AUDIT.md`:

- exact filed identity;
- correct presentation (`character-depiction` or `neutral-human`).

Ambiguity is quarantined. A failed item does not invalidate the rest of the cohort.

## Permanent publication

Record independent decisions in one batch-bound file, then run:

```bash
npm run card-backfill:cohort:adjudicate -- \
  --candidates card-backfill-cohort-packets \
  --decisions decisions.json \
  --out card-backfill-cohort-adjudicated

npm run card-backfill:cohort:materialize -- \
  --input card-backfill-cohort-adjudicated \
  --destination data/review/card-backfill
```

The decision file identifies the adjudicator as a machine or person, proves independence from discovery, and covers every pending candidate exactly once. Acceptance requires `identity = expected`, the exact facet presentation value, and a written reason. Discovery failures and rejected candidates remain in the batch quarantine.

Only accepted packets are materialized under `data/review/card-backfill/<record>/`. The materializer refuses overwrites and refuses a permanent batch outside twenty to fifty accepted packets. It also writes one batch receipt under `data/review/card-backfill/batches/`.

The complete repository gate then runs once against the exact permanent batch. Per-card manifests, checksums, scopes, source receipts, duplicate scans, render contracts, and adjudication receipts remain independently inspectable. No card receives its own workflow or apply program.

Canonical website acceptance remains a separate transaction on the current canonical head.

## Throughput contract

The lane is designed around the following fixed-cost allocation:

```text
selector freeze       once per campaign
scope extraction      once for the full denominator
source machinery      once per source family
render machinery      once for every cohort
visual review          one contact sheet per cohort
permanent apply        once per 20–50 packets
repository gate        once per permanent batch
receipts               still per card
```

Rigor stays local to the claim. Ceremony is amortized across the batch.

## First live cohort: source-family failure, not forty card failures

Workflow run `30513656297` exercised the complete forty-obligation lane at commit `a5220bb8d249ad5bb318b79eb55af2676cfd7cc2`. Planning, all four ten-card shards, packet custody, quarantine, and the complete repository gate passed. Candidate yield was zero: every selected portrait remained absent and all forty obligations were quarantined as `no-new-candidate` without canonical mutation.

The run exposed one shared defect in the inherited portrait retriever. It enumerated page images weakly, swallowed transport failures, and reported each record as “illustrated” because its pre-existing still was truthy even though the selected portrait facet remained absent. The durable receipt is `.github/card-backfill/cohort-runs/30513656297.json`.

The promoted repair is `scripts/card-backfill-wikimedia-portraits.mjs`. For the `performer-reference-crawl` portrait family it now:

- resolves the exact filed canonical Wikipedia page rather than searching by an unbounded name;
- requests the lead page image and Wikidata item in one typed API call;
- falls back to the filed entity's Wikidata `P18` image claim;
- resolves local or Commons image metadata, dimensions, authorship, license, and description-page origin;
- tries bounded media transports in a deterministic order;
- records every HTTP status, content type, byte count, digest, response excerpt, timeout, and validation failure per obligation;
- emits the same candidate/report contract consumed by the cohort merger;
- never mutates canonical data and never treats the opposite facet as completion.

This is the intended economics: one forty-card run found one source-family defect, and one shared repair replaces forty bespoke retries.
