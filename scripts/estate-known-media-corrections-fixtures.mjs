#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyKnownMediaCorrectionPlan,
  loadKnownMediaCorrectionPlan,
} from "./lib/estate-known-media-corrections.mjs";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const livePlan = await loadKnownMediaCorrectionPlan({ root: repoRoot });
assert.equal(livePlan.length, 71, "the filed correction estate must contain exactly 71 id/side obligations");
assert.equal(livePlan.filter((row) => row.ledger.includes("ferengi-gold")).length, 10, "the Ferengi correction lane must contain ten portraits");
assert.equal(new Set(livePlan.map((row) => `${row.id}/${row.side}`)).size, 71, "the filed correction estate must not contain duplicate obligations");

const root = await mkdtemp(path.join(tmpdir(), "undercast-known-media-corrections-"));
try {
  await mkdir(path.join(root, "data", "review", "estate-debt"), { recursive: true });
  await mkdir(path.join(root, "images"), { recursive: true });
  const stillBytes = Buffer.from("fixture-invalid-still\n", "utf8");
  const portraitBytes = Buffer.from("fixture-invalid-portrait\n", "utf8");
  const stillPath = "images/uc-001-still.jpg";
  const portraitPath = "images/uc-002-portrait.png";
  await writeFile(path.join(root, stillPath), stillBytes);
  await writeFile(path.join(root, portraitPath), portraitBytes);

  const plan = [
    { id: "UC-001", side: "still", preserved_path: stillPath, sha256: sha256(stillBytes), ruling: "Fixture still is the wrong subject.", ledger: "fixture" },
    { id: "UC-002", side: "portrait", preserved_path: portraitPath, sha256: sha256(portraitBytes), ruling: "Fixture portrait is the wrong subject.", ledger: "fixture" },
  ];
  const specimensPath = "data/specimens.json";
  const sourcesPath = "data/SOURCES.json";
  const reportPath = "data/review/estate-debt/report.json";
  const specimens = [
    { id: "UC-001", actor: "One", character: "Character One", still: { src: stillPath, kind: "still" }, portrait: null },
    { id: "UC-002", actor: "Two", character: "Character Two", still: null, portrait: { src: portraitPath, kind: "free" } },
    { id: "UC-003", actor: "Three", character: "Character Three", still: { src: "images/untouched.jpg", kind: "still" }, portrait: null },
  ];
  const sources = [
    { id: "UC-001", actor: "One", character: "Character One", still: { src: stillPath, kind: "still" }, portrait: null },
    { id: "UC-001", actor: "One", character: "Character One", still: { src: stillPath, kind: "still" }, portrait: null, duplicate_projection: true },
    { id: "UC-002", actor: "Two", character: "Character Two", still: null, portrait: { src: portraitPath, kind: "free" } },
    { id: "UC-003", actor: "Three", character: "Character Three", still: { src: "images/untouched.jpg", kind: "still" }, portrait: null },
  ];
  await writeFile(path.join(root, specimensPath), json(specimens));
  await writeFile(path.join(root, sourcesPath), json(sources));

  const beforeSpecimens = await readFile(path.join(root, specimensPath), "utf8");
  const beforeSources = await readFile(path.join(root, sourcesPath), "utf8");
  const dryRun = await applyKnownMediaCorrectionPlan({ root, plan, specimensPath, sourcesPath, reportPath, write: false, now: "2026-07-31T00:00:00.000Z" });
  assert.equal(dryRun.denominator.obligations, 2);
  assert.equal(dryRun.denominator.collected, 2);
  assert.equal(await readFile(path.join(root, specimensPath), "utf8"), beforeSpecimens, "dry-run must not mutate specimens");
  assert.equal(await readFile(path.join(root, sourcesPath), "utf8"), beforeSources, "dry-run must not mutate SOURCES");

  const applied = await applyKnownMediaCorrectionPlan({ root, plan, specimensPath, sourcesPath, reportPath, write: true, now: "2026-07-31T00:00:00.000Z" });
  assert.equal(applied.denominator.collected, 2);
  const specimensAfter = JSON.parse(await readFile(path.join(root, specimensPath), "utf8"));
  const sourcesAfter = JSON.parse(await readFile(path.join(root, sourcesPath), "utf8"));
  assert.equal(specimensAfter.find((row) => row.id === "UC-001").still, null);
  assert.equal(specimensAfter.find((row) => row.id === "UC-002").portrait, null);
  assert.ok(sourcesAfter.filter((row) => row.id === "UC-001").every((row) => row.still === null), "every duplicate SOURCES row must be nulled");
  assert.equal(sourcesAfter.find((row) => row.id === "UC-003").still.src, "images/untouched.jpg", "unfiled bindings must remain unchanged");
  assert.deepEqual(await readFile(path.join(root, stillPath)), stillBytes, "historical still bytes must remain retained");
  assert.deepEqual(await readFile(path.join(root, portraitPath)), portraitBytes, "historical portrait bytes must remain retained");
  const receipt = JSON.parse(await readFile(path.join(root, reportPath), "utf8"));
  assert.equal(receipt.denominator.obligations, 2);
  assert.equal(receipt.invariants.unexpected_current_binding_fails_closed, true);

  const repeated = await applyKnownMediaCorrectionPlan({ root, plan, specimensPath, sourcesPath, reportPath, write: false, now: "2026-07-31T00:00:01.000Z" });
  assert.equal(repeated.denominator.collected, 0, "a completed correction must be idempotent");
  assert.equal(repeated.denominator.already_collected, 2);

  specimensAfter[0].still = { src: "images/new-valid-still.jpg", kind: "still" };
  await writeFile(path.join(root, specimensPath), json(specimensAfter));
  await assert.rejects(
    () => applyKnownMediaCorrectionPlan({ root, plan, specimensPath, sourcesPath, reportPath, write: false }),
    /drifted from images\/uc-001-still\.jpg/,
    "a newer or unexpected binding must never be silently nulled",
  );

  specimensAfter[0].still = null;
  await writeFile(path.join(root, specimensPath), json(specimensAfter));
  await writeFile(path.join(root, portraitPath), Buffer.from("changed-bytes\n"));
  await assert.rejects(
    () => applyKnownMediaCorrectionPlan({ root, plan, specimensPath, sourcesPath, reportPath, write: false }),
    /preserved asset hash drift/,
    "correction authority must remain bound to the exact rejected bytes",
  );

  console.log("PASS — 71-obligation denominator, dry-run, exact nullification, duplicate rows, idempotence, drift rejection, and hash custody");
} finally {
  await rm(root, { recursive: true, force: true });
}
