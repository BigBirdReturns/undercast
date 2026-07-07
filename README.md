# UNDERCAST

A field index of the performers who vanish under a designed face — heavy
prosthetics, a mask, a full creature suit, motion capture, or an unseen voice.
Every card flips: the character on the front, the human underneath on the back.

Non-commercial fan project.

```
index.html            the wall — a static page, reads data/specimens.json
og.png                social-share preview card (1200×630)
data/
  specimens.json      the roster (139 hand-built cards to start)
  SOURCES.json        the provenance ledger — every asset, its origin and kind
  GAPS.json           cards with no image yet — the worklist for hand/gen fills
images/               cached image files (populated by the crawler)
scripts/
  retrieve.mjs        KEYLESS crawler: stills + portraits -> images/ + ledger
  credits.mjs         builds CREDITS.md from the ledger
  grow.mjs            OPTIONAL model drafting of new cards (needs an API key)
.github/workflows/
  retrieve.yml        nightly keyless image + provenance crawl
  nightly.yml         optional model drafting (gated on ANTHROPIC_API_KEY)
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

## Growing new cards (optional, needs a key)

`scripts/grow.mjs` asks a model to draft new specimens and verifies each person
on Wikipedia. It needs an **Anthropic API key** (a separate console.anthropic.com
account with its own metered billing — your Claude subscription is **not** an API
key). Set it as the `ANTHROPIC_API_KEY` repo secret; the `nightly.yml` workflow
runs it.

Prefer keyless? Draft batches in the Claude app, eyeball them, and paste the JSON
into `data/specimens.json` by hand. Slower cadence, human-in-the-loop — arguably
the right cadence for a wall where provenance is the point. Only `retrieve.mjs`
and `credits.mjs` run for free.

## Takedown

This is a fan project made out of love for the craft. If you hold rights to
something here and want it gone, open an issue or email the maintainer and the
specific asset comes down — no argument. That's the deal that keeps this cheap
and friendly.
