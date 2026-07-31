#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildRoute, computeNextAction } from "./card-backfill-route-next.mjs";

async function json(path, value) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

const direct = [
  [{ completed: 147, target: 147, readyDecisions: 9, staged: 9, publicationMinimum: 2, total: 472 }, "stop"],
  [{ completed: 44, target: 147, readyDecisions: 1, staged: 3, publicationMinimum: 2, total: 472 }, "stage"],
  [{ completed: 44, target: 147, readyDecisions: 0, staged: 2, publicationMinimum: 2, total: 472 }, "publish"],
  [{ completed: 44, target: 147, readyDecisions: 0, staged: 0, publicationMinimum: 2, total: 472 }, "discover"],
];
for (const [input, expected] of direct) assert.equal(computeNextAction(input).action, expected);

const supervisorWorkflow = await readFile(new URL("../.github/workflows/card-backfill-supervisor.yml", import.meta.url), "utf8");
const amortizedWorkflow = await readFile(new URL("../.github/workflows/card-backfill-amortized-wave.yml", import.meta.url), "utf8");
assert.match(supervisorWorkflow, /current_head=\$\(git rev-parse HEAD\)/);
assert.match(supervisorWorkflow, /--json databaseId,status,url,workflowName,createdAt,headSha/);
assert.match(supervisorWorkflow, /gh run cancel "\$run_id"/);
assert.match(supervisorWorkflow, /current-head amortized discovery already active/);
assert.match(amortizedWorkflow, /group: card-backfill-amortized-wave-\$\{\{ github\.ref_name \}\}\n  cancel-in-progress: true/);
assert.match(amortizedWorkflow, /ref: \$\{\{ github\.ref_name \}\}\n          fetch-depth: 1/);

const root = await mkdtemp(join(tmpdir(), "undercast-route-next-"));
try {
  const activationPath = join(root, ".github/CARD-BACKFILL-AMORTIZATION-ACTIVE.json");
  const controlPath = join(root, ".github/CARD-BACKFILL-COHORT.json");
  const stagingPath = join(root, "data/review/card-backfill-staging/STAGING.json");
  const permanentRoot = join(root, "data/review/card-backfill");
  const decisionsRoot = join(root, ".github/card-backfill/adjudications");
  const stagingAdjudicationsRoot = join(root, "data/review/card-backfill-staging/adjudications");
  await json(activationPath, {
    active: true,
    manual_continue_required: false,
    successor_dispatch_is_explicit: true,
    workflow_token_push_recursion_is_not_assumed: true,
    unattended_campaign: { minimum_completion_percent: 31, minimum_completed_packets: 147, selector_defined_estate: 472 },
  });
  await json(controlPath, { freeze: { selector_defined_estate: 472 }, staging: { minimum_publication_batch: 2 } });
  await json(stagingPath, { counts: { staged: 0 } });
  await mkdir(permanentRoot, { recursive: true });
  for (let index = 1; index <= 44; index += 1) await mkdir(join(permanentRoot, `UC-${String(index).padStart(3, "0")}`));
  await mkdir(decisionsRoot, { recursive: true });
  await mkdir(stagingAdjudicationsRoot, { recursive: true });

  let route = await buildRoute({ activationPath, controlPath, stagingPath, permanentRoot, decisionsRoot, stagingAdjudicationsRoot });
  assert.equal(route.action, "discover");
  assert.equal(route.completed, 44);
  assert.equal(route.target_completed_packets, 147);
  assert.equal(route.manual_continue_required, false);

  await json(join(decisionsRoot, "ready.json"), { version: 1, status: "ready", batch_sha256: "abc" });
  route = await buildRoute({ activationPath, controlPath, stagingPath, permanentRoot, decisionsRoot, stagingAdjudicationsRoot });
  assert.equal(route.action, "stage");

  await json(join(stagingAdjudicationsRoot, "abc.json"), { version: 1 });
  await json(stagingPath, { counts: { staged: 2 } });
  route = await buildRoute({ activationPath, controlPath, stagingPath, permanentRoot, decisionsRoot, stagingAdjudicationsRoot });
  assert.equal(route.action, "publish");

  for (let index = 45; index <= 147; index += 1) await mkdir(join(permanentRoot, `UC-${String(index).padStart(3, "0")}`));
  route = await buildRoute({ activationPath, controlPath, stagingPath, permanentRoot, decisionsRoot, stagingAdjudicationsRoot });
  assert.equal(route.action, "stop");
  assert.equal(route.reason, "target-reached");

  console.log("card-backfill route-next fixtures: PASS — target > ready decisions > publication > discovery; stale waves are superseded and no chat continuation is valid");
} finally {
  await rm(root, { recursive: true, force: true });
}
