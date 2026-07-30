#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildDisjointWaveBatches, validateDisjointWave } from "./lib/card-backfill-wave.mjs";

const obligations = Array.from({ length: 210 }, (_, index) => {
  const number = index + 1;
  const cohort = number <= 170 ? "still::voice::mediawiki-v3::canonical::character" : "portrait::live::commons-v3::canonical::neutral";
  return {
    obligation_id: `UC-${String(number).padStart(3, "0")}/${number <= 170 ? "still" : "portrait"}`,
    wall_id: `UC-${String(number).padStart(3, "0")}`,
    scope_sha256: String(number).padStart(64, "0").slice(-64),
    cohort_key: cohort,
    shape: { side: number <= 170 ? "still" : "portrait" },
  };
});
const cohorts = [
  {
    cohort_key: "still::voice::mediawiki-v3::canonical::character",
    disposition: "ready",
    count: 170,
    first_obligation_id: obligations[0].obligation_id,
    shape: obligations[0].shape,
    obligation_ids: obligations.slice(0, 170).map((row) => row.obligation_id),
  },
  {
    cohort_key: "portrait::live::commons-v3::canonical::neutral",
    disposition: "ready",
    count: 40,
    first_obligation_id: obligations[170].obligation_id,
    shape: obligations[170].shape,
    obligation_ids: obligations.slice(170).map((row) => row.obligation_id),
  },
];
const policy = {
  policy_id: "card-backfill-policy-v3-wave-1",
  version: 3,
  revision: 1,
  lessons_contract_sha256: "bafa82adfc525421f498f5655bf12ba0000d131349fcd72edd03f940d9b78931",
  inherited_lesson_ids: Array.from({ length: 24 }, (_, index) => `CBL-${String(index + 1).padStart(3, "0")}`),
  canonical_mutation: false,
};
const wave = validateDisjointWave(buildDisjointWaveBatches({
  estate: { campaign_id: "fixture", estate_sha256: "a".repeat(64), obligations, cohorts },
  control: { batch: { maximum: 50 } },
  sourceEstateSha256: "b".repeat(64),
  exclusionStateSha256: "c".repeat(64),
  policy,
  batchLimit: 40,
  waveBatchLimit: 4,
}));
assert.equal(wave.wave_batches, 4);
assert.equal(wave.selected_count, 160);
assert.equal(wave.disjoint_obligation_ids.length, 160);
assert.equal(new Set(wave.disjoint_obligation_ids).size, 160);
assert(wave.batches.every((batch) => batch.artifact_only === true));
assert.deepEqual(wave.batches.map((batch) => batch.selected_count), [40, 40, 40, 40]);

{
  const broken = structuredClone(wave);
  broken.batches[1].obligations[0] = broken.batches[0].obligations[0];
  assert.throws(() => validateDisjointWave(broken), /not disjoint/);
}

{
  assert.throws(() => buildDisjointWaveBatches({
    estate: { campaign_id: "fixture", estate_sha256: "a".repeat(64), obligations, cohorts },
    control: { batch: { maximum: 50 } },
    sourceEstateSha256: "b".repeat(64),
    exclusionStateSha256: "c".repeat(64),
    policy: { policy_id: "broken" },
  }), /policy identity is incomplete/);
}

console.log("card-backfill wave fixtures: PASS — four immutable batches select 160 unique obligations and duplicate work fails closed");
