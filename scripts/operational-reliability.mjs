#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const OPERATIONAL_RELIABILITY_VERSION = 1;
export const EVIDENCE_TIER = "workflow-executed-unreviewed";
const HASH_RE = /^[0-9a-f]{64}$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;
const RESTORE_EXCLUDED_ROOTS = new Set([".git", "node_modules", "records", "test-results", "playwright-report"]);
const PUBLICATION_REQUIRED_PATHS = ["index.html", "data/quality.json"];

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
export function stableJson(value) { return JSON.stringify(stable(value)); }
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export async function sha256File(file) { return sha256(await readFile(file)); }

function requireString(value, label) {
  if (!String(value || "").trim()) throw new Error(`${label} is required`);
  return String(value).trim();
}
function requireCommit(value, label) {
  const text = requireString(value, label);
  if (!COMMIT_RE.test(text)) throw new Error(`${label} must be a full 40-character commit SHA`);
  return text;
}
function requireHash(value, label) {
  const text = requireString(value, label);
  if (!HASH_RE.test(text)) throw new Error(`${label} must be a SHA-256`);
  return text;
}
function requireDate(value, label) {
  if (!Number.isFinite(Date.parse(value || ""))) throw new Error(`${label} must be an ISO date/time`);
  return String(value);
}
async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { throw new Error(`cannot read JSON ${file}: ${error.message}`); }
}
async function exists(file) {
  try { await access(file); return true; }
  catch { return false; }
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
function git(checkoutRoot, args, options = {}) {
  return run("git", args, { cwd: checkoutRoot, label: options.label || `git ${args[0]}`, allowFail: options.allowFail });
}
function excludedRestorePath(relativePath) {
  const root = String(relativePath).replaceAll("\\", "/").split("/")[0];
  return RESTORE_EXCLUDED_ROOTS.has(root);
}

export function normalizeArchiveEntry(rawEntry) {
  const original = String(rawEntry || "").replaceAll("\\", "/");
  if (!original || original.startsWith("/") || /^[A-Za-z]:\//.test(original)) throw new Error(`unsafe archive entry ${JSON.stringify(rawEntry)}`);
  const stripped = original.replace(/^(?:\.\/)+/, "");
  if (!stripped || stripped === ".") return null;
  const normalized = path.posix.normalize(stripped);
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) throw new Error(`unsafe archive entry ${JSON.stringify(rawEntry)}`);
  return normalized.replace(/\/+$/, "");
}

export function selectRepositorySnapshot(registry, requestedId = null) {
  if (!registry || !Array.isArray(registry.snapshots)) throw new Error("preservation registry needs snapshots[]");
  const candidates = registry.snapshots.filter((snapshot) =>
    ["pending", "verified"].includes(snapshot.status)
    && Array.isArray(snapshot.public_release?.assets)
    && snapshot.public_release.assets.some((asset) => asset.kind === "repository-snapshot"));
  const snapshot = requestedId
    ? candidates.find((row) => row.id === requestedId)
    : candidates.at(-1);
  if (!snapshot) throw new Error(requestedId ? `no usable repository snapshot ${requestedId}` : "no usable repository snapshot exists");
  requireCommit(snapshot.repository_commit, `snapshot ${snapshot.id}.repository_commit`);
  const releaseTag = requireString(snapshot.public_release?.tag, `snapshot ${snapshot.id}.public_release.tag`);
  const asset = snapshot.public_release.assets.find((row) => row.kind === "repository-snapshot");
  requireString(asset.name, `snapshot ${snapshot.id} repository asset name`);
  requireHash(asset.sha256, `snapshot ${snapshot.id} repository asset sha256`);
  if (!Number.isInteger(asset.bytes) || asset.bytes <= 0) throw new Error(`snapshot ${snapshot.id} repository asset bytes must be positive`);
  return {
    id: requireString(snapshot.id, "snapshot id"),
    status: snapshot.status,
    repository_commit: snapshot.repository_commit,
    release_tag: releaseTag,
    release_url: requireString(snapshot.public_release?.url, `snapshot ${snapshot.id}.public_release.url`),
    asset: {
      kind: "repository-snapshot",
      name: asset.name,
      sha256: asset.sha256,
      bytes: asset.bytes,
      url: requireString(asset.url, `snapshot ${snapshot.id} repository asset url`),
    },
  };
}

export async function verifyRepositoryArchive(archivePath, snapshot) {
  const archiveStat = await stat(archivePath);
  const digest = await sha256File(archivePath);
  if (archiveStat.size !== snapshot.asset.bytes) throw new Error(`repository archive bytes ${archiveStat.size} != registry ${snapshot.asset.bytes}`);
  if (digest !== snapshot.asset.sha256) throw new Error(`repository archive SHA-256 ${digest} != registry ${snapshot.asset.sha256}`);
  const listing = run("tar", ["-tzf", archivePath], { label: "list repository snapshot" });
  const entries = listing.stdout.split(/\r?\n/).filter(Boolean).map(normalizeArchiveEntry).filter(Boolean);
  if (!entries.length) throw new Error("repository archive is empty");
  const verbose = run("tar", ["-tvzf", archivePath], { label: "inspect repository snapshot entries" });
  for (const line of verbose.stdout.split(/\r?\n/).filter(Boolean)) {
    const type = line[0];
    if (type === "l" || type === "h") throw new Error("repository archive contains a link entry; fail closed before extraction");
  }
  for (const entry of entries) {
    if (entry === ".git" || entry.startsWith(".git/")) throw new Error("repository archive unexpectedly contains .git");
    if (entry === "node_modules" || entry.startsWith("node_modules/")) throw new Error("repository archive unexpectedly contains node_modules");
  }
  return { sha256: digest, bytes: archiveStat.size, entries: entries.length };
}

async function collectTreeFiles(root, current = "", excludedRoots = RESTORE_EXCLUDED_ROOTS) {
  const absolute = path.join(root, current);
  const rows = [];
  for (const entry of await readdir(absolute, { withFileTypes: true })) {
    const relative = current ? `${current}/${entry.name}` : entry.name;
    const first = relative.split("/")[0];
    if (excludedRoots.has(first)) continue;
    if (entry.isDirectory()) rows.push(...await collectTreeFiles(root, relative, excludedRoots));
    else if (entry.isFile() || entry.isSymbolicLink()) rows.push(relative);
    else throw new Error(`unsupported restored filesystem entry ${relative}`);
  }
  return rows.sort();
}
async function fileManifestEntry(root, relativePath) {
  const absolute = path.join(root, relativePath);
  const info = await lstat(absolute);
  if (info.isSymbolicLink()) {
    const target = await readlink(absolute);
    return { path: relativePath, type: "symlink", target, sha256: sha256(target), bytes: Buffer.byteLength(target), executable: false };
  }
  if (!info.isFile()) throw new Error(`${relativePath} is not a file or symlink`);
  const bytes = await readFile(absolute);
  return { path: relativePath, type: "file", sha256: sha256(bytes), bytes: bytes.length, executable: Boolean(info.mode & 0o111) };
}
async function manifestForPaths(root, paths) {
  return Promise.all([...paths].sort().map((relativePath) => fileManifestEntry(root, relativePath)));
}
function parseTreeRows(text) {
  return String(text || "").split(/\r?\n/).filter(Boolean).map((line) => {
    const tab = line.indexOf("\t");
    if (tab < 0) throw new Error(`invalid git ls-tree row: ${line}`);
    const [mode, type, object] = line.slice(0, tab).split(/\s+/);
    const relativePath = line.slice(tab + 1);
    return { mode, type, object, path: relativePath };
  });
}
async function exactTrackedTree(checkoutRoot, restoredRoot, targetHead) {
  const tree = git(checkoutRoot, ["ls-tree", "-r", targetHead], { label: "list target tree" });
  const rows = parseTreeRows(tree.stdout).filter((row) => row.type === "blob" && !excludedRestorePath(row.path));
  const expectedPaths = rows.map((row) => row.path).sort();
  const currentPaths = await collectTreeFiles(checkoutRoot);
  const restoredPaths = await collectTreeFiles(restoredRoot);
  const expectedJson = JSON.stringify(expectedPaths);
  if (JSON.stringify(currentPaths) !== expectedJson) throw new Error("checkout filesystem does not exactly match the target tracked path set");
  if (JSON.stringify(restoredPaths) !== expectedJson) {
    const expectedSet = new Set(expectedPaths);
    const restoredSet = new Set(restoredPaths);
    const missing = expectedPaths.filter((row) => !restoredSet.has(row)).slice(0, 20);
    const extra = restoredPaths.filter((row) => !expectedSet.has(row)).slice(0, 20);
    throw new Error(`restored path set drifted; missing=${missing.join(",") || "<none>"}; extra=${extra.join(",") || "<none>"}`);
  }
  const [currentManifest, restoredManifest] = await Promise.all([
    manifestForPaths(checkoutRoot, expectedPaths),
    manifestForPaths(restoredRoot, expectedPaths),
  ]);
  const currentStable = stableJson(currentManifest);
  const restoredStable = stableJson(restoredManifest);
  if (currentStable !== restoredStable) {
    const restoredByPath = new Map(restoredManifest.map((row) => [row.path, row]));
    const mismatch = currentManifest.find((row) => stableJson(row) !== stableJson(restoredByPath.get(row.path)));
    throw new Error(`restored bytes or mode drifted at ${mismatch?.path || "<unknown>"}`);
  }
  return { files: expectedPaths.length, manifest_sha256: sha256(currentStable) };
}

export function validateRestoreReceipt(receipt) {
  if (!receipt || receipt.version !== OPERATIONAL_RELIABILITY_VERSION || receipt.kind !== "repository-restore") throw new Error("invalid repository-restore receipt");
  if (receipt.status !== "passed") throw new Error("repository-restore receipt is not passed");
  if (receipt.evidence_tier !== EVIDENCE_TIER) throw new Error("repository-restore evidence tier is invalid");
  requireDate(receipt.generated_at, "repository-restore.generated_at");
  requireCommit(receipt.source_snapshot?.repository_commit, "repository-restore source commit");
  requireCommit(receipt.forward_recovery?.target_head, "repository-restore target head");
  requireHash(receipt.source_snapshot?.asset_sha256, "repository-restore asset sha256");
  requireHash(receipt.forward_recovery?.patch_sha256, "repository-restore patch sha256");
  requireHash(receipt.forward_recovery?.target_manifest_sha256, "repository-restore target manifest sha256");
  if (receipt.forward_recovery?.exact_tracked_tree_match !== true) throw new Error("repository-restore exact tree proof is missing");
  if (receipt.canonical_gate?.exit_code !== 0) throw new Error("repository-restore canonical gate did not pass");
  if (receipt.boundary?.waterline_state_mutated !== false || receipt.boundary?.roadmap_state_mutated !== false || receipt.boundary?.live_publication_mutated !== false) {
    throw new Error("repository-restore mutation boundary is invalid");
  }
  return true;
}

export async function runRepositoryRestoreDrill({
  checkoutRoot,
  registryPath,
  archivePath,
  snapshotId = null,
  targetHead,
  workRoot,
  outputPath,
  install = true,
  gate = true,
}) {
  checkoutRoot = path.resolve(checkoutRoot);
  registryPath = path.resolve(registryPath);
  archivePath = path.resolve(archivePath);
  workRoot = path.resolve(workRoot);
  outputPath = path.resolve(outputPath);
  const registry = await readJson(registryPath);
  const snapshot = selectRepositorySnapshot(registry, snapshotId);
  targetHead = requireCommit(targetHead || git(checkoutRoot, ["rev-parse", "HEAD"]).stdout.trim(), "target head");
  const ancestry = git(checkoutRoot, ["merge-base", "--is-ancestor", snapshot.repository_commit, targetHead], { allowFail: true, label: "prove snapshot ancestry" });
  if (ancestry.exit_code !== 0) throw new Error(`snapshot commit ${snapshot.repository_commit} is not an ancestor of ${targetHead}`);
  const archive = await verifyRepositoryArchive(archivePath, snapshot);
  await rm(workRoot, { recursive: true, force: true });
  const restoredRoot = path.join(workRoot, "restored");
  const diagnosticsRoot = path.join(workRoot, "diagnostics");
  await mkdir(restoredRoot, { recursive: true });
  await mkdir(diagnosticsRoot, { recursive: true });
  run("tar", ["-xzf", archivePath, "-C", restoredRoot, "--no-same-owner", "--no-same-permissions"], { label: "extract repository snapshot" });

  const numstat = git(checkoutRoot, ["diff", "--numstat", "--no-renames", `${snapshot.repository_commit}..${targetHead}`, "--", "."], { label: "classify forward recovery delta" });
  const binaryPaths = numstat.stdout.split(/\r?\n/).filter(Boolean).filter((line) => line.startsWith("-\t-\t")).map((line) => line.split("\t").slice(2).join("\t"));
  if (binaryPaths.length) throw new Error(`forward recovery contains binary paths unsupported by the text patch transport: ${binaryPaths.join(", ")}`);
  const patchResult = git(checkoutRoot, ["diff", "--binary", "--full-index", "--no-renames", `${snapshot.repository_commit}..${targetHead}`, "--", "."], { label: "build forward recovery patch" });
  const patchPath = path.join(diagnosticsRoot, "forward-recovery.patch");
  await writeFile(patchPath, patchResult.stdout, "utf8");
  const patchSha = sha256(patchResult.stdout);
  const changedPathsResult = git(checkoutRoot, ["diff", "--name-only", "--no-renames", `${snapshot.repository_commit}..${targetHead}`, "--", "."], { label: "list recovery paths" });
  const changedPaths = changedPathsResult.stdout.split(/\r?\n/).filter(Boolean).sort();
  if (patchResult.stdout.trim()) run("git", ["apply", "--binary", "--whitespace=nowarn", patchPath], { cwd: restoredRoot, label: "apply forward recovery patch" });

  const targetTree = await exactTrackedTree(checkoutRoot, restoredRoot, targetHead);
  let installResult = null;
  if (install) {
    const invocation = npmInvocation(["ci"]);
    installResult = run(invocation.command, invocation.args, { cwd: restoredRoot, label: "install restored dependencies" });
    await writeFile(path.join(diagnosticsRoot, "npm-ci.stdout.log"), installResult.stdout, "utf8");
    await writeFile(path.join(diagnosticsRoot, "npm-ci.stderr.log"), installResult.stderr, "utf8");
  }
  let gateResult = { command: "npm run gate", exit_code: 0, duration_ms: 0, stdout: "", stderr: "", stdout_sha256: sha256(""), stderr_sha256: sha256("") };
  if (gate) {
    const invocation = npmInvocation(["run", "gate"]);
    gateResult = run(invocation.command, invocation.args, { cwd: restoredRoot, label: "canonical gate on restored repository" });
    await writeFile(path.join(diagnosticsRoot, "gate.stdout.log"), gateResult.stdout, "utf8");
    await writeFile(path.join(diagnosticsRoot, "gate.stderr.log"), gateResult.stderr, "utf8");
  }
  const receipt = {
    version: OPERATIONAL_RELIABILITY_VERSION,
    kind: "repository-restore",
    status: "passed",
    evidence_tier: EVIDENCE_TIER,
    generated_at: new Date().toISOString(),
    workflow: {
      repository: process.env.GITHUB_REPOSITORY || null,
      run_id: process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null,
      run_attempt: process.env.GITHUB_RUN_ATTEMPT ? Number(process.env.GITHUB_RUN_ATTEMPT) : null,
      event_name: process.env.GITHUB_EVENT_NAME || null,
    },
    source_snapshot: {
      id: snapshot.id,
      status: snapshot.status,
      repository_commit: snapshot.repository_commit,
      release_tag: snapshot.release_tag,
      release_url: snapshot.release_url,
      asset_name: snapshot.asset.name,
      asset_sha256: archive.sha256,
      asset_bytes: archive.bytes,
      archive_entries: archive.entries,
    },
    forward_recovery: {
      target_head: targetHead,
      patch_sha256: patchSha,
      patch_bytes: Buffer.byteLength(patchResult.stdout),
      changed_paths: changedPaths,
      target_files: targetTree.files,
      target_manifest_sha256: targetTree.manifest_sha256,
      exact_tracked_tree_match: true,
    },
    dependency_install: installResult ? {
      command: installResult.command,
      exit_code: installResult.exit_code,
      duration_ms: installResult.duration_ms,
      stdout_sha256: installResult.stdout_sha256,
      stderr_sha256: installResult.stderr_sha256,
    } : null,
    canonical_gate: {
      command: gateResult.command,
      exit_code: gateResult.exit_code,
      duration_ms: gateResult.duration_ms,
      stdout_sha256: gateResult.stdout_sha256,
      stderr_sha256: gateResult.stderr_sha256,
    },
    boundary: {
      preservation_asset_rewritten: false,
      source_snapshot_rewritten: false,
      waterline_state_mutated: false,
      roadmap_state_mutated: false,
      live_publication_mutated: false,
      review_required_before_recording: true,
    },
  };
  validateRestoreReceipt(receipt);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return { receipt, restoredRoot, diagnosticsRoot };
}

async function copyPaths(sourceRoot, destinationRoot, relativePaths) {
  for (const relativePath of relativePaths) {
    const source = path.join(sourceRoot, relativePath);
    const destination = path.join(destinationRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    const info = await lstat(source);
    if (!info.isFile()) throw new Error(`publication drill path ${relativePath} must be a regular file`);
    await copyFile(source, destination);
  }
}
async function listImageFiles(root) {
  const imagesRoot = path.join(root, "images");
  if (!await exists(imagesRoot)) return [];
  const rows = [];
  async function visit(current) {
    for (const entry of await readdir(path.join(imagesRoot, current), { withFileTypes: true })) {
      const relative = current ? `${current}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(relative);
      else if (entry.isFile()) rows.push(`images/${relative}`);
    }
  }
  await visit("");
  return rows.sort();
}
export async function selectPublicationPaths(root, limitRecords = 3, limitImages = 3) {
  const selected = [...PUBLICATION_REQUIRED_PATHS];
  for (const required of PUBLICATION_REQUIRED_PATHS) if (!await exists(path.join(root, required))) throw new Error(`required publication path is missing: ${required}`);
  const specimens = await readJson(path.join(root, "data/specimens.json"));
  const ids = (Array.isArray(specimens) ? specimens : []).map((row) => row?.id).filter(Boolean).sort();
  for (const id of ids) {
    const relative = `records/${id}/index.html`;
    if (await exists(path.join(root, relative))) selected.push(relative);
    if (selected.filter((row) => row.startsWith("records/")).length >= limitRecords) break;
  }
  selected.push(...(await listImageFiles(root)).slice(0, limitImages));
  if (!selected.some((row) => row.startsWith("records/"))) throw new Error("publication drill found no permanent record route");
  if (!selected.some((row) => row.startsWith("images/"))) throw new Error("publication drill found no image asset");
  return [...new Set(selected)].sort();
}
function routeForPath(relativePath) {
  if (relativePath === "index.html") return "/";
  if (relativePath.endsWith("/index.html")) return `/${relativePath.slice(0, -"index.html".length)}`;
  return `/${relativePath}`;
}
async function startStaticServer(root) {
  const rootResolved = path.resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const relative = pathname.replace(/^\/+/, "");
      const absolute = path.resolve(rootResolved, relative);
      if (absolute !== rootResolved && !absolute.startsWith(`${rootResolved}${path.sep}`)) throw new Error("path traversal");
      const info = await stat(absolute);
      if (!info.isFile()) throw new Error("not a file");
      response.statusCode = 200;
      createReadStream(absolute).pipe(response);
    } catch {
      response.statusCode = 404;
      response.end("not found");
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise())),
  };
}
async function servedChecks(root, relativePaths) {
  const server = await startStaticServer(root);
  try {
    const checks = [];
    for (const relativePath of relativePaths) {
      const expected = await readFile(path.join(root, relativePath));
      const route = routeForPath(relativePath);
      const response = await fetch(`${server.origin}${route}?rollback-drill=1`, { cache: "no-store" });
      const actual = Buffer.from(await response.arrayBuffer());
      if (!response.ok) throw new Error(`served route ${route} returned ${response.status}`);
      if (!actual.equals(expected)) throw new Error(`served route ${route} does not match restored bytes`);
      checks.push({ route, path: relativePath, sha256: sha256(actual), bytes: actual.length, exact_byte_match: true });
    }
    return checks;
  } finally {
    await server.close();
  }
}

export function validateRollbackReceipt(receipt) {
  if (!receipt || receipt.version !== OPERATIONAL_RELIABILITY_VERSION || receipt.kind !== "publication-rollback") throw new Error("invalid publication-rollback receipt");
  if (receipt.status !== "passed") throw new Error("publication-rollback receipt is not passed");
  if (receipt.evidence_tier !== EVIDENCE_TIER) throw new Error("publication-rollback evidence tier is invalid");
  requireDate(receipt.generated_at, "publication-rollback.generated_at");
  requireCommit(receipt.known_good?.target_head, "publication-rollback target head");
  requireHash(receipt.known_good?.manifest_sha256, "publication-rollback manifest sha256");
  if (receipt.fault_injection?.detected_before_rollback !== true) throw new Error("publication-rollback did not detect the injected fault");
  if (receipt.rollback?.atomic_directory_swap !== true || receipt.rollback?.exact_manifest_restored !== true) throw new Error("publication-rollback exact atomic restore proof is missing");
  if (!Array.isArray(receipt.served_checks) || !receipt.served_checks.length || receipt.served_checks.some((row) => row.exact_byte_match !== true)) {
    throw new Error("publication-rollback served checks are incomplete");
  }
  if (receipt.boundary?.waterline_state_mutated !== false || receipt.boundary?.roadmap_state_mutated !== false || receipt.boundary?.live_publication_mutated !== false) {
    throw new Error("publication-rollback mutation boundary is invalid");
  }
  return true;
}

export async function runPublicationRollbackDrill({
  restoredRoot,
  restoreReceiptPath,
  workRoot,
  outputPath,
  paths = null,
}) {
  restoredRoot = path.resolve(restoredRoot);
  restoreReceiptPath = path.resolve(restoreReceiptPath);
  workRoot = path.resolve(workRoot);
  outputPath = path.resolve(outputPath);
  const restoreReceipt = await readJson(restoreReceiptPath);
  validateRestoreReceipt(restoreReceipt);
  const selectedPaths = paths ? [...paths].sort() : await selectPublicationPaths(restoredRoot);
  const knownGoodRoot = path.join(workRoot, "known-good");
  const slotRoot = path.join(workRoot, "publication-slot");
  const stagingRoot = path.join(workRoot, "rollback-staging");
  const quarantineRoot = path.join(workRoot, "bad-publication-quarantine");
  await rm(workRoot, { recursive: true, force: true });
  await mkdir(knownGoodRoot, { recursive: true });
  await copyPaths(restoredRoot, knownGoodRoot, selectedPaths);
  const knownGoodManifest = await manifestForPaths(knownGoodRoot, selectedPaths);
  const knownGoodDigest = sha256(stableJson(knownGoodManifest));

  await mkdir(slotRoot, { recursive: true });
  await copyPaths(knownGoodRoot, slotRoot, selectedPaths);
  const faultPath = selectedPaths.includes("index.html") ? "index.html" : selectedPaths[0];
  const badBytes = Buffer.from(`<!doctype html><meta charset="utf-8"><title>bad publication drill</title><p>${sha256(knownGoodDigest).slice(0, 24)}</p>\n`);
  const faultTemp = path.join(slotRoot, `${faultPath}.fault.tmp`);
  await mkdir(path.dirname(faultTemp), { recursive: true });
  await writeFile(faultTemp, badBytes);
  await rename(faultTemp, path.join(slotRoot, faultPath));
  const badManifest = await manifestForPaths(slotRoot, selectedPaths);
  const badDigest = sha256(stableJson(badManifest));
  if (badDigest === knownGoodDigest) throw new Error("fault injection did not change the publication manifest");

  await mkdir(stagingRoot, { recursive: true });
  await copyPaths(knownGoodRoot, stagingRoot, selectedPaths);
  await rename(slotRoot, quarantineRoot);
  await rename(stagingRoot, slotRoot);
  const restoredManifest = await manifestForPaths(slotRoot, selectedPaths);
  const restoredDigest = sha256(stableJson(restoredManifest));
  if (restoredDigest !== knownGoodDigest) throw new Error("rollback did not restore the exact publication manifest");
  const served = await servedChecks(slotRoot, selectedPaths);
  const receipt = {
    version: OPERATIONAL_RELIABILITY_VERSION,
    kind: "publication-rollback",
    status: "passed",
    evidence_tier: EVIDENCE_TIER,
    generated_at: new Date().toISOString(),
    workflow: restoreReceipt.workflow,
    known_good: {
      snapshot_id: restoreReceipt.source_snapshot.id,
      snapshot_commit: restoreReceipt.source_snapshot.repository_commit,
      target_head: restoreReceipt.forward_recovery.target_head,
      manifest_sha256: knownGoodDigest,
      paths: selectedPaths,
      publication_surface_scope: "representative-critical-surface",
    },
    fault_injection: {
      path: faultPath,
      bad_sha256: sha256(badBytes),
      bad_manifest_sha256: badDigest,
      detected_before_rollback: true,
    },
    rollback: {
      strategy: "same-filesystem-directory-rename",
      atomic_directory_swap: true,
      quarantine_created: true,
      restored_manifest_sha256: restoredDigest,
      exact_manifest_restored: true,
    },
    served_checks: served,
    boundary: {
      isolated_publication_slot: true,
      live_publication_mutated: false,
      waterline_state_mutated: false,
      roadmap_state_mutated: false,
      review_required_before_recording: true,
    },
  };
  validateRollbackReceipt(receipt);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

export async function validateEvidenceBundle(restoreReceiptPath, rollbackReceiptPath) {
  const [restoreReceipt, rollbackReceipt] = await Promise.all([readJson(restoreReceiptPath), readJson(rollbackReceiptPath)]);
  validateRestoreReceipt(restoreReceipt);
  validateRollbackReceipt(rollbackReceipt);
  if (restoreReceipt.forward_recovery.target_head !== rollbackReceipt.known_good.target_head) throw new Error("drill receipts target different heads");
  if (restoreReceipt.source_snapshot.id !== rollbackReceipt.known_good.snapshot_id) throw new Error("drill receipts use different snapshots");
  return {
    version: OPERATIONAL_RELIABILITY_VERSION,
    status: "passed",
    evidence_tier: EVIDENCE_TIER,
    target_head: restoreReceipt.forward_recovery.target_head,
    snapshot_id: restoreReceipt.source_snapshot.id,
    receipts: {
      repository_restore_sha256: await sha256File(restoreReceiptPath),
      publication_rollback_sha256: await sha256File(rollbackReceiptPath),
    },
    boundary: {
      reviewed_waterline_receipts_created: false,
      roadmap_milestone_completed: false,
    },
  };
}

function parseCli(argv) {
  const args = [...argv];
  const command = args.shift() || "help";
  const values = new Map();
  const flags = new Set();
  while (args.length) {
    const token = args.shift();
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const key = token.slice(2);
    if (!args.length || args[0].startsWith("--")) flags.add(key);
    else values.set(key, args.shift());
  }
  const value = (key, fallback = null) => values.has(key) ? values.get(key) : fallback;
  return { command, value, flag: (key) => flags.has(key) };
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
    await runRepositoryRestoreDrill({
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
      await writeFile(path.resolve(output), `${JSON.stringify(bundle, null, 2)}\n`);
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
