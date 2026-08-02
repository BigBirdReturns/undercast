#!/usr/bin/env python3
import json
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return text.replace(old, new)


waterline_lib = Path("scripts/lib/waterline.mjs")
text = waterline_lib.read_text()
text = replace_once(
    text,
    '    if (scope.required_closed_cycles < 1 || scope.max_tasks_per_cycle < 1 || scope.max_tasks_per_cycle > 50) throw new Error(`scope ${scope.id} has invalid cycle bounds`);\n',
    '''    if (scope.required_closed_cycles < 1 || scope.max_tasks_per_cycle < 1 || scope.max_tasks_per_cycle > 50) throw new Error(`scope ${scope.id} has invalid cycle bounds`);
    if (scope.initial_pilot !== undefined) {
      if (!scope.initial_pilot || typeof scope.initial_pilot !== "object" || Array.isArray(scope.initial_pilot)) throw new Error(`scope ${scope.id}.initial_pilot must be an object`);
      if (scope.initial_pilot.allow_without_media_baseline !== true) throw new Error(`scope ${scope.id}.initial_pilot must explicitly allow_without_media_baseline`);
      if (!Number.isInteger(scope.initial_pilot.max_tasks) || scope.initial_pilot.max_tasks < 1 || scope.initial_pilot.max_tasks > scope.max_tasks_per_cycle) throw new Error(`scope ${scope.id}.initial_pilot.max_tasks must be from 1 to max_tasks_per_cycle`);
    }
''',
    "waterline scope validation",
)
text = replace_once(
    text,
    '  if (!Array.isArray(doc.operations.required_drills) || !doc.operations.required_drills.length) throw new Error("operations.required_drills must be non-empty");\n',
    '''  if (doc.operations.one_cycle_at_a_time !== true) throw new Error("operations.one_cycle_at_a_time must be true");
  if (!Array.isArray(doc.operations.required_drills) || !doc.operations.required_drills.length) throw new Error("operations.required_drills must be non-empty");
''',
    "waterline global-cycle validation",
)
text = replace_once(
    text,
    '''  const groups = leaseGroups(autopilotJournal, scopeId);
  const cycleByLease = new Map(state.cycles.filter((row) => row.scope_id === scopeId).map((row) => [row.lease_id, row]));
  const unreceipted = groups.filter((group) => !cycleByLease.has(group.lease_id));
  const successfulCycles = state.cycles.filter((row) => row.scope_id === scopeId && row.outcome === "completed");
''',
    '''  const groups = leaseGroups(autopilotJournal, scopeId);
  const scopeCycles = state.cycles.filter((row) => row.scope_id === scopeId);
  const cycleByLease = new Map(scopeCycles.map((row) => [row.lease_id, row]));
  const unreceipted = groups.filter((group) => !cycleByLease.has(group.lease_id));
  const successfulCycles = scopeCycles.filter((row) => row.outcome === "completed");
  const initialPilot = scope.initial_pilot || null;
  const initialPilotEligible = Boolean(initialPilot?.allow_without_media_baseline === true
    && media.total === 0
    && groups.length === 0
    && scopeCycles.length === 0);
  const otherScopeInFlight = (autopilot.jobs || []).filter((job) => ACTIVE_JOB_STATUSES.has(job.status) && job.scope !== scopeId);
''',
    "waterline lease groups",
)
text = replace_once(
    text,
    '''  if (!foundationComplete) claimReasons.push("trusted_foundation_incomplete");
  if (!preservationReady) claimReasons.push("preservation_not_offsite_verified");
  if (media.total === 0) claimReasons.push("media_baseline_missing");
  else if (media.debt > 0) claimReasons.push("media_debt_open");
  if (inFlight.length) claimReasons.push("cycle_in_flight");
  if (unreceipted.length) claimReasons.push("cycle_receipt_required");
  if (blockingIncidents.length) claimReasons.push("blocking_incident_open");
  if (requestedTasks && requestedTasks > scope.max_tasks_per_cycle) claimReasons.push("requested_batch_exceeds_capacity");

  let phase = "ready-for-cycle";
  if (blockingIncidents.length) phase = "incident-stop";
  else if (inFlight.length) phase = "cycle-in-flight";
  else if (media.debt > 0) phase = groups.length ? "media-catch-up" : "baseline-review";
  else if (unreceipted.length) phase = "receipt-required";
''',
    '''  if (!foundationComplete) claimReasons.push("trusted_foundation_incomplete");
  if (!preservationReady) claimReasons.push("preservation_not_offsite_verified");
  if (media.total === 0 && !initialPilotEligible) claimReasons.push("media_baseline_missing");
  else if (media.debt > 0) claimReasons.push("media_debt_open");
  if (inFlight.length) claimReasons.push("cycle_in_flight");
  if (config.operations.one_cycle_at_a_time === true && otherScopeInFlight.length) claimReasons.push("other_scope_cycle_in_flight");
  if (unreceipted.length) claimReasons.push("cycle_receipt_required");
  if (blockingIncidents.length) claimReasons.push("blocking_incident_open");
  if (requestedTasks && requestedTasks > scope.max_tasks_per_cycle) claimReasons.push("requested_batch_exceeds_capacity");
  if (initialPilotEligible && requestedTasks && requestedTasks > initialPilot.max_tasks) claimReasons.push("initial_pilot_exceeds_capacity");

  let phase = initialPilotEligible ? "initial-pilot-ready" : "ready-for-cycle";
  if (blockingIncidents.length) phase = "incident-stop";
  else if (inFlight.length) phase = "cycle-in-flight";
  else if (config.operations.one_cycle_at_a_time === true && otherScopeInFlight.length) phase = "other-cycle-in-flight";
  else if (media.total === 0 && groups.length) phase = "pilot-closure-required";
  else if (media.total === 0 && !initialPilotEligible) phase = "media-baseline-required";
  else if (media.debt > 0) phase = groups.length ? "media-catch-up" : "baseline-review";
  else if (unreceipted.length) phase = "receipt-required";
''',
    "waterline claim reasons",
)
text = replace_once(
    text,
    '    capacity: { requested_tasks: requestedTasks || null, max_tasks_per_cycle: scope.max_tasks_per_cycle },\n',
    '''    capacity: {
      requested_tasks: requestedTasks || null,
      max_tasks_per_cycle: scope.max_tasks_per_cycle,
      initial_pilot: initialPilot ? {
        eligible: initialPilotEligible,
        max_tasks: initialPilot.max_tasks,
        prior_leases: groups.length,
        prior_cycle_receipts: scopeCycles.length,
      } : null,
    },
''',
    "waterline capacity",
)
text = replace_once(
    text,
    '''      in_flight: inFlight.length,
      statuses: Object.fromEntries([...new Set(jobs.map((job) => job.status))].sort().map((status) => [status, jobs.filter((job) => job.status === status).length])),
''',
    '''      in_flight: inFlight.length,
      other_scope_in_flight: otherScopeInFlight.map((job) => ({ id: job.id, scope: job.scope, status: job.status })),
      statuses: Object.fromEntries([...new Set(jobs.map((job) => job.status))].sort().map((status) => [status, jobs.filter((job) => job.status === status).length])),
''',
    "waterline job summary",
)
waterline_lib.write_text(text)

corpus_lib = Path("scripts/lib/corpus-ops.mjs")
text = corpus_lib.read_text()
start = text.index("export function nextOperation(")
end = text.index("\nexport function evaluateProtectedChanges", start)
replacement = '''export function nextOperation({registry,jobs,audit,claimAllowed}){
  const active=(registry.estates||[]).filter(row=>["active-corpus","gold-reference"].includes(row.state)).sort((a,b)=>b.priority-a.priority);
  for(const estate of active){
    const counts=jobCounts(jobs,estate.autopilot_scope);
    if(counts.in_flight)return {kind:"close-cycle",estate:estate.id,reason:`${counts.in_flight} task(s) in flight`,command:`npm run waterline -- status --scope ${estate.autopilot_scope}`};
  }
  for(const estate of active){
    const media=auditCounts(audit,estate.autopilot_scope);
    if(media.debt)return {kind:"close-media-debt",estate:estate.id,reason:`${media.debt} media facet(s) open`,command:`npm run media:audit -- status --scope ${estate.autopilot_scope}`};
  }
  for(const estate of active){
    const counts=jobCounts(jobs,estate.autopilot_scope);
    if(counts.queued){
      if(claimAllowed===false)return {kind:"inspect-waterline",estate:estate.id,reason:"queue exists but the rolling waterline refuses a claim",command:`npm run waterline -- status --scope ${estate.autopilot_scope}`};
      return {kind:"lease-one-cycle",estate:estate.id,reason:`${counts.queued} queued task(s), zero global in-flight work and zero media debt`,command:`npm run autopilot -- next --agent luna --scope ${estate.autopilot_scope} --capability-profile text-vision --limit 1 --out .luna/batch.json --prompt .luna/PROMPT.md`};
    }
  }
  const frontier=(registry.estates||[]).filter(row=>!["active-corpus","gold-reference","retired"].includes(row.state)).sort((a,b)=>b.priority-a.priority)[0];
  return frontier?{kind:"advance-estate-gate",estate:frontier.id,reason:frontier.next_gate,command:"npm run corpus -- status"}:{kind:"collection-complete",estate:null,reason:"No active queue or registered estate frontier remains",command:"npm run corpus -- status"};
}
'''
corpus_lib.write_text(text[:start] + replacement + text[end:])

config_path = Path("data/WATERLINE.json")
config = json.loads(config_path.read_text())
if any(row["id"] == "doctor-who" for row in config["scopes"]):
    raise SystemExit("Doctor Who waterline scope already exists")
config["scopes"].append({
    "id": "doctor-who",
    "label": "Doctor Who second-shard pilot",
    "roadmap_milestone": "adapter-sdk-and-second-gold-shard",
    "required_closed_cycles": 1,
    "max_tasks_per_cycle": 1,
    "minimum_resolved_per_cycle": 1,
    "initial_pilot": {
        "allow_without_media_baseline": True,
        "max_tasks": 1,
    },
    "note": "A newly active, source-preserved scope may issue one first pilot before canonical media exists. The first lease immediately closes this exception; no later lease may issue until that task is terminal, its canonical and exact-subject media payments are complete, and the cycle is reviewed.",
})
config["operations"]["one_cycle_at_a_time"] = True
config_path.write_text(json.dumps(config, indent=2) + "\n")

roadmap_path = Path("data/ROADMAP-STATE.json")
roadmap = json.loads(roadmap_path.read_text())
if roadmap["metrics"].get("certified_scopes") != 1:
    raise SystemExit(f"expected certified_scopes=1, found {roadmap['metrics'].get('certified_scopes')}")
roadmap["metrics"]["certified_scopes"] = 2
note = "Doctor Who source custody and certification are complete; activation may count the second certified scope, but the adapter-sdk-and-second-gold-shard milestone remains open until its one-task Luna pilot, canonical adoption, exact-subject media closure, and correction drill are separately receipted."
if note not in roadmap["notes"]:
    roadmap["notes"].append(note)
roadmap_path.write_text(json.dumps(roadmap, indent=2) + "\n")

package_path = Path("package.json")
package = json.loads(package_path.read_text())
old_check = "node scripts/doctor-who-activation-preflight.mjs check"
new_check = "node scripts/doctor-who-activation.mjs check"
if old_check not in package["scripts"]["autopilot:fixtures"]:
    raise SystemExit("autopilot fixture activation check shape drifted")
package["scripts"]["autopilot:fixtures"] = package["scripts"]["autopilot:fixtures"].replace(old_check, new_check)
package["scripts"]["activation:check"] = new_check
package["scripts"]["activation:status"] = "node scripts/doctor-who-activation.mjs status"
package_path.write_text(json.dumps(package, indent=2) + "\n")

docs = Path("docs/AUTOPILOT.md")
text = docs.read_text()
marker = "## Second-shard first-pilot bootstrap"
if marker not in text:
    text += """

## Second-shard first-pilot bootstrap

A newly active, independently certified scope normally has no canonical media baseline because its first accepted record has not yet been adopted. Such a scope may declare `initial_pilot.allow_without_media_baseline: true` in `data/WATERLINE.json`, with an explicit `max_tasks` no greater than the ordinary cycle capacity. This exception is legal only before the scope has any lease event or cycle receipt. It authorizes one bounded research lease, never a canonical write.

The first lease closes the exception immediately. Global one-cycle custody then blocks every scope from issuing another lease while any task is leased, drafted, or awaiting canonical/media closure. The pilot must proceed through submission, canonical adoption, exact-subject media review or honest absence, and a reviewed waterline receipt before the second shard can claim more work.
"""
docs.write_text(text)

fixtures = Path("scripts/waterline-fixtures.mjs")
text = fixtures.read_text()
text = replace_once(
    text,
    'operations: { required_drills: ["repository-restore", "publication-rollback"], slo_targets: { build_minutes_p95: 20, source_freshness_p95_days: 14, rights_response_sla_days: 14 } },',
    'operations: { one_cycle_at_a_time: true, required_drills: ["repository-restore", "publication-rollback"], slo_targets: { build_minutes_p95: 20, source_freshness_p95_days: 14, rights_response_sla_days: 14 } },',
    "waterline fixture config",
)
terminal = '\nconsole.log("PASS — rolling gold cycles, receipts, drills, metrics, incident authority, stop/reopen, and natural unlocks");\n'
addition = r'''
const bootstrapConfig = structuredClone(config);
bootstrapConfig.scopes.push({
  id: "doctor-who",
  label: "Doctor Who",
  roadmap_milestone: "adapter-sdk-and-second-gold-shard",
  required_closed_cycles: 1,
  max_tasks_per_cycle: 1,
  minimum_resolved_per_cycle: 1,
  initial_pilot: { allow_without_media_baseline: true, max_tasks: 1 },
});
const bootstrapState = emptyWaterlineState();
validateWaterlineState(bootstrapState, bootstrapConfig);
const doctorJob = (status = "queued") => ({ id: "ap_doctor", scope: "doctor-who", status, source_fingerprint: "d".repeat(64), wall_ids: [] });
const doctorMedia = { source: { item_set_sha256: "e".repeat(64) }, items: [] };
const doctorEvents = [{ op: "lease.claimed", task_id: "ap_doctor", at: "2026-08-02T16:40:00Z", scope: "doctor-who", lease_id: "lease_doctor", readiness_token: "f".repeat(64) }];
let doctorStatus = deriveWaterlineStatus({ config: bootstrapConfig, state: bootstrapState, mediaAudit: doctorMedia, autopilot: { jobs: [doctorJob()] }, autopilotJournal: [], roadmapState, preservation, scopeId: "doctor-who", requestedTasks: 1 });
assert.equal(doctorStatus.phase, "initial-pilot-ready");
assert.equal(doctorStatus.claim_allowed, true);
assert.equal(doctorStatus.capacity.initial_pilot.eligible, true);
doctorStatus = deriveWaterlineStatus({ config: bootstrapConfig, state: bootstrapState, mediaAudit: doctorMedia, autopilot: { jobs: [doctorJob()] }, autopilotJournal: [], roadmapState, preservation, scopeId: "doctor-who", requestedTasks: 2 });
assert.ok(doctorStatus.claim_reasons.includes("initial_pilot_exceeds_capacity"));
doctorStatus = deriveWaterlineStatus({ config: bootstrapConfig, state: bootstrapState, mediaAudit: doctorMedia, autopilot: { jobs: [doctorJob("leased")] }, autopilotJournal: doctorEvents, roadmapState, preservation, scopeId: "doctor-who", requestedTasks: 1 });
assert.equal(doctorStatus.phase, "cycle-in-flight");
assert.equal(doctorStatus.claim_allowed, false);
assert.ok(doctorStatus.claim_reasons.includes("cycle_in_flight"));
assert.ok(doctorStatus.claim_reasons.includes("media_baseline_missing"));
const noBootstrapConfig = structuredClone(bootstrapConfig);
delete noBootstrapConfig.scopes.find((row) => row.id === "doctor-who").initial_pilot;
doctorStatus = deriveWaterlineStatus({ config: noBootstrapConfig, state: bootstrapState, mediaAudit: doctorMedia, autopilot: { jobs: [doctorJob()] }, autopilotJournal: [], roadmapState, preservation, scopeId: "doctor-who", requestedTasks: 1 });
assert.equal(doctorStatus.claim_allowed, false);
assert.equal(doctorStatus.phase, "media-baseline-required");
assert.ok(doctorStatus.claim_reasons.includes("media_baseline_missing"));
const invalidBootstrapConfig = structuredClone(bootstrapConfig);
invalidBootstrapConfig.scopes.find((row) => row.id === "doctor-who").initial_pilot.max_tasks = 2;
assert.throws(() => validateWaterlineState(emptyWaterlineState(), invalidBootstrapConfig), /initial_pilot.max_tasks/);
const crossScopeStatus = deriveWaterlineStatus({ config: bootstrapConfig, state: bootstrapState, mediaAudit: media(), autopilot: { jobs: [job("ap_star", "queued"), doctorJob("leased")] }, autopilotJournal: doctorEvents, roadmapState, preservation, scopeId: "star-trek", requestedTasks: 1 });
assert.equal(crossScopeStatus.phase, "other-cycle-in-flight");
assert.equal(crossScopeStatus.claim_allowed, false);
assert.ok(crossScopeStatus.claim_reasons.includes("other_scope_cycle_in_flight"));
assert.equal(crossScopeStatus.jobs.other_scope_in_flight.length, 1);

console.log("PASS — rolling gold cycles, first-pilot bootstrap, global single-cycle custody, receipts, drills, metrics, incident authority, stop/reopen, and natural unlocks");
'''
text = replace_once(text, terminal, "\n" + addition, "waterline fixture terminal")
fixtures.write_text(text)

corpus_fixtures = Path("scripts/corpus-ops-fixtures.mjs")
text = corpus_fixtures.read_text()
marker = 'assert.equal(nextOperation({registry,jobs:[],audit:[{scope:"star-trek",status:"attention"}],claimAllowed:false}).kind,"close-media-debt");\n'
addition = '''const twoEstateRegistry={version:1,estates:[{id:"star-trek",state:"active-corpus",priority:2,autopilot_scope:"star-trek",source_hosts:["example.test"],next_gate:"continue"},{id:"doctor-who",state:"active-corpus",priority:1,autopilot_scope:"doctor-who",source_hosts:["example.test"],next_gate:"close pilot"}]};
assert.deepEqual(validateEstateRegistry(twoEstateRegistry,{scopes:[{scope_id:"star-trek",status:"active"},{scope_id:"doctor-who",status:"active"}]}),[]);
const crossScopeNext=nextOperation({registry:twoEstateRegistry,jobs:[{scope:"star-trek",status:"queued"},{scope:"doctor-who",status:"leased"}],audit:[],claimAllowed:true});
assert.equal(crossScopeNext.kind,"close-cycle");
assert.equal(crossScopeNext.estate,"doctor-who");
'''
text = replace_once(text, marker, marker + addition, "corpus fixture insertion")
corpus_fixtures.write_text(text)

estate_fixtures = Path("scripts/estate-certification-fixtures.mjs")
text = estate_fixtures.read_text()
old = 'const doctorReport = readJson("data/review/adapter-sdk/doctor-who-semantic-001.json");\n'
text = replace_once(text, old, old + 'const activationReport = readJson("data/review/adapter-sdk/doctor-who-activation-001.json");\n', "estate activation report")
text = replace_once(
    text,
    '''assert.equal(estate.state, "certified-paused");
assert.equal(estate.autopilot_scope, "doctor-who");
assert.equal(scope.status, "paused");
''',
    '''assert.equal(estate.state, "active-corpus");
assert.equal(estate.autopilot_scope, "doctor-who");
assert.equal(scope.status, "active");
''',
    "estate active state",
)
text = replace_once(
    text,
    '''assert.equal(doctorReport.boundary.canonical_specimen_mutated, false, "semantic report claims canonical mutation");
assert.equal(doctorReport.extraction.rejected_nonempty_trusted_fields, 0, "trusted performer fields were silently discarded");
''',
    '''assert.equal(doctorReport.boundary.canonical_specimen_mutated, false, "semantic report claims canonical mutation");
assert.equal(doctorReport.extraction.rejected_nonempty_trusted_fields, 0, "trusted performer fields were silently discarded");
assert.equal(activationReport.decision.code, "doctor-who-activated-one-bounded-pilot", "Doctor Who activation receipt is missing");
assert.equal(activationReport.lease.task_count, 1, "Doctor Who activation issued more than one pilot task");
assert.equal(activationReport.lease.agent, "luna", "Doctor Who activation lease is not assigned to Luna");
assert.equal(activationReport.queue.paused_before_activation.total, certificate.snapshot.rows, "activation receipt lost the paused denominator");
assert.equal(activationReport.queue.active_before_lease.claimable, certificate.snapshot.rows, "activation did not expose the complete queue");
assert.equal(activationReport.queue.after_lease.statuses.leased, 1, "activation did not retain exactly one leased task");
assert.equal(activationReport.isolation.star_trek_changes, 0, "Doctor Who activation changed Star Trek state");
assert.equal(activationReport.isolation.non_doctor_changes, 0, "Doctor Who activation changed another scope");
assert.equal(activationReport.waterline.claim_allowed_after_claim, false, "Doctor Who activation left a second lease claimable");
assert.equal(activationReport.boundary.canonical_adoption_performed, false, "activation receipt claims canonical adoption");
assert.equal(activationReport.boundary.media_review_performed, false, "activation receipt claims media closure");
''',
    "estate activation assertions",
)
text = replace_once(
    text,
    '''assert.ok(estate.next_gate.includes(String(certificate.snapshot.rows)), "estate next gate does not carry the current unpaid role denominator");

console.log(`PASS — Doctor Who is certified-paused with ${certificate.snapshot.rows} exact roles, ${certificate.snapshot.complete_receipts} complete source receipts, and no lease authority`);
''',
    '''assert.ok(estate.next_gate.includes(String(certificate.snapshot.rows)), "estate next gate does not carry the current role denominator");
assert.ok(estate.next_gate.includes(activationReport.lease.lease_id), "estate next gate does not name the only authorized pilot lease");

console.log(`PASS — Doctor Who is active-corpus with ${certificate.snapshot.rows} exact roles, ${certificate.snapshot.complete_receipts} complete source receipts, one bounded Luna lease, and no canonical adoption`);
''',
    "estate fixture terminal",
)
estate_fixtures.write_text(text)

print("activation patch applied")
