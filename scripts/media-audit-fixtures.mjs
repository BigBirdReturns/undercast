#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  MEDIA_AUDIT_VERSION,
  applyVotes,
  deriveItem,
  makePacket,
  mediaItemId,
  migrateV2State,
  sha256,
  stableJson,
  summarize,
  trackerRows,
  validatePacket,
  validateState,
} from "./lib/media-audit.mjs";

const asset = { src: "images/test.jpg", sha256: "a".repeat(64), bytes: 123, origin: "https://example.test/file", kind: "still" };
function item(side = "portrait", overrides = {}) {
  const raw = {
    id: mediaItemId("star-trek", "UC-TEST", side), scope: "star-trek", wall_id: "UC-TEST", side,
    actor: "Example Performer", character: "Example Character", expected_subject: side === "portrait" ? "Example Performer" : "Example Character",
    source_fetched_at: "2026-07-21", asset, risk_codes: side === "portrait" ? ["fandom-performer-page"] : [], votes: [], status: "review", claims: { identity: null, presentation: null }, ...overrides,
  };
  const derived = deriveItem(raw); raw.status = derived.status; raw.claims = derived.claims; return raw;
}
function state(items = [item()]) {
  const set = items.map(({ id, scope, wall_id, side, expected_subject, asset, risk_codes }) => ({ id, scope, wall_id, side, expected_subject, asset, risk_codes }));
  const doc = { version: MEDIA_AUDIT_VERSION, source: { specimens_sha256: "1".repeat(64), sources_sha256: "2".repeat(64), media_manifest_sha256: "3".repeat(64), scopes_sha256: "4".repeat(64), item_set_sha256: sha256(stableJson(set)) }, updated_at: "2026-07-21T00:00:00.000Z", items };
  validateState(doc); return doc;
}
const vote = (itemId, namespace, value, reviewer, role, extra = {}) => ({ item_id: itemId, namespace, value, reviewer, role, note: `Reviewed ${namespace} as ${value} with visible evidence.`, review_receipt: `repo:review/${reviewer}@sha256:${"5".repeat(64)}`, ...extra });

{
  let doc = state();
  const id = doc.items[0].id;
  doc = applyVotes(doc, [vote(id, "identity", "expected", "luna", "machine")]).state;
  assert.equal(doc.items[0].claims.identity.state, "weak");
  assert.equal(doc.items[0].status, "review", "one machine vote cannot verify a facet");
}
{
  let doc = state(); const id = doc.items[0].id;
  doc = applyVotes(doc, [
    vote(id, "identity", "expected", "reviewer-a", "reviewer"),
    vote(id, "identity", "expected", "desk", "second-desk"),
    vote(id, "presentation", "neutral-human", "reviewer-a", "reviewer"),
    vote(id, "presentation", "neutral-human", "desk", "second-desk"),
  ]).state;
  assert.equal(doc.items[0].claims.identity.state, "solid");
  assert.equal(doc.items[0].claims.presentation.state, "solid");
  assert.equal(doc.items[0].status, "verified");
  assert.equal(doc.items[0].claims.identity.independent_reviewers, 2);
}
{
  let doc = state(); const id = doc.items[0].id;
  const octopodes = ["octopode-alpha", "octopode-beta", "octopode-gamma"];
  doc = applyVotes(doc, octopodes.flatMap((reviewer) => [
    vote(id, "identity", "expected", reviewer, "reviewer"),
    vote(id, "presentation", "neutral-human", reviewer, "reviewer"),
  ])).state;
  assert.equal(doc.items[0].status, "verified", "independent Octopode reviewers may verify a facet without a human");
  assert.equal(doc.items[0].claims.identity.independent_reviewers, 3);
}
{
  let doc = state(); const id = doc.items[0].id;
  for (const reviewer of ["screen-alpha", "screen-beta", "screen-gamma"]) {
    doc = applyVotes(doc, [vote(id, "identity", "expected", reviewer, "machine")]).state;
  }
  assert.equal(doc.items[0].claims.identity.state, "active", "screening votes cannot close a claim");
  assert.equal(doc.items[0].claims.identity.independent_reviewers, 0);
}
{
  let doc = state(); const id = doc.items[0].id;
  doc = applyVotes(doc, [vote(id, "identity", "expected", "octopode-alpha", "reviewer")]).state;
  doc = applyVotes(doc, [vote(id, "identity", "wrong", "octopode-alpha", "reviewer")]).state;
  assert.equal(doc.items[0].claims.identity.reviewers, 1, "a reviewer revote replaces rather than multiplies its vote");
}
{
  let doc = state(); const id = doc.items[0].id;
  doc = applyVotes(doc, [
    vote(id, "identity", "expected", "octopode-alpha", "reviewer"),
    vote(id, "identity", "expected", "octopode-beta", "reviewer"),
    vote(id, "identity", "wrong", "octopode-gamma", "reviewer"),
  ]).state;
  assert.equal(doc.items[0].claims.identity.state, "contested");
  assert.equal(doc.items[0].status, "attention");
}
{
  let doc = state(); const id = doc.items[0].id;
  doc = applyVotes(doc, [vote(id, "presentation", "role-depiction", "desk", "second-desk", { enforced: true })]).state;
  assert.equal(doc.items[0].claims.presentation.state, "enforced");
  assert.equal(doc.items[0].status, "attention");
}
{
  const doc = state(); const id = doc.items[0].id;
  assert.throws(() => applyVotes(doc, [vote(id, "identity", "wrong", "desk", "second-desk", { enforced: true })]), /negative presentation/);
  assert.throws(() => applyVotes(doc, [vote(id, "presentation", "neutral-human", "desk", "second-desk", { enforced: true })]), /negative presentation/);
  assert.throws(() => applyVotes(doc, [vote(id, "presentation", "ambiguous", "desk", "second-desk", { enforced: true })]), /negative presentation/);
  assert.throws(() => applyVotes(doc, [vote(id, "presentation", "role-depiction", "screen", "machine", { enforced: true })]), /second-desk or owner/);
}
{
  let doc = state(); const id = doc.items[0].id;
  doc = applyVotes(doc, [
    vote(id, "presentation", "role-depiction", "desk", "second-desk", { enforced: true }),
    vote(id, "presentation", "group", "owner", "owner", { enforced: true }),
  ]).state;
  assert.equal(doc.items[0].claims.presentation.state, "contested");
  assert.equal(doc.items[0].status, "attention");
}
{
  const absent = item("still", { asset: null, risk_codes: ["source-declared-absent"], votes: [] });
  const derived = deriveItem(absent); absent.status = derived.status; absent.claims = derived.claims;
  const summary = summarize(state([absent]), "star-trek");
  assert.equal(summary.complete, 1);
  assert.equal(summary.absent, 1);
}
{
  const risky = item("portrait");
  const plain = item("still", { id: mediaItemId("star-trek", "UC-OTHER", "still"), wall_id: "UC-OTHER", asset: { ...asset, sha256: "b".repeat(64) }, risk_codes: [] });
  const doc = state([plain, risky]);
  assert.equal(trackerRows(doc, { scope: "star-trek" })[0].id, risky.id, "risk-first tracker ordering");
  assert.equal(trackerRows(doc, { scope: "star-trek", sides: ["still"], statuses: ["review"] })[0].id, plain.id, "tracker side and status filters select a bounded desk packet");
  const packet = makePacket(doc, [risky], { reviewer: "reviewer-a", role: "reviewer", namespace: "identity", now: "2026-07-21T00:00:00.000Z" });
  validatePacket(packet, doc);
  assert.equal(packet.items[0].claims, undefined, "packets must not disclose prior consensus");
  assert.throws(() => validatePacket({ ...packet, source: { ...packet.source, item_set_sha256: "f".repeat(64) } }, doc), /stale/);
  assert.throws(() => validatePacket({ ...packet, source: { ...packet.source, scopes_sha256: "f".repeat(64) } }, doc), /stale/);
  const presentation = makePacket(doc, [risky], { reviewer: "reviewer-b", role: "reviewer", namespace: "presentation", now: "2026-07-21T00:00:00.000Z" });
  assert.equal(presentation.items[0].expected_subject, undefined, "presentation packets are blind to expected identity");
}

{
  const current = state();
  const legacy = { ...current, version: 2, items: current.items.map((row) => ({ ...row, votes: [], claims: { identity: { state: "none", value: null, support: 0, reviewers: 0, human_reviewers: 0, competing: [] }, presentation: { state: "none", value: null, support: 0, reviewers: 0, human_reviewers: 0, competing: [] } } })) };
  const migrated = migrateV2State(legacy, { legacyReviewReceipt: `repo:data/legacy.json@sha256:${"6".repeat(64)}` });
  validateState(migrated);
  assert.equal(migrated.version, MEDIA_AUDIT_VERSION);
  assert.equal(migrated.items[0].claims.identity.independent_reviewers, 0);
}

{
  const root = await mkdtemp(join(tmpdir(), "undercast-media-audit-bad-state-"));
  try {
    const badState = join(root, "MEDIA-AUDIT.json"), lock = join(root, "MEDIA-AUDIT.lock");
    await writeFile(badState, "{ malformed\n");
    const run = spawnSync(process.execPath, [fileURLToPath(new URL("./media-audit.mjs", import.meta.url)), "sync", "--state", badState, "--lock", lock, "--root", root], { encoding: "utf8" });
    assert.notEqual(run.status, 0, "sync must reject malformed existing state rather than replacing it");
    assert.match(`${run.stdout}${run.stderr}`, /cannot read .*MEDIA-AUDIT\.json/i);
    assert.equal(await readFile(badState, "utf8"), "{ malformed\n", "malformed state must remain untouched");
  } finally { await rm(root, { recursive: true, force: true }); }
}

console.log("PASS — media audit consensus, authority, staleness, absence, tracker, and fail-closed state fixtures");
