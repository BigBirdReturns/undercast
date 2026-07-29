#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-176.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-176-scope';
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

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-176', 'UC-176 control scope drift');
assert(control.actor === 'Fredric March' && control.character === 'Mr. Hyde' && control.production === 'Dr. Jekyll and Mr. Hyde (1931)' && control.years === '1931' && control.universe === 'Film' && control.side === 'still', 'UC-176 selector identity drift');
assert(control.expected_subject === 'Mr. Hyde' && control.audit_id === 'ma_214b44ba458987517acdd2b8', 'UC-176 selected absence drift');
assert(control.selector_artifact?.run_id === 30499384270 && control.selector_artifact?.artifact_id === 8742861304 && control.selector_artifact?.head_sha === '93bad84d568cb8ce15930d91a4c8e06759f527ce', 'UC-176 selector run custody drift');
assert(control.selector_artifact?.zip_sha256 === 'b06df7d84a86fea5d088ec833b074361cd1bad8405460e07ff2b032ff7558857' && control.selector_artifact?.selected_sha256 === '97c8b35912a0f463083cdc7a2b34e963fc2fe802b8c3418792230b3701a72410' && control.selector_artifact?.queue_sha256 === '96f0614bcca95bbd7bcc7e8437f8075f2b8deba772cd05b026415a0a45a39462', 'UC-176 selector byte custody drift');
assert(control.selector_artifact?.open_absences === 433 && control.selector_artifact?.completed_packets === 39 && control.selector_artifact?.retained_queue === 40, 'UC-176 selector denominator drift');
const contract = control.scope_contract || {};
assert(contract.exact_fredric_march_mr_hyde_1931_still_required === true && contract.fredric_march_transformed_performance_required === true && contract.exact_1931_film_production_required === true, 'UC-176 exact role contract drift');
assert(contract.mr_hyde_subject_required_not_clean_faced_dr_jekyll === true && contract.wally_westmore_design_credit_must_remain_separate_from_march_performance === true, 'UC-176 performance/design boundary drift');
assert(contract.spencer_tracy_1941_john_barrymore_1920_other_hyde_performers_and_other_adaptations_forbidden === true && contract.hyde_face_hair_brow_nose_mouth_teeth_and_transformed_silhouette_must_be_legible === true, 'UC-176 substitution/visual boundary drift');
assert(contract.existing_performer_portrait_must_remain_unchanged === true && contract.canonical_mutation === false, 'UC-176 canonical boundary drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;
assert(specimen, 'UC-176 specimen missing');
assert(specimen.actor === control.actor && specimen.character === control.character && specimen.production === control.production, 'UC-176 specimen identity drift');
assert(specimen.universe === control.universe && specimen.years === control.years, 'UC-176 specimen chronology/universe drift');
assert(specimen.designer === 'Wally Westmore' && specimen.transform === 4, 'UC-176 makeup-design boundary drift');
assert(specimen.link === 'https://en.wikipedia.org/wiki/Fredric_March', 'UC-176 canonical link drift');
assert(specimen.still === null || specimen.still === undefined, 'UC-176 specimen already has a canonical still');
assert(specimen.portrait?.src === 'images/uc-176-portrait.jpg' && specimen.portrait?.kind === 'free' && specimen.portrait?.license === 'Public domain', 'UC-176 existing portrait boundary drift');
assert(audit, 'UC-176 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side && audit.actor === control.actor && audit.character === control.character, 'UC-176 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-176 audit absence drift');
assert(audit.expected_subject === control.expected_subject && JSON.stringify(audit.risk_codes || []) === JSON.stringify(['source-declared-absent']), 'UC-176 audit expected-subject/risk drift');
assert(source, 'UC-176 source-ledger row missing');
assert(source.actor === control.actor && source.character === control.character && source.universe === control.universe, 'UC-176 source-ledger identity drift');
assert(!source.still && source.portrait?.src === 'images/uc-176-portrait.jpg', 'UC-176 source-ledger media boundary drift');

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
    exact_1931_production_source_required_before_discovery: true,
    makeup_design_source_required_before_design_claim_publication: true
  },
  role_boundary: {
    required_subject: 'Mr. Hyde',
    required_actor: 'Fredric March',
    required_production: 'Dr. Jekyll and Mr. Hyde (1931)',
    required_year: '1931',
    performance_mode: 'physical transformed performance under character makeup',
    exact_transformed_hyde_required: true,
    clean_faced_dr_jekyll_only_image_forbidden: true,
    designer: 'Wally Westmore',
    design_credit_must_remain_separate_from_performer_credit: true,
    other_adaptations_and_performers_forbidden: [
      'Spencer Tracy — Dr. Jekyll and Mr. Hyde (1941)',
      'John Barrymore — Dr. Jekyll and Mr. Hyde (1920)',
      'other film, television, stage, illustration, or game adaptations'
    ],
    nonperformance_substitutes_forbidden: [
      'Fredric March performer portrait',
      'Wally Westmore makeup reference without the finished March performance',
      'poster or lobby-card illustration',
      'colorized reinterpretation without exact underlying-frame custody',
      'generic Mr. Hyde or monster imagery'
    ],
    required_visual_features: ['Hyde face', 'hair and hairline', 'brow', 'nose', 'mouth and teeth', 'transformed head-and-shoulder silhouette'],
    exact_1931_chronology_required: true
  },
  existing_performer_media: {
    specimen_portrait: specimen.portrait,
    source_ledger_portrait: source.portrait,
    audit_portrait_id: 'ma_d1e73e44469cc5f9dc14599b',
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
  `required_subject=Fredric March as transformed Mr. Hyde in the 1931 film`,
  `actor_role_source_required_before_discovery=${references.length === 0}`,
  `discovery_denominator_authorized=false`,
  `canonical_mutation=false`
].join('\n') + '\n');

console.log(`PASS — exact UC-176 canonical scope extracted: Fredric March / Mr. Hyde / 1931`);
console.log(`EVIDENCE GAP — ${references.length} canonical reference(s), ${declaredPerformances.length} declared performance(s); actor-role source required before discovery`);
console.log(`ABSENCE — specimen still absent; source-ledger still absent; audit ${audit.status}`);
console.log(`EXISTING PORTRAIT — ${specimen.portrait.src} remains unchanged`);
console.log(`OUTPUT — ${OUT}`);
