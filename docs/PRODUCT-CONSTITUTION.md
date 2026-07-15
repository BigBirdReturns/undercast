# UNDERCAST — Product Constitution

**This is the canonical authority for the UNDERCAST experience.** Where this
document and any other essay, comment, or prior implementation disagree about what
the site should *feel like* or *do*, this document wins. Hard rules cite a decision
in `docs/DECISIONS.md`; that decision is the law — this prose explains and binds
them, and does not add rules the log has not ratified.

The decisions below were **ratified through delegated product/design review,
2026-07-13**. The project-language passages (§1, §8, §9) are **ratified project
language**, not verbatim owner quotations.

---

## 1. Purpose and audience

UNDERCAST is a **field index of the performers who vanish under a designed face** —
prosthetics, masks, creature suits, motion capture, unseen voices — and of the
makers who built those faces. It restores the person (and the makers) to the
character the audience remembers.

**Ratified project language:** Undercast is fan-first and archive-honest — it begins
with recognition and surprise, then earns trust through evidence.

## 2. Emotional sequence

**Reveal → Explore → Verify.**

1. **Reveal** — restore one remembered character and make the visitor feel the pull
   to know who was under it. The opening leads character-first (§4, DEC-0005).
2. **Explore** — discovery. Search is a **primary** discovery tool in the initial
   discovery area, using fan vocabulary (DEC-0004); the lenses and browse sit here.
3. **Verify** — the record, makers, sources, coverage. Depth lives here (§7, DEC-0006).

## 3. The card flip is the core primitive — DEC-0001

The **trading-card flip** is the signature **character→performer** reveal: character
front, person back, **one unsplit frame at a time** (cards crop with `object-fit:
cover`; "unsplit" = the two faces are never composited into one frame).

> **STOP (DEC-0001).** No *second* character→performer reveal mechanic without a
> decision that supersedes DEC-0001. This governs that reveal only — not maps,
> graphs, carousels, or interactions elsewhere.

## 4. The opening — DEC-0005

The homepage opens **character/artwork first** and must not be **visually dominated
by performer photography.** A performer image appears **only after deliberate
visitor action.** After that action the performer **may** occupy the same card
footprint — **including hero scale** — because continuity of the flipped object is
part of the reveal. (So a character-first flip hero is acceptable on this principle;
its composition and crop are judged separately in visual review.)

## 5. Non-negotiables

- **The card flip is the character→performer reveal** (DEC-0001).
- **The default opening is character-first**, not dominated by performer photography
  before the visitor acts (DEC-0005).
- **Provenance never lies.** Missing evidence is shown as missing — never a
  fabricated face, a made-up fact, or an inferred condition.
- **Honest failure.** Broken images, unavailable shards, partial pages shown as such.
- **Accessible by construction** (`docs/DESIGN-SYSTEM.md`).
- **The aesthetic is load-bearing** — not "modernized" into a generic grid.
- **Retire, don't remove-in-name-only.** The seam and its `comparison` contract
  are retired; `focus` stays (DEC-0002/0003).
- **`validate.yml` is the canonical gate** (DEC-0011); **shared CSS is canonical for
  tokens** (DEC-0010).

## 6. Anti-goals

- Not a streaming grid, filter console, or dashboard.
- Not a front page dominated by performer photography before the visitor acts
  (DEC-0005).
- Not a *second* character→performer reveal mechanic, or a boutique one that works
  for a single curated pair (DEC-0002).
- Not per-page bespoke reveals/navs (DESIGN-SYSTEM §8). Page-*specific layouts* are
  legitimate; sharing shell, tokens, and principles is the requirement, not visual
  uniformity.
- Not novelty for its own sake. New ≠ right.

## 7. Role of each page — DEC-0006 / DEC-0009

- **The wall (`index.html`)** — **discovery and the first optional reveal.** Card
  front = character; card back may reveal the performer (DEC-0007).
- **Recognition (`recognition.html`)** — **depth and evidence.**
- **Permanent routes (`records/UC-…/`)** — **durable, linkable, no-JavaScript records.**
- **Coverage** — **completeness and gaps.**
- **Constellations** — **curated relationships.** It stays **contextual** and does
  **not** hold permanent top-navigation until it demonstrates repeatable visitor
  value and enough curated coverage to justify a global destination — no numeric
  threshold applies (DEC-0009).

## 8. What must remain mysterious

**Ratified project language:** The initial view preserves the distance between the
remembered character and the unfamiliar performer. The visitor chooses when to cross
that distance by turning a card or opening a record.

## 9. What "done" feels like

**Ratified project language:** A visitor recognizes someone, chooses to reveal the
person, feels a genuine jolt, and wants to keep wandering. The archive's rigor is
always available but never blocks that first moment.

---

**Before touching any HTML/CSS/UX, read this document, `docs/DESIGN-SYSTEM.md`, and
`docs/DECISIONS.md`, and run `docs/UI-REVIEW-CHECKLIST.md`.** `AGENTS.md` requires it.
