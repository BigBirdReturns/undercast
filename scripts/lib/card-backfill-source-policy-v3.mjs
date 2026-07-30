import { canonicalJson, sha256 } from "./card-backfill-cohort.mjs";

export const CARD_BACKFILL_SOURCE_POLICY_V3 = Object.freeze({
  version: 3,
  lane: "card-backfill-source-policy",
  still_route: "mediawiki-resolution-repair-v3",
  portrait_route: null,
  minimum_width: 240,
  minimum_height: 240,
  inherited_page_search_limit: 10,
  inherited_file_metadata_limit: 32,
  inherited_downloaded_candidate_limit: 8,
  exact_subject_candidate_preferred_over_unrelated_high_resolution_candidate: true,
  explicit_subject_binding_required_before_second_desk: true,
  explicit_production_binding_required_before_second_desk: true,
  actor_page_for_still_forbidden: true,
  derivative_object_and_namesake_prescreen: true,
  multi_subject_records_require_composite_lane: true,
  deterministic_upscale_is_render_only: true,
  repository_duplicate_prescreen: true,
  selected_image_never_proves_identity_or_role: true,
  independent_machine_or_person_adjudication_required: true,
  one_attempt_per_obligation_per_policy_version: true,
  fail_closed: true,
  canonical_mutation: false,
});

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCompositeRequiredSubject(value) {
  const text = String(value || "").replace(/\([^)]*\)/g, " ").trim();
  if (!text) return false;
  return /\s(?:&|\/|;|\+|\band\b)\s/i.test(` ${text} `) || /,\s*[^,]+$/.test(text);
}

export function priorSourcePolicyVersion(attempt) {
  const explicit = Number(attempt?.source_policy_version || attempt?.source_policy?.version || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const key = String(attempt?.cohort_key || "");
  const versionMatch = key.match(/(?:^|[-:])v(\d+)(?:$|[-:])/i);
  if (versionMatch) return Number(versionMatch[1]);
  if (/(?:mediawiki|commons)-multicandidate-v2/i.test(key)) return 2;
  return 1;
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

function eligibleSourceBoundary(row) {
  return row.disposition === "ready"
    || (row.side === "still"
      && row.shape?.source_route === "open-web-exception"
      && (row.quarantine_reasons || []).length === 1
      && row.quarantine_reasons[0] === "no-bounded-still-source-route");
}

export function buildSourcePolicyV3Estate({ estate, attemptIndex, stagedObligationIds = [] }) {
  const attempted = new Map((attemptIndex?.entries || []).map((row) => [row.obligation_id, row.attempts || []]));
  const staged = new Set(stagedObligationIds);
  const obligations = [];
  const exclusions = [];
  const compositeRequired = [];

  for (const row of estate.obligations || []) {
    const attempts = attempted.get(row.obligation_id) || [];
    if (!eligibleSourceBoundary(row)) {
      exclusions.push({ obligation_id: row.obligation_id, reason: "residual-non-source-policy-quarantine" });
      continue;
    }
    if (staged.has(row.obligation_id)) {
      exclusions.push({ obligation_id: row.obligation_id, reason: "already-staged" });
      continue;
    }
    if (row.side !== "still") {
      exclusions.push({ obligation_id: row.obligation_id, reason: "portrait-v3-not-enabled" });
      continue;
    }
    if (isCompositeRequiredSubject(row.expected_subject)) {
      const receipt = {
        obligation_id: row.obligation_id,
        record_id: row.wall_id,
        side: row.side,
        expected_subject: row.expected_subject,
        cohort_key: row.cohort_key,
        reason: "multi-subject-composite-required",
        canonical_mutation: false,
      };
      compositeRequired.push(receipt);
      exclusions.push({ obligation_id: row.obligation_id, reason: receipt.reason });
      continue;
    }

    const versions = attempts.map(priorSourcePolicyVersion);
    if (!versions.some((version) => version >= 2)) {
      exclusions.push({ obligation_id: row.obligation_id, reason: "source-policy-v2-not-yet-attempted" });
      continue;
    }
    if (versions.some((version) => version >= CARD_BACKFILL_SOURCE_POLICY_V3.version)) {
      exclusions.push({ obligation_id: row.obligation_id, reason: "source-policy-v3-already-attempted" });
      continue;
    }

    const shape = { ...row.shape, source_route: CARD_BACKFILL_SOURCE_POLICY_V3.still_route };
    const cohortKey = [shape.side, shape.performance_mode, shape.source_route, shape.evidence_tier, shape.render_profile].join("::");
    const { scope_sha256: _oldScopeSha, ...body } = row;
    const base = {
      ...body,
      shape,
      cohort_key: cohortKey,
      disposition: "ready",
      quarantine_reasons: [],
      source_policy: CARD_BACKFILL_SOURCE_POLICY_V3,
      source_policy_version: CARD_BACKFILL_SOURCE_POLICY_V3.version,
      retry_of_attempt_count: attempts.length,
      prior_attempts: attempts.map((attempt) => ({
        discovery_batch_sha256: attempt.discovery_batch_sha256,
        cohort_key: attempt.cohort_key,
        final_disposition: attempt.final_disposition,
        reason: attempt.reason,
        source_policy_version: priorSourcePolicyVersion(attempt),
      })),
      canonical_mutation: false,
    };
    obligations.push({ ...base, scope_sha256: sha256(canonicalJson(base)) });
  }

  obligations.sort((a, b) => a.obligation_id.localeCompare(b.obligation_id, undefined, { numeric: true }));
  compositeRequired.sort((a, b) => a.obligation_id.localeCompare(b.obligation_id, undefined, { numeric: true }));
  const cohorts = cohortRows(obligations);
  const hashBody = {
    campaign_id: estate.campaign_id,
    source_estate_sha256: estate.estate_sha256,
    source_policy: CARD_BACKFILL_SOURCE_POLICY_V3,
    obligations: obligations.map((row) => ({ obligation_id: row.obligation_id, scope_sha256: row.scope_sha256, cohort_key: row.cohort_key })),
    composite_required: compositeRequired,
  };
  return {
    version: 1,
    lane: "card-backfill-source-policy-v3-estate",
    campaign_id: estate.campaign_id,
    source_estate_sha256: estate.estate_sha256,
    estate_sha256: sha256(canonicalJson(hashBody)),
    source_policy: CARD_BACKFILL_SOURCE_POLICY_V3,
    counts: {
      ready: obligations.length,
      cohorts: cohorts.length,
      composite_required: compositeRequired.length,
      excluded: exclusions.length,
    },
    obligations,
    cohorts,
    composite_required: compositeRequired,
    exclusions,
    canonical_mutation: false,
  };
}

export function normalizedSourceSubject(value) {
  return normalize(value);
}
