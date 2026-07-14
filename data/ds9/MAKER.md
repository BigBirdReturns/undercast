# DS9 maker attribution — a review queue, not a verdict machine

"Who built this designed face?" is answered with **plural, typed credits** —
designer, sculptor, applicator, supervisor, shop — each resting on a sourced,
pinned, verified production note. Same shape as DS9 eligibility: machines assemble
receipts and judge applicability; the **owner** curates the credits.

```
CONTACT=you@example.com npm run ds9:maker:adjudicate   # collect+pin+verify+judge applicability (network)
npm run ds9:maker:queue        # build the review queue from evidence + owner decisions (offline)
npm run ds9:maker:fixtures      # prove the contract
```

## The durable boundary — provenance is not applicability

A pinned verbatim quote proves **provenance** (someone wrote this on this page at
this revision). It does **not** prove the quote applies to a given DS9 performance.
"Neville Page designed the Romulan makeup for `{{s|PIC}}`" is a real quote that says
nothing about Adrienne Barbeau's DS9 Cretak. So every pinned item also carries
structured **applicability**, and a `substantive` flag that is true for a
performance only when applicability matches it:

- **DS9, not another production** — no `TNG`/`VOY`/`PIC`/film marker in the quote;
- **not about another performer** — the quote names no performer other than this one;
- **unambiguously this performance** — a character-page quote on a single-performer,
  individually-named character, or a quote that names *this* performer.

Everything else stays **context** (`substantive: false`), visible to the owner but
unable to alone support a credit:

- **species-design notes** ("the Cardassian makeup was designed by …") — a species
  design, not a performance's maker;
- **cross-production quotes** — TNG/VOY/PIC/film attributions;
- **multi-performer, unnamed** quotes — a recast character's season-specific note
  that names no performer (so it can't be pinned to the right one);
- **aggregate pages** — "Unnamed … residents/visitors/personnel", where a quote is
  about one of many subjects.

## Owner decisions are plural typed credits

The canonical credits live only in `maker-decisions.json`, owner-controlled. A
decision is a **list** of credits — a designed face routinely has more than one
maker — and each credit cites one substantive evidence item whose `maker` and
`maker_type` it must match:

```json
{ "duplicate_key": "p6600|c278203",
  "credits": [
    { "maker": "Michael Westmore", "role": "makeup_supervisor", "evidence_id": "<id>" },
    { "maker": "Dave Quashnick",   "role": "makeup_artist",     "evidence_id": "<id>" }
  ],
  "rationale": "Westmore designed and Quashnick applied Martok's makeup.",
  "decided_by": "owner", "date": "2026-07-14" }
```

The build fails if any credit cites a non-substantive (context/provenance-only)
item, names a maker its item does not, uses a `role` that does not equal the item's
`maker_type`, duplicates a `(maker, role)` pair, or is stale/dangling. Evidence ids
are content-addressed, so a changed pinned revision or quote yields a new id and
fails any decision that cited the old snapshot closed.

## Files

| file | who writes it | what it is |
| --- | --- | --- |
| `maker-judgments.json` | reader fan-out | raw verbatim claims (input) |
| `maker-evidence.json` | machine | per-performance dossiers: pinned, verified, applicability-judged |
| `maker-decisions.json` | **owner** | the only place credits live |
| `maker-queue.json` / `maker-summary.json` | machine | the review queue: `review` unless decided |

Nothing enters `specimens.json` without passing the normal GROW.md drafting and
evidence gate afterward.
