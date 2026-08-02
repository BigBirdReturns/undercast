#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  GENERATED_MANIFEST,
  GENERATED_SUMMARY,
  INPUT_FILES,
  PARENT_MANIFEST,
  parseArgs,
  validateCorpus,
  writeOrCheck
} from '../scripts/clifford-number-hr-governance.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(here, '..');

function copyOne(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyFixture() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'cnhr-wave03-'));
  for (const relative of [...INPUT_FILES, PARENT_MANIFEST, GENERATED_SUMMARY, GENERATED_MANIFEST]) {
    copyOne(path.join(sourceRoot, relative), path.join(target, relative));
  }
  return target;
}

function read(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

function write(root, relative, value) {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`);
}

function expectFailure(label, mutate, pattern, action = root => validateCorpus(root)) {
  const root = copyFixture();
  try {
    mutate(root);
    assert.throws(() => action(root), pattern, label);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

validateCorpus(sourceRoot);
writeOrCheck(sourceRoot, 'check');

expectFailure('authority escalation is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/wave-03/wave-03.json';
  const value = read(root, p);
  value.authority.publication_effects_allowed = true;
  write(root, p, value);
}, /publication_effects_allowed must remain false/);

expectFailure('parent manifest drift is refused', root => {
  const p = path.join(root, PARENT_MANIFEST);
  fs.appendFileSync(p, ' ');
}, /parent manifest drift/);

expectFailure('source URL rebinding is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/wave-03/sources/SOURCES-01.json';
  const value = read(root, p);
  value.sources[0].url = 'https://example.com/rebound';
  write(root, p, value);
}, /source ID\/URL map hash mismatch/);

expectFailure('duplicate source identity is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/wave-03/sources/SOURCES-01.json';
  const value = read(root, p);
  value.sources[1].id = value.sources[0].id;
  write(root, p, value);
}, /duplicate id/);

expectFailure('non-HTTPS source is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/wave-03/sources/SOURCES-02.json';
  const value = read(root, p);
  value.sources[0].url = 'http://example.invalid/source';
  write(root, p, value);
}, /must use https/);

expectFailure('remote source bytes claim is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/wave-03/sources/SOURCES-03.json';
  const value = read(root, p);
  value.sources[0].remote_bytes_committed = true;
  write(root, p, value);
}, /remote bytes may not be committed/);

expectFailure('missing lane is refused', root => {
  fs.rmSync(path.join(root, 'data/review/clifford-number/hr-selection/wave-03/lanes/HRG-06.json'));
}, /missing or extra lane/);

expectFailure('extra lane is refused', root => {
  const source = path.join(root, 'data/review/clifford-number/hr-selection/wave-03/lanes/HRG-06.json');
  const target = path.join(root, 'data/review/clifford-number/hr-selection/wave-03/lanes/HRG-07.json');
  fs.copyFileSync(source, target);
}, /missing or extra lane/);

expectFailure('dangling evidence source is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/wave-03/lanes/HRG-01.json';
  const value = read(root, p);
  value.findings[0].source_ids.push('not-a-source');
  write(root, p, value);
}, /dangling source/);

expectFailure('future law promoted to operative is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/wave-03/JURISDICTION-STATE-REGISTER.json';
  const value = read(root, p);
  value.states.find(item => item.id === 'EU-AIA-ANNEX-III-EMPLOYMENT').state = 'operative';
  write(root, p, value);
}, /state mismatch/);

expectFailure('EU application date drift is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/wave-03/JURISDICTION-STATE-REGISTER.json';
  const value = read(root, p);
  value.states.find(item => item.id === 'EU-AIA-ANNEX-III-EMPLOYMENT').effective_or_application_date = '2026-08-02';
  write(root, p, value);
}, /date mismatch/);

expectFailure('Colorado application date drift is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/wave-03/JURISDICTION-STATE-REGISTER.json';
  const value = read(root, p);
  value.states.find(item => item.id === 'CO-SB26-189').effective_or_application_date = '2026-08-01';
  write(root, p, value);
}, /date mismatch/);

expectFailure('deployment control adoption is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/wave-03/DEPLOYMENT-CUSTODY-PROTOCOL.json';
  const value = read(root, p);
  value.controls[0].adopted = true;
  write(root, p, value);
}, /may not be adopted/);

expectFailure('false-negative protocol adoption is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/wave-03/FALSE-NEGATIVE-AUDIT-PROTOCOL.json';
  const value = read(root, p);
  value.adopted = true;
  write(root, p, value);
}, /protocol may not be adopted/);

expectFailure('candidate entitlement authority is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/wave-03/wave-03.json';
  const value = read(root, p);
  value.authority.candidate_entitlement_findings_allowed = true;
  write(root, p, value);
}, /candidate_entitlement_findings_allowed must remain false/);

expectFailure('private source publication is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/wave-03/SOURCE-REGISTER.json';
  const value = read(root, p);
  value.private_source_count = 1;
  write(root, p, value);
}, /private sources prohibited/);

expectFailure('closed terminal question is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/wave-03/lanes/HRG-04.json';
  const value = read(root, p);
  value.terminal_receipt.closed_questions = ['current_enforceability'];
  write(root, p, value);
}, /too many items|may not close questions/);

expectFailure('stale generated bytes are refused', root => {
  const p = path.join(root, GENERATED_SUMMARY);
  fs.appendFileSync(p, ' ');
}, /generated bytes are stale/, root => writeOrCheck(root, 'check'));

assert.throws(() => parseArgs(['--write', '--check']), /choose exactly one/);
assert.throws(() => parseArgs(['--root']), /requires a value/);
assert.throws(() => parseArgs(['--unknown']), /unknown argument/);

console.log('clifford-number HR governance fixtures: passed (1 valid corpus + 18 adversarial refusals + 3 CLI refusals)');
