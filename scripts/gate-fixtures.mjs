#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

  const archiveWorkflow = await readFile(new URL("../.github/workflows/validate.yml", import.meta.url), "utf8");
  const checkoutDepth = Number(archiveWorkflow.match(/uses:\s*actions\/checkout@v4[\s\S]{0,160}?fetch-depth:\s*(\d+)/)?.[1]);
  expect("canonical workflow fetches full immutable receipt history", checkoutDepth, 0);

  const autopilotWorkflow = await readFile(new URL("../.github/workflows/autopilot.yml", import.meta.url), "utf8");
  const autopilotCheckoutBlock = autopilotWorkflow.match(/uses:\s*actions\/checkout@v4([\s\S]*?)(?=\n\s*-\s+(?:uses|name):)/)?.[1] || "";
  const autopilotCheckoutDepth = Number(autopilotCheckoutBlock.match(/fetch-depth:\s*(\d+)/)?.[1]);
  const autopilotCheckoutFilter = autopilotCheckoutBlock.match(/filter:\s*([^\s]+)/)?.[1];
  expect("Autopilot workflow fetches full immutable receipt history", autopilotCheckoutDepth, 0);
  expect("Autopilot workflow keeps full history blob-lazy", autopilotCheckoutFilter, "blob:none");

  const autopilotSyncIndex = autopilotWorkflow.indexOf("run: npm run autopilot -- sync");
const adapterWriteIndex = autopilotWorkflow.indexOf("run: npm run adapter:write && npm run adapter:check");
const autopilotValidationIndex = autopilotWorkflow.indexOf("run: npm run autopilot -- validate && npm run autopilot:fixtures");
expect(
  "Autopilot regenerates the adapter baseline after sync and before validation",
  autopilotSyncIndex >= 0 && adapterWriteIndex > autopilotSyncIndex && autopilotValidationIndex > adapterWriteIndex,
  true,
);

const waterlineWorkflow = await readFile(new URL("../.github/workflows/waterline.yml", import.meta.url), "utf8");
const waterlineUploadIndex = waterlineWorkflow.indexOf("uses: actions/upload-artifact@v4");
const waterlineUploadBlock = waterlineUploadIndex >= 0 ? waterlineWorkflow.slice(waterlineUploadIndex) : "";
expect("waterline upload retains the hidden health directory", /path:\s*\.waterline-health/.test(waterlineUploadBlock), true);
expect("waterline upload explicitly includes hidden evidence", /include-hidden-files:\s*true/.test(waterlineUploadBlock), true);
expect("waterline upload remains fail-closed when evidence is missing", /if-no-files-found:\s*error/.test(waterlineUploadBlock), true);

const collectionPolicyWorkflow = await readFile(new URL("../.github/workflows/collection-policy.yml", import.meta.url), "utf8");
const collectionEvidencePaths = collectionPolicyWorkflow.match(/\/tmp\/ux-02a-dec0016-evidence/g) || [];
expect("collection policy uses one runner-independent evidence path for production and upload", collectionEvidencePaths.length, 2);
expect("collection policy job environment does not bind the unavailable runner context", /EVIDENCE:\s*.*runner\.temp/.test(collectionPolicyWorkflow), false);

  runCommand("Publisher custody fixtures", process.execPath, ["test/publisher-custody-fixtures.mjs"], { stdio: "pipe" });
  pass("publisher custody fixtures run inside canonical gate fixtures");
  runCommand("Publisher handoff file fixtures", process.execPath, ["test/publisher-handoff-files-fixtures.mjs"], { stdio: "pipe" });
  pass("publisher handoff file fixtures run inside canonical gate fixtures");
  runCommand("Publisher condition fixtures", process.execPath, ["test/publisher-condition-custody-fixtures.mjs"], { stdio: "pipe" });
  pass("publisher condition fixtures run inside canonical gate fixtures");
  runCommand("Publisher attempt artifact fixtures", process.execPath, ["scripts/publisher-artifact-attempt-fixtures.mjs"], { stdio: "pipe" });
  pass("publisher attempt artifact fixtures run inside canonical gate fixtures");
  runCommand("Publisher custody workflow scan", process.execPath, ["scripts/publisher-custody.mjs", "check-workflows"], { stdio: "pipe" });
  pass("publisher custody workflow scan runs inside canonical gate fixtures");
  runCommand("Publisher write-condition scan", process.execPath, ["scripts/publisher-condition-custody.mjs"], { stdio: "pipe" });
  pass("publisher write-condition scan runs inside canonical gate fixtures");

  console.log(failures ? `\n${failures} gate fixture(s) FAILED` : "\nall gate fixtures pass");
  if (failures) process.exitCode = 1;
} finally {
  for (const root of tempRoots) await rm(root, { recursive: true, force: true });
}
