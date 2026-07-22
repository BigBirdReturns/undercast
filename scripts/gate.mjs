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
const MAX_BUFFER = 128 * 1024 * 1024;

export function runCommand(label, command, args, options = {}) {
  const { cwd = ROOT, env = process.env, stdio = "inherit", allowFail = false } = options;
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio,
    maxBuffer: MAX_BUFFER,
  });
  if (result.error) {
    if (allowFail) return { status: 1, stdout: "", stderr: result.error.message, failed: true };
    throw new Error(`${label} could not start "${command}": ${result.error.message}`);
  }
  const status = Number.isInteger(result.status) ? result.status : 1;
  const stdout = (result.stdout ?? "").toString().trim();
  const stderr = (result.stderr ?? "").toString().trim();
  if (status !== 0) {
    if (allowFail) return { status, stdout, stderr, failed: true };
    throw new Error(`${label} failed with code ${status} from "${command} ${args.join(" ")}": ${stderr || stdout || "unknown error"}`);
  }
  return { status, stdout, stderr, failed: false };
}

export function runNodeScript(label, scriptPath, args = [], options = {}) {
  return runCommand(label, process.execPath, [path.resolve(ROOT, scriptPath), ...args], { cwd: ROOT, ...options });
}

export function runNpmScript(label, script, extraArgs = [], options = {}) {
  return runCommand(label, npmCommand, ["run", script, ...extraArgs], { cwd: ROOT, ...options });
}

export function countRecordRouteDirs(recordsRoot = path.join(ROOT, "records")) {
  return readdirSync(recordsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
}

export function expectedRouteCount(
  specimensPath = path.join(ROOT, "data/specimens.json"),
  tombstonesPath = path.join(ROOT, "data/tombstones.json")
) {
  const specimens = JSON.parse(readFileSync(specimensPath, "utf8"));
  const tombstones = JSON.parse(readFileSync(tombstonesPath, "utf8"));
  return specimens.length + (Array.isArray(tombstones.records) ? tombstones.records.length : 0);
}

export function assertRouteCount({
  recordsRoot = path.join(ROOT, "records"),
  specimensPath = path.join(ROOT, "data/specimens.json"),
  tombstonesPath = path.join(ROOT, "data/tombstones.json"),
} = {}) {
  const actual = countRecordRouteDirs(recordsRoot);
  const expected = expectedRouteCount(specimensPath, tombstonesPath);
  if (actual !== expected) throw new Error(`route-count check failed: expected ${expected} route folders, found ${actual}`);
}

export function assertCleanWorkingTree(label, repoRoot = ROOT, paths = ["--", "."]) {
  const result = runCommand(label, "git", ["diff", "--exit-code", ...paths], {
    cwd: repoRoot,
    allowFail: true,
    stdio: "pipe",
  });
  if (result.failed) throw new Error(`${label}: working tree has unexpected changes`);
}

async function writeProjectionDiagnostics() {
  const driftRoot = path.join(ROOT, ".ci", "projection-drift");
  await mkdir(driftRoot, { recursive: true });
  const capture = (label, args) => runCommand(label, "git", args, { cwd: ROOT, allowFail: true, stdio: "pipe" });
  const status = capture("projection status", ["status", "--short"]);
  const diffStat = capture("projection stat", ["diff", "--stat"]);
  const diffPatch = capture("projection patch", ["diff", "--binary"]);
  await writeFile(path.join(driftRoot, "status.txt"), status.stdout, "utf8");
  await writeFile(path.join(driftRoot, "stat.txt"), diffStat.stdout, "utf8");
  await writeFile(path.join(driftRoot, "projection-drift.patch"), diffPatch.stdout, "utf8");
  const generated = path.join(driftRoot, "generated");
  await mkdir(generated, { recursive: true });
  for (const source of ["data/CENSUS-FERENGI-TEST.json", "data/quality.json", "data/species.json"]) {
    const destination = path.join(generated, `${path.basename(source)}.${createHash("sha256").update(source).digest("hex").slice(0, 8)}`);
    writeFileSync(destination, readFileSync(path.join(ROOT, source), "utf8"));
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
  try {
    const sync = runCommand("Autopilot isolated sync", process.execPath, [
      path.join(ROOT, "scripts", "autopilot.mjs"), "sync",
      "--state", statePath,
      "--journal", journalPath,
      "--lock", lockPath,
      "--json",
    ], { cwd: ROOT, stdio: "pipe" });
    runNodeScript("Autopilot sync validate", "scripts/autopilot.mjs", ["validate", "--state", statePath]);
    const status = JSON.parse(sync.stdout);
    const trek = status.scopes?.["star-trek"];
    if (!trek?.total) throw new Error("actual census produced no Star Trek tasks");
    const queued = trek.statuses?.queued || 0;
    const ready = (status.readiness || []).find((row) => row.scope_id === "star-trek");
    if (ready?.effective_status !== "active" && queued) throw new Error(`uncertified Star Trek scope produced ${queued} claimable tasks`);
    console.log(`actual census queue: Star Trek ${trek.total}; effective ${ready?.effective_status}; claimable ${queued}; attention ${trek.statuses?.attention || 0}; resolved ${trek.statuses?.resolved || 0}`);
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

const stepDefinitions = [
  { id: "gate-fixtures", label: "Validate canonical gate fixtures", action: () => runNpmScript("Gate fixtures", "gate:fixtures") },
  { id: "lockfile", label: "Verify package-lock consistency", action: () => runCommand("Lockfile consistency", npmCommand, ["ci", "--dry-run"], { cwd: ROOT }) },
  { id: "projections", label: "Rebuild projection and refuse drift", action: runProjectedSteps },
  { id: "archive", label: "Validate archive invariants", action: () => runNodeScript("Archive invariants", "scripts/validate.mjs") },
  { id: "autopilot", label: "Validate Autopilot queue and fixtures", action: () => {
    runNodeScript("Autopilot state", "scripts/autopilot.mjs", ["validate"]);
    runNpmScript("Autopilot fixtures", "autopilot:fixtures");
  } },
  { id: "roadmap", label: "Validate roadmap and next-work contract", action: () => {
    runNpmScript("Roadmap validate", "roadmap", ["--", "validate"]);
    runNpmScript("Roadmap fixtures", "roadmap:fixtures");
    runNpmScript("Roadmap next", "roadmap", ["--", "next", "--limit", "1", "--json"]);
  } },
  { id: "preservation", label: "Validate preservation machinery and durability", action: () => {
    runNpmScript("Preservation fixtures", "preserve:fixtures");
    runNpmScript("Preservation status", "preserve:status", ["--", "--json"]);
  } },
  { id: "media-audit", label: "Validate exact-subject media audit tracker", action: () => {
    runNpmScript("Media audit fixtures", "media:audit:fixtures");
    runNpmScript("Media audit state", "media:audit", ["--", "validate"]);
    runNpmScript("Media audit status", "media:audit", ["--", "status", "--scope", "star-trek"]);
  } },
  { id: "census-sync", label: "Validate isolated certification-aware census sync", action: runAutopilotSyncAssertion },
  { id: "corpus", label: "Validate semantic corpus", action: () => runNpmScript("Corpus audit", "audit:corpus") },
  { id: "site-seams", label: "Validate public site seams", action: () => runNpmScript("Site seams", "test:site-seams") },
  { id: "routes-build", label: "Build permanent routes", action: () => runNodeScript("Permanent routes", "scripts/build-record-pages.mjs") },
  { id: "rendered", label: "Exercise rendered interactions", rendered: true, action: () => runNpmScript("Rendered interactions", "test:rendered") },
  { id: "route-count", label: "Verify route count", action: () => assertRouteCount() },
  { id: "ds9-project", label: "Rebuild offline DS9 projections", action: () => {
    runNodeScript("DS9 census", "scripts/ds9-census.mjs", ["--project-only"]);
    runNodeScript("DS9 graph", "scripts/ds9-graph.mjs", ["--project-only"]);
    runNodeScript("DS9 eligibility queue", "scripts/ds9-eligibility-queue.mjs");
    runNodeScript("DS9 maker queue", "scripts/ds9-maker-queue.mjs");
  } },
  { id: "ds9-drift", label: "Refuse DS9 projection drift", action: () => assertCleanWorkingTree("DS9 projection drift", ROOT, ["--", "data/ds9"]) },
  { id: "ds9-census-fixtures", label: "Validate DS9 census fixtures", action: () => runNpmScript("DS9 census fixtures", "ds9:fixtures") },
  { id: "ds9-eligibility-fixtures", label: "Validate DS9 eligibility fixtures", action: () => runNpmScript("DS9 eligibility fixtures", "ds9:eligibility:fixtures") },
  { id: "ds9-maker-fixtures", label: "Validate DS9 maker fixtures", action: () => runNpmScript("DS9 maker fixtures", "ds9:maker:fixtures") },
  { id: "diff-check", label: "Refuse malformed diff", action: () => runCommand("Diff check", "git", ["diff", "--check"], { cwd: ROOT }) },
];

export function selectSteps({ from = null, skipRendered = false } = {}) {
  let started = !from;
  const selected = [];
  for (const step of stepDefinitions) {
    if (!started && (step.id.includes(from) || step.label.toLowerCase().includes(from.toLowerCase()))) started = true;
    if (!started || (skipRendered && step.rendered)) continue;
    selected.push(step);
  }
  if (from && !started) throw new Error(`--from ${JSON.stringify(from)} matched no gate step`);
  if (!selected.length) throw new Error("canonical gate selected zero steps");
  return selected;
}

export function listSteps() {
  return stepDefinitions.map(({ id, label, rendered = false }) => ({ id, label, rendered }));
}

export async function runGate({ from = null, skipRendered = false } = {}) {
  const steps = selectSteps({ from, skipRendered });
  const started = Date.now();
  for (const step of steps) {
    const at = Date.now();
    console.log(`\n>>> ${step.label} [${step.id}]`);
    await step.action();
    console.log(`<<< PASS ${step.id} (${((Date.now() - at) / 1000).toFixed(1)}s)`);
  }
  console.log(`\ngate: PASS — ${steps.length} step(s) in ${((Date.now() - started) / 1000).toFixed(0)}s${skipRendered ? " (rendered skipped by explicit request)" : ""}`);
}

function cliOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes("--list")) {
    for (const step of listSteps()) console.log(`${step.id.padEnd(28)} ${step.rendered ? "[rendered] " : "           "}${step.label}`);
  } else {
    runGate({ from: cliOption(argv, "--from"), skipRendered: argv.includes("--skip-rendered") }).catch((error) => {
      console.error(`gate: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
  }
}
