#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-174.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-174-scope';
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

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-174', 'UC-174 control scope drift');
assert(control.kind === 'voice' && control.actor === 'John DiMaggio' && control.character === 'Bender, Jake the Dog, Marcus Fenix' && control.production === 'Futurama / Adventure Time / Gears of War' && control.years === '1990s–' && control.universe === 'Voice' && control.side === 'still', 'UC-174 selector identity drift');
assert(control.selector_artifact?.artifact_id === 8733385683 && control.selector_artifact?.head_sha === 'd9b696a3675d9fe0237ad0c765b4a215976ec87d' && control.selector_artifact?.zip_sha256 === '68156b05032defc61cfe90d7f9afdc933bdb7de64c26a4782f2f13ad1ee957e9' && control.selector_artifact?.selected_sha256 === '60724bc142396093a60ffbd7e2e954c63f4b40b2b61ebc27d3d95b7f50c8151b', 'UC-174 selector custody drift');
assert(control.scope_contract?.exact_three_role_cross_medium_character_composite_required === true && JSON.stringify(control.scope_contract?.required_roles) === JSON.stringify(['bender','jake','marcus']) && control.scope_contract?.john_dimaggio_performance_required_for_all_three_roles === true && control.scope_contract?.canonical_1990s_plus_is_broad_career_envelope_only === true && control.scope_contract?.single_role_or_two_role_candidate_forbidden === true && control.scope_contract?.canonical_mutation === false, 'UC-174 scope contract drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;
assert(specimen, 'UC-174 specimen missing');
assert(specimen.kind === 'voice', `UC-174 specimen kind drift: ${specimen.kind}`);
assert(specimen.actor === control.actor, `UC-174 specimen actor drift: ${specimen.actor}`);
assert(specimen.character === control.character, `UC-174 specimen character drift: ${specimen.character}`);
assert(specimen.production === control.production, `UC-174 specimen production drift: ${specimen.production}`);
assert(specimen.universe === control.universe, `UC-174 specimen universe drift: ${specimen.universe}`);
assert(specimen.years === control.years, `UC-174 specimen years drift: ${specimen.years}`);
assert(specimen.still === null || specimen.still === undefined, 'UC-174 specimen already has a canonical still');
assert(specimen.portrait?.src === 'images/uc-174-portrait.jpg' && specimen.portrait?.kind === 'free', 'UC-174 existing portrait boundary drift');
assert(audit, 'UC-174 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side, 'UC-174 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-174 audit absence drift');
assert(audit.expected_subject === control.expected_subject, `UC-174 expected-subject drift: ${audit.expected_subject}`);
assert(!source?.still, 'UC-174 source ledger already has a canonical still');
if (source) assert(source.portrait?.src === 'images/uc-174-portrait.jpg', 'UC-174 source-ledger portrait boundary drift');

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
    required_roles: ['bender','jake','marcus'],
    bender: { character: 'Bender', production: 'Futurama', medium: 'animated television', exact_role_required: true },
    jake: { character: 'Jake the Dog', production: 'Adventure Time', medium: 'animated television', exact_role_required: true },
    marcus: { character: 'Marcus Fenix', production: 'Gears of War', medium: 'video game', exact_role_required: true },
    canonical_years_semantics: '1990s– is a broad John DiMaggio career envelope and is not a shared role-debut date.',
    replacement_performers_and_other_continuities_forbidden: true,
    live_action_costume_merchandise_toy_cosplay_poster_and_generic_ensemble_forbidden: true,
    single_role_or_two_role_candidate_forbidden: true,
    all_three_faces_bodies_and_design_silhouettes_must_be_legible: true
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
    exact_three_role_cross_medium_character_composite_required: control.scope_contract.exact_three_role_cross_medium_character_composite_required,
    john_dimaggio_performance_required_for_all_three_roles: control.scope_contract.john_dimaggio_performance_required_for_all_three_roles,
    role_specific_production_medium_and_chronology_required: control.scope_contract.role_specific_production_medium_and_chronology_required,
    canonical_1990s_plus_is_broad_career_envelope_only: control.scope_contract.canonical_1990s_plus_is_broad_career_envelope_only,
    bender_must_remain_futurama_robot: control.scope_contract.bender_must_remain_futurama_robot,
    jake_must_remain_adventure_time_dog: control.scope_contract.jake_must_remain_adventure_time_dog,
    marcus_must_remain_gears_of_war_game_character: control.scope_contract.marcus_must_remain_gears_of_war_game_character,
    replacement_performers_and_other_continuities_forbidden: control.scope_contract.replacement_performers_and_other_continuities_forbidden,
    single_role_or_two_role_candidate_forbidden: control.scope_contract.single_role_or_two_role_candidate_forbidden,
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
  disposition: 'canonical-three-role-cross-medium-scope-extracted-source-orbit-not-yet-authorized'
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
  'required_roles=bender,jake,marcus',
  'canonical_mutation=false'
].join('\n') + '\n');

console.log(`PASS — exact UC-174 canonical three-role scope extracted: ${declaredPerformances.length} declared performance(s), ${references.length} reference(s)`);
console.log('ROLES — Bender / Jake the Dog / Marcus Fenix');
console.log(`ABSENCE — specimen still absent; source-ledger still absent; audit ${audit.status}`);
console.log(`EXISTING PORTRAIT — ${specimen.portrait.src} remains unchanged`);
console.log(`OUTPUT — ${OUT}`);
