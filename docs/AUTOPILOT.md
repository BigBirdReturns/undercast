# Autopilot — census debt into durable Luna work

UNDERCAST already knows how to discover credits, verify people, merge drafts,
retrieve images, rebuild projections, and publish. Autopilot supplies the control
plane: every missing performer-role becomes a stable task that can be certified,
leased, decided, retried, resumed, merged, visually closed, and audited without
silently disappearing.

## Relationship to the roadmap

Autopilot is an operational executor, not strategic authority. Before leasing
work, read `docs/FIVE-YEAR-PLAN.md` and run:

```bash
npm run roadmap -- validate
npm run roadmap -- status
npm run roadmap -- next --limit 1
```

The roadmap determines whether roster growth, a new source adapter, contributor
work, an API, a product surface, or another class of work is authorized. Autopilot
determines which exact performer-role Luna may research inside an authorized,
certified scope. A valid queue lease cannot override a blocked roadmap milestone,
missing owner decision, unmet demand trigger, inactive scope, or stale producer
certification.

Roadmap backpressure is intentional. When media review, corrections, producer
certification, rights work, or review capacity is behind, the current milestone
may require drafting to slow or stop even when queueable tasks remain. Autopilot
state and journals may provide milestone evidence, but no Autopilot command may
mark a second-desk or owner milestone complete.

## Boundaries

The queue does not decide eligibility and never writes directly to
`data/specimens.json`. Census producers discover; a reviewer certifies a producer
contract; Luna researches a bounded lease; `grow.mjs --drafts` verifies and
merges; retrieval and the archive gate establish structural readiness; Luna's
post-merge media receipt verifies that the actual still and portrait show the
exact subjects.

A source row that is not safely person-shaped, names a performer without a role,
belongs to a paused scope, comes from an uncertified producer, or loses the
receipts its adapter promises is filed as `attention` rather than handed to a
drafting model.

No repository code can summon an external agent by itself. A Luna runner, coding
session, or scheduler must execute `LUNA.md`. The repository makes that invocation
deterministic and resumable: it emits the packet, owns the lease, rejects partial
or stale responses, reconciles downstream merge receipts, applies backpressure,
and binds completion to the current corpus and source ledger.

## Files

- `data/AUTOPILOT-SCOPES.json` — source/scope registry, refresh command, producer
  files, and producer-specific fixture commands. Every scope ships paused.
- `data/AUTOPILOT-CERTIFICATIONS.json` — reviewed producer-contract receipts.
  A changed producer file or scope contract makes an active declaration
  ineffective until recertified.
- `data/AUTOPILOT.json` — current state, one job per canonical
  `franchise + performer + role` identity.
- `data/journal/autopilot.jsonl` — append-only scope certification/pause,
  creation, lease, decision, reopen, merge, media-verification, resolution, and
  retirement receipts.
- `data/CENSUS-COVERAGE.json` — complete machine input. Autopilot never uses the
  truncated human summary in `CENSUS-GAPS.json` as its queue.
- `data/CENSUS-MANIFEST.json` — pinned source page/revision/content receipts used
  in task fingerprints and scope snapshot readiness.
- `data/drafts.json`, `data/specimens.json`, `data/journal/rejections.jsonl`, and
  `data/SOURCES.json` — downstream facts reconciled back into task state.
- `data/ROADMAP.json` and `data/ROADMAP-STATE.json` — strategic dependency,
  authority, demand-trigger, and completion-receipt contract governing when an
  Autopilot class of work may begin.
- `docs/FIVE-YEAR-PLAN.md` and `docs/ROADMAP-PLAYBOOKS.md` — strategic rationale
  and exact authorized build sequences.
- `.luna/` — local ignored packets and result/review files.

## The promotion sequence

The producer and the worker are separate review lanes. The order is binding:

1. **Producer PR.** Repair or add the census adapter, add adversarial fixtures,
   run the network census, regenerate projections, reconcile named false rows,
   and make the complete archive gate green.
2. **Second-desk review.** Review the producer semantics and regenerated corpus,
   not merely the schema result. Do not certify while the producer PR is still
   under correction.
3. **Merge the producer.** The trusted producer and its current census land on
   `main` first.
4. **Rebase the control plane.** Rebase the Autopilot PR onto that `main`, run its
   fixtures against the actual corpus, and keep every scope paused.
5. **Certify one scope.** The reviewer runs the producer's declared fixtures,
   verifies current manifest receipts, runs the archive gate, pins the exact
   producer/contract digests, and deliberately activates the scope:

   ```bash
   npm run autopilot -- certify --scope star-trek \
     --reviewed-by second-desk --activate
   npm run autopilot -- readiness --scope star-trek --require-active
   npm run autopilot -- sync
   ```

6. **Merge the control plane.** Only then may an external Luna runner request a
   batch with `next`.
7. **Operate bounded cycles.** Draft, merge, retrieve, validate, reconcile, and
   visually close every batch before leasing another. The scheduled Autopilot
   workflow refreshes at most one certified, due scope per run and refuses to
   refresh while that scope has work in flight.
8. **Promote the next show.** A new adapter repeats steps 1–5. Adding a registry
   row alone never authorizes work.

This keeps PR #55-style producer repair, PR #56-style queue machinery, and Luna's
research/media decisions independently reviewable. It also makes a rollback
local: pause a scope without deleting its history.

## Commands

```bash
npm run roadmap -- validate
npm run roadmap -- status
npm run roadmap -- next --limit 1

npm run autopilot -- readiness
npm run autopilot -- readiness --scope star-trek --require-active
npm run autopilot -- certify --scope star-trek \
  --reviewed-by second-desk --activate
npm run autopilot -- pause --scope star-trek \
  --paused-by second-desk --reason "producer semantics changed"
npm run autopilot -- refresh --scope star-trek \
  --refreshed-by undercast-bot
npm run autopilot -- refresh --due --refreshed-by undercast-bot

npm run autopilot -- sync
npm run autopilot -- status --scope star-trek
npm run autopilot -- next --agent luna --scope star-trek --limit 8 \
  --out .luna/batch.json --prompt .luna/PROMPT.md
npm run autopilot -- submit --batch .luna/batch.json --input .luna/results.json
npm run autopilot -- complete --input .luna/media-review.json
npm run autopilot -- requeue --task ap_... --reason "new evidence is available"
npm run autopilot -- validate
npm run autopilot:fixtures
```

`certify` is fail-closed. It runs the scope's declared producer fixtures without a
shell, verifies that the current scope has coverage, enforces required manifest
receipts, runs `scripts/validate.mjs`, and proves the prospective active state
before writing. The certification, optional activation, and journal receipt are
then committed as one rollback-capable file transaction.

`refresh` is also certification-gated. It refuses scopes with leased, drafted, or
merged work; executes the adapter's declared steps without a shell; rebuilds the
deterministic projections; runs the archive gate; re-checks the resulting snapshot;
and atomically reconciles queue plus refresh receipts. `refresh --due` selects at
most one active due scope by priority, keeping a single scheduled run bounded.

`next` is the safe worker operation after the current roadmap playbook authorizes roster growth: it runs `scripts/validate.mjs`, re-checks
scope certification and snapshot readiness, syncs all current evidence, and
leases a batch only when that scope has no prior `leased`, `drafted`, or `merged`
work. `claim` skips the archive gate but does **not** bypass certification. Both
require one explicit `--scope`; one lease cannot span independently reviewed
producers.

Every emitted batch and persisted lease carries a readiness token over the scope,
producer contract, scope-local coverage snapshot, and scope-local manifest
snapshot. `submit` recomputes that token and checks both the state lease and each
task's source fingerprint. A producer edit or same-scope census refresh therefore
invalidates an outstanding packet; an unrelated franchise refresh does not.

## Producer certification

Certification is not a claim that every census row belongs on the wall. It is a
claim that the adapter is currently trustworthy enough to hand exact
performer-role observations to a research worker.

A scope contract names:

- producer files whose bytes define the adapter;
- fixture commands that reproduce known extraction failures;
- the franchise selector and refresh command;
- whether every current coverage source must have a pinned manifest receipt.

The receipt stores the producer SHA-256, contract SHA-256, fixture commands,
reviewer, timestamp, and the current snapshot counts/digests. Later census
refreshes do not require a new human certification when the producer and contract
are unchanged, but they must still pass archive and snapshot readiness. Editing a
producer file or its contract automatically pauses effective leasing until a
reviewer recertifies.

## Identity and evidence

Stable task IDs ignore category duplication while retaining every category and
source as facets. Manifest observations add page IDs, revisions, and content
hashes to the source fingerprint. A new revision at the same URL therefore
reopens a rejected or blocked decision. If a task vanishes from the latest
coverage it becomes `retired`; it is never deleted. If a filed record later
disappears, the task becomes `attention` rather than silently returning to the
queue.

The queue performs a conservative person-shape check before leasing. This is a
backstop, not permission for a weak source adapter. Fictional characters, groups,
pattern names, colors, and other non-performers that survive extraction are a
producer defect. They must be repaired and regenerated before that scope is
certified; they are not a permanent Luna rejection workload. Source failure may
never be represented as zero.

## State machine

The successful path is:

```text
queued -> leased -> drafted -> merged -> resolved
```

`drafted` means a tagged draft is waiting for `grow.mjs` or its receipt. `sync`
closes that feedback loop:

- a still-pending tagged draft remains `drafted`;
- an exact canonical performer-role specimen moves it to `merged` even if census
  coverage has not yet been rebuilt;
- a matching grow rejection becomes `blocked` or `attention` rather than leaving
  the task in permanent drafted limbo;
- a crash after the draft file write but before the state write is recovered from
  `_autopilot` metadata, including the originating lease, readiness token, and
  task source fingerprint;
- a recovered or merged result whose certification/evidence token is stale moves
  to `attention` rather than being laundered into completion.

`merged` is deliberately not complete. `complete` runs the archive gate and
requires one media record per exact wall ID. An available still must be attested
as the exact character; an available portrait as the exact performer; the cited
origins must match `SOURCES.json`; null assets require explicit absence notes.
The receipt stores the current corpus SHA-256 and a review digest before the task
becomes `resolved`.

A lease may instead produce `rejected` or `blocked`. Expired leases return to
`queued`. Unsafe source identity or inactive scope lands in `attention`. Retry
timestamps reopen due blocks; source-revision changes reopen evidence-bound
blocks and rejections.

A batch submission is atomic and complete. It fails if a task is missing,
appears twice, belongs to another lease, changes performer/role identity, has a
stale producer/census token, has a changed source fingerprint, lacks a performance
citation, or uses an unsupported decision. This prevents partial or obsolete
agent output from quietly stranding work.

## Expanding beyond Star Trek

Autopilot is downstream of discovery. A new show/franchise adapter has one
contract: emit exact performer-role rows into `CENSUS-COVERAGE.json` (or add a
`scope_id`), preserve claim-level source URLs and revision receipts, fail closed
on source outages, and ship adversarial fixtures for the source's actual failure
modes. Add the paused scope and refresh adapter to `AUTOPILOT-SCOPES.json`; review
and certify it after a fresh crawl. No worker or state-machine code changes.

“Every show” is an unbounded registry, not a one-time finite promise. New shows
still require trustworthy source adapters. Certified cadence refresh plus scheduled
reconciliation makes new credits and source revisions become work indefinitely,
while explicit certification, `paused`, `attention`, `blocked`, and `retired`
states prevent unsupported or ambiguous material from masquerading as complete.

## Research result document

```json
{
  "version": 1,
  "lease_id": "lease_...",
  "agent": "luna",
  "results": [
    {
      "task_id": "ap_...",
      "decision": "draft",
      "draft": {
        "character": "Brunt",
        "actor": "Jeffrey Combs",
        "production": "Star Trek: Deep Space Nine",
        "universe": "Star Trek",
        "years": "1995–99",
        "designer": "Michael Westmore",
        "transform": 5,
        "kind": "face",
        "knownFor": "...",
        "reveal": "...",
        "references": [
          {
            "claim": "performance",
            "label": "Jeffrey Combs portrayed Brunt",
            "source": "https://memory-alpha.fandom.com/wiki/Brunt"
          }
        ],
        "wiki": "https://en.wikipedia.org/wiki/Jeffrey_Combs"
      }
    },
    {
      "task_id": "ap_...",
      "decision": "blocked",
      "reason": "The production year is not yet supported by a claim-level source.",
      "evidence": [
        {
          "label": "performer-role source",
          "source": "https://example.invalid/role"
        }
      ],
      "until_source_changes": true
    }
  ]
}
```
