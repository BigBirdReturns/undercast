#!/usr/bin/env node
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const script = join(root, 'scripts/clifford-number-hr-response-prevention.mjs');
const manifestRel = 'data/review/clifford-number/hr-discipline/wave-09/MANIFEST.json';

function run(corpusRoot, ...extra) {
  return spawnSync(process.execPath, [script, '--check', '--root', corpusRoot, ...extra], { encoding: 'utf8' });
}
function corpus() {
  const dir = mkdtempSync(join(tmpdir(), 'hrrp-'));
  const manifest = JSON.parse(readFileSync(join(root, manifestRel), 'utf8'));
  const paths = manifest.files.map(row => row.path).concat(manifestRel);
  for (const rel of paths) {
    const src = join(root, rel);
    const dst = join(dir, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst);
  }
  return dir;
}
function mutate(rel, fn) {
  const dir = corpus();
  const path = join(dir, rel);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  fn(json);
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
  const result = run(dir);
  if (result.status === 0) throw new Error(`mutation accepted: ${rel}`);
}

const valid = corpus();
if (run(valid, '--strict-root').status !== 0) throw new Error('valid corpus rejected');

const cases = [
  ['wave authority', 'data/review/clifford-number/hr-discipline/wave-09/wave-09.json', j => { j.authority.legal_conclusions_allowed = true; }],
  ['parent drift', 'data/review/clifford-number/hr-discipline/wave-09/wave-09.json', j => { j.parent.head = '0'.repeat(40); }],
  ['source denominator', 'data/review/clifford-number/hr-discipline/wave-09/wave-09.json', j => { j.counts.public_sources = 23; }],
  ['invent Chloe AI', 'data/review/clifford-number/hr-discipline/wave-09/CHLOE-NON-AI-PREVENTION-BOUNDARY.json', j => { j.ai_use_established = true; }],
  ['remove weakness refusal', 'data/review/clifford-number/hr-discipline/wave-09/CHLOE-NON-AI-PREVENTION-BOUNDARY.json', j => { j.prohibited_inferences = j.prohibited_inferences.filter(x => !x.includes('weak')); }],
  ['remove response promotion refusal', 'data/review/clifford-number/hr-discipline/wave-09/CHLOE-NON-AI-PREVENTION-BOUNDARY.json', j => { j.prohibited_inferences = j.prohibited_inferences.filter(x => !x.includes('Reported training')); }],
  ['private source', 'data/review/clifford-number/hr-discipline/wave-09/SOURCE-REGISTER.json', j => { j.private_source_count = 1; }],
  ['source rebinding', 'data/review/clifford-number/hr-discipline/wave-09/sources/SOURCES-01.json', j => { j.sources[0].url = 'https://example.com/rebound'; }],
  ['weak source', 'data/review/clifford-number/hr-discipline/wave-09/sources/SOURCES-01.json', j => { j.sources[0].status = 'seed_only'; }],
  ['source limits removed', 'data/review/clifford-number/hr-discipline/wave-09/sources/SOURCES-01.json', j => { j.sources[0].limits = []; }],
  ['case count', 'data/review/clifford-number/hr-discipline/wave-09/CASE-RESPONSE-REGISTER.json', j => { j.case_count = 5; }],
  ['case closure', 'data/review/clifford-number/hr-discipline/wave-09/CASE-RESPONSE-REGISTER.json', j => { j.cases[0].closed = true; }],
  ['custody rule loss', 'data/review/clifford-number/hr-discipline/wave-09/RESPONSE-CUSTODY-LEDGER.json', j => { j.rules = j.rules.filter(x => !x.includes('not_listed')); }],
  ['custody authority', 'data/review/clifford-number/hr-discipline/wave-09/RESPONSE-CUSTODY-LEDGER.json', j => { j.authority.legal_conclusions_allowed = true; }],
  ['lane observation denominator', 'data/review/clifford-number/hr-discipline/wave-09/lanes/HRRP-01.json', j => { j.observations.pop(); }],
  ['lane closed question', 'data/review/clifford-number/hr-discipline/wave-09/lanes/HRRP-01.json', j => { j.terminal_receipt.closed_questions.push('closed'); }],
  ['lane dangling source', 'data/review/clifford-number/hr-discipline/wave-09/lanes/HRRP-02.json', j => { j.source_ids[0] = 'missing'; }],
  ['unknown finding status', 'data/review/clifford-number/hr-discipline/wave-09/lanes/HRRP-03.json', j => { j.findings[0].status = 'complete'; }],
  ['matrix cell denominator', 'data/review/clifford-number/hr-discipline/wave-09/RESPONSE-TO-PREVENTION-MATRIX.json', j => { j.cells.pop(); }],
  ['matrix status promotion', 'data/review/clifford-number/hr-discipline/wave-09/RESPONSE-TO-PREVENTION-MATRIX.json', j => { j.cells[0].status = 'complete'; }],
  ['blocked matrix proof', 'data/review/clifford-number/hr-discipline/wave-09/RESPONSE-TO-PREVENTION-MATRIX.json', j => { const cell = j.cells.find(x => x.status === 'blocked'); cell.source_ids = ['chloe-guardian-2026']; }],
  ['matrix authority', 'data/review/clifford-number/hr-discipline/wave-09/RESPONSE-TO-PREVENTION-MATRIX.json', j => { j.authority.employer_liability_findings_allowed = true; }],
  ['protocol state removed', 'data/review/clifford-number/hr-discipline/wave-09/PREVENTION-IMPLEMENTATION-RECEIPT.json', j => { j.states.pop(); }],
  ['control adopted', 'data/review/clifford-number/hr-discipline/wave-09/PREVENTION-IMPLEMENTATION-RECEIPT.json', j => { j.controls[0].adopted = true; }],
  ['hard stop removed', 'data/review/clifford-number/hr-discipline/wave-09/PREVENTION-IMPLEMENTATION-RECEIPT.json', j => { j.hard_stops.pop(); }],
];
for (const [, rel, fn] of cases) mutate(rel, fn);

const strict = corpus();
writeFileSync(join(strict, 'EXTRA'), 'x');
if (run(strict, '--strict-root').status === 0) throw new Error('strict extra file accepted');

for (const args of [['--wat'], ['--root'], ['--write', '--check']]) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  if (result.status === 0) throw new Error(`bad CLI accepted: ${args.join(' ')}`);
}

console.log(`response prevention fixtures: passed (1 valid corpus + ${cases.length + 1} adversarial corpus refusals + 3 CLI refusals)`);
