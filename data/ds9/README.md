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
`character_page: null`. Zero is never inferred from a missing credit. Stand-in,
stunt-double and photo-double credits (written "X as \<principal actor\>") are
reclassified out of the roster into `unresolved.json` — they double a performer,
not a designed face.

## graph/ — the relationship layer

Built on the roster by `ds9-graph.mjs`, which fetches each distinct character's
Memory Alpha page and reads its infobox and categories into an explicit
node/edge graph. Every edge carries its own citation; nothing is inferred from
prose.

```
npm run ds9:graph            # crawl character pages, rewrite graph/*
npm run ds9:graph:project    # rebuild the seven projections from nodes/edges
```

| file | what it is |
| --- | --- |
| `graph/nodes.json` | every performer / character / species / organization / lineage node. Character nodes carry species, affiliations, lineages, rank, status and the full raw category list for audit. |
| `graph/edges.json` | typed, individually-cited edges: `portrayed` (episode-credited), `is_species` / `affiliated_with` (infobox or species-category), `member_of` (House/family). |
| `graph/graphs.json` | seven projections over nodes/edges — `portrayal`, `species`, and the five DS9 power blocs (Dominion, Cardassian, Bajoran, Klingon, Ferengi). Each lists its node ids and cited edges; the bloc rules are recorded in the file. |
| `graph/graph-summary.json` | reproducible node/edge/graph counts. |

Edge citations: `is_species` / `affiliated_with` cite the character page
(`source`, `revision`, `content_sha256`) when taken from the infobox, or the
category URL when taken from a species/personnel category. `member_of` cites the
House/family — the infobox affiliation link or the family category. `portrayed`
cites every episode that credits the pairing.

A character appears in more than one power bloc when the wiki sources say so
(Kira is Bajoran, briefly Dominion, and Starfleet-attached). Power-bloc
membership is a deterministic projection of sourced species/affiliation/lineage,
not a hand-drawn hierarchy — internal command chains are not invented here.
