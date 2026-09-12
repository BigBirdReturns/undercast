import assert from 'node:assert/strict';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';

export function routeIds(specimens, tombstones) {
  assert.ok(Array.isArray(specimens) && Array.isArray(tombstones.records), 'route inputs must be arrays');
  const live = new Set(specimens.map(row => row.id));
  const ids = [...specimens, ...tombstones.records].map(row => row.id);
  assert.ok(ids.every(id => /^UC-G?\d+$/.test(id)), 'invalid route ID');
  assert.equal(new Set(ids).size, ids.length, 'duplicate route ID');
  for (const row of tombstones.records) {
    assert.ok(['merged', 'removed'].includes(row.status), 'invalid tombstone disposition');
    if (row.status === 'merged') assert.ok(live.has(row.successor), 'merged successor must be live');
    else assert.ok(!row.successor, 'removed tombstone must not redirect');
  }
  return ids.sort();
}

export function assertRoutes({ recordsRoot, specimensPath, tombstonesPath }) {
  const specimens = JSON.parse(readFileSync(specimensPath, 'utf8'));
  const tombstones = JSON.parse(readFileSync(tombstonesPath, 'utf8'));
  const expected = routeIds(specimens, tombstones);
  assert.ok(!lstatSync(recordsRoot).isSymbolicLink(), 'symlink records root');
  const entries = readdirSync(recordsRoot, { withFileTypes: true });
  assert.ok(entries.every(entry => entry.isDirectory() && !entry.isSymbolicLink()), 'non-directory route');
  assert.deepEqual(entries.map(entry => entry.name).sort(), expected, `route-set check failed: expected ${expected.length} exact IDs`);
  for (const id of expected) {
    const dir = path.join(recordsRoot, id);
    assert.deepEqual(readdirSync(dir), ['index.html'], `unexpected route contents: ${id}`);
    const file = path.join(dir, 'index.html');
    assert.ok(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink(), `unsafe route ${id}`);
    const html = readFileSync(file, 'utf8');
    assert.ok(html.includes(id), `route identity absent: ${id}`);
    const tombstone = tombstones.records.find(row => row.id === id);
    if (tombstone?.status === 'merged') assert.ok(html.includes(`../${tombstone.successor}/`), `missing successor route: ${id}`);
    if (tombstone?.status === 'removed') assert.ok(!/<meta[^>]+http-equiv=["']refresh/i.test(html), `removed route redirects: ${id}`);
  }
  return expected;
}
