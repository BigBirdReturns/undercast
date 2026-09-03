# RD-W03 exact-capture custody

## Status

This package is the bounded capture-only successor to the six hosted-qualified Wave-03 intake drafts. It preserves all 710 terminal route observations, derives exactly nine stable official-object capture requests, and refuses the other 701 observations.

```text
route observations:        710
selected exact captures:     9
refused observations:      701
adversarial refusals:       35
evidence admissions:        0
chronology resolved:         0
classes closed:              0
external contacts/reviews: 0 / 0
outside-human dependency: false
```

## Capture boundary

Each selected object is fetched once with `GET`, a 45-second timeout, a 5 MiB body ceiling, concurrency two, redirect following restricted to the prebound normalized host, no second pass, and no result-spawned follow-up. Exact response bytes, byte count, SHA-256, status, content type, final URL, and timestamps are retained in the run artifact.

Capture establishes byte custody only. It does not establish unit identity, event class, chronology, recommendation, authority, remedy, substantive outcome, evidence admission, or residual-class closure. Those bindings require a later separately authorized admission transaction.

## Reproduce

```bash
node scripts/rd-wave03-exact-capture.mjs --check
node test/rd-wave03-exact-capture-adversarial.mjs
node scripts/rd-wave03-exact-capture.mjs --execute --out /tmp/rd-wave03-exact-capture
node scripts/rd-wave03-exact-capture.mjs --verify-receipt /tmp/rd-wave03-exact-capture/receipt.json
```
