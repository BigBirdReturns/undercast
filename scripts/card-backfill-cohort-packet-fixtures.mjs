#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashFile, inspectImage } from "./lib/card-backfill-packet.mjs";

const root = await mkdtemp(join(tmpdir(), "undercast-packet-fixture-"));
const baseline = join(root, "baseline");
const candidates = join(root, "candidates");
const scopes = join(root, "scopes");
const out = join(root, "out");
const magick = process.env.MAGICK || "magick";
try {
  await mkdir(join(baseline, "data"), { recursive: true });
  await mkdir(join(baseline, "images"), { recursive: true });
  await mkdir(join(candidates, "images"), { recursive: true });
  await mkdir(scopes, { recursive: true });
  execFileSync(magick, ["-size", "640x480", "gradient:#111111-#eeeeee", join(baseline, "images", "existing.jpg")]);
  execFileSync(magick, ["-size", "800x600", "radial-gradient:#222222-#dddddd", join(candidates, "images", "uc-001-still.jpg")]);
  await writeFile(join(candidates, "images", "uc-002-still.jpg"), await readFile(join(baseline, "images", "existing.jpg")));
  const existingSha = await hashFile(join(baseline, "images", "existing.jpg"));
  await writeFile(join(baseline, "data", "media-manifest.json"), JSON.stringify({ assets: { "images/existing.jpg": { sha256: existingSha } } }));

  const obligations = [1, 2].map((n) => ({
    obligation_id: `UC-00${n}/still`,
    wall_id: `UC-00${n}`,
    side: "still",
    expected_subject: `Character ${n}`,
    identity: { actor: `Actor ${n}`, character: `Character ${n}`, production: `Production ${n}`, years: "2001", universe: "Fixture" },
    shape: { source_route: "explicit-mediawiki", evidence_tier: "filed-independent-evidence" },
    canonical_link: `https://example.test/UC-00${n}`,
    references: [{ url: `https://evidence.test/UC-00${n}` }],
    performances: [],
  }));
  const batch = { version: 1, campaign_id: "fixture", estate_sha256: "a".repeat(64), batch_sha256: "b".repeat(64), cohort_key: "fixture", selected_count: 2, obligations };
  await writeFile(join(root, "batch.json"), JSON.stringify(batch));
  for (const obligation of obligations) await writeFile(join(scopes, `${obligation.wall_id}-${obligation.side}.json`), JSON.stringify({ record_id: obligation.wall_id, side: obligation.side, receipt_sha256: `${obligation.wall_id}` }));
  const candidate = (n) => ({ src: `images/uc-00${n}-still.jpg`, kind: "still", origin: `https://fixture.test/Character_${n}` });
  await writeFile(join(candidates, "report.json"), JSON.stringify({ run_id: "fixture-run", results: obligations.map((row, index) => ({ wall_id: row.wall_id, side: row.side, status: "candidate", candidate: candidate(index + 1) })) }));
  await writeFile(join(root, "control.json"), JSON.stringify({ discovery: { minimum_width: 500, minimum_height: 400 } }));

  const script = fileURLToPath(new URL("./card-backfill-cohort-packetize.mjs", import.meta.url));
  execFileSync(process.execPath, [script, "--baseline", baseline, "--candidates", candidates, "--batch", join(root, "batch.json"), "--scopes", scopes, "--control", join(root, "control.json"), "--out", out, "--magick", magick, "--now", "2026-07-29T00:00:00.000Z"], { stdio: "inherit" });
  const result = JSON.parse(await readFile(join(out, "batch-result.json"), "utf8"));
  assert.equal(result.counts["candidate-pending-independent-visual-adjudication"], 1);
  assert.equal(result.counts.quarantine, 1);
  assert(result.results.find((row) => row.record_id === "UC-002").quarantine_reasons.includes("canonical-byte-duplicate"));
  const candidateInfo = inspectImage(join(out, "packets", "UC-001", "uc-001-still-candidate.jpg"), magick);
  assert.deepEqual({ width: candidateInfo.width, height: candidateInfo.height }, { width: 1260, height: 1000 });
  const wallInfo = inspectImage(join(out, "packets", "UC-001", "card-crop-preview.jpg"), magick);
  assert.deepEqual({ width: wallInfo.width, height: wallInfo.height }, { width: 1246, height: 1000 });
  assert.equal((await readFile(join(out, "summary.txt"), "utf8")).includes("canonical_mutation=false"), true);
  console.log("card-backfill packet fixtures: PASS");
} finally {
  await rm(root, { recursive: true, force: true });
}
