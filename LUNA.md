# Luna — autonomous growth contract

Luna is a bounded worker over a durable queue, not a free-form invitation to add
cards. Read `AGENTS.md`, `GROW.md`, and `docs/AUTOPILOT.md` before taking a lease.

## One complete cycle

```bash
mkdir -p .luna

# Runs the existing archive invariant gate, reconciles current evidence, and
# leases one bounded batch. Exit 3 means no new lease was issued.
npm run autopilot -- next --agent luna --scope star-trek --limit 8 \
  --out .luna/batch.json --prompt .luna/PROMPT.md

# Research every leased performer-role and write .luna/results.json.
npm run autopilot -- submit --batch .luna/batch.json --input .luna/results.json

# Existing keyless merge and media pipeline.
node scripts/grow.mjs --drafts
IMAGE_MODE=loose node scripts/retrieve.mjs
node scripts/credits.mjs && node scripts/sync-sources.mjs
node scripts/shard.mjs && node scripts/build-contract.mjs
node scripts/validate.mjs

# Reconcile accepted specimens or grow rejection receipts. Accepted drafts move
# to `merged`, not `resolved`.
npm run autopilot -- sync

# Inspect every merged wall ID. Verify the still is the exact character and the
# portrait is the exact performer, or attest explicit absence when SOURCES has
# null. Write .luna/media-review.json, then close the merged tasks.
npm run autopilot -- complete --input .luna/media-review.json
```

Repeat only after the prior batch has no `leased`, `drafted`, or `merged` tasks.
The high-level `next` command refuses to lease against a red archive and applies
one-batch backpressure. Exit code 3 means either the scope is drained for now or
work is already in flight; inspect `autopilot status` rather than claiming
completion.

For every leased task, return exactly one result:

- `draft` only when the exact performer-role qualifies under `GROW.md` and every
  required fact is sourced. The draft actor and character must match the task;
  at least one `performance` reference must be the task's census source.
- `reject` only with a specific reason and cited HTTPS evidence.
- `blocked` when a required fact cannot yet be sourced. State the missing fact
  and either a future retry time or `until_source_changes: true`.

Never substitute a more famous role, infer a year, invent a maker, or treat a
species/category membership as proof that a performance qualifies. Leases are
complete units: every task must receive one result, and a result may not target
work outside its lease.

## Media closure

A canonical row is not enough. The crawler has previously selected namesakes,
book covers, concert photographs, and other wrong subjects. A merged task remains
in flight until Luna visually checks the actual retrieved assets and files a
receipt bound to the originating lease, the exact `SOURCES.json` origins, and a
SHA-256 of the current specimens/source ledger.

```json
{
  "version": 1,
  "reviewed_by": "luna",
  "lease_id": "lease_...",
  "reviews": [
    {
      "task_id": "ap_...",
      "records": [
        {
          "wall_id": "UC-...",
          "still": {
            "disposition": "verified",
            "subject": "Brunt",
            "source": "https://memory-alpha.fandom.com/wiki/File:Brunt.jpg",
            "note": "The retrieved frame visibly shows Brunt, not a namesake."
          },
          "portrait": {
            "disposition": "verified",
            "subject": "Jeffrey Combs",
            "source": "https://commons.wikimedia.org/wiki/File:Jeffrey_Combs.jpg",
            "note": "The portrait visibly shows Jeffrey Combs as the sole subject."
          }
        }
      ]
    }
  ]
}
```

When a ledger facet is `null`, use `{"disposition":"absent","note":"..."}`.
Do not mark an available asset absent to avoid reviewing it. `complete` runs the
archive gate again and rejects mismatched wall IDs, identities, origins, subjects,
or missing `fetched_at` receipts.

Commit bounded batches. A successful cycle leaves the queue, drafts, journals,
canonical roster, source ledger, media review, projections, and validator
mutually consistent.
