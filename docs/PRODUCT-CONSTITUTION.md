# UNDERCAST — Product Constitution

**This is the canonical authority for the UNDERCAST experience.** Where this
document and any other essay, comment, or prior implementation disagree about what
the site should *feel like* or *do*, this document wins. Hard rules cite a decision
in `docs/DECISIONS.md`; that decision, not this prose, is the law — this document
explains and binds them together.

Ratification: this is a **draft for the owner**. Sections marked _(owner: confirm)_
are the owner's voice and need their sign-off before they bind. Everything citing a
`DEC-NNNN` marked **Active** already binds.

---

## 1. Purpose and audience

UNDERCAST is a **field index of the performers who vanish under a designed face** —
prosthetics, masks, creature suits, motion capture, unseen voices — and of the
makers who built those faces. It restores the person (and the makers) to the
character the audience remembers.

The audience is **fans**, not archivists: someone who has watched a face for hours
and would walk past the person on the street. We build for the jolt of *"wait —
that was them?"*, backed by real provenance so the jolt is true. _(owner: confirm.)_

## 2. Emotional sequence

The site moves in one direction: **Reveal → Explore → Verify.**

1. **Reveal** — restore one remembered character, and make the visitor feel the
   pull to know who was under it. The opening is character-first (§4).
2. **Explore** — offer honest ways in (the two lenses, search as fan intent
   [DEC-0004], curated entry points), never a filing console.
3. **Verify** — the record, the makers, the sources, the coverage. Evidence lives
   here, not on the front door (DEC-0006, proposed).

## 3. The card flip is the core primitive — DEC-0001

The **trading-card flip** is the one signature reveal: character on the front, the
person underneath on the back; a whole image at a time. It is the founding metaphor
and it scales to the whole roster without curation. Everything is built from it or
subordinate to it.

> **STOP (DEC-0001).** No second signature reveal mechanic without a decision that
> explicitly supersedes DEC-0001. The seam died of this rule; so does the next one.

## 4. Initial-view and reveal rules — DEC-0005

- The **opening view presents the character only.** No performer portrait in the
  opening — not beside the character, not behind an opening flip.
- **Meeting the performer is earned**, and happens when the visitor **opens a
  record**. The reveal is the payoff; a payoff shown for free is spent for free.
- The homepage hero is therefore **not** a hero-scale flip-to-a-face. The flip
  (DEC-0001) is the **wall-card and record** primitive, reached by intentional
  action past the opening.

> **STOP (DEC-0005).** No performer photograph may dominate or appear in the
> homepage opening viewport. Supersede DEC-0005 in words before writing the CSS.

## 5. Non-negotiables

- **The card flip is the reveal** (DEC-0001).
- **The opening is character-only** (DEC-0005).
- **Provenance never lies.** Missing evidence is shown as missing — never a
  fabricated face, a made-up fact, or an inferred condition. (See `GROW.md`,
  `CRAWLERS.md`; this is the archive's founding non-negotiable.)
- **Honest failure.** A broken image, an unavailable shard, a partial page is shown
  as such; the wall withholds a wrong count rather than presenting one.
- **Accessible by construction.** Real headings and landmarks, keyboard operation,
  visible focus, meaningful alt text, and a no-JavaScript path that is not a dead
  control (see `docs/DESIGN-SYSTEM.md`).
- **The aesthetic is load-bearing** and is not to be "modernized" into a generic
  streaming grid (DESIGN-SYSTEM §1).

## 6. Anti-goals — what UNDERCAST is *not*

- Not a streaming-service grid, not a filter console, not a dashboard.
- Not a place that spoils the person on the front page (DEC-0005).
- Not a home for a **second** signature interaction or a boutique mechanic that
  only works for one curated pair (DEC-0002).
- Not a per-page microsite: surfaces do not each invent their own reveal, their own
  nav, their own aesthetic (DESIGN-SYSTEM §8).
- Not novelty for its own sake. New ≠ right. The seam was new.

## 7. Role of each page — DEC-0006 (proposed)

- **The wall (`index.html`)** owns **discovery**: browse, search, lenses, the
  character faces. It is the front door.
- **The record (`recognition.html`, `records/UC-…/`)** owns **the person and the
  evidence**: performer, makers, provenance, connections. This is where the reveal
  is earned.
- **Coverage / Constellations** are **sourced navigation**, not primary
  destinations; they justify their top-nav presence by depth of evidence, not by
  being interesting experiments. _(owner: confirm whether Constellations has yet
  earned permanent top-nav status.)_

## 8. What must remain mysterious _(owner: confirm / rewrite — this is your voice)_

- **Who the person is, until you turn the card or open the record.** The name may
  be spoken; the face is earned (DEC-0005).
- The wall should feel like there is always *someone you didn't expect* one flip
  away. Draft: preserve the "⚄ random" jolt and never let the opening pre-spend it.

## 9. What "done" feels like _(owner: confirm / rewrite — this is your voice)_

Draft: a visitor lands, recognizes a character, feels the pull, turns one card (or
opens one record), gets the jolt of the person underneath — and *then* wants to see
who else. Nothing on the way in asked them to operate a catalog. It feels authored,
honest, and a little bit like a collection you'd keep. If a change makes the front
door feel more like a database, it is not done — it is regressed.

---

**Before touching any HTML/CSS/UX, read this document, `docs/DESIGN-SYSTEM.md`, and
`docs/DECISIONS.md`, and run `docs/UI-REVIEW-CHECKLIST.md`.** `AGENTS.md` requires it.
