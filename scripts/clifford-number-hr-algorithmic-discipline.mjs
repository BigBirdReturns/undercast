#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const REL = 'data/review/clifford-number/hr-discipline/wave-02';
const PARENT_REL = 'data/review/clifford-number/hr-discipline/wave-01';
const PARENT_HEAD = '59a42fc1af156edaba4b0ad5c6e2015d5faa68f9';
const PARENT_MANIFEST_SHA256 = '504f34b05892ecc092f577884fe8b58de50935f8bfca8bac9923c6e53681c5a8';
const SOURCE_MAP_SHA256 = '4ebad2f168b7a93c0f6acbb60700dd6a8531498e1bcaf5b121918e995bf90720';
const AS_OF = '2026-08-01';
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
  'named_vendor_misuse_findings_allowed',
  'parent_wave_mutation_allowed',
  'private_source_publication_allowed',
  'protected_activity_classification_claims_allowed',
  'publication_effects_allowed',
  'universal_prevalence_findings_allowed',
  'victim_character_inferences_allowed',
];
const LANE_IDS = ['HRDA-01', 'HRDA-02', 'HRDA-03', 'HRDA-04', 'HRDA-05', 'HRDA-06'];
const AUTHORED = [
  `${REL}/ADVERSE-AI-PROCESS-RECEIPT.json`,
  `${REL}/ALGORITHMIC-DISSONANCE-CONTROL-LOOP.json`,
  `${REL}/CHLOE-MOFFAT-NON-AI-BASELINE-JOIN.json`,
  `${REL}/JURISDICTION-STATE-REGISTER.json`,
  `${REL}/SOURCE-REGISTER.json`,
  `${REL}/wave-02.json`,
  ...LANE_IDS.map(id => `${REL}/lanes/${id}.json`),
  'docs/research/clifford-number/hr-discipline/WAVE-02.md',
  'schema/clifford-number-hr-algorithmic-discipline-lane.schema.json',
  'scripts/clifford-number-hr-algorithmic-discipline.mjs',
  'test/clifford-number-hr-algorithmic-discipline-fixtures.mjs',
];
const ALLOWED_FINDING_STATUSES = new Set([
  'bounded_synthesis',
  'independently_supported_scoped',
  'legal_boundary_recovered',
  'normative_control_not_adopted',
  'vendor_boundary_recovered',
]);
const REQUIRED_JURISDICTION_IDS = [
  'EU-AI-ACT-HIGH-RISK-EMPLOYMENT',
  'EU-AI-ACT-WORKPLACE-EMOTION',
  'EU-PARLIAMENT-HORIZONTAL-RECOMMENDATION',
  'EU-PLATFORM-WORK-DIRECTIVE',
  'UK-ICO-WORKER-MONITORING',
  'US-CA-WAREHOUSE-QUOTAS',
  'US-CFPB-WORKER-SCORES',
  'US-IL-AI-EMPLOYMENT',
  'US-NLRA-CONCERTED-ACTIVITY',
  'US-SEATTLE-APP-DEACTIVATION',
].sort();

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

function sameMembers(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

function assertAuthority(authority, label) {
  assert(authority && typeof authority === 'object' && !Array.isArray(authority), `${label} authority missing`);
  assert(sameMembers(Object.keys(authority), AUTHORITY_KEYS), `${label} authority keys drift`);
  for (const key of AUTHORITY_KEYS) assert(authority[key] === false, `${label} ${key} must remain false`);
}

function parentManifestDigest(root) {
  return sha256(fs.readFileSync(path.join(root, PARENT_REL, 'MANIFEST.json')));
}

function sourceMapDigest(sources) {
  const bytes = `${[...sources]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(source => `${source.id}\t${source.url}`)
    .join('\n')}\n`;
  return sha256(bytes);
}

function validateSchemaShape(schema) {
  assert(schema.additionalProperties === false, 'schema must remain closed');
  const authority = schema.properties?.authority;
  assert(authority?.additionalProperties === false, 'schema authority must remain closed');
  assert(sameMembers(Object.keys(authority.properties ?? {}), AUTHORITY_KEYS), 'schema authority key set drift');
  for (const key of AUTHORITY_KEYS) assert(authority.properties[key]?.const === false, `schema authority lock weakened: ${key}`);
  assert(schema.properties?.observations?.minItems === 6 && schema.properties?.observations?.maxItems === 6, 'schema observation denominator weakened');
  assert(schema.properties?.findings?.minItems === 4 && schema.properties?.findings?.maxItems === 4, 'schema finding denominator weakened');
  assert(schema.properties?.open_questions?.minItems === 6 && schema.properties?.open_questions?.maxItems === 6, 'schema open-question denominator weakened');
}

function validate(root) {
  assert(parentManifestDigest(root) === PARENT_MANIFEST_SHA256, 'parent Wave 01 manifest drift');

  const wave = readJson(root, `${REL}/wave-02.json`);
  const sourceRegister = readJson(root, `${REL}/SOURCE-REGISTER.json`);
  const jurisdictionRegister = readJson(root, `${REL}/JURISDICTION-STATE-REGISTER.json`);
  const controlLoop = readJson(root, `${REL}/ALGORITHMIC-DISSONANCE-CONTROL-LOOP.json`);
  const receipt = readJson(root, `${REL}/ADVERSE-AI-PROCESS-RECEIPT.json`);
  const chloeJoin = readJson(root, `${REL}/CHLOE-MOFFAT-NON-AI-BASELINE-JOIN.json`);
  const schema = readJson(root, 'schema/clifford-number-hr-algorithmic-discipline-lane.schema.json');

  assert(wave.wave_id === 'CN-HRDA-W02', 'wave id mismatch');
  assert(wave.as_of === AS_OF, 'wave temporal boundary mismatch');
  assert(wave.parent.head === PARENT_HEAD, 'parent head mismatch');
  assert(wave.parent.manifest_sha256 === PARENT_MANIFEST_SHA256, 'parent manifest declaration mismatch');
  assert(wave.parent.mutation_allowed === false, 'parent mutation must remain false');
  assert(sameMembers(wave.lane_ids, LANE_IDS), 'wave lane ids drift');
  assert(wave.central_mechanism.includes('refusing a universal claim'), 'universal-purge refusal missing from central mechanism');
  assertAuthority(wave.authority, 'wave');
  assertAuthority(controlLoop.authority, 'control loop');
  assertAuthority(receipt.authority, 'receipt');
  assertAuthority(chloeJoin.authority, 'Chloe join');
  validateSchemaShape(schema);

  assert(sourceRegister.parent.head === PARENT_HEAD, 'source-register parent head mismatch');
  assert(sourceRegister.parent.manifest_sha256 === PARENT_MANIFEST_SHA256, 'source-register parent manifest mismatch');
  assert(sourceRegister.parent.mutation_allowed === false, 'source-register parent mutation must remain false');
  assert(sourceRegister.private_source_count === 0, 'private sources are refused');
  assert(sourceRegister.source_count === 23 && sourceRegister.sources.length === 23, 'exactly 23 source records required');
  const sourceIds = new Set();
  const sourceUrls = new Set();
  for (const source of sourceRegister.sources) {
    assert(['independently_recovered_public_source', 'vendor_declared_public_source'].includes(source.verification_state), `invalid source verification: ${source.id}`);
    assert(!sourceIds.has(source.id), `duplicate source id: ${source.id}`);
    assert(!sourceUrls.has(source.url), `duplicate source URL: ${source.url}`);
    assert(Array.isArray(source.supports) && source.supports.length > 0, `source supports missing: ${source.id}`);
    assert(Array.isArray(source.limits) && source.limits.length > 0, `source limits missing: ${source.id}`);
    if (source.verification_state === 'vendor_declared_public_source') {
      assert(source.authority_type.startsWith('vendor_'), `vendor source authority mismatch: ${source.id}`);
    }
    sourceIds.add(source.id);
    sourceUrls.add(source.url);
  }
  assert(sourceMapDigest(sourceRegister.sources) === SOURCE_MAP_SHA256, 'source identity/URL map rebound');

  const laneFiles = fs.readdirSync(path.join(root, REL, 'lanes')).filter(name => name.endsWith('.json')).sort();
  assert(JSON.stringify(laneFiles) === JSON.stringify(LANE_IDS.map(id => `${id}.json`)), 'lane directory denominator drift');
  const lanes = laneFiles.map(name => readJson(root, `${REL}/lanes/${name}`));
  const evidenceIds = new Set();
  for (let index = 0; index < lanes.length; index += 1) {
    const lane = lanes[index];
    const expectedId = LANE_IDS[index];
    assert(lane.lane_id === expectedId, `lane id mismatch: ${expectedId}`);
    assert(lane.object_type === 'algorithmic_discipline_lane', `lane object type mismatch: ${expectedId}`);
    assert(lane.schema_version === 1, `lane schema version mismatch: ${expectedId}`);
    assertAuthority(lane.authority, expectedId);
    assert(lane.observations.length === 6, `exactly 6 observations required: ${expectedId}`);
    assert(lane.findings.length === 4, `exactly 4 findings required: ${expectedId}`);
    assert(lane.open_questions.length === 6 && new Set(lane.open_questions).size === 6, `exactly 6 unique open questions required: ${expectedId}`);
    for (const [kind, items] of [['observation', lane.observations], ['finding', lane.findings]]) {
      for (const item of items) {
        assert(!evidenceIds.has(item.id), `duplicate evidence id: ${item.id}`);
        evidenceIds.add(item.id);
        assert(Array.isArray(item.source_ids) && item.source_ids.length > 0, `missing source binding: ${item.id}`);
        assert(new Set(item.source_ids).size === item.source_ids.length, `duplicate source binding: ${item.id}`);
        for (const id of item.source_ids) assert(sourceIds.has(id), `dangling source ${id} in ${item.id}`);
        assert(Array.isArray(item.limits) && item.limits.length > 0, `limits missing: ${item.id}`);
        if (kind === 'finding') assert(ALLOWED_FINDING_STATUSES.has(item.status), `forbidden finding status: ${item.id}`);
      }
    }
  }
  assert(evidenceIds.size === 60, 'exact evidence denominator must be 60');

  assert(jurisdictionRegister.as_of === AS_OF, 'jurisdiction temporal boundary mismatch');
  assert(jurisdictionRegister.jurisdiction_state_count === 10 && jurisdictionRegister.states.length === 10, 'exactly 10 jurisdiction states required');
  const jurisdictionIds = jurisdictionRegister.states.map(state => state.id);
  assert(sameMembers(jurisdictionIds, REQUIRED_JURISDICTION_IDS), 'jurisdiction state ids drift');
  for (const state of jurisdictionRegister.states) {
    assert(Array.isArray(state.source_ids) && state.source_ids.length > 0, `jurisdiction source missing: ${state.id}`);
    for (const id of state.source_ids) assert(sourceIds.has(id), `dangling jurisdiction source ${id}`);
    assert(Array.isArray(state.limits) && state.limits.length > 0, `jurisdiction limits missing: ${state.id}`);
  }
  const euHighRisk = jurisdictionRegister.states.find(state => state.id === 'EU-AI-ACT-HIGH-RISK-EMPLOYMENT');
  assert(euHighRisk?.state === 'enacted_pre_effective' && euHighRisk.boundary_date === '2027-12-02', 'EU high-risk employment duties temporally promoted');
  const emotion = jurisdictionRegister.states.find(state => state.id === 'EU-AI-ACT-WORKPLACE-EMOTION');
  assert(emotion?.state === 'operative_prohibition' && emotion.boundary_date === '2025-02-02', 'workplace emotion-recognition boundary drift');
  const platform = jurisdictionRegister.states.find(state => state.id === 'EU-PLATFORM-WORK-DIRECTIVE');
  assert(platform?.state === 'in_force_transposition_pending' && platform.boundary_date === '2026-12-02', 'Platform Work Directive transposition state drift');
  const illinois = jurisdictionRegister.states.find(state => state.id === 'US-IL-AI-EMPLOYMENT');
  assert(illinois?.state === 'operative' && illinois.boundary_date === '2026-01-01', 'Illinois operative date drift');
  const nlra = jurisdictionRegister.states.find(state => state.id === 'US-NLRA-CONCERTED-ACTIVITY');
  assert(nlra?.state === 'operative_underlying_rights_enforcement_memo_rescinded', 'NLRB rights/rescission distinction collapsed');

  assert(controlLoop.object_type === 'algorithmic_dissonance_suppression_control_loop', 'control-loop object type mismatch');
  assert(controlLoop.bounded_definition.status === 'bounded_synthesis_not_universal_finding', 'control-loop authority escalated');
  assert(controlLoop.bounded_definition.user_phrase === 'AI purge of dissonance', 'user phrase custody missing');
  assert(controlLoop.stage_count === 12 && controlLoop.stages.length === 12, 'exactly 12 control-loop stages required');
  controlLoop.stages.forEach((stage, index) => assert(stage.index === index + 1, `control-loop stage index drift: ${stage.stage_id}`));
  assert(controlLoop.hard_refusals.includes('AI caused Chloe Moffat to die.'), 'Chloe AI-causation refusal missing');
  assert(controlLoop.hard_refusals.includes('Every HR analytics product is designed to eliminate dissent.'), 'universal intent refusal missing');
  assert(controlLoop.countervailing_evidence.some(item => item.includes('Algorithmic feedback')), 'algorithmic-feedback counterevidence missing');
  assert(controlLoop.system_breaks.some(item => item.includes('survivor-bias')), 'survivor-bias system break missing');

  assert(receipt.object_type === 'adverse_algorithmic_employment_process_receipt_protocol', 'receipt object type mismatch');
  assert(receipt.wave_id === 'CN-HRDA-W02', 'receipt wave mismatch');
  assert(receipt.state_count === 14 && receipt.states.length === 14, 'exactly 14 receipt states required');
  assert(receipt.control_count === 15 && receipt.controls.length === 15, 'exactly 15 receipt controls required');
  receipt.states.forEach((state, index) => {
    assert(state.index === index + 1, `receipt state index drift: ${state.state_id}`);
    assert(state.must_have_named_owner === true, `named owner requirement weakened: ${state.state_id}`);
    assert(Array.isArray(state.required_fields) && state.required_fields.length >= 5, `receipt fields weakened: ${state.state_id}`);
  });
  assert(receipt.controls.every(control => control.adopted === false), 'controls may not be adopted in this wave');
  const protectedControl = receipt.controls.find(control => control.control_id === 'HRDA-C03');
  assert(protectedControl?.requirement.includes('union activity') && protectedControl.requirement.includes('safety reporting'), 'protected-activity and safety carveout weakened');
  const humanControl = receipt.controls.find(control => control.control_id === 'HRDA-C10');
  assert(humanControl?.requirement.includes('authority to disregard') && humanControl.requirement.includes('token ratification is prohibited'), 'meaningful human review weakened');
  const survivorControl = receipt.controls.find(control => control.control_id === 'HRDA-C15');
  assert(survivorControl?.requirement.includes('do not validate only on survivors'), 'survivor-bias audit weakened');

  assert(chloeJoin.object_type === 'chloe_moffat_non_ai_baseline_join', 'Chloe join object type mismatch');
  assert(chloeJoin.parent_head === PARENT_HEAD, 'Chloe join parent head mismatch');
  assert(chloeJoin.public_ai_use_recovered === false, 'AI use may not be invented in Chloe case');
  assert(chloeJoin.status === 'mechanism_join_only_no_ai_case_finding', 'Chloe join authority escalated');
  assert(chloeJoin.prohibited_claims.includes('AI caused Chloe Moffat to die.'), 'Chloe AI-causation prohibition missing');
  assert(chloeJoin.shared_failure_surfaces.length === 7, 'exactly seven Chloe amplification surfaces required');
  for (const surface of chloeJoin.shared_failure_surfaces) {
    assert(Array.isArray(surface.control_ids) && surface.control_ids.length > 0, `Chloe control binding missing: ${surface.parent_state}`);
    for (const id of surface.control_ids) assert(receipt.controls.some(control => control.control_id === id), `dangling Chloe control ${id}`);
  }

  const microsoftSource = sourceRegister.sources.find(source => source.id === 'microsoft-viva-privacy');
  assert(microsoftSource?.supports.includes('counter_design_boundary'), 'privacy-preserving counter-design source missing');
  const vendorMisuse = lanes.flatMap(lane => lane.findings).filter(item => item.status === 'vendor_boundary_recovered');
  assert(vendorMisuse.length === 2, 'exactly two vendor-boundary findings required');

  return { wave, sourceRegister, jurisdictionRegister, controlLoop, receipt, chloeJoin, lanes };
}

function countBy(items, key) {
  const out = {};
  for (const item of items) out[item[key]] = (out[item[key]] ?? 0) + 1;
  return out;
}

function buildSummary(validated) {
  const { wave, sourceRegister, jurisdictionRegister, controlLoop, receipt, chloeJoin, lanes } = validated;
  const observations = lanes.flatMap(lane => lane.observations);
  const findings = lanes.flatMap(lane => lane.findings);
  return {
    object_type: 'clifford_number_algorithmic_discipline_wave_summary',
    schema_version: 1,
    wave_id: 'CN-HRDA-W02',
    as_of: AS_OF,
    parent: {
      head: PARENT_HEAD,
      manifest_sha256: PARENT_MANIFEST_SHA256,
      mutation_count: 0,
    },
    authority: Object.fromEntries(AUTHORITY_KEYS.map(key => [key, false])),
    source_count: sourceRegister.source_count,
    private_source_count: sourceRegister.private_source_count,
    source_verification_states: countBy(sourceRegister.sources, 'verification_state'),
    source_authority_types: countBy(sourceRegister.sources, 'authority_type'),
    source_legal_states: countBy(sourceRegister.sources, 'legal_state'),
    source_id_url_map_sha256: SOURCE_MAP_SHA256,
    lane_count: lanes.length,
    lanes: lanes.map(lane => ({
      lane_id: lane.lane_id,
      title: lane.title,
      observation_count: lane.observations.length,
      finding_count: lane.findings.length,
      open_question_count: lane.open_questions.length,
      terminal_state: lane.terminal_state,
    })),
    observation_count: observations.length,
    observation_states: countBy(observations, 'state'),
    finding_count: findings.length,
    finding_statuses: countBy(findings, 'status'),
    open_question_count: lanes.reduce((sum, lane) => sum + lane.open_questions.length, 0),
    terminal_receipt_count: lanes.length,
    jurisdiction_state_count: jurisdictionRegister.states.length,
    jurisdiction_states: countBy(jurisdictionRegister.states, 'state'),
    control_loop_stage_count: controlLoop.stages.length,
    receipt_state_count: receipt.states.length,
    control_count: receipt.controls.length,
    adopted_control_count: receipt.controls.filter(control => control.adopted).length,
    named_non_ai_baseline_count: 1,
    chloe_ai_use_recovered: chloeJoin.public_ai_use_recovered,
    terminal_state: wave.terminal_state,
  };
}

function buildManifest(root) {
  const paths = [...AUTHORED, `${REL}/WAVE-02-SUMMARY.json`].sort();
  return {
    algorithm: 'sha256',
    exact_file_count: paths.length,
    files: paths.map(rel => {
      const bytes = fs.readFileSync(path.join(root, rel));
      return { bytes: bytes.length, path: rel, sha256: sha256(bytes) };
    }),
    manifest_excludes_self: true,
    parent_head: PARENT_HEAD,
    parent_manifest_sha256: PARENT_MANIFEST_SHA256,
    schema_version: 1,
    wave_id: 'CN-HRDA-W02',
  };
}

function main() {
  const { root, mode } = parseArgs(process.argv.slice(2));
  const validated = validate(root);
  const summaryPath = path.join(root, REL, 'WAVE-02-SUMMARY.json');
  const manifestPath = path.join(root, REL, 'MANIFEST.json');
  const summaryBytes = jsonBytes(buildSummary(validated));
  if (mode === 'write') fs.writeFileSync(summaryPath, summaryBytes);
  else assert(fs.readFileSync(summaryPath, 'utf8') === summaryBytes, 'stale Wave 02 summary bytes');
  const manifestBytes = jsonBytes(buildManifest(root));
  if (mode === 'write') fs.writeFileSync(manifestPath, manifestBytes);
  else assert(fs.readFileSync(manifestPath, 'utf8') === manifestBytes, 'stale Wave 02 manifest bytes');
  console.log(`clifford-number algorithmic discipline ${mode}: passed (${validated.sourceRegister.source_count} sources, ${validated.lanes.length} lanes, 36 observations, 24 findings, ${validated.jurisdictionRegister.states.length} jurisdiction states, ${validated.receipt.states.length} receipt states, 0 adopted controls, Chloe AI use false)`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
