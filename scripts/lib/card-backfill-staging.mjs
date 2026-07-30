import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

export const CARD_BACKFILL_STAGING_VERSION = 1;

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) { return JSON.stringify(canonicalValue(value)); }
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
export async function hashFile(path) { return sha256(await readFile(path)); }

async function exists(path) {
  try { await stat(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function atomicWriteBytes(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tmp, bytes);
  await rename(tmp, path);
}

async function atomicWriteJson(path, value) {
  await atomicWriteBytes(path, JSON.stringify(value, null, 2) + "\n");
}

function safePacketPath(root, name) {
  if (!name || name.startsWith("/") || name.split(/[\\/]/).includes("..")) throw new Error(`unsafe packet path ${JSON.stringify(name)}`);
  const absolute = resolve(root, name);
  const rel = relative(resolve(root), absolute);
  if (!rel || rel.startsWith(`..${sep}`) || rel === "..") throw new Error(`packet path escapes root: ${name}`);
  return absolute;
}

function parseChecksumLedger(text) {
  const rows = new Map();
  for (const [index, line] of String(text).split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const match = line.match(/^([0-9a-f]{64})\s{2}(.+)$/i);
    if (!match) throw new Error(`invalid checksum ledger line ${index + 1}`);
    if (rows.has(match[2])) throw new Error(`duplicate checksum ledger path ${match[2]}`);
    rows.set(match[2], match[1].toLowerCase());
  }
  return rows;
}

export async function writeChecksumLedger(root, names) {
  const lines = [];
  for (const name of [...new Set(names)].sort()) lines.push(`${await hashFile(safePacketPath(root, name))}  ${name}`);
  const text = lines.join("\n") + (lines.length ? "\n" : "");
  const path = join(root, "checksums.sha256");
  await writeFile(path, text);
  return { path, sha256: sha256(Buffer.from(text)), count: lines.length };
}

export async function validateAcceptedPacket(packetDir) {
  const required = ["scope.json", "source-receipt.json", "review.json", "review.md", "adjudication-receipt.json", "manifest.json", "checksums.sha256"];
  for (const name of required) if (!(await exists(join(packetDir, name)))) throw new Error(`accepted packet missing ${name}: ${packetDir}`);

  const [scope, sourceReceipt, review, adjudication, manifest, checksumText] = await Promise.all([
    readFile(join(packetDir, "scope.json"), "utf8").then(JSON.parse),
    readFile(join(packetDir, "source-receipt.json"), "utf8").then(JSON.parse),
    readFile(join(packetDir, "review.json"), "utf8").then(JSON.parse),
    readFile(join(packetDir, "adjudication-receipt.json"), "utf8").then(JSON.parse),
    readFile(join(packetDir, "manifest.json"), "utf8").then(JSON.parse),
    readFile(join(packetDir, "checksums.sha256"), "utf8"),
  ]);

  const recordId = review.record_id;
  const side = review.side;
  if (!recordId || !["still", "portrait"].includes(side)) throw new Error(`accepted packet identity invalid: ${packetDir}`);
  if (scope.record_id !== recordId || scope.side !== side) throw new Error(`scope identity drift for ${recordId}/${side}`);
  if (sourceReceipt.record_id !== recordId || sourceReceipt.side !== side) throw new Error(`source receipt identity drift for ${recordId}/${side}`);
  if (adjudication.record_id !== recordId || adjudication.side !== side) throw new Error(`adjudication identity drift for ${recordId}/${side}`);
  if (manifest.record_id !== recordId || manifest.side !== side) throw new Error(`manifest identity drift for ${recordId}/${side}`);
  if (review.disposition !== "reviewed-evidence-candidate" || manifest.disposition !== "reviewed-evidence-candidate") throw new Error(`packet is not accepted: ${recordId}/${side}`);
  if (review.visual_adjudication?.status !== "accepted" || review.visual_adjudication?.independent_from_discovery !== true) throw new Error(`packet lacks independent accepted adjudication: ${recordId}/${side}`);
  if (review.permanent_evidence_publication_candidate !== true) throw new Error(`packet not marked for evidence publication: ${recordId}/${side}`);
  if (adjudication.disposition !== "accept" || adjudication.identity !== "expected") throw new Error(`adjudication acceptance drift: ${recordId}/${side}`);
  const expectedPresentation = side === "still" ? "character-depiction" : "neutral-human";
  if (adjudication.presentation !== expectedPresentation) throw new Error(`adjudication presentation drift: ${recordId}/${side}`);
  for (const row of [scope, sourceReceipt, review, adjudication, manifest]) if (row.canonical_mutation !== false) throw new Error(`canonical mutation drift: ${recordId}/${side}`);

  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error(`manifest file list missing: ${recordId}/${side}`);
  const manifestPaths = new Set();
  for (const item of manifest.files) {
    if (!item?.path || !/^[0-9a-f]{64}$/i.test(item.sha256 || "") || !Number.isInteger(item.bytes)) throw new Error(`invalid manifest item: ${recordId}/${side}`);
    if (manifestPaths.has(item.path)) throw new Error(`duplicate manifest item ${item.path}: ${recordId}/${side}`);
    manifestPaths.add(item.path);
    const path = safePacketPath(packetDir, item.path);
    const fileStat = await stat(path);
    if (!fileStat.isFile() || fileStat.size !== item.bytes) throw new Error(`manifest byte drift ${item.path}: ${recordId}/${side}`);
    if (await hashFile(path) !== item.sha256) throw new Error(`manifest hash drift ${item.path}: ${recordId}/${side}`);
  }
  const packetSha = sha256(canonicalJson(manifest.files));
  if (manifest.packet_sha256 !== packetSha) throw new Error(`packet digest drift: ${recordId}/${side}`);

  const checksumRows = parseChecksumLedger(checksumText);
  const expectedChecksumPaths = new Set([...manifestPaths, "manifest.json"]);
  if (checksumRows.size !== expectedChecksumPaths.size) throw new Error(`checksum cardinality drift: ${recordId}/${side}`);
  for (const name of expectedChecksumPaths) {
    if (!checksumRows.has(name)) throw new Error(`checksum missing ${name}: ${recordId}/${side}`);
    if (await hashFile(safePacketPath(packetDir, name)) !== checksumRows.get(name)) throw new Error(`checksum drift ${name}: ${recordId}/${side}`);
  }

  const source = review.selected_source || null;
  const render = review.render_result || null;
  return {
    obligation_id: `${recordId}/${side}`,
    record_id: recordId,
    side,
    expected_subject: review.expected_subject || sourceReceipt.expected_subject || null,
    campaign_id: review.campaign_id,
    estate_sha256: review.estate_sha256,
    discovery_batch_sha256: review.batch_sha256,
    cohort_key: review.cohort_key,
    packet_sha256: manifest.packet_sha256,
    checksum_ledger_sha256: sha256(Buffer.from(checksumText)),
    adjudication_receipt_sha256: await hashFile(join(packetDir, "adjudication-receipt.json")),
    selected_source_sha256: source?.sha256 || null,
    rendered_candidate_sha256: render?.candidate?.sha256 || null,
    wall_crop_sha256: render?.wall_crop?.sha256 || null,
    adjudicator: review.visual_adjudication?.adjudicator || null,
    packet_path: `packets/${recordId}`,
  };
}

export function emptyStagingLedger(campaignId = null) {
  return {
    version: CARD_BACKFILL_STAGING_VERSION,
    lane: "card-backfill-staging",
    campaign_id: campaignId,
    updated_at: null,
    counts: { staged: 0, cohorts: 0, discovery_batches: 0 },
    entries: [],
    ledger_sha256: sha256(canonicalJson([])),
    canonical_mutation: false,
  };
}

export function computeLedgerSha(entries) {
  return sha256(canonicalJson(entries.map((entry) => ({
    obligation_id: entry.obligation_id,
    packet_sha256: entry.packet_sha256,
    discovery_batch_sha256: entry.discovery_batch_sha256,
    cohort_key: entry.cohort_key,
    staged_at: entry.staged_at,
  }))));
}

export function normalizeLedger(ledger) {
  const entries = [...(ledger.entries || [])].sort((a, b) => String(a.staged_at).localeCompare(String(b.staged_at)) || a.obligation_id.localeCompare(b.obligation_id, undefined, { numeric: true }));
  return {
    ...ledger,
    version: CARD_BACKFILL_STAGING_VERSION,
    lane: "card-backfill-staging",
    counts: {
      staged: entries.length,
      cohorts: new Set(entries.map((entry) => entry.cohort_key)).size,
      discovery_batches: new Set(entries.map((entry) => entry.discovery_batch_sha256)).size,
    },
    entries,
    ledger_sha256: computeLedgerSha(entries),
    canonical_mutation: false,
  };
}

export function validateLedgerShape(ledger) {
  if (ledger.version !== CARD_BACKFILL_STAGING_VERSION || ledger.lane !== "card-backfill-staging") throw new Error("invalid staging ledger identity");
  if (!Array.isArray(ledger.entries)) throw new Error("staging ledger entries missing");
  if (ledger.canonical_mutation !== false) throw new Error("staging canonical mutation drift");
  const obligations = new Set(), records = new Set();
  for (const entry of ledger.entries) {
    if (!entry.obligation_id || !entry.record_id || !entry.packet_sha256) throw new Error("staging entry identity incomplete");
    if (obligations.has(entry.obligation_id)) throw new Error(`duplicate staged obligation ${entry.obligation_id}`);
    if (records.has(entry.record_id)) throw new Error(`duplicate staged record ${entry.record_id}`);
    obligations.add(entry.obligation_id); records.add(entry.record_id);
  }
  if (ledger.ledger_sha256 !== computeLedgerSha([...ledger.entries].sort((a, b) => String(a.staged_at).localeCompare(String(b.staged_at)) || a.obligation_id.localeCompare(b.obligation_id, undefined, { numeric: true })))) throw new Error("staging ledger digest drift");
}

export async function readStagingLedger(root) {
  const path = join(root, "STAGING.json");
  if (!(await exists(path))) return emptyStagingLedger();
  const ledger = JSON.parse(await readFile(path, "utf8"));
  validateLedgerShape(ledger);
  return ledger;
}

export async function readAdjudicationAttemptIndex(root, campaignId = null) {
  const adjudicationRoot = join(root, "adjudications");
  let names = [];
  try { names = (await readdir(adjudicationRoot, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name).sort(); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const attempts = new Map();
  const receipts = [];
  for (const name of names) {
    const receiptPath = join(adjudicationRoot, name);
    const bytes = await readFile(receiptPath);
    const receipt = JSON.parse(bytes);
    if (receipt.version !== 1 || receipt.lane !== "card-backfill-adjudication" || receipt.canonical_mutation !== false) throw new Error(`invalid staging adjudication receipt ${name}`);
    if (campaignId && receipt.campaign_id !== campaignId) throw new Error(`adjudication campaign drift ${name}: ${receipt.campaign_id} vs ${campaignId}`);
    if (receipt.result_sha256 !== sha256(canonicalJson(receipt.results || []))) throw new Error(`adjudication result digest drift ${name}`);
    if (`${receipt.batch_sha256}.json` !== name) throw new Error(`adjudication receipt filename drift ${name}`);
    const receiptRow = {
      discovery_batch_sha256: receipt.batch_sha256,
      cohort_key: receipt.cohort_key,
      generated_at: receipt.generated_at || null,
      receipt_path: `adjudications/${name}`,
      receipt_sha256: sha256(bytes),
      result_sha256: receipt.result_sha256,
      result_count: (receipt.results || []).length,
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
  const entries = [...attempts.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([obligationId, rows]) => ({ obligation_id: obligationId, attempts: rows }));
  return {
    version: 1,
    lane: "card-backfill-adjudication-attempt-index",
    campaign_id: campaignId,
    receipt_count: receipts.length,
    attempted_count: entries.length,
    receipts,
    entries,
    index_sha256: sha256(canonicalJson({ receipts, entries })),
    canonical_mutation: false,
  };
}

export async function validateStaging({ root, permanentRoot = null }) {
  const ledger = await readStagingLedger(root);
  const packetRoot = join(root, "packets");
  const seen = new Set();
  for (const entry of ledger.entries) {
    const dir = join(packetRoot, entry.record_id);
    const packet = await validateAcceptedPacket(dir);
    if (packet.obligation_id !== entry.obligation_id || packet.packet_sha256 !== entry.packet_sha256 || packet.checksum_ledger_sha256 !== entry.checksum_ledger_sha256) throw new Error(`staged packet custody drift ${entry.obligation_id}`);
    if (permanentRoot && await exists(join(permanentRoot, entry.record_id))) throw new Error(`staged record already permanent ${entry.record_id}`);
    seen.add(entry.record_id);
  }
  let directories = [];
  try { directories = (await readdir(packetRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name); } catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const name of directories) if (!seen.has(name)) throw new Error(`orphan staged packet ${name}`);
  if (directories.length !== ledger.entries.length) throw new Error("staging packet/ledger cardinality drift");
  return ledger;
}

export async function stageAcceptedRun({ input, root, permanentRoot, now = new Date().toISOString() }) {
  const receiptPath = join(input, "adjudication-run-receipt.json");
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  if (receipt.version !== 1 || receipt.lane !== "card-backfill-adjudication") throw new Error("invalid adjudication run receipt");
  if (receipt.canonical_mutation !== false) throw new Error("adjudication run canonical mutation drift");
  const acceptedRows = (receipt.results || []).filter((row) => row.final_disposition === "reviewed-evidence-candidate");
  if (acceptedRows.length !== receipt.counts?.accepted) throw new Error("adjudication accepted count drift");

  let ledger = await readStagingLedger(root);
  if (ledger.campaign_id && ledger.campaign_id !== receipt.campaign_id) throw new Error(`staging campaign drift: ${ledger.campaign_id} vs ${receipt.campaign_id}`);
  const existingByRecord = new Map(ledger.entries.map((entry) => [entry.record_id, entry]));
  const added = [], alreadyStaged = [], copied = [], written = [];
  await mkdir(join(root, "packets"), { recursive: true });

  try {
    for (const row of acceptedRows) {
      const sourceDir = join(input, row.final_packet_path);
      const packet = await validateAcceptedPacket(sourceDir);
      if (packet.record_id !== row.record_id || packet.side !== row.side || packet.packet_sha256 !== row.final_packet_sha256) throw new Error(`adjudication receipt packet drift ${row.record_id}/${row.side}`);
      if (packet.campaign_id !== receipt.campaign_id || packet.estate_sha256 !== receipt.estate_sha256 || packet.discovery_batch_sha256 !== receipt.batch_sha256 || packet.cohort_key !== receipt.cohort_key) throw new Error(`adjudication packet campaign custody drift ${row.record_id}/${row.side}`);
      if (await exists(join(permanentRoot, packet.record_id))) throw new Error(`refusing to stage existing permanent record ${packet.record_id}`);
      const prior = existingByRecord.get(packet.record_id);
      if (prior) {
        if (prior.obligation_id === packet.obligation_id && prior.packet_sha256 === packet.packet_sha256) { alreadyStaged.push(prior); continue; }
        throw new Error(`staged record collision ${packet.record_id}`);
      }
      const destination = join(root, "packets", packet.record_id);
      if (await exists(destination)) throw new Error(`unledgered staging destination exists ${packet.record_id}`);
      await cp(sourceDir, destination, { recursive: true, errorOnExist: true, force: false });
      copied.push(destination);
      const entry = {
        ...packet,
        staged_at: now,
        source: receipt.source || null,
        adjudication_run_sha256: receipt.result_sha256,
        canonical_mutation: false,
      };
      added.push(entry); existingByRecord.set(packet.record_id, entry);
    }

    ledger = normalizeLedger({ ...ledger, campaign_id: ledger.campaign_id || receipt.campaign_id, updated_at: now, entries: [...ledger.entries, ...added] });
    const adjudicationReceiptPath = join(root, "adjudications", `${receipt.batch_sha256}.json`);
    let adjudicationReceiptAdded = false;
    if (await exists(adjudicationReceiptPath)) {
      const priorBytes = await readFile(adjudicationReceiptPath);
      if (sha256(priorBytes) !== sha256(await readFile(receiptPath))) throw new Error(`adjudication receipt collision ${receipt.batch_sha256}`);
    } else {
      await mkdir(dirname(adjudicationReceiptPath), { recursive: true });
      await cp(receiptPath, adjudicationReceiptPath);
      written.push(adjudicationReceiptPath);
      adjudicationReceiptAdded = true;
    }

    if (!added.length && !adjudicationReceiptAdded) return { ledger, event: null, added, already_staged: alreadyStaged };

    const eventBase = {
      version: 1,
      lane: "card-backfill-staging-event",
      event: "accepted-packets-staged",
      campaign_id: receipt.campaign_id,
      source: receipt.source || null,
      adjudication_batch_sha256: receipt.batch_sha256,
      adjudication_result_sha256: receipt.result_sha256,
      staged_at: now,
      counts: receipt.counts,
      adjudication_receipt_path: `adjudications/${receipt.batch_sha256}.json`,
      adjudication_receipt_sha256: sha256(await readFile(receiptPath)),
      added: added.map((entry) => ({ obligation_id: entry.obligation_id, packet_sha256: entry.packet_sha256 })),
      already_staged: alreadyStaged.map((entry) => ({ obligation_id: entry.obligation_id, packet_sha256: entry.packet_sha256 })),
      ledger_sha256: ledger.ledger_sha256,
      canonical_mutation: false,
    };
    const eventSha = sha256(canonicalJson(eventBase));
    const event = { ...eventBase, event_sha256: eventSha };
    const eventPath = join(root, "events", `${eventSha}.json`);
    await atomicWriteJson(eventPath, event);
    written.push(eventPath);
    await atomicWriteJson(join(root, "STAGING.json"), ledger);
    return { ledger, event, added, already_staged: alreadyStaged };
  } catch (error) {
    for (const path of written.reverse()) await rm(path, { force: true }).catch(() => {});
    for (const path of copied.reverse()) await rm(path, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export function buildPublicationPlan({ ledger, control, now = new Date().toISOString(), limit = null }) {
  validateLedgerShape(ledger);
  const minimum = Number(control.staging?.minimum_publication_batch ?? control.batch?.minimum ?? 20);
  const target = Number(control.staging?.target_publication_batch ?? control.batch?.target ?? 40);
  const maximum = Number(control.staging?.maximum_publication_batch ?? control.batch?.maximum ?? 50);
  if (minimum !== 20 || target !== 40 || maximum !== 50) throw new Error("publication policy must remain 20/40/50");
  let ceiling = target;
  if (limit !== null) {
    ceiling = Number(limit);
    if (!Number.isInteger(ceiling) || ceiling < minimum || ceiling > maximum) throw new Error(`publication limit must be ${minimum}-${maximum}`);
  }
  ceiling = Math.min(ceiling, maximum);
  const ordered = [...ledger.entries].sort((a, b) => String(a.staged_at).localeCompare(String(b.staged_at)) || a.obligation_id.localeCompare(b.obligation_id, undefined, { numeric: true }));
  const ready = ordered.length >= minimum;
  const selected = ready ? ordered.slice(0, Math.min(ordered.length, ceiling)) : [];
  const cohortCounts = Object.fromEntries([...new Set(selected.map((entry) => entry.cohort_key))].sort().map((key) => [key, selected.filter((entry) => entry.cohort_key === key).length]));
  const discoveryBatchCounts = Object.fromEntries([...new Set(selected.map((entry) => entry.discovery_batch_sha256))].sort().map((key) => [key, selected.filter((entry) => entry.discovery_batch_sha256 === key).length]));
  const digestInput = {
    campaign_id: ledger.campaign_id,
    source_ledger_sha256: ledger.ledger_sha256,
    selected: selected.map((entry) => ({ obligation_id: entry.obligation_id, packet_sha256: entry.packet_sha256, discovery_batch_sha256: entry.discovery_batch_sha256, cohort_key: entry.cohort_key })),
  };
  const publicationBatchSha = ready ? sha256(canonicalJson(digestInput)) : null;
  return {
    version: 1,
    lane: "card-backfill-publication-plan",
    generated_at: now,
    campaign_id: ledger.campaign_id,
    source_ledger_sha256: ledger.ledger_sha256,
    policy: { minimum, target, maximum, requested_limit: limit === null ? null : Number(limit) },
    staged_count: ordered.length,
    ready,
    selected_count: selected.length,
    remaining_after_publication: ordered.length - selected.length,
    cohort_counts: cohortCounts,
    discovery_batch_counts: discoveryBatchCounts,
    selected,
    publication_batch_sha256: publicationBatchSha,
    canonical_mutation: false,
  };
}

export async function materializePublicationPlan({ plan, root, destination, now = new Date().toISOString() }) {
  if (plan.version !== 1 || plan.lane !== "card-backfill-publication-plan" || plan.ready !== true) throw new Error("publication plan is not ready");
  if (plan.selected_count < 20 || plan.selected_count > 50 || plan.selected_count !== plan.selected?.length) throw new Error(`publication batch must contain 20-50 packets; observed ${plan.selected_count}`);
  const ledgerPath = join(root, "STAGING.json");
  const originalLedgerBytes = await readFile(ledgerPath);
  const ledger = await validateStaging({ root, permanentRoot: destination });
  if (ledger.ledger_sha256 !== plan.source_ledger_sha256) throw new Error("publication source ledger drift");
  const recomputed = buildPublicationPlan({ ledger, control: { batch: { minimum: 20, target: 40, maximum: 50 }, staging: { minimum_publication_batch: 20, target_publication_batch: 40, maximum_publication_batch: 50 } }, now: plan.generated_at, limit: plan.policy?.requested_limit });
  if (recomputed.publication_batch_sha256 !== plan.publication_batch_sha256 || canonicalJson(recomputed.selected) !== canonicalJson(plan.selected)) throw new Error("publication plan digest drift");

  const byObligation = new Map(ledger.entries.map((entry) => [entry.obligation_id, entry]));
  const copied = [], removed = [], written = [];
  const batchDir = join(destination, "batches");
  const permanentReceiptPath = join(batchDir, `${plan.publication_batch_sha256}.json`);
  const stagingReceiptPath = join(root, "publications", `${plan.publication_batch_sha256}.json`);
  if (await exists(permanentReceiptPath) || await exists(stagingReceiptPath)) throw new Error(`publication receipt already exists ${plan.publication_batch_sha256}`);

  try {
    await mkdir(destination, { recursive: true });
    for (const selected of plan.selected) {
      const entry = byObligation.get(selected.obligation_id);
      if (!entry || entry.packet_sha256 !== selected.packet_sha256) throw new Error(`selected staging entry drift ${selected.obligation_id}`);
      const sourceDir = join(root, entry.packet_path);
      const packet = await validateAcceptedPacket(sourceDir);
      if (packet.packet_sha256 !== entry.packet_sha256) throw new Error(`selected packet drift ${selected.obligation_id}`);
      const target = join(destination, entry.record_id);
      if (await exists(target)) throw new Error(`refusing to overwrite permanent packet ${entry.record_id}`);
      await cp(sourceDir, target, { recursive: true, errorOnExist: true, force: false });
      copied.push(target);
    }

    const permanentReceipt = {
      version: 1,
      lane: "card-backfill-permanent-evidence-batch",
      generated_at: now,
      campaign_id: plan.campaign_id,
      publication_batch_sha256: plan.publication_batch_sha256,
      source_ledger_sha256: plan.source_ledger_sha256,
      counts: { materialized: plan.selected_count, cohorts: Object.keys(plan.cohort_counts).length, discovery_batches: Object.keys(plan.discovery_batch_counts).length },
      cohort_counts: plan.cohort_counts,
      discovery_batch_counts: plan.discovery_batch_counts,
      estate_snapshot_counts: Object.fromEntries([...new Set(plan.selected.map((entry) => entry.estate_sha256))].sort().map((key) => [key, plan.selected.filter((entry) => entry.estate_sha256 === key).length])),
      materialized_packets: plan.selected.map((entry) => ({ obligation_id: entry.obligation_id, record_id: entry.record_id, side: entry.side, packet_sha256: entry.packet_sha256, estate_sha256: entry.estate_sha256, discovery_batch_sha256: entry.discovery_batch_sha256, cohort_key: entry.cohort_key })),
      complete_repository_gate_required_before_commit: true,
      canonical_mutation: false,
    };
    await atomicWriteJson(permanentReceiptPath, permanentReceipt); written.push(permanentReceiptPath);
    await atomicWriteJson(stagingReceiptPath, { ...permanentReceipt, lane: "card-backfill-staging-publication-receipt", staged_packet_paths_removed: plan.selected.map((entry) => entry.packet_path) }); written.push(stagingReceiptPath);

    const selectedObligations = new Set(plan.selected.map((entry) => entry.obligation_id));
    const nextLedger = normalizeLedger({ ...ledger, updated_at: now, entries: ledger.entries.filter((entry) => !selectedObligations.has(entry.obligation_id)) });
    await atomicWriteJson(ledgerPath, nextLedger);

    for (const selected of plan.selected) {
      const entry = byObligation.get(selected.obligation_id);
      const sourceDir = join(root, entry.packet_path);
      await rm(sourceDir, { recursive: true, force: false });
      removed.push({ sourceDir, target: join(destination, entry.record_id) });
    }

    return { permanent_receipt: permanentReceipt, staging_ledger: nextLedger };
  } catch (error) {
    for (const item of removed.reverse()) if (!(await exists(item.sourceDir)) && await exists(item.target)) await cp(item.target, item.sourceDir, { recursive: true }).catch(() => {});
    await atomicWriteBytes(ledgerPath, originalLedgerBytes).catch(() => {});
    for (const path of written.reverse()) await rm(path, { force: true }).catch(() => {});
    for (const path of copied.reverse()) await rm(path, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
