import { POSITIVE_VALUE, copyJson, deriveItem, sha256, stableJson, validateState } from "./media-audit.mjs";

export const MEDIA_REMEDIATION_VERSION = 1;

const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function safeReviewer(value) {
  return /^[a-zA-Z0-9._-]{2,64}$/.test(value || "");
}

function explicitNegative(item, namespace) {
  const claim = item.claims?.[namespace];
  if (!claim || !["solid", "enforced"].includes(claim.state)) return false;
  if (claim.value === "ambiguous") return false;
  const positive = namespace === "identity" ? POSITIVE_VALUE.identity : POSITIVE_VALUE[item.side];
  return claim.value !== positive;
}

function assertEligible(item) {
  if (!item.asset || item.status !== "attention") throw new Error(`media remediation item ${item.id} is not a present attention facet`);
  for (const claim of Object.values(item.claims || {}).filter(Boolean)) {
    if (claim.state === "contested") throw new Error(`media remediation item ${item.id} is contested`);
    if (claim.value === "ambiguous" && claim.state !== "none") throw new Error(`media remediation item ${item.id} is ambiguous`);
  }
  if (!explicitNegative(item, "identity") && !explicitNegative(item, "presentation")) {
    throw new Error(`media remediation item ${item.id} lacks a solid or enforced explicit negative ruling`);
  }
}

function itemSetReceipt(items) {
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

export function remediationJournalLines(events) {
  return events.map((entry) => {
    const body = copyJson(entry);
    const id = `mar_${sha256(stableJson(body)).slice(0, 24)}`;
    return JSON.stringify({ id, ...body });
  }).join("\n") + (events.length ? "\n" : "");
}

export function assertUnchangedRemediationInputs(initial, current) {
  for (const name of ["specimens", "sources", "auditState", "mediaManifest", "remediationJournal"]) {
    const before = initial?.[name];
    const after = current?.[name];
    if (!Buffer.isBuffer(before) || !Buffer.isBuffer(after)) throw new Error(`media remediation race check lacks ${name} bytes`);
    if (!before.equals(after)) throw new Error(`media remediation input changed before commit: ${name}`);
  }
  return true;
}

export function validateRemediationJournal(bytes, mediaManifest) {
  if (!mediaManifest?.assets || typeof mediaManifest.assets !== "object" || Array.isArray(mediaManifest.assets)) throw new Error("media-remediation journal validation needs the current media manifest");
  const text = Buffer.isBuffer(bytes) ? bytes.toString("utf8") : String(bytes || "");
  const ids = new Set();
  let count = 0;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); }
    catch (error) { throw new Error(`media-remediation journal line ${index + 1} is malformed: ${error.message}`); }
    const { id, ...body } = entry;
    const expected = `mar_${sha256(stableJson(body)).slice(0, 24)}`;
    if (id !== expected) throw new Error(`media-remediation journal line ${index + 1} has a tampered event id`);
    if (ids.has(id)) throw new Error(`media-remediation journal has duplicate event ${id}`);
    ids.add(id);
    if (body.version !== MEDIA_REMEDIATION_VERSION || body.op !== "media.remediated") throw new Error(`media-remediation journal line ${index + 1} has an unsupported event`);
    if (!body.former?.specimen_facet || !body.former?.source_facet || !body.former?.audit_item || !body.former?.media_manifest) {
      throw new Error(`media-remediation journal line ${index + 1} lacks former canonical values`);
    }
    const recordedManifest = body.former.media_manifest;
    const retainedManifest = mediaManifest.assets[recordedManifest.path];
    if (!retainedManifest || stableJson(retainedManifest) !== stableJson(recordedManifest.entry)) {
      throw new Error(`media-remediation journal line ${index + 1} lost its exact immutable manifest entry`);
    }
    for (const section of [body.before, body.after]) {
      if (!["specimens_sha256", "sources_sha256", "audit_state_sha256", "media_manifest_sha256"].every((key) => /^[0-9a-f]{64}$/i.test(section?.[key] || ""))) {
        throw new Error(`media-remediation journal line ${index + 1} has invalid state receipts`);
      }
    }
    count++;
  }
  return count;
}

export function planRemediation({ request, auditState, auditStateSha256, specimens, specimensSha256, sources, sourcesSha256, mediaManifest, mediaManifestSha256 }) {
  validateState(auditState);
  if (!request || request.version !== MEDIA_REMEDIATION_VERSION) throw new Error(`media remediation request must be version ${MEDIA_REMEDIATION_VERSION}`);
  if (!String(request.scope || "").trim()) throw new Error("media remediation request needs scope");
  if (!/^[0-9a-f]{64}$/i.test(request.audit_state_sha256 || "") || request.audit_state_sha256 !== auditStateSha256) throw new Error("media remediation request targets a stale audit state");
  if (!safeReviewer(request.requested_by)) throw new Error("media remediation request needs a safe requested_by reviewer id");
  if (!String(request.request_receipt || "").trim() || String(request.request_receipt).length > 512 || /[\r\n]/.test(request.request_receipt)) throw new Error("media remediation request needs a durable request_receipt");
  if (!Number.isFinite(Date.parse(request.requested_at || ""))) throw new Error("media remediation request needs an ISO requested_at timestamp");
  if (!Array.isArray(request.facets) || !request.facets.length) throw new Error("media remediation request needs facets[]");
  if (!Array.isArray(specimens) || !Array.isArray(sources)) throw new Error("media remediation specimens and sources must be arrays");
  if (auditState.source.specimens_sha256 !== specimensSha256 || auditState.source.sources_sha256 !== sourcesSha256 || auditState.source.media_manifest_sha256 !== mediaManifestSha256) {
    throw new Error("media remediation inputs do not match the audit state receipts");
  }

  const nextSpecimens = copyJson(specimens);
  const nextSources = copyJson(sources);
  const nextState = copyJson(auditState);
  const specimensById = new Map(nextSpecimens.map((row) => [row.id, row]));
  const sourcesById = new Map(nextSources.map((row) => [row.id, row]));
  const itemsById = new Map(nextState.items.map((row) => [row.id, row]));
  const seenItems = new Set();
  const seenFacets = new Set();
  const former = [];

  for (const requested of request.facets) {
    if (!requested || !String(requested.item_id || "").trim()) throw new Error("media remediation facet needs item_id");
    if (seenItems.has(requested.item_id)) throw new Error(`duplicate media remediation item ${requested.item_id}`);
    seenItems.add(requested.item_id);
    const item = itemsById.get(requested.item_id);
    if (!item) throw new Error(`unknown media remediation item ${requested.item_id}`);
    if (item.scope !== request.scope) throw new Error(`media remediation item ${item.id} is outside scope ${request.scope}`);
    const facetKey = `${item.wall_id}|${item.side}`;
    if (seenFacets.has(facetKey)) throw new Error(`duplicate media remediation facet ${facetKey}`);
    seenFacets.add(facetKey);
    if (!/^[0-9a-f]{64}$/i.test(requested.asset_sha256 || "") || requested.asset_sha256 !== item.asset?.sha256) throw new Error(`media remediation item ${item.id} targets a stale asset`);
    assertEligible(item);

    const specimen = specimensById.get(item.wall_id);
    const source = sourcesById.get(item.wall_id);
    if (!specimen || !source) throw new Error(`media remediation item ${item.id} lacks a canonical specimen/source pair`);
    if (JSON.stringify(specimen[item.side] || null) !== JSON.stringify(source[item.side] || null)) throw new Error(`media remediation item ${item.id} differs between specimens and SOURCES`);
    if (!specimen[item.side] || specimen[item.side].src !== item.asset.src) throw new Error(`media remediation item ${item.id} does not match its canonical facet path`);
    if (source.fetched_at !== item.source_fetched_at) throw new Error(`media remediation item ${item.id} has a mismatched fetched_at receipt`);

    const manifest = mediaManifest?.assets?.[item.asset.src];
    if (!manifest || manifest.location !== "release" || manifest.id !== item.wall_id || manifest.side !== item.side || manifest.sha256 !== item.asset.sha256 || manifest.bytes !== item.asset.bytes) {
      throw new Error(`media remediation item ${item.id} lacks an exact release media-manifest receipt`);
    }

    former.push({
      item_id: item.id,
      wall_id: item.wall_id,
      side: item.side,
      specimen_facet: copyJson(specimen[item.side]),
      source_facet: copyJson(source[item.side]),
      source_fetched_at: source.fetched_at,
      audit_item: copyJson(item),
      media_manifest: copyJson({ path: item.asset.src, entry: manifest }),
    });

    specimen[item.side] = null;
    source[item.side] = null;
    item.asset = null;
    item.risk_codes = ["source-declared-absent"];
    item.votes = [];
    const derived = deriveItem(item);
    item.status = derived.status;
    item.claims = derived.claims;
    if (item.status !== "absent") throw new Error(`media remediation item ${item.id} did not retain an absence receipt`);
  }

  const specimenBytes = jsonBytes(nextSpecimens);
  const sourceBytes = jsonBytes(nextSources);
  nextState.source.specimens_sha256 = sha256(specimenBytes);
  nextState.source.sources_sha256 = sha256(sourceBytes);
  nextState.source.item_set_sha256 = itemSetReceipt(nextState.items);
  nextState.updated_at = request.requested_at;
  validateState(nextState);
  const auditBytes = jsonBytes(nextState);
  const before = { specimens_sha256: specimensSha256, sources_sha256: sourcesSha256, audit_state_sha256: auditStateSha256, media_manifest_sha256: mediaManifestSha256 };
  const after = { specimens_sha256: sha256(specimenBytes), sources_sha256: sha256(sourceBytes), audit_state_sha256: sha256(auditBytes), media_manifest_sha256: mediaManifestSha256 };
  const requestSha256 = sha256(stableJson(request));
  const events = former.map((row) => ({
    version: MEDIA_REMEDIATION_VERSION,
    op: "media.remediated",
    at: request.requested_at,
    scope: request.scope,
    item_id: row.item_id,
    wall_id: row.wall_id,
    side: row.side,
    asset_sha256: row.audit_item.asset.sha256,
    requested_by: request.requested_by,
    request_receipt: request.request_receipt,
    request_sha256: requestSha256,
    former: { specimen_facet: row.specimen_facet, source_facet: row.source_facet, source_fetched_at: row.source_fetched_at, audit_item: row.audit_item, media_manifest: row.media_manifest },
    before,
    after,
  }));

  return { specimens: nextSpecimens, sources: nextSources, auditState: nextState, events, bytes: { specimens: specimenBytes, sources: sourceBytes, auditState: auditBytes } };
}
