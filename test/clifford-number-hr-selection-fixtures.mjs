#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { validateCorpus } from '../scripts/clifford-number-hr-selection.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(here, '..');
const dataRoot = 'data/review/clifford-number/hr-selection';

function copyFixture() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-hr-wave-'));
  fs.cpSync(path.join(sourceRoot, dataRoot), path.join(target, dataRoot), { recursive: true });
  return target;
}

function read(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

function write(root, relative, value) {
  fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`);
}

function expectFailure(label, mutate, pattern) {
  const root = copyFixture();
  try {
    mutate(root);
    assert.throws(() => validateCorpus(root), pattern, label);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

validateCorpus(sourceRoot);

expectFailure('authority escalation is refused', root => {
  const p = `${dataRoot}/lanes/HR-01.json`;
  const value = read(root, p);
  value.authority.publication_effects_allowed = true;
  write(root, p, value);
}, /publication_effects_allowed must remain false/);

expectFailure('missing lane is refused', root => {
  fs.rmSync(path.join(root, `${dataRoot}/lanes/HR-08.json`));
}, /missing required lane/);

expectFailure('dangling source is refused', root => {
  const p = `${dataRoot}/lanes/HR-06.json`;
  const value = read(root, p);
  value.findings[0].source_ids.push('not-a-source');
  write(root, p, value);
}, /dangling source/);

expectFailure('private artifact publication is refused', root => {
  const p = `${dataRoot}/SOURCE-REGISTER.json`;
  const value = read(root, p);
  const seed = value.private_sources.find(source => source.id === 'seed-genealogy-2026-08-01');
  seed.artifact.raw_artifact_committed = true;
  write(root, p, value);
}, /raw private seed may not be committed/);

expectFailure('independent verification inflation is refused', root => {
  const p = `${dataRoot}/sources/SOURCES-01.json`;
  const value = read(root, p);
  const source = value.sources.find(item => item.id === 'griggs-justia');
  source.verification_state = 'independently_verified';
  write(root, p, value);
}, /may not claim independent verification/);

expectFailure('closed control question is refused', root => {
  const p = `${dataRoot}/lanes/HR-04.json`;
  const value = read(root, p);
  value.terminal_receipt.closed_control_questions = ['individual_false_negative_audit_method'];
  write(root, p, value);
}, /may not close control questions/);

expectFailure('legal conclusion authority is refused', root => {
  const p = `${dataRoot}/wave-01.json`;
  const value = read(root, p);
  value.authority.legal_conclusions_allowed = true;
  write(root, p, value);
}, /legal_conclusions_allowed must remain false/);

expectFailure('control adoption is refused', root => {
  const p = `${dataRoot}/DECISION-RECEIPT-SPEC.json`;
  const value = read(root, p);
  value.controls[0].adopted = true;
  write(root, p, value);
}, /may not be adopted in this wave/);

expectFailure('source identity URL rebinding is refused', root => {
  const p = `${dataRoot}/sources/SOURCES-04.json`;
  const value = read(root, p);
  const source = value.sources.find(item => item.id === 'resume-name-discrimination');
  source.url = 'https://example.com/rebound';
  write(root, p, value);
}, /source URL mismatch/);

expectFailure('duplicate source identity is refused', root => {
  const p = `${dataRoot}/sources/SOURCES-01.json`;
  const value = read(root, p);
  value.sources[1].id = value.sources[0].id;
  write(root, p, value);
}, /duplicate id/);

console.log('clifford-number hr-selection fixtures: passed (1 valid corpus + 10 adversarial refusals)');
