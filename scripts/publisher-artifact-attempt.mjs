#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const COMMIT_RE = /^[0-9a-f]{40}$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const PREFIX_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`${label} must be a positive safe integer`);
  return number;
}
function requireString(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}
function requireRepository(value) {
  const repository = requireString(value, "repository");
  if (!REPOSITORY_RE.test(repository)) throw new Error("repository must use owner/name form");
  return repository;
}
function requireCommit(value, label) {
  const commit = requireString(value, label);
  if (!COMMIT_RE.test(commit)) throw new Error(`${label} must be a full lowercase commit SHA`);
  return commit;
}
function requirePrefix(value) {
  const prefix = requireString(value, "artifact prefix");
  if (!PREFIX_RE.test(prefix)) throw new Error("artifact prefix must be lowercase kebab-case");
  return prefix;
}

export function artifactNameForAttempt(prefix, runId, runAttempt) {
  prefix = requirePrefix(prefix);
  runId = requirePositiveInteger(runId, "run id");
  runAttempt = requirePositiveInteger(runAttempt, "run attempt");
  return `${prefix}-${runId}-attempt-${runAttempt}`;
}

export function selectExactAttemptArtifact({
  artifacts,
  attempt,
  artifactPrefix,
  expectedName,
  repository,
  expectedRunId,
  expectedRunAttempt,
  expectedEventName,
  expectedHeadBranch,
  expectedHeadSha,
}) {
  assert.ok(Array.isArray(artifacts), "artifacts must be an array");
  assert.ok(attempt && typeof attempt === "object" && !Array.isArray(attempt), "attempt must be an object");
  repository = requireRepository(repository);
  expectedRunId = requirePositiveInteger(expectedRunId, "expected run id");
  expectedRunAttempt = requirePositiveInteger(expectedRunAttempt, "expected run attempt");
  expectedEventName = requireString(expectedEventName, "expected event name");
  expectedHeadBranch = requireString(expectedHeadBranch, "expected head branch");
  expectedHeadSha = requireCommit(expectedHeadSha, "expected head SHA");
  const derivedName = artifactNameForAttempt(artifactPrefix, expectedRunId, expectedRunAttempt);
  if (requireString(expectedName, "expected artifact name") !== derivedName) {
    throw new Error(`artifact name is not bound to run ${expectedRunId} attempt ${expectedRunAttempt}`);
  }

  if (Number(attempt.id) !== expectedRunId) throw new Error("attempt run id drifted");
  if (Number(attempt.run_attempt) !== expectedRunAttempt) throw new Error("attempt number drifted");
  if (attempt.status !== "completed" || attempt.conclusion !== "success") throw new Error("attempt is not a completed success");
  if (attempt.event !== expectedEventName) throw new Error("attempt event drifted");
  if (attempt.head_branch !== expectedHeadBranch) throw new Error("attempt head branch drifted");
  if (attempt.head_sha !== expectedHeadSha) throw new Error("attempt head SHA drifted");

  const exact = artifacts.filter((artifact) => (
    artifact
    && artifact.name === derivedName
    && artifact.expired === false
    && Number(artifact.workflow_run?.id) === expectedRunId
    && artifact.workflow_run?.head_branch === expectedHeadBranch
    && artifact.workflow_run?.head_sha === expectedHeadSha
  ));
  if (exact.length !== 1) {
    throw new Error(`expected one live artifact for run ${expectedRunId} attempt ${expectedRunAttempt}, found ${exact.length}`);
  }

  const artifact = exact[0];
  const artifactId = requirePositiveInteger(artifact.id, "artifact id");
  const digest = requireString(artifact.digest, "artifact digest");
  if (!DIGEST_RE.test(digest)) throw new Error("artifact digest must be a sha256: digest");
  const archiveUrl = requireString(artifact.archive_download_url, "artifact archive URL");
  const expectedArchiveUrl = `https://api.github.com/repos/${repository}/actions/artifacts/${artifactId}/zip`;
  if (archiveUrl !== expectedArchiveUrl) throw new Error("artifact archive URL drifted");
  return artifact;
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
  const command = argv.shift() || "select";
  if (command !== "select") throw new Error(`unknown publisher-artifact-attempt command ${command}`);
  const repository = option(argv, "--repository");
  const runId = option(argv, "--run-id");
  const runAttempt = option(argv, "--run-attempt");
  const artifactsDocument = JSON.parse(readFileSync(option(argv, "--artifacts-json"), "utf8"));
  const attempt = JSON.parse(readFileSync(option(argv, "--attempt-json"), "utf8"));
  const artifact = selectExactAttemptArtifact({
    artifacts: artifactsDocument.artifacts || [],
    attempt,
    artifactPrefix: option(argv, "--prefix"),
    expectedName: option(argv, "--name"),
    repository,
    expectedRunId: runId,
    expectedRunAttempt: runAttempt,
    expectedEventName: option(argv, "--event-name"),
    expectedHeadBranch: option(argv, "--head-branch"),
    expectedHeadSha: option(argv, "--head-sha"),
  });
  const output = option(argv, "--output");
  writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(`id=${artifact.id}`);
  console.log(`digest=${artifact.digest}`);
  console.log(`archive_url=${artifact.archive_download_url}`);
  console.log(`url=https://github.com/${repository}/actions/runs/${Number(runId)}/artifacts/${artifact.id}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) {
    console.error(`publisher-artifact-attempt: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
