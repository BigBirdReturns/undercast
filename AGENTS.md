# For any agent working on UNDERCAST

UNDERCAST is a field index of performers who vanish under a designed face
(prosthetics, masks, creature suits, motion capture, or an unseen voice). Every
card flips: the character on the front, the human underneath on the back. It's a
static site (index.html reads data/specimens.json) deployed to GitHub Pages by
Actions; keyless crawlers fill images and harvest leads. No servers, no keys.

**To grow the roster, read [GROW.md](GROW.md).** A Luna/autonomous worker must
also read [LUNA.md](LUNA.md) and [docs/AUTOPILOT.md](docs/AUTOPILOT.md), then
claim a bounded lease instead of choosing free-form work. A scope must pass
`autopilot readiness`; Luna never certifies or activates its own producer. To
consume or extend the machine-facing archive, read [CRAWLERS.md](CRAWLERS.md)
and `data/archive.json`. The drafting model is the compute — you draft verified
specimens, a keyless script merges them. Accuracy over volume, always: never
invent a person or a fact. The provenance is the point.

## Before non-emergency work — sequence it

Read `docs/FIVE-YEAR-PLAN.md` and run:

```bash
npm run roadmap -- validate
npm run roadmap -- status
npm run roadmap -- next --limit 1
```

Work only on a milestone reported `ready`, then follow its exact section in
`docs/ROADMAP-PLAYBOOKS.md`. Forecast dates do not authorize work; dependencies,
measured triggers, owner decisions, and reviewed completion receipts do. A later
or more interesting milestone is out of scope until the dependency graph unlocks
it.

Hotfixes for active correctness, rights, security, or publication incidents may
interrupt the roadmap, but they must stay narrowly scoped, leave an incident or
journal receipt, and return the system to the same roadmap state. The roadmap
never supersedes Active product law.

`data/ROADMAP-STATE.json` changes only through a reviewed pull request. A machine
or Luna may prepare evidence, but may not mark a second-desk or owner milestone
complete, invent an owner decision, or replace an unknown metric with zero.

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
the signature *character→performer* reveal (DEC-0001) — do not add a second one (no
seams, sliders, dissolves, wipes) without superseding it in words first; unrelated
interactions elsewhere are fine. The homepage's default opening must not be
dominated by performer imagery (DEC-0005) — character or archive artwork first, the
performer only after deliberate action. Every UI PR **cites the decision number(s)**
it serves. And no one claims the gate is "green" without running all of
`docs/UI-REVIEW-CHECKLIST.md` — the whole gate, not most of it. Never attribute a
decision or a "ruling" to the owner they did not actually make.

Key files: `GROW.md` (how to add cards), `LUNA.md` / `docs/AUTOPILOT.md`
(certified, bounded autonomous growth), `docs/FIVE-YEAR-PLAN.md` /
`docs/ROADMAP-PLAYBOOKS.md` / `data/ROADMAP*.json` (authorized strategic
sequence), `CRAWLERS.md` (crawler/evidence contract), `README.md` (the whole
system), `scripts/` (retrieve = images, ingest = lead harvest, grow = merge
model drafts, autopilot = durable work leases, roadmap = milestone dependency
and authority gate, credits/needs/adopt = helpers).
