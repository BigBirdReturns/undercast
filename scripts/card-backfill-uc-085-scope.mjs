#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const CONTROL = '.github/CARD-BACKFILL-UC-085.json';
const SPECIMENS = 'data/specimens.json';
const AUDIT = 'data/MEDIA-AUDIT.json';
const SOURCES = 'data/SOURCES.json';
const OUT = process.env.OUT || '/tmp/card-backfill-uc-085-scope';
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

assert(control.version === 1 && control.lane === 'card-backfill' && control.record_id === 'UC-085', 'UC-085 control scope drift');
assert(control.actor === 'Ahmed Best' && control.character === 'Jar Jar Binks' && control.side === 'still', 'UC-085 selector identity drift');
assert(control.selector_artifact?.artifact_id === 8670042309 && control.selector_artifact?.head_sha === '21ee9394e61bd44b195d5008bf0481b7f907136a', 'UC-085 selector custody drift');
assert(control.scope_contract?.exact_episode_i_role_required === true && control.scope_contract?.reject_untransformed_actor === true && control.scope_contract?.reject_clone_wars_animation === true && control.scope_contract?.preserve_declared_performance_modes === true && control.scope_contract?.canonical_mutation === false, 'UC-085 scope contract drift');

const specimen = specimens.find(row => row.id === control.record_id);
const audit = (auditRoot.items || []).find(row => row.id === control.audit_id);
const source = sources.find(row => row.id === control.record_id) || null;

assert(specimen, 'UC-085 specimen missing');
assert(specimen.actor === control.actor, `UC-085 specimen actor drift: ${specimen.actor}`);
assert(specimen.character === control.character, `UC-085 specimen character drift: ${specimen.character}`);
assert(specimen.production === control.production, `UC-085 specimen production drift: ${specimen.production}`);
assert(specimen.universe === control.universe, `UC-085 specimen universe drift: ${specimen.universe}`);
assert(specimen.years === control.years, `UC-085 specimen years drift: ${specimen.years}`);
assert(!specimen.still, 'UC-085 specimen already has a canonical still');
assert(audit, 'UC-085 audit row missing');
assert(audit.wall_id === control.record_id && audit.side === control.side, 'UC-085 audit identity drift');
assert(audit.scope === 'sitewide' && audit.status === 'absent' && !audit.asset, 'UC-085 audit absence drift');
assert(audit.expected_subject === control.expected_subject, `UC-085 expected-subject drift: ${audit.expected_subject}`);
assert(!source?.still, 'UC-085 source ledger already has a canonical still');

const declaredPerformances = Array.isArray(specimen.performances) ? specimen.performances : [];
const references = Array.isArray(specimen.references) ? specimen.references : [];
const declaredModes = [...new Set(declaredPerformances.map(row => row.performance_mode).filter(Boolean))].sort();
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
  declared_performance_modes: declaredModes,
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
    exact_episode_i_role_required: control.scope_contract.exact_episode_i_role_required,
    untransformed_actor_forbidden: control.scope_contract.reject_untransformed_actor,
    later_live_action_substitution_forbidden: control.scope_contract.reject_later_live_action_substitution,
    clone_wars_animation_forbidden: control.scope_contract.reject_clone_wars_animation,
    game_render_forbidden: control.scope_contract.reject_game_render,
    merchandise_or_illustration_forbidden: control.scope_contract.reject_merchandise_or_illustration,
    declared_performance_modes_preserved: control.scope_contract.preserve_declared_performance_modes,
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
  `performance_modes=${declaredModes.join(',') || 'none'}`,
  `references=${references.length}`,
  `source_ledger_row=${source ? 'present' : 'absent'}`,
  `specimen_still=${specimen.still ? 'present' : 'absent'}`,
  `source_still=${source?.still ? 'present' : 'absent'}`,
  `audit_status=${audit.status}`,
  `expected_subject=${audit.expected_subject}`,
  'canonical_mutation=false'
].join('\n') + '\n');

console.log(`PASS — exact UC-085 canonical scope extracted: ${declaredPerformances.length} declared performance(s), ${declaredModes.length} performance mode(s), ${references.length} reference(s)`);
console.log(`ABSENCE — specimen still absent; source-ledger still absent; audit ${audit.status}`);
console.log(`OUTPUT — ${OUT}`);
