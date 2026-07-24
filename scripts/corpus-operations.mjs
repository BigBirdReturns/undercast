#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  deriveCorpusStatus,
  loadCorpusOperations,
  nextEstate,
  validateCorpusOperations,
} from "./lib/corpus-operations.mjs";

function readWaterlineStatus(scopeId) {
  if (!scopeId) return null;
  const result = spawnSync(process.execPath, ["scripts/waterline.mjs", "status", "--scope", scopeId, "--json"], {
    cwd: process.cwd(), encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`waterline status failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  try { return JSON.parse(result.stdout); }
  catch (error) { throw new Error(`waterline status did not return JSON: ${error.message}`); }
}

function printHuman(status) {
  const queued = status.jobs.statuses.queued || 0;
  console.log(`corpus operations: ${status.valid ? "PASS" : "FAIL"}`);
  console.log(`  mode: ${status.mode}`);
  console.log(`  active scope: ${status.active_scope || "none"}`);
  console.log(`  next operation: ${status.current_operation}`);
  console.log(`  reason: ${status.reason}`);
  console.log(`  queue: ${queued} queued / ${status.jobs.in_flight} in flight / ${status.jobs.total} total`);
  console.log(`  media debt: ${status.media.debt} / ${status.media.total}`);
  console.log(`  successful cycles: ${status.waterline.successful_cycles}; claim allowed: ${status.waterline.claim_allowed}`);
  if (status.source_refresh_due) console.log("  source refresh: due");
  if (status.next_estate.estate) {
    console.log(`  next estate candidate: ${status.next_estate.estate.label} (${status.next_estate.estate.stage})`);
    if (!status.next_estate.authorized) console.log(`  estate induction blocked by: ${status.next_estate.missing_milestones.join(", ")}`);
  }
  for (const error of status.errors) console.error(`  error: ${error}`);
}

export function run(argv = process.argv.slice(2)) {
  const command = argv.find((value) => !value.startsWith("--")) || "status";
  const json = argv.includes("--json");
  const context = loadCorpusOperations();

  if (command === "validate") {
    const errors = validateCorpusOperations(context);
    const result = { version: 1, status: errors.length ? "FAIL" : "PASS", errors };
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`corpus-operations validate: ${result.status}`);
      for (const error of errors) console.error(`  ${error}`);
    }
    if (errors.length) process.exitCode = 1;
    return result;
  }

  if (command === "next-estate") {
    const result = nextEstate(context);
    if (json) console.log(JSON.stringify(result, null, 2));
    else if (!result.estate) console.log("estate induction: no registered candidate");
    else {
      console.log(`estate induction: ${result.authorized ? "AUTHORIZED" : "BLOCKED"}`);
      console.log(`  candidate: ${result.estate.label} (${result.estate.stage})`);
      console.log(`  next gate: ${result.estate.next_gate}`);
      if (result.missing_milestones.length) console.log(`  missing milestones: ${result.missing_milestones.join(", ")}`);
    }
    return result;
  }

  if (!["status", "plan"].includes(command)) throw new Error(`unknown corpus-operations command ${command}`);
  const activeScope = (context.scopes.scopes || []).find((row) => row.status === "active")?.id || null;
  const waterlineStatus = readWaterlineStatus(activeScope);
  const status = deriveCorpusStatus(context, { waterlineStatus });
  if (json) console.log(JSON.stringify(status, null, 2)); else printHuman(status);
  if (!status.valid) process.exitCode = 1;
  return status;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { run(); }
  catch (error) { console.error(`corpus-operations: ${error instanceof Error ? error.message : String(error)}`); process.exit(1); }
}
