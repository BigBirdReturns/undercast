#!/usr/bin/env node
import assert from "node:assert/strict";
import { evaluateSourceCandidate, sourceSubjectAliases } from "./lib/card-backfill-source-policy-v3.mjs";

assert(!sourceSubjectAliases("Chappie").includes("Chappies"), "ordinary filed labels may not invent unsafe plurals");

const chappiesBubblegum = evaluateSourceCandidate({
  side: "still",
  expectedSubject: "Chappie",
  actor: "Sharlto Copley",
  production: "Chappie",
  performanceMode: "physical-or-live-action",
  actorEvidence: { character_windows: ["Sharlto Copley played Chappie in Chappie"], production_windows: ["Chappie"] },
  candidate: {
    file: 'Chappie "Did You Know" fact, framed.jpg',
    page: { title: "Chappies", extract_windows: ["Chappies is a brand of bubblegum"] },
    source: { description: "framed bubblegum wrapper", categories: "Chappies bubblegum" },
  },
});
assert.equal(chappiesBubblegum.eligible, false);
assert.equal(chappiesBubblegum.facts.exact_subject_page, false);
assert(chappiesBubblegum.reasons.includes("generic-non-depiction-asset"));

const greggsStorefront = evaluateSourceCandidate({
  side: "still",
  expectedSubject: "Greg the Bunny",
  actor: "Dan Milano",
  production: "Greg the Bunny",
  performanceMode: "voice-or-animation",
  actorEvidence: { character_windows: ["Dan Milano performed Greg the Bunny"], production_windows: ["Greg the Bunny"] },
  candidate: {
    file: "Greggs store front.jpg",
    page: { title: "Greggs", extract_windows: ["Greggs is a British bakery chain"] },
    source: { description: "bakery store front", categories: "Greggs" },
  },
});
assert.equal(greggsStorefront.eligible, false);
assert(greggsStorefront.reasons.includes("candidate-file-not-explicitly-bound-to-subject"));
assert(greggsStorefront.reasons.includes("generic-non-depiction-asset"));

const wrongActorPressPhoto = evaluateSourceCandidate({
  side: "still",
  expectedSubject: "Luke Skywalker",
  actor: "David Menkin",
  production: "Lego Star Wars: The Skywalker Saga",
  performanceMode: "voice-or-animation",
  actorEvidence: { character_windows: ["David Menkin voiced Luke Skywalker"], production_windows: ["Lego Star Wars: The Skywalker Saga"] },
  candidate: {
    file: "Mark Hamill 1980.jpg",
    page: { title: "Luke Skywalker", extract_windows: ["Luke Skywalker appears in Lego Star Wars: The Skywalker Saga"] },
    source: { description: "American actor Mark Hamill after a press conference", categories: "The Empire Strikes Back|Mark Hamill" },
  },
});
assert.equal(wrongActorPressPhoto.eligible, false);
assert(wrongActorPressPhoto.reasons.includes("human-event-photo-for-character-still"));

const unrelatedActorShoot = evaluateSourceCandidate({
  side: "still",
  expectedSubject: "Mag the Mighty",
  actor: "Neil Fingleton",
  production: "Game of Thrones",
  performanceMode: "physical-or-live-action",
  actorEvidence: null,
  candidate: {
    file: "Aisling Franciosi cropped.jpg",
    page: { title: "List of Game of Thrones characters", extract_windows: ["Game of Thrones characters"] },
    source: { description: "Aisling Franciosi on set during a live shoot", categories: "Aisling Franciosi" },
  },
});
assert.equal(unrelatedActorShoot.eligible, false);
assert(unrelatedActorShoot.reasons.includes("candidate-file-not-explicitly-bound-to-subject"));
assert(unrelatedActorShoot.reasons.includes("human-event-photo-for-character-still"));

console.log("card-backfill source-policy v3 live regressions: PASS — Chappies, Greggs, wrong-actor press photos, and unrelated on-set portraits fail closed");
