#!/usr/bin/env node
import assert from "node:assert/strict";
import { evaluateV3Candidate } from "./card-backfill-source-v3-filter.mjs";

function row({ expected, production, pageTitle, file, description = "", categories = "", actor = "Actor", actorExplicit = true, width = 400, height = 400 }) {
  return {
    wall_id: "UC-900",
    side: "still",
    expected_subject: expected,
    status: "candidate",
    candidate: { src: "assets/uc-900-still.jpg", width, height, source_page_title: pageTitle, source_file: file, source_method: "mediawiki-page-candidate-v2" },
    discovery: {
      selected_candidate: { page_title: pageTitle, page_url: `https://example.test/wiki/${encodeURIComponent(pageTitle)}`, file, description, categories, page_extract_windows: [], width, height },
      source_evidence: {
        expected_subject_aliases: [expected.replace(/\s*\([^)]*\)\s*$/, "")],
        production,
        actor_role: { title: actor, url: `https://example.test/wiki/${encodeURIComponent(actor)}`, explicit_character_and_production: actorExplicit },
      },
      attempts: [],
    },
  };
}

const k9 = evaluateV3Candidate(row({
  expected: "K9 (voice)",
  production: "Doctor Who",
  pageTitle: "K9 (Doctor Who)",
  file: "Doctor_Who_Experience_8105526993.jpg",
  actor: "John Leeson",
  actorExplicit: false,
  width: 300,
  height: 300,
}));
assert.equal(k9.accepted, true, "exact character page plus selected-page production binding must retain K9-style evidence");
assert.equal(k9.checks.resolution_repair, true);

const cortanaPanel = evaluateV3Candidate(row({
  expected: "Cortana",
  production: "Halo",
  pageTitle: "List of Halo characters",
  file: "Steve Downes and Jen Taylor at HaloFest 2011.jpg",
  description: "Steve Downes and Jen Taylor met for the first time at this panel discussion.",
  categories: "Actors in 2011|Panel discussions of Halo",
  actor: "Jen Taylor",
  width: 4272,
  height: 2848,
}));
assert.equal(cortanaPanel.accepted, false);
assert.equal(cortanaPanel.reason, "human-event-photo-for-character-still");

const vegetaActor = evaluateV3Candidate(row({
  expected: "Vegeta",
  production: "Dragon Ball Z",
  pageTitle: "Vegeta",
  file: "Ryo Horikawa at Fan Expo Canada.jpg",
  description: "Voice actor noted for Vegeta in Dragon Ball Z at Fan Expo Canada.",
  categories: "Voice actors|2014 Fan Expo Canada",
  actor: "Christopher Sabat",
  width: 2668,
  height: 3731,
}));
assert.equal(vegetaActor.accepted, false);
assert.equal(vegetaActor.reason, "human-event-photo-for-character-still");

const wrongAdaptation = evaluateV3Candidate(row({
  expected: "Bugs Bunny",
  production: "Looney Tunes",
  pageTitle: "Bugs Bunny",
  file: "Bugs Bunny in MultiVersus trailer.png",
  description: "Bugs Bunny in the official MultiVersus trailer.",
  categories: "MultiVersus|Bugs Bunny",
  actor: "Jeff Bergman",
  width: 1270,
  height: 1080,
}));
assert.equal(wrongAdaptation.accepted, false);
assert.equal(wrongAdaptation.reason, "no-explicit-production-binding");

console.log("card-backfill source-v3 prescreen fixtures: PASS");
