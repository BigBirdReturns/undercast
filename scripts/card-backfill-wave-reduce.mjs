#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { canonicalJson, hashFile, sha256, stageAcceptedRun, validateStaging } from "./lib/card-backfill-staging.mjs";
import { validateDisjointWave } from "./lib/card-backfill-wave.mjs";

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
async function exists(path) { try { return (await stat(path)).isFile(); } catch (error) { if (error.code === "ENOENT") return false; throw error; } }

async function findNamedFiles(root, name, out = []) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await findNamedFiles(path, name, out);
    else if (entry.isFile() && entry.name === name) out.push(path);
  }
  return out;
}

async function copyExact(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  if (await exists(destination)) {
    if (await hashFile(source) !== await hashFile(destination)) throw new Error(`wave reduction receipt collision ${destination}`);
    return false;
  }
  await cp(source, destination, { errorOnExist: true, force: false });
  return true;
}

async function main() {
  const wavePath = resolve(option("--wave"));
  const resultsRoot = resolve(option("--results-root"));
  const stagingRoot = resolve(option("--staging-root", "data/review/card-backfill-staging"));
  const permanentRoot = resolve(option("--permanent-root", "data/review/card-backfill"));
  const adjudicationsRoot = resolve(option("--adjudications-root", ".github/card-backfill/adjudications"));
  const waveReceiptRoot = resolve(option("--wave-receipt-root", ".github/card-backfill/waves"));
  const sourceHead = option("--source-head");
  const observedHead = option("--observed-head", sourceHead);
  const now = option("--now", new Date().toISOString());
  if (!sourceHead || !/^[0-9a-f]{40}$/i.test(sourceHead)) throw new Error("source_head must be a full commit SHA");
  if (observedHead !== sourceHead) throw new Error(`refusing stale wave reduction: source_head ${sourceHead} differs from observed head ${observedHead}`);

  const wave = validateDisjointWave(await readJson(wavePath));
  const resultPaths = await findNamedFiles(resultsRoot, "wave-result.json");
  if (resultPaths.length !== wave.wave_batches) throw new Error(`wave result cardinality drift: expected ${wave.wave_batches}, found ${resultPaths.length}`);
  const results = [];
  for (const path of resultPaths) {
    const result = await readJson(path);
    result._root = dirname(path);
    results.push(result);
  }
  results.sort((a, b) => Number(a.batch_index) - Number(b.batch_index));
  const expectedByBatch = new Map(wave.batches.map((batch) => [batch.batch_sha256, batch]));
  if (new Set(results.map((row) => row.batch_sha256)).size !== results.length) throw new Error("duplicate wave result batch");

  const reduced = [];
  for (const result of results) {
    const batch = expectedByBatch.get(result.batch_sha256);
    if (!batch) throw new Error(`unexpected wave result batch ${result.batch_sha256}`);
    if (result.source_head !== sourceHead || result.wave_sha256 !== wave.wave_sha256) throw new Error(`wave result custody drift ${result.batch_sha256}`);
    if (result.lessons_contract_sha256 !== wave.lessons_contract_sha256 || result.source_policy_id !== wave.source_policy_id) throw new Error(`wave result policy drift ${result.batch_sha256}`);
    const adjudicated = join(result._root, result.adjudicated_path || "adjudicated");
    const receiptPath = join(adjudicated, "adjudication-run-receipt.json");
    const receipt = await readJson(receiptPath);
    if (receipt.batch_sha256 !== batch.batch_sha256 || receipt.campaign_id !== wave.campaign_id || receipt.cohort_key !== batch.cohort_key) throw new Error(`adjudication receipt wave custody drift ${batch.batch_sha256}`);
    const enriched = {
      ...receipt,
      source_policy: wave.source_policy,
      source_policy_id: wave.source_policy_id,
      source_policy_version: wave.source_policy_version,
      source_policy_revision: wave.source_policy_revision,
      lessons_contract_sha256: wave.lessons_contract_sha256,
      wave_sha256: wave.wave_sha256,
      wave_batch_index: batch.wave_batch_index,
      source_head: sourceHead,
      canonical_mutation: false,
    };
    await writeJson(receiptPath, enriched);
    const stage = await stageAcceptedRun({ input: adjudicated, root: stagingRoot, permanentRoot, now });
    const decisionSource = join(result._root, result.machine_decisions_path || "machine-decisions.json");
    const decisionDestination = join(adjudicationsRoot, `${batch.batch_sha256}.json`);
    const decisionAdded = await copyExact(decisionSource, decisionDestination);
    reduced.push({
      batch_sha256: batch.batch_sha256,
      batch_index: batch.wave_batch_index,
      selected_count: batch.selected_count,
      accepted_count: receipt.counts?.accepted || 0,
      rejected_count: receipt.counts?.rejected || 0,
      pre_quarantined_count: receipt.counts?.pre_quarantined || 0,
      staging_added: stage.added.length,
      decision_added: decisionAdded,
      adjudication_result_sha256: receipt.result_sha256,
    });
  }

  const ledger = await validateStaging({ root: stagingRoot, permanentRoot });
  const receiptBase = {
    version: 1,
    lane: "card-backfill-source-v3-wave-reduction",
    reduced_at: now,
    source_head: sourceHead,
    wave_sha256: wave.wave_sha256,
    source_policy_id: wave.source_policy_id,
    source_policy_version: wave.source_policy_version,
    source_policy_revision: wave.source_policy_revision,
    lessons_contract_sha256: wave.lessons_contract_sha256,
    counts: {
      batches: reduced.length,
      selected: reduced.reduce((sum, row) => sum + row.selected_count, 0),
      accepted: reduced.reduce((sum, row) => sum + row.accepted_count, 0),
      rejected: reduced.reduce((sum, row) => sum + row.rejected_count, 0),
      pre_quarantined: reduced.reduce((sum, row) => sum + row.pre_quarantined_count, 0),
      staged_after_reduction: ledger.counts.staged,
    },
    reduced_batches: reduced,
    staging_ledger_sha256: ledger.ledger_sha256,
    exact_head_required_before_push: true,
    canonical_mutation: false,
  };
  const reductionSha256 = sha256(canonicalJson(receiptBase));
  const reduction = { ...receiptBase, reduction_sha256: reductionSha256 };
  await writeJson(join(waveReceiptRoot, `${wave.wave_sha256}.json`), reduction);
  console.log(`PASS — reduced ${reduced.length} immutable wave result(s) into one branch transaction`);
  console.log(`REDUCTION — selected=${reduction.counts.selected} accepted=${reduction.counts.accepted} staged=${reduction.counts.staged_after_reduction}`);
  console.log(`POLICY — ${wave.source_policy_id} lessons=${wave.lessons_contract_sha256}`);
  console.log(`RECEIPT — ${join(waveReceiptRoot, `${wave.wave_sha256}.json`)}`);
}

main().catch((error) => {
  console.error(`card-backfill wave reduce: ${error.message}`);
  process.exit(1);
});
