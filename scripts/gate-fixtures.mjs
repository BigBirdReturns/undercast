#!/usr/bin/env node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runCommand, assertRouteCount, expectedRouteCount, listSteps, selectSteps } from "./gate.mjs";

let failures = 0;
function pass(label) { console.log(`PASS ${label}`); }
function fail(label, detail) { failures++; console.error(`FAIL ${label}\n  ${detail}`); }
function expect(label, got, want) { got === want ? pass(label) : fail(label, `got ${JSON.stringify(got)}; want ${JSON.stringify(want)}`); }
function expectThrows(label, fn, matcher = /.*/) {
  try { fn(); fail(label, "did not throw"); }
  catch (error) { matcher.test(error?.message || "") ? pass(label) : fail(label, `got ${String(error?.message || error)}; want ${matcher}`); }
}

const tempRoots = [];
try {
  expectThrows("runCommand reports non-zero process exit", () => runCommand("bad-node-arg", process.execPath, ["--this-option-does-not-exist"], { stdio: "pipe" }), /failed with code/);
  expectThrows("runCommand reports command-start failure", () => runCommand("missing-command", `undercast-command-that-does-not-exist-${process.pid}`, [], { stdio: "pipe" }), /could not start/);

  const temp = await mkdtemp(path.join(tmpdir(), "undercast-gate-fixture-"));
  tempRoots.push(temp);
  const fixtureRoot = path.join(temp, "with space");
  const recordsRoot = path.join(fixtureRoot, "records");
  await mkdir(path.join(recordsRoot, "UC-001"), { recursive: true });
  await mkdir(path.join(recordsRoot, "UC-002"), { recursive: true });
  const specimensPath = path.join(fixtureRoot, "specimens.json");
  const tombstonesPath = path.join(fixtureRoot, "tombstones.json");
  await writeFile(specimensPath, JSON.stringify([{ id: "UC-001" }, { id: "UC-002" }]));
  await writeFile(tombstonesPath, JSON.stringify({ records: [] }));
  assertRouteCount({ recordsRoot, specimensPath, tombstonesPath });
  pass("route count works across paths containing spaces");
  expect("expectedRouteCount is deterministic", expectedRouteCount(specimensPath, tombstonesPath), 2);
  await mkdir(path.join(recordsRoot, "EXTRA"));
  expectThrows("route count refuses extra generated routes", () => assertRouteCount({ recordsRoot, specimensPath, tombstonesPath }), /expected 2/);

  const driftRoot = await mkdtemp(path.join(tmpdir(), "undercast-gate-drift-"));
  tempRoots.push(driftRoot);
  const runGit = (args) => {
    const result = spawnSync("git", args, { cwd: driftRoot, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  };
  runGit(["init"]);
  runGit(["config", "user.name", "GateFixture"]);
  runGit(["config", "user.email", "gate-fixture@example.invalid"]);
  const fixture = path.join(driftRoot, "fixture.txt");
  await writeFile(fixture, "base\n");
  runGit(["add", "fixture.txt"]);
  runGit(["commit", "-m", "base"]);
  await writeFile(fixture, "changed\n");
  expectThrows("dirty working tree is observable", () => runCommand("drift", "git", ["diff", "--exit-code"], { cwd: driftRoot, stdio: "pipe" }), /failed with code/);

  const steps = listSteps();
  expect("canonical gate has one media-audit step", steps.filter((step) => step.id === "media-audit").length, 1);
  expect("canonical gate keeps rendered step explicit", steps.filter((step) => step.rendered).length, 1);
  expect("--from starts at exact step id", selectSteps({ from: "media-audit" })[0].id, "media-audit");
  expect("--skip-rendered removes only rendered work", selectSteps({ skipRendered: true }).some((step) => step.rendered), false);
  expectThrows("unknown --from fails closed", () => selectSteps({ from: "does-not-exist" }), /matched no gate step/);

  console.log(failures ? `\n${failures} gate fixture(s) FAILED` : "\nall gate fixtures pass");
  if (failures) process.exitCode = 1;
} finally {
  for (const root of tempRoots) await rm(root, { recursive: true, force: true });
}
