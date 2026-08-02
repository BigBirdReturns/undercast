#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ADAPTER_CONTRACT_VERSION = 1;
export const ADAPTER_STATUSES = new Set(["certified-reference", "review-candidate", "blocked"]);
const HASH_RE = /^[0-9a-f]{64}$/;
const DEFAULT_OUTPUT = "data/review/adapter-sdk/BASELINE.json";

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
export function stableJson(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}
export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function requireObject(value, label, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} must be an object`);
    return {};
  }
  return value;
}
function requireString(value, label, errors) {
  const text = String(value || "").trim();
  if (!text) errors.push(`${label} is required`);
  return text;
}
function commandKey(command) {
  return `${command?.executable || ""}\u0000${(command?.args || []).join("\u0000")}`;
}
function scopeRefreshCommands(refresh) {
  if (Array.isArray(refresh?.steps)) {
    return refresh.steps.map((step) => ({ executable: step.executable, args: step.args || [] }));
  }
  if (refresh?.executable) return [{ executable: refresh.executable, args: refresh.args || [] }];
  return [];
}
function hostForSource(source) {
  try { return new URL(source).hostname.toLowerCase(); }
  catch { return null; }
}
function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}
function receiptKey(row) {
  return [row.source, row.pageid, row.revision, row.content_sha256].map((value) => String(value ?? "")).join("\u0000");
}
function observedAt(rows, fallback = null) {
  const values = rows.map((row) => Date.parse(row.observed_at || "")).filter(Number.isFinite);
  if (values.length) return new Date(Math.max(...values)).toISOString();
  if (Number.isFinite(Date.parse(fallback || ""))) return new Date(Date.parse(fallback)).toISOString();
  return "1970-01-01T00:00:00.000Z";
}
function countBy(rows, field) {
  const counts = {};
  for (const row of rows) {
    const key = String(row?.[field] ?? "<missing>");
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

export function validateAdapterRegistry({ registry, estateRegistry, scopes, root = process.cwd() }) {
  const errors = [];
  const doc = requireObject(registry, "adapter registry", errors);
  if (doc.version !== ADAPTER_CONTRACT_VERSION) errors.push("adapter registry version must be 1");
  if (doc.schema !== "schema/census-adapter.schema.json") errors.push("adapter registry schema path drifted");
  if (!Array.isArray(doc.adapters) || doc.adapters.length === 0) errors.push("adapter registry needs adapters[]");

  const estateRows = Array.isArray(estateRegistry?.estates) ? estateRegistry.estates : [];
  const scopeRows = Array.isArray(scopes?.scopes) ? scopes.scopes : [];
  const estates = new Map(estateRows.map((row) => [row.id, row]));
  const scopeMap = new Map(scopeRows.map((row) => [row.id || row.scope_id, row]));
  const ids = new Set();
  const scopeIds = new Set();

  for (const [index, raw] of (doc.adapters || []).entries()) {
    const adapter = requireObject(raw, `adapters[${index}]`, errors);
    const id = requireString(adapter.id, `adapters[${index}].id`, errors);
    const scopeId = requireString(adapter.scope_id, `${id || `adapters[${index}]`}.scope_id`, errors);
    const estateId = requireString(adapter.estate_id, `${id || `adapters[${index}]`}.estate_id`, errors);
    const franchise = requireString(adapter.franchise, `${id || `adapters[${index}]`}.franchise`, errors);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) errors.push(`${id || `adapters[${index}]`} has unsafe id`);
    if (ids.has(id)) errors.push(`duplicate adapter ${id}`);
    ids.add(id);
    if (scopeIds.has(scopeId)) errors.push(`scope ${scopeId} has multiple adapter contracts`);
    scopeIds.add(scopeId);
    if (!ADAPTER_STATUSES.has(adapter.status)) errors.push(`${id} has invalid status ${adapter.status}`);
    if (adapter.certification_effect !== false) errors.push(`${id} may not certify or activate an estate`);

    const estate = estates.get(estateId);
    const scope = scopeMap.get(scopeId);
    if (!estate) errors.push(`${id} references unknown estate ${estateId}`);
    if (!scope) errors.push(`${id} references unknown scope ${scopeId}`);
    if (estate && estate.autopilot_scope !== scopeId) errors.push(`${id} estate/scope link drifted`);
    if (scope?.coverage_match?.franchise !== franchise) errors.push(`${id} franchise does not match scope coverage`);

    const hosts = Array.isArray(adapter.source_hosts) ? adapter.source_hosts : [];
    if (!hosts.length || new Set(hosts).size !== hosts.length) errors.push(`${id} source_hosts must be unique and non-empty`);
    if (estate && hosts.some((host) => !estate.source_hosts.includes(host))) errors.push(`${id} declares a host outside estate custody`);

    const command = requireObject(adapter.command, `${id}.command`, errors);
    requireString(command.executable, `${id}.command.executable`, errors);
    if (!Array.isArray(command.args) || !command.args.length) errors.push(`${id}.command.args must be non-empty`);
    const declaredCommand = commandKey(command);
    const scopeCommands = scopeRefreshCommands(scope?.refresh).map(commandKey);
    if (scope && !scopeCommands.includes(declaredCommand)) errors.push(`${id} command is not a declared scope refresh command`);

    const producerFiles = Array.isArray(adapter.producer_files) ? adapter.producer_files : [];
    if (!producerFiles.length || new Set(producerFiles).size !== producerFiles.length) errors.push(`${id} producer_files must be unique and non-empty`);
    const certifiedFiles = new Set(scope?.certification?.producer_files || []);
    for (const file of producerFiles) {
      if (!certifiedFiles.has(file)) errors.push(`${id} producer file ${file} is outside scope certification custody`);
      if (!existsSync(path.join(root, file))) errors.push(`${id} producer file ${file} is missing`);
    }

    const output = requireObject(adapter.output_contract, `${id}.output_contract`, errors);
    if (output.manifest_path !== "data/CENSUS-MANIFEST.json") errors.push(`${id} output manifest path drifted`);
    if (output.require_exact_revision_receipt !== true) errors.push(`${id} must require exact revision receipts`);
    if (output.collapse_duplicate_source_revisions !== true) errors.push(`${id} must collapse duplicate source revisions`);
    if (!Array.isArray(adapter.semantic_controls) || !adapter.semantic_controls.length) errors.push(`${id} lacks semantic controls`);
    requireString(adapter.next_gate, `${id}.next_gate`, errors);
  }
  return errors;
}

export function evaluateAdapter(adapter, manifest) {
  const rows = (manifest?.observations || []).filter((row) => row.franchise === adapter.franchise);
  const receiptFields = [
    adapter.output_contract.source_field,
    adapter.output_contract.page_id_field,
    adapter.output_contract.revision_field,
    adapter.output_contract.content_hash_field,
    adapter.output_contract.observed_at_field,
  ];
  const missing = Object.fromEntries(receiptFields.map((field) => [field, 0]));
  let invalidContentHashes = 0;
  let hostMismatches = 0;
  let unsafeSources = 0;
  const allowedHosts = new Set(adapter.source_hosts);
  const exactRows = [];

  for (const row of rows) {
    for (const field of receiptFields) if (!present(row[field])) missing[field] += 1;
    if (present(row.content_sha256) && !HASH_RE.test(String(row.content_sha256))) invalidContentHashes += 1;
    const host = hostForSource(row.source);
    if (!host) unsafeSources += 1;
    else if (!allowedHosts.has(host)) hostMismatches += 1;
    if (receiptFields.every((field) => present(row[field])) && HASH_RE.test(String(row.content_sha256 || "")) && host && allowedHosts.has(host)) exactRows.push(row);
  }

  const identities = new Set(exactRows.map(receiptKey));
  const missingTotal = Object.values(missing).reduce((sum, value) => sum + value, 0);
  let terminalState = "regeneration-required";
  if (rows.length && (missingTotal || invalidContentHashes || hostMismatches || unsafeSources)) terminalState = "receipt-repair-required";
  else if (rows.length && adapter.status === "certified-reference") terminalState = "reference-receipts-current";
  else if (rows.length) terminalState = "exact-receipts-present-semantic-review-required";

  return {
    adapter_id: adapter.id,
    scope_id: adapter.scope_id,
    estate_id: adapter.estate_id,
    franchise: adapter.franchise,
    declared_status: adapter.status,
    observation_rows: rows.length,
    exact_receipt_rows: exactRows.length,
    unique_source_revisions: identities.size,
    duplicate_category_facets: Math.max(0, exactRows.length - identities.size),
    categories: [...new Set(rows.map((row) => String(row.category || "<missing>")))].sort(),
    dispositions: countBy(rows, "disposition"),
    missing_receipt_fields: missing,
    invalid_content_hashes: invalidContentHashes,
    unsafe_sources: unsafeSources,
    source_host_mismatches: hostMismatches,
    latest_observed_at: observedAt(rows, manifest?.captured_at),
    terminal_state: terminalState,
    semantic_controls: [...adapter.semantic_controls],
    certification_authorized: false,
    next_gate: adapter.next_gate,
  };
}

export function buildAdapterBaseline({ registry, registryRaw, estateRegistry, estateRaw, scopes, scopesRaw, manifest, manifestRaw, root = process.cwd() }) {
  const errors = validateAdapterRegistry({ registry, estateRegistry, scopes, root });
  if (errors.length) throw new Error(errors.join("\n"));
  const adapters = registry.adapters.map((adapter) => evaluateAdapter(adapter, manifest));
  return {
    version: 1,
    operation: "adapter-sdk-baseline",
    generated_at: observedAt(manifest?.observations || [], manifest?.captured_at),
    inputs: {
      adapter_registry: { path: "data/CENSUS-ADAPTERS.json", sha256: sha256(registryRaw) },
      estate_registry: { path: "data/ESTATE-REGISTRY.json", sha256: sha256(estateRaw) },
      autopilot_scopes: { path: "data/AUTOPILOT-SCOPES.json", sha256: sha256(scopesRaw) },
      census_manifest: { path: "data/CENSUS-MANIFEST.json", sha256: sha256(manifestRaw) },
    },
    adapters,
    summary: {
      adapter_count: adapters.length,
      certified_reference_count: adapters.filter((row) => row.declared_status === "certified-reference").length,
      review_candidate_count: adapters.filter((row) => row.declared_status === "review-candidate").length,
      regeneration_required: adapters.filter((row) => row.terminal_state === "regeneration-required").map((row) => row.adapter_id),
      receipt_repair_required: adapters.filter((row) => row.terminal_state === "receipt-repair-required").map((row) => row.adapter_id),
      semantic_review_required: adapters.filter((row) => row.terminal_state === "exact-receipts-present-semantic-review-required").map((row) => row.adapter_id),
    },
    boundary: {
      network_access: false,
      source_refresh_executed: false,
      adapter_certification_created: false,
      estate_activated: false,
      luna_lease_issued: false,
      canonical_content_mutated: false,
      roadmap_milestone_completed: false,
    },
  };
}

function readJsonWithRaw(root, relative) {
  const file = path.join(root, relative);
  const raw = readFileSync(file);
  return { value: JSON.parse(raw), raw };
}
function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

async function cli() {
  const args = process.argv.slice(2);
  const command = args.shift() || "check";
  const root = path.resolve(option(args, "--root", "."));
  const output = option(args, "--output", DEFAULT_OUTPUT);
  const registry = readJsonWithRaw(root, "data/CENSUS-ADAPTERS.json");
  const estates = readJsonWithRaw(root, "data/ESTATE-REGISTRY.json");
  const scopes = readJsonWithRaw(root, "data/AUTOPILOT-SCOPES.json");
  const manifest = readJsonWithRaw(root, "data/CENSUS-MANIFEST.json");
  const report = buildAdapterBaseline({
    registry: registry.value,
    registryRaw: registry.raw,
    estateRegistry: estates.value,
    estateRaw: estates.raw,
    scopes: scopes.value,
    scopesRaw: scopes.raw,
    manifest: manifest.value,
    manifestRaw: manifest.raw,
    root,
  });
  const bytes = stableJson(report);
  const outputPath = path.join(root, output);

  if (command === "write") {
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, bytes);
    console.log(`adapter-sdk: wrote ${output}; adapters=${report.summary.adapter_count}`);
  } else if (command === "check") {
    if (!existsSync(outputPath)) throw new Error(`${output} is missing; run adapter:write`);
    const current = readFileSync(outputPath, "utf8");
    if (current !== bytes) throw new Error(`${output} is stale; run adapter:write`);
    console.log(`adapter-sdk: PASS — ${report.summary.adapter_count} adapter contracts and exact baseline`);
  } else if (command === "status") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    throw new Error("usage: census-adapter.mjs write|check|status [--root path] [--output path]");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli().catch((error) => {
    console.error(`adapter-sdk: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
