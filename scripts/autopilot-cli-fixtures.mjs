#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "autopilot.mjs");
const json = (value) => JSON.stringify(value, null, 2) + "\n";

function harness(root) {
  async function put(path, value) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, typeof value === "string" ? value : json(value));
  }
  function run(args, { expect = 0 } = {}) {
    const result = spawnSync(process.execPath, [CLI, ...args, "--root", root], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
    });
    if (result.status !== expect) {
      throw new Error(`autopilot ${args.join(" ")} exited ${result.status}, expected ${expect}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    }
    return result;
  }
  return { put, run };
}

// Synthetic producer, adapter and queue state for one paused, uncertified Star Trek scope.
async function seed(put, root, { requireSourceSnapshot = false } = {}) {
  await put("scripts/census-key.mjs", "export const key = 1;\n");
  await put("scripts/census-fixtures.mjs", "console.log('PASS — synthetic producer fixtures');\n");
  await put("scripts/lib/census-core.mjs", "export const parser = 1;\n");
  await put("scripts/census.mjs", `
import { readFile, writeFile } from "node:fs/promises";
const coverage = JSON.parse(await readFile("data/CENSUS-COVERAGE.json", "utf8"));
coverage[0].category = "Individuals";
await writeFile("data/CENSUS-COVERAGE.json", JSON.stringify(coverage, null, 2) + "\\n");
const manifest = JSON.parse(await readFile("data/CENSUS-MANIFEST.json", "utf8"));
manifest.observations[0].revision = 21;
manifest.observations[0].content_sha256 = "b".repeat(64);
manifest.observations[0].observed_at = "2026-07-22T00:00:00Z";
await writeFile("data/CENSUS-MANIFEST.json", JSON.stringify(manifest, null, 2) + "\\n");
console.log("PASS — synthetic census refresh");
`);
  await put("scripts/shard.mjs", "console.log('PASS — synthetic projection rebuild');\n");
  await put("scripts/validate.mjs", "console.log('PASS — synthetic archive gate');\n");
  await put("scripts/waterline.mjs", `
import { existsSync } from "node:fs";
const required = ["--config", "--state", "--journal", "--autopilot", "--autopilot-journal", "--media-audit", "--roadmap-state", "--preservation", "--root", "--requested"];
for (const flag of required) if (!process.argv.includes(flag)) {
  console.error("missing waterline binding " + flag);
  process.exit(4);
}
if (existsSync("data/WATERLINE-BLOCK")) {
  console.error("synthetic rolling waterline blocker");
  process.exit(2);
}
console.log("PASS — synthetic rolling waterline");
`);

  await put("data/AUTOPILOT-SCOPES.json", {
    version: 1,
    scopes: [{
      id: "star-trek",
      label: "Star Trek",
      status: "paused",
      priority: 1000,
      coverage_match: { franchise: "Star Trek" },
      refresh: { executable: "node", args: ["scripts/census.mjs", "star-trek"], cadence_days: 7 },
      certification: {
        producer_files: [
          "scripts/census-fixtures.mjs",
          "scripts/census-key.mjs",
          "scripts/census.mjs",
          "scripts/lib/census-core.mjs",
        ],
        checks: [{ label: "producer fixtures", executable: "node", args: ["scripts/census-fixtures.mjs"] }],
        require_manifest_receipts: true,
        ...(requireSourceSnapshot ? { require_source_snapshot: true } : {}),
      },
    }],
  });
  await put("data/AUTOPILOT-CERTIFICATIONS.json", { version: 1, certifications: [] });
  await put("data/AUTOPILOT-CAPABILITIES.json", {
    version: 1,
    capabilities: [{ id: "audio-listening", description: "Synthetic audio capability." }],
    profiles: [{
      id: "text-vision", label: "Text and vision", status: "active", capabilities: [],
      note: "Synthetic reviewed text and image profile.", reviewed_by: "second-desk", reviewed_role: "second-desk", reviewed_at: "2026-07-21T00:00:00Z",
    }],
    rules: [],
    task_overrides: [],
  });
  await put("preservation/SNAPSHOTS.json", {
    version: 1,
    updated_at: "",
    history_guard: {
      baseline_manifest_sha256: "f".repeat(64),
      status: "awaiting-independent-copy",
      precondition_met: false,
      destructive_rewrite_authorized: false,
    },
    snapshots: [],
  });
  await put("data/AUTOPILOT.json", {
    version: 1,
    source: {
      coverage_path: "data/CENSUS-COVERAGE.json",
      coverage_sha256: "",
      scopes_path: "data/AUTOPILOT-SCOPES.json",
      certifications_path: "data/AUTOPILOT-CERTIFICATIONS.json",
      manifest_path: "data/CENSUS-MANIFEST.json",
      drafts_path: "data/drafts.json",
      specimens_path: "data/specimens.json",
      growth_rejections_path: "data/journal/rejections.jsonl",
    },
    updated_at: "",
    jobs: [],
  });
  const originalCoverage = [{
    franchise: "Star Trek",
    category: "Ferengi",
    character: "Brunt",
    performer: "Jeffrey Combs",
    performance_mode: "physical-prosthetic",
    source: "https://memory-alpha.fandom.com/wiki/Brunt",
    performer_on_wall: false,
    role_on_wall: false,
    wall_ids: [],
  }];
  await put("data/CENSUS-COVERAGE.json", originalCoverage);
  await put("data/CENSUS-MANIFEST.json", {
    observations: [{
      franchise: "Star Trek",
      category: "Ferengi",
      title: "Brunt",
      source: originalCoverage[0].source,
      pageid: 10,
      revision: 20,
      timestamp: "2026-07-01T00:00:00Z",
      observed_at: "2026-07-01T00:00:00Z",
      content_sha256: "a".repeat(64),
      disposition: "credited",
    }],
  });
  await put("data/drafts.json", []);
  await put("data/specimens.json", []);
  await put("data/SOURCES.json", []);
  await put("data/journal/rejections.jsonl", "");
  await mkdir(join(root, ".luna"), { recursive: true });
}

const root = await mkdtemp(join(tmpdir(), "undercast-autopilot-cli-"));
const { put, run } = harness(root);

try {
  await seed(put, root);

  run(["readiness", "--scope", "star-trek", "--require-active"], { expect: 1 });
  run(["certify", "--scope", "star-trek", "--reviewed-by", "second-desk", "--activate", "--now", "2026-07-21T00:00:00Z"]);
  run(["sync", "--now", "2026-07-21T00:00:00Z"]);
  const before = JSON.parse(run(["readiness", "--scope", "star-trek", "--json", "--now", "2026-07-21T00:00:00Z"]).stdout)[0];
  assert.equal(before.refresh.due, true);

  run(["refresh", "--due", "--refreshed-by", "undercast-bot", "--now", "2026-07-21T00:00:00Z"]);
  const after = JSON.parse(run(["readiness", "--scope", "star-trek", "--json", "--now", "2026-07-22T01:00:00Z"]).stdout)[0];
  assert.notEqual(after.lease_token, before.lease_token, "refresh rotates the scope-local lease token");
  assert.equal(after.refresh.due, false);

  await put("data/WATERLINE-BLOCK", "blocked\n");
  const waterlineBlocked = run([
    "claim", "--agent", "luna", "--scope", "star-trek", "--capability-profile", "text-vision", "--limit", "1",
    "--now", "2026-07-22T01:30:00Z",
  ], { expect: 1 });
  assert.match(waterlineBlocked.stderr, /rolling gold waterline/);
  await rm(join(root, "data/WATERLINE-BLOCK"));

  const missingProfile = run([
    "claim", "--agent", "luna", "--scope", "star-trek", "--limit", "1",
    "--now", "2026-07-22T01:45:00Z",
  ], { expect: 1 });
  assert.match(missingProfile.stderr, /capability-profile/);
  const candidates = JSON.parse(run([
    "candidates", "--scope", "star-trek", "--capability-profile", "text-vision", "--json",
  ]).stdout);
  assert.equal(candidates.compatible[0].character, "Brunt");

  run([
    "claim", "--agent", "luna", "--scope", "star-trek", "--capability-profile", "text-vision", "--limit", "1",
    "--out", ".luna/batch.json", "--prompt", ".luna/PROMPT.md", "--now", "2026-07-22T02:00:00Z",
  ]);
  const batch = JSON.parse(await readFile(join(root, ".luna/batch.json"), "utf8"));
  const task = batch.tasks[0];
  await put(".luna/results.json", {
    version: 1,
    lease_id: batch.lease_id,
    agent: "luna",
    results: [{
      task_id: task.id,
      decision: "draft",
      draft: {
        character: task.character,
        actor: task.performer,
        production: "Star Trek: Deep Space Nine",
        universe: "Star Trek",
        years: "1995–99",
        designer: "Michael Westmore",
        transform: 5,
        kind: "face",
        knownFor: "Ferengi Commerce Authority liquidator.",
        reveal: "Jeffrey Combs disappears beneath the Ferengi appliances. The exact role remains independently sourced.",
        references: [{ claim: "performance", label: "Jeffrey Combs portrayed Brunt", source: task.sources[0] }],
        wiki: "https://en.wikipedia.org/wiki/Jeffrey_Combs",
      },
    }],
  });

  const changedCoverage = structuredClone(JSON.parse(await readFile(join(root, "data/CENSUS-COVERAGE.json"), "utf8")));
  changedCoverage[0].category = "Ferengi";
  await put("data/CENSUS-COVERAGE.json", changedCoverage);
  const stale = run(["submit", "--batch", ".luna/batch.json", "--input", ".luna/results.json"], { expect: 1 });
  assert.match(stale.stderr, /different producer or census snapshot/);
  changedCoverage[0].category = "Individuals";
  await put("data/CENSUS-COVERAGE.json", changedCoverage);
  run(["submit", "--batch", ".luna/batch.json", "--input", ".luna/results.json", "--now", "2026-07-22T03:00:00Z"]);

  const state = JSON.parse(await readFile(join(root, "data/AUTOPILOT.json"), "utf8"));
  const drafts = JSON.parse(await readFile(join(root, "data/drafts.json"), "utf8"));
  const journal = (await readFile(join(root, "data/journal/autopilot.jsonl"), "utf8"))
    .trim().split("\n").filter(Boolean).map(JSON.parse);
  assert.equal(state.jobs[0].status, "drafted");
  assert.match(drafts[0]._autopilot.readiness_token, /^[0-9a-f]{64}$/);
  assert.match(drafts[0]._autopilot.source_fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(journal.some((row) => row.op === "scope.certified"));
  assert.ok(journal.some((row) => row.op === "scope.refreshed"));

  console.log("PASS — CLI certification, capability-profile refusal and candidates, rolling-waterline refusal, due refresh, token rotation, stale-submit refusal, and durable draft receipts");
} finally {
  await rm(root, { recursive: true, force: true });
}

// A scope certified with require_source_snapshot stays certified after its census moves
// past the last receipted snapshot, but it can neither lease nor be refreshed into
// readiness. The scheduled `refresh --due` must report that as idle (exit 3) with the
// operator action named, not fail; an explicit --scope still fails closed.
const snapshotRoot = await mkdtemp(join(tmpdir(), "undercast-autopilot-cli-snapshot-"));
try {
  const { put, run } = harness(snapshotRoot);
  await seed(put, snapshotRoot, { requireSourceSnapshot: true });
  const unreceipted = JSON.parse(run(["readiness", "--scope", "star-trek", "--json", "--now", "2026-07-21T00:00:00Z"]).stdout)[0];
  assert.match(unreceipted.snapshot_details.manifest_sha256, /^[0-9a-f]{64}$/);
  await put("preservation/SNAPSHOTS.json", {
    version: 1,
    updated_at: "2026-07-20T00:00:00Z",
    history_guard: { baseline_manifest_sha256: "f".repeat(64), status: "awaiting-independent-copy", precondition_met: false, destructive_rewrite_authorized: false },
    snapshots: [{
      id: "preservation-fixture-20260720", status: "pending", created_at: "2026-07-20T00:00:00Z",
      repository_commit: "8".repeat(40), census_manifest_sha256: "7".repeat(64), baseline_manifest_sha256: "f".repeat(64),
      scopes: { "star-trek": { manifest_sha256: unreceipted.snapshot_details.manifest_sha256 } },
      public_release: { tag: "preservation-fixture-20260720", assets: [
        { kind: "source-bag", name: "sources.tar.gz", url: "https://example.test/sources.tar.gz", sha256: "6".repeat(64), bytes: 10 },
        { kind: "repository-snapshot", name: "repo.tar.gz", url: "https://example.test/repo.tar.gz", sha256: "5".repeat(64), bytes: 20 },
      ] },
      independent_copies: [],
    }],
  });
  run(["certify", "--scope", "star-trek", "--reviewed-by", "second-desk", "--activate", "--now", "2026-07-21T00:00:00Z"]);
  run(["sync", "--now", "2026-07-21T00:00:00Z"]);
  const receipted = JSON.parse(run(["readiness", "--scope", "star-trek", "--json", "--now", "2026-07-21T00:00:00Z"]).stdout)[0];
  assert.equal(receipted.lease_status, "ready", "a receipted current snapshot leases");
  assert.equal(receipted.refresh.due, true);

  // The synthetic census moves the manifest to a revision no snapshot has receipted.
  run(["refresh", "--due", "--refreshed-by", "undercast-bot", "--now", "2026-07-21T00:00:00Z"]);
  const moved = JSON.parse(run(["readiness", "--scope", "star-trek", "--json", "--now", "2026-07-30T00:00:00Z"]).stdout)[0];
  assert.equal(moved.effective_status, "active", "certification survives the refresh");
  assert.equal(moved.lease_status, "blocked");
  assert.deepEqual(moved.reasons, ["source_snapshot_missing"]);
  assert.equal(moved.refresh.due, true);

  const idle = run(["refresh", "--due", "--refreshed-by", "undercast-bot", "--now", "2026-07-30T00:00:00Z"], { expect: 3 });
  assert.match(idle.stdout, /scope star-trek is due but its current census manifest [0-9a-f]{64} has no preservation receipt/);
  assert.match(idle.stdout, /preservation-export/);
  assert.match(idle.stdout, /no certified scope is refreshable until its source snapshot is receipted/);
  const explicit = run(["refresh", "--scope", "star-trek", "--refreshed-by", "undercast-bot", "--now", "2026-07-30T00:00:00Z"], { expect: 1 });
  assert.match(explicit.stderr, /source_snapshot_missing/, "an explicit scope still fails closed");

  const journal = (await readFile(join(snapshotRoot, "data/journal/autopilot.jsonl"), "utf8"))
    .trim().split("\n").filter(Boolean).map(JSON.parse);
  assert.equal(journal.filter((row) => row.op === "scope.refreshed").length, 1, "the skipped run writes no refresh receipt");
  const manifest = JSON.parse(await readFile(join(snapshotRoot, "data/CENSUS-MANIFEST.json"), "utf8"));
  assert.equal(manifest.observations[0].revision, 21, "the skipped run does not rerun the producer");
  console.log("PASS — CLI due refresh skips a certified scope awaiting its source snapshot, names the preservation export, and still refuses an explicit refresh");
} finally {
  await rm(snapshotRoot, { recursive: true, force: true });
}
