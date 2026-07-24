# Full-site sweep qualification boundary

This file marks the permanent, post-installer review head for PR #73.

The change may merge only when the exact head passes both canonical workflows:

- `archive-contract`, including the complete rendered browser suite and `npm run site:sweep`;
- `preservation-export`, including preservation-contract validation and an explicit decision to reuse or refresh the current snapshot.

The qualifying implementation must contain no one-shot installer, export, or diagnostic workflow. The permanent contract is `docs/FULL-SITE-SWEEP.md`, `scripts/site-sweep.mjs`, its fixtures, the canonical absence plates, the shared Archive paths component, and the rendered regressions.
