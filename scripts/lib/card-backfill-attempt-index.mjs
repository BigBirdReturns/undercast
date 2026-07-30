import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson } from "./card-backfill-staging.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function inferVersion(receipt) {
  const explicit = Number(receipt?.source_policy_version || receipt?.source_policy?.version || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const encoded = Number(String(receipt?.cohort_key || "").match(/\bv(\d+)\b/i)?.[1] || 0);
  return Number.isFinite(encoded) && encoded > 0 ? encoded : 1;
}

function inferPolicyId(receipt, version) {
  return receipt?.source_policy_id || receipt?.source_policy?.policy_id || `legacy-card-backfill-policy-v${version}`;
}

export async function readPolicyAwareAdjudicationAttemptIndex(root, campaignId = null) {
  const adjudicationRoot = join(root, "adjudications");
  let names = [];
  try {
    names = (await readdir(adjudicationRoot, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const attempts = new Map();
  const receipts = [];
  for (const name of names) {
    const bytes = await readFile(join(adjudicationRoot, name));
    const receipt = JSON.parse(bytes);
    if (receipt.version !== 1 || receipt.lane !== "card-backfill-adjudication" || receipt.canonical_mutation !== false) throw new Error(`invalid staging adjudication receipt ${name}`);
    if (campaignId && receipt.campaign_id !== campaignId) throw new Error(`adjudication campaign drift ${name}: ${receipt.campaign_id} vs ${campaignId}`);
    if (receipt.result_sha256 !== sha256(canonicalJson(receipt.results || []))) throw new Error(`adjudication result digest drift ${name}`);
    if (`${receipt.batch_sha256}.json` !== name) throw new Error(`adjudication receipt filename drift ${name}`);

    const sourcePolicyVersion = inferVersion(receipt);
    const receiptRow = {
      discovery_batch_sha256: receipt.batch_sha256,
      cohort_key: receipt.cohort_key,
      generated_at: receipt.generated_at || null,
      receipt_path: `adjudications/${name}`,
      receipt_sha256: sha256(bytes),
      result_sha256: receipt.result_sha256,
      result_count: (receipt.results || []).length,
      source_policy_id: inferPolicyId(receipt, sourcePolicyVersion),
      source_policy_version: sourcePolicyVersion,
      source_policy_revision: receipt.source_policy_revision ?? receipt.source_policy?.revision ?? null,
      lessons_contract_sha256: receipt.lessons_contract_sha256 || receipt.source_policy?.lessons_contract_sha256 || null,
    };
    receipts.push(receiptRow);
    for (const result of receipt.results || []) {
      if (!result.obligation_id) throw new Error(`adjudication result missing obligation ${name}`);
      const rows = attempts.get(result.obligation_id) || [];
      rows.push({
        ...receiptRow,
        final_disposition: result.final_disposition || result.disposition || null,
        reason: result.reason || null,
      });
      attempts.set(result.obligation_id, rows);
    }
  }

  const entries = [...attempts.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([obligationId, rows]) => ({ obligation_id: obligationId, attempts: rows }));
  return {
    version: 1,
    lane: "card-backfill-policy-aware-adjudication-attempt-index",
    campaign_id: campaignId,
    receipt_count: receipts.length,
    attempted_count: entries.length,
    receipts,
    entries,
    index_sha256: sha256(canonicalJson({ receipts, entries })),
    source_policy_version_preserved: true,
    source_policy_id_preserved: true,
    lessons_contract_sha256_preserved: true,
    canonical_mutation: false,
  };
}
