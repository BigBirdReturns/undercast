#!/usr/bin/env python3
from pathlib import Path
import json
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, value: str) -> None:
    Path(path).write_text(value)


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)


def sub_once(source: str, pattern: str, replacement: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, lambda _match: replacement, source, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected one regex match, found {count}")
    return updated


v5_module = r'''import { canonicalJson, sha256 } from "./card-backfill-cohort.mjs";
import { isMultiSubject } from "./card-backfill-source-policy-v3.mjs";
import { CARD_BACKFILL_SOURCE_POLICY_V2 as CARD_BACKFILL_SOURCE_POLICY_V4 } from "./card-backfill-source-policy-v2.mjs";

export const CARD_BACKFILL_SOURCE_POLICY_V5 = Object.freeze({
  version: 5,
  revision: 0,
  lane: "card-backfill-source-policy",
  policy_id: "card-backfill-policy-v5-two-source-recovery-1",
  parent_policy_id: CARD_BACKFILL_SOURCE_POLICY_V4.policy_id,
  lessons_contract_path: CARD_BACKFILL_SOURCE_POLICY_V4.lessons_contract_path,
  lessons_contract_sha256: CARD_BACKFILL_SOURCE_POLICY_V4.lessons_contract_sha256,
  inherited_lesson_ids: CARD_BACKFILL_SOURCE_POLICY_V4.inherited_lesson_ids,
  still_route: "mediawiki-bound-multicandidate-v5",
  portrait_route: "commons-bound-multicandidate-v5",
  page_search_limit: 16,
  file_metadata_limit: 60,
  downloaded_candidate_limit: 12,
  minimum_width: 500,
  minimum_height: 400,
  original_or_1600px_transport: true,
  repository_duplicate_prescreen: true,
  exact_subject_and_production_evidence: true,
  actor_role_extract_required_when_available: true,
  predownload_textual_binding_gate: true,
  exact_lead_pageimage_custody_allowed: true,
  generic_filename_requires_exact_pageimage_relation: true,
  exact_subject_pageimage_plus_independent_actor_role_chain_allowed: true,
  wrong_adaptation_and_non_depiction_filter: true,
  multi_subjects_require_composite_lane: true,
  selected_image_never_proves_identity_or_role: true,
  independent_machine_or_person_adjudication_required: true,
  one_attempt_per_obligation_per_policy_version: true,
  immutable_parallel_discovery_wave: true,
  serialized_exact_head_reducer: true,
  fail_closed: true,
  canonical_mutation: false,
});

function priorPolicyVersion(attempt) {
  const explicit = Number(attempt?.source_policy_version || attempt?.source_policy?.version || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const cohortKey = String(attempt?.cohort_key || "");
  const encoded = Number(cohortKey.match(/\bv(\d+)\b/i)?.[1] || 0);
  return Number.isFinite(encoded) && encoded > 0 ? encoded : 1;
}

function cohortRows(obligations) {
  const map = new Map();
  for (const row of obligations) {
    const rows = map.get(row.cohort_key) || [];
    rows.push(row);
    map.set(row.cohort_key, rows);
  }
  return [...map.entries()].map(([cohortKey, rows]) => ({
    cohort_key: cohortKey,
    disposition: "ready",
    count: rows.length,
    first_obligation_id: rows[0]?.obligation_id || null,
    shape: rows[0]?.shape || null,
    quarantine_reason_counts: {},
    obligation_ids: rows.map((row) => row.obligation_id),
  })).sort((a, b) => b.count - a.count || a.cohort_key.localeCompare(b.cohort_key));
}

export function buildSourcePolicyV5Estate({ estate, attemptIndex, stagedObligationIds = [] }) {
  const attempted = new Map((attemptIndex?.entries || []).map((row) => [row.obligation_id, row.attempts || []]));
  const staged = new Set(stagedObligationIds);
  const obligations = [];
  const exclusions = [];

  for (const row of estate.obligations || []) {
    const attempts = attempted.get(row.obligation_id) || [];
    const versions = attempts.map(priorPolicyVersion);
    const eligibleBoundary = row.disposition === "ready"
      || (row.side === "still"
        && row.shape?.source_route === "open-web-exception"
        && (row.quarantine_reasons || []).length === 1
        && row.quarantine_reasons[0] === "no-bounded-still-source-route");
    if (!eligibleBoundary) {
      exclusions.push({ obligation_id: row.obligation_id, reason: "residual-non-source-policy-quarantine" });
      continue;
    }
    if (row.side === "still" && isMultiSubject(row.expected_subject)) {
      exclusions.push({ obligation_id: row.obligation_id, reason: "multi-subject-composite-required" });
      continue;
    }
    if (staged.has(row.obligation_id)) {
      exclusions.push({ obligation_id: row.obligation_id, reason: "already-staged" });
      continue;
    }
    if (!versions.some((version) => version >= CARD_BACKFILL_SOURCE_POLICY_V4.version)) {
      exclusions.push({ obligation_id: row.obligation_id, reason: "source-policy-v4-not-yet-attempted" });
      continue;
    }
    if (versions.some((version) => version >= CARD_BACKFILL_SOURCE_POLICY_V5.version)) {
      exclusions.push({ obligation_id: row.obligation_id, reason: "source-policy-v5-already-attempted" });
      continue;
    }

    const route = row.side === "portrait" ? CARD_BACKFILL_SOURCE_POLICY_V5.portrait_route : CARD_BACKFILL_SOURCE_POLICY_V5.still_route;
    const shape = { ...row.shape, source_route: route };
    const cohortKey = [shape.side, shape.performance_mode, shape.source_route, shape.evidence_tier, shape.render_profile].join("::");
    const { scope_sha256: _oldScopeSha, ...body } = row;
    const base = {
      ...body,
      shape,
      cohort_key: cohortKey,
      disposition: "ready",
      quarantine_reasons: [],
      source_policy: CARD_BACKFILL_SOURCE_POLICY_V5,
      source_policy_id: CARD_BACKFILL_SOURCE_POLICY_V5.policy_id,
      source_policy_version: CARD_BACKFILL_SOURCE_POLICY_V5.version,
      source_policy_revision: CARD_BACKFILL_SOURCE_POLICY_V5.revision,
      lessons_contract_sha256: CARD_BACKFILL_SOURCE_POLICY_V5.lessons_contract_sha256,
      retry_of_attempt_count: attempts.length,
      prior_attempts: attempts.map((attempt) => ({
        discovery_batch_sha256: attempt.discovery_batch_sha256,
        cohort_key: attempt.cohort_key,
        final_disposition: attempt.final_disposition,
        reason: attempt.reason,
        source_policy_id: attempt.source_policy_id || null,
        source_policy_version: priorPolicyVersion(attempt),
        source_policy_revision: attempt.source_policy_revision ?? null,
        lessons_contract_sha256: attempt.lessons_contract_sha256 || null,
      })),
      canonical_mutation: false,
    };
    obligations.push({ ...base, scope_sha256: sha256(canonicalJson(base)) });
  }

  obligations.sort((a, b) => a.obligation_id.localeCompare(b.obligation_id, undefined, { numeric: true }));
  const cohorts = cohortRows(obligations);
  const hashBody = {
    campaign_id: estate.campaign_id,
    source_estate_sha256: estate.estate_sha256,
    source_policy: CARD_BACKFILL_SOURCE_POLICY_V5,
    obligations: obligations.map((row) => ({ obligation_id: row.obligation_id, scope_sha256: row.scope_sha256, cohort_key: row.cohort_key })),
  };
  return {
    version: 1,
    lane: "card-backfill-source-policy-v5-estate",
    campaign_id: estate.campaign_id,
    source_estate_sha256: estate.estate_sha256,
    estate_sha256: sha256(canonicalJson(hashBody)),
    source_policy: CARD_BACKFILL_SOURCE_POLICY_V5,
    counts: { ready: obligations.length, cohorts: cohorts.length, excluded: exclusions.length },
    obligations,
    cohorts,
    exclusions,
    canonical_mutation: false,
  };
}
'''
write("scripts/lib/card-backfill-source-policy-v5.mjs", v5_module)

binding = read("scripts/lib/card-backfill-source-policy-v3.mjs")
binding = replace_once(
    binding,
    'export function evaluateSourceCandidate({ side, expectedSubject, actor, production, performanceMode, candidate, actorEvidence = null }) {',
    'export function evaluateSourceCandidate({ side, expectedSubject, actor, production, performanceMode, candidate, actorEvidence = null, sourcePolicyVersion = 4 }) {',
    "candidate evaluator policy version",
)
binding = replace_once(
    binding,
    '  const subjectBound = fileHasAlias || pageimageSubjectBound;\n  const productionBound = fileHasProduction || pageimageProductionBound;\n  const actorEvidenceBound = actorRoleBound(actorEvidence, aliases, production);',
    '  const subjectBound = fileHasAlias || pageimageSubjectBound;\n  const actorEvidenceBound = actorRoleBound(actorEvidence, aliases, production);\n  const policyVersion = Number(sourcePolicyVersion || 4);\n  const twoSourceRecovery = Boolean(policyVersion >= 5 && pageimageSubjectBound && actorEvidenceBound);\n  const productionBound = fileHasProduction || pageimageProductionBound || twoSourceRecovery;',
    "v5 two-source production custody",
)
binding = replace_once(binding, '  if (roleBound) adjustment += 160;', '  if (roleBound) adjustment += 160;\n  if (twoSourceRecovery) adjustment += 120;', "v5 score adjustment")
binding = replace_once(binding, '      actor_role_bound: roleBound,', '      actor_role_bound: roleBound,\n      two_source_recovery: twoSourceRecovery,\n      source_policy_version: policyVersion,', "v5 fact receipt")
write("scripts/lib/card-backfill-source-policy-v3.mjs", binding)

source = read("scripts/card-backfill-source-v2.mjs")
source = replace_once(
    source,
    '    performanceMode: item.shape?.performance_mode || item.cohort_key?.split("::")[1],\n    actorEvidence,\n  });',
    '    performanceMode: item.shape?.performance_mode || item.cohort_key?.split("::")[1],\n    actorEvidence,\n    sourcePolicyVersion: item.source_policy_version || item.source_policy?.version || CARD_BACKFILL_SOURCE_POLICY_V2.version,\n  });',
    "still policy version custody",
)
source = replace_once(
    source,
    '    performanceMode: item.shape?.performance_mode || item.cohort_key?.split("::")[1],\n    actorEvidence: null,\n  });',
    '    performanceMode: item.shape?.performance_mode || item.cohort_key?.split("::")[1],\n    actorEvidence: null,\n    sourcePolicyVersion: item.source_policy_version || item.source_policy?.version || CARD_BACKFILL_SOURCE_POLICY_V2.version,\n  });',
    "portrait policy version custody",
)
source = replace_once(
    source,
    '    source_policy_version: CARD_BACKFILL_SOURCE_POLICY_V2.version,',
    '    source_policy_version: Number(item.source_policy_version || item.source_policy?.version || CARD_BACKFILL_SOURCE_POLICY_V2.version),',
    "candidate policy version receipt",
)
source = sub_once(
    source,
    r'  const planPath = resolve\(option\("--plan"\)\);[\s\S]*?  const endpoints = \{',
    '''  const planPath = resolve(option("--plan"));
  const out = resolve(option("--out", "card-backfill-source-v2-candidates"));
  const journal = resolve(option("--journal", join(out, "media-search.jsonl")));
  const latest = resolve(option("--latest", join(out, "latest.json")));
  const runId = option("--run-id", "local");
  const baseline = resolve(option("--baseline", "."));
  const now = option("--now", new Date().toISOString());
  const magick = option("--magick", "magick");
  const contact = option("--contact", process.env.CONTACT || "maintainer");
  const plan = await readJson(planPath);
  const planPolicy = plan.source_policy || plan.policy || {};
  const policyVersion = Number(plan.source_policy_version || planPolicy.version || CARD_BACKFILL_SOURCE_POLICY_V2.version);
  const policyId = plan.source_policy_id || planPolicy.policy_id || CARD_BACKFILL_SOURCE_POLICY_V2.policy_id;
  const policyRevision = Number(plan.source_policy_revision ?? planPolicy.revision ?? CARD_BACKFILL_SOURCE_POLICY_V2.revision ?? 0);
  const limits = {
    pageSearchLimit: Math.max(1, Math.min(24, Math.floor(numeric("--page-limit", planPolicy.page_search_limit || 10)))),
    fileMetadataLimit: Math.max(1, Math.min(80, Math.floor(numeric("--file-limit", planPolicy.file_metadata_limit || 32)))),
    downloadCandidateLimit: Math.max(1, Math.min(16, Math.floor(numeric("--download-limit", planPolicy.downloaded_candidate_limit || 8)))),
    minimumWidth: Math.floor(numeric("--minimum-width", planPolicy.minimum_width || 500)),
    minimumHeight: Math.floor(numeric("--minimum-height", planPolicy.minimum_height || 400)),
  };
  const endpoints = {''',
    "dynamic plan policy and limits",
)
source = replace_once(source, '  const plan = await readJson(planPath);\n', '', "remove duplicate plan read")
source = replace_once(
    source,
    '  const transport = new Transport({ userAgent: `undercast-card-backfill-source-v4/4.0 (+https://github.com/BigBirdReturns/undercast; ${contact})`, timeoutMs: Math.floor(numeric("--timeout-ms", 30000)), delayMs: Math.floor(numeric("--delay-ms", 350)) });',
    '  const transport = new Transport({ userAgent: `undercast-card-backfill-${policyId}/${policyVersion}.${policyRevision} (+https://github.com/BigBirdReturns/undercast; ${contact})`, timeoutMs: Math.floor(numeric("--timeout-ms", policyVersion >= 5 ? 45000 : 30000)), delayMs: Math.floor(numeric("--delay-ms", 350)) });',
    "dynamic source user agent",
)
source = replace_once(
    source,
    '    await appendFile(journal, JSON.stringify({ version: CARD_BACKFILL_SOURCE_POLICY_V2.version, op: "media-search.attempted", at: now, run_id: runId, wall_id: item.wall_id, side: item.side, source_policy_version: CARD_BACKFILL_SOURCE_POLICY_V2.version, result: row.status, candidate_sha256: row.candidate_sha256, failure: row.discovery?.failure || null }) + "\\n");',
    '    await appendFile(journal, JSON.stringify({ version: policyVersion, op: "media-search.attempted", at: now, run_id: runId, wall_id: item.wall_id, side: item.side, source_policy_id: policyId, source_policy_version: policyVersion, source_policy_revision: policyRevision, result: row.status, candidate_sha256: row.candidate_sha256, failure: row.discovery?.failure || null }) + "\\n");',
    "dynamic journal policy",
)
source = replace_once(
    source,
    '  const report = { version: CARD_BACKFILL_SOURCE_POLICY_V2.version, generated_at: now, run_id: runId, artifact: `card-backfill-source-v2-${runId}`, source_policy_version: CARD_BACKFILL_SOURCE_POLICY_V2.version, canonical_write: false, counts, results };',
    '  const report = { version: policyVersion, generated_at: now, run_id: runId, artifact: `card-backfill-source-v${policyVersion}-${runId}`, source_policy_id: policyId, source_policy_version: policyVersion, source_policy_revision: policyRevision, canonical_write: false, counts, results };',
    "dynamic source report",
)
source = replace_once(
    source,
    '  console.log(`PASS — source policy v4 produced ${counts.candidate} candidate(s) and ${counts["not-found"]} miss(es)`);',
    '  console.log(`PASS — source policy v${policyVersion} produced ${counts.candidate} candidate(s) and ${counts["not-found"]} miss(es)`);',
    "dynamic source success",
)
source = replace_once(
    source,
    'main().catch((error) => { console.error(`card-backfill source v4: ${error.stack || error.message}`); process.exit(1); });',
    'main().catch((error) => { console.error(`card-backfill source: ${error.stack || error.message}`); process.exit(1); });',
    "dynamic source failure",
)
write("scripts/card-backfill-source-v2.mjs", source)

cached = read("scripts/card-backfill-source-v2-cached.mjs")
cached = sub_once(
    cached,
    r'const cacheRoot = option\("--cache-root", null\);[\s\S]*?const ordered = \(plan\.candidates \|\| \[\]\)\.map\(\(row\) => row\.obligation_id \|\| `\$\{row\.wall_id\}/\$\{row\.side\}`\);',
    '''const cacheRoot = option("--cache-root", null);
const cacheWriteRoot = option("--cache-write-root", null);
const statsPath = option("--cache-stats-out", null);
const telemetryPath = option("--telemetry-out", null);
const batchSha = option("--batch-sha", null);
const shardId = option("--shard-id", null);
const networkDelayMs = numeric("--network-delay-ms", 350);
const cacheMaximumAgeMs = numeric("--cache-max-age-ms", 24 * 60 * 60 * 1000);
const sourceScript = resolve(option("--source-script", new URL("./card-backfill-source-v2.mjs", import.meta.url).pathname));
const planPath = option("--plan", null);
const plan = planPath ? JSON.parse(readFileSync(resolve(planPath), "utf8")) : { candidates: [] };
const planPolicy = plan.source_policy || plan.policy || {};
const policyId = plan.source_policy_id || planPolicy.policy_id || CARD_BACKFILL_SOURCE_POLICY_V2.policy_id || `card-backfill-policy-v${CARD_BACKFILL_SOURCE_POLICY_V2.version}`;
const policyVersion = Number(plan.source_policy_version || planPolicy.version || CARD_BACKFILL_SOURCE_POLICY_V2.version);
const policyRevision = Number(plan.source_policy_revision ?? planPolicy.revision ?? CARD_BACKFILL_SOURCE_POLICY_V2.revision ?? 0);
const cacheNamespace = option("--cache-namespace", `${policyId}-r${policyRevision}-json-v1`);
const ordered = (plan.candidates || []).map((row) => row.obligation_id || `${row.wall_id}/${row.side}`);''',
    "cache policy from plan",
)
cached = replace_once(cached, '    source_policy_version: CARD_BACKFILL_SOURCE_POLICY_V2.version,', '    source_policy_version: policyVersion,', "cache telemetry policy version")
write("scripts/card-backfill-source-v2-cached.mjs", cached)

planner = read("scripts/card-backfill-source-v3-wave-plan.mjs")
planner = replace_once(
    planner,
    'import { buildSourcePolicyV2Estate, CARD_BACKFILL_SOURCE_POLICY_V2 } from "./lib/card-backfill-source-policy-v2.mjs";',
    'import { buildSourcePolicyV2Estate, CARD_BACKFILL_SOURCE_POLICY_V2 } from "./lib/card-backfill-source-policy-v2.mjs";\nimport { buildSourcePolicyV5Estate, CARD_BACKFILL_SOURCE_POLICY_V5 } from "./lib/card-backfill-source-policy-v5.mjs";',
    "v5 planner import",
)
planner = replace_once(
    planner,
    '  const retryEstate = buildSourcePolicyV2Estate({ estate: sourceEstate, attemptIndex, stagedObligationIds: stagingLedger.entries.map((row) => row.obligation_id) });\n  if (!retryEstate.cohorts.length) throw new Error("no source-policy-v4 wave available");',
    '  const stagedObligationIds = stagingLedger.entries.map((row) => row.obligation_id);\n  const v4Estate = buildSourcePolicyV2Estate({ estate: sourceEstate, attemptIndex, stagedObligationIds });\n  const v5Estate = v4Estate.cohorts.length ? null : buildSourcePolicyV5Estate({ estate: sourceEstate, attemptIndex, stagedObligationIds });\n  const retryEstate = v4Estate.cohorts.length ? v4Estate : v5Estate;\n  const selectedPolicy = v4Estate.cohorts.length ? CARD_BACKFILL_SOURCE_POLICY_V2 : CARD_BACKFILL_SOURCE_POLICY_V5;\n  if (!retryEstate?.cohorts.length) throw new Error("no single-subject source-policy wave available");',
    "v4 to v5 planner cascade",
)
planner = planner.replace("source_policy: CARD_BACKFILL_SOURCE_POLICY_V2", "source_policy: selectedPolicy")
planner = planner.replace("policy: CARD_BACKFILL_SOURCE_POLICY_V2", "policy: selectedPolicy")
planner = replace_once(planner, '    `planner=source-policy-v4-wave`,', '    `planner=source-policy-v${selectedPolicy.version}-wave`,', "dynamic planner label")
planner = replace_once(planner, '    `source_policy_v3_ready=${retryEstate.counts.ready}`,', '    `source_policy_ready=${retryEstate.counts.ready}`,', "dynamic policy ready summary")
planner = replace_once(planner, '    `source_policy_v3_cohorts=${retryEstate.counts.cohorts}`,', '    `source_policy_cohorts=${retryEstate.counts.cohorts}`,', "dynamic policy cohort summary")
planner = replace_once(
    planner,
    '  console.log(`PASS — source policy v4 wave selected ${wave.selected_count} disjoint obligation(s) in ${wave.wave_batches} immutable batch(es)`);',
    '  console.log(`PASS — source policy v${selectedPolicy.version} wave selected ${wave.selected_count} disjoint obligation(s) in ${wave.wave_batches} immutable batch(es)`);',
    "dynamic planner success",
)
write("scripts/card-backfill-source-v3-wave-plan.mjs", planner)

v5_fixture = r'''#!/usr/bin/env node
import assert from "node:assert/strict";
import { evaluateSourceCandidate } from "./lib/card-backfill-source-policy-v3.mjs";
import { buildSourcePolicyV5Estate, CARD_BACKFILL_SOURCE_POLICY_V5 } from "./lib/card-backfill-source-policy-v5.mjs";

const context = {
  side: "still",
  expectedSubject: "Recovery Character",
  actor: "Recovery Actor",
  production: "Recovery Production",
  performanceMode: "voice-or-animation",
  actorEvidence: {
    character_windows: ["Recovery Actor voiced Recovery Character in Recovery Production."],
    production_windows: ["Recovery Actor voiced Recovery Character in Recovery Production."],
  },
  candidate: {
    method: "mediawiki-pageimage-v4",
    file: "Lead image.jpg",
    page: { title: "Recovery Character", extract_windows: ["Recovery Character is a fictional character."] },
    source: { description: "", categories: "" },
  },
};
const v4 = evaluateSourceCandidate({ ...context, sourcePolicyVersion: 4 });
assert.equal(v4.eligible, false);
assert(v4.reasons.includes("candidate-file-lacks-filed-production-context"));
const v5 = evaluateSourceCandidate({ ...context, sourcePolicyVersion: 5 });
assert.equal(v5.eligible, true);
assert.equal(v5.facts.two_source_recovery, true);
assert.equal(v5.facts.source_policy_version, 5);

const estate = {
  campaign_id: "fixture",
  estate_sha256: "a".repeat(64),
  obligations: [
    {
      obligation_id: "UC-001/still", wall_id: "UC-001", side: "still", expected_subject: "Recovery Character", disposition: "ready", quarantine_reasons: [],
      shape: { side: "still", performance_mode: "voice-or-animation", source_route: "franchise-mediawiki", evidence_tier: "canonical-link-only", render_profile: "character-depiction" },
      cohort_key: "legacy", canonical_mutation: false,
    },
    {
      obligation_id: "UC-002/still", wall_id: "UC-002", side: "still", expected_subject: "One & Two", disposition: "ready", quarantine_reasons: [],
      shape: { side: "still", performance_mode: "voice-or-animation", source_route: "franchise-mediawiki", evidence_tier: "canonical-link-only", render_profile: "character-depiction" },
      cohort_key: "legacy-composite", canonical_mutation: false,
    },
  ],
};
const v4Attempt = { source_policy_id: "card-backfill-policy-v4-exact-pageimage-1", source_policy_version: 4, cohort_key: "still::voice-or-animation::mediawiki-bound-multicandidate-v4::canonical-link-only::character-depiction", final_disposition: "quarantine" };
let built = buildSourcePolicyV5Estate({ estate, attemptIndex: { entries: [
  { obligation_id: "UC-001/still", attempts: [v4Attempt] },
  { obligation_id: "UC-002/still", attempts: [v4Attempt] },
] } });
assert.equal(built.counts.ready, 1);
assert.equal(built.obligations[0].source_policy_version, 5);
assert.equal(built.obligations[0].source_policy_id, CARD_BACKFILL_SOURCE_POLICY_V5.policy_id);
assert(built.exclusions.some((row) => row.obligation_id === "UC-002/still" && row.reason === "multi-subject-composite-required"));

built = buildSourcePolicyV5Estate({ estate, attemptIndex: { entries: [
  { obligation_id: "UC-001/still", attempts: [v4Attempt, { ...v4Attempt, source_policy_version: 5, source_policy_id: CARD_BACKFILL_SOURCE_POLICY_V5.policy_id }] },
] } });
assert.equal(built.counts.ready, 0);
assert(built.exclusions.some((row) => row.reason === "source-policy-v5-already-attempted"));
console.log("card-backfill source-policy v5 fixtures: PASS — exact subject pageimage plus independent role custody recovers production context; composites remain isolated");
'''
write("scripts/card-backfill-source-policy-v5-fixtures.mjs", v5_fixture)

package_json = json.loads(read("package.json"))
fixture_command = "node scripts/card-backfill-source-policy-v5-fixtures.mjs"
if fixture_command not in package_json["scripts"]["card-backfill:cohort:fixtures"]:
    package_json["scripts"]["card-backfill:cohort:fixtures"] += f" && {fixture_command}"
package_json["scripts"]["card-backfill:source-policy-v5:fixtures"] = fixture_command
write("package.json", json.dumps(package_json, indent=2) + "\n")

checks = {
    "scripts/lib/card-backfill-source-policy-v5.mjs": ["card-backfill-policy-v5-two-source-recovery-1", "multi-subject-composite-required"],
    "scripts/lib/card-backfill-source-policy-v3.mjs": ["twoSourceRecovery", "sourcePolicyVersion = 4"],
    "scripts/card-backfill-source-v2.mjs": ["policyVersion", "planPolicy.page_search_limit"],
    "scripts/card-backfill-source-v2-cached.mjs": ["const planPolicy", "source_policy_version: policyVersion"],
    "scripts/card-backfill-source-v3-wave-plan.mjs": ["buildSourcePolicyV5Estate", "selectedPolicy"],
    "scripts/card-backfill-source-policy-v5-fixtures.mjs": ["two_source_recovery", "composites remain isolated"],
}
for path, needles in checks.items():
    text = read(path)
    for needle in needles:
        if needle not in text:
            raise RuntimeError(f"{path} missing {needle}")
print("PASS — policy-v5 frontier cascade installed without admitting composite obligations")
