#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = await mkdtemp(join(tmpdir(), "card-backfill-local-desk-"));
const script = fileURLToPath(new URL("./card-backfill-local-adjudicate.mjs", import.meta.url));

async function packet({ id, side, subject, actor, production, required, file, method, description, categories, pageTitle, cohortKey }) {
  const packetRoot = join(root, "candidates", "packets", id);
  await mkdir(packetRoot, { recursive: true });
  await writeFile(join(packetRoot, "selected-source.jpg"), `fixture-${id}`);
  await writeFile(join(packetRoot, "review.json"), JSON.stringify({
    version: 1,
    record_id: id,
    side,
    expected_subject: subject,
    identity: { actor, production, kind: cohortKey.includes("voice-or-animation") ? "voice" : null },
    cohort_key: cohortKey,
    selected_source: { output_path: "selected-source.jpg", origin: `https://example.test/file/${id}`, author: actor },
    independent_evidence: { canonical_link: `https://example.test/person/${id}` },
    visual_adjudication: { required_presentation_value: required },
    canonical_mutation: false,
  }, null, 2));
  const fileRow = {
    file,
    description,
    categories,
    source_origin: `https://example.test/file/${id}`,
    page_extract_windows: pageTitle ? [`${pageTitle} is an actor profile.`] : [],
    binding: { facts: { page_looks_like_actor: method.startsWith("exact-actor-pageimage"), actor_role_bound: true } },
  };
  await writeFile(join(packetRoot, "source-receipt.json"), JSON.stringify({
    version: 1,
    record_id: id,
    side,
    retrieval_result: {
      candidate: {
        source_file: file,
        source_page: `https://example.test/page/${id}`,
        source_page_title: pageTitle,
        source_method: method,
      },
      discovery: {
        exact_page_title: pageTitle,
        source_evidence: { prescreened: [fileRow], binding: fileRow.binding },
      },
    },
    canonical_mutation: false,
  }, null, 2));
  return { obligation_id: `${id}/${side}`, record_id: id, side, disposition: "candidate-pending-independent-visual-adjudication", packet_path: `packets/${id}` };
}

try {
  const cohortPortrait = "portrait::voice-or-animation::commons-bound-multicandidate-v3::canonical-link-only::neutral-human";
  const cohortStill = "still::physical-or-live-action::mediawiki-bound-multicandidate-v3::canonical-link-only::character-depiction";
  const results = [
    await packet({ id: "UC-001", side: "portrait", subject: "Exact Actor", actor: "Exact Actor", production: "Example", required: "neutral-human", file: "Exact Actor portrait.jpg", method: "exact-actor-pageimage-v3", description: "Portrait of Exact Actor", categories: "Actors", pageTitle: "Exact Actor", cohortKey: cohortPortrait }),
    await packet({ id: "UC-002", side: "portrait", subject: "Generic Voice", actor: "Generic Voice", production: "Example", required: "neutral-human", file: "Seiyu.png", method: "exact-actor-pageimage-v3", description: "Generic voice actor icon", categories: "Icons", pageTitle: "Generic Voice", cohortKey: cohortPortrait }),
    await packet({ id: "UC-003", side: "still", subject: "Filed Beast", actor: "Actor Three", production: "Filed Movie 1999", required: "character-depiction", file: "Filed Beast - Filed Movie 1999.jpg", method: "exact-character-page-v3", description: "Filed Beast in Filed Movie 1999", categories: "Filed Movie 1999 characters", pageTitle: "Filed Beast", cohortKey: cohortStill }),
    await packet({ id: "UC-004", side: "still", subject: "Filed Lion", actor: "Actor Four", production: "Filed Movie 1939", required: "character-depiction", file: "Filed Lion.png", method: "exact-character-page-v3", description: "Book illustration from the 1900 novel edition", categories: "Book illustrations", pageTitle: "Filed Lion", cohortKey: cohortStill }),
  ];
  const candidates = join(root, "candidates");
  await writeFile(join(candidates, "batch-result.json"), JSON.stringify({
    version: 1,
    campaign_id: "fixture-campaign",
    estate_sha256: "a".repeat(64),
    batch_sha256: "b".repeat(64),
    cohort_key: "fixture-mixed",
    selected_count: results.length,
    result_sha256: "c".repeat(64),
    results,
    canonical_mutation: false,
  }, null, 2));
  const goodPortrait = { dominant_single_face: true, entropy: 7, white_ratio: 0.05, text_characters: 0, text_area_ratio: 0, analysis_width: 640, analysis_height: 800 };
  const featureMap = {
    "UC-001/portrait": goodPortrait,
    "UC-002/portrait": { ...goodPortrait, dominant_single_face: false, entropy: 2 },
    "UC-003/still": { dominant_single_face: false, entropy: 7, white_ratio: 0.05, text_characters: 3, text_area_ratio: 0.01, analysis_width: 800, analysis_height: 500 },
    "UC-004/still": { dominant_single_face: false, entropy: 6, white_ratio: 0.1, text_characters: 1, text_area_ratio: 0.01, analysis_width: 600, analysis_height: 700 },
  };
  const featureMapPath = join(root, "features.json");
  await writeFile(featureMapPath, JSON.stringify(featureMap, null, 2));
  const output = join(root, "decisions.json");
  execFileSync(process.execPath, [script,
    "--candidates", candidates,
    "--out", output,
    "--feature-map", featureMapPath,
    "--now", "2026-07-31T00:00:00.000Z",
    "--cycle", "1",
    "--artifact-name", "fixture-local-desk",
    "--head-sha", "d".repeat(40),
  ], { stdio: "inherit" });
  const value = JSON.parse(await readFile(output, "utf8"));
  assert.equal(value.status, "ready");
  assert.equal(value.adjudicator.provider, "repository-local");
  assert.equal(value.adjudicator.independent_from_discovery, true);
  assert.equal(value.machine_adjudication.accepted_count, 2);
  assert.equal(value.machine_adjudication.rejected_count, 2);
  const byId = new Map(value.decisions.map((row) => [row.record_id, row]));
  assert.equal(byId.get("UC-001").disposition, "accept");
  assert.equal(byId.get("UC-002").disposition, "reject");
  assert.equal(byId.get("UC-003").disposition, "accept");
  assert.equal(byId.get("UC-004").disposition, "reject");
  assert.equal(byId.get("UC-001").machine.appearance_used_for_identity, false);
  console.log("card-backfill local adjudication fixtures: PASS — exact source custody plus local presentation checks accept; icons and wrong adaptations fail closed");
} finally {
  await rm(root, { recursive: true, force: true });
}
