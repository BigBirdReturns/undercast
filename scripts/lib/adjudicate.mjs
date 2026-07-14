/**
 * adjudicate.mjs — a reusable harness for sourced, verifiable adjudication. NO KEY.
 *
 * The repeatable pattern (see docs/ADJUDICATION.md) is:
 *   1. FAN OUT  — reader-agents judge each item from the sources (the human layer).
 *   2. PIN      — pinPages() deterministically fetches every cited Memory Alpha
 *                 page and records its revision id + content hash (the receipt).
 *   3. VERIFY   — extractBasis()/verifyBasis() confirm the affirmative claim text
 *                 actually appears in that pinned revision (the check).
 *   4. DERIVE   — the engine decides ONLY from verified, affirmative claims and
 *                 returns everything unsupported to review.
 *
 * This module is deliberately domain-agnostic: eligibility, family relationships,
 * designer attribution — any adjudication that must "hand over the receipts" can
 * reuse pinPages + verifyBasis.
 */
import { createHash } from "node:crypto";

const API = "https://memory-alpha.fandom.com/api.php";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const digest = (value) => createHash("sha256").update(value).digest("hex");
export const wikiUrl = (title) => `https://memory-alpha.fandom.com/wiki/${encodeURIComponent(String(title).replace(/ /g, "_"))}`;

// text-normalise for robust quote matching: strip references and wiki markup,
// collapse whitespace, lowercase. Extraction and verification share this exactly,
// so any basis pulled from a page is guaranteed to re-verify against it.
export const normalizeText = (s) => String(s || "")
  .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, " ").replace(/<ref[^>]*\/>/gi, " ")
  .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1")
  .replace(/'''?|<[^>]+>|\{\{[^{}]*\}\}/g, " ").replace(/&ndash;|&mdash;/g, "-").replace(/&[a-z]+;/gi, " ")
  .replace(/\(\s*\)/g, " ").replace(/\[\d+\]/g, " ")
  .replace(/[\s ]+/g, " ").trim().toLowerCase();

/**
 * Fetch Memory Alpha pages and pin each to its revision id + content hash.
 * Returns Map(requestedTitle -> {title, pageid, revision, timestamp, content_sha256,
 * wikitext, url, missing}). Follows redirects; the map is also keyed by the
 * canonical title so either lookup works.
 */
export async function pinPages(titles, { contact = "adjudicate", concurrencyMs = 600 } = {}) {
  const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${contact})`;
  const list = [...new Set(titles)].filter(Boolean);
  const out = new Map();
  let last = 0;
  const mw = async (params) => {
    const wait = Math.max(0, concurrencyMs - (Date.now() - last)); if (wait) await sleep(wait); last = Date.now();
    const url = API + "?" + new URLSearchParams({ format: "json", origin: "*", ...params });
    let err;
    for (let a = 1; a <= 3; a++) {
      try {
        const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
        if (!r.ok) throw new Error(API + " " + r.status);
        return await r.json();
      } catch (e) { err = e; if (a < 3) await sleep(a * 1000); }
    }
    throw new Error(`adjudicate source unavailable after 3 attempts: ${url}\n${err}`);
  };
  for (let i = 0; i < list.length; i += 20) {
    const j = await mw({ action: "query", prop: "revisions", rvprop: "ids|timestamp|content",
      rvslots: "main", redirects: "1", titles: list.slice(i, i + 20).join("|") });
    const q = j?.query || {};
    const alias = new Map();
    for (const n of q.normalized || []) alias.set(n.from, n.to);
    for (const r of q.redirects || []) alias.set(r.from, r.to);
    const byTitle = new Map();
    for (const p of Object.values(q.pages || {})) {
      if (p.missing !== undefined) { byTitle.set(p.title, { title: p.title, missing: true }); continue; }
      const rev = p.revisions?.[0] || {};
      const wikitext = rev?.slots?.main?.["*"] || "";
      byTitle.set(p.title, { title: p.title, pageid: p.pageid, revision: rev.revid, timestamp: rev.timestamp,
        content_sha256: digest(wikitext), wikitext, url: wikiUrl(p.title), missing: false });
    }
    for (const [t, rec] of byTitle) out.set(t, rec);
    for (const t of list.slice(i, i + 20)) {          // map requested title -> canonical record
      let cur = t; for (let h = 0; h < 6 && alias.has(cur); h++) cur = alias.get(cur);
      out.set(t, byTitle.get(cur) || { title: cur, missing: true });
    }
    if (list.length > 20) console.log(`  pinned ${i + 1}-${Math.min(i + 20, list.length)} / ${list.length}`);
  }
  return out;
}

// Does an affirmative claim's basis text actually appear in the pinned page?
export const verifyBasis = (basis, wikitext) => {
  const b = normalizeText(basis);
  return b.length >= 8 && normalizeText(wikitext).includes(b);
};

/**
 * Pull the first sentence from a pinned page that matches ANY of `patterns`.
 * That sentence becomes a VERIFIED basis quote (it exists in the page by
 * construction). Searches the whole page — makeup/prosthetic and out-of-makeup
 * notes live in Makeup/Background sections, not the lead. Returns null when the
 * page does not affirmatively say it — exactly the signal to keep a verdict in
 * review rather than infer from silence.
 */
export function extractBasis(wikitext, patterns) {
  const sentences = normalizeText(wikitext).split(/(?<=[.!?])\s+/);
  for (const re of patterns) {
    const hit = sentences.find((s) => re.test(s) && s.length >= 12);
    if (hit) return hit.slice(0, 240);
  }
  return null;
}

// Build one pinned, verified claim from a pinned page + an affirmative basis.
export function pinnedClaim(pin, basis, establishes) {
  return {
    page: pin.title, source: pin.url, revision: pin.revision ?? null,
    content_sha256: pin.content_sha256 ?? null, basis, establishes,
    verified: pin.wikitext ? verifyBasis(basis, pin.wikitext) : false,
  };
}
