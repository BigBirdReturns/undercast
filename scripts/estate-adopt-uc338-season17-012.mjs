#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCanonicalAdoptionLedger } from "./estate-canonical-adoption-ledger.mjs";

const DEFAULTS = Object.freeze({
  packetPublication: "data/review/estate-debt/COLLECT-012-UC338-SEASON17-PACKET-PUBLICATION.json",
  packetRoot: "data/review/card-backfill/UC-338-season17-replacement",
  originalPacket: "data/review/card-backfill/UC-338/manifest.json",
  ledger: "data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json",
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
  quality: "data/quality.json",
  receipt: "data/review/estate-debt/COLLECT-012-CANONICAL-ADOPTION.json",
  publication: "data/review/estate-debt/COLLECT-012-PUBLICATION.json",
});

const args = process.argv.slice(2);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gitBlob = (bytes) => createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8")).update(bytes).digest("hex");
const round6 = (value) => Number(Number(value).toFixed(6));
function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function has(name) { return args.includes(name); }
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
async function readJsonAny(filePath, label = filePath) {
  const absolute = path.resolve(filePath);
  const bytes = await readFile(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail(`cannot parse ${label}: ${error.message}`); }
  return { absolute, bytes, value, sha256: sha256(bytes), git_blob: gitBlob(bytes) };
}
function sameJson(left, right) { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }
function exactRow(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert(matches.length === 1, `${label}: expected one row, found ${matches.length}`);
  return matches[0];
}
function detectIndent(text) {
  const match = String(text).match(/\n([ \t]+)"/);
  if (!match) return 2;
  if (match[1].includes("\t")) return "\t";
  return Math.min(10, Math.max(1, match[1].length));
}
function jsonLike(originalBytes, value) {
  return Buffer.from(`${JSON.stringify(value, null, detectIndent(originalBytes.toString("utf8")))}\n`, "utf8");
}
async function atomicWrite(absolutePath, bytes) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temporary = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, absolutePath);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
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
  assert(rows.size === 10, `${label} must bind ten packet files; found ${rows.size}`);
  return rows;
}
function manifestEntry(manifest, filename, label) {
  const matches = (manifest.files || []).filter((row) => row?.path === filename);
  assert(matches.length === 1, `${label} manifest must contain one ${filename} entry; found ${matches.length}`);
  return matches[0];
}
function validateBinding(binding) {
  assert(binding && typeof binding === "object" && !Array.isArray(binding), "UC-338/still binding is missing");
  assert(binding.src === "images/uc-338-still-fe30c21c2a17.jpg", "UC-338/still destination drifted");
  assert(binding.kind === "still", "UC-338/still kind drifted");
  assert(binding.origin === "https://www.doctorwho.tv/stories/the-horns-of-nimon", "UC-338/still origin drifted");
  assert(binding.pin === true, "UC-338/still is not pinned");
  assert(sameJson(binding.focus, { x: "center", y: "center" }), "UC-338/still focus drifted");
}

async function inspectTransaction({ root = process.cwd() } = {}) {
  const resolvedRoot = path.resolve(root);
  await validateCanonicalAdoptionLedger({ root: resolvedRoot, ledgerPath: DEFAULTS.ledger });
  const [publicationDoc, ledgerDoc, specimensDoc, sourcesDoc] = await Promise.all([
    readDoc(resolvedRoot, DEFAULTS.packetPublication, "COLLECT-012 packet publication"),
    readDoc(resolvedRoot, DEFAULTS.ledger, "canonical adoption ledger"),
    readDoc(resolvedRoot, DEFAULTS.specimens, "specimens"),
    readDoc(resolvedRoot, DEFAULTS.sources, "SOURCES"),
  ]);
  const packetPublication = publicationDoc.value;
  const ledger = ledgerDoc.value;
  assert(packetPublication?.version === 1, "COLLECT-012 packet publication version drifted");
  assert(packetPublication.transaction === "COLLECT-012" && packetPublication.operation === "uc338-season17-replacement-packet-publication", "COLLECT-012 packet publication identity drifted");
  assert(packetPublication.status === "published-evidence-only", "COLLECT-012 packet publication is not evidence-only published");
  assert(packetPublication.ruling?.obligation_id === "UC-338/still" && packetPublication.ruling?.status === "authorized-era-specific-distinct-still", "UC-338 terminal ruling drifted");
  assert(packetPublication.ruling?.source_page === "https://www.doctorwho.tv/stories/the-horns-of-nimon", "UC-338 ruled source page drifted");
  assert(packetPublication.ruling?.season === 17 && packetPublication.ruling?.performance_credit === "K9 (voice): David Brierly", "UC-338 era or performance custody drifted");
  assert(packetPublication.boundary?.canonical_mutation === false && packetPublication.boundary?.original_packet_rewritten === false && packetPublication.boundary?.cross_card_duplicate_policy_lowered === false, "COLLECT-012 packet publication escaped its evidence-only boundary");
  assert(packetPublication.boundary?.next_authorized_work === "adopt UC-338/still as the final imported packet obligation", "COLLECT-012 next-work authority drifted");

  assert(ledger.cumulative?.canonical_adoptions === 54 && ledger.cumulative?.remaining_for_canonical_review === 1, "ledger is not at the paid COLLECT-011 boundary");
  assert(ledger.cumulative?.stills === 48 && ledger.cumulative?.portraits === 6 && ledger.cumulative?.visitor_visible_media_improvements === 54, "COLLECT-011 media accounting drifted");
  assert(ledger.next_batch_contract?.batch === 8 && ledger.next_batch_contract?.prior_canonical_adoptions === 54, "ledger next-batch contract is not batch 8");
  assert(ledger.next_batch_contract?.requires_distinct_era_media === true && ledger.next_batch_contract?.remaining_lane_counts?.distinct_media_debt === 1, "ledger does not retain exactly one distinct-era obligation");
  assert(!ledger.adopted_obligations.some((row) => row.obligation_id === "UC-338/still"), "UC-338/still is already paid");

  const packetRoot = resolveInside(resolvedRoot, packetPublication.packet?.root, "COLLECT-012 packet root");
  assert(packetRoot.safe === DEFAULTS.packetRoot, "COLLECT-012 packet root drifted");
  const paths = {
    manifest: `${packetRoot.safe}/manifest.json`,
    checksums: `${packetRoot.safe}/SHA256SUMS`,
    scope: `${packetRoot.safe}/scope.json`,
    review: `${packetRoot.safe}/review.json`,
    adjudication: `${packetRoot.safe}/adjudication-receipt.json`,
    sourceReceipt: `${packetRoot.safe}/source-receipt.json`,
    candidate: `${packetRoot.safe}/uc-338-season17-still-candidate.jpg`,
  };
  const [manifestDoc, checksumDoc, scopeDoc, reviewDoc, adjudicationDoc, sourceReceiptDoc] = await Promise.all([
    readDoc(resolvedRoot, paths.manifest, "UC-338 replacement manifest"),
    readFile(resolveInside(resolvedRoot, paths.checksums, "UC-338 checksum ledger").absolute),
    readDoc(resolvedRoot, paths.scope, "UC-338 replacement scope"),
    readDoc(resolvedRoot, paths.review, "UC-338 replacement review"),
    readDoc(resolvedRoot, paths.adjudication, "UC-338 terminal adjudication"),
    readDoc(resolvedRoot, paths.sourceReceipt, "UC-338 source receipt"),
  ]);
  const candidateResolved = resolveInside(resolvedRoot, paths.candidate, "UC-338 replacement candidate");
  const candidateBytes = await readFile(candidateResolved.absolute);
  const originalPacketResolved = resolveInside(resolvedRoot, DEFAULTS.originalPacket, "original UC-338 packet");
  assert(await exists(originalPacketResolved.absolute), "original UC-338 packet is not preserved");

  assert(manifestDoc.sha256 === packetPublication.packet.manifest_sha256, "UC-338 manifest SHA-256 differs from publication custody");
  assert(manifestDoc.value.packet_sha256 === packetPublication.packet.packet_sha256, "UC-338 packet aggregate drifted");
  assert(manifestDoc.value.canonical_destination === packetPublication.packet.canonical_destination, "UC-338 canonical destination drifted");
  assert(manifestDoc.value.record_id === "UC-338" && manifestDoc.value.side === "still" && manifestDoc.value.disposition === "reviewed-evidence-candidate", "UC-338 manifest identity drifted");
  assert(manifestDoc.value.replacement_for_deferred_packet === true && manifestDoc.value.original_packet_preserved_at === "data/review/card-backfill/UC-338", "UC-338 replacement boundary drifted");
  assert(manifestDoc.value.canonical_mutation === false, "UC-338 manifest claims canonical mutation");

  const checksums = parseChecksums(checksumDoc.toString("utf8"), paths.checksums);
  const boundDocs = [
    ["manifest.json", manifestDoc],
    ["scope.json", scopeDoc],
    ["review.json", reviewDoc],
    ["adjudication-receipt.json", adjudicationDoc],
    ["source-receipt.json", sourceReceiptDoc],
  ];
  for (const [filename, doc] of boundDocs) assert(checksums.get(filename) === doc.sha256, `${filename} is not checksum-bound`);
  assert(checksums.get("uc-338-season17-still-candidate.jpg") === sha256(candidateBytes), "UC-338 candidate is not checksum-bound");
  assert(sha256(candidateBytes) === packetPublication.packet.candidate_sha256, "UC-338 candidate bytes differ from publication custody");
  const candidateEntry = manifestEntry(manifestDoc.value, "uc-338-season17-still-candidate.jpg", "UC-338");
  const reviewEntry = manifestEntry(manifestDoc.value, "review.json", "UC-338");
  const adjudicationEntry = manifestEntry(manifestDoc.value, "adjudication-receipt.json", "UC-338");
  assert(candidateEntry.sha256 === packetPublication.packet.candidate_sha256 && candidateEntry.bytes === candidateBytes.length, "UC-338 manifest does not bind candidate bytes");
  assert(reviewEntry.sha256 === reviewDoc.sha256 && reviewEntry.bytes === reviewDoc.bytes.length, "UC-338 manifest does not bind review bytes");
  assert(adjudicationEntry.sha256 === adjudicationDoc.sha256 && adjudicationEntry.bytes === adjudicationDoc.bytes.length, "UC-338 manifest does not bind adjudication bytes");

  const scope = scopeDoc.value;
  assert(scope.record_id === "UC-338" && scope.side === "still" && scope.actor === "David Brierly" && scope.character === "K9 (voice)", "UC-338 scope identity drifted");
  assert(scope.years === "1979–80" && scope.required_subject === "K9", "UC-338 scope chronology or subject drifted");
  assert(scope.required_era_binding?.season === 17 && scope.required_era_binding?.story === "The Horns of Nimon" && scope.required_era_binding?.credited_performance === "K9 (voice): David Brierly", "UC-338 required era binding drifted");
  assert(scope.canonical_mutation === false, "UC-338 scope claims canonical mutation");

  const review = reviewDoc.value;
  assert(review.record_id === "UC-338" && review.side === "still" && review.disposition === "reviewed-evidence-candidate", "UC-338 review identity drifted");
  assert(review.reviewed_by === "chatgpt-second-desk" && review.independent_from_discovery === true, "UC-338 independent review custody drifted");
  assert(review.identity?.value === "expected-subject" && review.era_binding?.value === "season-17-performance-era" && review.presentation?.value === "character-depiction", "UC-338 review semantics drifted");
  assert(review.cross_card_duplicate?.value === "pass" && review.cross_card_duplicate?.selected_source_is_distinct === true && review.cross_card_duplicate?.candidate_is_distinct === true && review.cross_card_duplicate?.cosmetic_recrop_only === false, "UC-338 distinct-media ruling drifted");
  assert(review.render_contract?.wall_width === 1246 && review.render_contract?.wall_height === 1000 && review.render_contract?.canonical_mutation === false, "UC-338 crop contract drifted");
  assert(review.render_result?.candidate?.sha256 === packetPublication.packet.candidate_sha256 && review.render_result?.candidate?.bytes === candidateBytes.length, "UC-338 rendered candidate custody drifted");
  assert(review.crop_ruling === "pass" && review.canonical_mutation === false && review.permanent_evidence_publication_candidate === true, "UC-338 review is not adoption-ready");

  const adjudication = adjudicationDoc.value;
  assert(adjudication.transaction === "COLLECT-012" && adjudication.decision_id === "UC-338/still" && adjudication.operation === "era-specific-distinct-still-terminal-adjudication", "UC-338 adjudication identity drifted");
  assert(adjudication.status === "authorized-era-specific-distinct-still", "UC-338 adjudication is not authorized");
  assert(adjudication.candidate?.sha256 === packetPublication.packet.candidate_sha256 && adjudication.candidate?.canonical_destination === packetPublication.packet.canonical_destination, "UC-338 adjudication candidate custody drifted");
  assert(adjudication.boundary?.canonical_mutation === false && adjudication.boundary?.packet_evidence_rewritten === false && adjudication.boundary?.cross_card_duplicate_policy_lowered === false && adjudication.boundary?.evidence_standard_changed === false, "UC-338 adjudication escaped its boundary");

  const sourceReceipt = sourceReceiptDoc.value;
  assert(sourceReceipt.record_id === "UC-338" && sourceReceipt.side === "still" && sourceReceipt.operation === "official-season17-distinct-media-source-receipt", "UC-338 source receipt identity drifted");
  assert(sourceReceipt.page?.url === "https://www.doctorwho.tv/stories/the-horns-of-nimon" && sourceReceipt.page?.season === 17 && sourceReceipt.page?.cast_credit === "K9 (voice): David Brierly", "UC-338 source page custody drifted");
  assert(sourceReceipt.asset?.sha256 === packetPublication.packet.source_sha256 && sourceReceipt.asset?.visually_depicts === "K9", "UC-338 source asset custody drifted");
  assert(sourceReceipt.custody?.source_is_byte_distinct_from_uc323_selected_source === true && sourceReceipt.custody?.source_is_not_cosmetic_recrop_of_prior_source === true, "UC-338 source distinction custody drifted");
  assert(sourceReceipt.canonical_mutation === false, "UC-338 source receipt claims canonical mutation");

  const specimen = exactRow(specimensDoc.value, (row) => row.id === "UC-338", "specimens UC-338");
  const source = exactRow(sourcesDoc.value, (row) => row.id === "UC-338", "SOURCES UC-338");
  assert(specimen.actor === "David Brierly" && source.actor === "David Brierly", "UC-338 actor drifted");
  assert(specimen.character === "K9 (voice)" && source.character === "K9 (voice)", "UC-338 character drifted");
  assert(specimen.production === "Doctor Who" && specimen.years === "1979–80", "UC-338 production or chronology drifted");
  assert(Boolean(specimen.portrait?.src) && Boolean(source.portrait?.src) && sameJson(specimen.portrait, source.portrait), "UC-338 opposite portrait is not complete and aligned");

  const intended = {
    src: packetPublication.packet.canonical_destination,
    kind: "still",
    origin: packetPublication.ruling.source_page,
    pin: true,
    focus: { x: "center", y: "center" },
  };
  validateBinding(intended);
  const destination = resolveInside(resolvedRoot, intended.src, "UC-338 canonical destination");
  const specimenCurrent = specimen.still ?? null;
  const sourceCurrent = source.still ?? null;
  const destinationExists = await exists(destination.absolute);
  let state;
  if (specimenCurrent === null && sourceCurrent === null) {
    assert(!destinationExists, "UC-338 destination exists before adoption");
    state = "pending";
  } else {
    assert(sameJson(specimenCurrent, intended) && sameJson(sourceCurrent, intended), "UC-338 current binding is neither null nor the exact intended adoption");
    assert(destinationExists, "UC-338 adopted destination is missing");
    assert(sha256(await readFile(destination.absolute)) === packetPublication.packet.candidate_sha256, "UC-338 adopted destination bytes drifted");
    state = "already-adopted";
  }

  return {
    resolvedRoot,
    publicationDoc,
    ledgerDoc,
    specimensDoc,
    sourcesDoc,
    packetPublication,
    ledger,
    manifestDoc,
    scopeDoc,
    reviewDoc,
    adjudicationDoc,
    sourceReceiptDoc,
    candidateBytes,
    specimen,
    source,
    intended,
    destination,
    state,
  };
}

async function applyTransaction({ inspection, now = new Date().toISOString(), reportPath = null }) {
  const pending = inspection.state === "pending";
  if (pending) {
    await mkdir(path.dirname(inspection.destination.absolute), { recursive: true });
    await writeFile(inspection.destination.absolute, inspection.candidateBytes, { flag: "wx" });
    inspection.specimen.still = inspection.intended;
    inspection.source.still = inspection.intended;
    inspection.source.fetched_at = String(now).slice(0, 10);
    await atomicWrite(inspection.specimensDoc.absolute, jsonLike(inspection.specimensDoc.bytes, inspection.specimensDoc.value));
    await atomicWrite(inspection.sourcesDoc.absolute, jsonLike(inspection.sourcesDoc.bytes, inspection.sourcesDoc.value));
  }
  const report = {
    version: 1,
    transaction: "COLLECT-012",
    operation: "uc338-season17-canonical-adoption-apply",
    generated_at: now,
    counts: { authorized: 1, adopted: pending ? 1 : 0, already_adopted: pending ? 0 : 1, stills: 1 },
    adoptions: [{
      obligation_id: "UC-338/still",
      state: pending ? "adopted" : "already-adopted",
      destination_path: inspection.destination.safe,
      candidate_sha256: inspection.packetPublication.packet.candidate_sha256,
    }],
    boundary: {
      discovery_performed: false,
      packet_evidence_rewritten: false,
      review_authority_added: false,
      arbitrary_batch_size_used: false,
      quality_baseline_reset: false,
      complete_gate_required_before_receipt: true,
      canonical_mutation: pending,
    },
  };
  if (reportPath) await atomicWrite(path.resolve(reportPath), Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8"));
  return report;
}

async function validateAdopted({ inspection, beforeQualityPath }) {
  assert(inspection.state === "already-adopted", "UC-338/still remains pending");
  assert(sha256(await readFile(inspection.destination.absolute)) === inspection.packetPublication.packet.candidate_sha256, "UC-338 destination bytes drifted");
  assert(sameJson(inspection.specimen.still, inspection.intended), "UC-338 specimen binding drifted");
  assert(sameJson(inspection.source.still, inspection.intended), "UC-338 source binding drifted");
  const [beforeDoc, afterDoc] = await Promise.all([
    readJsonAny(beforeQualityPath, "pre-adoption quality"),
    readDoc(inspection.resolvedRoot, DEFAULTS.quality, "post-adoption quality"),
  ]);
  const before = beforeDoc.value.metrics;
  const after = afterDoc.value.metrics;
  assert(beforeDoc.value.total === 1313 && afterDoc.value.total === 1313, "quality denominator drifted");
  assert(before.complete_pairs === 730 && before.missing_still === 340 && before.missing_portrait === 350 && before.missing_both === 107, "pre-adoption quality is not the paid COLLECT-011 state");
  assert(after.complete_pairs === 731, "complete pairs did not reach 731");
  assert(after.missing_still === 339, "missing stills did not reach 339");
  assert(after.missing_portrait === 350, "missing portraits changed");
  assert(after.missing_both === 107, "missing-both count changed");
  assert(after.complete_pair_ratio === round6(731 / 1313), "complete-pair ratio is not exact");
  assert(after.complete_pairs === before.complete_pairs + 1, "complete-pair delta is not +1");
  assert(after.missing_still === before.missing_still - 1, "missing-still delta is not -1");
  assert(after.missing_portrait === before.missing_portrait, "missing-portrait delta is not zero");
  assert(after.missing_both === before.missing_both, "missing-both delta is not zero");
  assert(sameJson(beforeDoc.value.baseline, afterDoc.value.baseline), "quality baseline changed");
  return {
    before_doc: beforeDoc,
    after_doc: afterDoc,
    before,
    after,
    deltas: { complete_pairs: 1, missing_still: -1, missing_portrait: 0, missing_both: 0 },
  };
}

async function promoteTransaction({ inspection, beforeQualityPath, authorizedParent, gatedTree, workflowRun, now }) {
  assert(/^[0-9a-f]{40}$/.test(authorizedParent || ""), "authorized parent is malformed");
  assert(/^[0-9a-f]{40}$/.test(gatedTree || ""), "gated tree is malformed");
  assert(/^\d+$/.test(String(workflowRun || "")), "workflow run is malformed");
  const receiptResolved = resolveInside(inspection.resolvedRoot, DEFAULTS.receipt, "COLLECT-012 receipt");
  assert(!(await exists(receiptResolved.absolute)), "COLLECT-012 receipt already exists");
  const quality = await validateAdopted({ inspection, beforeQualityPath });
  const receipt = {
    version: 1,
    transaction: "COLLECT-012",
    batch: 8,
    operation: "uc338-season17-distinct-still-canonical-media-adoption",
    status: "paid",
    recorded_at: now,
    product_alignment: "docs/ESTATE-PRODUCT-ALIGNMENT.md",
    ruling: {
      packet_publication_path: inspection.publicationDoc.safe,
      packet_publication_sha256: inspection.publicationDoc.sha256,
      packet_publication_git_blob: inspection.publicationDoc.git_blob,
      adjudication_path: inspection.adjudicationDoc.safe,
      adjudication_sha256: inspection.adjudicationDoc.sha256,
      adjudication_git_blob: inspection.adjudicationDoc.git_blob,
      authorized: 1,
      blocked: 0,
    },
    authorization: {
      authorized_parent: authorizedParent,
      gated_tree: gatedTree,
      workflow_run: Number(workflowRun),
      exact_head_publication_lease_required: true,
    },
    counts: {
      canonical_adoptions: 1,
      cumulative_canonical_adoptions: 55,
      imported_packets_remaining_for_adoption_review: 0,
      stills: 1,
      portraits: 0,
    },
    quality: {
      before_sha256: quality.before_doc.sha256,
      after_sha256: quality.after_doc.sha256,
      before: quality.before,
      after: quality.after,
      deltas: quality.deltas,
      baseline_unchanged: true,
    },
    adoptions: [{
      record_id: "UC-338",
      side: "still",
      canonical_path: inspection.destination.safe,
      canonical_sha256: inspection.packetPublication.packet.candidate_sha256,
      image_origin: inspection.intended.origin,
      packet_manifest: inspection.manifestDoc.safe,
      packet_manifest_sha256: inspection.manifestDoc.sha256,
      ruling_decision: "UC-338/still",
    }],
    boundary: {
      visitor_visible_media_improvements: 1,
      arbitrary_batch_size_used: false,
      imported_packet_estate_exhausted: true,
      distinct_media_debt_exhausted: true,
      discovery_performed: false,
      packet_evidence_rewritten: false,
      original_packet_rewritten: false,
      cross_card_duplicate_policy_lowered: false,
      review_authority_added: false,
      quality_baseline_reset: false,
      canonical_mutation: true,
      next_authorized_work: "release the fully adjudicated 55-packet estate through PR #132",
    },
  };

  const ledger = inspection.ledger;
  ledger.recorded_at = now;
  ledger.batches.push({
    transaction: "COLLECT-012",
    batch: 8,
    status: "paid",
    receipt: DEFAULTS.receipt,
    workflow_run: Number(workflowRun),
    authorized_parent: authorizedParent,
    published_head: null,
    gated_tree: gatedTree,
    adoption_count: 1,
    obligations: ["UC-338/still"],
    quality_delta: { complete_pairs: 1, missing_still: -1, missing_portrait: 0, missing_both: 0 },
  });
  ledger.adopted_obligations.push({
    obligation_id: "UC-338/still",
    transaction: "COLLECT-012",
    batch: 8,
    canonical_path: inspection.destination.safe,
    canonical_sha256: inspection.packetPublication.packet.candidate_sha256,
  });
  ledger.cumulative = {
    canonical_adoptions: 55,
    remaining_for_canonical_review: 0,
    stills: 49,
    portraits: 6,
    visitor_visible_media_improvements: 55,
  };
  ledger.next_batch_contract = {
    batch: 9,
    prior_canonical_adoptions: 55,
    maximum_new_adoptions: 0,
    expected_cumulative_after_full_batch: 55,
    expected_remaining_after_full_batch: 0,
    must_append_batch_and_obligations_atomically: true,
    must_refuse_already_adopted_obligations: true,
    must_reconcile_against_all_prior_paid_receipts: true,
    imported_packet_estate_exhausted: true,
    remaining_lane_counts: {},
  };

  await atomicWrite(receiptResolved.absolute, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"));
  await atomicWrite(inspection.ledgerDoc.absolute, jsonLike(inspection.ledgerDoc.bytes, ledger));
  await validateCanonicalAdoptionLedger({ root: inspection.resolvedRoot, ledgerPath: DEFAULTS.ledger });
  return { receipt: receiptResolved.safe, ledger: DEFAULTS.ledger, canonical_adoptions: 55, remaining: 0 };
}

async function reconcilePublication({ root = process.cwd(), adoptionHead, adoptionTree, gatedTree, workflowRun, reconciliationParent, now }) {
  const resolvedRoot = path.resolve(root);
  for (const [label, value] of Object.entries({ adoptionHead, adoptionTree, gatedTree, reconciliationParent })) {
    assert(/^[0-9a-f]{40}$/.test(value || ""), `${label} is malformed`);
  }
  assert(/^\d+$/.test(String(workflowRun || "")), "workflow run is malformed");
  const [receiptDoc, ledgerDoc] = await Promise.all([
    readDoc(resolvedRoot, DEFAULTS.receipt, "COLLECT-012 receipt"),
    readDoc(resolvedRoot, DEFAULTS.ledger, "canonical adoption ledger"),
  ]);
  const receipt = receiptDoc.value;
  const ledger = ledgerDoc.value;
  assert(receipt.transaction === "COLLECT-012" && receipt.batch === 8 && receipt.status === "paid", "COLLECT-012 receipt identity drifted");
  assert(receipt.authorization?.workflow_run === Number(workflowRun), "COLLECT-012 workflow run drifted");
  assert(receipt.authorization?.gated_tree === gatedTree, "COLLECT-012 gated tree drifted");
  const batch = exactRow(ledger.batches, (row) => row.transaction === "COLLECT-012" && row.batch === 8, "COLLECT-012 ledger batch");
  assert(batch.status === "paid" && batch.receipt === DEFAULTS.receipt && batch.adoption_count === 1, "COLLECT-012 ledger batch drifted");
  assert(batch.published_head === null || batch.published_head === adoptionHead, "COLLECT-012 published head conflicts");
  batch.published_head = adoptionHead;
  batch.receipt_git_blob = receiptDoc.git_blob;
  ledger.recorded_at = now;
  const publication = {
    version: 1,
    transaction: "COLLECT-012",
    batch: 8,
    operation: "uc338-season17-publication-reconciliation",
    status: "published",
    recorded_at: now,
    authorization: {
      reconciliation_parent: reconciliationParent,
      exact_head_publication_lease_required: true,
    },
    adoption: {
      published_head: adoptionHead,
      published_tree: adoptionTree,
      gated_candidate_tree: gatedTree,
      workflow_run: Number(workflowRun),
      receipt_path: DEFAULTS.receipt,
      receipt_git_blob: receiptDoc.git_blob,
    },
    cumulative: {
      canonical_adoptions: 55,
      remaining_for_canonical_review: 0,
      visitor_visible_media_improvements: 55,
      complete_pairs: 731,
      missing_stills: 339,
      missing_portraits: 350,
      missing_both: 107,
    },
    residual_estate: {
      imported_packet_obligations: [],
      exhausted: true,
    },
    boundary: {
      canonical_mutation: false,
      packet_evidence_rewritten: false,
      original_packet_rewritten: false,
      adoption_receipt_rewritten: false,
      only_publication_custody_reconciled: true,
    },
  };
  const publicationResolved = resolveInside(resolvedRoot, DEFAULTS.publication, "COLLECT-012 publication");
  await atomicWrite(ledgerDoc.absolute, jsonLike(ledgerDoc.bytes, ledger));
  await atomicWrite(publicationResolved.absolute, Buffer.from(`${JSON.stringify(publication, null, 2)}\n`, "utf8"));
  await validateCanonicalAdoptionLedger({ root: resolvedRoot, ledgerPath: DEFAULTS.ledger });
  return { publication: publicationResolved.safe, adoption_head: adoptionHead, canonical_adoptions: 55, remaining: 0 };
}

async function main() {
  const root = path.resolve(option("--root", "."));
  if (has("--reconcile")) {
    const result = await reconcilePublication({
      root,
      adoptionHead: option("--adoption-head"),
      adoptionTree: option("--adoption-tree"),
      gatedTree: option("--gated-tree"),
      workflowRun: option("--workflow-run"),
      reconciliationParent: option("--reconciliation-parent"),
      now: option("--now", new Date().toISOString()),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const inspection = await inspectTransaction({ root });
  if (has("--write")) {
    const result = await applyTransaction({
      inspection,
      now: option("--now", new Date().toISOString()),
      reportPath: option("--report"),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (has("--validate")) {
    const result = await validateAdopted({ inspection, beforeQualityPath: option("--before-quality") });
    console.log(JSON.stringify({ transaction: "COLLECT-012", status: "validated", adoptions: 1, quality: result.deltas }, null, 2));
    return;
  }
  if (has("--promote")) {
    const result = await promoteTransaction({
      inspection,
      beforeQualityPath: option("--before-quality"),
      authorizedParent: option("--authorized-parent"),
      gatedTree: option("--gated-tree"),
      workflowRun: option("--workflow-run"),
      now: option("--now", new Date().toISOString()),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(JSON.stringify({
    transaction: "COLLECT-012",
    authorized: 1,
    pending: inspection.state === "pending" ? 1 : 0,
    already_adopted: inspection.state === "already-adopted" ? 1 : 0,
    stills: 1,
    prior_canonical_adoptions: inspection.ledger.cumulative.canonical_adoptions,
    expected_cumulative_after: 55,
    expected_remaining_after: 0,
    expected_quality: { complete_pairs: 1, missing_still: -1, missing_portrait: 0, missing_both: 0 },
    obligations: ["UC-338/still"],
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`COLLECT-012 adoption failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
