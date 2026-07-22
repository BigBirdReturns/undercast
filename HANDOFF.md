# UNDERCAST — handoff, 2026-07-22

`main` is a public, preservation-backed static archive. The trusted foundation,
certified Star Trek producer, bounded Luna Autopilot, five-year roadmap, exact
source/original-media preservation, exact-subject media-audit control plane,
shared site tokens, canonical cross-platform gate, and fail-closed DS9 owner
decision authoring are merged.

The active review lane is **PR #66 — rolling gold waterline**. It does not add a
card, issue a Luna lease, close a roadmap milestone, or infer an owner decision.
It defines the operating boundary after the current media baseline is complete.

## Current truthful state

- Canonical wall: **1,246 records**.
- Reviewed Star Trek census: **2,295 performer-role observations**, **1,657
  performers**, **2,054 / 2,054** current source receipts.
- Certified Star Trek Autopilot: **2,226 durable tasks**; foundation receipt
  recorded **1,904 queued / 322 resolved / zero in flight**.
- Star Trek is the only active certified producer scope. Every other configured
  scope remains paused pending its own adapter review and certification.
- Preservation snapshot `preservation-20260721-3bbec746c478` retains **15,210
  exact source revisions**, a restorable repository snapshot, and all **1,520
  pre-R1 originals**. Provider read-back is verified. Destructive history rewrite
  remains unauthorized.
- Canonical repository gate: **`npm run gate`**. CI invokes the same command; do
  not maintain or report a second command list.

## Exact-subject media waterline

The Star Trek baseline contains **744 facets across 372 records**:

| State | Facets |
|---|---:|
| verified exact identity + presentation | **0** |
| receipted absent | **96** |
| available, awaiting independent identity review | **564** |
| presentation defect or unresolved ambiguity | **84** |

Therefore **648 available facets remain open**. The current baseline is not gold,
`verified_records` and `media_audit_ratio` remain unknown, and new Star Trek
roster leases are intentionally blocked. Provenance and a byte hash prove source
and file identity; they do not prove the pictured subject.

Read `docs/MEDIA-AUDIT.md`. Review identity and presentation independently. One
machine vote cannot close a facet. Replace or null wrong assets, retain immutable
history, run `media:audit sync`, and finish with solid multi-reviewer consensus or
an authorized obvious-negative ruling. Never convert uncertainty into a positive
identity vote.

## The rolling-gold sequence

PR #66 adds `docs/WATERLINE.md`, `data/WATERLINE*.json`, and
`npm run waterline`. The derived initial phase is `baseline-review`:

```bash
npm run roadmap -- status
npm run media:audit -- status --scope star-trek
npm run waterline -- validate
npm run waterline -- status --scope star-trek
```

Completing the baseline authorizes **one bounded lease of at most eight tasks**,
not unlimited queue draining. The cycle is:

```text
zero current media debt
→ one bounded Luna lease
→ research / draft / canonical merge
→ retrieval and independent exact-subject review
→ zero media debt again
→ terminal task state
→ second-desk/owner-reviewed cycle receipt
→ only then may another lease begin
```

`--allow-inflight` does not bypass the waterline. A previous unreceipted lease,
active work, open media debt, missing preservation, excessive requested batch, or
an open high/critical incident blocks the next claim.

## Evidence required for the two ready roadmap milestones

### `star-trek-gold-shard`

- current exact-subject baseline at zero debt;
- **three** reviewed, restart-safe successful Luna cycle receipts;
- each successful cycle resolves at least one task through the complete lifecycle;
- current five-way accounting over every durable task:
  `eligible / filed / blocked / excluded / unresolved`;
- accounting denominator exactly matches the current task set.

### `operational-reliability`

- reviewed fresh repository-restore drill through `npm run gate`;
- reviewed isolated bad-publication rollback drill;
- measured `build_minutes_p95`, `cost_per_verified_record_usd`,
  `source_freshness_p95_days`, and `rights_response_sla_days`;
- build p95 ≤20 minutes, source freshness p95 ≤14 days, rights response ≤14 days;
- no invented cost target: cost must be measured before review;
- high/critical incident stop and reviewed close/downgrade authority remain green.

The waterline prepares evidence only. Completion still lands through reviewed
`data/ROADMAP-STATE.json` receipts. If both milestones are reviewed complete, the
next dependency frontier becomes exactly:

```text
adapter-sdk-and-second-gold-shard
public-trust-and-corrections
```

Do not start either before those roadmap receipts land.

## Standing discipline

- Machines prepare; second desk and owner exercise their named authority.
- Never invent a fact, identity, metric, owner ruling, or completion state.
- Unknown is `null`, not zero. Ambiguous is visible debt, not verification.
- A green schema is not semantic truth; a source URL is not subject identity.
- Keep source snapshots, immutable media hashes, replacement/expunge history, and
  provider-read-back receipts intact.
- Do not relax `data/quality-baseline.json` to create apparent progress.
- Do not call Star Trek gold until the current media baseline, three cycles,
  accounting, and reviewed roadmap receipt all exist.
