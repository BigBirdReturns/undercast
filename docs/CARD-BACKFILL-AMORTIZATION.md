# Card-backfill amortization

The first parallel wave proved that unique source discovery increased from 605 to 1,007 obligations per hour. This contract makes that gain cumulative instead of paying for the same acceleration from zero on every run.

## Production equation

```text
retained judgments and timings
        ↓
policy-bounded metadata cache + cost model
        ↓
deterministic longest-processing-time shard balance
        ↓
immutable parallel source artifacts
        ↓
repository-local independent adjudication
        ↓
one exact-head reducer
        ↓
new attempt receipts + staging + next cost model
```

## What is amortized

### Source metadata

Successful JSON responses from MediaWiki and Wikimedia APIs are content-addressed by the active source-policy identity, full request URL, and Accept header. Discovery shards read the latest completed cache generation, write isolated deltas, and merge those deltas once per wave. Entries expire after 24 hours; a newer response refreshes the same request key without treating ephemeral cache bytes as evidence. Binary image objects are not committed to the repository.

A policy revision creates a new namespace. Old metadata cannot silently authorize a new policy.

### Scheduling knowledge

Every source shard records per-obligation elapsed time, network request count, network bytes, cache hits, cache misses, cache writes, and result. The reducer retains one observation receipt per wave and rebuilds the cost model from all retained observations.

The next wave assigns the longest predicted obligations first to the currently lightest shard. The exact assignment is digest-bound to the wave, and the cost model is deterministic for the same retained observation set. This attacks the slowest-shard tail rather than treating equal record counts as equal work.

### Downstream failures

Rendered and packetized batch artifacts are immutable. A local-desk runtime failure, reducer race, or publication delay does not authorize source rediscovery. Ready decision files form a barrier: new discovery yields until retained bytes have been reduced into complete attempt receipts. The first action after activation is therefore to ingest the already-paid 160-obligation wave rather than search those records again.

### Runner setup

The shared runtime action has two explicit profiles. Discovery installs only missing ImageMagick compatibility and deliberately omits OpenCV, NumPy, cascade data, and Tesseract. Assembly uses the `local-desk` profile, which installs `python3-opencv`, `opencv-data`, and `tesseract-ocr` only when absent and verifies a usable face-cascade path before adjudication. No cloud-model token is required.

## Boundaries retained

Amortization does not change the evidence law:

- selected bytes do not prove identity;
- discovery cannot approve itself;
- source and presentation claims remain separate;
- repository-wide duplicate screening remains mandatory;
- exceptions fail closed and remain receipted;
- canonical website mutation remains a separate transaction;
- the complete repository gate remains once per permanent publication batch.

## Measurement

The first measured comparison was:

```text
single cohort: 40 obligations / 238 seconds = 605 per hour
parallel wave: 160 obligations / 572 seconds = 1,007 per hour
measured discovery speedup: 1.664×
```

Future wave receipts must report cache reuse, cost balance, source yield, adjudication yield, and permanent publication separately. Gross activity is never labeled permanent completion.
