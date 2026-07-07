# UNDERCAST

A field index of the performers who vanish under a designed face — heavy
prosthetics, a mask, a full creature suit, motion capture, or an unseen voice.
Every card flips: the character on the front, the human underneath on the back.

Non-commercial fan project.

```
index.html            the wall — a static page, reads data/specimens.json
og.png                social-share preview card (1200×630)
data/
  specimens.json      the roster (175 verified cards and counting)
  SOURCES.json        the provenance ledger — every asset, its origin and kind
  GAPS.json           cards with no image yet — the worklist for hand/gen fills
  CANDIDATES.json     the ingest queue — harvested leads awaiting triage
images/               cached image files (populated by the crawler)
scripts/
  ingest.mjs          KEYLESS lead harvester: wiki categories -> CANDIDATES.json
  retrieve.mjs        KEYLESS crawler: stills + portraits -> images/ + ledger
  credits.mjs         builds CREDITS.md from the ledger
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
```

`retrieve.mjs` illustrates `RETRIEVE_MAX` cards per run (default 20) and skips
any card that already has an image, so it's incremental — run it as often as you
like. Point `CONTACT` at a real email; it goes in the crawler's User-Agent.

See which wikis the roster will pull from, without touching the network:

```bash
node scripts/retrieve.mjs --audit    # still-wiki coverage, grouped by host
```

Deploy: Settings -> Pages -> deploy from `main`, root. Done.

## Share it

The wall is built to be linked, not just visited:

- **Every specimen is a permalink.** `…/#UC-042` opens the wall, scrolls to that
  card, flips it to the human side, and rings it. The `⌗ UC-042` button on a
  card's back copies its link.
- **Filtered views are shareable.** Shelf, decade, search and sort live in the
  URL — `…/?shelf=Star%20Trek&decade=90s&sort=transform` reopens exactly that.
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

## Images — the three tiers

Every asset lands in `data/SOURCES.json` with a `kind`, and the card shows what
it has:

1. **`free`** — a freely-licensed actor portrait (CC-BY / CC-BY-SA / PD / CC0).
   Attributed in `CREDITS.md`; safe to rehost, which the crawler does.
2. **`still`** — the in-character shot (the mask). Studio-copyright, shown under
   fan-use. Cached and logged, not license-cleared — because this is a fan wall.
3. **`generated`** — a fill image for a gap the crawl couldn't cover. Stamped
   `gen` on the card and `kind: "generated"` in the ledger, always, so the
   lineage never lies about which faces are real photos, which are stills, and
   which the machine made up.

No image for a card -> it keeps the abstract "cast" illustration, and the card
lands in `GAPS.json` as your gen worklist.

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

Note: Wikimedia occasionally 403s automated fetches of Commons media ("robot
policy"). Free portraits may be skipped when that happens — the crawler logs it
and moves on; character stills (served from Fandom's CDN) are unaffected.

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

Two ways to run the triage step:

- **Unattended:** set an **`ANTHROPIC_API_KEY`** repo secret (a metered
  console.anthropic.com key — a Claude subscription is **not** one) and
  `nightly.yml` does ingest + triage every night.
- **From a coding session:** open the repo in Claude Code / the Claude app and
  have it triage `CANDIDATES.json` into `specimens.json` directly — the model in
  the session *is* the drafting engine, no key required. Human-in-the-loop, which
  is arguably the right cadence for a wall where provenance is the point.

`scripts/retrieve.mjs`, `scripts/credits.mjs` and `scripts/ingest.mjs` all run
for free; only the model triage in `grow.mjs` needs a key (or a session).

## Takedown

This is a fan project made out of love for the craft. If you hold rights to
something here and want it gone, open an issue or email the maintainer and the
specific asset comes down — no argument. That's the deal that keeps this cheap
and friendly.
