#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const sourceRoot = process.cwd();
const script = path.join(sourceRoot, 'scripts/clifford-number-hr-disciplinary.mjs');
const REL = 'data/review/clifford-number/hr-discipline/wave-01';

function read(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}
function write(root, rel, value) {
  fs.writeFileSync(path.join(root, rel), `${JSON.stringify(value, null, 2)}\n`);
}
function copyCorpus() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cnhr-disciplinary-'));
  for (const rel of [
    REL,
    'docs/research/clifford-number/hr-discipline',
    'schema/clifford-number-hr-disciplinary-case.schema.json',
    'scripts/clifford-number-hr-disciplinary.mjs',
    'test/clifford-number-hr-disciplinary-fixtures.mjs',
  ]) {
    const src = path.join(sourceRoot, rel);
    const dst = path.join(root, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(src, dst, { recursive: true });
  }
  return root;
}
function run(root) {
  return spawnSync(process.execPath, [script, '--check', '--root', root], { encoding: 'utf8' });
}
function expectFailure(name, mutate, pattern) {
  const root = copyCorpus();
  try {
    mutate(root);
    const result = run(root);
    if (result.status === 0) throw new Error(`${name}: expected refusal`);
    const output = `${result.stdout}\n${result.stderr}`;
    if (!pattern.test(output)) throw new Error(`${name}: wrong refusal: ${output}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const valid = run(sourceRoot);
if (valid.status !== 0) throw new Error(`valid corpus failed: ${valid.stdout}\n${valid.stderr}`);

expectFailure('authority escalation refused', root => {
  const p = `${REL}/wave-01.json`;
  const v = read(root, p); v.authority.individual_culpability_findings_allowed = true; write(root, p, v);
}, /must remain false/);

expectFailure('final coroner conclusion refused', root => {
  const p = `${REL}/CASE-CHLOE-MOFFAT.json`;
  const v = read(root, p); v.public_record_state = 'final_coroner_conclusion_recovered'; write(root, p, v);
}, /final inquest conclusion may not be claimed/);

expectFailure('victim weakness refusal cannot be removed', root => {
  const p = `${REL}/CASE-CHLOE-MOFFAT.json`;
  const v = read(root, p); v.prohibited_inferences = v.prohibited_inferences.filter(x => !x.includes('weak')); write(root, p, v);
}, /victim-weakness refusal missing/);

expectFailure('control adoption refused', root => {
  const p = `${REL}/ADVERSE-PROCESS-RECEIPT.json`;
  const v = read(root, p); v.controls[0].adopted = true; write(root, p, v);
}, /controls may not be adopted/);

expectFailure('severity trigger weakening refused', root => {
  const p = `${REL}/ADVERSE-PROCESS-RECEIPT.json`;
  const v = read(root, p); v.severity_equivalence_trigger.rule = 'Safeguards apply only after a formal label.'; write(root, p, v);
}, /severity equivalence trigger weakened/);

expectFailure('independent welfare owner removal refused', root => {
  const p = `${REL}/ADVERSE-PROCESS-RECEIPT.json`;
  const v = read(root, p); v.states.find(x => x.state_id === 'welfare_risk_assessed').required_fields = ['observed_distress']; write(root, p, v);
}, /independent welfare owner missing/);

expectFailure('support disposition removal refused', root => {
  const p = `${REL}/ADVERSE-PROCESS-RECEIPT.json`;
  const v = read(root, p); v.states.find(x => x.state_id === 'support_arranged').required_fields = ['support_options']; write(root, p, v);
}, /support disposition missing/);

expectFailure('overnight handoff removal refused', root => {
  const p = `${REL}/ADVERSE-PROCESS-RECEIPT.json`;
  const v = read(root, p); v.states.find(x => x.state_id === 'immediate_safety_handoff').required_fields = ['same_day_contact']; write(root, p, v);
}, /overnight safety handoff missing/);

expectFailure('source identity rebinding refused', root => {
  const p = `${REL}/SOURCE-REGISTER.json`;
  const v = read(root, p); v.sources.find(x => x.id === 'guardian-moffat-inquest-2026').url = 'https://example.com/rebound'; write(root, p, v);
}, /source URL mismatch/);

expectFailure('duplicate source refused', root => {
  const p = `${REL}/SOURCE-REGISTER.json`;
  const v = read(root, p); v.sources[1].id = v.sources[0].id; write(root, p, v);
}, /duplicate source id/);

expectFailure('dangling evidence refused', root => {
  const p = `${REL}/CASE-CHLOE-MOFFAT.json`;
  const v = read(root, p); v.findings[0].source_ids = ['missing-source']; write(root, p, v);
}, /dangling source/);

expectFailure('closed accountability question refused', root => {
  const p = `${REL}/CASE-CHLOE-MOFFAT.json`;
  const v = read(root, p); v.terminal_receipt.closed_questions = ['individual_accountability']; write(root, p, v);
}, /may not close open accountability questions/);

expectFailure('routing outcome escalation refused', root => {
  const p = `${REL}/ACCOUNTABILITY-ROUTING.json`;
  const v = read(root, p); v.bounded_synthesis.status = 'case_outcome'; write(root, p, v);
}, /routing synthesis authority escalated/);

expectFailure('private source refused', root => {
  const p = `${REL}/SOURCE-REGISTER.json`;
  const v = read(root, p); v.private_source_count = 1; write(root, p, v);
}, /private sources are refused/);

expectFailure('stale generated bytes refused', root => {
  const p = `${REL}/WAVE-01-SUMMARY.json`;
  const v = read(root, p); v.finding_count = 999; write(root, p, v);
}, /stale Wave 01 summary bytes/);

for (const [name, args, pattern] of [
  ['unknown CLI argument', ['--check', '--bogus'], /unknown argument/],
  ['missing mode', [], /choose exactly one/],
  ['conflicting modes', ['--write', '--check'], /choose exactly one/],
]) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  if (result.status === 0 || !pattern.test(`${result.stdout}\n${result.stderr}`)) throw new Error(`${name}: CLI refusal failed`);
}

console.log('clifford-number HR disciplinary fixtures: passed (1 valid corpus + 15 corpus refusals + 3 CLI refusals)');
