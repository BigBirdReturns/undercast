# UNDERCAST — handoff after the first successful Star Trek cycle, 2026-07-23

UNDERCAST is a public, preservation-backed static archive. The trusted foundation,
certified Star Trek producer, bounded Luna Autopilot, capability-aware leasing,
five-year roadmap, exact source/original-media preservation, exact-subject media
audit, canonical cross-platform gate, DS9 owner-decision tooling, and rolling gold
waterline are canonical.

## Current truthful state

- Canonical wall: **1,247 records**.
- Reviewed Star Trek census: **2,295 performer-role observations**, **1,657
  performers**, and **2,054 / 2,054** current source receipts.
- Star Trek Autopilot: **2,226 durable tasks** — **1,900 queued**, **2 blocked**,
  **324 resolved**, and **zero in flight**.
- Star Trek is the only active certified producer scope. Every other configured
  scope remains paused pending adapter review and certification.
- Preservation snapshot `preservation-20260721-3bbec746c478` retains **15,210
  exact source revisions**, a restorable repository snapshot, and all **1,520
  pre-R1 originals**. Provider read-back is verified. Destructive history rewrite
  remains unauthorized.
- Canonical repository gate: **`npm run gate`**. CI invokes the same command.
- Roadmap state remains **1 / 12 complete**. The ready milestones remain
  `star-trek-gold-shard` and `operational-reliability`.

## Exact-subject media waterline

The current Star Trek wall contains **750 facets across 375 records**:

| State | Facets |
|---|---:|
| verified exact identity + presentation | **562** |
| honestly absent with receipts | **188** |
| review | **0** |
| attention | **0** |

The baseline is therefore **750 / 750 complete with zero media debt**. Positive
identity is grounded in revision-bound source evidence and exact-byte/source-image
receipts, never appearance inference. Wrong or ambiguous assets are nulled from
canonical slots while immutable bytes and former objects remain in history.

Andrea Martin as Ishka is the first card completed through the full capability-aware
rolling loop. It is filed as `UC-1278`; both its character still and performer
portrait are exact-subject verified. The durable task
`ap_167ac35ec0c06c7005bcc32f` is resolved.

## Exact species-role navigation

Species filters classify the **displayed primary card role**, never the performer as
a whole. `data/species.json` separately retains every captured named credit as a
primary card, an additional performance on file, or an unfiled role. Normal named
anchors such as `#makers` must preserve URL filters; only `#UC-…` hashes may invoke
card focus and clear an incompatible view.

The retained Ferengi scope currently contains 70 named credits: 16 primary-card
credits across 14 illustrated cards, 16 additional performances on file, and 38
unfiled named credits, plus eight source pages without a named performer.

## Rolling gold waterline

Current Star Trek phase:

```text
ready-for-cycle
```

Current cycle ledger:

| Cycle | Outcome |
|---|---|
| James Doohan — Enwright | aborted honestly; required listener-grade voice evidence unavailable |
| James Doohan — M-5 | aborted honestly; sample recovered, but all three reviewer runtimes lacked audio |
| Andrea Martin — Ishka | **completed successfully** through merge, retrieval, exact-subject closure, gate, and reviewed receipt |

The reviewed successful receipt is
`cycle_7d0b3cdd2045c1d3147390ed`. Its durable evidence includes the committed
lease, restart-safe processing run `30038612247`, exact media-evidence run
`30039035550`, resolved candidate commit
`8b0c1e0e53e375864e00e248439bed886691dc8f`, and closure/gate run
`30041337360`.

Current waterline accounting:

```text
successful cycles: 1 / 3 required
aborted cycles:    2
unreceipted leases: 0
work in flight:     0
media debt:         0
claim allowed:      yes
```

One successful cycle does **not** complete `star-trek-gold-shard`. Two more
reviewed restart-safe successful cycles and a current five-way task-accounting
receipt are still required.

## Capability-aware leasing

The active reviewed profile is `text-vision`: source research and exact-image
review are available; audio listening is not. The `audio-vision` profile remains
paused until at least three genuinely audio-capable blind reviewers are available
and a reviewed policy change activates it.

Audio-required tasks remain visible and queued. They are skipped without changing
priority, attempts, eligibility, or terminal state. Sargon is bound by an exact
source-fingerprint override to `audio-listening`, despite its misleading historical
mode hint.

Before the next lease:

```bash
npm run roadmap -- status
npm run autopilot -- readiness --scope star-trek --require-active
npm run media:audit -- gate --scope star-trek
npm run waterline -- status --scope star-trek
npm run autopilot -- candidates \
  --scope star-trek \
  --capability-profile text-vision \
  --limit 20
```

Then claim **one bounded cycle only**. Normal operation selects the
highest-priority compatible task. An exact proof task requires `--task-id`,
`--limit 1`, and a specific reviewed `--selection-basis`.

The complete loop remains:

```text
ready-for-cycle
→ one bounded capability-compatible lease
→ evidence-backed draft or honest terminal decision
→ canonical merge
→ targeted retrieval
→ exact identity and presentation review
→ zero media debt
→ terminal task state
→ second-desk/owner-reviewed cycle receipt
→ ready-for-cycle
```

No second lease is authorized before the first returns to zero debt and receives a
reviewed receipt.

## Remaining evidence for the ready roadmap milestones

### `star-trek-gold-shard`

- two additional reviewed successful Luna cycles;
- at least one resolved task in each successful cycle;
- zero media debt and zero unreceipted work after every cycle;
- current five-way accounting over every durable task:
  `eligible / filed / blocked / excluded / unresolved`;
- accounting denominator exactly matching the current task set.

### `operational-reliability`

- reviewed fresh repository-restore drill through `npm run gate`;
- reviewed isolated bad-publication rollback drill;
- measured `build_minutes_p95`, `cost_per_verified_record_usd`,
  `source_freshness_p95_days`, and `rights_response_sla_days`;
- build p95 ≤20 minutes, source freshness p95 ≤14 days, rights response ≤14 days;
- no invented cost target; cost must be measured before review;
- high/critical incident stop and reviewed close/downgrade authority remain green.

Only reviewed roadmap completion receipts for both milestones unlock:

```text
adapter-sdk-and-second-gold-shard
public-trust-and-corrections
```

## Standing discipline

- Machines prepare; second desk and owner exercise their named authority.
- Never invent a fact, identity, metric, capability, owner ruling, or completion.
- Unknown is `null`, not zero. Ambiguous is visible debt, not verification.
- A green schema is not semantic truth; a source URL is not subject identity.
- A missing runtime capability is not an eligibility rejection.
- Preserve source snapshots, immutable media hashes, replacement/expunge history,
  capability receipts, cycle receipts, and provider read-back evidence.
