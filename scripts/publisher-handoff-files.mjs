#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const REQUIRED_HANDOFF_FILES = Object.freeze({
  "operational-metrics-evidence": Object.freeze([
    "build-samples.json",
    "measurement.stdout.json",
    "operational-metrics.json",
  ]),
  "operational-reliability-evidence": Object.freeze([
    "diagnostics/bundle-validation.json",
    "evidence/bundle.json",
    "evidence/publication-rollback.json",
    "evidence/repository-restore.json",
    "git-object-set.json",
    "selection.json",
  ]),
});

export function validateHandoffFileSet(handoff) {
  assert.ok(handoff && typeof handoff === "object" && !Array.isArray(handoff), "publisher handoff must be an object");
  const required = REQUIRED_HANDOFF_FILES[handoff.kind];
  assert.ok(required, `unsupported publisher handoff kind ${JSON.stringify(handoff.kind)}`);
  assert.ok(handoff.files && typeof handoff.files === "object" && !Array.isArray(handoff.files), "publisher handoff files must be an object");
  const actual = Object.keys(handoff.files).sort();
  assert.deepEqual(actual, [...required], `${handoff.kind} handoff file set drifted`);
  return true;
}

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) throw new Error(`${name} is required`);
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv.shift() || "verify";
  if (command !== "verify") throw new Error(`unknown publisher-handoff-files command ${command}`);
  const handoff = JSON.parse(readFileSync(option(argv, "--handoff-json"), "utf8"));
  validateHandoffFileSet(handoff);
  console.log("publisher custody: handoff file set exact");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) {
    console.error(`publisher-handoff-files: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
