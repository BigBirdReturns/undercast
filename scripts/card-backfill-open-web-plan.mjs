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
import { BOUNDED_OPEN_WEB_POLICY, promoteBoundedOpenWebObligations } from "./lib/card-backfill-bounded-open-web.mjs";

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

function currentProgress(control, completed, open) {
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
  const out = resolve(option("--out", ".card-backfill-open-web"));
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
  const progress = currentProgress(control, completedPackets.size, sourceEstate.obligations.length);
  const promotedEstate = promoteBoundedOpenWebObligations(sourceEstate);
  const excluded = new Set([
    ...stagingLedger.entries.map((row) => row.obligation_id),
    ...attemptIndex.entries.map((row) => row.obligation_id),
  ]);
  const obligations = promotedEstate.obligations.filter((row) => !excluded.has(row.obligation_id));
  const allowed = new Set(obligations.map((row) => row.obligation_id));
  const cohorts = promotedEstate.cohorts.map((cohort) => {
    const ids = cohort.obligation_ids.filter((id) => allowed.has(id));
    return { ...cohort, original_count: cohort.count, count: ids.length, discovery_exclusion_count: cohort.count - ids.length, obligation_ids: ids };
  }).filter((cohort) => cohort.count > 0);
  const selectable = {
    ...promotedEstate,
    obligations,
    cohorts,
    counts: { ...promotedEstate.counts, promoted_ready: obligations.length, cohorts: cohorts.length, excluded: excluded.size },
  };
  if (!cohorts.length) throw new Error("no bounded open-web cohort available");

  const batch = selectBatch({ estate: selectable, control, limit });
  const exclusionState = {
    staging_ledger_sha256: stagingLedger.ledger_sha256,
    attempt_index_sha256: attemptIndex.index_sha256,
    excluded_obligation_ids: [...excluded].sort(),
    policy: BOUNDED_OPEN_WEB_POLICY,
  };
  batch.selection_batch_sha256 = batch.batch_sha256;
  batch.source_estate_sha256 = sourceEstate.estate_sha256;
  batch.exclusion_state_sha256 = sha256(canonicalJson(exclusionState));
  batch.source_policy = BOUNDED_OPEN_WEB_POLICY;
  batch.batch_sha256 = sha256(canonicalJson({
    campaign_id: batch.campaign_id,
    estate_sha256: batch.estate_sha256,
    source_estate_sha256: batch.source_estate_sha256,
    cohort_key: batch.cohort_key,
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
  await writeJson(join(out, "estate.json"), selectable);
  await writeJson(join(out, "campaign-progress.json"), progress);
  await writeJson(join(out, "cohorts.json"), { version: 1, campaign_id: selectable.campaign_id, estate_sha256: selectable.estate_sha256, policy: BOUNDED_OPEN_WEB_POLICY, counts: selectable.counts, cohorts });
  await writeJson(join(out, "quarantine.json"), { version: 1, campaign_id: selectable.campaign_id, source_estate_sha256: sourceEstate.estate_sha256, count: promotedEstate.residual_quarantine.length, obligations: promotedEstate.residual_quarantine, canonical_mutation: false });
  await writeJson(join(out, "batch.json"), batch);
  await writeJson(join(out, "retrieval-plan.json"), buildRetrievalPlan(batch, now));
  const matrix = { include: [] };
  for (const shard of shards) {
    const dir = join(out, "shards", `shard-${shard.id}`);
    await writeJson(join(dir, "retrieval-plan.json"), shard.plan);
    await writeFile(join(dir, "retrieval-facets.txt"), shard.obligations.map((row) => row.obligation_id).join(",") + "\n");
    matrix.include.push({ id: shard.id, count: shard.count, plan_path: `shards/shard-${shard.id}/retrieval-plan.json`, facets_path: `shards/shard-${shard.id}/retrieval-facets.txt` });
  }
  await writeJson(join(out, "shards.json"), { version: 1, campaign_id: batch.campaign_id, batch_sha256: batch.batch_sha256, workers: shards.length, matrix });
  for (const row of batch.obligations) {
    const scope = buildScopeReceipt(row, { campaignId: batch.campaign_id, estateSha256: batch.estate_sha256, batchSha256: batch.batch_sha256 });
    await writeJson(join(out, "batch-scopes", `${scope.record_id}-${scope.side}.json`), { ...scope, source_policy: BOUNDED_OPEN_WEB_POLICY });
  }
  await writeFile(join(out, "summary.txt"), [
    `campaign=${batch.campaign_id}`,
    `generated_at=${now}`,
    `planner=bounded-open-web`,
    `current_completed_evidence_packets=${progress.current.completed}`,
    `current_open_source_declared_absences=${progress.current.open}`,
    `selector_defined_estate=${progress.current.total}`,
    `promoted_open_web_obligations=${promotedEstate.obligations.length}`,
    `promoted_available=${obligations.length}`,
    `attempt_or_staging_exclusions=${excluded.size}`,
    `selected_cohort=${batch.cohort_key}`,
    `selected_count=${batch.selected_count}`,
    `parallel_workers=${shards.length}`,
    `batch_sha256=${batch.batch_sha256}`,
    `canonical_mutation=false`,
  ].join("\n") + "\n");
  console.log(`PASS — promoted ${promotedEstate.obligations.length} formerly unbounded still obligations into a bounded Wikipedia-only source route`);
  console.log(`SELECTED — ${batch.selected_count} obligations from ${batch.cohort_key} across ${shards.length} shard(s)`);
  console.log(`OUTPUT — ${out}`);
}

main().catch((error) => { console.error(`card-backfill open-web plan: ${error.message}`); process.exit(1); });
