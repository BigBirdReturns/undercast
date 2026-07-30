#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readLessonsContract, validateLessonsContract } from "./lib/card-backfill-lessons.mjs";

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("--") ? args[0] : "validate";
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function loadRuntimePolicy(root, contractPath) {
  const contract = await readLessonsContract(resolve(root, contractPath));
  const active = (contract.policies || []).find((policy) => policy.policy_id === contract.active_policy_id);
  if (!active?.implementation?.path || !active?.implementation?.export) throw new Error("active policy implementation binding is missing");
  const url = pathToFileURL(resolve(root, active.implementation.path));
  url.searchParams.set("lessons-contract", contract.lessons_contract_sha256);
  const module = await import(url.href);
  const runtime = module[active.implementation.export];
  if (!runtime) throw new Error(`runtime export ${active.implementation.export} is missing from ${active.implementation.path}`);
  return runtime;
}

async function main() {
  if (!new Set(["validate", "status"]).has(command)) throw new Error(`unknown command ${command}`);
  const root = resolve(option("--root", "."));
  const contractPath = option("--contract", ".github/CARD-BACKFILL-LESSONS.json");
  const out = option("--out", null);
  const runtimePolicy = await loadRuntimePolicy(root, contractPath);
  const report = await validateLessonsContract({ root, contractPath, runtimePolicy, checkEnforcement: true });
  if (out) {
    const path = resolve(out);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(report, null, 2) + "\n");
  }
  if (args.includes("--json") || command === "status") console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`PASS — ${report.mandatory_lesson_count} mandatory lesson(s) inherited by ${report.active_policy.policy_id}`);
    console.log(`GUARDS — ${report.enforcement_guard_count} machine enforcement guard(s)`);
    console.log(`CONTRACT — ${report.lessons_contract_sha256}`);
    console.log("canonical_mutation=false");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
