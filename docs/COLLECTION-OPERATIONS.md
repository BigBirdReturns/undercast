# Collection-only operations

UNDERCAST is now operated as an archive, not as a product-design project. The public
experience and record contract are frozen at v1 by default. Ordinary work has four
jobs: add verified performer-role records, improve existing evidence and media,
refresh preserved sources, and induct additional IP estates through the same reviewed
adapter and waterline machinery.

## The permanent loop

```text
certified source refresh
→ reconcile durable tasks
→ one capability-compatible lease
→ evidence-backed merge or honest terminal result
→ targeted retrieval
→ exact-subject media closure
→ zero debt
→ reviewed cycle receipt
→ repeat
```

A completed gold-shard milestone proves the loop; it does not stop collection. The
active estate continues until its queue is exhausted or an operator pauses it. Source
and media refreshes continue after filing so better evidence can replace weaker
material without erasing prior objects or rulings.

## Rolling media search

The scheduled search runs `retrieve.mjs` only in a detached temporary worktree. It may
null a selected side inside that worktree to seek a replacement, but it never writes
those bytes or objects into canonical `data/specimens.json`, `data/SOURCES.json`, or
`images/` on `main`. It publishes a 90-day candidate artifact and commits only an
attempt journal plus the latest report. Promotion still requires exact-subject review,
provenance reconciliation, deterministic rebuild and the canonical gate.

Retry cadence is explicit: missing evidence every 30 days, open audit debt every seven
days, weak/non-free portraits every 180 days, verified portraits annually, and stills
every two years. A no-result receipt advances the round-robin rather than repeatedly
hammering the same card.

## Estate induction

`data/ESTATE-REGISTRY.json` is the one frontier. States are:

```text
inventory
→ source-model-review
→ adapter-build
→ adapter-review
→ certified-paused
→ active-corpus
→ gold-reference
```

A shelf, URL mapping or configured scope does not skip a state. Activation requires
exact source receipts, adversarial fixtures, semantic review of regenerated data,
preservation, certification and a bounded pilot. New estates inherit the existing
site; they do not receive bespoke microsites or reveal mechanics.

## Product freeze and exceptions

The protected surface list lives in `data/COLLECTION-MODE.json`. A pull request that
touches it fails `collection-policy` unless it carries either:

- `owner-approved-product-change` plus a new append-only DEC entry; or
- one narrow correctness, rights, security, accessibility or performance hotfix label,
  with `Incident:` and `Return-to-collection-mode:` receipts in the PR body.

The freeze does not block corpus rows, sources, images, adapters, corrections,
preservation or operating scripts. It blocks accidental redesign and schema drift
from consuming collection capacity.

## Operator commands

```bash
npm run corpus -- validate
npm run corpus -- status
npm run corpus -- next
npm run media:search:plan -- --limit 40 --out .corpus/media-plan.json
```
