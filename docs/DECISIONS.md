# UNDERCAST — Decision Log

Append-only. Every architectural or design decision about the **experience** lives
here as a numbered entry. Never edit a decision to change its meaning; to change a
decision, add a new entry that **Supersedes** it and mark the old one **Superseded**.

UI/UX pull requests must cite the decision number(s) they serve or change
(see `docs/UI-REVIEW-CHECKLIST.md`). If a change contradicts an Active decision
and does not supersede it, it is out of bounds — reviewers should reject it.

Status values: **Active** · **Superseded by DEC-NNNN** · **Proposed** (awaiting owner ratification).

---

## DEC-0001 — The card flip is the signature reveal
**Status:** Active · 2026-07-13

The single signature interaction of UNDERCAST is the **trading-card flip**:
the remembered character on the front, the person underneath on the back. It is a
*temporal* reveal — one whole image at a time — so it works for every pair with no
per-image alignment. It is the primitive; everything else is built from it or
subordinate to it.

**Because:** it is the project's founding metaphor ("Every card flips…" — README,
line 5) and the emotional core the maintainer grew up on (trading cards). It scales
to all 1,000+ records without curation, which spatial comparisons cannot.

> **STOP.** Do not introduce a *second* signature reveal mechanic (seam, slider,
> dissolve, star-wipe, morph, hover-swap, carousel, …) without a new decision here
> that explicitly **supersedes DEC-0001**. "It's cooler" is not a supersession.

---

## DEC-0002 — The comparison seam is retired
**Status:** Active · 2026-07-13 · Supersedes the interactive Recognition Loop "Compare in one frame" overlay

The draggable seam that composited two half-faces into one frame is retired. It
produced a *chimera* that only reads as a morph when the pair is registered
(scale, angle, eye-line); exactly one pair (Morn) was ever curated for it, and its
per-image `comparison` alignment profile did not generalize. The record's reveal is
its **side-by-side character/person plates**; the front-door and wall reveal is the
flip (DEC-0001).

**Because:** it was a redesign-pass invention that competed with the flip
(DEC-0001) and demanded curation the roster does not have. See also DEC-0003.

---

## DEC-0003 — `focus` retained; `comparison` retired
**Status:** Active · 2026-07-13

The image `focus` field (`{x,y}` upper-center crop framing) is **retained** — it is
the crop system every surviving surface uses (wall cards, record plates, permanent
record pages). The image `comparison` field (`{x,y,scale}` seam alignment) is
**removed** in full: schema, data, validator invariant, docs, and tests. Contract
boundary confirmed by the owner.

**Because:** `focus` is load-bearing for the plates and records; `comparison` only
ever fed the retired seam (DEC-0002). Keeping dead contract invites the next agent
to "use" it.

---

## DEC-0004 — Search is fan intent, not administration
**Status:** Active · 2026-07-13

The wall's search is a **fan-facing question** — "Who are you trying to place?" —
not an advanced-query/administration surface. It stays a visible field. It looks up
a character, a performer, or a production the visitor half-remembers; it is not a
filter console.

**Because:** the audience is fans who remember a face, not archivists running
queries. Advanced facets exist (shelf/decade/species/maker) but are subordinate,
below the fold, and never the greeting.

---

## DEC-0005 — No performer imagery in the opening; the person is met in the record
**Status:** Active · 2026-07-13 · Owner ruling (verbatim option chosen: *"No performer until the record"*)

The **opening view** (the first viewport / the front-door hero) presents the
**character only**. No actor portrait appears in the opening — not beside the
character, and not behind an opening flip. Meeting the performer is an **earned**
moment that happens when the visitor **opens a record**. Consequently, the homepage
hero is **not** a hero-scale flip-to-a-face: the flip (DEC-0001) remains the
**wall-card and record** primitive, reached by intentional action past the opening,
not the front-door reveal.

**Because:** the reveal is the payoff, and a payoff shown for free on the front page
is spent for free. Both the retired seam (DEC-0002) and the current homepage flip
hero put the performer's face at hero scale above the fold — this decision rules
that out and is the reason the homepage hero must be reworked to character-only.

> **STOP.** No performer photograph, portrait, or flip-to-performer may dominate or
> appear in the opening viewport of the homepage. If you believe a specific case
> warrants it, supersede this decision here first — in words — before writing CSS.

**Known consequence:** the flip-hero homepage (PR "Homepage: reveal → explore →
verify") predates this ruling and violates it. It must be revised to a
character-only opening under this decision before it can merge.

---

## DEC-0006 — Discovery lives on the wall; evidence and the person live in the record
**Status:** Proposed · 2026-07-13 (owner to ratify)

Page ownership: **index.html (the wall)** owns *discovery* — browse, search, the
lenses, the character faces. **recognition.html / records/UC-…/ (the record)** owns
*evidence and the person* — the performer, the makers, provenance, connections.
Coverage and Constellations are *sourced navigation*, not primary destinations.

**Because:** every page trying to do everything is how the front door filled with
filing furniture. Naming who owns what stops each surface from re-litigating it.

---

## Proposed / open — awaiting owner ruling

- **DEC-0007 (open):** Does a **wall card** flipping to the performer count as
  "meeting the person," or is the wall-card back also character-adjacent until the
  record? DEC-0005 rules the *opening*; the wall-card flip below the fold is the
  primitive (DEC-0001) — confirm the person may appear there, or restrict it.
- **DEC-0008 (open):** When has a **visual experiment earned permanence**? (What is
  the bar before a new interaction becomes a documented primitive vs. a one-off.)
