#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function applyV3IntraCohortDedupe(report) {
  const firstBySha = new Map();
  const results = [];
  for (const original of report.results || []) {
    const sha = original.status === "candidate" ? (original.candidate_sha256 || original.candidate?.sha256 || null) : null;
    if (!sha) {
      results.push(original);
      continue;
    }
    const prior = firstBySha.get(sha);
    if (!prior) {
      firstBySha.set(sha, { obligation_id: `${original.wall_id}/${original.side}`, wall_id: original.wall_id, expected_subject: original.expected_subject });
      results.push(original);
      continue;
    }
    const discovery = { ...(original.discovery || {}) };
    discovery.source_policy_version = 3;
    discovery.source_family = "mediawiki-resolution-repair-v3";
    discovery.failure = "source-policy-v3:intra-cohort-byte-duplicate";
    discovery.v3_intra_cohort_duplicate = {
      sha256: sha,
      retained_obligation_id: prior.obligation_id,
      retained_expected_subject: prior.expected_subject,
      rejected_obligation_id: `${original.wall_id}/${original.side}`,
      rejected_expected_subject: original.expected_subject,
      canonical_mutation: false,
    };
    discovery.attempts = [...(discovery.attempts || []), {
      stage: "source-policy-v3-intra-cohort-dedupe",
      ok: false,
      source_policy_version: 3,
      body_excerpt: `SOURCE_POLICY_V3 INTRA_COHORT_DUPLICATE ${JSON.stringify(discovery.v3_intra_cohort_duplicate)}`,
    }];
    results.push({ ...original, status: "not-found", candidate: null, candidate_sha256: null, discovery });
  }
  const counts = Object.fromEntries(["candidate", "unchanged", "not-found"].map((key) => [key, results.filter((row) => row.status === key).length]));
  return { ...report, version: 3, source_policy_version: 3, counts, results, canonical_write: false };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback = null) => {
    const index = args.indexOf(name);
    if (index < 0) return fallback;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    return value;
  };
  const reportPath = resolve(option("--report"));
  const outPath = resolve(option("--out", reportPath));
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const deduped = applyV3IntraCohortDedupe(report);
  await writeFile(outPath, JSON.stringify(deduped, null, 2) + "\n");
  const removed = (report.counts?.candidate || 0) - deduped.counts.candidate;
  console.log(`PASS — source policy v3 retained ${deduped.counts.candidate} byte-distinct candidate(s); quarantined ${removed} intra-cohort duplicate(s)`);
  console.log(`OUTPUT — ${outPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`card-backfill source v3 dedupe: ${error.stack || error.message}`); process.exit(1); });
}
