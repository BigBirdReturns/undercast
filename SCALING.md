# Scaling UNDERCAST — how the wall stays fast as the roster grows

The goal is not "1,000,000 cards" as a number. It's that **N is never the thing
that breaks** — so whether the honest population of performers-under-a-designed-face
turns out to be 40,000 or 400,000, the site serves it without a rewrite. We will
never invent cards to hit a round number; accuracy over volume, always.

## The three planes

| plane | what | files |
|---|---|---|
| **truth** | the canonical catalog — hand-written by PRs, grown by the pipeline, gated by the schema + `validate.mjs` | `data/specimens.json`, `data/SOURCES.json` |
| **projection** | disposable, rebuilt from truth; what the browser actually loads | `data/index.json`, `data/shards/NNNN.json`, `data/shard-manifest.json` |
| **serving** | the page: loads the lean index on boot, lazy-loads a shard only for the cards on screen | `index.html` |

Projections are **generated, never hand-edited.** Delete them, run
`node scripts/shard.mjs`, and you get byte-identical output. `validate.mjs`'s
`projection.consistency` profile fails the build if they drift from truth — so a
data edit that forgets to rebuild can't ship.

## Why sharding

A single `specimens.json` is fetched and parsed **whole** on every page load.

| roster | specimens.json (whole, on boot) | with sharding: index.json (boot) + one shard on demand |
|---:|---:|---:|
| 1,067 (today) | ~800 KB | ~310 KB index + ~750 KB/shard as needed |
| 100,000 | ~75 MB — sluggish | ~14 MB index + shards on demand |
| 1,000,000 | ~750 MB — **dead** | ~145–290 MB index — see the ceiling below |

The lean **index** carries only what facets, sort, and search need — id, universe,
years, designer, actor, character, production, transform — plus a `kw` field of
prose keywords that *aren't already* in those fields (so a species named only in a
reveal, like Quark's "Ferengi", is still searchable). The heavy per-card fields
(the reveal paragraph, provenance, image refs) live in the **shards** and load only
for the ~120 cards actually rendered.

## Known ceilings (honest, not yet hit)

These are real and un-fixed. They don't bite at the current or near-future roster,
but they're the next walls, in order:

1. **The whole-file boot loads (`index.json` + `media-live.json`) are O(N).** The heavy
   per-card records shard and load lazily, but two files are still fetched and parsed
   *whole* on boot: `index.json` (~290 B/card — facets, sort, search corpus) and, once
   images migrate, `media-live.json` (~150 B/released-image, `src → url`). They're lean
   (the full 700 KB media manifest is **not** shipped — only the release URLs are), but
   they still grow with N: comfortable to ~100–200K cards, ~30–45 MB at that point. Past
   that both need the same treatment as the records — **chunked/paginated on demand** (and
   search wants an **inverted index**: token → postings, sharded by prefix, so the browser
   fetches postings per query instead of the whole corpus). That's the next serving pass;
   until then boot is bounded for the realistic roster, not for a literal million.
2. **Images (~30 KB each → ~40 GB at 1M).** GitHub Pages soft-caps around 1 GB.
   Real scale needs a **content-addressed asset store off Pages** (object store /
   CDN), with the wall referencing content hashes. See `preservation/` for how the
   originals are already inventoried and recoverable.
3. **Truth on Pages.** At true 1M, `specimens.json` itself (~750 MB) plus shards
   exceeds a static repo. The truth plane would move to a real store; the
   projection/serving split here stays exactly the same.

None of these require throwing away what's built — each bolts onto the
truth → projection → serving split. That's the point of doing the split first.

## Rebuilding projections

```
node scripts/shard.mjs        # SHARD_SIZE=1000 default; writes index.json + shards/ + shard-manifest.json
node scripts/validate.mjs     # gate: fails if projections drift from data/specimens.json
```

The nightly and retrieve workflows run both automatically after any data change,
so the committed projections always match the committed truth.
