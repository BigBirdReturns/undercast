#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = await mkdtemp(join(tmpdir(), "undercast-staging-fixture-"));
const adjudicate = fileURLToPath(new URL("./card-backfill-cohort-adjudicate.mjs", import.meta.url));
const staging = fileURLToPath(new URL("./card-backfill-staging.mjs", import.meta.url));
const materialize = fileURLToPath(new URL("./card-backfill-cohort-materialize.mjs", import.meta.url));

async function makeCandidateBatch({ name, start, count, cohortKey }) {
  const candidates = join(root, name, "candidates");
  const packets = join(candidates, "packets");
  await mkdir(packets, { recursive: true });
  const batchSha = String(start).padStart(64, "0").slice(-64);
  const results = [], decisions = [];
  for (let index = 0; index < count; index++) {
    const number = start + index;
    const id = `UC-${String(number).padStart(3, "0")}`;
    const side = index % 2 ? "portrait" : "still";
    const expectedPresentation = side === "still" ? "character-depiction" : "neutral-human";
    const dir = join(packets, id);
    await mkdir(dir, { recursive: true });
    const review = {
      version: 1,
      campaign_id: "fixture-campaign",
      estate_sha256: "a".repeat(64),
      batch_sha256: batchSha,
      cohort_key: cohortKey,
      record_id: id,
      side,
      expected_subject: `Subject ${number}`,
      disposition: "candidate-pending-independent-visual-adjudication",
      quarantine_reasons: [],
      selected_source: { output_path: "selected-source.jpg", origin: `https://example.test/source/${id}`, sha256: null },
      independent_evidence: { canonical_link: `https://example.test/canonical/${id}` },
      visual_adjudication: { status: "pending", required_presentation_value: expectedPresentation },
      canonical_mutation: false,
    };
    await writeFile(join(dir, "review.json"), JSON.stringify(review, null, 2) + "\n");
    await writeFile(join(dir, "scope.json"), JSON.stringify({ version: 1, record_id: id, side, canonical_mutation: false }) + "\n");
    await writeFile(join(dir, "source-receipt.json"), JSON.stringify({ version: 1, record_id: id, side, expected_subject: review.expected_subject, canonical_mutation: false }) + "\n");
    await writeFile(join(dir, "review.md"), `# ${id}\n`);
    await writeFile(join(dir, "selected-source.jpg"), `fixture-image-${id}\n`);
    await writeFile(join(dir, "manifest.json"), "{}\n");
    await writeFile(join(dir, "checksums.sha256"), "");
    results.push({ obligation_id: `${id}/${side}`, record_id: id, side, disposition: "candidate-pending-independent-visual-adjudication", packet_path: `packets/${id}` });
    decisions.push({
      record_id: id,
      side,
      disposition: "accept",
      identity: "expected",
      presentation: expectedPresentation,
      note: "Exact fixture identity is source-bound and the filed presentation was independently confirmed.",
      evidence: [`https://example.test/canonical/${id}`, `https://example.test/source/${id}`],
      decided_at: "2026-07-30T00:00:00.000Z",
    });
  }
  await writeFile(join(candidates, "batch-result.json"), JSON.stringify({ version: 1, campaign_id: "fixture-campaign", estate_sha256: "a".repeat(64), batch_sha256: batchSha, cohort_key: cohortKey, selected_count: count, results, canonical_mutation: false }, null, 2) + "\n");
  const decisionsPath = join(root, name, "decisions.json");
  await writeFile(decisionsPath, JSON.stringify({ version: 1, status: "ready", source: { workflow_run_id: start, artifact_name: `fixture-${name}`, head_sha: "b".repeat(40) }, campaign_id: "fixture-campaign", estate_sha256: "a".repeat(64), batch_sha256: batchSha, cohort_key: cohortKey, adjudicator: { id: "fixture-independent-second-desk", kind: "machine", independent_from_discovery: true }, decisions }, null, 2) + "\n");
  return { candidates, decisionsPath, batchSha };
}

try {
  const controlPath = join(root, "control.json");
  await writeFile(controlPath, JSON.stringify({
    batch: { minimum: 20, target: 40, maximum: 50 },
    staging: { minimum_publication_batch: 20, target_publication_batch: 40, maximum_publication_batch: 50 },
  }, null, 2) + "\n");
  const stagingRoot = join(root, "staging");
  const permanentRoot = join(root, "permanent");

  const first = await makeCandidateBatch({ name: "first", start: 1, count: 2, cohortKey: "portrait::voice::wikimedia::canonical::neutral-human" });
  const firstAdjudicated = join(root, "first", "adjudicated");
  execFileSync(process.execPath, [adjudicate, "--candidates", first.candidates, "--decisions", first.decisionsPath, "--control", controlPath, "--out", firstAdjudicated, "--now", "2026-07-30T00:01:00.000Z"], { stdio: "inherit" });
  const firstReceipt = JSON.parse(await readFile(join(firstAdjudicated, "adjudication-run-receipt.json"), "utf8"));
  assert.equal(firstReceipt.counts.accepted, 2);
  assert.equal(firstReceipt.publication_window.ready_without_existing_staging, false);
  execFileSync(process.execPath, [staging, "stage", "--input", firstAdjudicated, "--root", stagingRoot, "--permanent-root", permanentRoot, "--now", "2026-07-30T00:02:00.000Z"], { stdio: "inherit" });
  const firstEventCount = (await readdir(join(stagingRoot, "events"))).length;
  execFileSync(process.execPath, [staging, "stage", "--input", firstAdjudicated, "--root", stagingRoot, "--permanent-root", permanentRoot, "--now", "2026-07-30T00:02:30.000Z"], { stdio: "inherit" });
  assert.equal((await readdir(join(stagingRoot, "events"))).length, firstEventCount, "idempotent restaging must not create a new event");
  const waitOut = join(root, "wait-plan");
  execFileSync(process.execPath, [staging, "plan", "--root", stagingRoot, "--permanent-root", permanentRoot, "--control", controlPath, "--out", waitOut, "--now", "2026-07-30T00:03:00.000Z"], { stdio: "inherit" });
  const waitPlan = JSON.parse(await readFile(join(waitOut, "publication-plan.json"), "utf8"));
  assert.equal(waitPlan.ready, false);
  assert.equal(waitPlan.staged_count, 2);

  const second = await makeCandidateBatch({ name: "second", start: 101, count: 18, cohortKey: "still::live-action::franchise-mediawiki::filed::character-depiction" });
  const secondAdjudicated = join(root, "second", "adjudicated");
  execFileSync(process.execPath, [adjudicate, "--candidates", second.candidates, "--decisions", second.decisionsPath, "--control", controlPath, "--out", secondAdjudicated, "--now", "2026-07-30T00:04:00.000Z"], { stdio: "inherit" });
  execFileSync(process.execPath, [staging, "stage", "--input", secondAdjudicated, "--root", stagingRoot, "--permanent-root", permanentRoot, "--now", "2026-07-30T00:05:00.000Z"], { stdio: "inherit" });
  execFileSync(process.execPath, [staging, "validate", "--root", stagingRoot, "--permanent-root", permanentRoot], { stdio: "inherit" });

  const readyOut = join(root, "ready-plan");
  execFileSync(process.execPath, [staging, "plan", "--root", stagingRoot, "--permanent-root", permanentRoot, "--control", controlPath, "--out", readyOut, "--require-ready", "--now", "2026-07-30T00:06:00.000Z"], { stdio: "inherit" });
  const readyPlanPath = join(readyOut, "publication-plan.json");
  const readyPlan = JSON.parse(await readFile(readyPlanPath, "utf8"));
  assert.equal(readyPlan.ready, true);
  assert.equal(readyPlan.selected_count, 20);
  assert.equal(Object.keys(readyPlan.cohort_counts).length, 2);
  assert.equal(Object.keys(readyPlan.discovery_batch_counts).length, 2);

  execFileSync(process.execPath, [materialize, "--plan", readyPlanPath, "--staging", stagingRoot, "--destination", permanentRoot, "--now", "2026-07-30T00:07:00.000Z"], { stdio: "inherit" });
  const permanentDirs = (await readdir(permanentRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name !== "batches");
  assert.equal(permanentDirs.length, 20);
  assert.equal((await readdir(join(permanentRoot, "batches"))).length, 1);
  const finalLedger = JSON.parse(await readFile(join(stagingRoot, "STAGING.json"), "utf8"));
  assert.equal(finalLedger.counts.staged, 0);
  assert.equal((await readdir(join(stagingRoot, "publications"))).length, 1);
  console.log("card-backfill staging fixtures: PASS");
} finally {
  await rm(root, { recursive: true, force: true });
}
