# UNDERCAST — Decision Log

Append-only. Every architectural or design decision about the **experience** lives
here as a numbered entry. Never edit a decision to change its meaning; to change
one, add a new entry that **Supersedes** it and mark the old one **Superseded**.

UI/UX pull requests must cite the decision number(s) they serve or change
(`docs/UI-REVIEW-CHECKLIST.md`). A change that contradicts an **Active** decision
without superseding it is out of bounds.

**Status values:**

- **Active** — ratified and **true of the repository now.** Binding.
- **Accepted; implementation pending (#NN)** — ratified *direction*; the repo does
  **not yet match it**; the named PR/work implements it. Do not cite as current state.
- **Proposed** — drafted, awaiting a ruling. Not binding.

A decision must never describe repository state falsely.

**Provenance:** entries below were **ratified through delegated product/design
review, 2026-07-13**, per the owner's decision slate on PR #44. Synthesized wording
is *not* an owner quotation; nothing here is presented as a verbatim owner statement.

---

## DEC-0001 — The flip is the signature character→performer reveal
**Status:** Active · Ratified through delegated product/design review, 2026-07-13

The flip is UNDERCAST's signature **character-to-performer** reveal. It presents
**one unsplit frame at a time** (the cards crop with `object-fit: cover`; "unsplit"
means the two faces are never composited into a single frame). This rule governs
that reveal; it does **not** prohibit maps, graphs, carousels, or other interaction
patterns elsewhere.

> **STOP.** No *second* mechanic for the **character→performer** reveal (seam,
> before/after slider, dissolve, wipe, morph) without a decision that supersedes
> DEC-0001.

---

## DEC-0002 — Retire the seam comparison mechanic
**Status:** Active · Implemented by #42, merged 2026-07-14

The "Compare in one frame" seam is retired. It composited two half-faces into one
frame and no longer exists in the shipped site or validation contract.

**Repo state:** #42 removed the seam from Recognition and removed `comparison`
from schema, data, validation, documentation, and rendered tests.

---

## DEC-0003 — Recognition keeps the focused record; loses the seam
**Status:** Active · Implemented by #42, merged 2026-07-14

Recognition keeps the focused record and no longer contains the comparison seam.
`focus` is retained; `comparison` is removed from schema, data, validation,
documentation, and tests.

**Repo state:** implemented on `main` by #42.

---

## DEC-0004 — Search is primary discovery
**Status:** Active (principle level) · Ratified through delegated product/design review, 2026-07-13

Search is a **primary discovery tool, not footer utility.** The homepage must
expose it in the **initial discovery area** and use **fan vocabulary** (character,
performer, production). Exact wording, dimensions, and placement remain
**implementation choices subject to visual QA** — the copy "Who are you trying to
place?" is one such choice, not part of this decision.

---

## DEC-0005 — The default opening is character-first; hero-scale performer is allowed after the flip
**Status:** Active and resolved · Ratified through delegated product/design review, 2026-07-13

The homepage opens **character/artwork first** and must **not be visually dominated
by performer photography.** A performer image appears **only after deliberate
visitor action.** After that action, the performer **may** occupy the same card
footprint — **including hero scale** — because continuity of the flipped object is
part of the reveal.

Therefore **#43 is acceptable on this principle** *if* its default face is
character-first; its composition and crop are judged **separately, in visual
review**, not here.

---

## DEC-0006 — Page ownership
**Status:** Active · Ratified through delegated product/design review, 2026-07-13

- **The wall (`index.html`)** owns **discovery and the first optional reveal.**
- **Recognition (`recognition.html`)** owns **depth and evidence.**
- **Permanent routes (`records/UC-…/`)** own **durable, linkable, no-JavaScript records.**
- **Coverage** owns **completeness and gaps.**
- **Constellations** owns **curated relationships.**

The record does not monopolize "the person" — see DEC-0007.

---

## DEC-0007 — The wall card may reveal the performer
**Status:** Active · Ratified through delegated product/design review, 2026-07-13

A wall card may reveal the performer **after an intentional flip.** The card's
initial state is character-first; the record does not monopolize performer identity.

---

## DEC-0008 — Permanence bar for visual experiments
**Status:** Active · Ratified through delegated product/design review, 2026-07-13

A visual experiment stays **isolated and non-canonical** until it is **all seven** of:

1. **Corpus-scalable** — works across representative records, not one specimen.
2. **Data-driven** — solves a documented, recurring need.
3. **Accessible** — keyboard, focus, alt text, contrast, targets.
4. **Responsive** — desktop and mobile.
5. **No-JS coherent** — degrades honestly with scripting off.
6. **Provenance-safe** — adds **no** schema or archive-contract fields while experimental.
7. **Maintainable** — reuses the existing reveal primitive (DEC-0001) or explicitly
   proposes superseding it.

Promotion also requires the owner to review actual desktop/mobile renders, the
complete gate to pass, and an explicit promoting entry in this log. Until then it
gets no schema, no validator invariant, and is not called a primitive.

---

## DEC-0009 — Constellations has not earned permanent top-navigation
**Status:** Active · Implemented 2026-07-14

Constellations stays **contextual** (under Explore or within records) and does
**not** occupy permanent top-navigation until it demonstrates **repeatable visitor
value** and **enough curated coverage** to justify a global destination. **No
arbitrary numeric threshold is constitutional** — the bar is demonstrated value, not
a count.

**Repo state:** Constellations is absent from the permanent Archive navigation and
remains available through contextual links on Recognition, Coverage, and permanent
records. The constellation route remains a valid curated destination.

---

## DEC-0010 — Shared CSS is canonical for tokens; typography changes only by decision
**Status:** Active (authority) · Ratified through delegated product/design review, 2026-07-13

**Shared CSS is canonical for actual token values.** Documentation describes intent
and may show current values but must not become a second source of truth.
Page-specific layouts are legitimate. **Typography may change only through an
explicit design decision, not incidental substitution.**

**Repo state:** implemented by PR #62, merged 2026-07-22. Shared token values now
live in `assets/site-tokens.css`; page-specific layouts and theme overrides remain
local without becoming competing token sources.

---

## DEC-0011 — `npm run gate` is the canonical repository gate
**Status:** Active (authority) · Implemented by PR #63, 2026-07-22

**`npm run gate` is the canonical repository gate.** `.github/workflows/validate.yml`
installs the runtime and invokes that single command. The workflow, checklists, and
operator docs must not maintain a second command list; new canonical checks belong
in `scripts/gate.mjs` and its adversarial fixtures.

## DEC-0012 — Collection-only operations are the default state

**Status:** Active · Ratified by owner direction, 2026-07-24

The v1 public experience and record contract are frozen by default. Normal work adds
verified records, improves evidence or media, refreshes preserved sources, corrects
errors, and advances new IP estates through reviewed adapters. A new public surface,
reveal mechanic, schema concept, account/service layer, or aesthetic system requires
an explicit superseding owner decision. Narrow correctness, rights, security,
accessibility and performance hotfixes remain permitted with an incident receipt and
a documented return to collection mode.

Legacy scheduled jobs may harvest leads or stage media candidates, but may not write
new canonical records or promote media directly. Canonical growth remains bounded by
Autopilot, exact-subject review, the rolling waterline and reviewed cycle receipts.
