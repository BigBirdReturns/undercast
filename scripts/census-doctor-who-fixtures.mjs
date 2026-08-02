#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  extractDoctorWhoPage,
  namesFromDoctorWhoField,
  targetIdentity,
  templateFields,
} from "./lib/census-doctor-who.mjs";

assert.deepEqual(namesFromDoctorWhoField("Nicholas Briggs"), ["Nicholas Briggs"]);
assert.deepEqual(namesFromDoctorWhoField("Barnaby Edwards (actor)"), ["Barnaby Edwards"]);
assert.deepEqual(
  namesFromDoctorWhoField("Roy Skelton, Royce Mills, Brian Miller, Nicholas Briggs"),
  ["Roy Skelton", "Royce Mills", "Brian Miller", "Nicholas Briggs"],
);
assert.deepEqual(namesFromDoctorWhoField("Fourth Cyber Legion"), []);
assert.deepEqual(namesFromDoctorWhoField("unknown"), []);
assert.deepEqual(namesFromDoctorWhoField("Nicholas Briggs 2"), []);

const dalekSec = `{{Infobox Individual
|species = Dalek
|species2 = Human-Dalek
|actor = Eric Loren
|voice actor = Nicholas Briggs
}}`;
const sec = extractDoctorWhoPage({ category: "Daleks", title: "Dalek Sec", wikitext: dalekSec });
assert.equal(sec.disposition, "credited");
assert.deepEqual(sec.credits, [
  { performer: "Eric Loren", performance_mode: "unresolved", source_parameter: "actor" },
  { performer: "Nicholas Briggs", performance_mode: "voice", source_parameter: "voice actor" },
]);
assert.equal(sec.identity.basis, "species");

const ashad = extractDoctorWhoPage({
  category: "Cybermen",
  title: "Ashad",
  wikitext: `{{Infobox Individual|species=Human|species2=Cyberman|actor=Patrick O'Kane}}`,
});
assert.equal(ashad.disposition, "credited");
assert.equal(ashad.credits[0].performer, "Patrick O'Kane");
assert.equal(ashad.credits[0].performance_mode, "unresolved");

const supreme = extractDoctorWhoPage({
  category: "Daleks",
  title: "Supreme Dalek",
  wikitext: `{{Infobox Individual|voice actor=Nicholas Briggs}}`,
});
assert.equal(supreme.disposition, "credited");
assert.equal(supreme.identity.basis, "title");

const human = extractDoctorWhoPage({
  category: "Daleks",
  title: "Tasha Lem",
  wikitext: `{{Infobox Individual|species=Humanoid|actor=Orla Brady}}`,
});
assert.equal(human.disposition, "out-of-scope");
assert.deepEqual(human.credits, []);

const unresolved = extractDoctorWhoPage({
  category: "Cybermen",
  title: "Mobile conversion unit",
  wikitext: `{{Infobox Object|voice actor=Nicholas Briggs}}`,
});
assert.equal(unresolved.disposition, "unresolved");
assert.deepEqual(unresolved.credits, []);

const empty = extractDoctorWhoPage({
  category: "Sontarans",
  title: "Styre",
  wikitext: `{{Infobox Individual|species=Sontaran|actor=}}`,
});
assert.equal(empty.disposition, "unresolved");
assert.match(empty.reason, /empty/);

const rejected = extractDoctorWhoPage({
  category: "Ice Warriors",
  title: "Varga",
  wikitext: `{{Infobox Individual|species=Ice Warrior|actor=unknown}}`,
});
assert.equal(rejected.disposition, "unresolved");
assert.equal(rejected.rejected_fields.length, 1);

const fields = templateFields(`{{Infobox Individual|species=Human|species2=Cyberman|actor=Patrick O'Kane}}`);
assert.deepEqual(fields.map((field) => field.parameter), ["species", "species2", "actor"]);
assert.equal(targetIdentity({ category: "Cybermen", title: "Ashad", fields }).status, "target");

console.log("PASS — Doctor Who plain-text performer fields, exact target identity, mode custody, exclusions, and unresolved values");
