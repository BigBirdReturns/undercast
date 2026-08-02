#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const TASK_ID = "ap_6dfcb7b9254c26dc3f4b46b8";
const LEASE_ID = "lease_51e3223a4810f3681aff9df4";
const ACTOR = "Dan Starkey";
const CHARACTER = "Commander (The Sontarans)";
const SOURCE = "https://tardis.fandom.com/wiki/Commander_(The_Sontarans)";
const SOURCE_FINGERPRINT = "f272dd90028ca998792a461c1547a334d58f7976484ff7ee2d299306763e0879";
const SOURCE_CONTENT_SHA256 = "2ea0035e1f219abf4c846a65befb8cc447dbdf883b120bd25d7768c93f75f966";
const ACTIVATION_MERGE = "79362e21d9d526f1310467574e69fe909eb80adb";
const CONTEXT_PATH = process.env.PILOT_CONTEXT || "/tmp/doctor-who-pilot-cycle-001-context.json";
const baseAt = new Date(process.env.PILOT_AT || "");
if (!Number.isFinite(baseAt.getTime())) throw new Error("PILOT_AT must be a valid ISO timestamp");
const at = (minutes) => new Date(baseAt.getTime() + minutes * 60_000).toISOString();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const writeJson = async (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
const digestJobs = (jobs) => sha256(Buffer.from(JSON.stringify([...jobs].sort((a, b) => a.id.localeCompare(b.id)))));
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
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
const replaceOnce = async (file, before, after) => {
  const text = await readFile(file, "utf8");
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${file}: expected one replacement target, found ${count}`);
  await writeFile(file, text.replace(before, after));
};

await mkdir(".luna", { recursive: true });

const activation = await readJson("data/review/adapter-sdk/doctor-who-activation-001.json");
assert.equal(activation.lease.lease_id, LEASE_ID, "activation lease drifted");
assert.equal(activation.lease.task.id, TASK_ID, "activation task drifted");
assert.equal(activation.lease.task.source_fingerprint, SOURCE_FINGERPRINT, "activation source fingerprint drifted");
assert.equal(activation.execution.base_sha, "23ea1165065500e540b84eb0aa6f1de203cfc530", "activation authority base drifted");

const before = {
  specimens_bytes: await readFile("data/specimens.json"),
  sources_bytes: await readFile("data/SOURCES.json"),
  coverage_bytes: await readFile("data/CENSUS-COVERAGE.json"),
  manifest_bytes: await readFile("data/CENSUS-MANIFEST.json"),
  media_bytes: await readFile("data/MEDIA-AUDIT.json"),
  autopilot: await readJson("data/AUTOPILOT.json"),
  journal: (await readFile("data/journal/autopilot.jsonl", "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
};
const job = before.autopilot.jobs.find((row) => row.id === TASK_ID);
assert.ok(job, "live pilot task is missing");
assert.equal(job.scope, "doctor-who");
assert.equal(job.status, "leased", "pilot task is no longer leased");
assert.equal(job.lease?.id, LEASE_ID, "live lease identity drifted");
assert.equal(job.lease?.agent, "luna", "live lease is not assigned to Luna");
assert.equal(job.source_fingerprint, SOURCE_FINGERPRINT, "live task source changed");
assert.deepEqual(job.sources, [SOURCE], "live task source set drifted");
assert.equal(job.source_receipts?.length, 1, "live task lost its exact source receipt");
assert.equal(job.source_receipts[0].content_sha256, SOURCE_CONTENT_SHA256, "live task source content drifted");
assert.equal(before.autopilot.jobs.filter((row) => row.scope === "doctor-who").length, 316, "Doctor Who denominator drifted");
assert.equal(before.autopilot.jobs.filter((row) => row.scope === "doctor-who" && row.status === "queued").length, 315, "queued Doctor Who denominator drifted");
assert.equal(before.autopilot.jobs.filter((row) => row.scope === "doctor-who" && ["leased", "drafted", "merged"].includes(row.status)).length, 1, "pilot is not the only in-flight Doctor Who task");
assert.equal(before.journal.filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who").length, 1, "Doctor Who has more than one lease event");
const existing = JSON.parse(before.specimens_bytes).filter((row) => row.actor === ACTOR && row.character === CHARACTER);
assert.equal(existing.length, 0, "exact Commander record already exists before the pilot");

await replaceOnce(
  "scripts/lib/media-audit.mjs",
  `export function scopeForSpecimen(scopes, specimen) {\n  return scopes.find((scope) =>\n    scope.status !== "retired"\n    && (!scope.match?.universe || normalize(scope.match.universe) === normalize(specimen.universe)),\n  );\n}`,
  `export function scopeForSpecimen(scopes, specimen) {\n  return scopes.find((scope) => {\n    if (scope.status === "retired") return false;\n    const match = scope.match || {};\n    if (match.universe && normalize(match.universe) !== normalize(specimen.universe)) return false;\n    if (Array.isArray(match.wall_ids) && !match.wall_ids.includes(specimen.id)) return false;\n    return true;\n  });\n}`,
);
await replaceOnce(
  "scripts/media-audit.mjs",
  `  normalize,\n  sha256,`,
  `  normalize,\n  scopeForSpecimen,\n  sha256,`,
);
await replaceOnce(
  "scripts/media-audit.mjs",
  `function scopeForSpecimen(scopes, specimen) {\n  return scopes.find((scope) => scope.status !== "retired" && (!scope.match?.universe || normalize(scope.match.universe) === normalize(specimen.universe)));\n}\n`,
  "",
);
await replaceOnce(
  "scripts/media-audit-fixtures.mjs",
  `  const scopes = [\n    { id: "star-trek", status: "active", match: { universe: "Star Trek" }, facets: ["still", "portrait"] },\n    { id: "sitewide", status: "active", facets: ["still", "portrait"] },\n  ];\n  const starTrek = { id: "UC-001", universe: "Star Trek", actor: "Mark Allen Shepherd", character: "Morn" };\n  const horror = { id: "UC-025", universe: "Horror", actor: "Javier Botet", character: "Mama, the Crooked Man & others" };\n  assert.equal(scopeForSpecimen(scopes, starTrek)?.id, "star-trek", "specific first-match scope wins");\n  const fallback = scopeForSpecimen(scopes, horror);\n  assert.equal(fallback?.id, "sitewide", "non-Star-Trek specimen enters the fallback scope");\n  assert.deepEqual(fallback.facets, ["still", "portrait"], "fallback exposes both public card faces");`,
  `  const scopes = [\n    { id: "star-trek", status: "active", match: { universe: "Star Trek" }, facets: ["still", "portrait"] },\n    { id: "doctor-who", status: "active", match: { wall_ids: ["UC-DW-001"] }, facets: ["still", "portrait"] },\n    { id: "sitewide", status: "active", facets: ["still", "portrait"] },\n  ];\n  const starTrek = { id: "UC-001", universe: "Star Trek", actor: "Mark Allen Shepherd", character: "Morn" };\n  const doctorWho = { id: "UC-DW-001", universe: "TV", actor: "Dan Starkey", character: "Commander (The Sontarans)" };\n  const otherTelevision = { id: "UC-TV-001", universe: "TV", actor: "Example Performer", character: "Example Character" };\n  const horror = { id: "UC-025", universe: "Horror", actor: "Javier Botet", character: "Mama, the Crooked Man & others" };\n  assert.equal(scopeForSpecimen(scopes, starTrek)?.id, "star-trek", "specific universe scope wins");\n  assert.equal(scopeForSpecimen(scopes, doctorWho)?.id, "doctor-who", "exact wall membership can define an estate-local baseline on a shared shelf");\n  assert.equal(scopeForSpecimen(scopes, otherTelevision)?.id, "sitewide", "wall membership must not capture unrelated records from the same shelf");\n  const fallback = scopeForSpecimen(scopes, horror);\n  assert.equal(fallback?.id, "sitewide", "non-Star-Trek specimen enters the fallback scope");\n  assert.deepEqual(fallback.facets, ["still", "portrait"], "fallback exposes both public card faces");`,
);
const mediaDocsPath = "docs/MEDIA-AUDIT.md";
const mediaDocs = await readFile(mediaDocsPath, "utf8");
const membershipHeading = "## Estate-local baselines on shared shelves";
if (!mediaDocs.includes(membershipHeading)) {
  await writeFile(mediaDocsPath, `${mediaDocs.trimEnd()}\n\n${membershipHeading}\n\nA certified estate may share a public shelf with unrelated records. In that case, \\`MEDIA-AUDIT-SCOPES.json\\` may bind the estate scope to an explicit \\`match.wall_ids\\` set. First-match routing assigns only those exact canonical records to the estate baseline; every other record on the shelf continues into the sitewide fallback. New estate records append their wall IDs only after canonical adoption, and the media gate remains closed until every assigned facet is verified or honestly absent.\n`);
}

const readinessOutput = runNode("scripts/autopilot.mjs", [
  "readiness", "--scope", "doctor-who", "--require-active", "--json", "--now", at(0),
], { capture: true });
const readinessRows = JSON.parse(readinessOutput);
assert.equal(readinessRows.length, 1, "Doctor Who readiness output is not singular");
const readiness = readinessRows[0];
assert.equal(readiness.scope_id, "doctor-who");
assert.equal(readiness.lease_token, job.lease.readiness_token, "live lease token is no longer current");
const leaseSelection = job.lease.selection;
assert.ok(leaseSelection, "live lease lost capability selection custody");
const batch = {
  version: before.autopilot.version,
  lease_id: LEASE_ID,
  agent: job.lease.agent,
  claimed_at: job.lease.claimed_at,
  expires_at: job.lease.expires_at,
  readiness,
  selection: {
    strategy: leaseSelection.strategy,
    profile_id: leaseSelection.profile_id,
    policy_sha256: leaseSelection.policy_sha256,
    profile_capabilities: leaseSelection.profile_capabilities || [],
    requested_task_id: leaseSelection.requested_task_id ?? null,
    basis: leaseSelection.basis,
  },
  tasks: [{
    id: job.id,
    scope: job.scope,
    franchise: job.franchise,
    category: job.categories || [],
    character: job.character,
    performer: job.performer,
    performance_modes: job.performance_modes || [],
    required_capabilities: leaseSelection.required_capabilities || [],
    capability_reasons: leaseSelection.requirement_reasons || [],
    sources: job.sources,
    source_receipts: job.source_receipts || [],
    source_fingerprint: job.source_fingerprint,
    performer_on_wall: job.performer_on_wall,
    priority: job.priority,
    attempt: job.attempts,
  }],
};
const results = {
  version: before.autopilot.version,
  lease_id: LEASE_ID,
  agent: batch.agent,
  results: [{
    task_id: TASK_ID,
    decision: "draft",
    draft: {
      character: CHARACTER,
      actor: ACTOR,
      production: "Doctor Who: The Sontarans",
      universe: "TV",
      years: "2016",
      designer: "—",
      transform: 2,
      kind: "voice",
      knownFor: "The credited Sontaran Commander in Big Finish’s 2016 Doctor Who audio drama The Sontarans.",
      reveal: "Dan Starkey voices the unnamed Sontaran officer identified as Commander in the production credits. The preserved source also credits Starkey as Jask and Sergeant in the same release.",
      references: [{
        claim: "performance",
        label: "Dan Starkey credited as Commander in The Sontarans",
        source: SOURCE,
        publisher: "Tardis Wiki",
      }],
    },
  }],
};
await writeJson(".luna/batch.json", batch);
await writeJson(".luna/results.json", results);
runNode("scripts/autopilot.mjs", ["submit", "--batch", ".luna/batch.json", "--input", ".luna/results.json", "--now", at(1)]);
runNode("scripts/autopilot.mjs", ["validate"]);
runNode("scripts/grow.mjs", ["--drafts"]);

const specimens = await readJson("data/specimens.json");
const cards = specimens.filter((row) => row.actor === ACTOR && row.character === CHARACTER);
assert.equal(cards.length, 1, "canonical growth did not produce one exact Commander record");
const card = cards[0];
assert.equal(card.kind, "voice");
assert.equal(card.universe, "TV");
assert.equal(card.production, "Doctor Who: The Sontarans");
assert.equal(card.transform, 2);
assert.equal(card.designer, "—");
assert.equal(card.link, SOURCE);
assert.equal(card.still, undefined, "generic character imagery was attached");
assert.equal(card.portrait, undefined, "duplicate performer imagery was attached");
const wallId = card.id;

runNode("scripts/credits.mjs");
runNode("scripts/sync-sources.mjs");
const sources = await readJson("data/SOURCES.json");
const sourceRow = sources.find((row) => row.id === wallId);
assert.ok(sourceRow, "SOURCES did not acquire the new wall record");
assert.equal(sourceRow.actor, ACTOR);
assert.equal(sourceRow.character, CHARACTER);
assert.equal(sourceRow.still, null);
assert.equal(sourceRow.portrait, null);
sourceRow.fetched_at = at(2);
await writeJson("data/SOURCES.json", sources);

const scopeDoc = await readJson("data/MEDIA-AUDIT-SCOPES.json");
const scopes = Array.isArray(scopeDoc) ? scopeDoc : scopeDoc.scopes;
let doctorScope = scopes.find((row) => row.id === "doctor-who");
if (!doctorScope) {
  doctorScope = {
    id: "doctor-who",
    label: "Doctor Who active-corpus media baseline",
    status: "active",
    match: { wall_ids: [] },
    block_new_autopilot_leases_until_complete: true,
    facets: ["still", "portrait"],
    note: "Exact canonical Doctor Who records are assigned by wall ID because the estate shares the TV and Voice shelves with unrelated productions.",
  };
  const fallbackIndex = scopes.findIndex((row) => row.id === "sitewide");
  scopes.splice(fallbackIndex < 0 ? scopes.length : fallbackIndex, 0, doctorScope);
}
doctorScope.match ||= {};
doctorScope.match.wall_ids = [...new Set([...(doctorScope.match.wall_ids || []), wallId])].sort();
doctorScope.block_new_autopilot_leases_until_complete = true;
await writeJson("data/MEDIA-AUDIT-SCOPES.json", scopeDoc);

runNode("scripts/shard.mjs");
runNode("scripts/census-gate.mjs", ["--write"]);
runNode("scripts/build-record-pages.mjs");
runNode("scripts/build-contract.mjs");
runNode("scripts/validate.mjs");
runNode("scripts/autopilot.mjs", ["sync", "--scope", "doctor-who", "--now", at(2)]);
runNode("scripts/autopilot.mjs", ["validate"]);
let currentAutopilot = await readJson("data/AUTOPILOT.json");
let currentJob = currentAutopilot.jobs.find((row) => row.id === TASK_ID);
assert.equal(currentJob.status, "merged", "canonical record did not enter post-merge media custody");
assert.deepEqual(currentJob.wall_ids, [wallId]);
assert.equal(currentJob.outcome?.lease_id, LEASE_ID);
assert.equal(currentJob.outcome?.readiness_token, readiness.lease_token);

runNode("scripts/media-audit.mjs", ["sync", "--now", at(3)]);
runNode("scripts/media-audit.mjs", ["validate"]);
runNode("scripts/media-audit.mjs", ["gate", "--scope", "doctor-who"]);
const mediaAudit = await readJson("data/MEDIA-AUDIT.json");
const mediaItems = mediaAudit.items.filter((row) => row.wall_id === wallId);
assert.equal(mediaItems.length, 2, "new card did not acquire two media facets");
for (const item of mediaItems) {
  assert.equal(item.scope, "doctor-who");
  assert.equal(item.asset, null);
  assert.equal(item.status, "absent");
  assert.equal(item.source_fetched_at, at(2));
}
const mediaReview = {
  version: before.autopilot.version,
  reviewed_by: "chatgpt-second-desk",
  lease_id: LEASE_ID,
  reviews: [{
    task_id: TASK_ID,
    records: [{
      wall_id: wallId,
      still: {
        disposition: "absent",
        note: "No production-specific visual source identifies this unnamed audio Commander; generic Sontaran and Strax images are excluded.",
      },
      portrait: {
        disposition: "absent",
        note: "The existing Dan Starkey portrait belongs to UC-337 and is not duplicated; no byte-distinct portrait was adopted in this cycle.",
      },
    }],
  }],
};
await writeJson(".luna/media-review.json", mediaReview);
runNode("scripts/autopilot.mjs", ["complete", "--input", ".luna/media-review.json", "--now", at(4)]);
runNode("scripts/autopilot.mjs", ["validate"]);
runNode("scripts/media-audit.mjs", ["gate", "--scope", "doctor-who"]);

runNode("scripts/credits.mjs");
runNode("scripts/sync-sources.mjs");
runNode("scripts/shard.mjs");
runNode("scripts/census-gate.mjs", ["--write"]);
runNode("scripts/build-record-pages.mjs");
runNode("scripts/build-contract.mjs");
runNode("scripts/validate.mjs");

currentAutopilot = await readJson("data/AUTOPILOT.json");
currentJob = currentAutopilot.jobs.find((row) => row.id === TASK_ID);
assert.equal(currentJob.status, "resolved", "pilot task did not reach terminal resolved state");
assert.deepEqual(currentJob.wall_ids, [wallId]);
const doctorJobs = currentAutopilot.jobs.filter((row) => row.scope === "doctor-who");
const queue = {
  total: doctorJobs.length,
  queued: doctorJobs.filter((row) => row.status === "queued").length,
  resolved: doctorJobs.filter((row) => row.status === "resolved").length,
  active: doctorJobs.filter((row) => ["leased", "drafted", "merged"].includes(row.status)).length,
};
assert.deepEqual(queue, { total: 316, queued: 315, resolved: 1, active: 0 });
const currentJournal = (await readFile("data/journal/autopilot.jsonl", "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
assert.equal(currentJournal.filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who").length, 1, "a second Doctor Who lease was issued");
const nonDoctorBefore = digestJobs(before.autopilot.jobs.filter((row) => row.scope !== "doctor-who"));
const nonDoctorAfter = digestJobs(currentAutopilot.jobs.filter((row) => row.scope !== "doctor-who"));
const starTrekBefore = digestJobs(before.autopilot.jobs.filter((row) => row.scope === "star-trek"));
const starTrekAfter = digestJobs(currentAutopilot.jobs.filter((row) => row.scope === "star-trek"));
assert.equal(nonDoctorAfter, nonDoctorBefore, "pilot changed another scope's Autopilot jobs");
assert.equal(starTrekAfter, starTrekBefore, "pilot changed Star Trek Autopilot jobs");
assert.equal(sha256(await readFile("data/CENSUS-COVERAGE.json")), sha256(before.coverage_bytes), "pilot changed source coverage");
assert.equal(sha256(await readFile("data/CENSUS-MANIFEST.json")), sha256(before.manifest_bytes), "pilot changed source manifest");

const starStatus = JSON.parse(runNode("scripts/waterline.mjs", ["status", "--scope", "star-trek", "--requested", "1", "--json"], { capture: true }));
assert.equal(starStatus.phase, "other-cycle-receipt-required", "terminal pilot released another estate before its cycle receipt");
assert.ok(starStatus.claim_reasons.includes("other_scope_cycle_receipt_required"));
const doctorStatus = JSON.parse(runNode("scripts/waterline.mjs", ["status", "--scope", "doctor-who", "--requested", "1", "--json"], { capture: true }));
assert.equal(doctorStatus.phase, "cycle-receipt-required", "resolved pilot did not retain its receipt blocker");
assert.ok(doctorStatus.claim_reasons.includes("cycle_receipt_required"));

const context = {
  version: 1,
  transaction: "DOCTOR-WHO-PILOT-CYCLE-001",
  activation_merge: ACTIVATION_MERGE,
  base_main: process.env.EXACT_MAIN || null,
  launcher_head: process.env.AUTHORIZED_HEAD || null,
  workflow_run: process.env.GITHUB_RUN_ID || null,
  operated_at: at(4),
  lease: {
    lease_id: LEASE_ID,
    task_id: TASK_ID,
    performer: ACTOR,
    character: CHARACTER,
    source: SOURCE,
    source_fingerprint: SOURCE_FINGERPRINT,
    source_content_sha256: SOURCE_CONTENT_SHA256,
    readiness_token: readiness.lease_token,
  },
  canonical: {
    before_count: JSON.parse(before.specimens_bytes).length,
    after_count: specimens.length,
    wall_id: wallId,
    record_sha256: sha256(Buffer.from(stableJson(card))),
  },
  media: {
    scope: "doctor-who",
    item_ids: mediaItems.map((row) => row.id).sort(),
    statuses: Object.fromEntries(mediaItems.map((row) => [row.side, row.status]).sort()),
    item_set_sha256: mediaAudit.source.item_set_sha256,
  },
  queue,
  isolation: {
    non_doctor_jobs_sha256_before: nonDoctorBefore,
    non_doctor_jobs_sha256_after: nonDoctorAfter,
    star_trek_jobs_sha256_before: starTrekBefore,
    star_trek_jobs_sha256_after: starTrekAfter,
  },
  source_custody: {
    coverage_sha256_before: sha256(before.coverage_bytes),
    coverage_sha256_after: sha256(await readFile("data/CENSUS-COVERAGE.json")),
    manifest_sha256_before: sha256(before.manifest_bytes),
    manifest_sha256_after: sha256(await readFile("data/CENSUS-MANIFEST.json")),
  },
  pre_receipt: {
    doctor_phase: doctorStatus.phase,
    star_trek_phase: starStatus.phase,
    second_lease_issued: false,
  },
};
await writeFile(CONTEXT_PATH, stableJson(context));
await rm(".luna", { recursive: true, force: true });
console.log(`Doctor Who pilot candidate resolved ${TASK_ID} as ${wallId}; reviewed cycle receipt remains required.`);
