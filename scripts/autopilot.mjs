#!/usr/bin/env node
import { appendFile, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  AUTOPILOT_VERSION,
  certifyScope,
  claimTasks,
  completeReviews,
  emptyCertifications,
  emptyState,
  requeueTask,
  resolveScopeReadiness,
  runRefreshSteps,
  sha256,
  statusSummary,
  submitResults,
  syncState,
  validateCertifications,
  validateState,
} from "./lib/autopilot.mjs";

const DEFAULT_STATE = "data/AUTOPILOT.json";
const DEFAULT_SCOPES = "data/AUTOPILOT-SCOPES.json";
const DEFAULT_CERTIFICATIONS = "data/AUTOPILOT-CERTIFICATIONS.json";
const DEFAULT_COVERAGE = "data/CENSUS-COVERAGE.json";
const DEFAULT_MANIFEST = "data/CENSUS-MANIFEST.json";
const DEFAULT_PRESERVATION = "preservation/SNAPSHOTS.json";
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

async function readJsonBytes(path, fallback) {
  try {
    const bytes = await readFile(path);
    return { bytes, value: JSON.parse(bytes) };
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) {
      const value = structuredClone(fallback);
      return { bytes: Buffer.from(JSON.stringify(value)), value };
    }
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

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value, null, 2) + "\n");
}

function journalLines(events) {
  if (!events?.length) return "";
  return events.map((entry) => {
    const body = { version: AUTOPILOT_VERSION, ...entry };
    const id = `apj_${createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 24)}`;
    return JSON.stringify({ id, ...body });
  }).join("\n") + "\n";
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  await writeFile(tmp, jsonBytes(value));
  await rename(tmp, path);
}

async function atomicWriteTransaction(writes) {
  const unique = new Set();
  const prepared = [];
  try {
    for (const [index, write] of writes.entries()) {
      if (!write?.path || unique.has(write.path)) throw new Error(`atomic write transaction has duplicate or missing path ${write?.path || "<missing>"}`);
      unique.add(write.path);
      await mkdir(dirname(write.path), { recursive: true });
      let original = null;
      let existed = true;
      try { original = await readFile(write.path); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        existed = false;
      }
      const tmp = `${write.path}.tmp.${process.pid}.${index}`;
      const entry = { ...write, tmp, original, existed, committed: false };
      prepared.push(entry);
      await writeFile(tmp, write.bytes);
    }
    for (const write of prepared) {
      await rename(write.tmp, write.path);
      write.committed = true;
    }
  } catch (error) {
    const restoreErrors = [];
    for (const [index, write] of prepared.entries()) {
      if (!write.committed) continue;
      try {
        if (write.existed) {
          const restore = `${write.path}.restore.${process.pid}.${index}`;
          await writeFile(restore, write.original);
          await rename(restore, write.path);
        } else {
          await rm(write.path, { force: true });
        }
      } catch (restoreError) {
        restoreErrors.push(`${write.path}: ${restoreError.message}`);
      }
    }
    if (restoreErrors.length) throw new Error(`atomic transaction failed (${error.message}) and rollback was incomplete: ${restoreErrors.join("; ")}`);
    throw error;
  } finally {
    for (const write of prepared) await rm(write.tmp, { force: true }).catch(() => {});
  }
}
async function journalAppendBytes(path, events) {
  let original;
  try { original = await readFile(path); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    original = Buffer.alloc(0);
  }
  return Buffer.concat([original, Buffer.from(journalLines(events))]);
}

async function appendJournal(path, events) {
  const lines = journalLines(events);
  if (!lines) return;
  await mkdir(dirname(path), { recursive: true });
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

function queuePaths() {
  return {
    state: option("state", DEFAULT_STATE),
    scopes: option("scopes", DEFAULT_SCOPES),
    certifications: option("certifications", DEFAULT_CERTIFICATIONS),
    coverage: option("coverage", DEFAULT_COVERAGE),
    manifest: option("manifest", DEFAULT_MANIFEST),
    preservation: option("preservation", DEFAULT_PRESERVATION),
    drafts: option("drafts", DEFAULT_DRAFTS),
    specimens: option("specimens", DEFAULT_SPECIMENS),
    growthRejections: option("growth-rejections", DEFAULT_GROWTH_REJECTIONS),
    journal: option("journal", DEFAULT_JOURNAL),
  };
}

async function loadQueueInputs({ downstream = true } = {}) {
  const paths = queuePaths();
  const [coverageDoc, manifestDoc, scopes, certifications, preservation] = await Promise.all([
    readJsonBytes(paths.coverage),
    readJsonBytes(paths.manifest, { observations: [] }),
    readJson(paths.scopes),
    readJson(paths.certifications, emptyCertifications()),
    readJson(paths.preservation, { version: 1, updated_at: "", history_guard: { baseline_manifest_sha256: "0".repeat(64), status: "unconfigured", precondition_met: false, destructive_rewrite_authorized: false }, snapshots: [] }),
  ]);
  validateCertifications(certifications);
  const readiness = await resolveScopeReadiness({
    scopesDoc: scopes,
    certificationsDoc: certifications,
    coverage: coverageDoc.value,
    manifest: manifestDoc.value,
    coverageSha256: sha256(coverageDoc.bytes),
    manifestSha256: sha256(manifestDoc.bytes),
    preservation,
    root: option("root", "."),
    now: option("now", new Date().toISOString()),
  });
  const result = {
    paths,
    coverage: coverageDoc.value,
    coverageBytes: coverageDoc.bytes,
    manifest: manifestDoc.value,
    manifestBytes: manifestDoc.bytes,
    scopes,
    certifications,
    preservation,
    effectiveScopes: readiness.effectiveScopes,
    readiness: readiness.readiness,
  };
  if (downstream) {
    [result.drafts, result.specimens, result.growthRejections] = await Promise.all([
      readJson(paths.drafts, []),
      readJson(paths.specimens, []),
      readJsonl(paths.growthRejections),
    ]);
  }
  return result;
}

function readyScope(inputs, scopeId, { requireActive = true } = {}) {
  if (!scopeId) throw new Error("leasing requires --scope; one lease may not span independently certified producers");
  const row = inputs.readiness.find((item) => item.scope_id === scopeId);
  if (!row) throw new Error(`unknown scope ${scopeId}`);
  if (requireActive && (row.effective_status !== "active" || !row.lease_token)) {
    throw new Error(`scope ${scopeId} is not ready for autonomous work (${row.reasons.join(", ") || row.lease_status || row.effective_status})`);
  }
  return row;
}

function renderPrompt(batch) {
  const taskBlocks = batch.tasks.map((task, index) => `### ${index + 1}. ${task.performer} — ${task.character}\n- Task: \`${task.id}\`\n- Scope: ${task.scope} / ${task.franchise}\n- Categories: ${task.category.join(", ") || "unclassified"}\n- Mode hints: ${task.performance_modes.join(", ") || "unresolved"}\n- Performer already represented: ${task.performer_on_wall ? "yes" : "no"}\n- Sources:\n${task.sources.map((source) => `  - ${source}`).join("\n")}`).join("\n\n");
  return `# UNDERCAST Luna batch\n\nLease \`${batch.lease_id}\` expires ${batch.expires_at}. Read \`AGENTS.md\`, \`GROW.md\`, \`LUNA.md\`, and \`docs/AUTOPILOT.md\` before acting. This packet is bound to readiness token \`${batch.readiness.lease_token}\`; a producer or census change invalidates it.\n\nFor every task return exactly one evidence-backed decision: \`draft\`, \`reject\`, or \`blocked\`. Do not infer missing facts and do not substitute a different performer or role. The result file must cover every task exactly once. Drafted tasks are not complete until canonical merge, retrieval, the archive gate, and a separate media review verify the exact still and portrait subjects or explicit absence.\n\n${taskBlocks}\n`;
}

function printStatus(summary) {
  console.log(`autopilot: ${summary.claimable} claimable / ${summary.total} total; ${summary.in_flight} in flight; ${summary.expired_leases} expired leases`);
  for (const [scope, row] of Object.entries(summary.scopes).sort()) {
    const states = Object.entries(row.statuses).sort().map(([name, count]) => `${name}=${count}`).join(" ");
    console.log(`  ${scope}: ${row.total} (${states})`);
  }
}

function printReadiness(rows) {
  for (const row of rows) {
    const reason = row.reasons.length ? ` — ${row.reasons.join(", ")}` : "";
    const details = row.snapshot_details ? `; rows=${row.snapshot_details.rows} receipts=${row.snapshot_details.complete_receipts}/${row.snapshot_details.sources}` : "";
    const refresh = row.refresh ? ` refresh=${row.refresh.due ? "due" : `due-${row.refresh.due_at}`}` : "";
    const preservation = row.preservation ? ` preservation=${row.preservation}` : "";
    console.log(`  ${row.scope_id}: declared=${row.declared_status} effective=${row.effective_status} lease=${row.lease_status || "blocked"} certification=${row.certification} snapshot=${row.snapshot}${preservation}${details}${refresh}${reason}`);
  }
}

function sourcePaths(inputs) {
  return {
    coverage_path: inputs.paths.coverage,
    scopes_path: inputs.paths.scopes,
    certifications_path: inputs.paths.certifications,
    manifest_path: inputs.paths.manifest,
    preservation_path: inputs.paths.preservation,
    drafts_path: inputs.paths.drafts,
    specimens_path: inputs.paths.specimens,
    growth_rejections_path: inputs.paths.growthRejections,
  };
}

function reconcile(state, inputs) {
  return syncState({
    coverage: inputs.coverage,
    scopes: inputs.effectiveScopes,
    manifest: inputs.manifest,
    state,
    coverageSha256: sha256(inputs.coverageBytes),
    sourcePaths: sourcePaths(inputs),
    drafts: inputs.drafts,
    specimens: inputs.specimens,
    growthRejections: inputs.growthRejections,
    readinessTokens: Object.fromEntries(inputs.readiness.filter((row) => row.effective_status === "active" && row.lease_token).map((row) => [row.scope_id, row.lease_token])),
    now: option("now", new Date().toISOString()),
  });
}

async function syncCommand() {
  return withLock(async () => {
    const inputs = await loadQueueInputs();
    const state = await loadState(inputs.paths.state);
    const result = reconcile(state, inputs);
    if (result.changed) {
      await atomicJson(inputs.paths.state, result.state);
      await appendJournal(inputs.paths.journal, result.events);
    }
    const summary = statusSummary(result.state, { scope: option("scope") });
    if (flag("json")) console.log(JSON.stringify({ changed: result.changed, readiness: inputs.readiness, ...summary }, null, 2));
    else {
      console.log(result.changed ? `synced ${inputs.paths.state}` : "sync: no state change");
      printReadiness(inputs.readiness);
      printStatus(summary);
    }
  });
}

async function claimCommand({ syncFirst = false } = {}) {
  return withLock(async () => {
    const scopeId = option("scope");
    const requestedLimit = Number(option("limit", "8"));
    const inputs = await loadQueueInputs();
    const readiness = readyScope(inputs, scopeId);
    await waterlinePreflight(scopeId, requestedLimit);
    await mediaAuditPreflight(scopeId);
    let state = await loadState(inputs.paths.state);
    let syncEvents = [];
    let syncChanged = false;
    if (syncFirst) {
      const synced = reconcile(state, inputs);
      state = synced.state;
      syncEvents = synced.events;
      syncChanged = synced.changed;
    }
    const leaseReadiness = {
      scope_id: scopeId,
      lease_token: readiness.lease_token,
      producer_sha256: readiness.producer_sha256,
      contract_sha256: readiness.contract_sha256,
      coverage_sha256: readiness.snapshot_details.coverage_sha256,
      manifest_sha256: readiness.snapshot_details.manifest_sha256,
    };
    const result = claimTasks({
      state,
      agent: option("agent"),
      scope: scopeId,
      readiness: leaseReadiness,
      limit: requestedLimit,
      leaseMinutes: Number(option("lease-minutes", "120")),
      allowInflight: flag("allow-inflight"),
      now: option("now", new Date().toISOString()),
    });
    if (result.changed || syncChanged || syncEvents.length) {
      await atomicJson(inputs.paths.state, result.state);
      await appendJournal(inputs.paths.journal, [...syncEvents, ...result.events]);
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
    const paths = queuePaths();
    const batchPath = option("batch");
    const inputPath = option("input");
    if (!batchPath || !inputPath) throw new Error("submit requires --batch and --input");
    const [state, batch, resultsDoc, drafts, inputs] = await Promise.all([
      loadState(paths.state),
      readJson(batchPath),
      readJson(inputPath),
      readJson(paths.drafts, []),
      loadQueueInputs({ downstream: false }),
    ]);
    const scopeId = batch?.readiness?.scope_id;
    const readiness = readyScope(inputs, scopeId);
    if (!batch.readiness?.lease_token || batch.readiness.lease_token !== readiness.lease_token) {
      throw new Error(`lease ${batch?.lease_id || "<missing>"} was issued against a different producer or census snapshot; discard it and claim a new batch`);
    }
    const jobs = new Map(state.jobs.map((job) => [job.id, job]));
    for (const task of batch.tasks || []) {
      const job = jobs.get(task.id);
      if (!task.source_fingerprint || task.source_fingerprint !== job?.source_fingerprint) {
        throw new Error(`task ${task.id || "<missing>"} source fingerprint changed after leasing`);
      }
    }
    const result = submitResults({ state, batch, resultsDoc, drafts, now: option("now", new Date().toISOString()) });
    await atomicJson(paths.drafts, result.drafts);
    await atomicJson(paths.state, result.state);
    await appendJournal(paths.journal, result.events);
    console.log(`submitted ${resultsDoc.results.length} results; ${result.drafts.length} total drafts waiting in ${paths.drafts}`);
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
    const [state, reviewDoc, sourcesBytes, specimensBytes, inputs] = await Promise.all([
      loadState(statePath),
      readJson(inputPath),
      readFile(sourcesPath),
      readFile(specimensPath),
      loadQueueInputs({ downstream: false }),
    ]);
    let sourceLedger;
    try { sourceLedger = JSON.parse(sourcesBytes); }
    catch (error) { throw new Error(`cannot parse ${sourcesPath}: ${error.message}`); }
    const corpusSha256 = sha256(Buffer.concat([specimensBytes, Buffer.from("\n"), sourcesBytes]));
    const readinessTokens = Object.fromEntries(inputs.readiness
      .filter((row) => row.effective_status === "active" && row.lease_token)
      .map((row) => [row.scope_id, row.lease_token]));
    const result = completeReviews({
      state, reviewDoc, sourceLedger, corpusSha256, readinessTokens,
      now: option("now", new Date().toISOString()),
    });
    await atomicJson(statePath, result.state);
    await appendJournal(journalPath, result.events);
    console.log(`completed ${reviewDoc.reviews.length} post-merge media review(s)`);
  });
}

async function refreshCommand() {
  return withLock(async () => {
    const refreshedBy = option("refreshed-by");
    if (!refreshedBy) throw new Error("refresh requires --refreshed-by");
    const root = option("root", ".");
    const beforeInputs = await loadQueueInputs();
    let scopeId = option("scope");
    if (!scopeId && flag("due")) {
      const candidate = beforeInputs.readiness
        .filter((row) => row.effective_status === "active" && row.refresh?.due)
        .sort((a, b) => b.priority - a.priority || a.scope_id.localeCompare(b.scope_id))[0];
      if (!candidate) {
        console.log("no certified scope is due for refresh");
        process.exitCode = 3;
        return;
      }
      scopeId = candidate.scope_id;
    }
    if (!scopeId) throw new Error("refresh requires --scope or --due");
    const beforeReadiness = readyScope(beforeInputs, scopeId);
    if (flag("due") && !beforeReadiness.refresh?.due) {
      console.log(`scope ${scopeId} is not due until ${beforeReadiness.refresh?.due_at || "its next captured snapshot"}`);
      process.exitCode = 3;
      return;
    }
    const state = await loadState(beforeInputs.paths.state);
    const inFlight = state.jobs.filter((job) => job.scope === scopeId && ["leased", "drafted", "merged"].includes(job.status));
    if (inFlight.length) throw new Error(`scope ${scopeId} has ${inFlight.length} in-flight task(s); refresh would invalidate their evidence packets`);
    const scopeRows = Array.isArray(beforeInputs.scopes) ? beforeInputs.scopes : beforeInputs.scopes.scopes;
    const scope = scopeRows.find((row) => row.id === scopeId);
    const stepReceipts = runRefreshSteps(scope, { cwd: root, env: process.env });
    const projection = spawnSync(process.execPath, ["scripts/shard.mjs"], { cwd: root, stdio: "inherit" });
    if (projection.error) throw new Error(`deterministic projection rebuild could not start: ${projection.error.message}`);
    if (projection.status !== 0) throw new Error(`deterministic projection rebuild failed with exit ${projection.status}`);
    archivePreflight(`publish refreshed scope ${scopeId}`, root);

    const afterInputs = await loadQueueInputs();
    const afterReadiness = readyScope(afterInputs, scopeId, { requireActive: false });
    const result = reconcile(state, afterInputs);
    const now = option("now", new Date().toISOString());
    const event = {
      op: "scope.refreshed",
      at: now,
      scope: scopeId,
      refreshed_by: refreshedBy,
      before_lease_token: beforeReadiness.lease_token,
      after_lease_token: afterReadiness.lease_token || null,
      after_lease_status: afterReadiness.lease_status || "blocked",
      preservation: afterReadiness.preservation || null,
      coverage_sha256: afterReadiness.snapshot_details.coverage_sha256,
      manifest_sha256: afterReadiness.snapshot_details.manifest_sha256,
      steps: stepReceipts,
    };
    await atomicWriteTransaction([
      { path: afterInputs.paths.state, bytes: jsonBytes(result.state) },
      { path: afterInputs.paths.journal, bytes: await journalAppendBytes(afterInputs.paths.journal, [...result.events, event]) },
    ]);
    console.log(`refreshed ${scopeId}: ${afterReadiness.snapshot_details.rows} source rows, ${afterReadiness.snapshot_details.complete_receipts}/${afterReadiness.snapshot_details.sources} receipts; lease=${afterReadiness.lease_status || "blocked"}; queue ${result.changed ? "reconciled" : "unchanged"}`);
  });
}

async function readinessCommand() {
  const inputs = await loadQueueInputs({ downstream: false });
  const selected = option("scope") ? inputs.readiness.filter((row) => row.scope_id === option("scope")) : inputs.readiness;
  if (!selected.length) throw new Error(`unknown scope ${option("scope")}`);
  if (flag("require-active")) for (const row of selected) {
    if (row.effective_status !== "active" || !row.lease_token) throw new Error(`scope ${row.scope_id} is not lease-ready: ${row.reasons.join(", ") || row.lease_status || row.effective_status}`);
  }
  if (flag("json")) console.log(JSON.stringify(selected, null, 2)); else printReadiness(selected);
}

async function certifyCommand() {
  return withLock(async () => {
    const paths = queuePaths();
    const scopeId = option("scope");
    const reviewedBy = option("reviewed-by");
    const now = option("now", new Date().toISOString());
    if (!scopeId) throw new Error("certify requires --scope");
    if (!reviewedBy) throw new Error("certify requires --reviewed-by");
    const [coverageDoc, manifestDoc, scopes, certifications, preservation, state] = await Promise.all([
      readJsonBytes(paths.coverage),
      readJsonBytes(paths.manifest, { observations: [] }),
      readJson(paths.scopes),
      readJson(paths.certifications, emptyCertifications()),
      readJson(paths.preservation),
      loadState(paths.state),
    ]);
    const inFlight = state.jobs.filter((job) => job.scope === scopeId && ["leased", "drafted", "merged"].includes(job.status));
    if (inFlight.length) throw new Error(`scope ${scopeId} has ${inFlight.length} in-flight task(s); finish, requeue, or expire them before certification`);
    const certified = await certifyScope({
      scopesDoc: scopes,
      certificationsDoc: certifications,
      scopeId,
      certifiedBy: reviewedBy,
      coverage: coverageDoc.value,
      manifest: manifestDoc.value,
      coverageSha256: sha256(coverageDoc.bytes),
      manifestSha256: sha256(manifestDoc.bytes),
      preservation,
      root: option("root", "."),
      cwd: option("root", "."),
      now,
    });
    archivePreflight(`certify scope ${scopeId}`);
    const nextScopes = structuredClone(scopes);
    if (flag("activate")) {
      const rows = Array.isArray(nextScopes) ? nextScopes : nextScopes.scopes;
      const scope = rows.find((row) => row.id === scopeId);
      scope.status = "active";
    }
    const prospective = await resolveScopeReadiness({
      scopesDoc: nextScopes,
      certificationsDoc: certified.certifications,
      coverage: coverageDoc.value,
      manifest: manifestDoc.value,
      coverageSha256: sha256(coverageDoc.bytes),
      manifestSha256: sha256(manifestDoc.bytes),
      preservation,
      root: option("root", "."),
    });
    const row = prospective.readiness.find((item) => item.scope_id === scopeId);
    if (flag("activate") && (row.effective_status !== "active" || !row.lease_token)) {
      throw new Error(`scope ${scopeId} cannot be activated for leasing: ${row.reasons.join(", ") || row.lease_status || row.effective_status}`);
    }
    const event = {
      op: "scope.certified",
      at: now,
      scope: scopeId,
      certified_by: reviewedBy,
      producer_sha256: certified.certificate.producer_sha256,
      contract_sha256: certified.certificate.contract_sha256,
      coverage_sha256: certified.certificate.snapshot.coverage_sha256,
      manifest_sha256: certified.certificate.snapshot.manifest_sha256,
      activated: flag("activate"),
    };
    const writes = [
      { path: paths.certifications, bytes: jsonBytes(certified.certifications) },
      { path: paths.journal, bytes: await journalAppendBytes(paths.journal, [event]) },
    ];
    if (flag("activate")) writes.splice(1, 0, { path: paths.scopes, bytes: jsonBytes(nextScopes) });
    await atomicWriteTransaction(writes);
    console.log(`certified ${scopeId}${flag("activate") ? " and activated it" : ""}: producer ${certified.certificate.producer_sha256.slice(0, 12)}, ${certified.snapshot.rows} coverage rows, ${certified.snapshot.complete_receipts}/${certified.snapshot.sources} source receipts`);
  });
}
async function pauseCommand() {
  return withLock(async () => {
    const paths = queuePaths();
    const scopeId = option("scope");
    const reason = option("reason");
    const pausedBy = option("paused-by");
    const now = option("now", new Date().toISOString());
    if (!scopeId || !reason || !pausedBy) throw new Error("pause requires --scope, --reason, and --paused-by");
    const scopes = await readJson(paths.scopes);
    const nextScopes = structuredClone(scopes);
    const rows = Array.isArray(nextScopes) ? nextScopes : nextScopes.scopes;
    const scope = rows.find((row) => row.id === scopeId);
    if (!scope) throw new Error(`unknown scope ${scopeId}`);
    scope.status = "paused";
    const event = { op: "scope.paused", at: now, scope: scopeId, reason, paused_by: pausedBy };
    await atomicWriteTransaction([
      { path: paths.scopes, bytes: jsonBytes(nextScopes) },
      { path: paths.journal, bytes: await journalAppendBytes(paths.journal, [event]) },
    ]);
    console.log(`paused ${scopeId}: ${reason}`);
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
  const [state, inputs] = await Promise.all([loadState(), loadQueueInputs({ downstream: false })]);
  validateCertifications(inputs.certifications);
  const byScope = new Map(inputs.readiness.map((row) => [row.scope_id, row]));
  for (const job of state.jobs) {
    const readiness = byScope.get(job.scope);
    if (["queued", "leased", "drafted", "merged"].includes(job.status) && readiness?.effective_status !== "active") {
      throw new Error(`task ${job.id} is ${job.status} while scope ${job.scope} is not effectively active; run autopilot sync`);
    }
    const receiptToken = job.status === "leased" ? job.lease?.readiness_token
      : ["drafted", "merged"].includes(job.status) ? job.outcome?.readiness_token : null;
    if (receiptToken && receiptToken !== readiness?.lease_token) {
      throw new Error(`task ${job.id} was created against a stale producer or census snapshot; run autopilot sync before continuing`);
    }
  }
  console.log(`PASS — ${state.jobs.length} autopilot jobs, ${inputs.readiness.length} scope contracts, state and certification contracts valid`);
}

async function waterlinePreflight(scopeId, requestedLimit) {
  const root = option("root", ".");
  const configPath = option("waterline-config", "data/WATERLINE.json");
  const gate = spawnSync(process.execPath, [
    "scripts/waterline.mjs", "gate",
    "--scope", scopeId,
    "--operation", "claim",
    "--requested", String(requestedLimit),
    "--config", configPath,
    "--root", root,
  ], { cwd: root, stdio: "inherit" });
  if (gate.error) throw new Error(`rolling waterline preflight could not start: ${gate.error.message}`);
  if (gate.status !== 0) throw new Error(`scope ${scopeId} is below its rolling gold waterline; refusing another roster cycle`);
}

async function mediaAuditPreflight(scopeId) {
  const root = option("root", ".");
  const configPath = option("media-audit-scopes", "data/MEDIA-AUDIT-SCOPES.json");
  const config = await readJson(resolve(root, configPath), { version: 2, scopes: [] });
  const rows = Array.isArray(config) ? config : config.scopes;
  const scope = (rows || []).find((row) => row.id === scopeId);
  if (!scope?.block_new_autopilot_leases_until_complete) return;
  const gate = spawnSync(process.execPath, ["scripts/media-audit.mjs", "gate", "--scope", scopeId, "--root", root], { cwd: root, stdio: "inherit" });
  if (gate.error) throw new Error(`media-audit preflight could not start: ${gate.error.message}`);
  if (gate.status !== 0) throw new Error(`scope ${scopeId} has an incomplete exact-subject media baseline; refusing to lease more roster work`);
}

function archivePreflight(action, cwd = option("root", ".")) {
  const gate = spawnSync(process.execPath, ["scripts/validate.mjs"], { cwd, stdio: "inherit" });
  if (gate.error) throw new Error(`archive preflight could not start: ${gate.error.message}`);
  if (gate.status !== 0) throw new Error(`archive preflight failed with exit ${gate.status}; refusing to ${action}`);
}

async function main() {
  if (command === "sync") return syncCommand();
  if (command === "claim") return claimCommand();
  if (command === "next") { archivePreflight("lease more work"); return claimCommand({ syncFirst: true }); }
  if (command === "submit") return submitCommand();
  if (command === "complete") { archivePreflight("close media review"); return completeCommand(); }
  if (command === "refresh") return refreshCommand();
  if (command === "readiness") return readinessCommand();
  if (command === "certify") return certifyCommand();
  if (command === "pause") return pauseCommand();
  if (command === "status") return statusCommand();
  if (command === "requeue") return requeueCommand();
  if (command === "validate") return validateCommand();
  throw new Error(`unknown command ${command}. Use sync, readiness, certify, pause, refresh, next, claim, submit, complete, status, requeue, or validate.`);
}

main().catch((error) => {
  console.error(`autopilot: ${error.message}`);
  process.exitCode = 1;
});
