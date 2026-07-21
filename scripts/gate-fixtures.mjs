#!/usr/bin/env node
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runCommand, assertRouteCount, expectedRouteCount } from "./gate.mjs";

let failures = 0;

function expect(label, got, want) {
  if (got === want) {
    console.log(`PASS ${label}`);
  } else {
    failures++;
    console.error(`FAIL ${label}`);
    console.error(`  got:  ${JSON.stringify(got)}`);
    console.error(`  want: ${JSON.stringify(want)}`);
  }
}

function expectThrows(label, fn, matcher = /.*/) {
  try {
    fn();
    failures++;
    console.error(`FAIL ${label}`);
    console.error(`  did not throw`);
  } catch (error) {
    if (matcher.test(error?.message || "")) {
      console.log(`PASS ${label}`);
    } else {
      failures++;
      console.error(`FAIL ${label}`);
      console.error(`  got:  ${String(error?.message || error)}`);
      console.error(`  want: pattern ${matcher}`);
    }
  }
}

await (async function main() {
  // 1) Process failure handling must fail with exit status even when command is valid.
  expectThrows(
    "runCommand reports process failure with non-zero exit",
    () => runCommand("bad-node-arg", process.execPath, ["--this-option-does-not-exist"]),
    /failed with code/
  );

  // 2) Route-count invariant across temp paths with spaces in path components.
  const temp = await mkdtemp(path.join(tmpdir(), "undercast-gate-fixture-"));
  const fixtureRoot = path.join(temp, "with space");
  await mkdir(fixtureRoot, { recursive: true });
  const recordsRoot = path.join(fixtureRoot, "records");
  await mkdir(recordsRoot, { recursive: true });
  await mkdir(path.join(recordsRoot, "UC-001"), { recursive: true });
  await mkdir(path.join(recordsRoot, "UC-002"), { recursive: true });
  const specimensPath = path.join(fixtureRoot, "specimens.json");
  const tombstonesPath = path.join(fixtureRoot, "tombstones.json");
  await writeFile(specimensPath, JSON.stringify([{ id: "UC-001" }, { id: "UC-002" }]));
  await writeFile(tombstonesPath, JSON.stringify({ records: [] }));
  expect("route count passes for matching fixture data", (() => {
    assertRouteCount({ recordsRoot, specimensPath, tombstonesPath });
    return "ok";
  })(), "ok");

  expectThrows(
    "route count fails when expected count is stale",
    () => assertRouteCount({ recordsRoot, specimensPath: specimensPath, tombstonesPath: tombstonesPath.replace("tombstones.json", "missing.json") })
  );

  // 3) Clean/dirty working tree semantics for the drift check boundary.
  const driftRoot = await mkdtemp(path.join(tmpdir(), "undercast-gate-drift-"));
  const runGit = (args) => {
    const result = spawnSync("git", args, { cwd: driftRoot, encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`git ${args[0]} failed with code ${result.status}: ${result.stderr}`);
    }
  };
  runGit(["init"]);
  runGit(["config", "user.name", "GateFixture"]);
  runGit(["config", "user.email", "gate-fixture@example.com"]);
  const file = path.join(driftRoot, "fixture.txt");
  await writeFile(file, "base");
  runGit(["add", "fixture.txt"]);
  runGit(["commit", "-m", "base"]);
  await writeFile(file, "changed");
  expectThrows(
    "dirty working tree is detected by assertCleanWorkingTree",
    () => runCommand("Refuse generated drift", "git", ["diff", "--exit-code"], { cwd: driftRoot })
  );
  await writeFile(file, "base");
  expect("clean working tree passes after restore", (() => {
    runCommand("Refuse generated drift", "git", ["diff", "--exit-code"], { cwd: driftRoot });
    return "ok";
  })(), "ok");

  // 4) expected route count helper follows canonical fixtures and remains deterministic.
  const expected = expectedRouteCount(specimensPath, tombstonesPath);
  expect("expectedRouteCount reads JSON fixtures deterministically", expected, 2);

  console.log(failures ? `\n${failures} gate fixture(s) FAILED` : "\nall gate fixtures pass");
  if (failures > 0) process.exit(1);
})();
