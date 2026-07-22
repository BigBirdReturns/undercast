#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { applyVotes, deriveItem, mediaItemId, sha256, stableJson, validateState } from "./lib/media-audit.mjs";
import { planRemediation, remediationJournalLines, validateRemediationJournal } from "./lib/media-remediation.mjs";

const cli = fileURLToPath(new URL("./media-audit.mjs", import.meta.url));
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const imageBytes = Buffer.from("under-cast-remediation-fixture\n");
const imageHash = sha256(imageBytes);
const facet = { src: "images/test-still.jpg", kind: "still", origin: "https://example.test/still", pin: true };
const manifestEntry = { id: "UC-TEST", side: "still", kind: "still", sha256: imageHash, asset: `test-still-${imageHash.slice(0, 8)}.jpg`, bytes: imageBytes.length, release: "media-test", url: "https://example.test/release/test.jpg", location: "release", prov: "UC-TEST" };

function baseDocs() {
  const specimens = [{ id: "UC-TEST", actor: "Example Performer", character: "Example Character", universe: "Star Trek", still: { ...facet }, portrait: null }];
  const sources = [{ id: "UC-TEST", actor: "Example Performer", character: "Example Character", universe: "Star Trek", still: { ...facet }, portrait: null, fetched_at: "2026-07-22" }];
  const mediaManifest = { version: 1, assets: { [facet.src]: { ...manifestEntry } } };
  const specimensBytes = jsonBytes(specimens), sourcesBytes = jsonBytes(sources), manifestBytes = jsonBytes(mediaManifest);
  const raw = {
    id: mediaItemId("star-trek", "UC-TEST", "still"), scope: "star-trek", wall_id: "UC-TEST", side: "still",
    actor: "Example Performer", character: "Example Character", expected_subject: "Example Character", source_fetched_at: "2026-07-22",
    asset: { src: facet.src, sha256: imageHash, bytes: imageBytes.length, origin: facet.origin, kind: "still" }, risk_codes: [], votes: [], status: "review", claims: { identity: null, presentation: null },
  };
  const derived = deriveItem(raw); raw.status = derived.status; raw.claims = derived.claims;
  const set = [{ id: raw.id, scope: raw.scope, wall_id: raw.wall_id, side: raw.side, expected_subject: raw.expected_subject, asset: raw.asset, risk_codes: raw.risk_codes }];
  const auditState = { version: 3, source: { specimens_path: "data/specimens.json", specimens_sha256: sha256(specimensBytes), sources_path: "data/SOURCES.json", sources_sha256: sha256(sourcesBytes), media_manifest_path: "data/media-manifest.json", media_manifest_sha256: sha256(manifestBytes), scopes_path: "data/MEDIA-AUDIT-SCOPES.json", scopes_sha256: "4".repeat(64), item_set_sha256: sha256(stableJson(set)) }, updated_at: "2026-07-22T00:00:00.000Z", items: [raw] };
  validateState(auditState);
  return { specimens, sources, mediaManifest, specimensBytes, sourcesBytes, manifestBytes, auditState };
}

const vote = (itemId, namespace, value, reviewer, role, extra = {}) => ({ item_id: itemId, namespace, value, reviewer, role, note: `Reviewed ${namespace} as ${value} against the exact asset.`, review_receipt: `git:fixture/${reviewer}@${"5".repeat(40)}`, ...extra });

function withVotes(votes) {
  const docs = baseDocs();
  docs.auditState = applyVotes(docs.auditState, votes(docs.auditState.items[0].id), { now: "2026-07-22T01:00:00.000Z" }).state;
  return docs;
}

function inputFor(docs, facets = null) {
  const auditBytes = jsonBytes(docs.auditState);
  const item = docs.auditState.items[0];
  return {
    request: { version: 1, scope: "star-trek", audit_state_sha256: sha256(auditBytes), requested_at: "2026-07-22T02:00:00.000Z", requested_by: "tier-desk-remediator", request_receipt: `git:fixture/remediation-request@${"6".repeat(40)}`, facets: facets || [{ item_id: item.id, asset_sha256: item.asset.sha256 }] },
    auditState: docs.auditState, auditStateSha256: sha256(auditBytes), specimens: docs.specimens, specimensSha256: sha256(docs.specimensBytes), sources: docs.sources, sourcesSha256: sha256(docs.sourcesBytes), mediaManifest: docs.mediaManifest, mediaManifestSha256: sha256(docs.manifestBytes),
  };
}

{
  const docs = withVotes((id) => [vote(id, "presentation", "non-performance", "desk", "second-desk", { enforced: true })]);
  const result = planRemediation(inputFor(docs));
  assert.equal(result.auditState.items[0].status, "absent");
  assert.equal(result.specimens[0].still, null);
  assert.equal(result.sources[0].still, null);
  assert.equal(result.sources[0].fetched_at, "2026-07-22");
  assert.equal(result.events[0].former.audit_item.claims.presentation.state, "enforced");
  assert.deepEqual(result.events[0].former.media_manifest.entry, manifestEntry);
  const lines = remediationJournalLines(result.events);
  assert.equal(validateRemediationJournal(lines), 1);
  assert.throws(() => validateRemediationJournal(lines.replace("media.remediated", "media.remediated-tampered")), /tampered event id/);
}

{
  const docs = withVotes((id) => [
    vote(id, "identity", "wrong", "octopode-a", "reviewer"),
    vote(id, "identity", "wrong", "octopode-b", "reviewer"),
    vote(id, "identity", "wrong", "octopode-c", "reviewer"),
  ]);
  assert.equal(planRemediation(inputFor(docs)).auditState.items[0].status, "absent", "solid wrong identity is remediable");
}

for (const [name, votes, pattern] of [
  ["active", (id) => [vote(id, "identity", "wrong", "screen-a", "machine"), vote(id, "identity", "wrong", "screen-b", "machine")], /lacks a solid or enforced/],
  ["ambiguous", (id) => [vote(id, "identity", "ambiguous", "screen-a", "machine"), vote(id, "identity", "ambiguous", "screen-b", "machine")], /ambiguous/],
  ["contested", (id) => [vote(id, "identity", "wrong", "octopode-a", "reviewer"), vote(id, "identity", "wrong", "octopode-b", "reviewer"), vote(id, "identity", "expected", "octopode-c", "reviewer")], /contested/],
]) {
  const docs = withVotes(votes);
  assert.throws(() => planRemediation(inputFor(docs)), pattern, `${name} ruling must fail closed`);
}

{
  const docs = withVotes((id) => [
    vote(id, "identity", "expected", "octopode-a", "reviewer"), vote(id, "identity", "expected", "desk", "second-desk"),
    vote(id, "presentation", "character-depiction", "octopode-a", "reviewer"), vote(id, "presentation", "character-depiction", "desk", "second-desk"),
  ]);
  assert.throws(() => planRemediation(inputFor(docs)), /not a present attention facet/, "positive verified media cannot be remediated");
}

{
  const docs = baseDocs();
  assert.throws(() => planRemediation(inputFor(docs)), /not a present attention facet/, "pending review media cannot be remediated");
}

{
  const docs = withVotes((id) => [vote(id, "presentation", "non-performance", "desk", "second-desk", { enforced: true })]);
  const staleState = inputFor(docs); staleState.request.audit_state_sha256 = "f".repeat(64);
  assert.throws(() => planRemediation(staleState), /stale audit state/);
  const staleAsset = inputFor(docs); staleAsset.request.facets[0].asset_sha256 = "f".repeat(64);
  assert.throws(() => planRemediation(staleAsset), /stale asset/);
  const duplicate = inputFor(docs); duplicate.request.facets.push({ ...duplicate.request.facets[0] });
  assert.throws(() => planRemediation(duplicate), /duplicate media remediation item/);
  const badManifest = inputFor(docs); badManifest.mediaManifest.assets[facet.src].location = "repository";
  assert.throws(() => planRemediation(badManifest), /release media-manifest receipt/);
  const mismatchDocs = withVotes((id) => [vote(id, "presentation", "non-performance", "desk", "second-desk", { enforced: true })]);
  const mismatch = inputFor(mismatchDocs); mismatch.sources[0].still = { ...mismatch.sources[0].still, origin: "https://example.test/other" };
  assert.throws(() => planRemediation(mismatch), /differs between specimens and SOURCES/);
}

{
  const root = await mkdtemp(join(tmpdir(), "undercast-media-remediation-cli-"));
  try {
    const data = join(root, "data"), images = join(root, "images"), journalDir = join(data, "journal");
    await mkdir(images, { recursive: true }); await mkdir(journalDir, { recursive: true });
    const specimensPath = join(data, "specimens.json"), sourcesPath = join(data, "SOURCES.json"), manifestPath = join(data, "media-manifest.json"), scopesPath = join(data, "MEDIA-AUDIT-SCOPES.json"), statePath = join(data, "MEDIA-AUDIT.json"), lockPath = join(data, "MEDIA-AUDIT.lock"), remediationJournalPath = join(journalDir, "media-remediation.jsonl"), auditJournalPath = join(journalDir, "media-audit.jsonl"), requestPath = join(root, "request.json"), imagePath = join(images, "test-still.jpg");
    const docs = baseDocs();
    const scopes = { version: 3, scopes: [{ id: "star-trek", status: "active", match: { universe: "Star Trek" } }] };
    await writeFile(imagePath, imageBytes);
    await writeFile(auditJournalPath, "preserved-media-audit-journal\n");
    await writeFile(specimensPath, docs.specimensBytes); await writeFile(sourcesPath, docs.sourcesBytes); await writeFile(manifestPath, docs.manifestBytes); await writeFile(scopesPath, jsonBytes(scopes));
    const common = ["--root", root, "--state", statePath, "--specimens", specimensPath, "--sources", sourcesPath, "--media-manifest", manifestPath, "--scopes", scopesPath, "--lock", lockPath];
    const sync = spawnSync(process.execPath, [cli, "sync", ...common, "--now", "2026-07-22T00:00:00.000Z"], { encoding: "utf8" });
    assert.equal(sync.status, 0, `${sync.stdout}${sync.stderr}`);
    let audit = JSON.parse(await readFile(statePath, "utf8"));
    const item = audit.items.find((row) => row.side === "still");
    audit = applyVotes(audit, [vote(item.id, "presentation", "non-performance", "desk", "second-desk", { enforced: true })], { now: "2026-07-22T01:00:00.000Z" }).state;
    await writeFile(statePath, jsonBytes(audit));
    const auditBytes = await readFile(statePath);
    const request = { version: 1, scope: "star-trek", audit_state_sha256: sha256(auditBytes), requested_at: "2026-07-22T02:00:00.000Z", requested_by: "tier-desk-remediator", request_receipt: `git:fixture/remediation-request@${"6".repeat(40)}`, facets: [{ item_id: item.id, asset_sha256: item.asset.sha256 }] };
    await writeFile(requestPath, jsonBytes(request));
    const targets = [specimensPath, sourcesPath, statePath];
    const before = await Promise.all(targets.map((path) => readFile(path)));
    const failed = spawnSync(process.execPath, [cli, "remediate", ...common, "--remediation-journal", remediationJournalPath, "--input", requestPath], { encoding: "utf8", env: { ...process.env, MEDIA_AUDIT_TEST_FAIL_AFTER_COMMITS: "2" } });
    assert.notEqual(failed.status, 0, "injected transaction failure must fail");
    const afterFailure = await Promise.all(targets.map((path) => readFile(path)));
    assert.deepEqual(afterFailure, before, "partial canonical writes must roll back");
    await assert.rejects(readFile(remediationJournalPath), /ENOENT/, "new journal must be removed on rollback");
    const run = spawnSync(process.execPath, [cli, "remediate", ...common, "--remediation-journal", remediationJournalPath, "--input", requestPath], { encoding: "utf8" });
    assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
    assert.equal(JSON.parse(await readFile(specimensPath, "utf8"))[0].still, null);
    assert.equal(JSON.parse(await readFile(sourcesPath, "utf8"))[0].fetched_at, "2026-07-22");
    assert.equal(validateRemediationJournal(await readFile(remediationJournalPath)), 1);
    assert.deepEqual(await readFile(imagePath), imageBytes, "immutable image bytes must remain untouched");
    assert.deepEqual(await readFile(manifestPath), docs.manifestBytes, "immutable media manifest must remain untouched");
    assert.equal(await readFile(auditJournalPath, "utf8"), "preserved-media-audit-journal\n", "media-audit vote journal must remain untouched");
  } finally { await rm(root, { recursive: true, force: true }); }
}

console.log("PASS — media remediation eligibility, custody, staleness, manifest, journal, CLI, and atomic rollback fixtures");
