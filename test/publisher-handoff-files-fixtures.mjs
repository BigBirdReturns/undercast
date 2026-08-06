#!/usr/bin/env node
import assert from "node:assert/strict";
import { REQUIRED_HANDOFF_FILES, validateHandoffFileSet } from "../scripts/publisher-handoff-files.mjs";

let failures = 0;
function fixture(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.error(`FAIL ${name}\n  ${error?.stack || error}`); }
}
function handoff(kind) {
  return {
    kind,
    files: Object.fromEntries(REQUIRED_HANDOFF_FILES[kind].map((file) => [file, "a".repeat(64)])),
  };
}

fixture("reliability handoff exact file set passes", () => {
  validateHandoffFileSet(handoff("operational-reliability-evidence"));
});
fixture("metrics handoff exact file set passes", () => {
  validateHandoffFileSet(handoff("operational-metrics-evidence"));
});
fixture("missing consumed file is rejected", () => {
  const row = handoff("operational-reliability-evidence");
  delete row.files["git-object-set.json"];
  assert.throws(() => validateHandoffFileSet(row), /file set drifted/);
});
fixture("extra unbound file is rejected", () => {
  const row = handoff("operational-metrics-evidence");
  row.files["extra.json"] = "b".repeat(64);
  assert.throws(() => validateHandoffFileSet(row), /file set drifted/);
});
fixture("unknown handoff kind is rejected", () => {
  assert.throws(() => validateHandoffFileSet({ kind: "unknown", files: {} }), /unsupported/);
});

console.log(failures ? `\n${failures} publisher handoff file fixture(s) FAILED` : "\nall publisher handoff file fixtures pass");
if (failures) process.exitCode = 1;
