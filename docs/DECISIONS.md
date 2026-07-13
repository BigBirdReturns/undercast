# UNDERCAST — Decision Log

Append-only. Every architectural or design decision about the **experience** lives
here as a numbered entry. Never edit a decision to change its meaning; to change a
decision, add a new entry that **Supersedes** it and mark the old one **Superseded**.

UI/UX pull requests must cite the decision number(s) they serve or change
(see `docs/UI-REVIEW-CHECKLIST.md`). If a change contradicts an **Active** decision
and does not supersede it, it is out of bounds.

**Status values and their meaning — read this:**

- **Active** — ratified by the owner and true of the repository now. Binding.
- **Accepted; implementation pending (#NN)** — the owner has accepted the
  *direction*, but the repo does not yet match it; the named PR implements it. Do
  not cite these as describing current repo state.
- **Proposed** — drafted, awaiting the owner's ruling. Not binding.

A decision must never describe repository state falsely. "Accepted" is a
destination; "Active" is a fact.

---

## DEC-0001 — The card flip is the signature character→performer reveal
**Status:** Active · 2026-07-13

The signature interaction for showing **the character and then the person** is the
**trading-card flip**: the remembered character on the front, the performer
underneath on the back. It is a *temporal* reveal — **one unsplit frame at a time**
(the cards use `object-fit: cover` and do crop; "unsplit" means the two faces are
never composited into a single frame) — so it works for every pair with no
per-image alignment.

**Because:** it is the founding metaphor ("Every card flips…" — README) and scales
to the whole roster without curation, which spatial comparisons cannot.

> **STOP.** Do not introduce a *second* mechanic for the **character→performer
> reveal** (seam, before/after slider, dissolve, wipe, morph, hover-swap) without a
> decision that explicitly **supersedes DEC-0001**. This governs the
> character↔performer reveal only — it does **not** restrict unrelated interactions
> elsewhere (carousels, the constellation graph, maps, filters).

---

## DEC-0002 — Retire the comparison seam
**Status:** Accepted; implementation pending (#42) · 2026-07-13

The draggable "Compare in one frame" overlay — which composited two half-faces into
one frame — is to be retired. It produced a chimera that only reads as a morph for a
registered pair (scale, angle, eye-line); one pair (Morn) was ever curated for it.
The record's reveal is its **side-by-side plates**; the character↔performer reveal
is the flip (DEC-0001).

**Repo state:** `main` still ships the seam and still *requires* it in
`validate.mjs` and the rendered tests. PR #42 removes it. Until #42 merges, this is
the intended destination, not the current state.

---

## DEC-0003 — Retain `focus`; remove `comparison`
**Status:** Accepted; implementation pending (#42) · 2026-07-13

The image `focus` field (`{x,y}` upper-center crop framing) is **retained** — it is
the crop system the wall cards, record plates, and permanent record pages all use.
The image `comparison` field (`{x,y,scale}` seam alignment) is to be **removed** in
full: schema, data, validator invariant, docs, tests. Owner-confirmed contract
boundary.

**Repo state:** `main` still defines and validates `comparison`. PR #42 removes it.

---

## DEC-0004 — Search is fan intent, not administration
**Status:** Proposed · 2026-07-13

Direction: the wall's search is a **fan-facing question** ("who are you trying to
place?"), a visible field, not an advanced-query/administration console. Advanced
facets (shelf/decade/species/maker) exist but are subordinate.

**Not yet ratified:** neither the search's prominence nor the exact copy
"Who are you trying to place?" has an owner ruling. Awaiting decision.

---

## DEC-0005 — The default opening must not be dominated by performer imagery
**Status:** Active · 2026-07-13 · Owner decision

> The homepage's default opening state must not be dominated by performer imagery.
> Character imagery or archive artwork comes first. A performer photograph appears
> only after deliberate visitor action.

**Because:** the reveal is the payoff; the front door should present the remembered
character (or archive artwork), and the performer is something the visitor chooses
to surface.

**Not decided here:** whether the current flip-hero homepage (PR #43) — where the
performer starts hidden behind an explicit flip — still feels wrong at hero scale.
The performer there *does* appear only after deliberate action, so it is not
self-evidently a violation. Whether that hero-scale reveal is nonetheless too much
is the **owner's** open call, not an agent's to declare.

_(Correction, recorded for honesty: an earlier draft of this entry stated the
decision as "No performer until the record" and attributed it as a verbatim owner
ruling. That wording was an agent's option label, not the owner's words, and was
materially stronger — it would have eliminated the original wall-card reveal. The
text above is the owner's actual decision.)_

---

## DEC-0006 — Page ownership
**Status:** Active · 2026-07-13 · Owner decision

- **The wall (`index.html`)** owns **discovery and the first optional reveal.** The
  wall-card **front** shows the character; its **back** may reveal the performer and
  brief human context.
- **Recognition (`recognition.html`)** owns **depth**: makers, work, evidence, and
  connections.
- **Permanent records (`records/UC-…/`)** own **durable, no-JavaScript evidence.**
- **Coverage** owns **completeness and gaps.**
- **Constellations** owns **curated relationships.**

The record does **not** hold an exclusive monopoly on "the person" — the wall-card
back is the original, intentional first reveal (DEC-0007). Removing it would destroy
the founding design.

---

## DEC-0007 — The wall card may reveal the performer
**Status:** Active · 2026-07-13 · Owner decision

Yes — the wall card may reveal the performer on its back. That is the original
product. The reveal is **earned** because the visitor **intentionally turns the
card**; the card's initial state remains **character-first**.

---

## DEC-0008 — When a visual experiment has earned permanence
**Status:** Active · 2026-07-13 · Owner decision

A visual experiment remains **isolated and non-canonical** until **all** of the
following are true:

1. It solves a **documented, recurring** user need.
2. It is **tested across representative records** — including missing-image states,
   mobile, keyboard, and no-JavaScript — not one perfect specimen.
3. It **adds no schema or archive-contract fields** during experimentation.
4. It **reuses the existing reveal primitive** (DEC-0001) or **explicitly proposes
   superseding it** here.
5. The **owner reviews actual desktop and mobile renders.**
6. The **complete gate passes** (`docs/UI-REVIEW-CHECKLIST.md`).
7. The **owner explicitly promotes it** with an entry in this log.

Until then it does not get schema, does not get a validator invariant, and does not
get called a primitive.
