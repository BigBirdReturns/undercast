#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-178.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-178-scope';
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

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-178', 'UC-178 control scope drift');
assert(control.actor === 'Eric Stoltz' && control.character === 'Rocky Dennis' && control.production === 'Mask (1985)' && control.years === '1985' && control.universe === 'Film' && control.side === 'still', 'UC-178 selector identity drift');
assert(control.expected_subject === 'Rocky Dennis' && control.audit_id === 'ma_14ee98b417aa8d0c8175a1a2', 'UC-178 selected absence drift');
assert(control.selector_artifact?.run_id === 30506759688 && control.selector_artifact?.artifact_id === 8745619768 && control.selector_artifact?.head_sha === '4a56bcc6d53c72c7645c9d76d0a7a9436ee4643e', 'UC-178 selector run custody drift');
assert(control.selector_artifact?.zip_sha256 === 'c575c3a261d2026c8b42e83217c108e35ca166281e3fdd09194224ca04b109ab' && control.selector_artifact?.selected_sha256 === 'a6fe288323ff19d78905187614621dbd3a5921161bfd7d7dc89eac3702270ffe' && control.selector_artifact?.queue_sha256 === 'b60969a22d17de4a80d13e28e88287289da53e88ed27116efac627455ff90bc1', 'UC-178 selector byte custody drift');
assert(control.selector_artifact?.open_absences === 432 && control.selector_artifact?.completed_packets === 40 && control.selector_artifact?.retained_queue === 40, 'UC-178 selector denominator drift');
const contract = control.scope_contract || {};
assert(contract.exact_eric_stoltz_rocky_dennis_mask_1985_still_required === true && contract.eric_stoltz_transformed_performance_required === true && contract.exact_mask_1985_film_production_required === true, 'UC-178 exact role contract drift');
assert(contract.rocky_dennis_subject_required_not_eric_stoltz_portrait === true && contract.michael_westmore_design_credit_must_remain_separate_from_stoltz_performance === true, 'UC-178 performance/design boundary drift');
assert(contract.real_roy_rocky_dennis_photographs_other_performers_and_other_productions_forbidden === true && contract.cher_rusty_dennis_sam_elliott_gar_laura_dern_diana_and_other_characters_cannot_substitute === true, 'UC-178 substitution boundary drift');
assert(contract.performer_portraits_makeup_test_only_images_posters_illustrations_colorized_reinterpretations_costumes_replicas_and_generic_condition_images_forbidden === true && contract.rocky_face_skull_brow_eyes_nose_mouth_teeth_hair_and_prosthetic_silhouette_must_be_legible === true, 'UC-178 nonperformance/visual boundary drift');
assert(contract.declared_1985_chronology_required === true && contract.existing_performer_portrait_must_remain_unchanged === true && contract.canonical_mutation === false, 'UC-178 canonical boundary drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;
assert(specimen, 'UC-178 specimen missing');
assert(specimen.actor === control.actor && specimen.character === control.character && specimen.production === control.production, 'UC-178 specimen identity drift');
assert(specimen.universe === control.universe && specimen.years === control.years, 'UC-178 specimen chronology/universe drift');
assert(specimen.designer === 'Michael Westmore' && specimen.transform === 4, 'UC-178 makeup-design boundary drift');
assert(specimen.link === 'https://en.wikipedia.org/wiki/Eric_Stoltz', 'UC-178 canonical link drift');
assert(specimen.still === null || specimen.still === undefined, 'UC-178 specimen already has a canonical still');
assert(specimen.portrait?.src === 'images/uc-178-portrait.jpg' && specimen.portrait?.kind === 'free' && specimen.portrait?.license === 'CC BY-SA 2.0', 'UC-178 existing portrait boundary drift');
assert(audit, 'UC-178 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side && audit.actor === control.actor && audit.character === control.character, 'UC-178 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-178 audit absence drift');
assert(audit.expected_subject === control.expected_subject && JSON.stringify(audit.risk_codes || []) === JSON.stringify(['source-declared-absent']), 'UC-178 audit expected-subject/risk drift');
assert(source, 'UC-178 source-ledger row missing');
assert(source.actor === control.actor && source.character === control.character && source.universe === control.universe, 'UC-178 source-ledger identity drift');
assert(!source.still && source.portrait?.src === 'images/uc-178-portrait.jpg', 'UC-178 source-ledger media boundary drift');

const declaredPerformances = Array.isArray(specimen.performances) ? specimen.performances : [];
const references = Array.isArray(specimen.references) ? specimen.references : [];
const scope = {
  version: 1,
  lane: 'card-backfill',
  record_id: control.record_id,
  canonical_kind: specimen.kind || null,
  actor: specimen.actor,
  declared_character: specimen.character,
  declared_production: specimen.production,
  years: specimen.years,
  universe: specimen.universe,
  designer: specimen.designer,
  transform: specimen.transform,
  known_for: specimen.knownFor || null,
  reveal: specimen.reveal || null,
  canonical_link: specimen.link || null,
  declared_performances: declaredPerformances,
  references,
  evidence_gap: {
    canonical_record_reference_count: references.length,
    canonical_record_performance_count: declaredPerformances.length,
    actor_role_source_required_before_discovery: references.length === 0,
    exact_mask_1985_production_source_required_before_discovery: true,
    makeup_design_source_required_before_design_claim_publication: true,
    real_person_and_dramatized_character_must_be_distinguished: true
  },
  role_boundary: {
    required_subject: 'Rocky Dennis',
    required_actor: 'Eric Stoltz',
    required_production: 'Mask (1985)',
    required_year: '1985',
    performance_mode: 'physical transformed performance under extensive prosthetic makeup',
    exact_finished_rocky_dennis_performance_required: true,
    eric_stoltz_performer_portrait_forbidden: true,
    real_roy_l_rocky_dennis_photograph_forbidden: true,
    designer: 'Michael Westmore',
    design_credit_must_remain_separate_from_performer_credit: true,
    other_characters_cannot_substitute: [
      'Cher as Rusty Dennis',
      'Sam Elliott as Gar',
      'Laura Dern as Diana',
      'other Mask cast members without a legible Rocky Dennis performance'
    ],
    nonperformance_substitutes_forbidden: [
      'Michael Westmore makeup test or appliance reference without the finished Eric Stoltz performance',
      'poster or promotional illustration',
      'colorized reinterpretation without exact underlying-frame custody',
      'costume, replica, wax figure, or cosplay',
      'generic craniodiaphyseal dysplasia or facial-difference imagery'
    ],
    required_visual_features: ['prosthetic skull and facial silhouette', 'brow and eyes', 'nose', 'mouth and teeth', 'hair and hairline', 'legible head-and-shoulder or wider performance silhouette'],
    exact_1985_chronology_required: true
  },
  existing_performer_media: {
    specimen_portrait: specimen.portrait,
    source_ledger_portrait: source.portrait,
    audit_portrait_id: 'ma_1caa66c9b7d70d9f5bc4e451',
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
    ...contract,
    specimen_still_absent: !specimen.still,
    source_ledger_still_absent: !source.still,
    audit_still_absent: audit.status === 'absent' && !audit.asset,
    discovery_denominator_authorized: false,
    visual_selection_authorized: false,
    render_authorized: false,
    canonical_mutation: false
  },
  custody: {
    selector_artifact: control.selector_artifact,
    control_sha256: sha(controlBytes),
    specimens_sha256: sha(specimenBytes),
    media_audit_sha256: sha(auditBytes),
    sources_sha256: sha(sourceBytes)
  },
  disposition: 'canonical-single-role-physical-transformation-scope-extracted-source-orbit-not-yet-authorized'
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
  `universe=${specimen.universe}`,
  `designer=${specimen.designer}`,
  `transform=${specimen.transform}`,
  `side=${control.side}`,
  `performances=${declaredPerformances.length}`,
  `references=${references.length}`,
  `source_ledger_row=present`,
  `specimen_still=absent`,
  `source_still=absent`,
  `existing_portrait=${specimen.portrait.src}`,
  `audit_status=${audit.status}`,
  `expected_subject=${audit.expected_subject}`,
  `required_subject=Eric Stoltz as Rocky Dennis in Mask (1985)`,
  `actor_role_source_required_before_discovery=${references.length === 0}`,
  `discovery_denominator_authorized=false`,
  `canonical_mutation=false`
].join('\n') + '\n');

console.log('PASS — exact UC-178 canonical scope extracted: Eric Stoltz / Rocky Dennis / Mask (1985)');
console.log(`EVIDENCE GAP — ${references.length} canonical reference(s), ${declaredPerformances.length} declared performance(s); actor-role source required before discovery`);
console.log(`ABSENCE — specimen still absent; source-ledger still absent; audit ${audit.status}`);
console.log(`EXISTING PORTRAIT — ${specimen.portrait.src} remains unchanged`);
console.log(`OUTPUT — ${OUT}`);
