#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildEstateInventory, estateForRecord, validateEstateMappings } from "./lib/estate-inventory.mjs";

const registry = { estates: [{ id: "star-trek", label: "Star Trek" }, { id: "doctor-who", label: "Doctor Who" }] };
const mappings = { version: 1, mappings: [
  { field: "universe", value: "Star Trek", estate_id: "star-trek" },
  { field: "production", value: "Doctor Who", estate_id: "doctor-who" },
] };
const specimens = [
  { id: "UC-001", universe: "Star Trek", production: "Star Trek: Deep Space Nine" },
  { id: "UC-002", universe: "TV", production: "Doctor Who" },
  { id: "UC-003", universe: "Film", production: "Unmapped Film" },
];

assert.deepEqual(validateEstateMappings({ mappings, registry }), []);
assert.equal(estateForRecord(specimens[0], mappings), "star-trek");
assert.equal(estateForRecord(specimens[1], mappings), "doctor-who");
assert.equal(estateForRecord(specimens[2], mappings), null);
const inventory = buildEstateInventory({ specimens, mappings, registry });
assert.equal(inventory.records, 3);
assert.equal(inventory.mapped_records, 2);
assert.equal(inventory.unmapped_records, 1);
assert(inventory.groups.some((row) => row.estate_id === null && row.production === "Unmapped Film"));

const inferred = structuredClone(mappings);
inferred.mappings.push({ field: "production-regex", value: "Star.*", estate_id: "star-trek" });
assert(validateEstateMappings({ mappings: inferred, registry }).some((error) => error.includes("invalid field")));

const conflict = { version: 1, mappings: [
  { field: "universe", value: "Star Trek", estate_id: "star-trek" },
  { field: "production", value: "Star Trek: Deep Space Nine", estate_id: "doctor-who" },
] };
assert.throws(() => estateForRecord(specimens[0], conflict), /conflict/);

console.log("estate-inventory fixtures: PASS");
