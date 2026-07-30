import { canonicalJson, sha256 } from "./card-backfill-cohort.mjs";

function natural(left, right) {
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

export function buildDisjointWaveBatches({ estate, control, sourceEstateSha256, exclusionStateSha256, policy, batchLimit = 40, waveBatchLimit = 4 }) {
  const maximum = Number(control?.batch?.maximum ?? 50);
  if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > maximum) throw new Error(`invalid wave batch limit ${batchLimit}`);
  if (!Number.isInteger(waveBatchLimit) || waveBatchLimit < 1 || waveBatchLimit > 16) throw new Error(`invalid wave batch count ${waveBatchLimit}`);
  if (!policy?.policy_id || !policy?.lessons_contract_sha256) throw new Error("wave policy identity is incomplete");

  const byId = new Map((estate.obligations || []).map((row) => [row.obligation_id, row]));
  const remaining = new Map((estate.cohorts || []).filter((row) => row.disposition === "ready").map((row) => [row.cohort_key, [...row.obligation_ids]]));
  const cohortByKey = new Map((estate.cohorts || []).map((row) => [row.cohort_key, row]));
  const batches = [];
  const selected = new Set();

  for (let index = 0; index < waveBatchLimit; index += 1) {
    const candidates = [...remaining.entries()].filter(([, ids]) => ids.length).map(([cohortKey, ids]) => ({ cohort: cohortByKey.get(cohortKey), ids }));
    candidates.sort((a, b) => Math.min(b.ids.length, batchLimit) - Math.min(a.ids.length, batchLimit)
      || b.ids.length - a.ids.length
      || natural(a.ids[0], b.ids[0])
      || natural(a.cohort.cohort_key, b.cohort.cohort_key));
    const chosen = candidates[0];
    if (!chosen) break;
    const ids = chosen.ids.splice(0, batchLimit);
    const obligations = ids.map((id) => byId.get(id)).filter(Boolean);
    for (const obligation of obligations) {
      if (selected.has(obligation.obligation_id)) throw new Error(`wave selected duplicate obligation ${obligation.obligation_id}`);
      selected.add(obligation.obligation_id);
    }
    const body = {
      campaign_id: estate.campaign_id,
      estate_sha256: estate.estate_sha256,
      source_estate_sha256: sourceEstateSha256,
      cohort_key: chosen.cohort.cohort_key,
      source_policy_id: policy.policy_id,
      source_policy_version: policy.version,
      source_policy_revision: policy.revision,
      lessons_contract_sha256: policy.lessons_contract_sha256,
      exclusion_state_sha256: exclusionStateSha256,
      obligations: obligations.map((row) => ({ obligation_id: row.obligation_id, scope_sha256: row.scope_sha256 })),
    };
    const batchSha256 = sha256(canonicalJson(body));
    batches.push({
      version: 1,
      lane: "card-backfill-source-v3-wave-batch",
      wave_batch_index: index + 1,
      campaign_id: estate.campaign_id,
      estate_sha256: estate.estate_sha256,
      source_estate_sha256: sourceEstateSha256,
      cohort_key: chosen.cohort.cohort_key,
      shape: chosen.cohort.shape,
      requested_limit: batchLimit,
      selected_count: obligations.length,
      underfilled: obligations.length < batchLimit,
      obligations,
      source_policy: policy,
      source_policy_id: policy.policy_id,
      source_policy_version: policy.version,
      source_policy_revision: policy.revision,
      lessons_contract_sha256: policy.lessons_contract_sha256,
      exclusion_state_sha256: exclusionStateSha256,
      batch_sha256: batchSha256,
      artifact_only: true,
      canonical_mutation: false,
    });
  }

  const disjointObligationIds = [...selected].sort(natural);
  const waveBody = {
    campaign_id: estate.campaign_id,
    estate_sha256: estate.estate_sha256,
    source_estate_sha256: sourceEstateSha256,
    exclusion_state_sha256: exclusionStateSha256,
    source_policy_id: policy.policy_id,
    source_policy_version: policy.version,
    source_policy_revision: policy.revision,
    lessons_contract_sha256: policy.lessons_contract_sha256,
    batch_sha256s: batches.map((batch) => batch.batch_sha256),
    disjoint_obligation_ids: disjointObligationIds,
  };
  return {
    version: 1,
    lane: "card-backfill-source-v3-wave",
    campaign_id: estate.campaign_id,
    estate_sha256: estate.estate_sha256,
    source_estate_sha256: sourceEstateSha256,
    exclusion_state_sha256: exclusionStateSha256,
    source_policy: policy,
    source_policy_id: policy.policy_id,
    source_policy_version: policy.version,
    source_policy_revision: policy.revision,
    lessons_contract_sha256: policy.lessons_contract_sha256,
    wave_batches: batches.length,
    selected_count: disjointObligationIds.length,
    disjoint_obligation_ids: disjointObligationIds,
    batches,
    artifact_only: true,
    wave_sha256: sha256(canonicalJson(waveBody)),
    canonical_mutation: false,
  };
}

export function validateDisjointWave(wave) {
  if (wave?.version !== 1 || wave?.lane !== "card-backfill-source-v3-wave" || wave?.artifact_only !== true || wave?.canonical_mutation !== false) throw new Error("invalid wave identity");
  if (wave.wave_batches !== wave.batches?.length) throw new Error("wave batch count drift");
  const ids = wave.batches.flatMap((batch) => (batch.obligations || []).map((row) => row.obligation_id));
  if (new Set(ids).size !== ids.length) throw new Error("wave obligations are not disjoint");
  const ordered = [...new Set(ids)].sort(natural);
  if (canonicalJson(ordered) !== canonicalJson(wave.disjoint_obligation_ids || [])) throw new Error("wave disjoint obligation ledger drift");
  if (ids.length !== wave.selected_count) throw new Error("wave selection count drift");
  for (const batch of wave.batches) {
    if (batch.artifact_only !== true || batch.canonical_mutation !== false) throw new Error(`wave batch ${batch.batch_sha256} is not artifact-only`);
    if (batch.source_policy_id !== wave.source_policy_id || batch.lessons_contract_sha256 !== wave.lessons_contract_sha256) throw new Error(`wave batch ${batch.batch_sha256} policy custody drift`);
  }
  return wave;
}
