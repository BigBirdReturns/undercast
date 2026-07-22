# DS9 eligibility — a review queue, not a verdict machine

Wall eligibility ("does this performer vanish under a designed face?") is an
**editorial judgment** against GROW.md. Machines cannot make it — they proved,
over several rounds, that any automated threshold (species lookup, regex,
per-character broadcast) is wrong. So this is not an eligibility *projection*. It
is a **review queue**: machines assemble sourced, pinned, verified evidence and
prepare decisions; the **owner** makes them.

```
CONTACT=you@example.com npm run ds9:eligibility:adjudicate   # collect+pin+verify evidence (network)
npm run ds9:eligibility:queue        # build review queue from evidence + owner decisions (offline)
npm run ds9:eligibility:fixtures     # prove the queue contract
npm run ds9:decide:fixtures          # prove authoring failure/rollback behavior
```

## The durable boundary

- **Machines collect, pin, hash, and verify evidence.** Every evidence item is a
  verbatim Memory Alpha quote pinned to a `revision` + `content_sha256` and
  checked to be present in it. No heaviness classifier exists.
- **Every dossier is keyed by the canonical `duplicate_key`** (557 performances,
  no collisions).
- **Shared species information is context only** (`kind: "species-context"`) —
  never a verdict, never broadcast as one.
- **Evidence never crosses performances.** A character-page quote attaches to a
  performance only if it names that performer, or the character had a single
  performer. Melanie Smith does not inherit Batten/Middendorf's Ziyal quote;
  Megan Cole does not inherit Barbeau's Cretak makeup.
- **Explicit voice-only and bare-faced quotes raise a `signal`** — an unambiguous
  hint for the owner — but a signal is **not** a verdict and never moves a
  performance out of review.
- **Editorial decisions live in `eligibility-decisions.json`**, owner-controlled.
  Each decision carries `verdict`, `rationale`, the `evidence_ids` it rests on,
  `decided_by`, `date`, and `grow_md_version`. No machine decides: entries are
  recorded only from an explicit owner command, by hand or through
  `npm run ds9:decide`; the tool is dry-run unless the owner includes `--write`.
- **Everything undecided stays `review`.** No regex, species rule, signal, or
  agent recommendation can change that — only an owner decision.

## Files

| file | who writes it | what it is |
| --- | --- | --- |
| `eligibility-judgments.json` | reader fan-out | raw reader notes + verbatim quotes (input) |
| `eligibility-evidence.json` | machine | per-performance dossiers: pinned, verified evidence + signals |
| `eligibility-decisions.json` | **owner** | the only place verdicts live |
| `eligibility-queue.json` | machine | the review queue: `review` unless the owner decided |
| `eligibility-summary.json` | machine | counts |

## How the owner decides

The authoring tool makes recording a *valid* decision cheap. It never chooses a
verdict, defaults to dry-run, validates the complete prospective decisions file
with the production queue validator, stamps the current GROW.md content hash, and
uses a rollback-capable write protocol:

```
npm run ds9:decide -- --list 25
npm run ds9:decide -- "p6598|c64886"
npm run ds9:decide -- "p6598|c64886" --verdict eligible \
    --cite 2 --rationale "..." --by <owner-handle>              # dry-run
npm run ds9:decide -- "p6598|c64886" --verdict eligible \
    --cite 2 --rationale "..." --by <owner-handle> --write      # record + rebuild + prove
# quote the duplicate_key — every key contains "|", which shells treat as a pipe
```

On `--write`, the tool refuses stale evidence, duplicate decisions, future or
invalid dates, missing authority/rationale, movable law pins, lost updates, and
stray backups from interrupted writes. It writes atomically, rebuilds the queue,
runs eligibility fixtures, and restores both the decision file and queue after a
failed transaction.

The GROW.md law version is stamped automatically as a `sha256:` content hash of
GROW.md at decision time. Equivalently, an owner may add an entry to
`eligibility-decisions.json` by hand, citing evidence IDs from that performance:

```json
{ "duplicate_key": "p6598|c64886", "verdict": "eligible",
  "rationale": "Full Cardassian facial + cranial prosthetic; performer not visible.",
  "evidence_ids": ["p6598|c64886#e2a38c6cf1f56ca9"], "decided_by": "owner", "date": "2026-07-14",
  "grow_md_version": "GROW.md@0123456789abcdef0123456789abcdef01234567" }
```

The `evidence_ids` are **content-addressed** — each is the hash of that evidence
item's complete identity (kind, page, source, pinned revision + content hash,
basis, establishes). If a source revision or quote changes, its id changes, so a
decision citing the old snapshot fails closed instead of silently rebinding. The
`grow_md_version` must be an immutable git SHA or `sha256:` content hash, never a
movable ref like `@main`.

Re-run `ds9:eligibility:queue`; that performance becomes `decided`, while the rest
stay `review`. Approved candidates still go through the normal GROW.md drafting
and evidence gate before anything enters `specimens.json`.
