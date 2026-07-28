#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-097.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-097-scope';
const sha = value => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + '\n');
};

const [controlBytes, specimenBytes, auditBytes, sourceBytes] = await Promise.all([
  readFile(CONTROL),
  readFile(SPECIMENS),
  readFile(AUDIT),
  readFile(SOURCES)
]);
const control = JSON.parse(controlBytes);
const specimens = JSON.parse(specimenBytes);
const auditRoot = JSON.parse(auditBytes);
const sources = JSON.parse(sourceBytes);

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-097', 'UC-097 control scope drift');
assert(control.actor === 'Dan Stevens' && control.character === 'The Beast' && control.production === 'Beauty and the Beast' && control.years === '2017' && control.side === 'still', 'UC-097 selector identity drift');
assert(control.selector_artifact?.artifact_id === 8672452482 && control.selector_artifact?.head_sha === '883b813e534f2ba2d1ae8281a4b72d0e281d5bfb', 'UC-097 selector custody drift');
assert(control.scope_contract?.exact_2017_live_action_beast_required === true && control.scope_contract?.reject_1991_animation === true && control.scope_contract?.canonical_mutation === false, 'UC-097 scope contract drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;
assert(specimen, 'UC-097 specimen missing');
assert(specimen.actor === control.actor, `UC-097 specimen actor drift: ${specimen.actor}`);
assert(specimen.character === control.character, `UC-097 specimen character drift: ${specimen.character}`);
assert(specimen.production === control.production, `UC-097 specimen production drift: ${specimen.production}`);
assert(specimen.universe === control.universe, `UC-097 specimen universe drift: ${specimen.universe}`);
assert(specimen.years === control.years, `UC-097 specimen years drift: ${specimen.years}`);
assert(!specimen.still, 'UC-097 specimen already has a canonical still');
assert(audit, 'UC-097 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side, 'UC-097 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-097 audit absence drift');
assert(audit.expected_subject === control.expected_subject, `UC-097 expected-subject drift: ${audit.expected_subject}`);
assert(!source?.still, 'UC-097 source ledger already has a canonical still');

const declaredPerformances = Array.isArray(specimen.performances) ? specimen.performances : [];
const references = Array.isArray(specimen.references) ? specimen.references : [];
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
  references,
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
    exact_2017_live_action_beast_required: control.scope_contract.exact_2017_live_action_beast_required,
    untransformed_actor_forbidden: control.scope_contract.reject_untransformed_actor,
    human_prince_substitution_forbidden: control.scope_contract.reject_human_prince_substitution,
    animation_substitution_forbidden: control.scope_contract.reject_1991_animation,
    stage_merchandise_and_fan_art_forbidden: control.scope_contract.reject_stage_merchandise_and_fan_art,
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
  `source_ledger_row=${source ? 'present' : 'absent'}`,
  `specimen_still=${specimen.still ? 'present' : 'absent'}`,
  `source_still=${source?.still ? 'present' : 'absent'}`,
  `audit_status=${audit.status}`,
  `expected_subject=${audit.expected_subject}`,
  'canonical_mutation=false'
].join('\n') + '\n');

console.log(`PASS — exact UC-097 canonical scope extracted: ${declaredPerformances.length} declared performance(s), ${references.length} reference(s)`);
console.log(`ABSENCE — specimen still absent; source-ledger still absent; audit ${audit.status}`);
console.log(`OUTPUT — ${OUT}`);
