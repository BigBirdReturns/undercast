#!/usr/bin/env node
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

async function text(path) {
  return readFile(path, "utf8");
}

async function write(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value);
}

function replaceOnce(value, from, to, label) {
  const first = value.indexOf(from);
  if (first < 0) throw new Error(`${label}: expected source text was not found`);
  if (value.indexOf(from, first + from.length) >= 0) throw new Error(`${label}: expected source text was not unique`);
  return value.slice(0, first) + to + value.slice(first + from.length);
}

function replaceAllRequired(value, from, to, label) {
  const count = value.split(from).length - 1;
  if (!count) throw new Error(`${label}: expected source text was not found`);
  return { value: value.split(from).join(to), count };
}

async function ensureAbsent(path) {
  try {
    await access(path);
    throw new Error(`${path} already exists; refusing to overwrite a preserved predecessor`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function preserveV3Binding() {
  const source = "scripts/lib/card-backfill-source-policy-v3.mjs";
  const destination = "scripts/lib/card-backfill-source-policy-v3-preserved.mjs";
  await ensureAbsent(destination);
  await copyFile(source, destination);
}

async function updateRuntimePolicy() {
  const path = "scripts/lib/card-backfill-source-policy-v2.mjs";
  let value = await text(path);
  value = replaceOnce(value, "  version: 3,", "  version: 4,", `${path} version`);
  value = replaceOnce(value, "  revision: 1,", "  revision: 0,", `${path} revision`);
  value = replaceOnce(value, '  policy_id: "card-backfill-policy-v3-wave-1",', '  policy_id: "card-backfill-policy-v4-exact-pageimage-1",', `${path} policy id`);
  value = replaceOnce(value, '  parent_policy_id: "card-backfill-cohort-v2",', '  parent_policy_id: "card-backfill-policy-v3-wave-1",', `${path} parent policy`);
  value = replaceOnce(value, '  still_route: "mediawiki-bound-multicandidate-v3",', '  still_route: "mediawiki-bound-multicandidate-v4",', `${path} still route`);
  value = replaceOnce(value, '  portrait_route: "commons-bound-multicandidate-v3",', '  portrait_route: "commons-bound-multicandidate-v4",', `${path} portrait route`);
  value = replaceOnce(
    value,
    "  predownload_textual_binding_gate: true,\n",
    "  predownload_textual_binding_gate: true,\n  exact_lead_pageimage_custody_allowed: true,\n  generic_filename_requires_exact_pageimage_relation: true,\n",
    `${path} v4 custody fields`,
  );
  value = replaceOnce(value, '"source-policy-v3-already-attempted"', '"source-policy-v4-already-attempted"', `${path} replay reason`);
  value = replaceOnce(value, 'lane: "card-backfill-source-policy-v3-estate"', 'lane: "card-backfill-source-policy-v4-estate"', `${path} estate lane`);
  await write(path, value);
}

async function updateBindingPolicy() {
  const path = "scripts/lib/card-backfill-source-policy-v3.mjs";
  let value = await text(path);
  value = replaceOnce(
    value,
    '  const file = candidate?.file || "";\n',
    '  const file = candidate?.file || "";\n  const method = String(candidate?.method || "");\n  const exactLeadPageImage = /(?:^|-)pageimage-v(?:3|4)$/i.test(method);\n',
    `${path} pageimage method`,
  );
  value = replaceOnce(
    value,
    "  const fileHasProduction = productionMatch(fileText, production);\n",
    "  const fileHasProduction = productionMatch(fileText, production);\n  const pageimageSubjectBound = Boolean(exactLeadPageImage && exactPage);\n  const pageimageProductionBound = Boolean(pageimageSubjectBound && pageHasProduction);\n  const subjectBound = fileHasAlias || pageimageSubjectBound;\n  const productionBound = fileHasProduction || pageimageProductionBound;\n",
    `${path} pageimage custody facts`,
  );
  value = replaceOnce(value, '    if (!fileHasAlias) reasons.push("candidate-file-not-explicitly-bound-to-subject");', '    if (!subjectBound) reasons.push("candidate-file-not-explicitly-bound-to-subject");', `${path} subject custody`);
  value = replaceOnce(value, '    if (!fileHasProduction) reasons.push("candidate-file-lacks-filed-production-context");', '    if (!productionBound) reasons.push("candidate-file-lacks-filed-production-context");', `${path} production custody`);
  value = replaceOnce(
    value,
    '    const exactActorPage = actorAliases.some((alias) => textEquivalent(titleBase(pageTitle), alias));\n    const fileHasActor = containsAlias(fileText, actorAliases);\n    if (!exactActorPage && !(fileHasActor && portraitContext)) reasons.push("portrait-not-explicitly-bound-to-actor");',
    '    const exactActorPage = actorAliases.some((alias) => textEquivalent(titleBase(pageTitle), alias));\n    const exactActorLeadPageImage = Boolean(exactActorPage && exactLeadPageImage);\n    const fileHasActor = containsAlias(fileText, actorAliases);\n    if (!exactActorLeadPageImage && !(fileHasActor && portraitContext)) reasons.push("portrait-not-explicitly-bound-to-actor");',
    `${path} actor pageimage custody`,
  );
  value = replaceOnce(value, "  if (exactPage) adjustment += 180;\n", "  if (exactPage) adjustment += 180;\n  if (exactLeadPageImage) adjustment += 140;\n", `${path} pageimage score`);
  value = replaceOnce(
    value,
    '    explicit_chain: side === "still" ? Boolean(eligible && fileHasAlias && fileHasProduction && (!voiceLike || roleBound)) : eligible,',
    '    explicit_chain: side === "still" ? Boolean(eligible && subjectBound && productionBound && (!voiceLike || roleBound)) : eligible,',
    `${path} explicit chain`,
  );
  value = replaceOnce(
    value,
    "      file_has_production: fileHasProduction,\n",
    "      file_has_production: fileHasProduction,\n      exact_lead_pageimage: exactLeadPageImage,\n      pageimage_subject_bound: pageimageSubjectBound,\n      pageimage_production_bound: pageimageProductionBound,\n      exact_actor_lead_pageimage: Boolean(side === \"portrait\" && exactLeadPageImage && actorAliases.some((alias) => textEquivalent(titleBase(pageTitle), alias))),\n",
    `${path} exported pageimage facts`,
  );
  await write(path, value);
}

async function updateSourceTransport() {
  const path = "scripts/card-backfill-source-v2.mjs";
  let value = await text(path);
  const replacements = [
    ["mediawiki-page-candidate-v3", "mediawiki-page-candidate-v4"],
    ["mediawiki-pageimage-v3", "mediawiki-pageimage-v4"],
    ["exact-actor-page-image-v3", "exact-actor-page-image-v4"],
    ["exact-actor-pageimage-v3", "exact-actor-pageimage-v4"],
    ["commons-name-search-v3", "commons-name-search-v4"],
    ["undercast-card-backfill-source-v3/3.0", "undercast-card-backfill-source-v4/4.0"],
    ["source policy v3 produced", "source policy v4 produced"],
    ["card-backfill source v3:", "card-backfill source v4:"],
  ];
  for (const [from, to] of replacements) {
    const result = replaceAllRequired(value, from, to, `${path} ${from}`);
    value = result.value;
  }
  await write(path, value);
}

async function updateLocalDesk() {
  const path = "scripts/card-backfill-local-adjudicate.mjs";
  let value = await text(path);
  value = replaceOnce(
    value,
    '    const exactActorPage = String(source.candidate.source_method || "").startsWith("exact-actor-pageimage")\n      && (equivalent(source.candidate.source_page_title, actor) || source.facts.page_looks_like_actor === true)\n      && fileHasActor;\n',
    '    const exactLeadPageImage = source.facts.exact_lead_pageimage === true;\n    const exactActorPage = String(source.candidate.source_method || "").startsWith("exact-actor-pageimage")\n      && exactLeadPageImage\n      && (equivalent(source.candidate.source_page_title, actor) || source.facts.page_looks_like_actor === true);\n    const pageimageStillBound = exactLeadPageImage\n      && source.facts.pageimage_subject_bound === true\n      && source.facts.pageimage_production_bound === true;\n',
    `${path} pageimage identity setup`,
  );
  value = replaceOnce(
    value,
    '    } else if (review.side === "still" && fileHasSubject && fileHasProduction && !artifactMetadata && (!voiceLike || roleBound)) {\n      identityValue = "expected";\n      identityConfidence = 0.98;\n      identityNote = "The selected file metadata explicitly names both the filed character and production, with the required actor-role chain when applicable.";\n',
    '    } else if (review.side === "still" && ((fileHasSubject && fileHasProduction) || pageimageStillBound) && !artifactMetadata && (!voiceLike || roleBound)) {\n      identityValue = "expected";\n      identityConfidence = pageimageStillBound && !(fileHasSubject && fileHasProduction) ? 0.97 : 0.98;\n      identityNote = pageimageStillBound && !(fileHasSubject && fileHasProduction)\n        ? "The exact character page, exact lead page-image relationship, filed production context, and required actor-role chain bind the selected bytes without relying on the filename."\n        : "The selected file metadata explicitly names both the filed character and production, with the required actor-role chain when applicable.";\n',
    `${path} still pageimage acceptance`,
  );
  value = replaceOnce(
    value,
    '      identityNote = exactActorPage\n        ? "The selected file is carried by the exact actor page and explicitly names the filed actor."\n        : "The selected file title and portrait metadata explicitly name the filed actor without conflicting namesake custody.";\n',
    '      identityNote = exactActorPage\n        ? "The exact actor page and its exact lead page-image relationship bind the selected bytes without relying on the filename."\n        : "The selected file title and portrait metadata explicitly name the filed actor without conflicting namesake custody.";\n',
    `${path} portrait pageimage note`,
  );
  value = value
    .split("repository-local-opencv-source-custody-second-desk-v1").join("repository-local-opencv-source-custody-second-desk-v2")
    .split("opencv-haar-tesseract-source-custody-v1").join("opencv-haar-tesseract-source-custody-v2")
    .split("explicit-source-binding-and-required-presentation-or-fail-closed").join("explicit-file-or-exact-lead-pageimage-binding-and-required-presentation-or-fail-closed");
  await write(path, value);
}

async function updateSelectionFixture() {
  const path = "scripts/card-backfill-source-policy-v2-fixtures.mjs";
  let value = await text(path);
  value = value
    .split("policy v3 route encoding must prevent silent replay").join("policy v4 route encoding must prevent silent replay")
    .split("The active v3 assertion below").join("The active v4 assertion below")
    .split("source-policy v3 replay and composite fixtures: PASS").join("source-policy v4 replay and composite fixtures: PASS");
  await write(path, value);
}

async function createV4BindingFixture() {
  const sourcePath = "scripts/card-backfill-source-policy-v3-fixtures.mjs";
  const destination = "scripts/card-backfill-source-policy-v4-fixtures.mjs";
  await ensureAbsent(destination);
  const original = await text(sourcePath);
  let value = original;
  value = value.replace(
    'console.log("card-backfill source-policy v3 fixtures: PASS — exact file custody required; namesakes, icons, objects, and wrong adaptations fail closed");',
    String.raw`const genericExactStillPageimage = evaluateSourceCandidate({
  side: "still", expectedSubject: "Filed Beast", actor: "Actor Three", production: "Filed Movie 1999", performanceMode: "physical-or-live-action", actorEvidence: null,
  candidate: { method: "mediawiki-pageimage-v4", file: "Lead image.jpg", page: { title: "Filed Beast", extract_windows: ["Actor Three portrayed Filed Beast in Filed Movie 1999."] }, source: { description: "", categories: "" } },
});
assert.equal(genericExactStillPageimage.eligible, true);
assert.equal(genericExactStillPageimage.facts.exact_lead_pageimage, true);
assert.equal(genericExactStillPageimage.facts.pageimage_subject_bound, true);
assert.equal(genericExactStillPageimage.facts.pageimage_production_bound, true);

const genericNonLeadStill = evaluateSourceCandidate({
  side: "still", expectedSubject: "Filed Beast", actor: "Actor Three", production: "Filed Movie 1999", performanceMode: "physical-or-live-action", actorEvidence: null,
  candidate: { method: "mediawiki-page-candidate-v4", file: "Lead image.jpg", page: { title: "Filed Beast", extract_windows: ["Actor Three portrayed Filed Beast in Filed Movie 1999."] }, source: { description: "", categories: "" } },
});
assert.equal(genericNonLeadStill.eligible, false);
assert(genericNonLeadStill.reasons.includes("candidate-file-not-explicitly-bound-to-subject"));
assert(genericNonLeadStill.reasons.includes("candidate-file-lacks-filed-production-context"));

const genericExactActorPageimage = evaluateSourceCandidate({
  side: "portrait", expectedSubject: "Exact Actor", actor: "Exact Actor", production: "Filed Movie", performanceMode: "physical-or-live-action", actorEvidence: null,
  candidate: { method: "exact-actor-pageimage-v4", file: "Lead image.jpg", page: { title: "Exact Actor", extract_windows: ["Exact Actor is a performer in Filed Movie."] }, source: { description: "", categories: "" } },
});
assert.equal(genericExactActorPageimage.eligible, true);
assert.equal(genericExactActorPageimage.facts.exact_actor_lead_pageimage, true);

const genericActorNonLead = evaluateSourceCandidate({
  side: "portrait", expectedSubject: "Exact Actor", actor: "Exact Actor", production: "Filed Movie", performanceMode: "physical-or-live-action", actorEvidence: null,
  candidate: { method: "exact-actor-page-image-v4", file: "Lead image.jpg", page: { title: "Exact Actor", extract_windows: ["Exact Actor is a performer in Filed Movie."] }, source: { description: "", categories: "" } },
});
assert.equal(genericActorNonLead.eligible, false);
assert(genericActorNonLead.reasons.includes("portrait-not-explicitly-bound-to-actor"));

const genericExactPageimageArtifact = evaluateSourceCandidate({
  side: "still", expectedSubject: "Filed Beast", actor: "Actor Three", production: "Filed Movie 1999", performanceMode: "physical-or-live-action", actorEvidence: null,
  candidate: { method: "mediawiki-pageimage-v4", file: "Lead image.jpg", page: { title: "Filed Beast", extract_windows: ["Actor Three portrayed Filed Beast in Filed Movie 1999."] }, source: { description: "A sculpture at a museum", categories: "Sculptures" } },
});
assert.equal(genericExactPageimageArtifact.eligible, false);
assert(genericExactPageimageArtifact.reasons.includes("foreign-adaptation-or-merchandise"));

console.log("card-backfill source-policy v4 fixtures: PASS — exact lead page-image custody admits generic filenames while non-lead, namesake, object, and wrong-adaptation candidates fail closed");`,
  );
  if (value === original) throw new Error(`${destination}: fixture insertion marker was not found`);
  await write(destination, value);
}

async function updateLocalDeskFixture() {
  const path = "scripts/card-backfill-local-adjudicate-fixtures.mjs";
  let value = await text(path);
  value = replaceOnce(
    value,
    '    binding: { facts: { page_looks_like_actor: method.startsWith("exact-actor-pageimage"), actor_role_bound: true } },',
    '    binding: { facts: {\n      page_looks_like_actor: method.startsWith("exact-actor-pageimage"),\n      actor_role_bound: true,\n      exact_lead_pageimage: method.includes("pageimage"),\n      exact_actor_lead_pageimage: method.startsWith("exact-actor-pageimage"),\n      pageimage_subject_bound: method.includes("pageimage"),\n      pageimage_production_bound: method.includes("pageimage"),\n    } },',
    `${path} binding facts`,
  );
  value = value.split('method: "exact-actor-pageimage-v3"').join('method: "exact-actor-pageimage-v4"');
  value = value.split('method: "exact-character-page-v3"').join('method: "mediawiki-pageimage-v4"');
  value = replaceOnce(value, 'file: "Exact Actor portrait.jpg"', 'file: "Lead image.jpg"', `${path} generic actor pageimage`);
  value = replaceOnce(value, 'description: "Portrait of Exact Actor"', 'description: "Official profile image"', `${path} generic actor description`);
  value = replaceOnce(value, 'file: "Filed Beast - Filed Movie 1999.jpg"', 'file: "Lead image.jpg"', `${path} generic still pageimage`);
  value = replaceOnce(value, 'description: "Filed Beast in Filed Movie 1999"', 'description: "Official lead image"', `${path} generic still description`);
  value = replaceOnce(value, 'categories: "Filed Movie 1999 characters"', 'categories: "Production images"', `${path} generic still categories`);
  await write(path, value);
}

async function updatePlannerAndWorkflow() {
  const plannerPath = "scripts/card-backfill-source-v3-wave-plan.mjs";
  let planner = await text(plannerPath);
  planner = planner
    .split(".card-backfill-source-v3-wave").join(".card-backfill-source-v4-wave")
    .split("no source-policy-v3 wave available").join("no source-policy-v4 wave available")
    .split("source policy v3 wave selected").join("source policy v4 wave selected")
    .split('planner=source-policy-v3-wave').join('planner=source-policy-v4-wave');
  await write(plannerPath, planner);

  const workflowPath = ".github/workflows/card-backfill-amortized-wave.yml";
  let workflow = await text(workflowPath);
  workflow = workflow
    .split("no source-policy-v3 wave available").join("no source-policy-v4 wave available")
    .split("current policy frontier is drained").join("current policy-v4 frontier is drained");
  workflow = replaceOnce(
    workflow,
    "          node scripts/card-backfill-source-policy-v3-fixtures.mjs\n",
    "          node scripts/card-backfill-source-policy-v3-fixtures.mjs\n          node scripts/card-backfill-source-policy-v4-fixtures.mjs\n",
    `${workflowPath} v4 fixture`,
  );
  await write(workflowPath, workflow);

  const amortizationFixturePath = "scripts/card-backfill-amortization-fixtures.mjs";
  let amortizationFixture = await text(amortizationFixturePath);
  amortizationFixture = replaceOnce(
    amortizationFixture,
    'await import("./card-backfill-source-policy-v3-fixtures.mjs");\n',
    'await import("./card-backfill-source-policy-v3-fixtures.mjs");\nawait import("./card-backfill-source-policy-v4-fixtures.mjs");\n',
    `${amortizationFixturePath} v4 fixture import`,
  );
  await write(amortizationFixturePath, amortizationFixture);
}

async function updatePackage() {
  const path = "package.json";
  const value = JSON.parse(await text(path));
  const script = value.scripts?.["card-backfill:cohort:fixtures"];
  if (!script || !script.includes("card-backfill-source-policy-v3-fixtures.mjs")) throw new Error(`${path}: cohort fixture script lacks v3 fixture`);
  if (!script.includes("card-backfill-source-policy-v4-fixtures.mjs")) {
    value.scripts["card-backfill:cohort:fixtures"] = script.replace(
      "node scripts/card-backfill-source-policy-v3-fixtures.mjs",
      "node scripts/card-backfill-source-policy-v3-fixtures.mjs && node scripts/card-backfill-source-policy-v4-fixtures.mjs",
    );
  }
  await write(path, JSON.stringify(value, null, 2) + "\n");
}

async function updateLessonsAndControl() {
  const lessonsPath = ".github/CARD-BACKFILL-LESSONS.json";
  const lessons = JSON.parse(await text(lessonsPath));
  lessons.active_policy_id = "card-backfill-policy-v4-exact-pageimage-1";
  const v3 = lessons.policies.find((row) => row.policy_id === "card-backfill-policy-v3-wave-1");
  if (!v3) throw new Error(`${lessonsPath}: v3 policy is missing`);
  v3.status = "retired";
  let v4 = lessons.policies.find((row) => row.policy_id === lessons.active_policy_id);
  if (!v4) {
    v4 = {
      policy_id: lessons.active_policy_id,
      version: 4,
      revision: 0,
      parent_policy_id: "card-backfill-policy-v3-wave-1",
      status: "active",
      inherited_lesson_ids: [...lessons.mandatory_lesson_ids],
      lessons_contract_sha256: lessons.lessons_contract_sha256,
      implementation: {
        path: "scripts/lib/card-backfill-source-policy-v2.mjs",
        export: "CARD_BACKFILL_SOURCE_POLICY_V2",
      },
      workflow: ".github/workflows/card-backfill-amortized-wave.yml",
      evidence: [
        "v3 exhausted after 369 single-subject attempts and 53 composite exclusions",
        "exact lead page-image custody derived from the accepted UC-170 composite precedent",
        "generic filenames remain forbidden outside exact actor/character page-image relationships",
      ],
    };
    lessons.policies.push(v4);
  } else {
    v4.status = "active";
  }
  const replay = lessons.lessons.find((row) => row.id === "CBL-012");
  const guard = replay?.enforcement?.find((row) => row.path === "scripts/lib/card-backfill-source-policy-v2.mjs");
  if (!guard) throw new Error(`${lessonsPath}: CBL-012 runtime guard missing`);
  guard.all = guard.all.map((needle) => needle === "source-policy-v3-already-attempted" ? "source-policy-v4-already-attempted" : needle);
  await write(lessonsPath, JSON.stringify(lessons, null, 2) + "\n");

  const controlPath = ".github/CARD-BACKFILL-COHORT.json";
  const control = JSON.parse(await text(controlPath));
  control.policy_inheritance.active_policy_id = lessons.active_policy_id;
  control.policy_inheritance.parent_policy_id = "card-backfill-policy-v3-wave-1";
  control.policy_inheritance.version = 4;
  control.policy_inheritance.revision = 0;
  control.discovery.pass_id = "source-policy-v4-exact-pageimage-1";
  control.autonomous_campaign.source_policy = {
    policy_id: lessons.active_policy_id,
    version: 4,
    revision: 0,
    generic_filename_rule: "Only an exact lead page image of the exact actor or character page may use page custody in place of filename custody.",
    multi_subject_lane: "excluded-until-composite-v1",
    canonical_mutation: false,
  };
  await write(controlPath, JSON.stringify(control, null, 2) + "\n");

  const activationPath = ".github/CARD-BACKFILL-AMORTIZATION-ACTIVE.json";
  const activation = JSON.parse(await text(activationPath));
  activation.source_policy_id = lessons.active_policy_id;
  activation.source_policy_version = 4;
  activation.source_policy_revision = 0;
  await write(activationPath, JSON.stringify(activation, null, 2) + "\n");
}

async function createPolicyReceipt() {
  const path = ".github/CARD-BACKFILL-SOURCE-POLICY-V4.json";
  await ensureAbsent(path);
  const value = {
    version: 1,
    lane: "card-backfill-source-policy-v4-experiment",
    policy_id: "card-backfill-policy-v4-exact-pageimage-1",
    parent_policy_id: "card-backfill-policy-v3-wave-1",
    source_frontier_at_activation: {
      permanent_packets: 50,
      open_facet_obligations: 422,
      v3_attempted_single_subject_obligations: 369,
      composite_lane_obligations: 53,
    },
    hypothesis: "Exact actor/character page identity plus its exact lead page-image relationship and filed production context can bind generic filenames without weakening negative evidence classes.",
    positive_boundary: {
      exact_actor_page_lead_pageimage_portrait: true,
      exact_character_page_lead_pageimage_still: true,
      filed_production_page_context_required: true,
      actor_role_chain_required_for_voice_or_animation: true,
    },
    retained_rejections: [
      "non-lead generic images",
      "namesakes",
      "human event photographs in character lanes",
      "icons and documents",
      "objects, merchandise, sculpture, cosplay, and derivatives",
      "wrong adaptations",
      "multi-subject records outside the composite lane",
    ],
    retry_contract: {
      maximum_attempts_per_obligation_under_v4: 1,
      previous_v3_attempts_are_eligible: true,
      v4_attempts_suppress_v4_replay: true,
    },
    independent_second_desk: "repository-local-opencv-source-custody-second-desk-v2",
    selected_image_never_proves_identity: true,
    canonical_mutation: false,
  };
  await write(path, JSON.stringify(value, null, 2) + "\n");
}

async function createDoc() {
  const path = "docs/CARD-BACKFILL-SOURCE-POLICY-V4.md";
  await ensureAbsent(path);
  await write(path, `# Card backfill source policy v4\n\nPolicy v4 begins after v3 permanently exhausted the single-subject source frontier at 50/472 completed packets. It changes one claim-custody rule and preserves every other inherited control.\n\n## New admissible custody shape\n\nA generic filename may advance only when all of the following are true:\n\n1. The source page is the exact filed actor or character page.\n2. The selected object is that page's exact lead page image, not another image listed on the page.\n3. The page text binds the filed production.\n4. Voice and animation stills retain an explicit actor-role chain.\n5. File metadata contains no namesake, event-photo, object, merchandise, derivative, or wrong-adaptation contradiction.\n6. The independent repository-local second desk separately accepts presentation.\n\nThis is page-to-object custody, not visual inference. The selected bytes still never prove their own identity.\n\n## Replay and composite boundaries\n\nEach of the 369 v3-attempted single-subject obligations may receive at most one v4 attempt. The 53 multi-subject obligations remain excluded until the explicit composite lane can bind every filed subject independently, as UC-170 already demonstrates.\n\n## Publication boundary\n\nDiscovery and adjudication remain artifact-only. Accepted packets accumulate in staging, permanent materialization runs one complete repository gate per batch, and canonical website media remains a separate transaction.\n`);
}

async function main() {
  await preserveV3Binding();
  await updateRuntimePolicy();
  await updateBindingPolicy();
  await updateSourceTransport();
  await updateLocalDesk();
  await updateSelectionFixture();
  await createV4BindingFixture();
  await updateLocalDeskFixture();
  await updatePlannerAndWorkflow();
  await updatePackage();
  await updateLessonsAndControl();
  await createPolicyReceipt();
  await createDoc();
  console.log("PASS — source policy v4 migration constructed; no source transport performed");
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
