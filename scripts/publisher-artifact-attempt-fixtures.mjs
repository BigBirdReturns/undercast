#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  artifactNameForAttempt,
  selectExactAttemptArtifact,
} from "./publisher-artifact-attempt.mjs";

const repository = "BigBirdReturns/undercast";
const prefix = "operational-reliability-evidence";
const runId = 31060000001;
const runAttempt = 2;
const headSha = "a".repeat(40);
const name1 = artifactNameForAttempt(prefix, runId, 1);
const name2 = artifactNameForAttempt(prefix, runId, runAttempt);
const workflowRun = { id: runId, head_branch: "main", head_sha: headSha };
const attempt = {
  id: runId,
  run_attempt: runAttempt,
  status: "completed",
  conclusion: "success",
  event: "push",
  head_branch: "main",
  head_sha: headSha,
};
const artifact = (id, name, overrides = {}) => ({
  id,
  name,
  expired: false,
  digest: `sha256:${String(id).padStart(64, "0")}`,
  archive_download_url: `https://api.github.com/repos/${repository}/actions/artifacts/${id}/zip`,
  workflow_run: { ...workflowRun },
  ...overrides,
});
const artifacts = [artifact(101, name1), artifact(202, name2)];
const input = {
  artifacts,
  attempt,
  artifactPrefix: prefix,
  expectedName: name2,
  repository,
  expectedRunId: runId,
  expectedRunAttempt: runAttempt,
  expectedEventName: "push",
  expectedHeadBranch: "main",
  expectedHeadSha: headSha,
};

assert.equal(name2, `operational-reliability-evidence-${runId}-attempt-${runAttempt}`);
assert.equal(selectExactAttemptArtifact(input).id, 202);
assert.throws(() => selectExactAttemptArtifact({ ...input, expectedName: `operational-reliability-evidence-${runId}` }), /not bound/);
assert.throws(() => selectExactAttemptArtifact({ ...input, attempt: { ...attempt, run_attempt: 1 } }), /attempt number/);
assert.throws(() => selectExactAttemptArtifact({ ...input, attempt: { ...attempt, conclusion: "failure" } }), /completed success/);
assert.throws(() => selectExactAttemptArtifact({ ...input, attempt: { ...attempt, event: "pull_request" } }), /event drifted/);
assert.throws(() => selectExactAttemptArtifact({ ...input, attempt: { ...attempt, head_sha: "b".repeat(40) } }), /head SHA drifted/);
assert.throws(() => selectExactAttemptArtifact({ ...input, artifacts: [...artifacts, artifact(303, name2)] }), /found 2/);
assert.throws(() => selectExactAttemptArtifact({ ...input, artifacts: [artifact(202, name2, { expired: true })] }), /found 0/);
assert.throws(() => selectExactAttemptArtifact({ ...input, artifacts: [artifact(202, name2, { workflow_run: { ...workflowRun, head_branch: "feature" } })] }), /found 0/);
assert.throws(() => selectExactAttemptArtifact({ ...input, artifacts: [artifact(202, name2, { digest: "bad" })] }), /sha256/);
assert.throws(() => selectExactAttemptArtifact({ ...input, artifacts: [artifact(202, name2, { archive_download_url: "https://example.test/wrong.zip" })] }), /archive URL drifted/);

const root = await mkdtemp(path.join(tmpdir(), "undercast-attempt-artifact-"));
try {
  const artifactsPath = path.join(root, "artifacts.json");
  const attemptPath = path.join(root, "attempt.json");
  const outputPath = path.join(root, "artifact.json");
  await writeFile(artifactsPath, `${JSON.stringify({ artifacts }, null, 2)}\n`);
  await writeFile(attemptPath, `${JSON.stringify(attempt, null, 2)}\n`);
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./publisher-artifact-attempt.mjs", import.meta.url)),
    "select",
    "--artifacts-json", artifactsPath,
    "--attempt-json", attemptPath,
    "--prefix", prefix,
    "--name", name2,
    "--repository", repository,
    "--run-id", String(runId),
    "--run-attempt", String(runAttempt),
    "--event-name", "push",
    "--head-branch", "main",
    "--head-sha", headSha,
    "--output", outputPath,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^id=202$/m);
  assert.match(result.stdout, /^digest=sha256:/m);
  assert.match(result.stdout, /archive_url=https:\/\/api\.github\.com\//);
  assert.match(result.stdout, new RegExp(`url=https://github.com/${repository}/actions/runs/${runId}/artifacts/202`));
  assert.equal(JSON.parse(await readFile(outputPath, "utf8")).id, 202);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("PASS — workflow-attempt artifact names, exact attempt selection, duplicate refusal, immutable ID download metadata, and CLI outputs");
