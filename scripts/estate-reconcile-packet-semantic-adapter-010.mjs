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
function exactRow(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert(matches.length === 1, `${label}: expected one row, found ${matches.length}`);
  return matches[0];
}

const SEMANTIC_ADAPTER = Object.freeze({
  "UC-040/portrait": { identity: "expected-subject", presentation: "performer-portrait" },
  "UC-079/still": { identity: "expected-composite-subject", presentation: "seven-role-character-depiction" },
  "UC-124/still": { identity: "expected-subjects", presentation: "two-role-voice-character-composite" },
  "UC-126/still": { identity: "expected-subjects", presentation: "four-role-character-composite" },
  "UC-146/portrait": { identity: "expected-person", presentation: "untransformed-performer-portrait" },
  "UC-154/still": { identity: "expected-subject", presentation: "completed-2007-michael-myers-character-still" },
  "UC-156/still": { identity: "expected-subjects", presentation: "two-role-dalek-cyberman-voice-composite" },
  "UC-170/still": { identity: "expected-three-role-subject", presentation: "three-role-animated-character-composite" },
  "UC-171/still": { identity: "exact-three-role-subject-set", presentation: "three-role-animated-character-composite" },
  "UC-172/still": { identity: "exact-three-role-subject-set", presentation: "three-role-animated-character-composite" },
  "UC-174/still": { identity: "exact-three-role-subject-set", presentation: "three-role-cross-medium-character-composite" },
  "UC-175/still": { identity: "exact-two-role-sound-performance-subject-set", presentation: "two-role-r2-d2-and-walle-character-composite" },
});
const STRUCTURAL_BLOCKERS = Object.freeze([
  "UC-1004/portrait",
  "UC-518/portrait",
  "UC-526/portrait",
  "UC-625/portrait",
]);

async function main() {
  const root = path.resolve(option("--root", "."));
  const outPath = option("--out", "data/review/estate-debt/COLLECT-010-PACKET-SEMANTIC-ADAPTER-RULING.json");
  const now = option("--now", new Date().toISOString());
  const head = option("--head", null);
  assert(head === null || /^[0-9a-f]{40}$/.test(head), "--head must be a full commit SHA");

  const [auditDoc, censusDoc, ledgerDoc, specimensDoc, sourcesDoc, k9Doc] = await Promise.all([
    readDoc(root, "data/review/estate-debt/COLLECT-009-PACKET-REVIEW-INCOMPATIBLE-AUDIT.json", "COLLECT-009 audit"),
    readDoc(root, "data/review/estate-debt/COLLECT-005-ADOPTION-CENSUS.json", "COLLECT-005 census"),
    readDoc(root, "data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json", "canonical adoption ledger"),
    readDoc(root, "data/specimens.json", "specimens"),
    readDoc(root, "data/SOURCES.json", "SOURCES"),
    readDoc(root, "data/review/estate-debt/COLLECT-008-K9-CROSS-CARD-DUPLICATE-RULING.json", "K9 duplicate ruling"),
  ]);
  const audit = auditDoc.value;
  const census = censusDoc.value;
  const ledger = ledgerDoc.value;
  assert(audit.transaction === "COLLECT-009" && audit.denominator?.reviewed === 16, "COLLECT-009 audit identity drifted");
  assert(audit.denominator?.adapter_only_safe === 1 && audit.denominator?.requires_non_adapter_work === 15, "expected the narrow-adapter checkpoint");
  assert(census.transaction === "COLLECT-005" && census.counts?.packet_review_incompatible === 16, "incompatible census denominator drifted");
  assert(ledger.cumulative?.canonical_adoptions === 38 && ledger.cumulative?.remaining_for_canonical_review === 17, "ledger is not at the paid COLLECT-008 boundary");
  assert(k9Doc.value?.corrected_denominator?.deferred_obligations?.includes("UC-338/still"), "UC-338 distinct-era debt is missing");

  const adopted = new Set(ledger.adopted_obligations.map((row) => row.obligation_id));
  const censusRows = census.packets
    .filter((row) => row.lane === "packet-review-incompatible" && !adopted.has(row.obligation_id))
    .sort((a, b) => a.obligation_id.localeCompare(b.obligation_id));
  assert(censusRows.length === 16, `expected 16 unpaid incompatible packets, found ${censusRows.length}`);
  const auditByKey = new Map(audit.decisions.map((row) => [row.obligation_id, row]));
  assert(auditByKey.size === 16, "COLLECT-009 decision set is not unique");
  const specimenById = new Map(specimensDoc.value.map((row) => [row.id, row]));
  const sourceById = new Map(sourcesDoc.value.map((row) => [row.id, row]));
  const decisions = [];

  for (const row of censusRows) {
    const key = row.obligation_id;
    const prior = auditByKey.get(key);
    assert(prior, `${key} is absent from COLLECT-009`);
    const specimen = specimenById.get(row.record_id);
    const source = sourceById.get(row.record_id);
    assert(specimen && source, `${key} canonical record is missing`);
    const currentSpecimen = specimen[row.side] ?? null;
    const currentSource = source[row.side] ?? null;
    const otherSide = row.side === "still" ? "portrait" : "still";
    const current = {
      canonical_rows_agree: sameJson(currentSpecimen, currentSource),
      exact_null: currentSpecimen === null && currentSource === null,
      other_side: otherSide,
      other_side_present: Boolean(specimen[otherSide]?.src && source[otherSide]?.src && sameJson(specimen[otherSide], source[otherSide])),
      destination_exists: await exists(resolveInside(root, row.suggested_destination_path, `${key} destination`).absolute),
    };

    if (Object.hasOwn(SEMANTIC_ADAPTER, key)) {
      const expected = SEMANTIC_ADAPTER[key];
      assert(row.packet_generation === "normalized", `${key} is not a normalized packet`);
      assert(prior.evidence?.identity === expected.identity, `${key} identity vocabulary drifted`);
      assert(prior.evidence?.presentation === expected.presentation, `${key} presentation vocabulary drifted`);
      assert(prior.evidence?.human_second_desk === true, `${key} lacks retained human second-desk review`);
      assert(prior.evidence?.crop_pass === true, `${key} lacks retained crop passage`);
      assert(prior.evidence?.disposition === "reviewed-evidence-candidate", `${key} disposition drifted`);
      for (const field of ["candidate_hash_pass", "manifest_checksum_bound", "candidate_checksum_bound", "duplicate_screen_pass"]) {
        assert(row.custody?.[field] === true, `${key} custody ${field} is not true`);
      }
      assert(current.canonical_rows_agree && current.exact_null && current.other_side_present && !current.destination_exists, `${key} current canonical state is not adoption-safe`);

      const manifestResolved = resolveInside(root, row.manifest_path, `${key} manifest`);
      const candidateResolved = resolveInside(root, row.candidate_path, `${key} candidate`);
      const checksumResolved = resolveInside(root, row.checksum_path, `${key} checksum ledger`);
      const [manifestBytes, candidateBytes, checksumBytes] = await Promise.all([
        readFile(manifestResolved.absolute),
        readFile(candidateResolved.absolute),
        readFile(checksumResolved.absolute),
      ]);
      assert(sha256(manifestBytes) === row.manifest_sha256, `${key} manifest bytes drifted`);
      assert(sha256(candidateBytes) === row.candidate_sha256, `${key} candidate bytes drifted`);
      const sums = parseChecksums(checksumBytes.toString("utf8"), checksumResolved.safe);
      assert(sums.get(path.posix.basename(row.manifest_path)) === row.manifest_sha256, `${key} manifest is not checksum-bound`);
      assert(sums.get(path.posix.basename(row.candidate_path)) === row.candidate_sha256, `${key} candidate is not checksum-bound`);

      decisions.push({
        obligation_id: key,
        record_id: row.record_id,
        side: row.side,
        actor: row.actor,
        character: row.character,
        production: row.production ?? null,
        status: "authorized-semantic-adapter",
        semantic_adapter: {
          identity_vocabulary: expected.identity,
          presentation_vocabulary: expected.presentation,
          normalized_identity_meaning: row.side === "portrait" ? "exact expected performer" : "exact expected represented character set",
          normalized_presentation_meaning: row.side === "portrait" ? "untransformed performer portrait" : "exact character depiction or composite",
          evidence_standard_changed: false,
        },
        packet: {
          generation: row.packet_generation,
          manifest_path: row.manifest_path,
          manifest_sha256: row.manifest_sha256,
          candidate_path: row.candidate_path,
          candidate_sha256: row.candidate_sha256,
          candidate_mime: row.candidate_mime,
          checksum_path: row.checksum_path,
          human_second_desk: true,
          crop_pass: true,
          duplicate_screen_pass: true,
        },
        current,
        proposed_binding: {
          src: row.suggested_destination_path,
          kind: row.side,
          origin: row.suggested_origin,
          pin: true,
          focus: row.suggested_focus,
        },
        quality_effect: row.side === "still"
          ? { complete_pairs: 1, missing_still: -1, missing_portrait: 0, missing_both: 0 }
          : { complete_pairs: 1, missing_still: 0, missing_portrait: -1, missing_both: 0 },
      });
      continue;
    }

    assert(STRUCTURAL_BLOCKERS.includes(key), `${key} is neither in the exact adapter map nor structural blocker set`);
    assert(row.packet_generation === "batched-amortized", `${key} structural packet generation drifted`);
    assert(prior.classification === "structural-custody-repair", `${key} prior structural classification drifted`);
    assert(prior.evidence?.human_second_desk === false, `${key} unexpectedly gained human second-desk custody`);
    assert(row.custody?.duplicate_screen_pass === false, `${key} unexpectedly gained duplicate-screen passage`);
    decisions.push({
      obligation_id: key,
      record_id: row.record_id,
      side: row.side,
      actor: row.actor,
      character: row.character,
      production: row.production ?? null,
      status: "blocked-structural-custody",
      reasons: [
        "independent human second-desk review is absent",
        "crop passage is absent",
        "duplicate-screen passage is absent",
        ...(current.other_side_present ? [] : ["opposite canonical side is absent"]),
      ],
      packet: {
        generation: row.packet_generation,
        manifest_path: row.manifest_path,
        manifest_sha256: row.manifest_sha256,
        candidate_path: row.candidate_path,
        candidate_sha256: row.candidate_sha256,
        candidate_mime: row.candidate_mime,
      },
      current,
      proposed_binding: null,
    });
  }

  const authorized = decisions.filter((row) => row.status === "authorized-semantic-adapter");
  const blocked = decisions.filter((row) => row.status === "blocked-structural-custody");
  assert(authorized.length === 12 && blocked.length === 4, `semantic adapter expected 12 authorized / 4 blocked, found ${authorized.length} / ${blocked.length}`);
  assert(sameJson(authorized.map((row) => row.obligation_id).sort(), Object.keys(SEMANTIC_ADAPTER).sort()), "authorized adapter set drifted");
  assert(sameJson(blocked.map((row) => row.obligation_id).sort(), [...STRUCTURAL_BLOCKERS].sort()), "structural blocker set drifted");
  const quality = authorized.reduce((sum, row) => ({
    complete_pairs: sum.complete_pairs + row.quality_effect.complete_pairs,
    missing_still: sum.missing_still + row.quality_effect.missing_still,
    missing_portrait: sum.missing_portrait + row.quality_effect.missing_portrait,
    missing_both: sum.missing_both + row.quality_effect.missing_both,
  }), { complete_pairs: 0, missing_still: 0, missing_portrait: 0, missing_both: 0 });
  assert(sameJson(quality, { complete_pairs: 12, missing_still: -10, missing_portrait: -2, missing_both: 0 }), "adapter quality effect drifted");

  const ruling = {
    version: 1,
    transaction: "COLLECT-010",
    operation: "exact-packet-semantic-adapter-reconciliation",
    status: "authorized-with-structural-blockers",
    recorded_at: now,
    source: {
      current_head: head,
      prior_audit_path: auditDoc.safe,
      prior_audit_sha256: auditDoc.sha256,
      prior_audit_git_blob: auditDoc.git_blob,
      census_path: censusDoc.safe,
      census_sha256: censusDoc.sha256,
      census_git_blob: censusDoc.git_blob,
      ledger_path: ledgerDoc.safe,
      ledger_sha256: ledgerDoc.sha256,
      ledger_git_blob: ledgerDoc.git_blob,
      canonical_adoptions_before: 38,
      remaining_packet_review_before: 17,
    },
    correction: {
      defect: "the first classifier recognized only singular expected-subject and a narrow presentation suffix, misclassifying exact multi-subject, multi-role, voice-performance, untransformed-portrait, and character-still vocabularies as evidence failures",
      mechanism: "bind each normalized packet to its exact retained identity and presentation vocabulary rather than broadening the acceptance rule",
      evidence_standard_changed: false,
      review_authority_added: false,
      packet_evidence_rewritten: false,
      canonical_mutation: false,
    },
    denominator: {
      incompatible_packets_reviewed: 16,
      authorized_semantic_adapter: 12,
      blocked_structural_custody: 4,
      distinct_media_debt: 1,
      total_remaining_before_adoption: 17,
      expected_remaining_after_full_authorized_adoption: 5,
    },
    quality_effect_if_authorized_set_is_adopted: quality,
    authorized_obligations: authorized.map((row) => row.obligation_id),
    blocked_obligations: blocked.map((row) => ({ obligation_id: row.obligation_id, reasons: row.reasons })),
    decisions,
    boundary: {
      canonical_mutation: false,
      packet_evidence_rewritten: false,
      review_authority_fabricated: false,
      arbitrary_batch_size_used: false,
      exact_vocabulary_map_used: true,
      normalized_packet_lane_exhausted_by_ruling: true,
      next_authorized_work: "adopt all twelve authorized semantic-adapter packets as one smoke-gated evidence-sized tranche; keep four structural packets and UC-338/still visibly unpaid",
    },
  };
  const out = resolveInside(root, outPath, "COLLECT-010 output");
  await mkdir(path.dirname(out.absolute), { recursive: true });
  await writeFile(out.absolute, `${JSON.stringify(ruling, null, 2)}\n`);
  console.log(JSON.stringify({ transaction: ruling.transaction, denominator: ruling.denominator, quality_effect: quality, authorized_obligations: ruling.authorized_obligations, blocked_obligations: ruling.blocked_obligations }, null, 2));
}

main().catch(async (error) => {
  console.error(`COLLECT-010 semantic-adapter reconciliation failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
  const output = option("--out", "");
  if (output) await rm(output, { force: true }).catch(() => {});
});
