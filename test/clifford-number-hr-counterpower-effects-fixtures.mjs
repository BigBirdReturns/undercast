#!/usr/bin/env node
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestRel = 'data/review/clifford-number/hr-discipline/wave-06/MANIFEST.json';
const validatorRel = 'scripts/clifford-number-hr-counterpower-effects.mjs';
const W = 'data/review/clifford-number/hr-discipline/wave-06';

function read(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function write(path, value) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }
function packetPaths() {
  const manifest = read(join(sourceRoot, manifestRel));
  return [...manifest.files.map(row => row.path), manifestRel].sort();
}
function fresh() {
  const root = mkdtempSync(join(tmpdir(), 'cnhr-wave06-effects-'));
  for (const rel of packetPaths()) {
    const src = join(sourceRoot, rel);
    const dst = join(root, rel);
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst);
  }
  return root;
}
function run(root, args = ['--check','--strict-root']) {
  return spawnSync(process.execPath, [join(root, validatorRel), ...args, '--root', root], { encoding:'utf8' });
}
function expectFailure(name, mutate) {
  const root = fresh();
  try {
    mutate(root);
    const result = run(root);
    if (result.status === 0) throw new Error(`${name}: unexpectedly passed`);
  } finally {
    rmSync(root, { recursive:true, force:true });
  }
}

const valid = fresh();
try {
  const result = run(valid);
  if (result.status !== 0) throw new Error(`valid corpus failed:\n${result.stderr}\n${result.stdout}`);
} finally {
  rmSync(valid, { recursive:true, force:true });
}

const matrixPath = root => join(root, W, 'COUNTERPOWER-EFFECT-MATRIX.json');
const matrixCell = (matrix, caseId, effectId) =>
  matrix.cells.find(cell => cell.case_id === caseId && cell.effect_id === effectId);

const mutations = [
  ['authority escalation', root => {
    const p = join(root,W,'wave-06.json'); const x = read(p);
    x.authority.legal_conclusions_allowed = true; write(p,x);
  }],
  ['parent head drift', root => {
    const p = join(root,W,'wave-06.json'); const x = read(p);
    x.parent.head = '0000000000000000000000000000000000000000'; write(p,x);
  }],
  ['private source publication', root => {
    const p = join(root,W,'SOURCE-REGISTER.json'); const x = read(p);
    x.private_source_count = 1; write(p,x);
  }],
  ['lane removal', root => unlinkSync(join(root,W,'lanes/HRDCE-06.json'))],
  ['extra lane', root => cpSync(join(root,W,'lanes/HRDCE-06.json'), join(root,W,'lanes/HRDCE-07.json'))],
  ['source identity rebind', root => {
    const p = join(root,W,'sources/SOURCES-01.json'); const x = read(p);
    x.sources[0].url = 'https://example.invalid/rebound'; write(p,x);
  }],
  ['duplicate source URL', root => {
    const p = join(root,W,'sources/SOURCES-01.json'); const x = read(p);
    x.sources[1].url = x.sources[0].url; write(p,x);
  }],
  ['dangling source citation', root => {
    const p = join(root,W,'lanes/HRDCE-01.json'); const x = read(p);
    x.observations[0].source_ids = ['missing-source']; write(p,x);
  }],
  ['observation denominator drift', root => {
    const p = join(root,W,'lanes/HRDCE-02.json'); const x = read(p);
    x.observations.pop(); write(p,x);
  }],
  ['finding denominator drift', root => {
    const p = join(root,W,'lanes/HRDCE-03.json'); const x = read(p);
    x.findings.pop(); write(p,x);
  }],
  ['effect type removal', root => {
    const p = matrixPath(root); const x = read(p);
    x.effect_types.pop(); x.effect_type_count = x.effect_types.length; write(p,x);
  }],
  ['effect cell removal', root => {
    const p = matrixPath(root); const x = read(p);
    x.cells.pop(); x.cell_count = x.cells.length; write(p,x);
  }],
  ['invalid effect status', root => {
    const p = matrixPath(root); const x = read(p);
    x.cells[0].status = 'effective'; write(p,x);
  }],
  ['invent Amazon Italy AI use', root => {
    const p = join(root,W,'CASE-REGISTER.json'); const x = read(p);
    x.cases.find(item => item.case_id === 'HRDCE-01').ai_use_established = true; write(p,x);
  }],
  ['remove Serco feature retirement', root => {
    const p = matrixPath(root); const x = read(p);
    matrixCell(x,'HRDCE-02','feature_or_use_retirement').status = 'partial'; write(p,x);
  }],
  ['fabricate Microsoft independent verification', root => {
    const p = matrixPath(root); const x = read(p);
    matrixCell(x,'HRDCE-03','followup_verification_and_collective_memory').status = 'recovered'; write(p,x);
  }],
  ['remove Uber collective counterpower', root => {
    const p = join(root,W,'CASE-REGISTER.json'); const x = read(p);
    const item = x.cases.find(row => row.case_id === 'HRDCE-04');
    item.named_objects = item.named_objects.filter(name => name !== 'App Drivers & Couriers Union'); write(p,x);
  }],
  ['remove Seattle restoration', root => {
    const p = matrixPath(root); const x = read(p);
    matrixCell(x,'HRDCE-05','individual_restoration').status = 'partial'; write(p,x);
  }],
  ['fabricate Italy rider restoration', root => {
    const p = matrixPath(root); const x = read(p);
    const cell = matrixCell(x,'HRDCE-06','individual_restoration');
    cell.status = 'recovered'; cell.source_ids = ['foodinho-garante-release-2021']; write(p,x);
  }],
  ['promote regulator fine to worker compensation', root => {
    const p = matrixPath(root); const x = read(p);
    const cell = matrixCell(x,'HRDCE-06','worker_compensation');
    cell.status = 'recovered'; cell.source_ids = ['foodinho-garante-release-2024']; write(p,x);
  }],
  ['remedy stage removal', root => {
    const p = join(root,W,'REMEDY-LADDER.json'); const x = read(p);
    x.stages = x.stages.filter(stage => stage.id !== 'worker_compensated');
    x.stage_count = x.stages.length; write(p,x);
  }],
  ['system receipt state removal', root => {
    const p = join(root,W,'SYSTEM-CHANGE-RECEIPT.json'); const x = read(p);
    x.states = x.states.filter(state => state.id !== 'implementation_independently_verified');
    x.state_count = x.states.length; write(p,x);
  }],
  ['control adoption', root => {
    const p = join(root,W,'SYSTEM-CHANGE-RECEIPT.json'); const x = read(p);
    x.controls[0].adopted = true; write(p,x);
  }],
  ['token counterpower', root => {
    const p = join(root,W,'SYSTEM-CHANGE-RECEIPT.json'); const x = read(p);
    x.counterpower_definition.authority_to_pause = false; write(p,x);
  }],
  ['acute distress stop removal', root => {
    const p = join(root,W,'SYSTEM-CHANGE-RECEIPT.json'); const x = read(p);
    x.hard_stops = x.hard_stops.filter(id => id !== 'acute_safety_or_distress_handoff_required'); write(p,x);
  }],
  ['invent Chloe AI use', root => {
    const p = join(root,W,'CHLOE-NON-AI-EFFECTS-BOUNDARY.json'); const x = read(p);
    x.ai_use_established = true; write(p,x);
  }],
  ['remove victim-character refusal', root => {
    const p = join(root,W,'CHLOE-NON-AI-EFFECTS-BOUNDARY.json'); const x = read(p);
    x.prohibited_inferences = x.prohibited_inferences.filter(item => !item.includes('weak')); write(p,x);
  }],
  ['remove final-coroner refusal', root => {
    const p = join(root,W,'CHLOE-NON-AI-EFFECTS-BOUNDARY.json'); const x = read(p);
    x.prohibited_inferences = x.prohibited_inferences.filter(item => !item.includes('final coroner')); write(p,x);
  }],
  ['stale generated summary', root => writeFileSync(join(root,W,'WAVE-06-SUMMARY.json'), '{}\n')],
];

for (const [name, mutate] of mutations) expectFailure(name, mutate);

const cli = [
  ['unknown CLI', ['--bogus']],
  ['missing root', ['--check','--root']],
  ['conflicting modes', ['--check','--write']],
];
for (const [name, args] of cli) {
  const result = spawnSync(process.execPath, [join(sourceRoot,validatorRel), ...args], { encoding:'utf8' });
  if (result.status === 0) throw new Error(`${name}: unexpectedly passed`);
}

console.log(
  `counterpower effects fixtures: passed (` +
  `1 valid corpus + ${mutations.length} adversarial corpus refusals + ${cli.length} CLI refusals)`
);
