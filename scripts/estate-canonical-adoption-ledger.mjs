#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULTS = Object.freeze({
  ledger: "data/review/estate-debt/CANONICAL-ADOPTION-LEDGER.json",
  importReceipt: "data/review/estate-debt/COLLECT-002-CARD-BACKFILL-PACKET-IMPORT.json",
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function safeRelative(value, label) {
  const text = String(value || "").replaceAll("\\", "/");
  assert(text && !path.isAbsolute(text) && !text.split("/").includes(".."), `${label} must be repository-relative`);
  return text;
}
async function readJson(root, relativePath, label = relativePath) {
  const safe = safeRelative(relativePath, label);
  const bytes = await readFile(path.join(root, safe));
  try { return { path: safe, bytes, sha256: sha256(bytes), value: JSON.parse(bytes.toString("utf8")) }; }
  catch (error) { fail(`cannot parse ${safe}: ${error.message}`); }
}
function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a value`);
  return value;
}
function exactRow(rows, id, label) {
  const matches = rows.filter((row) => row?.id === id);
  assert(matches.length === 1, `${label} must contain exactly one ${id} row; found ${matches.length}`);
  return matches[0];
}
function sameJson(left, right) { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }

export async function validateCanonicalAdoptionLedger({
  root = process.cwd(),
  ledgerPath = DEFAULTS.ledger,
  importReceiptPath = DEFAULTS.importReceipt,
  specimensPath = DEFAULTS.specimens,
  sourcesPath = DEFAULTS.sources,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const [ledgerDoc, importDoc, specimensDoc, sourcesDoc] = await Promise.all([
    readJson(resolvedRoot, ledgerPath, "canonical adoption ledger"),
    readJson(resolvedRoot, importReceiptPath, "packet import receipt"),
    readJson(resolvedRoot, specimensPath, "specimens"),
    readJson(resolvedRoot, sourcesPath, "SOURCES"),
  ]);
  const ledger = ledgerDoc.value;
  const imported = importDoc.value;
  assert(ledger.version === 1 && ledger.operation === "cumulative-canonical-adoption-ledger", "unsupported canonical adoption ledger");
  assert(imported.transaction === "COLLECT-002" && imported.boundaries?.canonical_mutation === false, "packet import receipt is not evidence-only COLLECT-002");
  assert(Array.isArray(imported.packets), "packet import receipt lacks packets[]");
  assert(Array.isArray(ledger.batches) && ledger.batches.length > 0, "canonical adoption ledger lacks paid batches");
  assert(Array.isArray(ledger.adopted_obligations), "canonical adoption ledger lacks adopted_obligations[]");
  assert(Array.isArray(specimensDoc.value) && Array.isArray(sourcesDoc.value), "canonical source files must be arrays");

  const importedDenominator = imported.counts?.packets;
  assert(importedDenominator === ledger.source_estate?.imported_packet_denominator, "imported packet denominator drifted");
  assert(imported.source?.head_sha === ledger.source_estate?.source_head, "imported packet source head drifted");
  const importedObligations = new Set(imported.packets.map((row) => row.obligation_id));
  assert(importedObligations.size === importedDenominator, "packet import receipt contains duplicate obligations");

  const batchKeys = new Set();
  const receiptAdoptions = new Map();
  let batchCount = 0;
  let batchStills = 0;
  let batchPortraits = 0;
  let visitorImprovements = 0;
  const batchSummaries = [];
  for (const batch of ledger.batches) {
    const batchKey = `${batch.transaction}/${batch.batch}`;
    assert(!batchKeys.has(batchKey), `duplicate adoption batch ${batchKey}`);
    batchKeys.add(batchKey);
    assert(batch.status === "paid", `${batchKey} is not paid`);
    assert(Array.isArray(batch.obligations), `${batchKey} lacks obligations[]`);
    assert(batch.adoption_count === batch.obligations.length, `${batchKey} adoption count drifted`);
    const receiptDoc = await readJson(resolvedRoot, batch.receipt, `${batchKey} receipt`);
    const receipt = receiptDoc.value;
    assert(receipt.status === "paid", `${batchKey} receipt is not paid`);
    assert(receipt.transaction === batch.transaction, `${batchKey} receipt transaction drifted`);
    assert(receipt.authorization?.workflow_run === batch.workflow_run, `${batchKey} workflow run drifted`);
    assert(receipt.authorization?.authorized_parent === batch.authorized_parent, `${batchKey} authorized parent drifted`);
    assert(receipt.authorization?.gated_tree === batch.gated_tree, `${batchKey} gated tree drifted`);
    assert(receipt.counts?.canonical_adoptions === batch.adoption_count, `${batchKey} receipt count drifted`);
    assert(Array.isArray(receipt.adoptions), `${batchKey} receipt lacks adoptions[]`);
    const receiptKeys = receipt.adoptions.map((row) => `${row.record_id}/${row.side}`).sort();
    const batchObligations = [...batch.obligations].sort();
    assert(sameJson(receiptKeys, batchObligations), `${batchKey} receipt obligation set drifted`);
    for (const row of receipt.adoptions) {
      const obligationId = `${row.record_id}/${row.side}`;
      assert(!receiptAdoptions.has(obligationId), `obligation ${obligationId} appears in multiple paid receipts`);
      receiptAdoptions.set(obligationId, { batch, receipt: row });
      if (row.side === "still") batchStills++;
      else if (row.side === "portrait") batchPortraits++;
      else fail(`${obligationId} has unsupported side`);
    }
    batchCount += batch.adoption_count;
    visitorImprovements += receipt.boundary?.visitor_visible_media_improvements || 0;
    batchSummaries.push({
      transaction: batch.transaction,
      batch: batch.batch,
      receipt: receiptDoc.path,
      receipt_sha256: receiptDoc.sha256,
      adoptions: batch.adoption_count,
      workflow_run: batch.workflow_run,
      published_head: batch.published_head,
    });
  }

  const adoptedKeys = new Set();
  for (const row of ledger.adopted_obligations) {
    const obligationId = row.obligation_id;
    assert(/^UC-\d+\/(still|portrait)$/.test(obligationId || ""), `invalid adopted obligation ${obligationId}`);
    assert(!adoptedKeys.has(obligationId), `duplicate cumulative adoption ${obligationId}`);
    adoptedKeys.add(obligationId);
    assert(importedObligations.has(obligationId), `${obligationId} was not imported by COLLECT-002`);
    const paid = receiptAdoptions.get(obligationId);
    assert(paid, `${obligationId} lacks a paid batch receipt`);
    assert(paid.batch.transaction === row.transaction && paid.batch.batch === row.batch, `${obligationId} batch custody drifted`);
    assert(paid.receipt.canonical_path === row.canonical_path, `${obligationId} canonical path drifted`);
    assert(paid.receipt.canonical_sha256 === row.canonical_sha256, `${obligationId} canonical hash drifted`);
    assert(/^[0-9a-f]{64}$/.test(row.canonical_sha256 || ""), `${obligationId} canonical hash is malformed`);
    const canonicalPath = safeRelative(row.canonical_path, `${obligationId} canonical path`);
    const imageBytes = await readFile(path.join(resolvedRoot, canonicalPath));
    assert(sha256(imageBytes) === row.canonical_sha256, `${obligationId} canonical bytes drifted`);
    const [recordId, side] = obligationId.split("/");
    const specimen = exactRow(specimensDoc.value, recordId, "specimens");
    const source = exactRow(sourcesDoc.value, recordId, "SOURCES");
    assert(specimen[side]?.src === canonicalPath, `${obligationId} specimen does not bind its versioned canonical path`);
    assert(source[side]?.src === canonicalPath, `${obligationId} source ledger does not bind its versioned canonical path`);
    assert(sameJson(specimen[side], source[side]), `${obligationId} specimen and source bindings differ`);
  }

  assert(adoptedKeys.size === receiptAdoptions.size, "cumulative adopted-obligation set differs from paid receipts");
  assert(batchCount === adoptedKeys.size, "batch adoption total differs from unique cumulative adoptions");
  const expectedRemaining = importedDenominator - adoptedKeys.size;
  assert(ledger.cumulative?.canonical_adoptions === adoptedKeys.size, "cumulative canonical adoption count drifted");
  assert(ledger.cumulative?.remaining_for_canonical_review === expectedRemaining, "cumulative remaining count drifted");
  assert(ledger.cumulative?.stills === batchStills, "cumulative still count drifted");
  assert(ledger.cumulative?.portraits === batchPortraits, "cumulative portrait count drifted");
  assert(ledger.cumulative?.visitor_visible_media_improvements === visitorImprovements, "visitor improvement count drifted");
  assert(ledger.next_batch_contract?.prior_canonical_adoptions === adoptedKeys.size, "next-batch prior count drifted");
  assert(ledger.next_batch_contract?.expected_cumulative_after_full_batch === adoptedKeys.size + ledger.next_batch_contract.maximum_new_adoptions, "next-batch cumulative target drifted");
  assert(ledger.next_batch_contract?.expected_remaining_after_full_batch === expectedRemaining - ledger.next_batch_contract.maximum_new_adoptions, "next-batch remaining target drifted");

  return {
    state: "valid",
    ledger_path: ledgerDoc.path,
    ledger_sha256: ledgerDoc.sha256,
    imported_packets: importedDenominator,
    paid_batches: ledger.batches.length,
    canonical_adoptions: adoptedKeys.size,
    remaining_for_canonical_review: expectedRemaining,
    stills: batchStills,
    portraits: batchPortraits,
    visitor_visible_media_improvements: visitorImprovements,
    batches: batchSummaries,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const result = await validateCanonicalAdoptionLedger({
    root: option(argv, "--root", "."),
    ledgerPath: option(argv, "--ledger", DEFAULTS.ledger),
    importReceiptPath: option(argv, "--packet-import-receipt", DEFAULTS.importReceipt),
    specimensPath: option(argv, "--specimens", DEFAULTS.specimens),
    sourcesPath: option(argv, "--sources", DEFAULTS.sources),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`canonical adoption ledger validation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
