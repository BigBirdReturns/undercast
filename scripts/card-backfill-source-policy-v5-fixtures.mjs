#!/usr/bin/env node
import assert from "node:assert/strict";
import { evaluateSourceCandidate } from "./lib/card-backfill-source-policy-v3.mjs";
import { buildSourcePolicyV5Estate, CARD_BACKFILL_SOURCE_POLICY_V5 } from "./lib/card-backfill-source-policy-v5.mjs";

const context = {
  side: "still",
  expectedSubject: "Recovery Character",
  actor: "Recovery Actor",
  production: "Galactic Archive",
  performanceMode: "voice-or-animation",
  actorEvidence: {
    character_windows: ["Recovery Actor voiced Recovery Character in Galactic Archive."],
    production_windows: ["Recovery Actor voiced Recovery Character in Galactic Archive."],
  },
  candidate: {
    method: "mediawiki-pageimage-v4",
    file: "Lead image.jpg",
    page: { title: "Recovery Character", extract_windows: ["Recovery Character is a fictional character."] },
    source: { description: "", categories: "" },
  },
};
const v4 = evaluateSourceCandidate({ ...context, sourcePolicyVersion: 4 });
assert.equal(v4.eligible, false);
assert(v4.reasons.includes("candidate-file-lacks-filed-production-context"));
const v5 = evaluateSourceCandidate({ ...context, sourcePolicyVersion: 5 });
assert.equal(v5.eligible, true);
assert.equal(v5.facts.two_source_recovery, true);
assert.equal(v5.facts.source_policy_version, 5);

const estate = {
  campaign_id: "fixture",
  estate_sha256: "a".repeat(64),
  obligations: [
    {
      obligation_id: "UC-001/still", wall_id: "UC-001", side: "still", expected_subject: "Recovery Character", disposition: "ready", quarantine_reasons: [],
      shape: { side: "still", performance_mode: "voice-or-animation", source_route: "franchise-mediawiki", evidence_tier: "canonical-link-only", render_profile: "character-depiction" },
      cohort_key: "legacy", canonical_mutation: false,
    },
    {
      obligation_id: "UC-002/still", wall_id: "UC-002", side: "still", expected_subject: "One & Two", disposition: "ready", quarantine_reasons: [],
      shape: { side: "still", performance_mode: "voice-or-animation", source_route: "franchise-mediawiki", evidence_tier: "canonical-link-only", render_profile: "character-depiction" },
      cohort_key: "legacy-composite", canonical_mutation: false,
    },
  ],
};
const v4Attempt = { source_policy_id: "card-backfill-policy-v4-exact-pageimage-1", source_policy_version: 4, cohort_key: "still::voice-or-animation::mediawiki-bound-multicandidate-v4::canonical-link-only::character-depiction", final_disposition: "quarantine" };
let built = buildSourcePolicyV5Estate({ estate, attemptIndex: { entries: [
  { obligation_id: "UC-001/still", attempts: [v4Attempt] },
  { obligation_id: "UC-002/still", attempts: [v4Attempt] },
] } });
assert.equal(built.counts.ready, 1);
assert.equal(built.obligations[0].source_policy_version, 5);
assert.equal(built.obligations[0].source_policy_id, CARD_BACKFILL_SOURCE_POLICY_V5.policy_id);
assert(built.exclusions.some((row) => row.obligation_id === "UC-002/still" && row.reason === "multi-subject-composite-required"));

built = buildSourcePolicyV5Estate({ estate, attemptIndex: { entries: [
  { obligation_id: "UC-001/still", attempts: [v4Attempt, { ...v4Attempt, source_policy_version: 5, source_policy_id: CARD_BACKFILL_SOURCE_POLICY_V5.policy_id }] },
] } });
assert.equal(built.counts.ready, 0);
assert(built.exclusions.some((row) => row.reason === "source-policy-v5-already-attempted"));
console.log("card-backfill source-policy v5 fixtures: PASS — exact subject pageimage plus independent role custody recovers production context; composites remain isolated");
