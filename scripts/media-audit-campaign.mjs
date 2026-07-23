#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MEDIA_AUDIT_VERSION,
  applyVotes,
  copyJson,
  deriveItem,
  normalize,
  sha256,
  stableJson,
  summarize,
  validateState,
} from "./lib/media-audit.mjs";

const DEFAULT_STATE = "data/MEDIA-AUDIT.json";
const DEFAULT_SPECIMENS = "data/specimens.json";
const DEFAULT_SOURCES = "data/SOURCES.json";
const DEFAULT_MEDIA_MANIFEST = "data/media-manifest.json";
const DEFAULT_SCOPES = "data/MEDIA-AUDIT-SCOPES.json";
const DEFAULT_AUDIT_JOURNAL = "data/journal/media-audit.jsonl";
const DEFAULT_REMEDIATION_JOURNAL = "data/journal/media-remediation.jsonl";
const DEFAULT_LOCK = "data/MEDIA-AUDIT.lock";

function parseArgs(argv) {
  const args = [...argv];
  const options = new Map();
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (!value.startsWith("--")) throw new Error(`unexpected argument ${value}`);
    const name = value.slice(2);
    const next = args[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`--${name} requires a value`);
    options.set(name, next);
    index++;
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const option = (name, fallback = null) => options.has(name) ? options.get(name) : fallback;
const root = resolve(option("root", "."));
const rooted = (path) => {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (!path || rel.startsWith("..") || rel.startsWith("/") || rel === "") throw new Error(`unsafe campaign path ${path}`);
  return absolute;
};

function requireString(value, label) {
  if (!String(value || "").trim()) throw new Error(`${label} is required`);
  return String(value).trim();
}

function requireIso(value, label) {
  if (!Number.isFinite(Date.parse(value || ""))) throw new Error(`${label} must be an ISO timestamp`);
  return String(value);
}

function requireSha(value, label) {
  if (!/^[0-9a-f]{64}$/i.test(value || "")) throw new Error(`${label} must be a SHA-256`);
  return String(value).toLowerCase();
}

function requireEvidence(value, label) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must be a non-empty evidence array`);
  return value.map((row, index) => ({
    type: requireString(row?.type, `${label}[${index}].type`),
    value: requireString(row?.value, `${label}[${index}].value`),
  }));
}

async function readJsonBytes(path) {
  let bytes;
  try { bytes = await readFile(path); }
  catch (error) {
    const wrapped = new Error(`cannot read ${path}: ${error.message}`);
    wrapped.code = error.code;
    throw wrapped;
  }
  try { return { bytes, value: JSON.parse(bytes) }; }
  catch (error) { throw new Error(`cannot parse ${path}: ${error.message}`); }
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function sourceKey(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value || "").trim();
  }
}

function safeAssetPath(src) {
  const absolute = resolve(root, src);
  const rel = relative(root, absolute);
  if (!src || rel.startsWith("..") || rel.startsWith("/") || rel === "") throw new Error(`unsafe media asset path ${src}`);
  return absolute;
}

function eventLines(events, prefix) {
  return events.map((entry) => {
    const body = { ...entry };
    const id = `${prefix}_${sha256(stableJson(body)).slice(0, 24)}`;
    return JSON.stringify({ id, ...body });
  }).join("\n") + (events.length ? "\n" : "");
}

async function journalAppendBytes(path, events, prefix) {
  let original;
  try { original = await readFile(path); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    original = Buffer.alloc(0);
  }
  return Buffer.concat([original, Buffer.from(eventLines(events, prefix))]);
}

async function atomicWriteTransaction(writes) {
  const unique = new Set();
  const prepared = [];
  try {
    for (const [index, write] of writes.entries()) {
      if (!write?.path || unique.has(write.path)) throw new Error(`campaign transaction has duplicate or missing path ${write?.path || "<missing>"}`);
      unique.add(write.path);
      await mkdir(dirname(write.path), { recursive: true });
      let original = null;
      let existed = true;
      try { original = await readFile(write.path); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        existed = false;
      }
      const tmp = `${write.path}.tmp.${process.pid}.${index}`;
      await writeFile(tmp, write.bytes);
      prepared.push({ ...write, tmp, original, existed, committed: false });
    }
    for (const write of prepared) {
      await rename(write.tmp, write.path);
      write.committed = true;
    }
  } catch (error) {
    const restoreErrors = [];
    for (const [index, write] of prepared.entries()) {
      if (!write.committed) continue;
      try {
        if (write.existed) {
          const restore = `${write.path}.restore.${process.pid}.${index}`;
          await writeFile(restore, write.original);
          await rename(restore, write.path);
        } else {
          await rm(write.path, { force: true });
        }
      } catch (restoreError) {
        restoreErrors.push(`${write.path}: ${restoreError.message}`);
      }
    }
    if (restoreErrors.length) throw new Error(`campaign transaction failed (${error.message}) and rollback was incomplete: ${restoreErrors.join("; ")}`);
    throw error;
  } finally {
    for (const write of prepared) await rm(write.tmp, { force: true }).catch(() => {});
  }
}

async function withLock(path, fn) {
  await mkdir(dirname(path), { recursive: true });
  let handle;
  try {
    handle = await open(path, "wx");
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, operation: "media-audit-campaign", at: new Date().toISOString() })}\n`);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`${path} exists; another media-audit writer may be active`);
    throw error;
  }
  try { return await fn(); }
  finally {
    await handle?.close().catch(() => {});
    await rm(path, { force: true });
  }
}

function deriveRiskCodes(side, asset, counterpartHash) {
  if (!asset) return ["source-declared-absent"];
  const codes = [];
  let host = "";
  try { host = new URL(asset.origin || "").hostname.toLowerCase(); } catch {}
  if (!asset.origin) codes.push("missing-origin");
  if (side === "portrait" && /(?:^|\.)fandom\.com$/.test(host)) codes.push("fandom-performer-page");
  if (side === "portrait" && asset.kind === "still") codes.push("portrait-kind-still");
  if (side === "still" && asset.kind && asset.kind !== "still") codes.push("still-kind-mismatch");
  if (counterpartHash && counterpartHash === asset.sha256) codes.push("same-bytes-as-opposite-side");
  return [...new Set(codes)].sort();
}

function itemSetHash(items) {
  return sha256(stableJson(items.map((item) => ({
    id: item.id,
    scope: item.scope,
    wall_id: item.wall_id,
    side: item.side,
    expected_subject: item.expected_subject,
    asset: item.asset,
    risk_codes: item.risk_codes,
  }))));
}

function verifyEnvelope({ campaign, receipt, state, specimenBytes, sourceBytes, manifestBytes, scopeBytes, receiptBytes }) {
  if (campaign?.version !== MEDIA_AUDIT_VERSION) throw new Error(`campaign must be version ${MEDIA_AUDIT_VERSION}`);
  const scope = requireString(campaign.scope, "campaign.scope");
  const reviewedBy = requireString(campaign.reviewed_by, "campaign.reviewed_by");
  if (!/^[a-zA-Z0-9._-]{2,64}$/.test(reviewedBy)) throw new Error("campaign.reviewed_by must be a safe reviewer id");
  if (!["second-desk", "owner"].includes(campaign.reviewed_role)) throw new Error("campaign.reviewed_role must be second-desk or owner");
  const reviewedAt = requireIso(campaign.reviewed_at, "campaign.reviewed_at");
  const machineReviewer = requireString(campaign.machine_reviewer, "campaign.machine_reviewer");
  if (!/^[a-zA-Z0-9._-]{2,64}$/.test(machineReviewer)) throw new Error("campaign.machine_reviewer must be a safe reviewer id");

  validateState(state);
  const current = {
    item_set_sha256: state.source.item_set_sha256,
    specimens_sha256: sha256(specimenBytes),
    sources_sha256: sha256(sourceBytes),
    media_manifest_sha256: sha256(manifestBytes),
  };
  for (const [key, value] of Object.entries(current)) {
    const expected = requireSha(campaign.source?.[key], `campaign.source.${key}`);
    if (expected !== value) throw new Error(`campaign is stale: ${key} is ${value}, expected ${expected}`);
    if (state.source[key] && state.source[key] !== value) throw new Error(`media-audit state is stale: ${key} does not match current bytes`);
  }
  if (state.source.scopes_sha256 && state.source.scopes_sha256 !== sha256(scopeBytes)) throw new Error("media-audit state is stale: scopes_sha256 does not match current bytes");

  const receiptSha = sha256(receiptBytes);
  if (requireSha(campaign.source_receipt?.sha256, "campaign.source_receipt.sha256") !== receiptSha) throw new Error("campaign source receipt hash does not match");
  if (receipt?.version !== 1 || receipt.scope !== scope) throw new Error("campaign source receipt has wrong version or scope");
  for (const [key, value] of Object.entries(current)) {
    if (requireSha(receipt.source?.[key], `receipt.source.${key}`) !== value) throw new Error(`source receipt is stale: ${key}`);
  }
  if (!Array.isArray(receipt.rows) || receipt.rows.length !== receipt.counts?.total) throw new Error("source receipt rows/counts are invalid");

  const openItems = state.items.filter((item) => item.scope === scope && item.asset && !["verified", "absent"].includes(item.status));
  const byId = new Map(openItems.map((item) => [item.id, item]));
  const decisions = [];
  for (const row of campaign.remediations || []) decisions.push({ kind: "null", row });
  for (const row of campaign.approvals || []) decisions.push({ kind: "verify", row });
  const seen = new Set();
  for (const { kind, row } of decisions) {
    const id = requireString(row?.item_id, `${kind}.item_id`);
    if (seen.has(id)) throw new Error(`campaign contains duplicate decision for ${id}`);
    seen.add(id);
    const item = byId.get(id);
    if (!item) throw new Error(`campaign decision ${id} is not a current open ${scope} facet`);
    if (requireSha(row.asset_sha256, `${id}.asset_sha256`) !== item.asset.sha256) throw new Error(`campaign decision ${id} targets a stale asset`);
  }
  const missing = openItems.filter((item) => !seen.has(item.id)).map((item) => item.id);
  if (missing.length || seen.size !== openItems.length) throw new Error(`campaign must cover every current open facet exactly once; missing ${missing.slice(0, 10).join(", ") || "none"}`);

  const receiptRows = new Map(receipt.rows.map((row) => [row.item_id, row]));
  if (receiptRows.size !== openItems.length) throw new Error("source receipt must cover every open facet exactly once");
  for (const { kind, row } of decisions) {
    const evidence = receiptRows.get(row.item_id);
    if (!evidence || evidence.asset_sha256 !== row.asset_sha256 || evidence.disposition !== kind) {
      throw new Error(`source receipt does not support campaign decision ${row.item_id}`);
    }
  }
  return { scope, reviewedBy, reviewedAt, machineReviewer, openItems };
}

async function verifyAsset(item) {
  const bytes = await readFile(safeAssetPath(item.asset.src));
  if (sha256(bytes) !== item.asset.sha256 || bytes.length !== item.asset.bytes) throw new Error(`asset receipt changed for ${item.id}`);
}

function rebuildState({ previous, specimens, sources, specimenBytes, sourceBytes, manifestBytes, scopeBytes, reviewedAt }) {
  const sourceRows = new Map(sources.map((row) => [row.id, row]));
  const items = [];
  for (const specimen of specimens) {
    const oldSides = previous.items.filter((item) => item.wall_id === specimen.id);
    if (!oldSides.length) continue;
    const ledger = sourceRows.get(specimen.id);
    if (!ledger) throw new Error(`SOURCES has no row for ${specimen.id}`);
    if (normalize(ledger.actor) !== normalize(specimen.actor) || normalize(ledger.character) !== normalize(specimen.character)) throw new Error(`SOURCES identity drift for ${specimen.id}`);
    const receipts = {};
    for (const side of ["still", "portrait"]) {
      const specAsset = specimen[side] || null;
      const ledgerAsset = ledger[side] || null;
      if (JSON.stringify(specAsset) !== JSON.stringify(ledgerAsset)) throw new Error(`${specimen.id} ${side} differs between specimens and SOURCES`);
      const old = oldSides.find((item) => item.side === side);
      if (!old) throw new Error(`media-audit state lacks ${specimen.id}/${side}`);
      receipts[side] = specAsset ? old.asset : null;
      if (specAsset && (!old.asset || old.asset.src !== specAsset.src || sourceKey(old.asset.origin) !== sourceKey(specAsset.origin) || old.asset.kind !== (specAsset.kind || null))) {
        throw new Error(`canonical asset changed unexpectedly for ${specimen.id}/${side}`);
      }
    }
    for (const side of ["still", "portrait"]) {
      const old = oldSides.find((item) => item.side === side);
      const asset = receipts[side];
      const expected = side === "still" ? specimen.character : specimen.actor;
      const votes = old.asset?.sha256 === asset?.sha256 && old.expected_subject === expected ? copyJson(old.votes || []) : [];
      const raw = {
        id: old.id,
        scope: old.scope,
        wall_id: specimen.id,
        side,
        actor: specimen.actor,
        character: specimen.character,
        expected_subject: expected,
        source_fetched_at: ledger.fetched_at || null,
        asset,
        risk_codes: deriveRiskCodes(side, asset, receipts[side === "still" ? "portrait" : "still"]?.sha256),
        votes,
        status: "review",
        claims: { identity: null, presentation: null },
      };
      const derived = deriveItem(raw);
      raw.status = derived.status;
      raw.claims = derived.claims;
      items.push(raw);
    }
  }
  items.sort((a, b) => a.scope.localeCompare(b.scope) || a.wall_id.localeCompare(b.wall_id) || a.side.localeCompare(b.side));
  const state = {
    version: MEDIA_AUDIT_VERSION,
    source: {
      ...previous.source,
      specimens_sha256: sha256(specimenBytes),
      sources_sha256: sha256(sourceBytes),
      media_manifest_sha256: sha256(manifestBytes),
      scopes_sha256: sha256(scopeBytes),
      item_set_sha256: itemSetHash(items),
    },
    updated_at: reviewedAt,
    items,
  };
  validateState(state);
  return state;
}

async function applyCampaign() {
  const inputPath = option("input");
  if (!inputPath) throw new Error("--input is required");
  const paths = {
    campaign: rooted(inputPath),
    state: rooted(option("state", DEFAULT_STATE)),
    specimens: rooted(option("specimens", DEFAULT_SPECIMENS)),
    sources: rooted(option("sources", DEFAULT_SOURCES)),
    manifest: rooted(option("media-manifest", DEFAULT_MEDIA_MANIFEST)),
    scopes: rooted(option("scopes", DEFAULT_SCOPES)),
    auditJournal: rooted(option("journal", DEFAULT_AUDIT_JOURNAL)),
    remediationJournal: rooted(option("remediation-journal", DEFAULT_REMEDIATION_JOURNAL)),
    lock: rooted(option("lock", DEFAULT_LOCK)),
  };
  return withLock(paths.lock, async () => {
    const campaignDoc = await readJsonBytes(paths.campaign);
    const receiptPath = rooted(requireString(campaignDoc.value.source_receipt?.path, "campaign.source_receipt.path"));
    const [stateDoc, specimenDoc, sourceDoc, manifestDoc, scopeDoc, receiptDoc] = await Promise.all([
      readJsonBytes(paths.state),
      readJsonBytes(paths.specimens),
      readJsonBytes(paths.sources),
      readJsonBytes(paths.manifest),
      readJsonBytes(paths.scopes),
      readJsonBytes(receiptPath),
    ]);
    const campaign = campaignDoc.value;
    const state = stateDoc.value;
    if (!Array.isArray(specimenDoc.value) || !Array.isArray(sourceDoc.value)) throw new Error("specimens and SOURCES must be arrays");
    const envelope = verifyEnvelope({
      campaign,
      receipt: receiptDoc.value,
      state,
      specimenBytes: specimenDoc.bytes,
      sourceBytes: sourceDoc.bytes,
      manifestBytes: manifestDoc.bytes,
      scopeBytes: scopeDoc.bytes,
      receiptBytes: receiptDoc.bytes,
    });

    const specimens = copyJson(specimenDoc.value);
    const sources = copyJson(sourceDoc.value);
    const specById = new Map(specimens.map((row) => [row.id, row]));
    const sourceById = new Map(sources.map((row) => [row.id, row]));
    const itemById = new Map(state.items.map((item) => [item.id, item]));
    const receiptById = new Map(receiptDoc.value.rows.map((row) => [row.item_id, row]));
    const remediationEvents = [];

    for (const row of campaign.remediations || []) {
      const item = itemById.get(row.item_id);
      await verifyAsset(item);
      const specimen = specById.get(item.wall_id);
      const ledger = sourceById.get(item.wall_id);
      if (!specimen || !ledger) throw new Error(`canonical rows missing for ${item.wall_id}`);
      const specAsset = specimen[item.side];
      const sourceAsset = ledger[item.side];
      if (!specAsset || !sourceAsset || JSON.stringify(specAsset) !== JSON.stringify(sourceAsset)) throw new Error(`canonical media mismatch for ${item.wall_id}/${item.side}`);
      if (specAsset.src !== item.asset.src || sourceKey(specAsset.origin) !== sourceKey(item.asset.origin) || (specAsset.kind || null) !== item.asset.kind) {
        throw new Error(`canonical media no longer matches audit receipt for ${item.id}`);
      }
      const reason = requireString(row.reason, `${item.id}.reason`);
      const evidence = requireEvidence(row.evidence, `${item.id}.evidence`);
      specimen[item.side] = null;
      ledger[item.side] = null;
      remediationEvents.push({
        version: MEDIA_AUDIT_VERSION,
        op: "media.remediated",
        at: envelope.reviewedAt,
        scope: item.scope,
        item_id: item.id,
        wall_id: item.wall_id,
        side: item.side,
        expected_subject: item.expected_subject,
        asset_sha256: item.asset.sha256,
        previous_specimen_asset: specAsset,
        previous_source_asset: sourceAsset,
        reason,
        evidence,
        reviewed_by: envelope.reviewedBy,
        reviewed_role: campaign.reviewed_role,
        source_receipt: receiptById.get(item.id),
        campaign_sha256: sha256(campaignDoc.bytes),
      });
    }

    const specimenBytes = jsonBytes(specimens);
    const sourceBytes = jsonBytes(sources);
    let nextState = rebuildState({
      previous: state,
      specimens,
      sources,
      specimenBytes,
      sourceBytes,
      manifestBytes: manifestDoc.bytes,
      scopeBytes: scopeDoc.bytes,
      reviewedAt: envelope.reviewedAt,
    });

    const votes = [];
    for (const row of campaign.approvals || []) {
      const item = nextState.items.find((candidate) => candidate.id === row.item_id);
      if (!item?.asset || item.asset.sha256 !== row.asset_sha256) throw new Error(`approval ${row.item_id} is stale after remediation`);
      const identityEvidence = requireEvidence(row.identity_evidence, `${row.item_id}.identity_evidence`);
      const presentationEvidence = requireEvidence(row.presentation_evidence, `${row.item_id}.presentation_evidence`);
      const identityNote = requireString(row.identity_note, `${row.item_id}.identity_note`);
      const presentationNote = requireString(row.presentation_note, `${row.item_id}.presentation_note`);
      const presentation = requireString(row.presentation, `${row.item_id}.presentation`);
      for (const reviewer of [
        { reviewer: envelope.machineReviewer, role: "machine" },
        { reviewer: envelope.reviewedBy, role: campaign.reviewed_role },
      ]) {
        votes.push({ item_id: item.id, namespace: "identity", value: "expected", note: identityNote, evidence: identityEvidence, ...reviewer });
        votes.push({ item_id: item.id, namespace: "presentation", value: presentation, note: presentationNote, evidence: presentationEvidence, ...reviewer });
      }
    }
    const voted = applyVotes(nextState, votes, { now: envelope.reviewedAt });
    nextState = voted.state;
    const summary = summarize(nextState, envelope.scope);
    const expected = campaign.expected_result || {};
    for (const key of ["total", "verified", "absent", "review", "attention"]) {
      if (!Number.isInteger(expected[key]) || summary[key] !== expected[key]) throw new Error(`campaign result ${key}=${summary[key]}, expected ${expected[key]}`);
    }
    if (summary.complete !== summary.total) throw new Error(`campaign leaves ${summary.total - summary.complete} media facets open`);

    const campaignEvent = {
      version: MEDIA_AUDIT_VERSION,
      op: "media-audit.campaign-applied",
      at: envelope.reviewedAt,
      scope: envelope.scope,
      campaign_sha256: sha256(campaignDoc.bytes),
      source_receipt_sha256: sha256(receiptDoc.bytes),
      reviewed_by: envelope.reviewedBy,
      reviewed_role: campaign.reviewed_role,
      remediated: remediationEvents.length,
      approved: campaign.approvals.length,
      summary,
    };
    await atomicWriteTransaction([
      { path: paths.specimens, bytes: specimenBytes },
      { path: paths.sources, bytes: sourceBytes },
      { path: paths.state, bytes: jsonBytes(nextState) },
      { path: paths.auditJournal, bytes: await journalAppendBytes(paths.auditJournal, [...voted.events, campaignEvent], "maj") },
      { path: paths.remediationJournal, bytes: await journalAppendBytes(paths.remediationJournal, remediationEvents, "mar") },
    ]);
    console.log(`applied ${campaign.approvals.length} approvals and ${remediationEvents.length} remediations`);
    console.log(`media audit ${envelope.scope}: ${summary.complete}/${summary.total} complete; verified=${summary.verified} absent=${summary.absent} review=${summary.review} attention=${summary.attention}`);
  });
}

export { applyCampaign, verifyEnvelope, rebuildState, atomicWriteTransaction };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  applyCampaign().catch((error) => {
    console.error(`media audit campaign: ${error.message}`);
    process.exitCode = 1;
  });
}
