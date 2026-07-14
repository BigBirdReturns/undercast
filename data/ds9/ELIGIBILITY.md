# DS9 eligibility — GROW.md, from verified evidence

A ruling on every canonical performance in `roster.json` against GROW.md:

> a real, verifiable performer who **vanishes under a designed face** — heavy
> prosthetics, a mask, a full creature suit, motion capture, or an unseen
> voice-only role. … If the audience mostly sees the performer *as themselves*,
> it doesn't qualify.

**Decides nothing about the wall.** Sourced projection, not an ingestion. `review`
verdicts are candidates for a later, separately-authorized pass. Built with the
reusable adjudication harness — see [`docs/ADJUDICATION.md`](../../docs/ADJUDICATION.md).

```
# 1. reader fan-out returns verbatim basis quotes  -> data/ds9/eligibility-judgments.json
# 2. pin + verify (network):
CONTACT=you@example.com npm run ds9:eligibility:adjudicate   # -> eligibility-evidence.json
# 3. derive verdicts (offline, deterministic):
npm run ds9:eligibility            # -> eligibility.json + summary
npm run ds9:eligibility:fixtures
```

## A verdict rests on a verified, affirmative quote — nothing else

Species does not decide. Wall membership does not decide. The **absence** of a
makeup mention is not evidence. `eligible`/`ineligible` are derived only from a
claim that is:

- **verified** — the reader-agent's verbatim quote is present in the page's pinned
  revision (`verifyBasis`), and
- **affirmative** — the quote positively states the fact for its claim type. A
  quote that merely names a performer ("Bashir was played by Alexander Siddig")
  is verified but **not** affirmative, so it decides nothing → `review`.

Each claim carries `{page, revision, content_sha256, basis}` — a receipt anyone
can re-check by fetching that immutable revision and finding the quote.

| verdict | derived when |
| --- | --- |
| `eligible` | a verified + affirmative quote documents a GROW qualifying transformation (heavy prosthetics / mask / creature suit / motion capture / voice-only) and the performer is not visible as themselves |
| `ineligible` | a verified + affirmative quote says the performer is seen as themselves (bare-faced, played himself, only a light appliance) |
| `review` | no verified, affirmative quote either way — most rows, and honest |

Examples: **Garak** eligible on the Cardassian page's *"forehead piece … chin piece
and a nose appliance"*; **Quark**/**Martok** eligible on quoted Ferengi/Klingon
prosthetic notes; **Herbert Rossoff** ineligible on *"bizarre to be bare-faced on
a Star Trek show"*; **Bashir** and **Kira** → `review` (no affirmative quote — not
inferred from silence). Per-performance, not per-performer: Armin Shimerman is
eligible as Quark but ineligible as the bare-faced Rossoff.

## The wall does not override evidence

If a verified quote ruled an on-wall performance `ineligible`, it is surfaced in
`diagnostic_evidence_contradicts_wall`, never forced eligible. (Currently 0.)

## Scope

Evidence covers the 273 named characters read in the adjudication; unnamed
background extras and page-less prose roles stay `review` pending a later scoped
pass. The current honest totals are **mostly review** by design.
