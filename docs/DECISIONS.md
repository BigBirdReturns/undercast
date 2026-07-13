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
**Status:** Accepted; implementation pending (#42) · 2026-07-13

Retire the "Compare in one frame" seam (it composited two half-faces into one
frame). Change to **Active only when the shipped site and validation contract no
longer contain it.**

**Repo state:** `main` still ships the seam and requires it in `validate.mjs` and
the rendered tests. PR #42 removes it.

---

## DEC-0003 — Recognition keeps the focused record; loses the seam
**Status:** Accepted; implementation pending (#42) · 2026-07-13

Recognition keeps the focused record and loses the comparison seam; `focus` is
retained, `comparison` removed (schema/data/validator/docs/tests). Change to
**Active only after implementation lands.**

**Repo state:** `main` still defines and validates `comparison`. PR #42 removes it.

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
**Status:** Accepted; implementation pending · 2026-07-13

Constellations stays **contextual** (under Explore or within records) and does
**not** occupy permanent top-navigation until it demonstrates **repeatable visitor
value** and **enough curated coverage** to justify a global destination. **No
arbitrary numeric threshold is constitutional** — the bar is demonstrated value, not
a count.

**Repo state (conflict):** the Archive navigation on `main` (and in #43) currently
lists **Constellations** as a top-nav item. This decision cannot be marked **Active**
until a change removes it from top-nav and relocates it contextually. Pending that
implementation.

---

## DEC-0010 — Shared CSS is canonical for tokens; typography changes only by decision
**Status:** Active (authority) · Ratified through delegated product/design review, 2026-07-13

**Shared CSS is canonical for actual token values.** Documentation describes intent
and may show current values but must not become a second source of truth.
Page-specific layouts are legitimate. **Typography may change only through an
explicit design decision, not incidental substitution.**

**Repo state (gap):** tokens currently live **inline in each page**, not yet in a
shared stylesheet. The authority is ratified; consolidating tokens into shared CSS
is tracked implementation work so the canonical source actually exists.

---

## DEC-0011 — `validate.yml` is the canonical gate until `npm run gate` exists
**Status:** Active (authority) · Ratified through delegated product/design review, 2026-07-13

Until a cross-platform **`npm run gate`** exists, **`.github/workflows/validate.yml`
is the canonical gate.** The UI checklist **points to it and summarizes categories**;
it must not maintain a fragile second copy of shell commands. Creating `npm run
gate` is tracked implementation improvement.
