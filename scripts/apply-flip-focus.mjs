#!/usr/bin/env node
/**
 * apply-flip-focus.mjs — set image crop focus from a vision measurement pass.
 *
 *   node scripts/apply-flip-focus.mjs <measurements.json>           # dry run
 *   node scripts/apply-flip-focus.mjs <measurements.json> --write   # apply
 *
 * The card crops the still and the portrait into an identical box, so the flip
 * only reads as one head becoming another if the head sits in the same place in
 * both. `focus` moves the crop window (index.html maps left/center/right to
 * 20/50/80% and top..bottom to 0..100%, default 50% 28%).
 *
 * What this fixes and what it cannot. Focus moves the window; it cannot zoom it.
 * A still where the head fills 0.85 of the frame and a portrait where it fills
 * 0.35 will still read as a zoom-out however the window is placed — those cards
 * are reported, not silently "fixed". Cards whose still contains no identifiable
 * head are a sourcing problem and go to the re-pick worklist; no crop value
 * rescues a character image that is a wide establishing shot.
 *
 * Writes data/FLIP-CRAFT.json: the scale mismatches and the re-pick worklist.
 */
import { readFile, writeFile } from "node:fs/promises";

const [, , inputPath] = process.argv;
const WRITE = process.argv.includes("--write");
if (!inputPath) { console.error("usage: apply-flip-focus.mjs <measurements.json> [--write]"); process.exit(2); }

const measured = JSON.parse(await readFile(inputPath, "utf8")).cards || [];
const specimens = JSON.parse(await readFile("data/specimens.json", "utf8"));
const byId = new Map(specimens.map((s) => [s.id, s]));

const X = new Set(["left", "center", "right"]);
const Y = new Set(["top", "upper", "center", "lower", "bottom"]);
const DEFAULT = (f) => f.x === "center" && f.y === "upper"; // already the CSS default

const setFocus = [], scaleMismatch = [], repick = [], unreadable = [];
let seen = 0;
for (const row of measured) {
  const card = byId.get(row.id);
  if (!card) continue;
  seen++;
  if (!row.readable) { unreadable.push(row.id); continue; }

  // A still with no identifiable head cannot be cropped into a face. That is a
  // sourcing failure, and the card keeps whatever it has until a better still
  // is found — never a crop value pretending the problem is framing.
  if (!row.still?.head_present) {
    repick.push({ id: row.id, character: card.character, actor: card.actor,
      reason: "still contains no identifiable head", note: row.still?.note || "" });
    continue;
  }
  if (!row.portrait?.head_present) {
    repick.push({ id: row.id, character: card.character, actor: card.actor,
      reason: "portrait contains no identifiable head", note: row.portrait?.note || "" });
    continue;
  }

  for (const side of ["still", "portrait"]) {
    const m = row[side];
    if (!X.has(m.head_x) || !Y.has(m.head_y)) continue;
    const focus = { x: m.head_x, y: m.head_y };
    if (DEFAULT(focus)) continue; // leave the default in place rather than restating it
    const current = card[side]?.focus;
    if (current && current.x === focus.x && current.y === focus.y) continue;
    setFocus.push({ id: row.id, side, focus, from: current || null });
  }

  const a = row.still?.head_fraction, b = row.portrait?.head_fraction;
  if (typeof a === "number" && typeof b === "number" && a > 0 && b > 0) {
    const ratio = Math.max(a, b) / Math.min(a, b);
    if (ratio >= 1.8) scaleMismatch.push({ id: row.id, character: card.character, actor: card.actor,
      still_head: a, portrait_head: b, ratio: Number(ratio.toFixed(2)),
      bigger: a > b ? "still" : "portrait" });
  }
}

const tally = (arr, f) => arr.reduce((o, x) => { const k = f(x); o[k] = (o[k] || 0) + 1; return o; }, {});
console.log(`measured cards matched to roster: ${seen}`);
console.log(`focus values to set: ${setFocus.length} (${tally(setFocus, (r) => r.side).still || 0} still, ${tally(setFocus, (r) => r.side).portrait || 0} portrait)`);
console.log(`scale mismatch >=1.8x: ${scaleMismatch.length}`);
console.log(`re-pick worklist: ${repick.length}`, JSON.stringify(tally(repick, (r) => r.reason)));
console.log(`unreadable: ${unreadable.length}`);

if (WRITE) {
  for (const row of setFocus) {
    const image = byId.get(row.id)[row.side];
    if (image) image.focus = row.focus;
  }
  await writeFile("data/specimens.json", JSON.stringify(specimens, null, 1) + "\n");
  console.log(`\nwritten: data/specimens.json (${setFocus.length} focus values)`);
}

const report = {
  version: 1, generated: "2026-07-20",
  semantics: "Flip craft measurement. The card crops both faces into an identical box, so the reveal only lands if the head sits in the same place at a similar size in both images. Head position and head size were measured by a vision pass over all 1252 images. Focus values (position) are applied to data/specimens.json; the two lists below are what focus cannot fix.",
  method: "126 vision agents over every card holding both a still and a portrait; each read both images and reported head presence, position, and the fraction of image height the head occupies.",
  counts: { measured: seen, focus_set: setFocus.length, scale_mismatch: scaleMismatch.length, repick: repick.length, unreadable: unreadable.length },
  scale_mismatch: {
    note: "Focus moves the crop window but cannot zoom it. These cards will still read as a zoom jump on the flip. Fixing them needs either a per-image scale value (a schema change, DEC-0008) or re-cropping the source files.",
    rows: scaleMismatch.sort((a, b) => b.ratio - a.ratio),
  },
  repick: {
    note: "A sourcing failure, not a framing one: no crop value rescues a character image with no head in it. These need scripts/curate.mjs to choose a better source image.",
    rows: repick,
  },
  unreadable,
};
await writeFile("data/FLIP-CRAFT.json", JSON.stringify(report, null, 1) + "\n");
console.log("wrote data/FLIP-CRAFT.json");
if (!WRITE) console.log("dry run — pass --write to apply focus values.");
