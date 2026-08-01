#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { validateCorpus } from '../scripts/residual-denominator.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(here, '..');

function copyFixture() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-wave-'));
  for (const relative of ['data/review/residual-denominator']) {
    fs.cpSync(path.join(sourceRoot, relative), path.join(target, relative), { recursive: true });
  }
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
  const p = 'data/review/residual-denominator/lanes/RD-01.json';
  const value = read(root, p);
  value.authority.publication_effects_allowed = true;
  write(root, p, value);
}, /publication_effects_allowed must remain false/);

expectFailure('missing lane is refused', root => {
  fs.rmSync(path.join(root, 'data/review/residual-denominator/lanes/RD-06.json'));
}, /missing required lane/);

expectFailure('dangling source is refused', root => {
  const p = 'data/review/residual-denominator/lanes/RD-02.json';
  const value = read(root, p);
  value.findings[0].source_ids.push('not-a-source');
  write(root, p, value);
}, /dangling source/);

expectFailure('non-HTTPS source is refused', root => {
  const p = 'data/review/residual-denominator/lanes/RD-03.json';
  const value = read(root, p);
  value.sources[0].url = 'http://example.invalid/evidence';
  write(root, p, value);
}, /must use https/);

expectFailure('residual closure is refused', root => {
  const p = 'data/review/residual-denominator/lanes/RD-04.json';
  const value = read(root, p);
  value.terminal_receipt.closed_residual_classes = ['national_prevalence'];
  write(root, p, value);
}, /may not close residual classes/);

expectFailure('wave denominator closure is refused', root => {
  const p = 'data/review/residual-denominator/wave-01.json';
  const value = read(root, p);
  value.denominator.closed_residual_classes = 1;
  value.denominator.open_residual_classes = 41;
  write(root, p, value);
}, /closed denominator must remain 0/);

console.log('residual-denominator fixtures: passed (1 valid corpus + 6 adversarial refusals)');
