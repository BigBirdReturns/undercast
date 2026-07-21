# UNDERCAST — handoff, 2026-07-20

Branch `claude/full-canon-census`, open as PR #55, held for review at the second
Claude desk (owner's routing decision — do not merge without it).

## State: the gate is RED and that is the first job

`node scripts/validate.mjs` fails on 168 `schema.source` rows missing
`fetched_at`, plus the two `quality.non_regression` floors. **Cause is known and
benign:** 192 cards were drafted and merged, then two image crawls ran but
`RETRIEVE_MAX` stopped before covering every new card. Imageless cards are
supposed to carry a ledger row with `still:null, portrait:null, fetched_at:<the
date we looked>` — see UC-335 for the shape. Cards the crawler never reached
have no `fetched_at` at all.

**Fix:** finish the crawl, then rebuild and validate.

```
IMAGE_MODE=loose RETRIEVE_MAX=300 CONTACT=<you> node scripts/retrieve.mjs
node scripts/credits.mjs && node scripts/sync-sources.mjs
node scripts/shard.mjs && node scripts/build-contract.mjs && node scripts/validate.mjs
```

A crawl was left running in background at handoff; it may already have closed
some of the 168. Re-run and re-check before assuming work is needed.

**Do not** relax the floors in `data/quality-baseline.json` to make this green.
The floors are correct; the wall genuinely added cards faster than faces.

## What landed today

- **Full-canon census.** `scripts/census-scope.mjs` discovers scope from Memory
  Alpha's `Category:Individuals` tree — 475 categories in, 25 out, every
  exclusion carrying a written reason. Star Trek: **2,299 performer-role credits
  known**, against ~380 filed. `CENSUS-GAPS.json` is the drafting worklist.
- **Transform recalibrated.** `docs/TRANSFORM-RUBRIC.md` is new and is the
  authority: what the scale measures, standing rulings (paint scored by
  coverage; bodily transformation graded by the face rule and flagged for
  eligibility), and per-family principles. 591 grade changes, all journalled in
  `data/journal/transform.jsonl` with the governing principle — revertible as a
  set.
- **Voice axis defined and filed.** Voice cards carried a number produced by a
  face rule. They now carry a measured grade on their own axis. The instrument
  is weaker than the face one (18% unanimity on a 3-pass control vs 67%), so
  grades are the **median of three independent blind passes, filed only where
  they agree within a point**. 322 filed, 47 queued in `data/VOICE-REVIEW.json`.
- **Flip craft.** A vision fleet read all 1,252 images. 390 crop `focus` values
  applied. `data/FLIP-CRAFT.json` holds what focus cannot fix.
- **192 new Star Trek cards.** Star Trek 204 → ~380. 61% of drafts were declined
  by the agents themselves; the Wikipedia gate dropped ~38 more.

## The three things that matter next

1. **The image crawler files wrong subjects.** UC-054 Betelgeuse (Michael
   Keaton) is a photograph of the Orion constellation — it matched the *star*.
   Hellboy is a K-pop concert photo; Gary Oldman's Dracula is a book cover. See
   `data/FLIP-CRAFT.json` → `repick`. This is a provenance failure, not a
   framing one, and **it will scale with every new card drafted.** Fix sourcing
   before drafting the next 1,904 Trek credits. The owner's suggestion — capture
   a good copy directly at the size the card needs — is sound; the only
   constraint is that the origin must be a real citable URL logged in
   `SOURCES.json` like every other asset. Note images serve from GitHub Releases
   (`media-live.json`, `media-upload.mjs`), not from `images/`.
2. **255 cards have a head-scale mismatch ≥1.8×** (worst 8.75×). `focus` moves
   the crop window but cannot zoom it. Fixing needs a per-image scale value —
   a schema change, so DEC-0008 and a decision-log entry — or re-cropped
   sources. 165 of 255 have the *portrait* larger: free headshots crop tight,
   film stills frame wide. Structural to the two sourcing tiers.
3. **One actor, many faces has no destination.** Jeffrey Combs now holds 10
   cards. `entities.json` already groups them (`performer:` entities with
   `record_ids`), but nothing renders it. Makers have a shareable view
   (`?maker=`); performers do not. Cheapest honest move is `?actor=` as a wall
   filter — same mechanism, no new page, arguably already inside DEC-0006.
   A true person page is DEC-0006/0009 territory and needs an owner ruling.

## Open queues (machine-prepared, owner rules)

| File | What |
|---|---|
| `data/TRANSFORM-REVIEW.json` | 72 face-grade rows: 3 low-confidence, 3 principled departures wanting a signature, a tail too thin to grade without sourcing |
| `data/VOICE-REVIEW.json` | 47 voice cards where 3 passes disagreed ≥2 points — need a listener, not another scorer |
| `data/ELIGIBILITY-REVIEW.json` | 5 bodily-transformation cards. **Owner ruled: they stay, graded honestly.** Retained as the record of the question |
| `data/HELD-DRAFTS.json` | 24 verified cards withheld for an unsourceable air year or missing narrative field. Memory Alpha episode infoboxes carry in-universe stardates; real broadcast dates sit in unstructured production timelines. Re-merge once sourced — **do not invent a year to satisfy the schema** |
| `data/FLIP-CRAFT.json` | 255 scale mismatches + 23 wrong-or-headless images |
| `data/SHOOT-SURFACES.json` | The Joshua Tree lane, opened. `scripts/shoot-surfaces.mjs` harvests bounded production surfaces (a work filming at a named place in a named window) with the source sentence and page+revision identity. **Zero of 20 TOS episodes contained a sentence where the source itself states a working condition** — recorded as a finding, not papered over. `conditions[]` remains at 0 uses of 13 vocabulary terms, and a condition may never be inferred from location or costume |

## Standing discipline

- Machines prepare, the owner rules — but **do not park a 50/50 as "your call"**
  when the corpus answers it. Decide, document, keep it revertible. Escalate
  only what is genuinely theirs: taste, irreversible acts, scope.
- Never invent a fact to satisfy a schema. Hold the card instead.
- Adding `focus` or any image field drifts the `SOURCES` mirror — repair with
  `scripts/sync-sources.mjs`, never by relaxing `sources.consistency`.
