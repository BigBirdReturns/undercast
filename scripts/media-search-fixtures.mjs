#!/usr/bin/env node
import assert from "node:assert/strict";
import { attemptsByFacet,buildMediaPlan } from "./lib/media-search.mjs";
const policy={missing_retry_days:30,attention_retry_days:7,nonfree_portrait_retry_days:180,verified_portrait_retry_days:365,verified_still_retry_days:730};
const specimens=[{id:"UC-1",actor:"Actor One",character:"Role One",still:null,portrait:{src:"p.jpg",kind:"copyright",origin:"https://example.fandom.com/p"}},{id:"UC-2",actor:"Actor Two",character:"Role Two",still:{src:"s.jpg",kind:"still",origin:"https://example.test/s"},portrait:{src:"p2.jpg",kind:"free",origin:"https://commons.wikimedia.org/p2"}}];
const plan=buildMediaPlan({specimens,sources:[],auditItems:[],attempts:new Map(),now:"2026-07-24T00:00:00.000Z",policy,limit:10});
assert.equal(plan[0].wall_id,"UC-1");assert.equal(plan[0].side,"still");assert(plan.some(row=>row.reason==="portrait-source-upgrade"));
const attempts=attemptsByFacet([JSON.stringify({op:"media-search.attempted",wall_id:"UC-1",side:"still",at:"2026-07-23T00:00:00.000Z"})]);
const deferred=buildMediaPlan({specimens,sources:[],auditItems:[],attempts,now:"2026-07-24T00:00:00.000Z",policy,limit:10});assert(!deferred.some(row=>row.wall_id==="UC-1"&&row.side==="still"));
console.log("media search fixtures: PASS");
