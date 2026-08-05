#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const reliability = await readFile(new URL("../.github/workflows/operational-reliability-evidence.yml", import.meta.url), "utf8");
const reliabilityPublisher = await readFile(new URL("../.github/workflows/operational-reliability-evidence-publisher.yml", import.meta.url), "utf8");
const metrics = await readFile(new URL("../.github/workflows/operational-metrics-evidence.yml", import.meta.url), "utf8");
const metricsPublisher = await readFile(new URL("../.github/workflows/operational-metrics-evidence-publisher.yml", import.meta.url), "utf8");
const archive = await readFile(new URL("../.github/workflows/validate.yml", import.meta.url), "utf8");

function workflowBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing workflow block ${startMarker.trim()}`);
  assert.notEqual(end, -1, `missing workflow boundary ${endMarker.trim()}`);
  return source.slice(start, end);
}

const reliabilityPush = workflowBlock(reliability, "\n  push:\n", "\n  pull_request:\n");
const reliabilityPullRequest = workflowBlock(reliability, "\n  pull_request:\n", "\n  workflow_dispatch:\n");
for (const [label, block] of [["main push", reliabilityPush], ["pull request", reliabilityPullRequest]]) {
  assert.match(block, /- "package\.json"/, `${label} trigger must track package.json`);
  assert.match(block, /- "package-lock\.json"/, `${label} trigger must track package-lock.json`);
  assert.match(block, /- "scripts\/operational-workflow-fixtures\.mjs"/, `${label} trigger must track its own path-contract fixture`);
  assert.match(block, /operational-reliability-evidence-publisher\.yml/, `${label} trigger must track the trusted publisher`);
  assert.match(block, /scripts\/publisher-custody\.mjs/, `${label} trigger must track publisher custody`);
  assert.match(block, /scripts\/operational-restore-git-objects\.mjs/, `${label} trigger must track the bounded Git-object builder`);
  assert.match(block, /data\/review\/operational-restore-git-object-set\.json/, `${label} trigger must track the exact Git-object manifest`);
}
assert.equal((reliability.match(/- "package-lock\.json"/g) || []).length, 2, "package-lock.json must be present in exactly the main-push and pull-request trigger blocks");

for (const [label, source] of [["reliability", reliability], ["metrics", metrics]]) {
  const permissions = workflowBlock(source, "\npermissions:\n", "\nconcurrency:\n");
  assert.match(permissions, /contents:\s*read/, `${label} evidence must retain contents read`);
  assert.doesNotMatch(permissions, /\bwrite\b/, `${label} evidence must not have write authority`);
  assert.match(source, /publisher-handoff\.json/, `${label} evidence must emit a publisher handoff`);
  assert.doesNotMatch(source, /gh issue (?:create|edit|reopen)/, `${label} evidence must not mutate issues`);
}

assert.match(reliability, /operational-restore-git-objects\.mjs build/, "restore drill must build the exact historical Git-object set");
assert.match(reliability, /--manifest data\/review\/operational-restore-git-object-set\.json/, "restore drill must bind the exact Git-object manifest");
assert.match(reliability, /--repository "\$GITHUB_REPOSITORY"/, "restore drill must bind the object manifest to the exact repository");
assert.match(reliability, /GIT_ALTERNATE_OBJECT_DIRECTORIES="\$object_store\/objects"/, "restore drill must expose only the bounded alternate object directory");
assert.match(reliability, /git-object-set\.json/, "restore evidence and publisher handoff must retain the bounded Git-object receipt");
assert.doesNotMatch(reliability, /url\."https:\/\/github\.com\/.*"\.insteadOf origin/, "restore drill must not grant the disposable repository an open-ended origin alias");
assert.doesNotMatch(reliability, /SKIP_IMMUTABLE_GIT_CHECK/, "restore drill must not bypass immutable Git custody checks");

for (const [label, source] of [["reliability", reliabilityPublisher], ["metrics", metricsPublisher]]) {
  assert.match(source, /\n  workflow_run:\n/, `${label} publisher must run from trusted workflow_run custody`);
  assert.doesNotMatch(source, /\n  pull_request:\n/, `${label} publisher must not run from a PR-head definition`);
  assert.match(source, /issues:\s*write/, `${label} publisher must hold the isolated issue-write authority`);
  assert.match(source, /actions:\s*read/, `${label} publisher must read exact workflow artifacts`);
  assert.match(source, /verify-evidence-handoff/, `${label} publisher must verify the immutable handoff`);
  assert.match(source, /publisher-handoff-files\.mjs verify/, `${label} publisher must require the exact consumed handoff file set`);
  assert.ok((source.match(/git\/ref\/heads\/main/g) || []).length >= 2, `${label} publisher must check main before recovery and immediately before mutation`);
  assert.match(source, /workflow_run\.head_sha/, `${label} publisher must bind the exact source head`);
  assert.match(source, /artifact\.digest/, `${label} publisher must require the registered artifact digest`);
}

const archivePermissions = workflowBlock(archive, "\npermissions:\n", "\nconcurrency:\n");
assert.match(archivePermissions, /contents:\s*read/, "archive contract must be read-only");
assert.doesNotMatch(archivePermissions, /\bwrite\b/, "archive contract must not retain repository write authority");
assert.doesNotMatch(archive, /DEC-0016|ux02a|MATERIALIZER/, "archive contract must not contain the retired one-off materializer");
assert.match(archive, /npm run gate/, "archive contract must execute the canonical gate");

console.log("PASS — operational evidence is read-only, restored Git history is exact-object bounded, and durable publication is isolated in exact-main workflow_run custody");
