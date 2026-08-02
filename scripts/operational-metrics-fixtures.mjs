#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  measureBuildP95,
  measureCostPerVerifiedRecord,
  measureRightsResponse,
  measureSourceFreshness,
  nearestRankPercentile,
} from "./operational-metrics.mjs";

assert.equal(nearestRankPercentile([1, 2, 3, 4, 5], 0.95), 5);
assert.equal(nearestRankPercentile([5, 1, 3, 2, 4], 0.5), 3);

const builds = [60_000, 61_000, 62_000, 63_000, 64_000].map((duration, index) => ({
  id: `build-${index + 1}`,
  started_at: new Date(Date.UTC(2026, 7, 1, 0, 0, index * 2)).toISOString(),
  completed_at: new Date(Date.UTC(2026, 7, 1, 0, 0, index * 2) + duration).toISOString(),
  duration_ms: duration,
  gate_exit_code: 0,
  exact_head: true,
  rendered_browser: true,
  target_head: "a".repeat(40),
}));
const build = measureBuildP95(builds);
assert.equal(build.status, "measured");
assert.equal(build.population, 5);
assert.equal(build.p95_ms, 64_000);
assert.equal(build.value, 1.066667);
assert.equal(measureBuildP95(builds.slice(0, 4)).status, "insufficient-population");
assert.throws(() => measureBuildP95([{ ...builds[0], exact_head: false }, ...builds.slice(1)]), /not exact-head/);
assert.throws(() => measureBuildP95([{ ...builds[0], target_head: "b".repeat(40) }, ...builds.slice(1)]), /multiple target heads/);

const manifest = {
  observations: [
    {
      franchise: "Star Trek", category: "Ferengi", title: "Quark", source: "https://memory-alpha.fandom.com/wiki/Quark",
      observed_at: "2026-07-30T00:00:00Z", pageid: 1, revision: 10, timestamp: "2026-07-01T00:00:00Z",
      content_sha256: "1".repeat(64), disposition: "credited",
    },
    {
      franchise: "Star Trek", category: "Officials", title: "Quark", source: "https://memory-alpha.fandom.com/wiki/Quark",
      observed_at: "2026-07-31T00:00:00Z", pageid: 1, revision: 10, timestamp: "2026-07-01T00:00:00Z",
      content_sha256: "1".repeat(64), disposition: "credited",
    },
    {
      franchise: "Star Trek", category: "Ferengi", title: "Rom", source: "https://memory-alpha.fandom.com/wiki/Rom",
      observed_at: "2026-07-28T00:00:00Z", pageid: 2, revision: 20, timestamp: "2026-07-02T00:00:00Z",
      content_sha256: "2".repeat(64), disposition: "credited",
    },
    {
      franchise: "Muppets & Henson", category: "Muppets", title: "Kermit", source: "https://muppet.fandom.com/wiki/Kermit_the_Frog",
      observed_at: "2020-01-01T00:00:00Z", pageid: 3, revision: 30, timestamp: "2020-01-01T00:00:00Z",
      content_sha256: "3".repeat(64), disposition: "credited",
    },
  ],
};
const freshness = measureSourceFreshness(manifest, { franchise: "Star Trek", asOf: "2026-08-01T00:00:00Z" });
assert.equal(freshness.status, "measured");
assert.equal(freshness.population, 2);
assert.equal(freshness.minimum_days, 1);
assert.equal(freshness.maximum_days, 4);
assert.equal(freshness.value, 4);
assert.throws(() => measureSourceFreshness({ observations: [{ ...manifest.observations[0], observed_at: "2026-08-02T00:00:00Z" }] }, { franchise: "Star Trek", asOf: "2026-08-01T00:00:00Z" }), /future/);

const emptyCost = measureCostPerVerifiedRecord({ version: 1, observations: [] });
assert.equal(emptyCost.status, "no-observations");
assert.equal(emptyCost.value, null);
const cost = measureCostPerVerifiedRecord({
  version: 1,
  observations: [
    { id: "invoice-1", at: "2026-08-01T00:00:00Z", currency: "USD", direct_cost_usd: 12, verified_records: 3, evidence: [{ type: "invoice", value: "invoice-1" }] },
    { id: "invoice-2", at: "2026-08-02T00:00:00Z", currency: "USD", direct_cost_usd: 8, verified_records: 2, evidence: [{ type: "receipt", value: "receipt-2" }] },
  ],
});
assert.equal(cost.status, "measured");
assert.equal(cost.value, 4);
assert.throws(() => measureCostPerVerifiedRecord({ version: 1, observations: [{ id: "bad", at: "2026-08-01T00:00:00Z", currency: "USD", direct_cost_usd: 0, verified_records: 0, evidence: [{ type: "invoice", value: "bad" }] }] }), /positive integer/);

const emptyRights = measureRightsResponse({ version: 1, cases: [] });
assert.equal(emptyRights.status, "no-observations");
assert.equal(emptyRights.value, null);
const rights = measureRightsResponse({
  version: 1,
  cases: [
    { id: "case-1", case_type: "exercise", opened_at: "2026-08-01T00:00:00Z", first_response_at: "2026-08-01T12:00:00Z", evidence: [{ type: "issue", value: "case-1" }] },
    { id: "case-2", case_type: "real", opened_at: "2026-08-01T00:00:00Z", first_response_at: "2026-08-03T00:00:00Z", evidence: [{ type: "email", value: "case-2" }] },
  ],
});
assert.equal(rights.status, "measured");
assert.equal(rights.value, 2);
assert.equal(rights.p95_days, 2);
assert.throws(() => measureRightsResponse({ version: 1, cases: [{ id: "bad", case_type: "real", opened_at: "2026-08-02T00:00:00Z", first_response_at: "2026-08-01T00:00:00Z", evidence: [{ type: "email", value: "bad" }] }] }), /before opening/);

console.log("PASS — operational metric populations, p95s, evidence ledgers, and null-preserving boundaries are deterministic");
