#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }

const final = resolve(option("--final"));
const batch = await readJson(resolve(option("--batch")));
const wave = await readJson(resolve(option("--wave")));
const sourceHead = option("--source-head");
const sourceRunId = Number(option("--source-run-id"));
const batchIndex = Number(option("--batch-index"));
const recoveryRunId = Number(option("--recovery-run-id", process.env.GITHUB_RUN_ID || 0));
const recoveryCodeHead = option("--recovery-code-head", process.env.GITHUB_SHA || null);
if (!/^[0-9a-f]{40}$/i.test(sourceHead || "")) throw new Error("source head is invalid");
if (!Number.isInteger(sourceRunId) || sourceRunId < 1) throw new Error("source run id is invalid");
if (!Number.isInteger(batchIndex) || batchIndex < 1) throw new Error("batch index is invalid");
const receipt = await readJson(join(final, "adjudicated", "adjudication-run-receipt.json"));
if (receipt.batch_sha256 !== batch.batch_sha256) throw new Error("recovered adjudication batch drift");
const result = {
  version: 1,
  lane: "card-backfill-source-v3-wave-result",
  source_head: sourceHead,
  source_workflow_run_id: sourceRunId,
  recovery_workflow_run_id: recoveryRunId || null,
  recovery_code_head: recoveryCodeHead,
  wave_sha256: wave.wave_sha256,
  batch_sha256: batch.batch_sha256,
  batch_index: batchIndex,
  source_policy_id: wave.source_policy_id,
  source_policy_version: wave.source_policy_version,
  source_policy_revision: wave.source_policy_revision,
  lessons_contract_sha256: wave.lessons_contract_sha256,
  amortization_plan_sha256: wave.amortization_plan_sha256,
  cost_model_sha256: wave.cost_model_sha256 || null,
  selected_count: batch.selected_count,
  counts: receipt.counts,
  adjudicated_path: "adjudicated",
  machine_decisions_path: "machine-decisions.json",
  amortization_path: "amortization",
  recovered_from_packetized_artifact: true,
  source_transport_calls: 0,
  artifact_only: true,
  rediscovery: false,
  canonical_mutation: false,
};
await writeFile(join(final, "wave-result.json"), JSON.stringify(result, null, 2) + "\n");
console.log(`PASS — recovered result bound for ${batch.batch_sha256}; source_transport_calls=0; rediscovery=false`);
