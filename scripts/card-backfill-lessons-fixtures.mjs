#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateContractStructure } from "./lib/card-backfill-lessons.mjs";

const source = JSON.parse(await readFile(new URL("../.github/CARD-BACKFILL-LESSONS.json", import.meta.url), "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const active = source.policies.find((policy) => policy.policy_id === source.active_policy_id);
const runtime = {
  policy_id: active.policy_id,
  parent_policy_id: active.parent_policy_id,
  version: active.version,
  revision: active.revision,
  inherited_lesson_ids: active.inherited_lesson_ids,
  lessons_contract_sha256: active.lessons_contract_sha256,
  canonical_mutation: false,
};

const report = validateContractStructure(source, { runtimePolicy: runtime });
assert.equal(report.mandatory_lesson_count, 24);
assert.equal(report.active_policy.inherited_lesson_count, 24);
assert.equal(report.lessons_contract_sha256, "bafa82adfc525421f498f5655bf12ba0000d131349fcd72edd03f940d9b78931");

{
  const broken = clone(source);
  broken.policies.find((policy) => policy.status === "active").inherited_lesson_ids.pop();
  assert.throws(() => validateContractStructure(broken), /inheritance drift|omits mandatory/);
}

{
  const broken = clone(source);
  broken.lessons_contract_sha256 = "0".repeat(64);
  assert.throws(() => validateContractStructure(broken), /lesson digest drift/);
}

{
  const broken = clone(source);
  broken.lessons.push(clone(broken.lessons[0]));
  assert.throws(() => validateContractStructure(broken), /duplicate lesson id/);
}

{
  const broken = clone(source);
  const first = broken.policies[0];
  first.parent_policy_id = broken.active_policy_id;
  assert.throws(() => validateContractStructure(broken), /lineage cycle|regresses below parent version/);
}

{
  const brokenRuntime = { ...runtime, inherited_lesson_ids: runtime.inherited_lesson_ids.slice(1) };
  assert.throws(() => validateContractStructure(source, { runtimePolicy: brokenRuntime }), /runtime policy omits mandatory lesson inheritance/);
}

{
  const broken = clone(source);
  broken.lessons.find((lesson) => lesson.id === "CBL-013").enforcement = [];
  assert.throws(() => validateContractStructure(broken), /has no enforcement/);
}

{
  const broken = clone(source);
  broken.policies[1].inherited_lesson_ids = broken.policies[1].inherited_lesson_ids.filter((id) => id !== "CBL-009");
  assert.throws(() => validateContractStructure(broken), /inheritance drift|dropped inherited lesson/);
}

console.log("card-backfill lessons fixtures: PASS — omission, downgrade, cycle, digest drift, and unenforced lessons all fail closed");
