#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  buildEstate,
  buildRetrievalPlan,
  buildScopeReceipt,
  canonicalJson,
  readCompletedPackets,
  sha256,
} from "./lib/card-backfill-cohort.mjs";
import { validateStaging } from "./lib/card-backfill-staging.mjs";
import { readPolicyAwareAdjudicationAttemptIndex } from "./lib/card-backfill-attempt-index.mjs";
import { buildSourcePolicyV2Estate, CARD_BACKFILL_SOURCE_POLICY_V2 } from "./lib/card-backfill-source-policy-v2.mjs";
import { buildSourcePolicyV5Estate, CARD_BACKFILL_SOURCE_POLICY_V5 } from "./lib/card-backfill-source-policy-v5.mjs";
import { buildDisjointWaveBatches, validateDisjointWave } from "./lib/card-backfill-wave.mjs";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
function integerOption(name, fallback) {
  const value = Number(option(name, String(fallback)));
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer`);
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
  const out = resolve(option("--out", ".card-backfill-source-v4-wave"));
  const completedRoot = option("--completed-root", "data/review/card-backfill");
  const control = await readJson(controlPath);
  const stagingRoot = option("--staging-root", control.staging?.root || "data/review/card-backfill-staging");
  const now = option("--now", new Date().toISOString());
  const batchLimit = integerOption("--batch-limit", control.autonomous_campaign?.wave_batch_size || control.batch?.target || 40);
  const waveBatchLimit = integerOption("--wave-batches", control.autonomous_campaign?.parallel_wave_batches || 4);
  const workersPerBatch = integerOption("--workers-per-batch", control.discovery?.parallel_workers || 4);

  const [specimens, sources, auditRoot, completedPackets, stagingLedger, attemptIndex] = await Promise.all([
    readJson("data/specimens.json"),
    readJson("data/SOURCES.json"),
    readJson("data/MEDIA-AUDIT.json"),
    readCompletedPackets(completedRoot),
    validateStaging({ root: stagingRoot, permanentRoot: completedRoot }),
    readPolicyAwareAdjudicationAttemptIndex(stagingRoot, control.campaign_id),
  ]);
  const publicationMinimum = Number(control.staging?.minimum_publication_batch ?? 2);
  if (!Number.isInteger(publicationMinimum) || publicationMinimum < 2) throw new Error(`invalid publication minimum ${publicationMinimum}`);
  if (stagingLedger.counts.staged >= publicationMinimum) throw new Error(`no source-policy-v4 wave available: ${stagingLedger.counts.staged} staged packet(s) are publication-ready; discovery yields to the permanent publisher`);

  const sourceEstate = buildEstate({ specimens, sources, auditItems: auditRoot.items || [], completedPackets, control });
  sourceEstate.generated_at = now;
  const progress = validateProgress(control, completedPackets.size, sourceEstate.obligations.length);
  const stagedObligationIds = stagingLedger.entries.map((row) => row.obligation_id);
  const v4Estate = buildSourcePolicyV2Estate({ estate: sourceEstate, attemptIndex, stagedObligationIds });
  const v5Estate = v4Estate.cohorts.length ? null : buildSourcePolicyV5Estate({ estate: sourceEstate, attemptIndex, stagedObligationIds });
  const retryEstate = v4Estate.cohorts.length ? v4Estate : v5Estate;
  const selectedPolicy = v4Estate.cohorts.length ? CARD_BACKFILL_SOURCE_POLICY_V2 : CARD_BACKFILL_SOURCE_POLICY_V5;
  if (!retryEstate?.cohorts.length) throw new Error("no single-subject source-policy wave available");

  const exclusionState = {
    staging_ledger_sha256: stagingLedger.ledger_sha256,
    attempt_index_sha256: attemptIndex.index_sha256,
    source_policy: selectedPolicy,
  };
  const exclusionStateSha256 = sha256(canonicalJson(exclusionState));
  const wave = validateDisjointWave(buildDisjointWaveBatches({
    estate: retryEstate,
    control,
    sourceEstateSha256: sourceEstate.estate_sha256,
    exclusionStateSha256,
    policy: selectedPolicy,
    batchLimit,
    waveBatchLimit,
  }));
  if (!wave.wave_batches) throw new Error("no source-policy-v4 wave available");

  const discoverMatrix = { include: [] };
  const assembleMatrix = { include: [] };
  for (const batch of wave.batches) {
    const batchRoot = join(out, "batches", batch.batch_sha256);
    await writeJson(join(batchRoot, "batch.json"), batch);
    const workerCount = Math.max(1, Math.min(workersPerBatch, batch.selected_count));
    const shardRows = Array.from({ length: workerCount }, () => []);
    batch.obligations.forEach((row, index) => shardRows[index % workerCount].push(row));
    for (const [index, rows] of shardRows.entries()) {
      if (!rows.length) continue;
      const shardId = String(index + 1).padStart(2, "0");
      const shardBatch = { ...batch, obligations: rows, selected_count: rows.length };
      const relativePlan = `batches/${batch.batch_sha256}/shards/shard-${shardId}/retrieval-plan.json`;
      await writeJson(join(out, relativePlan), buildRetrievalPlan(shardBatch, now));
      await writeFile(join(out, `batches/${batch.batch_sha256}/shards/shard-${shardId}/retrieval-facets.txt`), rows.map((row) => row.obligation_id).join(",") + "\n");
      discoverMatrix.include.push({
        batch_sha256: batch.batch_sha256,
        batch_index: batch.wave_batch_index,
        shard_id: shardId,
        count: rows.length,
        plan_path: relativePlan,
      });
    }
    for (const row of batch.obligations) {
      const scope = buildScopeReceipt(row, { campaignId: batch.campaign_id, estateSha256: batch.estate_sha256, batchSha256: batch.batch_sha256 });
      await writeJson(join(batchRoot, "batch-scopes", `${scope.record_id}-${scope.side}.json`), {
        ...scope,
        source_policy: selectedPolicy,
        source_policy_id: batch.source_policy_id,
        source_policy_version: batch.source_policy_version,
        source_policy_revision: batch.source_policy_revision,
        lessons_contract_sha256: batch.lessons_contract_sha256,
      });
    }
    assembleMatrix.include.push({
      batch_sha256: batch.batch_sha256,
      batch_index: batch.wave_batch_index,
      selected_count: batch.selected_count,
      batch_path: `batches/${batch.batch_sha256}/batch.json`,
      scopes_path: `batches/${batch.batch_sha256}/batch-scopes`,
      shard_pattern: `card-backfill-source-v3-wave-shard-${batch.batch_sha256}-*`,
    });
  }

  await writeJson(join(out, "wave.json"), wave);
  await writeJson(join(out, "estate.json"), retryEstate);
  await writeJson(join(out, "campaign-progress.json"), progress);
  await writeJson(join(out, "exclusion-state.json"), { ...exclusionState, exclusion_state_sha256: exclusionStateSha256, canonical_mutation: false });
  await writeJson(join(out, "discover-matrix.json"), discoverMatrix);
  await writeJson(join(out, "assemble-matrix.json"), assembleMatrix);
  await writeFile(join(out, "summary.txt"), [
    `campaign=${wave.campaign_id}`,
    `generated_at=${now}`,
    `planner=source-policy-v${selectedPolicy.version}-wave`,
    `current_completed_evidence_packets=${progress.current.completed}`,
    `current_open_source_declared_absences=${progress.current.open}`,
    `selector_defined_estate=${progress.current.total}`,
    `source_policy_ready=${retryEstate.counts.ready}`,
    `source_policy_cohorts=${retryEstate.counts.cohorts}`,
    `wave_batches=${wave.wave_batches}`,
    `selected_count=${wave.selected_count}`,
    `discovery_jobs=${discoverMatrix.include.length}`,
    `disjoint_obligation_ids=${wave.disjoint_obligation_ids.length}`,
    `artifact_only=${wave.artifact_only}`,
    `source_policy_id=${wave.source_policy_id}`,
    `source_policy_revision=${wave.source_policy_revision}`,
    `lessons_contract_sha256=${wave.lessons_contract_sha256}`,
    `wave_sha256=${wave.wave_sha256}`,
    `canonical_mutation=false`,
  ].join("\n") + "\n");
  console.log(`PASS — source policy v${selectedPolicy.version} wave selected ${wave.selected_count} disjoint obligation(s) in ${wave.wave_batches} immutable batch(es)`);
  console.log(`FANOUT — ${discoverMatrix.include.length} shard job(s); artifact_only=true`);
  console.log(`POLICY — ${wave.source_policy_id} lessons=${wave.lessons_contract_sha256}`);
  console.log(`OUTPUT — ${out}`);
}

main().catch((error) => {
  console.error(`card-backfill source-v3 wave plan: ${error.message}`);
  process.exit(1);
});
