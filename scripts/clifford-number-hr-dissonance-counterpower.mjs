#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import process from 'node:process';

const PARENT_HEAD = '9f29da67171d30de0e9585db72f36a932ab59719';
const PARENT_MANIFEST = 'a3bb3ab89a2637a419c383ada6ad1381db212ccd27ad94f6bcf17a54def0b567';
const WAVE = 'data/review/clifford-number/hr-discipline/wave-04';
const EXPECTED_LANES = ['HRDCP-01','HRDCP-02','HRDCP-03','HRDCP-04','HRDCP-05','HRDCP-06'];
const AUTHORITY_KEYS = [
  'ai_caused_chloe_moffat_death_claims_allowed',
  'canonical_product_effects_allowed',
  'control_adoption_allowed',
  'dissonance_purge_universal_claims_allowed',
  'employer_liability_findings_allowed',
  'employer_specific_causation_findings_allowed',
  'final_coroner_conclusion_claims_allowed',
  'graph_effects_allowed',
  'individual_culpability_findings_allowed',
  'legal_conclusions_allowed',
  'named_company_intent_or_misuse_beyond_public_record_allowed',
  'parent_wave_mutation_allowed',
  'private_source_publication_allowed',
  'protected_activity_classification_claims_allowed',
  'publication_effects_allowed',
  'universal_prevalence_findings_allowed',
  'victim_character_inferences_allowed',
].sort();

function fail(message) { throw new Error(message); }
function json(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function stable(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function assert(cond, message) { if (!cond) fail(message); }
function assertAuthority(obj, where) {
  assert(obj && typeof obj === 'object' && !Array.isArray(obj), `${where}: authority missing`);
  assert(JSON.stringify(Object.keys(obj).sort()) === JSON.stringify(AUTHORITY_KEYS), `${where}: authority key drift`);
  for (const key of AUTHORITY_KEYS) assert(obj[key] === false, `${where}: authority escalation ${key}`);
}
function exactKeys(obj, keys, where) {
  assert(JSON.stringify(Object.keys(obj).sort()) === JSON.stringify([...keys].sort()), `${where}: object shape drift`);
}
function sourceRefs(items, sourceIds, where) {
  for (const item of items) {
    assert(Array.isArray(item.source_ids) && item.source_ids.length > 0, `${where}/${item.id}: no sources`);
    assert(new Set(item.source_ids).size === item.source_ids.length, `${where}/${item.id}: duplicate source`);
    for (const id of item.source_ids) assert(sourceIds.has(id), `${where}/${item.id}: dangling source ${id}`);
    assert(Array.isArray(item.limits) && item.limits.length > 0, `${where}/${item.id}: limits absent`);
  }
}
function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) out.push(...listFiles(path)); else out.push(path);
  }
  return out;
}

export function validate(root, mode = 'check') {
  const waveDir = resolve(root, WAVE);
  const wave = json(resolve(waveDir, 'wave-04.json'));
  assert(wave.wave_id === 'CN-HRDCP-W04', 'wave id drift');
  assert(wave.parent.head === PARENT_HEAD, 'parent head drift');
  assert(wave.parent.manifest_sha256 === PARENT_MANIFEST, 'parent manifest drift');
  assert(wave.parent.mutation_allowed === false, 'parent mutation authorized');
  assertAuthority(wave.authority, 'wave');
  assert(wave.central_mechanism.includes('inspect, pause, contest, restore and force system revision'), 'central counterpower mechanism weakened');
  assert(wave.terminal_state.includes('counterpower'), 'terminal state drift');

  const sourceRegister = json(resolve(waveDir, 'SOURCE-REGISTER.json'));
  assert(sourceRegister.source_count === 24, 'source denominator drift');
  assert(sourceRegister.private_source_count === 0, 'private source publication');
  assert(sourceRegister.remote_raw_bytes_committed === false, 'remote raw bytes authority drift');
  assert(sourceRegister.source_shards.length === 3, 'source shard denominator drift');
  const sources = [];
  for (const path of sourceRegister.source_shards) {
    const shard = json(resolve(root, path));
    assert(shard.object_type === 'dissonance_counterpower_source_shard', `${path}: shard type drift`);
    sources.push(...shard.sources);
  }
  assert(sources.length === 24, 'source records not 24');
  const ids = new Set();
  const urls = new Set();
  for (const source of sources) {
    assert(!ids.has(source.id), `duplicate source id ${source.id}`); ids.add(source.id);
    assert(!urls.has(source.url), `duplicate source url ${source.url}`); urls.add(source.url);
    assert(source.status === 'independently_recovered_public_source', `${source.id}: source status drift`);
    assert(source.accessed === '2026-08-01', `${source.id}: accessed date drift`);
    assert(Array.isArray(source.limits) && source.limits.length > 0, `${source.id}: source limits absent`);
  }
  const mapBytes = `${[...sources].sort((a,b)=>a.id.localeCompare(b.id)).map(s=>`${s.id}\t${s.url}`).join('\n')}\n`;
  assert(sha256(mapBytes) === sourceRegister.source_id_url_map_sha256, 'source ID/URL map drift');

  const laneDir = resolve(waveDir, 'lanes');
  const laneFiles = readdirSync(laneDir).sort();
  assert(JSON.stringify(laneFiles) === JSON.stringify(EXPECTED_LANES.map(id=>`${id}.json`)), 'lane file denominator drift');
  const lanes = [];
  const evidenceIds = new Set();
  const findingStatuses = {};
  for (const laneId of EXPECTED_LANES) {
    const lane = json(resolve(laneDir, `${laneId}.json`));
    exactKeys(lane, ['schema_version','object_type','lane_id','title','terminal_state','authority','observations','findings','open_questions'], laneId);
    assert(lane.schema_version === 1 && lane.object_type === 'dissonance_counterpower_lane', `${laneId}: type drift`);
    assert(lane.lane_id === laneId, `${laneId}: ID drift`);
    assertAuthority(lane.authority, laneId);
    assert(lane.observations.length === 6, `${laneId}: observation denominator drift`);
    assert(lane.findings.length === 4, `${laneId}: finding denominator drift`);
    assert(lane.open_questions.length === 6 && new Set(lane.open_questions).size === 6, `${laneId}: open question denominator drift`);
    sourceRefs(lane.observations, ids, laneId);
    sourceRefs(lane.findings, ids, laneId);
    for (const item of [...lane.observations, ...lane.findings]) {
      assert(!evidenceIds.has(item.id), `duplicate evidence ID ${item.id}`); evidenceIds.add(item.id);
    }
    for (const item of lane.findings) findingStatuses[item.status] = (findingStatuses[item.status] ?? 0) + 1;
    lanes.push(lane);
  }

  const jurisdictions = json(resolve(waveDir, 'JURISDICTION-STATE-REGISTER.json'));
  assert(jurisdictions.as_of === '2026-08-01', 'jurisdiction date drift');
  assert(jurisdictions.jurisdiction_state_count === 12 && jurisdictions.states.length === 12, 'jurisdiction denominator drift');
  const stateMap = new Map(jurisdictions.states.map(s=>[s.id,s]));
  assert(stateMap.get('EU-PLATFORM-WORK')?.state === 'in_force_transposition_due', 'platform directive temporal promotion');
  assert(stateMap.get('EU-PLATFORM-WORK')?.date === '2026-12-02', 'platform directive transposition date drift');
  assert(stateMap.get('EU-AI-ACT-EMOTION')?.state === 'operative', 'emotion-recognition prohibition demoted');
  assert(stateMap.get('EU-AI-ACT-EMOTION')?.date === '2025-02-02', 'emotion-recognition date drift');
  assert(stateMap.get('EU-AI-ACT-EMPLOYMENT-HIGH-RISK')?.state === 'enacted_pre_effective', 'future high-risk duties promoted');
  assert(stateMap.get('EU-AI-ACT-EMPLOYMENT-HIGH-RISK')?.date === '2027-12-02', 'high-risk application date drift');
  for (const state of jurisdictions.states) for (const id of state.source_ids) assert(ids.has(id), `${state.id}: dangling source ${id}`);

  const protectedSignals = json(resolve(waveDir, 'PROTECTED-SIGNAL-BOUNDARY.json'));
  assert(protectedSignals.category_count === 8 && protectedSignals.categories.length === 8, 'protected-signal denominator drift');
  assert(protectedSignals.central_rule.includes('Dissonance is not misconduct by default'), 'protected-signal central rule removed');
  assert(protectedSignals.hard_refusals.includes('predict_exercise_of_fundamental_rights'), 'fundamental-right prediction refusal removed');
  assert(protectedSignals.hard_refusals.includes('treat_accommodation_request_as_noncompliance'), 'accommodation refusal removed');
  assertAuthority(protectedSignals.authority, 'protected signals');
  for (const category of protectedSignals.categories) for (const id of category.source_ids) assert(ids.has(id), `${category.id}: dangling source ${id}`);

  const counterpower = json(resolve(waveDir, 'COUNTERPOWER-REGISTER.json'));
  assert(counterpower.actor_count === 10 && counterpower.actors.length === 10, 'counterpower actor denominator drift');
  const actorMap = new Map(counterpower.actors.map(a=>[a.id,a]));
  assert(actorMap.has('union_or_works_council'), 'collective counterpower removed');
  assert(actorMap.has('safety_committee'), 'safety counterpower removed');
  assert(actorMap.has('accommodation_owner'), 'accommodation counterpower removed');
  assert(actorMap.get('human_reviewer')?.powers.includes('reverse'), 'human reviewer cannot reverse');
  assert(counterpower.failure_definition.includes('delay, alter, reverse, restore or force revision'), 'counterpower definition weakened');
  assertAuthority(counterpower.authority, 'counterpower register');

  const protocol = json(resolve(waveDir, 'DISSONANCE-PRESERVATION-PROTOCOL.json'));
  assert(protocol.adopted === false, 'protocol adopted');
  assert(protocol.state_count === 16 && protocol.states.length === 16, 'protocol state denominator drift');
  assert(protocol.control_count === 18 && protocol.controls.length === 18, 'protocol control denominator drift');
  assert(protocol.adopted_control_count === 0, 'adopted control count drift');
  assert(protocol.controls.every(c=>c.adopted === false), 'control adoption');
  const stateIds = protocol.states.map(s=>s.id);
  for (const required of ['protected_signal_taxonomy_fixed','worker_and_representative_consultation_completed','context_safety_and_accommodation_attached','support_and_welfare_arranged','meaningful_human_review_assigned','remedy_and_restoration_completed','system_revision_completed','outcome_and_survivor_bias_reconciled']) assert(stateIds.includes(required), `required state removed: ${required}`);
  assert(protocol.human_review_definition.authority_to_reverse === true, 'token human review');
  assert(protocol.human_review_definition.token_presence_sufficient === false, 'token presence accepted');
  assert(protocol.hard_stops.includes('acute_safety_or_distress_handoff_required'), 'acute safety stop removed');
  assert(protocol.reconciliation_population.includes('worker_exits') && protocol.reconciliation_population.includes('worker_silence_or_deterrence') && protocol.reconciliation_population.includes('upheld_challenges'), 'survivor-bias reconciliation weakened');
  assertAuthority(protocol.authority, 'protocol');

  const chloe = json(resolve(waveDir, 'CHLOE-NON-AI-BASELINE-JOIN.json'));
  assert(chloe.named_non_ai_baseline === true, 'Chloe non-AI boundary removed');
  assert(chloe.ai_use_established === false && chloe.algorithmic_monitoring_established === false && chloe.automated_decision_established === false && chloe.vendor_system_established === false, 'invented AI use in Chloe case');
  assert(chloe.prohibited_inferences.includes('ai_caused_chloe_moffat_death'), 'Chloe AI causation refusal removed');
  assert(chloe.prohibited_inferences.includes('victim_weakness_or_character_inference'), 'victim-character refusal removed');
  assertAuthority(chloe.authority, 'Chloe join');

  const summary = {
    schema_version: 1,
    wave_id: 'CN-HRDCP-W04',
    as_of: '2026-08-01',
    generated_from: 'validated protected-signal, counterpower, jurisdiction and lane ledgers',
    parent: { head: PARENT_HEAD, manifest_sha256: PARENT_MANIFEST, mutation_count: 0 },
    source_count: sources.length,
    private_source_count: 0,
    lane_count: lanes.length,
    observation_count: lanes.reduce((n,l)=>n+l.observations.length,0),
    finding_count: lanes.reduce((n,l)=>n+l.findings.length,0),
    finding_statuses: Object.fromEntries(Object.entries(findingStatuses).sort(([a],[b])=>a.localeCompare(b))),
    jurisdiction_state_count: jurisdictions.states.length,
    protected_signal_category_count: protectedSignals.categories.length,
    counterpower_actor_count: counterpower.actors.length,
    protocol_state_count: protocol.states.length,
    protocol_control_count: protocol.controls.length,
    adopted_control_count: 0,
    chloe_ai_use_findings: 0,
    authority: wave.authority,
    lanes: lanes.map(l=>({ lane_id:l.lane_id, title:l.title, terminal_state:l.terminal_state, observation_count:l.observations.length, finding_count:l.findings.length, open_questions:l.open_questions })),
  };
  const summaryPath = resolve(waveDir, 'WAVE-04-SUMMARY.json');
  if (mode === 'write') writeFileSync(summaryPath, stable(summary)); else assert(readFileSync(summaryPath, 'utf8') === stable(summary), 'stale Wave 04 summary bytes');

  const manifestPath = resolve(waveDir, 'MANIFEST.json');
  const allFiles = listFiles(root).map(p=>relative(root,p).replaceAll('\\','/')).filter(p=>p !== `${WAVE}/MANIFEST.json`).sort();
  const expectedFiles = [
    `${WAVE}/CHLOE-NON-AI-BASELINE-JOIN.json`,
    `${WAVE}/COUNTERPOWER-REGISTER.json`,
    `${WAVE}/DISSONANCE-PRESERVATION-PROTOCOL.json`,
    `${WAVE}/JURISDICTION-STATE-REGISTER.json`,
    `${WAVE}/PROTECTED-SIGNAL-BOUNDARY.json`,
    `${WAVE}/SOURCE-REGISTER.json`,
    `${WAVE}/WAVE-04-SUMMARY.json`,
    ...EXPECTED_LANES.map(id=>`${WAVE}/lanes/${id}.json`),
    ...[1,2,3].map(i=>`${WAVE}/sources/SOURCES-0${i}.json`),
    `${WAVE}/wave-04.json`,
    'docs/research/clifford-number/hr-discipline/WAVE-04.md',
    'schema/clifford-number-hr-dissonance-counterpower-lane.schema.json',
    'scripts/clifford-number-hr-dissonance-counterpower.mjs',
    'test/clifford-number-hr-dissonance-counterpower-fixtures.mjs',
  ].sort();
  assert(JSON.stringify(allFiles) === JSON.stringify(expectedFiles), `exact file denominator drift: ${JSON.stringify({missing:expectedFiles.filter(x=>!allFiles.includes(x)),extra:allFiles.filter(x=>!expectedFiles.includes(x))})}`);
  const manifest = {
    schema_version: 1,
    wave_id: 'CN-HRDCP-W04',
    algorithm: 'sha256',
    parent_head: PARENT_HEAD,
    parent_manifest_sha256: PARENT_MANIFEST,
    manifest_excludes_self: true,
    exact_file_count: allFiles.length,
    files: allFiles.map(path=>{ const bytes=readFileSync(resolve(root,path)); return { path, bytes:bytes.length, sha256:sha256(bytes) }; }),
  };
  if (mode === 'write') writeFileSync(manifestPath, stable(manifest)); else assert(readFileSync(manifestPath, 'utf8') === stable(manifest), 'stale Wave 04 manifest bytes');

  return { sources:sources.length, lanes:lanes.length, observations:summary.observation_count, findings:summary.finding_count, jurisdictions:jurisdictions.states.length, protocolStates:protocol.states.length, controls:protocol.controls.length, counterpowerActors:counterpower.actors.length };
}

function parseArgs(argv) {
  let mode = null; let root = process.cwd();
  for (let i=0;i<argv.length;i++) {
    const arg=argv[i];
    if (arg === '--write' || arg === '--check') { assert(mode === null, 'conflicting or duplicate mode'); mode=arg.slice(2); }
    else if (arg === '--root') { assert(i+1 < argv.length, '--root requires a value'); root=resolve(argv[++i]); }
    else fail(`unknown argument: ${arg}`);
  }
  assert(mode !== null, 'one of --write or --check is required');
  return {mode,root};
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  try {
    const {mode,root}=parseArgs(process.argv.slice(2));
    const result=validate(root,mode);
    console.log(`dissonance counterpower ${mode}: passed (${result.sources} sources, ${result.lanes} lanes, ${result.observations} observations, ${result.findings} findings, ${result.jurisdictions} jurisdiction states, ${result.protocolStates} protocol states, ${result.controls} unadopted controls, ${result.counterpowerActors} counterpower actors)`);
  } catch (error) { console.error(error.message); process.exit(1); }
}
