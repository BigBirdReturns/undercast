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
fixture("spaced double-quoted mapping keys cannot hide a writer", () => {
  const result = validateWorkflowWriteConditions(`"on" :\n  "pull_request" :\n"permissions" :\n  "contents" : write\n"jobs" :\n  "publish" :\n    "runs-on" : ubuntu-latest\n    "steps" : []\n`);
  assert.equal(result.checked_write_jobs, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].job, "publish");
});
fixture("single-quoted pull_request key cannot hide a writer", () => {
  const result = validateWorkflowWriteConditions(`on:\n  'pull_request' :\npermissions:\n  contents: write\njobs:\n  publish:\n    runs-on: ubuntu-latest\n    steps: []\n`);
  assert.equal(result.checked_write_jobs, 1);
  assert.equal(result.failures.length, 1);
});
fixture("flow-style trigger mapping cannot hide a writer", () => {
  const result = validateWorkflowWriteConditions(`'on' : { 'pull_request' : null }\npermissions: { contents: write }\njobs: { publish: { runs-on: ubuntu-latest, steps: [] } }\n`);
  assert.equal(result.checked_write_jobs, 1);
  assert.equal(result.failures.length, 1);
});
fixture("escaped quoted trigger keys are decoded before custody", () => {
  const result = validateWorkflowWriteConditions(`"o\\u006e" : { "pull\\u005frequest" : null }\npermissions: { contents: write }\njobs: { publish: { runs-on: ubuntu-latest, steps: [] } }\n`);
  assert.equal(result.checked_write_jobs, 1);
  assert.equal(result.failures.length, 1);
});
fixture("aliased trigger sequence is resolved before custody", () => {
  const result = validateWorkflowWriteConditions(`x-events: &events [pull_request]\non: *events\npermissions: { contents: write }\njobs: { publish: { runs-on: ubuntu-latest, steps: [] } }\n`);
  assert.equal(result.checked_write_jobs, 1);
  assert.equal(result.failures.length, 1);
});
fixture("quoted safe pull_request trigger remains recognized", () => {
  const result = validateWorkflowWriteConditions(`'on' :\n  "pull_request" :\npermissions:\n  contents: read\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps: []\n`);
  assert.equal(result.checked_write_jobs, 0);
  assert.deepEqual(result.failures, []);
});
fixture("duplicate trigger keys fail closed as ambiguous YAML", () => {
  assert.throws(() => validateWorkflowWriteConditions(`on: pull_request\non: push\npermissions: { contents: write }\njobs: { publish: { runs-on: ubuntu-latest, steps: [] } }\n`), /invalid or ambiguous/);
});

console.log(failures ? `\n${failures} publisher-condition fixture(s) FAILED` : "\nall publisher-condition fixtures pass");
if (failures) process.exitCode = 1;
