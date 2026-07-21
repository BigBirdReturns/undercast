#!/usr/bin/env node
/**
 * census-fixtures.mjs — regression fixtures for the census text layer.
 * Reproduces the concrete leaks the second-desk review named: single-line
 * infoboxes promoting affiliations/patterns/organizations into performers,
 * and scope loading failing open on non-ENOENT I/O errors.
 *
 *   node scripts/census-fixtures.mjs    (exit 0 = all pass)
 */
import { performerFieldValues, namesFrom, loadScope } from "./lib/census-core.mjs";

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

console.log(failures ? `\n${failures} fixture(s) FAILED` : "\nall census fixtures pass");
process.exit(failures ? 1 : 0);
