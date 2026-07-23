#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  MEDIA_AUDIT_VERSION,
  deriveItem,
  mediaItemId,
  sha256,
  stableJson,
  summarize,
  validateState,
} from "./lib/media-audit.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "media-audit-campaign.mjs");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

async function put(root, path, value) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.isBuffer(value) ? value : jsonBytes(value));
}

function stateItem({ wallId, side, actor, character, asset, fetchedAt = "2026-07-23" }) {
  const raw = {
    id: mediaItemId("star-trek", wallId, side),
    scope: "star-trek",
    wall_id: wallId,
    side,
    actor,
    character,
    expected_subject: side === "still" ? character : actor,
    source_fetched_at: fetchedAt,
    asset,
    risk_codes: [],
    votes: [],
    status: "review",
    claims: { identity: null, presentation: null },
  };
  const derived = deriveItem(raw);
  raw.status = derived.status;
  raw.claims = derived.claims;
  return raw;
}

async function buildFixture(root, mutate = null) {
  const stillBytes = Buffer.from("still bytes");
  const portraitBytes = Buffer.from("portrait bytes");
  await put(root, "images/uc-test-still.jpg", stillBytes);
  await put(root, "images/uc-test-portrait.jpg", portraitBytes);
  const still = { src: "images/uc-test-still.jpg", origin: "https://example.test/wiki/File:Character.jpg", kind: "still" };
  const portrait = { src: "images/uc-test-portrait.jpg", origin: "https://example.test/wiki/File:Performer.jpg", kind: "free" };
  const specimens = [{
    id: "UC-TEST",
    character: "Example Character",
    actor: "Example Performer",
    production: "Example Production",
    universe: "Star Trek",
    years: "2026",
    designer: "Example Maker",
    transform: 4,
    knownFor: "Fixture.",
    reveal: "Fixture.",
    link: "https://example.test/wiki/Example",
    still,
    portrait,
    references: [{ claim: "performance", label: "Fixture", source: "https://example.test/wiki/Example" }],
  }];
  const sources = [{ id: "UC-TEST", actor: "Example Performer", character: "Example Character", universe: "Star Trek", still: { ...still }, portrait: { ...portrait }, fetched_at: "2026-07-23" }];
  const manifest = { version: 1, assets: [] };
  const scopes = { version: 2, scopes: [{ id: "star-trek", label: "Star Trek", status: "active", match: { universe: "Star Trek" }, block_new_autopilot_leases_until_complete: true, facets: ["still", "portrait"] }] };
  if (mutate) mutate({ specimens, sources, manifest, scopes });

  const specimenBytes = jsonBytes(specimens);
  const sourceBytes = jsonBytes(sources);
  const manifestBytes = jsonBytes(manifest);
  const scopeBytes = jsonBytes(scopes);
  await put(root, "data/specimens.json", specimenBytes);
  await put(root, "data/SOURCES.json", sourceBytes);
  await put(root, "data/media-manifest.json", manifestBytes);
  await put(root, "data/MEDIA-AUDIT-SCOPES.json", scopeBytes);
  await put(root, "data/journal/media-audit.jsonl", Buffer.alloc(0));

  const stillReceipt = { ...still, sha256: sha256(stillBytes), bytes: stillBytes.length };
  const portraitReceipt = { ...portrait, sha256: sha256(portraitBytes), bytes: portraitBytes.length };
  const items = [
    stateItem({ wallId: "UC-TEST", side: "portrait", actor: "Example Performer", character: "Example Character", asset: portraitReceipt }),
    stateItem({ wallId: "UC-TEST", side: "still", actor: "Example Performer", character: "Example Character", asset: stillReceipt }),
  ].sort((a, b) => a.side.localeCompare(b.side));
  const setRows = items.map(({ id, scope, wall_id, side, expected_subject, asset, risk_codes }) => ({ id, scope, wall_id, side, expected_subject, asset, risk_codes }));
  const state = {
    version: MEDIA_AUDIT_VERSION,
    source: {
      specimens_path: "data/specimens.json",
      specimens_sha256: sha256(specimenBytes),
      sources_path: "data/SOURCES.json",
      sources_sha256: sha256(sourceBytes),
      media_manifest_path: "data/media-manifest.json",
      media_manifest_sha256: sha256(manifestBytes),
      scopes_path: "data/MEDIA-AUDIT-SCOPES.json",
      scopes_sha256: sha256(scopeBytes),
      item_set_sha256: sha256(stableJson(setRows)),
    },
    updated_at: "2026-07-23T00:00:00.000Z",
    items,
  };
  validateState(state);
  await put(root, "data/MEDIA-AUDIT.json", state);

  const receipt = {
    version: 1,
    scope: "star-trek",
    source: {
      item_set_sha256: state.source.item_set_sha256,
      specimens_sha256: state.source.specimens_sha256,
      sources_sha256: state.source.sources_sha256,
      media_manifest_sha256: state.source.media_manifest_sha256,
    },
    counts: { total: 2, verify: 1, null: 1 },
    rows: [
      { item_id: items.find((row) => row.side === "portrait").id, asset_sha256: portraitReceipt.sha256, disposition: "verify" },
      { item_id: items.find((row) => row.side === "still").id, asset_sha256: stillReceipt.sha256, disposition: "null" },
    ],
  };
  const receiptBytes = jsonBytes(receipt);
  await put(root, "data/review/receipt.json", receiptBytes);
  const campaign = {
    version: MEDIA_AUDIT_VERSION,
    scope: "star-trek",
    reviewed_by: "fixture-desk",
    reviewed_role: "second-desk",
    reviewed_at: "2026-07-23T01:00:00.000Z",
    machine_reviewer: "fixture-bot",
    source: { ...receipt.source },
    source_receipt: { path: "data/review/receipt.json", sha256: sha256(receiptBytes) },
    expected_result: { total: 2, verified: 1, absent: 1, review: 0, attention: 0 },
    remediations: [{
      item_id: items.find((row) => row.side === "still").id,
      asset_sha256: stillReceipt.sha256,
      reason: "The fixture still is intentionally removed to test reversible nulling.",
      evidence: [{ type: "fixture", value: "negative presentation review" }],
    }],
    approvals: [{
      item_id: items.find((row) => row.side === "portrait").id,
      asset_sha256: portraitReceipt.sha256,
      identity_note: "Revision-bound fixture metadata identifies the expected performer without appearance inference.",
      identity_evidence: [{ type: "source-revision", value: "fixture@1" }],
      presentation: "neutral-human",
      presentation_note: "Fixture presentation review shows one neutral human portrait without ambiguity.",
      presentation_evidence: [{ type: "contact-sheet", value: "fixture-sheet#1" }],
    }],
  };
  await put(root, "data/review/campaign.json", campaign);
  return { campaign };
}

function run(root, expected = 0) {
  const result = spawnSync(process.execPath, [CLI, "--input", "data/review/campaign.json", "--root", root], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== expected) {
    throw new Error(`campaign exited ${result.status}, expected ${expected}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result;
}

const roots = [];
try {
  {
    const root = await mkdtemp(join(tmpdir(), "undercast-media-campaign-success-"));
    roots.push(root);
    await buildFixture(root);
    run(root);
    const state = JSON.parse(await readFile(join(root, "data/MEDIA-AUDIT.json"), "utf8"));
    const summary = summarize(state, "star-trek");
    assert.deepEqual({ verified: summary.verified, absent: summary.absent, review: summary.review, attention: summary.attention }, { verified: 1, absent: 1, review: 0, attention: 0 });
    const specimens = JSON.parse(await readFile(join(root, "data/specimens.json"), "utf8"));
    const sources = JSON.parse(await readFile(join(root, "data/SOURCES.json"), "utf8"));
    assert.equal(specimens[0].still, null);
    assert.equal(sources[0].still, null);
    assert.ok(specimens[0].portrait);
    const remediation = (await readFile(join(root, "data/journal/media-remediation.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(remediation.length, 1);
    assert.ok(remediation[0].previous_specimen_asset);
    assert.ok(remediation[0].previous_source_asset);
    assert.equal(remediation[0].reviewed_role, "second-desk");
  }
  {
    const root = await mkdtemp(join(tmpdir(), "undercast-media-campaign-stale-"));
    roots.push(root);
    const { campaign } = await buildFixture(root);
    campaign.source.item_set_sha256 = "f".repeat(64);
    await put(root, "data/review/campaign.json", campaign);
    const before = await readFile(join(root, "data/specimens.json"));
    const failed = run(root, 1);
    assert.match(failed.stderr, /campaign is stale/);
    assert.deepEqual(await readFile(join(root, "data/specimens.json")), before);
  }
  {
    const root = await mkdtemp(join(tmpdir(), "undercast-media-campaign-authority-"));
    roots.push(root);
    const { campaign } = await buildFixture(root);
    campaign.reviewed_role = "reviewer";
    await put(root, "data/review/campaign.json", campaign);
    const failed = run(root, 1);
    assert.match(failed.stderr, /second-desk or owner/);
  }
  {
    const root = await mkdtemp(join(tmpdir(), "undercast-media-campaign-coverage-"));
    roots.push(root);
    const { campaign } = await buildFixture(root);
    campaign.approvals = [];
    await put(root, "data/review/campaign.json", campaign);
    const failed = run(root, 1);
    assert.match(failed.stderr, /cover every current open facet/);
  }
  {
    const root = await mkdtemp(join(tmpdir(), "undercast-media-campaign-mirror-"));
    roots.push(root);
    await buildFixture(root, ({ sources }) => { sources[0].still.origin = "https://wrong.example.test/file"; });
    const failed = run(root, 1);
    assert.match(failed.stderr, /canonical media mismatch|differs between specimens and SOURCES|media-audit state is stale/);
  }
  console.log("PASS — exact media campaign authority, staleness, complete coverage, reversible nulling, consensus, and canonical mirror contracts");
} finally {
  for (const root of roots) await rm(root, { recursive: true, force: true });
}
