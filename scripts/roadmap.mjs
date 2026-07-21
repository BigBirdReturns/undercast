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

function summarize(roadmap, state) {
  const milestones = deriveMilestoneStates(roadmap, state);
  return {
    horizon: roadmap.horizon,
    north_star: roadmap.north_star,
    document: roadmap.document,
    adoption_stage: currentAdoptionStage(roadmap, state),
    counts: {
      complete: milestones.filter((row) => row.state === "complete").length,
      ready: milestones.filter((row) => row.state === "ready").length,
      blocked: milestones.filter((row) => row.state === "blocked").length,
      total: milestones.length,
    },
    milestones,
    fired_scale_triggers: firedScaleTriggers(roadmap, state),
  };
}

function printRow(row) {
  const suffix = row.reasons.length ? ` — ${row.reasons.join("; ")}` : "";
  console.log(`${String(row.seq).padStart(2, "0")} ${row.state.padEnd(8)} ${row.id} (${row.authority})${suffix}`);
}

function enrich(row, roadmap, playbooks) {
  return { ...row, playbook: extractPlaybookSection(roadmap, playbooks, row.id) };
}

function printMilestone(row) {
  console.log(row.playbook);
  console.log("\n### Current roadmap state");
  console.log(`- State: ${row.state}`);
  console.log(`- Forecast: ${row.window}`);
  console.log(`- Authority: ${row.authority}`);
  console.log(`- Dependencies: ${row.deps.join(", ") || "none"}`);
  if (row.decisions.length) console.log(`- Required owner decisions: ${row.decisions.join(", ")}`);
  if (row.triggers.length) console.log(`- Demand/scale triggers: ${row.triggers.map(([m,o,v]) => `${m} ${o} ${v}`).join(", ")}`);
  if (row.reasons.length) console.log(`- Blocked by: ${row.reasons.join("; ")}`);
  console.log(`- Canonical guide: ${row.guide}`);
  console.log("\nExecute only this playbook. Update roadmap state only through a reviewed pull request with the required authority and evidence receipts.");
}

async function main() {
  const roadmapPath = option("roadmap", "data/ROADMAP.json");
  const statePath = option("state", "data/ROADMAP-STATE.json");
  const roadmap = await readJson(roadmapPath);
  const [state, playbooks] = await Promise.all([readJson(statePath), readText(roadmap.document)]);
  validateRoadmapState(roadmap, state);
  validatePlaybooks(roadmap, playbooks);

  if (command === "validate") {
    console.log(`PASS — ${roadmap.milestones.length} milestones, ${roadmap.adoption.length} adoption stages, ${roadmap.scale.length} scale triggers, all playbooks present`);
    return;
  }

  if (command === "status") {
    const value = summarize(roadmap, state);
    if (flag("json")) return console.log(JSON.stringify(value, null, 2));
    console.log(`roadmap: ${value.counts.complete}/${value.counts.total} complete; ${value.counts.ready} ready; adoption=${value.adoption_stage.id}`);
    value.milestones.forEach(printRow);
    if (value.fired_scale_triggers.length) {
      console.log("fired scale triggers:");
      for (const row of value.fired_scale_triggers) console.log(`  ${row.id}`);
    }
    return;
  }

  if (command === "next") {
    const rows = nextMilestones(roadmap, state, { limit: Number(option("limit", "3")) })
      .map((row) => enrich(row, roadmap, playbooks));
    if (flag("json")) return console.log(JSON.stringify(rows, null, 2));
    if (!rows.length) {
      console.log("roadmap: no milestone is ready; inspect `npm run roadmap -- status`");
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
    const row = enrich(base, roadmap, playbooks);
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
