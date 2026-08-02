#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const REL = 'data/review/clifford-number/hr-discipline/wave-01';
const PARENT = '8aeb39432df0b74324dc927d8be72ff034fac681';
const AUTHORITY_KEYS = [
  'canonical_product_effects_allowed',
  'control_adoption_allowed',
  'employer_liability_findings_allowed',
  'final_coroner_conclusion_claims_allowed',
  'graph_effects_allowed',
  'individual_culpability_findings_allowed',
  'legal_conclusions_allowed',
  'parent_wave_mutation_allowed',
  'private_source_publication_allowed',
  'publication_effects_allowed',
  'universal_prevalence_findings_allowed',
  'victim_character_inferences_allowed',
];
const AUTHORED = [
  `${REL}/ACCOUNTABILITY-ROUTING.json`,
  `${REL}/ADVERSE-PROCESS-RECEIPT.json`,
  `${REL}/CASE-CHLOE-MOFFAT.json`,
  `${REL}/SOURCE-REGISTER.json`,
  `${REL}/wave-01.json`,
  'docs/research/clifford-number/hr-discipline/WAVE-01.md',
  'schema/clifford-number-hr-disciplinary-case.schema.json',
  'scripts/clifford-number-hr-disciplinary.mjs',
  'test/clifford-number-hr-disciplinary-fixtures.mjs',
];

function parseArgs(argv) {
  let root = process.cwd();
  let mode = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') {
      if (i + 1 >= argv.length) throw new Error('--root requires a value');
      root = path.resolve(argv[++i]);
    } else if (arg === '--write' || arg === '--check') {
      if (mode) throw new Error('choose exactly one of --write or --check');
      mode = arg.slice(2);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!mode) throw new Error('choose exactly one of --write or --check');
  return { root, mode };
}

function readJson(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

function jsonBytes(value) {
  return `${JSON.stringify(stable(value), null, 2)}\n`;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertAuthority(authority, label) {
  assert(authority && typeof authority === 'object' && !Array.isArray(authority), `${label} authority missing`);
  assert(JSON.stringify(Object.keys(authority).sort()) === JSON.stringify([...AUTHORITY_KEYS].sort()), `${label} authority keys drift`);
  for (const key of AUTHORITY_KEYS) assert(authority[key] === false, `${label} ${key} must remain false`);
}

function validate(root) {
  const wave = readJson(root, `${REL}/wave-01.json`);
  const sources = readJson(root, `${REL}/SOURCE-REGISTER.json`);
  const namedCase = readJson(root, `${REL}/CASE-CHLOE-MOFFAT.json`);
  const receipt = readJson(root, `${REL}/ADVERSE-PROCESS-RECEIPT.json`);
  const routing = readJson(root, `${REL}/ACCOUNTABILITY-ROUTING.json`);
  const schema = readJson(root, 'schema/clifford-number-hr-disciplinary-case.schema.json');

  assert(wave.wave_id === 'CN-HRD-W01', 'wave id mismatch');
  assert(wave.parent.head === PARENT, 'parent head mismatch');
  assert(wave.parent.mutation_allowed === false, 'parent mutation must remain false');
  assertAuthority(wave.authority, 'wave');
  assertAuthority(namedCase.authority, 'case');
  assertAuthority(receipt.authority, 'receipt');
  assertAuthority(routing.authority, 'routing');

  assert(sources.private_source_count === 0, 'private sources are refused');
  assert(sources.source_count === sources.sources.length, 'source count mismatch');
  const sourceIds = new Set();
  const sourceUrls = new Set();
  for (const source of sources.sources) {
    assert(source.verification_state === 'independently_recovered_public_source', `weak source verification: ${source.id}`);
    assert(!sourceIds.has(source.id), `duplicate source id: ${source.id}`);
    assert(!sourceUrls.has(source.url), `duplicate source url: ${source.url}`);
    sourceIds.add(source.id);
    sourceUrls.add(source.url);
  }
  const expectedBindings = {
    'guardian-moffat-inquest-2026': 'https://www.theguardian.com/politics/2026/jul/10/uk-treasury-must-change-disciplinary-process-after-workers-suicide-mother-says',
    'surrey-inquest-purpose': 'https://www.surreycc.gov.uk/birth-death-and-ceremonies/death/coroner/inquests',
    'acas-investigation-meetings': 'https://www.acas.org.uk/investigations-for-discipline-and-grievance-step-by-step/step-4-holding-investigation-meetings',
    'hse-stress-enforcement-boundary': 'https://www.hse.gov.uk/stress/reporting-concern.htm',
    'frontiers-last-resort-2024': 'https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2024.1350351/full',
  };
  for (const [id, url] of Object.entries(expectedBindings)) {
    const source = sources.sources.find(item => item.id === id);
    assert(source?.url === url, `source URL mismatch: ${id}`);
  }

  assert(namedCase.object_type === 'named_hr_disciplinary_case', 'case object type mismatch');
  assert(namedCase.public_record_state === 'inquest_reporting_ongoing_no_final_conclusion_recovered', 'final inquest conclusion may not be claimed');
  assert(namedCase.process_events.length === 11, 'exactly 11 process events required');
  assert(namedCase.findings.length === 10, 'exactly 10 findings required');
  assert(namedCase.prohibited_inferences.some(x => x.includes('weak')), 'victim-weakness refusal missing');
  assert(namedCase.terminal_receipt.closed_questions.length === 0, 'case may not close open accountability questions');
  const evidenceIds = new Set();
  for (const item of [...namedCase.process_events, ...namedCase.findings]) {
    assert(!evidenceIds.has(item.id), `duplicate evidence id: ${item.id}`);
    evidenceIds.add(item.id);
    assert(Array.isArray(item.source_ids) && item.source_ids.length > 0, `missing source binding: ${item.id}`);
    for (const id of item.source_ids) assert(sourceIds.has(id), `dangling source ${id} in ${item.id}`);
  }
  const forbiddenStatuses = new Set(['legal_conclusion', 'individual_culpability', 'final_coroner_conclusion', 'victim_character_inference']);
  for (const finding of namedCase.findings) assert(!forbiddenStatuses.has(finding.status), `forbidden finding status: ${finding.id}`);

  assert(receipt.status === 'normative_protocol_not_adopted', 'receipt status must remain unadopted');
  assert(receipt.states.length === 12, 'exactly 12 receipt states required');
  assert(receipt.controls.length === 11, 'exactly 11 controls required');
  assert(receipt.controls.every(control => control.adopted === false), 'controls may not be adopted in this wave');
  assert(receipt.severity_equivalence_trigger.rule.includes('Any three indicators'), 'severity equivalence trigger weakened');
  assert(receipt.case_application.not_audit_completion === true, 'case application must not claim audit completion');
  const welfareState = receipt.states.find(state => state.state_id === 'welfare_risk_assessed');
  assert(welfareState?.required_fields.includes('independent_welfare_owner'), 'independent welfare owner missing');
  const supportState = receipt.states.find(state => state.state_id === 'support_arranged');
  assert(supportState?.required_fields.includes('disposition'), 'support disposition missing');
  const handoffState = receipt.states.find(state => state.state_id === 'immediate_safety_handoff');
  assert(handoffState?.required_fields.includes('overnight_plan'), 'overnight safety handoff missing');

  assert(routing.channels.length === 4, 'exactly four accountability channels required');
  assert(routing.bounded_synthesis.status === 'bounded_synthesis_not_case_outcome', 'routing synthesis authority escalated');
  for (const channel of routing.channels) {
    assert(Array.isArray(channel.source_ids) && channel.source_ids.length > 0, `routing source missing: ${channel.channel_id}`);
    for (const id of channel.source_ids) assert(sourceIds.has(id), `dangling routing source ${id}`);
  }
  for (const id of routing.bounded_synthesis.source_ids) assert(sourceIds.has(id), `dangling routing synthesis source ${id}`);

  assert(schema.properties?.authority?.properties?.individual_culpability_findings_allowed?.const === false, 'schema authority lock weakened');
  assert(schema.properties?.public_record_state?.const === 'inquest_reporting_ongoing_no_final_conclusion_recovered', 'schema final-inquest lock weakened');

  return { wave, sources, namedCase, receipt, routing };
}

function buildSummary(validated) {
  const { sources, namedCase, receipt, routing } = validated;
  const findingStatuses = {};
  for (const finding of namedCase.findings) findingStatuses[finding.status] = (findingStatuses[finding.status] ?? 0) + 1;
  const eventStates = {};
  for (const event of namedCase.process_events) eventStates[event.state] = (eventStates[event.state] ?? 0) + 1;
  return {
    object_type: 'clifford_number_hr_discipline_wave_summary',
    schema_version: 1,
    wave_id: 'CN-HRD-W01',
    as_of: '2026-08-01',
    parent_head: PARENT,
    authority: Object.fromEntries(AUTHORITY_KEYS.map(key => [key, false])),
    case_count: 1,
    case_id: namedCase.case_id,
    public_source_count: sources.source_count,
    private_source_count: sources.private_source_count,
    process_event_count: namedCase.process_events.length,
    process_event_states: eventStates,
    finding_count: namedCase.findings.length,
    finding_statuses: findingStatuses,
    prohibited_inference_count: namedCase.prohibited_inferences.length,
    open_case_question_count: namedCase.terminal_receipt.open_questions.length,
    closed_case_question_count: namedCase.terminal_receipt.closed_questions.length,
    receipt_state_count: receipt.states.length,
    control_count: receipt.controls.length,
    adopted_control_count: receipt.controls.filter(control => control.adopted).length,
    accountability_channel_count: routing.channels.length,
    terminal_state: namedCase.terminal_receipt.state,
  };
}

function buildManifest(root) {
  const paths = [...AUTHORED, `${REL}/WAVE-01-SUMMARY.json`].sort();
  return {
    algorithm: 'sha256',
    schema_version: 1,
    wave_id: 'CN-HRD-W01',
    parent_head: PARENT,
    manifest_excludes_self: true,
    exact_file_count: paths.length,
    files: paths.map(rel => {
      const bytes = fs.readFileSync(path.join(root, rel));
      return { path: rel, bytes: bytes.length, sha256: sha256(bytes) };
    }),
  };
}

function main() {
  const { root, mode } = parseArgs(process.argv.slice(2));
  const validated = validate(root);
  const summaryPath = path.join(root, REL, 'WAVE-01-SUMMARY.json');
  const manifestPath = path.join(root, REL, 'MANIFEST.json');
  const summaryBytes = jsonBytes(buildSummary(validated));
  if (mode === 'write') fs.writeFileSync(summaryPath, summaryBytes);
  else assert(fs.readFileSync(summaryPath, 'utf8') === summaryBytes, 'stale Wave 01 summary bytes');
  const manifestBytes = jsonBytes(buildManifest(root));
  if (mode === 'write') fs.writeFileSync(manifestPath, manifestBytes);
  else assert(fs.readFileSync(manifestPath, 'utf8') === manifestBytes, 'stale Wave 01 manifest bytes');
  console.log(`clifford-number HR disciplinary ${mode}: passed (1 case, ${validated.sources.source_count} public sources, ${validated.namedCase.process_events.length} events, ${validated.namedCase.findings.length} findings, ${validated.receipt.states.length} receipt states, 0 adopted controls)`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
