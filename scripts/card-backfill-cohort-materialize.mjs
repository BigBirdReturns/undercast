#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { materializePublicationPlan } from "./lib/card-backfill-staging.mjs";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function main() {
  if (option("--input", null)) throw new Error("direct same-cohort materialization is retired; stage accepted packets, build a mixed publication plan, then materialize that plan");
  const planPath = resolve(option("--plan"));
  const root = resolve(option("--staging", option("--root", "data/review/card-backfill-staging")));
  const destination = resolve(option("--destination", "data/review/card-backfill"));
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  const result = await materializePublicationPlan({ plan, root, destination, now: option("--now", new Date().toISOString()) });
  console.log(`PASS — materialized ${result.permanent_receipt.counts.materialized} staged packet(s) across ${result.permanent_receipt.counts.cohorts} cohort(s)`);
  console.log(`BATCH — ${result.permanent_receipt.publication_batch_sha256}`);
  console.log("NEXT — run the complete repository gate once, then commit the exact publication transaction");
}

main().catch((error) => { console.error(`card-backfill materialize: ${error.message}`); process.exit(1); });
