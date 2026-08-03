#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import {
  currentAdoptionStage,
  deriveMilestoneStates,
  extractPlaybookSection,
  firedScaleTriggers,
  nextMilestones,
  validatePlaybooks,
  validateRoadmapState,
} from "./lib/roadmap.mjs";
import {
  executionBoundary,
  executionBoundaryForMilestone,
  validateExecutionPolicy,
} from "./lib/execution-policy.mjs";

const args = process.argv.slice(2);
const command = args.shift() || "status";

function option(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} requires a value`);
  return value;
}
const flag = (name) => args.includes(`--${name}`);

async function readText(path) {
  try { return await readFile(path, "utf8"); }
  catch (error) { throw new Error(`cannot read ${path}: ${error.message}`); }
}

async function readJson(path) {
  const text = await readText(path);
  try { return JSON.parse(text); }
  catch (error) { throw new Error(`cannot parse ${path}: ${error.message}`); }
}

function summarize(roadmap, state, executionPolicy) {
  const milestones = deriveMilestoneStates(roadmap, state);
  return {
    horizon: roadmap.horizon,
    north_star: roadmap.north_star,
    document: roadmap.document,
    execution: executionBoundary(executionPolicy),
    adoption_stage: currentAdoptionStage(roadmap, state),
    counts: {
      complete: milestones.filter((row) => row.state === "complete").length,
      ready: milestones.filter((row) => row.state === "ready").length,
      reversible: milestones.filter((row) => row.state === "reversible").length,
      blocked: milestones.filter((row) => row.state === "blocked").length,
      total: milestones.length,
    },
    milestones,
    fired_scale_triggers: firedScaleTriggers(roadmap, state),
  };
}

function printRow(row) {
  const suffix = row.reasons.length ? ` — ${row.reasons.join("; ")}` : "";
  console.log(`${String(row.seq).padStart(2, "0")} ${row.state.padEnd(10)} ${row.id} (${row.authority})${suffix}`);
}

function enrich(row, roadmap, playbooks, executionPolicy) {
  return {
    ...row,
    playbook: extractPlaybookSection(roadmap, playbooks, row.id),
    execution: executionBoundaryForMilestone(executionPolicy, row.id, {
      state: row.state,
      missingDecisions: row.missing_decisions,
    }),
  };
}

function printExecutionBoundary(row) {
  console.log("\n### Execution boundary");
  console.log(`- Scope: ${row.execution.execution_scope}`);
  console.log(`- Owner contribution: ${row.execution.owner_contribution}`);
  console.log("- Owner execution: prohibited; no local command, upload, transfer, contact, manual test, signature, or physical operation may be assigned to the owner.");
  console.log(`- Missing physical/external evidence: ${row.execution.unavailable_evidence}`);
  console.log(`- Missing owner decision: ${row.execution.missing_owner_decision}`);
  console.log(`- Irreversible action without authority: ${row.execution.irreversible_without_authority}`);
  if (row.execution.held_decisions.length) console.log(`- Held decisions: ${row.execution.held_decisions.join(", ")}`);
  if (row.state === "reversible") {
    console.log("- Authorized reversible work:");
    for (const item of row.execution.reversible_work) console.log(`  - ${item}`);
    console.log("- Held actions:");
    for (const item of row.execution.held_actions) console.log(`  - ${item}`);
  }
}

function printMilestone(row) {
  if (row.state === "reversible") {
    console.log(`## ${row.id} — reversible-work authorization`);
    console.log("\nThe owner decision is absent. Only the exact reversible work in the execution boundary is authorized; the full playbook below is reference context, not full execution authority.\n");
  }
  console.log(row.playbook);
  console.log("\n### Current roadmap state");
  console.log(`- State: ${row.state}`);
  console.log(`- Forecast: ${row.window}`);
  console.log(`- Authority: ${row.authority}`);
  console.log(`- Dependencies: ${row.deps.join(", ") || "none"}`);
  if (row.decisions.length) console.log(`- Required owner decisions: ${row.decisions.join(", ")}`);
  if (row.triggers.length) console.log(`- Demand/scale triggers: ${row.triggers.map(([m,o,v]) => `${m} ${o} ${v}`).join(", ")}`);
  if (row.reasons.length) console.log(`- State basis: ${row.reasons.join("; ")}`);
  console.log(`- Canonical guide: ${row.guide}`);
  printExecutionBoundary(row);
  if (row.state === "reversible") {
    console.log("\nExecute only the authorized reversible work printed above. Do not perform held actions, invent the owner decision, or mark the milestone complete. Preserve unobserved physical events as unproven and continue every nondependent lane.");
  } else if (row.state === "ready") {
    console.log("\nExecute this playbook within its stated authority. Update roadmap state only through a reviewed pull request with the required evidence receipts. Preserve unobserved physical events as unproven; continue every nondependent lane without assigning work to the owner.");
  } else {
    console.log("\nThis milestone is not authorized for execution. The missing decision does not become an owner chore, and missing dependencies or triggers do not authorize later work.");
  }
}

async function main() {
  const roadmapPath = option("roadmap", "data/ROADMAP.json");
  const statePath = option("state", "data/ROADMAP-STATE.json");
  const executionPolicyPath = option("execution-policy", "data/EXECUTION-POLICY.json");
  const roadmap = await readJson(roadmapPath);
  const [state, playbooks, executionPolicy] = await Promise.all([
    readJson(statePath),
    readText(roadmap.document),
    readJson(executionPolicyPath),
  ]);
  validateRoadmapState(roadmap, state);
  validatePlaybooks(roadmap, playbooks);
  validateExecutionPolicy(roadmap, executionPolicy, playbooks);

  if (command === "validate") {
    console.log(`PASS — ${roadmap.milestones.length} milestones, ${roadmap.adoption.length} adoption stages, ${roadmap.scale.length} scale triggers, all playbooks present, reversible owner-decision custody active, and zero owner physical or local execution gates`);
    return;
  }

  if (command === "status") {
    const value = summarize(roadmap, state, executionPolicy);
    if (flag("json")) return console.log(JSON.stringify(value, null, 2));
    console.log(`roadmap: ${value.counts.complete}/${value.counts.total} complete; ${value.counts.ready} ready; ${value.counts.reversible} reversible; adoption=${value.adoption_stage.id}; owner-execution=prohibited`);
    value.milestones.forEach(printRow);
    if (value.fired_scale_triggers.length) {
      console.log("fired scale triggers:");
      for (const row of value.fired_scale_triggers) console.log(`  ${row.id}`);
    }
    return;
  }

  if (command === "next") {
    const rows = nextMilestones(roadmap, state, { limit: Number(option("limit", "3")) })
      .map((row) => enrich(row, roadmap, playbooks, executionPolicy));
    if (flag("json")) return console.log(JSON.stringify(rows, null, 2));
    if (!rows.length) {
      console.log("roadmap: no ready or reversible milestone is available; inspect `npm run roadmap -- status`");
      process.exitCode = 3;
      return;
    }
    rows.forEach((row, index) => {
      if (index) console.log("\n---\n");
      printMilestone(row);
    });
    return;
  }

  if (command === "explain") {
    const id = option("milestone");
    if (!id) throw new Error("explain requires --milestone <id>");
    const base = deriveMilestoneStates(roadmap, state).find((item) => item.id === id);
    if (!base) throw new Error(`unknown milestone ${id}`);
    const row = enrich(base, roadmap, playbooks, executionPolicy);
    if (flag("json")) console.log(JSON.stringify(row, null, 2));
    else printMilestone(row);
    return;
  }

  throw new Error(`unknown roadmap command ${command}. Use validate, status, next, or explain.`);
}

main().catch((error) => {
  console.error(`roadmap: ${error.message}`);
  process.exitCode = 1;
});
