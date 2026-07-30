#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = await mkdtemp(join(tmpdir(), "undercast-machine-adjudicate-"));
const script = fileURLToPath(new URL("./card-backfill-machine-adjudicate.mjs", import.meta.url));

async function packet({ id, side, expectedPresentation }) {
  const dir = join(root, "candidates", "packets", id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "candidate.jpg"), `fixture-${id}`);
  await writeFile(join(dir, "review.json"), JSON.stringify({
    version: 1,
    campaign_id: "fixture-campaign",
    estate_sha256: "a".repeat(64),
    batch_sha256: "b".repeat(64),
    cohort_key: "fixture-cohort",
    record_id: id,
    side,
    expected_subject: `Expected ${id}`,
    identity: { actor: `Actor ${id}`, character: `Character ${id}`, production: `Production ${id}` },
    selected_source: { output_path: "candidate.jpg", origin: `https://example.test/source/${id}`, sha256: "c".repeat(64) },
    independent_evidence: { canonical_link: `https://example.test/canonical/${id}`, references: [], performances: [] },
    visual_adjudication: { required_presentation_value: expectedPresentation },
    render_result: { candidate: { path: "candidate.jpg" } },
    canonical_mutation: false,
  }, null, 2));
  await writeFile(join(dir, "source-receipt.json"), JSON.stringify({
    version: 1,
    record_id: id,
    side,
    retrieval_result: { candidate: { origin: `https://example.test/source/${id}`, source_file: `${id}.jpg`, source_method: "fixture" } },
    canonical_mutation: false,
  }, null, 2));
  return { obligation_id: `${id}/${side}`, record_id: id, side, disposition: "candidate-pending-independent-visual-adjudication", packet_path: `packets/${id}` };
}

try {
  const candidates = join(root, "candidates");
  const mock = join(root, "mock");
  await mkdir(mock, { recursive: true });
  const results = [
    await packet({ id: "UC-001", side: "portrait", expectedPresentation: "neutral-human" }),
    await packet({ id: "UC-002", side: "still", expectedPresentation: "character-depiction" }),
    await packet({ id: "UC-003", side: "portrait", expectedPresentation: "neutral-human" }),
  ];
  await writeFile(join(candidates, "batch-result.json"), JSON.stringify({
    version: 1,
    campaign_id: "fixture-campaign",
    estate_sha256: "a".repeat(64),
    batch_sha256: "b".repeat(64),
    cohort_key: "fixture-cohort",
    selected_count: 3,
    result_sha256: "d".repeat(64),
    results,
    canonical_mutation: false,
  }, null, 2));
  await writeFile(join(mock, "UC-001.json"), JSON.stringify({
    decision: "accept",
    identity: { value: "expected", source_binding: "explicit", confidence: 0.99, note: "The filed canonical and source pages explicitly bind the file to the expected person." },
    presentation: { value: "neutral-human", confidence: 0.98, note: "The visible subject is an ordinary out-of-character human presentation." },
    reason: "Explicit source binding and required presentation are both satisfied."
  }));
  await writeFile(join(mock, "UC-002.json"), JSON.stringify({
    decision: "reject",
    identity: { value: "ambiguous", source_binding: "implicit", confidence: 0.72, note: "The source does not explicitly bind the selected file to the exact filed character." },
    presentation: { value: "character-depiction", confidence: 0.96, note: "The image appears in-character, but identity custody remains insufficient." },
    reason: "Identity source binding is not explicit."
  }));
  await writeFile(join(mock, "UC-003.json"), JSON.stringify({
    decision: "accept",
    identity: { value: "expected", source_binding: "explicit", confidence: 0.89, note: "The source names the expected person but confidence remains below the publication threshold." },
    presentation: { value: "neutral-human", confidence: 0.99, note: "The image is an ordinary human portrait." },
    reason: "Model proposed acceptance, but the caller must enforce its higher threshold."
  }));
  const out = join(root, "decisions.json");
  execFileSync(process.execPath, [script,
    "--candidates", candidates,
    "--out", out,
    "--mock-dir", mock,
    "--identity-confidence", "0.93",
    "--presentation-confidence", "0.90",
    "--now", "2026-07-30T00:00:00.000Z",
    "--cycle", "1",
    "--artifact-name", "fixture-artifact",
    "--head-sha", "e".repeat(40),
  ], { stdio: "inherit" });
  const decisions = JSON.parse(await readFile(out, "utf8"));
  assert.equal(decisions.status, "ready");
  assert.equal(decisions.decisions.length, 3);
  assert.equal(decisions.machine_adjudication.accepted_count, 1);
  assert.equal(decisions.machine_adjudication.rejected_count, 2);
  assert.equal(decisions.decisions[0].disposition, "accept");
  assert.equal(decisions.decisions[1].disposition, "reject");
  assert.match(decisions.decisions[1].reason, /source-binding=implicit/);
  assert.equal(decisions.decisions[2].disposition, "reject");
  assert.match(decisions.decisions[2].reason, /identity-confidence=0.89<0.93/);
  assert.equal(decisions.adjudicator.independent_from_discovery, true);
  assert.equal(decisions.decisions[0].machine.policy, "explicit-source-binding-and-required-presentation-or-fail-closed");
  console.log("card-backfill machine adjudication fixtures: PASS");
} finally {
  await rm(root, { recursive: true, force: true });
}
