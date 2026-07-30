#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJson, sha256 } from "./lib/card-backfill-staging.mjs";
import { readPolicyAwareAdjudicationAttemptIndex } from "./lib/card-backfill-attempt-index.mjs";

const root = await mkdtemp(join(tmpdir(), "undercast-attempt-index-fixture-"));
const adjudications = join(root, "adjudications");
await mkdir(adjudications, { recursive: true });

async function writeReceipt({ batch, obligation, cohort, policy = null }) {
  const results = [{ obligation_id: obligation, final_disposition: "quarantine", reason: "fixture miss" }];
  const receipt = {
    version: 1,
    lane: "card-backfill-adjudication",
    campaign_id: "fixture-campaign",
    batch_sha256: batch,
    cohort_key: cohort,
    generated_at: "2026-07-30T00:00:00.000Z",
    ...(policy || {}),
    results,
    result_sha256: sha256(canonicalJson(results)),
    canonical_mutation: false,
  };
  await writeFile(join(adjudications, `${batch}.json`), JSON.stringify(receipt, null, 2) + "\n");
}

try {
  await writeReceipt({
    batch: "a".repeat(64),
    obligation: "UC-001/still",
    cohort: "still::voice-or-animation::mediawiki-bound-multicandidate-v3::canonical-link-only::character-depiction",
    policy: {
      source_policy_id: "card-backfill-policy-v3-wave-1",
      source_policy_version: 3,
      source_policy_revision: 1,
      lessons_contract_sha256: "bafa82adfc525421f498f5655bf12ba0000d131349fcd72edd03f940d9b78931",
    },
  });
  await writeReceipt({
    batch: "b".repeat(64),
    obligation: "UC-002/portrait",
    cohort: "portrait::voice-or-animation::commons-multicandidate-v2::canonical-link-only::neutral-human",
  });

  const index = await readPolicyAwareAdjudicationAttemptIndex(root, "fixture-campaign");
  assert.equal(index.receipt_count, 2);
  assert.equal(index.attempted_count, 2);
  assert.equal(index.source_policy_version_preserved, true);
  const current = index.entries.find((row) => row.obligation_id === "UC-001/still").attempts[0];
  assert.equal(current.source_policy_id, "card-backfill-policy-v3-wave-1");
  assert.equal(current.source_policy_version, 3);
  assert.equal(current.source_policy_revision, 1);
  assert.equal(current.lessons_contract_sha256, "bafa82adfc525421f498f5655bf12ba0000d131349fcd72edd03f940d9b78931");
  const legacy = index.entries.find((row) => row.obligation_id === "UC-002/portrait").attempts[0];
  assert.equal(legacy.source_policy_version, 2);
  assert.equal(legacy.source_policy_id, "legacy-card-backfill-policy-v2");
  console.log("card-backfill attempt-index fixtures: PASS — source_policy_version, policy id, revision, and lesson digest survive forward planning");
} finally {
  await rm(root, { recursive: true, force: true });
}
