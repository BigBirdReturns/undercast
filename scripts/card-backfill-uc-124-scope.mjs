#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-124.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-124-scope';
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
};

const [controlBytes, specimenBytes, auditBytes, sourceBytes] = await Promise.all([
  readFile(CONTROL), readFile(SPECIMENS), readFile(AUDIT), readFile(SOURCES)
]);
const control = JSON.parse(controlBytes);
const specimens = JSON.parse(specimenBytes);
const auditRoot = JSON.parse(auditBytes);
const sources = JSON.parse(sourceBytes);

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-124', 'UC-124 control scope drift');
assert(control.actor === 'James Earl Jones' && control.character === 'Mufasa (and Darth Vader)' && control.production === 'The Lion King / Star Wars' && control.years === '1994' && control.side === 'still', 'UC-124 selector identity drift');
assert(control.selector_artifact?.artifact_id === 8700225871 && control.selector_artifact?.head_sha === 'a7b49a6e2de16d74ce57dc98556a8a2a0c010b8f', 'UC-124 selector custody drift');
assert(control.scope_contract?.exact_two_role_voice_composite_required === true && control.scope_contract?.required_roles?.length === 2 && control.scope_contract?.both_panels_required === true && control.scope_contract?.canonical_mutation === false, 'UC-124 scope contract drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;
assert(specimen, 'UC-124 specimen missing');
assert(specimen.actor === control.actor, `UC-124 specimen actor drift: ${specimen.actor}`);
assert(specimen.character === control.character, `UC-124 specimen character drift: ${specimen.character}`);
assert(specimen.production === control.production, `UC-124 specimen production drift: ${specimen.production}`);
assert(specimen.universe === control.universe, `UC-124 specimen universe drift: ${specimen.universe}`);
assert(specimen.years === control.years, `UC-124 specimen years drift: ${specimen.years}`);
assert(!specimen.still, 'UC-124 specimen already has a canonical still');
assert(audit, 'UC-124 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side, 'UC-124 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-124 audit absence drift');
assert(audit.expected_subject === control.expected_subject, `UC-124 expected-subject drift: ${audit.expected_subject}`);
assert(!source?.still, 'UC-124 source ledger already has a canonical still');

const declaredPerformances = Array.isArray(specimen.performances) ? specimen.performances : [];
const references = Array.isArray(specimen.references) ? specimen.references : [];
const requiredRoles = control.scope_contract.required_roles;
const normalizedFiledRoles = [specimen.character, ...declaredPerformances.map(row => row?.character || '')]
  .map(value => String(value || '').toLowerCase());
const filedRoleSignals = Object.fromEntries(requiredRoles.map(role => [
  role,
  normalizedFiledRoles.some(value => role === 'Mufasa' ? value.includes('mufasa') : value.includes('darth vader') || value === 'vader' || value.includes(' vader'))
]));
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
  required_roles: requiredRoles,
  filed_role_signals: filedRoleSignals,
  chronology_boundary: {
    canonical_year: specimen.years,
    canonical_year_semantics: 'The 1994 field belongs to the animated Lion King and Mufasa role. It is not Darth Vader debut or James Earl Jones Vader voice-start chronology.',
    mufasa_requires_exact_1994_animated_film_custody: true,
    vader_requires_independent_star_wars_production_and_voice_custody: true
  },
  embodiment_boundary: {
    james_earl_jones_role_mode: 'voice',
    darth_vader_character_frame_may_show_armored_character: true,
    darth_vader_frame_must_not_imply_jones_suit_occupancy: true,
    physical_suit_performers_outside_asserted_mechanism: true
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
    exact_two_role_voice_composite_required: control.scope_contract.exact_two_role_voice_composite_required,
    role_specific_character_and_production_custody_required: control.scope_contract.role_specific_character_and_production_custody_required,
    james_earl_jones_voice_binding_required_for_each_role: control.scope_contract.james_earl_jones_voice_binding_required_for_each_role,
    voice_and_physical_embodiment_must_remain_separate: control.scope_contract.voice_and_physical_embodiment_must_remain_separate,
    canonical_1994_is_lion_king_chronology_not_vader_debut: control.scope_contract.canonical_1994_is_lion_king_chronology_not_vader_debut,
    original_1994_animated_mufasa_required: control.scope_contract.original_1994_animated_mufasa_required,
    darth_vader_character_frame_must_not_imply_jones_suit_occupancy: control.scope_contract.darth_vader_character_frame_must_not_imply_jones_suit_occupancy,
    both_panels_required: control.scope_contract.both_panels_required,
    reject_2019_mufasa_for_1994_role: control.scope_contract.reject_2019_mufasa_for_1994_role,
    reject_other_lion_for_mufasa: control.scope_contract.reject_other_lion_for_mufasa,
    reject_anakin_without_vader_identity: control.scope_contract.reject_anakin_without_vader_identity,
    reject_later_substitute_voice_without_jones_custody: control.scope_contract.reject_later_substitute_voice_without_jones_custody,
    reject_untransformed_actor_on_character_side: control.scope_contract.reject_untransformed_actor_on_character_side,
    reject_fan_art_toys_games_cosplay_merchandise_posters_and_generic_ensembles: control.scope_contract.reject_fan_art_toys_games_cosplay_merchandise_posters_and_generic_ensembles,
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
  disposition: 'canonical-scope-extracted-source-orbit-not-yet-authorized'
};

await writeJson(join(OUT, 'specimen.json'), specimen);
await writeJson(join(OUT, 'audit.json'), audit);
await writeJson(join(OUT, 'source-ledger.json'), source);
await writeJson(join(OUT, 'scope.json'), scope);
await writeFile(join(OUT, 'summary.txt'), [
  `record=${control.record_id}`,
  `actor=${specimen.actor}`,
  `character=${specimen.character}`,
  `production=${specimen.production}`,
  `years=${specimen.years}`,
  `performances=${declaredPerformances.length}`,
  `references=${references.length}`,
  `required_roles=${requiredRoles.join(' | ')}`,
  `filed_role_signals=${JSON.stringify(filedRoleSignals)}`,
  `performance_modes=${JSON.stringify(performanceModes)}`,
  `source_ledger_row=${source ? 'present' : 'absent'}`,
  `specimen_still=${specimen.still ? 'present' : 'absent'}`,
  `source_still=${source?.still ? 'present' : 'absent'}`,
  `audit_status=${audit.status}`,
  `expected_subject=${audit.expected_subject}`,
  'canonical_mutation=false'
].join('\n') + '\n');

console.log(`PASS — exact UC-124 canonical scope extracted: ${declaredPerformances.length} declared performance(s), ${references.length} reference(s)`);
console.log(`ROLES — ${requiredRoles.join(' | ')}`);
console.log(`ABSENCE — specimen still absent; source-ledger still absent; audit ${audit.status}`);
console.log(`OUTPUT — ${OUT}`);
