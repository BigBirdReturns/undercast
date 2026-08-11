#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";
import {
  countJobs,
  deriveThesisContinuation,
  evaluateThesisRailPullRequest,
  renderThesisContinuationPrompt,
  validateThesisRails,
} from "./lib/thesis-rails.mjs";

const CONFIG_PATH = "data/THESIS-RAILS.json";
const args = process.argv.slice(2);
const command = args.shift() || "status";
const jsonOut = args.includes("--json");

function option(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} requires a value`);
  return value;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function runJson(label, script, scriptArgs) {
  const run = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  if (run.error) throw new Error(`${label} could not start: ${run.error.message}`);
  if (run.status !== 0) throw new Error(`${label} failed: ${(run.stderr || run.stdout || `exit ${run.status}`).trim()}`);
  try { return JSON.parse(run.stdout); }
  catch (error) { throw new Error(`${label} returned invalid JSON: ${error.message}`); }
}

function activeEstates(config, registry) {
  const states = new Set(config.active_estate_states);
  return (registry.estates || [])
    .filter((estate) => states.has(estate.state) && estate.autopilot_scope)
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

function loadRuntime() {
  const config = readJson(CONFIG_PATH);
  const registry = readJson("data/ESTATE-REGISTRY.json");
  const autopilot = readJson("data/AUTOPILOT.json");
  const audit = readJson("data/MEDIA-AUDIT.json");
  const waterlines = {};
  const candidateReports = {};
  for (const estate of activeEstates(config, registry)) {
    const scopeId = estate.autopilot_scope;
    waterlines[scopeId] = runJson(`waterline ${scopeId}`, "scripts/waterline.mjs", ["status", "--scope", scopeId, "--json"]);
    const counts = countJobs(autopilot.jobs, scopeId, config);
    if (counts.queued && waterlines[scopeId]?.claim_allowed === true) {
      try {
        candidateReports[scopeId] = runJson(`autopilot candidates ${scopeId}`, "scripts/autopilot.mjs", [
          "candidates",
          "--scope", scopeId,
          "--capability-profile", config.capability_profile,
          "--limit", "1",
          "--json",
        ]);
      } catch (error) {
        candidateReports[scopeId] = { compatible: [], error: error.message };
      }
    }
  }
  const result = deriveThesisContinuation({
    config,
    registry,
    jobs: autopilot.jobs,
    audit: audit.items,
    waterlines,
    candidateReports,
  });
  return { config, registry, autopilot, audit, waterlines, candidateReports, result };
}

function printReadable(result) {
  console.log(`thesis-rails: phase=${result.phase}; estate=${result.estate_id || "none"}; scope=${result.scope_id || "none"}`);
  console.log(`  reason: ${result.reason}`);
  console.log(`  next: ${result.next_command}`);
  if (result.candidate) {
    const modes = result.candidate.performance_modes.length ? result.candidate.performance_modes.join(",") : "unresolved";
    console.log(`  candidate: ${result.candidate.task_id} — ${result.candidate.performer} as ${result.candidate.character}; modes=${modes}`);
  }
  console.log(`  prompt: ${result.prompt_command}`);
}

function validateCommand() {
  const config = readJson(CONFIG_PATH);
  const errors = validateThesisRails(config);
  for (const path of config.required_files || []) if (!existsSync(path)) errors.push(`${path} is missing`);
  const agents = readFileSync("AGENTS.md", "utf8");
  if (!agents.includes("docs/THESIS-CONTINUATION.md") || !agents.includes("node scripts/thesis-rails.mjs")) errors.push("AGENTS.md does not bind the thesis continuation rail");
  const operations = readFileSync("docs/COLLECTION-OPERATIONS.md", "utf8");
  if (!operations.includes("THESIS-CONTINUATION.md") || !operations.includes("node scripts/thesis-rails.mjs")) errors.push("collection operations do not expose the thesis rail");
  const workflow = readFileSync(".github/workflows/thesis-rails.yml", "utf8");
  if (!workflow.includes("thesis-rails-fixtures.mjs") || !workflow.includes("thesis-rails.mjs check-pr") || !workflow.includes("thesis-rails.mjs validate")) errors.push("thesis-rails workflow is incomplete");
  if (errors.length) {
    for (const error of errors) console.error(`thesis-rails: ${error}`);
    process.exit(1);
  }
  const output = { status: "PASS", schema: config.schema, batch_limit: config.batch_limit, forbidden_stage_tokens: config.workflow_policy.forbidden_stage_tokens.length };
  if (jsonOut) console.log(JSON.stringify(output, null, 2));
  else console.log(`PASS — ${config.schema}; one task per cycle; ${output.forbidden_stage_tokens} transition-only workflow stages fenced`);
}

function statusCommand({ concise = false } = {}) {
  const { result } = loadRuntime();
  if (jsonOut) {
    if (concise) console.log(JSON.stringify({ phase: result.phase, estate_id: result.estate_id, scope_id: result.scope_id, reason: result.reason, candidate: result.candidate, next_command: result.next_command, prompt_command: result.prompt_command }, null, 2));
    else console.log(JSON.stringify(result, null, 2));
    return;
  }
  printReadable(result);
}

function promptCommand() {
  const { config, result } = loadRuntime();
  const prompt = renderThesisContinuationPrompt(result, config);
  const out = option("out");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, prompt, "utf8");
    console.log(`wrote ${out}`);
  } else process.stdout.write(prompt);
}

function parseNameStatus(text) {
  const changes = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const status = parts[0];
    const path = parts.at(-1);
    changes.push({ status, path });
  }
  return changes;
}

function checkPrCommand() {
  const base = option("base");
  if (!base) throw new Error("check-pr requires --base SHA");
  const eventPath = option("event", process.env.GITHUB_EVENT_PATH);
  const event = eventPath && existsSync(eventPath) ? JSON.parse(readFileSync(eventPath, "utf8")) : {};
  const diff = spawnSync("git", ["diff", "--name-status", `${base}...HEAD`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (diff.error) throw new Error(`git diff could not start: ${diff.error.message}`);
  if (diff.status !== 0) throw new Error((diff.stderr || diff.stdout || "git diff failed").trim());
  const config = readJson(CONFIG_PATH);
  const result = evaluateThesisRailPullRequest({ config, changes: parseNameStatus(diff.stdout), body: event.pull_request?.body || "" });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

try {
  if (command === "validate") validateCommand();
  else if (command === "status") statusCommand();
  else if (command === "next") statusCommand({ concise: true });
  else if (command === "prompt") promptCommand();
  else if (command === "check-pr") checkPrCommand();
  else throw new Error(`unknown thesis command ${command}; use validate, status, next, prompt, or check-pr`);
} catch (error) {
  console.error(`thesis-rails: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
