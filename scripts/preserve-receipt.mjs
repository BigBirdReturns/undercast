#!/usr/bin/env node
import { readFile, writeFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { sha256, validateSnapshotRegistry } from './lib/preservation.mjs';

function option(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`--${name} requires a value`);
  return value;
}
const registryPath = option('registry', 'preservation/SNAPSHOTS.json');
const sourceReceiptPath = option('source-receipt');
const originalsReceiptPath = option('originals-receipt');
const baselinePath = option('baseline', 'preservation/baseline-manifest.json');
const repositorySnapshotPath = option('repository-snapshot');
const sourceArchivePath = option('source-archive');
const releaseTag = option('release-tag');
const repository = option('repository', process.env.GITHUB_REPOSITORY || 'BigBirdReturns/undercast');
const repositoryCommit = option('repository-commit', process.env.GITHUB_SHA);
const workflowRun = option('workflow-run', process.env.GITHUB_RUN_ID || null);
if (!sourceReceiptPath || !repositorySnapshotPath || !sourceArchivePath || !releaseTag || !repositoryCommit) {
  throw new Error('preserve-receipt requires --source-receipt, --repository-snapshot, --source-archive, --release-tag, and --repository-commit');
}
if (!/^[0-9a-f]{40}$/i.test(repositoryCommit)) throw new Error('--repository-commit must be a 40-hex git sha');
const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const source = JSON.parse(await readFile(sourceReceiptPath, 'utf8'));
let originals;
if (originalsReceiptPath) originals = JSON.parse(await readFile(originalsReceiptPath, 'utf8'));
else {
  const baselineBytes = await readFile(baselinePath);
  const baseline = JSON.parse(baselineBytes);
  originals = {
    baseline_manifest_sha256: sha256(baselineBytes),
    originals: baseline.counts?.originals_recoverable ?? baseline.assets?.filter((row) => row.original).length ?? 0,
    payload_bytes: baseline.bytes?.originals_total ?? 0,
  };
}
const asset = async (path, kind) => ({
  kind,
  name: basename(path),
  url: `https://github.com/${repository}/releases/download/${releaseTag}/${basename(path)}`,
  sha256: sha256(await readFile(path)),
  bytes: (await stat(path)).size,
});
const publicAssets = [await asset(sourceArchivePath, 'source-bag'), await asset(repositorySnapshotPath, 'repository-snapshot')];
const record = {
  id: releaseTag,
  status: 'pending',
  created_at: source.created_at,
  repository_commit: repositoryCommit,
  census_manifest_sha256: source.census_manifest_sha256,
  baseline_manifest_sha256: originals.baseline_manifest_sha256,
  counts: {
    census_observations: source.observations,
    exact_source_revisions: source.exact_revisions,
    unique_source_urls: source.unique_source_urls,
    source_payload_bytes: source.payload_bytes,
    original_assets: originals.originals,
    original_payload_bytes: originals.payload_bytes,
  },
  scopes: source.scopes,
  public_release: {
    tag: releaseTag,
    url: `https://github.com/${repository}/releases/tag/${releaseTag}`,
    assets: publicAssets,
  },
  independent_copies: [],
  verification: {
    workflow_run: workflowRun ? String(workflowRun) : null,
    source_bag_verified: true,
    originals_bag_verified: Boolean(originalsReceiptPath),
    exact_source_failures: 0,
  },
};
const index = registry.snapshots.findIndex((row) => row.id === record.id);
if (index >= 0) registry.snapshots[index] = record;
else registry.snapshots.push(record);
registry.snapshots.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
registry.updated_at = new Date().toISOString();
validateSnapshotRegistry(registry);
await writeFile(registryPath, JSON.stringify(registry, null, 2) + '\n');
console.log(`recorded pending preservation snapshot ${record.id}: ${source.exact_revisions} exact revisions, ${originals.originals} originals`);
