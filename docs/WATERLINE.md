# Rolling gold waterline

A complete exact-subject baseline is not permission for unlimited growth. It is
permission for **one bounded operating cycle**.

Every newly merged card creates new identity and presentation claims. Therefore a
scope stays gold only if the system repeatedly returns to the same waterline:

```text
complete baseline
→ one bounded lease
→ research and canonical merge
→ retrieval and exact-subject review
→ zero media debt again
→ reviewed cycle receipt
→ next bounded lease
```

The waterline joins the two roadmap lanes that become ready after
`trusted-foundation`:

- `star-trek-gold-shard` supplies the three restart-safe Luna cycles, complete
  exact-subject media state, and durable task accounting;
- `operational-reliability` supplies restore/rollback drills, measured operating
  baselines, SLO targets, and incident stops.

It prepares evidence. It does **not** edit `data/ROADMAP-STATE.json`, close a
second-desk milestone, or infer an owner decision.

## Current state

```bash
npm run waterline -- validate
npm run waterline -- status --scope star-trek
npm run waterline -- status --scope star-trek --json
```

The phase is derived from current facts:

- `baseline-review` — the initial exact-subject baseline has open debt;
- `ready-for-cycle` — baseline complete, no work in flight, every prior lease
  receipted;
- `cycle-in-flight` — leased, drafted, or merged work exists;
- `media-catch-up` — a cycle has changed the wall and media debt is open;
- `receipt-required` — the lease is terminal and the media baseline is complete,
  but no reviewed cycle receipt exists;
- `incident-stop` — a high or critical incident is open.

## Claim boundary

Autopilot calls the waterline before every `claim` or `next`. For Star Trek the
current capacity is eight tasks. A claim is refused when any of these are true:

- `trusted-foundation` is not complete;
- the preservation history guard is not independently verified;
- the exact-subject media baseline is missing or has debt;
- another cycle is in flight;
- a prior lease has no reviewed completed/aborted receipt;
- a high or critical incident is open;
- the requested batch exceeds the configured capacity.

`--allow-inflight` does not bypass this control plane.

## Cycle receipts

Autopilot emits one `lease.claimed` journal event per task. The waterline groups
those immutable task events by lease. After the lease is terminal, create a
reviewed input:

```json
{
  "version": 1,
  "scope_id": "star-trek",
  "lease_id": "lease_...",
  "outcome": "completed",
  "reviewed_by": "second-desk-handle",
  "reviewed_role": "second-desk",
  "reviewed_at": "2026-08-01T12:00:00Z",
  "note": "The lease resumed from durable state and returned the wall to zero media debt.",
  "evidence": [
    { "type": "workflow-run", "value": "<successful canonical gate run>" },
    { "type": "commit", "value": "<merged cycle commit>" },
    { "type": "restart-proof", "value": "<durable resume evidence>" }
  ]
}
```

Record it only after all tasks are terminal and the current media baseline is
complete:

```bash
npm run waterline -- record-cycle --input .waterline/cycle.json
```

A successful cycle requires at least one task to reach `resolved`. A lease that
expires, is abandoned, or is intentionally stopped is still accounted for with
`outcome: "aborted"` and an `incident` evidence receipt; it does not count toward
the three successful gold-shard cycles.

## Durable accounting

The gold shard also needs one current reviewed accounting receipt over every
collapsed Autopilot task:

```json
{
  "scope_id": "star-trek",
  "counts": {
    "eligible": 0,
    "filed": 0,
    "blocked": 0,
    "excluded": 0,
    "unresolved": 0
  },
  "reviewed_by": "second-desk-handle",
  "reviewed_role": "second-desk",
  "reviewed_at": "2026-08-01T12:00:00Z",
  "note": "Counts reconcile exactly to the current durable task denominator.",
  "evidence": [
    { "type": "report", "value": "<accounting report path or snapshot id>" },
    { "type": "workflow-run", "value": "<validation run>" }
  ]
}
```

```bash
npm run waterline -- record-accounting --input .waterline/accounting.json
```

The five counts must sum exactly to the current scope task count. The receipt is
stale automatically when the current task set or task states change.

## Reliability evidence

The current required drills are:

- `repository-restore` — restore a fresh checkout/snapshot into a functioning
  archive and verify the canonical gate;
- `publication-rollback` — publish a deliberately bad candidate to an isolated
  target, roll back to the known-good release, and verify the live contract.

```bash
npm run waterline -- record-drill --input .waterline/drill.json
npm run waterline -- record-metrics --input .waterline/metrics.json
npm run waterline -- record-incident --input .waterline/incident.json
```

Metrics stay `null` until measured. Current operating targets are:

- build duration p95 no more than 20 minutes;
- source-freshness p95 no more than 14 days;
- rights-response SLA no more than 14 days;
- cost per verified record must be measured, but no unsupported target is
  invented.

High and critical incidents stop new leases until a later `closed` event for the
same incident ID is recorded. Any operator or machine may open a stop; closing or
downgrading a high/critical incident requires `recorded_role: "second-desk"` or
`"owner"`, keeps the original severity, and leaves independent evidence.

## Natural unlocks

When the waterline has evidence for both current ready milestones—without marking
them complete—it reports the next dependency frontier:

```text
adapter-sdk-and-second-gold-shard
public-trust-and-corrections
```

Those milestones become authorized only after reviewed roadmap completion
receipts for `star-trek-gold-shard` and `operational-reliability` land. The
waterline reports evidence readiness; it never performs that governance action.
