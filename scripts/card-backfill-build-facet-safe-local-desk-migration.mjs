#!/usr/bin/env node
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.cwd();
const OUT = resolve(process.env.MIGRATION_ROOT || join(tmpdir(), "card-backfill-facet-safe-local-desk"));
const SELF = fileURLToPath(import.meta.url);

function run(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label}: exited ${result.status}\n${result.stderr || result.stdout || ""}`);
  return { stdout: result.stdout || "", stderr: result.stderr || "" };
}

async function replaceExact(path, prior, next, label) {
  let value = await readFile(path, "utf8");
  const count = value.split(prior).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one seam, found ${count}`);
  value = value.replace(prior, next);
  await writeFile(path, value);
}

async function installLocalDesk() {
  const sourcePath = "scripts/card-backfill-install-local-desk.mjs";
  const source = await readFile(sourcePath, "utf8");
  const prior = "pharmacolog|footballer|soccer|chemist|physician|politician|scientist|composer";
  const corrected = "pharmacolog(?:ist|ists|y|ical)?|football(?:er|ers|match)?|soccer|chemist(?:ry)?|physician|politician|scientist|composer";
  if (source.split(prior).length - 1 !== 1) throw new Error("local-desk namesake seam drift");
  const root = await mkdtemp(join(tmpdir(), "card-backfill-local-desk-migration-"));
  const path = join(root, "installer.mjs");
  try {
    await writeFile(path, source.replace(prior, corrected));
    await import(`${pathToFileURL(path).href}?facet-safe=1`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function patchFacetCompletion() {
  await replaceExact(
    "scripts/lib/card-backfill-cohort.mjs",
    "    if (completedPackets.has(audit.wall_id)) continue;",
    "    if (completedPackets.has(facetKey(audit.wall_id, audit.side))) continue;",
    "facet-keyed estate exclusion",
  );
  await replaceExact(
    "scripts/lib/card-backfill-cohort.mjs",
    "    completed.set(recordId, { record_id: recordId, side, path: dir });",
    "    completed.set(facetKey(recordId, side), { obligation_id: facetKey(recordId, side), record_id: recordId, side, path: dir });",
    "facet-keyed completed packet index",
  );

  const path = "scripts/card-backfill-cohort-fixtures.mjs";
  let fixture = await readFile(path, "utf8");
  const replacements = [
    [
      'const completed = new Map([["UC-001", { record_id: "UC-001", side: "portrait" }]]);',
      'const completed = new Map([["UC-001/still", { obligation_id: "UC-001/still", record_id: "UC-001", side: "still" }]]);',
      "fixture completed key",
    ],
    [
      'assert(!estate.obligations.some((row) => row.wall_id === "UC-001"), "the frozen campaign must preserve the live selector\'s packet-per-record completion rule");',
      'assert(!estate.obligations.some((row) => row.obligation_id === "UC-001/still"), "only the exact completed facet may leave the open estate");',
      "fixture exact facet assertion",
    ],
    [
      '  assert(found.has("UC-900"));\n  assert(found.has("UC-901"));\n  assert.equal(found.get("UC-901").side, "portrait");',
      '  assert(found.has("UC-900/still"));\n  assert(found.has("UC-901/portrait"));\n  assert(!found.has("UC-900"));\n  assert.equal(found.get("UC-901/portrait").side, "portrait");',
      "fixture completed index assertions",
    ],
  ];
  for (const [prior, next, label] of replacements) {
    const count = fixture.split(prior).length - 1;
    if (count !== 1) throw new Error(`${label}: expected one seam, found ${count}`);
    fixture = fixture.replace(prior, next);
  }
  const insertion = `
const dualSpecimens = [{
  id: "UC-099", actor: "Actor 99", character: "Character 99", production: "Production 99", years: "2004",
  universe: "Fixture", kind: "physical", wiki: "fixture", link: "https://example.test/UC-099",
  references: [{ url: "https://evidence.test/UC-099" }], still: null, portrait: null,
}];
const dualSources = [{ id: "UC-099", still: null, portrait: null }];
const dualAuditItems = [
  { id: "ma-99-still", wall_id: "UC-099", side: "still", scope: "sitewide", status: "absent", expected_subject: "Character 99", risk_codes: ["source-declared-absent"] },
  { id: "ma-99-portrait", wall_id: "UC-099", side: "portrait", scope: "sitewide", status: "absent", expected_subject: "Actor 99", risk_codes: ["source-declared-absent"] },
];
const dualCompleted = new Map([["UC-099/portrait", { obligation_id: "UC-099/portrait", record_id: "UC-099", side: "portrait" }]]);
const dualEstate = buildEstate({ specimens: dualSpecimens, sources: dualSources, auditItems: dualAuditItems, completedPackets: dualCompleted, control });
assert.deepEqual(dualEstate.obligations.map((row) => row.obligation_id), ["UC-099/still"]);
assert.equal(dualEstate.denominator.completed_packet_count, 1);
assert.equal(dualEstate.denominator.open_obligation_count, 1);
assert.equal(dualEstate.denominator.selector_total, 2);
`;
  const anchor = "\nconst shuffled = buildEstate(";
  if (fixture.split(anchor).length - 1 !== 1) throw new Error("dual-side fixture insertion seam drift");
  fixture = fixture.replace(anchor, `${insertion}${anchor}`);
  await writeFile(path, fixture);
}

async function patchAmortizationFixture() {
  const path = "scripts/card-backfill-amortization-fixtures.mjs";
  let value = await readFile(path, "utf8");
  const tokenNeedle = '  "GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}",\n';
  if (value.includes(tokenNeedle)) value = value.replace(tokenNeedle, '  "card-backfill-local-adjudicate.mjs",\n');
  for (const line of [
    'assert(files.runtime.includes("packages+=(imagemagick)"));',
    'assert(files.runtime.includes("packages+=(python3-opencv)"));',
    'assert(files.runtime.includes("packages+=(tesseract-ocr)"));',
    'assert(files.runtime.includes(\'sudo apt-get install -y "${packages[@]}"\'));',
  ]) {
    if (!value.includes(line)) throw new Error(`current runtime assertion missing: ${line}`);
  }
  const cloudGuards = [
    'assert(!files.workflow.includes("card-backfill-machine-adjudicate.mjs"));',
    'assert(!files.workflow.includes("models: read"));',
  ];
  const anchor = 'assert(files.runtime.includes(\'sudo apt-get install -y "${packages[@]}"\'));';
  if (!value.includes(cloudGuards[0])) value = value.replace(anchor, `${anchor}\n${cloudGuards.join("\n")}`);
  await writeFile(path, value);
}

async function retireBuilderWorkflow() {
  await writeFile(".github/workflows/card-backfill-local-desk-recovery-v5.yml", `name: card-backfill-local-desk-migration-retired

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  retired:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo 'RETIRED — facet-safe completion accounting and the repository-local second desk are installed.'
          echo 'The unattended supervisor and amortized wave own all continuing transitions.'
          echo 'manual_continue_required=false'
`);
}

async function proveAndExport() {
  await mkdir(OUT, { recursive: true });
  const log = (name) => join(OUT, name);
  const commands = [
    ["cohort fixtures", process.execPath, ["scripts/card-backfill-cohort-fixtures.mjs"], "cohort-fixtures.log"],
    ["local adjudication fixtures", process.execPath, ["scripts/card-backfill-local-adjudicate-fixtures.mjs"], "local-adjudicate-fixtures.log"],
    ["source policy v3 fixtures", process.execPath, ["scripts/card-backfill-source-policy-v3-fixtures.mjs"], "source-policy-v3-fixtures.log"],
    ["amortization fixtures", process.execPath, ["scripts/card-backfill-amortization-fixtures.mjs"], "amortization-fixtures.log"],
    ["lessons fixtures", process.execPath, ["scripts/card-backfill-lessons-fixtures.mjs"], "lessons-fixtures.log"],
  ];
  for (const [label, command, args, name] of commands) {
    const result = run(label, command, args, { capture: true });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    await writeFile(log(name), `${result.stdout}${result.stderr}`);
  }
  run("lesson contract", process.execPath, ["scripts/card-backfill-lessons.mjs", "validate", "--out", log("lessons-validation.json")]);

  const planRoot = log("plan");
  await rm(planRoot, { recursive: true, force: true });
  const plan = run("facet-safe wave plan", process.execPath, [
    "scripts/card-backfill-source-v3-wave-plan.mjs",
    "--control", ".github/CARD-BACKFILL-COHORT.json",
    "--out", planRoot,
    "--batch-limit", "40",
    "--wave-batches", "4",
    "--workers-per-batch", "4",
  ], { capture: true });
  process.stdout.write(plan.stdout);
  process.stderr.write(plan.stderr);
  await writeFile(log("plan.log"), `${plan.stdout}${plan.stderr}`);
  const summary = await readFile(join(planRoot, "summary.txt"), "utf8");
  for (const line of [
    "current_completed_evidence_packets=46",
    "current_open_source_declared_absences=426",
    "selector_defined_estate=472",
    "selected_count=160",
  ]) if (!summary.split(/\r?\n/).includes(line)) throw new Error(`planning proof missing ${line}`);
  console.log("PASS — facet-safe planner proves 46+426=472 and selects 160 with source_transport_calls=0");

  const gate = run("complete repository gate", process.execPath, ["scripts/gate.mjs"], { capture: true });
  process.stdout.write(gate.stdout);
  process.stderr.write(gate.stderr);
  await writeFile(log("full-gate.log"), `${gate.stdout}${gate.stderr}`);

  run("diff check", "git", ["diff", "--check"]);
  const status = run("status", "git", ["status", "--short"], { capture: true }).stdout;
  const nameStatus = run("name status", "git", ["diff", "--name-status"], { capture: true }).stdout;
  const patch = run("migration patch", "git", ["diff", "--binary"], { capture: true }).stdout;
  const changed = run("changed files", "git", ["diff", "--name-only"], { capture: true }).stdout;
  await Promise.all([
    writeFile(log("status.txt"), status),
    writeFile(log("name-status.txt"), nameStatus),
    writeFile(log("migration.patch"), patch),
    writeFile(log("changed-files.txt"), changed),
  ]);
  const existing = changed.split(/\r?\n/).filter(Boolean).filter((path) => path !== "scripts/card-backfill-build-facet-safe-local-desk-migration.mjs");
  if (!existing.length) throw new Error("migration candidate changed zero durable files");
  await writeFile(log("existing-files.txt"), existing.join("\n") + "\n");
  run("migration archive", "tar", ["-cf", log("changed-files.tar"), "-T", log("existing-files.txt")]);
  run("migration checksums", "sha256sum", [log("changed-files.tar"), log("migration.patch")], { capture: true });
  console.log(nameStatus.trim());
  console.log(`PASS — migration candidate built and fully gated; changed_files=${existing.length}; branch_mutation=false`);
}

async function main() {
  await installLocalDesk();
  await patchFacetCompletion();
  await patchAmortizationFixture();
  await retireBuilderWorkflow();
  await proveAndExport();
}

main().catch(async (error) => {
  await mkdir(dirname(join(OUT, "failure.txt")), { recursive: true });
  await writeFile(join(OUT, "failure.txt"), `${error.stack || error.message || String(error)}\n`);
  console.error(`card-backfill facet-safe local-desk builder: ${error.message}`);
  process.exit(1);
});
