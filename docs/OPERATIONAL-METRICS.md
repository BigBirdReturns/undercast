# Operational metric evidence and custody

The operational-reliability waterline tracks four metrics:

- `build_minutes_p95`
- `source_freshness_p95_days`
- `cost_per_verified_record_usd`
- `rights_response_sla_days`

The evidence producer measures what has a qualified denominator and leaves every other value null. It cannot write waterline state or complete the roadmap milestone.

## Build denominator

Build time is nearest-rank p95 over at least five consecutive successful executions of the complete canonical gate on one exact head. Every sample must include rendered-browser work, have an exact target SHA, exit zero, and carry coherent start, completion, and duration values. Failed, cancelled, partial, or cross-head runs do not enter the measured population.

## Source-freshness denominator

Source freshness is nearest-rank p95 over unique exact source-revision identities for the selected franchise. Duplicate category facets collapse to one source identity, and the freshest observation of identical bytes governs. The evidence records the manifest path actually supplied to the CLI and the SHA-256 of those exact bytes.

## Cost denominator

Cost is measured only from populated `data/operational-reliability/COST-OBSERVATIONS.json`. Every observation requires an actual direct USD cost, a positive newly verified-record count, and non-empty evidence. Included quotas, free-tier assumptions, imputed labor, and absent invoices do not become zero-dollar rows.

An empty cost ledger produces `no-observations` and `null`. A populated valid ledger must produce `measured`; the workflow no longer treats permanent emptiness as an invariant.

## Rights denominator

Rights response is measured only from populated `data/operational-reliability/RIGHTS-CASES.json`. Every case requires durable opening and first-response times, an explicit `real` or `exercise` class, and non-empty evidence. An empty inbox is unknown, never a zero-day response.

An empty rights ledger produces `no-observations` and `null`. A populated valid ledger must produce `measured`.

## Readiness without a golden cage

Build time and source freshness are required numeric readiness metrics because their denominators exist whenever the operating system runs. Cost and rights response are observation-triggered. When the current admissible ledger is empty, `null` remains an explicit, reviewed debt state and does not freeze an otherwise smoke-passed milestone. The first admissible ledger row immediately changes the metric to `measurement-due` until a reviewed numeric receipt is recorded. A numeric value whose observation ledger has been erased is a blocking custody regression.

This rule never converts absence into zero, never waives a measured SLO failure, and never closes the cost or rights debt. It removes only the circular requirement to manufacture an event before the system may prove that it is ready to handle the event.

Every observation-triggered numeric receipt binds the configured ledger path, exact ledger SHA-256, validated population, and the metric value derived from those ledger rows. The writer refuses any caller-supplied value that differs from the validated ledger result. The waterline reads the configured source itself; a CLI override must resolve to the same path or is refused. Appending, replacing, or deleting ledger rows changes the snapshot and immediately reopens measurement. A numeric value without a matching reviewed binding is a custody failure, not a measured baseline.

## Exact-main discovery

Pull-request runs prove the candidate. Only a successful `push` run on `main` publishes a discovery issue. The issue binds:

- exact repository, event, branch, run, attempt, and target SHA;
- artifact ID, URL, and Actions digest;
- metric-evidence and build-sample SHA-256 values;
- selected manifest path and manifest SHA-256;
- all four metric states, values, and populations;
- the explicit absence of waterline or roadmap mutation.

The issue is a mutable index. The artifact digest and evidence hashes are the authoritative custody identifiers. A second-desk review must inspect the artifact before a separate transaction records measured values in `data/WATERLINE-STATE.json`.

## Commands

```text
npm run operational:fixtures
node scripts/operational-metrics.mjs measure ...
node scripts/operational-metrics-ledger.mjs issue-payload ...
```

Both metric fixture suites execute inside the canonical waterline gate.

### Observation-source migration

Historical numeric receipts retain their recorded source as immutable evidence. A reviewed `observation_source` migration does not make those receipts structurally invalid. Readiness compares the latest receipt with the current configured source, reports `measured-against-wrong-ledger`, and blocks until `record-metrics` binds the validated replacement ledger.
