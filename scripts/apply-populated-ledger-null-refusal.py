#!/usr/bin/env python3
from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label} anchor count is {count}")
    return source.replace(old, new, 1)


lib_path = Path("scripts/lib/waterline.mjs")
lib = lib_path.read_text(encoding="utf-8")
old_branch = '''      } else if (value !== null) {
        if (snapshot.population < 1 || snapshot.measurement_status !== "measured") throw new Error(`metric ${key} requires a populated validated observation snapshot`);'''
new_branch = '''      } else if (value === null) {
        if (snapshot.population > 0 || snapshot.measurement_status !== "no-observations" || snapshot.value !== null) {
          throw new Error(`metrics.${key} cannot record null against a populated validated observation snapshot`);
        }
      } else if (value !== null) {
        if (snapshot.population < 1 || snapshot.measurement_status !== "measured") throw new Error(`metric ${key} requires a populated validated observation snapshot`);'''
lib = replace_once(lib, old_branch, new_branch, "populated-ledger null refusal")
lib_path.write_text(lib, encoding="utf-8")

fixture_path = Path("scripts/metric-readiness-fixtures.mjs")
fixture = fixture_path.read_text(encoding="utf-8")
anchor = '''assert.equal(status.evidence_readiness.operational_reliability, false);
assert.deepEqual(status.evidence_readiness.measurement_due_metrics, ["cost_per_verified_record_usd"]);

const current = baseState();'''
insert = '''assert.equal(status.evidence_readiness.operational_reliability, false);
assert.deepEqual(status.evidence_readiness.measurement_due_metrics, ["cost_per_verified_record_usd"]);
assert.throws(() => makeMetricsReceipt({
  metrics: { cost_per_verified_record_usd: null },
  reviewed_by: "second-desk",
  reviewed_role: "second-desk",
  reviewed_at: "2026-08-02T00:30:00Z",
  note: "Attempted to preserve null after the validated ledger became populated.",
  evidence: [{ type: "report", value: "cost-null-after-observation.json" }],
}, baseState().metrics, {
  metricReadiness: config.operations.metric_readiness,
  observationSnapshots: oneCostSnapshots,
  metricReceipts: [],
}), /cannot record null against a populated validated observation snapshot/);

const current = baseState();'''
fixture = replace_once(fixture, anchor, insert, "populated-ledger null fixture")
old_summary = 'console.log("PASS — normalized source identity, migration/reset custody, non-metric writer isolation during malformed metric ledgers, exact byte/population/value bindings, mismatch refusal, stale-measurement reopening, SLO refusal, and no-golden-cage null semantics");'
new_summary = 'console.log("PASS — normalized source identity, populated-ledger null refusal, migration/reset custody, non-metric writer isolation during malformed metric ledgers, exact byte/population/value bindings, mismatch refusal, stale-measurement reopening, SLO refusal, and no-golden-cage null semantics");'
fixture = replace_once(fixture, old_summary, new_summary, "fixture summary")
fixture_path.write_text(fixture, encoding="utf-8")

docs_path = Path("docs/OPERATIONAL-METRICS.md")
docs = docs_path.read_text(encoding="utf-8")
heading = "### Populated-ledger null refusal"
if heading in docs:
    raise RuntimeError("populated-ledger null-refusal documentation already exists")
docs += (
    "\n\n### Populated-ledger null refusal\n\n"
    "A when-observed metric cannot remain or be re-receipted as `null` after its validated ledger has a positive population. "
    "The writer must record the exact ledger-derived numeric value and binding, or refuse the transaction. The only numeric-to-null "
    "path remains the separately constrained source-migration reset against a genuinely different, exact zero-population replacement ledger.\n"
)
docs_path.write_text(docs, encoding="utf-8")
