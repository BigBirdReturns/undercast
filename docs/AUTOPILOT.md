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

## Existing-wall exact-subject baseline

The certified queue does not get to outrun the media debt already on the wall.
Scopes configured in `data/MEDIA-AUDIT-SCOPES.json` with
`block_new_autopilot_leases_until_complete` run `media:audit gate` before both
`next` and `claim`. For Star Trek, every available still and portrait is bound to
its asset SHA-256 and reviewed through independent `identity` and `presentation`
claims. One machine vote never establishes identity; disputed and wrong assets
remain visible in the tracker until replaced, nulled, or resolved. See
`docs/MEDIA-AUDIT.md`.

This gate blocks new roster leases only. It does not block media correction,
independent review, source refresh, or completion of already merged work.

## Rolling operating waterline

The exact-subject baseline is a starting waterline, not a one-time unlock. Read
`docs/WATERLINE.md`. Before `claim` or `next`, Autopilot also verifies that the
requested batch is within capacity, no earlier cycle is active or unreceipted, no
high/critical incident is open, preservation remains independently verified, and the
current media baseline has zero debt. After a lease changes the wall, the next lease
waits for media catch-up and a reviewed cycle receipt.

Waterline receipts prepare evidence for `star-trek-gold-shard` and
`operational-reliability`. They do not edit roadmap milestone state.

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
- `data/WATERLINE.json`, `data/WATERLINE-STATE.json`, and
  `data/journal/waterline.jsonl` — one-cycle-at-a-time capacity, reviewed cycle,
  drill, metric, accounting, and incident evidence.
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
7. **Operate bounded cycles.** The waterline authorizes one lease. Draft, merge,
   retrieve, validate, reconcile, return the full scope to zero exact-subject debt,
   and record a reviewed completed/aborted cycle receipt before another lease. The
   scheduled Autopilot workflow refreshes at most one certified, due scope per run
   and refuses to refresh while that scope has work in flight.
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

npm run waterline -- validate
npm run waterline -- status --scope star-trek

npm run autopilot -- readiness
npm run autopilot -- readiness --scope star-trek --require-active
npm run autopilot -- candidates --scope star-trek \
  --capability-profile text-vision --limit 20
npm run autopilot -- certify --scope star-trek \
  --reviewed-by second-desk --activate
npm run autopilot -- pause --scope star-trek \
  --paused-by second-desk --reason "producer semantics changed"
npm run autopilot -- refresh --scope star-trek \
  --refreshed-by undercast-bot
npm run autopilot -- refresh --due --refreshed-by undercast-bot

npm run autopilot -- sync
npm run autopilot -- status --scope star-trek
npm run autopilot -- next --agent luna --scope star-trek \
  --capability-profile text-vision --limit 8 \
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

`next` is the safe worker operation after the current roadmap playbook authorizes
roster growth: it runs `scripts/validate.mjs`, re-checks scope certification and
snapshot readiness, syncs all current evidence, and leases only when the rolling
waterline is green. `claim` skips the archive gate but does **not** bypass
certification, the media baseline, or the waterline. Both require one explicit
`--scope`; one lease cannot span independently reviewed producers.

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

## Capability-aware selection

Read `docs/AUTOPILOT-CAPABILITIES.md`. Every lease requires an active, reviewed
capability profile. The selector filters incompatible queued tasks before applying
the existing deterministic priority order; skipped work remains queued with its
priority and attempt count unchanged. The capability policy SHA-256, profile,
requirements, and selection basis are persisted in both the lease state and batch.
A stale exact-task override is fail-closed until reviewed again. Capability is an
operating constraint, never an eligibility disposition.


## Second-shard first-pilot bootstrap

A newly active, independently certified scope normally has no canonical media baseline because its first accepted record has not yet been adopted. Such a scope may declare `initial_pilot.allow_without_media_baseline: true` in `data/WATERLINE.json`, with an explicit `max_tasks` no greater than the ordinary cycle capacity. This exception is legal only before the scope has any lease event or cycle receipt. It authorizes one bounded research lease, never a canonical write.

The first lease closes the exception immediately. Global one-cycle custody then blocks every scope from issuing another lease while any task is active and after terminal task handling until that exact lease has a durable reviewed waterline receipt. Receipt matching, state uniqueness, and duplicate refusal are exact on both `scope_id` and `lease_id`. A receipt from another scope with a colliding lease identifier cannot release custody, but it may coexist with the later exact receipt for the required scope; only a duplicate of the same scope-and-lease composite is refused. The pilot must proceed through submission or explicit blocking, canonical adoption where applicable, exact-subject media review or honest absence, and the reviewed cycle receipt before any scope can claim more work.


## Doctor Who first-pilot cycle

Doctor Who's first active cycle is receipted by `data/review/adapter-sdk/doctor-who-pilot-cycle-001.json`. The exact Dan Starkey voice task resolves to one canonical `Doctor Who` record with both media facets honestly absent. The content-addressed reviewed cycle is `cycle_93fcbfd214892eaf81d55fa3`; its release authority is bound to workflow run `30775406860`, job `91569879972`, artifact `8841923422` and digest, workflow-free product `bbbc407054b72c3a8af20557c8a5261a6321105f`, merge commit `546cce8f8f64ec481a41d91a643e4ded943b653f`, and the persisted-lease restart chain. Run `npm run doctor-who:pilot-cycle:check` to reject placeholders, mismatched journal custody, missing exact transaction references, or any second lease at the first-cycle review boundary. The permanent media receipt binds the exact two `UC-1345` absent facets, not the hash of the mutable sitewide audit, so unrelated reviewed votes cannot reopen the completed Doctor Who cycle.

## Star Trek rolling cycle — Enwright

The bounded James Doohan–Enwright cycle is receipted by `data/review/star-trek-enwright-cycle.json`. The preserved queue hint said `physical-prosthetic`, but the exact source establishes an unseen off-screen voice; the cycle therefore files only the voice performance, claims no body or makeup, duplicates no James Doohan portrait, and closes both media facets as honest absence. Its reviewed waterline receipt is `cycle_9cdab3104f46a978639c5051`; run `npm run star-trek:enwright-cycle:check` to recompute the exact persisted lease, source revision, modality correction, canonical record, media facets, queue transition, content-addressed cycle and journal identities, and claim/completion publication custody.

## Doctor Who cycle 002 — Gredd

The second bounded Doctor Who cycle is receipted by `data/review/adapter-sdk/doctor-who-cycle-002-gredd.json`. It claims exactly one source-preserved task for Dan Starkey as Gredd, files the exact voice role from *Starlight Robbery*, retains a reviewed source-credited Dan Starkey portrait derivative while keeping the Gredd still honestly absent, preserves the 316-role denominator, and leaves 314 obligations queued. Its reviewed waterline receipt is `cycle_66e8ad8054130ed137cbf984`; run `npm run doctor-who:cycle-002:check` to recompute the exact claim, source revision, canonical record, media facets, content-addressed cycle and journal identities, workflow artifact custody, and the historical no-third-lease boundary.

## Doctor Who cycle 003 — Jask

The third bounded Doctor Who cycle is receipted by `data/review/adapter-sdk/doctor-who-cycle-003-jask.json`. It claims exactly one source-preserved task for Dan Starkey as Jask in *The End of Time*, adjudicates the queued unresolved mode as a physical prosthetic performance, adopts an independently sourced Gage Skidmore portrait solely for performer identity while keeping the exact Jask still honestly absent, preserves the 316-role denominator, and leaves 313 obligations queued. Its reviewed waterline receipt is `cycle_d329cc10b79ec2e1edf1a42d`; run `npm run doctor-who:cycle-003:check` to recompute the exact claim, source revision, physical canonical record, media facets, content-addressed cycle and journal identities, workflow and portrait-preparation artifact custody, and the historical no-fourth-lease boundary.

## Doctor Who cycle 004 — Jask audio

The fourth bounded Doctor Who cycle is receipted by `data/review/adapter-sdk/doctor-who-cycle-004-jask-audio.json`. It claims exactly one source-preserved task for Dan Starkey as Jask in *The Sontaran Ordeal*, adjudicates the queued unresolved mode as a voice performance, adopts an independently sourced Steve Cranston portrait solely for performer identity while keeping the exact Jask still honestly absent, preserves the 316-role denominator, and leaves 312 obligations queued. Its reviewed waterline receipt is `cycle_341356246d968c63327c8b92`; run `npm run doctor-who:cycle-004:check` to recompute the exact claim, source revision, voice canonical record, media facets, content-addressed cycle and journal identities, workflow and portrait-preparation artifact custody, and the historical no-fifth-lease boundary.

## Doctor Who cycle 005 — Kaarsh

The fifth bounded Doctor Who cycle is receipted by `data/review/adapter-sdk/doctor-who-cycle-005-kaarsh.json`. It claims exactly one source-preserved voice task for Dan Starkey as Kaarsh in the 2011 Adventure Game *The Gunpowder Plot*, adopts the exact revision-bound `Kaarsh.jpg` as independently reviewed character evidence, keeps the portrait facet honestly absent rather than duplicating an existing Dan Starkey portrait, preserves the 316-role denominator, and leaves 311 obligations queued. It also records `data/review/adapter-sdk/doctor-who-cycle-004-still-correction-composability.json`: the cycle-004 still-correction receipt and correction-time queue bytes remain immutable at their merge, while the permanent checker accepts later completed cycles and still rejects a reopened Jask task, active work, denominator drift, and missing or duplicate cycle-004 claims. Its reviewed waterline receipt is `cycle_77498692970990f4ee98405e`; run `npm run doctor-who:cycle-005:check` to recompute the exact claim, source revision, canonical voice record, media facets, content-addressed cycle and journal identities, workflow and still-verification artifact custody, checker transition, and the historical no-sixth-lease boundary.

## Doctor Who cycle 006 — Kayste

The sixth bounded Doctor Who cycle is receipted by `data/review/adapter-sdk/doctor-who-cycle-006-kayste.json`. It claims exactly one source-preserved voice task for Dan Starkey as Kayste in the 2015 Big Finish audio drama *Terror of the Sontarans*, adopts an independently licensed Dan Starkey portrait only as performer identity evidence, leaves the Kayste character still honestly absent, preserves the 316-role denominator, binds the completed cycle-005 receipt, and leaves 310 obligations queued. The permanent checker preserves the published cycle-004 still-correction composability receipt rather than rewriting it, accepts later completed cycles, and still rejects a reopened Jask task, active work, denominator drift, and missing or duplicate cycle-004 claims. Its reviewed waterline receipt is `cycle_4ee0abebffec084feda08162`; run `npm run doctor-who:cycle-006:check` to recompute the exact claim, source revision, canonical voice record, media facets, content-addressed cycle and journal identities, workflow and artifact custody, historical receipts, and the no-seventh-lease boundary.

## Doctor Who cycle 007 — Kragar

The seventh bounded Doctor Who cycle is receipted by `data/review/adapter-sdk/doctor-who-cycle-007-kragar.json`. It claims exactly one source-preserved unresolved-mode task for Dan Starkey as Kragar in the 2021 television story *The Halloween Apocalypse*, adjudicates the performance as physical-prosthetic under notably different Sontaran make-up, adopts the exact reviewed `Hologram Kragar.jpg` only as character evidence, keeps the performer-portrait facet honestly absent, preserves the 316-role denominator and exact cycle-006 custody, and leaves 309 obligations queued. Its reviewed waterline receipt is `cycle_540222fb1378fa680a43d080`; run `npm run doctor-who:cycle-007:check` to recompute the exact claim, source revision, canonical face record, media facets, content-addressed cycle and journal identities, workflow and review-artifact custody, prior cycle-006 receipt/checker and chronology custody, deterministic post-claim/pre-review acceptance, and the no-eighth-lease boundary.
