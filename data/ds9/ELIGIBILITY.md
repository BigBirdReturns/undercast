# DS9 eligibility — a per-performance GROW.md projection

A first-pass ruling on every canonical performance in `roster.json` against the
GROW.md wall law:

> a real, verifiable performer who **vanishes under a designed face** — heavy
> prosthetics, a mask, a full creature suit, motion capture, or an unseen
> voice-only role. … If the audience mostly sees the performer *as themselves*,
> it doesn't qualify.

**This decides nothing.** It is a sourced projection, not an ingestion. Nothing
here enters `specimens.json`; `review` verdicts are candidates for a later,
separately-authorized per-performance adjudication.

```
npm run ds9:eligibility            # rebuild eligibility.json + summary (offline, deterministic)
npm run ds9:eligibility:fixtures    # regression checks
```

## Method

Deterministic and offline. Each performance is judged from the **sourced species**
already in the census graph (`graph/edges.json` `is_species` edges). Every verdict
cites GROW.md and, for a decided verdict, the Memory Alpha source of the species.

| verdict | when | why it's safe |
| --- | --- | --- |
| `eligible` | character species is a **full designed face** in DS9 production design (Cardassian, Klingon, Ferengi, Jem'Hadar, Vorta, Changeling, Breen, …) | for these species there is no "light" version — the performer is never seen as themselves, so per-performance and per-species coincide. |
| `ineligible` | character is **Human / Augment** | the audience sees the performer as themselves; GROW.md's explicit disqualifier. |
| `review` | **light-makeup** species (Bajoran ridge, Trill spots, Vulcan/Romulan ears) **or** no species established | whether a light addition "vanishes under a designed face" is a per-performance call; a heavily-transformed Bajoran can still qualify, so it is **never auto-excluded**. |

The exact species tiers are recorded in `eligibility-summary.json` (`rule_tiers`).

## Invariant

`invariant_on_wall_ruled_ineligible` **must be 0**: nothing already on the wall may
be ruled ineligible (it passed GROW.md when it was added). A wall member may land
in `review` — this surfaces either a per-performance borderline the owner
deliberately included (Leeta, `transform: 1`) or a **census species gap** (Gaila:
a Ferengi with no `is_species` edge). Those appear in
`diagnostic_on_wall_in_review` — informational, not a contradiction.

## Row fields

`performer`, `character` (+ pageids), `species`, `verdict`, `reason`
(performance-specific), `basis`, `on_wall` / `wall_ids`, and `citations[]`
(GROW.md + species source).
