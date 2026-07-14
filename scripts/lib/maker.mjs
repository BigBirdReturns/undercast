/**
 * maker.mjs — the maker-attribution review-queue rules, shared by the queue
 * builder AND its fixtures so production and validation can never diverge.
 *
 * Same durable contract as eligibility: content-addressed evidence ids (by the
 * item's complete identity, not position) and owner-decision validation
 * (substantive pinned evidence + complete, immutable metadata; duplicate,
 * malformed, stale, and dangling all rejected).
 *
 * Difference from eligibility: a character's makeup maker is legitimately SHARED
 * across every performer of that character (the design is one thing), so a maker
 * claim read off the character page attaches to all of that character's
 * performances as character-scoped context. That is correct sharing, not the
 * cross-performer leakage eligibility forbids. The owner still curates the
 * canonical maker per performance; nothing is a verdict without an owner decision.
 */
import { createHash } from "node:crypto";

// Content-addressed evidence id: the hash covers the COMPLETE evidence identity —
// duplicate_key, kind, page, source, pinned revision + content hash, and the
// normalized basis + establishes text. A changed pinned revision or quote yields a
// new id, so an owner decision citing the old snapshot fails closed (staleness).
export const evidenceId = (dupKey, claim) =>
  dupKey + "#" + createHash("sha256").update([
    dupKey, claim.kind, claim.page || "", claim.source || "",
    claim.revision ?? "", claim.content_sha256 || "",
    claim.basis || "", claim.establishes || "",
  ].join(" ")).digest("hex").slice(0, 16);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// A real calendar date, not merely YYYY-MM-DD shape (rejects 2026-13-40, 2026-02-30).
function isRealDate(s) {
  if (!DATE.test(s || "")) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// A substantive maker item is a verified, pinned quote naming a maker.
export const isSubstantive = (e) => !!(e && e.verified && e.basis && e.maker && e.revision && e.content_sha256);

// Validate ONE owner decision (which curates the canonical maker) against dossiers.
export function validateDecision(dec, dossiers) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  need(dec && typeof dec.duplicate_key === "string" && dec.duplicate_key.trim(), "missing duplicate_key");
  need(typeof dec?.canonical_maker === "string" && dec.canonical_maker.trim(), "missing canonical_maker");
  need(typeof dec?.rationale === "string" && dec.rationale.trim().length >= 8, "missing or too-short rationale");
  need(typeof dec?.decided_by === "string" && dec.decided_by.trim(), "missing decided_by");
  need(isRealDate(dec?.date), "missing or invalid date (must be a real YYYY-MM-DD calendar date)");
  need(Array.isArray(dec?.evidence_ids) && dec.evidence_ids.length > 0, "missing evidence_ids");
  const ids = Array.isArray(dec?.evidence_ids) ? dec.evidence_ids : [];
  need(new Set(ids).size === ids.length, "duplicate evidence_ids");
  const doss = dec && dossiers[dec.duplicate_key];
  if (!doss) { errors.push(`dangling: no performance for duplicate_key ${dec?.duplicate_key}`); return { ok: false, errors }; }
  const byId = new Map((doss.evidence || []).map((e) => [e.id, e]));
  const cited = ids.map((id) => [id, byId.get(id)]);
  for (const [id, e] of cited) if (!e) errors.push(`stale evidence id: ${id}`);
  need(cited.some(([, e]) => isSubstantive(e)), "cites no substantive (verified, pinned, maker-naming) evidence");
  // the curated maker must actually be one an evidence item names — no free-text makers
  need(cited.some(([, e]) => e && isSubstantive(e) && String(e.maker).trim() === dec.canonical_maker.trim()),
    "canonical_maker is not named by any cited substantive evidence item");
  return { ok: errors.length === 0, errors };
}

// Validate ALL decisions: duplicates + each decision. Returns { applied: Map, errors[] }.
export function validateDecisions(decisions, dossiers) {
  const errors = [];
  const seen = new Set();
  const applied = new Map();
  for (const dec of decisions || []) {
    if (seen.has(dec?.duplicate_key)) { errors.push(`duplicate decision for ${dec?.duplicate_key}`); continue; }
    seen.add(dec?.duplicate_key);
    const { ok, errors: errs } = validateDecision(dec, dossiers);
    if (ok) applied.set(dec.duplicate_key, dec);
    else errors.push(...errs.map((x) => `${dec?.duplicate_key}: ${x}`));
  }
  return { applied, errors };
}
