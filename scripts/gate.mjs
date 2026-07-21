#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

export function runCommand(label, command, args, options = {}) {
  const {
    cwd = ROOT,
    env = process.env,
    stdio = "pipe",
    allowFail = false,
  } = options;

  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio,
  });

  const status = result.status ?? 0;
  const stdout = (result.stdout ?? "").toString().trim();
  const stderr = (result.stderr ?? "").toString().trim();

  if (status !== 0) {
    if (allowFail) {
      return { status, stdout, stderr, failed: true };
    }
    throw new Error(
      `${label} failed with code ${status} from "${command} ${args.join(" ")}": ${stderr || stdout || "unknown error"}`
    );
  }

  return { status, stdout, stderr, failed: false };
}

export function runNodeScript(label, scriptPath, args = []) {
  return runCommand(label, process.execPath, [path.resolve(ROOT, scriptPath), ...args], {
    cwd: ROOT,
  });
}

export function runNpmScript(label, script, extraArgs = []) {
  return runCommand(label, npmCommand, ["run", script, ...extraArgs], {
    cwd: ROOT,
  });
}

export function countRecordRouteDirs(recordsRoot = path.join(ROOT, "records")) {
  const entries = readdirSync(recordsRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).length;
}

export function expectedRouteCount(specimensPath = path.join(ROOT, "data/specimens.json"), tombstonesPath = path.join(ROOT, "data/tombstones.json")) {
  const specimens = JSON.parse(readFileSync(specimensPath, "utf8"));
  const tombstones = JSON.parse(readFileSync(tombstonesPath, "utf8"));
  const tombstoneRecords = Array.isArray(tombstones.records) ? tombstones.records.length : 0;
  return specimens.length + tombstoneRecords;
}

export function assertRouteCount({
  recordsRoot = path.join(ROOT, "records"),
  specimensPath = path.join(ROOT, "data/specimens.json"),
  tombstonesPath = path.join(ROOT, "data/tombstones.json"),
} = {}) {
  const actual = countRecordRouteDirs(recordsRoot);
  const expected = expectedRouteCount(specimensPath, tombstonesPath);
  if (actual !== expected) {
    throw new Error(`route-count check failed: expected ${expected} route folders, found ${actual}`);
  }
}

export function assertCleanWorkingTree(label, repoRoot = ROOT, paths = ["--", "."]) {
  const result = runCommand(label, "git", ["diff", "--exit-code", ...paths], {
    cwd: repoRoot,
    allowFail: true,
  });
  if (result.failed) {
    throw new Error(`${label}: working tree has unexpected changes`);
  }
}

async function writeProjectionDiagnostics() {
  const driftRoot = path.join(ROOT, ".ci", "projection-drift");
  await mkdir(driftRoot, { recursive: true });

  const status = runCommand("projection status", "git", ["status", "--short"], {
    cwd: ROOT,
    allowFail: true,
  });
  const diffStat = runCommand("projection stat", "git", ["diff", "--stat"], {
    cwd: ROOT,
    allowFail: true,
  });
  const diffPatch = runCommand("projection patch", "git", ["diff", "--binary"], {
    cwd: ROOT,
    allowFail: true,
  });

  await writeFile(path.join(driftRoot, "status.txt"), status.stdout, "utf8");
  await writeFile(path.join(driftRoot, "stat.txt"), diffStat.stdout, "utf8");
  await writeFile(path.join(driftRoot, "projection-drift.patch"), diffPatch.stdout, "utf8");

  const generated = path.join(driftRoot, "generated");
  await mkdir(generated, { recursive: true });
  for (const source of [
    "data/CENSUS-FERENGI-TEST.json",
    "data/quality.json",
    "data/species.json",
  ]) {
    const absolute = path.join(ROOT, source);
    const destination = path.join(generated, `${path.basename(source)}.${createHash("sha256").update(source).digest("hex").slice(0, 8)}`);
    writeFileSync(destination, readFileSync(absolute, "utf8"));
  }
}

async function runProjectedSteps() {
  try {
    runNodeScript("Rebuild deterministic projection", "scripts/shard.mjs");
    assertCleanWorkingTree("Refuse generated drift", ROOT);
  } catch (error) {
    await writeProjectionDiagnostics();
    throw error;
  }
}

async function runAutopilotSyncAssertion() {
  const workRoot = await mkdtemp(path.join(tmpdir(), "undercast-gate-autopilot-"));
  const statePath = path.join(workRoot, "AUTOPILOT.json");
  const journalPath = path.join(workRoot, "autopilot.jsonl");
  const lockPath = path.join(workRoot, "AUTOPILOT.lock");
  const statusPath = path.join(workRoot, "status.json");

  try {
    const sync = runCommand(
      "Autopilot isolated sync",
      process.execPath,
      [
        path.join(ROOT, "scripts", "autopilot.mjs"),
        "sync",
        "--state",
        statePath,
        "--journal",
        journalPath,
        "--lock",
        lockPath,
        "--json",
      ],
      { cwd: ROOT }
    );
    await writeFile(statusPath, sync.stdout, "utf8");

    runNodeScript("Autopilot sync validate", "scripts/autopilot.mjs", ["validate", "--state", statePath]);

    const status = JSON.parse(sync.stdout);
    const trek = status.scopes?.["star-trek"];
    if (!trek?.total) throw new Error("actual census produced no Star Trek tasks");
    const queued = trek.statuses?.queued || 0;
    const ready = (status.readiness || []).find((row) => row.scope_id === "star-trek");
    if (ready?.effective_status !== "active" && queued) {
      throw new Error(`uncertified Star Trek scope produced ${queued} claimable tasks`);
    }
    console.log(
      `actual census queue: Star Trek ${trek.total}; effective ${ready?.effective_status}; claimable ${queued}; attention ${trek.statuses?.attention || 0}; resolved ${trek.statuses?.resolved || 0}`
    );
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

const steps = [
  ["Rebuild projection and refuse drift", runProjectedSteps],
  ["Validate archive invariants", () => runNodeScript("Validate archive invariants", "scripts/validate.mjs")],
  [
    "Validate autopilot queue contract and fixtures",
    () => {
      runNodeScript("Validate autopilot", "scripts/autopilot.mjs", ["validate"]);
      runNpmScript("Validate autopilot fixtures", "autopilot:fixtures");
    },
  ],
  ["Validate roadmap and next-work contract", () => {
    runNpmScript("Roadmap validate", "roadmap", ["--", "validate"]);
    runNpmScript("Roadmap fixtures", "roadmap:fixtures");
    runNpmScript("Roadmap next", "roadmap", ["--", "next", "--limit", "1", "--json"]);
  }],
  ["Validate preservation machinery and report status", () => {
    runNpmScript("Preservation fixtures", "preserve:fixtures");
    runNpmScript("Preservation status", "preserve:status", ["--", "--json"]);
  }],
  ["Validate isolated certification-aware census sync", runAutopilotSyncAssertion],
  ["Validate semantic corpus", () => runNpmScript("Corpus audit", "audit:corpus")],
  ["Validate public site seams", () => runNpmScript("Site seams", "test:site-seams")],
  ["Build permanent routes", () => runNodeScript("Build permanent routes", "scripts/build-record-pages.mjs")],
  ["Exercise rendered interactions", () => runNpmScript("Rendered interactions", "test:rendered")],
  ["Verify route count", () => assertRouteCount()],
  ["Rebuild offline DS9 projections", () => {
    runNodeScript("DS9 census", "scripts/ds9-census.mjs", ["--project-only"]);
    runNodeScript("DS9 graph", "scripts/ds9-graph.mjs", ["--project-only"]);
    runNodeScript("DS9 eligibility queue", "scripts/ds9-eligibility-queue.mjs");
    runNodeScript("DS9 maker queue", "scripts/ds9-maker-queue.mjs");
  }],
  ["Refuse DS9 projection drift", () => assertCleanWorkingTree("Refuse DS9 projection drift", ROOT, ["data/ds9"])],
  ["DS9 census regression fixtures", () => runNpmScript("DS9 census fixtures", "ds9:fixtures")],
  ["DS9 eligibility review-queue fixtures", () => runNpmScript("DS9 eligibility fixtures", "ds9:eligibility:fixtures")],
  ["DS9 maker attribution review-queue fixtures", () => runNpmScript("DS9 maker fixtures", "ds9:maker:fixtures")],
];

export async function runGate() {
  for (const [label, action] of steps) {
    console.log(`>>> ${label}`);
    await action();
  }
  console.log("gate: PASS");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runGate().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
