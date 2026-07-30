#!/usr/bin/env node
import assert from "node:assert/strict";
import { applyV3IntraCohortDedupe } from "./card-backfill-source-v3-dedupe.mjs";

const shaA = "a".repeat(64);
const shaB = "b".repeat(64);
const report = {
  version: 3,
  source_policy_version: 3,
  counts: { candidate: 3, unchanged: 0, "not-found": 0 },
  results: [
    { wall_id: "UC-001", side: "still", expected_subject: "K9", status: "candidate", candidate: { src: "assets/a.jpg", sha256: shaA }, candidate_sha256: shaA, discovery: {} },
    { wall_id: "UC-002", side: "still", expected_subject: "K9", status: "candidate", candidate: { src: "assets/b.jpg", sha256: shaA }, candidate_sha256: shaA, discovery: {} },
    { wall_id: "UC-003", side: "still", expected_subject: "Master Chief", status: "candidate", candidate: { src: "assets/c.jpg", sha256: shaB }, candidate_sha256: shaB, discovery: {} },
  ],
  canonical_write: false,
};

const value = applyV3IntraCohortDedupe(report);
assert.equal(value.counts.candidate, 2);
assert.equal(value.counts["not-found"], 1);
assert.equal(value.results[0].status, "candidate");
assert.equal(value.results[1].status, "not-found");
assert.equal(value.results[1].discovery.failure, "source-policy-v3:intra-cohort-byte-duplicate");
assert.equal(value.results[1].discovery.v3_intra_cohort_duplicate.retained_obligation_id, "UC-001/still");
assert.equal(value.results[2].status, "candidate");
assert.equal(value.canonical_write, false);

console.log("card-backfill source-v3 dedupe fixtures: PASS");
