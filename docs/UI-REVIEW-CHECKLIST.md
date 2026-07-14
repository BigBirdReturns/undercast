# UNDERCAST — UI Review Checklist

**Run this before opening any pull request that touches HTML, CSS, or the
experience.** Copy it into the PR and fill it in. Reviewers reject a UI PR that does
not carry it. Read `docs/PRODUCT-CONSTITUTION.md`, `docs/DESIGN-SYSTEM.md`, and
`docs/DECISIONS.md` first — `AGENTS.md` requires it.

## Intent — answer in the PR, in words

- [ ] **Which decision(s) does this serve?** Cite the `DEC-NNNN`(s). If it changes a
      decision, it must **supersede** it in `docs/DECISIONS.md` in the same PR.
- [ ] **Does an existing primitive already solve this?** (The flip, the absence
      graphic, the site shell, the record generator.) If yes, use it.
- [ ] **Is this a second character→performer reveal mechanic?** If so, STOP —
      DEC-0001 forbids it without supersession. (Unrelated interactions are fine.)
- [ ] **What does the default opening show, before the visitor acts?** Confirm it is
      character-first, not dominated by performer photography (DEC-0005).
- [ ] **Does it invent a bespoke reveal/nav/aesthetic?** Page-specific *layout* is
      fine; a bespoke reveal or nav is not (DESIGN-SYSTEM §8).

## Evidence — attach, do not assert

- [ ] **Screenshots**: desktop **and** mobile, **before and after**, every changed surface.
- [ ] **Keyboard**: operable; focus visible and lands sensibly (say which keys).
- [ ] **No-JavaScript**: screenshot/describe with JS disabled — no dead controls.
- [ ] **Accessibility**: headings/landmarks, alt text, ≥24px targets, contrast ≥ AA,
      reduced motion.
- [ ] Tested across **representative records and states** (missing-image, voice-only,
      partial-load), not one perfect specimen.

## Gate — run the canonical gate; do not copy its commands here

**`.github/workflows/validate.yml` is the canonical gate (DEC-0011).** Run it in
full and paste the tail of each step's output. This checklist deliberately does
**not** reproduce the shell commands — a second copy drifts (DEC-0011). Read
`validate.yml` for the exact steps each time, and confirm every **category** passes:

- [ ] **Projections deterministic** — rebuild, refuse drift.
- [ ] **Archive invariants** — the invariant gate.
- [ ] **Semantic corpus** — the corpus audit.
- [ ] **Site seams** — navigation / recovery / accessibility.
- [ ] **Permanent record routes** — generated.
- [ ] **Rendered interactions** — the Chromium suite. **Required, not optional.**
- [ ] **Route count** — records match specimens + tombstones.
- [ ] `build:contract` run if any web asset changed (hashes rebuilt).

If this summary and the workflow ever disagree, **the workflow wins.** The tracked
fix is a single **`npm run gate`** that both CI and this checklist invoke; until it
exists, `validate.yml` is the one source of truth.

## The honesty rule — non-negotiable

- [ ] **No "green" claim unless every category above actually ran.** Running some of
      the checks and reporting "gate green" is a defect — it has happened here.
- [ ] If a step could not run (e.g. a sandbox limitation), say **exactly which, why,
      and what you did instead** — do not round up to green.
- [ ] Report failures faithfully: which check, the real reason, and whether this
      change caused it or it is pre-existing/environmental (**prove it**).
- [ ] **Never attribute words to the owner they did not say.** A decision, a
      "verbatim" quote, or an "owner ruling" must be exactly that. Laundering agent
      or reviewer advice into owner authority is the specific failure this whole
      document set exists to stop.
