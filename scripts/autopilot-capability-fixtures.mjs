#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  claimTasks,
  collapseCoverage,
  emptyState,
  rankCapabilityCandidates,
  submitResults,
  syncState,
  validateCapabilityPolicy,
  validateState,
} from './lib/autopilot.mjs';

const NOW = '2026-07-23T20:00:00.000Z';
const scopes = {
  version: 1,
  scopes: [{ id: 'star-trek', label: 'Star Trek', status: 'active', priority: 1000, coverage_match: { franchise: 'Star Trek' } }],
};
const coverage = [
  { franchise: 'Star Trek', category: 'Arretans', character: 'Sargon', performer: 'James Doohan', performance_mode: 'physical-prosthetic', source: 'https://memory-alpha.fandom.com/wiki/Sargon', performer_on_wall: true, role_on_wall: false, wall_ids: [] },
  { franchise: 'Star Trek', category: 'Artificial lifeforms', character: 'Guardian of Forever', performer: 'James Doohan', performance_mode: 'physical-and-voice', source: 'https://memory-alpha.fandom.com/wiki/Guardian_of_Forever', performer_on_wall: true, role_on_wall: false, wall_ids: [] },
  { franchise: 'Star Trek', category: 'Phylosians', character: 'Agmar', performer: 'James Doohan', performance_mode: 'voice-animation', source: 'https://memory-alpha.fandom.com/wiki/Agmar', performer_on_wall: true, role_on_wall: false, wall_ids: [] },
  { franchise: 'Star Trek', category: 'Ferengi', character: 'Ishka', performer: 'Andrea Martin', performance_mode: 'physical-prosthetic', source: 'https://memory-alpha.fandom.com/wiki/Ishka', performer_on_wall: false, role_on_wall: false, wall_ids: [] },
];
const collapsed = collapseCoverage(coverage, scopes);
const sargon = collapsed.find((job) => job.character === 'Sargon');
const ishka = collapsed.find((job) => job.character === 'Ishka');
const state = syncState({ coverage, scopes, state: emptyState(), coverageSha256: 'a'.repeat(64), now: NOW }).state;

function reviewed(id, capabilities, status = 'active') {
  return {
    id,
    label: id,
    status,
    capabilities,
    note: `Reviewed fixture capability profile ${id}.`,
    reviewed_by: 'fixture-desk',
    reviewed_role: 'second-desk',
    reviewed_at: NOW,
  };
}
function policy({ sargonFingerprint = sargon.source_fingerprint, audioStatus = 'active' } = {}) {
  return {
    version: 1,
    capabilities: [{ id: 'audio-listening', description: 'Can hear and independently score a hash-bound audio sample.' }],
    profiles: [reviewed('text-vision', []), reviewed('audio-vision', ['audio-listening'], audioStatus)],
    rules: [{
      id: 'voice-performance-needs-audio',
      match: { performance_modes_any: ['physical-and-voice', 'voice-animation'] },
      requires: ['audio-listening'],
      reason: 'Voice work needs actual listening.',
      reviewed_by: 'fixture-desk', reviewed_role: 'second-desk', reviewed_at: NOW,
    }],
    task_overrides: [{
      task_id: sargon.id,
      source_fingerprint: sargonFingerprint,
      requires: ['audio-listening'],
      reason: 'Sargon is a source-reviewed disembodied voice despite the physical hint.',
      evidence: [{ type: 'source', value: coverage[0].source }],
      reviewed_by: 'fixture-desk', reviewed_role: 'second-desk', reviewed_at: NOW,
    }],
  };
}
const readiness = {
  scope_id: 'star-trek', lease_token: 'f'.repeat(64), producer_sha256: 'a'.repeat(64),
  contract_sha256: 'b'.repeat(64), coverage_sha256: 'c'.repeat(64), manifest_sha256: 'd'.repeat(64),
};

const doc = policy();
validateCapabilityPolicy(doc);
const ranked = rankCapabilityCandidates({ state, scope: 'star-trek', policy: doc, profileId: 'text-vision' });
assert.deepEqual(ranked.compatible.map((row) => row.task.character), ['Ishka']);
assert.deepEqual(new Set(ranked.incompatible.map((row) => row.task.character)), new Set(['Sargon', 'Guardian of Forever', 'Agmar']));
assert.match(ranked.policy_sha256, /^[0-9a-f]{64}$/);
assert.deepEqual(ranked.incompatible.find((row) => row.task.character === 'Sargon').missing_capabilities, ['audio-listening']);

const automatic = claimTasks({
  state, agent: 'luna', scope: 'star-trek', readiness,
  capabilityPolicy: doc, capabilityProfileId: 'text-vision', limit: 1, leaseMinutes: 60, now: NOW,
});
assert.equal(automatic.batch.tasks[0].id, ishka.id, 'the highest-priority compatible task is leased');
assert.equal(automatic.batch.selection.strategy, 'priority-compatible');
assert.equal(automatic.batch.selection.profile_id, 'text-vision');
assert.deepEqual(automatic.batch.tasks[0].required_capabilities, []);
assert.equal(automatic.state.jobs.find((job) => job.id === sargon.id).status, 'queued', 'incompatible work remains queued');
assert.equal(automatic.state.jobs.find((job) => job.id === sargon.id).attempts, 0, 'skipping a capability does not consume an attempt');
validateState(automatic.state);

assert.throws(() => claimTasks({
  state, agent: 'luna', scope: 'star-trek', readiness,
  capabilityPolicy: doc, capabilityProfileId: 'text-vision', taskId: sargon.id,
  selectionBasis: 'Reviewed proof task selection.', limit: 1, now: NOW,
}), /missing capability audio-listening/);

const reviewedSelection = claimTasks({
  state, agent: 'luna', scope: 'star-trek', readiness,
  capabilityPolicy: doc, capabilityProfileId: 'text-vision', taskId: ishka.id,
  selectionBasis: 'Select a capability-compatible physical proof task for the restart-safe cycle.', limit: 1, now: NOW,
});
assert.equal(reviewedSelection.batch.selection.strategy, 'reviewed-task');
assert.equal(reviewedSelection.batch.selection.requested_task_id, ishka.id);
assert.match(reviewedSelection.batch.selection.basis, /physical proof task/);
assert.equal(reviewedSelection.state.jobs.find((job) => job.id === ishka.id).lease.selection.profile_id, 'text-vision');

const tampered = structuredClone(reviewedSelection.batch);
tampered.selection.profile_id = 'audio-vision';
assert.throws(() => submitResults({
  state: reviewedSelection.state,
  batch: tampered,
  resultsDoc: {
    version: 1, lease_id: tampered.lease_id, agent: tampered.agent,
    results: [{ task_id: ishka.id, decision: 'reject', reason: 'Fixture rejection with a complete and specific reason.', evidence: [{ label: 'source', source: coverage[3].source }] }],
  },
  drafts: [], now: '2026-07-23T21:00:00.000Z',
}), /capability selection does not match/);

const audio = claimTasks({
  state, agent: 'audio-luna', scope: 'star-trek', readiness,
  capabilityPolicy: doc, capabilityProfileId: 'audio-vision', limit: 1, now: NOW,
});
assert.equal(audio.batch.tasks[0].character, 'Sargon');
assert.deepEqual(audio.batch.tasks[0].required_capabilities, ['audio-listening']);

const staleRanked = rankCapabilityCandidates({ state, scope: 'star-trek', policy: policy({ sargonFingerprint: '0'.repeat(64) }), profileId: 'audio-vision' });
const staleSargon = staleRanked.incompatible.find((row) => row.task.id === sargon.id);
assert.equal(staleSargon.attention.code, 'stale-task-capability-review');
assert.deepEqual(staleSargon.missing_capabilities, []);

assert.throws(() => rankCapabilityCandidates({ state, scope: 'star-trek', policy: policy({ audioStatus: 'paused' }), profileId: 'audio-vision' }), /is paused/);
const invalid = policy();
invalid.rules[0].requires = ['invented-capability'];
assert.throws(() => validateCapabilityPolicy(invalid), /unknown capability/);

console.log('PASS — capability profiles skip incompatible tasks without mutating debt, bind reviewed selections, reject stale overrides, and protect lease provenance');
