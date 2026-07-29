#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-146.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-146-scope';
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

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-146', 'UC-146 control scope drift');
assert(control.actor === 'Tim Rose' && control.character === 'Admiral Ackbar / Salacious B. Crumb' && control.production === 'Return of the Jedi' && control.years === '1983–2019' && control.universe === 'Film' && control.side === 'portrait', 'UC-146 selector identity drift');
assert(control.selector_artifact?.artifact_id === 8709311632 && control.selector_artifact?.head_sha === 'af26ce51017999fe011632ecde8152717f3932dc' && control.selector_artifact?.zip_sha256 === '516e3a32b335de4989f017471f697dfb546108c8e887571954418854ea7fa65f', 'UC-146 selector custody drift');
assert(control.scope_contract?.exact_untransformed_performer_portrait_required === true && control.scope_contract?.expected_person === 'Tim Rose' && control.scope_contract?.performer_portrait_and_character_still_must_remain_separate === true && control.scope_contract?.existing_character_still_must_remain_unchanged === true && control.scope_contract?.canonical_mutation === false, 'UC-146 scope contract drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;
assert(specimen, 'UC-146 specimen missing');
assert(specimen.actor === control.actor, `UC-146 specimen actor drift: ${specimen.actor}`);
assert(specimen.character === control.character, `UC-146 specimen character drift: ${specimen.character}`);
assert(specimen.production === control.production, `UC-146 specimen production drift: ${specimen.production}`);
assert(specimen.universe === control.universe, `UC-146 specimen universe drift: ${specimen.universe}`);
assert(specimen.years === control.years, `UC-146 specimen years drift: ${specimen.years}`);
assert(specimen.portrait === null || specimen.portrait === undefined, 'UC-146 specimen already has a canonical portrait');
assert(specimen.still?.src === 'images/uc-146-still.jpg' && specimen.still?.kind === 'still', 'UC-146 existing character still boundary drift');
assert(audit, 'UC-146 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side, 'UC-146 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-146 audit absence drift');
assert(audit.expected_subject === control.expected_subject, `UC-146 expected-subject drift: ${audit.expected_subject}`);
assert(!source?.portrait, 'UC-146 source ledger already has a canonical portrait');

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
  portrait_boundary: {
    expected_person: control.expected_subject,
    exact_untransformed_performer_portrait_required: true,
    independent_person_identity_custody_required: true,
    performer_portrait_and_character_still_must_remain_separate: true,
    other_person_named_tim_rose_forbidden: true,
    admiral_ackbar_or_salacious_crumb_image_forbidden_on_portrait_side: true,
    unlabeled_group_image_forbidden: true,
    caption_or_metadata_must_identify_tim_rose: true,
    face_must_be_independently_legible: true
  },
  existing_character_media: {
    specimen_still: specimen.still || null,
    source_ledger_still: source?.still || null,
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
    exact_untransformed_performer_portrait_required: control.scope_contract.exact_untransformed_performer_portrait_required,
    independent_person_identity_custody_required: control.scope_contract.independent_person_identity_custody_required,
    performer_portrait_and_character_still_must_remain_separate: control.scope_contract.performer_portrait_and_character_still_must_remain_separate,
    other_person_named_tim_rose_forbidden: control.scope_contract.other_person_named_tim_rose_forbidden,
    admiral_ackbar_or_salacious_crumb_image_forbidden_on_portrait_side: control.scope_contract.admiral_ackbar_or_salacious_crumb_image_forbidden_on_portrait_side,
    unlabeled_group_image_forbidden: control.scope_contract.unlabeled_group_image_forbidden,
    caption_or_metadata_must_identify_tim_rose: control.scope_contract.caption_or_metadata_must_identify_tim_rose,
    face_must_be_independently_legible: control.scope_contract.face_must_be_independently_legible,
    existing_character_still_must_remain_unchanged: control.scope_contract.existing_character_still_must_remain_unchanged,
    specimen_portrait_absent: !specimen.portrait,
    source_ledger_portrait_absent: !source?.portrait,
    audit_portrait_absent: audit.status === 'absent' && !audit.asset,
    canonical_mutation: false
  },
  custody: {
    selector_artifact: control.selector_artifact,
    control_sha256: sha(controlBytes),
    specimens_sha256: sha(specimenBytes),
    media_audit_sha256: sha(auditBytes),
    sources_sha256: sha(sourceBytes)
  },
  disposition: 'canonical-portrait-scope-extracted-source-orbit-not-yet-authorized'
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
  `performances=${declaredPerformances.length}`,
  `references=${references.length}`,
  `performance_modes=${JSON.stringify(performanceModes)}`,
  `source_ledger_row=${source ? 'present' : 'absent'}`,
  `specimen_portrait=${specimen.portrait ? 'present' : 'absent'}`,
  `source_portrait=${source?.portrait ? 'present' : 'absent'}`,
  `existing_character_still=${specimen.still ? 'present' : 'absent'}`,
  `audit_status=${audit.status}`,
  `expected_subject=${audit.expected_subject}`,
  'canonical_mutation=false'
].join('\n') + '\n');

console.log(`PASS — exact UC-146 canonical portrait scope extracted: ${declaredPerformances.length} declared performance(s), ${references.length} reference(s)`);
console.log(`PORTRAIT — Tim Rose untransformed performer identity required`);
console.log(`ABSENCE — specimen portrait absent; source-ledger portrait absent; audit ${audit.status}`);
console.log(`EXISTING STILL — ${specimen.still.src} remains unchanged`);
console.log(`OUTPUT — ${OUT}`);
