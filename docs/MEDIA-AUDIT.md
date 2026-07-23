# Exact-subject media audit

UNDERCAST treats every wall image as a claim, not decoration. A source URL and a
valid file hash prove provenance and byte identity; they do not prove that the
image actually shows the intended character or performer.

The Star Trek gold shard therefore has a separate, durable media-audit layer.
It borrows the useful mechanics of mature community tagging systems: namespaced
claims, weighted but attributable review power, visible weak/active/solid states,
a tracker for disputed work, explicit authority for enforcement, and an
append-only history. It does not copy any source site's content policy.

## Two independent claims per available asset

A **still** must establish:

1. `identity = expected` — the image shows the exact filed character.
2. `presentation = character-depiction` — it is an actual depiction of the
   performance, not a landscape, diagram, prop-only image, unrelated artwork, or
   other non-performance substitute.

A **portrait** must establish:

1. `identity = expected` — the image shows the exact human performer.
2. `presentation = neutral-human` — the person is presented out of character,
   rather than in prosthetics, costume, another dramatic role, a group where the
   subject is unclear, or a non-person namesake collision.

Null facets are not silently ignored. A null `SOURCES.json` facet with its
ledger receipt is recorded as `absent` and counts as honestly complete.

## Consensus states

- **none** — no current vote.
- **weak** — one ordinary or machine vote.
- **active** — some corroboration, but not enough to close the claim.
- **solid** — at least 3 weighted support, at least 2 independent reviewers, and
  at least one human reviewer, without a close conflicting result.
- **enforced** — an obvious ruling explicitly imposed by second-desk or owner
  authority. This is used for clear negative presentation defects, never to
  guess an identity.
- **contested** — material disagreement requiring tracker review.

A facet is `verified` only when both required claims are solid or enforced on
the positive value. A negative or ambiguous active/solid/enforced claim becomes
`attention`. A single machine vote can prioritize work but can never close it.

## Commands

```bash
npm run media:audit -- sync
npm run media:audit -- status --scope star-trek
npm run media:audit -- tracker --scope star-trek --limit 100

# Emit a risk-first, hash-bound packet and an optional local visual sheet.
npm run media:audit -- next \
  --scope star-trek \
  --reviewer reviewer-a \
  --role reviewer \
  --namespace presentation \
  --limit 16 \
  --out .media-audit/packet.json \
  --html .media-audit/packet.html

# Submit votes; every vote remains bound to the packet and current asset hash.
npm run media:audit -- submit \
  --packet .media-audit/packet.json \
  --input .media-audit/results.json

npm run media:audit -- validate
npm run media:audit -- gate --scope star-trek
npm run media:audit:fixtures
```

The normal Star Trek Autopilot `next` and `claim` operations run the baseline
gate first. Roster growth stays paused while the existing wall has unreviewed or
known-wrong media. Media correction, independent review, and post-merge review
remain available.

## Review result shape

```json
{
  "version": 2,
  "packet_id": "map_...",
  "reviewer": "reviewer-a",
  "role": "reviewer",
  "votes": [
    {
      "item_id": "ma_...",
      "namespace": "presentation",
      "value": "neutral-human",
      "note": "Solo out-of-character human portrait with no visible role makeup."
    },
    {
      "item_id": "ma_...",
      "namespace": "identity",
      "value": "expected",
      "note": "Compared against two independent performer references; facial identity agrees.",
      "evidence": ["https://example.invalid/reference"]
    }
  ]
}
```

Never convert uncertainty into a positive vote. `ambiguous` is an honest state,
not a failure. Wrong assets are replaced or nulled, then `sync` rotates the asset
hash and discards stale current votes for that facet while the journal retains
the prior history.


## Reviewed baseline campaigns

A full-scope campaign may apply many rulings only through `npm run media:audit:campaign -- --input data/review/<campaign>.json`. The campaign must cover every current open facet exactly once, bind every ruling to the current asset and item-set hashes, cite a retained source receipt, and carry second-desk or owner authority. Wrong or ambiguous media is nulled from both canonical mirrors while immutable bytes and former objects remain in `data/journal/media-remediation.jsonl`. Positive identity decisions require revision-bound source metadata and may never be inferred from appearance. All canonical mirrors and journals commit as one rollback-capable transaction.
