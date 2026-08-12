#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const PARENT = "7468046568f74b94630d8bfdc966bad23dcbd4a4";
const CANDIDATE_COMMIT = "5c0c0f251b62eff51c88c9307ab17976d719784a";
const CANDIDATE_TREE = "49c4474904bfcf70a0a5046063a32c4c63a9b5c8";
const TASK = "ap_8ab8a9927bf935d152b4155e";
const LEASE = "lease_3ae069e831b9196b08621b6e";
const WALL = "UC-1360";
const PERFORMER = "Dan Starkey";
const ROLE = "Skar";
const SOURCE = "https://tardis.fandom.com/wiki/Skar";
const PRODUCTION_SOURCE = "https://tardis.fandom.com/wiki/The_Doctor_and_the_Dalek";
const RELEASE_SOURCE = "https://www.doctorwhotv.co.uk/the-doctor-and-the-dalek-67928.htm";
const FINGERPRINT = "933a0fcf7b04560da6c36ef028bb7bc5d39a43f6d986975e5fa676c99e332d71";
const REVIEW = "2026-08-12T16:20:00.000Z";
const RECEIPT = "data/review/adapter-sdk/doctor-who-cycle-015-skar.json";
const CHECKER = "scripts/doctor-who-cycle-015.mjs";
const PRIOR_RECEIPT = "data/review/adapter-sdk/doctor-who-cycle-014-shrok.json";
const PRIOR_CHECKER = "scripts/doctor-who-cycle-014.mjs";
const PORTRAIT_PATH = "images/uc-1360-portrait.jpg";
const PORTRAIT_SHA = "f89b2e938f78a9e97faea20c1dc020e819593f1f12d693222f8278f3c7a1329b";
const PORTRAIT_ORIGIN = "https://commons.wikimedia.org/wiki/File:Dan_Starkey_by_Gage_Skidmore.jpg";
const PORTRAIT_LICENSE = "CC BY-SA 3.0";
const STILL_PATH = "images/uc-1360-still.webp";
const STILL_SHA = "cd4857db54299630d93fc2d444bb4cea56d7805ffc1f621b7ee6c6eff6acda06";
const STILL_ORIGIN = "https://static.wikia.nocookie.net/tardis/images/f/f3/Skar.jpg/revision/latest?cb=20141022173342";
const CANDIDATE_ARTIFACT = 9149235185;
const CANDIDATE_ARTIFACT_SHA = "982d6e26bb734c4f65d650b03835182510d71e6e770a0ceca512b5b4daea329f";
const CANDIDATE_RUN = 31615934212;
const CANDIDATE_JOB = 94178608999;
const CANDIDATE_PATH_COUNT = 42;
const CANDIDATE_PATH_LEDGER_SHA = "37a901dc322380010d3f9dce1fff11240eaee911a3f6f39eb0ad623884f78da1";
const CANDIDATE_CHECKER_SHA = "458e9cf8fba60de6643ec883c63039c0715e90e5f241eca9ecef1204d0a984a8";
const CANDIDATE_MATERIALIZER_SHA = "86ddc8af1e39c0e3e822eb63ea1fa7f5fdfc33be9ea3e37440932a002f4216dd";

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const sj = (value) => JSON.stringify(stable(value));
const pretty = (value) => JSON.stringify(stable(value), null, 2) + "\n";
const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const write = (path, value) => fs.writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const jsonl = (path) => fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ok = (value, message) => { if (!value) throw new Error(message); };
const same = (actual, expected, message) => ok(sj(actual) === sj(expected), message);
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
}

ok(sha(fs.readFileSync(PORTRAIT_PATH)) === PORTRAIT_SHA, "Skar portrait bytes drifted before receipt");
ok(sha(fs.readFileSync(STILL_PATH)) === STILL_SHA, "Skar still bytes drifted before receipt");
ok(sha(fs.readFileSync("scripts/doctor-who-cycle-015-candidate.mjs")) === CANDIDATE_CHECKER_SHA, "candidate checker drifted before receipt");
const candidateCommit = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
const candidateTree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).stdout.trim();
ok(candidateCommit === CANDIDATE_COMMIT && candidateTree === CANDIDATE_TREE, "candidate commit or tree drifted before receipt");
const parent = spawnSync("git", ["rev-parse", "HEAD^"], { encoding: "utf8" }).stdout.trim();
ok(parent === PARENT, "candidate parent drifted before receipt");

const autopilot = read("data/AUTOPILOT.json");
const doctor = autopilot.jobs.filter((row) => row.scope === "doctor-who");
const task = doctor.find((row) => row.id === TASK);
ok(doctor.length === 316, "Doctor Who denominator drifted before receipt");
ok(task?.status === "resolved" && task.performer === PERFORMER && task.character === ROLE && task.source_fingerprint === FINGERPRINT, "Skar task drifted before receipt");
same(task.performance_modes, ["voice"], "Skar mode drifted before receipt");
same(task.wall_ids, [WALL], "Skar wall binding drifted before receipt");
same({ total: doctor.length, queued: doctor.filter((row) => row.status === "queued").length, resolved: doctor.filter((row) => row.status === "resolved").length, in_flight: doctor.filter((row) => ["leased", "drafted", "merged"].includes(row.status)).length }, { total: 316, queued: 301, resolved: 15, in_flight: 0 }, "Skar queue accounting drifted before receipt");

const autopilotJournal = jsonl("data/journal/autopilot.jsonl");
const claim = autopilotJournal.find((row) => row.op === "lease.claimed" && row.task_id === TASK && row.lease_id === LEASE);
ok(claim && claim.at === "2026-08-12T09:00:00.000Z", "Skar claim drifted before receipt");
const candidateEvent = jsonl("data/journal/candidates.jsonl").find((row) => row.op === "draft.accept" && row.specimen === WALL);
ok(candidateEvent?.id === "jr__K-f4wEh0ZaQrZ4AYfVqd6", "Skar acceptance drifted before receipt");
const card = read("data/specimens.json").find((row) => row.id === WALL);
const sourceLedger = read("data/SOURCES.json").find((row) => row.id === WALL);
const facets = read("data/MEDIA-AUDIT.json").items.filter((row) => row.wall_id === WALL).sort((a, b) => a.side.localeCompare(b.side));
ok(card && sourceLedger && facets.length === 2, "Skar canonical surfaces are incomplete");

const cycleInputPath = ".cycle-015-waterline-input.json";
write(cycleInputPath, {
  scope_id: "doctor-who",
  lease_id: LEASE,
  outcome: "completed",
  note: "The bounded Skar lease resolved one exact voice performance, bound the revision-named character image to Skar, preserved a separate neutral Dan Starkey portrait, returned all Doctor Who media facets to verified or honestly absent, and passed the complete canonical gate without claiming vocal processing or a role-specific maker.",
  evidence: [
    { type: "workflow-run", value: `GitHub Actions run ${CANDIDATE_RUN} — frozen source receipt, exact representation-aware media review, candidate checker, Doctor Who media gate, and invariant gate` },
    { type: "commit", value: `${CANDIDATE_COMMIT} — one-parent 42-path Skar candidate tree ${CANDIDATE_TREE}` },
    { type: "restart-proof", value: `Candidate receipt artifact ${CANDIDATE_ARTIFACT}, digest sha256:${CANDIDATE_ARTIFACT_SHA}, preserved the parent, commit, tree, path ledger, materializer, checker, media hashes, and queue accounting before final review` },
  ],
  reviewed_by: "chatgpt-second-desk",
  reviewed_role: "second-desk",
  reviewed_at: REVIEW,
});
run(process.execPath, ["scripts/waterline.mjs", "record-cycle", "--input", cycleInputPath]);
fs.rmSync(cycleInputPath, { force: true });

const water = read("data/WATERLINE-STATE.json");
const cycle = water.cycles.find((row) => row.scope_id === "doctor-who" && row.lease_id === LEASE);
ok(cycle?.outcome === "completed" && cycle.reviewed_at === REVIEW && cycle.task_statuses?.[TASK] === "resolved", "Skar waterline cycle was not recorded exactly once");
const waterEvent = [...jsonl("data/journal/waterline.jsonl")].reverse().find((row) => row.lease_id === LEASE && row.receipt_id === cycle.id);
ok(waterEvent?.op === "cycle.receipted", "Skar waterline event is missing");

const registryPath = "data/ESTATE-REGISTRY.json";
const registry = read(registryPath);
const estate = registry.estates.find((row) => row.id === "doctor-who");
ok(estate, "Doctor Who estate registry row is missing");
estate.next_gate = `Doctor Who reviewed cycle 015 ${cycle.id} resolved Dan Starkey as Skar within the preserved 316-role denominator; 301 tasks remain queued. The revision-bound File:Skar.jpg character depiction and separately encoded performer portrait are verified independently, role-specific vocal processing and maker attribution remain unresolved, and any later cycle must claim at most one compatible task and return to a reviewed cycle receipt before another claim.`;
write(registryPath, registry);
const baselinePath = "data/review/adapter-sdk/BASELINE.json";
const baseline = read(baselinePath);
ok(baseline.inputs?.estate_registry?.path === registryPath, "adapter baseline estate registry path drifted");
baseline.inputs.estate_registry.sha256 = sha(fs.readFileSync(registryPath));
write(baselinePath, baseline);
const packagePath = "package.json";
const packageJson = read(packagePath);
packageJson.scripts["doctor-who:cycle-015:check"] = "node scripts/doctor-who-cycle-015.mjs";
write(packagePath, packageJson);

const priorReceipt = read(PRIOR_RECEIPT);
const priorReceiptFileSha = sha(fs.readFileSync(PRIOR_RECEIPT));
const priorCheckerSha = sha(fs.readFileSync(PRIOR_CHECKER));
const execution = {
  candidate_artifact: CANDIDATE_ARTIFACT,
  candidate_artifact_sha256: CANDIDATE_ARTIFACT_SHA,
  candidate_checker_sha256: CANDIDATE_CHECKER_SHA,
  candidate_commit: CANDIDATE_COMMIT,
  candidate_job: CANDIDATE_JOB,
  candidate_materializer_sha256: CANDIDATE_MATERIALIZER_SHA,
  candidate_path_count: CANDIDATE_PATH_COUNT,
  candidate_path_ledger_sha256: CANDIDATE_PATH_LEDGER_SHA,
  candidate_run: CANDIDATE_RUN,
  candidate_tree: CANDIDATE_TREE,
};
execution.qualification_identity = sha(sj(execution));

function checkerSource() {
  return `#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
const RECEIPT="${RECEIPT}", CHECKER="${CHECKER}", PRIOR_RECEIPT="${PRIOR_RECEIPT}", PRIOR_CHECKER="${PRIOR_CHECKER}";
const TASK="${TASK}", LEASE="${LEASE}", WALL="${WALL}", REVIEW="${REVIEW}";
const PERFORMER="${PERFORMER}", ROLE="${ROLE}", SOURCE="${SOURCE}", PRODUCTION_SOURCE="${PRODUCTION_SOURCE}", RELEASE_SOURCE="${RELEASE_SOURCE}", FINGERPRINT="${FINGERPRINT}";
const PORTRAIT_PATH="${PORTRAIT_PATH}", PORTRAIT_SHA="${PORTRAIT_SHA}", PORTRAIT_ORIGIN="${PORTRAIT_ORIGIN}", PORTRAIT_LICENSE="${PORTRAIT_LICENSE}";
const STILL_PATH="${STILL_PATH}", STILL_SHA="${STILL_SHA}", STILL_ORIGIN="${STILL_ORIGIN}";
const CANDIDATE_COMMIT="${CANDIDATE_COMMIT}", CANDIDATE_TREE="${CANDIDATE_TREE}", CANDIDATE_CHECKER_SHA="${CANDIDATE_CHECKER_SHA}", CANDIDATE_MATERIALIZER_SHA="${CANDIDATE_MATERIALIZER_SHA}";
const PRIOR_CYCLE="${priorReceipt.reviewed_cycle.id}", PRIOR_RECEIPT_FILE_SHA="${priorReceiptFileSha}", PRIOR_RECEIPT_ID="${priorReceipt.receipt_sha256}", PRIOR_CHECKER_SHA="${priorCheckerSha}";
const TOTAL=316, RESOLVED_FLOOR=15; const ACTIVE=new Set(["leased","drafted","merged"]);
const sha=v=>crypto.createHash("sha256").update(v).digest("hex");
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==="object"?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const sj=v=>JSON.stringify(stable(v)), pretty=v=>JSON.stringify(stable(v),null,2)+"\n";
const read=f=>JSON.parse(fs.readFileSync(f,"utf8")); const jsonl=f=>fs.readFileSync(f,"utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ok=(x,m)=>{if(!x)throw Error(m)}; const same=(a,b,m)=>ok(sj(a)===sj(b),m); const time=(v,m)=>{const n=Date.parse(v||"");ok(Number.isFinite(n),m);return n};
const claimId=r=>{const x=structuredClone(r);delete x.id;return \`apj_\${sha(JSON.stringify(x)).slice(0,24)}\`};
const cycleId=r=>{const x=structuredClone(r);delete x.id;return \`cycle_\${sha(sj(x)).slice(0,24)}\`};
const receipt=read(RECEIPT), rb=structuredClone(receipt);delete rb.receipt_sha256;
ok(receipt.receipt_sha256===sha(pretty(rb)),"cycle 015 receipt hash drifted");
ok(receipt.transaction==="DOCTOR-WHO-CYCLE-015-SKAR"&&receipt.version===1,"cycle 015 receipt identity drifted");
ok(receipt.qualification?.checker_sha256===sha(fs.readFileSync(CHECKER)),"cycle 015 checker hash drifted");
const autopilot=read("data/AUTOPILOT.json"), journal=jsonl("data/journal/autopilot.jsonl"), candidates=jsonl("data/journal/candidates.jsonl"), water=read("data/WATERLINE-STATE.json"), waterJournal=jsonl("data/journal/waterline.jsonl"), specimens=read("data/specimens.json"), sources=read("data/SOURCES.json"), audit=read("data/MEDIA-AUDIT.json"), registry=read("data/ESTATE-REGISTRY.json"), baseline=read("data/review/adapter-sdk/BASELINE.json"), packageJson=read("package.json");
const doctor=autopilot.jobs.filter(x=>x.scope==="doctor-who"), task=doctor.find(x=>x.id===TASK);
ok(doctor.length===TOTAL,"Doctor Who denominator changed"); ok(task?.status==="resolved"&&task.performer===PERFORMER&&task.character===ROLE&&task.source_fingerprint===FINGERPRINT,"Skar task drifted"); same(task.performance_modes,["voice"],"Skar mode hint drifted"); same(task.wall_ids,[WALL],"Skar wall drifted");
const claims=journal.filter(x=>x.op==="lease.claimed"&&x.scope==="doctor-who"); for(const c of claims)ok(c.id===claimId(c),"Doctor Who claim is not content-addressed");
const historical=claims.filter(x=>time(x.at,"claim")<=time(REVIEW,"review")); ok(historical.length===15,"historical Doctor Who claim denominator changed");
const claim=historical.filter(x=>x.lease_id===LEASE&&x.task_id===TASK); ok(claim.length===1&&claim[0].at==="2026-08-12T09:00:00.000Z","Skar claim changed");
const acceptance=candidates.filter(x=>x.op==="draft.accept"&&x.specimen===WALL); ok(acceptance.length===1&&acceptance[0].id===receipt.candidate.event_id,"Skar acceptance changed");
const card=specimens.find(x=>x.id===WALL); ok(card&&card.actor===PERFORMER&&card.character===ROLE&&card.production==="The Doctor and the Dalek"&&card.kind==="voice"&&card.link===SOURCE&&card.years==="2014"&&card.transform===2&&card.designer==="—","Skar canonical record drifted");
ok(card.still?.src===STILL_PATH&&card.still?.origin===STILL_ORIGIN&&card.still?.pin===true,"Skar still metadata drifted"); ok(sha(fs.readFileSync(STILL_PATH))===STILL_SHA,"Skar still bytes drifted");
ok(card.portrait?.src===PORTRAIT_PATH&&card.portrait?.origin===PORTRAIT_ORIGIN&&card.portrait?.license===PORTRAIT_LICENSE&&card.portrait?.pin===true,"Dan Starkey portrait metadata drifted"); ok(sha(fs.readFileSync(PORTRAIT_PATH))===PORTRAIT_SHA,"Skar portrait bytes drifted");
ok(card.references?.some(x=>x.claim==="performance"&&x.source===SOURCE)&&card.references?.some(x=>x.claim==="production"&&x.source===PRODUCTION_SOURCE)&&card.references?.some(x=>x.claim==="production"&&x.source===RELEASE_SOURCE),"Skar evidence receipts drifted");
const source=sources.find(x=>x.id===WALL); same(source.still,card.still,"Skar source still drifted"); same(source.portrait,card.portrait,"Skar source portrait drifted");
const facets=audit.items.filter(x=>x.wall_id===WALL).sort((a,b)=>a.side.localeCompare(b.side)); ok(facets.length===2,"Skar facet denominator changed"); const portrait=facets.find(x=>x.side==="portrait"), still=facets.find(x=>x.side==="still");
ok(still?.status==="verified"&&still.asset?.sha256===STILL_SHA&&still.claims?.identity?.value==="expected"&&still.claims?.presentation?.value==="character-depiction","Skar still review drifted");
ok(portrait?.status==="verified"&&portrait.asset?.sha256===PORTRAIT_SHA&&portrait.claims?.identity?.value==="expected"&&portrait.claims?.presentation?.value==="neutral-human","Dan Starkey portrait review drifted");
ok(receipt.task.performance_mode==="voice-only"&&receipt.task.kind==="voice"&&receipt.task.maker_attribution==="unresolved"&&receipt.task.vocal_transformation_measured===false,"Skar modality or maker boundary drifted");
ok(receipt.canonical.record_sha256===sha(pretty(card)),"Skar canonical digest drifted"); ok(receipt.media.facets_sha256===sha(pretty(facets)),"Skar media digest drifted"); ok(receipt.media.source_ledger_sha256===sha(pretty(source)),"Skar source ledger digest drifted");
const receipts=water.cycles.filter(x=>x.scope_id==="doctor-who"), byLease=new Map(); for(const row of receipts){ok(!byLease.has(row.lease_id),"duplicate Doctor Who cycle receipt");byLease.set(row.lease_id,row)}
const cycle=receipts.filter(x=>x.lease_id===LEASE); ok(cycle.length===1&&cycle[0].id===receipt.reviewed_cycle.id&&cycle[0].id===cycleId(cycle[0])&&cycle[0].outcome==="completed"&&cycle[0].task_statuses?.[TASK]==="resolved"&&cycle[0].reviewed_at===REVIEW,"Skar cycle receipt drifted");
const events=waterJournal.filter(x=>x.id===receipt.reviewed_cycle.event_id&&x.lease_id===LEASE&&x.receipt_id===cycle[0].id); ok(events.length===1,"Skar waterline event drifted"); const eb=structuredClone(events[0]);delete eb.id; ok(events[0].id===\`waterline_\${sha(JSON.stringify(eb)).slice(0,24)}\`,"Skar waterline event is not content-addressed");
const later=claims.filter(x=>time(x.at,"claim")>time(REVIEW,"review")); const unreceipted=later.filter(x=>!byLease.has(x.lease_id)); ok(unreceipted.length<=1,"more than one later Doctor Who cycle is unreceipted"); ok(doctor.filter(x=>ACTIVE.has(x.status)).length<=1,"more than one later Doctor Who task is active");
for(const row of later.filter(x=>byLease.has(x.lease_id))){const c=byLease.get(row.lease_id),j=doctor.find(x=>x.id===row.task_id);ok(c.task_ids?.length===1&&c.task_ids[0]===row.task_id&&j?.status==="resolved","later receipted Doctor Who cycle drifted")}
ok(doctor.filter(x=>x.status==="resolved").length>=RESOLVED_FLOOR,"Doctor Who resolved floor regressed"); if(later.length===0)same({total:doctor.length,queued:doctor.filter(x=>x.status==="queued").length,resolved:doctor.filter(x=>x.status==="resolved").length,in_flight:doctor.filter(x=>ACTIVE.has(x.status)).length},{total:316,queued:301,resolved:15,in_flight:0},"cycle 015 queue drifted");
ok(receipt.reviewed_cycle.prior_cycle_id===PRIOR_CYCLE&&receipt.reviewed_cycle.reviewed_at===REVIEW,"cycle 015 reviewed-cycle binding drifted");
const ex=structuredClone(receipt.execution); const qid=ex.qualification_identity; delete ex.qualification_identity; ok(qid===sha(sj(ex))&&ex.candidate_commit===CANDIDATE_COMMIT&&ex.candidate_tree===CANDIDATE_TREE&&ex.candidate_checker_sha256===CANDIDATE_CHECKER_SHA&&ex.candidate_materializer_sha256===CANDIDATE_MATERIALIZER_SHA,"cycle 015 execution custody drifted");
ok(sha(fs.readFileSync(PRIOR_RECEIPT))===PRIOR_RECEIPT_FILE_SHA&&read(PRIOR_RECEIPT).receipt_sha256===PRIOR_RECEIPT_ID&&sha(fs.readFileSync(PRIOR_CHECKER))===PRIOR_CHECKER_SHA,"cycle 015 lost cycle 014 custody");
const estate=registry.estates.find(x=>x.id==="doctor-who"); ok(estate?.next_gate?.includes(cycle[0].id)&&estate.next_gate.includes("301 tasks remain queued"),"Doctor Who registry gate drifted"); ok(baseline.inputs?.estate_registry?.sha256===sha(fs.readFileSync("data/ESTATE-REGISTRY.json")),"adapter baseline registry binding drifted");
ok(packageJson.scripts?.["doctor-who:cycle-015:check"]==="node scripts/doctor-who-cycle-015.mjs","cycle 015 package checker route drifted");
ok(receipt.boundary?.cycle_016_authorized===false&&receipt.boundary?.sixteenth_lease_issued===false&&receipt.boundary?.fifteenth_doctor_who_lease_is_this_cycle===true&&receipt.boundary?.character_still_available===true&&receipt.boundary?.maker_attribution_resolved===false&&receipt.boundary?.generic_sontaran_substituted===false&&receipt.boundary?.production_artwork_substituted===false&&receipt.boundary?.vocal_transformation_measured===false&&receipt.boundary?.outside_human_dependency===false&&receipt.boundary?.owner_physical_action_required===false,"cycle 015 authority boundary drifted");
console.log("doctor-who-cycle-015: PASS — exact Skar voice custody, exact character depiction, neutral performer portrait, unresolved vocal and maker boundary, reviewed waterline closure, cycle-014 custody, and later-cycle composability are intact");
`;
}

fs.mkdirSync("data/review/adapter-sdk", { recursive: true });
fs.writeFileSync(CHECKER, checkerSource(), { mode: 0o755 });
const checkerSha = sha(fs.readFileSync(CHECKER));
const receipt = {
  boundary: {
    character_still_available: true,
    cycle_016_authorized: false,
    fifteenth_doctor_who_lease_is_this_cycle: true,
    generic_sontaran_substituted: false,
    maker_attribution_resolved: false,
    outside_human_dependency: false,
    owner_physical_action_required: false,
    production_artwork_substituted: false,
    sixteenth_lease_issued: false,
    vocal_transformation_measured: false,
  },
  candidate: { accepted_at: candidateEvent.ts, event_id: candidateEvent.id },
  canonical: { record: card, record_sha256: sha(pretty(card)), wall_id: WALL },
  canonical_parent: PARENT,
  execution,
  generated_at: REVIEW,
  lease: {
    claim_event_id: claim.id,
    claimed_at: claim.at,
    id: LEASE,
    readiness_token: claim.readiness_token,
    selection_basis: claim.selection_basis,
    selection_strategy: claim.selection_strategy,
  },
  media: {
    facets,
    facets_sha256: sha(pretty(facets)),
    generic_sontaran_substituted: false,
    maker_attribution: "unresolved",
    portrait: "verified",
    portrait_license: PORTRAIT_LICENSE,
    portrait_origin: PORTRAIT_ORIGIN,
    portrait_path: PORTRAIT_PATH,
    portrait_sha256: PORTRAIT_SHA,
    production_artwork_substituted: false,
    role_specific_vocal_processing_measured: false,
    source_ledger_sha256: sha(pretty(sourceLedger)),
    still: "verified",
    still_origin: STILL_ORIGIN,
    still_path: STILL_PATH,
    still_sha256: STILL_SHA,
  },
  prior_custody: {
    cycle_014_checker_path: PRIOR_CHECKER,
    cycle_014_checker_sha256: priorCheckerSha,
    cycle_014_id: priorReceipt.reviewed_cycle.id,
    cycle_014_receipt_file_sha256: priorReceiptFileSha,
    cycle_014_receipt_identity: priorReceipt.receipt_sha256,
    cycle_014_receipt_path: PRIOR_RECEIPT,
  },
  qualification: { checker_path: CHECKER, checker_sha256: checkerSha, denominator: 316, historical_claims: 15 },
  queue: {
    after: { in_flight: 0, queued: 301, resolved: 15, total: 316 },
    before: { in_flight: 0, queued: 302, resolved: 14, total: 316 },
  },
  reviewed_cycle: { event_id: waterEvent.id, id: cycle.id, outcome: "completed", prior_cycle_id: priorReceipt.reviewed_cycle.id, reviewed_at: REVIEW },
  task: {
    id: TASK,
    kind: "voice",
    maker_attribution: "unresolved",
    performance_mode: "voice-only",
    performer: PERFORMER,
    production_source: PRODUCTION_SOURCE,
    release_source: RELEASE_SOURCE,
    role: ROLE,
    source: SOURCE,
    source_fingerprint: FINGERPRINT,
    source_receipts: task.source_receipts,
    vocal_transformation_measured: false,
  },
  transaction: "DOCTOR-WHO-CYCLE-015-SKAR",
  version: 1,
};
receipt.receipt_sha256 = sha(pretty(receipt));
fs.writeFileSync(RECEIPT, pretty(receipt));
run(process.execPath, [CHECKER]);
console.log(JSON.stringify({ transaction: receipt.transaction, cycle_id: cycle.id, event_id: waterEvent.id, receipt_sha256: receipt.receipt_sha256, checker_sha256: checkerSha, qualification_identity: execution.qualification_identity, queue: receipt.queue.after }, null, 2));
