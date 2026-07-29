#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-154.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-154-scope';
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

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-154', 'UC-154 control scope drift');
assert(control.actor === 'Tyler Mane' && control.character === 'Michael Myers' && control.production === 'Halloween (2007)' && control.years === '2007–2009' && control.universe === 'Horror' && control.side === 'still', 'UC-154 selector identity drift');
assert(control.selector_artifact?.artifact_id === 8710537497 && control.selector_artifact?.head_sha === 'fbea63b87d6dd0b5ff1cd3d50f0739e045a870e0' && control.selector_artifact?.zip_sha256 === '13876a3f72fb8f6c5cf690e42d070e663febacca73937dd109f14cbb944d2631', 'UC-154 selector custody drift');
assert(control.scope_contract?.exact_completed_michael_myers_character_still_required === true && control.scope_contract?.tyler_mane_performance_required === true && control.scope_contract?.halloween_2007_first_film_required === true && control.scope_contract?.halloween_ii_2009_substitute_forbidden === true && control.scope_contract?.actor_role_custody_must_remain_separate_from_frame_custody === true && control.scope_contract?.canonical_mutation === false, 'UC-154 scope contract drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;
assert(specimen, 'UC-154 specimen missing');
assert(specimen.actor === control.actor, `UC-154 specimen actor drift: ${specimen.actor}`);
assert(specimen.character === control.character, `UC-154 specimen character drift: ${specimen.character}`);
assert(specimen.production === control.production, `UC-154 specimen production drift: ${specimen.production}`);
assert(specimen.universe === control.universe, `UC-154 specimen universe drift: ${specimen.universe}`);
assert(specimen.years === control.years, `UC-154 specimen years drift: ${specimen.years}`);
assert(specimen.designer === 'Wayne Toth', `UC-154 designer drift: ${specimen.designer}`);
assert(specimen.still === null || specimen.still === undefined, 'UC-154 specimen already has a canonical still');
assert(specimen.portrait?.src === 'images/uc-154-portrait.jpg' && specimen.portrait?.kind === 'free', 'UC-154 existing portrait boundary drift');
assert(audit, 'UC-154 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side, 'UC-154 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-154 audit absence drift');
assert(audit.expected_subject === control.expected_subject, `UC-154 expected-subject drift: ${audit.expected_subject}`);
assert(!source?.still, 'UC-154 source ledger already has a canonical still');

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
    exact_completed_michael_myers_character_still_required: true,
    tyler_mane_performance_required: true,
    halloween_2007_first_film_required: true,
    canonical_year_range_semantics: '2007–2009 records Tyler Mane’s two-film tenure; this still obligation is bound only to Halloween (2007).',
    halloween_ii_2009_substitute_forbidden: true,
    original_1978_and_other_continuities_forbidden: true,
    other_michael_myers_performers_forbidden: true,
    young_michael_and_unmasked_tyler_mane_forbidden: true,
    standalone_mask_cosplay_merchandise_game_poster_and_montage_forbidden: true,
    character_face_mask_body_and_costume_must_be_legible: true,
    actor_role_custody_must_remain_separate_from_frame_custody: true
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
    exact_completed_michael_myers_character_still_required: control.scope_contract.exact_completed_michael_myers_character_still_required,
    tyler_mane_performance_required: control.scope_contract.tyler_mane_performance_required,
    halloween_2007_first_film_required: control.scope_contract.halloween_2007_first_film_required,
    canonical_year_range_is_mane_tenure_not_frame_date: control.scope_contract.canonical_year_range_is_mane_tenure_not_frame_date,
    halloween_ii_2009_substitute_forbidden: control.scope_contract.halloween_ii_2009_substitute_forbidden,
    original_1978_and_other_continuities_forbidden: control.scope_contract.original_1978_and_other_continuities_forbidden,
    other_michael_myers_performers_forbidden: control.scope_contract.other_michael_myers_performers_forbidden,
    young_michael_and_unmasked_tyler_mane_forbidden: control.scope_contract.young_michael_and_unmasked_tyler_mane_forbidden,
    standalone_mask_cosplay_merchandise_game_poster_and_montage_forbidden: control.scope_contract.standalone_mask_cosplay_merchandise_game_poster_and_montage_forbidden,
    character_face_mask_body_and_costume_must_be_legible: control.scope_contract.character_face_mask_body_and_costume_must_be_legible,
    actor_role_custody_must_remain_separate_from_frame_custody: control.scope_contract.actor_role_custody_must_remain_separate_from_frame_custody,
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
  disposition: 'canonical-2007-michael-myers-still-scope-extracted-source-orbit-not-yet-authorized'
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
  `side=${control.side}`,
  `designer=${specimen.designer}`,
  `performances=${declaredPerformances.length}`,
  `references=${references.length}`,
  `performance_modes=${JSON.stringify(performanceModes)}`,
  `source_ledger_row=${source ? 'present' : 'absent'}`,
  `specimen_still=${specimen.still ? 'present' : 'absent'}`,
  `source_still=${source?.still ? 'present' : 'absent'}`,
  `existing_portrait=${specimen.portrait?.src || 'absent'}`,
  `audit_status=${audit.status}`,
  `expected_subject=${audit.expected_subject}`,
  'frame_boundary=Halloween (2007) only; Halloween II (2009) forbidden as substitute',
  'canonical_mutation=false'
].join('\n') + '\n');

console.log(`PASS — exact UC-154 canonical still scope extracted: ${declaredPerformances.length} declared performance(s), ${references.length} reference(s)`);
console.log('FRAME — Tyler Mane completed Michael Myers in Halloween (2007) required');
console.log(`ABSENCE — specimen still absent; source-ledger still absent; audit ${audit.status}`);
console.log(`EXISTING PORTRAIT — ${specimen.portrait.src} remains unchanged`);
console.log(`OUTPUT — ${OUT}`);
