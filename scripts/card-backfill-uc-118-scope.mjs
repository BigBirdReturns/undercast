#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-118.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-118-scope';
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

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-118', 'UC-118 control scope drift');
assert(control.actor === 'Frank Oz' && control.character === 'Yoda, Miss Piggy & Fozzie' && control.production === 'The Muppets / Star Wars' && control.years === '1976' && control.side === 'still', 'UC-118 selector identity drift');
assert(control.selector_artifact?.artifact_id === 8698826898 && control.selector_artifact?.head_sha === '886f52a0f8e7673fd5a82640cc9669c83293ee09', 'UC-118 selector custody drift');
assert(control.scope_contract?.exact_three_role_puppetry_and_voice_composite_required === true && control.scope_contract?.required_roles?.length === 3 && control.scope_contract?.all_three_panels_required === true && control.scope_contract?.canonical_mutation === false, 'UC-118 scope contract drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;
assert(specimen, 'UC-118 specimen missing');
assert(specimen.actor === control.actor, `UC-118 specimen actor drift: ${specimen.actor}`);
assert(specimen.character === control.character, `UC-118 specimen character drift: ${specimen.character}`);
assert(specimen.production === control.production, `UC-118 specimen production drift: ${specimen.production}`);
assert(specimen.universe === control.universe, `UC-118 specimen universe drift: ${specimen.universe}`);
assert(specimen.years === control.years, `UC-118 specimen years drift: ${specimen.years}`);
assert(!specimen.still, 'UC-118 specimen already has a canonical still');
assert(audit, 'UC-118 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side, 'UC-118 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-118 audit absence drift');
assert(audit.expected_subject === control.expected_subject, `UC-118 expected-subject drift: ${audit.expected_subject}`);
assert(!source?.still, 'UC-118 source ledger already has a canonical still');

const declaredPerformances = Array.isArray(specimen.performances) ? specimen.performances : [];
const references = Array.isArray(specimen.references) ? specimen.references : [];
const requiredRoles = control.scope_contract.required_roles;
const normalizedFiledRoles = [specimen.character, ...declaredPerformances.map(row => row?.character || '')]
  .map(value => String(value || '').toLowerCase());
const filedRoleSignals = Object.fromEntries(requiredRoles.map(role => [
  role,
  normalizedFiledRoles.some(value => {
    if (role === 'Yoda') return /(^|[^a-z])yoda([^a-z]|$)/.test(value);
    if (role === 'Miss Piggy') return value.includes('miss piggy') || value.includes('piggy');
    if (role === 'Fozzie Bear') return value.includes('fozzie');
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
    canonical_year_semantics: 'Muppet-era chronology carried by the canonical card row; it is not evidence that Yoda debuted or that Frank Oz first performed Yoda in 1976.',
    yoda_requires_independent_star_wars_year_and_production_custody: true,
    miss_piggy_and_fozzie_require_original_frank_oz_muppet_custody: true
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
    exact_three_role_puppetry_and_voice_composite_required: control.scope_contract.exact_three_role_puppetry_and_voice_composite_required,
    role_specific_character_and_production_custody_required: control.scope_contract.role_specific_character_and_production_custody_required,
    frank_oz_performance_binding_required_for_each_role: control.scope_contract.frank_oz_performance_binding_required_for_each_role,
    puppetry_physical_performance_and_voice_modes_must_remain_legible: control.scope_contract.puppetry_physical_performance_and_voice_modes_must_remain_legible,
    canonical_1976_is_muppet_chronology_not_yoda_debut: control.scope_contract.canonical_1976_is_muppet_chronology_not_yoda_debut,
    all_three_panels_required: control.scope_contract.all_three_panels_required,
    grogu_or_other_star_wars_creature_for_yoda_forbidden: control.scope_contract.reject_grogu_or_other_star_wars_creature_for_yoda,
    other_muppets_for_miss_piggy_or_fozzie_forbidden: control.scope_contract.reject_other_muppets_for_miss_piggy_or_fozzie,
    later_substitute_performer_without_oz_custody_forbidden: control.scope_contract.reject_later_substitute_performer_without_oz_custody,
    untransformed_actor_character_side_forbidden: control.scope_contract.reject_untransformed_actor_on_character_side,
    fan_art_toys_cosplay_merchandise_posters_and_generic_ensembles_forbidden: control.scope_contract.reject_fan_art_toys_cosplay_merchandise_posters_and_generic_ensembles,
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

console.log(`PASS — exact UC-118 canonical scope extracted: ${declaredPerformances.length} declared performance(s), ${references.length} reference(s)`);
console.log(`ROLES — ${requiredRoles.join(' | ')}`);
console.log(`ABSENCE — specimen still absent; source-ledger still absent; audit ${audit.status}`);
console.log(`OUTPUT — ${OUT}`);
