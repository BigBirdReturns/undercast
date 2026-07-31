#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { adjudicateWithCopilot } from "./card-backfill-copilot-adjudicate.mjs";

const root = await mkdtemp(join(tmpdir(), "card-backfill-copilot-adjudicate-"));
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
    render_result: { candidate: { path: "candidate.jpg", mime: "image/jpeg" } },
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
  await mkdir(candidates, { recursive: true });
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

  const mock = join(root, "mock-copilot.mjs");
  await writeFile(mock, `#!/usr/bin/env node
const prompt=process.argv[process.argv.indexOf('-p')+1]||'';
const id=(prompt.match(/"record_id": "([^"]+)"/)||[])[1];
const rows={
  'UC-001':{decision:'accept',identity:{value:'expected',source_binding:'explicit',confidence:0.99,note:'Explicit exact source binding.'},presentation:{value:'neutral-human',confidence:0.98,note:'Ordinary human portrait.'},reason:'Both gates pass.'},
  'UC-002':{decision:'reject',identity:{value:'ambiguous',source_binding:'implicit',confidence:0.70,note:'The file is not explicitly bound.'},presentation:{value:'character-depiction',confidence:0.97,note:'In-character presentation.'},reason:'Identity custody is insufficient.'},
  'UC-003':{decision:'accept',identity:{value:'expected',source_binding:'explicit',confidence:0.89,note:'Named subject but below threshold.'},presentation:{value:'neutral-human',confidence:0.99,note:'Ordinary portrait.'},reason:'Proposed acceptance.'}
};
if(!prompt.includes('@./evidence.jpg')){console.error('missing image attachment');process.exit(4);}
console.log(JSON.stringify(rows[id]));
`);
  await writeFile(join(root, "mock-copilot"), `#!/bin/sh\nexec "${process.execPath}" "${mock}" "$@"\n`, { mode: 0o755 });
  const out = join(root, "decisions.json");
  const value = await adjudicateWithCopilot({
    candidates,
    out,
    copilotBin: join(root, "mock-copilot"),
    model: "fixture-model",
    concurrency: 3,
    attempts: 1,
    timeoutMs: 30_000,
    identityThreshold: 0.93,
    presentationThreshold: 0.90,
    now: "2026-07-31T00:00:00.000Z",
    artifactName: "fixture-artifact",
    headSha: "e".repeat(40),
    cycle: 1,
  });
  assert.equal(value.status, "ready");
  assert.equal(value.decisions.length, 3);
  assert.equal(value.machine_adjudication.accepted_count, 1);
  assert.equal(value.machine_adjudication.rejected_count, 2);
  assert.equal(value.decisions[0].disposition, "accept");
  assert.equal(value.decisions[0].machine.provider, "github-copilot-cli");
  assert.equal(value.decisions[1].disposition, "reject");
  assert.match(value.decisions[1].reason, /source-binding=implicit/);
  assert.equal(value.decisions[2].disposition, "reject");
  assert.match(value.decisions[2].reason, /identity-confidence=0.89<0.93/);
  assert.equal(JSON.parse(await readFile(out, "utf8")).adjudicator.independent_from_discovery, true);
  console.log("card-backfill Copilot adjudication fixtures: PASS — attachments, typed schema, independence, and thresholds fail closed");
} finally {
  await rm(root, { recursive: true, force: true });
}
