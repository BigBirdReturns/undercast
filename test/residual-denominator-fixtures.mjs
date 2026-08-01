#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { parseArgs, validateCorpus } from '../scripts/residual-denominator.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(here, '..');

function copyFixture() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-wave-'));
  for (const relative of ['data/review/residual-denominator', 'schema/residual-denominator-lane.schema.json']) {
    const source = path.join(sourceRoot, relative);
    const destination = path.join(target, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true });
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
}, /value must equal schema const|publication_effects_allowed must remain false/);

expectFailure('missing lane is refused', root => {
  fs.rmSync(path.join(root, 'data/review/residual-denominator/lanes/RD-06.json'));
}, /lane directory must contain exactly/);

expectFailure('unexpected lane is refused', root => {
  write(root, 'data/review/residual-denominator/lanes/RD-07.json', {});
}, /lane directory must contain exactly/);

expectFailure('dangling source is refused', root => {
  const p = 'data/review/residual-denominator/lanes/RD-02.json';
  const value = read(root, p);
  value.findings[0].source_ids.push('not-a-source');
  write(root, p, value);
}, /dangling source/);

expectFailure('source-free finding is refused', root => {
  const p = 'data/review/residual-denominator/lanes/RD-02.json';
  const value = read(root, p);
  value.findings[0].source_ids = [];
  write(root, p, value);
}, /minItems 1|at least one source/);

expectFailure('non-HTTPS source is refused', root => {
  const p = 'data/review/residual-denominator/lanes/RD-03.json';
  const value = read(root, p);
  value.sources[0].url = 'http://example.invalid/evidence';
  write(root, p, value);
}, /does not match \^https:\/\//);

expectFailure('invalid finding status is refused by the schema', root => {
  const p = 'data/review/residual-denominator/lanes/RD-03.json';
  const value = read(root, p);
  value.findings[0].status = 'confirmed_by_vibes';
  write(root, p, value);
}, /not in schema enum/);

expectFailure('unexpected lane property is refused by the schema', root => {
  const p = 'data/review/residual-denominator/lanes/RD-04.json';
  const value = read(root, p);
  value.publication_authority = true;
  write(root, p, value);
}, /additional property publication_authority is not allowed/);

expectFailure('cross-type duplicate evidence ids are refused', root => {
  const p = 'data/review/residual-denominator/lanes/RD-05.json';
  const value = read(root, p);
  value.findings[0].id = value.observations[0].id;
  write(root, p, value);
}, /duplicate id/);

expectFailure('duplicate open residual class is refused', root => {
  const p = 'data/review/residual-denominator/lanes/RD-06.json';
  const value = read(root, p);
  value.terminal_receipt.open_residual_classes.push(value.terminal_receipt.open_residual_classes[0]);
  write(root, p, value);
}, /array items must be unique|values must be unique/);

expectFailure('residual closure is refused', root => {
  const p = 'data/review/residual-denominator/lanes/RD-04.json';
  const value = read(root, p);
  value.terminal_receipt.closed_residual_classes = ['national_prevalence'];
  write(root, p, value);
}, /maxItems 0|may not close residual classes/);

expectFailure('wave denominator closure is refused', root => {
  const p = 'data/review/residual-denominator/wave-01.json';
  const value = read(root, p);
  value.denominator.closed_residual_classes = 1;
  value.denominator.open_residual_classes = 41;
  write(root, p, value);
}, /closed denominator must remain 0/);

expectFailure('schema weakening is refused', root => {
  const p = 'schema/residual-denominator-lane.schema.json';
  const value = read(root, p);
  value.properties.findings.items.properties.source_ids.minItems = 0;
  write(root, p, value);
}, /finding source_ids must require one or more unique sources/);

assert.throws(() => parseArgs(['--write', '--check']), /choose exactly one/, 'conflicting modes fail closed');
assert.throws(() => parseArgs(['--root']), /requires a value/, 'missing root value fails closed');
assert.throws(() => parseArgs(['--banana']), /unknown argument/, 'unknown CLI arguments fail closed');

console.log('residual-denominator fixtures: passed (1 valid corpus + 15 adversarial refusals)');
