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
- [ ] **What does the visitor see in the default opening, before acting?** Confirm
      it is not dominated by performer imagery (DEC-0005).
- [ ] **Does it invent a bespoke reveal/nav/aesthetic?** Page-specific *layout* is
      fine; a bespoke reveal or nav is not (DESIGN-SYSTEM §8).

## Evidence — attach, do not assert

- [ ] **Screenshots**: desktop **and** mobile, **before and after**, every changed
      surface.
- [ ] **Keyboard**: operable; focus visible and lands sensibly (say which keys).
- [ ] **No-JavaScript**: screenshot/describe with JS disabled — no dead controls.
- [ ] **Accessibility**: headings/landmarks, alt text, ≥24px targets, contrast ≥ the
      AA target, reduced motion.
- [ ] Tested across **representative records and states** (missing-image, voice-only,
      partial-load), not one perfect specimen.

## Gate — run the WHOLE workflow; paste exact commands and output

This must mirror **`.github/workflows/validate.yml` in full**. As of this writing
that workflow runs, in order:

```
npm ci
npx playwright install --with-deps chromium
node scripts/shard.mjs
git diff --exit-code                      # projections deterministic (refuse drift)
node scripts/validate.mjs                 # archive invariants
npm run audit:corpus                      # semantic corpus
npm run test:site-seams                   # navigation / recovery / a11y seams
node scripts/build-record-pages.mjs       # permanent record routes  ← required
npm run test:rendered                     # Chromium interactions     ← required
test "$(find records -mindepth 1 -maxdepth 1 -type d | wc -l)" = \
  "$(node -p "require('./data/specimens.json').length + require('./data/tombstones.json').records.length")"   # route count ← required
```

- [ ] Every step above ran and passed. Paste the tail of each.
- [ ] `npm run build:contract` run if any web asset changed (hashes rebuilt).

> **This list is a fragile copy of an evolving workflow.** The intended fix is a
> single **`npm run gate`** script that both CI and this checklist invoke, so there
> is one source of truth. Until that exists, **re-diff this block against
> `validate.yml` every time** — if they disagree, `validate.yml` is authoritative
> and this file is wrong.

## The honesty rule — non-negotiable

- [ ] **No "green" claim unless every step above actually ran.** Running some of the
      steps and reporting "gate green" is a defect (it has happened here — a
      "full gate green" that was three of four checks).
- [ ] If a step could not run (e.g. a sandbox limitation), say **exactly which,
      why, and what you did instead** — do not round up to green.
- [ ] Report failures faithfully: which test, the real reason, and whether this
      change caused it or it is pre-existing/environmental (**prove it** — e.g. the
      file is byte-identical to `main`).
- [ ] **Never attribute words to the owner they did not say.** A decision, a
      "verbatim" quote, or an "owner ruling" must be exactly that. Laundering agent
      or reviewer advice into owner authority is the specific failure this whole
      document set exists to stop.
