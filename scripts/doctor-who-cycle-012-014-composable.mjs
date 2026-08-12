#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const WRAPPER = "scripts/doctor-who-cycle-012-014-composable.mjs";
const COMPOSABILITY = "data/review/adapter-sdk/doctor-who-cycles-012-014-composability-v1.json";
const TOTAL = 316;
const ACTIVE = new Set(["leased", "drafted", "merged"]);
const CONFIG = {
  "012": {
    receipt: "data/review/adapter-sdk/doctor-who-cycle-012-senstarg.json",
    checker: "scripts/doctor-who-cycle-012.mjs",
    checker_sha256: "17a3320d5a4d7f9d1b71cf291d1b0e65498f94f00a57fe6218383fd9e4f7f5b2",
    receipt_identity: "da8185dbc7f51eaa8f30174f669b8cb2f74e7c0763224540e33f8928c287ef15",
    task_id: "ap_8965086737382df0e88366db",
    lease_id: "lease_91feba4df199b92d8b266081",
    cycle_id: "cycle_f05bd15801eff66c85868f52",
    review: "2026-08-12T01:30:00.000Z",
    historical_claims: 12,
    queued_at_review: 304,
    resolved_floor: 12,
  },
  "013": {
    receipt: "data/review/adapter-sdk/doctor-who-cycle-013-shallo.json",
    checker: "scripts/doctor-who-cycle-013.mjs",
    checker_sha256: "1b33af962c0e68e1717b55fcaf9e97afd14251900ad301b6ac30c3757d0eca67",
    receipt_identity: "8278e4feace603e4576764e8c73653010e5db735731e7ed89bd77e1d4b717480",
    task_id: "ap_870b903a6e8eb4189e949440",
    lease_id: "lease_6958bf47e8a0b57c9914965c",
    cycle_id: "cycle_740604a4a4954725e4228d95",
    review: "2026-08-12T07:50:00.000Z",
    historical_claims: 13,
    queued_at_review: 303,
    resolved_floor: 13,
  },
  "014": {
    receipt: "data/review/adapter-sdk/doctor-who-cycle-014-shrok.json",
    checker: "scripts/doctor-who-cycle-014.mjs",
    checker_sha256: "dcd3786eef3d1c1a67462e82e7f50f7e2536bafdff5e859c1ca8ffd59deb93d5",
    receipt_identity: "ad18acffedc565c960d2aa731ff54cacb4827d59414af0fa56b3579998dc6084",
    task_id: "ap_233684e7d7b9f896f98a7b14",
    lease_id: "lease_5569f731fbb60f275b9d9d5b",
    cycle_id: "cycle_33fdaa5d9da82e063365abd3",
    review: "2026-08-12T08:40:00.000Z",
    historical_claims: 14,
    queued_at_review: 302,
    resolved_floor: 14,
  },
};

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => JSON.stringify(stable(value));
const pretty = (value) => JSON.stringify(stable(value), null, 2) + "\n";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const jsonl = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ok = (value, message) => { if (!value) throw new Error(message); };
const time = (value, message) => {
  const parsed = Date.parse(value || "");
  ok(Number.isFinite(parsed), message);
  return parsed;
};
const claimId = (row) => {
  const body = structuredClone(row);
  delete body.id;
  return `apj_${sha(JSON.stringify(body)).slice(0, 24)}`;
};
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}: ${result.stderr || result.stdout || "unknown error"}`);
  }
  return result.stdout;
};

const cycleNumber = process.argv[2];
const config = CONFIG[cycleNumber];
ok(config, "usage: node scripts/doctor-who-cycle-012-014-composable.mjs 012|013|014");

const composability = read(COMPOSABILITY);
const composabilityBody = structuredClone(composability);
delete composabilityBody.receipt_sha256;
ok(composability.receipt_sha256 === sha(pretty(composabilityBody)), "Doctor Who cycles 012-014 composability receipt hash drifted");
ok(composability.transaction === "DOCTOR-WHO-CYCLES-012-014-COMPOSABILITY-V1" && composability.version === 1, "Doctor Who composability receipt identity drifted");
ok(composability.wrapper?.path === WRAPPER && composability.wrapper.sha256 === sha(fs.readFileSync(WRAPPER)), "Doctor Who composability wrapper drifted");
const compositionRow = composability.cycles.find((row) => row.cycle_number === cycleNumber);
ok(compositionRow
  && compositionRow.receipt_path === config.receipt
  && compositionRow.receipt_identity === config.receipt_identity
  && compositionRow.historical_checker_path === config.checker
  && compositionRow.historical_checker_sha256 === config.checker_sha256
  && compositionRow.cycle_id === config.cycle_id, `cycle ${cycleNumber} composability binding drifted`);

const receipt = read(config.receipt);
const receiptBody = structuredClone(receipt);
delete receiptBody.receipt_sha256;
ok(receipt.receipt_sha256 === sha(pretty(receiptBody)) && receipt.receipt_sha256 === config.receipt_identity, `cycle ${cycleNumber} historical receipt drifted`);
ok(receipt.qualification?.checker_sha256 === config.checker_sha256
  && sha(fs.readFileSync(config.checker)) === config.checker_sha256, `cycle ${cycleNumber} historical checker drifted`);

const autopilot = read("data/AUTOPILOT.json");
const journal = jsonl("data/journal/autopilot.jsonl");
const water = read("data/WATERLINE-STATE.json");
const registry = read("data/ESTATE-REGISTRY.json");
const baseline = read("data/review/adapter-sdk/BASELINE.json");
const packageJson = read("package.json");
const doctor = autopilot.jobs.filter((row) => row.scope === "doctor-who");
const task = doctor.find((row) => row.id === config.task_id);
ok(doctor.length === TOTAL, "Doctor Who denominator changed");
ok(task?.status === "resolved", `cycle ${cycleNumber} task is no longer resolved`);

const claims = journal.filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who");
for (const claim of claims) ok(claim.id === claimId(claim), "Doctor Who claim is not content-addressed");
const historical = claims.filter((row) => time(row.at, "claim timestamp") <= time(config.review, "review timestamp"));
ok(historical.length === config.historical_claims, `cycle ${cycleNumber} historical claim denominator changed`);
ok(historical.some((row) => row.lease_id === config.lease_id && row.task_id === config.task_id), `cycle ${cycleNumber} historical claim disappeared`);

const receipts = water.cycles.filter((row) => row.scope_id === "doctor-who");
const byLease = new Map();
for (const row of receipts) {
  ok(!byLease.has(row.lease_id), "duplicate Doctor Who cycle receipt");
  byLease.set(row.lease_id, row);
}
ok(byLease.get(config.lease_id)?.id === config.cycle_id, `cycle ${cycleNumber} reviewed receipt disappeared`);
const later = claims.filter((row) => time(row.at, "claim timestamp") > time(config.review, "review timestamp"));
const unreceipted = later.filter((row) => !byLease.has(row.lease_id));
ok(unreceipted.length <= 1, "more than one later Doctor Who cycle is unreceipted");
ok(doctor.filter((row) => ACTIVE.has(row.status)).length <= 1, "more than one later Doctor Who task is active");
for (const row of later.filter((item) => byLease.has(item.lease_id))) {
  const laterCycle = byLease.get(row.lease_id);
  const laterJob = doctor.find((item) => item.id === row.task_id);
  ok(laterCycle.task_ids?.length === 1 && laterCycle.task_ids[0] === row.task_id && laterJob?.status === "resolved", "later receipted Doctor Who cycle drifted");
}
ok(doctor.filter((row) => row.status === "resolved").length >= config.resolved_floor, `cycle ${cycleNumber} resolved floor regressed`);

const queued = doctor.filter((row) => row.status === "queued").length;
const latest = [...receipts].sort((a, b) => time(a.reviewed_at, "cycle review") - time(b.reviewed_at, "cycle review")).at(-1);
const estate = registry.estates.find((row) => row.id === "doctor-who");
ok(latest
  && estate?.next_gate?.includes(latest.id)
  && estate.next_gate.includes(`${queued} tasks remain queued`), "current Doctor Who registry gate drifted");
ok(baseline.inputs?.estate_registry?.sha256 === sha(fs.readFileSync("data/ESTATE-REGISTRY.json")), "current adapter baseline registry binding drifted");
ok(receipts.some((row) => row.id === composability.current_floor.latest_cycle_id), "Doctor Who composability floor cycle disappeared");
ok(doctor.filter((row) => row.status === "resolved").length >= composability.current_floor.resolved_floor, "Doctor Who composability resolved floor regressed");
ok(queued <= composability.current_floor.queued_ceiling, "Doctor Who composability queued ceiling regressed");

const expectedRoute = `node ${WRAPPER} ${cycleNumber}`;
ok(packageJson.scripts?.[`doctor-who:cycle-${cycleNumber}:check`] === expectedRoute, `cycle ${cycleNumber} package route drifted`);
for (const laterCycle of ["013", "014", "015"]) {
  ok(packageJson.scripts?.["autopilot:fixtures"]?.includes(`npm run doctor-who:cycle-${laterCycle}:check`), `autopilot fixture omits cycle ${laterCycle}`);
}

const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), `undercast-dw-cycle-${cycleNumber}-`));
const tempRoot = path.join(tempParent, "worktree");
let worktreeAdded = false;
try {
  run("git", ["worktree", "add", "--detach", tempRoot, "HEAD"]);
  worktreeAdded = true;
  const historicalRegistryPath = path.join(tempRoot, "data/ESTATE-REGISTRY.json");
  const historicalBaselinePath = path.join(tempRoot, "data/review/adapter-sdk/BASELINE.json");
  const historicalPackagePath = path.join(tempRoot, "package.json");
  const historicalRegistry = JSON.parse(fs.readFileSync(historicalRegistryPath, "utf8"));
  const historicalEstate = historicalRegistry.estates.find((row) => row.id === "doctor-who");
  ok(historicalEstate, "historical Doctor Who estate row missing");
  historicalEstate.next_gate = `Doctor Who reviewed cycle ${cycleNumber} ${config.cycle_id}; ${config.queued_at_review} tasks remain queued. Historical registry statement reconstructed solely for immutable checker execution.`;
  const historicalRegistryBytes = Buffer.from(JSON.stringify(historicalRegistry, null, 2) + "\n");
  fs.writeFileSync(historicalRegistryPath, historicalRegistryBytes);
  const historicalBaseline = JSON.parse(fs.readFileSync(historicalBaselinePath, "utf8"));
  historicalBaseline.inputs.estate_registry.sha256 = sha(historicalRegistryBytes);
  fs.writeFileSync(historicalBaselinePath, JSON.stringify(historicalBaseline, null, 2) + "\n");
  const historicalPackage = JSON.parse(fs.readFileSync(historicalPackagePath, "utf8"));
  historicalPackage.scripts[`doctor-who:cycle-${cycleNumber}:check`] = `node ${config.checker}`;
  fs.writeFileSync(historicalPackagePath, JSON.stringify(historicalPackage, null, 2) + "\n");
  const result = spawnSync(process.execPath, [config.checker], {
    cwd: tempRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`cycle ${cycleNumber} immutable checker failed in reconstructed registry context: ${result.stderr || result.stdout || "unknown error"}`);
  }
} finally {
  if (worktreeAdded) {
    spawnSync("git", ["worktree", "remove", "--force", tempRoot], { encoding: "utf8" });
  }
  fs.rmSync(tempParent, { recursive: true, force: true });
}

ok(composability.boundary?.historical_checker_bytes_rewritten === false
  && composability.boundary?.historical_receipts_rewritten === false
  && composability.boundary?.later_cycles_must_be_receipted === true
  && composability.boundary?.outside_human_dependency === false
  && composability.boundary?.owner_physical_action_required === false, "Doctor Who composability boundary drifted");

console.log(`doctor-who-cycle-${cycleNumber}-composable: PASS — immutable cycle ${cycleNumber} checker and receipt custody survive the current registry, all later Doctor Who claims remain bounded, and cycle 015 remains the current reviewed floor`);
