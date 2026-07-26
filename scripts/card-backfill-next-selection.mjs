#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const OUT = process.env.OUT || '/tmp/card-backfill-next-selection';
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const idNum = (id) => Number(String(id || '').match(/\d+/)?.[0] || Number.MAX_SAFE_INTEGER);

const [audit, specimens] = await Promise.all([
  readJson('data/MEDIA-AUDIT.json'),
  readJson('data/specimens.json'),
]);
const specimenById = new Map(specimens.map((row) => [row.id, row]));

const completed = new Set();
try {
  for (const name of await readdir('data/review/card-backfill', { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    try {
      const review = await readJson(join('data/review/card-backfill', name.name, 'review.json'));
      if (review?.record_id || review?.id) completed.add(review.record_id || review.id);
    } catch {}
  }
} catch {}

const candidates = [];
for (const item of audit.items || []) {
  if (item.scope !== 'sitewide') continue;
  if (item.status !== 'absent') continue;
  if (!['still', 'portrait'].includes(item.side)) continue;
  if (completed.has(item.wall_id)) continue;
  const record = specimenById.get(item.wall_id);
  if (!record) continue;
  candidates.push({
    wall_id: item.wall_id,
    side: item.side,
    audit_id: item.id,
    actor: record.actor,
    character: record.character,
    production: record.production,
    universe: record.universe,
    years: record.years || '',
    canonical_link: record.link || '',
    expected_subject: item.expected_subject,
    source_fetched_at: item.source_fetched_at || null,
    risk_codes: item.risk_codes || [],
    references: record.references || [],
    current_asset: record[item.side] || null,
  });
}

candidates.sort((a, b) =>
  idNum(a.wall_id) - idNum(b.wall_id)
  || (a.side === b.side ? 0 : a.side === 'still' ? -1 : 1)
  || a.wall_id.localeCompare(b.wall_id)
);

if (!candidates.length) throw new Error('No remaining sitewide absent card obligations found');
const queue = candidates.slice(0, 30);
const selected = queue[0];
await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'queue.json'), `${JSON.stringify({
  generated_at: new Date().toISOString(),
  completed_evidence_ids: [...completed].sort(),
  total_open_absent: candidates.length,
  selected,
  queue,
}, null, 2)}\n`);
await writeFile(join(OUT, 'selected.json'), `${JSON.stringify(selected, null, 2)}\n`);
await writeFile(join(OUT, 'summary.txt'), [
  `selected=${selected.wall_id}:${selected.side}`,
  `actor=${selected.actor}`,
  `character=${selected.character}`,
  `production=${selected.production}`,
  `universe=${selected.universe}`,
  `expected_subject=${selected.expected_subject}`,
  `total_open_absent=${candidates.length}`,
].join('\n') + '\n');

console.log(`SELECTED ${selected.wall_id} ${selected.side} — ${selected.character} / ${selected.actor} — ${selected.production}`);
console.log(`OPEN ABSENT ${candidates.length}; retained top ${queue.length} -> ${OUT}`);
