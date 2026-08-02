#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCorrectionBaseline,
  sha256,
  validateCorrectionCase,
  validateCorrectionLedger
} from "./corrections.mjs";

const clone = (value) => structuredClone(value);
const productionRaw = readFileSync("data/CORRECTIONS.json");
const exerciseRaw = readFileSync("data/review/corrections/controlled-exercise-001.json");
const templateRaw = readFileSync(".github/ISSUE_TEMPLATE/correction.yml");
const production = JSON.parse(productionRaw);
const exercise = JSON.parse(exerciseRaw);
const validCase = exercise.cases[0];

assert.deepEqual(validateCorrectionLedger(production, { expectedCaseType: "real" }), []);
assert.deepEqual(validateCorrectionLedger(exercise, { expectedCaseType: "exercise" }), []);
assert.deepEqual(validateCorrectionCase(validCase, { expectedCaseType: "exercise" }), []);

const baseline = buildCorrectionBaseline({
  production,
  productionRaw,
  exercise,
  exerciseRaw,
  issueTemplateRaw: templateRaw
});
assert.equal(baseline.production.admitted_cases, 0);
assert.equal(baseline.production.median_close_days, null);
assert.match(baseline.production.empty_ledger_semantics, /not a zero-day response/);
assert.equal(baseline.exercise.status, "resolved");
assert.equal(baseline.exercise.outcome, "accepted");
assert.equal(baseline.exercise.independent_review, true);
assert.equal(baseline.exercise.public_history, true);
assert.equal(baseline.exercise.canonical_mutation, false);
assert.equal(baseline.boundary.controlled_exercise_is_not_public_demand, true);
assert.equal(baseline.boundary.roadmap_milestone_completed, false);

let row = clone(validCase);
row.privacy.private_personal_data_included = true;
assert.match(validateCorrectionCase(row).join("\n"), /includes private personal data/);

row = clone(validCase);
row.evidence[0].value += " changed";
assert.match(validateCorrectionCase(row).join("\n"), /value hash drifted/);

row = clone(validCase);
row.events[1].evidence_ids = ["missing-evidence"];
assert.match(validateCorrectionCase(row).join("\n"), /unknown evidence/);

row = clone(validCase);
row.events[2].actor = row.events[0].actor;
assert.match(validateCorrectionCase(row).join("\n"), /reporter self-reviewed/);

row = clone(validCase);
row.events[3].actor = row.events[0].actor;
assert.match(validateCorrectionCase(row).join("\n"), /reporter self-adjudicated/);

row = clone(validCase);
row.events = [row.events[0], row.events[2], row.events[1], ...row.events.slice(3)];
assert.match(validateCorrectionCase(row).join("\n"), /not chronological|not strictly ordered/);

row = clone(validCase);
row.events = row.events.filter((event) => event.kind !== "history-published");
assert.match(validateCorrectionCase(row).join("\n"), /claims public history without a history event/);

row = clone(validCase);
row.disposition.decided_role = "reporter";
assert.match(validateCorrectionCase(row).join("\n"), /lacks second-desk or owner authority/);

row = clone(validCase);
row.disposition.canonical_mutation = true;
assert.match(validateCorrectionCase(row).join("\n"), /exercise mutated canonical state/);

row = clone(validCase);
row.target.record_id = "UC-001";
assert.match(validateCorrectionCase(row).join("\n"), /exercise targets a non-exercise record/);

row = clone(validCase);
row.status = "open";
assert.match(validateCorrectionCase(row).join("\n"), /nonterminal status has a terminal outcome/);

const duplicate = clone(exercise);
duplicate.cases.push(clone(validCase));
assert.match(validateCorrectionLedger(duplicate).join("\n"), /duplicate correction case/);

const real = clone(validCase);
real.id = "real-fixture-001";
real.case_type = "real";
real.target.record_id = "UC-001";
real.opened_at = "2026-08-01T00:00:00.000Z";
real.events = real.events.map((event, index) => ({
  ...event,
  at: new Date(Date.UTC(2026, 7, 1, index)).toISOString()
}));
real.disposition.decided_at = real.events.find((event) => event.kind === "dispositioned").at;
assert.deepEqual(validateCorrectionCase(real, { expectedCaseType: "real" }), []);
const productionWithCase = { ...production, cases: [real] };
const measured = buildCorrectionBaseline({
  production: productionWithCase,
  productionRaw: Buffer.from(`${JSON.stringify(productionWithCase)}\n`),
  exercise,
  exerciseRaw,
  issueTemplateRaw: templateRaw
});
assert.equal(measured.production.admitted_cases, 1);
assert.equal(measured.production.terminal_cases, 1);
assert.equal(measured.production.median_close_days, 3 / 24);
assert.equal(measured.boundary.correction_metric_populated, true);

assert.equal(sha256("evidence"), "e5032b3460b993c7cf9989806874c35296527d8ddf3c7d4c6e4a23eb3b2a6b50");

console.log("PASS — correction privacy, evidence hashes, chronology, independent review, disposition authority, public history, exercise boundary, and null-preserving metrics");
