#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  buildPublicationPlan,
  materializePublicationPlan,
  readStagingLedger,
  stageAcceptedRun,
  validateStaging,
} from "./lib/card-backfill-staging.mjs";

const args = process.argv.slice(2);
const command = args.shift() || "status";
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
function flag(name) { return args.includes(name); }
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + "\n"); }

const root = resolve(option("--root", "data/review/card-backfill-staging"));
const permanentRoot = resolve(option("--permanent-root", option("--destination", "data/review/card-backfill")));

async function stage() {
  const input = resolve(option("--input"));
  const now = option("--now", new Date().toISOString());
  const result = await stageAcceptedRun({ input, root, permanentRoot, now });
  console.log(`PASS — staged ${result.added.length} newly accepted packet(s); ${result.already_staged.length} already present`);
  console.log(`STAGING — ${result.ledger.counts.staged} packet(s) across ${result.ledger.counts.cohorts} cohort(s) and ${result.ledger.counts.discovery_batches} discovery batch(es)`);
  console.log(`LEDGER — ${join(root, "STAGING.json")}`);
}

async function validate() {
  const ledger = await validateStaging({ root, permanentRoot });
  console.log(`PASS — staging ledger and ${ledger.counts.staged} packet director${ledger.counts.staged === 1 ? "y" : "ies"} agree`);
  console.log(`LEDGER — ${ledger.ledger_sha256}`);
}

async function status() {
  const ledger = await validateStaging({ root, permanentRoot });
  const control = await readJson(option("--control", ".github/CARD-BACKFILL-COHORT.json"));
  const plan = buildPublicationPlan({ ledger, control, now: option("--now", new Date().toISOString()), limit: option("--limit", null) });
  const value = { ledger, next_publication: plan };
  if (flag("--json")) console.log(JSON.stringify(value, null, 2));
  else {
    console.log(`staged=${ledger.counts.staged}`);
    console.log(`cohorts=${ledger.counts.cohorts}`);
    console.log(`discovery_batches=${ledger.counts.discovery_batches}`);
    console.log(`publication_ready=${plan.ready}`);
    console.log(`publication_selected=${plan.selected_count}`);
    console.log(`publication_batch_sha256=${plan.publication_batch_sha256 || ""}`);
  }
}

async function plan() {
  const ledger = await validateStaging({ root, permanentRoot });
  const control = await readJson(option("--control", ".github/CARD-BACKFILL-COHORT.json"));
  const out = resolve(option("--out", ".card-backfill-publication"));
  const value = buildPublicationPlan({ ledger, control, now: option("--now", new Date().toISOString()), limit: option("--limit", null) });
  await writeJson(join(out, "publication-plan.json"), value);
  await writeFile(join(out, "summary.txt"), [
    `campaign=${value.campaign_id || ""}`,
    `source_ledger_sha256=${value.source_ledger_sha256}`,
    `staged=${value.staged_count}`,
    `ready=${value.ready}`,
    `selected=${value.selected_count}`,
    `remaining=${value.remaining_after_publication}`,
    `publication_batch_sha256=${value.publication_batch_sha256 || ""}`,
    `canonical_mutation=false`,
  ].join("\n") + "\n");
  console.log(`${value.ready ? "READY" : "WAIT"} — ${value.staged_count} staged; ${value.selected_count} selected for publication`);
  console.log(`OUTPUT — ${out}`);
  if (flag("--require-ready") && !value.ready) throw new Error(`publication requires at least ${value.policy.minimum} staged packets; observed ${value.staged_count}`);
}

async function materialize() {
  const planPath = resolve(option("--plan"));
  const value = await materializePublicationPlan({ plan: await readJson(planPath), root, destination: permanentRoot, now: option("--now", new Date().toISOString()) });
  console.log(`PASS — materialized ${value.permanent_receipt.counts.materialized} staged packet(s) across ${value.permanent_receipt.counts.cohorts} cohort(s)`);
  console.log(`BATCH — ${value.permanent_receipt.publication_batch_sha256}`);
  console.log(`NEXT — run the complete repository gate once, then commit the exact publication transaction`);
}

const commands = { stage, validate, status, plan, materialize };
if (!commands[command]) throw new Error(`unknown command ${command}`);
commands[command]().catch((error) => { console.error(`card-backfill staging: ${error.message}`); process.exit(1); });
