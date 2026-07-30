#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath } from "node:url";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name} requires a value`);
  return args[index + 1];
}

export function validateArtifactCustody({ decision, artifact }) {
  if (artifact.id !== decision?.source?.artifact_id || artifact.name !== decision?.source?.artifact_name) throw new Error("artifact identity mismatch");
  if (artifact.expired) throw new Error("source artifact is expired");
  if (artifact.workflow_run?.id !== decision.source.workflow_run_id || artifact.workflow_run?.head_sha !== decision.source.head_sha) throw new Error("artifact workflow custody mismatch");
  if (decision.source.artifact_digest && artifact.digest !== decision.source.artifact_digest) throw new Error("artifact digest mismatch");
  return {
    artifact_id: artifact.id,
    workflow_run_id: artifact.workflow_run.id,
    head_sha: artifact.workflow_run.head_sha,
    artifact_digest: artifact.digest || null,
  };
}

export function validateCandidateBatchCustody({ decision, result }) {
  if (decision.batch_sha256 !== result.batch_sha256) throw new Error("downloaded artifact batch mismatch");
  if (decision.campaign_id !== result.campaign_id || decision.estate_sha256 !== result.estate_sha256) throw new Error("downloaded artifact campaign mismatch");
  if (decision.source?.candidate_result_sha256 && decision.source.candidate_result_sha256 !== result.result_sha256) throw new Error("downloaded artifact result digest mismatch");
  const pending = (result.results || []).filter((row) => row.disposition === "candidate-pending-independent-visual-adjudication");
  if (pending.length !== (decision.decisions || []).length) throw new Error(`decision cardinality mismatch: ${(decision.decisions || []).length} vs ${pending.length}`);
  return {
    batch_sha256: result.batch_sha256,
    pending_candidates: pending.length,
    workflow_run_id: decision.source?.workflow_run_id || null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  if (command === "artifact") {
    const decision = readJson(option(args, "--decision"));
    const artifact = readJson(option(args, "--metadata"));
    const receipt = validateArtifactCustody({ decision, artifact });
    console.log(`PASS — artifact ${receipt.artifact_id} retains exact run, head, name, and digest custody`);
    return;
  }
  if (command === "batch") {
    const decision = readJson(option(args, "--decision"));
    const result = readJson(option(args, "--result"));
    const receipt = validateCandidateBatchCustody({ decision, result });
    console.log(`PASS — decision file binds ${receipt.pending_candidates} candidate(s) in workflow run ${receipt.workflow_run_id}`);
    return;
  }
  throw new Error("usage: card-backfill-stage-custody.mjs artifact --decision <path> --metadata <path> | batch --decision <path> --result <path>");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`card-backfill stage custody: ${error.message}`);
    process.exit(1);
  });
}
