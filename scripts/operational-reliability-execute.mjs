#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  EVIDENCE_TIER,
  runPublicationRollbackDrill,
  runRepositoryRestoreDrill,
  selectRepositorySnapshot,
  sha256,
  validateEvidenceBundle,
  validateRestoreReceipt,
} from "./operational-reliability.mjs";

const COMMIT_RE = /^[0-9a-f]{40}$/;

function requireString(value, label) {
  if (!String(value || "").trim()) throw new Error(`${label} is required`);
  return String(value).trim();
}
function requireCommit(value, label) {
  const text = requireString(value, label);
  if (!COMMIT_RE.test(text)) throw new Error(`${label} must be a full 40-character commit SHA`);
  return text;
}
async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { throw new Error(`cannot read JSON ${file}: ${error.message}`); }
}
function run(command, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const duration_ms = Date.now() - started;
  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");
  if (result.error) throw new Error(`${options.label || command} could not start: ${result.error.message}`);
  const exit_code = Number.isInteger(result.status) ? result.status : 1;
  if (exit_code !== 0 && !options.allowFail) {
    throw new Error(`${options.label || command} failed with code ${exit_code}: ${(stderr || stdout || "unknown error").slice(-4000)}`);
  }
  return {
    command: [command, ...args].join(" "),
    exit_code,
    duration_ms,
    stdout,
    stderr,
    stdout_sha256: sha256(stdout),
    stderr_sha256: sha256(stderr),
  };
}
function npmInvocation(args) {
  if (process.platform !== "win32") return { command: "npm", args };
  return {
    command: process.execPath,
    args: [path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), ...args],
  };
}
function git(root, args, options = {}) {
  return run("git", args, { cwd: root, label: options.label || `git ${args[0]}`, allowFail: options.allowFail });
}

export function initializeDisposableVerificationIndex(restoredRoot, targetHead) {
  restoredRoot = path.resolve(restoredRoot);
  targetHead = requireCommit(targetHead, "verification target head");
  git(restoredRoot, ["init", "-q"], { label: "initialize disposable verification repository" });
  git(restoredRoot, ["config", "user.name", "undercast-restore-drill"], { label: "configure verification author name" });
  git(restoredRoot, ["config", "user.email", "undercast-restore-drill@users.noreply.github.com"], { label: "configure verification author email" });
  git(restoredRoot, ["config", "core.autocrlf", "false"], { label: "disable verification line-ending translation" });
  git(restoredRoot, ["add", "--force", "-A", "--", "."], { label: "stage exact restored tree" });
  const staged = git(restoredRoot, ["diff", "--cached", "--name-only", "--", "."], { label: "list verification baseline paths" });
  const tracked_paths = staged.stdout.split(/\r?\n/).filter(Boolean).length;
  if (!tracked_paths) throw new Error("disposable verification repository staged zero paths");
  git(restoredRoot, ["commit", "-q", "--no-gpg-sign", "-m", `Operational reliability: index restored target ${targetHead}`], { label: "commit disposable verification baseline" });
  const baseline_commit = git(restoredRoot, ["rev-parse", "HEAD"], { label: "read verification baseline commit" }).stdout.trim();
  const baseline_tree = git(restoredRoot, ["rev-parse", "HEAD^{tree}"], { label: "read verification baseline tree" }).stdout.trim();
  requireCommit(baseline_commit, "verification baseline commit");
  requireCommit(baseline_tree, "verification baseline tree");
  const status = git(restoredRoot, ["status", "--porcelain=v1", "--untracked-files=all"], { label: "prove clean verification baseline" });
  if (status.stdout.trim()) throw new Error("disposable verification baseline is dirty immediately after commit");
  return {
    mode: "disposable-local-git-index",
    baseline_commit,
    baseline_tree,
    target_head: targetHead,
    tracked_paths,
    initialized_after_exact_tree_proof: true,
    source_history_restored: false,
  };
}

export function validateExecutedRestoreReceipt(receipt) {
  validateRestoreReceipt(receipt);
  if (receipt.verification_index?.mode !== "disposable-local-git-index") throw new Error("executed restore verification index mode is invalid");
  requireCommit(receipt.verification_index?.baseline_commit, "executed restore verification baseline commit");
  requireCommit(receipt.verification_index?.baseline_tree, "executed restore verification baseline tree");
  requireCommit(receipt.verification_index?.target_head, "executed restore verification target head");
  if (receipt.verification_index.target_head !== receipt.forward_recovery.target_head) throw new Error("executed restore verification index targets a different head");
  if (!Number.isInteger(receipt.verification_index?.tracked_paths) || receipt.verification_index.tracked_paths <= 0) throw new Error("executed restore verification index tracked path count is invalid");
  if (receipt.verification_index?.initialized_after_exact_tree_proof !== true || receipt.verification_index?.source_history_restored !== false) {
    throw new Error("executed restore verification index boundary is invalid");
  }
  if (receipt.boundary?.disposable_verification_index_created !== true || receipt.boundary?.source_history_restored !== false) {
    throw new Error("executed restore source-history boundary is invalid");
  }
  if (receipt.dependency_install?.exit_code !== 0 || receipt.canonical_gate?.exit_code !== 0) throw new Error("executed restore commands did not pass");
  return true;
}

export async function executeRepositoryRestoreDrill({
  checkoutRoot,
  registryPath,
  archivePath,
  snapshotId = null,
  targetHead,
  workRoot,
  outputPath,
}) {
  workRoot = path.resolve(workRoot);
  outputPath = path.resolve(outputPath);
  const preflightReceiptPath = path.join(path.dirname(workRoot), `.restore-preflight-${process.pid}.json`);
  let preflight;
  try {
    preflight = await runRepositoryRestoreDrill({
      checkoutRoot,
      registryPath,
      archivePath,
      snapshotId,
      targetHead,
      workRoot,
      outputPath: preflightReceiptPath,
      install: false,
      gate: false,
    });
    const verification_index = initializeDisposableVerificationIndex(preflight.restoredRoot, preflight.receipt.forward_recovery.target_head);
    const invocation = npmInvocation(["ci"]);
    const dependency_install = run(invocation.command, invocation.args, {
      cwd: preflight.restoredRoot,
      label: "install restored dependencies",
      allowFail: true,
    });
    await writeFile(path.join(preflight.diagnosticsRoot, "npm-ci.stdout.log"), dependency_install.stdout, "utf8");
    await writeFile(path.join(preflight.diagnosticsRoot, "npm-ci.stderr.log"), dependency_install.stderr, "utf8");
    if (dependency_install.exit_code !== 0) {
      throw new Error(`install restored dependencies failed with code ${dependency_install.exit_code}: ${(dependency_install.stderr || dependency_install.stdout || "unknown error").slice(-4000)}`);
    }

    const gateInvocation = npmInvocation(["run", "gate"]);
    const canonical_gate = run(gateInvocation.command, gateInvocation.args, {
      cwd: preflight.restoredRoot,
      label: "canonical gate on restored repository",
      allowFail: true,
    });
    await writeFile(path.join(preflight.diagnosticsRoot, "gate.stdout.log"), canonical_gate.stdout, "utf8");
    await writeFile(path.join(preflight.diagnosticsRoot, "gate.stderr.log"), canonical_gate.stderr, "utf8");
    if (canonical_gate.exit_code !== 0) {
      throw new Error(`canonical gate on restored repository failed with code ${canonical_gate.exit_code}: ${(canonical_gate.stderr || canonical_gate.stdout || "unknown error").slice(-4000)}`);
    }

    const receipt = {
      ...preflight.receipt,
      generated_at: new Date().toISOString(),
      evidence_tier: EVIDENCE_TIER,
      verification_index,
      dependency_install: {
        command: dependency_install.command,
        exit_code: dependency_install.exit_code,
        duration_ms: dependency_install.duration_ms,
        stdout_sha256: dependency_install.stdout_sha256,
        stderr_sha256: dependency_install.stderr_sha256,
      },
      canonical_gate: {
        command: canonical_gate.command,
        exit_code: canonical_gate.exit_code,
        duration_ms: canonical_gate.duration_ms,
        stdout_sha256: canonical_gate.stdout_sha256,
        stderr_sha256: canonical_gate.stderr_sha256,
      },
      boundary: {
        ...preflight.receipt.boundary,
        disposable_verification_index_created: true,
        source_history_restored: false,
      },
    };
    validateExecutedRestoreReceipt(receipt);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    return { receipt, restoredRoot: preflight.restoredRoot, diagnosticsRoot: preflight.diagnosticsRoot };
  } finally {
    await rm(preflightReceiptPath, { force: true }).catch(() => {});
  }
}

function parseCli(argv) {
  const args = [...argv];
  const command = args.shift() || "help";
  const values = new Map();
  while (args.length) {
    const token = args.shift();
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const key = token.slice(2);
    const value = args.shift();
    if (!value || value.startsWith("--")) throw new Error(`--${key} requires a value`);
    values.set(key, value);
  }
  return { command, value: (key, fallback = null) => values.has(key) ? values.get(key) : fallback };
}

async function cli() {
  const { command, value } = parseCli(process.argv.slice(2));
  if (command === "select-snapshot") {
    const registryPath = path.resolve(value("registry", "preservation/SNAPSHOTS.json"));
    const selected = selectRepositorySnapshot(await readJson(registryPath), value("snapshot-id"));
    console.log(JSON.stringify(selected, null, 2));
    return;
  }
  if (command === "restore-drill") {
    await executeRepositoryRestoreDrill({
      checkoutRoot: value("checkout-root", "."),
      registryPath: value("registry", "preservation/SNAPSHOTS.json"),
      archivePath: requireString(value("archive"), "--archive"),
      snapshotId: value("snapshot-id"),
      targetHead: requireString(value("target-head"), "--target-head"),
      workRoot: requireString(value("work-root"), "--work-root"),
      outputPath: requireString(value("output"), "--output"),
    });
    return;
  }
  if (command === "rollback-drill") {
    await runPublicationRollbackDrill({
      restoredRoot: requireString(value("restored-root"), "--restored-root"),
      restoreReceiptPath: requireString(value("restore-receipt"), "--restore-receipt"),
      workRoot: requireString(value("work-root"), "--work-root"),
      outputPath: requireString(value("output"), "--output"),
    });
    return;
  }
  if (command === "validate-bundle") {
    const bundle = await validateEvidenceBundle(
      requireString(value("restore-receipt"), "--restore-receipt"),
      requireString(value("rollback-receipt"), "--rollback-receipt"),
    );
    const output = value("output");
    if (output) {
      await mkdir(path.dirname(path.resolve(output)), { recursive: true });
      await writeFile(path.resolve(output), `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify(bundle, null, 2));
    return;
  }
  throw new Error("unknown command; use select-snapshot, restore-drill, rollback-drill, or validate-bundle");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli().catch((error) => {
    console.error(`operational-reliability: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
