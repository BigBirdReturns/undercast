#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { canonicalJson, hashFile, sha256, writeChecksumLedger } from "./lib/card-backfill-staging.mjs";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + "\n"); }

async function finalizePacket({ sourceDir, destination, decision, adjudicator, expectedPresentation, source }) {
  await rm(destination, { recursive: true, force: true });
  await cp(sourceDir, destination, { recursive: true });
  const reviewPath = join(destination, "review.json");
  const review = await readJson(reviewPath);
  const accepted = decision.disposition === "accept";
  const decidedAt = decision.decided_at || new Date().toISOString();
  const decisionBody = {
    record_id: review.record_id,
    side: review.side,
    disposition: decision.disposition,
    identity: decision.identity,
    presentation: decision.presentation,
    note: decision.note || decision.reason || "",
    evidence: decision.evidence || [],
    adjudicator,
    decided_at: decidedAt,
  };
  const decisionSha256 = sha256(canonicalJson(decisionBody));

  review.disposition = accepted ? "reviewed-evidence-candidate" : "quarantine";
  review.quarantine_reasons = accepted ? [] : [...(review.quarantine_reasons || []), decision.reason || decision.note || "visual-adjudication-rejected"];
  review.visual_adjudication = {
    status: accepted ? "accepted" : "rejected",
    adjudicator,
    independent_from_discovery: true,
    identity: { value: decision.identity, note: decision.identity_note || decision.note || "", evidence: decision.identity_evidence || decision.evidence || [] },
    presentation: { value: decision.presentation, note: decision.presentation_note || decision.note || "", evidence: decision.presentation_evidence || decision.evidence || [] },
    expected_presentation: expectedPresentation,
    decided_at: decidedAt,
    decision_sha256: decisionSha256,
  };
  review.permanent_evidence_publication_candidate = accepted;
  review.canonical_mutation = false;
  await writeJson(reviewPath, review);

  await writeJson(join(destination, "adjudication-receipt.json"), {
    version: 1,
    record_id: review.record_id,
    side: review.side,
    batch_sha256: review.batch_sha256,
    disposition: decision.disposition,
    identity: decision.identity,
    presentation: decision.presentation,
    note: decision.note || decision.reason || "",
    identity_note: decision.identity_note || null,
    presentation_note: decision.presentation_note || null,
    evidence: decision.evidence || [],
    identity_evidence: decision.identity_evidence || decision.evidence || [],
    presentation_evidence: decision.presentation_evidence || decision.evidence || [],
    adjudicator,
    independent_from_discovery: true,
    source,
    decided_at: decidedAt,
    decision_sha256: decisionSha256,
    canonical_mutation: false,
  });

  await rm(join(destination, "manifest.json"), { force: true });
  await rm(join(destination, "checksums.sha256"), { force: true });
  const names = [];
  for (const entry of await readdir(destination, { withFileTypes: true })) if (entry.isFile() && !["manifest.json", "checksums.sha256"].includes(entry.name)) names.push(entry.name);
  const files = [];
  for (const name of names.sort()) files.push({ path: name, sha256: await hashFile(join(destination, name)), bytes: (await stat(join(destination, name))).size });
  const manifest = {
    version: 1,
    campaign_id: review.campaign_id,
    record_id: review.record_id,
    side: review.side,
    disposition: review.disposition,
    files,
    packet_sha256: sha256(canonicalJson(files)),
    canonical_mutation: false,
  };
  await writeJson(join(destination, "manifest.json"), manifest);
  const checksum = await writeChecksumLedger(destination, [...names, "manifest.json"]);
  return {
    record_id: review.record_id,
    side: review.side,
    disposition: review.disposition,
    packet_sha256: manifest.packet_sha256,
    checksum_ledger_sha256: checksum.sha256,
    decision_sha256: decisionSha256,
  };
}

async function main() {
  const candidates = resolve(option("--candidates"));
  const decisionsPath = resolve(option("--decisions"));
  const decisionsBytes = await readFile(decisionsPath);
  const decisions = JSON.parse(decisionsBytes);
  const control = await readJson(option("--control", ".github/CARD-BACKFILL-COHORT.json"));
  const out = resolve(option("--out", "card-backfill-cohort-adjudicated"));
  const now = option("--now", new Date().toISOString());
  const batchResult = await readJson(join(candidates, "batch-result.json"));

  if (decisions.version !== 1 || decisions.status !== "ready" || decisions.batch_sha256 !== batchResult.batch_sha256) throw new Error("decision file must be ready and batch-bound");
  if (decisions.campaign_id !== batchResult.campaign_id || decisions.estate_sha256 !== batchResult.estate_sha256 || decisions.cohort_key !== batchResult.cohort_key) throw new Error("decision campaign, estate, or cohort custody mismatch");
  if (decisions.source?.candidate_result_sha256 && decisions.source.candidate_result_sha256 !== batchResult.result_sha256) throw new Error("decision candidate-result digest mismatch");
  if (decisions.source?.workflow_run_id && String(decisions.source.workflow_run_id) !== String(option("--source-run-id", decisions.source.workflow_run_id))) throw new Error("decision source run drift");
  const adjudicator = decisions.adjudicator || {};
  if (!adjudicator.id || !["machine", "person"].includes(adjudicator.kind) || adjudicator.independent_from_discovery !== true) throw new Error("adjudicator must be identified, qualified as machine/person, and independent from discovery");

  const pending = batchResult.results.filter((row) => row.disposition === "candidate-pending-independent-visual-adjudication");
  const decisionByKey = new Map();
  for (const decision of decisions.decisions || []) {
    const key = `${decision.record_id}/${decision.side}`;
    if (decisionByKey.has(key)) throw new Error(`duplicate decision ${key}`);
    decisionByKey.set(key, decision);
  }
  if (decisionByKey.size !== pending.length) throw new Error(`decisions must cover every pending candidate exactly once: expected ${pending.length}, got ${decisionByKey.size}`);

  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, "accepted"), { recursive: true });
  await mkdir(join(out, "quarantine"), { recursive: true });
  const results = [];

  for (const row of batchResult.results) {
    if (row.disposition !== "candidate-pending-independent-visual-adjudication") {
      await writeJson(join(out, "quarantine", `${row.record_id}-${row.side}.json`), { ...row, carried_from_candidate_batch: true, canonical_mutation: false });
      results.push({ ...row, final_disposition: "quarantine", reason: "pre-adjudication-quarantine" });
      continue;
    }
    const key = `${row.record_id}/${row.side}`;
    const decision = decisionByKey.get(key);
    if (!decision) throw new Error(`missing decision ${key}`);
    if (!["accept", "reject"].includes(decision.disposition)) throw new Error(`invalid decision disposition ${key}`);
    const review = await readJson(join(candidates, row.packet_path, "review.json"));
    const expectedPresentation = review.visual_adjudication?.required_presentation_value;
    if (decision.disposition === "accept") {
      if (decision.identity !== "expected") throw new Error(`accepted identity must be expected for ${key}`);
      if (decision.presentation !== expectedPresentation) throw new Error(`accepted presentation must be ${expectedPresentation} for ${key}`);
      if (!String(decision.note || "").trim()) throw new Error(`accepted decision requires a note for ${key}`);
      if (!(decision.evidence || decision.identity_evidence || []).length) throw new Error(`accepted identity requires source evidence for ${key}`);
    } else if (!String(decision.reason || decision.note || "").trim()) throw new Error(`rejected decision requires a reason for ${key}`);

    const bucket = decision.disposition === "accept" ? "accepted" : "quarantine";
    const destination = join(out, bucket, row.record_id);
    const finalized = await finalizePacket({ sourceDir: join(candidates, row.packet_path), destination, decision, adjudicator, expectedPresentation, source: decisions.source || null });
    results.push({
      ...row,
      final_disposition: finalized.disposition,
      final_packet_path: `${bucket}/${row.record_id}`,
      final_packet_sha256: finalized.packet_sha256,
      final_checksum_ledger_sha256: finalized.checksum_ledger_sha256,
      decision_sha256: finalized.decision_sha256,
    });
  }

  const accepted = results.filter((row) => row.final_disposition === "reviewed-evidence-candidate").length;
  const rejected = results.filter((row) => row.final_disposition === "quarantine" && row.disposition === "candidate-pending-independent-visual-adjudication").length;
  const preQuarantined = results.length - accepted - rejected;
  const minimum = Number(control.staging?.minimum_publication_batch ?? control.batch?.minimum ?? 20);
  const target = Number(control.staging?.target_publication_batch ?? control.batch?.target ?? 40);
  const maximum = Number(control.staging?.maximum_publication_batch ?? control.batch?.maximum ?? 50);
  if (accepted > maximum) throw new Error(`accepted packet count ${accepted} exceeds one staging event maximum ${maximum}`);

  const receiptBase = {
    version: 1,
    lane: "card-backfill-adjudication",
    generated_at: now,
    campaign_id: batchResult.campaign_id,
    estate_sha256: batchResult.estate_sha256,
    batch_sha256: batchResult.batch_sha256,
    cohort_key: batchResult.cohort_key,
    source: decisions.source || null,
    decisions_sha256: sha256(decisionsBytes),
    adjudicator,
    counts: { selected: results.length, pending: pending.length, accepted, rejected, pre_quarantined: preQuarantined },
    publication_window: { minimum, target, maximum, accepted_in_this_run: accepted, ready_without_existing_staging: accepted >= minimum },
    results,
    canonical_mutation: false,
  };
  const receipt = { ...receiptBase, result_sha256: sha256(canonicalJson(receiptBase.results)) };
  await writeJson(join(out, "adjudication-run-receipt.json"), receipt);
  await writeFile(join(out, "summary.txt"), [
    `campaign=${receipt.campaign_id}`,
    `discovery_batch_sha256=${receipt.batch_sha256}`,
    `accepted_for_staging=${accepted}`,
    `rejected=${rejected}`,
    `pre_adjudication_quarantine=${preQuarantined}`,
    `ready_without_existing_staging=${receipt.publication_window.ready_without_existing_staging}`,
    `result_sha256=${receipt.result_sha256}`,
    `canonical_mutation=false`,
  ].join("\n") + "\n");
  console.log(`PASS — adjudicated ${pending.length} pending candidate(s): ${accepted} accepted for staging, ${rejected} rejected`);
  console.log(`STAGING — accepted packets persist even below the ${minimum}-packet publication minimum`);
  console.log(`OUTPUT — ${out}`);
}

main().catch((error) => { console.error(`card-backfill adjudicate: ${error.message}`); process.exit(1); });
