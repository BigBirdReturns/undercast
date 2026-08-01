#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyKnownMediaCorrectionPlan,
  loadKnownMediaCorrectionPlan,
} from "./lib/estate-known-media-corrections.mjs";

const FERENGI_ROOT_LEDGER = "data/review/ferengi-gold/final-portraits-correction-2026-07-25.json";

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

export async function main(argv = process.argv.slice(2)) {
  const root = path.resolve(option(argv, "--root", "."));
  const write = argv.includes("--write");
  const declaredPlan = await loadKnownMediaCorrectionPlan({ root });
  const rootOnly = declaredPlan.filter((row) => row.ledger === FERENGI_ROOT_LEDGER);
  const activePlan = declaredPlan.filter((row) => row.ledger !== FERENGI_ROOT_LEDGER);
  if (declaredPlan.length !== 71 || activePlan.length !== 61 || rootOnly.length !== 10) {
    throw new Error(`correction classification drifted: declared=${declaredPlan.length} active=${activePlan.length} root-only=${rootOnly.length}`);
  }

  const report = await applyKnownMediaCorrectionPlan({
    root,
    plan: activePlan,
    write,
    specimensPath: option(argv, "--specimens", "data/specimens.json"),
    sourcesPath: option(argv, "--sources", "data/SOURCES.json"),
    reportPath: option(argv, "--report", "data/review/estate-debt/COLLECT-001-KNOWN-MEDIA-CORRECTIONS-APPLY.json"),
    now: option(argv, "--now", new Date().toISOString()),
  });
  console.log(JSON.stringify({
    transaction: report.transaction,
    operation: report.operation,
    mode: report.mode,
    estate_denominator: {
      declared_invalid_bindings: declaredPlan.length,
      active_current_main_obligations: activePlan.length,
      unmerged_pr86_only_obligations: rootOnly.length,
      active_current_main_result: report.denominator,
    },
    root_only: rootOnly.map(({ id, side, preserved_path, sha256, ledger }) => ({ id, side, preserved_path, sha256, ledger, state: "never-landed-on-current-main" })),
    specimens: report.source.specimens,
    sources: report.source.sources,
    next: write
      ? ["npm run media:audit -- sync", "node scripts/shard.mjs", "git add -A", "npm run gate"]
      : ["re-run with --write on the exact intended branch"],
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`known-media correction collection failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
