#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const ACTIVE_WORKFLOW = ".github/workflows/card-backfill-amortized-wave.yml";
const RETIRED_WORKFLOW = ".github/workflows/card-backfill-source-v2-autonomous.yml";
const ACTIVE_REDUCER = "scripts/card-backfill-wave-reduce-amortized.mjs";
const LEGACY_REDUCER = "scripts/card-backfill-wave-reduce.mjs";
const LOCAL_ADJUDICATOR = "scripts/card-backfill-local-adjudicate.mjs";
const CLOUD_ADJUDICATOR = "scripts/card-backfill-machine-adjudicate.mjs";

function fail(message) {
  throw new Error(`card-backfill local-desk law alignment: ${message}`);
}
async function readText(path) {
  return readFile(resolve(ROOT, path), "utf8");
}
async function writeText(path, value) {
  await writeFile(resolve(ROOT, path), value, "utf8");
}
async function readJson(path) {
  return JSON.parse(await readText(path));
}
async function writeJson(path, value) {
  await writeText(path, JSON.stringify(value, null, 2) + "\n");
}
function replaceExact(text, before, after, label) {
  const count = text.split(before).length - 1;
  if (count !== 1) fail(`${label}: expected one exact marker, found ${count}`);
  return text.replace(before, after);
}
function replaceAllExact(text, before, after, minimum, label) {
  const count = text.split(before).length - 1;
  if (count < minimum) fail(`${label}: expected at least ${minimum} marker(s), found ${count}`);
  return text.split(before).join(after);
}
function lessonById(contract, id) {
  const lesson = (contract.lessons || []).find((row) => row.id === id);
  if (!lesson) fail(`missing lesson ${id}`);
  return lesson;
}
function guardByPath(lesson, path) {
  const matches = (lesson.enforcement || []).filter((guard) => guard.path === path);
  if (matches.length !== 1) fail(`${lesson.id}: expected one guard for ${path}, found ${matches.length}`);
  return matches[0];
}
function replaceGuard(lesson, oldPath, newGuard) {
  const guards = lesson.enforcement || [];
  const index = guards.findIndex((guard) => guard.path === oldPath);
  if (index < 0) fail(`${lesson.id}: missing guard for ${oldPath}`);
  if (guards.filter((guard) => guard.path === oldPath).length !== 1) fail(`${lesson.id}: duplicate guard for ${oldPath}`);
  guards[index] = newGuard;
}

async function alignLessons() {
  const path = ".github/CARD-BACKFILL-LESSONS.json";
  const contract = await readJson(path);
  if (contract.active_policy_id !== "card-backfill-policy-v3-wave-1") fail("unexpected active policy");

  replaceGuard(lessonById(contract, "CBL-001"), CLOUD_ADJUDICATOR, {
    kind: "contains",
    path: LOCAL_ADJUDICATOR,
    all: [
      'identityValue = "expected"',
      "presentationValue === expectedPresentation",
      "Independent local review accepted explicit textual identity custody",
    ],
  });
  replaceGuard(lessonById(contract, "CBL-002"), CLOUD_ADJUDICATOR, {
    kind: "contains",
    path: LOCAL_ADJUDICATOR,
    all: [
      "const source = selectedSourceMetadata(review, sourceReceipt);",
      "const features = await imageFeatures({ packetDir, review, featureMap, featureScript, python });",
      "Textual source custody is insufficient for the filed subject.",
    ],
  });

  const renderLesson = lessonById(contract, "CBL-006");
  const beforeRenderGuards = renderLesson.enforcement.length;
  renderLesson.enforcement = renderLesson.enforcement.filter((guard) => guard.path !== CLOUD_ADJUDICATOR);
  if (renderLesson.enforcement.length !== beforeRenderGuards - 1) fail("CBL-006 dormant cloud guard was not removed exactly once");

  replaceGuard(lessonById(contract, "CBL-015"), CLOUD_ADJUDICATOR, {
    kind: "contains",
    path: LOCAL_ADJUDICATOR,
    all: [
      "const roleBound = source.facts.actor_role_bound === true || source.facts.actor_evidence_bound === true;",
      "(!voiceLike || roleBound)",
      "with the required actor-role chain when applicable",
    ],
  });

  replaceGuard(lessonById(contract, "CBL-023"), RETIRED_WORKFLOW, {
    kind: "contains",
    path: ACTIVE_WORKFLOW,
    all: [
      "name: card-backfill-amortized-wave",
      "max-parallel: 16",
      "PASS — immutable shard complete; branch mutation=false",
    ],
  });

  replaceGuard(lessonById(contract, "CBL-024"), LEGACY_REDUCER, {
    kind: "contains",
    path: ACTIVE_REDUCER,
    all: [
      "sourceHead",
      "mutationHead",
      "refusing stale wave reduction",
      "stageAcceptedRun",
    ],
  });
  replaceGuard(lessonById(contract, "CBL-024"), RETIRED_WORKFLOW, {
    kind: "contains",
    path: ACTIVE_WORKFLOW,
    all: [
      "reduce-wave:",
      "Commit one exact amortized reduction",
      "remote_head",
    ],
  });

  const active = (contract.policies || []).find((row) => row.policy_id === contract.active_policy_id);
  if (!active) fail("active policy registry row missing");
  if (active.workflow !== RETIRED_WORKFLOW) fail(`active policy workflow already drifted to ${active.workflow}`);
  active.workflow = ACTIVE_WORKFLOW;
  active.evidence = [
    "source-policy-v3 retained judgments",
    "facet-safe repository-local second-desk migration",
    "supervisor-owned amortized production",
  ];
  contract.invariants.active_workflow_matches_production = true;
  contract.invariants.dormant_cloud_adjudicator_is_not_an_active_guard = true;

  for (const lesson of contract.lessons || []) {
    for (const guard of lesson.enforcement || []) {
      if (guard.path === RETIRED_WORKFLOW) fail(`${lesson.id} still guards the retired workflow`);
      if (guard.path === CLOUD_ADJUDICATOR) fail(`${lesson.id} still guards the dormant cloud adjudicator`);
    }
  }
  await writeJson(path, contract);
}

async function alignCohortControl() {
  const path = ".github/CARD-BACKFILL-COHORT.json";
  const control = await readJson(path);
  control.denominator.completed_packet_unit = "record/side";
  control.denominator.selector_compatibility = "Exclude only an exact absent record/side obligation already represented by a permanent evidence packet; completing one facet never suppresses the opposite facet.";

  const campaign = control.autonomous_campaign || (control.autonomous_campaign = {});
  campaign.workflow = ACTIVE_WORKFLOW;
  campaign.supervisor_workflow = ".github/workflows/card-backfill-supervisor.yml";
  campaign.supervisor_hook_workflow = ".github/workflows/card-backfill-supervisor-hook.yml";
  campaign.scheduler = "supervisor-explicit-workflow-dispatch";
  campaign.successor_dispatch_owner = "card-backfill-supervisor";
  campaign.branch_mutation_owner = "one-exact-head-amortized-wave-reducer";
  campaign.machine_second_desk = {
    provider: "repository-local",
    implementation: LOCAL_ADJUDICATOR,
    image_features: "scripts/card-backfill-image-features.py",
    identity_source_binding: "explicit-only",
    identity_confidence_minimum: 0.93,
    presentation_confidence_minimum: 0.9,
    cloud_inference_required: false,
    failure_mode: "fail-closed",
  };
  delete campaign.default_branch_schedule;
  campaign.default_branch_self_rearm = true;
  campaign.proof_contract = "one unattended wave selects up to four disjoint source batches, executes up to sixteen read-only discovery shards, runs up to four repository-local independent assembly/adjudication jobs, and commits retained attempts plus accepted staging through one exact-head amortized reducer; workflow completion yields to the supervisor until the target or a typed stop";

  control.invariants.repository_local_adjudication_is_fail_closed = true;
  control.invariants.cloud_inference_is_not_a_campaign_dependency = true;
  control.invariants.one_supervisor_owns_successor_routing = true;
  control.fixed_cost_reset.adjudication = "one repository-local independent decision per candidate, with accepted packets persisted immediately";
  control.fixed_cost_reset.reducer = "one exact-head amortized branch transaction ingesting all immutable wave results";
  control.fixed_cost_reset.campaign_execution = "parallel immutable waves yield to one supervisor without chat; only the amortized reducer and permanent publisher write the branch";
  await writeJson(path, control);
}

async function alignAmortizationContract() {
  const path = ".github/CARD-BACKFILL-AMORTIZATION.json";
  const contract = await readJson(path);
  const runtime = contract.runtime || (contract.runtime = {});
  delete runtime.model_token_is_injected_at_the_assembly_boundary;
  runtime.discovery_runtime_omits_local_desk_packages = true;
  runtime.repository_local_second_desk_runs_at_the_assembly_boundary = true;
  runtime.opencv_cascade_data_is_verified_before_adjudication = true;
  runtime.cloud_model_token_required = false;
  contract.control_loop.successor_routing_owner = "card-backfill-supervisor";
  contract.invariants.no_cloud_inference_dependency = true;
  await writeJson(path, contract);
}

async function alignActiveWorkflow() {
  const path = ACTIVE_WORKFLOW;
  let text = await readText(path);
  const bareUse = "      - uses: ./.github/actions/card-backfill-runtime\n";
  const runtimeParts = text.split(bareUse);
  if (runtimeParts.length !== 3) fail(`active workflow expected two unprofiled runtime uses, found ${runtimeParts.length - 1}`);
  text = runtimeParts[0]
    + `${bareUse}        with:\n          profile: discovery\n`
    + runtimeParts[1]
    + `${bareUse}        with:\n          profile: local-desk\n`
    + runtimeParts[2];

  const continueStart = text.indexOf("\n  continue:\n");
  const reportStart = text.indexOf("\n  report-status:\n");
  if (continueStart < 0 || reportStart < 0 || reportStart <= continueStart) fail("active workflow continue/report boundary drift");
  text = text.slice(0, continueStart) + text.slice(reportStart);

  if (!text.includes("profile: discovery") || !text.includes("profile: local-desk")) fail("runtime profiles were not made explicit");
  if (text.includes("\n  continue:\n")) fail("direct wave self-dispatch job remains");
  if (text.includes("models: read") || text.includes("card-backfill-machine-adjudicate.mjs")) fail("cloud inference reappeared in active workflow");
  await writeText(path, text);
}

async function alignSupervisor() {
  const path = ".github/workflows/card-backfill-supervisor.yml";
  let text = await readText(path);
  text = replaceExact(text, "  contents: write\n", "  contents: read\n", "supervisor temporary write permission");
  text = replaceExact(text, "    timeout-minutes: 120\n", "", "supervisor temporary timeout");
  text = replaceExact(text, "          fetch-depth: 0\n", "          fetch-depth: 1\n", "supervisor bootstrap checkout depth");

  const bootstrapStart = text.indexOf("\n      - name: Complete pending local-desk law alignment before routing\n");
  const routeStart = text.indexOf("\n      - name: Prove and compute the one permitted successor\n");
  if (bootstrapStart < 0 || routeStart < 0 || routeStart <= bootstrapStart) fail("supervisor bootstrap/route boundary drift");
  text = text.slice(0, bootstrapStart) + text.slice(routeStart);

  text = replaceExact(text, "        if: steps.alignment.outputs.completed != 'true'\n", "", "supervisor route bootstrap condition");
  for (const action of ["stage", "publish", "discover", "stop"]) {
    text = replaceExact(
      text,
      `if: steps.alignment.outputs.completed != 'true' && steps.route.outputs.action == '${action}'`,
      `if: steps.route.outputs.action == '${action}'`,
      `supervisor ${action} bootstrap condition`,
    );
  }

  const customCustody = `          action="\${{ steps.route.outputs.action || 'failed' }}"\n          completed="\${{ steps.route.outputs.completed || '?' }}"\n          target="\${{ steps.route.outputs.target || '?' }}"\n          status_head="$HEAD_SHA"\n          if [ "\${{ steps.alignment.outputs.completed }}" = true ]; then\n            action=law-align\n            completed=46\n            target=147\n            status_head="\${{ steps.alignment.outputs.final_head }}"\n          fi\n          description="action=\${action}; completed=\${completed}/\${target}; yield=\${YIELD_REASON}"\n`;
  const ordinaryCustody = `          description="action=\${{ steps.route.outputs.action || 'failed' }}; completed=\${{ steps.route.outputs.completed || '?' }}/\${{ steps.route.outputs.target || '?' }}; yield=\${YIELD_REASON}"\n`;
  text = replaceExact(text, customCustody, ordinaryCustody, "supervisor custody bootstrap reporting");
  text = replaceExact(text, "statuses/${status_head}", "statuses/${HEAD_SHA}", "supervisor custody status head");

  if (text.includes("card-backfill-align-local-desk-law") || text.includes("steps.alignment")) fail("temporary alignment bootstrap remained in supervisor");
  await writeText(path, text);
}

async function alignPackage() {
  const path = "package.json";
  const packageJson = await readJson(path);
  const scripts = packageJson.scripts || (packageJson.scripts = {});
  if (scripts["card-backfill:wave:reduce"] !== "node scripts/card-backfill-wave-reduce.mjs") fail("active reducer alias drifted before alignment");
  scripts["card-backfill:wave:reduce"] = "node scripts/card-backfill-wave-reduce-amortized.mjs";
  scripts["card-backfill:wave:reduce:legacy"] = "node scripts/card-backfill-wave-reduce.mjs";
  scripts["card-backfill:amortization:fixtures"] = "node scripts/card-backfill-amortization-fixtures.mjs";
  scripts["card-backfill:local-desk-law:fixtures"] = "node scripts/card-backfill-local-desk-law-fixtures.mjs";
  await writeJson(path, packageJson);
}

async function alignFixtureInheritance() {
  const path = "scripts/card-backfill-amortization-fixtures.mjs";
  let text = await readText(path);
  const anchor = 'await import("./card-backfill-source-policy-v3-live-regressions.mjs");\n';
  if (text.includes('await import("./card-backfill-local-desk-law-fixtures.mjs");')) fail("local-desk law fixture already inherited unexpectedly");
  text = replaceExact(text, anchor, `${anchor}await import("./card-backfill-local-desk-law-fixtures.mjs");\n`, "amortization fixture law inheritance");
  await writeText(path, text);
}

async function alignDocs() {
  {
    const path = "docs/CARD-BACKFILL-AMORTIZATION.md";
    let text = await readText(path);
    text = replaceExact(text, "independent adjudication", "repository-local independent adjudication", "amortization production equation");
    text = replaceExact(
      text,
      "A missing model token, reducer race, or publication delay does not authorize source rediscovery.",
      "A local-desk runtime failure, reducer race, or publication delay does not authorize source rediscovery.",
      "amortization downstream failure",
    );
    text = replaceExact(
      text,
      "The shared runtime action reuses ImageMagick already present on the hosted image. Package installation occurs only when the required commands are absent.",
      "The shared runtime action has two explicit profiles. Discovery installs only missing ImageMagick compatibility and deliberately omits OpenCV, NumPy, cascade data, and Tesseract. Assembly uses the `local-desk` profile, which installs `python3-opencv`, `opencv-data`, and `tesseract-ocr` only when absent and verifies a usable face-cascade path before adjudication. No cloud-model token is required.",
      "amortization runner setup",
    );
    await writeText(path, text);
  }

  {
    const path = "docs/CARD-BACKFILL-AUTONOMOUS.md";
    let text = await readText(path);
    text = replaceAllExact(text, "independent machine second desk", "repository-local independent second desk", 1, "autonomous local desk wording");
    text = replaceExact(
      text,
      "The workflow `.github/workflows/card-backfill-source-v2-autonomous.yml` is retained at its historical path but now runs `card-backfill-source-v3-wave-autonomous`.",
      "The production workflow is `.github/workflows/card-backfill-amortized-wave.yml`. The historical `.github/workflows/card-backfill-source-v2-autonomous.yml` remains manual-only as an explicit retirement receipt; it is not a production scheduler or enforcement surface. Successful production completion yields through `.github/workflows/card-backfill-supervisor-hook.yml` to the single supervisor.",
      "autonomous active workflow",
    );
    text = replaceExact(text, "`scripts/card-backfill-wave-reduce.mjs` is the only source-wave branch writer.", "`scripts/card-backfill-wave-reduce-amortized.mjs` is the only source-wave branch writer.", "autonomous active reducer");
    text = replaceAllExact(text, "machine decisions", "repository-local decisions", 1, "autonomous decision custody");
    text = replaceExact(text, "source, model, custody, reducer, or repository-gate integrity fails;", "source, local-desk runtime, custody, reducer, or repository-gate integrity fails;", "autonomous stop condition");
    text = replaceExact(
      text,
      "up to four independent render/adjudication jobs in parallel",
      "up to four repository-local independent render/adjudication jobs in parallel",
      "autonomous architecture desk",
    );
    await writeText(path, text);
  }

  {
    const path = "docs/CARD-BACKFILL-COHORTS.md";
    let text = await readText(path);
    text = replaceExact(text, "parallel independent adjudication artifacts", "parallel repository-local independent adjudication artifacts", "cohorts production equation");
    text = replaceExact(
      text,
      "The independent machine or person second desk must decide two different claims:",
      "The repository-local independent second desk must decide two different claims:",
      "cohorts active desk",
    );
    text = replaceExact(text, "- model or person identity;", "- repository-local provider and adjudication implementation;", "cohorts decision provider");
    text = replaceExact(text, "- prompt, response, and image digests;", "- source-custody, local feature, and decision digests;", "cohorts decision digests");
    text = replaceAllExact(text, "machine decisions", "repository-local decisions", 1, "cohorts decision custody");
    text = replaceExact(text, "The reducer is the only source-wave branch writer.", "The amortized reducer is the only source-wave branch writer.", "cohorts active reducer prose");
    text = replaceExact(
      text,
      "npm run card-backfill:wave:reduce -- \\\n  --wave .card-backfill-wave/wave.json \\\n  --results-root .card-backfill-wave-results \\\n  --source-head <exact-40-character-sha>",
      "npm run card-backfill:wave:reduce -- \\\n  --wave .card-backfill-wave/wave.json \\\n  --amortization-plan .card-backfill-wave/amortization-plan.json \\\n  --results-root .card-backfill-wave-results \\\n  --source-head <exact-source-sha> \\\n  --mutation-head <exact-branch-sha> \\\n  --observed-head <exact-branch-sha>",
      "cohorts reducer command",
    );
    text = replaceExact(text, "render/adjudication       up to 4 independent jobs per wave", "render/adjudication       up to 4 repository-local independent jobs per wave", "cohorts fixed cost desk");
    await writeText(path, text);
  }
}

async function main() {
  await alignLessons();
  await alignCohortControl();
  await alignAmortizationContract();
  await alignActiveWorkflow();
  await alignSupervisor();
  await alignPackage();
  await alignFixtureInheritance();
  await alignDocs();
  console.log("PASS — local-desk law, workflow ownership, runtime contract, commands, and operator docs aligned");
  console.log("canonical_mutation=false");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
