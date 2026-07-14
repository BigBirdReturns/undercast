# DS9 maker attribution — a review queue, not a verdict machine

"Who built this designed face?" — makeup supervisor, artist, prosthetics/creature
shop, sculptor — is an attribution that must rest on a **sourced production note**,
never a guess. So this is a **review queue**, the same shape as DS9 eligibility:
machines assemble sourced, pinned, verified maker quotes and prepare decisions; the
**owner** curates the canonical maker.

```
CONTACT=you@example.com npm run ds9:maker:adjudicate   # collect+pin+verify maker quotes (network)
npm run ds9:maker:queue        # build the review queue from evidence + owner decisions (offline)
npm run ds9:maker:fixtures      # prove the contract
```

## The durable boundary

- **Machines collect, pin, hash, and verify.** Every evidence item is a verbatim
  Memory Alpha quote naming a maker, pinned to a `revision` + `content_sha256` and
  checked to be present in it. No maker is invented; a page that names no maker
  yields no claim (silence is not evidence).
- **Every dossier is keyed by the canonical `duplicate_key`** (557 performances).
- **A maker is character-scoped.** A character's makeup design is one thing, shared
  by every performer of that character, so a maker read off the character page
  attaches to all of that character's performances. This is correct sharing — not
  the cross-performer leakage the eligibility lane forbids (there the transformation
  is per-performer; here the maker is per-design).
- **`verified_makers` are hints, not verdicts.** They never move a performance out
  of review.
- **The canonical maker lives only in `maker-decisions.json`**, owner-controlled.
  Each decision names the `canonical_maker`, cites the `evidence_ids` it rests on
  (at least one substantive verified/pinned quote that actually names that maker),
  and carries `rationale`, `decided_by`, `date`. No machine writes it.
- **Everything undecided stays `review`.**

## Files

| file | who writes it | what it is |
| --- | --- | --- |
| `maker-judgments.json` | reader fan-out | raw reader claims + verbatim quotes (input) |
| `maker-evidence.json` | machine | per-performance dossiers: pinned, verified maker quotes |
| `maker-decisions.json` | **owner** | the only place the canonical maker lives |
| `maker-queue.json` | machine | the review queue: `review` unless the owner decided |
| `maker-summary.json` | machine | counts + distinct verified makers |

## How the owner decides

Add an entry to `maker-decisions.json`, citing the evidence IDs from that
performance's dossier and naming the canonical maker exactly as a cited quote does:

```json
{ "duplicate_key": "p6598|c64886", "canonical_maker": "Michael Westmore",
  "maker_type": "makeup_supervisor",
  "rationale": "Production note credits Westmore's department for the Cardassian makeup.",
  "evidence_ids": ["<content-addressed id from the dossier>"],
  "decided_by": "owner", "date": "2026-07-14" }
```

The `evidence_ids` are **content-addressed** (a hash of each item's kind, page,
source, pinned revision + content hash, basis, and establishes), so a changed
revision or quote yields a new id and any decision citing the old snapshot fails
closed. A decision is rejected — and the build fails — if it cites missing evidence,
cites no substantive quote, names a maker no cited quote establishes, duplicates an
evidence id or another decision, or carries incomplete metadata. Approved makers
still go through the normal GROW.md drafting and evidence gate before anything
enters `specimens.json`.
