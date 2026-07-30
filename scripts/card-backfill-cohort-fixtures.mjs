#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildEstate,
  buildRetrievalPlan,
  buildScopeReceipt,
  readCompletedPackets,
  selectBatch,
} from "./lib/card-backfill-cohort.mjs";

const control = {
  version: 1,
  campaign_id: "fixture-estate",
  denominator: { scope: "sitewide", status: "absent", sides: ["still", "portrait"] },
  batch: { minimum: 20, target: 40, maximum: 50 },
};
const specimens = [];
const sources = [];
const auditItems = [];
for (let i = 1; i <= 24; i++) {
  const id = `UC-${String(i).padStart(3, "0")}`;
  specimens.push({ id, actor: `Actor ${i}`, character: `Character ${i}`, production: `Production ${i}`, years: "2001", universe: "Fixture", kind: "physical", wiki: "fixture", link: `https://example.test/${id}`, references: [{ url: `https://evidence.test/${id}` }], still: null, portrait: i === 1 ? { src: "images/p.jpg" } : null });
  sources.push({ id, still: null, portrait: i === 1 ? { src: "images/p.jpg" } : null });
  auditItems.push({ id: `ma-${i}`, wall_id: id, side: "still", scope: "sitewide", status: "absent", expected_subject: `Character ${i}`, risk_codes: ["source-declared-absent"] });
}
for (let i = 25; i <= 27; i++) {
  const id = `UC-${String(i).padStart(3, "0")}`;
  specimens.push({ id, actor: `Actor ${i}`, character: `Character ${i}`, production: `Production ${i}`, years: "2002", universe: "Fixture", link: `https://example.test/${id}`, portrait: null, still: { src: `images/${id}-still.jpg` } });
  sources.push({ id, portrait: null, still: { src: `images/${id}-still.jpg` } });
  auditItems.push({ id: `ma-${i}`, wall_id: id, side: "portrait", scope: "sitewide", status: "absent", expected_subject: `Actor ${i}`, risk_codes: ["source-declared-absent"] });
}
for (let i = 28; i <= 29; i++) {
  const id = `UC-${String(i).padStart(3, "0")}`;
  specimens.push({ id, actor: `Actor ${i}`, character: `Character ${i}`, production: `Unrouted ${i}`, years: "2003", universe: "Fixture", link: `https://example.test/${id}`, still: null, portrait: null });
  sources.push({ id, still: null, portrait: null });
  auditItems.push({ id: `ma-${i}`, wall_id: id, side: "still", scope: "sitewide", status: "absent", expected_subject: `Character ${i}`, risk_codes: ["source-declared-absent"] });
}
auditItems.push({ id: "ma-30", wall_id: "UC-030", side: "still", scope: "sitewide", status: "absent", expected_subject: "Missing Character", risk_codes: ["source-declared-absent"] });

const completed = new Map([["UC-001", { record_id: "UC-001", side: "portrait" }]]);
const estate = buildEstate({ specimens, sources, auditItems, completedPackets: completed, control });
assert.equal(estate.obligations.length, 28);
assert.equal(estate.denominator.selector_total, 29);
assert(!estate.obligations.some((row) => row.wall_id === "UC-001"), "the frozen campaign must preserve the live selector's packet-per-record completion rule");
assert.equal(estate.counts.ready, 26);
assert.equal(estate.counts.quarantine, 2);
assert.equal(estate.selector_exclusions.length, 1);
assert.equal(estate.selector_exclusions[0].reason, "missing-canonical-specimen");

const shuffled = buildEstate({ specimens: [...specimens].reverse(), sources: [...sources].reverse(), auditItems: [...auditItems].reverse(), completedPackets: completed, control });
assert.equal(shuffled.estate_sha256, estate.estate_sha256, "estate hash must be input-order independent");

const batch = selectBatch({ estate, control, limit: 20 });
assert.equal(batch.selected_count, 20);
assert.equal(new Set(batch.obligations.map((row) => row.cohort_key)).size, 1, "batch must remain shape-equivalent");
assert(batch.obligations.every((row) => row.disposition === "ready"));
const plan = buildRetrievalPlan(batch, "2026-07-29T00:00:00.000Z");
assert.equal(plan.candidates.length, 20);
assert.equal(plan.canonical_write, false);
assert(plan.candidates.every((row) => row.side === "still"));

const scope = buildScopeReceipt(batch.obligations[0], { campaignId: estate.campaign_id, estateSha256: estate.estate_sha256, batchSha256: batch.batch_sha256 });
assert.equal(scope.selection_contract.independent_visual_adjudication_required, true);
assert.equal(scope.selection_contract.adjudicator_may_be_a_qualified_machine_or_person_but_must_not_be_the_discoverer, true);
assert.equal(scope.selection_contract.full_repository_gate_required_once_for_the_permanent_batch, true);
assert.equal(scope.canonical_mutation, false);

const root = await mkdtemp(join(tmpdir(), "undercast-cohort-fixture-"));
try {
  await mkdir(join(root, "UC-900"), { recursive: true });
  await writeFile(join(root, "UC-900", "manifest.json"), JSON.stringify({ record_id: "UC-900", side: "still" }));
  await mkdir(join(root, "UC-901"), { recursive: true });
  await writeFile(join(root, "UC-901", "review.json"), JSON.stringify({ record_id: "UC-901", render_contract: { candidate_path: "uc-901-portrait-candidate.jpg" } }));
  const found = await readCompletedPackets(root);
  assert(found.has("UC-900"));
  assert(found.has("UC-901"));
  assert.equal(found.get("UC-901").side, "portrait");
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("card-backfill cohort fixtures: PASS");
