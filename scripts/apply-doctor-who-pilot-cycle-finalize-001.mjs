#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const TASK_ID = "ap_6dfcb7b9254c26dc3f4b46b8";
const LEASE_ID = "lease_51e3223a4810f3681aff9df4";
const ACTOR = "Dan Starkey";
const CHARACTER = "Commander (The Sontarans)";
const SOURCE = "https://tardis.fandom.com/wiki/Commander_(The_Sontarans)";
const CONTEXT_PATH = process.env.PILOT_CONTEXT || "/tmp/doctor-who-pilot-cycle-001-context.json";
const CANDIDATE_COMMIT = process.env.CANDIDATE_COMMIT;
const REVIEWED_AT = process.env.REVIEWED_AT;
const WORKFLOW_RUN = process.env.GITHUB_RUN_ID;
const BASE_MAIN = process.env.EXACT_MAIN;
const LAUNCHER_HEAD = process.env.AUTHORIZED_HEAD;
for (const [name, value, pattern] of [
  ["CANDIDATE_COMMIT", CANDIDATE_COMMIT, /^[0-9a-f]{40}$/],
  ["WORKFLOW_RUN", WORKFLOW_RUN, /^[0-9]+$/],
  ["BASE_MAIN", BASE_MAIN, /^[0-9a-f]{40}$/],
  ["LAUNCHER_HEAD", LAUNCHER_HEAD, /^[0-9a-f]{40}$/],
]) if (!pattern.test(String(value || ""))) throw new Error(`${name} is invalid`);
if (!Number.isFinite(Date.parse(REVIEWED_AT || ""))) throw new Error("REVIEWED_AT is invalid");
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
    maxBuffer: 128 * 1024 * 1024,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error || result.status !== 0) {
    const detail = options.capture ? `\nstdout:\n${result.stdout || ""}\nstderr:\n${result.stderr || ""}` : "";
    throw new Error(`${command} ${args.join(" ")} failed (${result.status ?? result.error?.message})${detail}`);
  }
  return result.stdout || "";
};
const runNode = (script, args = [], options = {}) => run(process.execPath, [script, ...args], options);
const context = await readJson(CONTEXT_PATH);
assert.equal(context.transaction, "DOCTOR-WHO-PILOT-CYCLE-001");
assert.equal(context.lease.lease_id, LEASE_ID);
assert.equal(context.lease.task_id, TASK_ID);
assert.equal(context.queue.total, 316);
assert.equal(context.queue.queued, 315);
assert.equal(context.queue.resolved, 1);
assert.equal(context.queue.active, 0);
assert.equal(context.pre_receipt.second_lease_issued, false);
assert.equal(context.pre_receipt.doctor_phase, "cycle-receipt-required");
assert.equal(context.pre_receipt.star_trek_phase, "other-cycle-receipt-required");
assert.equal(context.isolation.non_doctor_jobs_sha256_before, context.isolation.non_doctor_jobs_sha256_after);
assert.equal(context.isolation.star_trek_jobs_sha256_before, context.isolation.star_trek_jobs_sha256_after);
assert.equal(context.source_custody.coverage_sha256_before, context.source_custody.coverage_sha256_after);
assert.equal(context.source_custody.manifest_sha256_before, context.source_custody.manifest_sha256_after);

const cycleInput = {
  version: 1,
  scope_id: "doctor-who",
  lease_id: LEASE_ID,
  outcome: "completed",
  reviewed_by: "chatgpt-second-desk",
  reviewed_role: "second-desk",
  reviewed_at: REVIEWED_AT,
  note: "The source-preserved Doctor Who pilot resumed from its durable activation lease, added the exact Dan Starkey voice performance as one canonical record, rejected generic Sontaran and duplicate performer imagery, closed both media facets as honest absence, resolved the task, and passed the complete canonical gate before receipt.",
  evidence: [
    {
      type: "workflow-run",
      value: `GitHub Actions run ${WORKFLOW_RUN} — exact Doctor Who submission, canonical adoption, honest media closure, Autopilot resolution, and complete candidate and final gates.`,
    },
    {
      type: "commit",
      value: `${CANDIDATE_COMMIT} — workflow-free resolved Doctor Who candidate before the reviewed cycle receipt.`,
    },
    {
      type: "restart-proof",
      value: `Lease ${LEASE_ID} was persisted by activation merge 79362e21d9d526f1310467574e69fe909eb80adb and resumed from exact main ${BASE_MAIN} by workflow run ${WORKFLOW_RUN}.`,
    },
  ],
};
await writeJson("/tmp/doctor-who-pilot-cycle-001-receipt-input.json", cycleInput);
runNode("scripts/waterline.mjs", ["record-cycle", "--input", "/tmp/doctor-who-pilot-cycle-001-receipt-input.json"]);
runNode("scripts/waterline.mjs", ["validate"]);
const waterline = await readJson("data/WATERLINE-STATE.json");
const cycle = waterline.cycles.find((row) => row.lease_id === LEASE_ID && row.scope_id === "doctor-who");
assert.ok(cycle, "reviewed Doctor Who cycle receipt was not written");
assert.equal(cycle.outcome, "completed");
assert.equal(cycle.task_statuses[TASK_ID], "resolved");
assert.equal(cycle.reviewed_role, "second-desk");

const doctorStatus = JSON.parse(runNode("scripts/waterline.mjs", ["status", "--scope", "doctor-who", "--requested", "1", "--json"], { capture: true }));
assert.ok(!doctorStatus.claim_reasons.includes("cycle_receipt_required"), "reviewed receipt did not release the Doctor Who cycle blocker");
const starStatus = JSON.parse(runNode("scripts/waterline.mjs", ["status", "--scope", "star-trek", "--requested", "1", "--json"], { capture: true }));
assert.ok(!starStatus.claim_reasons.includes("other_scope_cycle_receipt_required"), "reviewed receipt did not release the cross-scope blocker");

const registry = await readJson("data/ESTATE-REGISTRY.json");
const estate = registry.estates.find((row) => row.id === "doctor-who");
assert.ok(estate, "Doctor Who estate is missing");
estate.next_gate = `The first Doctor Who pilot cycle ${cycle.id} is complete within the preserved 316-task denominator; 315 tasks remain queued. Any next cycle must pass the ordinary media and waterline gates, issue at most one compatible lease, and return to a reviewed cycle receipt before another claim.`;
await writeJson("data/ESTATE-REGISTRY.json", registry);
runNode("scripts/census-adapter.mjs", ["write"]);
runNode("scripts/census-adapter.mjs", ["check"]);

const packageDoc = await readJson("package.json");
const checkerCommand = "node scripts/doctor-who-pilot-cycle.mjs check";
if (!packageDoc.scripts["autopilot:fixtures"].includes(checkerCommand)) {
  packageDoc.scripts["autopilot:fixtures"] += ` && ${checkerCommand}`;
}
await writeJson("package.json", packageDoc);

const fixturePath = "scripts/estate-certification-fixtures.mjs";
let fixture = await readFile(fixturePath, "utf8");
const declarationBefore = `const activationReport = readJson("data/review/adapter-sdk/doctor-who-activation-001.json");`;
const declarationAfter = `${declarationBefore}\nconst pilotReport = readJson("data/review/adapter-sdk/doctor-who-pilot-cycle-001.json");`;
if (!fixture.includes("const pilotReport =")) {
  if (!fixture.includes(declarationBefore)) throw new Error("estate fixture declaration contract drifted");
  fixture = fixture.replace(declarationBefore, declarationAfter);
}
const tailBefore = `assert.ok(estate.next_gate.includes(String(certificate.snapshot.rows)), "estate next gate does not carry the current role denominator");\nassert.ok(estate.next_gate.includes(activationReport.lease.lease_id), "estate next gate does not name the only authorized pilot lease");\n\nconsole.log(\`PASS — Doctor Who is active-corpus with \${certificate.snapshot.rows} exact roles, \${certificate.snapshot.complete_receipts} complete source receipts, one bounded Luna lease, and no canonical adoption\`);`;
const tailAfter = `assert.equal(pilotReport.decision.code, "doctor-who-first-pilot-cycle-completed", "Doctor Who pilot completion receipt is missing");\nassert.equal(pilotReport.queue.after.total, certificate.snapshot.rows, "pilot receipt lost the Doctor Who denominator");\nassert.equal(pilotReport.queue.after.queued, 315, "pilot receipt lost the post-cycle queue");\nassert.equal(pilotReport.queue.after.resolved, 1, "pilot receipt lost the resolved task");\nassert.ok(estate.next_gate.includes(String(certificate.snapshot.rows)), "estate next gate does not carry the preserved role denominator");\nassert.ok(estate.next_gate.includes(String(pilotReport.queue.after.queued)), "estate next gate does not carry the current queue denominator");\nassert.ok(estate.next_gate.includes(pilotReport.cycle.receipt_id), "estate next gate does not name the reviewed pilot cycle");\n\nconsole.log(\`PASS — Doctor Who is active-corpus with \${certificate.snapshot.rows} exact roles, \${certificate.snapshot.complete_receipts} complete source receipts, and one reviewed resolved pilot cycle\`);`;
if (fixture.includes(tailBefore)) fixture = fixture.replace(tailBefore, tailAfter);
else if (!fixture.includes("Doctor Who pilot completion receipt is missing")) throw new Error("estate fixture tail contract drifted");
await writeFile(fixturePath, fixture);

const specimens = await readJson("data/specimens.json");
const sources = await readJson("data/SOURCES.json");
const autopilot = await readJson("data/AUTOPILOT.json");
const autopilotJournal = (await readFile("data/journal/autopilot.jsonl", "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const mediaAudit = await readJson("data/MEDIA-AUDIT.json");
const mediaScopesDoc = await readJson("data/MEDIA-AUDIT-SCOPES.json");
const card = specimens.find((row) => row.id === context.canonical.wall_id);
const source = sources.find((row) => row.id === context.canonical.wall_id);
const job = autopilot.jobs.find((row) => row.id === TASK_ID);
const mediaItems = mediaAudit.items.filter((row) => row.wall_id === context.canonical.wall_id);
assert.ok(card && source && job, "final pilot product is incomplete");
assert.equal(card.actor, ACTOR);
assert.equal(card.character, CHARACTER);
assert.equal(card.kind, "voice");
assert.equal(card.transform, 2);
assert.equal(card.link, SOURCE);
assert.equal(card.still, undefined);
assert.equal(card.portrait, undefined);
assert.equal(source.still, null);
assert.equal(source.portrait, null);
assert.equal(job.status, "resolved");
assert.equal(autopilotJournal.filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who").length, 1, "final product issued a second Doctor Who lease");
assert.equal(mediaItems.length, 2);
assert.ok(mediaItems.every((row) => row.scope === "doctor-who" && row.status === "absent" && row.asset === null));
const mediaScopes = Array.isArray(mediaScopesDoc) ? mediaScopesDoc : mediaScopesDoc.scopes;
assert.ok(mediaScopes.find((row) => row.id === "doctor-who")?.match?.wall_ids?.includes(card.id));

const checkerSha = sha256(await readFile("scripts/doctor-who-pilot-cycle.mjs"));
const identity = {
  id: card.id,
  actor: card.actor,
  character: card.character,
  production: card.production,
  universe: card.universe,
  kind: card.kind,
  link: card.link,
};
const reportBody = {
  version: 1,
  transaction: "DOCTOR-WHO-PILOT-CYCLE-001",
  generated_at: REVIEWED_AT,
  execution: {
    base_main: BASE_MAIN,
    launcher_head: LAUNCHER_HEAD,
    workflow_run: WORKFLOW_RUN,
    candidate_commit: CANDIDATE_COMMIT,
  },
  lease: {
    lease_id: LEASE_ID,
    task_id: TASK_ID,
    performer: ACTOR,
    character: CHARACTER,
    source: SOURCE,
    source_fingerprint: context.lease.source_fingerprint,
    source_content_sha256: context.lease.source_content_sha256,
    readiness_token_sha256: sha256(context.lease.readiness_token),
  },
  canonical: {
    before_count: context.canonical.before_count,
    after_count: context.canonical.after_count,
    wall_id: card.id,
    actor: card.actor,
    character: card.character,
    production: card.production,
    universe: card.universe,
    kind: card.kind,
    transform_at_cycle: card.transform,
    identity_sha256: sha256(Buffer.from(stableJson(identity))),
  },
  media: {
    scope: "doctor-who",
    item_ids: mediaItems.map((row) => row.id).sort(),
    statuses_at_cycle: Object.fromEntries(mediaItems.map((row) => [row.side, row.status]).sort()),
    item_set_sha256: cycle.media_item_set_sha256,
    still_note: "No production-specific visual source identified the unnamed audio Commander; generic Sontaran and Strax imagery was excluded.",
    portrait_note: "The existing UC-337 Dan Starkey portrait was not duplicated; no byte-distinct portrait was adopted.",
  },
  queue: { after: context.queue },
  cycle: {
    receipt_id: cycle.id,
    outcome: cycle.outcome,
    task_status: cycle.task_statuses[TASK_ID],
    reviewed_by: cycle.reviewed_by,
    reviewed_role: cycle.reviewed_role,
    reviewed_at: cycle.reviewed_at,
    evidence: cycle.evidence,
  },
  isolation: context.isolation,
  source_custody: context.source_custody,
  post_receipt: {
    doctor_phase: doctorStatus.phase,
    doctor_claim_allowed: doctorStatus.claim_allowed,
    star_trek_phase: starStatus.phase,
    cross_scope_receipt_blocker_released: !starStatus.claim_reasons.includes("other_scope_cycle_receipt_required"),
  },
  proof: {
    checker: "scripts/doctor-who-pilot-cycle.mjs",
    checker_sha256: checkerSha,
    candidate_complete_gate_passed: true,
    final_complete_gate_required: true,
  },
  boundary: {
    second_lease_issued: false,
    generic_sontaran_image_used: false,
    existing_dan_starkey_portrait_duplicated: false,
    star_trek_jobs_changed: context.isolation.star_trek_jobs_sha256_before !== context.isolation.star_trek_jobs_sha256_after,
    other_scope_jobs_changed: context.isolation.non_doctor_jobs_sha256_before !== context.isolation.non_doctor_jobs_sha256_after,
    source_coverage_mutated: context.source_custody.coverage_sha256_before !== context.source_custody.coverage_sha256_after,
    source_manifest_mutated: context.source_custody.manifest_sha256_before !== context.source_custody.manifest_sha256_after,
    roadmap_milestone_completed: false,
  },
  decision: {
    status: "completed",
    code: "doctor-who-first-pilot-cycle-completed",
    next_gate: estate.next_gate,
  },
};
const report = { ...reportBody, receipt_sha256: sha256(Buffer.from(stableJson(reportBody))) };
await writeFile("data/review/adapter-sdk/doctor-who-pilot-cycle-001.json", stableJson(report));
runNode("scripts/doctor-who-pilot-cycle.mjs", ["check"]);
runNode("scripts/estate-certification-fixtures.mjs");
runNode("scripts/census-adapter.mjs", ["check"]);
runNode("scripts/autopilot.mjs", ["validate"]);
runNode("scripts/media-audit.mjs", ["gate", "--scope", "doctor-who"]);
runNode("scripts/waterline.mjs", ["validate"]);
console.log(`Doctor Who pilot cycle ${cycle.id} receipted; ${context.queue.queued} tasks remain queued and no second lease was issued.`);
