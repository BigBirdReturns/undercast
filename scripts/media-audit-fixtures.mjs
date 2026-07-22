#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  MEDIA_AUDIT_VERSION,
  applyVotes,
  deriveItem,
  makePacket,
  mediaItemId,
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
  const doc = { version: MEDIA_AUDIT_VERSION, source: { specimens_sha256: "1".repeat(64), sources_sha256: "2".repeat(64), media_manifest_sha256: "3".repeat(64), item_set_sha256: sha256(stableJson(set)) }, updated_at: "2026-07-21T00:00:00.000Z", items };
  validateState(doc); return doc;
}
const vote = (itemId, namespace, value, reviewer, role, extra = {}) => ({ item_id: itemId, namespace, value, reviewer, role, note: `Reviewed ${namespace} as ${value} with visible evidence.`, ...extra });

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
}
{
  let doc = state(); const id = doc.items[0].id;
  doc = applyVotes(doc, [vote(id, "presentation", "role-depiction", "desk", "second-desk", { enforced: true })]).state;
  assert.equal(doc.items[0].claims.presentation.state, "enforced");
  assert.equal(doc.items[0].status, "attention");
}
{
  let doc = state(); const id = doc.items[0].id;
  doc = applyVotes(doc, [
    vote(id, "presentation", "role-depiction", "desk", "second-desk", { enforced: true }),
    vote(id, "presentation", "neutral-human", "owner", "owner", { enforced: true }),
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
  const packet = makePacket(doc, [risky], { reviewer: "reviewer-a", role: "reviewer", namespace: "identity", now: "2026-07-21T00:00:00.000Z" });
  validatePacket(packet, doc);
  assert.throws(() => validatePacket({ ...packet, source: { ...packet.source, item_set_sha256: "f".repeat(64) } }, doc), /stale/);
}

console.log("PASS — media audit consensus, authority, staleness, absence, and tracker fixtures");
