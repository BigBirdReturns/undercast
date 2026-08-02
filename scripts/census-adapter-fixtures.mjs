#!/usr/bin/env node
import assert from "node:assert/strict";
import { evaluateAdapter, validateAdapterRegistry } from "./census-adapter.mjs";

const adapter = {
  id: "fixture-v1",
  scope_id: "fixture",
  estate_id: "fixture",
  franchise: "Fixture",
  status: "review-candidate",
  source_hosts: ["fixture.example"],
  command: { executable: "node", args: ["scripts/census.mjs", "fixture"] },
  producer_files: ["scripts/census.mjs", "scripts/lib/census-core.mjs"],
  output_contract: {
    manifest_path: "data/CENSUS-MANIFEST.json",
    franchise_field: "franchise",
    source_field: "source",
    page_id_field: "pageid",
    revision_field: "revision",
    content_hash_field: "content_sha256",
    observed_at_field: "observed_at",
    require_exact_revision_receipt: true,
    collapse_duplicate_source_revisions: true
  },
  semantic_controls: ["exact performer-role identity remains explicit"],
  certification_effect: false,
  next_gate: "Review the regenerated fixture semantics before certification."
};
const registry = {
  version: 1,
  schema: "schema/census-adapter.schema.json",
  semantics: "Deterministic fixture registry for adapter contract validation.",
  adapters: [adapter]
};
const estateRegistry = {
  version: 1,
  estates: [{ id: "fixture", state: "adapter-review", autopilot_scope: "fixture", source_hosts: ["fixture.example"] }]
};
const scopes = {
  version: 1,
  scopes: [{
    id: "fixture",
    status: "paused",
    coverage_match: { franchise: "Fixture" },
    refresh: { executable: "node", args: ["scripts/census.mjs", "fixture"] },
    certification: { producer_files: ["scripts/census.mjs", "scripts/lib/census-core.mjs"] }
  }]
};
const exact = {
  franchise: "Fixture",
  category: "Characters",
  title: "Example",
  source: "https://fixture.example/wiki/Example",
  observed_at: "2026-08-01T00:00:00Z",
  pageid: 7,
  revision: 11,
  content_sha256: "a".repeat(64),
  disposition: "credited"
};

assert.deepEqual(validateAdapterRegistry({ registry, estateRegistry, scopes }), []);

let result = evaluateAdapter(adapter, {
  captured_at: "2026-08-01T01:00:00Z",
  observations: [exact, { ...exact, category: "Performers" }]
});
assert.equal(result.observation_rows, 2);
assert.equal(result.unique_source_revisions, 1);
assert.equal(result.duplicate_category_facets, 1);
assert.equal(result.terminal_state, "exact-receipts-present-semantic-review-required");
assert.equal(result.certification_authorized, false);

result = evaluateAdapter(adapter, { observations: [] });
assert.equal(result.terminal_state, "regeneration-required");

result = evaluateAdapter(adapter, { observations: [{ ...exact, revision: null }] });
assert.equal(result.terminal_state, "receipt-repair-required");
assert.equal(result.missing_receipt_fields.revision, 1);

result = evaluateAdapter(adapter, { observations: [{ ...exact, source: "https://wrong.example/wiki/Example" }] });
assert.equal(result.source_host_mismatches, 1);
assert.equal(result.terminal_state, "receipt-repair-required");

assert.match(validateAdapterRegistry({
  registry: { ...registry, adapters: [{ ...adapter, certification_effect: true }] },
  estateRegistry,
  scopes
}).join("\n"), /may not certify or activate/);

assert.match(validateAdapterRegistry({
  registry: { ...registry, adapters: [{ ...adapter, command: { executable: "node", args: ["wrong.mjs"] } }] },
  estateRegistry,
  scopes
}).join("\n"), /not a declared scope refresh command/);

assert.match(validateAdapterRegistry({
  registry: { ...registry, adapters: [adapter, { ...adapter }] },
  estateRegistry,
  scopes
}).join("\n"), /duplicate adapter|multiple adapter contracts/);

console.log("PASS — adapter linkage, exact revision custody, duplicate collapse, semantic-review boundary, and certification refusal");
