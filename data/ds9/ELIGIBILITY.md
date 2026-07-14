# DS9 eligibility — a per-performance GROW.md projection

A ruling on every canonical performance in `roster.json` against the GROW.md wall
law:

> a real, verifiable performer who **vanishes under a designed face** — heavy
> prosthetics, a mask, a full creature suit, motion capture, or an unseen
> voice-only role. … If the audience mostly sees the performer *as themselves*,
> it doesn't qualify.

**This decides nothing about the wall.** It is a sourced projection, not an
ingestion. Nothing here enters `specimens.json`.

```
npm run ds9:eligibility            # rebuild eligibility.json + summary (offline, deterministic)
npm run ds9:eligibility:fixtures    # contract checks
```

## Species does not decide — evidence does

A verdict of `eligible` / `ineligible` is **derived from performance-specific,
sourced evidence** held in `eligibility-evidence.json` — never from species:

- **transformation** — what was used (full facial prosthetic, creature suit, mask,
  motion capture, voice-only, light nasal appliance, none).
- **extent** — full / partial / light / none.
- **visible_as_self** — was the audience seeing the performer as themselves?
- **sources** — the Memory Alpha pages that support those facts.

The engine derives the verdict:

| verdict | derived when |
| --- | --- |
| `eligible` | `visible_as_self: false` and a full/partial designed transformation, with sources |
| `ineligible` | `visible_as_self: true`, or transformation none/light, with sources |
| `review` | no sourced evidence yet, or the evidence is not decisive |

Species is recorded only as a `review_priority`
(`likely-designed-face` / `likely-humanlike` / `borderline-light-makeup` /
`unknown`) — a hint for ordering the adjudication queue. A Cardassian with no
adjudicated evidence is still `review`; a heavily-transformed Bajoran can become
`eligible` once the evidence says so.

## The wall does not override evidence

There is no rule forcing a wall member to be eligible. If sourced evidence rules
an on-wall performance `ineligible`, that is recorded in
`diagnostic_evidence_contradicts_wall` for a human to reconcile — evidence is
never overridden by membership, in either direction.

## Trajectory

Until the sourced adjudication pass populates `eligibility-evidence.json`, the
honest result is **every performance `review`**. The adjudication (a
Memory-Alpha-grounded, per-character reading of the actual transformation) then
turns sourced facts into verdicts. `review` verdicts that remain are candidates
for further, separately-authorized adjudication.

## Row fields

`performer`, `character` (+ pageids), `species` (context only), `review_priority`,
`verdict`, `reason`, `evidence` (`transformation` / `extent` / `visible_as_self` /
`sources`, or `null`), `on_wall` / `wall_ids`, `citations[]`.
