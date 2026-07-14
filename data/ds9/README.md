# DS9 census — the sourced ledger

Every performer who wore a face on *Star Trek: Deep Space Nine*, taken straight
from the cast credits of all 173 DS9 episode pages on Memory Alpha. The episode
**is** the citation: each performer↔character assertion is anchored to the
specific episode page that credits it, with that page's revision id, capture
time and content hash.

Performers and characters are canonicalized to **Memory Alpha page identity**
(redirects followed, keyed on `pageid`); the spellings the credits actually used
are kept as `aliases`. So "Andrew Robinson" and "Andrew J. Robinson" are one
performer (pageid 6598), "Siddig El Fadil" and "Alexander Siddig" are one (8798),
and Weyoun's clones stay distinct pages.

Nothing here decides who belongs on the UNDERCAST wall. This is the evidence
layer — the roster, its relationships, and their receipts. Per-performance wall
eligibility is judged in a later, separately-sourced pass.

## Reproduce

```
npm run ds9:census          # re-crawl episodes + resolve identity, rewrite roster/*
npm run ds9:summary         # rebuild coverage.json + summary.json from the roster, no network
npm run ds9:graph           # crawl character + doctrine pages, rewrite graph/*
npm run ds9:graph:project   # re-derive projections/relationships from committed nodes+edges, no network
npm run ds9:fixtures        # offline regression checks (identity, wall, relationships, provenance)
```

`ds9:summary` and `ds9:graph:project` are **pure projections**: they read the
committed inputs and rewrite only the derived files, byte-for-byte. CI runs both
offline and fails on any drift, so the derived charts can never disagree with the
nodes/edges they claim to project.

Set `CONTACT=you@example.com` so the crawl identifies itself to the wiki.

## Files

| file | what it is |
| --- | --- |
| `roster.json` | one row per distinct (performer page, character page); credited spellings as aliases; the episodes that cite it; a wall verdict. |
| `observations.json` | every episode page observed — title, source URL, pageid, revision, timestamp, `content_sha256`, capture time. |
| `unresolved.json` | cast lines that did not resolve to a clean performer+character (mostly credits the wiki itself leaves as "Unknown performers"), plus doubling credits. Preserved, never dropped. |
| `coverage.json` | derived: per-assertion wall-match method, duplicate key, and match result. |
| `manifest.json` | crawl scope, generator, capture time, identity note, and a sha256 of each snapshot. |
| `summary.json` | reproducible counts over canonical identity, regenerated from the files above. |

## Roster row fields

- `performer`, `performer_pageid`, `performer_aliases[]` — canonical performer
  page, its id, and every credited spelling that resolves to it.
- `character`, `character_page`, `character_pageid`, `character_aliases[]`,
  `character_source` — canonical character page (`_page`/`_pageid` are `null`
  when the credit names a role in prose with no linked page).
- **Three distinct facts, no longer conflated:**
  - `credit_tiers[]` — the billing level(s): starring / also-starring / guest /
    special-guest / co-star / uncredited / stunt / stand-in / photo-double.
  - `character_named` — the character has an in-universe **proper name** (false
    for the wiki's procedural "Unnamed …" / serial-numbered background roles).
  - `background_role` — every credit was an extra/uncredited/stunt tier.
- `production` — the work (DS9). `era` — **`null`**. Story era (the Occupation,
  the Dominion War, post-war) is a separate sourced facet; it is deliberately
  left unresolved rather than faked from production airdates.
- `eligibility` — `eligible` / `ineligible` / `review`. Everything ships as
  `review`; wall eligibility is a per-performance judgment against GROW.md, not
  something the census decides.
- `duplicate_key` — `<performerId>|<characterId>`, the exact key used to collapse
  an assertion across its episodes.
- `episodes[]` — every citing episode, each with source URL, pageid, revision,
  timestamp, capture time.

## Coverage boundary

The scope is **DS9 episode cast credits**. A performer the wiki does not name
stays in `unresolved.json`; a role credited only in prose is kept with
`character_page: null`. Zero is never inferred from a missing credit. Stand-in,
stunt-double and photo-double credits (written "X as \<principal actor\>") are
reclassified out of the roster into `unresolved.json` — they double a performer,
not a designed face.

## graph/ — nodes, edges, and two kinds of chart

`ds9-graph.mjs` fetches each distinct character's page (plus a handful of named
doctrine pages) and reads their infoboxes, categories and belligerent lists into
an explicit node/edge graph. Every edge carries its own citation; nothing is
inferred from prose narrative.

| file | what it is |
| --- | --- |
| `graph/nodes.json` | every performer / character / species / organization / lineage / symbiont / coalition / power node. Character nodes carry species, affiliations, lineages, family links, rank, status and the raw category list for audit. |
| `graph/edges.json` | typed, individually-cited edges; the `predicates` map documents each type. |
| `graph/relationships.json` | the **relationship charts** — explicit predicates only (below). |
| `graph/projections.json` | the **projections** — mechanical views, not relationship claims (below). |
| `graph/graph-summary.json` | reproducible node/edge/projection/relationship counts. |
| `graph/manifest.json` | a sha256 of every graph artifact, so the whole evidence package — not just the roster — is hash-auditable. |

### Relationship charts (`relationships.json`)

Actual relationships, each edge separately cited to the infobox field, category
or named page that states it:

- `parent_of` (parent→child), `sibling_of`, `spouse_of` — from character infobox
  family fields, **relation-aware and reciprocally corroborated**. Explanatory
  links after a connective (`[[Ziyal]] (daughter by [[Naprem]])`, `…through
  [[Dukat's wife]]`) are cut, generic relationship-word links (`[[son]]`) are
  dropped, and an edge is asserted **only when both endpoints' infoboxes state
  it** (each edge carries `corroborated_by: [both pages]`). One-sided claims are
  held in `graph/family-review.json` — preserved for audit, never asserted.
- `member_of` — House / family / organization membership (infobox + category).
- `host_of` — the Trill symbiont Dax to each host, from a **curated evidence
  table** typed `primary` (the nine), `temporary` (Verad), or `alternate`
  (Yedrin). No succession order is charted — the source gives none machine-readable.
- `clone_instance_of` — each Weyoun clone to the Weyoun line, with its designation
  number. `succeeded_by` — emitted **only where a clone's page explicitly names
  its predecessor**, cited with that sentence (5→6, 6→7, 7→8; 4→5 is not stated,
  so not asserted).
- `commands` — the Dominion chain of command at the species level
  (Changeling → Vorta → Jem'Hadar), each edge cited to the page stating it.
- `allied_with` / `belligerent_in` — the two Dominion War coalitions and their
  member powers. `belligerent_in` is from the war infobox; `allied_with` is
  **curated** membership (`citation_type: "curated"`), verified present on the
  coalition page but not claimed as a parse.

Seven charts are assembled from these: family & marriage web, Klingon Houses &
bloodlines, Dax host set, Dominion chain of command & Weyoun clone line,
Cardassian affiliations & families (incl. Tain→Garak, Dukat→Ziyal), Bajoran
affiliations & families, and the Dominion War coalitions. Each chart names
exactly which predicates it contains.

### Projections (`projections.json`)

Mechanical **views** — filters, not relationship claims: `portrayal`
(performer↔character), `species`, and five regex-selected power blocs (Dominion,
Cardassian, Bajoran, Klingon, Ferengi). Bloc membership is a projection of
sourced species/affiliation/lineage; a character in more than one bloc appears in
each. The bloc regexes are recorded in the file.
