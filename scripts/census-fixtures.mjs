#!/usr/bin/env node
/**
 * census-fixtures.mjs — regression fixtures for the census text layer.
 * Reproduces the concrete leaks the second-desk review named: single-line
 * infoboxes promoting affiliations/patterns/organizations into performers,
 * and scope loading failing open on non-ENOENT I/O errors.
 *
 *   node scripts/census-fixtures.mjs    (exit 0 = all pass)
 */
import { performerFieldValues, namesFrom, loadScope, demoteCharacterTitledRows } from "./lib/census-core.mjs";
import { readFileSync, existsSync } from "node:fs";

let failures = 0;
function expect(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log(`  ok  ${label}`); }
  else { failures++; console.error(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
}
const extract = (wt) => [...new Set(performerFieldValues(wt).flatMap(namesFrom))];

// 1. Doctor Who shape: whole infobox on ONE physical line. The old line-based
//    capture ran through every later parameter and filed the affiliations as
//    performers ("Fourth Cyber Legion", "New Dalek Paradigm", "Rutan Host"...).
expect("single-line Dalek infobox keeps only the voice actor",
  extract(`{{Infobox Dalek|voice actor=[[Nicholas Briggs]]|affiliation=[[New Dalek Paradigm]], [[Fourth Cyber Legion]], [[Space Security Service]]|creator=[[Terry Nation]]}}`),
  ["Nicholas Briggs"]);

expect("single-line organizations never become performers",
  extract(`{{Infobox|species=[[Virus]]|actor=[[Jacqueline Pearce]]|allegiance=[[Reality Virus]], [[Papal Mainframe]], [[Rutan Host]]}}`),
  ["Jacqueline Pearce"]);

// 2. Muppet shape: performer field followed by puppet-pattern fields on the
//    same line ("Large Lavender Live Hand", "Fat Blue", "Orange Gold").
expect("Muppet pattern fields stay out of the performer set",
  extract(`{{character|performer=[[Jerry Nelson]]|pattern=[[Large Lavender Live Hand]]|color=[[Orange Gold]]}}`),
  ["Jerry Nelson"]);

// 3. Pipes inside links and nested templates belong to the value.
expect("piped link display text does not terminate the field",
  extract(`|actor=[[John Rhys-Davies|Rhys-Davies]] and [[Jane Wyatt]]\n|species=[[Human]]`),
  ["John Rhys-Davies", "Jane Wyatt"]);

expect("nested template inside the value is part of the value",
  extract(`|portrayed_by={{small|[[Andrew Robinson]]}}|affiliation=[[Obsidian Order]]`),
  ["Andrew Robinson"]);

// 4. Underscore and spaced parameter forms are the same trusted set;
//    near-miss parameter names are not examined at all.
expect("main_voice_actor and suit_actor forms are read",
  extract(`|main_voice_actor=[[Frank Welker]]|suit_actor=[[Haruo Nakajima]]`),
  ["Frank Welker", "Haruo Nakajima"]);

expect("non-performer parameters that merely contain 'actor' are ignored",
  extract(`|actor_footnotes=[[Not A Person]]|benefactor=[[Rich Uncle]]`),
  []);

// 5. A multi-line value still ends at the next top-level parameter.
expect("multi-line value ends at the next top-level pipe",
  extract(`|performer=[[Dave Goelz]],\n[[Steve Whitmire]]\n|designer=[[Jim Henson]]`),
  ["Dave Goelz", "Steve Whitmire"]);

// 6. Scope loading: ENOENT falls back, everything else aborts.
const enoent = await loadScope(async () => { const e = new Error("gone"); e.code = "ENOENT"; throw e; }, "x.json");
expect("ENOENT returns null (hand-list fallback allowed)", enoent, null);

for (const code of ["EACCES", "EISDIR", "EIO"]) {
  let threw = false;
  try { await loadScope(async () => { const e = new Error(code); e.code = code; throw e; }, "x.json"); }
  catch { threw = true; }
  expect(`${code} aborts the crawl`, threw, true);
}

let malformed = false;
try { await loadScope(async () => "{not json", "x.json"); } catch { malformed = true; }
expect("malformed JSON aborts the crawl", malformed, true);

let emptyScope = false;
try { await loadScope(async () => JSON.stringify({ included: [] }), "x.json"); } catch { emptyScope = true; }
expect("empty included[] refuses to narrow the hand list", emptyScope, true);

// 7. Parenthetical role/disguise annotations after a performer are not
//    performers; a wholly parenthesized list segment keeps its performer.
expect("(as Character) annotation is dropped",
  extract(`|actor=[[Kate Mulgrew]] (as [[Kathryn Janeway]])`),
  ["Kate Mulgrew"]);

expect("disguise annotation with nested detail is dropped",
  extract(`|actor=[[Scott Bakula]] (disguised as [[Charles Tucker III]] ([[mirror universe]]))`),
  ["Scott Bakula"]);

expect("wholly parenthesized list segment keeps its performer",
  extract(`|performer=[[Dave Goelz]], ([[Frank Welker]])`),
  ["Dave Goelz", "Frank Welker"]);

expect("annotations drop per segment, later segments keep their performers",
  extract(`|actor=[[Brett Gray]] (as [[Dal R'El]]), [[Kate Mulgrew]]`),
  ["Brett Gray", "Kate Mulgrew"]);

// 8. Fail-closed demotion: a performer that is a crawled character page title
//    is a fictional identity — only-characters and mixed cases both demote.
{
  const titles = new Set(["Cookie Monster", "Kathryn Janeway"]);
  const unresolved = [];
  const kept = demoteCharacterTitledRows([
    { franchise: "Muppets & Henson", category: "c", character: "Alistair Cookie", performers: ["Cookie Monster"], source: "s" },
    { franchise: "Star Trek", category: "c", character: "X", performers: ["Kathryn Janeway", "Real Person"], source: "s" },
    { franchise: "Star Trek", category: "c", character: "Y", performers: ["Kate Mulgrew"], source: "s" },
  ], unresolved, titles);
  expect("character-as-performer rows demote, clean rows survive",
    { kept: kept.map((r) => r.character), demoted: unresolved.map((r) => r.character) },
    { kept: ["Y"], demoted: ["Alistair Cookie", "X"] });
}

// 9. Committed-corpus assertions: the exact reviewed defects must never
//    quietly return to data/CENSUS.json.
if (existsSync("data/CENSUS.json")) {
  const corpus = JSON.parse(readFileSync("data/CENSUS.json", "utf8"));
  const performerSet = new Set(corpus.flatMap((row) => row.performers));
  const banned = ["Fourth Cyber Legion", "New Dalek Paradigm", "Reality Virus", "Papal Mainframe",
    "Rutan Host", "Space Security Service", "Large Lavender Live Hand", "Orange Gold", "Fat Blue",
    "Kathryn Janeway", "B'Elanna Torres", "The Face", "Jack Crusher", "Ocam Sadal",
    "Renée Picard", "Charles Tucker III", "Cookie Monster"];
  expect("committed corpus carries none of the reviewed false performers",
    banned.filter((name) => performerSet.has(name)), []);
}

console.log(failures ? `\n${failures} fixture(s) FAILED` : "\nall census fixtures pass");
process.exit(failures ? 1 : 0);
