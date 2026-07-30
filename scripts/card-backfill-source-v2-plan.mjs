#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  buildEstate,
  buildRetrievalPlan,
  buildScopeReceipt,
  canonicalJson,
  readCompletedPackets,
  selectBatch,
  sha256,
} from "./lib/card-backfill-cohort.mjs";
import { readAdjudicationAttemptIndex, validateStaging } from "./lib/card-backfill-staging.mjs";
import { buildSourcePolicyV2Estate, CARD_BACKFILL_SOURCE_POLICY_V2 } from "./lib/card-backfill-source-policy-v2.mjs";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + "\n"); }

function validateProgress(control, completed, open) {
  const total = Number(control.freeze?.selector_defined_estate);
  const initialCompleted = Number(control.freeze?.completed_evidence_packets);
  const initialOpen = Number(control.freeze?.open_source_declared_absences);
  const errors = [];
  if (completed + open !== total) errors.push(`${completed}+${open}!=${total}`);
  if (completed < initialCompleted) errors.push(`completed regressed below ${initialCompleted}`);
  if (open > initialOpen) errors.push(`open expanded above ${initialOpen}`);
  if (completed - initialCompleted !== initialOpen - open) errors.push("completed/open progress is not one-for-one");
  if (errors.length) throw new Error(`frozen campaign progress drift: ${errors.join("; ")}`);
  return { initial: { completed: initialCompleted, open: initialOpen, total }, current: { completed, open, total } };
}

async function main() {
  const controlPath = option("--control", ".github/CARD-BACKFILL-COHORT.json");
  const out = resolve(option("--out", ".card-backfill-source-v2"));
  const completedRoot = option("--completed-root", "data/review/card-backfill");
  const control = await readJson(controlPath);
  const stagingRoot = option("--staging-root", control.staging?.root || "data/review/card-backfill-staging");
  const now = option("--now", new Date().toISOString());
  const limit = option("--limit", String(control.batch?.target || 40));

  const [specimens, sources, auditRoot, completedPackets, stagingLedger, attemptIndex] = await Promise.all([
    readJson("data/specimens.json"),
    readJson("data/SOURCES.json"),
    readJson("data/MEDIA-AUDIT.json"),
    readCompletedPackets(completedRoot),
    validateStaging({ root: stagingRoot, permanentRoot: completedRoot }),
    readAdjudicationAttemptIndex(stagingRoot, control.campaign_id),
  ]);
  const sourceEstate = buildEstate({ specimens, sources, auditItems: auditRoot.items || [], completedPackets, control });
  sourceEstate.generated_at = now;
  const progress = validateProgress(control, completedPackets.size, sourceEstate.obligations.length);
  const retryEstate = buildSourcePolicyV2Estate({
    estate: sourceEstate,
    attemptIndex,
    stagedObligationIds: stagingLedger.entries.map((row) => row.obligation_id),
  });
  if (!retryEstate.cohorts.length) throw new Error("no source-policy-v2 cohort available");

  const batch = selectBatch({ estate: retryEstate, control, cohortKey: option("--cohort-key", null), limit });
  const exclusionState = {
    staging_ledger_sha256: stagingLedger.ledger_sha256,
    attempt_index_sha256: attemptIndex.index_sha256,
    source_policy: CARD_BACKFILL_SOURCE_POLICY_V2,
  };
  batch.selection_batch_sha256 = batch.batch_sha256;
  batch.source_estate_sha256 = sourceEstate.estate_sha256;
  batch.exclusion_state_sha256 = sha256(canonicalJson(exclusionState));
  batch.source_policy = CARD_BACKFILL_SOURCE_POLICY_V2;
  batch.source_policy_version = CARD_BACKFILL_SOURCE_POLICY_V2.version;
  batch.batch_sha256 = sha256(canonicalJson({
    campaign_id: batch.campaign_id,
    estate_sha256: batch.estate_sha256,
    source_estate_sha256: batch.source_estate_sha256,
    cohort_key: batch.cohort_key,
    source_policy_version: batch.source_policy_version,
    exclusion_state_sha256: batch.exclusion_state_sha256,
    obligations: batch.obligations.map((row) => ({ obligation_id: row.obligation_id, scope_sha256: row.scope_sha256 })),
  }));

  const workerCount = Math.max(1, Math.min(Number(control.discovery?.parallel_workers || 1), batch.selected_count));
  const shardRows = Array.from({ length: workerCount }, () => []);
  batch.obligations.forEach((row, index) => shardRows[index % workerCount].push(row));
  const shards = shardRows.filter((rows) => rows.length).map((rows, index) => {
    const id = String(index + 1).padStart(2, "0");
    const shardBatch = { ...batch, obligations: rows, selected_count: rows.length };
    return { id, count: rows.length, obligations: rows, plan: buildRetrievalPlan(shardBatch, now) };
  });

  await mkdir(out, { recursive: true });
  await writeJson(join(out, "estate.json"), retryEstate);
  await writeJson(join(out, "campaign-progress.json"), progress);
  await writeJson(join(out, "cohorts.json"), { version: 1, campaign_id: retryEstate.campaign_id, estate_sha256: retryEstate.estate_sha256, source_policy: CARD_BACKFILL_SOURCE_POLICY_V2, counts: retryEstate.counts, cohorts: retryEstate.cohorts });
  await writeJson(join(out, "quarantine.json"), { version: 1, campaign_id: retryEstate.campaign_id, source_estate_sha256: sourceEstate.estate_sha256, count: retryEstate.exclusions.length, exclusions: retryEstate.exclusions, canonical_mutation: false });
  await writeJson(join(out, "batch.json"), batch);
  await writeJson(join(out, "retrieval-plan.json"), buildRetrievalPlan(batch, now));
  const matrix = { include: [] };
  for (const shard of shards) {
    const dir = join(out, "shards", `shard-${shard.id}`);
    await writeJson(join(dir, "retrieval-plan.json"), shard.plan);
    await writeFile(join(dir, "retrieval-facets.txt"), shard.obligations.map((row) => row.obligation_id).join(",") + "\n");
    matrix.include.push({ id: shard.id, count: shard.count, plan_path: `shards/shard-${shard.id}/retrieval-plan.json`, facets_path: `shards/shard-${shard.id}/retrieval-facets.txt` });
  }
  await writeJson(join(out, "shards.json"), { version: 1, campaign_id: batch.campaign_id, batch_sha256: batch.batch_sha256, source_policy_version: 2, workers: shards.length, matrix });
  for (const row of batch.obligations) {
    const scope = buildScopeReceipt(row, { campaignId: batch.campaign_id, estateSha256: batch.estate_sha256, batchSha256: batch.batch_sha256 });
    await writeJson(join(out, "batch-scopes", `${scope.record_id}-${scope.side}.json`), { ...scope, source_policy: CARD_BACKFILL_SOURCE_POLICY_V2, source_policy_version: 2 });
  }
  await writeFile(join(out, "summary.txt"), [
    `campaign=${batch.campaign_id}`,
    `generated_at=${now}`,
    `planner=source-policy-v2`,
    `current_completed_evidence_packets=${progress.current.completed}`,
    `current_open_source_declared_absences=${progress.current.open}`,
    `selector_defined_estate=${progress.current.total}`,
    `source_policy_v2_ready=${retryEstate.counts.ready}`,
    `source_policy_v2_cohorts=${retryEstate.counts.cohorts}`,
    `selected_cohort=${batch.cohort_key}`,
    `selected_count=${batch.selected_count}`,
    `parallel_workers=${shards.length}`,
    `batch_sha256=${batch.batch_sha256}`,
    `canonical_mutation=false`,
  ].join("\n") + "\n");
  console.log(`PASS — source policy v2 admits ${retryEstate.counts.ready} previously attempted obligation(s) across ${retryEstate.counts.cohorts} cohort(s)`);
  console.log(`SELECTED — ${batch.selected_count} obligations from ${batch.cohort_key} across ${shards.length} shard(s)`);
  console.log(`OUTPUT — ${out}`);
}

main().catch((error) => { console.error(`card-backfill source-v2 plan: ${error.message}`); process.exit(1); });
