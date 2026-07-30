#!/usr/bin/env node
import assert from "node:assert/strict";
import { evaluateSourceCandidate, rankBoundCandidates, sourceSubjectAliases } from "./lib/card-backfill-source-policy-v3.mjs";

assert(sourceSubjectAliases("Dalek (voice)").includes("Daleks"));
assert(sourceSubjectAliases("K9 (voice)").includes("K9"));
assert(sourceSubjectAliases("Ursula the Sea Witch").includes("Ursula"));

const role = {
  character_windows: ["David Graham voiced the Daleks in Doctor Who."],
  production_windows: ["David Graham voiced the Daleks in Doctor Who."],
};
const dalek = evaluateSourceCandidate({
  side: "still", expectedSubject: "Dalek (voice)", actor: "David Graham", production: "Doctor Who", performanceMode: "voice-or-animation", actorEvidence: role,
  candidate: { file: "Dalek - Doctor Who.jpg", page: { title: "Dalek", extract_windows: ["Daleks are fictional mutants from Doctor Who."] }, source: { description: "Dalek from Doctor Who", categories: "Doctor Who Daleks" } },
});
assert.equal(dalek.eligible, true);
assert.equal(dalek.explicit_chain, true);

const rocketCharacterPage = evaluateSourceCandidate({
  side: "still", expectedSubject: "Rocket (voice)", actor: "Bradley Cooper", production: "Guardians of the Galaxy", performanceMode: "voice-or-animation", actorEvidence: null,
  candidate: { file: "Rocket Raccoon Guardians of the Galaxy Vol 3.png", page: { title: "Rocket (Marvel Cinematic Universe)", extract_windows: ["Rocket is voiced by Bradley Cooper and joins the Guardians of the Galaxy."] }, source: { description: "Rocket Raccoon in Guardians of the Galaxy Vol. 3", categories: "Guardians of the Galaxy characters" } },
});
assert.equal(rocketCharacterPage.eligible, true);
assert.equal(rocketCharacterPage.facts.character_page_role_bound, true);

const ursulaCharacterPage = evaluateSourceCandidate({
  side: "still", expectedSubject: "Ursula the Sea Witch", actor: "Pat Carroll", production: "The Little Mermaid", performanceMode: "voice-or-animation", actorEvidence: null,
  candidate: { file: "Ursula The Little Mermaid.png", page: { title: "Ursula (The Little Mermaid)", extract_windows: ["Ursula is voiced by Pat Carroll in The Little Mermaid."] }, source: { description: "Ursula from The Little Mermaid", categories: "The Little Mermaid characters" } },
});
assert.equal(ursulaCharacterPage.eligible, true);
assert.equal(ursulaCharacterPage.facts.exact_subject_page, true);

const streetSign = evaluateSourceCandidate({
  side: "still", expectedSubject: "Ned Flanders", actor: "Harry Shearer", production: "The Simpsons", performanceMode: "voice-or-animation", actorEvidence: { character_windows: ["Harry Shearer voices Ned Flanders in The Simpsons"], production_windows: ["The Simpsons"] },
  candidate: { file: "Flanders St Portland.jpg", page: { title: "Ned Flanders", extract_windows: ["Ned Flanders is a character in The Simpsons."] }, source: { description: "street sign", categories: "Streets in Portland" } },
});
assert.equal(streetSign.eligible, false);
assert(streetSign.reasons.includes("generic-non-depiction-asset"));

const actorPortrait = evaluateSourceCandidate({
  side: "still", expectedSubject: "Samurai Jack", actor: "Phil LaMarr", production: "Samurai Jack", performanceMode: "voice-or-animation", actorEvidence: { character_windows: ["Phil LaMarr voices Samurai Jack"], production_windows: ["Samurai Jack"] },
  candidate: { file: "Phil LaMarr.jpg", page: { title: "Phil LaMarr", extract_windows: ["Phil LaMarr voices Samurai Jack"] }, source: { description: "Phil LaMarr portrait", categories: "Actors" } },
});
assert.equal(actorPortrait.eligible, false);
assert(actorPortrait.reasons.includes("actor-page-is-not-character-still"));

const humanEventPhoto = evaluateSourceCandidate({
  side: "still", expectedSubject: "Shaggy Rogers", actor: "Casey Kasem", production: "Scooby-Doo", performanceMode: "voice-or-animation", actorEvidence: { character_windows: ["Casey Kasem voiced Shaggy Rogers in Scooby-Doo"], production_windows: ["Scooby-Doo"] },
  candidate: { file: "Will Forte at WonderCon 2023.jpg", page: { title: "Shaggy Rogers", extract_windows: ["Shaggy Rogers is a Scooby-Doo character."] }, source: { description: "Actor Will Forte speaking at a WonderCon panel discussion", categories: "Actors at WonderCon" } },
});
assert.equal(humanEventPhoto.eligible, false);
assert(humanEventPhoto.reasons.includes("human-event-photo-for-character-still"));

const foreign = evaluateSourceCandidate({
  side: "still", expectedSubject: "Bugs Bunny", actor: "Joe Alaskey", production: "Looney Tunes", performanceMode: "voice-or-animation", actorEvidence: { character_windows: ["Joe Alaskey voiced Bugs Bunny"], production_windows: ["Looney Tunes"] },
  candidate: { file: "Bugs Bunny in MultiVersus trailer.png", page: { title: "Bugs Bunny", extract_windows: ["Bugs Bunny is a Looney Tunes character"] }, source: { description: "MultiVersus game trailer", categories: "MultiVersus" } },
});
assert.equal(foreign.eligible, false);
assert(foreign.reasons.includes("foreign-adaptation-or-merchandise"));

const sculpture = evaluateSourceCandidate({
  side: "still", expectedSubject: "Groot (voice)", actor: "Vin Diesel", production: "Guardians of the Galaxy", performanceMode: "voice-or-animation", actorEvidence: { character_windows: ["Vin Diesel voices Groot in Guardians of the Galaxy"], production_windows: ["Guardians of the Galaxy"] },
  candidate: { file: "I'm Groot.jpg", page: { title: "Groot", extract_windows: ["Vin Diesel voices Groot in Guardians of the Galaxy"] }, source: { description: "Wooden figure at a public wetland", categories: "Guardians of the Galaxy|Outdoor sculptures" } },
});
assert.equal(sculpture.eligible, false);
assert(sculpture.reasons.includes("foreign-adaptation-or-merchandise"));

const k9 = evaluateSourceCandidate({
  side: "still", expectedSubject: "K9 (voice)", actor: "John Leeson", production: "Doctor Who", performanceMode: "voice-or-animation", actorEvidence: { character_windows: ["John Leeson voiced K-9 in Doctor Who"], production_windows: ["Doctor Who"] },
  candidate: { file: "Doctor Who Experience 8105526993.jpg", page: { title: "K9 (Doctor Who)", extract_windows: ["K-9 is a robotic dog from Doctor Who"] }, source: { description: "K9 prop at Doctor Who Experience", categories: "K9 Doctor Who" } },
});
assert.equal(k9.eligible, true);

const multi = evaluateSourceCandidate({
  side: "still", expectedSubject: "Yoda & Admiral Ackbar", actor: "Tom Kane", production: "Star Wars: The Clone Wars", performanceMode: "voice-or-animation", actorEvidence: { character_windows: ["Tom Kane voiced Yoda and Admiral Ackbar"], production_windows: ["The Clone Wars"] },
  candidate: { file: "Yoda.png", page: { title: "Yoda", extract_windows: ["Yoda in Star Wars: The Clone Wars"] }, source: { description: "Yoda", categories: "Star Wars" } },
});
assert.equal(multi.eligible, false);
assert(multi.reasons.includes("requires-multi-subject-composite"));

const ranked = rankBoundCandidates([
  { score: 400, file: "Flanders St Portland.jpg", page: { title: "Ned Flanders", extract_windows: ["Ned Flanders is a character in The Simpsons"] }, source: { description: "street sign", categories: "Streets" } },
  { score: 200, file: "Ned Flanders The Simpsons.png", page: { title: "Ned Flanders", extract_windows: ["Ned Flanders is a character in The Simpsons"] }, source: { description: "Ned Flanders from The Simpsons", categories: "The Simpsons characters" } },
], { side: "still", expectedSubject: "Ned Flanders", actor: "Harry Shearer", production: "The Simpsons", performanceMode: "voice-or-animation", actorEvidence: { character_windows: ["Harry Shearer voices Ned Flanders in The Simpsons"], production_windows: ["The Simpsons"] } });
assert.equal(ranked[0].file, "Ned Flanders The Simpsons.png");
assert.equal(ranked[0].binding.eligible, true);

console.log("card-backfill source-policy v3 fixtures: PASS");
