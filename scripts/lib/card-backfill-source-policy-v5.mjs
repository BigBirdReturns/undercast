import { canonicalJson, sha256 } from "./card-backfill-cohort.mjs";
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
