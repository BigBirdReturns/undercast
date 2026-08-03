#!/usr/bin/env node
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const script = join(root, 'scripts/clifford-number-hr-cost-transfer.mjs');
const BASE = 'data/review/clifford-number/hr-discipline/wave-13/';

function run(corpusRoot, ...extra) {
  return spawnSync(process.execPath, [script, '--check', '--root', corpusRoot, ...extra], {
    encoding: 'utf8',
  });
}

function corpus() {
  const dir = mkdtempSync(join(tmpdir(), 'hrct-'));
  cpSync(root, dir, { recursive: true });
  return dir;
}

function mutate(label, relativePath, change) {
  const dir = corpus();
  const path = join(dir, relativePath);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  change(json);
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  const result = run(dir);
  if (result.status === 0) {
    throw new Error(`mutation accepted: ${label} (${relativePath})`);
  }
}

const valid = run(root);
if (valid.status !== 0) {
  throw new Error(`valid corpus rejected: ${valid.stderr || valid.stdout}`);
}

const cases = [
  ['authority escalation', BASE + 'wave-13.json', j => { j.authority.legal_conclusions_allowed = true; }],
  ['parent git drift', BASE + 'wave-13.json', j => { j.parent.git_head = '0'.repeat(40); }],
  ['parent wave drift', BASE + 'wave-13.json', j => { j.parent.parent_wave_id = 'CN-HRBA-W00'; }],
  ['parent manifest drift', BASE + 'wave-13.json', j => { j.parent.parent_manifest_sha256 = '0'.repeat(64); }],
  ['parent mutation', BASE + 'wave-13.json', j => { j.parent.mutation_count = 1; }],
  ['source denominator drift', BASE + 'wave-13.json', j => { j.counts.public_sources = 23; }],
  ['cost-transfer denominator drift', BASE + 'wave-13.json', j => { j.counts.cost_transfer_cells = 119; }],
  ['private source publication', BASE + 'SOURCE-REGISTER.json', j => { j.private_source_count = 1; }],
  ['source map drift', BASE + 'SOURCE-REGISTER.json', j => { j.inherited_source_id_url_map_sha256 = '0'.repeat(64); }],
  ['source authority escalation', BASE + 'SOURCE-REGISTER.json', j => { j.authority.private_source_publication_allowed = true; }],
  ['pointer shard denominator', BASE + 'sources/SOURCE-POINTERS-01.json', j => { j.records.pop(); }],
  ['duplicate pointer identity', BASE + 'sources/SOURCE-POINTERS-02.json', j => { j.records[0].source_id = 'chloe-guardian-2026'; }],
  ['weak source pointer', BASE + 'sources/SOURCE-POINTERS-01.json', j => { j.records[0].status = 'seed_only'; }],
  ['pointer lineage drift', BASE + 'sources/SOURCE-POINTERS-01.json', j => { j.records[0].inherited_from_wave = 'CN-HRRP-W09'; }],
  ['pointer path drift', BASE + 'sources/SOURCE-POINTERS-01.json', j => { j.records[0].inherited_source_path = 'data/private/source.json'; }],
  ['pointer limits removed', BASE + 'sources/SOURCE-POINTERS-01.json', j => { j.records[0].limits = []; }],
  ['lane observation denominator', BASE + 'lanes/HRCT-01.json', j => { j.observations.pop(); }],
  ['lane finding denominator', BASE + 'lanes/HRCT-02.json', j => { j.findings.pop(); }],
  ['lane question closed', BASE + 'lanes/HRCT-03.json', j => { j.terminal_receipt.closed_questions.push('closed'); }],
  ['lane open-question denominator', BASE + 'lanes/HRCT-04.json', j => { j.terminal_receipt.open_questions.pop(); }],
  ['lane dangling source', BASE + 'lanes/HRCT-05.json', j => { j.source_ids[0] = 'missing-source'; }],
  ['lane authority escalation', BASE + 'lanes/HRCT-06.json', j => { j.authority.individual_culpability_findings_allowed = true; }],
  ['matrix cell denominator', BASE + 'INDEMNITY-COST-TRANSFER-MATRIX.json', j => { j.cell_count = 119; }],
  ['matrix state denominator', BASE + 'INDEMNITY-COST-TRANSFER-MATRIX.json', j => { j.state_ids.pop(); }],
  ['matrix pattern denominator', BASE + 'INDEMNITY-COST-TRANSFER-MATRIX.json', j => { j.patterns['HRCT-01'].pop(); }],
  ['matrix bad status', BASE + 'INDEMNITY-COST-TRANSFER-MATRIX.json', j => { j.patterns['HRCT-01'][0] = 'resolved'; }],
  ['matrix dangling source', BASE + 'INDEMNITY-COST-TRANSFER-MATRIX.json', j => { j.lane_source_ids['HRCT-01'][0] = 'missing-source'; }],
  ['matrix authority escalation', BASE + 'INDEMNITY-COST-TRANSFER-MATRIX.json', j => { j.authority.employer_liability_findings_allowed = true; }],
  ['actor count drift', BASE + 'ACTOR-COST-TRANSFER-MATRIX.json', j => { j.actor_count = 13; }],
  ['actor record count drift', BASE + 'ACTOR-COST-TRANSFER-MATRIX.json', j => { j.record_count = 83; }],
  ['actor pattern drift', BASE + 'ACTOR-COST-TRANSFER-MATRIX.json', j => { j.patterns['HRCT-01'].pop(); }],
  ['actor authority escalation', BASE + 'ACTOR-COST-TRANSFER-MATRIX.json', j => { j.authority.legal_conclusions_allowed = true; }],
  ['ladder denominator', BASE + 'COST-TRANSFER-LADDER.json', j => { j.stages.pop(); }],
  ['control adopted', BASE + 'INDEMNITY-CUSTODY-PROTOCOL.json', j => { j.controls[0].adopted = true; }],
  ['indemnity hard stop removed', BASE + 'INDEMNITY-CUSTODY-PROTOCOL.json', j => { j.hard_stops = j.hard_stops.filter(x => x !== 'indemnity_used_as_accountability'); }],
  ['case prematurely closed', BASE + 'CASE-COST-TRANSFER-REGISTER.json', j => { j.cases[0].closure_allowed = true; }],
  ['invent Chloe AI use', BASE + 'CHLOE-NON-AI-INDEMNITY-BOUNDARY.json', j => { j.ai_use_established = true; }],
  ['remove victim-character refusal', BASE + 'CHLOE-NON-AI-INDEMNITY-BOUNDARY.json', j => { j.prohibited_inferences = j.prohibited_inferences.filter(x => !x.includes('weak')); }],
];

for (const [label, relativePath, change] of cases) {
  mutate(label, relativePath, change);
}

const strict = corpus();
writeFileSync(join(strict, 'EXTRA'), 'x');
if (run(strict, '--strict-root').status === 0) {
  throw new Error('strict extra path accepted');
}

for (const argv of [['--wat'], ['--root'], ['--check', '--write']]) {
  const result = spawnSync(process.execPath, [script, ...argv], { encoding: 'utf8' });
  if (result.status === 0) {
    throw new Error(`bad CLI accepted: ${argv.join(' ')}`);
  }
}

console.log(
  `CN-HRCT-W13 fixtures: passed (1 valid corpus + ${cases.length + 1} adversarial corpus refusals + 3 CLI refusals)`,
);
