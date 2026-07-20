#!/usr/bin/env node
/**
 * apply-transform-rulings.mjs — apply adjudicated transform rulings to the roster.
 *
 *   node scripts/apply-transform-rulings.mjs <rulings.json>            # dry run
 *   node scripts/apply-transform-rulings.mjs <rulings.json> --write    # apply
 *
 * Applies ONLY what a family principle actually settled. A ruling is refused
 * when it is low-confidence, when it departs from its family principle without
 * saying so, when the card carries an unresolved rubric-gap flag
 * (paint-vs-structure, face-vs-body — those are owner taxonomy questions, not
 * scoring errors), or when the ruling would move a value by more than 2 points
 * (a jump that large means the card text, not the grade, is the problem).
 *
 * Every applied change is journalled to data/journal/transform.jsonl with the
 * before value, the after value, the family principle that governed it, and the
 * ruling's own reasoning — so any grade on the wall can be traced to the ruling
 * that set it and reverted as a set.
 */
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";

const [, , rulingsPath] = process.argv;
const WRITE = process.argv.includes("--write");
if (!rulingsPath) { console.error("usage: apply-transform-rulings.mjs <rulings.json> [--write]"); process.exit(2); }

const payload = JSON.parse(await readFile(rulingsPath, "utf8"));
const rulings = payload.rulings || [];
const principles = new Map((payload.principles || []).map((p) => [p.family, p]));
const queue = JSON.parse(await readFile("data/TRANSFORM-REVIEW.json", "utf8"));
const familyOf = new Map(queue.rows.map((r) => [r.id, r.family]));
const gapOf = new Map(queue.rows.map((r) => [r.id, r.rubric_gap || "none"]));

const specimens = JSON.parse(await readFile("data/specimens.json", "utf8"));
const byId = new Map(specimens.map((s) => [s.id, s]));

const applied = [], refused = [];
const seen = new Set();
for (const ruling of rulings) {
  const card = byId.get(ruling.id);
  const reason = (why) => refused.push({ id: ruling.id, why, from: card?.transform, to: ruling.resolved });
  if (!card) { reason("no such card"); continue; }
  if (seen.has(ruling.id)) { reason("duplicate ruling"); continue; }
  seen.add(ruling.id);
  if (ruling.resolved === card.transform) { reason("no change"); continue; }
  if (ruling.confidence === "low") { reason("low confidence"); continue; }
  if (ruling.follows_principle === false) { reason("departs from family principle — leave for owner"); continue; }
  // Rubric gaps used to refuse here. docs/TRANSFORM-RUBRIC.md now carries
  // standing rulings for both (paint scored by coverage; bodily transformation
  // graded by the face rule and flagged for eligibility), so a gap flag is a
  // routing note, not a blocker.
  // A large move is not automatically suspect: correcting an inflated grade to
  // the truth is exactly what the standing rulings do (a bodily transformation
  // filed at 4 belongs at 1). Only a full-scale flip — one extreme to the other
  // — indicates the card text rather than the grade is wrong.
  if (Math.abs(ruling.resolved - card.transform) > 3) { reason("flips the full scale"); continue; }
  // A ruling is only trustworthy if it was made under the principle for the
  // family the card actually belongs to. An earlier pass matched family
  // keywords against reveal prose and put Spock in front of a lucha-libre
  // agent; refuse rather than trust a ruling whose governing principle is
  // unknown or belongs to another family.
  const family = familyOf.get(ruling.id) || "individual";
  if (ruling.family && ruling.family !== family) { reason(`ruled under family ${ruling.family}, card is ${family}`); continue; }
  // A family ruling must cite the principle that governed it. Individual rows
  // are ruled directly against docs/TRANSFORM-RUBRIC.md and have no family
  // principle to match.
  if (family !== "individual" && ruling.family && !principles.has(family)) { reason(`no principle on record for family ${family}`); continue; }
  applied.push({
    id: ruling.id, character: card.character, actor: card.actor,
    family: familyOf.get(ruling.id) || "individual",
    from: card.transform, to: ruling.resolved,
    confidence: ruling.confidence, reasoning: ruling.reasoning,
  });
}

const tally = (arr, f) => arr.reduce((a, x) => { const k = f(x); a[k] = (a[k] || 0) + 1; return a; }, {});
console.log(`rulings in: ${rulings.length}`);
console.log(`applicable: ${applied.length}  refused: ${refused.length}`);
console.log("applied by family:", JSON.stringify(tally(applied, (r) => r.family)));
console.log("applied by move:", JSON.stringify(tally(applied, (r) => `${r.from}->${r.to}`)));
console.log("refusals:", JSON.stringify(tally(refused, (r) => r.why)));

if (!WRITE) {
  console.log("\ndry run — pass --write to apply, then rebuild projections and validate.");
  for (const row of applied.slice(0, 15)) console.log(`  ${row.id} ${row.from}->${row.to} ${row.character} — ${row.actor} [${row.family}]`);
  process.exit(0);
}

for (const row of applied) byId.get(row.id).transform = row.to;
await writeFile("data/specimens.json", JSON.stringify(specimens, null, 1) + "\n");

await mkdir("data/journal", { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const lines = applied.map((row) => JSON.stringify({
  op: "transform.apply", date: stamp, specimen: row.id, actor_name: row.actor, character: row.character,
  family: row.family, from: row.from, to: row.to, confidence: row.confidence,
  principle: principles.get(row.family)?.principle || "", reasoning: row.reasoning,
})).join("\n");
await appendFile("data/journal/transform.jsonl", lines + "\n");
console.log(`\nwritten: data/specimens.json (${applied.length} grades changed)`);
console.log("journalled: data/journal/transform.jsonl");
