#!/usr/bin/env node
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export async function countPermanentPackets(root) {
  let entries = [];
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  return entries.filter((entry) => entry.isDirectory() && /^UC-\d+$/i.test(entry.name)).length;
}

export async function countReadyDecisions(decisionsRoot, stagingAdjudicationsRoot) {
  let entries = [];
  try { entries = await readdir(decisionsRoot, { withFileTypes: true }); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  let ready = 0;
  for (const entry of entries.filter((row) => row.isFile() && row.name.endsWith(".json"))) {
    const value = await readJson(join(decisionsRoot, entry.name));
    if (value.version !== 1 || value.status !== "ready" || !value.batch_sha256) continue;
    try {
      await readFile(join(stagingAdjudicationsRoot, `${value.batch_sha256}.json`));
    } catch (error) {
      if (error.code === "ENOENT") ready += 1;
      else throw error;
    }
  }
  return ready;
}

export function computeNextAction({ completed, target, readyDecisions, staged, publicationMinimum, total }) {
  for (const [name, value] of Object.entries({ completed, target, readyDecisions, staged, publicationMinimum, total })) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  }
  if (target < 1 || target > total) throw new Error(`target ${target} must be within 1..${total}`);
  if (completed > total) throw new Error(`completed ${completed} exceeds estate ${total}`);
  if (publicationMinimum < 2) throw new Error("publication minimum must remain at least 2");

  const completionPercent = Number(((completed / total) * 100).toFixed(2));
  if (completed >= target) return { action: "stop", reason: "target-reached", completion_percent: completionPercent };
  if (readyDecisions > 0) return { action: "stage", reason: "ready-decisions", completion_percent: completionPercent };
  if (staged >= publicationMinimum) return { action: "publish", reason: "publication-ready", completion_percent: completionPercent };
  return { action: "discover", reason: "below-target", completion_percent: completionPercent };
}

export async function buildRoute({
  activationPath,
  controlPath,
  stagingPath,
  permanentRoot,
  decisionsRoot,
  stagingAdjudicationsRoot,
}) {
  const [activation, control, staging, completed, readyDecisions] = await Promise.all([
    readJson(activationPath),
    readJson(controlPath),
    readJson(stagingPath),
    countPermanentPackets(permanentRoot),
    countReadyDecisions(decisionsRoot, stagingAdjudicationsRoot),
  ]);
  if (activation.active !== true || activation.manual_continue_required !== false) throw new Error("amortization activation is not unattended");
  if (activation.successor_dispatch_is_explicit !== true || activation.workflow_token_push_recursion_is_not_assumed !== true) throw new Error("explicit successor-dispatch contract is inactive");

  const campaign = activation.unattended_campaign || {};
  const total = Number(campaign.selector_defined_estate ?? control.freeze?.selector_defined_estate);
  const targetPercent = Number(campaign.minimum_completion_percent);
  const target = Number(campaign.minimum_completed_packets ?? Math.ceil(total * targetPercent / 100));
  const expectedTarget = Math.ceil(total * targetPercent / 100);
  if (!Number.isInteger(total) || total < 1) throw new Error("selector-defined estate is invalid");
  if (!Number.isFinite(targetPercent) || targetPercent <= 0 || targetPercent > 100) throw new Error("completion target percent is invalid");
  if (target !== expectedTarget) throw new Error(`target packet drift: ${target} vs ${expectedTarget} for ${targetPercent}% of ${total}`);
  if (control.freeze?.selector_defined_estate !== total) throw new Error("activation/control estate drift");

  const staged = Number(staging.counts?.staged || 0);
  const publicationMinimum = Number(control.staging?.minimum_publication_batch ?? 2);
  const decision = computeNextAction({ completed, target, readyDecisions, staged, publicationMinimum, total });
  return {
    version: 1,
    lane: "card-backfill-next-action",
    ...decision,
    completed,
    target_completed_packets: target,
    target_completion_percent: targetPercent,
    selector_defined_estate: total,
    ready_decisions: readyDecisions,
    staged_packets: staged,
    publication_minimum: publicationMinimum,
    manual_continue_required: false,
    successor_dispatch_is_explicit: true,
    canonical_mutation: false,
  };
}

async function main() {
  const out = resolve(option("--out", ".card-backfill-next-action.json"));
  const githubOutput = option("--github-output", null);
  const route = await buildRoute({
    activationPath: resolve(option("--activation", ".github/CARD-BACKFILL-AMORTIZATION-ACTIVE.json")),
    controlPath: resolve(option("--control", ".github/CARD-BACKFILL-COHORT.json")),
    stagingPath: resolve(option("--staging", "data/review/card-backfill-staging/STAGING.json")),
    permanentRoot: resolve(option("--permanent-root", "data/review/card-backfill")),
    decisionsRoot: resolve(option("--decisions-root", ".github/card-backfill/adjudications")),
    stagingAdjudicationsRoot: resolve(option("--staging-adjudications-root", "data/review/card-backfill-staging/adjudications")),
  });
  await writeJson(out, route);
  if (githubOutput) {
    for (const [key, value] of Object.entries({
      action: route.action,
      reason: route.reason,
      completed: route.completed,
      target: route.target_completed_packets,
      completion_percent: route.completion_percent,
      ready_decisions: route.ready_decisions,
      staged: route.staged_packets,
      publication_minimum: route.publication_minimum,
    })) await appendFile(githubOutput, `${key}=${value}\n`);
  }
  console.log(`ROUTE — ${route.action}; reason=${route.reason}; completed=${route.completed}/${route.target_completed_packets}; staged=${route.staged_packets}; ready_decisions=${route.ready_decisions}`);
  console.log("manual_continue_required=false");
  console.log(`OUTPUT — ${out}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`card-backfill route next: ${error.message}`);
    process.exit(1);
  });
}
