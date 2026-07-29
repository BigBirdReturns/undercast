#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-172.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-172-scope';
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

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-172', 'UC-172 control scope drift');
assert(control.kind === 'voice' && control.actor === 'Jim Cummings' && control.character === 'Winnie the Pooh, Tigger, Darkwing Duck' && control.production === 'Disney' && control.years === '1980s–' && control.universe === 'Voice' && control.side === 'still', 'UC-172 selector identity drift');
assert(control.selector_artifact?.artifact_id === 8730189672 && control.selector_artifact?.head_sha === '2d0a314e943b4efc878bdcb532bc051dbdc0cbc7' && control.selector_artifact?.zip_sha256 === '35aad2572ed9e5109cd9ccd991d142dd1c73aaaab2ef349a1746c5796b8a4fa5' && control.selector_artifact?.selected_sha256 === 'f621c3ca29a3db2593688454247581d927df0d677bfb6831ed47d4cb8b04286f', 'UC-172 selector custody drift');
assert(control.scope_contract?.exact_three_role_animated_character_composite_required === true && JSON.stringify(control.scope_contract?.required_roles) === JSON.stringify(['pooh','tigger','darkwing']) && control.scope_contract?.jim_cummings_voice_performance_required_for_all_three_roles === true && control.scope_contract?.pooh_inherited_voice_must_be_distinguished_from_sterling_holloway === true && control.scope_contract?.tigger_inherited_voice_must_be_distinguished_from_paul_winchell === true && control.scope_contract?.canonical_mutation === false, 'UC-172 scope contract drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;
assert(specimen, 'UC-172 specimen missing');
assert(specimen.kind === 'voice', `UC-172 specimen kind drift: ${specimen.kind}`);
assert(specimen.actor === control.actor, `UC-172 specimen actor drift: ${specimen.actor}`);
assert(specimen.character === control.character, `UC-172 specimen character drift: ${specimen.character}`);
assert(specimen.production === control.production, `UC-172 specimen production drift: ${specimen.production}`);
assert(specimen.universe === control.universe, `UC-172 specimen universe drift: ${specimen.universe}`);
assert(specimen.years === control.years, `UC-172 specimen years drift: ${specimen.years}`);
assert(specimen.still === null || specimen.still === undefined, 'UC-172 specimen already has a canonical still');
assert(specimen.portrait?.src === 'images/uc-172-portrait.jpg' && specimen.portrait?.kind === 'free', 'UC-172 existing portrait boundary drift');
assert(source, 'UC-172 source-ledger row missing');
assert(source.actor === control.actor && source.character === control.character && source.universe === control.universe, 'UC-172 source-ledger identity drift');
assert(source.still === null || source.still === undefined, 'UC-172 source ledger already has a canonical still');
assert(source.portrait?.src === 'images/uc-172-portrait.jpg', 'UC-172 source-ledger portrait boundary drift');
assert(audit, 'UC-172 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side, 'UC-172 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-172 audit absence drift');
assert(audit.expected_subject === control.expected_subject, `UC-172 expected-subject drift: ${audit.expected_subject}`);

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
  composite_boundary: {
    required_roles: ['pooh','tigger','darkwing'],
    display_roles: ['Winnie the Pooh','Tigger','Darkwing Duck'],
    exact_three_role_animated_character_composite_required: true,
    jim_cummings_voice_performance_required_for_all_three_roles: true,
    actor_role_custody_must_remain_separate_from_character_image_custody: true,
    all_three_faces_bodies_and_design_silhouettes_must_be_legible: true,
    single_role_or_two_role_candidate_forbidden: true
  },
  chronology_boundary: {
    canonical_years_semantics: '1980s– is a broad Jim Cummings career envelope and is not a shared role-debut date.',
    pooh: 'Jim Cummings inherited Winnie the Pooh after Sterling Holloway; the packet must establish the Cummings-era role independently.',
    tigger: 'Jim Cummings inherited Tigger after Paul Winchell; the packet must establish the Cummings-era role independently.',
    darkwing: 'Darkwing Duck must be the Disney animated television character voiced by Jim Cummings.',
    other_pooh_tigger_or_darkwing_performers_forbidden: true
  },
  exclusion_boundary: {
    sterling_holloway_pooh_substitute_forbidden: true,
    paul_winchell_tigger_substitute_forbidden: true,
    park_costume_live_action_merchandise_and_generic_disney_ensemble_forbidden: true,
    another_bear_tiger_or_duck_forbidden: true
  },
  existing_performer_media: {
    specimen_portrait: specimen.portrait,
    source_ledger_portrait: source.portrait,
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
    ...control.scope_contract,
    specimen_still_absent: !specimen.still,
    source_ledger_still_absent: !source.still,
    audit_still_absent: audit.status === 'absent' && !audit.asset,
    existing_performer_portrait: 'images/uc-172-portrait.jpg',
    canonical_mutation: false
  },
  custody: {
    selector_artifact: control.selector_artifact,
    control_sha256: sha(controlBytes),
    specimens_sha256: sha(specimenBytes),
    media_audit_sha256: sha(auditBytes),
    sources_sha256: sha(sourceBytes)
  },
  disposition: 'canonical-jim-cummings-three-role-scope-extracted-source-orbit-not-yet-authorized'
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
  `source_still=${source.still ? 'present' : 'absent'}`,
  `existing_portrait=${specimen.portrait?.src || 'absent'}`,
  `audit_status=${audit.status}`,
  `expected_subject=${audit.expected_subject}`,
  'required_roles=pooh,tigger,darkwing',
  'canonical_mutation=false'
].join('\n') + '\n');

console.log(`PASS — exact UC-172 canonical three-role scope extracted: ${declaredPerformances.length} declared performance(s), ${references.length} reference(s)`);
console.log('ROLES — Winnie the Pooh, Tigger, Darkwing Duck');
console.log(`ABSENCE — specimen still absent; source-ledger still absent; audit ${audit.status}`);
console.log(`EXISTING PORTRAIT — ${specimen.portrait.src} remains unchanged`);
console.log(`OUTPUT — ${OUT}`);
