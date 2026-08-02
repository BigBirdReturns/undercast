#!/usr/bin/env python3
from __future__ import annotations

import re
from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label} anchor count is {count}")
    return source.replace(old, new, 1)


def replace_regex_once(source: str, pattern: str, replacement: str, label: str) -> str:
    result, count = re.subn(pattern, replacement, source, count=1, flags=re.DOTALL)
    if count != 1:
        raise RuntimeError(f"{label} anchor count is {count}")
    return result


cli_path = Path("scripts/waterline.mjs")
cli = cli_path.read_text(encoding="utf-8")
new_load = r'''async function load({ metricAware = true } = {}) {
  const config = await readJson(paths.config);
  validateWaterlineConfig(config);
  validateMetricReadinessConfig(config);
  const [state, mediaAudit, autopilot, autopilotJournalText, roadmapState, preservation, waterlineJournal] = await Promise.all([
    readJson(paths.state, emptyWaterlineState()),
    readJson(paths.media),
    readJson(paths.autopilot),
    readText(paths.autopilotJournal),
    readJson(paths.roadmap),
    readJson(paths.preservation),
    readText(paths.journal),
  ]);
  validateWaterlineState(state, config);
  parseJsonl(waterlineJournal);

  let metricObservationSnapshots = null;
  if (metricAware) {
    const observationSources = resolveMetricObservationSources(config, {
      root,
      overrides: {
        cost_per_verified_record_usd: costLedgerOverride,
        rights_response_sla_days: rightsLedgerOverride,
      },
    });
    const [costLedger, rightsLedger] = await Promise.all([
      readJsonBytes(observationSources.cost_per_verified_record_usd.path, "cost observation ledger"),
      readJsonBytes(observationSources.rights_response_sla_days.path, "rights observation ledger"),
    ]);
    metricObservationSnapshots = metricObservationSnapshotsFromLedgers({
      costLedger: costLedger.doc,
      costLedgerBytes: costLedger.bytes,
      costSource: observationSources.cost_per_verified_record_usd.source,
      rightsLedger: rightsLedger.doc,
      rightsLedgerBytes: rightsLedger.bytes,
      rightsSource: observationSources.rights_response_sla_days.source,
    });
  }

  return {
    config,
    state,
    mediaAudit,
    autopilot,
    autopilotJournal: parseJsonl(autopilotJournalText),
    roadmapState,
    preservation,
    metricObservationSnapshots,
    waterlineJournal,
  };
}'''
cli = replace_regex_once(
    cli,
    r"async function load\(\) \{.*?\n\}\nfunction statusFor",
    new_load + "\nfunction statusFor",
    "metric-aware loader",
)
cli = replace_regex_once(
    cli,
    r'  return withLock\(async \(\) => \{\n\s+const inputs = await load\(\);',
    '  return withLock(async () => {\n    const inputs = await load({ metricAware: command === "record-metrics" });',
    "writer loader policy",
)
cli_path.write_text(cli, encoding="utf-8")

fixture_path = Path("scripts/metric-readiness-fixtures.mjs")
fixture = fixture_path.read_text(encoding="utf-8")
fixture = replace_once(
    fixture,
    'import assert from "node:assert/strict";',
    '''import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";''',
    "fixture imports",
)
old_summary = 'console.log("PASS — normalized configured source identities, spelling-alias erasure refusal, populated and empty source migration rebinds, same-source erasure refusal, validated rows, exact byte/population/value bindings, mismatched-value refusal, stale-measurement reopening, SLO refusal, and no-golden-cage null semantics");'
isolation_fixture = r'''const waterlineCli = fileURLToPath(new URL("./waterline.mjs", import.meta.url));
const isolationRoot = await mkdtemp(join(tmpdir(), "undercast-waterline-ledger-isolation-"));
const writeFixtureText = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
};
const writeFixtureJson = (path, value) => writeFixtureText(path, JSON.stringify(value, null, 2) + "\n");
try {
  const fixtureLease = "lease_metric_ledger_failure";
  const fixtureTask = "ap_metric_ledger_failure";
  await Promise.all([
    writeFixtureJson(join(isolationRoot, "data/WATERLINE.json"), config),
    writeFixtureJson(join(isolationRoot, "data/WATERLINE-STATE.json"), emptyWaterlineState()),
    writeFixtureJson(join(isolationRoot, "data/MEDIA-AUDIT.json"), {
      source: { item_set_sha256: "a".repeat(64) },
      items: [{ id: "media-1", scope: "star-trek", status: "verified" }],
    }),
    writeFixtureJson(join(isolationRoot, "data/AUTOPILOT.json"), {
      jobs: [{
        id: fixtureTask,
        scope: "star-trek",
        status: "resolved",
        source_fingerprint: "b".repeat(64),
        wall_ids: ["UC-FIXTURE"],
      }],
    }),
    writeFixtureText(join(isolationRoot, "data/journal/autopilot.jsonl"), JSON.stringify({
      op: "lease.claimed",
      task_id: fixtureTask,
      at: "2026-08-02T07:00:00Z",
      scope: "star-trek",
      lease_id: fixtureLease,
      readiness_token: "c".repeat(64),
    }) + "\n"),
    writeFixtureJson(join(isolationRoot, "data/ROADMAP-STATE.json"), { completed: [] }),
    writeFixtureJson(join(isolationRoot, "preservation/SNAPSHOTS.json"), {
      history_guard: { precondition_met: true, status: "offsite-verified" },
    }),
    writeFixtureText(join(isolationRoot, "data/journal/waterline.jsonl"), ""),
    writeFixtureJson(join(isolationRoot, costSource), {
      version: 1,
      observations: [{}],
    }),
    writeFixtureJson(join(isolationRoot, rightsSource), {
      version: 1,
      cases: [],
    }),
    writeFixtureJson(join(isolationRoot, "cycle.json"), {
      version: 1,
      scope_id: "star-trek",
      lease_id: fixtureLease,
      outcome: "completed",
      reviewed_by: "second-desk",
      reviewed_role: "second-desk",
      reviewed_at: "2026-08-02T07:01:00Z",
      note: "Record completed work even while a metric ledger needs repair.",
      evidence: [
        { type: "workflow-run", value: "fixture-cycle" },
        { type: "commit", value: "fixture-commit" },
        { type: "restart-proof", value: "fixture-restart" },
      ],
    }),
    writeFixtureJson(join(isolationRoot, "incident.json"), {
      incident_id: "metric-ledger-malformed",
      status: "open",
      severity: "high",
      at: "2026-08-02T07:02:00Z",
      recorded_by: "fixture-operator",
      recorded_role: "operator",
      note: "Open a stop even though the metric ledger is malformed.",
      evidence: [{ type: "incident", value: "fixture-incident" }],
    }),
    writeFixtureJson(join(isolationRoot, "metrics.json"), {
      metrics: { cost_per_verified_record_usd: 1 },
      reviewed_by: "second-desk",
      reviewed_role: "second-desk",
      reviewed_at: "2026-08-02T07:03:00Z",
      note: "Metric-aware writes must still refuse the malformed ledger.",
      evidence: [{ type: "report", value: "fixture-metrics" }],
    }),
  ]);

  const runCli = (...cliArgs) => spawnSync(
    process.execPath,
    [waterlineCli, ...cliArgs, "--root", isolationRoot],
    { encoding: "utf8" },
  );
  const cycleRun = runCli("record-cycle", "--input", "cycle.json");
  assert.equal(cycleRun.status, 0, "record-cycle failed: " + cycleRun.stderr);
  const incidentRun = runCli("record-incident", "--input", "incident.json");
  assert.equal(incidentRun.status, 0, "record-incident failed: " + incidentRun.stderr);

  const metricRun = runCli("record-metrics", "--input", "metrics.json");
  assert.notEqual(metricRun.status, 0);
  assert.match(metricRun.stderr, /cost observations\.id/);
  const statusRun = runCli("status");
  assert.notEqual(statusRun.status, 0);
  assert.match(statusRun.stderr, /cost observations\.id/);

  const persisted = JSON.parse(await readFile(join(isolationRoot, "data/WATERLINE-STATE.json"), "utf8"));
  assert.equal(persisted.cycles.length, 1);
  assert.equal(persisted.incidents.length, 1);
  assert.equal(persisted.incidents[0].severity, "high");
  assert.equal(persisted.metric_receipts.length, 0);
} finally {
  await rm(isolationRoot, { recursive: true, force: true });
}

console.log("PASS — normalized source identity, migration/reset custody, non-metric writer isolation during malformed metric ledgers, exact byte/population/value bindings, mismatch refusal, stale-measurement reopening, SLO refusal, and no-golden-cage null semantics");'''
fixture = replace_once(fixture, old_summary, isolation_fixture, "CLI isolation fixture")
fixture_path.write_text(fixture, encoding="utf-8")

docs_path = Path("docs/OPERATIONAL-METRICS.md")
docs = docs_path.read_text(encoding="utf-8")
heading = "### Non-metric writer isolation"
if heading in docs:
    raise RuntimeError("non-metric writer isolation documentation already exists")
docs += (
    "\n\n### Non-metric writer isolation\n\n"
    "Observation-ledger parsing remains mandatory for `status`, `validate`, `gate`, and `record-metrics`. "
    "It is not a prerequisite for non-metric receipt writers: `record-cycle`, `record-drill`, "
    "`record-accounting`, and `record-incident` load and validate durable waterline state without "
    "interpreting cost or rights rows.\n\n"
    "A malformed observation row therefore cannot prevent an operator from opening a high/critical "
    "incident stop or from receipting already-completed work. Metric-aware commands continue to fail "
    "closed until the ledger is repaired, and non-metric writers cannot alter metric values or metric receipts.\n"
)
docs_path.write_text(docs, encoding="utf-8")
