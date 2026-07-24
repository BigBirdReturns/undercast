#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildEstateInventory, validateEstateMappings } from "./lib/estate-inventory.mjs";

const load = (path) => JSON.parse(readFileSync(path, "utf8"));
const option = (args, name, fallback = null) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
};

export function run(argv = process.argv.slice(2)) {
  const command = argv.find((value) => !value.startsWith("--")) || "status";
  const json = argv.includes("--json");
  const limit = Number(option(argv, "--limit", "30"));
  const specimens = load("data/specimens.json");
  const mappings = load("data/ESTATE-MAPPINGS.json");
  const registry = load("data/ESTATE-REGISTRY.json");

  if (command === "validate") {
    const errors = validateEstateMappings({ mappings, registry });
    for (const record of specimens) {
      try { buildEstateInventory({ specimens: [record], mappings, registry }); }
      catch (error) { errors.push(error.message); }
    }
    const result = { version: 1, status: errors.length ? "FAIL" : "PASS", errors, mappings: mappings.mappings.length };
    console.log(json ? JSON.stringify(result, null, 2) : `estate-inventory validate: ${result.status} — ${result.mappings} exact mapping(s)`);
    if (errors.length) process.exitCode = 1;
    return result;
  }

  if (!["status", "inventory"].includes(command)) throw new Error(`unknown estate-inventory command ${command}`);
  const inventory = buildEstateInventory({ specimens, mappings, registry });
  const result = { ...inventory, groups: inventory.groups.slice(0, limit), groups_total: inventory.groups.length, limit };
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`estate inventory: ${inventory.mapped_records}/${inventory.records} records exactly mapped; ${inventory.unmapped_records} unmapped`);
    console.log(`  ${inventory.groups.filter((row) => !row.estate_id).length} unmapped production group(s); showing ${Math.min(limit, inventory.groups.length)}`);
    for (const row of result.groups) console.log(`  ${String(row.records).padStart(4)}  ${row.estate_label || "UNMAPPED"}  ${row.universe}  ::  ${row.production}`);
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { run(); }
  catch (error) { console.error(`estate-inventory: ${error instanceof Error ? error.message : String(error)}`); process.exit(1); }
}
