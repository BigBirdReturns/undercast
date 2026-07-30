#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
  const invariants = control.invariants || {};
  for (const key of [
    "per_card_receipts_required",
    "independent_evidence_typing_required",
    "repository_wide_duplicate_screen_required",
    "deterministic_render_required",
    "exception_quarantine_required",
    "one_full_gate_per_permanent_batch",
    "canonical_mutation_false_until_separate_acceptance",
  ]) if (invariants[key] !== true) throw new Error(`missing invariant ${key}`);
}

async function plan() {
  const controlPath = option("--control", ".github/CARD-BACKFILL-COHORT.json");
  const out = resolve(option("--out", ".card-backfill-cohort"));
  const completedRoot = option("--completed-root", "data/review/card-backfill");
  const now = option("--now", new Date().toISOString());
  const control = await readJson(controlPath);
  validateControl(control);

  const [specimens, sources, auditRoot, completedPackets] = await Promise.all([
    readJson("data/specimens.json"),
    readJson("data/SOURCES.json"),
    readJson("data/MEDIA-AUDIT.json"),
    readCompletedPackets(completedRoot),
  ]);
  const estate = buildEstate({ specimens, sources, auditItems: auditRoot.items || [], completedPackets, control });
  estate.generated_at = now;

  const observed = {
    completed: estate.denominator.completed_packet_count,
    open: estate.denominator.open_obligation_count,
    total: estate.denominator.selector_total,
  };
  const expected = control.freeze || {};
  const mismatches = [
    ["completed", expected.completed_evidence_packets, observed.completed],
    ["open", expected.open_source_declared_absences, observed.open],
    ["total", expected.selector_defined_estate, observed.total],
  ].filter(([, want, got]) => Number.isInteger(want) && want !== got);
  if (mismatches.length && !flag("--allow-denominator-drift")) {
    throw new Error(`frozen denominator drift: ${mismatches.map(([key, want, got]) => `${key} expected ${want}, observed ${got}`).join("; ")}`);
  }

  const batch = selectBatch({ estate, control, cohortKey: option("--cohort-key", null), limit: option("--limit", null) });
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
  await writeJson(join(out, "cohorts.json"), { version: 1, campaign_id: estate.campaign_id, estate_sha256: estate.estate_sha256, counts: estate.counts, cohorts: estate.cohorts });
  await writeJson(join(out, "quarantine.json"), { version: 1, campaign_id: estate.campaign_id, estate_sha256: estate.estate_sha256, count: estate.counts.quarantine, obligations: estate.obligations.filter((row) => row.disposition === "quarantine") });
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
    `completed_evidence_packets=${observed.completed}`,
    `open_source_declared_absences=${observed.open}`,
    `selector_defined_estate=${observed.total}`,
    `ready_obligations=${estate.counts.ready}`,
    `quarantined_obligations=${estate.counts.quarantine}`,
    `cohorts=${estate.counts.cohorts}`,
    `selected_cohort=${batch.cohort_key}`,
    `selected_count=${batch.selected_count}`,
    `parallel_workers=${shards.length}`,
    `underfilled=${batch.underfilled}`,
    `estate_sha256=${estate.estate_sha256}`,
    `batch_sha256=${batch.batch_sha256}`,
    `scope_index_sha256=${sha256(canonicalJson(scopeIndex))}`,
    `canonical_mutation=false`,
  ].join("\n") + "\n");

  console.log(`PASS — froze ${observed.open} open obligations plus ${observed.completed} completed packets (${observed.total} total)`);
  console.log(`PASS — classified ${estate.counts.ready} ready and ${estate.counts.quarantine} quarantined obligations across ${estate.counts.cohorts} cohorts`);
  console.log(`PASS — extracted ${fullScopes.length} per-facet scope receipts in one pass`);
  console.log(`SELECTED — ${batch.selected_count} obligations from ${batch.cohort_key} across ${shards.length} retrieval shard(s)`);
  console.log(`OUTPUT — ${out}`);
}

if (command !== "plan") throw new Error(`unknown command ${command}`);
plan().catch((error) => { console.error(`card-backfill cohort: ${error.message}`); process.exit(1); });
