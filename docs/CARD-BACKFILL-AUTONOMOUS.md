# Autonomous card-backfill campaign

The card-backfill campaign is not paced by chat turns and it is no longer paced by one branch-writing cohort at a time.

The production architecture is:

```text
one frozen selector estate
        ↓
one machine-validated lessons contract
        ↓
up to four disjoint shape-equivalent batches per wave
        ↓
up to sixteen read-only discovery shards in parallel
        ↓
up to four independent render/adjudication jobs in parallel
        ↓
immutable wave-result artifacts
        ↓
one exact-head reducer owns branch mutation
        ↓
persistent accepted-packet staging
        ↓
one permanent 2–50 packet publication transaction
        ↓
one complete repository gate
        ↓
self-dispatch the next wave
```

## Lessons are executable inheritance

The durable record is `.github/CARD-BACKFILL-LESSONS.json`.

It converts prior work into four connected objects:

1. **Lesson** — the general rule learned from a success, failure, race, false positive, or throughput collapse.
2. **Cultivation mechanism** — the reusable process that makes the rule routine rather than repeatedly decided.
3. **Enforcement guard** — a file assertion or JSON invariant that proves the mechanism still exists.
4. **Policy lineage** — the active source policy must inherit every mandatory lesson introduced at or before its version.

The active policy is:

```text
policy_id:                    card-backfill-policy-v3-wave-1
parent_policy_id:             card-backfill-cohort-v2
version:                      3
revision:                     1
mandatory inherited lessons: 24
lessons contract SHA-256:     bafa82adfc525421f498f5655bf12ba0000d131349fcd72edd03f940d9b78931
```

The validator refuses:

- duplicate or missing lesson identities;
- an active mandatory lesson without machine enforcement;
- a policy that drops a lesson inherited from its parent;
- a policy that omits any mandatory lesson introduced by its version;
- policy-lineage cycles or version regression;
- a runtime policy whose ID, version, revision, inheritance set, or contract digest differs from the registry;
- an enforcement guard whose target file, text, or JSON value is missing.

Run it directly:

```bash
npm run card-backfill:lessons -- validate
```

The canonical repository gate runs the same validator and its adversarial fixtures. A forward move cannot silently forget an earlier judgment and still pass the gate.

## What the first forty serial packets cultivated

The original packet-by-packet intensity established the claim law retained by every later policy:

- actor, character, production, chronology, source publication, selected bytes, and visual presentation remain separate claim types;
- selected bytes never prove their own identity or role;
- discovery cannot approve its own candidate;
- canonical website mutation is separate from evidence discovery and publication;
- source and rendered bytes are screened against the repository-wide media estate;
- deterministic renders preserve proposed framing and complete-source context;
- exceptions remain typed, receipted, and local to one obligation;
- a permanent batch requires the complete repository gate.

The lessons contract preserves those rules. The cohort, staging, wave, and reducer machinery make them cheap.

## What later failures cultivated

The repository also retains negative knowledge as process:

| Observed failure | Durable process |
| --- | --- |
| One custom courtroom per card | Shared cohort, staging, publication, and wave engines |
| A good packet stranded in a low-yield cohort | Cross-cohort persistent staging |
| Chat required to continue | Repository-native self-dispatch |
| Same policy silently replayed the same obligation | Policy-aware attempt index |
| Policy version disappeared from the attempt ledger | Explicit policy ID, version, revision, and lesson digest in every receipt |
| Multi-subject records consumed single-subject slots | Pre-transport composite routing |
| Actor/event photo substituted for character still | Human-event-photo negative class |
| Statue, merchandise, cosplay, or fan art substituted for a role image | Derivative-object negative class |
| A green wrapper hid a failed piped command | `set -euo pipefail` and retained gate output |
| Concurrent branch writers produced stale pushes | Immutable fan-out plus one exact-head reducer |

A source miss or rejection is therefore not “nothing.” It is retained evidence that changes what the next policy is allowed to attempt.

## Parallel wave planning

`scripts/card-backfill-source-v3-wave-plan.mjs` reads:

- the frozen selector estate;
- permanent packet membership;
- active staging;
- the policy-aware attempt index;
- the active runtime policy and lesson-contract digest.

It then selects up to four disjoint shape-equivalent batches, forty obligations each by default. Every obligation appears at most once in a wave.

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

`wave.json` binds:

- selector and source-estate digests;
- staging and attempt-index exclusion state;
- active policy ID, version, and revision;
- the complete inherited lesson-contract digest;
- every batch digest;
- the sorted set of all disjoint selected obligations.

The adversarial wave fixture proves that four 40-obligation batches select 160 unique obligations and that duplicate selection fails closed.

## Immutable discovery and adjudication

The workflow `.github/workflows/card-backfill-source-v2-autonomous.yml` is retained at its historical path but now runs `card-backfill-source-v3-wave-autonomous`.

A default wave creates:

```text
4 batch plans
× 4 discovery shards per batch
= up to 16 read-only discovery jobs
```

Those jobs perform source enumeration, binding, transport, dimension screening, and repository duplicate screening. They upload artifacts and do not write the branch.

The workflow then creates up to four parallel assembly jobs. Each job:

1. merges its exact shard reports in frozen obligation order;
2. renders deterministic evidence packets;
3. calls the independent machine second desk only for candidates that survive typed prescreening;
4. writes an adjudication run and immutable `wave-result.json` artifact;
5. performs no branch mutation.

Discovery breadth therefore no longer conflicts with branch custody.

## One exact-head reducer

`scripts/card-backfill-wave-reduce.mjs` is the only source-wave branch writer.

The reducer:

1. verifies the exact source head and refuses stale reduction;
2. verifies that every expected immutable batch result exists exactly once;
3. verifies wave, batch, policy, and lesson-contract custody;
4. enriches every adjudication receipt with policy and wave identity;
5. stages accepted packets through the existing packet validator;
6. retains zero-acceptance adjudication receipts so misses still advance the policy frontier;
7. copies the independent machine decisions into repository custody;
8. writes one wave-reduction receipt;
9. validates the complete staging ledger;
10. commits the entire wave in one exact-head branch transaction.

The reducer never publishes permanent evidence directly. Permanent publication remains a separate exact-head transaction with the complete repository gate.

## Attempt identity and durable negative knowledge

`scripts/lib/card-backfill-attempt-index.mjs` preserves:

```text
source_policy_id
source_policy_version
source_policy_revision
lessons_contract_sha256
batch and cohort identity
result digest
disposition and typed reason
```

Historical receipts without explicit fields are conservatively classified from their encoded `vN` route. New receipts carry all fields explicitly.

The active planner excludes any obligation already attempted by the same or later policy version. Retrying requires a materially new policy rather than a new chat turn.

## Publication economics

Accepted packets persist across waves and source families. Publication evaluates the staging inventory, not one discovery batch:

```text
minimum: 2
target:  40
maximum: 50
```

At the publication floor, discovery yields. The publisher:

1. binds its plan to the exact branch head;
2. validates staging and every selected packet;
3. materializes one mixed permanent batch;
4. runs the complete repository gate once;
5. commits only if the branch head remains exact;
6. re-arms discovery after publication.

## Stop conditions

A wave stops only for a typed reason:

- no source-policy-v3 work remains;
- the frozen denominator is complete;
- accepted staging is ready for the permanent publisher;
- source, model, custody, reducer, or repository-gate integrity fails;
- a stale branch head makes reduction unsafe.

A miss, rejection, or quarantine does not stop unrelated work. It becomes durable input to the next policy frontier.

## Commands

```bash
npm run card-backfill:lessons -- validate
npm run card-backfill:lessons:fixtures
npm run card-backfill:attempt-index:fixtures
npm run card-backfill:wave:fixtures
npm run card-backfill:wave:plan -- --out .card-backfill-wave
npm run card-backfill:wave:reduce -- --wave <wave.json> --results-root <results> --source-head <sha>
```

The intended operating principle is:

> Decide a novel rule once. Encode it as a lesson. Attach a guard. Add an adversarial fixture. Inherit it into every later policy. Let the system cultivate the result at scale.
