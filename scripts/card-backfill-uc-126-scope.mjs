#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-126.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-126-scope';
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

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-126', 'UC-126 control scope drift');
assert(control.actor === 'Tara Strong' && control.character === 'Bubbles, Timmy, Harley & Twilight' && control.production === 'Powerpuff Girls / Fairly OddParents / etc.' && control.years === '1998' && control.side === 'still', 'UC-126 selector identity drift');
assert(control.selector_artifact?.artifact_id === 8706098863 && control.selector_artifact?.head_sha === '151b37ee114f8e262b284a718556355cd542f3d0' && control.selector_artifact?.zip_sha256 === '7e2ca734ac74cb3a4b4f9f7ea87d0e8ea7be34f1eda7936bccf6992966b5bf7c', 'UC-126 selector custody drift');
assert(control.selector_artifact?.selected_sha256 === 'caf97bccc7e9da470dfdb54b64311c304198ecfcd42e09812b71ff6c65cb0621' && control.selector_artifact?.queue_sha256 === 'a28c41d6d910251c62ec033162e0711f901f065d45b1fa752c6307a6dcc73401' && control.selector_artifact?.summary_sha256 === '2dc734164bad76d0e31f2e49ba7992bbe999fd88b277423bb003f0d6b07cbded', 'UC-126 selector packet receipt drift');
assert(control.scope_contract?.exact_four_role_voice_composite_required === true && control.scope_contract?.required_roles?.length === 4 && control.scope_contract?.all_four_panels_required === true && control.scope_contract?.canonical_mutation === false, 'UC-126 scope contract drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;
assert(specimen, 'UC-126 specimen missing');
assert(specimen.actor === control.actor, `UC-126 specimen actor drift: ${specimen.actor}`);
assert(specimen.character === control.character, `UC-126 specimen character drift: ${specimen.character}`);
assert(specimen.production === control.production, `UC-126 specimen production drift: ${specimen.production}`);
assert(specimen.universe === control.universe, `UC-126 specimen universe drift: ${specimen.universe}`);
assert(specimen.years === control.years, `UC-126 specimen years drift: ${specimen.years}`);
assert(!specimen.still, 'UC-126 specimen already has a canonical still');
assert(audit, 'UC-126 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side, 'UC-126 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-126 audit absence drift');
assert(audit.expected_subject === control.expected_subject, `UC-126 expected-subject drift: ${audit.expected_subject}`);
assert(!source?.still, 'UC-126 source ledger already has a canonical still');

const declaredPerformances = Array.isArray(specimen.performances) ? specimen.performances : [];
const references = Array.isArray(specimen.references) ? specimen.references : [];
const requiredRoles = control.scope_contract.required_roles;
const normalizedFiledRoles = [specimen.character, ...declaredPerformances.map(row => row?.character || '')]
  .map(value => String(value || '').toLowerCase());
const roleSignal = (role, value) => {
  if (role === 'Bubbles') return value.includes('bubbles');
  if (role === 'Timmy Turner') return value.includes('timmy');
  if (role === 'Harley Quinn') return value.includes('harley');
  if (role === 'Twilight Sparkle') return value.includes('twilight');
  return false;
};
const filedRoleSignals = Object.fromEntries(requiredRoles.map(role => [
  role,
  normalizedFiledRoles.some(value => roleSignal(role, value))
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
    canonical_year_semantics: 'The 1998 field belongs to the original Powerpuff Girls and Bubbles chronology. It is not Timmy Turner, Harley Quinn, or Twilight Sparkle debut or performance chronology.',
    bubbles_requires_exact_original_powerpuff_girls_custody: true,
    timmy_requires_independent_fairly_oddparents_production_and_date_custody: true,
    harley_requires_named_continuity_and_tara_strong_custody: true,
    twilight_requires_friendship_is_magic_or_other_exact_tara_strong_production_custody: true
  },
  performance_boundary: {
    tara_strong_role_mode: 'voice',
    each_character_frame_requires_independent_actor_role_binding: true,
    generic_franchise_or_character_images_cannot_prove_tara_strong_performance: true,
    one_role_cannot_stand_in_for_another: true
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
    exact_four_role_voice_composite_required: control.scope_contract.exact_four_role_voice_composite_required,
    role_specific_character_and_production_custody_required: control.scope_contract.role_specific_character_and_production_custody_required,
    tara_strong_voice_binding_required_for_each_role: control.scope_contract.tara_strong_voice_binding_required_for_each_role,
    canonical_1998_is_powerpuff_bubbles_chronology_only: control.scope_contract.canonical_1998_is_powerpuff_bubbles_chronology_only,
    timmy_requires_independent_fairly_oddparents_custody: control.scope_contract.timmy_requires_independent_fairly_oddparents_custody,
    harley_requires_named_continuity_and_strong_custody: control.scope_contract.harley_requires_named_continuity_and_strong_custody,
    twilight_requires_friendship_is_magic_or_exact_strong_custody: control.scope_contract.twilight_requires_friendship_is_magic_or_exact_strong_custody,
    all_four_panels_required: control.scope_contract.all_four_panels_required,
    reject_blossom_or_buttercup_for_bubbles: control.scope_contract.reject_blossom_or_buttercup_for_bubbles,
    reject_other_fairly_oddparents_character_for_timmy: control.scope_contract.reject_other_fairly_oddparents_character_for_timmy,
    reject_other_harley_continuity_or_performer_without_strong_custody: control.scope_contract.reject_other_harley_continuity_or_performer_without_strong_custody,
    reject_other_my_little_pony_character_for_twilight: control.scope_contract.reject_other_my_little_pony_character_for_twilight,
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

console.log(`PASS — exact UC-126 canonical scope extracted: ${declaredPerformances.length} declared performance(s), ${references.length} reference(s)`);
console.log(`ROLES — ${requiredRoles.join(' | ')}`);
console.log(`ABSENCE — specimen still absent; source-ledger still absent; audit ${audit.status}`);
console.log(`OUTPUT — ${OUT}`);
