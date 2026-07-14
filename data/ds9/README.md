# DS9 census — the sourced ledger

Every performer who wore a face on *Star Trek: Deep Space Nine*, taken straight
from the cast credits of all 173 DS9 episode pages on Memory Alpha. The episode
**is** the citation: each performer↔character assertion is anchored to the
specific episode page that credits it, with that page's revision id, capture
time and content hash.

Nothing here decides who belongs on the UNDERCAST wall. This is the evidence
layer — the roster and its receipts. Species, lineage/organisation graphs and
per-performance wall eligibility are judged in later, separately-sourced passes.

## Reproduce

```
npm run ds9:census     # re-crawl Memory Alpha, rewrite every file below
npm run ds9:summary     # rebuild coverage.json + summary.json from the roster, no network
```

Set `CONTACT=you@example.com` so the crawl identifies itself to the wiki.

## Files

| file | what it is |
| --- | --- |
| `roster.json` | one row per distinct (performer, character): credit tiers, named/extra flag, production, era, wall verdict, and every episode that cites it. |
| `observations.json` | every episode page observed — title, source URL, pageid, revision, timestamp, `content_sha256`, capture time. |
| `unresolved.json` | cast lines that did not resolve to a clean performer+character (mostly credits the wiki itself leaves as "Unknown performers"). Preserved, never dropped. |
| `coverage.json` | derived: per-assertion wall-match method, duplicate key, and match result. |
| `manifest.json` | crawl scope, generator, capture time, and a sha256 of each snapshot. |
| `summary.json` | reproducible counts, regenerated from the files above. |

## Roster row fields

- `performer`, `character` — display names as the source credits them.
- `character_page`, `character_source` — the Memory Alpha character page and its
  URL (`null` when the credit names a role in prose with no linked page).
- `named` — credited in a Starring / Also starring / Guest / Special guest /
  Co-star tier. `unnamed` — the wiki's procedural background naming (an
  "Unnamed …" prefix or a serial number, e.g. *Cardassian Terok Nor officer 001*).
- `production` — the work (DS9). `era` — the broadcast era, kept **separate** from
  production so a performer who also appears in other productions/eras is not
  flattened into one label.
- `eligibility` — `eligible` / `ineligible` / `review`. Everything ships as
  `review` from this pass; wall eligibility is a per-performance judgment made
  against GROW.md, not something the census decides.
- `duplicate_key` — `normalize(performer)|normalize(character_page)`, the exact
  key used to collapse an assertion across its episodes.
- `episodes[]` — every citing episode, each with source URL, pageid, revision,
  timestamp, capture time.

## Coverage boundary

The scope is **DS9 episode cast credits**. A performer the wiki does not name
stays in `unresolved.json`; a role credited only in prose is kept with
`character_page: null`. Zero is never inferred from a missing credit.
