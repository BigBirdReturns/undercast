#!/usr/bin/env node
import assert from "node:assert/strict";
import { deriveCorpusStatus, nextEstate, validateCorpusOperations } from "./lib/corpus-operations.mjs";

const operations = {
  version: 1,
  schema: "schema/corpus-operations.schema.json",
  mode: "collection-only",
  product_freeze: {
    status: "active",
    allowed_change_classes: ["corpus-addition", "source-refresh", "evidence-improvement", "media-search", "media-correction", "correction", "rights", "preservation", "adapter-build", "adapter-certification", "operations", "security", "accessibility", "performance"],
    owner_decision_required: ["new-reader-surface"],
  },
  loops: ["incident-and-correction", "source-refresh", "bounded-growth", "media-improvement", "lead-harvest", "estate-induction"].map((id, index) => ({ id, priority: 1000 - index, authority: "reviewed", cadence: "rolling", terminal_condition: "A specific reviewed terminal condition exists." })),
  quality_policy: {
    max_growth_lease: 8,
    never_overwrite_verified_media_automatically: true,
    candidate_media_is_noncanonical: true,
    media_promotion_requires_hash_bound_review: true,
    unknown_is_null_not_zero: true,
    source_failure_may_not_publish_zero: true,
  },
  estate_pipeline: {
    stages: ["discovered", "inventory", "adapter-build", "adapter-review", "certified-paused", "active", "retired"],
    parallel_active_estates: 1,
    next_estate_requires_completed_milestones: ["star-trek-gold-shard", "operational-reliability"],
  },
};

function fixture() {
  return {
    operations,
    operationsState: { version: 1, mode: "collection-only", exceptions: [] },
    registry: { estates: [
      { id: "star-trek", label: "Star Trek", stage: "active", scope_id: "star-trek", priority: 1000, sources: ["https://example.test/api"], next_gate: "Finish the current reviewed reference estate." },
      { id: "doctor-who", label: "Doctor Who", stage: "adapter-review", scope_id: "doctor-who", priority: 900, sources: ["https://example.test/api2"], next_gate: "Complete adapter review before certification." },
    ] },
    scopes: { scopes: [
      { id: "star-trek", label: "Star Trek", status: "active", refresh: { cadence_days: 7 } },
      { id: "doctor-who", label: "Doctor Who", status: "paused", refresh: { cadence_days: 30 } },
    ] },
    certifications: { certifications: [{ scope_id: "star-trek", certified_at: "2026-07-24T00:00:00.000Z" }] },
    autopilot: { jobs: [{ id: "a", scope: "star-trek", status: "queued" }] },
    mediaAudit: { items: [{ id: "m", scope: "star-trek", status: "verified" }] },
    mediaSearch: { version: 1, attempts: [] },
    waterline: { cycles: [], incidents: [] },
    roadmap: { completed: [{ milestone: "trusted-foundation" }] },
    workflows: {
      nightly: "node scripts/ingest.mjs\nlead queue",
      retrieve: "node scripts/media-search.mjs search\nuses: actions/upload-artifact@v4",
      autopilot: "npm run autopilot -- refresh --due",
    },
  };
}

const valid = fixture();
assert.deepEqual(validateCorpusOperations(valid), []);

const bypass = fixture();
bypass.workflows.nightly += "\nnode scripts/grow.mjs\nANTHROPIC_API_KEY";
assert(validateCorpusOperations(bypass).some((error) => error.includes("direct model growth")));

const uncertified = fixture();
uncertified.certifications.certifications = [];
assert(validateCorpusOperations(uncertified).some((error) => error.includes("lacks a producer certification")));

const mediaDebt = fixture();
mediaDebt.mediaAudit.items[0].status = "review";
assert.equal(deriveCorpusStatus(mediaDebt, { waterlineStatus: { claim_allowed: true } }).current_operation, "media-catch-up");

const inFlight = fixture();
inFlight.autopilot.jobs[0].status = "merged";
assert.equal(deriveCorpusStatus(inFlight, { waterlineStatus: { claim_allowed: true } }).current_operation, "finish-current-cycle");

const due = fixture();
due.certifications.certifications[0].certified_at = "2026-06-01T00:00:00.000Z";
assert.equal(deriveCorpusStatus(due, { now: new Date("2026-07-24T00:00:00.000Z"), waterlineStatus: { claim_allowed: true } }).current_operation, "source-refresh");

const growth = fixture();
assert.equal(deriveCorpusStatus(growth, { waterlineStatus: { claim_allowed: true } }).current_operation, "bounded-growth");

const estate = nextEstate(fixture());
assert.equal(estate.authorized, false);
assert.equal(estate.estate.id, "doctor-who");
assert.deepEqual(estate.missing_milestones, ["star-trek-gold-shard", "operational-reliability"]);

console.log("corpus-operations fixtures: PASS");
