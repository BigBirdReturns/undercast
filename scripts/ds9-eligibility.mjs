#!/usr/bin/env node
/**
 * ds9-eligibility.mjs — derive GROW.md eligibility from VERIFIED evidence. NO NETWORK.
 *
 * Consumes data/ds9/eligibility-evidence.json (built by ds9-eligibility-adjudicate.mjs:
 * per performer-character performance, with claim-level revision/hash/basis provenance).
 * A verdict is DERIVED only from verified, affirmative claims — never from species,
 * never from wall membership, never from the ABSENCE of a makeup mention:
 *
 *   eligible    — a verified claim documents a GROW qualifying transformation (heavy
 *                 prosthetics / mask / creature suit / motion capture / voice-only)
 *                 and the performer is not visible as themselves.
 *   ineligible  — a verified claim affirmatively says the performer is seen as
 *                 themselves (bare-faced, played himself, only a light appliance).
 *   review      — no verified affirmative claim either way. This is most rows, and
 *                 it is the honest state until sourced adjudication says otherwise.
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
  if (!ev) return { verdict: "review", reason: "No adjudicated evidence for this performance yet.", claims: [] };
  const verified = (ev.claims || []).filter((c) => c.verified);
  const transformation = verified.find((c) => c.type === "transformation");
  const appearsAsSelf = verified.find((c) => c.type === "appears-as-self");
  if (transformation && ev.visible_as_self !== true) {
    return { verdict: "eligible",
      reason: `${ev.transformation_type} affirmed on the pinned page ("${transformation.basis.slice(0, 90)}…"); the performer is not seen as themselves — GROW.md "vanishes under a designed face."`,
      claims: verified };
  }
  if (appearsAsSelf && !transformation) {
    return { verdict: "ineligible",
      reason: `The pinned page affirmatively shows the performer as themselves ("${appearsAsSelf.basis.slice(0, 90)}…") — GROW.md disqualifier.`,
      claims: verified };
  }
  return { verdict: "review",
    reason: `No verified affirmative evidence decides this yet (transformation_type "${ev.transformation_type}", visible_as_self ${ev.visible_as_self}). Absence of a makeup note is not evidence — held for adjudication.`,
    claims: verified };
}

const rulings = roster.map((row) => {
  const ev = EV[row.performer + "::" + row.character];
  const d = derive(ev);
  return {
    performer: row.performer, performer_pageid: row.performer_pageid,
    character: row.character, character_pageid: row.character_pageid,
    character_named: row.character_named, background_role: row.background_role,
    species: ev?.species || [],
    transformation_type: ev?.transformation_type || "unknown",
    visible_as_self: ev?.visible_as_self ?? null,
    verdict: d.verdict, reason: d.reason,
    citations: [{ claim: "GROW.md eligibility law", source: GROW }, ...d.claims.map((c) => ({
      claim: c.establishes, source: c.source, revision: c.revision, content_sha256: c.content_sha256, basis: c.basis }))],
    on_wall: row.role_on_wall, wall_ids: row.wall_ids, duplicate_key: row.duplicate_key,
  };
}).sort((a, b) => a.performer.localeCompare(b.performer) || a.character.localeCompare(b.character));

const by = (v) => rulings.filter((r) => r.verdict === v);
const eligible = by("eligible"), ineligible = by("ineligible"), review = by("review");
const decided = rulings.filter((r) => r.verdict !== "review");
const evidenceContradictsWall = rulings.filter((r) => r.on_wall && r.verdict === "ineligible");

const summary = {
  version: 3, production: "Star Trek: Deep Space Nine",
  law: "GROW.md — a real, verifiable performer who vanishes under a designed face",
  generated_from: ["data/ds9/roster.json", "data/ds9/eligibility-evidence.json"],
  method: "Verdicts are DERIVED from verified, affirmative, claim-level evidence (each pinned to a Memory Alpha revision + content hash). No affirmative evidence -> review. Species and wall membership never decide. Absence of a makeup mention is never treated as evidence of no makeup.",
  grow_types_implemented: GROW_TYPES,
  canonical_performances: rulings.length,
  eligible: eligible.length, ineligible: ineligible.length, review: review.length,
  every_decided_verdict_has_a_verified_pinned_claim: decided.every((r) =>
    r.citations.some((c) => c.revision && c.content_sha256 && c.basis)),
  diagnostic_evidence_contradicts_wall: evidenceContradictsWall.map((r) => ({ performer: r.performer, character: r.character, wall_ids: r.wall_ids, reason: r.reason })),
  note: "Honestly mostly review until adjudication broadens. Nothing here enters specimens.json.",
};

await writeFile("data/ds9/eligibility.json", JSON.stringify({ version: 3, count: rulings.length, rulings }, null, 1) + "\n");
await writeFile("data/ds9/eligibility-summary.json", JSON.stringify(summary, null, 1) + "\n");

console.log(`canonical performances: ${rulings.length}`);
console.log(`  eligible:   ${eligible.length}  (verified qualifying transformation)`);
console.log(`  ineligible: ${ineligible.length}  (verified appears-as-self)`);
console.log(`  review:     ${review.length}  (no affirmative evidence — honest)`);
console.log(`evidence-contradicts-wall: ${evidenceContradictsWall.length}`);
