# UNDERCAST — UI Review Checklist

**Run this before opening any pull request that touches HTML, CSS, or the
experience.** Copy the checklist into the PR description and fill it in. A reviewer
should reject a UI PR that does not carry it. Read
`docs/PRODUCT-CONSTITUTION.md`, `docs/DESIGN-SYSTEM.md`, and `docs/DECISIONS.md`
first — `AGENTS.md` requires it.

## Intent — answer in the PR, in words

- [ ] **Which constitution principle / decision does this serve?** Cite the
      `DEC-NNNN`(s). If it changes a decision, it must **supersede** it in
      `docs/DECISIONS.md` in the same PR.
- [ ] **Does an existing primitive already solve this?** (The flip, the absence
      graphic, the site shell, the record generator.) If yes, use it — do not build
      a new one.
- [ ] **Is this adding a second signature interaction?** If it could be read as a
      new reveal mechanic, STOP — DEC-0001 forbids it without supersession.
- [ ] **What does the visitor see *before acting*?** Confirm the opening view obeys
      DEC-0005 (character only; no performer portrait in the first viewport).
- [ ] **Is this a per-page microsite?** Confirm it reuses shared components and does
      not invent bespoke nav/aesthetic/reveal (DESIGN-SYSTEM §8).

## Evidence — attach, do not assert

- [ ] **Screenshots**: desktop **and** mobile, **before and after**, for every
      changed surface.
- [ ] **Keyboard**: the change is operable by keyboard; focus is visible and lands
      sensibly (state which keys you pressed).
- [ ] **No-JavaScript**: screenshot or describe the surface with JS disabled — no
      dead controls (DESIGN-SYSTEM §9).
- [ ] **Accessibility**: headings/landmarks, alt text, ≥24px targets, contrast ≥
      the AA floor (DESIGN-SYSTEM §1), reduced-motion.

## Gate — run the whole thing, paste the exact commands and output

The "workflow-equivalent" gate is what `.github/workflows/validate.yml` runs. Run
**all** of it locally and paste the **exact commands you ran** and their output:

```
node scripts/shard.mjs && git diff --exit-code   # projections deterministic (refuse drift)
node scripts/validate.mjs                          # archive invariants
npm run audit:corpus                               # semantic corpus
npm run test:site-seams                            # navigation / recovery / a11y seams
npm run test:rendered                              # Chromium interactions — REQUIRED, not optional
```

- [ ] Every command above ran and passed. Paste the tail of each.
- [ ] Contract hashes rebuilt (`npm run build:contract`) if any web asset changed.

## The honesty rule — non-negotiable

- [ ] **No "green" claim unless every required check above actually ran.** Running
      three of five checks and reporting "gate green" is a defect. If a check could
      not run (e.g. a sandbox limitation), say **exactly which check, why, and what
      you did instead** — do not round up to green.
- [ ] Report failures faithfully: which test, the real reason, and whether it is
      caused by this change or pre-existing/environmental (prove it — e.g. the file
      is unchanged vs. `main`).

> The seam excursion, and the "full gate green" that was 3-of-4, both came from
> skipping this section. It exists so the next agent cannot.
