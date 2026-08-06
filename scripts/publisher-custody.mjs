#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let parseDocument = null;
try { ({ parseDocument } = require("yaml")); }
catch (error) {
  if (error?.code !== "MODULE_NOT_FOUND") throw error;
}

const DEFAULT_BASELINE = "data/review/ci-publisher-custody-baseline.json";
const WRITE = "write";

function problemText(problem) {
  return String(problem?.message || problem || "unknown YAML problem").replace(/\s+/g, " ").trim();
}

function parseWorkflowDocument(source, workflowPath) {
  const document = parseDocument(String(source).replace(/^\uFEFF/, ""), {
    schema: "core",
    uniqueKeys: true,
    merge: false,
    prettyErrors: false,
  });
  const problems = [...document.errors, ...document.warnings];
  if (problems.length) {
    throw new Error(`${workflowPath}: workflow YAML is invalid or ambiguous: ${problems.map(problemText).join("; ")}`);
  }
  const workflow = document.toJS({ mapAsMap: true, maxAliasCount: 100 });
  if (!(workflow instanceof Map)) throw new Error(`${workflowPath}: workflow root must be a YAML mapping`);
  return workflow;
}

function parsePermissions(value, label) {
  if (typeof value === "string") {
    if (value === "read-all") return { "*": "read" };
    if (value === "write-all") return { "*": WRITE };
    throw new Error(`${label}: unsupported permissions scalar ${JSON.stringify(value)}`);
  }
  if (!(value instanceof Map)) throw new Error(`${label}: permissions must be a mapping, read-all, or write-all`);
  const out = {};
  for (const [rawScope, rawPermission] of value) {
    if (typeof rawScope !== "string" || !/^[A-Za-z0-9_-]+$/.test(rawScope)) {
      throw new Error(`${label}: invalid permissions scope ${JSON.stringify(rawScope)}`);
    }
    if (typeof rawPermission !== "string") {
      throw new Error(`${label}: permission ${rawScope} must be a scalar`);
    }
    out[rawScope] = rawPermission;
  }
  return out;
}

function hasPullRequestTrigger(value, workflowPath) {
  if (typeof value === "string") return value === "pull_request";
  if (Array.isArray(value)) {
    for (const [index, event] of value.entries()) {
      if (typeof event !== "string") throw new Error(`${workflowPath}: on[${index}] must be an event name`);
      if (event === "pull_request") return true;
    }
    return false;
  }
  if (value instanceof Map) return value.has("pull_request");
  if (value === undefined) return false;
  throw new Error(`${workflowPath}: on must be an event name, sequence, or mapping`);
}

function stripLegacyComment(line) {
  let single = false;
  let double = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "'" && !double) single = !single;
    else if (character === '"' && !single && line[index - 1] !== "\\") double = !double;
    else if (character === "#" && !single && !double) return line.slice(0, index);
  }
  return line;
}

function legacyLines(source) {
  return String(source).replace(/^\uFEFF/, "").split(/\r?\n/).map((raw) => {
    const text = stripLegacyComment(raw).replace(/\s+$/, "");
    return {
      text,
      trimmed: text.trim(),
      indent: text.match(/^ */)?.[0].length || 0,
    };
  });
}

function legacyKeyAt(line, indent) {
  if (line.indent !== indent) return null;
  const match = line.text.slice(indent).match(/^(?:"([A-Za-z0-9_-]+)"|'([A-Za-z0-9_-]+)'|([A-Za-z0-9_-]+))\s*:(?:\s*(.*))?$/);
  return match ? { key: match[1] || match[2] || match[3], value: (match[4] || "").trim() } : null;
}

function legacySectionRange(lines, start, indent) {
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (!lines[index].trimmed) continue;
    if (lines[index].indent <= indent) {
      end = index;
      break;
    }
  }
  return { start, end };
}

function legacyFindSection(lines, key, indent, start = 0, end = lines.length) {
  for (let index = start; index < end; index += 1) {
    const row = legacyKeyAt(lines[index], indent);
    if (row?.key === key) return { ...legacySectionRange(lines, index, indent), value: row.value };
  }
  return null;
}

function legacyInlinePermissions(value) {
  const trimmed = value.trim();
  if (trimmed === "{}") return {};
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  const out = {};
  for (const entry of trimmed.slice(1, -1).split(",")) {
    const [rawKey, rawValue] = entry.split(":");
    if (!rawKey || rawValue === undefined) throw new Error(`invalid inline permissions map ${value}`);
    out[rawKey.trim().replace(/^['"]|['"]$/g, "")] = rawValue.trim().replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function legacyPermissions(lines, section) {
  if (!section) return null;
  const scalar = section.value.replace(/^['"]|['"]$/g, "");
  if (scalar) {
    if (scalar === "read-all") return { "*": "read" };
    if (scalar === "write-all") return { "*": WRITE };
    const inline = legacyInlinePermissions(scalar);
    if (inline) return inline;
    throw new Error(`unsupported permissions scalar ${JSON.stringify(section.value)}`);
  }
  const out = {};
  const indent = lines[section.start].indent + 2;
  for (let index = section.start + 1; index < section.end; index += 1) {
    if (!lines[index].trimmed) continue;
    const row = legacyKeyAt(lines[index], indent);
    if (!row) throw new Error(`unsupported permissions syntax at line ${index + 1}`);
    out[row.key] = row.value.replace(/^['"]|['"]$/g, "");
  }
  return out;
}

function legacyHasPullRequest(lines) {
  const section = legacyFindSection(lines, "on", 0);
  if (!section) return false;
  if (/\bpull_request\b/.test(section.value)) return true;
  for (let index = section.start + 1; index < section.end; index += 1) {
    if (legacyKeyAt(lines[index], 2)?.key === "pull_request") return true;
  }
  return false;
}

function definitelyExcludesPullRequest(expression) {
  const value = String(expression || "");
  if (!value) return false;
  if (/github\.event_name\s*==\s*['"]pull_request_target['"]/.test(value)) return true;
  if (/github\.event_name\s*==\s*['"](?:push|workflow_dispatch|schedule|workflow_run)['"]/.test(value)
      && !/github\.event_name\s*==\s*['"]pull_request['"]/.test(value)) return true;
  if (/github\.event_name\s*!=\s*['"]pull_request['"]/.test(value)) return true;
  return false;
}

function writeScopes(permissions) {
  if (permissions === null) return ["<implicit-default>"];
  return Object.entries(permissions)
    .filter(([, value]) => String(value).toLowerCase() === WRITE)
    .map(([scope]) => scope)
    .sort();
}

function analyzeWorkflowLegacy(source, workflowPath) {
  const lines = legacyLines(source);
  if (!legacyHasPullRequest(lines)) return { path: workflowPath, pull_request: false, jobs: [], violations: [], parser: "conservative-fallback" };
  const topPermissions = legacyPermissions(lines, legacyFindSection(lines, "permissions", 0));
  const jobs = legacyFindSection(lines, "jobs", 0);
  if (!jobs) throw new Error(`${workflowPath}: pull_request workflow has no jobs block`);
  const starts = [];
  for (let index = jobs.start + 1; index < jobs.end; index += 1) {
    const row = legacyKeyAt(lines[index], 2);
    if (row) starts.push({ name: row.key, start: index });
  }
  const analyzed = [];
  for (let position = 0; position < starts.length; position += 1) {
    const current = starts[position];
    const end = starts[position + 1]?.start ?? jobs.end;
    const ownPermissions = legacyPermissions(lines, legacyFindSection(lines, "permissions", 4, current.start + 1, end));
    const effective = ownPermissions ?? topPermissions;
    const ifSection = legacyFindSection(lines, "if", 4, current.start + 1, end);
    const expression = ifSection?.value || "";
    const scopes = writeScopes(effective);
    analyzed.push({
      name: current.name,
      expression,
      permissions: effective,
      implicit_permissions: effective === null,
      write_scopes: scopes,
      can_run_on_pull_request: !definitelyExcludesPullRequest(expression),
    });
  }
  const violations = analyzed
    .filter((job) => job.can_run_on_pull_request && job.write_scopes.length)
    .map((job) => ({ job: job.name, write_scopes: job.write_scopes }));
  return { path: workflowPath, pull_request: true, jobs: analyzed, violations, parser: "conservative-fallback" };
}

export function analyzeWorkflow(source, workflowPath = "<workflow>") {
  if (!parseDocument) return analyzeWorkflowLegacy(source, workflowPath);
  const workflow = parseWorkflowDocument(source, workflowPath);
  if (!hasPullRequestTrigger(workflow.get("on"), workflowPath)) {
    return { path: workflowPath, pull_request: false, jobs: [], violations: [], parser: "yaml-1.2" };
  }

  const topPermissions = workflow.has("permissions")
    ? parsePermissions(workflow.get("permissions"), `${workflowPath}: top-level`)
    : null;
  const jobs = workflow.get("jobs");
  if (!(jobs instanceof Map)) throw new Error(`${workflowPath}: pull_request workflow has no jobs mapping`);

  const analyzed = [];
  for (const [rawName, job] of jobs) {
    if (typeof rawName !== "string" || !rawName) throw new Error(`${workflowPath}: job name must be a non-empty string`);
    if (!(job instanceof Map)) throw new Error(`${workflowPath}: job ${rawName} must be a mapping`);
    const ownPermissions = job.has("permissions")
      ? parsePermissions(job.get("permissions"), `${workflowPath}: job ${rawName}`)
      : undefined;
    const effective = ownPermissions === undefined ? topPermissions : ownPermissions;
    const rawExpression = job.get("if");
    if (rawExpression !== undefined && !["string", "boolean", "number"].includes(typeof rawExpression)) {
      throw new Error(`${workflowPath}: job ${rawName} if condition must be a scalar`);
    }
    const expression = rawExpression === undefined ? "" : String(rawExpression);
    const scopes = writeScopes(effective);
    analyzed.push({
      name: rawName,
      expression,
      permissions: effective,
      implicit_permissions: effective === null,
      write_scopes: scopes,
      can_run_on_pull_request: !definitelyExcludesPullRequest(expression),
    });
  }
  const violations = analyzed
    .filter((job) => job.can_run_on_pull_request && job.write_scopes.length)
    .map((job) => ({ job: job.name, write_scopes: job.write_scopes }));
  return { path: workflowPath, pull_request: true, jobs: analyzed, violations, parser: "yaml-1.2" };
}

export function gitBlobSha(bytes) {
  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return createHash("sha1").update(Buffer.from(`blob ${body.length}\0`)).update(body).digest("hex");
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function recordDigest(payload) {
  return sha256Hex(`${JSON.stringify(stableValue(payload))}\n`);
}

function loadBaseline(file) {
  const document = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(document.schema_version, 1, "publisher-custody baseline schema drifted");
  assert.ok(Array.isArray(document.exceptions), "publisher-custody exceptions must be an array");
  const paths = new Set();
  for (const row of document.exceptions) {
    assert.match(row.path, /^\.github\/workflows\/[^/]+\.ya?ml$/, "invalid workflow exception path");
    assert.match(row.git_blob, /^[0-9a-f]{40}$/, `invalid Git blob for ${row.path}`);
    assert.equal(paths.has(row.path), false, `duplicate workflow exception ${row.path}`);
    paths.add(row.path);
  }
  return document;
}

export function scanRepository(root = process.cwd(), baselinePath = DEFAULT_BASELINE) {
  const baselineFile = path.resolve(root, baselinePath);
  const baseline = loadBaseline(baselineFile);
  const exceptions = new Map(baseline.exceptions.map((row) => [row.path, row]));
  const workflowRoot = path.resolve(root, ".github/workflows");
  const files = readdirSync(workflowRoot)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort()
    .map((name) => `.github/workflows/${name}`);

  const analyses = [];
  const acceptedLegacy = [];
  const failures = [];
  for (const workflowPath of files) {
    const bytes = readFileSync(path.resolve(root, workflowPath));
    const analysis = analyzeWorkflow(bytes.toString("utf8"), workflowPath);
    analyses.push(analysis);
    if (!analysis.violations.length) continue;
    const exception = exceptions.get(workflowPath);
    const blob = gitBlobSha(bytes);
    if (exception && exception.git_blob === blob) acceptedLegacy.push({ path: workflowPath, git_blob: blob, violations: analysis.violations });
    else failures.push({ path: workflowPath, git_blob: blob, expected_blob: exception?.git_blob || null, violations: analysis.violations });
  }

  const staleExceptions = baseline.exceptions
    .filter((row) => !acceptedLegacy.some((accepted) => accepted.path === row.path))
    .map((row) => row.path);
  if (staleExceptions.length) failures.push({ stale_exceptions: staleExceptions });

  return {
    schema_version: 1,
    baseline: baselinePath,
    workflow_count: files.length,
    pull_request_workflows: analyses.filter((row) => row.pull_request).length,
    violating_workflows: analyses.filter((row) => row.violations.length).length,
    parsers: [...new Set(analyses.map((row) => row.parser))].sort(),
    accepted_legacy: acceptedLegacy,
    failures,
  };
}

export function validateProductPullRequest(pr, expected) {
  assert.equal(pr.base?.ref, expected.base_ref, "product PR base ref drifted");
  assert.equal(pr.base?.sha, expected.base_sha, "product PR base SHA drifted");
  assert.equal(pr.head?.sha, expected.head_sha, "product PR head SHA drifted");
  assert.equal(pr.state, "open", "product PR is not open");
  assert.equal(pr.draft, true, "product PR is not draft");
  assert.equal(pr.merged, false, "product PR is already merged");
  assert.equal(pr.commits, 1, "product PR commit count drifted");
  const actual = [...(pr.changed_paths || [])].sort();
  const wanted = [...expected.changed_paths].sort();
  assert.deepEqual(actual, wanted, "product PR changed-path manifest drifted");
  return true;
}

export function validateProductCommitObject(commit, expected) {
  assert.ok(commit && typeof commit === "object" && !Array.isArray(commit), "actual product commit object is missing");
  assert.equal(commit.sha, expected.head_sha, "actual product commit SHA drifted");
  assert.ok(Array.isArray(commit.parents), "actual product commit parents are missing");
  assert.equal(commit.parents.length, 1, "actual product commit is not one-parent");
  assert.equal(commit.parents[0]?.sha, expected.base_sha, "actual product parent drifted");
  assert.equal(commit.tree?.sha, expected.tree_sha, "actual product tree drifted");
  return true;
}

function assertSafeRelativePath(file) {
  assert.equal(typeof file, "string", "handoff file path must be a string");
  assert.ok(file.length > 0, "handoff file path must not be empty");
  assert.equal(path.isAbsolute(file), false, `handoff file path must be relative: ${file}`);
  assert.equal(file.includes("\\"), false, `handoff file path must use POSIX separators: ${file}`);
  const normalized = path.posix.normalize(file);
  assert.equal(normalized, file, `handoff file path is not normalized: ${file}`);
  assert.equal(normalized.startsWith("../") || normalized === "..", false, `handoff file escapes root: ${file}`);
}

export function validateArtifactMetadata(artifact, expected) {
  assert.equal(Number(artifact.id), Number(expected.artifact_id), "artifact id drifted");
  assert.equal(artifact.name, expected.artifact_name, "artifact name drifted");
  assert.equal(artifact.expired, false, "artifact is expired");
  assert.equal(artifact.digest, expected.artifact_digest, "artifact digest drifted");
  assert.equal(Number(artifact.workflow_run?.id), Number(expected.run_id), "artifact workflow run drifted");
  assert.equal(artifact.workflow_run?.head_sha, expected.head_sha, "artifact workflow head drifted");
  return true;
}

export function validateEvidenceHandoff(handoff, expected, root) {
  assert.deepEqual(Object.keys(handoff).sort(), [
    "artifact_name",
    "event_name",
    "files",
    "head_branch",
    "head_sha",
    "kind",
    "repository",
    "run_attempt",
    "run_id",
    "schema_version",
  ], "publisher handoff shape drifted");
  assert.equal(handoff.schema_version, 1, "publisher handoff schema drifted");
  assert.equal(handoff.kind, expected.kind, "publisher handoff kind drifted");
  assert.equal(handoff.repository, expected.repository, "publisher handoff repository drifted");
  assert.equal(Number(handoff.run_id), Number(expected.run_id), "publisher handoff run drifted");
  assert.equal(Number(handoff.run_attempt), Number(expected.run_attempt), "publisher handoff attempt drifted");
  assert.equal(handoff.event_name, expected.event_name, "publisher handoff event drifted");
  assert.equal(handoff.head_branch, expected.head_branch, "publisher handoff branch drifted");
  assert.equal(handoff.head_sha, expected.head_sha, "publisher handoff head drifted");
  assert.equal(handoff.artifact_name, expected.artifact_name, "publisher handoff artifact name drifted");
  assert.ok(handoff.files && typeof handoff.files === "object" && !Array.isArray(handoff.files), "publisher handoff files must be an object");
  const entries = Object.entries(handoff.files).sort(([a], [b]) => a.localeCompare(b));
  assert.ok(entries.length > 0, "publisher handoff has no files");
  for (const [file, digest] of entries) {
    assertSafeRelativePath(file);
    assert.match(digest, /^[0-9a-f]{64}$/, `invalid handoff SHA-256 for ${file}`);
    const bytes = readFileSync(path.resolve(root, file));
    assert.equal(sha256Hex(bytes), digest, `publisher handoff file digest drifted: ${file}`);
  }
  return true;
}

export function validatePublicationSettlement(settlement, expected) {
  assert.equal(settlement.schema_version, 1, "publication settlement schema drifted");
  assert.equal(settlement.verifier.run_id, expected.verifier_run_id, "verifier run drifted");
  assert.equal(settlement.verifier.carrier_head, expected.carrier_head, "carrier head drifted");
  assert.equal(settlement.artifact.id, expected.artifact_id, "settlement artifact id drifted");
  assert.equal(settlement.artifact.digest, expected.artifact_digest, "settlement artifact digest drifted");
  assert.equal(settlement.product.base_ref, expected.base_ref, "settlement base ref drifted");
  assert.equal(settlement.product.base_sha, expected.base_sha, "settlement base SHA drifted");
  assert.equal(settlement.product.parent_sha, expected.base_sha, "product parent drifted");
  assert.equal(settlement.product.commit_sha, expected.head_sha, "settlement product commit drifted");
  assert.equal(settlement.product.tree_sha, expected.tree_sha, "settlement product tree drifted");
  assert.equal(settlement.product.pr_number, expected.pr_number, "settlement product PR drifted");
  assert.deepEqual([...settlement.product.changed_paths].sort(), [...expected.changed_paths].sort(), "settlement path manifest drifted");

  const checkpointNames = [
    "product_commit_constructed",
    "product_pr_created",
    "publication_receipt_created",
    "terminal_closure",
  ];
  assert.deepEqual(Object.keys(settlement.checkpoints).sort(), [...checkpointNames].sort(), "publication checkpoints drifted");
  for (const checkpoint of checkpointNames) {
    assert.equal(settlement.checkpoints[checkpoint], expected.base_sha, `main advanced at checkpoint ${checkpoint}`);
  }

  const expectedPayload = {
    artifact_digest: expected.artifact_digest,
    artifact_id: expected.artifact_id,
    base_ref: expected.base_ref,
    base_sha: expected.base_sha,
    carrier_head: expected.carrier_head,
    changed_paths: [...expected.changed_paths].sort(),
    product_commit: expected.head_sha,
    product_pr_number: expected.pr_number,
    product_tree: expected.tree_sha,
    verifier_run_id: expected.verifier_run_id,
  };
  assert.deepEqual(stableValue(settlement.publication_receipt.payload), stableValue(expectedPayload), "publication receipt payload drifted");
  assert.equal(settlement.publication_receipt.sha256, recordDigest(settlement.publication_receipt.payload), "publication receipt digest drifted");
  return true;
}

export function validateTerminalPublication({ settlement, pr, product_commit: productCommit, current_main_sha: currentMainSha }, expected) {
  validatePublicationSettlement(settlement, expected);
  assert.equal(currentMainSha, expected.base_sha, "main advanced before terminal closure");
  validateProductPullRequest(pr, {
    base_ref: expected.base_ref,
    base_sha: expected.base_sha,
    head_sha: expected.head_sha,
    changed_paths: expected.changed_paths,
  });
  assert.equal(pr.number, expected.pr_number, "actual product PR number drifted");
  validateProductCommitObject(productCommit, expected);
  assert.equal(productCommit.sha, pr.head?.sha, "actual product commit does not match the refetched PR head");
  return true;
}

function option(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  if (index < 0) return fallback;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function requiredOption(argv, name) {
  const value = option(argv, name);
  if (value === null) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] || "check-workflows";
  if (command === "check-workflows") {
    const root = path.resolve(option(argv, "--root", process.cwd()));
    const baseline = option(argv, "--baseline", DEFAULT_BASELINE);
    const result = scanRepository(root, baseline);
    console.log(JSON.stringify(result, null, 2));
    if (result.failures.length) process.exitCode = 1;
    return;
  }
  if (command === "verify-product-pr") {
    const pr = JSON.parse(readFileSync(requiredOption(argv, "--pr-json"), "utf8"));
    const paths = JSON.parse(readFileSync(requiredOption(argv, "--paths-json"), "utf8"));
    validateProductPullRequest(pr, {
      base_ref: option(argv, "--base-ref", "main"),
      base_sha: requiredOption(argv, "--base-sha"),
      head_sha: requiredOption(argv, "--head-sha"),
      changed_paths: paths,
    });
    console.log("publisher custody: product PR exact");
    return;
  }
  if (command === "verify-evidence-handoff") {
    const handoff = JSON.parse(readFileSync(requiredOption(argv, "--handoff-json"), "utf8"));
    const artifact = JSON.parse(readFileSync(requiredOption(argv, "--artifact-json"), "utf8"));
    const expected = {
      kind: requiredOption(argv, "--kind"),
      repository: requiredOption(argv, "--repository"),
      run_id: Number(requiredOption(argv, "--run-id")),
      run_attempt: Number(requiredOption(argv, "--run-attempt")),
      event_name: requiredOption(argv, "--event-name"),
      head_branch: requiredOption(argv, "--head-branch"),
      head_sha: requiredOption(argv, "--head-sha"),
      artifact_id: Number(requiredOption(argv, "--artifact-id")),
      artifact_name: requiredOption(argv, "--artifact-name"),
      artifact_digest: requiredOption(argv, "--artifact-digest"),
    };
    validateArtifactMetadata(artifact, expected);
    validateEvidenceHandoff(handoff, expected, path.resolve(requiredOption(argv, "--root")));
    console.log("publisher custody: evidence handoff exact");
    return;
  }
  if (command === "verify-terminal-publication") {
    const settlement = JSON.parse(readFileSync(requiredOption(argv, "--settlement-json"), "utf8"));
    const pr = JSON.parse(readFileSync(requiredOption(argv, "--pr-json"), "utf8"));
    const productCommit = JSON.parse(readFileSync(requiredOption(argv, "--commit-json"), "utf8"));
    const paths = JSON.parse(readFileSync(requiredOption(argv, "--paths-json"), "utf8"));
    const expected = {
      verifier_run_id: Number(requiredOption(argv, "--verifier-run-id")),
      carrier_head: requiredOption(argv, "--carrier-head"),
      artifact_id: Number(requiredOption(argv, "--artifact-id")),
      artifact_digest: requiredOption(argv, "--artifact-digest"),
      base_ref: option(argv, "--base-ref", "main"),
      base_sha: requiredOption(argv, "--base-sha"),
      head_sha: requiredOption(argv, "--head-sha"),
      tree_sha: requiredOption(argv, "--tree-sha"),
      pr_number: Number(requiredOption(argv, "--pr-number")),
      changed_paths: paths,
    };
    validateTerminalPublication({
      settlement,
      pr,
      product_commit: productCommit,
      current_main_sha: requiredOption(argv, "--current-main-sha"),
    }, expected);
    console.log("publisher custody: terminal publication exact");
    return;
  }
  throw new Error(`unknown publisher-custody command ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`publisher custody: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
