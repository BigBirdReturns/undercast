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
async function exists(absolutePath) {
  try { await access(absolutePath); return true; }
  catch { return false; }
}
async function readDoc(root, relativePath, label = relativePath) {
  const resolved = resolveInside(root, relativePath, label);
  const bytes = await readFile(resolved.absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail(`cannot parse ${resolved.safe}: ${error.message}`); }
  return { ...resolved, bytes, value, sha256: sha256(bytes), git_blob: gitBlob(bytes) };
}
function sameJson(left, right) { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }
function exactRow(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert(matches.length === 1, `${label}: expected one row, found ${matches.length}`);
  return matches[0];
}
function parseChecksums(text, label) {
  const rows = new Map();
  for (const [index, raw] of String(text).split(/\r?\n/).entries()) {
    if (!raw.trim()) continue;
    const match = raw.match(/^([0-9a-f]{64})\s+\*?(.+)$/i);
    assert(match, `${label}:${index + 1} is not a SHA-256 row`);
    const name = match[2].trim().replace(/^\.\//, "");
    assert(name && !name.includes("/") && !rows.has(name), `${label}:${index + 1} repeats or nests ${name}`);
    rows.set(name, match[1].toLowerCase());
  }
  assert(rows.size, `${label} is empty`);
  return rows;
}

const RESIDUAL = Object.freeze([
  "UC-1004/portrait",
  "UC-518/portrait",
  "UC-526/portrait",
  "UC-625/portrait",
]);

async function main() {
  const root = path.resolve(option("--root", "."));
  const outPath = option("--out", "data/review/estate-debt/COLLECT-011-AMORTIZED-PORTRAIT-RULING.json");
  const now = option("--now", new Date().toISOString());
  const head = option("--head", null);
  assert(head === null || /^[0-9a-f]{40}$/.test(head), "--head must be a full commit SHA");

  const [semanticDoc, vocabularyDoc, censusDoc, ledgerDoc, specimensDoc, sourcesDoc, publicationDoc] = await Promise.all([
    readDoc(root, "data/review/estate-debt/COLLECT-010-PACKET-SEMANTIC-ADAPTER-RULING.json", "COLLECT-010 semantic ruling"),
    readDoc(root, "data/review/estate-debt/COLLECT-010-NORMALIZED-REVIEW-VOCABULARY-RULING.json", "COLLECT-010 vocabulary ruling"),
    readDoc(root, "data/review/estate-debt/COLLECT-005-ADOPTION-CENSUS.json", "COLLECT-005 census"),
    readDoc(root, "data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json", "canonical adoption ledger"),
    readDoc(root, "data/specimens.json", "specimens"),
    readDoc(root, "data/SOURCES.json", "SOURCES"),
    readDoc(root, "data/review/estate-debt/COLLECT-010-PUBLICATION.json", "COLLECT-010 publication"),
  ]);
  const semantic = semanticDoc.value;
  const vocabulary = vocabularyDoc.value;
  const census = censusDoc.value;
  const ledger = ledgerDoc.value;
  const publication = publicationDoc.value;

  assert(ledger.cumulative?.canonical_adoptions === 50 && ledger.cumulative?.remaining_for_canonical_review === 5, "ledger is not at the paid COLLECT-010 boundary");
  assert(ledger.cumulative?.stills === 48 && ledger.cumulative?.portraits === 2 && ledger.cumulative?.visitor_visible_media_improvements === 50, "paid media-type accounting drifted");
  assert(ledger.next_batch_contract?.batch === 7 && ledger.next_batch_contract?.prior_canonical_adoptions === 50, "next-batch contract is not batch 7");
  const priorBlocked = semantic.blocked_obligations.map((row) => row.obligation_id).sort();
  assert(sameJson(priorBlocked, [...RESIDUAL].sort()), "COLLECT-010 structural blocker set drifted");
  assert(vocabulary.deferred_obligations?.distinct_era_media?.includes("UC-338/still"), "UC-338 distinct-era debt is missing from vocabulary ruling");
  assert(publication.residual_estate?.distinct_media_debt?.includes("UC-338/still"), "UC-338 distinct-era debt is missing from publication custody");
  assert(sameJson(publication.residual_estate?.batched_amortized_second_desk?.sort(), [...RESIDUAL].sort()), "publication residual portrait set drifted");

  const adopted = new Set(ledger.adopted_obligations.map((row) => row.obligation_id));
  const censusByKey = new Map(census.packets.map((row) => [row.obligation_id, row]));
  const specimenById = new Map(specimensDoc.value.map((row) => [row.id, row]));
  const sourceById = new Map(sourcesDoc.value.map((row) => [row.id, row]));
  const decisions = [];

  for (const key of RESIDUAL) {
    assert(!adopted.has(key), `${key} is already paid`);
    const row = censusByKey.get(key);
    assert(row && row.lane === "packet-review-incompatible" && row.packet_generation === "batched-amortized", `${key} census lane drifted`);
    assert(row.side === "portrait", `${key} is not a portrait obligation`);
    const [recordId, side] = key.split("/");
    const scopeDoc = await readDoc(root, `${row.packet_root}/scope.json`, `${key} scope`);
    const reviewDoc = await readDoc(root, `${row.packet_root}/review.json`, `${key} review`);
    const manifestDoc = await readDoc(root, row.manifest_path, `${key} manifest`);
    const scope = scopeDoc.value;
    const review = reviewDoc.value;
    const manifest = manifestDoc.value;

    assert(scope.obligation_id === key && scope.record_id === recordId && scope.side === side, `${key} scope identity drifted`);
    assert(scope.selection_contract?.independent_visual_adjudication_required === true, `${key} scope lost independent review requirement`);
    assert(scope.selection_contract?.adjudicator_may_be_a_qualified_machine_or_person_but_must_not_be_the_discoverer === true, `${key} scope no longer permits qualified independent machine review`);
    assert(review.record_id === recordId && review.side === side && review.expected_subject === scope.expected_subject, `${key} review identity drifted`);
    assert(review.disposition === "reviewed-evidence-candidate" && Array.isArray(review.quarantine_reasons) && review.quarantine_reasons.length === 0, `${key} review disposition is not clean`);
    assert(review.visual_adjudication?.status === "accepted", `${key} visual adjudication is not accepted`);
    assert(review.visual_adjudication?.independent_from_discovery === true && review.visual_adjudication?.adjudicator?.independent_from_discovery === true, `${key} adjudicator is not independent from discovery`);
    assert(new Set(["machine", "person"]).has(review.visual_adjudication?.adjudicator?.kind), `${key} adjudicator is neither a qualified machine nor person`);
    assert(review.visual_adjudication?.identity?.value === "expected", `${key} identity ruling is not expected`);
    assert(review.visual_adjudication?.presentation?.value === "neutral-human" && review.visual_adjudication?.expected_presentation === "neutral-human", `${key} presentation ruling drifted`);
    assert(typeof review.visual_adjudication?.decision_sha256 === "string" && /^[0-9a-f]{64}$/.test(review.visual_adjudication.decision_sha256), `${key} decision receipt is malformed`);

    const selected = review.selected_source;
    assert(selected && /^https?:\/\//.test(selected.origin || ""), `${key} selected-source origin is missing`);
    assert(new Set(["copyright", "free"]).has(selected.kind), `${key} portrait provenance kind is invalid`);
    if (selected.kind === "free") {
      assert(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(selected.origin), `${key} free portrait does not cite an exact Commons File page`);
      assert(typeof selected.author === "string" && selected.author.trim(), `${key} free portrait author is missing`);
      assert(typeof selected.license === "string" && selected.license.trim(), `${key} free portrait license is missing`);
      assert(Number.isInteger(selected.year), `${key} free portrait year is missing`);
    }
    assert(review.render_contract?.all_selected_source_edges_visible_in_inset === true, `${key} crop simulation did not preserve all source edges`);
    assert(review.render_result?.candidate?.sha256 === row.candidate_sha256, `${key} candidate hash differs between review and census`);
    assert(path.posix.basename(row.candidate_path) === review.render_result.candidate.path, `${key} candidate path differs between review and census`);
    assert(review.render_result?.wall_crop?.path === "card-crop-preview.jpg" && /^[0-9a-f]{64}$/.test(review.render_result.wall_crop.sha256 || ""), `${key} wall crop receipt is malformed`);
    const candidateDuplicate = exactRow(review.duplicate_scan?.items || [], (item) => item.path === review.render_result.candidate.path, `${key} candidate duplicate scan`);
    const cropDuplicate = exactRow(review.duplicate_scan?.items || [], (item) => item.path === review.render_result.wall_crop.path, `${key} crop duplicate scan`);
    assert(Array.isArray(candidateDuplicate.matches) && candidateDuplicate.matches.length === 0, `${key} candidate has duplicate matches`);
    assert(Array.isArray(cropDuplicate.matches) && cropDuplicate.matches.length === 0, `${key} crop has duplicate matches`);

    const checksumResolved = resolveInside(root, row.checksum_path, `${key} checksum ledger`);
    const candidateResolved = resolveInside(root, row.candidate_path, `${key} candidate`);
    const cropResolved = resolveInside(root, `${row.packet_root}/${review.render_result.wall_crop.path}`, `${key} wall crop`);
    const selectedResolved = resolveInside(root, `${row.packet_root}/${selected.output_path}`, `${key} selected source`);
    const [checksumBytes, candidateBytes, cropBytes, selectedBytes] = await Promise.all([
      readFile(checksumResolved.absolute),
      readFile(candidateResolved.absolute),
      readFile(cropResolved.absolute),
      readFile(selectedResolved.absolute),
    ]);
    assert(sha256(candidateBytes) === row.candidate_sha256, `${key} candidate bytes drifted`);
    assert(sha256(cropBytes) === review.render_result.wall_crop.sha256, `${key} wall crop bytes drifted`);
    assert(sha256(selectedBytes) === selected.sha256, `${key} selected source bytes drifted`);
    const sums = parseChecksums(checksumBytes.toString("utf8"), checksumResolved.safe);
    for (const [file, hash] of [
      [path.posix.basename(row.manifest_path), row.manifest_sha256],
      [path.posix.basename(row.candidate_path), row.candidate_sha256],
      ["scope.json", scopeDoc.sha256],
      ["review.json", reviewDoc.sha256],
      [review.render_result.wall_crop.path, review.render_result.wall_crop.sha256],
      [selected.output_path, selected.sha256],
    ]) assert(sums.get(file) === hash, `${key} ${file} is not checksum-bound`);
    const manifestByPath = new Map((manifest.files || []).map((item) => [item.path, item]));
    for (const [file, hash] of [
      ["scope.json", scopeDoc.sha256],
      ["review.json", reviewDoc.sha256],
      [path.posix.basename(row.candidate_path), row.candidate_sha256],
      [review.render_result.wall_crop.path, review.render_result.wall_crop.sha256],
      [selected.output_path, selected.sha256],
    ]) assert(manifestByPath.get(file)?.sha256 === hash, `${key} ${file} is not manifest-bound`);

    const specimen = specimenById.get(recordId);
    const source = sourceById.get(recordId);
    assert(specimen && source, `${key} canonical record is missing`);
    assert(specimen.actor === scope.identity.actor && source.actor === scope.identity.actor, `${key} actor drifted`);
    assert(specimen.character === scope.identity.character && source.character === scope.identity.character, `${key} character drifted`);
    const specimenCurrent = specimen[side] ?? null;
    const sourceCurrent = source[side] ?? null;
    assert(specimenCurrent === null && sourceCurrent === null, `${key} target portrait is no longer null`);
    assert(sameJson(specimenCurrent, sourceCurrent), `${key} canonical target rows disagree`);
    const destination = resolveInside(root, row.suggested_destination_path, `${key} destination`);
    assert(!(await exists(destination.absolute)), `${key} versioned destination already exists`);
    const otherSide = "still";
    const otherSidePresent = Boolean(specimen[otherSide]?.src && source[otherSide]?.src && sameJson(specimen[otherSide], source[otherSide]));
    const proposedBinding = {
      src: row.suggested_destination_path,
      kind: selected.kind,
      origin: selected.origin,
      ...(selected.kind === "free" ? { author: selected.author, license: selected.license, year: selected.year } : {}),
      pin: true,
      focus: row.suggested_focus,
    };
    const qualityEffect = otherSidePresent
      ? { complete_pairs: 1, missing_still: 0, missing_portrait: -1, missing_both: 0 }
      : { complete_pairs: 0, missing_still: 0, missing_portrait: -1, missing_both: -1 };

    decisions.push({
      obligation_id: key,
      record_id: recordId,
      side,
      actor: scope.identity.actor,
      character: scope.identity.character,
      production: scope.identity.production,
      status: "authorized-retained-machine-second-desk",
      classifier_correction: {
        prior_label: "structural-custody-repair",
        corrected_mechanism: "read the retained review contract and receipts rather than requiring a human-only top-level flag",
        evidence_standard_changed: false,
      },
      review: {
        path: reviewDoc.safe,
        sha256: reviewDoc.sha256,
        git_blob: reviewDoc.git_blob,
        adjudicator_id: review.visual_adjudication.adjudicator.id,
        adjudicator_kind: review.visual_adjudication.adjudicator.kind,
        independent_from_discovery: true,
        identity: "expected",
        presentation: "neutral-human",
        decision_sha256: review.visual_adjudication.decision_sha256,
      },
      packet: {
        root: row.packet_root,
        generation: row.packet_generation,
        manifest_path: row.manifest_path,
        manifest_sha256: row.manifest_sha256,
        checksum_path: row.checksum_path,
        candidate_path: row.candidate_path,
        candidate_sha256: row.candidate_sha256,
        candidate_mime: row.candidate_mime,
        wall_crop_path: cropResolved.safe,
        wall_crop_sha256: review.render_result.wall_crop.sha256,
        selected_source_path: selectedResolved.safe,
        selected_source_sha256: selected.sha256,
        duplicate_screen_pass: true,
        crop_pass: true,
      },
      current: {
        target_specimen_binding: null,
        target_source_binding: null,
        canonical_rows_agree: true,
        other_side: otherSide,
        other_side_present: otherSidePresent,
        destination_path: destination.safe,
        destination_exists: false,
      },
      proposed_binding: proposedBinding,
      quality_effect: qualityEffect,
    });
  }

  assert(decisions.length === 4, `expected four residual portrait decisions, found ${decisions.length}`);
  const quality = decisions.reduce((sum, row) => ({
    complete_pairs: sum.complete_pairs + row.quality_effect.complete_pairs,
    missing_still: sum.missing_still + row.quality_effect.missing_still,
    missing_portrait: sum.missing_portrait + row.quality_effect.missing_portrait,
    missing_both: sum.missing_both + row.quality_effect.missing_both,
  }), { complete_pairs: 0, missing_still: 0, missing_portrait: 0, missing_both: 0 });
  assert(sameJson(quality, { complete_pairs: 2, missing_still: 0, missing_portrait: -4, missing_both: -2 }), `residual portrait quality effect drifted: ${JSON.stringify(quality)}`);
  assert(decisions.filter((row) => row.current.other_side_present).length === 2, "expected two complete-pair portrait adoptions");
  assert(decisions.filter((row) => !row.current.other_side_present).length === 2, "expected two missing-both reductions");

  const ruling = {
    version: 1,
    transaction: "COLLECT-011",
    operation: "retained-amortized-portrait-review-reconciliation",
    status: "authorized",
    recorded_at: now,
    source: {
      current_head: head,
      semantic_ruling_path: semanticDoc.safe,
      semantic_ruling_sha256: semanticDoc.sha256,
      semantic_ruling_git_blob: semanticDoc.git_blob,
      vocabulary_ruling_path: vocabularyDoc.safe,
      vocabulary_ruling_sha256: vocabularyDoc.sha256,
      vocabulary_ruling_git_blob: vocabularyDoc.git_blob,
      publication_path: publicationDoc.safe,
      publication_sha256: publicationDoc.sha256,
      publication_git_blob: publicationDoc.git_blob,
      census_path: censusDoc.safe,
      census_sha256: censusDoc.sha256,
      census_git_blob: censusDoc.git_blob,
      ledger_path: ledgerDoc.safe,
      ledger_sha256: ledgerDoc.sha256,
      ledger_git_blob: ledgerDoc.git_blob,
      canonical_adoptions_before: 50,
      remaining_packet_review_before: 5,
    },
    correction: {
      prior_classifier_defects: [
        "required a human-only second-desk flag although the packet contract permits a qualified independent machine or person",
        "ignored accepted visual_adjudication receipts nested in review.json",
        "ignored deterministic render and wall-crop receipts nested in review.json",
        "ignored clean duplicate_scan receipts nested in review.json",
        "treated an absent opposite side as a blocker even though adopting a valid target facet reduces missing-both debt and improves the visitor-facing card"
      ],
      evidence_standard_changed: false,
      review_authority_added: false,
      packet_evidence_rewritten: false,
      canonical_mutation: false,
    },
    denominator: {
      residual_portrait_packets_reviewed: 4,
      authorized: 4,
      blocked: 0,
      complete_pair_adoptions: 2,
      missing_both_reductions: 2,
      distinct_media_debt_remaining: 1,
      expected_cumulative_after_adoption: 54,
      expected_remaining_after_adoption: 1,
    },
    quality_effect_if_adopted: quality,
    authorized_obligations: decisions.map((row) => row.obligation_id),
    blocked_obligations: [],
    decisions,
    boundary: {
      canonical_mutation: false,
      packet_evidence_rewritten: false,
      review_authority_fabricated: false,
      arbitrary_batch_size_used: false,
      complete_residual_portrait_lane_reviewed: true,
      next_authorized_work: "adopt all four authorized portraits as one smoke-gated evidence-sized tranche; leave UC-338/still as the sole distinct-era media debt",
    },
  };

  const out = resolveInside(root, outPath, "COLLECT-011 output");
  await mkdir(path.dirname(out.absolute), { recursive: true });
  await writeFile(out.absolute, `${JSON.stringify(ruling, null, 2)}\n`);
  console.log(JSON.stringify({ transaction: ruling.transaction, denominator: ruling.denominator, quality_effect: quality, authorized_obligations: ruling.authorized_obligations }, null, 2));
}

main().catch(async (error) => {
  console.error(`COLLECT-011 amortized portrait reconciliation failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
  const output = option("--out", "");
  if (output) await rm(output, { force: true }).catch(() => {});
});
