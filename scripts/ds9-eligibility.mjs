#!/usr/bin/env node
/**
 * ds9-eligibility.mjs — derive GROW.md eligibility from VERIFIED, THRESHOLD-MET,
 * PERFORMANCE-SPECIFIC evidence. NO NETWORK.
 *
 * Consumes data/ds9/eligibility-evidence.json (built by ds9-eligibility-adjudicate.mjs).
 * A verdict is derived only from claims that are verified (quote present in the
 * pinned revision), that clear the full-designed-face threshold, and that belong
 * to this performance. Species, wall membership, and the ABSENCE of a makeup note
 * never decide. Unknown is never treated as "not visible as themselves".
 *
 *   eligible    — a verified, threshold-meeting, applicable transformation claim
 *                 (full designed face / mask / suit / mocap / voice-only) and no
 *                 applicable bare-faced override.
 *   ineligible  — a verified, affirmative, applicable "seen as themselves" claim.
 *   review      — everything else (most rows; honest).
 *
 *   node scripts/ds9-eligibility.mjs
 */
import { readFile, writeFile } from "node:fs/promises";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const evidenceDoc = JSON.parse(await readFile("data/ds9/eligibility-evidence.json", "utf8"));
const EV = evidenceDoc.performances || {};
const GROW = "https://github.com/BigBirdReturns/undercast/blob/main/GROW.md";
const GROW_TYPES = evidenceDoc.grow_types || ["heavy-prosthetics", "mask", "creature-suit", "motion-capture", "voice-only"];

function derive(ev) {
  if (!ev) return { verdict: "review", reason: "No adjudicated evidence for this performance.", claims: [] };
  const transformation = (ev.claims || []).find((c) => c.type === "transformation" && c.verified && c.threshold && c.applies);
  const appearsAsSelf = (ev.claims || []).find((c) => c.type === "appears-as-self" && c.verified && c.affirmative && c.applies);
  if (appearsAsSelf) return { verdict: "ineligible",
    reason: `The pinned page affirmatively shows the performer as themselves ("${appearsAsSelf.basis.slice(0, 90)}…") — GROW.md disqualifier.`, claims: [appearsAsSelf] };
  if (transformation) return { verdict: "eligible",
    reason: `${transformation.establishes} — verified quote "${transformation.basis.slice(0, 90)}…"; the performer vanishes under a designed face (GROW.md).`, claims: [transformation] };
  return { verdict: "review",
    reason: `No verified, threshold-meeting, applicable evidence decides this yet (type "${ev.transformation_type}"${ev.hybrid ? ", hybrid species" : ""}). Absence of a makeup note is not evidence — held for adjudication.`, claims: [] };
}

const rulings = roster.map((row) => {
  const ev = EV[row.duplicate_key];
  const d = derive(ev);
  return {
    performer: row.performer, performer_pageid: row.performer_pageid,
    character: row.character, character_pageid: row.character_pageid,
    character_named: row.character_named, background_role: row.background_role,
    species: ev?.species || [], hybrid: ev?.hybrid || false,
    transformation_type: ev?.transformation_type || "unknown",
    verdict: d.verdict, reason: d.reason,
    citations: [{ claim: "GROW.md eligibility law", source: GROW }, ...d.claims.map((c) => ({
      claim: c.establishes, source: c.source, revision: c.revision, content_sha256: c.content_sha256, basis: c.basis, scope: c.scope }))],
    on_wall: row.role_on_wall, wall_ids: row.wall_ids, duplicate_key: row.duplicate_key,
  };
}).sort((a, b) => a.performer.localeCompare(b.performer) || a.character.localeCompare(b.character));

const by = (v) => rulings.filter((r) => r.verdict === v);
const eligible = by("eligible"), ineligible = by("ineligible"), review = by("review");
const decided = rulings.filter((r) => r.verdict !== "review");
const evidenceContradictsWall = rulings.filter((r) => r.on_wall && r.verdict === "ineligible");

const summary = {
  version: 4, production: "Star Trek: Deep Space Nine",
  law: "GROW.md — a real, verifiable performer who vanishes under a designed face",
  generated_from: ["data/ds9/roster.json", "data/ds9/eligibility-evidence.json"],
  method: "Verdicts derive only from claims that are verified (quote in the pinned revision), threshold-meeting (a FULL designed face — not teeth/contacts/light/anatomy), and applicable to this performance (species-level, or a character quote that does not name a different performer). Species, wall membership, and absence of evidence never decide.",
  grow_types_implemented: GROW_TYPES,
  canonical_performances: rulings.length,
  eligible: eligible.length, ineligible: ineligible.length, review: review.length,
  every_decided_verdict_has_a_verified_threshold_claim: decided.every((r) =>
    r.citations.some((c) => c.revision && c.content_sha256 && c.basis)),
  diagnostic_evidence_contradicts_wall: evidenceContradictsWall.map((r) => ({ performer: r.performer, character: r.character, wall_ids: r.wall_ids, reason: r.reason })),
  note: "Honestly mostly review. eligible rests on a verified full-designed-face quote (species-level for standard members, or performance-specific); hybrids and light-makeup species stay review absent a performance-specific full-face quote. Nothing here enters specimens.json.",
};

await writeFile("data/ds9/eligibility.json", JSON.stringify({ version: 4, count: rulings.length, rulings }, null, 1) + "\n");
await writeFile("data/ds9/eligibility-summary.json", JSON.stringify(summary, null, 1) + "\n");

console.log(`canonical performances: ${rulings.length}`);
console.log(`  eligible:   ${eligible.length}`);
console.log(`  ineligible: ${ineligible.length}`);
console.log(`  review:     ${review.length}`);
console.log(`evidence-contradicts-wall: ${evidenceContradictsWall.length}`);
