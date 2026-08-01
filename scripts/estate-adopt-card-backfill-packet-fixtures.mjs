#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  inspectAdoptionCandidate,
  promoteAdoptionReceipt,
  validateAdoptionState,
  writeAdoptionCandidate,
} from "./estate-adopt-card-backfill-packet.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
function git(root, args) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
async function file(root, relative, bytes) {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), bytes);
}
async function makeFixture({ active = false, wrongActor = false, conflictingImage = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "undercast-adoption-fixture-"));
  git(root, ["init", "-b", "candidate"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["config", "user.email", "fixture@example.test"]);
  const candidate = Buffer.from("fixture exact Phantom candidate\n");
  const candidateSha = sha256(candidate);
  const binding = { src: "images/uc-046-still.jpg", kind: "still", origin: "https://example.test/phantom", pin: true };
  await file(root, "data/specimens.json", json([{
    id: "UC-046",
    actor: wrongActor ? "Wrong Actor" : "Lon Chaney",
    character: "The Phantom",
    portrait: { src: "images/uc-046-portrait.jpg", kind: "free", origin: "https://example.test/portrait", pin: true },
    still: active ? binding : null,
  }]));
  await file(root, "data/SOURCES.json", json([{
    id: "UC-046",
    actor: "Lon Chaney",
    character: "The Phantom",
    portrait: { src: "images/uc-046-portrait.jpg", kind: "free", origin: "https://example.test/portrait", pin: true },
    still: active ? binding : null,
    fetched_at: "2026-07-01",
  }]));
  await file(root, "data/review/card-backfill/UC-046/uc-046-still-candidate.jpg", candidate);
  await file(root, "data/review/card-backfill/UC-046/manifest.json", json({
    version: 1,
    lane: "card-backfill",
    record_id: "UC-046",
    actor: "Lon Chaney",
    character: "The Phantom",
    production: "The Phantom of the Opera",
    side: "still",
    canonical_mutation: false,
    source: {
      provider: "Fixture Archive",
      source_page: "https://example.test/phantom",
      author: "Fixture Studio",
      license: "Public domain",
    },
    candidate: {
      path: "uc-046-still-candidate.jpg",
      sha256: candidateSha,
      bytes: candidate.length,
      width: 1326,
      height: 1686,
    },
    duplicate_scan: { status: "pass" },
    exact_subject_review: {
      identity: "expected-subject",
      presentation: "character-depiction",
      crop_ruling: "pass",
    },
  }));
  if (conflictingImage) await file(root, "images/uc-046-still.jpg", Buffer.from("different historical bytes\n"));
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "fixture base"]);
  return { root, candidateSha, head: git(root, ["rev-parse", "HEAD"]) };
}

const roots = [];
try {
  const fixture = await makeFixture();
  roots.push(fixture.root);
  const inspected = await inspectAdoptionCandidate({ root: fixture.root, expectedSha: fixture.candidateSha });
  assert.equal(inspected.record_id, "UC-046");
  assert.equal(inspected.canonical_image_before.exists, false);
  assert.deepEqual(inspected.binding, {
    src: "images/uc-046-still.jpg",
    kind: "still",
    origin: "https://example.test/phantom",
    pin: true,
  });

  const candidateReceiptPath = path.join(fixture.root, "candidate-receipt.json");
  const candidateReceipt = await writeAdoptionCandidate({
    root: fixture.root,
    expectedSha: fixture.candidateSha,
    authorizedParent: fixture.head,
    candidateReceiptPath,
    now: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(candidateReceipt.status, "candidate-unpromoted");
  assert.equal(candidateReceipt.boundaries.acceptance_receipt_promoted, false);
  const state = await validateAdoptionState({
    root: fixture.root,
    expectedSha: fixture.candidateSha,
    candidateReceiptPath,
  });
  assert.equal(state.state, "valid");
  assert.equal(sha256(await readFile(path.join(fixture.root, "images/uc-046-still.jpg"))), fixture.candidateSha);

  const beforePath = path.join(fixture.root, "quality-before.json");
  await writeFile(beforePath, json({
    version: 1,
    total: 20,
    metrics: {
      complete_pairs: 10,
      complete_pair_ratio: 0.5,
      missing_still: 5,
      missing_portrait: 4,
      missing_both: 1,
    },
  }));
  await file(fixture.root, "data/quality.json", json({
    version: 1,
    total: 20,
    metrics: {
      complete_pairs: 11,
      complete_pair_ratio: 0.55,
      missing_still: 4,
      missing_portrait: 4,
      missing_both: 1,
    },
  }));
  const receipt = await promoteAdoptionReceipt({
    root: fixture.root,
    candidateReceiptPath,
    receiptPath: "data/review/estate-debt/COLLECT-003-UC-046-STILL-ADOPTION.json",
    qualityBeforePath: beforePath,
    workflowRun: "123456",
    candidateTree: fixture.head,
    now: "2026-08-01T00:01:00.000Z",
  });
  assert.equal(receipt.status, "accepted-after-complete-smoke");
  assert.equal(receipt.quality.delta.complete_pairs, 1);
  assert.equal(receipt.quality.delta.missing_still, -1);
  const finalState = await validateAdoptionState({
    root: fixture.root,
    expectedSha: fixture.candidateSha,
    receiptPath: "data/review/estate-debt/COLLECT-003-UC-046-STILL-ADOPTION.json",
  });
  assert.equal(finalState.acceptance_receipt, receipt.receipt_sha256);

  const active = await makeFixture({ active: true });
  roots.push(active.root);
  await assert.rejects(() => inspectAdoptionCandidate({ root: active.root, expectedSha: active.candidateSha }), /already active/);

  const wrongActor = await makeFixture({ wrongActor: true });
  roots.push(wrongActor.root);
  await assert.rejects(() => inspectAdoptionCandidate({ root: wrongActor.root, expectedSha: wrongActor.candidateSha }), /actor differs/);

  const conflict = await makeFixture({ conflictingImage: true });
  roots.push(conflict.root);
  await assert.rejects(() => inspectAdoptionCandidate({ root: conflict.root, expectedSha: conflict.candidateSha }), /different historical bytes/);

  await assert.rejects(() => inspectAdoptionCandidate({ root: fixture.root, expectedSha: "0".repeat(64) }), /candidate SHA mismatch|already active/);

  console.log("PASS — exact packet identity, structured canonical binding, absent-side enforcement, byte custody, smoke-later receipt promotion, measured quality delta, stale-schema avoidance, and conflict rejection");
} finally {
  for (const root of roots) await rm(root, { recursive: true, force: true });
}
