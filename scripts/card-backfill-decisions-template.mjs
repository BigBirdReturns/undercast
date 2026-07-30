#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }

async function main() {
  const candidates = resolve(option("--candidates"));
  const out = resolve(option("--out", join(candidates, "decisions-template.json")));
  const batch = await readJson(join(candidates, "batch-result.json"));
  const pending = [];
  for (const row of batch.results || []) {
    if (row.disposition !== "candidate-pending-independent-visual-adjudication") continue;
    const review = await readJson(join(candidates, row.packet_path, "review.json"));
    pending.push({
      record_id: row.record_id,
      side: row.side,
      expected_subject: review.expected_subject,
      required_identity: "expected",
      required_presentation: review.visual_adjudication?.required_presentation_value,
      packet_path: row.packet_path,
      review_path: `${row.packet_path}/review.json`,
      selected_source_path: review.selected_source ? `${row.packet_path}/${review.selected_source.output_path}` : null,
      rendered_candidate_path: review.render_result?.candidate ? `${row.packet_path}/${review.render_result.candidate.path}` : null,
      wall_crop_path: review.render_result?.wall_crop ? `${row.packet_path}/${review.render_result.wall_crop.path}` : null,
      source_evidence: [review.independent_evidence?.canonical_link, review.selected_source?.origin].filter(Boolean),
      disposition: null,
      identity: null,
      presentation: null,
      note: "",
      evidence: [],
    });
  }
  const workflowRunId = option("--workflow-run-id", process.env.GITHUB_RUN_ID || null);
  const value = {
    version: 1,
    status: "template",
    source: {
      workflow_run_id: workflowRunId ? Number(workflowRunId) : null,
      artifact_name: workflowRunId ? `card-backfill-cohort-${workflowRunId}` : null,
      head_sha: option("--head-sha", process.env.GITHUB_SHA || null),
      artifact_digest: null,
    },
    campaign_id: batch.campaign_id,
    estate_sha256: batch.estate_sha256,
    batch_sha256: batch.batch_sha256,
    cohort_key: batch.cohort_key,
    adjudicator: { id: "", kind: "machine", independent_from_discovery: true },
    decisions: pending,
  };
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(value, null, 2) + "\n");
  console.log(`PASS — wrote ${pending.length} independent-adjudication decision slot(s)`);
  console.log(`OUTPUT — ${out}`);
}

main().catch((error) => { console.error(`card-backfill decisions template: ${error.message}`); process.exit(1); });
