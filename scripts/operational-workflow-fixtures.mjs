#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/operational-reliability-evidence.yml", import.meta.url),
  "utf8",
);

function workflowBlock(startMarker, endMarker) {
  const start = workflow.indexOf(startMarker);
  const end = workflow.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing workflow block ${startMarker.trim()}`);
  assert.notEqual(end, -1, `missing workflow boundary ${endMarker.trim()}`);
  return workflow.slice(start, end);
}

const push = workflowBlock("\n  push:\n", "\n  pull_request:\n");
const pullRequest = workflowBlock("\n  pull_request:\n", "\n  workflow_dispatch:\n");

for (const [label, block] of [["main push", push], ["pull request", pullRequest]]) {
  assert.match(block, /- "package\.json"/, `${label} trigger must track package.json`);
  assert.match(block, /- "package-lock\.json"/, `${label} trigger must track package-lock.json`);
  assert.match(
    block,
    /- "scripts\/operational-workflow-fixtures\.mjs"/,
    `${label} trigger must track its own path-contract fixture`,
  );
}

assert.equal(
  (workflow.match(/- "package-lock\.json"/g) || []).length,
  2,
  "package-lock.json must be present in exactly the main-push and pull-request trigger blocks",
);

console.log("PASS — operational evidence triggers track manifest, lockfile, and path-contract fixtures on PR and main");
