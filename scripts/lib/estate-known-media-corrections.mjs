import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const GENERIC_LEDGER_PATHS = Object.freeze([
  "data/review/sitewide-media-correction-2026-07-25.json",
  "data/review/sitewide-actor-origin-vlm-correction-2026-07-25.json",
  "data/review/sitewide-near-duplicate-correction-2026-07-25.json",
]);

const FERENGI_LEDGER_PATH = "data/review/ferengi-gold/final-portraits-correction-2026-07-25.json";

const FERENGI_REJECTED_PATHS = Object.freeze({
  "UC-1295": "images/uc-1295-portrait.png",
  "UC-1296": "images/uc-1296-portrait.jpg",
  "UC-1297": "images/uc-1297-portrait.png",
  "UC-1298": "images/uc-1298-portrait.png",
  "UC-1304": "images/uc-1304-portrait.jpg",
  "UC-1305": "images/uc-1305-portrait.webp",
  "UC-1306": "images/uc-1306-portrait.jpg",
  "UC-1310": "images/uc-1310-portrait.png",
  "UC-1311": "images/uc-1311-portrait.jpg",
  "UC-1313": "images/uc-1313-portrait.png",
});

const DEFAULT_PATHS = Object.freeze({
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
  report: "data/review/estate-debt/COLLECT-001-KNOWN-MEDIA-CORRECTIONS-APPLY.json",
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
const keyFor = (row) => `${row.id}/${row.side}`;

function assertSafeRelativePath(value, label) {
  const text = String(value || "");
  if (!text || path.isAbsolute(text) || text.split(/[\\/]+/).includes("..")) throw new Error(`${label} must be a safe repository-relative path`);
  return text.replaceAll("\\", "/");
}

async function readJson(root, relativePath) {
  const safe = assertSafeRelativePath(relativePath, "JSON path");
  const absolute = path.join(root, safe);
  const bytes = await readFile(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch (error) { throw new Error(`cannot parse ${safe}: ${error.message}`); }
  return { path: safe, absolute, bytes, value, sha256: sha256(bytes) };
}

function validatePlanEntry(entry) {
  if (!/^UC-\d+$/.test(entry.id || "")) throw new Error(`invalid correction id ${JSON.stringify(entry.id)}`);
  if (!new Set(["still", "portrait"]).has(entry.side)) throw new Error(`invalid correction side for ${entry.id}`);
  entry.preserved_path = assertSafeRelativePath(entry.preserved_path, `${keyFor(entry)} preserved_path`);
  if (!/^[0-9a-f]{64}$/i.test(entry.sha256 || "")) throw new Error(`${keyFor(entry)} lacks an exact SHA-256`);
  if (!String(entry.ruling || "").trim()) throw new Error(`${keyFor(entry)} lacks a correction ruling`);
  return entry;
}

export async function loadKnownMediaCorrectionPlan({ root = process.cwd() } = {}) {
  const resolvedRoot = path.resolve(root);
  const rows = [];
  for (const ledgerPath of GENERIC_LEDGER_PATHS) {
    const ledger = await readJson(resolvedRoot, ledgerPath);
    if (!Array.isArray(ledger.value.items)) throw new Error(`${ledgerPath} lacks items[]`);
    for (const item of ledger.value.items) {
      rows.push(validatePlanEntry({
        id: item.id,
        side: item.side,
        preserved_path: item.preserved_path,
        sha256: item.sha256,
        ruling: item.ruling || ledger.value.action,
        ledger: ledgerPath,
      }));
    }
  }

  const ferengi = await readJson(resolvedRoot, FERENGI_LEDGER_PATH);
  if (!Array.isArray(ferengi.value.entries)) throw new Error(`${FERENGI_LEDGER_PATH} lacks entries[]`);
  for (const entry of ferengi.value.entries) {
    const preservedPath = FERENGI_REJECTED_PATHS[entry.id];
    if (!preservedPath) throw new Error(`no rejected portrait path is filed for ${entry.id}`);
    rows.push(validatePlanEntry({
      id: entry.id,
      side: "portrait",
      preserved_path: preservedPath,
      sha256: entry.rejected_sha256,
      ruling: entry.observed_content,
      ledger: FERENGI_LEDGER_PATH,
    }));
  }

  const byKey = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    if (byKey.has(key)) throw new Error(`duplicate correction obligation ${key}`);
    byKey.set(key, row);
  }
  if (rows.length !== 71) throw new Error(`known-media correction denominator drifted: expected 71, found ${rows.length}`);
  if (ferengi.value.entries.length !== 10) throw new Error(`Ferengi correction denominator drifted: expected 10, found ${ferengi.value.entries.length}`);
  return rows.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }) || a.side.localeCompare(b.side));
}

function collectRecords(value, rows = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectRecords(item, rows);
    return rows;
  }
  if (!value || typeof value !== "object") return rows;
  if (typeof value.id === "string") {
    rows.push(value);
    return rows;
  }
  for (const item of Object.values(value)) collectRecords(item, rows);
  return rows;
}

function inspectAndMutateDocument(document, plan, label) {
  const records = collectRecords(document);
  const byId = new Map();
  for (const record of records) {
    if (!byId.has(record.id)) byId.set(record.id, []);
    byId.get(record.id).push(record);
  }
  const outcomes = [];
  for (const obligation of plan) {
    const matches = byId.get(obligation.id) || [];
    if (!matches.length) throw new Error(`${label} has no record for ${obligation.id}`);
    let exact = 0;
    let alreadyNull = 0;
    const drift = [];
    for (const record of matches) {
      const binding = record[obligation.side];
      if (binding == null) {
        alreadyNull++;
        continue;
      }
      if (binding?.src !== obligation.preserved_path) {
        drift.push(binding?.src || `<non-object:${typeof binding}>`);
        continue;
      }
      exact++;
    }
    if (drift.length) {
      throw new Error(`${label} ${keyFor(obligation)} drifted from ${obligation.preserved_path}: ${[...new Set(drift)].join(", ")}`);
    }
    if (!exact && !alreadyNull) throw new Error(`${label} ${keyFor(obligation)} has no nullable binding`);
    for (const record of matches) if (record[obligation.side]?.src === obligation.preserved_path) record[obligation.side] = null;
    outcomes.push({
      id: obligation.id,
      side: obligation.side,
      exact_bindings_nulled: exact,
      already_null_rows: alreadyNull,
      record_rows: matches.length,
      state: exact ? "collected" : "already-collected",
    });
  }
  return outcomes;
}

async function verifyPreservedAssets(root, plan) {
  const cache = new Map();
  const rows = [];
  for (const obligation of plan) {
    let receipt = cache.get(obligation.preserved_path);
    if (!receipt) {
      const absolute = path.join(root, obligation.preserved_path);
      let bytes;
      try { bytes = await readFile(absolute); }
      catch (error) { throw new Error(`${keyFor(obligation)} preserved asset unavailable at ${obligation.preserved_path}: ${error.message}`); }
      receipt = { path: obligation.preserved_path, sha256: sha256(bytes), bytes: bytes.length };
      cache.set(obligation.preserved_path, receipt);
    }
    if (receipt.sha256 !== obligation.sha256.toLowerCase()) {
      throw new Error(`${keyFor(obligation)} preserved asset hash drift at ${obligation.preserved_path}: expected ${obligation.sha256}, found ${receipt.sha256}`);
    }
    rows.push({ id: obligation.id, side: obligation.side, ...receipt });
  }
  return rows;
}

async function pathExists(absolutePath) {
  try { await access(absolutePath); return true; }
  catch { return false; }
}

async function atomicWriteTransaction(entries) {
  const token = `${process.pid}-${Date.now()}`;
  const prepared = [];
  for (const entry of entries) {
    await mkdir(path.dirname(entry.absolute), { recursive: true });
    const temp = `${entry.absolute}.tmp.${token}`;
    await writeFile(temp, entry.bytes);
    prepared.push({ ...entry, temp, backup: `${entry.absolute}.bak.${token}`, existed: await pathExists(entry.absolute) });
  }
  const installed = [];
  try {
    for (const entry of prepared) {
      if (entry.existed) await rename(entry.absolute, entry.backup);
      await rename(entry.temp, entry.absolute);
      installed.push(entry);
    }
    for (const entry of installed) if (entry.existed) await rm(entry.backup, { force: true });
  } catch (error) {
    for (const entry of installed.reverse()) {
      await rm(entry.absolute, { force: true }).catch(() => {});
      if (entry.existed) await rename(entry.backup, entry.absolute).catch(() => {});
    }
    for (const entry of prepared) await rm(entry.temp, { force: true }).catch(() => {});
    throw error;
  }
}

export async function applyKnownMediaCorrectionPlan({
  root = process.cwd(),
  plan,
  write = false,
  specimensPath = DEFAULT_PATHS.specimens,
  sourcesPath = DEFAULT_PATHS.sources,
  reportPath = DEFAULT_PATHS.report,
  now = new Date().toISOString(),
} = {}) {
  const resolvedRoot = path.resolve(root);
  if (!Array.isArray(plan) || !plan.length) throw new Error("correction plan must be a non-empty array");
  const normalizedPlan = plan.map((row) => validatePlanEntry({ ...row }));
  const unique = new Set(normalizedPlan.map(keyFor));
  if (unique.size !== normalizedPlan.length) throw new Error("correction plan contains duplicate id/side obligations");

  const [specimens, sources, assets] = await Promise.all([
    readJson(resolvedRoot, specimensPath),
    readJson(resolvedRoot, sourcesPath),
    verifyPreservedAssets(resolvedRoot, normalizedPlan),
  ]);
  if (!Array.isArray(specimens.value)) throw new Error(`${specimens.path} must contain an array`);
  if (!Array.isArray(sources.value)) throw new Error(`${sources.path} must contain an array`);

  const specimensOutcomes = inspectAndMutateDocument(specimens.value, normalizedPlan, "specimens");
  const sourcesOutcomes = inspectAndMutateDocument(sources.value, normalizedPlan, "SOURCES");
  const specimensBytes = jsonBytes(specimens.value);
  const sourcesBytes = jsonBytes(sources.value);
  const outcomeByKey = new Map();
  for (const row of specimensOutcomes) outcomeByKey.set(keyFor(row), { specimens: row });
  for (const row of sourcesOutcomes) outcomeByKey.set(keyFor(row), { ...(outcomeByKey.get(keyFor(row)) || {}), sources: row });

  const obligations = normalizedPlan.map((obligation) => ({
    ...obligation,
    preserved_asset: assets.find((row) => row.id === obligation.id && row.side === obligation.side),
    specimens: outcomeByKey.get(keyFor(obligation))?.specimens,
    sources: outcomeByKey.get(keyFor(obligation))?.sources,
  }));
  const collected = obligations.filter((row) => row.specimens.exact_bindings_nulled + row.sources.exact_bindings_nulled > 0).length;
  const alreadyCollected = obligations.length - collected;
  const report = {
    version: 1,
    transaction: "COLLECT-001",
    operation: "known-invalid-media-binding-nullification",
    generated_at: now,
    mode: write ? "write" : "dry-run",
    source: {
      specimens: { path: specimens.path, before_sha256: specimens.sha256, after_sha256: sha256(specimensBytes) },
      sources: { path: sources.path, before_sha256: sources.sha256, after_sha256: sha256(sourcesBytes) },
    },
    denominator: { obligations: obligations.length, collected, already_collected: alreadyCollected },
    invariants: {
      exact_id_side_only: true,
      exact_bound_path_required: true,
      preserved_file_sha256_required: true,
      unexpected_current_binding_fails_closed: true,
      historical_image_bytes_retained: true,
      canonical_replacements_selected: 0,
      media_audit_rebuild_required: true,
      serving_projection_rebuild_required: true,
      complete_gate_required: true,
    },
    obligations,
  };

  if (write) {
    const reportSafe = assertSafeRelativePath(reportPath, "report path");
    await atomicWriteTransaction([
      { absolute: specimens.absolute, bytes: specimensBytes },
      { absolute: sources.absolute, bytes: sourcesBytes },
      { absolute: path.join(resolvedRoot, reportSafe), bytes: jsonBytes(report) },
    ]);
  }
  return report;
}

export async function collectKnownMediaCorrections(options = {}) {
  const plan = options.plan || await loadKnownMediaCorrectionPlan({ root: options.root });
  return applyKnownMediaCorrectionPlan({ ...options, plan });
}

export const KNOWN_MEDIA_CORRECTION_DEFAULTS = Object.freeze({
  generic_ledgers: GENERIC_LEDGER_PATHS,
  ferengi_ledger: FERENGI_LEDGER_PATH,
  paths: DEFAULT_PATHS,
});
