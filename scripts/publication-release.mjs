import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build, inventory, verifyArtifact, payloadManifest } from './publication.mjs';
import { sha256, stableJson } from './lib/preservation.mjs';

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `release Git identity unavailable: ${result.error?.message || result.stderr}`);
  return result.stdout.trim();
}
function checkout(root) {
  assert.equal(git(root, ['status', '--porcelain', '--untracked-files=all']), '', 'release requires an exact clean checkout');
  return { commit: git(root, ['rev-parse', 'HEAD']), tree: git(root, ['rev-parse', 'HEAD^{tree}']) };
}
export function beginRelease(root, { from, skipRendered }) {
  assert.ok(!from && !skipRendered, 'partial diagnostics cannot create a release receipt');
  // Invalidate old receipts before any gate work, including a failed rerun.
  for (const file of ['.ci/release-identity.json', '.ci/release-run.json']) {
    const target = path.join(root, file);
    if (fs.existsSync(target)) { assert.ok(fs.lstatSync(target).isFile() && !fs.lstatSync(target).isSymbolicLink()); fs.unlinkSync(target); }
  }
  const source = inventory(root);
  return { ...checkout(root), input_sha256: sha256(stableJson(source.inputs)) };
}
export function finishRelease(root, initial, steps) {
  assert.deepEqual(checkout(root), { commit: initial.commit, tree: initial.tree }, 'checkout changed during gate');
  const output = path.join(root, '.ci/pages');
  assert.ok(!fs.existsSync(output), 'release output must be absent');
  const identity = build(root, output);
  assert.equal(identity.input_sha256, initial.input_sha256, 'gated inputs changed');
  assert.deepEqual(checkout(root), { commit: initial.commit, tree: initial.tree }, 'checkout changed during packaging');
  verifyArtifact(output, identity);
  const receipt = { version: 1, gate: 'complete', commit: initial.commit, tree: initial.tree, input_sha256: identity.input_sha256, media_sha256: identity.media_sha256, payload_sha256: identity.payload_sha256, steps };
  fs.writeFileSync(path.join(output, 'release.json'), `${stableJson(receipt)}\n`);
  const envelope = { ...receipt, identity, receipt_sha256: sha256(stableJson(receipt)) };
  fs.writeFileSync(path.join(root, '.ci/release-identity.json'), `${stableJson(envelope)}\n`);
  fs.writeFileSync(path.join(root, '.ci/release-run.json'), `${JSON.stringify({ completed_at: new Date().toISOString(), run_id: process.env.GITHUB_RUN_ID || null, run_attempt: process.env.GITHUB_RUN_ATTEMPT || null })}\n`);
  verifyRelease(root, steps);
  console.log(`release artifact: ${identity.payload.length} payload files + release.json; ${receipt.payload_sha256}; receipt ${envelope.receipt_sha256}`);
  return envelope;
}

export function verifyRelease(root, steps) {
  const envelope = JSON.parse(fs.readFileSync(path.join(root, '.ci/release-identity.json')));
  const { identity, receipt_sha256, ...receipt } = envelope;
  assert.equal(receipt.gate, 'complete');
  assert.deepEqual(receipt.steps, steps, 'receipt omits canonical gate categories');
  assert.equal(sha256(stableJson(receipt)), receipt_sha256, 'release receipt tampered');
  assert.deepEqual(checkout(root), { commit: receipt.commit, tree: receipt.tree }, 'release checkout changed');
  assert.equal(sha256(stableJson(inventory(root).inputs)), receipt.input_sha256, 'release inputs changed');
  for (const key of ['input_sha256', 'media_sha256', 'payload_sha256']) assert.equal(receipt[key], identity[key]);
  assert.equal(sha256(stableJson(identity.inputs)), identity.input_sha256);
  assert.equal(sha256(stableJson(identity.media)), identity.media_sha256);
  assert.equal(sha256(stableJson(identity.payload)), identity.payload_sha256);
  const actual = payloadManifest(path.join(root, '.ci/pages'));
  assert.deepEqual(actual.filter(row => row.path !== 'release.json'), identity.payload, 'release payload tampered');
  const receiptBytes = Buffer.from(`${stableJson(receipt)}\n`);
  assert.deepEqual(actual.find(row => row.path === 'release.json'), { path: 'release.json', bytes: receiptBytes.length, sha256: sha256(receiptBytes) });
  return envelope;
}
