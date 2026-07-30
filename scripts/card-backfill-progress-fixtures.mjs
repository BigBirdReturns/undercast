#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildSelectableEstate, configuredCohortKey, validateCampaignProgress } from "./card-backfill-cohort.mjs";

const control = {
  freeze: { completed_evidence_packets: 40, open_source_declared_absences: 432, selector_defined_estate: 472 },
  batch: { cohort_priority: [
    { cohort_key: "first", minimum_ready: 3 },
    { cohort_key: "second", minimum_ready: 2 },
  ] },
};
assert.equal(validateCampaignProgress(control, { completed: 40, open: 432, total: 472 }).valid, true);
const progressed = validateCampaignProgress(control, { completed: 60, open: 412, total: 472 });
assert.equal(progressed.valid, true);
assert.equal(progressed.progress.permanent_packets_published, 20);
assert.equal(progressed.progress.obligations_closed, 20);
assert.equal(validateCampaignProgress(control, { completed: 60, open: 413, total: 473 }).valid, false);
assert.equal(validateCampaignProgress(control, { completed: 39, open: 433, total: 472 }).valid, false);
assert.equal(validateCampaignProgress(control, { completed: 61, open: 412, total: 473 }).valid, false);

const obligations = [1,2,3,4,5].map((number) => ({ obligation_id: `UC-${number}/still`, disposition: "ready" }));
const estate = {
  counts: { ready: 5, quarantine: 0, cohorts: 2, ready_cohorts: 2, quarantine_cohorts: 0 },
  obligations,
  cohorts: [
    { cohort_key: "first", disposition: "ready", count: 3, obligation_ids: obligations.slice(0,3).map((row) => row.obligation_id) },
    { cohort_key: "second", disposition: "ready", count: 2, obligation_ids: obligations.slice(3).map((row) => row.obligation_id) },
  ],
};
const staged = new Set(["UC-1/still"]);
const attempted = new Set(["UC-2/still", "UC-3/still"]);
const excluded = new Set([...staged, ...attempted]);
const selectable = buildSelectableEstate(estate, excluded, staged, attempted, false);
assert.equal(selectable.counts.staged_awaiting_publication, 1);
assert.equal(selectable.counts.attempted_excluded, 2);
assert.equal(selectable.counts.discovery_available, 2);
assert.equal(configuredCohortKey(control, selectable), "second", "priority must skip an exhausted/under-minimum cohort");
const retry = buildSelectableEstate(estate, staged, staged, attempted, true);
assert.equal(retry.counts.discovery_available, 4);
assert.equal(configuredCohortKey(control, retry), "second", "retry mode may re-include attempted obligations while staged packets remain excluded");

console.log("card-backfill progress fixtures: PASS");
