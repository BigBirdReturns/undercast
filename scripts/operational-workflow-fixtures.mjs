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

function sparseCheckoutBlock(source, label) {
  const marker = "          sparse-checkout: |";
  const start = source.indexOf(marker);
  const end = source.indexOf("\n          sparse-checkout-cone-mode:", start + marker.length);
  assert.notEqual(start, -1, `${label} publisher lacks a sparse checkout`);
  assert.notEqual(end, -1, `${label} publisher sparse checkout has no closed boundary`);
  return source.slice(start, end);
}

function publisherMutationBlock(source, label) {
  const start = source.indexOf("      - name: Lease exact main through durable");
  assert.notEqual(start, -1, `${label} publisher lacks the terminal main-lease step`);
  return source.slice(start);
}

function assertMutationLeases(source, label) {
  const block = publisherMutationBlock(source, label);
  const search = block.indexOf("gh api --method GET /search/issues");
  const branch = block.indexOf('if [ -n "$match" ]');
  assert.ok(search >= 0 && branch > search, `${label} publisher must finish issue discovery before selecting a mutation branch`);
  const mutationBlock = block.slice(branch);
  assert.match(mutationBlock, /issue_state="\$\{match#\*\$'\\t'\}"[\s\S]*?assert_exact_main[\s\S]*?if \[ "\$issue_state" = "closed" \]; then[\s\S]*?gh issue reopen[\s\S]*?assert_exact_main[\s\S]*?fi[\s\S]*?gh issue edit[\s\S]*?assert_exact_main/, `${label} existing-issue branch must lease main before reopen/edit, between reopen and edit, and after edit`);
  assert.match(mutationBlock, /else[\s\S]*?assert_exact_main[\s\S]*?gh issue create[\s\S]*?assert_exact_main[\s\S]*?fi/, `${label} issue-create branch must lease main immediately before and after creation`);
}

const reliabilityPush = workflowBlock(reliability, "\n  push:\n", "\n  pull_request:\n");
const reliabilityPullRequest = workflowBlock(reliability, "\n  pull_request:\n", "\n  workflow_dispatch:\n");
for (const [label, block] of [["main push", reliabilityPush], ["pull request", reliabilityPullRequest]]) {
  assert.match(block, /- "package\.json"/, `${label} trigger must track package.json`);
  assert.match(block, /- "package-lock\.json"/, `${label} trigger must track package-lock.json`);
  assert.match(block, /- "scripts\/operational-workflow-fixtures\.mjs"/, `${label} trigger must track its own path-contract fixture`);
  assert.match(block, /operational-reliability-evidence-publisher\.yml/, `${label} trigger must track the trusted publisher`);
  assert.match(block, /scripts\/publisher-custody\.mjs/, `${label} trigger must track publisher custody`);
  assert.match(block, /scripts\/publisher-handoff-files\.mjs/, `${label} trigger must track the exact handoff-file validator`);
  assert.match(block, /scripts\/publisher-artifact-attempt\.mjs/, `${label} trigger must track the exact-attempt artifact selector`);
  assert.match(block, /scripts\/publisher-artifact-attempt-fixtures\.mjs/, `${label} trigger must track the attempt-selector fixture`);
  assert.match(block, /scripts\/operational-restore-git-objects\.mjs/, `${label} trigger must track the bounded Git-object builder`);
  assert.match(block, /data\/review\/operational-restore-git-object-set\.json/, `${label} trigger must track the exact Git-object manifest`);
}
assert.equal((reliability.match(/- "package-lock\.json"/g) || []).length, 2, "package-lock.json must be present in exactly the main-push and pull-request trigger blocks");
assert.equal((reliability.match(/- "scripts\/publisher-handoff-files\.mjs"/g) || []).length, 2, "reliability workflow must track the handoff-file validator in push and pull_request");
assert.equal((metrics.match(/- "scripts\/publisher-handoff-files\.mjs"/g) || []).length, 2, "metrics workflow must track the handoff-file validator in push and pull_request");
assert.equal((reliability.match(/- "scripts\/publisher-artifact-attempt\.mjs"/g) || []).length, 2, "reliability workflow must track the exact-attempt selector in push and pull_request");
assert.equal((reliability.match(/- "scripts\/publisher-artifact-attempt-fixtures\.mjs"/g) || []).length, 2, "reliability workflow must track the selector fixture in push and pull_request");
assert.equal((metrics.match(/- "scripts\/publisher-artifact-attempt\.mjs"/g) || []).length, 2, "metrics workflow must track the exact-attempt selector in push and pull_request");
assert.equal((metrics.match(/- "scripts\/publisher-artifact-attempt-fixtures\.mjs"/g) || []).length, 2, "metrics workflow must track the selector fixture in push and pull_request");

for (const [label, source] of [["reliability", reliability], ["metrics", metrics]]) {
  const permissions = workflowBlock(source, "\npermissions:\n", "\nconcurrency:\n");
  assert.match(permissions, /contents:\s*read/, `${label} evidence must retain contents read`);
  assert.doesNotMatch(permissions, /\bwrite\b/, `${label} evidence must not have write authority`);
  assert.match(source, /publisher-handoff\.json/, `${label} evidence must emit a publisher handoff`);
  assert.doesNotMatch(source, /gh issue (?:create|edit|reopen)/, `${label} evidence must not mutate issues`);
}

assert.ok(reliability.includes('artifact_name: `operational-reliability-evidence-${process.env.GITHUB_RUN_ID}-attempt-${process.env.GITHUB_RUN_ATTEMPT}`'), "reliability handoff must bind run attempt in artifact identity");
assert.ok(reliability.includes('name: operational-reliability-evidence-${{ github.run_id }}-attempt-${{ github.run_attempt }}'), "reliability upload must bind run attempt in artifact identity");
assert.ok(metrics.includes('artifact_name: `operational-metrics-evidence-${process.env.GITHUB_RUN_ID}-attempt-${process.env.GITHUB_RUN_ATTEMPT}`'), "metrics handoff must bind run attempt in artifact identity");
assert.ok(metrics.includes('name: operational-metrics-evidence-${{ github.run_id }}-attempt-${{ github.run_attempt }}'), "metrics upload must bind run attempt in artifact identity");

const reliabilityPublisherPaths = new Set(
  sparseCheckoutBlock(reliabilityPublisher, "reliability")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "sparse-checkout: |"),
);
for (const modulePath of [
  "scripts/operational-reliability-ledger.mjs",
  "scripts/operational-reliability-execute.mjs",
  "scripts/operational-reliability.mjs",
]) {
  assert.equal(reliabilityPublisherPaths.has(modulePath), true, `reliability publisher sparse checkout omits ledger import-closure module ${modulePath}`);
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
  assert.match(source, /publisher-artifact-attempt\.mjs select/, `${label} publisher must select the artifact for the exact workflow attempt`);
  assert.ok(source.includes('/actions/runs/${SOURCE_RUN_ID}/attempts/${SOURCE_RUN_ATTEMPT}'), `${label} publisher must recover the exact attempt endpoint`);
  assert.ok(source.includes('-attempt-${{ github.event.workflow_run.run_attempt }}'), `${label} publisher artifact identity must include the source attempt`);
  assert.match(source, /curl[\s\S]*ARTIFACT_ARCHIVE_URL/, `${label} publisher must download the selected immutable artifact URL`);
  assert.match(source, /sha256sum/, `${label} publisher must verify the downloaded ZIP against the registered digest`);
  assert.doesNotMatch(source, /actions\/download-artifact@/, `${label} publisher must not reselect an artifact by mutable name`);
  assert.ok((source.match(/git\/ref\/heads\/main/g) || []).length >= 2, `${label} publisher must check main before recovery and at mutation time`);
  assert.match(source, /workflow_run\.head_sha/, `${label} publisher must bind the exact source head`);
  assert.match(source, /workflow_run\.run_attempt/, `${label} publisher must bind the exact source attempt`);
  assert.match(source, /steps\.artifact\.outputs\.digest/, `${label} publisher must consume the registered artifact digest selected for the exact attempt`);
  assertMutationLeases(source, label);
}

const archivePermissions = workflowBlock(archive, "\npermissions:\n", "\nconcurrency:\n");
assert.match(archivePermissions, /contents:\s*read/, "archive contract must be read-only");
assert.doesNotMatch(archivePermissions, /\bwrite\b/, "archive contract must not retain repository write authority");
assert.doesNotMatch(archive, /DEC-0016|ux02a|MATERIALIZER/, "archive contract must not contain the retired one-off materializer");
assert.match(archive, /npm run gate/, "archive contract must execute the canonical gate");

console.log("PASS — operational evidence is read-only, producer triggers include every exact handoff consumer, trusted publishers retain their executable import closure, restored Git history is exact-object bounded, attempt-bound immutable artifact recovery and mutation-time main leases are enforced, and publication is isolated in exact-main workflow_run custody");
