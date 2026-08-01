#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gitBlob = (bytes) => createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8")).update(bytes).digest("hex");
function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a value`);
  return value;
}
function safeRelative(value, label) {
  const text = String(value || "").replaceAll("\\", "/");
  assert(text && !path.isAbsolute(text) && !text.split("/").includes(".."), `${label} must be repository-relative`);
  return text;
}
function resolveInside(root, relativePath, label = "path") {
  const safe = safeRelative(relativePath, label);
  const absolute = path.resolve(root, safe);
  assert(absolute === root || absolute.startsWith(`${root}${path.sep}`), `${label} escapes repository root`);
  return { safe, absolute };
}
async function exists(absolutePath) { try { await access(absolutePath); return true; } catch { return false; } }
async function readJson(root, relativePath, label = relativePath, required = true) {
  const resolved = resolveInside(root, relativePath, label);
  let bytes;
  try { bytes = await readFile(resolved.absolute); }
  catch (error) {
    if (!required && error.code === "ENOENT") return null;
    throw error;
  }
  try { return { ...resolved, bytes, sha256: sha256(bytes), git_blob: gitBlob(bytes), value: JSON.parse(bytes.toString("utf8")) }; }
  catch (error) { fail(`cannot parse ${resolved.safe}: ${error.message}`); }
}
function sameJson(left, right) { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }
function identityExpected(value) { return /^(?:expected-subject(?:$|-)|expected-subjects$)/.test(String(value || "")); }
function stillPresentation(value) {
  const text = String(value || "");
  return /(?:^|-)character-depiction$/.test(text) || /^(?:two|three)-role-character-composite$/.test(text);
}
function portraitPresentation(value) { return String(value || "") === "performer-portrait"; }
function cropPassed(review) {
  if (String(review?.crop_ruling || "").startsWith("pass")) return true;
  if (String(review?.wall_crop_ruling || "").startsWith("pass")) return true;
  if (String(review?.candidate?.wall_crop_ruling || "").startsWith("pass")) return true;
  return Array.isArray(review?.notes) && review.notes.some((note) => /(?:wall|card)[ -]?crop/i.test(String(note)));
}
function humanReviewReady(manifest, review) {
  if (manifest?.reviewed_by && manifest?.reviewed_role) return true;
  if (review?.reviewed_by && review?.reviewed_role) return true;
  if (review?.visual_second_desk?.status === "accepted-for-render") return true;
  return false;
}
function exactReview(manifest, review) {
  return manifest?.exact_subject_review
    || review?.exact_subject_review
    || review?.visual_adjudication
    || manifest?.visual_adjudication
    || null;
}
function presentationValue(review) {
  return review?.presentation?.value || review?.presentation || review?.expected_presentation || null;
}
function identityValue(review) { return review?.identity?.value || review?.identity || null; }
function dispositionAccepted(manifest, review) {
  const accepted = new Set([
    "reviewed-evidence-candidate",
    "reviewed-evidence-ready-for-canonical-consideration",
    "candidate-reviewed",
  ]);
  return accepted.has(String(manifest?.disposition || review?.disposition || ""));
}
function reviewEvidenceSummary(manifest, review) {
  const exact = exactReview(manifest, review);
  return {
    manifest_reviewed_by: manifest?.reviewed_by || null,
    manifest_reviewed_role: manifest?.reviewed_role || null,
    review_reviewed_by: review?.reviewed_by || null,
    review_reviewed_role: review?.reviewed_role || null,
    disposition: manifest?.disposition || review?.disposition || null,
    identity: identityValue(exact),
    presentation: presentationValue(exact),
    crop_pass: cropPassed(exact) || cropPassed(review),
    human_second_desk: humanReviewReady(manifest, review),
    machine_visual_status: manifest?.visual_adjudication?.status || review?.visual_adjudication?.status || null,
    visual_second_desk_status: review?.visual_second_desk?.status || null,
  };
}
function classify(row, evidence) {
  const expectedPresentation = row.side === "portrait"
    ? portraitPresentation(evidence.presentation)
    : stillPresentation(evidence.presentation);
  const wrongTypedPresentation = row.side === "portrait"
    ? stillPresentation(evidence.presentation)
    : portraitPresentation(evidence.presentation);
  const commonCustody = row.custody?.candidate_hash_pass === true
    && row.custody?.manifest_checksum_bound === true
    && row.custody?.candidate_checksum_bound === true
    && row.custody?.duplicate_screen_pass === true;

  if (!commonCustody) return { lane: "structural-custody-repair", reason: "candidate, manifest, checksum, or duplicate custody is incomplete" };
  if (!identityExpected(evidence.identity)) return { lane: "terminal-identity-review", reason: `identity ruling is not expected-subject: ${evidence.identity}` };
  if (wrongTypedPresentation) return { lane: "terminal-wrong-side-presentation", reason: `${row.side} packet carries ${evidence.presentation}` };
  if (!expectedPresentation) return { lane: "terminal-presentation-review", reason: `presentation is not valid for ${row.side}: ${evidence.presentation}` };
  if (!evidence.crop_pass) return { lane: "crop-review-required", reason: "no exact wall/card crop passage is retained" };
  if (!dispositionAccepted(row.__manifest, row.__review)) return { lane: "disposition-normalization-required", reason: `unrecognized disposition: ${evidence.disposition}` };
  if (evidence.human_second_desk) return { lane: "adapter-only-safe", reason: "existing human second-desk review satisfies side-specific identity, presentation, crop, checksum, and duplicate requirements" };
  return { lane: "second-desk-required", reason: "candidate custody is complete but no independent human second-desk authority is retained" };
}
function sortedCounts(rows, key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) || 0) + 1);
  return [...counts.entries()].map(([value, count]) => ({ key: value, count })).sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}

async function main() {
  const root = path.resolve(option("--root", "."));
  const outPath = option("--out", "data/review/estate-debt/COLLECT-009-PACKET-REVIEW-INCOMPATIBLE-AUDIT.json");
  const now = option("--now", new Date().toISOString());
  const [censusDoc, ledgerDoc, specimensDoc, sourcesDoc, correctionDoc] = await Promise.all([
    readJson(root, "data/review/estate-debt/COLLECT-005-ADOPTION-CENSUS.json", "COLLECT-005 census"),
    readJson(root, "data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json", "adoption ledger"),
    readJson(root, "data/specimens.json", "specimens"),
    readJson(root, "data/SOURCES.json", "SOURCES"),
    readJson(root, "data/review/estate-debt/COLLECT-008-K9-CROSS-CARD-DUPLICATE-RULING.json", "K9 duplicate ruling"),
  ]);
  const census = censusDoc.value;
  const ledger = ledgerDoc.value;
  assert(census.transaction === "COLLECT-005" && census.counts?.packet_review_incompatible === 16, "incompatible census denominator drifted");
  assert(ledger.cumulative?.canonical_adoptions === 38 && ledger.cumulative?.remaining_for_canonical_review === 17, "ledger is not at the paid COLLECT-008 boundary");
  assert(correctionDoc.value?.corrected_denominator?.deferred_obligations?.includes("UC-338/still"), "K9 distinct-media debt is missing");
  const adopted = new Set(ledger.adopted_obligations.map((row) => row.obligation_id));
  const rows = census.packets
    .filter((row) => row.lane === "packet-review-incompatible" && !adopted.has(row.obligation_id))
    .sort((a, b) => a.obligation_id.localeCompare(b.obligation_id));
  assert(rows.length === 16, `expected 16 unpaid incompatible packets, found ${rows.length}`);
  const specimens = new Map(specimensDoc.value.map((row) => [row.id, row]));
  const sources = new Map(sourcesDoc.value.map((row) => [row.id, row]));
  const decisions = [];

  for (const row of rows) {
    const manifestDoc = await readJson(root, row.manifest_path, `${row.obligation_id} manifest`);
    assert(manifestDoc.sha256 === row.manifest_sha256, `${row.obligation_id} manifest hash drifted`);
    const reviewDoc = await readJson(root, `${row.packet_root}/review.json`, `${row.obligation_id} review`, false);
    const manifest = manifestDoc.value;
    const review = reviewDoc?.value || null;
    row.__manifest = manifest;
    row.__review = review;
    const evidence = reviewEvidenceSummary(manifest, review);
    const classification = classify(row, evidence);
    const specimen = specimens.get(row.record_id);
    const source = sources.get(row.record_id);
    assert(specimen && source, `${row.obligation_id} canonical record is missing`);
    const currentSpecimen = specimen[row.side] ?? null;
    const currentSource = source[row.side] ?? null;
    const otherSide = row.side === "still" ? "portrait" : "still";
    const currentState = {
      canonical_rows_agree: sameJson(currentSpecimen, currentSource),
      binding: currentSpecimen,
      exact_null: currentSpecimen === null && currentSource === null,
      other_side: otherSide,
      other_side_present: Boolean(specimen[otherSide]?.src && source[otherSide]?.src && sameJson(specimen[otherSide], source[otherSide])),
      destination_exists: await exists(resolveInside(root, row.suggested_destination_path, `${row.obligation_id} destination`).absolute),
    };
    decisions.push({
      obligation_id: row.obligation_id,
      record_id: row.record_id,
      side: row.side,
      actor: row.actor,
      character: row.character,
      production: row.production,
      packet_generation: row.packet_generation,
      candidate_path: row.candidate_path,
      candidate_sha256: row.candidate_sha256,
      candidate_mime: row.candidate_mime,
      suggested_destination_path: row.suggested_destination_path,
      suggested_origin: row.suggested_origin,
      evidence,
      custody: row.custody,
      current: currentState,
      classification: classification.lane,
      reason: classification.reason,
      adapter_normalization_authorizes_adoption: classification.lane === "adapter-only-safe" && currentState.canonical_rows_agree && currentState.exact_null && currentState.other_side_present && !currentState.destination_exists,
      manifest: {
        path: manifestDoc.safe,
        sha256: manifestDoc.sha256,
        git_blob: manifestDoc.git_blob,
      },
      review: reviewDoc ? {
        path: reviewDoc.safe,
        sha256: reviewDoc.sha256,
        git_blob: reviewDoc.git_blob,
      } : null,
    });
  }

  for (const row of rows) { delete row.__manifest; delete row.__review; }
  const adapterSafe = decisions.filter((row) => row.adapter_normalization_authorizes_adoption);
  const report = {
    version: 1,
    transaction: "COLLECT-009",
    operation: "packet-review-incompatible-whole-lane-audit",
    status: "classified",
    recorded_at: now,
    source: {
      current_head: option("--head", null),
      census_path: censusDoc.safe,
      census_sha256: censusDoc.sha256,
      census_git_blob: censusDoc.git_blob,
      ledger_path: ledgerDoc.safe,
      ledger_sha256: ledgerDoc.sha256,
      ledger_git_blob: ledgerDoc.git_blob,
      paid_canonical_adoptions: 38,
      remaining_packet_review: 17,
      distinct_media_debt: "UC-338/still",
    },
    denominator: {
      incompatible_packets: 16,
      reviewed: decisions.length,
      adapter_only_safe: adapterSafe.length,
      requires_non_adapter_work: decisions.length - adapterSafe.length,
      plus_distinct_media_debt: 1,
      total_remaining_estate: 17,
    },
    summary: {
      classification: sortedCounts(decisions, "classification"),
      side: sortedCounts(decisions, "side"),
      packet_generation: sortedCounts(decisions, "packet_generation"),
    },
    adapter_safe_obligations: adapterSafe.map((row) => row.obligation_id),
    decisions,
    boundary: {
      canonical_mutation: false,
      packet_evidence_rewritten: false,
      review_authority_fabricated: false,
      side_specific_presentation_semantics_used: true,
      entire_incompatible_lane_reviewed: true,
      arbitrary_batch_size_used: false,
      next_authorized_work: adapterSafe.length
        ? "adopt all adapter-only-safe packets as one evidence-sized transaction; preserve every non-adapter classification"
        : "perform the classified second-desk, crop, identity, presentation, or custody work without rewriting retained packet evidence",
    },
  };
  const out = resolveInside(root, outPath, "COLLECT-009 output");
  await mkdir(path.dirname(out.absolute), { recursive: true });
  await writeFile(out.absolute, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ transaction: report.transaction, denominator: report.denominator, summary: report.summary, adapter_safe_obligations: report.adapter_safe_obligations }, null, 2));
}

main().catch(async (error) => {
  console.error(`COLLECT-009 audit failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
  await rm(process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "", { force: true }).catch(() => {});
});
