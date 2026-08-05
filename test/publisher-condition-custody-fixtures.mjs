#!/usr/bin/env node
import assert from "node:assert/strict";
import { structurallyExcludesPullRequest, validateWorkflowWriteConditions } from "../scripts/publisher-condition-custody.mjs";

let failures = 0;
function fixture(name, fn) {
  try { fn(); console.log(`PASS ${name}`); }
  catch (error) { failures += 1; console.error(`FAIL ${name}\n  ${error?.stack || error}`); }
}

fixture("simple pull_request exclusion passes", () => {
  assert.equal(structurallyExcludesPullRequest("${{ github.event_name != 'pull_request' }}"), true);
});
fixture("trusted target conjunction passes", () => {
  assert.equal(structurallyExcludesPullRequest("${{ github.event_name == 'pull_request_target' && github.actor != 'nobody' }}"), true);
});
fixture("OR bypass is rejected", () => {
  assert.equal(structurallyExcludesPullRequest("${{ github.event_name != 'pull_request' || github.event_name == 'pull_request' }}"), false);
});
fixture("ambiguous success condition is rejected", () => {
  assert.equal(structurallyExcludesPullRequest("${{ success() }}"), false);
});
fixture("write job with OR bypass fails repository check", () => {
  const result = validateWorkflowWriteConditions(`on:\n  pull_request:\n  push:\npermissions:\n  contents: read\njobs:\n  publish:\n    if: \${{ github.event_name != 'pull_request' || github.event_name == 'pull_request' }}\n    permissions:\n      issues: write\n    runs-on: ubuntu-latest\n    steps: []\n`);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].job, "publish");
});

console.log(failures ? `\n${failures} publisher-condition fixture(s) FAILED` : "\nall publisher-condition fixtures pass");
if (failures) process.exitCode = 1;
