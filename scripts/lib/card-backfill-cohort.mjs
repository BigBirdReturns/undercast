import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export const CARD_BACKFILL_COHORT_VERSION = 1;

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function facetKey(wallId, side) {
  return `${wallId}/${side}`;
}

function idNumber(id) {
  const match = String(id || "").match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function cleanArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeHost(value) {
  try { return new URL(value).hostname.toLowerCase(); }
  catch { return ""; }
}

const FRANCHISE_MEDIAWIKI = [
  /star trek|ferengi|klingon|cardassian|romulan|vulcan|borg|dominion/i,
  /star wars|jedi|sith|mandalorian|wookiee|ewok|clone wars/i,
  /lord of the rings|hobbit|middle.?earth|tolkien|rings of power/i,
  /doctor who|dalek|cyberman|tardis|torchwood|sontaran|time lord/i,
  /alien|xenomorph|predator|yautja|prometheus|nostromo/i,
  /hellboy|dark crystal|gelfling|skeksis|muppet|sesame street|fraggle|henson|labyrinth/i,
  /power rangers|super sentai|ultraman|kamen rider|godzilla|gamera|mothra|ghidorah|kaiju|tokusatsu/i,
  /buffy|vampire slayer|harry potter|hogwarts|wizarding world|game of thrones|westeros|planet of the apes/i,
  /ninja turtles|\btmnt\b|friday the 13th|jason voorhees|hellraiser|pinhead|nightmare on elm street|freddy krueger/i,
  /marvel|avengers|\bmcu\b|x-men|guardians of the galaxy|batman|superman|justice league|\bdc\b comics?/i,
  /babylon 5|farscape/i,
];

export function inferPerformanceMode(record = {}) {
  const kind = String(record.kind || "").toLowerCase();
  const hay = `${record.universe || ""} ${record.production || ""}`;
  if (kind === "voice" || /\bvoice\b|animation|animated|anime/i.test(hay)) return "voice-or-animation";
  if (/motion.?capture|performance capture|mocap/i.test(`${kind} ${record.knownFor || ""} ${record.reveal || ""}`)) return "performance-capture";
  return "physical-or-live-action";
}

export function inferSourceRoute(record = {}, side) {
  if (side === "portrait") return "performer-reference-crawl";
  if (record.wiki) return "explicit-mediawiki";
  const host = normalizeHost(record.link);
  if (host && host !== "en.wikipedia.org" && (/fandom\.com$/.test(host) || /wiki|pedia|memory-alpha|wikizilla/.test(host))) return "linked-mediawiki";
  const hay = `${record.production || ""} ${record.character || ""} ${record.universe || ""}`;
  if (FRANCHISE_MEDIAWIKI.some((pattern) => pattern.test(hay))) return "franchise-mediawiki";
  return "open-web-exception";
}

export function inferEvidenceTier(record = {}) {
  const references = cleanArray(record.references);
  const performances = cleanArray(record.performances);
  if (references.length || performances.length) return "filed-independent-evidence";
  if (record.link) return "canonical-link-only";
  return "unbound";
}

export function classifyObligation({ audit, record = null, source = null }) {
  const side = audit?.side;
  const wallId = audit?.wall_id;
  const expectedSubject = audit?.expected_subject || (side === "still" ? record?.character : record?.actor) || null;
  const sourceRoute = inferSourceRoute(record || {}, side);
  const evidenceTier = inferEvidenceTier(record || {});
  const performanceMode = inferPerformanceMode(record || {});
  const oppositeSide = side === "still" ? "portrait" : "still";
  const quarantineReasons = [];

  if (!record) quarantineReasons.push("missing-canonical-specimen");
  if (!source) quarantineReasons.push("missing-source-ledger-row");
  if (!expectedSubject) quarantineReasons.push("missing-expected-subject");
  if (side === "still" && sourceRoute === "open-web-exception") quarantineReasons.push("no-bounded-still-source-route");
  if (evidenceTier === "unbound") quarantineReasons.push("no-independent-role-or-identity-evidence");
  const unexpectedRiskCodes = cleanArray(audit?.risk_codes).filter((code) => code !== "source-declared-absent");
  if (unexpectedRiskCodes.length) quarantineReasons.push("nonstandard-audit-risk");

  const shape = {
    side,
    performance_mode: performanceMode,
    source_route: sourceRoute,
    evidence_tier: evidenceTier,
    render_profile: side === "portrait" ? "neutral-human" : "character-depiction",
  };
  const cohortKey = [shape.side, shape.performance_mode, shape.source_route, shape.evidence_tier, shape.render_profile].join("::");
  const identity = record ? {
    actor: record.actor || null,
    character: record.character || null,
    production: record.production || null,
    years: record.years || null,
    universe: record.universe || null,
    kind: record.kind || null,
    designer: record.designer || null,
    transform: record.transform ?? null,
  } : null;
  const obligation = {
    version: CARD_BACKFILL_COHORT_VERSION,
    obligation_id: facetKey(wallId, side),
    wall_id: wallId,
    side,
    audit_id: audit?.id || null,
    expected_subject: expectedSubject,
    identity,
    shape,
    cohort_key: cohortKey,
    disposition: quarantineReasons.length ? "quarantine" : "ready",
    quarantine_reasons: quarantineReasons,
    audit_risk_codes: cleanArray(audit?.risk_codes),
    canonical_link: record?.link || null,
    references: cleanArray(record?.references),
    performances: cleanArray(record?.performances),
    existing_opposite_facet: record?.[oppositeSide] || null,
    canonical_facet: record?.[side] || null,
    source_facet: source?.[side] || null,
    canonical_mutation: false,
  };
  return { ...obligation, scope_sha256: sha256(canonicalJson(obligation)) };
}

export function buildEstate({ specimens, sources, auditItems, completedPackets = new Map(), control }) {
  const specimenById = new Map((specimens || []).map((row) => [row.id, row]));
  const sourceById = new Map((sources || []).map((row) => [row.id, row]));
  const denominator = control?.denominator || {};
  const allowedSides = new Set(denominator.sides || ["still", "portrait"]);
  const obligations = [];
  const selectorExclusions = [];

  for (const audit of auditItems || []) {
    if (audit.scope !== denominator.scope || audit.status !== denominator.status || !allowedSides.has(audit.side)) continue;
    if (completedPackets.has(audit.wall_id)) continue;
    const record = specimenById.get(audit.wall_id) || null;
    if (!record) { selectorExclusions.push({ wall_id: audit.wall_id, side: audit.side, audit_id: audit.id || null, reason: "missing-canonical-specimen" }); continue; }
    obligations.push(classifyObligation({ audit, record, source: sourceById.get(audit.wall_id) || null }));
  }

  obligations.sort((a, b) => idNumber(a.wall_id) - idNumber(b.wall_id) || (a.side === b.side ? 0 : a.side === "still" ? -1 : 1) || a.obligation_id.localeCompare(b.obligation_id));
  const cohortMap = new Map();
  for (const obligation of obligations) {
    const rows = cohortMap.get(obligation.cohort_key) || [];
    rows.push(obligation);
    cohortMap.set(obligation.cohort_key, rows);
  }
  const cohorts = [...cohortMap.entries()].map(([cohortKey, rows]) => ({
    cohort_key: cohortKey,
    disposition: rows.every((row) => row.disposition === "ready") ? "ready" : "quarantine",
    count: rows.length,
    first_obligation_id: rows[0]?.obligation_id || null,
    shape: rows[0]?.shape || null,
    quarantine_reason_counts: Object.fromEntries([...new Set(rows.flatMap((row) => row.quarantine_reasons))].sort().map((reason) => [reason, rows.filter((row) => row.quarantine_reasons.includes(reason)).length])),
    obligation_ids: rows.map((row) => row.obligation_id),
  })).sort((a, b) => b.count - a.count || a.cohort_key.localeCompare(b.cohort_key));

  const hashBody = { campaign_id: control.campaign_id, denominator, obligations, selector_exclusions: selectorExclusions };
  return {
    version: CARD_BACKFILL_COHORT_VERSION,
    campaign_id: control.campaign_id,
    generated_at: null,
    denominator: {
      ...denominator,
      completed_packet_count: completedPackets.size,
      open_obligation_count: obligations.length,
      selector_total: completedPackets.size + obligations.length,
    },
    counts: {
      ready: obligations.filter((row) => row.disposition === "ready").length,
      quarantine: obligations.filter((row) => row.disposition === "quarantine").length,
      cohorts: cohorts.length,
      ready_cohorts: cohorts.filter((row) => row.disposition === "ready").length,
      quarantine_cohorts: cohorts.filter((row) => row.disposition === "quarantine").length,
    },
    estate_sha256: sha256(canonicalJson(hashBody)),
    selector_exclusions: selectorExclusions,
    obligations,
    cohorts,
    canonical_mutation: false,
  };
}

export function selectBatch({ estate, control, cohortKey = null, limit = null }) {
  const batchPolicy = control.batch || {};
  const requestedLimit = Number(limit ?? batchPolicy.target ?? 40);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw new Error(`invalid batch limit ${requestedLimit}`);
  if (batchPolicy.maximum && requestedLimit > batchPolicy.maximum) throw new Error(`batch limit ${requestedLimit} exceeds maximum ${batchPolicy.maximum}`);

  let cohort;
  if (cohortKey) cohort = estate.cohorts.find((row) => row.cohort_key === cohortKey);
  else {
    const ready = estate.cohorts.filter((row) => row.disposition === "ready");
    ready.sort((a, b) => Math.min(b.count, requestedLimit) - Math.min(a.count, requestedLimit) || b.count - a.count || a.first_obligation_id.localeCompare(b.first_obligation_id) || a.cohort_key.localeCompare(b.cohort_key));
    cohort = ready[0];
  }
  if (!cohort) throw new Error(cohortKey ? `unknown or unavailable cohort ${cohortKey}` : "no ready cohort available");
  if (cohort.disposition !== "ready") throw new Error(`cohort ${cohort.cohort_key} is quarantined`);

  const byId = new Map(estate.obligations.map((row) => [row.obligation_id, row]));
  const obligations = cohort.obligation_ids.slice(0, requestedLimit).map((id) => byId.get(id)).filter(Boolean);
  const batchBody = {
    campaign_id: estate.campaign_id,
    estate_sha256: estate.estate_sha256,
    cohort_key: cohort.cohort_key,
    obligations: obligations.map((row) => ({ obligation_id: row.obligation_id, scope_sha256: row.scope_sha256 })),
  };
  return {
    version: CARD_BACKFILL_COHORT_VERSION,
    campaign_id: estate.campaign_id,
    estate_sha256: estate.estate_sha256,
    cohort_key: cohort.cohort_key,
    shape: cohort.shape,
    requested_limit: requestedLimit,
    minimum_target: batchPolicy.minimum ?? null,
    selected_count: obligations.length,
    underfilled: Boolean(batchPolicy.minimum && obligations.length < batchPolicy.minimum),
    obligations,
    batch_sha256: sha256(canonicalJson(batchBody)),
    canonical_mutation: false,
  };
}

export function buildScopeReceipt(obligation, { campaignId, estateSha256, batchSha256 = null } = {}) {
  const oppositeSide = obligation.side === "still" ? "portrait" : "still";
  const receipt = {
    version: CARD_BACKFILL_COHORT_VERSION,
    campaign_id: campaignId,
    obligation_id: obligation.obligation_id,
    record_id: obligation.wall_id,
    side: obligation.side,
    expected_subject: obligation.expected_subject,
    identity: obligation.identity,
    evidence: {
      tier: obligation.shape.evidence_tier,
      canonical_link: obligation.canonical_link,
      references: obligation.references,
      performances: obligation.performances,
      selected_image_must_not_independently_prove_identity_or_role: true,
    },
    source_and_render_shape: obligation.shape,
    canonical_boundary: {
      target_facet_currently_absent: !obligation.canonical_facet,
      source_ledger_target_facet_currently_absent: !obligation.source_facet,
      opposite_side: oppositeSide,
      existing_opposite_facet: obligation.existing_opposite_facet,
      existing_opposite_facet_must_remain_unchanged: Boolean(obligation.existing_opposite_facet),
      canonical_mutation: false,
    },
    selection_contract: {
      exact_expected_subject_required: true,
      exact_filed_actor_character_production_chronology_required: true,
      other_people_roles_productions_and_namesake_collisions_forbidden: true,
      posters_logos_illustrations_props_costumes_replicas_and_generic_substitutes_forbidden: true,
      source_page_claims_candidate_bytes_and_visual_adjudication_must_remain_separate: true,
      repository_wide_byte_duplicate_screen_required: true,
      independent_visual_adjudication_required: true,
      adjudicator_may_be_a_qualified_machine_or_person_but_must_not_be_the_discoverer: true,
      deterministic_render_and_wall_simulation_required: true,
      full_repository_gate_required_once_for_the_permanent_batch: true,
      canonical_mutation: false,
    },
    custody: {
      estate_sha256: estateSha256,
      batch_sha256: batchSha256,
      obligation_scope_sha256: obligation.scope_sha256,
    },
    disposition: obligation.disposition === "ready" ? "cohort-scope-ready" : "quarantined-before-discovery",
    quarantine_reasons: obligation.quarantine_reasons,
    canonical_mutation: false,
  };
  return { ...receipt, receipt_sha256: sha256(canonicalJson(receipt)) };
}

export function buildRetrievalPlan(batch, generatedAt) {
  return {
    version: CARD_BACKFILL_COHORT_VERSION,
    generated_at: generatedAt,
    mode: "candidate-only",
    canonical_write: false,
    campaign_id: batch.campaign_id,
    estate_sha256: batch.estate_sha256,
    batch_sha256: batch.batch_sha256,
    cohort_key: batch.cohort_key,
    limit: batch.selected_count,
    candidates: batch.obligations.map((row) => ({
      wall_id: row.wall_id,
      side: row.side,
      expected_subject: row.expected_subject,
      reason: "selector-declared-absence",
      replace_existing: false,
      current: null,
      source_receipt: row.source_facet,
      cohort_key: row.cohort_key,
      scope_sha256: row.scope_sha256,
    })),
  };
}

function inferSideFromReview(review = {}) {
  if (["still", "portrait"].includes(review.side)) return review.side;
  const hay = JSON.stringify(review);
  if (/portrait-candidate|portrait\.(?:jpe?g|png|webp)/i.test(hay)) return "portrait";
  if (/still-candidate|still\.(?:jpe?g|png|webp)/i.test(hay)) return "still";
  return null;
}

export async function readCompletedPackets(root) {
  const completed = new Map();
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) {
    if (error.code === "ENOENT") return completed;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    let row = null;
    for (const file of ["manifest.json", "review.json"]) {
      try { row = JSON.parse(await readFile(join(dir, file), "utf8")); break; }
      catch (error) { if (error.code !== "ENOENT") throw new Error(`${dir}/${file}: ${error.message}`); }
    }
    if (!row) continue;
    const recordId = row.record_id || row.id || entry.name;
    const side = row.side || inferSideFromReview(row);
    if (!recordId || !side) continue;
    completed.set(recordId, { record_id: recordId, side, path: dir });
  }
  return completed;
}
