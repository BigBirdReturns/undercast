#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import {
  currentVerifiedSnapshot,
  sha256,
  sourceKey,
  stableJson,
  validateSnapshotRegistry,
  scopeReceiptRows,
} from './lib/preservation.mjs';

function option(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value`);
  return value;
}
const flag = (name) => process.argv.includes(`--${name}`);
const registryPath = option('registry', 'preservation/SNAPSHOTS.json');
const manifestPath = option('manifest', 'data/CENSUS-MANIFEST.json');
const baselinePath = option('baseline', 'preservation/baseline-manifest.json');
const coveragePath = option('coverage', 'data/CENSUS-COVERAGE.json');
const scopesPath = option('scopes', 'data/AUTOPILOT-SCOPES.json');

const [registryBytes, manifestBytes, baselineBytes, coverageBytes, scopesBytes] = await Promise.all([
  readFile(registryPath), readFile(manifestPath), readFile(baselinePath), readFile(coveragePath), readFile(scopesPath),
]);
const registry = JSON.parse(registryBytes);
const manifest = JSON.parse(manifestBytes);
const coverage = JSON.parse(coverageBytes);
const scopesDoc = JSON.parse(scopesBytes);
const scopes = Array.isArray(scopesDoc) ? scopesDoc : scopesDoc.scopes;
validateSnapshotRegistry(registry);
const censusManifestSha256 = sha256(manifestBytes);
const baselineManifestSha256 = sha256(baselineBytes);
if (registry.history_guard.baseline_manifest_sha256 !== baselineManifestSha256) {
  throw new Error(`history guard pins ${registry.history_guard.baseline_manifest_sha256}, current baseline manifest is ${baselineManifestSha256}`);
}
const current = currentVerifiedSnapshot(registry, { censusManifestSha256, baselineManifestSha256 });
const coverageSources = new Map();
for (const row of coverage) {
  const source = sourceKey(row?.source);
  if (!source) continue;
  if (!coverageSources.has(row.franchise)) coverageSources.set(row.franchise, new Set());
  coverageSources.get(row.franchise).add(source);
}
const scopeState = [];
for (const scope of scopes || []) {
  const franchise = scope?.coverage_match?.franchise;
  const sources = coverageSources.get(franchise) || new Set();
  if (!sources.size) continue;
  const receipts = scopeReceiptRows(manifest, franchise, sources);
  const manifestSha256 = sha256(stableJson(receipts));
  const archived = registry.snapshots.some((snapshot) => ['pending', 'verified'].includes(snapshot.status)
    && snapshot.scopes?.[scope.id]?.manifest_sha256 === manifestSha256
    && snapshot.public_release?.assets?.some((asset) => asset.kind === 'source-bag'));
  scopeState.push({ scope_id: scope.id, franchise, sources: sources.size, manifest_sha256: manifestSha256, archived });
}
const originalCopy = registry.snapshots.some((snapshot) => snapshot.status === 'verified'
  && snapshot.baseline_manifest_sha256 === baselineManifestSha256
  && snapshot.independent_copies?.some((copy) => copy.kind === 'originals-bag'));
const result = {
  registry: registryPath,
  census_manifest_sha256: censusManifestSha256,
  baseline_manifest_sha256: baselineManifestSha256,
  current_verified_snapshot: current?.id || null,
  history_guard: {
    ...registry.history_guard,
    independent_originals_copy_verified: originalCopy,
  },
  scopes: scopeState,
};
if (flag('require-current') && !current) throw new Error('no verified preservation snapshot matches the current census and baseline manifests');
if (flag('require-scope-archives')) {
  const missing = scopeState.filter((row) => scopes.find((scope) => scope.id === row.scope_id)?.status === 'active' && !row.archived);
  if (missing.length) throw new Error(`active scopes lack current public source evidence: ${missing.map((row) => row.scope_id).join(', ')}`);
}
if (flag('require-originals-offsite') && !originalCopy) throw new Error('pre-R1 originals have no verified independent preservation copy');
if (flag('json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`preservation: current=${result.current_verified_snapshot || 'none'}; history-guard=${registry.history_guard.status}; originals-offsite=${originalCopy ? 'yes' : 'no'}`);
  for (const row of scopeState) console.log(`  ${row.scope_id}: ${row.sources} sources; archived=${row.archived ? 'yes' : 'no'}; manifest=${row.manifest_sha256.slice(0, 12)}`);
}
