# UNDERCAST

A field index of the performers who vanish under a designed face — heavy
prosthetics, a mask, a full creature suit, motion capture, or an unseen voice.
Every card flips: the character on the front, the human underneath on the back.

Non-commercial fan project.

```
index.html            the wall — a static page; boots from the generated projections
                      (data/index.json + data/shards/ via data/shard-manifest.json),
                      falling back to data/specimens.json if they're absent
recognition.html      one live catalog record at a time — character, performer,
                      credited work, and evidence-backed connection rails
constellation.html    sourced paths beyond the wall — people, roles, episodes,
                      productions and franchises without relaxing card eligibility
coverage.html         source-scoped franchise/species census and filed gaps
records/UC-…/         generated permanent, no-JavaScript record routes; built for
                      deployment by scripts/build-record-pages.mjs
assets/               light/dark topology marks for explicitly missing evidence
og.png                social-share preview card (1200×630)
GROW.md               how any model grows the roster (keyless) · AGENTS.md points here
data/
  archive.json        versioned crawler contract: truth, schemas, hashes, routes,
                      projections, evidence/cache/privacy policy
  entities.json       derived exact-credit navigation groups (not identity claims)
  species.json        sourced species navigation: exact performer-role joins,
                      separated physical/voice/unknown dispositions and gaps
  constellations.json canonical evidence graph: stable nodes, sourced edges,
                      explicit specimen/context boundary
  search/             prefix-sharded inverted token index for future-scale clients
  dataset.jsonld      Schema.org Dataset discovery metadata
  quality.json        generated completeness/evidence metrics with non-regression floors
  specimens.json      the CANONICAL roster (verified cards and counting) — edit this
  index.json + shards/ generated serving projections, rebuilt by scripts/shard.mjs
  media-manifest.json / media-live.json  images on GitHub Releases (see MEDIA.md)
  SOURCES.json        the provenance ledger — every asset, its origin and kind
  GAPS.json           cards with no image yet — the sourcing worklist
  CANDIDATES.json     the ingest queue — harvested leads awaiting triage
  drafts.json         model-drafted specimens waiting for `grow --drafts` to merge
images/               cached image files (populated by the crawler)
scripts/
  ingest.mjs          KEYLESS lead harvester: wiki categories -> CANDIDATES.json
  retrieve.mjs        KEYLESS crawler: stills + portraits -> images/ + ledger
  credits.mjs         builds CREDITS.md from the ledger
  audit-links.mjs     checks filed fact links in polite batches; `--assets` adds media origins
  sync-sources.mjs    repairs canonical card/image drift in the provenance ledger
  grow.mjs            model triage/drafting of new cards (needs a key, or run it
                      from a Claude coding session)
.github/workflows/
  retrieve.yml        nightly keyless image + provenance crawl
  ingest.yml          nightly keyless lead harvest
  nightly.yml         ingest + optional model triage (gated on ANTHROPIC_API_KEY)
CREDITS.md            attribution for free-licensed images (generated)
```

## Run it

Serve the site (it fetches a JSON file, so `file://` won't work):

```bash
npm run serve          # http://localhost:8000
```

Grow the image library (no key, no signup):

```bash
npm run build          # retrieve images + rebuild credits
# or the pieces:
node scripts/retrieve.mjs
node scripts/credits.mjs
npm run audit:links   # live reference audit; not part of deterministic CI
```

`retrieve.mjs` illustrates `RETRIEVE_MAX` cards per run (default 20) and skips
any card that already has an image, so it's incremental — run it as often as you
like. Point `CONTACT` at a real email; it goes in the crawler's User-Agent.

See which wikis the roster will pull from, without touching the network:

```bash
node scripts/retrieve.mjs --audit    # still-wiki coverage, grouped by host
npm run audit:corpus                 # person labels, free-image provenance, filed roles
npm run test:site-seams              # navigation, recovery, cache and accessibility seams
npm run test:rendered                # Chromium interactions, failure injection, responsive geometry, all routes
```

Deploy: Settings -> Pages -> Source: **GitHub Actions**. The `pages.yml` workflow
builds the permanent record routes and publishes the site on every push to `main`
(so it republishes automatically after the nightly bots commit new cards and
images). Done.

## Share it

The wall is built to be linked, not just visited:

- **Every specimen is a permalink.** `…/#UC-042` opens the wall, scrolls to that
  card, flips it to the human side, and rings it. The `⌗ UC-042` button on a
  card's back copies its link.
- **Every specimen has a Recognition Loop.** `…/recognition.html#UC-042` opens
  the focused record and connects it to shared performers, parsed maker credits,
  and conservative method signals. Missing evidence stays visibly missing.
- **Filtered views are shareable.** Shelf, decade, search and sort live in the
  URL — `…/?shelf=Star%20Trek&decade=90s&sort=transform` reopens exactly that.
- **Constellation nodes are shareable.** `…/constellation.html?id=constellation%3Aalbuquerque-in-space&node=person%3Ajonathan-banks`
  opens a maintained evidence graph at a specific person, role, work or franchise.
- **⚄ Random** pulls a specimen at random (great for "show me someone I don't
  know").
- **Links unfurl.** OpenGraph/Twitter tags + `og.png` give a real preview card
  on socials. If you deploy somewhere other than the default Pages URL, update
  the absolute `og:*`/`canonical` URLs in `index.html`'s `<head>`.

`og.png` is a static asset — regenerate it only if you restyle the masthead.

## The makers are undercast too

The performer vanishes into the face — but so does the person who *built* it. So
the wall surfaces them: **Also undercast — the makers** is a ranked strip of
every crew, shop and artist credited on two or more cards (Michael Westmore,
Stan Winston, Rick Baker, Jim Henson's Creature Shop, Weta, ILM, Toho, Ve Neill,
Rob Bottin, Jack Pierce…). Click one to see everything they made; the designer
credit on each card is a link to the same view, and `?maker=…` is shareable.

Makers are parsed from each specimen's free-form `designer` field, so the way to
credit a maker is simply to name them there — `"Rick Baker"`, `"KNB EFX"`,
`"sculpt by …"`. No separate list to maintain; the leaderboard rebuilds itself.

## Images — two sourced tiers

Every asset lands in `data/SOURCES.json` with a `kind`, and the card shows what
it has:

1. **`free`** — a freely-licensed actor portrait (CC-BY / CC-BY-SA / PD / CC0).
   Attributed in `CREDITS.md`; safe to rehost, which the crawler does.
2. **`still`** — the in-character shot (the mask). Studio-copyright, shown under
   fan-use. Cached and logged, not license-cleared — because this is a fan wall.
No image for a card -> it keeps the abstract "cast" illustration, and the card
lands in `GAPS.json` as a sourcing worklist. A missing image remains an explicit
absence; UNDERCAST never fills an evidence gap with a fabricated face.

**Provenance, not a credits roll.** The ledger is the honesty — machine-readable,
per-asset origin + kind. The card stays clean. `CREDITS.md` carries only the
attribution that's actually required (the `free` tier). Credit where it's due,
a ledger for everything, no scrolling wall of thanks.

## Crawl etiquette (the one hard rule)

The crawler is single-threaded, waits `CRAWL_DELAY_MS` (default 1500) between
requests, sends an honest User-Agent, backs off on HTTP 429, and caches every
file so it never re-fetches. Don't remove those. A slow, polite crawl is what
keeps the wikis' taps open — it matters more than any license question.

For **facts and rosters**, pull from any wiki you like (Memory Alpha,
Wookieepedia, Wikizilla...): their *text* is CC-BY-SA. Just remember a wiki's
text license does **not** cover its images — those stay studio-copyright, which
is why they're tier 2, not tier 1.

**Which wiki a card's still comes from** is resolved automatically, in order:
an explicit `"wiki"` hint on the specimen (a full URL or a Fandom slug like
`"tardis"`) → a franchise match on the card's production/character/universe
(Star Wars, LOTR, Doctor Who, MCU, kaiju, and ~20 more) → the card's own
`link` host when it isn't plain Wikipedia → a per-universe default. Run
`--audit` to see the split. To pin a card to a specific wiki, just add
`"wiki": "https://…/api.php"` (or a bare slug) to its row.

**Picking the right image.** The still prefers the canonical page — it tries the
exact character title first and skips spin-off pages (a video game, a reboot) so
Gollum resolves to the film, not the game. The portrait prefers a freely-licensed
photo taken *closest to when the actor played the role* (via each file's
`DateTimeOriginal`), not just the newest picture on the page.

**How dense to source (`IMAGE_MODE`).** Default is free-first: portraits come from
Wikipedia/Commons. Set `IMAGE_MODE=loose` to also pull performer photos from the
franchise **Fandom** pages when Commons has none — far denser coverage (and it
downloads reliably, since Fandom's CDN isn't rate-limited like Wikimedia). Those
are copyright headshots shown under fan-use and **logged in the ledger with their
origin**, exactly like tier-2 stills — the provenance never lies about where a
face came from. `nightly` retrieve runs in `loose`.

Note: Wikimedia intermittently rate-limits automated fetches of Commons media
("robot policy") from shared/datacenter IPs — the crawler backs off and retries,
and in `loose` mode falls through to Fandom. Nightly runs on a fresh runner IP,
a few cards at a time, which mostly avoids it.

## Auditing a franchise seam

`npm run census:ferengi` walks Memory Alpha's Ferengi and unnamed-Ferengi
categories, reads credited performer fields, and updates four durable snapshots:
`CENSUS.json`, `CENSUS-COVERAGE.json`, `CENSUS-GAPS.json`,
`CENSUS-UNRESOLVED.json`, and `CENSUS-SUMMARY.json`. Coverage is measured by **performer plus role**: a Weyoun
card does not make Jeffrey Combs's Brunt performance covered. Scoped census runs
replace only their franchise/category and preserve every other snapshot. Source
failure aborts the run instead of manufacturing an empty category.

`npm run test:ferengi` is the executable benchmark. It passes only when every
named physical performer-role credit has an exact-key, sourced `performed` edge
in the Ferengi constellation (or an evidence-backed exclusion), while voice
credits and source pages without named performers have explicit dispositions.
No fuzzy substring match can satisfy the gate. `accounting_status` proves there
are no silent rows; `wall_coverage_complete` remains a separate boolean and does
not turn green while filed card gaps remain. Maintained exclusions live in
`data/CENSUS-EXCLUSIONS.json` and require both a reason and an HTTPS evidence URL.

The summary separates physical prosthetic performances, animation/voice, mixed
appearances, and source pages with no named performer. It is a sourced community-wiki snapshot,
not a claim that uncredited background performers or every licensed tie-in have
already been identified.

`data/vocabularies/species.json` maps an exact census category to its singular
display label; `scripts/build-species.mjs` joins those source rows to exact filed
performer-role records and publishes `data/species.json`. The wall's species
filter, card links, focused-record rail and permanent pages all consume that
projection. They never classify a role because “Klingon” or “Ferengi” happened
to appear in reveal prose. The first durable taxa are Klingon and Ferengi; a new
taxon is added only when its source category has been captured and retained.

## Constellations beyond the wall

`data/constellations.json` is maintained evidence, not a recommendation feed.
It lets an in-scope specimen connect to wider roles, episodes, productions and
franchises without turning those contextual credits into cards. Every node has
a stable typed ID and source; every edge carries its own evidence.

The boundary is machine-readable: `scope: "specimen"` requires a matching live
`UC-###` record, while `scope: "context"` is connective evidence only. Structural
edges organize works and franchises. `scripts/validate.mjs` rejects missing
endpoints, unsupported edges, broken record anchors, duplicate relationships and
constellations whose edges escape their declared node set.
Run `node scripts/audit-links.mjs --constellations` for a focused live audit of
every node source and edge-evidence URL without probing the full specimen roster.

## Growing the wall — the pipeline

The wall grows through a **harvest → triage → card** pipeline, built so it can
ingest for years and never lie about what it holds:

1. **Harvest (keyless).** `scripts/ingest.mjs` walks a curated set of wiki
   categories that skew toward performers who vanish under a designed face
   (tokusatsu suit actors, kaiju casts, …), dedups every name against the wall
   and the queue, and appends new **leads** to `data/CANDIDATES.json`. Add
   sources freely — that's the 20-year part. Runs nightly via `ingest.yml`.

   > A lead is **not** a card. Category membership can't tell "disappeared under
   > a built face" from "played the lead as himself," so nothing here ever lands
   > on the wall automatically. The queue is a worklist.

2. **Triage → card.** `scripts/grow.mjs` reads the queue, and for each lead asks
   a model to either write a full, accurate specimen or reject it (strict bar:
   real disappearing role, verifiable facts). Survivors are checked against
   Wikipedia, get free-portrait provenance where available, and join the roster;
   the lead leaves the queue either way. If the queue is empty it falls back to
   inventing from themed *veins*.

Three ways to grow the roster:

- **Model-drafted, keyless (the main way) — see [`GROW.md`](GROW.md).** Any
  coding-session model (Claude Code, an agent, anything that can read the repo)
  drafts specimens into `data/drafts.json`, then runs `node scripts/grow.mjs
  --drafts`. Each draft is Wikipedia-verified, deduped, given the next `UC-###`
  and merged. **No API key** — the tokens are spent by whatever model authored
  the drafts, and *any* model can call the repo the same way. `AGENTS.md` points
  every agent at the protocol.
- **Unattended, with a key:** set an **`ANTHROPIC_API_KEY`** repo secret and
  `nightly.yml` drafts + verifies from themed veins and the `CANDIDATES.json`
  queue every night. Optional — the keyless path above needs no key.
- **By hand:** drop images and add rows yourself (`scripts/adopt.mjs`,
  `scripts/needs.mjs`).

`scripts/retrieve.mjs`, `scripts/credits.mjs`, `scripts/ingest.mjs` and the
keyless `grow --drafts` path all run for free. Whatever the path, the rule never
changes: **real, verifiable people only — accuracy over volume.**

## Takedown

This is a fan project made out of love for the craft. If you hold rights to
something here and want it gone, open an issue or email the maintainer and the
specific asset comes down — no argument. That's the deal that keeps this cheap
and friendly.
