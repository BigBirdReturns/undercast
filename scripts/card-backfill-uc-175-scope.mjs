#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-175.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-175-scope';
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + '\n'); };

const [controlBytes, specimenBytes, auditBytes, sourceBytes] = await Promise.all([
  readFile(CONTROL), readFile(SPECIMENS), readFile(AUDIT), readFile(SOURCES)
]);
const control = JSON.parse(controlBytes);
const specimens = JSON.parse(specimenBytes);
const auditRoot = JSON.parse(auditBytes);
const sources = JSON.parse(sourceBytes);

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-175', 'UC-175 control scope drift');
assert(control.kind === 'voice' && control.actor === 'Ben Burtt' && control.character === 'The voices of R2-D2 & WALL·E' && control.production === 'Star Wars / WALL·E' && control.years === '1977–' && control.universe === 'Voice' && control.side === 'still', 'UC-175 selector identity drift');
assert(control.selector_artifact?.artifact_id === 8734947403 && control.selector_artifact?.head_sha === '85708599c4221d90d086e8e0838023895b44571b' && control.selector_artifact?.zip_sha256 === '9428660e0ea84e3f0d27657622f72611a05889eeaf38a652e71f2f8e31a787c4' && control.selector_artifact?.selected_sha256 === '4882b13b6b6aad7ddf6e42a2a0eec5c6d24daaa11eb54fb3145415cd142daaa8', 'UC-175 selector custody drift');
assert(control.scope_contract?.exact_two_role_sound_performance_composite_required === true && JSON.stringify(control.scope_contract?.required_roles) === JSON.stringify(['r2d2','walle']) && control.scope_contract?.ben_burtt_sound_performance_required_for_both_roles === true && control.scope_contract?.sound_performance_must_remain_separate_from_visible_operators_builders_and_animators === true && control.scope_contract?.canonical_1977_plus_is_broad_career_envelope_only === true && control.scope_contract?.single_role_candidate_forbidden === true && control.scope_contract?.canonical_mutation === false, 'UC-175 scope contract drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;
assert(specimen, 'UC-175 specimen missing');
assert(specimen.kind === 'voice', `UC-175 specimen kind drift: ${specimen.kind}`);
assert(specimen.actor === control.actor, `UC-175 specimen actor drift: ${specimen.actor}`);
assert(specimen.character === control.character, `UC-175 specimen character drift: ${specimen.character}`);
assert(specimen.production === control.production, `UC-175 specimen production drift: ${specimen.production}`);
assert(specimen.universe === control.universe, `UC-175 specimen universe drift: ${specimen.universe}`);
assert(specimen.years === control.years, `UC-175 specimen years drift: ${specimen.years}`);
assert(specimen.still === null || specimen.still === undefined, 'UC-175 specimen already has a canonical still');
assert(specimen.portrait?.src === 'images/uc-175-portrait.jpg' && specimen.portrait?.kind === 'free', 'UC-175 existing portrait boundary drift');
assert(audit, 'UC-175 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side, 'UC-175 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-175 audit absence drift');
assert(audit.expected_subject === control.expected_subject, `UC-175 expected-subject drift: ${audit.expected_subject}`);
assert(!source?.still, 'UC-175 source ledger already has a canonical still');
if (source) assert(source.portrait?.src === 'images/uc-175-portrait.jpg', 'UC-175 source-ledger portrait boundary drift');

const declaredPerformances = Array.isArray(specimen.performances) ? specimen.performances : [];
const references = Array.isArray(specimen.references) ? specimen.references : [];
const performanceModes = declaredPerformances.map(row => ({
  character: row?.character || null,
  production: row?.production || null,
  years: row?.years || null,
  performance_mode: row?.performance_mode || null,
  reference_count: Array.isArray(row?.references) ? row.references.length : 0
}));

const scope = {
  version: 1,
  lane: 'card-backfill',
  record_id: control.record_id,
  kind: specimen.kind,
  actor: specimen.actor,
  declared_character: specimen.character,
  declared_production: specimen.production,
  years: specimen.years,
  universe: specimen.universe,
  designer: specimen.designer || null,
  transform: specimen.transform ?? null,
  known_for: specimen.knownFor || null,
  reveal: specimen.reveal || null,
  canonical_link: specimen.link || null,
  declared_performances: declaredPerformances,
  declared_performance_modes: performanceModes,
  references,
  role_boundary: {
    required_roles: ['r2d2','walle'],
    r2d2: { character: 'R2-D2', production: 'Star Wars', medium: 'live-action film character with designed electronic vocal performance', chronology: '1977–', exact_role_required: true },
    walle: { character: 'WALL·E', production: 'WALL·E', medium: 'Pixar animated film character with designed electronic vocal performance', chronology: '2008', exact_role_required: true },
    canonical_years_semantics: '1977– is a broad Ben Burtt sound-performance career envelope and is not a shared character date.',
    sound_performance_must_remain_separate_from_visible_operators_builders_and_animators: true,
    kenny_baker_jimmy_vee_puppeteer_operator_and_builder_substitutes_forbidden: true,
    eve_other_astromechs_toys_cosplay_games_posters_and_generic_ensembles_forbidden: true,
    single_role_candidate_forbidden: true,
    both_characters_faces_bodies_and_design_silhouettes_must_be_legible: true
  },
  existing_performer_media: {
    specimen_portrait: specimen.portrait || null,
    source_ledger_portrait: source?.portrait || null,
    must_remain_unchanged: true
  },
  audit: {
    id: audit.id,
    wall_id: audit.wall_id,
    side: audit.side,
    scope: audit.scope,
    status: audit.status,
    expected_subject: audit.expected_subject,
    source_fetched_at: audit.source_fetched_at || null,
    risk_codes: audit.risk_codes || [],
    asset: audit.asset || null
  },
  source_ledger: source,
  invariants: {
    exact_two_role_sound_performance_composite_required: control.scope_contract.exact_two_role_sound_performance_composite_required,
    ben_burtt_sound_performance_required_for_both_roles: control.scope_contract.ben_burtt_sound_performance_required_for_both_roles,
    sound_performance_must_remain_separate_from_visible_operators_builders_and_animators: control.scope_contract.sound_performance_must_remain_separate_from_visible_operators_builders_and_animators,
    role_specific_production_medium_and_chronology_required: control.scope_contract.role_specific_production_medium_and_chronology_required,
    canonical_1977_plus_is_broad_career_envelope_only: control.scope_contract.canonical_1977_plus_is_broad_career_envelope_only,
    r2d2_original_star_wars_sound_performance_required: control.scope_contract.r2d2_original_star_wars_sound_performance_required,
    walle_2008_pixar_sound_performance_required: control.scope_contract.walle_2008_pixar_sound_performance_required,
    kenny_baker_jimmy_vee_puppeteer_operator_and_builder_substitutes_forbidden: control.scope_contract.kenny_baker_jimmy_vee_puppeteer_operator_and_builder_substitutes_forbidden,
    single_role_candidate_forbidden: control.scope_contract.single_role_candidate_forbidden,
    existing_performer_portrait_must_remain_unchanged: control.scope_contract.existing_performer_portrait_must_remain_unchanged,
    specimen_still_absent: !specimen.still,
    source_ledger_still_absent: !source?.still,
    audit_still_absent: audit.status === 'absent' && !audit.asset,
    canonical_mutation: false
  },
  custody: {
    selector_artifact: control.selector_artifact,
    control_sha256: sha(controlBytes),
    specimens_sha256: sha(specimenBytes),
    media_audit_sha256: sha(auditBytes),
    sources_sha256: sha(sourceBytes)
  },
  disposition: 'canonical-two-role-sound-performance-scope-extracted-source-orbit-not-yet-authorized'
};

await writeJson(join(OUT, 'specimen.json'), specimen);
await writeJson(join(OUT, 'audit.json'), audit);
await writeJson(join(OUT, 'source-ledger.json'), source);
await writeJson(join(OUT, 'scope.json'), scope);
await writeFile(join(OUT, 'summary.txt'), [
  `record=${control.record_id}`,
  `kind=${specimen.kind}`,
  `actor=${specimen.actor}`,
  `character=${specimen.character}`,
  `production=${specimen.production}`,
  `years=${specimen.years}`,
  `side=${control.side}`,
  `performances=${declaredPerformances.length}`,
  `references=${references.length}`,
  `performance_modes=${JSON.stringify(performanceModes)}`,
  `source_ledger_row=${source ? 'present' : 'absent'}`,
  `specimen_still=${specimen.still ? 'present' : 'absent'}`,
  `source_still=${source?.still ? 'present' : 'absent'}`,
  `existing_portrait=${specimen.portrait?.src || 'absent'}`,
  `audit_status=${audit.status}`,
  `expected_subject=${audit.expected_subject}`,
  'required_roles=r2d2,walle',
  'sound_performance_visible_operator_separation=true',
  'canonical_mutation=false'
].join('\n') + '\n');

console.log(`PASS — exact UC-175 canonical two-role sound-performance scope extracted: ${declaredPerformances.length} declared performance(s), ${references.length} reference(s)`);
console.log('ROLES — R2-D2 / WALL·E');
console.log(`ABSENCE — specimen still absent; source-ledger still absent; audit ${audit.status}`);
console.log(`EXISTING PORTRAIT — ${specimen.portrait.src} remains unchanged`);
console.log(`OUTPUT — ${OUT}`);
