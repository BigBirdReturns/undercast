#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const CONTEXT_PATH = process.env.CYCLE_CONTEXT || "/tmp/doctor-who-cycle-005-context.json";
const CANDIDATE_COMMIT = process.env.CANDIDATE_COMMIT;
const WORKFLOW_RUN = process.env.GITHUB_RUN_ID;
const WORKFLOW_JOB = process.env.WORKFLOW_JOB_ID;
const ARTIFACT_NAME = process.env.CANDIDATE_ARTIFACT_NAME;
const ARTIFACT_ID = process.env.CANDIDATE_ARTIFACT_ID;
const ARTIFACT_SHA256 = String(process.env.CANDIDATE_ARTIFACT_SHA256 || "").replace(/^sha256:/, "");
const CANDIDATE_GATE_SHA256 = process.env.CANDIDATE_GATE_SHA256;
const RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-005-kaarsh.json";
const CHECKER_PATH = "scripts/doctor-who-cycle-005.mjs";
const CHECK_COMMAND = "npm run doctor-who:cycle-005:check";
const CYCLE004_STILL_CHECKER_PATH = "scripts/doctor-who-cycle-004-still-correction.mjs";
const CYCLE004_STILL_COMPOSABILITY_RECEIPT_PATH = "data/review/adapter-sdk/doctor-who-cycle-004-still-correction-composability.json";
const CYCLE004_STILL_COMPOSABILITY_TRANSACTION = "DOCTOR-WHO-CYCLE-004-STILL-CORRECTION-COMPOSABILITY-001";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const writeJson = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    const detail = options.capture ? `\nstdout:\n${result.stdout || ""}\nstderr:\n${result.stderr || ""}` : "";
    throw new Error(`${command} ${args.join(" ")} failed (${result.status ?? result.error?.message})${detail}`);
  }
  return result.stdout || "";
};
const runNode = (script, args = [], options = {}) => run(process.execPath, [script, ...args], options);
for (const [name, value, pattern] of [
  ["CANDIDATE_COMMIT", CANDIDATE_COMMIT, /^[0-9a-f]{40}$/],
  ["WORKFLOW_RUN", WORKFLOW_RUN, /^[0-9]+$/],
  ["WORKFLOW_JOB", WORKFLOW_JOB, /^[0-9]+$/],
  ["ARTIFACT_ID", ARTIFACT_ID, /^[0-9]+$/],
  ["ARTIFACT_SHA256", ARTIFACT_SHA256, /^[0-9a-f]{64}$/],
  ["CANDIDATE_GATE_SHA256", CANDIDATE_GATE_SHA256, /^[0-9a-f]{64}$/],
]) if (!pattern.test(String(value || ""))) throw new Error(`${name} is invalid`);
if (!ARTIFACT_NAME) throw new Error("CANDIDATE_ARTIFACT_NAME is missing");

const context = await readJson(CONTEXT_PATH);
assert.equal(context.transaction, "DOCTOR-WHO-CYCLE-005-KAARSH");
assert.equal(context.task.id, "ap_ed7221a03fdd4679379e23f8");
assert.equal(context.task.source_receipt.content_sha256, "a656f352afef65b58a8945b08b0fbf869c6943a932125643cb60e236ff7cd3d4");
assert.equal(context.task.queued_mode_hint, "voice");
assert.equal(context.task.adjudicated_kind, "voice");
assert.equal(context.task.adjudicated_performance_mode, "voice");
assert.equal(context.queue.after.total, 316);
assert.equal(context.queue.after.queued, 311);
assert.equal(context.queue.after.resolved, 5);
assert.equal(context.queue.after.in_flight, 0);
assert.equal(context.boundary.fifth_doctor_who_lease_is_this_cycle, true);
assert.equal(context.boundary.sixth_lease_issued, false);
assert.equal(context.boundary.exact_character_still_adopted, true);
assert.equal(context.boundary.still_treated_as_character_evidence, true);
assert.equal(context.boundary.portrait_adopted, false);
assert.equal(context.boundary.portrait_status, "absent");
assert.match(context.media.still_sha256 || "", /^[0-9a-f]{64}$/);
assert.equal(context.media.statuses.portrait, "absent");
assert.equal(context.media.statuses.still, "verified");
assert.equal(context.isolation.non_doctor_jobs_sha256_before, context.isolation.non_doctor_jobs_sha256_after);
assert.equal(context.isolation.star_trek_jobs_sha256_before, context.isolation.star_trek_jobs_sha256_after);
assert.equal(context.isolation.coverage_delta.changed_rows, 1);
assert.equal(context.isolation.coverage_delta.before.role_on_wall, false);
assert.equal(context.isolation.coverage_delta.after.role_on_wall, true);
assert.deepEqual(context.isolation.coverage_delta.after.wall_ids, [context.canonical.wall_id]);
assert.equal(context.isolation.manifest_sha256_before, context.isolation.manifest_sha256_after);
assert.equal(context.cycle_004_still_correction_composability.checker, CYCLE004_STILL_CHECKER_PATH);
assert.equal(context.cycle_004_still_correction_composability.checker_sha256_before, "1e21cd5424c713db6bee1855af91622225661f29d6afc873186bf6e0f3b8f3ec");
assert.equal(context.cycle_004_still_correction_composability.checker_sha256_after, "31df003f52705fa94f74bf06158dfa8813752be4547d87593a664f1a0f3d88a4");
assert.equal(context.cycle_004_still_correction_composability.immutable_still_correction_merge, "84688c5308db55aae6a97a753d593aa15fe91d37");
assert.equal(context.cycle_004_still_correction_composability.future_cycles_permitted, true);

const evidence = [
  {
    type: "workflow-run",
    value: `GitHub Actions run ${WORKFLOW_RUN}, job ${WORKFLOW_JOB}; artifact ${ARTIFACT_NAME}, ID ${ARTIFACT_ID}, SHA-256 ${ARTIFACT_SHA256}; exact Kaarsh claim, revision-bound voice filing, exact character still, portrait absence, and complete candidate gate.`,
  },
  {
    type: "commit",
    value: `${CANDIDATE_COMMIT} — workflow-free terminal Kaarsh candidate before the reviewed cycle receipt; candidate gate SHA-256 ${CANDIDATE_GATE_SHA256}.`,
  },
  {
    type: "still-verification",
    value: `Read-only Kaarsh still verification run ${context.media.verification.workflow_run}, job ${context.media.verification.workflow_job}; artifact ID ${context.media.verification.artifact_id}, SHA-256 ${context.media.verification.artifact_sha256}; preflight run ${context.media.verification.preflight_run}, artifact SHA-256 ${context.media.verification.preflight_artifact_sha256}; still SHA-256 ${context.media.still_sha256}; source image SHA-256 ${context.media.still_source_sha256}; file page ID ${context.media.still_file_pageid}.`,
  },
  {
    type: "restart-proof",
    value: `Lease ${context.lease.id} was claimed from exact main ${context.exact_main} by launcher ${context.launcher_head}; task ${context.task.id}; source fingerprint ${context.task.source_fingerprint}; source content SHA-256 ${context.task.source_receipt.content_sha256}; four earlier reviewed Doctor Who cycles and the exact cycle-004 still correction remain present; only the receipted strict main-drift allowlist was admitted before claim.`,
  },
  {
    type: "checker-composability",
    value: `Cycle-004 still-correction checker ${context.cycle_004_still_correction_composability.checker} advanced from SHA-256 ${context.cycle_004_still_correction_composability.checker_sha256_before} to ${context.cycle_004_still_correction_composability.checker_sha256_after}; immutable correction merge ${context.cycle_004_still_correction_composability.immutable_still_correction_merge}; correction receipt file SHA-256 ${context.cycle_004_still_correction_composability.immutable_correction_receipt_file_sha256}; future resolved cycles accepted while reopened Jask, active work, denominator drift, and missing or duplicate cycle-004 claims remain rejected.`,
  },
];
const cycleInput = {
  version: 1,
  scope_id: "doctor-who",
  lease_id: context.lease.id,
  outcome: "completed",
  reviewed_by: "chatgpt-second-desk",
  reviewed_role: "second-desk",
  reviewed_at: context.timestamps.reviewed_at,
  note: "The fifth Doctor Who operating cycle claimed exactly one source-preserved, text-vision-compatible task; preserved Dan Starkey’s source-declared voice performance as Kaarsh in the 2011 game The Gunpowder Plot; adopted the exact revision-bound Kaarsh.jpg as character evidence; duplicated no Dan Starkey portrait; kept the portrait facet honestly absent; resolved the task; preserved every unrelated scope, and admitted only the strict pre-claim main-drift allowlist.",
  evidence,
};
await writeJson("/tmp/doctor-who-cycle-005-receipt-input.json", cycleInput);
runNode("scripts/waterline.mjs", ["record-cycle", "--input", "/tmp/doctor-who-cycle-005-receipt-input.json"]);
runNode("scripts/waterline.mjs", ["validate", "--scope", "doctor-who"]);

const waterline = await readJson("data/WATERLINE-STATE.json");
const cycle = waterline.cycles.find((row) => row.scope_id === "doctor-who" && row.lease_id === context.lease.id);
assert.ok(cycle, "cycle 005 receipt was not written");
assert.equal(cycle.outcome, "completed");
assert.equal(cycle.task_statuses?.[context.task.id], "resolved");
assert.equal(cycle.reviewed_at, context.timestamps.reviewed_at);
assert.equal(cycle.reviewed_role, "second-desk");
const cycleBody = structuredClone(cycle);
delete cycleBody.id;
assert.equal(cycle.id, `cycle_${sha256(JSON.stringify(stable(cycleBody))).slice(0, 24)}`, "cycle 005 ID is not content-addressed");

const status = JSON.parse(runNode("scripts/waterline.mjs", ["status", "--scope", "doctor-who", "--requested", "1", "--json"], { capture: true }));
assert.equal(status.phase, "ready-for-cycle");
assert.equal(status.claim_allowed, true);
assert.equal(status.cycles.unreceipted.length, 0);

const waterlineJournal = (await readFile("data/journal/waterline.jsonl", "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const cycleEvents = waterlineJournal.filter((row) => row.op === "cycle.receipted" && row.scope === "doctor-who" && row.lease_id === context.lease.id);
assert.equal(cycleEvents.length, 1, "cycle 005 journal event is missing or duplicated");
const cycleEvent = cycleEvents[0];
assert.equal(cycleEvent.receipt_id, cycle.id);

const cycle004StillCheckerSha256 = sha256(await readFile(CYCLE004_STILL_CHECKER_PATH));
assert.equal(cycle004StillCheckerSha256, context.cycle_004_still_correction_composability.checker_sha256_after, "cycle-004 still-correction composability checker drifted before receipt");
const cycle004StillCorrectionReceiptBytes = await readFile("data/review/adapter-sdk/doctor-who-cycle-004-jask-audio-still-correction.json");
assert.equal(sha256(cycle004StillCorrectionReceiptBytes), context.cycle_004_still_correction_composability.immutable_correction_receipt_file_sha256, "cycle-004 still-correction receipt bytes drifted before composability receipt");
const cycle004StillCorrectionReceiptForComposability = JSON.parse(cycle004StillCorrectionReceiptBytes.toString("utf8"));
const composabilityReceiptBody = {
  version: 1,
  transaction: CYCLE004_STILL_COMPOSABILITY_TRANSACTION,
  generated_at: context.timestamps.reviewed_at,
  trigger_transaction: context.transaction,
  execution: {
    base_main: context.exact_main,
    launcher_head: context.launcher_head,
    workflow_run: Number(WORKFLOW_RUN),
    workflow_job: Number(WORKFLOW_JOB),
    artifact_name: ARTIFACT_NAME,
    artifact_id: Number(ARTIFACT_ID),
    artifact_sha256: ARTIFACT_SHA256,
    candidate_commit: CANDIDATE_COMMIT,
    candidate_gate_sha256: CANDIDATE_GATE_SHA256,
    receipt_bearing_final_gate_required: true,
  },
  historical_custody: {
    still_correction_merge: context.cycle_004_still_correction_composability.immutable_still_correction_merge,
    correction_receipt: "data/review/adapter-sdk/doctor-who-cycle-004-jask-audio-still-correction.json",
    correction_receipt_file_sha256: context.cycle_004_still_correction_composability.immutable_correction_receipt_file_sha256,
    correction_receipt_declared_sha256: cycle004StillCorrectionReceiptForComposability.receipt_sha256,
    original_correction_checker_sha256: context.cycle_004_still_correction_composability.checker_sha256_before,
  },
  live_invariants: {
    doctor_who_denominator: 316,
    cycle_004_task_id: "ap_2dd55dca3530b84be1ad24a0",
    cycle_004_wall_id: "UC-1349",
    cycle_004_lease_id: "lease_98e79928efb4d7ab202ca2fd",
    cycle_004_cycle_id: "cycle_341356246d968c63327c8b92",
    minimum_resolved: 4,
    active_work_permitted_at_stable_gate: false,
    later_claims_permitted: true,
  },
  fixtures: context.cycle_004_still_correction_composability.fixtures,
  qualification: {
    checker: CYCLE004_STILL_CHECKER_PATH,
    checker_sha256: cycle004StillCheckerSha256,
    command: "npm run doctor-who:cycle-004:check",
    candidate_mode_command: "CYCLE004_STILL_COMPOSABILITY_CANDIDATE=1 npm run doctor-who:cycle-004:check",
    complete_candidate_gate_passed: true,
    complete_receipt_bearing_gate_required: true,
    rendered_browser_tests_required: true,
  },
  boundary: {
    historical_receipt_rewritten: false,
    historical_checker_rewritten_at_immutable_merge: false,
    cycle_004_reopened: false,
    live_queue_snapshot_pinned: false,
    future_cycles_permitted: true,
    media_rejudged: false,
    cycle_005_lease_reused_from_failed_runner: false,
  },
};
const composabilityReceipt = { ...composabilityReceiptBody, receipt_sha256: sha256(Buffer.from(stableJson(composabilityReceiptBody))) };
await writeFile(CYCLE004_STILL_COMPOSABILITY_RECEIPT_PATH, stableJson(composabilityReceipt));

const checker = `#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const RECEIPT_PATH = ${JSON.stringify(RECEIPT_PATH)};
const CHECKER_PATH = ${JSON.stringify(CHECKER_PATH)};
const TASK_ID = ${JSON.stringify(context.task.id)};
const LEASE_ID = ${JSON.stringify(context.lease.id)};
const WALL_ID = ${JSON.stringify(context.canonical.wall_id)};
const SOURCE = ${JSON.stringify(context.task.source)};
const PRODUCTION_SOURCE = ${JSON.stringify(context.task.production_source)};
const SOURCE_FINGERPRINT = ${JSON.stringify(context.task.source_fingerprint)};
const SOURCE_PAGE_ID = ${context.task.source_receipt.pageid};
const SOURCE_REVISION = ${context.task.source_receipt.revision};
const SOURCE_TIMESTAMP = ${JSON.stringify(context.task.source_receipt.timestamp)};
const SOURCE_CONTENT_SHA256 = ${JSON.stringify(context.task.source_receipt.content_sha256)};
const REVIEWED_AT = ${JSON.stringify(context.timestamps.reviewed_at)};
const CYCLE_ID = ${JSON.stringify(cycle.id)};
const CYCLE_EVENT_ID = ${JSON.stringify(cycleEvent.id)};
const EXPECTED_MEDIA_ITEM_IDS = ${JSON.stringify(context.media.item_ids, null, 2)};
const EXPECTED_MEDIA_FACETS_SHA256 = ${JSON.stringify(context.media.facets_sha256)};
const STILL_SRC = ${JSON.stringify(context.media.still_src)};
const STILL_SHA256 = ${JSON.stringify(context.media.still_sha256)};
const STILL_SOURCE_SHA256 = ${JSON.stringify(context.media.still_source_sha256)};
const STILL_ORIGIN = ${JSON.stringify(context.media.still_origin)};
const STILL_FILE_PAGEID = ${context.media.still_file_pageid};
const STILL_SOURCE_DIMENSIONS = ${JSON.stringify(context.media.still_source_dimensions, null, 2)};
const STILL_DIMENSIONS = ${JSON.stringify(context.media.still_dimensions, null, 2)};
const STILL_BYTES = ${context.media.still_bytes};
const STILL_VERIFICATION = ${JSON.stringify(context.media.verification, null, 2)};
const EXPECTED_HISTORICAL_QUEUE = ${JSON.stringify(context.queue.after, null, 2)};
const CYCLE004_STILL_CHECKER_PATH = ${JSON.stringify(CYCLE004_STILL_CHECKER_PATH)};
const CYCLE004_STILL_COMPOSABILITY_RECEIPT_PATH = ${JSON.stringify(CYCLE004_STILL_COMPOSABILITY_RECEIPT_PATH)};
const CYCLE004_STILL_CHECKER_SHA256_BEFORE = ${JSON.stringify(context.cycle_004_still_correction_composability.checker_sha256_before)};
const CYCLE004_STILL_CHECKER_SHA256_AFTER = ${JSON.stringify(context.cycle_004_still_correction_composability.checker_sha256_after)};
const CYCLE004_STILL_COMPOSABILITY_RECEIPT_SHA256 = ${JSON.stringify(composabilityReceipt.receipt_sha256)};
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const stableJson = (value) => JSON.stringify(stable(value));
const stablePretty = (value) => JSON.stringify(stable(value), null, 2) + "\\n";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readJsonl = (file) => fs.readFileSync(file, "utf8").split(/\\r?\\n/).filter(Boolean).map((line) => JSON.parse(line));
const fail = (message) => { throw new Error(message); };
const exact = (actual, expected, label) => { if (stableJson(actual) !== stableJson(expected)) fail(label + " drifted"); };

const receipt = read(RECEIPT_PATH);
const receiptBody = structuredClone(receipt);
delete receiptBody.receipt_sha256;
if (receipt.receipt_sha256 !== sha(stablePretty(receiptBody))) fail("cycle 005 receipt hash drifted");
if (receipt.transaction !== "DOCTOR-WHO-CYCLE-005-KAARSH") fail("cycle 005 transaction drifted");
if (receipt.qualification?.checker_sha256 !== sha(fs.readFileSync(CHECKER_PATH))) fail("cycle 005 checker hash drifted");
if (/<[^>\\n]+>/.test(JSON.stringify(receipt))) fail("cycle 005 receipt contains a template placeholder");

const autopilot = read("data/AUTOPILOT.json");
const journal = readJsonl("data/journal/autopilot.jsonl");
const waterline = read("data/WATERLINE-STATE.json");
const waterlineJournal = readJsonl("data/journal/waterline.jsonl");
const specimens = read("data/specimens.json");
const sources = read("data/SOURCES.json");
const audit = read("data/MEDIA-AUDIT.json");
const mediaManifest = read("data/media-manifest.json");
const cycle004Receipt = read("data/review/adapter-sdk/doctor-who-cycle-004-jask-audio.json");
const cycle004StillCorrection = read("data/review/adapter-sdk/doctor-who-cycle-004-jask-audio-still-correction.json");
const cycle004StillComposability = read(CYCLE004_STILL_COMPOSABILITY_RECEIPT_PATH);

const job = autopilot.jobs.find((row) => row.id === TASK_ID);
if (!job || job.scope !== "doctor-who" || job.status !== "resolved") fail("Kaarsh task is not resolved");
if (job.performer !== "Dan Starkey" || job.character !== "Kaarsh") fail("Kaarsh task identity drifted");
if (stableJson(job.performance_modes) !== stableJson(["voice"])) fail("Kaarsh voice mode drifted");
if (job.source_fingerprint !== SOURCE_FINGERPRINT || stableJson(job.sources) !== stableJson([SOURCE])) fail("Kaarsh source set drifted");
const sourceReceipt = (job.source_receipts || []).find((row) => row.source === SOURCE);
exact(sourceReceipt, { source: SOURCE, pageid: SOURCE_PAGE_ID, revision: SOURCE_REVISION, timestamp: SOURCE_TIMESTAMP, content_sha256: SOURCE_CONTENT_SHA256 }, "Kaarsh source receipt");
if (stableJson(job.wall_ids) !== stableJson([WALL_ID])) fail("Kaarsh wall binding drifted");

const wall = specimens.find((row) => row.id === WALL_ID);
if (!wall || wall.actor !== "Dan Starkey" || wall.character !== "Kaarsh" || wall.production !== "The Gunpowder Plot" || wall.universe !== "Doctor Who" || wall.kind !== "voice" || wall.transform !== 2 || wall.years !== "2011" || wall.designer !== "Sumo Digital" || wall.link !== SOURCE) fail("Kaarsh canonical voice record drifted");
if (wall.portrait !== undefined) fail("Kaarsh acquired unauthorized performer portrait bytes");
if (!wall.still || wall.still.src !== STILL_SRC || wall.still.kind !== "still" || wall.still.origin !== STILL_ORIGIN || wall.still.pin !== true) fail("Kaarsh still custody drifted");
if (!(wall.references || []).some((row) => row.claim === "performance" && row.source === SOURCE)) fail("Kaarsh lost exact performance evidence");
if (!(wall.references || []).some((row) => row.claim === "production" && row.source === PRODUCTION_SOURCE)) fail("Kaarsh lost production evidence");

const sourceRow = sources.find((row) => row.id === WALL_ID);
if (!sourceRow || sourceRow.actor !== "Dan Starkey" || sourceRow.character !== "Kaarsh" || sourceRow.universe !== "Doctor Who" || sourceRow.portrait !== null || !sourceRow.still || sourceRow.still.src !== STILL_SRC || sourceRow.still.origin !== STILL_ORIGIN || sourceRow.fetched_at !== ${JSON.stringify(context.timestamps.source_fetched_at)}) fail("Kaarsh source ledger drifted");
const manifestAsset = mediaManifest.assets?.[STILL_SRC];
if (!manifestAsset || manifestAsset.sha256 !== STILL_SHA256 || manifestAsset.location !== "release" || manifestAsset.id !== WALL_ID || manifestAsset.side !== "still" || manifestAsset.bytes !== STILL_BYTES) fail("Kaarsh release media receipt drifted");
if (sha(fs.readFileSync(STILL_SRC)) !== STILL_SHA256) fail("Kaarsh still bytes drifted");
for (const row of specimens) {
  if (row.id === WALL_ID) continue;
  for (const side of ["portrait", "still"]) {
    const src = row[side]?.src;
    if (src && fs.existsSync(src) && sha(fs.readFileSync(src)) === STILL_SHA256) fail("Kaarsh still bytes were duplicated onto " + row.id + " " + side);
  }
}

const facets = audit.items.filter((row) => row.wall_id === WALL_ID).sort((a, b) => a.side.localeCompare(b.side));
const portraitFacet = facets.find((row) => row.side === "portrait");
const stillFacet = facets.find((row) => row.side === "still");
if (facets.length !== 2 || !portraitFacet || portraitFacet.scope !== "doctor-who" || portraitFacet.status !== "absent" || portraitFacet.asset !== null || !stillFacet || stillFacet.scope !== "doctor-who" || stillFacet.status !== "verified" || stillFacet.asset?.sha256 !== STILL_SHA256) fail("Kaarsh media facets do not preserve honest portrait absence and verified exact still");
exact(facets.map((row) => row.id), EXPECTED_MEDIA_ITEM_IDS, "Kaarsh media item identities");
const facetReceipt = facets.map((row) => ({ id: row.id, scope: row.scope, wall_id: row.wall_id, side: row.side, actor: row.actor, character: row.character, expected_subject: row.expected_subject, source_fetched_at: row.source_fetched_at, asset: row.asset, risk_codes: row.risk_codes, votes: row.votes, status: row.status, claims: row.claims }));
if (sha(stablePretty(facetReceipt)) !== EXPECTED_MEDIA_FACETS_SHA256) fail("Kaarsh media facet digest drifted");
if (!stillFacet.votes?.some((row) => row.namespace === "identity" && row.value === "expected" && row.enforced === true)) fail("Kaarsh still lost enforced identity custody");
if (!stillFacet.votes?.some((row) => row.namespace === "presentation" && row.value === "character-depiction" && row.enforced === true)) fail("Kaarsh still lost enforced presentation custody");

const claims = journal.filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who");
for (const row of claims) if (!Number.isFinite(Date.parse(row.at || ""))) fail("Doctor Who claim has invalid timestamp");
const historicalClaims = claims.filter((row) => Date.parse(row.at) <= Date.parse(REVIEWED_AT));
if (historicalClaims.length !== 5) fail("cycle 005 review boundary does not contain exactly five Doctor Who claims");
const claim = historicalClaims.find((row) => row.lease_id === LEASE_ID);
if (!claim || claim.task_id !== TASK_ID || claim.at !== receipt.lease.claimed_at || claim.performer !== "Dan Starkey" || claim.character !== "Kaarsh" || claim.capability_profile !== "text-vision" || claim.selection_strategy !== "reviewed-task") fail("cycle 005 claim custody drifted");
const claimBody = structuredClone(claim); delete claimBody.id;
if (claim.id !== "apj_" + sha(JSON.stringify(claimBody)).slice(0, 24)) fail("cycle 005 claim event is not content-addressed");
if (claims.filter((row) => row.lease_id === LEASE_ID).length !== 1) fail("cycle 005 lease claim is duplicated");

const cycles = waterline.cycles.filter((row) => row.scope_id === "doctor-who" && row.lease_id === LEASE_ID);
if (cycles.length !== 1 || cycles[0].id !== CYCLE_ID || cycles[0].outcome !== "completed" || cycles[0].task_statuses?.[TASK_ID] !== "resolved" || cycles[0].reviewed_at !== REVIEWED_AT) fail("cycle 005 reviewed receipt drifted");
const cycleBody = structuredClone(cycles[0]); delete cycleBody.id;
if (CYCLE_ID !== "cycle_" + sha(JSON.stringify(stable(cycleBody))).slice(0, 24)) fail("cycle 005 receipt ID is not content-addressed");
const cycleEvents = waterlineJournal.filter((row) => row.op === "cycle.receipted" && row.scope === "doctor-who" && row.lease_id === LEASE_ID);
if (cycleEvents.length !== 1 || cycleEvents[0].id !== CYCLE_EVENT_ID || cycleEvents[0].receipt_id !== CYCLE_ID || cycleEvents[0].outcome !== "completed") fail("cycle 005 journal custody drifted");
const cycleEventBody = structuredClone(cycleEvents[0]); delete cycleEventBody.id;
if (CYCLE_EVENT_ID !== "waterline_" + sha(JSON.stringify(cycleEventBody)).slice(0, 24)) fail("cycle 005 journal event is not content-addressed");

exact(receipt.queue.after, EXPECTED_HISTORICAL_QUEUE, "cycle 005 historical queue receipt");
const doctor = autopilot.jobs.filter((row) => row.scope === "doctor-who");
const inFlight = doctor.filter((row) => ["leased", "drafted", "merged"].includes(row.status)).length;
if (doctor.length !== 316 || inFlight !== 0 || doctor.filter((row) => row.status === "resolved").length < 5) fail("current Doctor Who denominator or terminal cycle state drifted");
if (!receipt.boundary || receipt.boundary.fifth_doctor_who_lease_is_this_cycle !== true || receipt.boundary.sixth_lease_issued !== false || receipt.boundary.generic_sontaran_image_used !== false || receipt.boundary.existing_dan_starkey_portrait_duplicated !== false || receipt.boundary.portrait_adopted !== false || receipt.boundary.portrait_status !== "absent" || receipt.boundary.exact_character_still_adopted !== true || receipt.boundary.still_treated_as_character_evidence !== true || receipt.boundary.still_sha256 !== STILL_SHA256 || receipt.boundary.unrelated_scope_mutated !== false || receipt.boundary.source_census_mutated !== false || receipt.boundary.roadmap_completion_claimed !== false) fail("cycle 005 boundary drifted");
if (receipt.isolation.non_doctor_jobs_sha256_before !== receipt.isolation.non_doctor_jobs_sha256_after || receipt.isolation.star_trek_jobs_sha256_before !== receipt.isolation.star_trek_jobs_sha256_after || receipt.isolation.coverage_delta?.changed_rows !== 1 || receipt.isolation.coverage_delta?.before?.role_on_wall !== false || receipt.isolation.coverage_delta?.after?.role_on_wall !== true || stableJson(receipt.isolation.coverage_delta?.after?.wall_ids) !== stableJson([WALL_ID]) || receipt.isolation.manifest_sha256_before !== receipt.isolation.manifest_sha256_after) fail("cycle 005 isolation receipt drifted");
if (receipt.task.queued_mode_hint !== "voice" || receipt.task.adjudicated_kind !== "voice" || receipt.task.adjudicated_performance_mode !== "voice") fail("cycle 005 mode custody drifted");
exact(receipt.media.verification, STILL_VERIFICATION, "cycle 005 still verification custody");
if (receipt.media.still_source_sha256 !== STILL_SOURCE_SHA256 || receipt.media.still_file_pageid !== STILL_FILE_PAGEID || stableJson(receipt.media.still_source_dimensions) !== stableJson(STILL_SOURCE_DIMENSIONS) || stableJson(receipt.media.still_dimensions) !== stableJson(STILL_DIMENSIONS)) fail("cycle 005 still source custody drifted");
if (cycle004Receipt.receipt_sha256 !== receipt.prior_custody.cycle_004_receipt_declared_sha256 || cycle004Receipt.reviewed_cycle?.id !== receipt.prior_custody.cycle_004_id) fail("cycle 005 lost cycle 004 custody");
if (cycle004StillCorrection.receipt_sha256 !== receipt.prior_custody.cycle_004_still_correction_receipt_sha256) fail("cycle 005 lost cycle 004 still-correction custody");
const cycle004StillComposabilityBody = structuredClone(cycle004StillComposability); delete cycle004StillComposabilityBody.receipt_sha256;
if (cycle004StillComposability.receipt_sha256 !== CYCLE004_STILL_COMPOSABILITY_RECEIPT_SHA256 || cycle004StillComposability.receipt_sha256 !== sha(stablePretty(cycle004StillComposabilityBody))) fail("cycle 005 lost cycle-004 still-correction composability receipt custody");
if (sha(fs.readFileSync(CYCLE004_STILL_CHECKER_PATH)) !== CYCLE004_STILL_CHECKER_SHA256_AFTER || cycle004StillComposability.historical_custody?.original_correction_checker_sha256 !== CYCLE004_STILL_CHECKER_SHA256_BEFORE || cycle004StillComposability.qualification?.checker_sha256 !== CYCLE004_STILL_CHECKER_SHA256_AFTER) fail("cycle 005 lost cycle-004 still-correction checker transition custody");
if (receipt.prior_custody.cycle_004_still_composability_receipt_sha256 !== CYCLE004_STILL_COMPOSABILITY_RECEIPT_SHA256 || receipt.prior_custody.cycle_004_still_checker_sha256_before !== CYCLE004_STILL_CHECKER_SHA256_BEFORE || receipt.prior_custody.cycle_004_still_checker_sha256_after !== CYCLE004_STILL_CHECKER_SHA256_AFTER) fail("cycle 005 receipt lost cycle-004 still-correction composability binding");
const evidenceText = (cycles[0].evidence || []).map((row) => row.type + ":" + row.value).join("\\n");
for (const token of [receipt.execution.workflow_run, receipt.execution.workflow_job, receipt.execution.artifact_name, receipt.execution.artifact_id, receipt.execution.artifact_sha256, receipt.execution.candidate_commit, receipt.execution.candidate_gate_sha256, receipt.execution.base_main, receipt.execution.launcher_head, SOURCE_FINGERPRINT, SOURCE_CONTENT_SHA256, STILL_SHA256, STILL_SOURCE_SHA256, STILL_VERIFICATION.workflow_run, STILL_VERIFICATION.workflow_job, STILL_VERIFICATION.artifact_id, STILL_VERIFICATION.artifact_sha256, STILL_VERIFICATION.preflight_run, STILL_VERIFICATION.preflight_artifact_sha256, CYCLE004_STILL_CHECKER_SHA256_BEFORE, CYCLE004_STILL_CHECKER_SHA256_AFTER]) if (!evidenceText.includes(String(token))) fail("cycle 005 evidence lacks exact token " + token);
console.log("doctor-who-cycle-005: PASS — exact Kaarsh voice claim, source, canonical record, verified still, reviewed cycle, and cycle-004 checker composability custody are intact");
`;
await writeFile(CHECKER_PATH, checker);
const checkerSha256 = sha256(await readFile(CHECKER_PATH));

const pilotReceipt = await readJson("data/review/adapter-sdk/doctor-who-pilot-cycle-001.json");
const drillReceipt = await readJson("data/review/adapter-sdk/doctor-who-correction-drill-001.json");
const greddReceipt = await readJson("data/review/adapter-sdk/doctor-who-cycle-002-gredd.json");
const priorJaskReceipt = await readJson("data/review/adapter-sdk/doctor-who-cycle-003-jask.json");
const cycle004Receipt = await readJson("data/review/adapter-sdk/doctor-who-cycle-004-jask-audio.json");
const cycle004StillCorrection = await readJson("data/review/adapter-sdk/doctor-who-cycle-004-jask-audio-still-correction.json");
const receiptBody = {
  version: 1,
  transaction: "DOCTOR-WHO-CYCLE-005-KAARSH",
  generated_at: context.timestamps.reviewed_at,
  execution: {
    base_main: context.exact_main,
    launcher_head: context.launcher_head,
    workflow_run: Number(WORKFLOW_RUN),
    workflow_job: Number(WORKFLOW_JOB),
    artifact_name: ARTIFACT_NAME,
    artifact_id: Number(ARTIFACT_ID),
    artifact_sha256: ARTIFACT_SHA256,
    candidate_commit: CANDIDATE_COMMIT,
    candidate_gate_sha256: CANDIDATE_GATE_SHA256,
    receipt_bearing_final_gate_required: true,
  },
  task: context.task,
  lease: {
    id: context.lease.id,
    agent: context.lease.agent,
    claimed_at: context.lease.claimed_at,
    expires_at: context.lease.expires_at,
    readiness_token: context.lease.readiness.lease_token,
    capability_profile: context.lease.selection.profile_id,
    capability_policy_sha256: context.lease.selection.policy_sha256,
    selection_strategy: context.lease.selection.strategy,
    selection_basis: context.lease.selection.basis,
    outcome: "completed",
  },
  canonical: context.canonical,
  media: context.media,
  queue: context.queue,
  reviewed_cycle: {
    id: cycle.id,
    outcome: cycle.outcome,
    claimed_at: cycle.claimed_at,
    closed_at: cycle.closed_at,
    reviewed_by: cycle.reviewed_by,
    reviewed_role: cycle.reviewed_role,
    reviewed_at: cycle.reviewed_at,
    journal_event_id: cycleEvent.id,
    evidence: cycle.evidence,
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
    cycle_004_still_correction_receipt_sha256: cycle004StillCorrection.receipt_sha256,
    cycle_004_still_composability_receipt_sha256: composabilityReceipt.receipt_sha256,
    cycle_004_still_checker_sha256_before: context.cycle_004_still_correction_composability.checker_sha256_before,
    cycle_004_still_checker_sha256_after: context.cycle_004_still_correction_composability.checker_sha256_after,
    cycle_004_still_correction_merge: context.cycle_004_still_correction_composability.immutable_still_correction_merge,
    prior_doctor_who_cycle_ids: waterline.cycles.filter((row) => row.scope_id === "doctor-who" && row.lease_id !== context.lease.id).map((row) => row.id).sort(),
  },
  cycle_004_still_correction_composability: {
    receipt: CYCLE004_STILL_COMPOSABILITY_RECEIPT_PATH,
    receipt_sha256: composabilityReceipt.receipt_sha256,
    ...context.cycle_004_still_correction_composability,
  },
  isolation: context.isolation,
  boundary: context.boundary,
  qualification: {
    checker: CHECKER_PATH,
    checker_sha256: checkerSha256,
    command: CHECK_COMMAND,
    canonical_gate_binding: "autopilot:fixtures",
    complete_candidate_gate_passed: true,
    complete_receipt_bearing_gate_required: true,
    rendered_browser_tests_required: true,
  },
};
const receipt = { ...receiptBody, receipt_sha256: sha256(Buffer.from(stableJson(receiptBody))) };
await writeFile(RECEIPT_PATH, stableJson(receipt));

const packageDoc = await readJson("package.json");
packageDoc.scripts["doctor-who:cycle-005:check"] = `node ${CHECKER_PATH}`;
if (!packageDoc.scripts["autopilot:fixtures"].includes("doctor-who:cycle-005:check")) {
  packageDoc.scripts["autopilot:fixtures"] += " && npm run doctor-who:cycle-005:check";
}
await writeJson("package.json", packageDoc);

const registry = await readJson("data/ESTATE-REGISTRY.json");
const estate = registry.estates.find((row) => row.id === "doctor-who");
assert.ok(estate, "Doctor Who estate is missing");
estate.next_gate = `Doctor Who cycle 005 ${cycle.id} resolved Dan Starkey as Kaarsh within the preserved 316-role denominator; 311 tasks remain queued. Any later cycle must start from a green rolling waterline, claim at most one compatible task, and return to a reviewed cycle receipt before another claim.`;
await writeJson("data/ESTATE-REGISTRY.json", registry);

let docs = await readFile("docs/AUTOPILOT.md", "utf8");
if (!docs.includes("## Doctor Who cycle 005 — Kaarsh")) {
  docs = `${docs.trimEnd()}\n\n## Doctor Who cycle 005 — Kaarsh\n\nThe fifth bounded Doctor Who cycle is receipted by \`${RECEIPT_PATH}\`. It claims exactly one source-preserved voice task for Dan Starkey as Kaarsh in the 2011 Adventure Game *The Gunpowder Plot*, adopts the exact revision-bound \`Kaarsh.jpg\` as independently reviewed character evidence, keeps the portrait facet honestly absent rather than duplicating an existing Dan Starkey portrait, preserves the 316-role denominator, and leaves 311 obligations queued. It also records \`${CYCLE004_STILL_COMPOSABILITY_RECEIPT_PATH}\`: the cycle-004 still-correction receipt and correction-time queue bytes remain immutable at their merge, while the permanent checker accepts later completed cycles and still rejects a reopened Jask task, active work, denominator drift, and missing or duplicate cycle-004 claims. Its reviewed waterline receipt is \`${cycle.id}\`; run \`${CHECK_COMMAND}\` to recompute the exact claim, source revision, canonical voice record, media facets, content-addressed cycle and journal identities, workflow and still-verification artifact custody, checker transition, and the historical no-sixth-lease boundary.\n`;
}
await writeFile("docs/AUTOPILOT.md", docs);

runNode(CHECKER_PATH);
runNode("scripts/doctor-who-pilot-cycle.mjs");
runNode("scripts/doctor-who-correction-drill.mjs");
runNode("scripts/doctor-who-cycle-002.mjs");
runNode("scripts/doctor-who-cycle-003.mjs");
runNode("scripts/doctor-who-cycle-004-still-correction.mjs");
runNode("scripts/star-trek-enwright-cycle.mjs");
runNode("scripts/census-adapter.mjs", ["write"]);
runNode("scripts/census-adapter.mjs", ["check"]);
runNode("scripts/autopilot.mjs", ["sync", "--scope", "doctor-who", "--now", context.timestamps.final_at]);
runNode("scripts/autopilot.mjs", ["validate"]);
runNode("scripts/waterline.mjs", ["validate", "--scope", "doctor-who"]);
await writeFile("/tmp/doctor-who-cycle-005-permanent-receipt.json", stableJson(receipt));
console.log(`Doctor Who cycle 005 receipted as ${cycle.id}; ${context.queue.after.queued} tasks remain queued.`);
