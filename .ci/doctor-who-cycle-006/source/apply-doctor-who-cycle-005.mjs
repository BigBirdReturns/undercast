#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const TASK_ID = "ap_ed7221a03fdd4679379e23f8";
const ACTOR = "Dan Starkey";
const CHARACTER = "Kaarsh";
const SOURCE = "https://tardis.fandom.com/wiki/Kaarsh";
const PRODUCTION_SOURCE = "https://tardis.fandom.com/wiki/The_Gunpowder_Plot_(video_game)";
const SOURCE_FINGERPRINT = "ba3075acf7a348064e8e11359afa0ecc35fa231f8867e8c9496e101884366d43";
const SOURCE_PAGE_ID = 89948;
const SOURCE_REVISION = 2331498;
const SOURCE_TIMESTAMP = "2017-06-05T17:53:32Z";
const SOURCE_CONTENT_SHA256 = "a656f352afef65b58a8945b08b0fbf869c6943a932125643cb60e236ff7cd3d4";

const STILL_VERIFICATION_RUN = 30885200254;
const STILL_VERIFICATION_JOB = 91914756059;
const STILL_VERIFICATION_ARTIFACT_ID = 8882817870;
const STILL_VERIFICATION_ARTIFACT_SHA256 = "36e441d5b56a8e0bff8d3932426e29c2f49d747d3bc4834917729a8fe1f34c4a";
const PREFLIGHT_RUN = 30884868963;
const PREFLIGHT_ARTIFACT_SHA256 = "bcf901d245e86e29dace2c3b890e6992948445f18d6e7abb6444413e31bb9d65";
const STILL_SOURCE_SHA256 = "e1300bbbea2f5bde0cfb6596b30e37f97018299bedf131514001e0ed996492da";
const STILL_SHA256 = "ccf68328d7cbb9a84844b4693c0e3029fb1200d5869513b0ecf68d7228af0cad";
const STILL_PAGE_ID = 91567;
const STILL_ORIGIN = "https://tardis.fandom.com/wiki/File:Kaarsh.jpg";
const STILL_SOURCE_WIDTH = 778;
const STILL_SOURCE_HEIGHT = 454;
const STILL_WIDTH = 640;
const STILL_HEIGHT = 373;
const STILL_BYTES = 41459;
const ASSET_DIR = process.env.CYCLE_ASSET_DIR || "/tmp/doctor-who-cycle-005";
const PREPARED_STILL_PATH = join(ASSET_DIR, "kaarsh-still-candidate.jpg");
const PREPARED_VERIFICATION_PATH = join(ASSET_DIR, "kaarsh-still-verification.json");
const CYCLE004_STILL_CHECKER_PATH = "scripts/doctor-who-cycle-004-still-correction.mjs";
const CYCLE004_STILL_CHECKER_TEMPLATE_PATH = join(ASSET_DIR, "doctor-who-cycle-004-still-correction-composable.mjs");
const CYCLE004_STILL_CHECKER_SHA256_BEFORE = "1e21cd5424c713db6bee1855af91622225661f29d6afc873186bf6e0f3b8f3ec";
const CYCLE004_STILL_CHECKER_SHA256_AFTER = "31df003f52705fa94f74bf06158dfa8813752be4547d87593a664f1a0f3d88a4";
const CYCLE004_STILL_CORRECTION_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-004-jask-audio-still-correction.json";
const CYCLE004_STILL_CORRECTION_RECEIPT_FILE_SHA256 = "c83e49859d358e46255935aa6fd8a8295981e18e0bb75acd492fa7904be29d42";
const CYCLE004_STILL_CORRECTION_MERGE = "84688c5308db55aae6a97a753d593aa15fe91d37";
const CYCLE004_STILL_COMPOSABILITY_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-004-still-correction-composability.json";

const SCOPE = "doctor-who";
const PROFILE = "text-vision";
const EXPECTED_TOTAL = 316;
const EXPECTED_BEFORE_QUEUED = 312;
const EXPECTED_BEFORE_RESOLVED = 4;
const EXPECTED_AFTER_QUEUED = 311;
const EXPECTED_AFTER_RESOLVED = 5;
const CONTEXT_PATH = process.env.CYCLE_CONTEXT || "/tmp/doctor-who-cycle-005-context.json";
const BASE_MAIN = process.env.EXACT_MAIN;
const ATTESTED_MAIN = process.env.ATTESTED_MAIN;
const LAUNCHER_HEAD = process.env.AUTHORIZED_HEAD;
const cycleAt = new Date(process.env.CYCLE_AT || "");
if (!/^[0-9a-f]{40}$/i.test(BASE_MAIN || "")) throw new Error("EXACT_MAIN must be a full commit SHA");
if (!/^[0-9a-f]{40}$/i.test(ATTESTED_MAIN || "")) throw new Error("ATTESTED_MAIN must be a full commit SHA");
if (!/^[0-9a-f]{40}$/i.test(LAUNCHER_HEAD || "")) throw new Error("AUTHORIZED_HEAD must be a full commit SHA");
if (!Number.isFinite(cycleAt.getTime())) throw new Error("CYCLE_AT must be a valid timestamp");
const at = (minutes) => new Date(cycleAt.getTime() + minutes * 60_000).toISOString();
const CLAIMED_AT = at(1);
const SUBMITTED_AT = at(2);
const SOURCE_FETCHED_AT = at(3).slice(0, 10);
const MERGED_AT = at(4);
const MEDIA_SYNCED_AT = at(5);
const MEDIA_RESOLVED_AT = at(6);
const MEDIA_REVIEWED_AT = at(7);
const CANDIDATE_AT = at(8);
const REVIEWED_AT = at(9);
const FINAL_AT = at(10);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const readJsonl = async (file) => (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const writeJson = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const digestJobs = (jobs) => sha256(Buffer.from(JSON.stringify([...jobs].map(({ last_seen_coverage_sha256, ...row }) => row).sort((a, b) => a.id.localeCompare(b.id)))));
const digestRows = (rows) => sha256(Buffer.from(stableJson(rows)));
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, ...(options.env || {}) },
  });
  if (result.error || result.status !== 0) {
    const detail = options.capture ? `\nstdout:\n${result.stdout || ""}\nstderr:\n${result.stderr || ""}` : "";
    throw new Error(`${command} ${args.join(" ")} failed (${result.status ?? result.error?.message})${detail}`);
  }
  return result.stdout || "";
};
const runNode = (script, args = [], options = {}) => run(process.execPath, [script, ...args], options);
const statusCounts = (jobs) => Object.fromEntries(Object.entries(jobs.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {})).sort(([a], [b]) => a.localeCompare(b)));
const coverageKey = (row) => [row.franchise, row.category, row.character, row.performer, row.performance_mode, row.source].join("|");
async function walkFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

await mkdir(".luna", { recursive: true });

const cycle004StillCheckerBefore = await readFile(CYCLE004_STILL_CHECKER_PATH);
assert.equal(sha256(cycle004StillCheckerBefore), CYCLE004_STILL_CHECKER_SHA256_BEFORE, "cycle-004 still-correction checker changed before the composability repair");
assert.equal(sha256(await readFile(CYCLE004_STILL_CORRECTION_RECEIPT_PATH)), CYCLE004_STILL_CORRECTION_RECEIPT_FILE_SHA256, "cycle-004 still-correction receipt changed before the composability repair");
const cycle004StillCheckerAfter = await readFile(CYCLE004_STILL_CHECKER_TEMPLATE_PATH);
assert.equal(sha256(cycle004StillCheckerAfter), CYCLE004_STILL_CHECKER_SHA256_AFTER, "transported cycle-004 still-correction composability checker drifted");
await writeFile(CYCLE004_STILL_CHECKER_PATH, cycle004StillCheckerAfter);
runNode(CYCLE004_STILL_CHECKER_PATH, [], { env: { CYCLE004_STILL_COMPOSABILITY_CANDIDATE: "1" } });

const before = {
  specimens: await readJson("data/specimens.json"),
  sources: await readJson("data/SOURCES.json"),
  coverage: await readJson("data/CENSUS-COVERAGE.json"),
  coverageBytes: await readFile("data/CENSUS-COVERAGE.json"),
  manifestBytes: await readFile("data/CENSUS-MANIFEST.json"),
  autopilot: await readJson("data/AUTOPILOT.json"),
  autopilotJournal: await readJsonl("data/journal/autopilot.jsonl"),
  audit: await readJson("data/MEDIA-AUDIT.json"),
  waterline: await readJson("data/WATERLINE-STATE.json"),
};
const beforeDoctor = before.autopilot.jobs.filter((row) => row.scope === SCOPE);
const beforeTask = beforeDoctor.find((row) => row.id === TASK_ID);
const beforeKaarshCoverage = before.coverage.find((row) => coverageKey(row) === ["Doctor Who", "Sontarans", CHARACTER, ACTOR, "voice", SOURCE].join("|"));
assert.ok(beforeTask, "exact Kaarsh task is missing");
assert.ok(beforeKaarshCoverage, "exact Kaarsh coverage row is missing");
assert.equal(beforeKaarshCoverage.role_on_wall, false);
assert.deepEqual(beforeKaarshCoverage.wall_ids, []);
assert.equal(beforeTask.status, "queued", "Kaarsh task is not queued");
assert.equal(beforeTask.performer, ACTOR);
assert.equal(beforeTask.character, CHARACTER);
assert.deepEqual(beforeTask.performance_modes, ["voice"]);
assert.deepEqual(beforeTask.sources, [SOURCE]);
assert.equal(beforeTask.source_fingerprint, SOURCE_FINGERPRINT);
assert.equal(beforeTask.source_receipts?.length, 1, "Kaarsh task must have one exact source receipt");
assert.deepEqual(beforeTask.source_receipts[0], {
  source: SOURCE,
  pageid: SOURCE_PAGE_ID,
  revision: SOURCE_REVISION,
  timestamp: SOURCE_TIMESTAMP,
  content_sha256: SOURCE_CONTENT_SHA256,
});
assert.deepEqual(statusCounts(beforeDoctor), { queued: EXPECTED_BEFORE_QUEUED, resolved: EXPECTED_BEFORE_RESOLVED });
assert.equal(beforeDoctor.length, EXPECTED_TOTAL);
assert.equal(before.specimens.filter((row) => row.actor === ACTOR && row.character === CHARACTER).length, 0, "Kaarsh is already on the wall");
assert.equal(before.autopilotJournal.filter((row) => row.op === "lease.claimed" && row.scope === SCOPE).length, 4, "pre-cycle Doctor Who claim denominator drifted");
assert.equal(before.waterline.cycles.filter((row) => row.scope_id === SCOPE).length, 4, "pre-cycle Doctor Who receipt denominator drifted");
const existingIds = before.specimens.map((row) => Number(String(row.id).replace(/^UC-/, ""))).filter(Number.isFinite);
const expectedWallId = `UC-${String(Math.max(...existingIds) + 1).padStart(3, "0")}`;
assert.equal(expectedWallId, "UC-1350", "cycle 005 no longer owns the expected next canonical wall ID");
const beforeDoctorItems = before.audit.items.filter((row) => row.scope === SCOPE);
assert.equal(beforeDoctorItems.length, 8, "pre-cycle Doctor Who media denominator drifted");
assert.ok(beforeDoctorItems.every((row) => ["verified", "absent"].includes(row.status)), "pre-cycle Doctor Who media debt exists");

const nonDoctorJobsBefore = digestJobs(before.autopilot.jobs.filter((row) => row.scope !== SCOPE));
const starTrekJobsBefore = digestJobs(before.autopilot.jobs.filter((row) => row.scope === "star-trek"));
const oldSpecimensById = new Map(before.specimens.map((row) => [row.id, stableJson(row)]));
const oldSourcesById = new Map(before.sources.map((row) => [row.id, stableJson(row)]));
const oldAuditById = new Map(before.audit.items.map((row) => [row.id, stableJson(row)]));

runNode("scripts/autopilot.mjs", [
  "next",
  "--agent", "luna",
  "--scope", SCOPE,
  "--capability-profile", PROFILE,
  "--task-id", TASK_ID,
  "--selection-basis", "Current-main cycle-005 preflight plus strict allowlisted main-drift re-attestation selected the deterministic first source-preserved compatible Kaarsh voice obligation.",
  "--limit", "1",
  "--lease-minutes", "240",
  "--out", ".luna/batch.json",
  "--prompt", ".luna/PROMPT.md",
  "--now", CLAIMED_AT,
]);
const batch = await readJson(".luna/batch.json");
assert.equal(batch.tasks?.length, 1);
assert.equal(batch.tasks[0].id, TASK_ID);
assert.equal(batch.tasks[0].source_fingerprint, SOURCE_FINGERPRINT);
assert.deepEqual(batch.tasks[0].source_receipts, beforeTask.source_receipts);
assert.equal(batch.selection?.profile_id, PROFILE);
assert.equal(batch.selection?.strategy, "reviewed-task");
assert.equal(batch.selection?.requested_task_id, TASK_ID);
assert.deepEqual(batch.tasks[0].required_capabilities, []);
assert.match(batch.lease_id || "", /^lease_[0-9a-f]{24}$/);

const results = {
  version: batch.version,
  lease_id: batch.lease_id,
  agent: batch.agent,
  results: [{
    task_id: TASK_ID,
    decision: "draft",
    draft: {
      character: CHARACTER,
      actor: ACTOR,
      production: "The Gunpowder Plot",
      universe: "Doctor Who",
      years: "2011",
      designer: "Sumo Digital",
      transform: 2,
      kind: "voice",
      knownFor: "Kaarsh in the 2011 Doctor Who Adventure Game The Gunpowder Plot.",
      reveal: "The revision-bound source identifies Dan Starkey as Kaarsh’s voice actor and names the exact Kaarsh.jpg character image. The character still supports Kaarsh depiction; no existing Dan Starkey portrait is duplicated or reused.",
      references: [
        {
          claim: "performance",
          label: "Dan Starkey is identified as Kaarsh’s voice actor",
          source: SOURCE,
          publisher: "Tardis Wiki",
        },
        {
          claim: "production",
          label: "Kaarsh appears in the Doctor Who Adventure Game The Gunpowder Plot",
          source: PRODUCTION_SOURCE,
          publisher: "Tardis Wiki",
        },
      ],
    }
  }],
};
await writeJson(".luna/results.json", results);
runNode("scripts/autopilot.mjs", ["submit", "--batch", ".luna/batch.json", "--input", ".luna/results.json", "--now", SUBMITTED_AT]);
runNode("scripts/autopilot.mjs", ["validate"]);
runNode("scripts/grow.mjs", ["--drafts"]);

let specimens = await readJson("data/specimens.json");
const cards = specimens.filter((row) => row.actor === ACTOR && row.character === CHARACTER);
assert.equal(cards.length, 1, "canonical growth did not produce exactly one Kaarsh record");
const card = cards[0];
assert.equal(card.id, expectedWallId, "Kaarsh did not receive the next canonical wall ID");
assert.equal(card.kind, "voice", "Kaarsh role lost voice classification");
assert.equal(card.production, "The Gunpowder Plot");
assert.equal(card.universe, "Doctor Who");
assert.equal(card.years, "2011");
assert.equal(card.transform, 2);
assert.equal(card.designer, "Sumo Digital");
assert.equal(card.link, SOURCE);
assert.equal(card.portrait, undefined, "Kaarsh acquired unauthorized performer portrait bytes");
assert.equal(card.still, undefined, "Kaarsh acquired unreviewed character still bytes before exact adoption");
assert.ok((card.references || []).some((row) => row.claim === "performance" && row.source === SOURCE));
assert.ok((card.references || []).some((row) => row.claim === "production" && row.source === PRODUCTION_SOURCE));

const preparedStillBytes = await readFile(PREPARED_STILL_PATH);
const preparedVerificationBytes = await readFile(PREPARED_VERIFICATION_PATH);
assert.equal(sha256(preparedStillBytes), STILL_SHA256, "prepared Kaarsh still bytes drifted");
const stillVerification = JSON.parse(preparedVerificationBytes.toString("utf8"));
assert.equal(stillVerification.exact_main, BASE_MAIN);
assert.equal(stillVerification.attested_main, ATTESTED_MAIN);
assert.equal(stillVerification.task_id, TASK_ID);
assert.equal(stillVerification.performer, ACTOR);
assert.equal(stillVerification.character, CHARACTER);
assert.deepEqual(stillVerification.performance_mode, ["voice"]);
assert.equal(stillVerification.source_page, SOURCE);
assert.equal(stillVerification.source_page_id, SOURCE_PAGE_ID);
assert.equal(stillVerification.source_revision, SOURCE_REVISION);
assert.equal(stillVerification.source_content_sha256, SOURCE_CONTENT_SHA256);
assert.equal(stillVerification.source_fingerprint, SOURCE_FINGERPRINT);
assert.equal(stillVerification.file_title, "File:Kaarsh.jpg");
assert.equal(stillVerification.file_page_id, STILL_PAGE_ID);
assert.equal(stillVerification.file_description_url, STILL_ORIGIN);
assert.equal(stillVerification.source_sha256, STILL_SOURCE_SHA256);
assert.equal(stillVerification.api_width, STILL_SOURCE_WIDTH);
assert.equal(stillVerification.api_height, STILL_SOURCE_HEIGHT);
assert.equal(stillVerification.preflight_run, PREFLIGHT_RUN);
assert.equal(stillVerification.preflight_artifact_sha256, PREFLIGHT_ARTIFACT_SHA256);
assert.equal(stillVerification.reattestation_run, STILL_VERIFICATION_RUN);
assert.equal(stillVerification.reattestation_job, STILL_VERIFICATION_JOB);
assert.equal(stillVerification.reattestation_artifact_id, STILL_VERIFICATION_ARTIFACT_ID);
assert.equal(stillVerification.reattestation_artifact_sha256, STILL_VERIFICATION_ARTIFACT_SHA256);
assert.equal(stillVerification.main_drift?.policy, "strict-path-allowlist");
assert.equal(stillVerification.boundary?.main_drift_allowlisted, true);
assert.equal(stillVerification.candidate?.sha256, STILL_SHA256);
assert.equal(stillVerification.candidate?.width, STILL_WIDTH);
assert.equal(stillVerification.candidate?.height, STILL_HEIGHT);
assert.equal(stillVerification.candidate?.bytes, STILL_BYTES);
assert.equal(stillVerification.candidate?.byte_distinct_from_every_existing_repository_image, true);
assert.equal(stillVerification.boundary?.exact_file_named_by_revision_bound_source, true);
assert.equal(stillVerification.boundary?.generic_sontaran_substitution, false);
assert.equal(stillVerification.boundary?.candidate_adopted, false);
assert.equal(stillVerification.boundary?.lease_issued, false);

for (const imagePath of await walkFiles("images")) {
  assert.notEqual(sha256(await readFile(imagePath)), STILL_SHA256, `prepared still duplicates existing repository image ${imagePath}`);
}
const stillPath = `images/${card.id.toLowerCase()}-still.jpg`;
await mkdir("images", { recursive: true });
await writeFile(stillPath, preparedStillBytes);
const stillSha256 = sha256(await readFile(stillPath));
assert.equal(stillSha256, STILL_SHA256);
card.still = {
  src: stillPath,
  kind: "still",
  origin: STILL_ORIGIN,
  pin: true,
  focus: { x: "center", y: "center" },
};
await writeJson("data/specimens.json", specimens);

runNode("scripts/credits.mjs");
runNode("scripts/sync-sources.mjs");
let sources = await readJson("data/SOURCES.json");
const sourceRow = sources.find((row) => row.id === card.id);
assert.ok(sourceRow, "SOURCES did not acquire Kaarsh");
assert.equal(sourceRow.actor, ACTOR);
assert.equal(sourceRow.character, CHARACTER);
assert.equal(sourceRow.universe, "Doctor Who");
assert.equal(sourceRow.portrait, null);
assert.deepEqual(sourceRow.still, card.still);
sourceRow.fetched_at = SOURCE_FETCHED_AT;
await writeJson("data/SOURCES.json", sources);

runNode("scripts/media-stage.mjs", ["--ids", card.id]);
let mediaManifest = await readJson("data/media-manifest.json");
let stillManifest = mediaManifest.assets?.[stillPath];
assert.ok(stillManifest, "Kaarsh still was not staged in the media manifest");
assert.equal(stillManifest.sha256, stillSha256);
assert.equal(stillManifest.location, "pending");
runNode("scripts/media-upload.mjs");
mediaManifest = await readJson("data/media-manifest.json");
stillManifest = mediaManifest.assets?.[stillPath];
assert.equal(stillManifest?.location, "release", "Kaarsh still did not reach the immutable release store");
assert.equal(stillManifest?.sha256, stillSha256);

runNode("scripts/shard.mjs");
runNode("scripts/census-gate.mjs", ["--write"]);
runNode("scripts/build-record-pages.mjs");
runNode("scripts/build-contract.mjs");
runNode("scripts/validate.mjs");
runNode("scripts/autopilot.mjs", ["sync", "--scope", SCOPE, "--now", MERGED_AT]);
runNode("scripts/autopilot.mjs", ["validate"]);
let autopilot = await readJson("data/AUTOPILOT.json");
let job = autopilot.jobs.find((row) => row.id === TASK_ID);
assert.equal(job.status, "merged", "Kaarsh did not enter post-merge media custody");
assert.deepEqual(job.wall_ids, [card.id]);
assert.equal(job.outcome?.lease_id, batch.lease_id);
assert.equal(job.outcome?.readiness_token, batch.readiness.lease_token);

runNode("scripts/media-audit.mjs", ["sync", "--now", MEDIA_SYNCED_AT]);
runNode("scripts/media-audit.mjs", ["validate"]);
let audit = await readJson("data/MEDIA-AUDIT.json");
let mediaItems = audit.items.filter((row) => row.wall_id === card.id);
assert.equal(mediaItems.length, 2, "Kaarsh did not acquire exactly two media facets");
assert.deepEqual(mediaItems.map((row) => row.side).sort(), ["portrait", "still"]);
let portraitItem = mediaItems.find((row) => row.side === "portrait");
let stillItem = mediaItems.find((row) => row.side === "still");
assert.equal(portraitItem.status, "absent");
assert.equal(portraitItem.asset, null);
assert.equal(stillItem.status, "review");
assert.equal(stillItem.asset?.sha256, stillSha256);
for (const old of before.audit.items) {
  const current = audit.items.find((row) => row.id === old.id);
  assert.ok(current, `existing media item disappeared: ${old.id}`);
  assert.equal(stableJson(current), oldAuditById.get(old.id), `existing media item changed: ${old.id}`);
}

const resolution = {
  version: 2,
  reviewed_by: "chatgpt-second-desk",
  reviewed_role: "second-desk",
  reviewed_at: MEDIA_RESOLVED_AT,
  votes: [
    {
      item_id: stillItem.id,
      namespace: "identity",
      value: "expected",
      note: "The revision-bound Kaarsh source names this exact file and Dan Starkey as voice actor. Identity custody is source/file-title based; no biometric inference is used.",
      evidence: [
        { type: "asset-sha256", value: stillSha256 },
        { type: "source-page", value: SOURCE },
        { type: "source-content-sha256", value: SOURCE_CONTENT_SHA256 },
        { type: "file-page", value: STILL_ORIGIN },
        { type: "file-pageid", value: String(STILL_PAGE_ID) },
        { type: "verification-artifact-sha256", value: STILL_VERIFICATION_ARTIFACT_SHA256 },
      ],
      enforced: true,
    },
    {
      item_id: stillItem.id,
      namespace: "presentation",
      value: "character-depiction",
      note: "The reviewed image is a clear single-character Kaarsh game still, not cover art, a logo, a collage, or a generic Sontaran substitute.",
      evidence: [
        { type: "asset-sha256", value: stillSha256 },
        { type: "source-image-sha256", value: STILL_SOURCE_SHA256 },
        { type: "dimensions", value: `${STILL_WIDTH}x${STILL_HEIGHT}` },
        { type: "visual-review-boundary", value: "exact single-character Kaarsh game still; no generic substitution" },
      ],
      enforced: true,
    },
  ],
};
await writeJson(".luna/media-resolution.json", resolution);
runNode("scripts/media-audit.mjs", ["resolve", "--input", ".luna/media-resolution.json"]);
audit = await readJson("data/MEDIA-AUDIT.json");
mediaItems = audit.items.filter((row) => row.wall_id === card.id);
portraitItem = mediaItems.find((row) => row.side === "portrait");
stillItem = mediaItems.find((row) => row.side === "still");
assert.equal(portraitItem.status, "absent");
assert.equal(stillItem.status, "verified");
assert.equal(stillItem.asset?.sha256, stillSha256);

const mediaReview = {
  version: batch.version,
  reviewed_by: "chatgpt-second-desk",
  lease_id: batch.lease_id,
  reviews: [{
    task_id: TASK_ID,
    records: [{
      wall_id: card.id,
      still: {
        disposition: "verified",
        subject: CHARACTER,
        source: STILL_ORIGIN,
        note: "The exact source-named Kaarsh game still is adopted as character evidence under file-page, byte, transform, and visual-review custody.",
      },
      portrait: {
        disposition: "absent",
        note: "No new independently prepared Dan Starkey portrait is required. Existing Dan Starkey portrait bytes are not duplicated; the exact Kaarsh still keeps the record illustrated.",
      },
    }],
  }],
};
await writeJson(".luna/media-review.json", mediaReview);
runNode("scripts/autopilot.mjs", ["complete", "--input", ".luna/media-review.json", "--now", MEDIA_REVIEWED_AT]);
runNode("scripts/autopilot.mjs", ["validate"]);
runNode("scripts/media-audit.mjs", ["gate", "--scope", SCOPE]);

runNode("scripts/credits.mjs");
runNode("scripts/sync-sources.mjs");
runNode("scripts/shard.mjs");
runNode("scripts/census-gate.mjs", ["--write"]);
runNode("scripts/build-record-pages.mjs");
runNode("scripts/build-contract.mjs");
runNode("scripts/validate.mjs");

autopilot = await readJson("data/AUTOPILOT.json");
job = autopilot.jobs.find((row) => row.id === TASK_ID);
assert.equal(job.status, "resolved", "Kaarsh did not reach terminal resolved state");
assert.deepEqual(job.wall_ids, [card.id]);
const doctorJobs = autopilot.jobs.filter((row) => row.scope === SCOPE);
assert.deepEqual(statusCounts(doctorJobs), { queued: EXPECTED_AFTER_QUEUED, resolved: EXPECTED_AFTER_RESOLVED });
assert.equal(doctorJobs.length, EXPECTED_TOTAL);
const activeJobs = autopilot.jobs.filter((row) => ["leased", "drafted", "merged"].includes(row.status));
assert.equal(activeJobs.length, 0, "cycle 005 left in-flight work");
const nonDoctorJobsAfter = digestJobs(autopilot.jobs.filter((row) => row.scope !== SCOPE));
const starTrekJobsAfter = digestJobs(autopilot.jobs.filter((row) => row.scope === "star-trek"));
assert.equal(nonDoctorJobsAfter, nonDoctorJobsBefore, "cycle 005 changed another scope's Autopilot jobs");
assert.equal(starTrekJobsAfter, starTrekJobsBefore, "cycle 005 changed Star Trek Autopilot jobs");
const afterCoverage = await readJson("data/CENSUS-COVERAGE.json");
const afterKaarshCoverage = afterCoverage.find((row) => coverageKey(row) === coverageKey(beforeKaarshCoverage));
assert.ok(afterKaarshCoverage, "Kaarsh coverage row disappeared");
assert.equal(afterKaarshCoverage.role_on_wall, true);
assert.deepEqual(afterKaarshCoverage.wall_ids, [card.id]);
assert.equal(afterCoverage.length, before.coverage.length, "cycle 005 changed the source coverage denominator");
const beforeCoverageByKey = new Map(before.coverage.map((row) => [coverageKey(row), stableJson(row)]));
for (const row of afterCoverage) {
  if (coverageKey(row) === coverageKey(beforeKaarshCoverage)) continue;
  assert.equal(stableJson(row), beforeCoverageByKey.get(coverageKey(row)), `unrelated coverage row changed: ${coverageKey(row)}`);
}
assert.notEqual(sha256(await readFile("data/CENSUS-COVERAGE.json")), sha256(before.coverageBytes), "Kaarsh filing did not change its coverage row");
assert.equal(sha256(await readFile("data/CENSUS-MANIFEST.json")), sha256(before.manifestBytes), "cycle 005 changed source manifest");

specimens = await readJson("data/specimens.json");
sources = await readJson("data/SOURCES.json");
assert.equal(specimens.length, before.specimens.length + 1);
assert.equal(sources.length, before.sources.length + 1);
for (const old of before.specimens) {
  const current = specimens.find((row) => row.id === old.id);
  assert.ok(current, `existing specimen disappeared: ${old.id}`);
  assert.equal(stableJson(current), oldSpecimensById.get(old.id), `existing specimen changed: ${old.id}`);
}
for (const old of before.sources) {
  const current = sources.find((row) => row.id === old.id);
  assert.ok(current, `existing source disappeared: ${old.id}`);
  assert.equal(stableJson(current), oldSourcesById.get(old.id), `existing source changed: ${old.id}`);
}

const journal = await readJsonl("data/journal/autopilot.jsonl");
const doctorClaims = journal.filter((row) => row.op === "lease.claimed" && row.scope === SCOPE);
assert.equal(doctorClaims.length, 5, "cycle 005 did not produce exactly one additional Doctor Who claim");
const claim = doctorClaims.find((row) => row.lease_id === batch.lease_id);
assert.ok(claim, "cycle 005 claim event is missing");
assert.equal(claim.task_id, TASK_ID);
assert.equal(claim.at, CLAIMED_AT);
assert.equal(claim.performer, ACTOR);
assert.equal(claim.character, CHARACTER);
assert.equal(claim.capability_profile, PROFILE);
assert.equal(claim.selection_strategy, "reviewed-task");
assert.equal(claim.selection_basis, batch.selection.basis);

runNode("scripts/doctor-who-pilot-cycle.mjs");
runNode("scripts/doctor-who-correction-drill.mjs");
runNode("scripts/doctor-who-cycle-002.mjs");
runNode("scripts/doctor-who-cycle-003.mjs");
runNode("scripts/doctor-who-cycle-004-still-correction.mjs", [], { env: { CYCLE004_STILL_COMPOSABILITY_CANDIDATE: "1" } });
runNode("scripts/star-trek-enwright-cycle.mjs");

const pilotReceipt = await readJson("data/review/adapter-sdk/doctor-who-pilot-cycle-001.json");
const drillReceipt = await readJson("data/review/adapter-sdk/doctor-who-correction-drill-001.json");
const greddReceipt = await readJson("data/review/adapter-sdk/doctor-who-cycle-002-gredd.json");
const priorJaskReceipt = await readJson("data/review/adapter-sdk/doctor-who-cycle-003-jask.json");
const cycle004Receipt = await readJson("data/review/adapter-sdk/doctor-who-cycle-004-jask-audio.json");
const cycle004StillCorrectionReceipt = await readJson("data/review/adapter-sdk/doctor-who-cycle-004-jask-audio-still-correction.json");
const facetReceipt = [...mediaItems].sort((a, b) => a.side.localeCompare(b.side)).map((row) => ({
  id: row.id,
  scope: row.scope,
  wall_id: row.wall_id,
  side: row.side,
  actor: row.actor,
  character: row.character,
  expected_subject: row.expected_subject,
  source_fetched_at: row.source_fetched_at,
  asset: row.asset,
  risk_codes: row.risk_codes,
  votes: row.votes,
  status: row.status,
  claims: row.claims,
}));
const context = {
  version: 1,
  transaction: "DOCTOR-WHO-CYCLE-005-KAARSH",
  exact_main: BASE_MAIN,
  launcher_head: LAUNCHER_HEAD,
  workflow_run: process.env.GITHUB_RUN_ID || null,
  timestamps: {
    cycle_at: cycleAt.toISOString(),
    claimed_at: CLAIMED_AT,
    submitted_at: SUBMITTED_AT,
    source_fetched_at: SOURCE_FETCHED_AT,
    merged_at: MERGED_AT,
    media_synced_at: MEDIA_SYNCED_AT,
    media_resolved_at: MEDIA_RESOLVED_AT,
    media_reviewed_at: MEDIA_REVIEWED_AT,
    candidate_at: CANDIDATE_AT,
    reviewed_at: REVIEWED_AT,
    final_at: FINAL_AT,
  },
  task: {
    id: TASK_ID,
    performer: ACTOR,
    character: CHARACTER,
    queued_mode_hint: "voice",
    adjudicated_kind: "voice",
    adjudicated_performance_mode: "voice",
    source: SOURCE,
    production_source: PRODUCTION_SOURCE,
    source_fingerprint: SOURCE_FINGERPRINT,
    source_receipt: beforeTask.source_receipts[0],
    status: job.status,
  },
  lease: {
    id: batch.lease_id,
    agent: batch.agent,
    claimed_at: batch.claimed_at,
    expires_at: batch.expires_at,
    readiness: batch.readiness,
    selection: batch.selection,
    claim_event: claim,
  },
  canonical: {
    before_count: before.specimens.length,
    after_count: specimens.length,
    wall_id: card.id,
    record: card,
    record_sha256: sha256(Buffer.from(stableJson(card))),
  },
  media: {
    scope: SCOPE,
    item_ids: facetReceipt.map((row) => row.id),
    facets: facetReceipt,
    facets_sha256: digestRows(facetReceipt),
    statuses: Object.fromEntries(facetReceipt.map((row) => [row.side, row.status])),
    still_src: stillPath,
    still_sha256: stillSha256,
    still_source_sha256: STILL_SOURCE_SHA256,
    still_origin: STILL_ORIGIN,
    still_file_pageid: STILL_PAGE_ID,
    still_source_dimensions: { width: STILL_SOURCE_WIDTH, height: STILL_SOURCE_HEIGHT },
    still_dimensions: { width: STILL_WIDTH, height: STILL_HEIGHT },
    still_bytes: STILL_BYTES,
    verification: {
      workflow_run: STILL_VERIFICATION_RUN,
      workflow_job: STILL_VERIFICATION_JOB,
      artifact_id: STILL_VERIFICATION_ARTIFACT_ID,
      artifact_sha256: STILL_VERIFICATION_ARTIFACT_SHA256,
      preflight_run: PREFLIGHT_RUN,
      preflight_artifact_sha256: PREFLIGHT_ARTIFACT_SHA256,
      attested_main: ATTESTED_MAIN,
      current_main: BASE_MAIN,
      drift_policy: stillVerification.main_drift,
      verification_json_sha256: sha256(preparedVerificationBytes),
    },
    manifest_asset: stillManifest,
  },
  queue: {
    before: { total: EXPECTED_TOTAL, queued: EXPECTED_BEFORE_QUEUED, resolved: EXPECTED_BEFORE_RESOLVED, in_flight: 0 },
    after: { total: EXPECTED_TOTAL, queued: EXPECTED_AFTER_QUEUED, resolved: EXPECTED_AFTER_RESOLVED, in_flight: 0 },
  },
  prior_custody: {
    pilot_receipt_declared_sha256: pilotReceipt.receipt_sha256,
    correction_drill_receipt_declared_sha256: drillReceipt.receipt_sha256,
    gredd_cycle_receipt_declared_sha256: greddReceipt.receipt_sha256,
    gredd_cycle_id: greddReceipt.reviewed_cycle?.id,
    prior_jask_cycle_receipt_declared_sha256: priorJaskReceipt.receipt_sha256,
    prior_jask_cycle_id: priorJaskReceipt.reviewed_cycle?.id,
    cycle_004_receipt_declared_sha256: cycle004Receipt.receipt_sha256,
    cycle_004_id: cycle004Receipt.reviewed_cycle?.id,
    cycle_004_still_correction_receipt_sha256: cycle004StillCorrectionReceipt.receipt_sha256,
  },
  cycle_004_still_correction_composability: {
    checker: CYCLE004_STILL_CHECKER_PATH,
    checker_sha256_before: CYCLE004_STILL_CHECKER_SHA256_BEFORE,
    checker_sha256_after: CYCLE004_STILL_CHECKER_SHA256_AFTER,
    immutable_still_correction_merge: CYCLE004_STILL_CORRECTION_MERGE,
    immutable_correction_receipt_file_sha256: CYCLE004_STILL_CORRECTION_RECEIPT_FILE_SHA256,
    receipt: CYCLE004_STILL_COMPOSABILITY_RECEIPT_PATH,
    historical_receipt_rewritten: false,
    historical_checker_rewritten_at_immutable_merge: false,
    live_queue_snapshot_pinned: false,
    future_cycles_permitted: true,
    fixtures: {
      future_resolved_cycle_accepted: true,
      reopened_jask_rejected: true,
      active_work_rejected: true,
      denominator_change_rejected: true,
      missing_claim_rejected: true,
      duplicate_claim_rejected: true,
    },
  },
  isolation: {
    non_doctor_jobs_sha256_before: nonDoctorJobsBefore,
    non_doctor_jobs_sha256_after: nonDoctorJobsAfter,
    star_trek_jobs_sha256_before: starTrekJobsBefore,
    star_trek_jobs_sha256_after: starTrekJobsAfter,
    coverage_sha256_before: sha256(before.coverageBytes),
    coverage_sha256_after: sha256(await readFile("data/CENSUS-COVERAGE.json")),
    coverage_delta: {
      changed_rows: 1,
      before: beforeKaarshCoverage,
      after: afterKaarshCoverage,
    },
    manifest_sha256_before: sha256(before.manifestBytes),
    manifest_sha256_after: sha256(await readFile("data/CENSUS-MANIFEST.json")),
  },
  boundary: {
    one_task_claimed: true,
    fifth_doctor_who_lease_is_this_cycle: true,
    sixth_lease_issued: false,
    generic_sontaran_image_used: false,
    existing_dan_starkey_portrait_duplicated: false,
    portrait_adopted: false,
    portrait_status: "absent",
    exact_character_still_adopted: true,
    still_treated_as_character_evidence: true,
    still_sha256: stillSha256,
    unrelated_scope_mutated: false,
    source_census_mutated: false,
    roadmap_completion_claimed: false,
    main_drift_allowlisted: true,
    attested_main: ATTESTED_MAIN,
    current_main: BASE_MAIN,
  },
};
await writeFile(CONTEXT_PATH, stableJson(context));
await writeFile("/tmp/doctor-who-cycle-005-candidate-at.txt", `${CANDIDATE_AT}\n`);
await writeFile("/tmp/doctor-who-cycle-005-reviewed-at.txt", `${REVIEWED_AT}\n`);
await writeFile("/tmp/doctor-who-cycle-005-final-at.txt", `${FINAL_AT}\n`);
await rm(".luna", { recursive: true, force: true });
console.log(`Doctor Who cycle 005 candidate resolved ${TASK_ID} as ${card.id}; reviewed cycle receipt remains required.`);
