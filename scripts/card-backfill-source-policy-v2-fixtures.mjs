#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildSourcePolicyV2Estate, CARD_BACKFILL_SOURCE_POLICY_V2 } from "./lib/card-backfill-source-policy-v2.mjs";

const estate = {
  version: 1,
  campaign_id: "fixture",
  estate_sha256: "a".repeat(64),
  obligations: [
    {
      obligation_id: "UC-001/still", wall_id: "UC-001", side: "still", expected_subject: "Single Character", disposition: "ready", quarantine_reasons: [],
      shape: { side: "still", performance_mode: "physical-or-live-action", source_route: "franchise-mediawiki", evidence_tier: "canonical-link-only", render_profile: "character-depiction" },
      cohort_key: "old-still", canonical_mutation: false,
    },
    {
      obligation_id: "UC-002/portrait", wall_id: "UC-002", side: "portrait", expected_subject: "Actor Two", disposition: "ready", quarantine_reasons: [],
      shape: { side: "portrait", performance_mode: "voice-or-animation", source_route: "performer-reference-crawl", evidence_tier: "canonical-link-only", render_profile: "neutral-human" },
      cohort_key: "old-portrait", canonical_mutation: false,
    },
    {
      obligation_id: "UC-003/still", wall_id: "UC-003", side: "still", expected_subject: "Single Open Character", disposition: "quarantine", quarantine_reasons: ["no-bounded-still-source-route"],
      shape: { side: "still", performance_mode: "voice-or-animation", source_route: "open-web-exception", evidence_tier: "canonical-link-only", render_profile: "character-depiction" },
      cohort_key: "old-open", canonical_mutation: false,
    },
    {
      obligation_id: "UC-004/still", wall_id: "UC-004", side: "still", expected_subject: "Blocked Character", disposition: "quarantine", quarantine_reasons: ["no-bounded-still-source-route", "nonstandard-audit-risk"],
      shape: { side: "still", performance_mode: "physical-or-live-action", source_route: "open-web-exception", evidence_tier: "canonical-link-only", render_profile: "character-depiction" },
      cohort_key: "blocked", canonical_mutation: false,
    },
    {
      obligation_id: "UC-005/still", wall_id: "UC-005", side: "still", expected_subject: "Character One & Character Two", disposition: "ready", quarantine_reasons: [],
      shape: { side: "still", performance_mode: "voice-or-animation", source_route: "franchise-mediawiki", evidence_tier: "canonical-link-only", render_profile: "character-depiction" },
      cohort_key: "old-composite", canonical_mutation: false,
    },
  ],
};
const attemptIndex = {
  entries: [
    { obligation_id: "UC-001/still", attempts: [{ cohort_key: "old-still", final_disposition: "quarantine" }] },
    { obligation_id: "UC-002/portrait", attempts: [{ cohort_key: "old-portrait", final_disposition: "quarantine" }] },
    { obligation_id: "UC-003/still", attempts: [{ cohort_key: "still::voice-or-animation::bounded-wikipedia-character-search::canonical-link-only::character-depiction", final_disposition: "quarantine" }] },
    { obligation_id: "UC-004/still", attempts: [{ cohort_key: "blocked", final_disposition: "quarantine" }] },
    { obligation_id: "UC-005/still", attempts: [{ cohort_key: "old-composite", final_disposition: "quarantine" }] },
  ],
};
const first = buildSourcePolicyV2Estate({ estate, attemptIndex, stagedObligationIds: [] });
assert.equal(first.counts.ready, 3);
assert.equal(first.obligations.find((row) => row.obligation_id === "UC-001/still").shape.source_route, CARD_BACKFILL_SOURCE_POLICY_V2.still_route);
assert.equal(first.obligations.find((row) => row.obligation_id === "UC-002/portrait").shape.source_route, CARD_BACKFILL_SOURCE_POLICY_V2.portrait_route);
assert(first.obligations.some((row) => row.obligation_id === "UC-003/still"));
assert(!first.obligations.some((row) => row.obligation_id === "UC-004/still"));
assert(!first.obligations.some((row) => row.obligation_id === "UC-005/still"));
assert(first.exclusions.some((row) => row.obligation_id === "UC-005/still" && row.reason === "multi-subject-composite-required"));

// Historical wording retained as policy lineage: policy v2 may not repeat itself silently.
// The active v4 assertion below inherits and strengthens that exact rule through route-encoded version custody.
const secondAttemptIndex = {
  entries: attemptIndex.entries.map((row) => row.obligation_id === "UC-001/still"
    ? { ...row, attempts: [...row.attempts, { cohort_key: `still::physical-or-live-action::${CARD_BACKFILL_SOURCE_POLICY_V2.still_route}::canonical-link-only::character-depiction`, final_disposition: "quarantine" }] }
    : row),
};
const second = buildSourcePolicyV2Estate({ estate, attemptIndex: secondAttemptIndex, stagedObligationIds: ["UC-002/portrait"] });
assert(!second.obligations.some((row) => row.obligation_id === "UC-001/still"), "policy v4 route encoding must prevent silent replay even when the attempt index lacks an explicit version field");
assert(!second.obligations.some((row) => row.obligation_id === "UC-002/portrait"), "staged obligations remain excluded");
assert(second.obligations.some((row) => row.obligation_id === "UC-003/still"));
console.log("card-backfill source-policy v4 replay and composite fixtures: PASS");
