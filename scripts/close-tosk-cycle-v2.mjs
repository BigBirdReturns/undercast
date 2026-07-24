#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "inherit", maxBuffer: 128 * 1024 * 1024, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status ?? result.error?.message})`);
};
const runNode = (script, args = []) => run(process.execPath, [script, ...args]);
const runNpm = (script, args = []) => run("npm", ["run", script, ...args]);

await mkdir("data/review", { recursive: true });
await mkdir(".luna", { recursive: true });
await mkdir("cycle-closure", { recursive: true });

const audit = JSON.parse(await readFile("data/MEDIA-AUDIT.json", "utf8"));
const items = new Map(audit.items.filter((row) => row.wall_id === "UC-1279").map((row) => [row.side, row]));
const still = items.get("still");
const portrait = items.get("portrait");
if (!still || !portrait) throw new Error("Tosk audit items missing");
const hash = "af05a55ba5a1b2e8d68ebdcfbb6f64b7aa9c0cc13628fb7bce11ee61a066a005";
if (still.asset?.sha256 !== hash || portrait.asset?.sha256 !== hash) throw new Error("Tosk asset receipt drifted");

const processArtifact = { type: "workflow-artifact", value: "run 30079258879 artifact 8591119840 sha256 488ca7fc655bdc299b9d5acb6f8dfe738ea9520f96ff30203a90b83ecf729cf3" };
const evidenceArtifact = { type: "workflow-artifact", value: "run 30079435900 artifact 8591182504 sha256 63c43eb8e0e2d19ab932923d9e9270b3f627713adf3272a4b913ea7271109731" };
const sourceRevision = { type: "source-revision", value: "Memory Alpha Tosk article pageid 223592 revision 3453372; File:Tosk.jpg pageid 13139 revision 2575180, ObjectName Tosk, links Scott MacDonald/Tosk/Captive Pursuit" };
const performerRevision = { type: "source-revision", value: "Memory Alpha Scott MacDonald article pageid 6284 revision 3396911 uses File:Tosk.jpg pageid 13139 revision 2575180 as its pageimage" };
const exactComparison = { type: "source-image-comparison", value: `local ${hash}; remote File:Tosk.jpg ${hash}; exact bytes and dHash distance 0` };

const receipt = {
  version: 1,
  scope: "star-trek",
  reviewed_at: "2026-07-24T08:40:00.000Z",
  semantics: "Identity uses revision-bound article/file metadata and exact source-image comparison, never facial recognition. Presentation uses direct independent inspection of the exact hash-bound local bytes.",
  source: audit.source,
  artifacts: {
    process: { workflow_run: 30079258879, artifact_id: 8591119840, sha256: "488ca7fc655bdc299b9d5acb6f8dfe738ea9520f96ff30203a90b83ecf729cf3" },
    evidence: { workflow_run: 30079435900, artifact_id: 8591182504, sha256: "63c43eb8e0e2d19ab932923d9e9270b3f627713adf3272a4b913ea7271109731" },
  },
  counts: { total: 2, verify: 1, null: 1 },
  rows: [
    {
      item_id: portrait.id, wall_id: "UC-1279", side: "portrait", expected_subject: "Scott MacDonald",
      asset_sha256: hash, asset_origin: portrait.asset.origin, disposition: "null",
      identity_signal: { kind: "revision-bound-wrong-subject", value: "Scott MacDonald performer page uses File:Tosk.jpg; ObjectName Tosk; exact bytes match the character still, not a neutral performer portrait." },
      presentation: "role-depiction", evidence: [performerRevision, sourceRevision, exactComparison, processArtifact, evidenceArtifact],
    },
    {
      item_id: still.id, wall_id: "UC-1279", side: "still", expected_subject: "Tosk",
      asset_sha256: hash, asset_origin: still.asset.origin, disposition: "verify",
      identity_signal: { kind: "revision-bound-file-page", value: "File:Tosk.jpg ObjectName Tosk; article and file link Scott MacDonald, Tosk, Captive Pursuit and DS9; exact bytes match local still." },
      presentation: "character-depiction", evidence: [sourceRevision, exactComparison, processArtifact, evidenceArtifact],
    },
  ],
};
const receiptPath = "data/review/tosk-media-source-receipt-2026-07-24.json";
const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
await writeFile(receiptPath, receiptBytes);

const campaign = {
  version: 2, scope: "star-trek", reviewed_by: "chatgpt-second-desk", reviewed_role: "second-desk",
  reviewed_at: "2026-07-24T08:40:00.000Z", source: audit.source,
  source_receipt: { path: receiptPath, sha256: sha256(receiptBytes) },
  expected_result: { total: 752, verified: 563, absent: 189, review: 0, attention: 0 },
  machine_reviewer: "source-metadata-bot",
  remediations: [{
    item_id: portrait.id, asset_sha256: hash,
    reason: "The performer-page portrait is exact-byte-identical to File:Tosk.jpg and visibly presents Scott MacDonald in the full Tosk prosthetic role, not a neutral out-of-character human portrait.",
    evidence: [performerRevision, sourceRevision, exactComparison, processArtifact, evidenceArtifact],
  }],
  approvals: [{
    item_id: still.id, asset_sha256: hash,
    identity_note: "Revision-bound Memory Alpha metadata identifies these exact bytes as File:Tosk.jpg, links the file to Tosk, Scott MacDonald and Captive Pursuit, and the remote file is byte-identical to the local still.",
    identity_evidence: [sourceRevision, exactComparison, evidenceArtifact],
    presentation: "character-depiction",
    presentation_note: "Independent review of the exact hash-bound bytes shows a filmed close-up of the Tosk character in the complete reptilian prosthetic design, not artwork, a prop-only image, or a behind-the-scenes substitute.",
    presentation_evidence: [evidenceArtifact],
  }],
};
const campaignPath = "data/review/tosk-media-audit-campaign-2026-07-24.json";
await writeFile(campaignPath, `${JSON.stringify(campaign, null, 2)}\n`);

runNode("scripts/media-audit-campaign.mjs", ["--input", campaignPath]);
await rm("images/uc-1279-portrait.jpg", { force: true });
runNode("scripts/media-audit.mjs", ["validate"]);
runNode("scripts/media-audit.mjs", ["gate", "--scope", "star-trek"]);

// Autopilot complete performs the archive preflight itself, so every dependent
// projection and benchmark must already describe the remediated corpus.
runNode("scripts/credits.mjs");
runNode("scripts/sync-sources.mjs");
runNode("scripts/shard.mjs");
runNode("scripts/census-gate.mjs", ["--write"]);
runNode("scripts/build-record-pages.mjs");
runNode("scripts/build-contract.mjs");
runNode("scripts/validate.mjs");

const mediaReview = {
  version: 1,
  reviewed_by: "chatgpt-second-desk",
  lease_id: "lease_caac98ab2c967572183445c9",
  reviews: [{
    task_id: "ap_525b90d304dca267e9231889",
    records: [{
      wall_id: "UC-1279",
      still: { disposition: "verified", subject: "Tosk", source: "https://memory-alpha.fandom.com/wiki/Tosk", note: "Revision-bound File:Tosk.jpg metadata names Tosk and links Scott MacDonald and Captive Pursuit; the remote bytes exactly match this filmed character still." },
      portrait: { disposition: "absent", note: "The only retrieved performer-page image was File:Tosk.jpg itself, so it was reversibly nulled rather than misfiled as a neutral Scott MacDonald portrait." },
    }],
  }],
};
await writeFile(".luna/media-review.json", `${JSON.stringify(mediaReview, null, 2)}\n`);
runNode("scripts/autopilot.mjs", ["complete", "--input", ".luna/media-review.json", "--now", "2026-07-24T08:42:00.000Z"]);
runNode("scripts/autopilot.mjs", ["validate"]);

const roadmapPath = "data/ROADMAP-STATE.json";
const roadmap = JSON.parse(await readFile(roadmapPath, "utf8"));
roadmap.metrics.canonical_records = 1248;
roadmap.metrics.verified_records = 376;
roadmap.metrics.media_audit_ratio = 1;
const note = "Tosk cycle candidate added UC-1279 and closed its two media facets as one verified character still plus one honestly absent portrait: 376/376 Trek records and 752/752 facets complete; 563 facets verified and 189 absent. The cycle is not counted until a reviewed waterline receipt lands.";
if (!roadmap.notes.includes(note)) roadmap.notes.push(note);
await writeFile(roadmapPath, `${JSON.stringify(roadmap, null, 2)}\n`);

runNode("scripts/credits.mjs");
runNode("scripts/sync-sources.mjs");
runNode("scripts/shard.mjs");
runNode("scripts/census-gate.mjs", ["--write"]);
runNode("scripts/build-record-pages.mjs");
runNode("scripts/build-contract.mjs");
runNpm("gate");

const capture = (script, args, path) => {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${script} status capture failed: ${result.stderr}`);
  return writeFile(path, result.stdout);
};
await capture("scripts/waterline.mjs", ["status", "--scope", "star-trek", "--json"], "cycle-closure/waterline-before-receipt.json");
await capture("scripts/media-audit.mjs", ["status", "--scope", "star-trek", "--json"], "cycle-closure/media-final.json");
await capture("scripts/autopilot.mjs", ["status", "--scope", "star-trek", "--json"], "cycle-closure/autopilot-final.json");
await copyFile(receiptPath, `cycle-closure/${receiptPath.split("/").pop()}`);
await copyFile(campaignPath, `cycle-closure/${campaignPath.split("/").pop()}`);
console.log("Tosk closure candidate is exact-subject complete, resolved, and canonical-gate green.");
