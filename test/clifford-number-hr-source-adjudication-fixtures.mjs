#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { generate, validateCorpus } from '../scripts/clifford-number-hr-source-adjudication.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(here, '..');
const BASE = 'data/review/clifford-number/hr-selection/wave-02';

function copyFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cnhr-w02-'));
  for (const relative of ['data', 'docs', 'schema', 'scripts', 'test']) {
    const from = path.join(sourceRoot, relative);
    const to = path.join(root, relative);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
  }
  return root;
}
function read(root, relative) { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
function write(root, relative, value) { fs.writeFileSync(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`); }
function expectFailure(label, mutate, pattern) {
  const root = copyFixture();
  try { mutate(root); assert.throws(() => validateCorpus(root), pattern, label); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}

validateCorpus(sourceRoot);
generate(sourceRoot);

expectFailure('authority escalation is refused', root => {
  const p = `${BASE}/lanes/HRV-01.json`; const v = read(root, p);
  v.authority.publication_effects_allowed = true; write(root, p, v);
}, /publication_effects_allowed must remain false/);

expectFailure('missing lane is refused', root => {
  fs.rmSync(path.join(root, `${BASE}/lanes/HRV-06.json`));
}, /missing required lane/);

expectFailure('source rebinding is refused', root => {
  const p = `${BASE}/sources/SOURCES-01.json`; const v = read(root, p);
  v.sources[0].url = 'https://example.invalid/rebound'; write(root, p, v);
}, /source id\/url map rebound/);

expectFailure('duplicate source identity is refused', root => {
  const p = `${BASE}/sources/SOURCES-02.json`; const v = read(root, p);
  v.sources[0].id = 'pendleton-national-archives'; write(root, p, v);
}, /duplicate pendleton-national-archives/);

expectFailure('dangling source is refused', root => {
  const p = `${BASE}/lanes/HRV-03.json`; const v = read(root, p);
  v.findings[0].source_ids.push('not-a-source'); write(root, p, v);
}, /dangling source/);

expectFailure('false raw-byte custody is refused', root => {
  const p = `${BASE}/sources/SOURCES-03.json`; const v = read(root, p);
  v.sources[0].raw_source_bytes_retained = true; write(root, p, v);
}, /raw remote bytes may not be claimed/);

expectFailure('legal authority is refused', root => {
  const p = `${BASE}/wave-02.json`; const v = read(root, p);
  v.authority.legal_conclusions_allowed = true; write(root, p, v);
}, /legal_conclusions_allowed must remain false/);

expectFailure('employer-specific causation is refused', root => {
  const p = `${BASE}/CLAIM-PROMOTION-LEDGER.json`; const v = read(root, p);
  v.authority.employer_specific_causation_findings_allowed = true; write(root, p, v);
}, /employer_specific_causation_findings_allowed must remain false/);

expectFailure('Wave 01 mutation is refused', root => {
  const p = 'data/review/clifford-number/hr-selection/lanes/HR-01.json'; const v = read(root, p);
  v.findings[0].claim = 'rewritten'; write(root, p, v);
}, /Wave 01 (?:byte count|file hash) changed/);

expectFailure('control adoption is refused', root => {
  const p = `${BASE}/DECISION-RECEIPT-PROTOCOL.json`; const v = read(root, p);
  v.controls[0].adopted = true; write(root, p, v);
}, /control adoption forbidden/);

expectFailure('private-source dependency is refused', root => {
  const p = `${BASE}/DECISION-RECEIPT-PROTOCOL.json`; const v = read(root, p);
  v.private_source_required = true; write(root, p, v);
}, /private archive may not be required/);

expectFailure('incomplete Wave 01 adjudication is refused', root => {
  const p = `${BASE}/CLAIM-PROMOTION-LEDGER.json`; const v = read(root, p);
  v.entries.pop(); write(root, p, v);
}, /complete 24-entry ledger required/);

expectFailure('automatic candidate entitlement is refused', root => {
  const p = `${BASE}/DECISION-RECEIPT-PROTOCOL.json`; const v = read(root, p);
  v.exploration_protocol.candidate_entitlement_created = true; write(root, p, v);
}, /automatic candidate entitlement forbidden/);

console.log('clifford-number HR source adjudication fixtures: passed (1 valid corpus + 13 adversarial refusals)');
