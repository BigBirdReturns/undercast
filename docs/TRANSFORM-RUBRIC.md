# The transform scale

`specimen.transform` is a 1–5 grade. It measures **how completely the audience is
prevented from seeing the performer** in that role — not how impressive the design
is, not how famous the performer is, and not how much material was applied.

This document exists because the grade drifted: it was filed by many different
drafting passes over a long period, and a 2026-07-20 blind audit found the archive
and an independent scorer agreeing only 48% of the time, while independent scorers
agreed with *each other* 67% of the time. The scale had been behaving like a smooth
"how impressive is this" gradient. It is a structural test.

## The scale

| | |
| --- | --- |
| **5** | **Total disappearance.** Full creature suit, full-head prosthetic or animatronic mask, a puppet performance where the performer is never on screen, or complete motion-capture replacement. The performer's own face is entirely absent. |
| **4** | **Face substantially replaced.** Heavy prosthetics rebuild most of the head or face; at most the eyes or mouth remain visibly their own. |
| **3** | **Partial redesign.** The design changes how the face reads — forehead ridges, ears, nose pieces, full-coverage graphic paint — while an attentive viewer could still recognize the performer. |
| **2** | **Surface transformation.** Limited makeup, wigs, dental pieces, partial paint. Recognizable at a glance. |
| **1** | **Light disguise.** Minimal appliances or costume; the audience mostly sees the performer. |

Judge the design **as it appeared on screen**. Where a card's prose calls a
performer "unrecognizable," that is house style, not evidence.

## Standing rulings

These resolve questions that recurred often enough to need a written answer.

### Paint is scored by coverage, not by construction method

*Ruled 2026-07-20.* An earlier reading capped paint-based designs at 2 on the
grounds that nothing was structurally rebuilt. That was wrong, and it produced an
absurdity: Margaret Hamilton's green Wicked Witch scored the same as a wig and a
dental piece.

The scale measures concealment, not construction. Paint conceals less than
structural replacement — bone structure, expression, and the performer's own
features survive underneath — but **full-coverage graphic paint that recolors and
re-draws the whole face is a partial redesign, which is the definition of 3**, not
a surface treatment. Partial or limited paint remains 2. Paint combined with
appliances is scored on the combined coverage like any other design.

Affected designs include the Wicked Witch, Darth Maul, Mystique, and Art the Clown.

### Bodily transformation is not facial disappearance — and is an eligibility question

*Ruled 2026-07-20.* Some cards record transformations that are bodily rather than
facial: prosthetic limbs, extreme stature, physique, duplication. The performer's
own face is plainly visible on screen.

`transform` measures the face, so these grade honestly at **1–2**. But a low grade
on such a card is a symptom, not a fix: UNDERCAST's charter is *performers who
vanish under a designed face*, and a performer whose face is fully visible has not
vanished. **These cards are graded by the face rule and flagged for eligibility
review** in `data/TRANSFORM-REVIEW.json` rather than quietly kept at an inflated
grade. Eligibility is a separate decision from grading, and removing a card is the
owner's call — see the review-queue pattern in `GROW.md`.

### Recurring designs get one answer, not many

*Ruled 2026-07-20.* Where a design recurs across many cards — a species makeup, a
franchise mask, a performance mode — the grade is set once as a family principle
and applied consistently, so the shelf is internally coherent. Standing family
principles, and every grade they set, are journalled in
`data/journal/transform.jsonl` with the reasoning that governed them.

- **Star Trek prosthetic species.** Single-zone appliances — Bajoran nose ridge,
  Vulcan and Romulan ears and brow, Klingon forehead ridge and wig, Trill spots —
  are **3**. Cardassian neck-and-forehead scaling and the Ferengi ear-and-cranium
  appliance are **4**. Full-head species built for unrecognizability (Jem'Hadar,
  Vorta, Talaxian, Species 8472, Voth, Kelpien, Discovery Klingons) also cap at
  **4**, because the performer still acts through their own eyes and usually mouth.
  A Star Trek makeup earns **5** only as a true suit, animatronic or puppet head,
  or mocap with no exposed skin. Depart downward on an explicit lighter-than-standard
  signal — TOS-era Klingons predate the ridge redesign and are bronzer and eyebrows,
  not appliance work.
- **Puppeteers.** A performer operating a puppet from off screen is **5**. A 4 is
  defined as "at most the eyes or mouth remain their own," which cannot describe a
  performer whose face never appears at all.
- **Full masks** — lucha and masked wrestling, slasher masks. A rigid full-head
  mask removes the face from the screen: **5**. That the mask is the performer's
  own persona rather than a creature is a different axis and must not lower the
  grade. Paint on bare skin is not a mask; score it by the paint rule above.

## Voice roles

Cards with `kind: "voice"` are outside this scale. Concealment of a *voice* is a
different axis and has not been defined; voice cards were deliberately excluded
from the 2026-07-20 audit rather than graded by a face rule.
