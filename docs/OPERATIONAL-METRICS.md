# Operational metrics custody

The operational-reliability milestone requires four measured operating metrics in addition to the reviewed restore and publication-rollback drills. This surface separates a metric from an empty ledger. A missing denominator is `null`, never zero.

## Initial measurement transaction

`OPERATIONAL-METRICS-001` freezes two reproducible denominators that already exist in retained evidence:

1. every successful operational-reliability exact-recovery evidence run from the first passing implementation through the first ledger-bearing exact-main run;
2. every Star Trek facet observation in the exact source index retained by preservation snapshot `preservation-20260801-7054b6e620ee`.

The committed observation ledger is `data/operations/OPERATIONAL-METRIC-OBSERVATIONS.json`. The deterministic measurement report and reviewed waterline input are retained under `data/review/operational-reliability/metrics-2026-08-02/`.

## Build duration

`build_minutes_p95` uses six complete canonical-gate observations. Each observation is bound to a workflow run, exact target head, Actions artifact ID and digest, restore-receipt SHA-256, exact-tree proof, and rendered-browser inclusion. Failed and cancelled runs remain failure evidence but do not masquerade as completed build durations.

The estimator is nearest-rank p95. Milliseconds are converted to minutes before percentile calculation. The initial result is:

```text
build_minutes_p95: 1.226667
SLO target:         20 minutes
```

This is a measured initial baseline over a frozen six-run denominator. Later observations must be appended through a reviewed receipt rather than silently replacing this denominator.

## Source freshness

`source_freshness_p95_days` measures the age of active-scope source observations when the exact source snapshot was created. The selected source bag is pinned by the preservation workflow run, artifact digest, source-archive SHA-256, source-snapshot SHA-256, source-index SHA-256, and census-manifest SHA-256.

The denominator contains 7,416 Star Trek facet observations across 5,925 distinct exact source rows. The active certification reports 2,056 coverage sources. Every selected facet carries the same census observation time, so the p95 is invariant across the facet, row, and certified-coverage views for this snapshot.

```text
source_freshness_p95_days: 3.496823
SLO target:                14 days
```

Freshness is measured from `observed_at` to source-snapshot `created_at`. Historical wiki revision timestamps are provenance, not freshness clocks.

## Cost intake

`cost_per_verified_record_usd` remains `null`. A qualifying cost event requires an event ID, incurred time, actual USD amount, positive or zero verified-record delta, activity classification, and receipt SHA-256. A measured value requires a positive joined verified-record denominator.

An absent invoice, an unused API quota, a fixture amount, or an unallocated labor estimate is not a zero-cost observation. The eventual metric is total qualified actual cost divided by the joined verified-record additions across the reviewed denominator.

## Rights-response intake

`rights_response_sla_days` remains `null`. A qualifying production case requires an opening time, first substantive response time, case class, synthetic flag, and receipt SHA-256. The production baseline excludes synthetic drills unless a later reviewed policy expressly creates a separate synthetic metric.

An empty rights inbox is not a zero-day response interval. Once qualifying cases exist, the metric is nearest-rank p95 over opening-to-first-substantive-response durations.

## Commands

```text
node scripts/operational-metrics.mjs validate
node scripts/operational-metrics.mjs write
node scripts/operational-metrics.mjs check
node scripts/operational-metrics.mjs status
node scripts/operational-metrics-fixtures.mjs
```

The canonical waterline fixture command runs the metric fixtures. A state-changing receipt may write only the two measured values from the generated waterline input. Cost and rights must remain null until their event ledgers contain qualifying observations.
