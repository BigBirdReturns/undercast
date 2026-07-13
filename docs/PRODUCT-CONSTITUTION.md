# UNDERCAST — Product Constitution

**This is the canonical authority for the UNDERCAST experience.** Where this
document and any other essay, comment, or prior implementation disagree about what
the site should *feel like* or *do*, this document wins. Hard rules cite a decision
in `docs/DECISIONS.md`; that decision is the law — this prose explains and binds
them together, and does not itself add rules the log has not ratified.

**Ratification state:** this is a **draft returned to the owner.** Only statements
that cite an **Active** decision bind. Statements citing an **Accepted; pending**
decision describe an agreed destination, not current repo state. Everything else is
proposal.

---

## 1. Purpose and audience

UNDERCAST is a **field index of the performers who vanish under a designed face** —
prosthetics, masks, creature suits, motion capture, unseen voices — and of the
makers who built those faces. It restores the person (and the makers) to the
character the audience remembers.

> Undercast is fan-first and archive-honest: it begins with recognition and
> surprise, then earns trust through evidence.

## 2. Emotional sequence

The site moves in one direction: **Reveal → Explore → Verify.**

1. **Reveal** — restore one remembered character and make the visitor feel the pull
   to know who was under it. The opening leads with the character (§4).
2. **Explore** — offer honest ways in (browse, the lenses, search). Not a filing
   console. _(Search prominence/copy: DEC-0004, Proposed.)_
3. **Verify** — the record, the makers, the sources, the coverage. Depth lives here
   (§7, DEC-0006).

## 3. The card flip is the core primitive — DEC-0001

The **trading-card flip** is the signature **character→performer** reveal: character
on the front, the person underneath on the back; **one unsplit frame at a time**
(the cards crop with `object-fit: cover`; "unsplit" means the two faces are never
composited into one frame). Everything that shows the character-then-person is built
from it.

> **STOP (DEC-0001).** No *second* character→performer reveal mechanic (seam,
> slider, dissolve, wipe, morph) without a decision that supersedes DEC-0001. This
> governs the character↔performer reveal only — not unrelated interactions elsewhere.

## 4. The opening — DEC-0005

> The homepage's default opening state must not be dominated by performer imagery.
> Character imagery or archive artwork comes first. A performer photograph appears
> only after deliberate visitor action.

This governs the **default opening presentation**. It does **not** forbid the
wall-card back from revealing the performer (that reveal is earned by an intentional
flip — DEC-0006/0007). Whether a specific *hero-scale* post-flip reveal on the
homepage is nonetheless too much is an **open owner call**, not settled here.

## 5. Non-negotiables

- **The card flip is the character→performer reveal** (DEC-0001).
- **The default opening is not dominated by performer imagery** (DEC-0005).
- **Provenance never lies.** Missing evidence is shown as missing — never a
  fabricated face, a made-up fact, or an inferred condition (`GROW.md`,
  `CRAWLERS.md`).
- **Honest failure.** Broken images, unavailable shards, partial pages are shown as
  such; the wall withholds a wrong count rather than presenting one.
- **Accessible by construction** (see `docs/DESIGN-SYSTEM.md`): headings/landmarks,
  keyboard, visible focus, alt text, a no-JS path that is not a dead control.
- **The aesthetic is load-bearing** and is not to be "modernized" into a generic
  streaming grid.
- **Retire, don't remove-in-name-only** (DEC-0002/0003, pending #42): the comparison
  seam and its `comparison` contract are to be removed; `focus` stays.

## 6. Anti-goals — what UNDERCAST is *not*

- Not a streaming-service grid, not a filter console, not a dashboard.
- Not a front page dominated by performer imagery before the visitor acts (DEC-0005).
- Not a home for a **second** character→performer reveal mechanic, or a boutique one
  that only works for a single curated pair (DEC-0002).
- Not a set of bespoke reveals/navs re-invented per page (DESIGN-SYSTEM §8). Note:
  page-*specific layouts* are legitimate — sharing shell, tokens, and principles is
  the requirement, not visual uniformity.
- Not novelty for its own sake. New ≠ right. The seam was new.

## 7. Role of each page — DEC-0006

- **The wall (`index.html`)** — **discovery and the first optional reveal.** Card
  front = character; card back may reveal the performer + brief human context.
- **Recognition (`recognition.html`)** — **depth**: makers, work, evidence,
  connections.
- **Permanent records (`records/UC-…/`)** — **durable, no-JavaScript evidence.**
- **Coverage** — **completeness and gaps.**
- **Constellations** — **curated relationships.** _(Recommendation on record: has
  **not** yet earned permanent top-navigation; three curated experiments are
  valuable but belong under Explore or within records until the mode has more
  breadth. Owner to ratify.)_

The record does not monopolize "the person" — the wall-card back is the original
first reveal (DEC-0007).

## 8. What must remain mysterious

> The initial view preserves the distance between the remembered character and the
> unfamiliar performer. The visitor chooses when to cross that distance by turning a
> card or opening a record.

## 9. What "done" feels like

> A visitor recognizes someone, chooses to reveal the person, feels a genuine jolt,
> and wants to keep wandering. The archive's rigor is always available but never
> blocks that first moment.

---

**Before touching any HTML/CSS/UX, read this document, `docs/DESIGN-SYSTEM.md`, and
`docs/DECISIONS.md`, and run `docs/UI-REVIEW-CHECKLIST.md`.** `AGENTS.md` requires it.
