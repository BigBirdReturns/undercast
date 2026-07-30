# Card-backfill cohort and staging operation

The card-backfill lane is a mass-production evidence system. Discovery runs in shape-equivalent cohorts. Permanent evidence publication runs from a separate, persistent staging ledger that may combine accepted packets from many discovery cohorts.

The production equation is:

```text
shape-equivalent discovery cohorts
        ↓
independent per-candidate adjudication
        ↓
repository-native accepted-packet staging
        ↓
20–50 accepted packets accumulated across cohorts
        ↓
one evidence-only materialization transaction
        ↓
one complete repository gate
        ↓
one permanent batch commit
```

A low-yield source family can no longer strand two good packets merely because thirty-eight neighbors failed.

## What the serial lane proved

The first forty permanent packets established the law that survives scaling:

1. A source URL and a file hash do not prove that an image shows the filed person or role.
2. Actor, character, production, chronology, maker credit, source publication, selected bytes, and visual judgment are separate claim types.
3. The selected image never proves its own attribution.
4. Existing opposite-side media stays immutable while a missing facet is researched.
5. Candidate and rendered bytes are screened against the complete canonical media hash set.
6. Renders are deterministic and preserve a full-source inset as well as the card crop.
7. Failures stop before canonical mutation and remain receipted.
8. Discovery cannot approve its own result.
9. Canonical website acceptance is separate from evidence publication.
10. A complete repository gate is required before a permanent publication batch.

Those are durable invariants. Card-specific selectors, scope extractors, transport scripts, encoded materializers, renderers, apply programs, workflows, and full gates were implementation accidents.

## Frozen campaign

`.github/CARD-BACKFILL-COHORT.json` freezes the live selector-defined campaign observed on July 29, 2026:

```text
completed evidence packets:       40
open source-declared absences:    432
selector-defined estate:          472
completion:                      8.47%
```

The freeze preserves the live selector's packet-per-record completion rule. It remains a lower bound: weak existing assets, replacement candidates, unindexed roles, unbuilt IP estates, and candidates awaiting canonical website acceptance are not silently included.

The freeze locks campaign membership and the selector total, not the counters at their opening values forever. Permanent publication must move the counters one-for-one: every new permanent packet increases completed by one, decreases open by one, and leaves the 472-item selector total unchanged. Regression, expansion, or a total that no longer closes fails the planner. Staged packets do not move either counter.

## One-pass discovery planning

Run:

```bash
npm run card-backfill:cohort -- plan \
  --control .github/CARD-BACKFILL-COHORT.json \
  --out .card-backfill-cohort
```

The planner emits:

- `estate.json`: every open selector obligation, canonical snapshots, classifications, current permanent progress, and the deterministic estate hash;
- `campaign-progress.json`: initial and current completed/open counters plus the one-for-one progress proof;
- `cohorts.json`: shape-equivalent source, evidence, and render families still available in the current discovery pass;
- `quarantine.json`: genuine exceptions outside routine production;
- `adjudication-attempt-index.json`: every obligation already processed by a retained adjudication receipt;
- `staging-exclusions.json`: accepted staged packets and already adjudicated obligations excluded from routine rediscovery;
- `scopes/`: one independent scope receipt for every open obligation;
- `batch.json`: one selected shape-equivalent discovery cohort;
- `batch-scopes/`: batch-bound selected scope receipts;
- `retrieval-plan.json`, `retrieval-facets.txt`, and shard plans: exact candidate-only discovery inputs.

A discovery cohort remains uniform because source transport, evidence expectations, and rendering benefit from uniformity. Its yield does **not** determine whether accepted packets survive.

By default, the planner excludes two classes without calling either one complete:

- accepted packets already in staging;
- every obligation represented in a retained adjudication-run receipt, including source misses, dimension failures, and visual rejections.

That suppression defines the current coverage pass and prevents the same source-family run from repeatedly paying for the same forty obligations. A retry sweep is explicit and source-policy-aware:

```bash
npm run card-backfill:cohort -- plan --include-attempted ...
```

Staged packets remain excluded even during a retry. The batch digest binds the staging-ledger digest, adjudication-attempt-index digest, exclusion state, and exact selected obligations.

## Candidate production

The cohort workflow:

1. leaves the permanent checkout untouched;
2. clears only exact selected `record/side` facets in isolated worktrees or uses a typed source-family adapter;
3. fans discovery across four deterministic shards;
4. merges results in frozen order;
5. screens candidate bytes against canonical media;
6. renders deterministic candidate and wall simulations;
7. creates one receipt directory per selected record;
8. quarantines failures without stopping unrelated obligations;
9. emits one contact sheet, batch result, and adjudication decision template.

Candidate production never writes canonical facts. It runs the candidate-artifact fixtures and custody checks, not the complete repository gate. The complete gate belongs to permanent publication only.

## Independent adjudication

Discovery cannot approve its own result. A qualified machine or person second desk must decide both claims required by `docs/MEDIA-AUDIT.md`:

- `identity = expected`, established from source-bound evidence rather than appearance;
- the exact presentation value: `character-depiction` for stills or `neutral-human` for portraits.

The candidate artifact contains `decisions-template.json`. Complete it as a repository decision file under:

```text
.github/card-backfill/adjudications/<workflow-run-id>.json
```

The decision file binds the workflow run, artifact name and digest, candidate result digest, campaign, discovery batch, adjudicator, and every pending candidate. Ambiguity or wrong presentation is rejected and remains receipted.

Adjudication no longer enforces a twenty-packet minimum:

```bash
npm run card-backfill:cohort:adjudicate -- \
  --candidates card-backfill-cohort-artifact/final/packets \
  --decisions .github/card-backfill/adjudications/<run>.json \
  --out .card-backfill-adjudicated
```

Two accepted packets are valid output. Zero accepted packets are also valid when all candidates fail independent review.

## Persistent accepted-packet staging

Accepted packets enter `data/review/card-backfill-staging/` immediately:

```bash
npm run card-backfill:staging -- stage \
  --input .card-backfill-adjudicated \
  --root data/review/card-backfill-staging \
  --permanent-root data/review/card-backfill
```

The staging transaction validates every packet before copying it. It verifies:

- accepted independent adjudication;
- exact record and facet identity across scope, source, review, adjudication, and manifest;
- every manifest byte count and SHA-256 digest;
- the packet digest;
- the complete checksum ledger;
- no collision with an existing staged or permanent record;
- canonical mutation remains false.

The staging estate contains:

```text
data/review/card-backfill-staging/
  STAGING.json
  packets/<record>/...
  adjudications/<discovery-batch-sha>.json
  events/<event-sha>.json
  publications/<publication-batch-sha>.json
```

`STAGING.json` is the active accepted-packet inventory. Adjudication receipts and events preserve history. Staged packets are **not** counted as completed evidence packets until permanent materialization succeeds.

The `card-backfill-stage` workflow verifies the exact artifact ID, workflow run, head SHA, name, and artifact digest before download. It then checks campaign, estate, discovery-batch, and result digests, runs adjudication, stages accepted packets, validates the ledger, and commits only staging paths. Reprocessing an identical packet is idempotent; a different packet for the same record fails closed.

The full adjudication receipt is retained even when a run accepts zero packets. That receipt advances the current discovery pass by suppressing already attempted obligations without pretending that they are complete. A staging commit automatically wakes the candidate workflow, which selects the next unattempted priority cohort.

## Cross-cohort publication planning

Inspect staging:

```bash
npm run card-backfill:staging -- status --json
```

Build the next publication plan:

```bash
npm run card-backfill:staging -- plan \
  --root data/review/card-backfill-staging \
  --control .github/CARD-BACKFILL-COHORT.json \
  --out .card-backfill-publication
```

The publication threshold is applied only here:

```text
minimum: 20
 target: 40
maximum: 50
```

When fewer than twenty accepted packets are staged, the plan is a truthful `ready: false` receipt. At twenty or more, the planner selects the oldest accepted packets in deterministic order, up to the target or explicit bounded limit. The selected packets may come from any number of discovery cohorts and discovery workflow runs.

The publication batch digest binds:

- the exact staging-ledger digest;
- every selected obligation;
- every selected packet digest;
- every originating discovery-batch digest;
- every originating cohort key.

## Permanent evidence publication

Materialize the exact ready plan:

```bash
npm run card-backfill:cohort:materialize -- \
  --plan .card-backfill-publication/publication-plan.json \
  --staging data/review/card-backfill-staging \
  --destination data/review/card-backfill
```

The transaction:

1. revalidates the staging ledger and every selected packet;
2. refuses ledger or plan drift;
3. refuses permanent overwrites;
4. copies exactly twenty to fifty packets to `data/review/card-backfill/<record>/`;
5. writes one mixed-batch receipt under `data/review/card-backfill/batches/`;
6. writes the matching staging publication receipt;
7. removes only the selected packet directories from active staging;
8. updates `STAGING.json` in the same worktree transaction;
9. commits both permanent additions and the matching staging removals/receipts atomically.

Then, and only then, the complete repository gate runs once. A failed gate produces no commit or push. The `card-backfill-publication` workflow performs this transaction automatically on a card-backfill branch when staging reaches the publication minimum and refuses to push if the branch head moved.

Canonical website acceptance remains a separate transaction on the current canonical head.

## Fixed-cost allocation

```text
selector membership      once per campaign; counters advance monotonically
scope extraction         once for the full denominator
source machinery         once per source family
discovery fan-out         once per shape-equivalent cohort
render machinery         once per discovery cohort
visual review             one contact sheet per discovery cohort
attempt suppression       once per retained adjudication run in the current pass
accepted storage          once per accepted packet
publication planning      once per staging-ledger state
permanent materialize     once per 20–50 accepted packets
complete repository gate  once per permanent publication batch
receipts                  still per card
```

Rigor stays local to each claim. Ceremony is paid at the frequency where it actually protects something.

## Live evidence behind the reset

Workflow run `30513656297` turned forty apparent card failures into one shared portrait-retriever defect. The exact-page Wikimedia adapter repaired that source family once.

Workflow run `30514452128` produced two source-bound neutral-human portraits from forty voice/animation obligations. Both survive through independent adjudication and staging even though the discovery cohort yielded far fewer than twenty accepted packets.

Workflow run `30514942808` produced two renderable physical/live-action portrait candidates. Independent review rejected both because the visible subjects remained masked wrestlers, which fails the required `neutral-human` presentation. Those are two correct rejections, not two lost production slots.
