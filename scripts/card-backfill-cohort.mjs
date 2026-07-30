#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARD_BACKFILL_COHORT_VERSION,
  buildEstate,
  buildRetrievalPlan,
  buildScopeReceipt,
  canonicalJson,
  readCompletedPackets,
  selectBatch,
  sha256,
} from "./lib/card-backfill-cohort.mjs";
import { readAdjudicationAttemptIndex, validateStaging } from "./lib/card-backfill-staging.mjs";

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("--") ? args.shift() : "plan";

function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
function flag(name) { return args.includes(name); }
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

function validateControl(control) {
  if (control.version !== CARD_BACKFILL_COHORT_VERSION || !control.campaign_id) throw new Error("invalid cohort control identity");
  if (control.denominator?.scope !== "sitewide" || control.denominator?.status !== "absent") throw new Error("cohort denominator must remain sitewide/absent");
  if (canonicalJson(control.denominator?.sides) !== canonicalJson(["still", "portrait"])) throw new Error("cohort denominator sides drift");
  if (control.denominator?.completed_packet_unit !== "record") throw new Error("cohort denominator must preserve the live selector packet-per-record rule");
  const batch = control.batch || {};
  if (batch.minimum !== 20 || batch.target !== 40 || batch.maximum !== 50) throw new Error("cohort batch policy must remain 20/40/50");
  const staging = control.staging || {};
  if (staging.minimum_publication_batch !== 20 || staging.target_publication_batch !== 40 || staging.maximum_publication_batch !== 50) throw new Error("staging publication policy must remain 20/40/50");
  if (staging.cross_cohort_publication !== true || staging.accepted_packets_persist_until_publication !== true || staging.canonical_mutation !== false) throw new Error("cross-cohort staging contract drift");
  const invariants = control.invariants || {};
  for (const key of [
    "per_card_receipts_required",
    "independent_evidence_typing_required",
    "repository_wide_duplicate_screen_required",
    "deterministic_render_required",
    "exception_quarantine_required",
    "accepted_packets_persist_across_discovery_cohorts",
    "permanent_batches_may_mix_cohorts",
    "discovery_cohorts_never_require_permanent_minimum",
    "one_full_gate_per_permanent_batch",
    "full_gate_for_permanent_publication_only",
    "frozen_membership_allows_monotonic_progress_counters",
    "already_adjudicated_obligations_are_excluded_from_the_current_discovery_pass",
    "canonical_mutation_false_until_separate_acceptance",
  ]) if (invariants[key] !== true) throw new Error(`missing invariant ${key}`);
}

export function validateCampaignProgress(control, observed) {
  const freeze = control.freeze || {};
  const initialCompleted = Number(freeze.completed_evidence_packets);
  const initialOpen = Number(freeze.open_source_declared_absences);
  const frozenTotal = Number(freeze.selector_defined_estate);
  for (const [key, value] of [["completed_evidence_packets", initialCompleted], ["open_source_declared_absences", initialOpen], ["selector_defined_estate", frozenTotal]]) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`invalid frozen ${key}`);
  }
  const errors = [];
  if (observed.total !== frozenTotal) errors.push(`selector total expected ${frozenTotal}, observed ${observed.total}`);
  if (observed.completed < initialCompleted) errors.push(`completed packets regressed below ${initialCompleted}: observed ${observed.completed}`);
  if (observed.open > initialOpen) errors.push(`open obligations expanded above ${initialOpen}: observed ${observed.open}`);
  if (observed.completed + observed.open !== frozenTotal) errors.push(`current counters do not close frozen total: ${observed.completed}+${observed.open}!=${frozenTotal}`);
  const completedDelta = observed.completed - initialCompleted;
  const openDelta = initialOpen - observed.open;
  if (completedDelta !== openDelta) errors.push(`packet/open progress is not one-for-one: completed +${completedDelta}, open -${openDelta}`);
  return {
    valid: errors.length === 0,
    errors,
    initial: { completed: initialCompleted, open: initialOpen, total: frozenTotal },
    current: observed,
    progress: {
      permanent_packets_published: completedDelta,
      obligations_closed: openDelta,
      completion_percent: frozenTotal ? Number(((observed.completed / frozenTotal) * 100).toFixed(2)) : 0,
      remaining_percent: frozenTotal ? Number(((observed.open / frozenTotal) * 100).toFixed(2)) : 0,
    },
  };
}

export function buildSelectableEstate(estate, excludedObligationIds, stagedObligationIds, attemptedObligationIds, includeAttempted) {
  const cohorts = estate.cohorts.map((cohort) => {
    const obligationIds = cohort.obligation_ids.filter((id) => !excludedObligationIds.has(id));
    return {
      ...cohort,
      original_count: cohort.count,
      count: obligationIds.length,
      discovery_exclusion_count: cohort.count - obligationIds.length,
      obligation_ids: obligationIds,
    };
  }).filter((cohort) => cohort.count > 0);
  const excludedReadyCount = estate.obligations.filter((row) => row.disposition === "ready" && excludedObligationIds.has(row.obligation_id)).length;
  return {
    ...estate,
    cohorts,
    counts: {
      ...estate.counts,
      staged_awaiting_publication: stagedObligationIds.size,
      attempted_in_prior_adjudication_runs: attemptedObligationIds.size,
      attempted_excluded: includeAttempted ? 0 : attemptedObligationIds.size,
      discovery_excluded: excludedObligationIds.size,
      discovery_available: estate.counts.ready - excludedReadyCount,
      cohorts: cohorts.length,
      ready_cohorts: cohorts.filter((row) => row.disposition === "ready").length,
      quarantine_cohorts: cohorts.filter((row) => row.disposition === "quarantine").length,
    },
  };
}

export function configuredCohortKey(control, estate) {
  for (const priority of control.batch?.cohort_priority || []) {
    const cohort = estate.cohorts.find((row) => row.cohort_key === priority.cohort_key && row.disposition === "ready");
    if (!cohort) continue;
    const minimumReady = Number(priority.minimum_ready || 1);
    if (cohort.count >= minimumReady) return cohort.cohort_key;
  }
  return null;
}

async function plan() {
  const controlPath = option("--control", ".github/CARD-BACKFILL-COHORT.json");
  const out = resolve(option("--out", ".card-backfill-cohort"));
  const completedRoot = option("--completed-root", "data/review/card-backfill");
  const now = option("--now", new Date().toISOString());
  const control = await readJson(controlPath);
  validateControl(control);
  const stagingRoot = option("--staging-root", control.staging?.root || "data/review/card-backfill-staging");

  const [specimens, sources, auditRoot, completedPackets, stagingLedger, attemptIndex] = await Promise.all([
    readJson("data/specimens.json"),
    readJson("data/SOURCES.json"),
    readJson("data/MEDIA-AUDIT.json"),
    readCompletedPackets(completedRoot),
    validateStaging({ root: stagingRoot, permanentRoot: completedRoot }),
    readAdjudicationAttemptIndex(stagingRoot, control.campaign_id),
  ]);
  if (stagingLedger.campaign_id && stagingLedger.campaign_id !== control.campaign_id) throw new Error(`staging campaign drift: ${stagingLedger.campaign_id} vs ${control.campaign_id}`);

  const estate = buildEstate({ specimens, sources, auditItems: auditRoot.items || [], completedPackets, control });
  estate.generated_at = now;
  const observed = {
    completed: estate.denominator.completed_packet_count,
    open: estate.denominator.open_obligation_count,
    total: estate.denominator.selector_total,
  };
  const campaignProgress = validateCampaignProgress(control, observed);
  if (!campaignProgress.valid && !flag("--allow-denominator-drift")) throw new Error(`frozen campaign progress drift: ${campaignProgress.errors.join("; ")}`);

  const stagedObligationIds = new Set(stagingLedger.entries.map((entry) => entry.obligation_id));
  const attemptedObligationIds = new Set(attemptIndex.entries.map((entry) => entry.obligation_id));
  const openObligationIds = new Set(estate.obligations.map((row) => row.obligation_id));
  for (const id of stagedObligationIds) if (!openObligationIds.has(id)) throw new Error(`staged obligation is outside the current open estate: ${id}`);
  const includeAttempted = flag("--include-attempted");
  const discoveryExclusions = new Set([...stagedObligationIds, ...(includeAttempted ? [] : attemptedObligationIds)]);
  const selectableEstate = buildSelectableEstate(estate, discoveryExclusions, stagedObligationIds, attemptedObligationIds, includeAttempted);
  estate.campaign_progress = campaignProgress;
  estate.staging = {
    root: stagingRoot,
    ledger_sha256: stagingLedger.ledger_sha256,
    staged_count: stagingLedger.counts.staged,
    staged_obligation_ids: [...stagedObligationIds].sort(),
    attempt_index_sha256: attemptIndex.index_sha256,
    attempted_count: attemptIndex.attempted_count,
    include_attempted: includeAttempted,
    discovery_exclusion_count: discoveryExclusions.size,
    discovery_excluded_obligation_ids: [...discoveryExclusions].sort(),
    canonical_mutation: false,
  };

  const requestedCohortKey = option("--cohort-key", null);
  const selectedCohortKey = requestedCohortKey || configuredCohortKey(control, selectableEstate);
  const batch = selectBatch({ estate: selectableEstate, control, cohortKey: selectedCohortKey, limit: option("--limit", null) });
  const selectionBatchSha256 = batch.batch_sha256;
  const exclusionState = {
    staging_ledger_sha256: stagingLedger.ledger_sha256,
    attempt_index_sha256: attemptIndex.index_sha256,
    include_attempted: includeAttempted,
    excluded_obligation_ids: [...discoveryExclusions].sort(),
  };
  batch.selection_batch_sha256 = selectionBatchSha256;
  batch.exclusion_state_sha256 = sha256(canonicalJson(exclusionState));
  batch.staging_ledger_sha256 = stagingLedger.ledger_sha256;
  batch.attempt_index_sha256 = attemptIndex.index_sha256;
  batch.staged_obligations_excluded = stagedObligationIds.size;
  batch.attempted_obligations_excluded = includeAttempted ? 0 : attemptedObligationIds.size;
  batch.batch_sha256 = sha256(canonicalJson({
    campaign_id: batch.campaign_id,
    estate_sha256: batch.estate_sha256,
    cohort_key: batch.cohort_key,
    exclusion_state_sha256: batch.exclusion_state_sha256,
    obligations: batch.obligations.map((row) => ({ obligation_id: row.obligation_id, scope_sha256: row.scope_sha256 })),
  }));
  const retrievalPlan = buildRetrievalPlan(batch, now);
  const workerCount = Math.max(1, Math.min(Number(control.discovery?.parallel_workers || 1), batch.selected_count));
  const shardObligations = Array.from({ length: workerCount }, () => []);
  batch.obligations.forEach((row, index) => shardObligations[index % workerCount].push(row));
  const shards = shardObligations.filter((rows) => rows.length).map((rows, index) => {
    const id = String(index + 1).padStart(2, "0");
    const shardBatch = { ...batch, obligations: rows, selected_count: rows.length };
    return { id, count: rows.length, obligation_ids: rows.map((row) => row.obligation_id), plan: buildRetrievalPlan(shardBatch, now) };
  });
  const fullScopes = estate.obligations.map((row) => buildScopeReceipt(row, { campaignId: estate.campaign_id, estateSha256: estate.estate_sha256 }));
  const batchScopes = batch.obligations.map((row) => buildScopeReceipt(row, { campaignId: estate.campaign_id, estateSha256: estate.estate_sha256, batchSha256: batch.batch_sha256 }));

  await mkdir(out, { recursive: true });
  await writeJson(join(out, "estate.json"), estate);
  await writeJson(join(out, "campaign-progress.json"), campaignProgress);
  await writeJson(join(out, "cohorts.json"), { version: 1, campaign_id: estate.campaign_id, estate_sha256: estate.estate_sha256, counts: selectableEstate.counts, cohorts: selectableEstate.cohorts });
  await writeJson(join(out, "quarantine.json"), { version: 1, campaign_id: estate.campaign_id, estate_sha256: estate.estate_sha256, count: estate.counts.quarantine, obligations: estate.obligations.filter((row) => row.disposition === "quarantine") });
  await writeJson(join(out, "staging-exclusions.json"), { version: 1, campaign_id: estate.campaign_id, staging_ledger_sha256: stagingLedger.ledger_sha256, staged_count: stagedObligationIds.size, staged_obligation_ids: [...stagedObligationIds].sort(), attempt_index_sha256: attemptIndex.index_sha256, attempted_count: attemptIndex.attempted_count, include_attempted: includeAttempted, discovery_exclusion_count: discoveryExclusions.size, discovery_excluded_obligation_ids: [...discoveryExclusions].sort(), canonical_mutation: false });
  await writeJson(join(out, "adjudication-attempt-index.json"), attemptIndex);
  await writeJson(join(out, "batch.json"), batch);
  await writeJson(join(out, "retrieval-plan.json"), retrievalPlan);
  const shardMatrix = { include: [] };
  for (const shard of shards) {
    const dir = join(out, "shards", `shard-${shard.id}`);
    await writeJson(join(dir, "retrieval-plan.json"), shard.plan);
    await writeFile(join(dir, "retrieval-facets.txt"), shard.obligation_ids.join(",") + "\n");
    shardMatrix.include.push({ id: shard.id, count: shard.count, plan_path: `shards/shard-${shard.id}/retrieval-plan.json`, facets_path: `shards/shard-${shard.id}/retrieval-facets.txt` });
  }
  await writeJson(join(out, "shards.json"), { version: 1, campaign_id: estate.campaign_id, batch_sha256: batch.batch_sha256, workers: shards.length, matrix: shardMatrix });

  const scopeIndex = [];
  for (const scope of fullScopes) {
    const name = `${scope.record_id}-${scope.side}.json`;
    const path = join(out, "scopes", name);
    await writeJson(path, scope);
    scopeIndex.push({ obligation_id: scope.obligation_id, path: `scopes/${name}`, receipt_sha256: scope.receipt_sha256, disposition: scope.disposition });
  }
  await writeJson(join(out, "scope-index.json"), { version: 1, campaign_id: estate.campaign_id, estate_sha256: estate.estate_sha256, count: scopeIndex.length, index_sha256: sha256(canonicalJson(scopeIndex)), scopes: scopeIndex });
  for (const scope of batchScopes) await writeJson(join(out, "batch-scopes", `${scope.record_id}-${scope.side}.json`), scope);

  const facets = batch.obligations.map((row) => row.obligation_id).join(",");
  await writeFile(join(out, "retrieval-facets.txt"), facets + (facets ? "\n" : ""));
  await writeFile(join(out, "summary.txt"), [
    `campaign=${estate.campaign_id}`,
    `generated_at=${now}`,
    `initial_completed_evidence_packets=${campaignProgress.initial.completed}`,
    `current_completed_evidence_packets=${observed.completed}`,
    `current_open_source_declared_absences=${observed.open}`,
    `selector_defined_estate=${observed.total}`,
    `permanent_packets_published_since_freeze=${campaignProgress.progress.permanent_packets_published}`,
    `staged_awaiting_publication=${stagingLedger.counts.staged}`,
    `adjudicated_attempted=${attemptIndex.attempted_count}`,
    `include_attempted=${includeAttempted}`,
    `discovery_excluded=${discoveryExclusions.size}`,
    `ready_obligations=${estate.counts.ready}`,
    `discovery_available=${selectableEstate.counts.discovery_available}`,
    `quarantined_obligations=${estate.counts.quarantine}`,
    `cohorts=${selectableEstate.counts.cohorts}`,
    `selected_cohort=${batch.cohort_key}`,
    `selected_count=${batch.selected_count}`,
    `parallel_workers=${shards.length}`,
    `underfilled=${batch.underfilled}`,
    `estate_sha256=${estate.estate_sha256}`,
    `staging_ledger_sha256=${stagingLedger.ledger_sha256}`,
    `attempt_index_sha256=${attemptIndex.index_sha256}`,
    `batch_sha256=${batch.batch_sha256}`,
    `scope_index_sha256=${sha256(canonicalJson(scopeIndex))}`,
    `canonical_mutation=false`,
  ].join("\n") + "\n");

  console.log(`PASS — frozen estate membership remains ${observed.total}; permanent progress is ${observed.completed} completed and ${observed.open} open`);
  console.log(`PASS — excluded ${stagingLedger.counts.staged} accepted packet(s) awaiting publication without counting them complete`);
  console.log(`PASS — ${includeAttempted ? "included" : "excluded"} ${attemptIndex.attempted_count} already adjudicated obligation(s) for this discovery pass`);
  console.log(`PASS — classified ${estate.counts.ready} ready and ${estate.counts.quarantine} quarantined obligations across ${selectableEstate.counts.cohorts} available cohort(s)`);
  console.log(`PASS — extracted ${fullScopes.length} per-facet scope receipts in one pass`);
  console.log(`SELECTED — ${batch.selected_count} obligations from ${batch.cohort_key} across ${shards.length} retrieval shard(s)`);
  console.log(`OUTPUT — ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (command !== "plan") throw new Error(`unknown command ${command}`);
  plan().catch((error) => { console.error(`card-backfill cohort: ${error.message}`); process.exit(1); });
}
