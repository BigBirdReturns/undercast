# For any agent working on UNDERCAST

UNDERCAST is a field index of performers who vanish under a designed face
(prosthetics, masks, creature suits, motion capture, or an unseen voice). Every
card flips: the character on the front, the human underneath on the back. It's a
static site (index.html reads data/specimens.json) deployed to GitHub Pages by
Actions; keyless crawlers fill images and harvest leads. No servers, no keys.

**To grow the roster, read [GROW.md](GROW.md).** A Luna/autonomous worker must
also read [LUNA.md](LUNA.md), [docs/AUTOPILOT.md](docs/AUTOPILOT.md), and
[docs/AUTOPILOT-CAPABILITIES.md](docs/AUTOPILOT-CAPABILITIES.md), and
[docs/WATERLINE.md](docs/WATERLINE.md), then claim a bounded lease under an
explicit reviewed capability profile instead of choosing free-form work. A scope must pass `autopilot readiness`; Luna never
certifies or activates its own producer. Star Trek also runs the exact-subject
baseline in `docs/MEDIA-AUDIT.md` and the rolling operating waterline: completing
one baseline authorizes one bounded cycle, not unlimited growth. Unreviewed or
known-wrong wall media, an unreceipted prior lease, or a blocking incident stops
new roster leases without blocking correction work. To consume or extend the
machine-facing archive, read [CRAWLERS.md](CRAWLERS.md) and `data/archive.json`.
The drafting model is the compute — you draft verified specimens, a keyless script
merges them. Accuracy over volume, always: never invent a person or a fact. The
provenance is the point.

## Before non-emergency work — sequence it

Read `docs/FIVE-YEAR-PLAN.md` and run:

```bash
npm run roadmap -- validate
npm run roadmap -- status
npm run roadmap -- next --limit 1
npm run waterline -- validate
npm run waterline -- status --scope star-trek
```

Work only on a milestone reported `ready` or `reversible`, then follow the exact
authorization printed by `roadmap next`. `ready` authorizes the full playbook
within its stated authority. `reversible` authorizes only the exact reversible
work printed from `data/EXECUTION-POLICY.json`; every listed held decision and
held action remains out of bounds. Forecast dates do not authorize work. Missing
dependencies or measured triggers still block a milestone, while a missing owner
decision holds irreversible action and completion without turning the owner into
an execution dependency. A later or more interesting milestone remains out of
scope until the dependency graph unlocks it.

Hotfixes for active correctness, rights, security, or publication incidents may
interrupt the roadmap, but they must stay narrowly scoped, leave an incident or
journal receipt, and return the system to the same roadmap state. The roadmap
never supersedes Active product law.

`data/ROADMAP-STATE.json` changes only through a reviewed pull request. A machine
or Luna may prepare evidence, but may not mark a second-desk or owner milestone
complete, invent an owner decision, or replace an unknown metric with zero.

## Thesis continuation rail — finish, return to collection, repeat

Read [docs/THESIS-CONTINUATION.md](docs/THESIS-CONTINUATION.md). During an active
cycle, and again after its terminal product reaches canonical `main`, run:

```bash
node scripts/thesis-rails.mjs validate
node scripts/thesis-rails.mjs status
node scripts/thesis-rails.mjs next --json
node scripts/thesis-rails.mjs prompt --out .luna/THESIS-CONTINUATION.md
```

Follow the generated phase and exact operation. Do not free-select a franchise or
role. A normal cycle has one candidate/product lane, one independent exact-product
review, and one receipt-bearing finalizer. Do not create selector, preflight,
blueprint, census, transition-controller, finalizer-census, observer, or
cleanup-writer chains around an already selected task. Repair a concrete shared
mechanism defect in place and retire the repair in the same terminal product.

Cycle 012 is grandfathered while the active Senstarg transaction finishes. From cycle 013 onward, every cycle workflow pull request declares `Terminal-Product:` in its body. The
cycle returns to zero in-flight work, zero media debt, zero unreceipted cycles,
and zero temporary cycle refs before another claim. Maker attribution is valuable
but nonblocking: add it only from exact source support and leave it explicitly
unresolved otherwise.

## Default operating mode — collect, improve, expand

The product surface is now frozen at v1 under DEC-0012. Before ordinary work run:

```bash
npm run corpus -- validate
npm run corpus -- status
npm run corpus -- next
```

The default task is the exact operation returned by `corpus next`: close existing
debt, execute one bounded active-estate cycle, refresh preserved sources, review a
media candidate, or advance the highest-priority estate gate. Do not redesign the
site, add a new reveal, fork a microsite, alter the canonical record concept, or
build an account/API/service layer merely because the collection is operating.

New IP estates enter through `data/ESTATE-REGISTRY.json`; a shelf or URL mapping is
not an adapter and a configured scope is not certification. Scheduled lead harvest
and media search may create work or candidate artifacts, never canonical facts.

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
model drafts, autopilot = durable work leases, waterline = one-cycle-at-a-time
gold/reliability evidence, roadmap = milestone dependency and authority gate,
credits/needs/adopt = helpers).
