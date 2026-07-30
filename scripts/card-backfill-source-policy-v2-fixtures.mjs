#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildSourcePolicyV2Estate, CARD_BACKFILL_SOURCE_POLICY_V2 } from "./lib/card-backfill-source-policy-v2.mjs";

const estate = {
  version: 1,
  campaign_id: "fixture",
  estate_sha256: "a".repeat(64),
  obligations: [
    {
      obligation_id: "UC-001/still", wall_id: "UC-001", side: "still", disposition: "ready", quarantine_reasons: [],
      shape: { side: "still", performance_mode: "physical-or-live-action", source_route: "franchise-mediawiki", evidence_tier: "canonical-link-only", render_profile: "character-depiction" },
      cohort_key: "old-still", canonical_mutation: false,
    },
    {
      obligation_id: "UC-002/portrait", wall_id: "UC-002", side: "portrait", disposition: "ready", quarantine_reasons: [],
      shape: { side: "portrait", performance_mode: "voice-or-animation", source_route: "performer-reference-crawl", evidence_tier: "canonical-link-only", render_profile: "neutral-human" },
      cohort_key: "old-portrait", canonical_mutation: false,
    },
    {
      obligation_id: "UC-003/still", wall_id: "UC-003", side: "still", disposition: "quarantine", quarantine_reasons: ["no-bounded-still-source-route"],
      shape: { side: "still", performance_mode: "voice-or-animation", source_route: "open-web-exception", evidence_tier: "canonical-link-only", render_profile: "character-depiction" },
      cohort_key: "old-open", canonical_mutation: false,
    },
    {
      obligation_id: "UC-004/still", wall_id: "UC-004", side: "still", disposition: "quarantine", quarantine_reasons: ["no-bounded-still-source-route", "nonstandard-audit-risk"],
      shape: { side: "still", performance_mode: "physical-or-live-action", source_route: "open-web-exception", evidence_tier: "canonical-link-only", render_profile: "character-depiction" },
      cohort_key: "blocked", canonical_mutation: false,
    },
  ],
};
const attemptIndex = {
  entries: [
    { obligation_id: "UC-001/still", attempts: [{ cohort_key: "old-still", final_disposition: "quarantine" }] },
    { obligation_id: "UC-002/portrait", attempts: [{ cohort_key: "old-portrait", final_disposition: "quarantine" }] },
    { obligation_id: "UC-003/still", attempts: [{ cohort_key: "still::voice-or-animation::bounded-wikipedia-character-search::canonical-link-only::character-depiction", final_disposition: "quarantine" }] },
    { obligation_id: "UC-004/still", attempts: [{ cohort_key: "blocked", final_disposition: "quarantine" }] },
  ],
};
const first = buildSourcePolicyV2Estate({ estate, attemptIndex, stagedObligationIds: [] });
assert.equal(first.counts.ready, 3);
assert.equal(first.obligations.find((row) => row.obligation_id === "UC-001/still").shape.source_route, CARD_BACKFILL_SOURCE_POLICY_V2.still_route);
assert.equal(first.obligations.find((row) => row.obligation_id === "UC-002/portrait").shape.source_route, CARD_BACKFILL_SOURCE_POLICY_V2.portrait_route);
assert(first.obligations.some((row) => row.obligation_id === "UC-003/still"));
assert(!first.obligations.some((row) => row.obligation_id === "UC-004/still"));

const secondAttemptIndex = {
  entries: attemptIndex.entries.map((row) => row.obligation_id === "UC-001/still"
    ? { ...row, attempts: [...row.attempts, { cohort_key: `still::physical-or-live-action::${CARD_BACKFILL_SOURCE_POLICY_V2.still_route}::canonical-link-only::character-depiction`, source_policy_version: 2, final_disposition: "quarantine" }] }
    : row),
};
const second = buildSourcePolicyV2Estate({ estate, attemptIndex: secondAttemptIndex, stagedObligationIds: ["UC-002/portrait"] });
assert(!second.obligations.some((row) => row.obligation_id === "UC-001/still"), "policy v2 may not repeat itself silently");
assert(!second.obligations.some((row) => row.obligation_id === "UC-002/portrait"), "staged obligations remain excluded");
assert(second.obligations.some((row) => row.obligation_id === "UC-003/still"));
console.log("card-backfill source-policy v2 fixtures: PASS");
