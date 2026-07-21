# Autopilot — census debt into durable Luna work

UNDERCAST already knows how to discover credits, verify people, merge drafts,
retrieve images, rebuild projections, and publish. Autopilot supplies the control
plane: every missing performer-role becomes a stable task that can be leased,
decided, retried, resumed, merged, visually closed, and audited without silently
disappearing.

## Boundaries

The queue does not decide eligibility and never writes directly to
`data/specimens.json`. Census producers discover; Luna researches a bounded
lease; `grow.mjs --drafts` verifies and merges; retrieval and the archive gate
establish structural readiness; Luna's post-merge media receipt verifies that the
actual still and portrait show the exact subjects. A source row that is not safely
person-shaped, names a performer without a role, or belongs to an inactive scope
is filed as `attention` rather than handed to a drafting model.

No repository code can summon an external agent by itself. A Luna runner, coding
session, or scheduler must execute `LUNA.md`. The repository makes that invocation
deterministic and resumable: it emits the packet, owns the lease, rejects partial
responses, reconciles downstream merge receipts, applies backpressure, and binds
completion to the current corpus and source ledger.

## Files

- `data/AUTOPILOT-SCOPES.json` — source/scope registry. Star Trek is first
  priority; the worker state machine is source-agnostic.
- `data/AUTOPILOT.json` — current state, one job per canonical
  `franchise + performer + role` identity.
- `data/journal/autopilot.jsonl` — append-only creation, lease, decision, reopen,
  merge, media-verification, resolution, and retirement receipts.
- `data/CENSUS-COVERAGE.json` — complete machine input. Autopilot never uses the
  truncated human summary in `CENSUS-GAPS.json` as its queue.
- `data/CENSUS-MANIFEST.json` — pinned source page/revision/content receipts used
  in task fingerprints when present.
- `data/drafts.json`, `data/specimens.json`, `data/journal/rejections.jsonl`, and
  `data/SOURCES.json` — downstream facts reconciled back into task state.
- `.luna/` — local ignored packets and result/review files.

## Commands

```bash
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

`next` is the safe high-level operation: it runs `scripts/validate.mjs`, syncs
all current evidence, and leases a batch only when that scope has no prior
`leased`, `drafted`, or `merged` work. `claim` is the lower-level primitive; its
`--allow-inflight` switch exists for deliberate parallel orchestration, not the
normal Luna loop.

## Identity and evidence

Stable task IDs ignore category duplication while retaining every category and
source as facets. Manifest observations add page IDs, revisions, and content
hashes to the source fingerprint. A new revision at the same URL therefore
reopens a rejected or blocked decision. If a task vanishes from the latest
coverage it becomes `retired`; it is never deleted. If a filed record later
disappears, the task becomes `attention` rather than silently returning to the
queue.

The queue performs a conservative person-shape check before leasing. This is a
backstop, not permission for a weak source adapter: fictional characters, groups,
and other non-performers that survive extraction still require correction or an
evidence-backed Luna rejection. Source failure may never be represented as zero.

## State machine

The successful path is:

```text
queued -> leased -> drafted -> merged -> resolved
```

`drafted` means a tagged draft is waiting for `grow.mjs` or its receipt.
`sync` closes that feedback loop:

- a still-pending tagged draft remains `drafted`;
- an exact canonical performer-role specimen moves it to `merged` even if census
  coverage has not yet been rebuilt;
- a matching grow rejection becomes `blocked` or `attention` rather than leaving
  the task in permanent drafted limbo;
- a crash after the draft file write but before the state write is recovered from
  `_autopilot` metadata, including the originating lease.

`merged` is deliberately not complete. `complete` runs the archive gate and
requires one media record per exact wall ID. An available still must be attested
as the exact character; an available portrait as the exact performer; the cited
origins must match `SOURCES.json`; null assets require explicit absence notes.
The receipt stores the current corpus SHA-256 and a review digest before the task
becomes `resolved`.

A lease may instead produce `rejected` or `blocked`. Expired leases return to
`queued`. Unsafe source identity lands in `attention`. Retry timestamps reopen
due blocks; source-revision changes reopen evidence-bound blocks and rejections.

A batch submission is atomic and complete. It fails if a task is missing,
appears twice, belongs to another lease, changes performer/role identity, lacks a
performance citation, or uses an unsupported decision. This prevents partial
agent output from quietly stranding work.

## Expanding beyond Star Trek

Autopilot is downstream of discovery. A new show/franchise adapter has one
contract: emit exact performer-role rows into `CENSUS-COVERAGE.json` (or add a
`scope_id`), preserve claim-level source URLs and revision receipts, and fail
closed on source outages. Add the scope and its bounded refresh adapter to
`AUTOPILOT-SCOPES.json`; no worker or state-machine code changes.

“Every show” is an unbounded registry, not a one-time finite promise. Existing
adapters cover the current franchises; new shows still require trustworthy source
adapters. Scheduled reconciliation makes new credits and source revisions become
work forever, while explicit `paused`, `attention`, `blocked`, and `retired`
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
