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

## A verdict rests on a verified, threshold-meeting, applicable quote

Provenance is not enough. A quote proves it was said; it does not prove it clears
UNDERCAST's entry bar. So `eligible`/`ineligible` are derived only from a claim
that is **all three** of:

- **verified** — the reader-agent's verbatim quote is present in the page's pinned
  revision (`verifyBasis`);
- **threshold-meeting** — the quote documents a **FULL designed face**: a full
  facial/head prosthetic, a mask, a full creature suit, motion capture, or an
  unseen voice. "Teeth", "contact lenses", "a wig", "airbrushing", bare "makeup",
  and in-universe anatomy ("Cardassians had neck ridges") do **not** clear it;
- **applicable** — the quote belongs to *this* performance. A species page applies
  to any member; a character-page quote that names a *different* performer of the
  same character does not (Melanie Smith does not inherit Batten/Middendorf's Ziyal
  quote).

Each claim carries `{page, revision, content_sha256, basis}` — a receipt anyone
can re-check.

| verdict | derived when |
| --- | --- |
| `eligible` | a verified + threshold-meeting + applicable quote documents a full designed face |
| `ineligible` | a verified + affirmative + applicable quote says the performer is seen as themselves (bare-faced, played himself, only a light appliance) |
| `review` | no such quote either way — most rows, and honest |

Examples: **Garak** eligible on *"the forehead piece but also a chin piece and a
nose appliance"*; **Nog** on the Ferengi *"helmet-like headpiece … over the head"*;
**Herbert Rossoff** ineligible on *"bizarre to be bare-faced on a Star Trek show"*.
**Martok** → `review`: the only quote gathered was Westmore's *"I made teeth for
him"*, which does not establish a full face — even though Martok is obviously a
full Klingon prosthetic, the *evidence provided* is insufficient, so the honest
verdict is review, not an assumption. **Bashir**/**Kira** → `review` (no
affirmative quote — never inferred from silence).

The eligible set is therefore small and conservative: only performances whose
gathered quote actually documents a full designed face. Broadening it means
gathering better quotes (a targeted re-adjudication), not loosening the bar.

## The wall does not override evidence

If a verified quote ruled an on-wall performance `ineligible`, it is surfaced in
`diagnostic_evidence_contradicts_wall`, never forced eligible. (Currently 0.)

## Scope

Evidence covers the 273 named characters read in the adjudication; unnamed
background extras and page-less prose roles stay `review` pending a later scoped
pass. The current honest totals are **mostly review** by design.
