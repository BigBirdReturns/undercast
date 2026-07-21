import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { normalize, normalizeScopes, sha256 } from "./autopilot-model.mjs";

export const AUTOPILOT_CERTIFICATION_VERSION = 1;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function safeRelativePath(value) {
  const path = String(value || "").trim().replace(/\\/g, "/");
  if (!path || path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error(`unsafe producer file path: ${value || "<missing>"}`);
  }
  return path;
}

function normalizeCheck(check, index, scopeId) {
  if (!check || typeof check !== "object" || Array.isArray(check)) {
    throw new Error(`scope ${scopeId} certification.checks[${index}] must be an object`);
  }
  const executable = String(check.executable || "").trim();
  const args = Array.isArray(check.args) ? check.args.map(String) : [];
  if (!executable || /[\r\n\0]/.test(executable)) {
    throw new Error(`scope ${scopeId} certification.checks[${index}] needs a safe executable`);
  }
  if (args.some((arg) => /[\r\n\0]/.test(arg))) {
    throw new Error(`scope ${scopeId} certification.checks[${index}] contains an unsafe argument`);
  }
  return {
    label: String(check.label || `${executable} ${args.join(" ")}`).trim(),
    executable,
    args,
  };
}

function normalizeCommandStep(step, index, scopeId, label) {
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    throw new Error(`scope ${scopeId} ${label}[${index}] must be an object`);
  }
  const executable = String(step.executable || "").trim();
  const args = Array.isArray(step.args) ? step.args.map(String) : [];
  if (!executable || /[\r\n\0]/.test(executable) || args.some((arg) => /[\r\n\0]/.test(arg))) {
    throw new Error(`scope ${scopeId} ${label}[${index}] contains an unsafe command`);
  }
  return {
    label: String(step.label || `${executable} ${args.join(" ")}`).trim(),
    executable,
    args,
  };
}

export function refreshConfig(scope) {
  if (!scope || typeof scope !== "object") throw new Error("scope must be an object");
  const scopeId = String(scope.id || "<missing>");
  const raw = scope.refresh;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`scope ${scopeId} needs a refresh contract`);
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [{ executable: raw.executable, args: raw.args, label: raw.label }];
  if (!rawSteps.length) throw new Error(`scope ${scopeId} refresh needs at least one step`);
  const cadenceDays = Number(raw.cadence_days);
  if (!Number.isInteger(cadenceDays) || cadenceDays < 1 || cadenceDays > 3650) {
    throw new Error(`scope ${scopeId} refresh.cadence_days must be an integer from 1 to 3650`);
  }
  return {
    steps: rawSteps.map((step, index) => normalizeCommandStep(step, index, scopeId, "refresh.steps")),
    cadence_days: cadenceDays,
  };
}

export function certificationConfig(scope) {
  if (!scope || typeof scope !== "object") throw new Error("scope must be an object");
  const scopeId = String(scope.id || "<missing>");
  const raw = scope.certification;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`scope ${scopeId} needs a certification contract`);
  }
  if (!Array.isArray(raw.producer_files) || !raw.producer_files.length) {
    throw new Error(`scope ${scopeId} certification needs producer_files`);
  }
  if (!Array.isArray(raw.checks) || !raw.checks.length) {
    throw new Error(`scope ${scopeId} certification needs checks`);
  }
  return {
    producer_files: [...new Set(raw.producer_files.map(safeRelativePath))].sort(),
    checks: raw.checks.map((check, index) => normalizeCheck(check, index, scopeId)),
    require_manifest_receipts: raw.require_manifest_receipts !== false,
  };
}

export function scopeContract(scope) {
  const config = certificationConfig(scope);
  return {
    id: String(scope.id),
    label: String(scope.label || ""),
    coverage_match: stable(scope.coverage_match || {}),
    refresh: refreshConfig(scope),
    certification: config,
  };
}

export function emptyCertifications() {
  return {
    version: AUTOPILOT_CERTIFICATION_VERSION,
    semantics: "A scope may lease autonomous work only while its declared producer contract matches a reviewed certification receipt and its current census snapshot passes the source-receipt gate.",
    certifications: [],
  };
}

export function validateCertifications(doc) {
  if (!doc || doc.version !== AUTOPILOT_CERTIFICATION_VERSION || !Array.isArray(doc.certifications)) {
    throw new Error(`AUTOPILOT-CERTIFICATIONS must be version ${AUTOPILOT_CERTIFICATION_VERSION} with a certifications array`);
  }
  const ids = new Set();
  for (const row of doc.certifications) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("certification rows must be objects");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.scope_id || "")) throw new Error(`invalid certification scope_id ${row.scope_id || "<missing>"}`);
    if (ids.has(row.scope_id)) throw new Error(`duplicate certification for ${row.scope_id}`);
    ids.add(row.scope_id);
    if (!/^[0-9a-f]{64}$/i.test(row.producer_sha256 || "")) throw new Error(`certification ${row.scope_id} has invalid producer_sha256`);
    if (!/^[0-9a-f]{64}$/i.test(row.contract_sha256 || "")) throw new Error(`certification ${row.scope_id} has invalid contract_sha256`);
    if (!Number.isFinite(Date.parse(row.certified_at || ""))) throw new Error(`certification ${row.scope_id} has invalid certified_at`);
    if (!String(row.certified_by || "").trim()) throw new Error(`certification ${row.scope_id} needs certified_by`);
    if (!Array.isArray(row.producer_files) || !row.producer_files.length) throw new Error(`certification ${row.scope_id} needs producer_files`);
    const files = row.producer_files.map(safeRelativePath);
    if (new Set(files).size !== files.length) throw new Error(`certification ${row.scope_id} has duplicate producer_files`);
    if (!Array.isArray(row.checks) || !row.checks.length) throw new Error(`certification ${row.scope_id} needs checks`);
    for (const [index, check] of row.checks.entries()) {
      if (!check || typeof check !== "object" || Array.isArray(check)) throw new Error(`certification ${row.scope_id} checks[${index}] must be an object`);
      if (!String(check.label || "").trim() || !String(check.command || "").trim() || check.status !== "passed") {
        throw new Error(`certification ${row.scope_id} checks[${index}] is not a passed command receipt`);
      }
    }
    if (!row.snapshot || typeof row.snapshot !== "object" || Array.isArray(row.snapshot)) throw new Error(`certification ${row.scope_id} needs snapshot metadata`);
    for (const key of ["coverage_sha256", "manifest_sha256"]) {
      if (!/^[0-9a-f]{64}$/i.test(row.snapshot[key] || "")) throw new Error(`certification ${row.scope_id} snapshot has invalid ${key}`);
    }
    for (const key of ["coverage_file_sha256", "manifest_file_sha256"]) {
      if (row.snapshot[key] !== undefined && !/^[0-9a-f]{64}$/i.test(row.snapshot[key] || "")) throw new Error(`certification ${row.scope_id} snapshot has invalid ${key}`);
    }
    for (const key of ["rows", "sources", "complete_receipts"]) {
      if (!Number.isInteger(row.snapshot[key]) || row.snapshot[key] < 0) throw new Error(`certification ${row.scope_id} snapshot has invalid ${key}`);
    }
  }
  return true;
}

export async function producerFingerprint(scope, { root = ".", read = readFile } = {}) {
  const contract = scopeContract(scope);
  const hash = createHash("sha256");
  for (const path of contract.certification.producer_files) {
    const absolute = resolve(root, path);
    const rel = relative(resolve(root), absolute).replace(/\\/g, "/");
    if (rel.startsWith("../") || rel === "..") throw new Error(`producer file escapes repository root: ${path}`);
    let bytes;
    try { bytes = await read(absolute); }
    catch (error) { throw new Error(`cannot read producer file ${path}: ${error.message}`); }
    hash.update(path); hash.update("\0"); hash.update(bytes); hash.update("\0");
  }
  return {
    producer_sha256: hash.digest("hex"),
    contract_sha256: sha256(stableJson(contract)),
    producer_files: contract.certification.producer_files,
    checks: contract.certification.checks,
    require_manifest_receipts: contract.certification.require_manifest_receipts,
  };
}

function sourceKey(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch { return String(value || "").trim(); }
}

export function snapshotReadiness(scope, coverage, manifest, { coverageSha256 = "", manifestSha256 = "" } = {}) {
  if (!Array.isArray(coverage)) throw new Error("CENSUS-COVERAGE must be an array");
  const observations = Array.isArray(manifest) ? manifest : manifest?.observations;
  if (!Array.isArray(observations)) throw new Error("CENSUS-MANIFEST must contain an observations array");
  const franchise = normalize(scope.coverage_match?.franchise);
  const rows = coverage
    .filter((row) => normalize(row?.franchise) === franchise)
    .map((row) => stable({
      scope_id: row.scope_id || "",
      franchise: row.franchise || "",
      category: row.category || "",
      character: row.character || "",
      performer: row.performer || "",
      performance_mode: row.performance_mode || "unresolved",
      source: sourceKey(row.source),
    }))
    .sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
  const sources = [...new Set(rows.map((row) => sourceKey(row?.source)).filter(Boolean))].sort();
  const sourceSet = new Set(sources);
  const receiptRows = observations
    .filter((row) => normalize(row?.franchise) === franchise && sourceSet.has(sourceKey(row?.source)))
    .map((row) => stable({
      source: sourceKey(row.source),
      pageid: row.pageid ?? null,
      revision: row.revision ?? null,
      timestamp: row.timestamp || "",
      content_sha256: String(row.content_sha256 || "").toLowerCase(),
      disposition: row.disposition || "",
      category: row.category || "",
      title: row.title || "",
    }))
    .sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
  const receiptMap = new Map();
  for (const row of receiptRows) {
    const complete = Number.isInteger(row.pageid) && Number.isInteger(row.revision)
      && /^[0-9a-f]{64}$/i.test(row.content_sha256 || "");
    if (complete) receiptMap.set(sourceKey(row.source), row);
  }
  const observedTimes = observations
    .filter((row) => normalize(row?.franchise) === franchise && sourceSet.has(sourceKey(row?.source)))
    .map((row) => row.observed_at)
    .filter((value) => Number.isFinite(Date.parse(value || "")))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  const capturedAt = !observedTimes.length && Number.isFinite(Date.parse(manifest?.captured_at || "")) ? manifest.captured_at : null;
  const lastObservedAt = observedTimes.at(-1) || capturedAt || null;
  const requireReceipts = certificationConfig(scope).require_manifest_receipts;
  const missingReceipts = requireReceipts ? sources.filter((source) => !receiptMap.has(source)) : [];
  const reasons = [];
  if (!rows.length) reasons.push("scope_has_no_coverage_rows");
  if (!sources.length) reasons.push("scope_has_no_source_urls");
  if (missingReceipts.length) reasons.push("manifest_receipts_incomplete");
  return {
    ready: reasons.length === 0,
    reasons,
    rows: rows.length,
    sources: sources.length,
    complete_receipts: sources.filter((source) => receiptMap.has(source)).length,
    missing_receipts: missingReceipts,
    last_observed_at: lastObservedAt,
    // Lease identity is scope-local: refreshing Doctor Who must not invalidate a
    // Star Trek batch merely because both projections share one JSON file.
    coverage_sha256: sha256(stableJson(rows)),
    manifest_sha256: sha256(stableJson(receiptRows)),
    coverage_file_sha256: coverageSha256 || sha256(Buffer.from(JSON.stringify(coverage))),
    manifest_file_sha256: manifestSha256 || sha256(Buffer.from(JSON.stringify(manifest))),
  };
}
function certificateByScope(doc) {
  validateCertifications(doc);
  return new Map(doc.certifications.map((row) => [row.scope_id, row]));
}

export async function resolveScopeReadiness({
  scopesDoc,
  certificationsDoc = emptyCertifications(),
  coverage = [],
  manifest = { observations: [] },
  coverageSha256 = "",
  manifestSha256 = "",
  root = ".",
  now = new Date().toISOString(),
} = {}) {
  const scopes = Array.isArray(scopesDoc) ? scopesDoc : scopesDoc?.scopes;
  if (!Array.isArray(scopes)) throw new Error("AUTOPILOT-SCOPES must contain a scopes array");
  if (!Number.isFinite(Date.parse(now))) throw new Error(`invalid readiness timestamp ${now}`);
  normalizeScopes(scopesDoc);
  for (const scope of scopes) if ((scope.status || "paused") !== "retired") {
    certificationConfig(scope);
    refreshConfig(scope);
  }
  const certs = certificateByScope(certificationsDoc);
  const effective = structuredClone(Array.isArray(scopesDoc) ? { version: 1, scopes } : scopesDoc);
  const readiness = [];
  for (const scope of effective.scopes) {
    const declared = scope.status || "paused";
    const row = {
      scope_id: scope.id,
      label: scope.label,
      priority: Number.isFinite(scope.priority) ? Number(scope.priority) : 0,
      declared_status: declared,
      effective_status: declared,
      certification: "not-checked",
      snapshot: "not-checked",
      reasons: [],
    };
    if (declared === "retired") {
      readiness.push(row);
      continue;
    }

    const refresh = refreshConfig(scope);
    const snapshot = snapshotReadiness(scope, coverage, manifest, { coverageSha256, manifestSha256 });
    row.snapshot = snapshot.ready ? "ready" : "blocked";
    row.snapshot_details = snapshot;
    row.refresh = {
      cadence_days: refresh.cadence_days,
      steps: refresh.steps,
      last_observed_at: snapshot.last_observed_at,
      due_at: snapshot.last_observed_at
        ? new Date(Date.parse(snapshot.last_observed_at) + refresh.cadence_days * 86_400_000).toISOString()
        : null,
    };
    row.refresh.due = !row.refresh.due_at || Date.parse(row.refresh.due_at) <= Date.parse(now);

    if (declared !== "active") {
      row.effective_status = "paused";
      row.certification = certs.has(scope.id) ? "present-not-checked" : "missing";
      row.reasons.push("scope_declared_paused");
      readiness.push(row);
      continue;
    }

    let fingerprint;
    try { fingerprint = await producerFingerprint(scope, { root }); }
    catch (error) {
      scope.status = "paused";
      row.effective_status = "paused";
      row.certification = "unreadable-producer";
      row.reasons.push(error.message);
      readiness.push(row);
      continue;
    }
    row.producer_sha256 = fingerprint.producer_sha256;
    row.contract_sha256 = fingerprint.contract_sha256;
    const cert = certs.get(scope.id);
    if (!cert) {
      scope.status = "paused";
      row.effective_status = "paused";
      row.certification = "missing";
      row.reasons.push("certification_missing");
      readiness.push(row);
      continue;
    }
    if (cert.producer_sha256 !== fingerprint.producer_sha256 || cert.contract_sha256 !== fingerprint.contract_sha256) {
      scope.status = "paused";
      row.effective_status = "paused";
      row.certification = "stale";
      row.reasons.push(cert.producer_sha256 !== fingerprint.producer_sha256 ? "producer_changed" : "scope_contract_changed");
      readiness.push(row);
      continue;
    }
    row.certification = "current";
    if (!snapshot.ready) {
      scope.status = "paused";
      row.effective_status = "paused";
      row.reasons.push(...snapshot.reasons);
      readiness.push(row);
      continue;
    }
    row.effective_status = "active";
    row.lease_token = sha256(stableJson({
      scope_id: scope.id,
      producer_sha256: fingerprint.producer_sha256,
      contract_sha256: fingerprint.contract_sha256,
      coverage_sha256: snapshot.coverage_sha256,
      manifest_sha256: snapshot.manifest_sha256,
    }));
    readiness.push(row);
  }
  return { effectiveScopes: effective, readiness };
}
export function runRefreshSteps(scope, { cwd = ".", env = process.env, spawn = spawnSync } = {}) {
  const receipts = [];
  for (const step of refreshConfig(scope).steps) {
    const command = [step.executable, ...step.args].join(" ");
    const result = spawn(step.executable, step.args, { cwd, env, stdio: "inherit", shell: false });
    if (result.error) throw new Error(`${step.label} could not start: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`${step.label} failed with exit ${result.status}`);
    receipts.push({ label: step.label, command, status: "passed" });
  }
  return receipts;
}

export function runScopeChecks(scope, { cwd = ".", env = process.env, spawn = spawnSync } = {}) {
  const checks = certificationConfig(scope).checks;
  const receipts = [];
  for (const check of checks) {
    const command = [check.executable, ...check.args].join(" ");
    const result = spawn(check.executable, check.args, { cwd, env, stdio: "inherit", shell: false });
    if (result.error) throw new Error(`${check.label} could not start: ${result.error.message}`);
    if (result.status !== 0) throw new Error(`${check.label} failed with exit ${result.status}`);
    receipts.push({ label: check.label, command, status: "passed" });
  }
  return receipts;
}

export async function certifyScope({
  scopesDoc,
  certificationsDoc = emptyCertifications(),
  scopeId,
  certifiedBy,
  coverage,
  manifest,
  coverageSha256,
  manifestSha256,
  root = ".",
  cwd = root,
  now = new Date().toISOString(),
  spawn = spawnSync,
} = {}) {
  const scopes = Array.isArray(scopesDoc) ? scopesDoc : scopesDoc?.scopes;
  if (!Array.isArray(scopes)) throw new Error("AUTOPILOT-SCOPES must contain a scopes array");
  normalizeScopes(scopesDoc);
  const scope = scopes.find((row) => row.id === scopeId);
  if (!scope) throw new Error(`unknown scope ${scopeId || "<missing>"}`);
  if (!String(certifiedBy || "").trim()) throw new Error("certify requires --reviewed-by");
  if (!Number.isFinite(Date.parse(now))) throw new Error(`invalid certification timestamp ${now}`);
  validateCertifications(certificationsDoc);
  const checks = runScopeChecks(scope, { cwd, spawn });
  const fingerprint = await producerFingerprint(scope, { root });
  const snapshot = snapshotReadiness(scope, coverage, manifest, { coverageSha256, manifestSha256 });
  if (!snapshot.ready) throw new Error(`scope ${scope.id} snapshot is not certifiable: ${snapshot.reasons.join(", ")}`);
  const certificate = {
    scope_id: scope.id,
    producer_sha256: fingerprint.producer_sha256,
    contract_sha256: fingerprint.contract_sha256,
    producer_files: fingerprint.producer_files,
    checks,
    snapshot: {
      coverage_sha256: snapshot.coverage_sha256,
      manifest_sha256: snapshot.manifest_sha256,
      rows: snapshot.rows,
      sources: snapshot.sources,
      complete_receipts: snapshot.complete_receipts,
      coverage_file_sha256: snapshot.coverage_file_sha256,
      manifest_file_sha256: snapshot.manifest_file_sha256,
    },
    certified_at: now,
    certified_by: String(certifiedBy).trim(),
  };
  const next = structuredClone(certificationsDoc);
  const index = next.certifications.findIndex((row) => row.scope_id === scope.id);
  if (index >= 0) next.certifications[index] = certificate;
  else next.certifications.push(certificate);
  next.certifications.sort((a, b) => a.scope_id.localeCompare(b.scope_id));
  validateCertifications(next);
  return { certifications: next, certificate, snapshot };
}
