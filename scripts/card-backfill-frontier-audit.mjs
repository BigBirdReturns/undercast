#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  buildEstate,
  canonicalJson,
  readCompletedPackets,
  sha256,
} from "./lib/card-backfill-cohort.mjs";
import { readPolicyAwareAdjudicationAttemptIndex } from "./lib/card-backfill-attempt-index.mjs";
import { validateStaging } from "./lib/card-backfill-staging.mjs";
import { isMultiSubject } from "./lib/card-backfill-source-policy-v3.mjs";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}
function increment(map, key, amount = 1) {
  const normalized = key === null || key === undefined || key === "" ? "(none)" : String(key);
  map.set(normalized, (map.get(normalized) || 0) + amount);
}
function sortedCounts(map) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, undefined, { numeric: true }));
}
function policyVersion(attempt) {
  const value = Number(attempt?.source_policy_version || 0);
  return Number.isFinite(value) && value > 0 ? value : 1;
}
function latestAttempt(attempts) {
  return [...attempts].sort((a, b) => {
    const time = String(a.generated_at || "").localeCompare(String(b.generated_at || ""));
    if (time) return time;
    return policyVersion(a) - policyVersion(b);
  }).at(-1) || null;
}
function markdownTable(rows, columns) {
  if (!rows.length) return "_(none)_\n";
  const header = `| ${columns.map(([label]) => label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map(([, field]) => String(row[field] ?? "").replaceAll("|", "\\|")).join(" | ")} |`);
  return [header, divider, ...body].join("\n") + "\n";
}

async function main() {
  const controlPath = option("--control", ".github/CARD-BACKFILL-COHORT.json");
  const out = resolve(option("--out", ".card-backfill-frontier-audit"));
  const completedRoot = option("--completed-root", "data/review/card-backfill");
  const control = await readJson(controlPath);
  const stagingRoot = option("--staging-root", control.staging?.root || "data/review/card-backfill-staging");

  const [specimens, sources, auditRoot, completedPackets, stagingLedger, attemptIndex] = await Promise.all([
    readJson("data/specimens.json"),
    readJson("data/SOURCES.json"),
    readJson("data/MEDIA-AUDIT.json"),
    readCompletedPackets(completedRoot),
    validateStaging({ root: stagingRoot, permanentRoot: completedRoot }),
    readPolicyAwareAdjudicationAttemptIndex(stagingRoot, control.campaign_id),
  ]);

  const estate = buildEstate({ specimens, sources, auditItems: auditRoot.items || [], completedPackets, control });
  const attemptsByObligation = new Map((attemptIndex.entries || []).map((row) => [row.obligation_id, row.attempts || []]));
  const staged = new Set((stagingLedger.entries || []).map((row) => row.obligation_id));

  const counts = {
    side: new Map(),
    disposition: new Map(),
    cohort: new Map(),
    performance_mode: new Map(),
    source_route: new Map(),
    evidence_tier: new Map(),
    render_profile: new Map(),
    quarantine_reason: new Map(),
    attempt_policy_version: new Map(),
    attempt_policy_id: new Map(),
    attempt_disposition: new Map(),
    attempt_reason: new Map(),
    latest_attempt_reason: new Map(),
    frontier_class: new Map(),
  };

  const obligations = [];
  for (const row of estate.obligations || []) {
    const attempts = attemptsByObligation.get(row.obligation_id) || [];
    const latest = latestAttempt(attempts);
    const v4Attempts = attempts.filter((attempt) => policyVersion(attempt) >= 4);
    const quarantineReasons = [...new Set(row.quarantine_reasons || [])].sort();
    const multiSubject = row.side === "still" && isMultiSubject(row.expected_subject);

    let frontierClass;
    if (staged.has(row.obligation_id)) frontierClass = "already-staged";
    else if (multiSubject) frontierClass = "composite-lane-required";
    else if (row.disposition !== "ready" && !(row.side === "still" && row.shape?.source_route === "open-web-exception" && quarantineReasons.length === 1 && quarantineReasons[0] === "no-bounded-still-source-route")) frontierClass = "residual-quarantine";
    else if (v4Attempts.length) frontierClass = "v4-exhausted";
    else if (!attempts.length) frontierClass = "never-attempted";
    else frontierClass = "pre-v4-attempt-only";

    increment(counts.side, row.side);
    increment(counts.disposition, row.disposition);
    increment(counts.cohort, row.cohort_key);
    increment(counts.performance_mode, row.shape?.performance_mode);
    increment(counts.source_route, row.shape?.source_route);
    increment(counts.evidence_tier, row.shape?.evidence_tier);
    increment(counts.render_profile, row.shape?.render_profile);
    increment(counts.frontier_class, frontierClass);
    for (const reason of quarantineReasons) increment(counts.quarantine_reason, reason);
    for (const attempt of attempts) {
      increment(counts.attempt_policy_version, `v${policyVersion(attempt)}`);
      increment(counts.attempt_policy_id, attempt.source_policy_id);
      increment(counts.attempt_disposition, attempt.final_disposition);
      increment(counts.attempt_reason, attempt.reason);
    }
    if (latest) increment(counts.latest_attempt_reason, latest.reason);

    obligations.push({
      obligation_id: row.obligation_id,
      record_id: row.record_id,
      side: row.side,
      expected_subject: row.expected_subject,
      disposition: row.disposition,
      quarantine_reasons: quarantineReasons,
      cohort_key: row.cohort_key,
      shape: row.shape,
      frontier_class: frontierClass,
      multi_subject: multiSubject,
      staged: staged.has(row.obligation_id),
      attempt_count: attempts.length,
      attempted_policy_versions: [...new Set(attempts.map(policyVersion))].sort((a, b) => a - b),
      v4_attempt_count: v4Attempts.length,
      latest_attempt: latest ? {
        source_policy_id: latest.source_policy_id,
        source_policy_version: policyVersion(latest),
        source_policy_revision: latest.source_policy_revision,
        final_disposition: latest.final_disposition,
        reason: latest.reason,
        generated_at: latest.generated_at,
        discovery_batch_sha256: latest.discovery_batch_sha256,
      } : null,
      attempts: attempts.map((attempt) => ({
        source_policy_id: attempt.source_policy_id,
        source_policy_version: policyVersion(attempt),
        source_policy_revision: attempt.source_policy_revision,
        final_disposition: attempt.final_disposition,
        reason: attempt.reason,
        generated_at: attempt.generated_at,
        discovery_batch_sha256: attempt.discovery_batch_sha256,
        cohort_key: attempt.cohort_key,
      })),
    });
  }

  obligations.sort((a, b) => a.obligation_id.localeCompare(b.obligation_id, undefined, { numeric: true }));
  const summary = Object.fromEntries(Object.entries(counts).map(([key, map]) => [key, sortedCounts(map)]));
  const frontier = {
    version: 1,
    lane: "card-backfill-frontier-audit",
    generated_at: new Date().toISOString(),
    campaign_id: control.campaign_id,
    estate_sha256: estate.estate_sha256,
    attempt_index_sha256: attemptIndex.index_sha256,
    staging_ledger_sha256: stagingLedger.ledger_sha256,
    selector_defined_estate: Number(control.freeze?.selector_defined_estate),
    completed_packets: completedPackets.size,
    open_obligations: obligations.length,
    staged_packets: stagingLedger.counts.staged,
    attempted_obligations: attemptIndex.attempted_count,
    adjudication_receipts: attemptIndex.receipt_count,
    summary,
    obligations,
    canonical_mutation: false,
  };
  frontier.audit_sha256 = sha256(canonicalJson(frontier));

  await writeJson(`${out}/frontier.json`, frontier);
  const top = (key, limit = 30) => summary[key].slice(0, limit);
  const md = [
    "# Card-backfill frontier audit",
    "",
    `- Campaign: \`${frontier.campaign_id}\``,
    `- Completed packets: **${frontier.completed_packets}**`,
    `- Open obligations: **${frontier.open_obligations}**`,
    `- Attempted obligations: **${frontier.attempted_obligations}**`,
    `- Staged packets: **${frontier.staged_packets}**`,
    `- Audit SHA-256: \`${frontier.audit_sha256}\``,
    "",
    "## Frontier classes",
    "",
    markdownTable(top("frontier_class"), [["Class", "key"], ["Count", "count"]]),
    "## Latest attempt reasons",
    "",
    markdownTable(top("latest_attempt_reason", 50), [["Reason", "key"], ["Count", "count"]]),
    "## Quarantine reasons",
    "",
    markdownTable(top("quarantine_reason", 50), [["Reason", "key"], ["Count", "count"]]),
    "## Source routes",
    "",
    markdownTable(top("source_route", 50), [["Route", "key"], ["Count", "count"]]),
    "## Performance modes",
    "",
    markdownTable(top("performance_mode", 50), [["Mode", "key"], ["Count", "count"]]),
    "## Largest open cohorts",
    "",
    markdownTable(top("cohort", 75), [["Cohort", "key"], ["Count", "count"]]),
  ].join("\n");
  await writeFile(`${out}/frontier.md`, md.endsWith("\n") ? md : md + "\n");

  console.log(`FRONTIER — completed=${frontier.completed_packets} open=${frontier.open_obligations} attempted=${frontier.attempted_obligations} staged=${frontier.staged_packets}`);
  for (const row of summary.frontier_class) console.log(`CLASS — ${row.key}=${row.count}`);
  for (const row of summary.latest_attempt_reason.slice(0, 20)) console.log(`LATEST_REASON — ${row.key}=${row.count}`);
  for (const row of summary.quarantine_reason.slice(0, 20)) console.log(`QUARANTINE — ${row.key}=${row.count}`);
  console.log(`AUDIT — ${frontier.audit_sha256}`);
  console.log(`OUTPUT — ${out}`);
}

main().catch((error) => {
  console.error(`card-backfill frontier audit: ${error.stack || error.message}`);
  process.exit(1);
});
