import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { buildCostModel, canonicalJson, sha256 } from "./card-backfill-amortization.mjs";

async function exists(path) { try { return (await stat(path)).isFile(); } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
async function walk(root, current = root, out = []) {
  let rows = [];
  try { rows = await readdir(current, { withFileTypes: true }); } catch (error) { if (error.code === "ENOENT") return out; throw error; }
  for (const row of rows) {
    const path = join(current, row.name);
    if (row.isDirectory()) await walk(root, path, out);
    else if (row.isFile() && row.name.endsWith(".json")) out.push(path);
  }
  return out;
}
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + "\n"); }

export async function reducePerformanceObservations({ wave, resultsRoot, performanceRoot, now = new Date().toISOString() }) {
  const root = resolve(performanceRoot);
  const byObligation = new Map();
  for (const batch of wave.batches || []) for (const row of batch.obligations || []) byObligation.set(row.obligation_id, { batch, row });
  const telemetryFiles = (await walk(resolve(resultsRoot))).filter((path) => path.endsWith("source-telemetry.json") || path.includes(`${join("telemetry", "")}`));
  const observations = [];
  const seen = new Set();
  for (const file of telemetryFiles.sort()) {
    let value;
    try { value = await readJson(file); } catch { continue; }
    if (value?.lane !== "card-backfill-source-amortization-telemetry") continue;
    for (const item of value.items || []) {
      const context = byObligation.get(item.obligation_id);
      if (!context) throw new Error(`performance observation outside wave ${item.obligation_id}`);
      if (seen.has(item.obligation_id)) throw new Error(`duplicate performance observation ${item.obligation_id}`);
      seen.add(item.obligation_id);
      observations.push({
        ...item,
        batch_sha256: context.batch.batch_sha256,
        cohort_key: context.batch.cohort_key,
        side: context.row.side,
        source_route: context.row.shape?.source_route || null,
        performance_mode: context.row.shape?.performance_mode || null,
      });
    }
  }
  if (observations.length !== wave.selected_count) throw new Error(`performance observation cardinality drift: expected ${wave.selected_count}, found ${observations.length}`);
  const observationBody = {
    version: 1,
    lane: "card-backfill-performance-observation",
    observed_at: now,
    wave_sha256: wave.wave_sha256,
    source_policy_id: wave.source_policy_id,
    source_policy_version: wave.source_policy_version,
    source_policy_revision: wave.source_policy_revision,
    amortization_plan_sha256: wave.amortization_plan_sha256 || null,
    selected_count: wave.selected_count,
    observed_count: observations.length,
    observations: observations.sort((a, b) => a.obligation_id.localeCompare(b.obligation_id, undefined, { numeric: true })),
    canonical_mutation: false,
  };
  const observation = { ...observationBody, observation_sha256: sha256(canonicalJson({ ...observationBody, observed_at: null })) };
  const observationPath = join(root, "observations", `${wave.wave_sha256}.json`);
  if (await exists(observationPath)) {
    const prior = await readJson(observationPath);
    if (prior.observation_sha256 !== observation.observation_sha256) throw new Error(`performance observation collision ${wave.wave_sha256}`);
  } else await writeJson(observationPath, observation);

  const allFiles = await walk(join(root, "observations"));
  const all = [];
  const waveIds = new Set();
  for (const file of allFiles.sort()) {
    const value = await readJson(file);
    if (value?.lane !== "card-backfill-performance-observation") continue;
    if (waveIds.has(value.wave_sha256)) throw new Error(`duplicate performance wave ${value.wave_sha256}`);
    waveIds.add(value.wave_sha256);
    all.push(...(value.observations || []));
  }
  const priorModelPath = join(root, "COST-MODEL.json");
  const priorModel = await exists(priorModelPath) ? await readJson(priorModelPath) : null;
  const candidateModel = buildCostModel({ observations: all, now });
  const model = priorModel?.model_sha256 === candidateModel.model_sha256 ? priorModel : candidateModel;
  if (!priorModel || priorModel.model_sha256 !== candidateModel.model_sha256) await writeJson(priorModelPath, candidateModel);
  return { observation, model, observation_path: observationPath, telemetry_file_count: telemetryFiles.length };
}
