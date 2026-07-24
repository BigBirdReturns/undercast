#!/usr/bin/env node
import assert from "node:assert/strict";
import { selectDueFacets, validateMediaSearchState } from "./media-search.mjs";

const audit = { items: [
  { id: "old", scope: "star-trek", wall_id: "UC-001", side: "still", expected_subject: "Old", status: "absent", asset: null, source_fetched_at: "2026-01-01", risk_codes: [] },
  { id: "recent", scope: "star-trek", wall_id: "UC-002", side: "portrait", expected_subject: "Recent", status: "absent", asset: null, source_fetched_at: "2026-07-01", risk_codes: [] },
  { id: "verified", scope: "star-trek", wall_id: "UC-003", side: "portrait", expected_subject: "Verified", status: "verified", asset: { sha256: "a".repeat(64) }, source_fetched_at: "2026-01-01", risk_codes: [] },
  { id: "other", scope: "doctor-who", wall_id: "UC-004", side: "still", expected_subject: "Other", status: "absent", asset: null, source_fetched_at: "2026-01-01", risk_codes: [] },
] };
const state = { version: 1, attempts: [
  { id: "ms_" + "1".repeat(24), item_id: "recent", scope: "star-trek", wall_id: "UC-002", side: "portrait", expected_subject: "Recent", attempted_at: "2026-07-20T00:00:00.000Z", result: "no-result" },
] };
const selected = selectDueFacets({ audit, state, scope: "star-trek", retryDays: 90, now: new Date("2026-07-24T00:00:00.000Z"), limit: 20 });
assert.deepEqual(selected.map((row) => row.id), ["old"]);
assert(!selected.some((row) => row.id === "verified"), "verified media may never enter automatic search");

assert.deepEqual(validateMediaSearchState(state), []);
const canonical = structuredClone(state);
canonical.attempts.push({
  id: "ms_" + "2".repeat(24), item_id: "old", scope: "star-trek", wall_id: "UC-001", side: "still", expected_subject: "Old", attempted_at: "2026-07-24T00:00:00.000Z", result: "candidate",
  candidate: { canonical: true, artifact_path: "assets/x.jpg", sha256: "b".repeat(64), bytes: 10 },
});
assert(validateMediaSearchState(canonical).some((error) => error.includes("falsely marks")));

console.log("media-search fixtures: PASS");
