#!/usr/bin/env node
import assert from "node:assert/strict";
import { evaluateProtectedChanges,nextOperation,validateCollectionMode,validateEstateRegistry } from "./lib/corpus-ops.mjs";
const mode={version:1,mode:"collection-only",product_contract:"frozen-v1",authority:"owner",protected_paths:["index.html","a","b","c","d","e","f","g"],override_labels:{owner_product_change:"owner-approved-product-change",narrow_hotfixes:["correctness-hotfix"]},rolling_media_search:{canonical_write:false},growth:{one_cycle_at_a_time:true,require_zero_media_debt_before_next_cycle:true}};
assert.deepEqual(validateCollectionMode(mode),[]);
assert(evaluateProtectedChanges({files:["data/specimens.json"],labels:[],body:"",decisionDiff:"",mode}).ok);
assert(!evaluateProtectedChanges({files:["index.html"],labels:[],body:"",decisionDiff:"",mode}).ok);
assert(!evaluateProtectedChanges({files:["index.html"],labels:["owner-approved-product-change"],body:"",decisionDiff:"",mode}).ok);
assert(evaluateProtectedChanges({files:["index.html"],labels:["owner-approved-product-change"],body:"",decisionDiff:"+## DEC-0099 — explicit owner change",mode}).ok);
assert(evaluateProtectedChanges({files:["index.html"],labels:["correctness-hotfix"],body:"Incident: bad filter\nReturn-to-collection-mode: after fix",decisionDiff:"",mode}).ok);
const registry={version:1,estates:[{id:"star-trek",state:"active-corpus",priority:1,autopilot_scope:"star-trek",source_hosts:["example.test"],next_gate:"continue"}]};
assert.deepEqual(validateEstateRegistry(registry,{scopes:[{scope_id:"star-trek",status:"active"}]}),[]);
assert.equal(nextOperation({registry,jobs:[{scope:"star-trek",status:"queued"}],audit:[],claimAllowed:true}).kind,"lease-one-cycle");
assert.equal(nextOperation({registry,jobs:[{scope:"star-trek",status:"merged"}],audit:[],claimAllowed:false}).kind,"close-cycle");
assert.equal(nextOperation({registry,jobs:[],audit:[{scope:"star-trek",status:"attention"}],claimAllowed:false}).kind,"close-media-debt");
console.log("corpus operations fixtures: PASS");
