#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCRIPT = path.join(ROOT, 'scripts/clifford-number-hr-algorithmic-discipline.mjs');
const REL = 'data/review/clifford-number/hr-discipline/wave-02';
let validCount = 0;
let corpusRefusals = 0;
let cliRefusals = 0;

function readJson(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function writeJson(root, rel, value) {
  fs.writeFileSync(path.join(root, rel), `${JSON.stringify(value, null, 2)}\n`);
}

function run(root, args = ['--check']) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function copyCorpus() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cnhr-ai-discipline-'));
  fs.cpSync(ROOT, temp, { recursive: true });
  return temp;
}

function expectCorpusRefusal(name, mutate, expected) {
  const temp = copyCorpus();
  try {
    mutate(temp);
    const result = run(temp);
    assert(result.status !== 0, `${name}: mutation unexpectedly passed`);
    const combined = `${result.stdout}\n${result.stderr}`;
    if (expected) assert(combined.includes(expected), `${name}: expected refusal text not found: ${expected}\n${combined}`);
    corpusRefusals += 1;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function expectCliRefusal(name, args, expected) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  assert(result.status !== 0, `${name}: CLI misuse unexpectedly passed`);
  const combined = `${result.stdout}\n${result.stderr}`;
  assert(combined.includes(expected), `${name}: expected CLI refusal not found: ${expected}\n${combined}`);
  cliRefusals += 1;
}

const valid = run(ROOT);
assert(valid.status === 0, `valid corpus failed:\n${valid.stdout}\n${valid.stderr}`);
validCount += 1;

expectCorpusRefusal('authority escalation', root => {
  const wave = readJson(root, `${REL}/wave-02.json`);
  wave.authority.canonical_product_effects_allowed = true;
  writeJson(root, `${REL}/wave-02.json`, wave);
}, 'must remain false');

expectCorpusRefusal('invent Chloe AI use', root => {
  const join = readJson(root, `${REL}/CHLOE-MOFFAT-NON-AI-BASELINE-JOIN.json`);
  join.public_ai_use_recovered = true;
  writeJson(root, `${REL}/CHLOE-MOFFAT-NON-AI-BASELINE-JOIN.json`, join);
}, 'AI use may not be invented');

expectCorpusRefusal('universal purge promotion', root => {
  const loop = readJson(root, `${REL}/ALGORITHMIC-DISSONANCE-CONTROL-LOOP.json`);
  loop.bounded_definition.status = 'universal_finding';
  writeJson(root, `${REL}/ALGORITHMIC-DISSONANCE-CONTROL-LOOP.json`, loop);
}, 'control-loop authority escalated');

expectCorpusRefusal('control adoption', root => {
  const receipt = readJson(root, `${REL}/ADVERSE-AI-PROCESS-RECEIPT.json`);
  receipt.controls[0].adopted = true;
  writeJson(root, `${REL}/ADVERSE-AI-PROCESS-RECEIPT.json`, receipt);
}, 'controls may not be adopted');

expectCorpusRefusal('receipt state removal', root => {
  const receipt = readJson(root, `${REL}/ADVERSE-AI-PROCESS-RECEIPT.json`);
  receipt.states.pop();
  receipt.state_count = receipt.states.length;
  writeJson(root, `${REL}/ADVERSE-AI-PROCESS-RECEIPT.json`, receipt);
}, 'exactly 14 receipt states required');

expectCorpusRefusal('protected activity carveout removal', root => {
  const receipt = readJson(root, `${REL}/ADVERSE-AI-PROCESS-RECEIPT.json`);
  receipt.controls.find(control => control.control_id === 'HRDA-C03').requirement = 'Route unusual worker behavior for scoring.';
  writeJson(root, `${REL}/ADVERSE-AI-PROCESS-RECEIPT.json`, receipt);
}, 'protected-activity and safety carveout weakened');

expectCorpusRefusal('token human review', root => {
  const receipt = readJson(root, `${REL}/ADVERSE-AI-PROCESS-RECEIPT.json`);
  receipt.controls.find(control => control.control_id === 'HRDA-C10').requirement = 'A manager clicks approve.';
  writeJson(root, `${REL}/ADVERSE-AI-PROCESS-RECEIPT.json`, receipt);
}, 'meaningful human review weakened');

expectCorpusRefusal('source URL rebinding', root => {
  const register = readJson(root, `${REL}/SOURCE-REGISTER.json`);
  register.sources.find(source => source.id === 'oecd-2025-algorithmic-management').url = 'https://example.com/rebound';
  writeJson(root, `${REL}/SOURCE-REGISTER.json`, register);
}, 'source identity/URL map rebound');

expectCorpusRefusal('duplicate source id', root => {
  const register = readJson(root, `${REL}/SOURCE-REGISTER.json`);
  register.sources[1].id = register.sources[0].id;
  writeJson(root, `${REL}/SOURCE-REGISTER.json`, register);
}, 'duplicate source id');

expectCorpusRefusal('dangling source binding', root => {
  const lane = readJson(root, `${REL}/lanes/HRDA-01.json`);
  lane.observations[0].source_ids = ['invented-source'];
  writeJson(root, `${REL}/lanes/HRDA-01.json`, lane);
}, 'dangling source');

expectCorpusRefusal('missing lane', root => {
  fs.unlinkSync(path.join(root, REL, 'lanes/HRDA-06.json'));
}, 'lane directory denominator drift');

expectCorpusRefusal('extra lane', root => {
  fs.copyFileSync(path.join(root, REL, 'lanes/HRDA-06.json'), path.join(root, REL, 'lanes/HRDA-07.json'));
}, 'lane directory denominator drift');

expectCorpusRefusal('observation denominator weakening', root => {
  const lane = readJson(root, `${REL}/lanes/HRDA-02.json`);
  lane.observations.pop();
  writeJson(root, `${REL}/lanes/HRDA-02.json`, lane);
}, 'exactly 6 observations required');

expectCorpusRefusal('EU high-risk temporal promotion', root => {
  const register = readJson(root, `${REL}/JURISDICTION-STATE-REGISTER.json`);
  const state = register.states.find(item => item.id === 'EU-AI-ACT-HIGH-RISK-EMPLOYMENT');
  state.state = 'operative';
  state.boundary_date = '2026-08-01';
  writeJson(root, `${REL}/JURISDICTION-STATE-REGISTER.json`, register);
}, 'temporally promoted');

expectCorpusRefusal('NLRB rescission collapse', root => {
  const register = readJson(root, `${REL}/JURISDICTION-STATE-REGISTER.json`);
  register.states.find(item => item.id === 'US-NLRA-CONCERTED-ACTIVITY').state = 'electronic_monitoring_framework_current';
  writeJson(root, `${REL}/JURISDICTION-STATE-REGISTER.json`, register);
}, 'rights/rescission distinction collapsed');

expectCorpusRefusal('counter-design removal', root => {
  const register = readJson(root, `${REL}/SOURCE-REGISTER.json`);
  register.sources.find(source => source.id === 'microsoft-viva-privacy').supports = ['generic_vendor_claim'];
  writeJson(root, `${REL}/SOURCE-REGISTER.json`, register);
}, 'privacy-preserving counter-design source missing');

expectCorpusRefusal('parent head drift', root => {
  const wave = readJson(root, `${REL}/wave-02.json`);
  wave.parent.head = '0000000000000000000000000000000000000000';
  writeJson(root, `${REL}/wave-02.json`, wave);
}, 'parent head mismatch');

expectCorpusRefusal('stale summary bytes', root => {
  const summary = readJson(root, `${REL}/WAVE-02-SUMMARY.json`);
  summary.source_count = 999;
  writeJson(root, `${REL}/WAVE-02-SUMMARY.json`, summary);
}, 'stale Wave 02 summary bytes');

expectCorpusRefusal('stale manifest bytes', root => {
  fs.appendFileSync(path.join(root, 'docs/research/clifford-number/hr-discipline/WAVE-02.md'), '\nmanifest drift fixture\n');
}, 'stale Wave 02 manifest bytes');

expectCliRefusal('unknown argument', ['--check', '--bogus'], 'unknown argument');
expectCliRefusal('conflicting modes', ['--write', '--check'], 'choose exactly one');
expectCliRefusal('missing root value', ['--check', '--root'], '--root requires a value');

console.log(`clifford-number algorithmic discipline fixtures: passed (${validCount} valid corpus + ${corpusRefusals} adversarial corpus refusals + ${cliRefusals} CLI refusals)`);
