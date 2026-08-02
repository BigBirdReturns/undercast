#!/usr/bin/env node
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = 'scripts/clifford-number-hr-counterpower-interventions.mjs';
const SCRIPT_ABS = join(ROOT, SCRIPT);
const DATA = 'data/review/clifford-number/hr-discipline/wave-05';
const MANIFEST = `${DATA}/MANIFEST.json`;

function candidatePaths() {
  const manifest = JSON.parse(readFileSync(join(ROOT, MANIFEST), 'utf8'));
  return [...manifest.files.map(row => row.path), MANIFEST];
}

function makeCorpus(name) {
  const dir = mkdtempSync(join(tmpdir(), `cnhr-w05-${name}-`));
  for (const rel of candidatePaths()) {
    const dst = join(dir, rel);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(ROOT, rel), dst);
  }
  return dir;
}

function run(root, extra = []) {
  return spawnSync(
    process.execPath,
    [join(root, SCRIPT), '--check', '--root', root, '--strict-root', ...extra],
    { encoding: 'utf8' },
  );
}

function mutate(name, fn) {
  const dir = makeCorpus(name);
  try {
    fn(dir);
    const result = run(dir);
    if (result.status === 0) throw new Error(`fixture ${name} unexpectedly passed`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function editJson(root, path, fn) {
  const p = join(root, path);
  const value = JSON.parse(readFileSync(p, 'utf8'));
  fn(value);
  writeFileSync(p, JSON.stringify(value, null, 2) + '\n');
}

const valid = makeCorpus('valid');
try {
  const result = run(valid);
  if (result.status !== 0) {
    throw new Error(`valid corpus failed: ${result.stderr || result.stdout}`);
  }
} finally {
  rmSync(valid, { recursive: true, force: true });
}

const cases = [
  ['authority-escalation', d => editJson(d, `${DATA}/wave-05.json`, v => { v.authority.legal_conclusions_allowed = true; })],
  ['parent-head-drift', d => editJson(d, `${DATA}/wave-05.json`, v => { v.parent.head = 'deadbeef'; })],
  ['source-count-drift', d => editJson(d, `${DATA}/SOURCE-REGISTER.json`, v => { v.source_count = 21; })],
  ['source-rebinding', d => editJson(d, `${DATA}/sources/SOURCES-01.json`, v => { v.sources[0].url = 'https://example.invalid/rebound'; })],
  ['private-source', d => editJson(d, `${DATA}/sources/SOURCES-01.json`, v => { v.sources[0].status = 'private_source'; })],
  ['missing-lane', d => rmSync(join(d, `${DATA}/lanes/HRDCI-06.json`))],
  ['observation-count', d => editJson(d, `${DATA}/lanes/HRDCI-01.json`, v => { v.observations.pop(); })],
  ['finding-count', d => editJson(d, `${DATA}/lanes/HRDCI-02.json`, v => { v.findings.pop(); })],
  ['soft-partnership-promoted', d => editJson(d, `${DATA}/INSTRUMENT-ENFORCEABILITY-REGISTER.json`, v => { v.instruments.find(x => x.lane_id === 'HRDCI-03').binding_or_authoritative = true; })],
  ['soft-depth-promoted', d => editJson(d, `${DATA}/lanes/HRDCI-03.json`, v => { v.highest_publicly_recovered_depth_level = 4; })],
  ['uber-depth-drift', d => editJson(d, `${DATA}/lanes/HRDCI-05.json`, v => { v.highest_publicly_recovered_depth_level = 6; })],
  ['seattle-depth-drift', d => editJson(d, `${DATA}/lanes/HRDCI-06.json`, v => { v.highest_publicly_recovered_depth_level = 7; })],
  ['system-revision-promoted', d => editJson(d, `${DATA}/REMEDY-AND-REVISION-LEDGER.json`, v => { v.records[0].system_revision = true; })],
  ['survivor-audit-promoted', d => editJson(d, `${DATA}/REMEDY-AND-REVISION-LEDGER.json`, v => { v.records[1].survivor_bias_reconciliation = true; })],
  ['preaction-pause-promoted', d => editJson(d, `${DATA}/PREHARM-POSTHARM-MATRIX.json`, v => { v.summary.preaction_pause_recovered = 1; })],
  ['actor-support-promoted', d => editJson(d, `${DATA}/ACTOR-POWER-MATRIX.json`, v => { v.summary.support_person_recovered_cells = 1; })],
  ['restoration-denominator', d => editJson(d, `${DATA}/REMEDY-AND-REVISION-LEDGER.json`, v => { v.records[0].individual_restoration = true; })],
  ['invented-chloe-ai', d => editJson(d, `${DATA}/CHLOE-NON-AI-PREVENTION-BOUNDARY.json`, v => { v.ai_use_established = true; })],
  ['chloe-preharm-power', d => editJson(d, `${DATA}/CHLOE-NON-AI-PREVENTION-BOUNDARY.json`, v => { v.pre_harm_independent_counterpower_recovered = true; })],
  ['unpublished-term-authority', d => editJson(d, `${DATA}/wave-05.json`, v => { v.authority.unpublished_contract_term_inference_allowed = true; })],
  ['partnership-cba-authority', d => editJson(d, `${DATA}/wave-05.json`, v => { v.authority.soft_partnership_as_collective_bargaining_claims_allowed = true; })],
  ['stale-summary', d => editJson(d, `${DATA}/WAVE-05-SUMMARY.json`, v => { v.source_count = 999; })],
  ['stale-manifest', d => editJson(d, `${DATA}/MANIFEST.json`, v => { v.exact_file_count = 999; })],
  ['extra-file', d => writeFileSync(join(d, 'EXTRA.txt'), 'nope\n')],
  ['dangling-source', d => editJson(d, `${DATA}/lanes/HRDCI-01.json`, v => { v.source_ids.push('missing-source'); })],
  ['timing-denominator', d => editJson(d, `${DATA}/PREHARM-POSTHARM-MATRIX.json`, v => { v.cells.pop(); })],
];
for (const [name, fn] of cases) mutate(name, fn);

const bad1 = spawnSync(process.execPath, [SCRIPT_ABS, '--bogus'], { encoding: 'utf8' });
if (bad1.status === 0) throw new Error('unknown CLI accepted');
const bad2 = spawnSync(process.execPath, [SCRIPT_ABS, '--root'], { encoding: 'utf8' });
if (bad2.status === 0) throw new Error('missing root accepted');
const bad3 = spawnSync(process.execPath, [SCRIPT_ABS, '--check', '--root', '/definitely/missing'], { encoding: 'utf8' });
if (bad3.status === 0) throw new Error('missing corpus accepted');

console.log(`counterpower intervention fixtures: passed (1 valid corpus + ${cases.length} adversarial corpus refusals + 3 CLI refusals)`);
