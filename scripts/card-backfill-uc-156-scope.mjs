#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-156.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-156-scope';
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

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-156', 'UC-156 control scope drift');
assert(control.kind === 'voice' && control.actor === 'Nicholas Briggs' && control.character === 'The voice of the Daleks & Cybermen' && control.production === 'Doctor Who (2005– )' && control.years === '2005–' && control.universe === 'TV' && control.side === 'still', 'UC-156 selector identity drift');
assert(control.selector_artifact?.artifact_id === 8711475187 && control.selector_artifact?.head_sha === '921fb6feee828717efd09bf0bea90f39bdd76cb1' && control.selector_artifact?.zip_sha256 === 'dd46266690822023319eb4526cf69b9ea27b1d9f12968ab6563c35329205fa5b' && control.selector_artifact?.selected_sha256 === '856cfffa24c2de44643bb22c7f7dcfae2a95fd6257affd9f7c92ef2481c2c47b', 'UC-156 selector custody drift');
assert(control.scope_contract?.exact_two_role_character_composite_required === true && control.scope_contract?.dalek_panel_required === true && control.scope_contract?.cyberman_panel_required === true && control.scope_contract?.nicholas_briggs_voice_performance_required_for_both_roles === true && control.scope_contract?.revived_television_era_2005_plus_required === true && control.scope_contract?.actor_role_custody_must_remain_separate_from_visible_operator_or_suit_performer === true && control.scope_contract?.canonical_mutation === false, 'UC-156 scope contract drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;
assert(specimen, 'UC-156 specimen missing');
assert(specimen.kind === 'voice', `UC-156 specimen kind drift: ${specimen.kind}`);
assert(specimen.actor === control.actor, `UC-156 specimen actor drift: ${specimen.actor}`);
assert(specimen.character === control.character, `UC-156 specimen character drift: ${specimen.character}`);
assert(specimen.production === control.production, `UC-156 specimen production drift: ${specimen.production}`);
assert(specimen.universe === control.universe, `UC-156 specimen universe drift: ${specimen.universe}`);
assert(specimen.years === control.years, `UC-156 specimen years drift: ${specimen.years}`);
assert(specimen.still === null || specimen.still === undefined, 'UC-156 specimen already has a canonical still');
assert(specimen.portrait?.src === 'images/uc-156-portrait.jpg' && specimen.portrait?.kind === 'free', 'UC-156 existing portrait boundary drift');
assert(audit, 'UC-156 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side, 'UC-156 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-156 audit absence drift');
assert(audit.expected_subject === control.expected_subject, `UC-156 expected-subject drift: ${audit.expected_subject}`);
assert(!source?.still, 'UC-156 source ledger already has a canonical still');

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
    exact_two_role_character_composite_required: true,
    required_roles: ['Daleks', 'Cybermen'],
    nicholas_briggs_voice_performance_required_for_both_roles: true,
    revived_television_era_2005_plus_required: true,
    actor_role_custody_must_remain_separate_from_visible_operator_or_suit_performer: true,
    classic_series_voice_substitute_forbidden: true,
    audio_only_substitute_for_television_forbidden: true,
    dalek_only_or_cyberman_only_candidate_forbidden: true,
    unrelated_dalek_operator_or_cyberman_suit_performer_substitute_forbidden: true,
    toy_cosplay_game_poster_and_generic_monster_montage_forbidden: true,
    both_creature_faces_bodies_and_design_silhouettes_must_be_legible: true
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
    exact_two_role_character_composite_required: control.scope_contract.exact_two_role_character_composite_required,
    dalek_panel_required: control.scope_contract.dalek_panel_required,
    cyberman_panel_required: control.scope_contract.cyberman_panel_required,
    nicholas_briggs_voice_performance_required_for_both_roles: control.scope_contract.nicholas_briggs_voice_performance_required_for_both_roles,
    revived_television_era_2005_plus_required: control.scope_contract.revived_television_era_2005_plus_required,
    actor_role_custody_must_remain_separate_from_visible_operator_or_suit_performer: control.scope_contract.actor_role_custody_must_remain_separate_from_visible_operator_or_suit_performer,
    classic_series_voice_substitute_forbidden: control.scope_contract.classic_series_voice_substitute_forbidden,
    audio_only_substitute_for_television_forbidden: control.scope_contract.audio_only_substitute_for_television_forbidden,
    dalek_only_or_cyberman_only_candidate_forbidden: control.scope_contract.dalek_only_or_cyberman_only_candidate_forbidden,
    unrelated_dalek_operator_or_cyberman_suit_performer_substitute_forbidden: control.scope_contract.unrelated_dalek_operator_or_cyberman_suit_performer_substitute_forbidden,
    toy_cosplay_game_poster_and_generic_monster_montage_forbidden: control.scope_contract.toy_cosplay_game_poster_and_generic_monster_montage_forbidden,
    both_creature_faces_bodies_and_design_silhouettes_must_be_legible: control.scope_contract.both_creature_faces_bodies_and_design_silhouettes_must_be_legible,
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
  disposition: 'canonical-dalek-cyberman-voice-composite-scope-extracted-source-orbit-not-yet-authorized'
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
  'required_roles=Daleks,Cybermen',
  'performance_mode=voice',
  'operator_and_suit_performer_separation=true',
  'canonical_mutation=false'
].join('\n') + '\n');

console.log(`PASS — exact UC-156 canonical voice-composite scope extracted: ${declaredPerformances.length} declared performance(s), ${references.length} reference(s)`);
console.log('ROLES — Daleks and Cybermen both required; Nicholas Briggs voice custody separate from operators and suit performers');
console.log(`ABSENCE — specimen still absent; source-ledger still absent; audit ${audit.status}`);
console.log(`EXISTING PORTRAIT — ${specimen.portrait.src} remains unchanged`);
console.log(`OUTPUT — ${OUT}`);
