# Full-site sweep qualification boundary

This file marks the permanent, post-installer review head for recovery PR #74.
PR #73 merged the installer before its self-cleaning publication transaction; PR #74
executes that transaction and removes the installer, export, trigger, and diagnostic
machinery from the candidate.

The permanent implementation was built and completely gated in workflow run
`30071666093`. That run passed the role-integrity sweep, approved light/dark halftone
absence system, archive-path reconciliation, deterministic rebuild, all archive
invariants, the complete rendered browser suite, and preservation status before
publishing candidate commit `0dec135e47e98b494d39dda54ea4fa6da280ab9b`.

This exact documentation head may merge only after both normal pull-request workflows
pass again:

- `archive-contract`, including `npm run site:sweep` and the rendered regressions;
- `preservation-export`, including preservation-contract validation and an explicit
  decision to reuse or refresh the current snapshot.

The qualifying implementation contains no one-shot installer, export, or diagnostic
workflow. The permanent contract is `docs/FULL-SITE-SWEEP.md`,
`scripts/site-sweep.mjs`, its fixtures, exact role-level species consumers, the
approved `assets/placeholder-light-clean.png` / `placeholder-dark-clean.png` pair,
the separate offline-asset plate, the shared Archive paths component, and the
rendered regressions.
