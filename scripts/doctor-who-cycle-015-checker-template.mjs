#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const RECEIPT = "data/review/adapter-sdk/doctor-who-cycle-015-skar.json";
const CHECKER = "scripts/doctor-who-cycle-015.mjs";
const PRIOR_RECEIPT = "data/review/adapter-sdk/doctor-who-cycle-014-shrok.json";
const PRIOR_CHECKER = "scripts/doctor-who-cycle-014.mjs";
const TASK = "ap_8ab8a9927bf935d152b4155e";
const LEASE = "lease_3ae069e831b9196b08621b6e";
const WALL = "UC-1360";
const REVIEW = "2026-08-12T16:20:00.000Z";
const PERFORMER = "Dan Starkey";
const ROLE = "Skar";
const SOURCE = "https://tardis.fandom.com/wiki/Skar";
const PRODUCTION_SOURCE = "https://tardis.fandom.com/wiki/The_Doctor_and_the_Dalek";
const RELEASE_SOURCE = "https://www.doctorwhotv.co.uk/the-doctor-and-the-dalek-67928.htm";
const FINGERPRINT = "933a0fcf7b04560da6c36ef028bb7bc5d39a43f6d986975e5fa676c99e332d71";
const PORTRAIT_PATH = "images/uc-1360-portrait.jpg";
const PORTRAIT_SHA = "f89b2e938f78a9e97faea20c1dc020e819593f1f12d693222f8278f3c7a1329b";
const PORTRAIT_ORIGIN = "https://commons.wikimedia.org/wiki/File:Dan_Starkey_by_Gage_Skidmore.jpg";
const PORTRAIT_LICENSE = "CC BY-SA 3.0";
const STILL_PATH = "images/uc-1360-still.webp";
const STILL_SHA = "cd4857db54299630d93fc2d444bb4cea56d7805ffc1f621b7ee6c6eff6acda06";
const STILL_ORIGIN = "https://static.wikia.nocookie.net/tardis/images/f/f3/Skar.jpg/revision/latest?cb=20141022173342";
const CANDIDATE_COMMIT = "5c0c0f251b62eff51c88c9307ab17976d719784a";
const CANDIDATE_TREE = "49c4474904bfcf70a0a5046063a32c4c63a9b5c8";
const CANDIDATE_CHECKER_SHA = "458e9cf8fba60de6643ec883c63039c0715e90e5f241eca9ecef1204d0a984a8";
const CANDIDATE_MATERIALIZER_SHA = "86ddc8af1e39c0e3e822eb63ea1fa7f5fdfc33be9ea3e37440932a002f4216dd";
const PRIOR_CYCLE = "__PRIOR_CYCLE__";
const PRIOR_RECEIPT_FILE_SHA = "__PRIOR_RECEIPT_FILE_SHA__";
const PRIOR_RECEIPT_ID = "__PRIOR_RECEIPT_ID__";
const PRIOR_CHECKER_SHA = "__PRIOR_CHECKER_SHA__";
const TOTAL = 316;
const RESOLVED_FLOOR = 15;
const ACTIVE = new Set(["leased", "drafted", "merged"]);

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => JSON.stringify(stable(value));
const pretty = (value) => JSON.stringify(stable(value), null, 2) + "\n";
const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const jsonl = (path) => fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ok = (value, message) => { if (!value) throw new Error(message); };
const same = (actual, expected, message) => ok(stableJson(actual) === stableJson(expected), message);
const time = (value, message) => {
  const parsed = Date.parse(value || "");
  ok(Number.isFinite(parsed), message);
  return parsed;
};
const claimId = (row) => {
  const body = structuredClone(row);
  delete body.id;
  return `apj_${sha(JSON.stringify(body)).slice(0, 24)}`;
};
const cycleId = (row) => {
  const body = structuredClone(row);
  delete body.id;
  return `cycle_${sha(stableJson(body)).slice(0, 24)}`;
};

const receipt = read(RECEIPT);
const receiptBody = structuredClone(receipt);
delete receiptBody.receipt_sha256;
ok(receipt.receipt_sha256 === sha(pretty(receiptBody)), "cycle 015 receipt hash drifted");
ok(receipt.transaction === "DOCTOR-WHO-CYCLE-015-SKAR" && receipt.version === 1, "cycle 015 receipt identity drifted");
ok(receipt.qualification?.checker_sha256 === sha(fs.readFileSync(CHECKER)), "cycle 015 checker hash drifted");

const autopilot = read("data/AUTOPILOT.json");
const journal = jsonl("data/journal/autopilot.jsonl");
const candidates = jsonl("data/journal/candidates.jsonl");
const water = read("data/WATERLINE-STATE.json");
const waterJournal = jsonl("data/journal/waterline.jsonl");
const specimens = read("data/specimens.json");
const sources = read("data/SOURCES.json");
const audit = read("data/MEDIA-AUDIT.json");
const registry = read("data/ESTATE-REGISTRY.json");
const baseline = read("data/review/adapter-sdk/BASELINE.json");
const packageJson = read("package.json");

const doctor = autopilot.jobs.filter((row) => row.scope === "doctor-who");
const task = doctor.find((row) => row.id === TASK);
ok(doctor.length === TOTAL, "Doctor Who denominator changed");
ok(task?.status === "resolved" && task.performer === PERFORMER && task.character === ROLE && task.source_fingerprint === FINGERPRINT, "Skar task drifted");
same(task.performance_modes, ["voice"], "Skar mode hint drifted");
same(task.wall_ids, [WALL], "Skar wall drifted");

const claims = journal.filter((row) => row.op === "lease.claimed" && row.scope === "doctor-who");
for (const claim of claims) ok(claim.id === claimId(claim), "Doctor Who claim is not content-addressed");
const historical = claims.filter((row) => time(row.at, "claim timestamp") <= time(REVIEW, "review timestamp"));
ok(historical.length === 15, "historical Doctor Who claim denominator changed");
const claim = historical.filter((row) => row.lease_id === LEASE && row.task_id === TASK);
ok(claim.length === 1 && claim[0].at === "2026-08-12T09:00:00.000Z", "Skar claim changed");

const acceptance = candidates.filter((row) => row.op === "draft.accept" && row.specimen === WALL);
ok(acceptance.length === 1 && acceptance[0].id === receipt.candidate.event_id, "Skar acceptance changed");

const card = specimens.find((row) => row.id === WALL);
ok(card
  && card.actor === PERFORMER
  && card.character === ROLE
  && card.production === "The Doctor and the Dalek"
  && card.kind === "voice"
  && card.link === SOURCE
  && card.years === "2014"
  && card.transform === 2
  && card.designer === "—", "Skar canonical record drifted");
ok(card.still?.src === STILL_PATH && card.still?.origin === STILL_ORIGIN && card.still?.pin === true, "Skar still metadata drifted");
ok(sha(fs.readFileSync(STILL_PATH)) === STILL_SHA, "Skar still bytes drifted");
ok(card.portrait?.src === PORTRAIT_PATH && card.portrait?.origin === PORTRAIT_ORIGIN && card.portrait?.license === PORTRAIT_LICENSE && card.portrait?.pin === true, "Dan Starkey portrait metadata drifted");
ok(sha(fs.readFileSync(PORTRAIT_PATH)) === PORTRAIT_SHA, "Skar portrait bytes drifted");
ok(card.references?.some((row) => row.claim === "performance" && row.source === SOURCE)
  && card.references?.some((row) => row.claim === "production" && row.source === PRODUCTION_SOURCE)
  && card.references?.some((row) => row.claim === "production" && row.source === RELEASE_SOURCE), "Skar evidence receipts drifted");

const source = sources.find((row) => row.id === WALL);
same(source.still, card.still, "Skar source still drifted");
same(source.portrait, card.portrait, "Skar source portrait drifted");
const facets = audit.items.filter((row) => row.wall_id === WALL).sort((a, b) => a.side.localeCompare(b.side));
ok(facets.length === 2, "Skar facet denominator changed");
const portrait = facets.find((row) => row.side === "portrait");
const still = facets.find((row) => row.side === "still");
ok(still?.status === "verified"
  && still.asset?.sha256 === STILL_SHA
  && still.claims?.identity?.value === "expected"
  && still.claims?.presentation?.value === "character-depiction", "Skar still review drifted");
ok(portrait?.status === "verified"
  && portrait.asset?.sha256 === PORTRAIT_SHA
  && portrait.claims?.identity?.value === "expected"
  && portrait.claims?.presentation?.value === "neutral-human", "Dan Starkey portrait review drifted");

ok(receipt.task.performance_mode === "voice-only"
  && receipt.task.kind === "voice"
  && receipt.task.maker_attribution === "unresolved"
  && receipt.task.vocal_transformation_measured === false, "Skar modality or maker boundary drifted");
ok(receipt.canonical.record_sha256 === sha(pretty(card)), "Skar canonical digest drifted");
ok(receipt.media.facets_sha256 === sha(pretty(facets)), "Skar media digest drifted");
ok(receipt.media.source_ledger_sha256 === sha(pretty(source)), "Skar source-ledger digest drifted");

const receipts = water.cycles.filter((row) => row.scope_id === "doctor-who");
const byLease = new Map();
for (const row of receipts) {
  ok(!byLease.has(row.lease_id), "duplicate Doctor Who cycle receipt");
  byLease.set(row.lease_id, row);
}
const cycle = receipts.filter((row) => row.lease_id === LEASE);
ok(cycle.length === 1
  && cycle[0].id === receipt.reviewed_cycle.id
  && cycle[0].id === cycleId(cycle[0])
  && cycle[0].outcome === "completed"
  && cycle[0].task_statuses?.[TASK] === "resolved"
  && cycle[0].reviewed_at === REVIEW, "Skar cycle receipt drifted");
const events = waterJournal.filter((row) => row.id === receipt.reviewed_cycle.event_id && row.lease_id === LEASE && row.receipt_id === cycle[0].id);
ok(events.length === 1, "Skar waterline event drifted");
const eventBody = structuredClone(events[0]);
delete eventBody.id;
ok(events[0].id === `waterline_${sha(JSON.stringify(eventBody)).slice(0, 24)}`, "Skar waterline event is not content-addressed");

const later = claims.filter((row) => time(row.at, "claim timestamp") > time(REVIEW, "review timestamp"));
const unreceipted = later.filter((row) => !byLease.has(row.lease_id));
ok(unreceipted.length <= 1, "more than one later Doctor Who cycle is unreceipted");
ok(doctor.filter((row) => ACTIVE.has(row.status)).length <= 1, "more than one later Doctor Who task is active");
for (const row of later.filter((item) => byLease.has(item.lease_id))) {
  const laterCycle = byLease.get(row.lease_id);
  const laterJob = doctor.find((item) => item.id === row.task_id);
  ok(laterCycle.task_ids?.length === 1 && laterCycle.task_ids[0] === row.task_id && laterJob?.status === "resolved", "later receipted Doctor Who cycle drifted");
}
ok(doctor.filter((row) => row.status === "resolved").length >= RESOLVED_FLOOR, "Doctor Who resolved floor regressed");
if (later.length === 0) {
  same({
    total: doctor.length,
    queued: doctor.filter((row) => row.status === "queued").length,
    resolved: doctor.filter((row) => row.status === "resolved").length,
    in_flight: doctor.filter((row) => ACTIVE.has(row.status)).length,
  }, { total: 316, queued: 301, resolved: 15, in_flight: 0 }, "cycle 015 queue drifted");
}

ok(receipt.reviewed_cycle.prior_cycle_id === PRIOR_CYCLE && receipt.reviewed_cycle.reviewed_at === REVIEW, "cycle 015 reviewed-cycle binding drifted");
const execution = structuredClone(receipt.execution);
const qualificationIdentity = execution.qualification_identity;
delete execution.qualification_identity;
ok(qualificationIdentity === sha(stableJson(execution))
  && execution.candidate_commit === CANDIDATE_COMMIT
  && execution.candidate_tree === CANDIDATE_TREE
  && execution.candidate_checker_sha256 === CANDIDATE_CHECKER_SHA
  && execution.candidate_materializer_sha256 === CANDIDATE_MATERIALIZER_SHA, "cycle 015 execution custody drifted");
ok(sha(fs.readFileSync(PRIOR_RECEIPT)) === PRIOR_RECEIPT_FILE_SHA
  && read(PRIOR_RECEIPT).receipt_sha256 === PRIOR_RECEIPT_ID
  && sha(fs.readFileSync(PRIOR_CHECKER)) === PRIOR_CHECKER_SHA, "cycle 015 lost cycle 014 custody");

const estate = registry.estates.find((row) => row.id === "doctor-who");
ok(estate?.next_gate?.includes(cycle[0].id) && estate.next_gate.includes("301 tasks remain queued"), "Doctor Who registry gate drifted");
ok(baseline.inputs?.estate_registry?.sha256 === sha(fs.readFileSync("data/ESTATE-REGISTRY.json")), "adapter baseline registry binding drifted");
ok(packageJson.scripts?.["doctor-who:cycle-015:check"] === "node scripts/doctor-who-cycle-015.mjs", "cycle 015 package checker route drifted");

ok(receipt.boundary?.cycle_016_authorized === false
  && receipt.boundary?.sixteenth_lease_issued === false
  && receipt.boundary?.fifteenth_doctor_who_lease_is_this_cycle === true
  && receipt.boundary?.character_still_available === true
  && receipt.boundary?.maker_attribution_resolved === false
  && receipt.boundary?.generic_sontaran_substituted === false
  && receipt.boundary?.production_artwork_substituted === false
  && receipt.boundary?.vocal_transformation_measured === false
  && receipt.boundary?.outside_human_dependency === false
  && receipt.boundary?.owner_physical_action_required === false, "cycle 015 authority boundary drifted");

console.log("doctor-who-cycle-015: PASS — exact Skar voice custody, exact character depiction, neutral performer portrait, unresolved vocal and maker boundary, reviewed waterline closure, cycle-014 custody, and later-cycle composability are intact");
