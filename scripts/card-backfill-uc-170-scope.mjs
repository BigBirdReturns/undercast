#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-170.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-170-scope';
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

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-170', 'UC-170 control scope drift');
assert(control.kind === 'voice' && control.actor === 'Maurice LaMarche' && control.character === 'The Brain, Kif Kroker, Egon Spengler' && control.production === 'Animaniacs / Futurama' && control.years === '1980s–' && control.universe === 'Voice' && control.side === 'still', 'UC-170 selector identity drift');
assert(control.selector_artifact?.artifact_id === 8712290331 && control.selector_artifact?.head_sha === 'a0258de5785cf6959e198077d63e3e51e1853411' && control.selector_artifact?.zip_sha256 === '74e795444342ff84537688c6e17edea7e2c86d7ea9e3d3ee854e79061dfe4b68' && control.selector_artifact?.selected_sha256 === '3e1f2a8607450c460b38b220812104e84af1bb0069286080618b98b43838b423', 'UC-170 selector custody drift');
assert(control.scope_contract?.exact_three_role_animated_character_composite_required === true && control.scope_contract?.brain_panel_required === true && control.scope_contract?.kif_kroker_panel_required === true && control.scope_contract?.animated_egon_spengler_panel_required === true && control.scope_contract?.maurice_lamarche_voice_performance_required_for_all_three_roles === true && control.scope_contract?.canonical_years_is_broad_career_envelope_not_shared_role_date === true && control.scope_contract?.canonical_mutation === false, 'UC-170 scope contract drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;
assert(specimen, 'UC-170 specimen missing');
assert(specimen.kind === 'voice', `UC-170 specimen kind drift: ${specimen.kind}`);
assert(specimen.actor === control.actor, `UC-170 specimen actor drift: ${specimen.actor}`);
assert(specimen.character === control.character, `UC-170 specimen character drift: ${specimen.character}`);
assert(specimen.production === control.production, `UC-170 specimen production drift: ${specimen.production}`);
assert(specimen.universe === control.universe, `UC-170 specimen universe drift: ${specimen.universe}`);
assert(specimen.years === control.years, `UC-170 specimen years drift: ${specimen.years}`);
assert(specimen.still === null || specimen.still === undefined, 'UC-170 specimen already has a canonical still');
assert(specimen.portrait?.src === 'images/uc-170-portrait.jpg' && specimen.portrait?.kind === 'free', 'UC-170 existing portrait boundary drift');
assert(audit, 'UC-170 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side, 'UC-170 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-170 audit absence drift');
assert(audit.expected_subject === control.expected_subject, `UC-170 expected-subject drift: ${audit.expected_subject}`);
assert(!source?.still, 'UC-170 source ledger already has a canonical still');

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
  still_boundary: {
    expected_subject: control.expected_subject,
    exact_three_role_animated_character_composite_required: true,
    required_roles: ['The Brain', 'Kif Kroker', 'animated Egon Spengler'],
    maurice_lamarche_voice_performance_required_for_all_three_roles: true,
    role_specific_production_and_chronology_required: true,
    canonical_years_semantics: '1980s– is a broad Maurice LaMarche career envelope and cannot be projected onto The Brain or Kif Kroker.',
    live_action_egon_and_harold_ramis_imagery_forbidden: true,
    other_egon_voice_performer_forbidden: true,
    pinky_or_other_animaniacs_character_substitute_for_brain_forbidden: true,
    other_futurama_character_substitute_for_kif_forbidden: true,
    single_role_or_two_role_candidate_forbidden: true,
    toy_cosplay_game_poster_and_generic_franchise_ensemble_forbidden: true,
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
    exact_three_role_animated_character_composite_required: control.scope_contract.exact_three_role_animated_character_composite_required,
    brain_panel_required: control.scope_contract.brain_panel_required,
    kif_kroker_panel_required: control.scope_contract.kif_kroker_panel_required,
    animated_egon_spengler_panel_required: control.scope_contract.animated_egon_spengler_panel_required,
    maurice_lamarche_voice_performance_required_for_all_three_roles: control.scope_contract.maurice_lamarche_voice_performance_required_for_all_three_roles,
    role_specific_production_and_chronology_required: control.scope_contract.role_specific_production_and_chronology_required,
    canonical_years_is_broad_career_envelope_not_shared_role_date: control.scope_contract.canonical_years_is_broad_career_envelope_not_shared_role_date,
    live_action_egon_and_harold_ramis_imagery_forbidden: control.scope_contract.live_action_egon_and_harold_ramis_imagery_forbidden,
    other_egon_voice_performer_forbidden: control.scope_contract.other_egon_voice_performer_forbidden,
    pinky_or_other_animaniacs_character_substitute_for_brain_forbidden: control.scope_contract.pinky_or_other_animaniacs_character_substitute_for_brain_forbidden,
    other_futurama_character_substitute_for_kif_forbidden: control.scope_contract.other_futurama_character_substitute_for_kif_forbidden,
    single_role_or_two_role_candidate_forbidden: control.scope_contract.single_role_or_two_role_candidate_forbidden,
    toy_cosplay_game_poster_and_generic_franchise_ensemble_forbidden: control.scope_contract.toy_cosplay_game_poster_and_generic_franchise_ensemble_forbidden,
    all_three_faces_bodies_and_design_silhouettes_must_be_legible: control.scope_contract.all_three_faces_bodies_and_design_silhouettes_must_be_legible,
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
  disposition: 'canonical-maurice-lamarche-three-role-voice-scope-extracted-source-orbit-not-yet-authorized'
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
  'required_roles=The Brain,Kif Kroker,animated Egon Spengler',
  'canonical_years_semantics=broad career envelope only',
  'canonical_mutation=false'
].join('\n') + '\n');

console.log(`PASS — exact UC-170 canonical three-role voice scope extracted: ${declaredPerformances.length} declared performance(s), ${references.length} reference(s)`);
console.log('ROLES — The Brain, Kif Kroker, and animated Egon Spengler all required with separate chronology');
console.log(`ABSENCE — specimen still absent; source-ledger still absent; audit ${audit.status}`);
console.log(`EXISTING PORTRAIT — ${specimen.portrait.src} remains unchanged`);
console.log(`OUTPUT — ${OUT}`);
