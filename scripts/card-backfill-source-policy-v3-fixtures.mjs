#!/usr/bin/env node
import assert from "node:assert/strict";
import { evaluateSourceCandidate, rankBoundCandidates, sourceSubjectAliases } from "./lib/card-backfill-source-policy-v3.mjs";

assert(sourceSubjectAliases("Dalek (voice)").includes("Daleks"));
assert(sourceSubjectAliases("K9 (voice)").includes("K9"));

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

const foreign = evaluateSourceCandidate({
  side: "still", expectedSubject: "Bugs Bunny", actor: "Joe Alaskey", production: "Looney Tunes", performanceMode: "voice-or-animation", actorEvidence: { character_windows: ["Joe Alaskey voiced Bugs Bunny"], production_windows: ["Looney Tunes"] },
  candidate: { file: "Bugs Bunny in MultiVersus trailer.png", page: { title: "Bugs Bunny", extract_windows: ["Bugs Bunny is a Looney Tunes character"] }, source: { description: "MultiVersus game trailer", categories: "MultiVersus" } },
});
assert.equal(foreign.eligible, false);
assert(foreign.reasons.includes("foreign-adaptation-or-merchandise"));

const k9 = evaluateSourceCandidate({
  side: "still", expectedSubject: "K9 (voice)", actor: "John Leeson", production: "Doctor Who", performanceMode: "voice-or-animation", actorEvidence: { character_windows: ["John Leeson voiced K9 in Doctor Who"], production_windows: ["Doctor Who"] },
  candidate: { file: "Doctor Who Experience 8105526993.jpg", page: { title: "K9 (Doctor Who)", extract_windows: ["K9 is a robotic dog from Doctor Who"] }, source: { description: "K9 prop at Doctor Who Experience", categories: "K9 Doctor Who" } },
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
