#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeWorkflow } from "./publisher-custody.mjs";

function unwrap(expression) {
  let value = String(expression || "").trim();
  if (value.startsWith("${{") && value.endsWith("}}")) value = value.slice(3, -2).trim();
  return value;
}

function stripOuterParentheses(value) {
  let text = value.trim();
  while (text.startsWith("(") && text.endsWith(")")) {
    let depth = 0;
    let balanced = true;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === "(") depth += 1;
      else if (text[index] === ")") depth -= 1;
      if (depth === 0 && index < text.length - 1) { balanced = false; break; }
    }
    if (!balanced || depth !== 0) break;
    text = text.slice(1, -1).trim();
  }
  return text;
}

export function structurallyExcludesPullRequest(expression) {
  const value = unwrap(expression);
  if (!value || /\|\||\?\?/.test(value)) return false;
  const clauses = value.split(/&&/).map(stripOuterParentheses);
  return clauses.some((clause) =>
    /^github\.event_name\s*!=\s*['"]pull_request['"]$/.test(clause)
    || /^github\.event_name\s*==\s*['"](?:pull_request_target|push|workflow_dispatch|schedule|workflow_run)['"]$/.test(clause));
}

export function validateWorkflowWriteConditions(source, workflowPath = "<workflow>") {
  const analysis = analyzeWorkflow(source, workflowPath);
  if (!analysis.pull_request) return { path: workflowPath, checked_write_jobs: 0, failures: [] };
  const writeJobs = analysis.jobs.filter((job) => job.write_scopes.length > 0);
  const failures = writeJobs
    .filter((job) => !structurallyExcludesPullRequest(job.expression))
    .map((job) => ({ job: job.name, expression: job.expression, write_scopes: job.write_scopes }));
  return { path: workflowPath, checked_write_jobs: writeJobs.length, failures };
}

export function scanWriteConditions(root = process.cwd()) {
  const workflowRoot = path.resolve(root, ".github/workflows");
  const rows = readdirSync(workflowRoot)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort()
    .map((name) => {
      const workflowPath = `.github/workflows/${name}`;
      return validateWorkflowWriteConditions(readFileSync(path.resolve(root, workflowPath), "utf8"), workflowPath);
    });
  return {
    schema_version: 1,
    workflow_count: rows.length,
    checked_write_jobs: rows.reduce((sum, row) => sum + row.checked_write_jobs, 0),
    failures: rows.flatMap((row) => row.failures.map((failure) => ({ path: row.path, ...failure }))),
  };
}

function main() {
  const result = scanWriteConditions(process.cwd());
  console.log(JSON.stringify(result, null, 2));
  assert.deepEqual(result.failures, [], "unsafe PR-trigger write-job exclusion condition found");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) {
    console.error(`publisher-condition-custody: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
