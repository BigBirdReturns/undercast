#!/usr/bin/env node
/** Offline contract fixtures for the owner-controlled maker-credit queue. */
import { readFile } from "node:fs/promises";
import {
  ENTITY_TYPES, ROLE_CATEGORIES, normalizeBasis, receiptId,
  validateDecision, validateDecisions,
} from "./lib/maker.mjs";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const evidence = JSON.parse(await readFile("data/ds9/maker-evidence.json", "utf8"));
const decisions = JSON.parse(await readFile("data/ds9/maker-decisions.json", "utf8"));
const queueDoc = JSON.parse(await readFile("data/ds9/maker-queue.json", "utf8"));
const observations = JSON.parse(await readFile("data/ds9/observations.json", "utf8")).observations || [];
const episodeTitles = [...new Set(observations
  .map((item) => item.title)
  .filter((title) => /\(episode\)$/.test(title || ""))
  .map((title) => normalizeBasis(title.replace(/\s*\(episode\)$/, ""))))];
const receipts = Object.values(evidence.receipts || {});
const queue = queueDoc.queue;

let failures = 0;
const check = (name, condition, detail = "") => {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}${condition ? "" : ` <- ${detail}`}`);
  if (!condition) failures++;
};
const receipt = (ordinal) => receipts.find((item) => item.reader_assertion.ordinal === ordinal);
const performance = (performer, character) => roster.find((row) => row.performer === performer && row.character === character);

console.log("== DS9 maker-credit owner-review contract ==");

check("evidence and decision documents are v3", evidence.version === 3 && decisions.version === 3 && queueDoc.version === 3);
check("all 47 raw fan-out claims survive as one receipt each", receipts.length === 47, `got ${receipts.length}`);
check("receipt ids are full content addresses and recompute exactly",
  receipts.every((item) => /^mkr:sha256:[0-9a-f]{64}$/.test(item.id) && item.id === receiptId(item)));
check("receipt ids are globally unique", new Set(receipts.map((item) => item.id)).size === receipts.length);
check("verified receipts are pinned to revision, content hash, page, URL, and basis",
  receipts.filter((item) => item.verified).every((item) => item.source.revision && item.source.content_sha256 && item.source.page && item.source.url && item.source.basis));
check("machine evidence contains no substantive/verdict/credit field",
  receipts.every((item) => !("substantive" in item) && !("credits" in item) && !("verdict" in item)));
check("signals are explicitly non-authoritative and only reference roster keys",
  receipts.every((item) => item.signals.note.includes("Non-authoritative") && item.signals.possible_duplicate_keys.every((key) => roster.some((row) => row.duplicate_key === key))));

const aggregate = /^Unnamed |(?:personnel|residents|visitors)$|Dabo girls/i;
check("aggregate/pronoun claims attach to zero performance signals",
  receipts.filter((item) => item.reader_assertion.scope === "character" && aggregate.test(item.reader_assertion.key || ""))
    .every((item) => item.signals.possible_duplicate_keys.length === 0));
check("Tracee Lee Cocco receipt is not substituted onto Daniel Reardon",
  !receipt(7).signals.possible_duplicate_keys.includes("p139210|c269567"));

const rosterKeys = new Set(roster.map((row) => row.duplicate_key));
const evidenceKeys = new Set(Object.keys(evidence.performances || {}));
const queueKeys = new Set(queue.map((item) => item.duplicate_key));
const setEqual = (a, b) => a.size === b.size && [...a].every((key) => b.has(key));
check("roster, performance-signal projection, and queue keys are exact sets",
  setEqual(rosterKeys, evidenceKeys) && setEqual(evidenceKeys, queueKeys));

const validation = validateDecisions(decisions, evidence, roster, episodeTitles);
check("committed owner decisions are valid", validation.errors.length === 0, validation.errors.slice(0, 3).join("; "));
check("empty owner file leaves all 557 performances in review",
  validation.applied.size === 0 && queue.length === 557 && queue.every((item) => item.status === "review" && item.credits === null));
check("signals never change review status", queue.every((item) => item.status === "review"));
check("v2 decision documents fail closed", validateDecisions({ version: 2, decisions: [] }, evidence, roster, episodeTitles).errors.length > 0);

const runepp = performance("John Paul Lona", "Runepp");
const runeppReceipt = receipt(1);
const goodCredit = {
  maker: { entity_type: "person", name: "John Paul Lona", authority_id: "memory-alpha:John_Paul_Lona" },
  role: { category: "makeup_design", source_label: "designing the make-up" },
  credit_scope: "performance",
  supports: [{
    receipt_id: runeppReceipt.id,
    mode: "direct",
    maker_basis: "John Paul Lona",
    target_basis: "Runepp",
    production_basis: "DS9",
    applicability_rationale: "The receipt names Lona, Runepp, DS9, and the makeup-design work directly.",
  }],
};
const goodDecision = {
  duplicate_key: runepp.duplicate_key,
  coverage: "partial",
  credits: [goodCredit],
  rationale: "One directly evidenced design credit is established; completeness is not asserted.",
  decided_by: "owner",
  date: "2026-07-14",
  grow_md_version: "GROW.md@e50f7acd68baa116dca86a6525b11e09f6d7df8b",
};
check("a direct, quote-spanned, policy-pinned partial credit is accepted",
  validateDecision(goodDecision, evidence, roster, episodeTitles).ok,
  validateDecision(goodDecision, evidence, roster, episodeTitles).errors.join("; "));
check("coverage complete is an explicit owner state, not inferred",
  validateDecision({ ...goodDecision, coverage: "complete" }, evidence, roster, episodeTitles).ok);
check("one valid partial decision projects exactly one partial performance",
  (() => { const result = validateDecisions({ version: 3, decisions: [goodDecision] }, evidence, roster, episodeTitles); return result.applied.size === 1 && result.applied.get(runepp.duplicate_key)?.coverage === "partial"; })());

const bad = (mutate) => !validateDecision(mutate(structuredClone(goodDecision)), evidence, roster, episodeTitles).ok;
check("missing immutable GROW pin is rejected", bad((decision) => { delete decision.grow_md_version; return decision; }));
check("unknown/unsupported role is rejected", bad((decision) => { decision.credits[0].role.category = "unknown"; return decision; }));
check("maker entity type is validated", bad((decision) => { decision.credits[0].maker.entity_type = "mystery"; return decision; }));
check("maker basis must be an exact receipt span naming the credited maker", bad((decision) => { decision.credits[0].supports[0].maker_basis = "Somebody Else"; return decision; }));
check("work label must be an exact receipt span", bad((decision) => { decision.credits[0].role.source_label = "supervised all makeup"; return decision; }));
check("target basis must be an exact receipt span", bad((decision) => { decision.credits[0].supports[0].target_basis = "Martok"; return decision; }));
check("production basis must be an exact receipt span", bad((decision) => { decision.credits[0].supports[0].production_basis = "Voyager"; return decision; }));
check("stale receipt ids are rejected", bad((decision) => { decision.credits[0].supports[0].receipt_id = "mkr:sha256:" + "0".repeat(64); return decision; }));
check("duplicate supports are rejected", bad((decision) => { decision.credits[0].supports.push(structuredClone(decision.credits[0].supports[0])); return decision; }));
check("design-lineage credits require a verified bridge", bad((decision) => { decision.credits[0].credit_scope = "design_lineage"; decision.credits[0].supports[0].mode = "design_lineage"; return decision; }));
check("an invalid calendar date is rejected", bad((decision) => { decision.date = "2026-13-40"; return decision; }));
check("a non-roster performance is rejected", bad((decision) => { decision.duplicate_key = "p0|c0"; return decision; }));

for (const [name, ordinal, performer, character] of [
  ["TNG Alexander", 12, "Marc Worden", "Alexander Rozhenko"],
  ["Season-4 Ziyal", 4, "Melanie Smith", "Tora Ziyal"],
  ["PIC Romulan", 44, "Adrienne Barbeau", "Kimara Cretak"],
  ["franchise-wide Worf", 14, "Michael Dorn", "Worf"],
  ["Laas alternate form", 9, "J.G. Hertzler", "Laas"],
]) {
  const row = performance(performer, character);
  const item = receipt(ordinal);
  const decision = structuredClone(goodDecision);
  decision.duplicate_key = row.duplicate_key;
  decision.credits[0].maker.name = item.reader_assertion.maker;
  decision.credits[0].maker.authority_id = `reader:${ordinal}`;
  decision.credits[0].role.source_label = item.reader_assertion.maker;
  decision.credits[0].supports[0] = {
    receipt_id: item.id, mode: "direct",
    maker_basis: item.reader_assertion.maker,
    target_basis: character,
    production_basis: "DS9",
    applicability_rationale: "Adversarial attempt to attach context as a direct performance credit.",
  };
  check(`${name} receipt cannot auto-attach as direct DS9 performance evidence`,
    !validateDecision(decision, evidence, roster, episodeTitles).ok);
}

check("vocabulary separates maker entity and credited work",
  ENTITY_TYPES.includes("organization") && ROLE_CATEGORIES.includes("makeup_application") && !ROLE_CATEGORIES.includes("unknown"));

console.log(`\n${failures ? `${failures} FIXTURE(S) FAILED` : "all contract fixtures passed"}`);
process.exit(failures ? 1 : 0);
