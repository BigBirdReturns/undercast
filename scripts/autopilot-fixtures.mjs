#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  claimTasks,
  collapseCoverage,
  completeReviews,
  emptyState,
  stableTaskId,
  submitResults,
  syncState,
  validateState,
} from "./lib/autopilot.mjs";

const T0 = "2026-07-21T12:00:00.000Z";
const T1 = "2026-07-21T13:00:00.000Z";
const T2 = "2026-07-21T16:00:00.000Z";
const T3 = "2026-07-21T17:00:00.000Z";
const scopes = {
  version: 1,
  scopes: [
    { id: "star-trek", label: "Star Trek", status: "active", priority: 1000, coverage_match: { franchise: "Star Trek" } },
    { id: "doctor-who", label: "Doctor Who", status: "active", priority: 100, coverage_match: { franchise: "Doctor Who" } },
  ],
};

const manifestV1 = {
  observations: [{
    franchise: "Star Trek", category: "Ferengi", title: "Brunt",
    source: "https://memory-alpha.fandom.com/wiki/Brunt", pageid: 10, revision: 100,
    timestamp: "2026-07-20T00:00:00Z", content_sha256: "1".repeat(64),
  }],
};
const manifestV2 = {
  observations: [{ ...manifestV1.observations[0], revision: 101, content_sha256: "2".repeat(64) }],
};

const coverage = [
  { franchise: "Star Trek", category: "Ferengi", character: "Brunt", performer: "Jeffrey Combs", performance_mode: "physical-prosthetic", source: "https://memory-alpha.fandom.com/wiki/Brunt", performer_on_wall: true, role_on_wall: false, wall_ids: [] },
  { franchise: "Star Trek", category: "Individuals", character: "Brunt", performer: "Jeffrey Combs", performance_mode: "physical-prosthetic", source: "https://memory-alpha.fandom.com/wiki/Brunt", performer_on_wall: true, role_on_wall: false, wall_ids: [] },
  { franchise: "Star Trek", category: "Vorta", character: "Weyoun", performer: "Jeffrey Combs", performance_mode: "physical-prosthetic", source: "https://memory-alpha.fandom.com/wiki/Weyoun", performer_on_wall: true, role_on_wall: true, wall_ids: ["UC-004"] },
  { franchise: "Star Trek", category: "Holograms", character: "The Clown", performer: "Michael McKean", performance_mode: "physical-prosthetic", source: "https://memory-alpha.fandom.com/wiki/Clown", performer_on_wall: false, role_on_wall: false, wall_ids: [] },
  { franchise: "Doctor Who", category: "Daleks", character: "Black Dalek Interrogator", performer: "Fourth Cyber Legion", performance_mode: "unresolved", source: "https://tardis.fandom.com/wiki/Black_Dalek_Interrogator", performer_on_wall: false, role_on_wall: false, wall_ids: [] },
  { franchise: "Doctor Who", category: "Actors", character: "—", performer: "Nicholas Briggs", performance_mode: "voice-animation", source: "https://tardis.fandom.com/wiki/Nicholas_Briggs", performer_on_wall: false, role_on_wall: false, wall_ids: [] },
];

const collapsed = collapseCoverage(coverage, scopes, manifestV1);
assert.equal(collapsed.length, 5, "duplicate categories collapse into one performer-role task");
const bruntId = stableTaskId(coverage[0]);
const brunt = collapsed.find((job) => job.id === bruntId);
assert.deepEqual(brunt.categories, ["Ferengi", "Individuals"]);
assert.equal(brunt.scope, "star-trek");
assert.equal(brunt.source_receipts[0].revision, 100, "manifest revision receipts attach to exact source URLs");
assert.equal(brunt.queueable, true);
assert.equal(collapsed.find((job) => job.performer === "Fourth Cyber Legion").queueable, false, "non-person-shaped source extraction is quarantined");
assert.equal(collapsed.find((job) => job.performer === "Nicholas Briggs").queueable, false, "performer-only rows without a role are not drafted");

const first = syncState({ coverage, scopes, state: emptyState(), coverageSha256: "a".repeat(64), now: T0 });
assert.equal(first.changed, true);
assert.equal(first.state.jobs.find((job) => job.character === "Weyoun").status, "resolved");
assert.equal(first.state.jobs.find((job) => job.performer === "Fourth Cyber Legion").status, "attention");
validateState(first.state);

const stable = syncState({ coverage, scopes, state: first.state, coverageSha256: "a".repeat(64), now: T1 });
assert.equal(stable.changed, false, "unchanged coverage produces byte-stable state");
assert.equal(stable.state.updated_at, T0, "no-op sync does not churn updated_at");

const claimed = claimTasks({ state: first.state, agent: "luna", scope: "star-trek", limit: 2, leaseMinutes: 60, now: T1 });
assert.ok(claimed.batch);
assert.equal(claimed.batch.tasks.length, 2);
assert.ok(claimed.batch.tasks.every((task) => task.attempt === 1), "batch reports the persisted attempt number");
assert.ok(claimed.batch.tasks.every((task) => task.scope === "star-trek"));
assert.equal(new Set(claimed.batch.tasks.map((task) => task.id)).size, 2);
const claimedAgain = claimTasks({ state: claimed.state, agent: "luna-2", scope: "star-trek", limit: 10, leaseMinutes: 60, now: T1 });
assert.equal(claimedAgain.batch, null, "leased tasks cannot be claimed twice");
assert.equal(claimedAgain.reason, "inflight");

const incomplete = {
  version: 1,
  lease_id: claimed.batch.lease_id,
  agent: "luna",
  results: [{ task_id: claimed.batch.tasks[0].id, decision: "reject", reason: "not actually a qualifying designed-face performance", evidence: [{ label: "performance context", source: claimed.batch.tasks[0].sources[0] }] }],
};
assert.throws(() => submitResults({ state: claimed.state, batch: claimed.batch, resultsDoc: incomplete, drafts: [], now: T2 }), /incomplete/);

const bruntTask = claimed.batch.tasks.find((task) => task.character === "Brunt");
const clownTask = claimed.batch.tasks.find((task) => task.character === "The Clown");
const validResults = {
  version: 1,
  lease_id: claimed.batch.lease_id,
  agent: "luna",
  results: [
    {
      task_id: bruntTask.id,
      decision: "draft",
      draft: {
        character: "Brunt",
        actor: "Jeffrey Combs",
        production: "Star Trek: Deep Space Nine",
        universe: "Star Trek",
        years: "1995–99",
        designer: "Michael Westmore",
        transform: 5,
        kind: "face",
        knownFor: "A liquidator of the Ferengi Commerce Authority.",
        reveal: "Jeffrey Combs disappears beneath the Ferengi appliances. The role is distinct from his other Star Trek faces.",
        references: [{ claim: "performance", label: "Jeffrey Combs portrayed Brunt", source: bruntTask.sources[0] }],
        wiki: "https://en.wikipedia.org/wiki/Jeffrey_Combs",
      },
    },
    {
      task_id: clownTask.id,
      decision: "blocked",
      reason: "The exact designer credit still needs a claim-level source before this card can be filed.",
      evidence: [{ label: "performer-role source", source: clownTask.sources[0] }],
      until_source_changes: true,
    },
  ],
};
const submitted = submitResults({ state: claimed.state, batch: claimed.batch, resultsDoc: validResults, drafts: [], now: T2 });
assert.equal(submitted.state.jobs.find((job) => job.id === bruntTask.id).status, "drafted");
assert.equal(submitted.state.jobs.find((job) => job.id === clownTask.id).status, "blocked");
assert.equal(submitted.drafts.length, 1);
assert.equal(submitted.drafts[0]._autopilot.task_id, bruntTask.id);
validateState(submitted.state);
const blockedByPendingDraft = claimTasks({ state: submitted.state, agent: "luna-2", scope: "star-trek", limit: 1, now: T3 });
assert.equal(blockedByPendingDraft.reason, "inflight", "a pending draft applies backpressure before another batch");

const pendingDraft = syncState({
  coverage, scopes, state: submitted.state, coverageSha256: "a".repeat(64),
  drafts: submitted.drafts, specimens: [], growthRejections: [], now: T3,
});
assert.equal(pendingDraft.state.jobs.find((job) => job.id === bruntTask.id).status, "drafted", "tagged pending drafts survive reconciliation");

const acceptedDraft = syncState({
  coverage, scopes, state: submitted.state, coverageSha256: "a".repeat(64),
  drafts: [], specimens: [{ id: "UC-999", actor: "Jeffrey Combs", character: "Brunt" }], growthRejections: [], now: T3,
});
const acceptedBrunt = acceptedDraft.state.jobs.find((job) => job.id === bruntTask.id);
assert.equal(acceptedBrunt.status, "merged", "an exact canonical specimen advances a draft to post-merge review even before census coverage refreshes");
assert.deepEqual(acceptedBrunt.wall_ids, ["UC-999"]);

const sourceLedger = [{
  id: "UC-999", actor: "Jeffrey Combs", character: "Brunt", universe: "Star Trek", fetched_at: "2026-07-21",
  still: { origin: "https://memory-alpha.fandom.com/wiki/File:Brunt.jpg", src: "images/uc-999-still.jpg", kind: "still" },
  portrait: { origin: "https://commons.wikimedia.org/wiki/File:Jeffrey_Combs.jpg", src: "images/uc-999-portrait.jpg", kind: "free" },
}];
const mediaReview = {
  version: 1, reviewed_by: "luna", lease_id: claimed.batch.lease_id, reviews: [{
    task_id: bruntTask.id, records: [{
      wall_id: "UC-999",
      still: { disposition: "verified", subject: "Brunt", source: sourceLedger[0].still.origin, note: "The frame visibly shows Brunt in the Ferengi appliances." },
      portrait: { disposition: "verified", subject: "Jeffrey Combs", source: sourceLedger[0].portrait.origin, note: "The portrait visibly shows Jeffrey Combs and no other subject." },
    }],
  }],
};
const completed = completeReviews({ state: acceptedDraft.state, reviewDoc: mediaReview, sourceLedger, corpusSha256: "e".repeat(64), now: T3 });
assert.equal(completed.state.jobs.find((job) => job.id === bruntTask.id).status, "resolved", "post-merge visual receipt closes the task");
assert.equal(completed.state.jobs.find((job) => job.id === bruntTask.id).outcome.kind, "audited-wall");
const wrongSubjectReview = structuredClone(mediaReview);
wrongSubjectReview.reviews[0].records[0].portrait.subject = "The Orion constellation";
assert.throws(() => completeReviews({ state: acceptedDraft.state, reviewDoc: wrongSubjectReview, sourceLedger, corpusSha256: "e".repeat(64), now: T3 }), /portrait subject must be Jeffrey Combs/);

const rejectedDraft = syncState({
  coverage, scopes, state: submitted.state, coverageSha256: "a".repeat(64), drafts: [], specimens: [],
  growthRejections: [{
    ts: T3, actor: "grow.mjs@0.1", op: "draft.reject", reason: "unverified on Wikipedia",
    actor_name: "Jeffrey Combs", character: "Brunt", wiki: "",
  }],
  now: T3,
});
assert.equal(rejectedDraft.state.jobs.find((job) => job.id === bruntTask.id).status, "blocked", "grow rejection receipts close the drafted limbo state");

const orphanRecovered = syncState({
  coverage, scopes, state: emptyState(), coverageSha256: "a".repeat(64), drafts: submitted.drafts, specimens: [], growthRejections: [], now: T3,
});
const recoveredBrunt = orphanRecovered.state.jobs.find((job) => job.id === bruntTask.id);
assert.equal(recoveredBrunt.status, "drafted", "sync recovers a tagged draft written before state after a crash");
assert.equal(recoveredBrunt.outcome.lease_id, claimed.batch.lease_id, "crash recovery preserves the originating lease for media closure");

const wrongRole = structuredClone(validResults);
wrongRole.results[0].draft.character = "Weyoun";
assert.throws(() => submitResults({ state: claimed.state, batch: claimed.batch, resultsDoc: wrongRole, drafts: [], now: T2 }), /must match leased role/);

const expired = claimTasks({ state: claimed.state, agent: "luna-3", scope: "doctor-who", limit: 1, leaseMinutes: 5, now: T1 });
assert.equal(expired.batch, null, "attention rows remain non-claimable");

const receiptState = syncState({ coverage, scopes, manifest: manifestV1, state: emptyState(), coverageSha256: "d".repeat(64), now: T0 });
const receiptRejected = structuredClone(receiptState.state);
const receiptBrunt = receiptRejected.jobs.find((job) => job.id === bruntId);
receiptBrunt.status = "rejected";
receiptBrunt.outcome = { kind: "rejection", source_fingerprint: receiptBrunt.source_fingerprint };
const receiptReopened = syncState({ coverage, scopes, manifest: manifestV2, state: receiptRejected, coverageSha256: "d".repeat(64), now: T3 });
assert.equal(receiptReopened.state.jobs.find((job) => job.id === bruntId).status, "queued", "same URL with a changed pinned revision reopens a prior decision");

const changedCoverage = coverage.map((row) => row.character === "The Clown" ? { ...row, source: "https://memory-alpha.fandom.com/wiki/Clown?oldid=2" } : row);
const rejectedState = structuredClone(first.state);
const clownJob = rejectedState.jobs.find((job) => job.character === "The Clown");
clownJob.status = "rejected";
clownJob.outcome = { kind: "rejection", source_fingerprint: clownJob.source_fingerprint };
const reopened = syncState({ coverage: changedCoverage, scopes, state: rejectedState, coverageSha256: "b".repeat(64), now: T2 });
assert.equal(reopened.state.jobs.find((job) => job.character === "The Clown").status, "queued", "changed evidence reopens a prior rejection");

const retiredCoverage = coverage.filter((row) => row.character !== "The Clown");
const retired = syncState({ coverage: retiredCoverage, scopes, state: first.state, coverageSha256: "c".repeat(64), now: T2 });
assert.equal(retired.state.jobs.find((job) => job.character === "The Clown").status, "retired", "tasks never silently disappear");
const returned = syncState({ coverage, scopes, state: retired.state, coverageSha256: "a".repeat(64), now: T3 });
assert.equal(returned.state.jobs.find((job) => job.character === "The Clown").status, "queued", "a task returning to coverage reopens even when its source fingerprint is unchanged");

console.log("PASS — autopilot queue, lease, submission, media closure, source-change, and retirement fixtures");
