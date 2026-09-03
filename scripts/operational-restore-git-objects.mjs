#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const COMMIT_RE = /^[0-9a-f]{40}$/;
const OBJECT_RE = /^[0-9a-f]{40}$/;
const MANIFEST_KIND = "operational-restore-git-object-set";
const FULL_TREE_PATH = "**";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function stableJson(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function requireString(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

function requireCommit(value, label) {
  const text = requireString(value, label);
  if (!COMMIT_RE.test(text)) throw new Error(`${label} must be a full 40-character commit SHA`);
  return text;
}

function assertSafePath(value, label) {
  const file = requireString(value, label);
  if (path.isAbsolute(file) || file.includes("\\")) throw new Error(`${label} must be a normalized repository-relative POSIX path`);
  if (path.posix.normalize(file) !== file || file === ".." || file.startsWith("../")) {
    throw new Error(`${label} must not escape the repository`);
  }
  return file;
}

function runGit(args, { cwd = null, input = null, encoding = "utf8", allowFail = false, label = null } = {}) {
  const result = spawnSync("git", args, {
    cwd: cwd || undefined,
    input,
    encoding,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${label || `git ${args[0]}`} could not start: ${result.error.message}`);
  const status = Number.isInteger(result.status) ? result.status : 1;
  if (status !== 0 && !allowFail) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : String(result.stderr || "");
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString("utf8") : String(result.stdout || "");
    throw new Error(`${label || `git ${args[0]}`} failed with code ${status}: ${(stderr || stdout || "unknown error").trim()}`);
  }
  return result;
}

function gitText(cwd, args, options = {}) {
  return String(runGit(args, { cwd, ...options, encoding: "utf8" }).stdout || "").trim();
}

function gitBytes(cwd, args, options = {}) {
  return Buffer.from(runGit(args, { cwd, ...options, encoding: null }).stdout || Buffer.alloc(0));
}

function outputGitText(gitDir, args, options = {}) {
  return String(runGit([`--git-dir=${gitDir}`, ...args], { ...options, encoding: "utf8" }).stdout || "").trim();
}

function outputGitBytes(gitDir, args, options = {}) {
  return Buffer.from(runGit([`--git-dir=${gitDir}`, ...args], { ...options, encoding: null }).stdout || Buffer.alloc(0));
}

function assertCompleteSourceObjectDatabase(sourceRoot) {
  const partial = runGit(["config", "--get", "extensions.partialClone"], { cwd: sourceRoot, allowFail: true });
  assert.notEqual(partial.status, 0, "source checkout is a partial clone and may lazy-fetch undeclared objects");
  const promisors = runGit(["config", "--get-regexp", "^remote\\..*\\.promisor$"], { cwd: sourceRoot, allowFail: true });
  assert.notEqual(promisors.status, 0, "source checkout has a promisor remote and may lazy-fetch undeclared objects");
}

export function validateGitObjectManifest(document) {
  assert.equal(document?.schema_version, 1, "Git-object manifest schema drifted");
  assert.equal(document?.kind, MANIFEST_KIND, "Git-object manifest kind drifted");
  assert.match(requireString(document?.repository, "Git-object manifest repository"), /^[^/]+\/[^/]+$/, "Git-object manifest repository must be owner/name");
  assert.ok(Array.isArray(document?.entries) && document.entries.length > 0, "Git-object manifest entries must be non-empty");

  const commits = new Set();
  let pathCount = 0;
  for (const [entryIndex, entry] of document.entries.entries()) {
    assert.deepEqual(Object.keys(entry).sort(), ["commit", "paths"], `Git-object manifest entry ${entryIndex} shape drifted`);
    const commit = requireCommit(entry.commit, `Git-object manifest entry ${entryIndex} commit`);
    assert.equal(commits.has(commit), false, `duplicate Git-object manifest commit ${commit}`);
    commits.add(commit);
    assert.ok(Array.isArray(entry.paths) && entry.paths.length > 0, `Git-object manifest entry ${commit} paths must be non-empty`);
    const paths = entry.paths.map((file, index) => assertSafePath(file, `Git-object manifest ${commit} path ${index}`));
    assert.deepEqual(paths, [...paths].sort(), `Git-object manifest ${commit} paths must be sorted`);
    assert.equal(new Set(paths).size, paths.length, `Git-object manifest ${commit} paths must be unique`);
    if (paths.includes(FULL_TREE_PATH)) assert.deepEqual(paths, [FULL_TREE_PATH], `Git-object manifest ${commit} full-tree sentinel must be the only path`);
    pathCount += paths.length;
  }
  return {
    commit_count: commits.size,
    path_count: pathCount,
    full_tree_commit_count: document.entries.filter((entry) => entry.paths.includes(FULL_TREE_PATH)).length,
  };
}

async function readManifest(manifestPath) {
  const bytes = await readFile(manifestPath);
  let document;
  try { document = JSON.parse(bytes.toString("utf8")); }
  catch (error) { throw new Error(`cannot parse Git-object manifest ${manifestPath}: ${error.message}`); }
  const denominator = validateGitObjectManifest(document);
  return { bytes, document, denominator };
}

function copyObject(sourceRoot, outputGitDir, object, copied) {
  assert.match(object, OBJECT_RE, `invalid Git object ${object}`);
  if (copied.has(object)) return;
  const type = gitText(sourceRoot, ["cat-file", "-t", object], { label: `read type for Git object ${object}` });
  assert.match(type, /^(blob|tree|commit|tag)$/, `unsupported Git object type ${type} for ${object}`);
  const bytes = gitBytes(sourceRoot, ["cat-file", type, object], { label: `read Git object ${object}` });
  const written = outputGitText(outputGitDir, ["hash-object", "-t", type, "-w", "--stdin"], {
    input: bytes,
    label: `write bounded Git object ${object}`,
  });
  assert.equal(written, object, `bounded Git object identity drifted for ${object}`);
  copied.add(object);
}

function treeEntry(sourceRoot, tree, component, label) {
  const row = gitText(sourceRoot, ["ls-tree", tree, "--", component], { label });
  const lines = row.split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1, `${label} resolved ${lines.length} entries`);
  const match = lines[0].match(/^([0-7]{6})\s+(blob|tree|commit)\s+([0-9a-f]{40})\t(.+)$/);
  assert.ok(match, `${label} returned a malformed tree entry`);
  assert.equal(match[4], component, `${label} resolved a different path component`);
  return { mode: match[1], type: match[2], object: match[3] };
}


function copyTreeClosure(sourceRoot, outputGitDir, rootTree, copied) {
  const traversed = new Set();
  let trees = 0;
  let blobs = 0;
  let gitlinks = 0;
  function visit(tree) {
    if (traversed.has(tree)) return;
    traversed.add(tree);
    copyObject(sourceRoot, outputGitDir, tree, copied);
    trees += 1;
    const rows = gitBytes(sourceRoot, ["ls-tree", "-z", tree], { label: `enumerate full Git tree ${tree}` })
      .toString("utf8")
      .split("\0")
      .filter(Boolean);
    for (const row of rows) {
      const match = row.match(/^([0-7]{6})\s+(blob|tree|commit)\s+([0-9a-f]{40})\t([\s\S]+)$/);
      assert.ok(match, `full Git tree ${tree} returned a malformed entry`);
      const [, , type, object] = match;
      if (type === "tree") visit(object);
      else if (type === "blob") {
        copyObject(sourceRoot, outputGitDir, object, copied);
        blobs += 1;
      } else gitlinks += 1;
    }
  }
  visit(rootTree);
  return { root_tree: rootTree, trees, blobs, gitlinks, files: blobs + gitlinks };
}

function copyCommitPath(sourceRoot, outputGitDir, commit, file, copied) {
  let tree = gitText(sourceRoot, ["rev-parse", `${commit}^{tree}`], { label: `resolve root tree for ${commit}` });
  copyObject(sourceRoot, outputGitDir, tree, copied);
  const components = file.split("/");
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const entry = treeEntry(sourceRoot, tree, component, `resolve ${commit}:${components.slice(0, index + 1).join("/")}`);
    const terminal = index === components.length - 1;
    if (terminal) assert.equal(entry.type, "blob", `${commit}:${file} is not a blob`);
    else assert.equal(entry.type, "tree", `${commit}:${components.slice(0, index + 1).join("/")} is not a tree`);
    copyObject(sourceRoot, outputGitDir, entry.object, copied);
    tree = entry.object;
  }
}

export function validateGitObjectSetReceipt(receipt, expected = {}) {
  assert.equal(receipt?.schema_version, 1, "Git-object-set receipt schema drifted");
  assert.equal(receipt?.kind, MANIFEST_KIND, "Git-object-set receipt kind drifted");
  assert.equal(receipt?.status, "passed", "Git-object-set receipt did not pass");
  assert.match(receipt?.manifest_sha256, /^[0-9a-f]{64}$/, "Git-object-set manifest SHA-256 is invalid");
  assert.match(receipt?.source_head, COMMIT_RE, "Git-object-set source head is invalid");
  assert.ok(Number.isInteger(receipt?.commit_count) && receipt.commit_count > 0, "Git-object-set commit count is invalid");
  assert.ok(Number.isInteger(receipt?.path_count) && receipt.path_count > 0, "Git-object-set path count is invalid");
  assert.ok(Number.isInteger(receipt?.full_tree_commit_count) && receipt.full_tree_commit_count >= 0, "Git-object-set full-tree commit count is invalid");
  assert.ok(Number.isInteger(receipt?.object_count) && receipt.object_count >= receipt.commit_count, "Git-object-set object count is invalid");
  assert.equal(receipt?.boundary?.exact_declared_commits_only, true, "Git-object-set commit boundary drifted");
  assert.equal(receipt?.boundary?.exact_declared_paths_only, true, "Git-object-set path boundary drifted");
  assert.equal(receipt?.boundary?.parent_history_copied, false, "Git-object-set copied parent history");
  assert.equal(receipt?.boundary?.full_history_restored, false, "Git-object-set restored full history");
  assert.equal(receipt?.boundary?.network_fetch_performed, false, "Git-object-set performed a network fetch");
  assert.equal(receipt?.boundary?.source_partial_clone, false, "Git-object-set used a partial source checkout");
  assert.equal(receipt?.boundary?.source_checkout_mutated, false, "Git-object-set mutated the source checkout");
  assert.match(receipt?.receipt_sha256, /^[0-9a-f]{64}$/, "Git-object-set receipt SHA-256 is invalid");
  const receiptBody = structuredClone(receipt);
  delete receiptBody.receipt_sha256;
  assert.equal(receipt.receipt_sha256, sha256(stableJson(receiptBody)), "Git-object-set receipt self-hash drifted");
  if (expected.repository) assert.equal(receipt.repository, expected.repository, "Git-object-set repository drifted");
  if (expected.manifest_sha256) assert.equal(receipt.manifest_sha256, expected.manifest_sha256, "Git-object-set manifest digest drifted");
  return true;
}

export async function buildBoundedGitObjectSet({ sourceRoot, manifestPath, outputGitDir, receiptPath, expectedRepository = null }) {
  sourceRoot = path.resolve(sourceRoot);
  manifestPath = path.resolve(manifestPath);
  outputGitDir = path.resolve(outputGitDir);
  receiptPath = path.resolve(receiptPath);
  const sourceStatusBefore = gitText(sourceRoot, ["status", "--porcelain=v1", "--untracked-files=all"], { label: "read source checkout status before Git-object copy" });
  const sourceHead = requireCommit(gitText(sourceRoot, ["rev-parse", "HEAD"], { label: "read source checkout head" }), "source checkout head");
  assertCompleteSourceObjectDatabase(sourceRoot);
  const { bytes: manifestBytes, document, denominator } = await readManifest(manifestPath);
  if (expectedRepository) assert.equal(document.repository, expectedRepository, "Git-object manifest repository drifted");
  const manifestSha256 = sha256(manifestBytes);

  await rm(outputGitDir, { recursive: true, force: true });
  await mkdir(path.dirname(outputGitDir), { recursive: true });
  runGit(["init", "--bare", "--quiet", outputGitDir], { label: "initialize bounded Git-object store" });

  const copied = new Set();
  const requestedCommits = new Set(document.entries.map((entry) => entry.commit));
  const entries = [];
  for (const entry of document.entries) {
    const commit = entry.commit;
    gitText(sourceRoot, ["cat-file", "-e", `${commit}^{commit}`], { label: `resolve declared historical commit ${commit}` });
    copyObject(sourceRoot, outputGitDir, commit, copied);
    const fullTree = entry.paths.includes(FULL_TREE_PATH);
    let fullTreeSummary = null;
    if (fullTree) {
      const sourceTree = gitText(sourceRoot, ["rev-parse", `${commit}^{tree}`], { label: `resolve declared full tree for ${commit}` });
      fullTreeSummary = copyTreeClosure(sourceRoot, outputGitDir, sourceTree, copied);
      const copiedTree = outputGitText(outputGitDir, ["rev-parse", `${commit}^{tree}`], { label: `resolve copied full tree for ${commit}` });
      assert.equal(copiedTree, sourceTree, `bounded Git-object store tree drifted for ${commit}`);
    } else {
      for (const file of entry.paths) copyCommitPath(sourceRoot, outputGitDir, commit, file, copied);
    }

    const copiedPaths = [];
    if (fullTree) {
      copiedPaths.push({ path: FULL_TREE_PATH, object_type: "tree", object: fullTreeSummary.root_tree, ...fullTreeSummary });
    } else for (const file of entry.paths) {
      const sourceBlob = gitText(sourceRoot, ["rev-parse", `${commit}:${file}`], { label: `resolve source blob ${commit}:${file}` });
      const copiedBlob = outputGitText(outputGitDir, ["rev-parse", `${commit}:${file}`], { label: `resolve copied blob ${commit}:${file}` });
      assert.equal(copiedBlob, sourceBlob, `bounded Git-object store blob drifted for ${commit}:${file}`);
      const sourceBytes = gitBytes(sourceRoot, ["show", `${commit}:${file}`], { label: `read source bytes ${commit}:${file}` });
      const copiedBytes = outputGitBytes(outputGitDir, ["show", `${commit}:${file}`], { label: `read copied bytes ${commit}:${file}` });
      assert.equal(sha256(copiedBytes), sha256(sourceBytes), `bounded Git-object store bytes drifted for ${commit}:${file}`);
      copiedPaths.push({ path: file, blob: sourceBlob, sha256: sha256(sourceBytes), bytes: sourceBytes.length });
    }

    const parents = gitText(sourceRoot, ["show", "-s", "--format=%P", commit], { label: `read parents for ${commit}` })
      .split(/\s+/).filter(Boolean);
    for (const parent of parents) {
      if (requestedCommits.has(parent)) continue;
      const present = runGit([`--git-dir=${outputGitDir}`, "cat-file", "-e", `${parent}^{commit}`], { allowFail: true });
      assert.notEqual(present.status, 0, `bounded Git-object store unexpectedly copied parent ${parent}`);
    }
    entries.push({ commit, paths: copiedPaths });
  }

  const sourceStatusAfter = gitText(sourceRoot, ["status", "--porcelain=v1", "--untracked-files=all"], { label: "read source checkout status after Git-object copy" });
  assert.equal(sourceStatusAfter, sourceStatusBefore, "bounded Git-object copy mutated the source checkout");

  const receipt = {
    schema_version: 1,
    kind: MANIFEST_KIND,
    status: "passed",
    generated_at: new Date().toISOString(),
    repository: document.repository,
    source_head: sourceHead,
    manifest_path: path.relative(sourceRoot, manifestPath).replaceAll("\\", "/"),
    manifest_sha256: manifestSha256,
    commit_count: denominator.commit_count,
    path_count: denominator.path_count,
    full_tree_commit_count: denominator.full_tree_commit_count,
    object_count: copied.size,
    entries,
    boundary: {
      exact_declared_commits_only: true,
      exact_declared_paths_only: true,
      declared_full_tree_sentinel: FULL_TREE_PATH,
      parent_history_copied: false,
      full_history_restored: false,
      network_fetch_performed: false,
      source_partial_clone: false,
      source_checkout_mutated: false,
    },
    receipt_sha256: null,
  };
  const receiptBody = structuredClone(receipt);
  delete receiptBody.receipt_sha256;
  receipt.receipt_sha256 = sha256(stableJson(receiptBody));
  validateGitObjectSetReceipt(receipt, { repository: document.repository, manifest_sha256: manifestSha256 });
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, stableJson(receipt), "utf8");
  return receipt;
}

function option(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv.shift() || "build";
  if (command !== "build") throw new Error(`unknown command ${command}`);
  const receipt = await buildBoundedGitObjectSet({
    sourceRoot: option(argv, "--source-root", "."),
    manifestPath: requireString(option(argv, "--manifest"), "--manifest"),
    outputGitDir: requireString(option(argv, "--output"), "--output"),
    receiptPath: requireString(option(argv, "--receipt"), "--receipt"),
    expectedRepository: requireString(option(argv, "--repository"), "--repository"),
  });
  console.log(JSON.stringify(receipt, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`operational-restore-git-objects: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
