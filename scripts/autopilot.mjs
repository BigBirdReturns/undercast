#!/usr/bin/env node
import { appendFile, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  AUTOPILOT_VERSION,
  claimTasks,
  completeReviews,
  emptyState,
  requeueTask,
  sha256,
  statusSummary,
  submitResults,
  syncState,
  validateState,
} from "./lib/autopilot.mjs";

const DEFAULT_STATE = "data/AUTOPILOT.json";
const DEFAULT_SCOPES = "data/AUTOPILOT-SCOPES.json";
const DEFAULT_COVERAGE = "data/CENSUS-COVERAGE.json";
const DEFAULT_MANIFEST = "data/CENSUS-MANIFEST.json";
const DEFAULT_DRAFTS = "data/drafts.json";
const DEFAULT_SPECIMENS = "data/specimens.json";
const DEFAULT_SOURCES = "data/SOURCES.json";
const DEFAULT_GROWTH_REJECTIONS = "data/journal/rejections.jsonl";
const DEFAULT_JOURNAL = "data/journal/autopilot.jsonl";
const DEFAULT_LOCK = "data/AUTOPILOT.lock";

const args = process.argv.slice(2);
const command = args.shift() || "status";

function option(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} requires a value`);
  return value;
}

function flag(name) {
  return args.includes(`--${name}`);
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return structuredClone(fallback);
    throw new Error(`cannot read ${path}: ${error.message}`);
  }
}

async function readJsonl(path) {
  let text;
  try { text = await readFile(path, "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") return [];
    throw new Error(`cannot read ${path}: ${error.message}`);
  }
  const rows = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); }
    catch (error) { throw new Error(`${path}:${index + 1}: invalid JSONL (${error.message})`); }
  }
  return rows;
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n");
  await rename(tmp, path);
}

async function appendJournal(path, events) {
  if (!events?.length) return;
  await mkdir(dirname(path), { recursive: true });
  const lines = events.map((entry) => {
    const body = { version: AUTOPILOT_VERSION, ...entry };
    const id = `apj_${createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 24)}`;
    return JSON.stringify({ id, ...body });
  }).join("\n") + "\n";
  await appendFile(path, lines);
}

async function withLock(fn) {
  const lockPath = option("lock", DEFAULT_LOCK);
  await mkdir(dirname(lockPath), { recursive: true });
  let handle;
  try {
    handle = await open(lockPath, "wx");
    await handle.writeFile(JSON.stringify({ pid: process.pid, command, started_at: new Date().toISOString() }) + "\n");
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`${lockPath} exists; another autopilot writer may be active. Remove it only after confirming no writer is running.`);
    throw error;
  }
  try { return await fn(); }
  finally {
    await handle?.close().catch(() => {});
    await rm(lockPath, { force: true });
  }
}

async function loadState(path = option("state", DEFAULT_STATE)) {
  const state = await readJson(path, emptyState());
  validateState(state);
  return state;
}

function renderPrompt(batch) {
  const taskBlocks = batch.tasks.map((task, index) => `### ${index + 1}. ${task.performer} — ${task.character}\n- Task: \`${task.id}\`\n- Scope: ${task.scope} / ${task.franchise}\n- Categories: ${task.category.join(", ") || "unclassified"}\n- Mode hints: ${task.performance_modes.join(", ") || "unresolved"}\n- Performer already represented: ${task.performer_on_wall ? "yes" : "no"}\n- Sources:\n${task.sources.map((source) => `  - ${source}`).join("\n")}`).join("\n\n");
  return `# UNDERCAST Luna batch\n\nLease \`${batch.lease_id}\` expires ${batch.expires_at}. Read \`AGENTS.md\`, \`GROW.md\`, \`LUNA.md\`, and \`docs/AUTOPILOT.md\` before acting.\n\nFor every task return exactly one evidence-backed decision: \`draft\`, \`reject\`, or \`blocked\`. Do not infer missing facts and do not substitute a different performer or role. The result file must cover every task exactly once. Drafted tasks are not complete until canonical merge, retrieval, the archive gate, and a separate media review verify the exact still and portrait subjects or explicit absence.\n\n${taskBlocks}\n`;
}

function printStatus(summary) {
  console.log(`autopilot: ${summary.claimable} claimable / ${summary.total} total; ${summary.in_flight} in flight; ${summary.expired_leases} expired leases`);
  for (const [scope, row] of Object.entries(summary.scopes).sort()) {
    const states = Object.entries(row.statuses).sort().map(([name, count]) => `${name}=${count}`).join(" ");
    console.log(`  ${scope}: ${row.total} (${states})`);
  }
}

async function syncCommand() {
  return withLock(async () => {
    const statePath = option("state", DEFAULT_STATE);
    const coveragePath = option("coverage", DEFAULT_COVERAGE);
    const scopesPath = option("scopes", DEFAULT_SCOPES);
    const journalPath = option("journal", DEFAULT_JOURNAL);
    const manifestPath = option("manifest", DEFAULT_MANIFEST);
    const draftsPath = option("drafts", DEFAULT_DRAFTS);
    const specimensPath = option("specimens", DEFAULT_SPECIMENS);
    const growthRejectionsPath = option("growth-rejections", DEFAULT_GROWTH_REJECTIONS);
    const coverageBytes = await readFile(coveragePath);
    const coverage = JSON.parse(coverageBytes);
    const [scopes, manifest, drafts, specimens, growthRejections] = await Promise.all([
      readJson(scopesPath),
      readJson(manifestPath, { observations: [] }),
      readJson(draftsPath, []),
      readJson(specimensPath, []),
      readJsonl(growthRejectionsPath),
    ]);
    const state = await loadState(statePath);
    const sourcePaths = { coverage_path: coveragePath, scopes_path: scopesPath, manifest_path: manifestPath, drafts_path: draftsPath, specimens_path: specimensPath, growth_rejections_path: growthRejectionsPath };
    const result = syncState({ coverage, scopes, manifest, state, coverageSha256: sha256(coverageBytes), sourcePaths, drafts, specimens, growthRejections, now: option("now", new Date().toISOString()) });
    if (result.changed) {
      await atomicJson(statePath, result.state);
      await appendJournal(journalPath, result.events);
    }
    const summary = statusSummary(result.state, { scope: option("scope") });
    if (flag("json")) console.log(JSON.stringify({ changed: result.changed, ...summary }, null, 2));
    else { console.log(result.changed ? `synced ${statePath}` : "sync: no state change"); printStatus(summary); }
  });
}

async function claimCommand({ syncFirst = false } = {}) {
  return withLock(async () => {
    const statePath = option("state", DEFAULT_STATE);
    const journalPath = option("journal", DEFAULT_JOURNAL);
    let state = await loadState(statePath);
    let syncEvents = [];
    let syncChanged = false;
    if (syncFirst) {
      const coveragePath = option("coverage", DEFAULT_COVERAGE);
      const scopesPath = option("scopes", DEFAULT_SCOPES);
      const manifestPath = option("manifest", DEFAULT_MANIFEST);
      const draftsPath = option("drafts", DEFAULT_DRAFTS);
      const specimensPath = option("specimens", DEFAULT_SPECIMENS);
      const growthRejectionsPath = option("growth-rejections", DEFAULT_GROWTH_REJECTIONS);
      const coverageBytes = await readFile(coveragePath);
      const coverage = JSON.parse(coverageBytes);
      const [scopes, manifest, drafts, specimens, growthRejections] = await Promise.all([
        readJson(scopesPath),
        readJson(manifestPath, { observations: [] }),
        readJson(draftsPath, []),
        readJson(specimensPath, []),
        readJsonl(growthRejectionsPath),
      ]);
      const sourcePaths = { coverage_path: coveragePath, scopes_path: scopesPath, manifest_path: manifestPath, drafts_path: draftsPath, specimens_path: specimensPath, growth_rejections_path: growthRejectionsPath };
      const synced = syncState({ coverage, scopes, manifest, state, coverageSha256: sha256(coverageBytes), sourcePaths, drafts, specimens, growthRejections, now: option("now", new Date().toISOString()) });
      state = synced.state;
      syncEvents = synced.events;
      syncChanged = synced.changed;
    }
    const result = claimTasks({
      state,
      agent: option("agent"),
      scope: option("scope"),
      limit: Number(option("limit", "8")),
      leaseMinutes: Number(option("lease-minutes", "120")),
      allowInflight: flag("allow-inflight"),
      now: option("now", new Date().toISOString()),
    });
    if (result.changed || syncChanged || syncEvents.length) {
      await atomicJson(statePath, result.state);
      await appendJournal(journalPath, [...syncEvents, ...result.events]);
    }
    if (!result.batch) {
      console.log(result.reason === "inflight"
        ? `no lease issued: ${result.in_flight.length} task(s) are already leased, drafted, or awaiting media review in this scope`
        : "no claimable tasks");
      process.exitCode = 3;
      return;
    }
    const out = option("out");
    const prompt = option("prompt");
    if (out) await atomicJson(out, result.batch);
    if (prompt) {
      await mkdir(dirname(prompt), { recursive: true });
      await writeFile(prompt, renderPrompt(result.batch));
    }
    console.log(JSON.stringify(result.batch, null, 2));
  });
}

async function submitCommand() {
  return withLock(async () => {
    const statePath = option("state", DEFAULT_STATE);
    const draftsPath = option("drafts", DEFAULT_DRAFTS);
    const journalPath = option("journal", DEFAULT_JOURNAL);
    const batchPath = option("batch");
    const inputPath = option("input");
    if (!batchPath || !inputPath) throw new Error("submit requires --batch and --input");
    const [state, batch, resultsDoc, drafts] = await Promise.all([
      loadState(statePath),
      readJson(batchPath),
      readJson(inputPath),
      readJson(draftsPath, []),
    ]);
    const result = submitResults({ state, batch, resultsDoc, drafts, now: option("now", new Date().toISOString()) });
    await atomicJson(draftsPath, result.drafts);
    await atomicJson(statePath, result.state);
    await appendJournal(journalPath, result.events);
    console.log(`submitted ${resultsDoc.results.length} results; ${result.drafts.length} total drafts waiting in ${draftsPath}`);
  });
}

async function completeCommand() {
  return withLock(async () => {
    const statePath = option("state", DEFAULT_STATE);
    const sourcesPath = option("sources", DEFAULT_SOURCES);
    const specimensPath = option("specimens", DEFAULT_SPECIMENS);
    const journalPath = option("journal", DEFAULT_JOURNAL);
    const inputPath = option("input");
    if (!inputPath) throw new Error("complete requires --input");
    const [state, reviewDoc, sourcesBytes, specimensBytes] = await Promise.all([
      loadState(statePath),
      readJson(inputPath),
      readFile(sourcesPath),
      readFile(specimensPath),
    ]);
    let sourceLedger;
    try { sourceLedger = JSON.parse(sourcesBytes); }
    catch (error) { throw new Error(`cannot parse ${sourcesPath}: ${error.message}`); }
    const corpusSha256 = sha256(Buffer.concat([specimensBytes, Buffer.from("\n"), sourcesBytes]));
    const result = completeReviews({
      state, reviewDoc, sourceLedger, corpusSha256,
      now: option("now", new Date().toISOString()),
    });
    await atomicJson(statePath, result.state);
    await appendJournal(journalPath, result.events);
    console.log(`completed ${reviewDoc.reviews.length} post-merge media review(s)`);
  });
}

async function statusCommand() {
  const state = await loadState();
  const summary = statusSummary(state, { scope: option("scope"), now: option("now", new Date().toISOString()) });
  if (flag("json")) console.log(JSON.stringify(summary, null, 2)); else printStatus(summary);
}

async function requeueCommand() {
  return withLock(async () => {
    const statePath = option("state", DEFAULT_STATE);
    const journalPath = option("journal", DEFAULT_JOURNAL);
    const taskId = option("task");
    const reason = option("reason");
    if (!taskId) throw new Error("requeue requires --task");
    const result = requeueTask({ state: await loadState(statePath), taskId, reason, now: option("now", new Date().toISOString()) });
    await atomicJson(statePath, result.state);
    await appendJournal(journalPath, result.events);
    console.log(`requeued ${taskId}`);
  });
}

async function validateCommand() {
  const state = await loadState();
  console.log(`PASS — ${state.jobs.length} autopilot jobs, state contract valid`);
}

function archivePreflight(action) {
  const gate = spawnSync(process.execPath, ["scripts/validate.mjs"], { stdio: "inherit" });
  if (gate.error) throw new Error(`archive preflight could not start: ${gate.error.message}`);
  if (gate.status !== 0) throw new Error(`archive preflight failed with exit ${gate.status}; refusing to ${action}`);
}

async function main() {
  if (command === "sync") return syncCommand();
  if (command === "claim") return claimCommand();
  if (command === "next") { archivePreflight("lease more work"); return claimCommand({ syncFirst: true }); }
  if (command === "submit") return submitCommand();
  if (command === "complete") { archivePreflight("close media review"); return completeCommand(); }
  if (command === "status") return statusCommand();
  if (command === "requeue") return requeueCommand();
  if (command === "validate") return validateCommand();
  throw new Error(`unknown command ${command}. Use sync, next, claim, submit, complete, status, requeue, or validate.`);
}

main().catch((error) => {
  console.error(`autopilot: ${error.message}`);
  process.exitCode = 1;
});
