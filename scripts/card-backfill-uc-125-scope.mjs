#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-125.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-125-scope';
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

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-125', 'UC-125 control scope drift');
assert(control.actor === 'Billy West' && control.character === 'Ren, Stimpy & Fry' && control.production === 'Ren & Stimpy / Futurama' && control.years === '1991' && control.side === 'still', 'UC-125 selector identity drift');
assert(control.selector_artifact?.artifact_id === 8705167567 && control.selector_artifact?.head_sha === '0b4783eedc3ced767ba9d2321291b0a11ff5e233', 'UC-125 selector custody drift');
assert(control.scope_contract?.exact_three_role_voice_composite_required === true && control.scope_contract?.required_roles?.length === 3 && control.scope_contract?.all_three_panels_required === true && control.scope_contract?.canonical_mutation === false, 'UC-125 scope contract drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;
assert(specimen, 'UC-125 specimen missing');
assert(specimen.actor === control.actor, `UC-125 specimen actor drift: ${specimen.actor}`);
assert(specimen.character === control.character, `UC-125 specimen character drift: ${specimen.character}`);
assert(specimen.production === control.production, `UC-125 specimen production drift: ${specimen.production}`);
assert(specimen.universe === control.universe, `UC-125 specimen universe drift: ${specimen.universe}`);
assert(specimen.years === control.years, `UC-125 specimen years drift: ${specimen.years}`);
assert(!specimen.still, 'UC-125 specimen already has a canonical still');
assert(audit, 'UC-125 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side, 'UC-125 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-125 audit absence drift');
assert(audit.expected_subject === control.expected_subject, `UC-125 expected-subject drift: ${audit.expected_subject}`);
assert(!source?.still, 'UC-125 source ledger already has a canonical still');

const declaredPerformances = Array.isArray(specimen.performances) ? specimen.performances : [];
const references = Array.isArray(specimen.references) ? specimen.references : [];
const requiredRoles = control.scope_contract.required_roles;
const normalizedFiledRoles = [specimen.character, ...declaredPerformances.map(row => row?.character || '')]
  .map(value => String(value || '').toLowerCase());
const filedRoleSignals = Object.fromEntries(requiredRoles.map(role => [
  role,
  normalizedFiledRoles.some(value => {
    if (role === 'Ren Höek') return value.includes('ren');
    if (role === 'Stimpy') return value.includes('stimpy');
    if (role === 'Philip J. Fry') return value.includes('fry');
    return false;
  })
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
    canonical_year_semantics: 'The 1991 field belongs to the Ren & Stimpy era. It is not Futurama or Philip J. Fry debut chronology and cannot be projected onto every listed performance.',
    ren_and_stimpy_roles_require_series_and_performance_history_custody: true,
    fry_requires_independent_futurama_production_and_voice_custody: true
  },
  performance_boundary: {
    billy_west_role_mode: 'voice',
    each_named_character_requires_independent_role_binding: true,
    later_substitute_performers_must_not_stand_in_for_west: true,
    ren_and_stimpy_role_history_qualifications_must_be_preserved: true
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
    exact_three_role_voice_composite_required: control.scope_contract.exact_three_role_voice_composite_required,
    role_specific_character_and_production_custody_required: control.scope_contract.role_specific_character_and_production_custody_required,
    billy_west_voice_binding_required_for_each_role: control.scope_contract.billy_west_voice_binding_required_for_each_role,
    canonical_1991_is_ren_and_stimpy_chronology_not_fry_debut: control.scope_contract.canonical_1991_is_ren_and_stimpy_chronology_not_fry_debut,
    fry_requires_independent_futurama_custody: control.scope_contract.fry_requires_independent_futurama_custody,
    ren_and_stimpy_role_history_qualifications_must_be_preserved: control.scope_contract.ren_and_stimpy_role_history_qualifications_must_be_preserved,
    all_three_panels_required: control.scope_contract.all_three_panels_required,
    reject_other_nickelodeon_character_for_ren_or_stimpy: control.scope_contract.reject_other_nickelodeon_character_for_ren_or_stimpy,
    reject_other_futurama_character_for_fry: control.scope_contract.reject_other_futurama_character_for_fry,
    reject_later_substitute_performer_without_west_custody: control.scope_contract.reject_later_substitute_performer_without_west_custody,
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

console.log(`PASS — exact UC-125 canonical scope extracted: ${declaredPerformances.length} declared performance(s), ${references.length} reference(s)`);
console.log(`ROLES — ${requiredRoles.join(' | ')}`);
console.log(`ABSENCE — specimen still absent; source-ledger still absent; audit ${audit.status}`);
console.log(`OUTPUT — ${OUT}`);
