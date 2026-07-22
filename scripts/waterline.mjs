#!/usr/bin/env node
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import {
  WATERLINE_VERSION,
  deriveWaterlineStatus,
  emptyWaterlineState,
  leaseGroups,
  makeAccountingReceipt,
  makeCycleReceipt,
  makeDrillReceipt,
  makeIncidentEvent,
  makeMetricsReceipt,
  parseJsonl,
  validateWaterlineConfig,
  validateWaterlineState,
} from "./lib/waterline.mjs";

const args = process.argv.slice(2);
const command = args.shift() || "status";
function option(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} requires a value`);
  return value;
}
function flag(name) { return args.includes(`--${name}`); }
const root = resolve(option("root", "."));
const pathAt = (name, fallback) => resolve(root, option(name, fallback));
const paths = {
  config: pathAt("config", "data/WATERLINE.json"),
  state: pathAt("state", "data/WATERLINE-STATE.json"),
  journal: pathAt("journal", "data/journal/waterline.jsonl"),
  lock: pathAt("lock", "data/WATERLINE.lock"),
  media: pathAt("media-audit", "data/MEDIA-AUDIT.json"),
  autopilot: pathAt("autopilot", "data/AUTOPILOT.json"),
  autopilotJournal: pathAt("autopilot-journal", "data/journal/autopilot.jsonl"),
  roadmap: pathAt("roadmap-state", "data/ROADMAP-STATE.json"),
  preservation: pathAt("preservation", "preservation/SNAPSHOTS.json"),
};
async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return structuredClone(fallback);
    throw new Error(`cannot read ${path}: ${error.message}`);
  }
}
async function readText(path, fallback = "") {
  try { return await readFile(path, "utf8"); }
  catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`cannot read ${path}: ${error.message}`);
  }
}
function bytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`); }
function journalLine(event) {
  const body = { version: WATERLINE_VERSION, ...event };
  const id = `waterline_${createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 24)}`;
  return `${JSON.stringify({ id, ...body })}\n`;
}
async function atomicTransaction(writes) {
  const prepared = [];
  try {
    for (const [index, write] of writes.entries()) {
      await mkdir(dirname(write.path), { recursive: true });
      let original = null;
      let existed = true;
      try { original = await readFile(write.path); }
      catch (error) { if (error.code === "ENOENT") existed = false; else throw error; }
      const tmp = `${write.path}.tmp.${process.pid}.${index}`;
      await writeFile(tmp, write.bytes);
      prepared.push({ ...write, original, existed, tmp, committed: false });
    }
    for (const write of prepared) { await rename(write.tmp, write.path); write.committed = true; }
  } catch (error) {
    const failures = [];
    for (const [index, write] of prepared.entries()) {
      if (!write.committed) continue;
      try {
        if (write.existed) {
          const restore = `${write.path}.restore.${process.pid}.${index}`;
          await writeFile(restore, write.original);
          await rename(restore, write.path);
        } else await rm(write.path, { force: true });
      } catch (restoreError) { failures.push(`${write.path}: ${restoreError.message}`); }
    }
    if (failures.length) throw new Error(`write failed (${error.message}) and rollback was incomplete: ${failures.join("; ")}`);
    throw error;
  } finally {
    for (const write of prepared) await rm(write.tmp, { force: true }).catch(() => {});
  }
}
async function withLock(action) {
  await mkdir(dirname(paths.lock), { recursive: true });
  let handle;
  try {
    handle = await open(paths.lock, "wx");
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, command, started_at: new Date().toISOString() })}\n`);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`${paths.lock} exists; another waterline writer may be active`);
    throw error;
  }
  try { return await action(); }
  finally { await handle?.close().catch(() => {}); await rm(paths.lock, { force: true }); }
}
async function load() {
  const [config, state, mediaAudit, autopilot, autopilotJournalText, roadmapState, preservation, waterlineJournal] = await Promise.all([
    readJson(paths.config),
    readJson(paths.state, emptyWaterlineState()),
    readJson(paths.media),
    readJson(paths.autopilot),
    readText(paths.autopilotJournal),
    readJson(paths.roadmap),
    readJson(paths.preservation),
    readText(paths.journal),
  ]);
  validateWaterlineConfig(config);
  validateWaterlineState(state, config);
  return { config, state, mediaAudit, autopilot, autopilotJournal: parseJsonl(autopilotJournalText), roadmapState, preservation, waterlineJournal };
}
function statusFor(inputs) {
  return deriveWaterlineStatus({ ...inputs, scopeId: option("scope", "star-trek"), requestedTasks: Number(option("requested", "0")) });
}
async function save(inputs, state, event) {
  state.updated_at = event.at || event.reviewed_at || new Date().toISOString();
  validateWaterlineState(state, inputs.config);
  await atomicTransaction([
    { path: paths.state, bytes: bytes(state) },
    { path: paths.journal, bytes: Buffer.from(inputs.waterlineJournal + journalLine(event)) },
  ]);
}
async function inputDoc() {
  const input = option("input");
  if (!input) throw new Error(`${command} requires --input`);
  return readJson(resolve(root, input));
}

async function main() {
  if (["status", "validate", "gate"].includes(command)) {
    const inputs = await load();
    const status = statusFor(inputs);
    if (command === "validate") {
      console.log(`PASS — waterline state valid; ${status.scope_id} phase=${status.phase}; claim=${status.claim_allowed ? "allowed" : "blocked"}`);
      return;
    }
    if (command === "gate") {
      const operation = option("operation", "claim");
      if (operation !== "claim") throw new Error(`unsupported gate operation ${operation}`);
      if (!status.claim_allowed) {
        console.error(`waterline: ${status.scope_id} claim blocked — ${status.claim_reasons.join(", ")}`);
        process.exitCode = 2;
        return;
      }
      console.log(`PASS — ${status.scope_id} may claim up to ${status.capacity.max_tasks_per_cycle} task(s)`);
      return;
    }
    if (flag("json")) console.log(JSON.stringify(status, null, 2));
    else {
      console.log(`waterline: ${status.scope_id} phase=${status.phase}; claim=${status.claim_allowed ? "allowed" : "blocked"}`);
      console.log(`  media ${status.media.complete}/${status.media.total} complete; debt=${status.media.debt}`);
      console.log(`  cycles ${status.cycles.successful_receipts}/${status.cycles.required_successful_receipts} successful; unreceipted=${status.cycles.unreceipted.length}`);
      console.log(`  gold evidence=${status.evidence_readiness.star_trek_gold_shard}; operations evidence=${status.evidence_readiness.operational_reliability}`);
      if (status.claim_reasons.length) console.log(`  blockers: ${status.claim_reasons.join(", ")}`);
      if (status.natural_unlocks_when_receipted.length) console.log(`  next after reviewed milestone receipts: ${status.natural_unlocks_when_receipted.join(", ")}`);
    }
    return;
  }

  return withLock(async () => {
    const inputs = await load();
    const next = structuredClone(inputs.state);
    const doc = await inputDoc();
    const now = doc.reviewed_at || doc.at || new Date().toISOString();
    if (command === "record-cycle") {
      const receipt = makeCycleReceipt(doc, { ...inputs, groups: leaseGroups(inputs.autopilotJournal, doc.scope_id) });
      next.cycles.push(receipt);
      await save(inputs, next, { op: "cycle.receipted", at: now, scope: receipt.scope_id, lease_id: receipt.lease_id, receipt_id: receipt.id, outcome: receipt.outcome });
      console.log(`recorded ${receipt.id} for ${receipt.lease_id}`);
      return;
    }
    if (command === "record-drill") {
      const receipt = makeDrillReceipt(doc, inputs.config);
      next.drills.push(receipt);
      await save(inputs, next, { op: "drill.receipted", at: now, drill_id: receipt.id, kind: receipt.kind, passed: receipt.passed });
      console.log(`recorded ${receipt.id}`);
      return;
    }
    if (command === "record-metrics") {
      const result = makeMetricsReceipt(doc, next.metrics);
      next.metrics = result.metrics;
      next.metric_receipts.push(result.receipt);
      await save(inputs, next, { op: "metrics.receipted", at: now, receipt_id: result.receipt.id, metrics: result.receipt.metrics });
      console.log(`recorded ${result.receipt.id}`);
      return;
    }
    if (command === "record-accounting") {
      const receipt = makeAccountingReceipt(doc, inputs);
      next.accounting.push(receipt);
      await save(inputs, next, { op: "accounting.receipted", at: now, scope: receipt.scope_id, receipt_id: receipt.id, denominator: receipt.denominator });
      console.log(`recorded ${receipt.id}`);
      return;
    }
    if (command === "record-incident") {
      const event = makeIncidentEvent(doc);
      next.incidents.push(event);
      await save(inputs, next, { op: `incident.${event.status}`, ...event });
      console.log(`recorded ${event.event_id}`);
      return;
    }
    throw new Error("unknown command; use status, validate, gate, record-cycle, record-drill, record-metrics, record-accounting, or record-incident");
  });
}

main().catch((error) => {
  console.error(`waterline: ${error.message}`);
  process.exitCode = 1;
});
