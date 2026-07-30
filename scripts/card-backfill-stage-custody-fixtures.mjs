#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateArtifactCustody, validateCandidateBatchCustody } from "./card-backfill-stage-custody.mjs";

const decision = {
  version: 1,
  status: "ready",
  source: {
    workflow_run_id: 12345,
    artifact_id: 67890,
    artifact_name: "card-backfill-retained-wave",
    artifact_digest: "sha256:" + "a".repeat(64),
    head_sha: "b".repeat(40),
    candidate_result_sha256: "c".repeat(64),
  },
  campaign_id: "fixture-campaign",
  estate_sha256: "d".repeat(64),
  batch_sha256: "e".repeat(64),
  decisions: [{ record_id: "UC-001", side: "still", disposition: "reject" }],
};

const artifact = {
  id: 67890,
  name: "card-backfill-retained-wave",
  digest: "sha256:" + "a".repeat(64),
  expired: false,
  workflow_run: { id: 12345, head_sha: "b".repeat(40) },
};

const result = {
  campaign_id: "fixture-campaign",
  estate_sha256: "d".repeat(64),
  batch_sha256: "e".repeat(64),
  result_sha256: "c".repeat(64),
  results: [
    { record_id: "UC-001", side: "still", disposition: "candidate-pending-independent-visual-adjudication" },
    { record_id: "UC-002", side: "still", disposition: "quarantine" },
  ],
};

assert.equal(validateArtifactCustody({ decision, artifact }).artifact_id, 67890);
assert.equal(validateCandidateBatchCustody({ decision, result }).pending_candidates, 1);

assert.throws(() => validateArtifactCustody({ decision, artifact: { ...artifact, expired: true } }), /expired/);
assert.throws(() => validateArtifactCustody({ decision, artifact: { ...artifact, digest: "sha256:" + "f".repeat(64) } }), /digest mismatch/);
assert.throws(() => validateCandidateBatchCustody({ decision, result: { ...result, batch_sha256: "0".repeat(64) } }), /batch mismatch/);
assert.throws(() => validateCandidateBatchCustody({ decision: { ...decision, decisions: [] }, result }), /cardinality mismatch/);

console.log("card-backfill stage custody fixtures: PASS — retained artifact identity, digest, campaign, result, and decision cardinality all fail closed");
