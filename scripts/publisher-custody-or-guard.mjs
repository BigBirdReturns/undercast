#!/usr/bin/env node
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeWorkflow } from "./publisher-custody.mjs";

function stripExpressionWrapper(expression) {
  const value = String(expression || "").trim();
  return value.startsWith("${{") && value.endsWith("}}")
    ? value.slice(3, -2).trim()
    : value;
}

function enclosesWholeExpression(value) {
  if (!value.startsWith("(") || !value.endsWith(")")) return false;
  let depth = 0;
  let single = false;
  let double = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'" && !double) single = !single;
    else if (character === '"' && !single && value[index - 1] !== "\\") double = !double;
    if (single || double) continue;
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    if (depth === 0 && index < value.length - 1) return false;
    if (depth < 0) return false;
  }
  return depth === 0 && !single && !double;
}

function splitLogical(value, operator) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let single = false;
  let double = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'" && !double) single = !single;
    else if (character === '"' && !single && value[index - 1] !== "\\") double = !double;
    if (single || double) continue;
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    if (depth === 0 && value.slice(index, index + operator.length) === operator) {
      parts.push(value.slice(start, index).trim());
      start = index + operator.length;
      index += operator.length - 1;
    }
  }
  if (!parts.length) return null;
  parts.push(value.slice(start).trim());
  return parts;
}

function atomTruthOnPullRequest(value) {
  const match = value.match(/^github\.event_name\s*(==|!=)\s*(['"])([^'"]+)\2$/);
  if (!match) return new Set([false, true]);
  const equal = match[3] === "pull_request";
  return new Set([match[1] === "==" ? equal : !equal]);
}

export function truthOnPullRequest(expression) {
  let value = stripExpressionWrapper(expression);
  while (enclosesWholeExpression(value)) value = value.slice(1, -1).trim();
  if (!value) return new Set([false, true]);

  const disjunction = splitLogical(value, "||");
  if (disjunction) {
    let possibilities = new Set([false]);
    for (const part of disjunction) {
      const right = truthOnPullRequest(part);
      possibilities = new Set([...possibilities].flatMap((left) => [...right].map((next) => left || next)));
    }
    return possibilities;
  }

  const conjunction = splitLogical(value, "&&");
  if (conjunction) {
    let possibilities = new Set([true]);
    for (const part of conjunction) {
      const right = truthOnPullRequest(part);
      possibilities = new Set([...possibilities].flatMap((left) => [...right].map((next) => left && next)));
    }
    return possibilities;
  }

  if (value.startsWith("!")) {
    return new Set([...truthOnPullRequest(value.slice(1))].map((result) => !result));
  }
  return atomTruthOnPullRequest(value);
}

export function scanOrConditionBypasses(root = process.cwd()) {
  const workflowRoot = path.resolve(root, ".github/workflows");
  const failures = [];
  for (const name of readdirSync(workflowRoot).filter((entry) => /\.ya?ml$/i.test(entry)).sort()) {
    const workflowPath = `.github/workflows/${name}`;
    const source = readFileSync(path.resolve(root, workflowPath), "utf8");
    const analysis = analyzeWorkflow(source, workflowPath);
    for (const job of analysis.jobs) {
      if (!job.write_scopes.length || job.can_run_on_pull_request) continue;
      if (truthOnPullRequest(job.expression).has(true)) {
        failures.push({ path: workflowPath, job: job.name, expression: job.expression, write_scopes: job.write_scopes });
      }
    }
  }
  return failures;
}

function selfTest() {
  assert.deepEqual([...truthOnPullRequest("github.event_name != 'pull_request' || github.head_ref == 'authorized'")].sort(), [false, true]);
  assert.deepEqual([...truthOnPullRequest("github.event_name == 'push' || github.event_name == 'workflow_dispatch'")], [false]);
  assert.deepEqual([...truthOnPullRequest("github.event_name != 'pull_request' && success()")], [false]);
  assert.deepEqual([...truthOnPullRequest("success()")].sort(), [false, true]);
  console.log("publisher-custody OR-condition self-test: PASS");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  if (process.argv.includes("--self-test")) selfTest();
  const failures = scanOrConditionBypasses();
  console.log(JSON.stringify({ schema_version: 1, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}
