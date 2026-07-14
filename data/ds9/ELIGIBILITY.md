# DS9 eligibility — a review queue, not a verdict machine

Wall eligibility ("does this performer vanish under a designed face?") is an
**editorial judgment** against GROW.md. Machines cannot make it — they proved,
over several rounds, that any automated threshold (species lookup, regex,
per-character broadcast) is wrong. So this is not an eligibility *projection*. It
is a **review queue**: machines assemble sourced, pinned, verified evidence and
prepare decisions; the **owner** makes them.

```
CONTACT=you@example.com npm run ds9:eligibility:adjudicate   # collect+pin+verify evidence (network)
npm run ds9:eligibility:queue        # build the review queue from evidence + owner decisions (offline)
npm run ds9:eligibility:fixtures      # prove the contract on 10 hard performances
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
  `decided_by`, `date`, and `grow_md_version`. No machine writes to it.
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

Add an entry to `eligibility-decisions.json`, citing the evidence IDs from that
performance's dossier:

```json
{ "duplicate_key": "p6598|c64886", "verdict": "eligible",
  "rationale": "Full Cardassian facial + cranial prosthetic; performer not visible.",
  "evidence_ids": ["p6598|c64886#2"], "decided_by": "owner", "date": "2026-07-14",
  "grow_md_version": "GROW.md@<sha>" }
```

Re-run `ds9:eligibility:queue`; that one performance becomes `decided`, the rest
stay `review`. A decision that cites evidence which doesn't exist is rejected as
dangling, never silently applied. Approved candidates still go through the normal
GROW.md drafting and evidence gate before anything enters `specimens.json`.
