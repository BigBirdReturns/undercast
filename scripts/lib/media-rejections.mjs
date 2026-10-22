import { createHash } from "node:crypto";

const HASH = /^[0-9a-f]{64}$/;
const WALL_ID = /^UC-G?\d+$/;
const SIDES = new Set(["still", "portrait"]);
// An exact-byte rule denies its hash everywhere unless it declares `record-side`, which is
// reserved for bytes that independent hash-bound review has verified for another record
// side (the Tosk still that a performer-page portrait wrongly reused).
const HASH_SCOPES = new Set(["global", "record-side"]);

function invariant(condition, message) {
  if (!condition) throw new Error(`media rejections: ${message}`);
}

// Deterministic rule id for rules projected from a reviewed correction ledger. Earlier
// rules keep the ids they were published with; this derivation applies from
// UC-MEDIA-AUDIT-2 onward.
export function mediaRejectionRuleId({ decision, wall_id, side, asset_sha256, source_locator = null }) {
  const body = [String(decision || ""), String(wall_id || ""), String(side || ""), String(asset_sha256 || "").toLowerCase(), normalizeMediaLocator(source_locator)].join("\n");
  return `mrj_${createHash("sha256").update(body).digest("hex").slice(0, 24)}`;
}

export function normalizeMediaLocator(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return text.replace(/\/$/, "");
  }
}

export function validateMediaRejections(document) {
  invariant(document && typeof document === "object" && !Array.isArray(document), "document must be an object");
  invariant(document.version === 1, `version must be 1 (got ${JSON.stringify(document.version)})`);
  invariant(Array.isArray(document.rules) && document.rules.length > 0, "rules must be a non-empty array");
  invariant(document.denominator?.rules === document.rules.length, "denominator.rules must equal rules.length");
  const sourceKeys = Object.keys(document.denominator).filter((key) => key !== "rules");
  invariant(sourceKeys.length > 0, "denominator must name at least one reviewed source");
  for (const key of sourceKeys) invariant(Number.isInteger(document.denominator[key]) && document.denominator[key] >= 0, `denominator.${key} must be a non-negative integer`);
  invariant(sourceKeys.reduce((sum, key) => sum + document.denominator[key], 0) === document.rules.length, "source denominators must sum to rules.length");
  invariant(Array.isArray(document.source_ledgers) && document.source_ledgers.length > 0, "source_ledgers must be non-empty");
  const ids = new Set();
  for (const [index, rule] of document.rules.entries()) {
    const label = `rules[${index}]`;
    invariant(/^mrj_[0-9a-f]{24}$/.test(rule?.rule_id || ""), `${label}.rule_id is invalid`);
    invariant(!ids.has(rule.rule_id), `${label}.rule_id is duplicated`);
    ids.add(rule.rule_id);
    invariant(rule.state === "rejected", `${label}.state must be rejected`);
    invariant(WALL_ID.test(rule.wall_id || ""), `${label}.wall_id is invalid`);
    invariant(SIDES.has(rule.side), `${label}.side is invalid`);
    invariant(String(rule.expected_subject || "").trim(), `${label}.expected_subject is required`);
    invariant(HASH.test(rule.asset_sha256 || ""), `${label}.asset_sha256 is invalid`);
    invariant(rule.source_locator == null || /^https?:\/\//i.test(rule.source_locator), `${label}.source_locator must be null or an http(s) URL`);
    invariant(String(rule.preserved_path || "").startsWith("images/") && !String(rule.preserved_path).split(/[\\/]+/).includes(".."), `${label}.preserved_path is unsafe`);
    invariant(String(rule.decision || "").trim(), `${label}.decision is required`);
    invariant(String(rule.ruling || "").trim(), `${label}.ruling is required`);
    invariant(String(rule.evidence || "").trim(), `${label}.evidence is required`);
    invariant(rule.hash_scope == null || HASH_SCOPES.has(rule.hash_scope), `${label}.hash_scope must be global or record-side`);
    invariant(rule.hash_scope !== "record-side" || String(rule.scope_note || "").trim(), `${label}.scope_note is required for a record-side hash scope`);
  }
  for (const [index, ledger] of document.source_ledgers.entries()) {
    invariant(String(ledger?.path || "").trim(), `source_ledgers[${index}].path is required`);
    invariant(HASH.test(ledger?.sha256 || ""), `source_ledgers[${index}].sha256 is invalid`);
  }
  return document;
}

export function indexMediaRejections(document) {
  validateMediaRejections(document);
  const byHash = new Map(), byLocator = new Map();
  for (const rule of document.rules) {
    if (!byHash.has(rule.asset_sha256)) byHash.set(rule.asset_sha256, []);
    byHash.get(rule.asset_sha256).push(rule);
    const locator = normalizeMediaLocator(rule.source_locator);
    if (locator) byLocator.set(`${rule.wall_id}/${rule.side}/${locator}`, rule);
  }
  return { document, byHash, byLocator };
}

export function matchMediaRejection(index, { wallId, side, origin = null, sha256 = null } = {}) {
  if (!index?.byHash || !index?.byLocator) throw new Error("media rejections: compiled index is required");
  const hash = String(sha256 || "").toLowerCase();
  if (hash) {
    const matches = (index.byHash.get(hash) || []).filter((rule) => rule.hash_scope !== "record-side" || (rule.wall_id === wallId && rule.side === side));
    if (matches.length) {
      const exact = matches.find((rule) => rule.wall_id === wallId && rule.side === side) || matches[0];
      return { rule: exact, match: "asset_sha256" };
    }
  }
  const locator = normalizeMediaLocator(origin);
  const rule = locator ? index.byLocator.get(`${wallId}/${side}/${locator}`) : null;
  return rule ? { rule, match: "source_locator" } : null;
}
