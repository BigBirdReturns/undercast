import { canonicalJson, sha256 } from "./card-backfill-cohort.mjs";

export const BOUNDED_OPEN_WEB_POLICY_VERSION = 1;
export const BOUNDED_OPEN_WEB_ROUTE = "bounded-wikipedia-character-search";

export const BOUNDED_OPEN_WEB_POLICY = Object.freeze({
  version: BOUNDED_OPEN_WEB_POLICY_VERSION,
  route: BOUNDED_OPEN_WEB_ROUTE,
  source_host: "en.wikipedia.org",
  exact_title_first: true,
  production_scoped_search_fallback: true,
  search_result_limit: 8,
  image_file_limit: 40,
  downloaded_candidate_limit: 10,
  selected_image_never_proves_identity_or_role: true,
  independent_machine_or_person_adjudication_required: true,
  fail_closed: true,
  canonical_mutation: false,
});

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

export function promoteBoundedOpenWebObligations(estate) {
  const promoted = [];
  const residual = [];
  for (const row of estate.obligations || []) {
    const reasons = row.quarantine_reasons || [];
    const eligible = row.side === "still"
      && row.shape?.source_route === "open-web-exception"
      && reasons.length === 1
      && reasons[0] === "no-bounded-still-source-route";
    if (!eligible) {
      if (row.disposition === "quarantine") residual.push(row);
      continue;
    }
    const { scope_sha256: _oldScopeSha, ...body } = row;
    const shape = { ...row.shape, source_route: BOUNDED_OPEN_WEB_ROUTE };
    const cohortKey = [shape.side, shape.performance_mode, shape.source_route, shape.evidence_tier, shape.render_profile].join("::");
    const base = {
      ...body,
      shape,
      cohort_key: cohortKey,
      disposition: "ready",
      quarantine_reasons: [],
      source_policy: BOUNDED_OPEN_WEB_POLICY,
      promoted_from_quarantine_reason: "no-bounded-still-source-route",
      canonical_mutation: false,
    };
    promoted.push({ ...base, scope_sha256: sha256(canonicalJson(base)) });
  }
  const hashBody = {
    campaign_id: estate.campaign_id,
    source_estate_sha256: estate.estate_sha256,
    policy: BOUNDED_OPEN_WEB_POLICY,
    obligations: promoted.map((row) => ({ obligation_id: row.obligation_id, scope_sha256: row.scope_sha256, cohort_key: row.cohort_key })),
  };
  const cohorts = cohortRows(promoted);
  return {
    version: 1,
    lane: "card-backfill-bounded-open-web-estate",
    campaign_id: estate.campaign_id,
    source_estate_sha256: estate.estate_sha256,
    estate_sha256: sha256(canonicalJson(hashBody)),
    policy: BOUNDED_OPEN_WEB_POLICY,
    counts: {
      promoted_ready: promoted.length,
      residual_quarantine: residual.length,
      cohorts: cohorts.length,
    },
    obligations: promoted,
    cohorts,
    residual_quarantine: residual,
    canonical_mutation: false,
  };
}
