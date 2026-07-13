# For any agent working on UNDERCAST

UNDERCAST is a field index of performers who vanish under a designed face
(prosthetics, masks, creature suits, motion capture, or an unseen voice). Every
card flips: the character on the front, the human underneath on the back. It's a
static site (index.html reads data/specimens.json) deployed to GitHub Pages by
Actions; keyless crawlers fill images and harvest leads. No servers, no keys.

**To grow the roster, read [GROW.md](GROW.md).** To consume or extend the
machine-facing archive, read [CRAWLERS.md](CRAWLERS.md) and
`data/archive.json`. The drafting model is the
compute — you draft verified specimens, a keyless script merges them. Accuracy
over volume, always: never invent a person or a fact. The provenance is the point.

## Before you touch HTML, CSS, or the experience — STOP and read the law

The data, provenance, and crawl are heavily protected; the **experience** is
governed too, and that governance is **binding, not advisory**. Prior essays and
existing code are *not* authority — these documents are:

1. **[docs/PRODUCT-CONSTITUTION.md](docs/PRODUCT-CONSTITUTION.md)** — what the site
   is, the emotional sequence, the reveal rules, the non-negotiables and anti-goals.
2. **[docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md)** — how to build it (type, color,
   card anatomy, crop, accessibility, approved components).
3. **[docs/DECISIONS.md](docs/DECISIONS.md)** — the append-only decision log. **A UI
   change that contradicts an Active decision and does not supersede it is out of
   bounds.**
4. **[docs/UI-REVIEW-CHECKLIST.md](docs/UI-REVIEW-CHECKLIST.md)** — run this and put
   it in every UI PR.

**The rules that would have prevented the last excursion:** the trading-card flip is
the *only* signature reveal (DEC-0001) — do not add a second (no seams, sliders,
dissolves, wipes) without superseding it in words first. The opening view is
character-only (DEC-0005) — no performer portrait on the front door. Every UI PR
**cites the decision number(s)** it serves. And no one claims the gate is "green"
without running all of `docs/UI-REVIEW-CHECKLIST.md` — the whole gate, not most of
it.

Key files: `GROW.md` (how to add cards), `CRAWLERS.md` (crawler/evidence
contract), `README.md` (the whole system),
`scripts/` (retrieve = images, ingest = lead harvest, grow = merge model drafts,
credits/needs/adopt = helpers).
