import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

export const PRESERVATION_REGISTRY_VERSION = 1;

export const SOURCE_API_BY_HOST = Object.freeze({
  'memory-alpha.fandom.com': 'https://memory-alpha.fandom.com/api.php',
  'tardis.fandom.com': 'https://tardis.fandom.com/api.php',
  'muppet.fandom.com': 'https://muppet.fandom.com/api.php',
  'powerrangers.fandom.com': 'https://powerrangers.fandom.com/api.php',
  'starwars.fandom.com': 'https://starwars.fandom.com/api.php',
  'ultra.fandom.com': 'https://ultra.fandom.com/api.php',
  'wikizilla.org': 'https://wikizilla.org/w/api.php',
});

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const sha256File = async (path) => sha256(await readFile(path));

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export const stableJson = (value) => JSON.stringify(stable(value));

export function sourceKey(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(value || '').trim();
  }
}

export function apiForSource(source) {
  let host;
  try { host = new URL(source).hostname.toLowerCase(); }
  catch { throw new Error(`invalid source URL ${source || '<missing>'}`); }
  const api = SOURCE_API_BY_HOST[host];
  if (!api) throw new Error(`no preservation adapter for source host ${host}`);
  return api;
}

function assertHash(value, label) {
  if (!/^[0-9a-f]{64}$/i.test(String(value || ''))) throw new Error(`${label} must be a sha256`);
  return String(value).toLowerCase();
}

function assertGitSha(value, label) {
  if (!/^[0-9a-f]{40}$/i.test(String(value || ''))) throw new Error(`${label} must be a 40-hex git sha`);
  return String(value).toLowerCase();
}

function assertInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

export function collapseSourceObservations(manifest, { franchise = null } = {}) {
  const observations = Array.isArray(manifest) ? manifest : manifest?.observations;
  if (!Array.isArray(observations)) throw new Error('CENSUS-MANIFEST must contain observations[]');
  const selected = franchise ? observations.filter((row) => row.franchise === franchise) : observations;
  const byIdentity = new Map();
  for (const [index, row] of selected.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`observation ${index} must be an object`);
    const source = sourceKey(row.source);
    const api = apiForSource(source);
    const pageid = assertInteger(row.pageid, `observation ${index}.pageid`);
    const revision = assertInteger(row.revision, `observation ${index}.revision`);
    const contentSha256 = assertHash(row.content_sha256, `observation ${index}.content_sha256`);
    if (!Number.isFinite(Date.parse(row.timestamp || ''))) throw new Error(`observation ${index}.timestamp is invalid`);
    const identity = `${api}\0${revision}\0${contentSha256}`;
    const existing = byIdentity.get(identity);
    const facet = {
      franchise: String(row.franchise || ''),
      category: String(row.category || ''),
      title: String(row.title || ''),
      source,
      disposition: String(row.disposition || ''),
      observed_at: row.observed_at || null,
    };
    if (existing) {
      if (existing.pageid !== pageid) throw new Error(`revision ${revision} on ${api} maps to multiple page ids`);
      existing.facets.push(facet);
      continue;
    }
    const archiveId = sha256(`${api}\n${revision}\n${contentSha256}`);
    const host = new URL(api).hostname.toLowerCase();
    byIdentity.set(identity, {
      archive_id: archiveId,
      path: `data/sources/${host}/${archiveId.slice(0, 2)}/${archiveId}.wikitext`,
      api,
      host,
      pageid,
      revision,
      timestamp: row.timestamp,
      content_sha256: contentSha256,
      facets: [facet],
    });
  }
  return [...byIdentity.values()].map((row) => ({
    ...row,
    facets: row.facets.sort((a, b) => stableJson(a).localeCompare(stableJson(b))),
  })).sort((a, b) => a.api.localeCompare(b.api) || a.revision - b.revision || a.archive_id.localeCompare(b.archive_id));
}

export function scopeReceiptRows(manifest, franchise, sourceUrls = null) {
  const observations = Array.isArray(manifest) ? manifest : manifest?.observations;
  if (!Array.isArray(observations)) throw new Error('CENSUS-MANIFEST must contain observations[]');
  const allowed = sourceUrls ? new Set([...sourceUrls].map(sourceKey)) : null;
  return observations
    .filter((row) => row?.franchise === franchise && (!allowed || allowed.has(sourceKey(row.source))))
    .map((row) => stable({
      source: sourceKey(row.source),
      pageid: row.pageid ?? null,
      revision: row.revision ?? null,
      timestamp: row.timestamp || '',
      content_sha256: String(row.content_sha256 || '').toLowerCase(),
      disposition: row.disposition || '',
      category: row.category || '',
      title: row.title || '',
    }))
    .sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
}

export function rightsClass(asset) {
  const license = String(asset?.license || '').toLowerCase();
  if (/\bcc0\b|public domain|\bpd\b|cc[- ]?by(?:[- ]?sa)?/.test(license)) return 'free';
  return 'copyright-or-unknown';
}

export function parseManifest(text, label = 'manifest') {
  const rows = [];
  for (const [index, line] of String(text).split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const match = line.match(/^([0-9a-f]{64})  (.+)$/i);
    if (!match) throw new Error(`${label}:${index + 1} is not a sha256 manifest row`);
    const path = match[2].replace(/\\/g, '/');
    if (!path || path.startsWith('/') || path.split('/').includes('..')) throw new Error(`${label}:${index + 1} has unsafe path ${path}`);
    rows.push({ sha256: match[1].toLowerCase(), path });
  }
  return rows;
}

async function walk(root, dir = root) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, path));
    else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'));
    else throw new Error(`bag contains unsupported filesystem entry ${path}`);
  }
  return files.sort();
}

export async function verifyBag(root) {
  const absolute = resolve(root);
  const bagit = await readFile(join(absolute, 'bagit.txt'), 'utf8');
  if (bagit !== 'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n') throw new Error('bagit.txt is not the canonical BagIt 1.0 header');
  const payload = parseManifest(await readFile(join(absolute, 'manifest-sha256.txt'), 'utf8'), 'manifest-sha256.txt');
  const tags = parseManifest(await readFile(join(absolute, 'tagmanifest-sha256.txt'), 'utf8'), 'tagmanifest-sha256.txt');
  const payloadPaths = new Set(payload.map((row) => row.path));
  const tagPaths = new Set(tags.map((row) => row.path));
  if (payloadPaths.size !== payload.length) throw new Error('payload manifest contains duplicate paths');
  if (tagPaths.size !== tags.length) throw new Error('tag manifest contains duplicate paths');
  if (!tagPaths.has('manifest-sha256.txt')) throw new Error('tag manifest must hash manifest-sha256.txt');
  for (const row of [...payload, ...tags]) {
    const path = resolve(absolute, row.path);
    if (!path.startsWith(`${absolute}${sep}`)) throw new Error(`bag path escapes root: ${row.path}`);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) throw new Error(`bag file missing: ${row.path}`);
    const got = await sha256File(path);
    if (got !== row.sha256) throw new Error(`bag hash mismatch for ${row.path}: expected ${row.sha256}, got ${got}`);
  }
  const actualPayload = (await walk(join(absolute, 'data'))).map((path) => `data/${path}`);
  const unmanifested = actualPayload.filter((path) => !payloadPaths.has(path));
  const missingPayload = [...payloadPaths].filter((path) => !actualPayload.includes(path));
  if (unmanifested.length || missingPayload.length) {
    throw new Error(`payload inventory mismatch: unmanifested=${unmanifested.length}, missing=${missingPayload.length}`);
  }
  const bytes = await Promise.all(payload.map(async (row) => (await stat(join(absolute, row.path))).size));
  return {
    payload_files: payload.length,
    payload_bytes: bytes.reduce((sum, value) => sum + value, 0),
    tag_files: tags.length,
  };
}

export function validateSnapshotRegistry(doc) {
  if (!doc || doc.version !== PRESERVATION_REGISTRY_VERSION || !Array.isArray(doc.snapshots)) {
    throw new Error(`preservation/SNAPSHOTS.json must be version ${PRESERVATION_REGISTRY_VERSION} with snapshots[]`);
  }
  if (!doc.history_guard || typeof doc.history_guard !== 'object' || Array.isArray(doc.history_guard)) {
    throw new Error('preservation registry needs history_guard');
  }
  assertHash(doc.history_guard.baseline_manifest_sha256, 'history_guard.baseline_manifest_sha256');
  if (doc.history_guard.destructive_rewrite_authorized !== false) {
    throw new Error('history_guard.destructive_rewrite_authorized must remain false; preservation never authorizes history destruction');
  }
  if (doc.history_guard.precondition_met === true && doc.history_guard.status !== 'offsite-verified') {
    throw new Error('history guard precondition may be true only after offsite verification');
  }
  const ids = new Set();
  for (const [index, row] of doc.snapshots.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`snapshot ${index} must be an object`);
    if (!/^[a-z0-9][a-z0-9.-]+$/i.test(row.id || '')) throw new Error(`snapshot ${index} has invalid id`);
    if (ids.has(row.id)) throw new Error(`duplicate preservation snapshot ${row.id}`);
    ids.add(row.id);
    if (!['pending', 'verified', 'superseded'].includes(row.status)) throw new Error(`snapshot ${row.id} has invalid status`);
    assertGitSha(row.repository_commit, `snapshot ${row.id}.repository_commit`);
    assertHash(row.census_manifest_sha256, `snapshot ${row.id}.census_manifest_sha256`);
    assertHash(row.baseline_manifest_sha256, `snapshot ${row.id}.baseline_manifest_sha256`);
    if (!Number.isFinite(Date.parse(row.created_at || ''))) throw new Error(`snapshot ${row.id}.created_at is invalid`);
    if (['pending', 'verified'].includes(row.status)) {
      if (!row.public_release?.tag || !Array.isArray(row.public_release.assets) || row.public_release.assets.length < 2) {
        throw new Error(`${row.status} snapshot ${row.id} needs public release assets`);
      }
      const publicKinds = new Set();
      for (const asset of row.public_release.assets) {
        if (!asset.kind || !asset.name || !asset.url) throw new Error(`snapshot ${row.id} has incomplete public asset`);
        if (publicKinds.has(asset.kind)) throw new Error(`snapshot ${row.id} has duplicate public asset kind ${asset.kind}`);
        publicKinds.add(asset.kind);
        assertHash(asset.sha256, `snapshot ${row.id} public asset ${asset.name}.sha256`);
        assertInteger(asset.bytes, `snapshot ${row.id} public asset ${asset.name}.bytes`);
      }
      for (const required of ['source-bag', 'repository-snapshot']) {
        if (!publicKinds.has(required)) throw new Error(`snapshot ${row.id} lacks ${required} public asset`);
      }
    }
    if (!Array.isArray(row.independent_copies)) throw new Error(`snapshot ${row.id} independent_copies must be an array`);
    const copyKeys = new Set();
    for (const copy of row.independent_copies) {
      if (!['public-bundle', 'originals-bag'].includes(copy.kind)) throw new Error(`snapshot ${row.id} independent copy ${copy.name || '<unnamed>'} has invalid kind`);
      if (!copy.provider || !copy.file_id || !copy.name) throw new Error(`snapshot ${row.id} has incomplete independent copy`);
      const key = `${copy.provider}\0${copy.file_id}`;
      if (copyKeys.has(key)) throw new Error(`snapshot ${row.id} repeats independent copy ${copy.provider}/${copy.file_id}`);
      copyKeys.add(key);
      assertHash(copy.sha256, `snapshot ${row.id} independent copy ${copy.name}.sha256`);
      assertInteger(copy.bytes, `snapshot ${row.id} independent copy ${copy.name}.bytes`);
      if (!Number.isFinite(Date.parse(copy.verified_at || ''))) throw new Error(`snapshot ${row.id} independent copy ${copy.name}.verified_at is invalid`);
    }
    if (row.status === 'verified' && !row.independent_copies.some((copy) => copy.kind === 'public-bundle')) {
      throw new Error(`verified snapshot ${row.id} needs an independent public-bundle copy`);
    }
  }
  return true;
}

export function currentVerifiedSnapshot(doc, { censusManifestSha256, baselineManifestSha256 } = {}) {
  validateSnapshotRegistry(doc);
  return [...doc.snapshots].reverse().find((row) => row.status === 'verified'
    && (!censusManifestSha256 || row.census_manifest_sha256 === censusManifestSha256)
    && (!baselineManifestSha256 || row.baseline_manifest_sha256 === baselineManifestSha256)) || null;
}

export function scopePreservationReceipt(doc, scopeId, manifestSha256) {
  validateSnapshotRegistry(doc);
  for (const snapshot of [...doc.snapshots].reverse()) {
    if (!['pending', 'verified'].includes(snapshot.status)) continue;
    const scope = snapshot.scopes?.[scopeId];
    if (scope?.manifest_sha256 === manifestSha256 && snapshot.public_release?.assets?.some((asset) => asset.kind === 'source-bag')) {
      return { snapshot, scope };
    }
  }
  return null;
}
