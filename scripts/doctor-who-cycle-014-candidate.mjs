#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";

const TASK = "ap_233684e7d7b9f896f98a7b14";
const LEASE = "lease_5569f731fbb60f275b9d9d5b";
const WALL = "UC-1359";
const PERFORMER = "Dan Starkey";
const ROLE = "Shrok";
const SOURCE = "https://tardis.fandom.com/wiki/Shrok";
const OFFICIAL = "https://www.bigfinish.com/releases/v/doctor-who-the-sontarans-1083";
const FINGERPRINT = "356ac0ff5ab13ffd14ea8742cb0af6feea5e4232be5d7f7e4cfe677eaaa9ab63";
const BASIS = "cycle-014-shrok-selection-v1:7b64905245f39e1df3c7a1d64bed2c0e2a65acef1177d83b7020c1249bf55a10";
const READINESS = "282a013eb9ce501b80a2e548b78f48915cb3e1e21df3c25c664382fcf975046e";
const PORTRAIT = "images/uc-1359-portrait.jpg";
const PORTRAIT_SHA = "778aa5fe35fd390fb37102370bf40a0a5cf57e440968f32aa8dfbd853fdf9382";
const REVIEW_SHA = "db4c1ff0c24629207ba7e150aafd4a197cd1ea7f0e19124ab2fbce3ff150c700";
const CORPUS_SHA = "9842b9fb5373c150878b47470dd5438a6113bdce8c01c0b628714b01d6649afe";
const MEDIA_PORTRAIT = "ma_f29568f8e36fcdbb0e02874b";
const MEDIA_STILL = "ma_9a1a6227e207bf5452553df1";

const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const jsonl = (path) => fs.readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ok = (value, message) => { if (!value) throw new Error(message); };
const same = (actual, expected, message) => ok(JSON.stringify(actual) === JSON.stringify(expected), message);

const state = read("data/AUTOPILOT.json");
const doctorWho = state.jobs.filter((row) => row.scope === "doctor-who");
const task = doctorWho.find((row) => row.id === TASK);
ok(doctorWho.length === 316, "Doctor Who denominator drifted");
ok(state.source?.coverage_sha256 === "d595b256135ba8297bbfa20c74fad276651dc65560e49634f412ac92fed65725", "cycle 014 coverage receipt drifted");
ok(task?.status === "resolved" && task.performer === PERFORMER && task.character === ROLE && task.source_fingerprint === FINGERPRINT, "Shrok task identity or status drifted");
same(task.wall_ids, [WALL], "Shrok wall binding drifted");
ok(task.outcome?.kind === "audited-wall" && task.outcome?.review_sha256 === REVIEW_SHA, "Shrok audited-wall receipt drifted");
ok(task.outcome?.media_review?.lease_id === LEASE && task.outcome?.media_review?.corpus_sha256 === CORPUS_SHA, "Shrok corpus or lease custody drifted");
const reviewedRecord = task.outcome?.media_review?.records?.[0];
ok(reviewedRecord?.wall_id === WALL, "Shrok post-merge review wall ID drifted");
ok(reviewedRecord?.still?.disposition === "absent" && reviewedRecord.still.note.includes("audio-only"), "Shrok still absence drifted");
ok(reviewedRecord?.portrait?.disposition === "verified" && reviewedRecord.portrait.subject === PERFORMER, "Shrok performer review drifted");
same({
  queued: doctorWho.filter((row) => row.status === "queued").length,
  resolved: doctorWho.filter((row) => row.status === "resolved").length,
  in_flight: doctorWho.filter((row) => ["leased", "drafted", "merged"].includes(row.status)).length,
}, { queued: 302, resolved: 14, in_flight: 0 }, "cycle 014 queue accounting drifted");

const specimens = read("data/specimens.json");
const card = specimens.find((row) => row.id === WALL);
ok(card && card.actor === PERFORMER && card.character === ROLE && card.production === "The Sontarans" && card.universe === "Doctor Who", "Shrok card identity drifted");
ok(card.years === "2016" && card.kind === "voice" && card.transform === 2 && card.designer === "—" && card.link === SOURCE, "Shrok voice classification drifted");
ok(!card.still, "Shrok must not publish a character still");
ok(card.portrait?.src === PORTRAIT, "Shrok portrait path drifted");
ok(card.reveal.includes("No source-qualified Shrok character image") && card.reveal.includes("does not identify a role-specific vocal or sound-design maker"), "Shrok evidentiary boundary drifted");
ok(card.references?.some((row) => row.claim === "performance" && row.source === SOURCE), "Shrok exact-role receipt missing");
ok(card.references?.some((row) => row.claim === "production" && row.source === OFFICIAL), "Shrok official production receipt missing");
ok(sha(fs.readFileSync(PORTRAIT)) === PORTRAIT_SHA, "Shrok portrait bytes drifted");

const sources = read("data/SOURCES.json");
const source = sources.find((row) => row.id === WALL);
ok(source?.actor === PERFORMER && source?.character === ROLE && source?.universe === "Doctor Who" && source?.fetched_at === "2026-08-12", "Shrok source identity drifted");
ok(source.still === null, "Shrok source ledger must declare still absence");
same(source.portrait, card.portrait, "Shrok portrait provenance drifted");

const media = read("data/MEDIA-AUDIT.json").items.filter((row) => row.wall_id === WALL);
ok(media.length === 2, "Shrok media facet denominator drifted");
const portrait = media.find((row) => row.id === MEDIA_PORTRAIT);
const still = media.find((row) => row.id === MEDIA_STILL);
ok(portrait?.side === "portrait" && portrait.status === "verified" && portrait.asset?.sha256 === PORTRAIT_SHA, "Shrok portrait media status drifted");
ok(portrait.claims?.identity?.value === "expected" && portrait.claims?.presentation?.value === "neutral-human", "Shrok portrait media ruling drifted");
ok(still?.side === "still" && still.status === "absent" && still.asset === null && still.risk_codes?.includes("source-declared-absent"), "Shrok still absence media ruling drifted");

const events = jsonl("data/journal/autopilot.jsonl").filter((row) => row.task_id === TASK);
for (const op of ["lease.claimed", "task.drafted", "task.merged", "task.media-verified"]) ok(events.some((row) => row.op === op), `Shrok missing ${op}`);
for (const row of events) {
  const body = { ...row };
  delete body.id;
  ok(row.id === `apj_${sha(JSON.stringify(body)).slice(0, 24)}`, `Shrok ${row.op} event is not content-addressed`);
}
const claim = events.find((row) => row.op === "lease.claimed");
ok(claim?.lease_id === LEASE && claim.readiness_token === READINESS && claim.selection_basis === BASIS, "Shrok claim custody drifted");
const merged = events.find((row) => row.op === "task.merged");
same(merged?.wall_ids, [WALL], "Shrok merged event drifted");
const verified = events.find((row) => row.op === "task.media-verified");
ok(verified?.review_sha256 === REVIEW_SHA && verified?.reviewed_by === "chatgpt-second-desk", "Shrok media-verification event drifted");

const accepted = jsonl("data/journal/candidates.jsonl").filter((row) => row.op === "draft.accept" && row.specimen === WALL);
ok(accepted.length === 1 && accepted[0].actor_name === PERFORMER && accepted[0].character === ROLE && accepted[0].verification === "autopilot-source-receipt", "Shrok growth acceptance drifted");
ok(read("data/drafts.json").length === 0, "Shrok draft was not consumed");

const waterline = read("data/WATERLINE-STATE.json");
ok(!waterline.cycles.some((row) => row.lease_id === LEASE), "candidate must remain unreceipted until independent qualification");
ok(fs.readFileSync("sitemap.xml", "utf8").includes("records/UC-1359/"), "Shrok permanent route is absent from sitemap");

const hashes = new Map();
for (const specimen of specimens) {
  for (const side of ["still", "portrait"]) {
    const path = specimen[side]?.src;
    if (!path || !fs.existsSync(path)) continue;
    const digest = sha(fs.readFileSync(path));
    const prior = hashes.get(digest);
    ok(!prior || prior.id === specimen.id, `cross-card duplicate ${prior?.id || "unknown"}/${specimen.id}`);
    hashes.set(digest, { id: specimen.id, side });
  }
}

console.log("doctor-who-cycle-014-candidate: PASS — Shrok exact voice role, explicit character-media absence, neutral performer portrait, maker boundary, audited wall closure, and one-cycle isolation are intact");
