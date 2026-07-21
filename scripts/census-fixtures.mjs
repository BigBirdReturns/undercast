#!/usr/bin/env node
/**
 * census-fixtures.mjs — regression fixtures for the census text layer.
 * Reproduces the concrete leaks the second-desk review named: single-line
 * infoboxes promoting affiliations/patterns/organizations into performers,
 * and scope loading failing open on non-ENOENT I/O errors.
 *
 *   node scripts/census-fixtures.mjs    (exit 0 = all pass)
 */
import { readFile } from "node:fs/promises";
import { performerFieldValues, namesFrom, loadScope, demoteCharacterOnlyPerformers } from "./lib/census-core.mjs";

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

expect("parenthetical disguise links are annotations, not performers",
  extract(`|played by=[[Garth Kemp]] (as [[The Face]]), [[Kate Mulgrew]] (posing as [[Kathryn Janeway]])`),
  ["Garth Kemp", "Kate Mulgrew"]);

expect("parenthesized performer at a new segment remains a performer",
  extract(`|played by=[[Jane Actor]] (adult), ([[June Actor]] as a child)`),
  ["Jane Actor", "June Actor"]);

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

// 6. Character-on-character performer fields are not human credits.
const demoted = demoteCharacterOnlyPerformers(
  [{ franchise: "Muppets & Henson", category: "Sesame Street Characters", character: "Alistair Cookie",
    performers: ["Cookie Monster"], performance_mode: "unresolved", source: "https://example.test/alistair" }],
  [{ franchise: "Muppets & Henson", category: "Sesame Street Characters", character: "Cookie Monster",
    performance_mode: "unresolved", source: "https://example.test/cookie", reason: "fixture" }],
  "Muppets & Henson");
expect("character-only performer field is demoted", demoted.rows.length, 0);
expect("character-only performer field becomes unresolved", demoted.unresolved.at(-1).character, "Alistair Cookie");

let mixedThrew = false;
try {
  demoteCharacterOnlyPerformers(
    [{ franchise: "Muppets & Henson", category: "Sesame Street Characters", character: "Alistair Cookie",
      performers: ["Frank Oz", "Cookie Monster"], source: "https://example.test/alistair" }],
    [{ franchise: "Muppets & Henson", category: "Sesame Street Characters", character: "Cookie Monster",
      source: "https://example.test/cookie", reason: "fixture" }],
    "Muppets & Henson");
} catch { mixedThrew = true; }
expect("mixed human/character performer field fails closed", mixedThrew, true);

// 7. Scope loading: ENOENT falls back, everything else aborts.
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

// 8. The committed regenerated corpus must not carry the exact semantic leaks
// that motivated the second-desk review, and Muppet performers may not resolve
// to another captured Muppet character page.
const committed = JSON.parse(await readFile("data/CENSUS.json", "utf8"));
const forbidden = new Set(["The Face", "Ocam Sadal", "Kathryn Janeway", "B'Elanna Torres",
  "Fourth Cyber Legion", "New Dalek Paradigm", "Reality Virus", "Papal Mainframe",
  "Rutan Host", "Large Lavender Live Hand", "Orange Gold"]);
const leaked = committed.flatMap((row) => row.performers
  .filter((name) => forbidden.has(name)).map((name) => `${row.franchise}/${row.character}/${name}`));
expect("known fictional performer leaks are absent from committed census", leaked, []);

const norm = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, " ").trim().toLowerCase();
const unresolvedCorpus = JSON.parse(await readFile("data/CENSUS-UNRESOLVED.json", "utf8"));
const muppetTitles = new Set([...committed, ...unresolvedCorpus]
  .filter((row) => row.franchise === "Muppets & Henson").map((row) => norm(row.character)));
const muppetCharacterCredits = committed.filter((row) => row.franchise === "Muppets & Henson")
  .flatMap((row) => row.performers.filter((name) => muppetTitles.has(norm(name)))
    .map((name) => `${row.character}/${name}`));
expect("Muppet character pages are not promoted as human performers", muppetCharacterCredits, []);

console.log(failures ? `\n${failures} fixture(s) FAILED` : "\nall census fixtures pass");
process.exit(failures ? 1 : 0);
