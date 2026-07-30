#!/usr/bin/env node
import assert from "node:assert/strict";
import { promoteBoundedOpenWebObligations, BOUNDED_OPEN_WEB_ROUTE } from "./lib/card-backfill-bounded-open-web.mjs";

const base = {
  version: 1,
  campaign_id: "fixture",
  estate_sha256: "a".repeat(64),
  obligations: [
    {
      obligation_id: "UC-001/still", wall_id: "UC-001", side: "still", expected_subject: "Fixture",
      shape: { side: "still", performance_mode: "physical-or-live-action", source_route: "open-web-exception", evidence_tier: "canonical-link-only", render_profile: "character-depiction" },
      cohort_key: "still::physical-or-live-action::open-web-exception::canonical-link-only::character-depiction",
      disposition: "quarantine", quarantine_reasons: ["no-bounded-still-source-route"], canonical_mutation: false,
    },
    {
      obligation_id: "UC-002/still", wall_id: "UC-002", side: "still", expected_subject: "Blocked",
      shape: { side: "still", performance_mode: "physical-or-live-action", source_route: "open-web-exception", evidence_tier: "unbound", render_profile: "character-depiction" },
      cohort_key: "still::physical-or-live-action::open-web-exception::unbound::character-depiction",
      disposition: "quarantine", quarantine_reasons: ["no-bounded-still-source-route", "no-independent-role-or-identity-evidence"], canonical_mutation: false,
    },
  ],
};
const result = promoteBoundedOpenWebObligations(base);
assert.equal(result.counts.promoted_ready, 1);
assert.equal(result.counts.residual_quarantine, 1);
assert.equal(result.obligations[0].shape.source_route, BOUNDED_OPEN_WEB_ROUTE);
assert.equal(result.obligations[0].disposition, "ready");
assert.deepEqual(result.obligations[0].quarantine_reasons, []);
assert.equal(result.obligations[0].source_policy.source_host, "en.wikipedia.org");
assert.equal(result.obligations[0].source_policy.search_result_limit, 8);
assert.match(result.obligations[0].scope_sha256, /^[0-9a-f]{64}$/);
assert.equal(result.cohorts.length, 1);
console.log("card-backfill bounded open-web fixtures: PASS");
