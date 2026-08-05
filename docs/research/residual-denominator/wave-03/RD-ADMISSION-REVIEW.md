# RD-W03 · Offline admission review

## Result

Nine immutable current-byte objects from the Wave-03 exact-capture product were reviewed against the original five-binding admission law.

```text
objects reviewed:                 9
required bindings:               45
official-object bindings:         9 verified
byte-custody bindings:            9 verified
custody bindings total:          18 verified
unit-identity bindings:           0 verified
claimed-event bindings:           0 verified
chronology bindings:              0 resolved
substantive bindings refused:     27
objects admitted:                 0
objects refused:                  9
classes closed:                   0
live source requests:             0
external contacts/reviews:      0 / 0
outside-human dependency:       false
merge authority:                false
```

A successful official-route capture and exact bytes are necessary but not sufficient. Every object still had to bind an exact frozen unit, the predeclared event class, and event chronology. None did.

## Refusal findings

- **RD-01 / NatSec100:** the body distinguishes 2023–2026 editions and describes the 2026 ranking, but the source contract supplies only opaque IDs such as `EDITION-01`; it contains no exact edition map. Treating the first displayed edition as the first frozen unit would be an unreceipted ordinal join. The December 31, 2025 date is an eligibility cutoff, not a ranking event date.
- **RD-02 / SBIC:** the SBA page describes the SBIC program generically. It contains no Moonshots Capital Fund 3 identity, leverage-commitment statement, commitment amount, or event date.
- **RD-04 / SNAP:** both target cells are frozen to `AL`, while both captured bodies are California Department of Social Services pages. The hearing object has no hearing or appeals content; the CalFresh object has no stay content. One state cannot stand in for another.
- **RD-05 / ACES appointment, term, and attendance:** the source contract supplies opaque member IDs but no member-name map. The membership page lists seventeen names and a shared term end, but ordinal position cannot bind `ACES-MEMBER-01`. The meetings page lists dates but no attendance record.
- **RD-05 / recommendation and disposition:** the captured pages concern the National Science Board, not ACES or an ACES member. Generic NSB duties and publication dates cannot establish an ACES recommendation or agency disposition.

## Deterministic proof

The protocol binds each decision to:

1. the exact capture body SHA-256 and byte count;
2. the exact intake run, artifact, head, route, and cell;
3. a standard-library HTML text extractor and normalized-text SHA-256;
4. bounded numbered excerpts with independent SHA-256 values;
5. explicit positive-context and negative-target match counts;
6. all date-like strings retained as candidates but not promoted to event chronology;
7. a reason-coded refusal for each missing substantive binding.

Rebuild from the immutable artifacts:

```bash
python3 scripts/rd-wave03-admission-review.py \
  --verify-inputs \
  --capture-root /path/to/verification-artifact \
  --intake-root /path/to/intake-artifacts
```

Validate the committed package and adversarial refusals:

```bash
python3 scripts/rd-wave03-admission-review.py --check
python3 test/rd-wave03-admission-review-adversarial.py
```

## Authority boundary

This package is a refusal ledger, not a substantive finding. It establishes no unit identity, selection, commitment, hearing, stay, appointment, term, attendance, recommendation, disposition, outcome, remedy, prevalence, or class closure. It performs no publication, adoption, or graph mutation. Any later admission requires a separately authorized transaction with a complete five-binding chain.
