# Card-backfill cohort, wave, staging, and publication operation

The card-backfill lane is a mass-production evidence system. Its durable execution units are deliberately different:

```text
scope unit          one selector obligation
source unit         one shape-equivalent cohort
wave unit           up to four disjoint source batches
review unit         one source-bound candidate
reduction unit      one complete immutable wave
publication unit    one mixed 2–50 packet staging batch
gate unit           one permanent publication transaction
```

This separation preserves per-claim rigor while paying fixed costs only where they protect something.

## Production equation

```text
frozen selector estate
        ↓
policy-aware attempt suppression
        ↓
lesson-bound disjoint wave planning
        ↓
parallel immutable discovery artifacts
        ↓
parallel independent adjudication artifacts
        ↓
one exact-head reducer
        ↓
repository-native accepted-packet staging
        ↓
2–50 accepted packets accumulated across waves and cohorts
        ↓
one evidence-only materialization transaction
        ↓
one complete repository gate
        ↓
one permanent batch commit
```

A low-yield cohort cannot strand a valid packet. A high-volume discovery wave cannot create competing branch writers. A later policy cannot silently forget an earlier lesson.

## What the serial lane proved

The first forty permanent packets established the law that survives scaling:

1. A source URL and file hash do not prove that an image shows the filed person or role.
2. Actor, character, production, chronology, source publication, selected bytes, and visual presentation are separate claim types.
3. The selected image never proves its own attribution.
4. Existing opposite-side media remains immutable while a missing facet is researched.
5. Candidate and rendered bytes are screened against the complete canonical media hash estate.
6. Renders are deterministic and preserve both proposed card framing and complete-source context.
7. Failures stop before canonical mutation and remain typed and receipted.
8. Discovery cannot approve its own result.
9. Canonical website adoption is separate from evidence publication.
10. The complete repository gate is required before a permanent evidence batch.

Those are durable invariants. Card-specific selectors, transports, renderers, apply scripts, workflows, and gates were scaffolding.

## Lessons-as-code

`.github/CARD-BACKFILL-LESSONS.json` is the inheritance registry for the lane.

Each lesson contains:

- a stable `CBL-NNN` identity;
- the observed success or failure that produced it;
- the general rule;
- the cultivation mechanism that makes the rule reusable;
- one or more machine-enforcement guards;
- the policy version in which it became mandatory.

Policies form an explicit lineage. The active policy must contain every mandatory lesson introduced by its own or an earlier version, plus every lesson inherited from its parent. The validator refuses omission, downgrade, cycles, duplicate lessons, digest drift, missing enforcement, and runtime/registry disagreement.

The active contract is:

```text
policy:          card-backfill-policy-v3-wave-1
parent:          card-backfill-cohort-v2
version:         3
revision:        1
mandatory:       24 lessons
contract digest: bafa82adfc525421f498f5655bf12ba0000d131349fcd72edd03f940d9b78931
```

Every forward batch binds that policy identity and contract digest into its batch hash, scope receipts, wave receipt, adjudication receipt, and attempt index.

Validate it:

```bash
npm run card-backfill:lessons -- validate
```

The same validation is a canonical gate step.

## Frozen campaign

`.github/CARD-BACKFILL-COHORT.json` freezes the selector-defined membership observed on July 29, 2026:

```text
completed evidence packets:       40
open source-declared absences:    432
selector-defined estate:          472
completion:                      8.47%
```

Membership and the total remain frozen. Counters may advance only one-for-one through permanent publication:

```text
completed + open = 472
new permanent packet => completed +1, open -1
staged packet => no selector counter change
```

Regression, expansion, or a total that does not close fails planning.

## Source-policy estate

The planner starts from all open selector obligations and then excludes:

- records already represented by permanent packets;
- accepted packets already in staging;
- obligations already attempted by the active or a later policy version;
- multi-subject obligations that require the composite lane;
- obligations outside the active source-policy boundary.

The attempt index preserves policy identity explicitly:

```text
source_policy_id
source_policy_version
source_policy_revision
lessons_contract_sha256
batch digest
cohort key
result digest
final disposition
typed reason
```

A source miss is therefore retained knowledge. It suppresses duplicate work for the current policy without pretending the obligation is complete. A retry requires a new policy experiment.

## Parallel wave planning

Run:

```bash
npm run card-backfill:wave:plan -- \
  --control .github/CARD-BACKFILL-COHORT.json \
  --out .card-backfill-wave \
  --batch-limit 40 \
  --wave-batches 4
```

The planner selects up to four batches. Each batch remains internally shape-equivalent, but the batches may represent different shapes. No obligation may occur twice in one wave.

A default full wave is:

```text
4 disjoint batches
× 40 obligations
= 160 unique obligation slots
```

Each batch is then divided across four retrieval shards:

```text
4 batches
× 4 shards
= up to 16 read-only discovery jobs
```

The planner emits:

```text
wave.json
campaign-progress.json
estate.json
exclusion-state.json
discover-matrix.json
assemble-matrix.json
batches/<batch-sha>/batch.json
batches/<batch-sha>/batch-scopes/*
batches/<batch-sha>/shards/*
```

`wave.json` binds the selector state, source estate, staging and attempt-index exclusions, policy identity, complete lesson digest, batch digests, and exact disjoint obligation set.

## Immutable candidate production

Discovery jobs:

1. check out the exact source head;
2. read one batch shard;
3. enumerate source alternatives through the active source family;
4. apply textual subject, actor-role, production, adaptation, and presentation prescreens;
5. download only bounded candidate alternatives;
6. reject canonical byte duplicates and dimension failures;
7. upload one immutable shard artifact;
8. perform no branch mutation.

The active source prescreen encodes earlier recurring judgments:

- actor pages and human event photographs are not character stills;
- statues, sculpture, merchandise, cosplay, toys, fan art, and similar derivatives are not production role images;
- wrong adaptations do not satisfy the filed production;
- a voice or animation still requires an explicit actor-role-production chain;
- multi-subject filings do not enter the single-subject lane;
- appearance never establishes identity.

A candidate that survives source prescreen is still not accepted.

## Deterministic packet production

Each assembly job merges the exact shard reports for one batch in frozen obligation order and creates one packet directory per obligation.

A packet retains:

```text
scope.json
source-receipt.json
review.json
review.md
selected source bytes, when available
deterministic evidence composite, when eligible
card-crop simulation, when eligible
manifest.json
checksums.sha256
```

Repository-wide duplicate screening covers selected source bytes and rendered outputs. The evidence composite preserves the proposed crop and complete-source context.

Failures receive packet-level quarantine receipts and do not stop unrelated obligations.

## Independent adjudication

Discovery cannot approve its result. The independent machine or person second desk must decide two different claims:

```text
identity     = expected
presentation = character-depiction | neutral-human
```

Identity may pass only through explicit source custody. Appearance is used only for presentation.

The decision file binds:

- source workflow and artifact identity;
- exact source head;
- campaign, estate, cohort, and batch digests;
- model or person identity;
- confidence thresholds;
- prompt, response, and image digests;
- evidence URLs;
- every pending candidate.

Zero acceptances is valid when every candidate fails. The complete adjudication receipt still advances the active policy frontier.

## Immutable wave results

Each parallel assembly job writes `wave-result.json` beside its adjudicated packet tree and machine decisions.

The artifact binds:

```text
source head
wave digest
batch digest and index
policy ID, version, and revision
lesson-contract digest
selected and adjudication counts
paths to adjudicated packets and machine decisions
artifact_only=true
canonical_mutation=false
```

Assembly jobs never write the branch.

## One exact-head reducer

Run locally with suitable artifacts:

```bash
npm run card-backfill:wave:reduce -- \
  --wave .card-backfill-wave/wave.json \
  --results-root .card-backfill-wave-results \
  --source-head <exact-40-character-sha>
```

The reducer is the only source-wave branch writer. It:

1. verifies the source head and refuses stale reduction;
2. requires one and only one result per planned batch;
3. refuses duplicate or unexpected batch results;
4. verifies policy and lesson-contract custody;
5. enriches the adjudication receipts with wave and policy identity;
6. stages accepted packets through the complete packet validator;
7. retains zero-acceptance adjudication receipts;
8. copies independent machine decisions into repository custody;
9. writes one wave-reduction receipt;
10. validates active staging;
11. commits all wave state atomically.

The workflow checks the remote branch head immediately before push. Concurrent discovery is safe because discovery artifacts are immutable; concurrent branch mutation is not permitted.

## Persistent accepted-packet staging

Accepted packets enter:

```text
data/review/card-backfill-staging/
  STAGING.json
  packets/<record>/...
  adjudications/<discovery-batch-sha>.json
  events/<event-sha>.json
  publications/<publication-batch-sha>.json
```

The staging transaction verifies:

- accepted independent adjudication;
- exact record/facet identity across every receipt;
- every manifest byte count and SHA-256 digest;
- packet and checksum-ledger digests;
- no collision with an existing staged or permanent record;
- canonical mutation remains false.

Reprocessing identical bytes is idempotent. A conflicting packet for the same record fails closed.

## Cross-cohort publication planning

Inspect staging:

```bash
npm run card-backfill:staging -- status --json
```

Build a publication plan:

```bash
npm run card-backfill:staging -- plan \
  --root data/review/card-backfill-staging \
  --control .github/CARD-BACKFILL-COHORT.json \
  --out .card-backfill-publication
```

The publication threshold applies only here:

```text
minimum: 2
target:  40
maximum: 50
```

The plan selects the oldest accepted packets in deterministic order. Packets may come from different source policies, cohorts, waves, and workflow runs, provided their custody remains valid.

The publication digest binds the staging-ledger digest, exact obligations and packet digests, originating discovery batches, cohort keys, and estate snapshots.

## Permanent evidence publication

Materialize a ready plan:

```bash
npm run card-backfill:cohort:materialize -- \
  --plan .card-backfill-publication/publication-plan.json \
  --staging data/review/card-backfill-staging \
  --destination data/review/card-backfill
```

The transaction:

1. revalidates staging and every selected packet;
2. refuses ledger or plan drift;
3. refuses permanent overwrites;
4. copies exactly two to fifty packet directories;
5. writes one permanent mixed-batch receipt;
6. writes the matching staging publication receipt;
7. removes only selected packet directories from active staging;
8. updates the staging ledger atomically;
9. runs the complete repository gate once;
10. commits only when the exact planned branch head remains current.

Canonical website adoption remains separate.

## Fixed-cost allocation

```text
selector membership       once per campaign
lesson synthesis          once per novel lesson
lesson enforcement        every gate and every wave
scope extraction          once per selector snapshot
source machinery          once per source family
wave planning             once per disjoint 1–4 batch wave
discovery transport       up to 16 read-only jobs per wave
render/adjudication       up to 4 independent jobs per wave
branch mutation           one reducer commit per wave
accepted storage          once per accepted packet
publication planning      once per staging-ledger state
permanent materialize     once per 2–50 accepted packets
complete repository gate  once per permanent publication batch
receipts                   still per card and per transaction
```

## Adversarial proof surfaces

```bash
npm run card-backfill:lessons:fixtures
npm run card-backfill:attempt-index:fixtures
npm run card-backfill:wave:fixtures
npm run card-backfill:cohort:fixtures
npm run card-backfill:lessons -- validate
npm run gate
```

The fixtures prove that lesson omission, policy downgrade, lineage cycles, digest drift, repeated policy attempts, duplicate wave selection, cross-cohort staging errors, packet custody drift, and stale branch mutation all fail closed.

## Operating rule

The lane should make fewer fresh judgments over time—not by weakening review, but by converting repeated judgment into reusable structure:

```text
observe a case
        ↓
extract the general lesson
        ↓
encode a cultivation mechanism
        ↓
attach an enforcement guard
        ↓
add an adversarial fixture
        ↓
inherit the lesson into the next policy
        ↓
carry the policy and lesson digest in every forward receipt
```

Novel cases still require judgment. Recurring cases become process.
