#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  CARD_BACKFILL_SOURCE_POLICY_V3,
  buildSourcePolicyV3Estate,
  isCompositeRequiredSubject,
  priorSourcePolicyVersion,
} from "./lib/card-backfill-source-policy-v3.mjs";
import { applyV3Filter, evaluateV3Candidate } from "./card-backfill-source-v3-filter.mjs";

function candidate({
  id = "UC-001",
  expected = "K9 (voice)",
  production = "Doctor Who",
  pageTitle = "K9 (Doctor Who)",
  pageUrl = "https://example.test/wiki/K9",
  file = "Doctor_Who_Experience_K9.jpg",
  description = "K9 from Doctor Who",
  categories = "Doctor Who characters",
  actorTitle = "John Leeson",
  actorUrl = "https://example.test/wiki/John_Leeson",
  actorExplicit = true,
  width = 300,
  height = 300,
} = {}) {
  return {
    wall_id: id,
    side: "still",
    expected_subject: expected,
    status: "candidate",
    candidate: {
      src: `assets/${id.toLowerCase()}-still.jpg`,
      origin: "https://example.test/file",
      source_page_title: pageTitle,
      source_page: pageUrl,
      source_file: file,
      source_method: "mediawiki-page-candidate-v2",
      width,
      height,
    },
    candidate_sha256: "a".repeat(64),
    discovery: {
      selected_candidate: {
        file,
        page_title: pageTitle,
        page_url: pageUrl,
        description,
        categories,
        page_extract_windows: [`${expected} appears in ${production}`],
        width,
        height,
        method: "mediawiki-page-candidate-v2",
      },
      source_evidence: {
        expected_subject_aliases: [expected.replace(/\s*\([^)]*\)\s*$/, "")],
        production,
        actor_role: {
          title: actorTitle,
          url: actorUrl,
          explicit_character: actorExplicit,
          explicit_production: actorExplicit,
          explicit_character_and_production: actorExplicit,
        },
      },
      attempts: [],
    },
  };
}

assert.equal(CARD_BACKFILL_SOURCE_POLICY_V3.version, 3);
assert.equal(isCompositeRequiredSubject("Mr. Burns & Ned Flanders"), true);
assert.equal(isCompositeRequiredSubject("K9 (voice)"), false);
assert.equal(priorSourcePolicyVersion({ cohort_key: "still::voice::mediawiki-multicandidate-v2::canonical::character" }), 2);
assert.equal(priorSourcePolicyVersion({ cohort_key: "still::voice::mediawiki-resolution-repair-v3::canonical::character" }), 3);

const k9 = evaluateV3Candidate(candidate());
assert.equal(k9.accepted, true);
assert.equal(k9.checks.resolution_repair, true);

const masterChief = evaluateV3Candidate(candidate({
  id: "UC-531",
  expected: "Master Chief",
  production: "Halo",
  pageTitle: "Master Chief (Halo)",
  file: "Halo 4 - Master Chief.jpg",
  description: "Master Chief in Halo 4",
  categories: "Halo characters",
  actorTitle: "Steve Downes",
  width: 500,
  height: 500,
}));
assert.equal(masterChief.accepted, true);

const actorPortrait = evaluateV3Candidate(candidate({
  expected: "Samurai Jack",
  production: "Samurai Jack",
  pageTitle: "Phil LaMarr",
  pageUrl: "https://example.test/wiki/Phil_LaMarr",
  file: "Phil_LaMarr.jpg",
  description: "Phil LaMarr at an event",
  actorTitle: "Phil LaMarr",
  actorUrl: "https://example.test/wiki/Phil_LaMarr",
  width: 1000,
  height: 1200,
}));
assert.equal(actorPortrait.accepted, false);
assert.equal(actorPortrait.reason, "actor-page-image-for-character-still");

const streetSign = evaluateV3Candidate(candidate({
  expected: "Ned Flanders",
  production: "The Simpsons",
  pageTitle: "Ned Flanders",
  file: "Flanders St Portland.jpg",
  description: "Street sign marked NW Flanders St",
  categories: "Street signs in Portland",
  actorTitle: "Harry Shearer",
  width: 1200,
  height: 800,
}));
assert.equal(streetSign.accepted, false);
assert.equal(streetSign.reason, "derivative-object-or-namesake-presentation");

const statue = evaluateV3Candidate(candidate({
  expected: "Groot",
  production: "Guardians of the Galaxy",
  pageTitle: "Groot",
  file: "I am Groot.jpg",
  description: "Statue of Groot at a public exhibition",
  categories: "Sculptures of fictional characters",
  actorTitle: "Vin Diesel",
  width: 900,
  height: 1200,
}));
assert.equal(statue.accepted, false);
assert.equal(statue.reason, "derivative-object-or-namesake-presentation");

const unboundProduction = evaluateV3Candidate(candidate({
  expected: "Starscream",
  production: "Transformers: Prime",
  pageTitle: "Starscream",
  file: "Starscream.jpg",
  description: "Starscream character image",
  categories: "Transformers characters",
  actorTitle: "Steve Blum",
  actorExplicit: false,
  width: 400,
  height: 400,
}));
assert.equal(unboundProduction.accepted, false);
assert.equal(unboundProduction.reason, "no-explicit-production-binding");

const filtered = applyV3Filter({ version: 2, artifact: "card-backfill-source-v2-fixture", results: [candidate(), streetSign && candidate({
  id: "UC-194",
  expected: "Ned Flanders",
  production: "The Simpsons",
  pageTitle: "Ned Flanders",
  file: "Flanders St Portland.jpg",
  description: "Street sign marked NW Flanders St",
  categories: "Street signs in Portland",
  actorTitle: "Harry Shearer",
  width: 1200,
  height: 800,
})] });
assert.equal(filtered.version, 3);
assert.equal(filtered.counts.candidate, 1);
assert.equal(filtered.counts["not-found"], 1);
assert.equal(filtered.results[0].candidate.source_policy_version, 3);
assert.match(filtered.results[1].discovery.failure, /^source-policy-v3:/);

const baseShape = { side: "still", performance_mode: "voice-or-animation", source_route: "franchise-mediawiki", evidence_tier: "canonical-link-only", render_profile: "character-depiction" };
const estate = {
  campaign_id: "fixture-campaign",
  estate_sha256: "e".repeat(64),
  obligations: [
    { obligation_id: "UC-001/still", wall_id: "UC-001", side: "still", expected_subject: "K9", disposition: "ready", quarantine_reasons: [], shape: baseShape, cohort_key: "old-1", canonical_mutation: false },
    { obligation_id: "UC-002/still", wall_id: "UC-002", side: "still", expected_subject: "Mr. Burns & Ned Flanders", disposition: "ready", quarantine_reasons: [], shape: baseShape, cohort_key: "old-2", canonical_mutation: false },
    { obligation_id: "UC-003/portrait", wall_id: "UC-003", side: "portrait", expected_subject: "Actor Three", disposition: "ready", quarantine_reasons: [], shape: { ...baseShape, side: "portrait", source_route: "performer-reference-crawl", render_profile: "neutral-human" }, cohort_key: "old-3", canonical_mutation: false },
    { obligation_id: "UC-004/still", wall_id: "UC-004", side: "still", expected_subject: "Master Chief", disposition: "ready", quarantine_reasons: [], shape: baseShape, cohort_key: "old-4", canonical_mutation: false },
    { obligation_id: "UC-005/still", wall_id: "UC-005", side: "still", expected_subject: "Groot", disposition: "ready", quarantine_reasons: [], shape: baseShape, cohort_key: "old-5", canonical_mutation: false },
  ],
};
const attemptIndex = {
  entries: [
    { obligation_id: "UC-001/still", attempts: [{ cohort_key: "still::voice::mediawiki-multicandidate-v2::canonical::character" }] },
    { obligation_id: "UC-002/still", attempts: [{ cohort_key: "still::voice::mediawiki-multicandidate-v2::canonical::character" }] },
    { obligation_id: "UC-003/portrait", attempts: [{ cohort_key: "portrait::voice::commons-multicandidate-v2::canonical::neutral" }] },
    { obligation_id: "UC-004/still", attempts: [{ cohort_key: "still::voice::mediawiki-resolution-repair-v3::canonical::character" }] },
    { obligation_id: "UC-005/still", attempts: [{ cohort_key: "still::voice::franchise-mediawiki::canonical::character" }] },
  ],
};
const v3Estate = buildSourcePolicyV3Estate({ estate, attemptIndex });
assert.equal(v3Estate.counts.ready, 1);
assert.equal(v3Estate.counts.composite_required, 1);
assert.equal(v3Estate.obligations[0].obligation_id, "UC-001/still");
assert.equal(v3Estate.obligations[0].source_policy_version, 3);
assert.equal(v3Estate.obligations[0].shape.source_route, "mediawiki-resolution-repair-v3");
assert(v3Estate.exclusions.some((row) => row.obligation_id === "UC-003/portrait" && row.reason === "portrait-v3-not-enabled"));
assert(v3Estate.exclusions.some((row) => row.obligation_id === "UC-004/still" && row.reason === "source-policy-v3-already-attempted"));
assert(v3Estate.exclusions.some((row) => row.obligation_id === "UC-005/still" && row.reason === "source-policy-v2-not-yet-attempted"));

console.log("card-backfill source-policy-v3 fixtures: PASS");
