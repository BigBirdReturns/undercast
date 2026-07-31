#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

async function read(path) { return readFile(path, "utf8"); }
async function write(path, content) { await writeFile(path, content); }
function replaceExact(content, search, replacement, label) {
  if (!content.includes(search)) throw new Error(`local-desk migration could not find ${label}`);
  const next = content.replace(search, replacement);
  if (next === content) throw new Error(`local-desk migration did not change ${label}`);
  return next;
}
function assertIncludes(content, needle, label) {
  if (!content.includes(needle)) throw new Error(`local-desk migration lacks ${label}`);
}
function assertExcludes(content, needle, label) {
  if (content.includes(needle)) throw new Error(`local-desk migration retained ${label}`);
}

async function migrateWorkflow() {
  const path = ".github/workflows/card-backfill-amortized-wave.yml";
  let value = await read(path);
  value = replaceExact(value,
    "      - 'scripts/card-backfill-amortization-*.mjs'\n",
    "      - 'scripts/card-backfill-amortization-*.mjs'\n      - 'scripts/card-backfill-local-adjudicate*.mjs'\n      - 'scripts/card-backfill-image-features.py'\n",
    "local-desk workflow path triggers");
  value = replaceExact(value,
    "        description: 'Independent second-desk GitHub Model'\n        required: false\n        default: 'openai/gpt-4.1-mini'",
    "        description: 'Legacy compatibility input; the repository-local second desk ignores it'\n        required: false\n        default: 'repository-local'",
    "legacy model input description");
  value = replaceExact(value, "  models: read\n", "", "retired GitHub Models permission");
  value = replaceExact(value,
    "          node scripts/card-backfill-source-policy-v3-fixtures.mjs\n          node scripts/card-backfill-amortization-fixtures.mjs",
    "          node scripts/card-backfill-source-policy-v3-fixtures.mjs\n          node scripts/card-backfill-local-adjudicate-fixtures.mjs\n          node scripts/card-backfill-amortization-fixtures.mjs",
    "local-desk planning fixture");
  value = replaceExact(value,
    "        env:\n          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n          MODEL: ${{ inputs.model || 'openai/gpt-4.1-mini' }}\n          BATCH_SHA:",
    "        env:\n          BATCH_SHA:",
    "cloud desk environment");
  value = replaceExact(value,
    "          test -n \"$GITHUB_TOKEN\"\n          final=",
    "          final=",
    "cloud token precondition");
  value = replaceExact(value,
    "          node scripts/card-backfill-machine-adjudicate.mjs \\\n            --candidates \"$final/packets\" \\\n            --out \"$final/machine-decisions.json\" \\\n            --model \"$MODEL\" \\\n            --fallback-model 'openai/gpt-4o-mini' \\\n            --max-parallel 2 \\\n            --cycle 1 \\\n            --artifact-name \"card-backfill-amortized-wave-${GITHUB_RUN_ID}-${BATCH_SHA}\" \\\n            --head-sha \"$SOURCE_HEAD\" | tee \"$final/machine-adjudicate.log\"",
    "          node scripts/card-backfill-local-adjudicate.mjs \\\n            --candidates \"$final/packets\" \\\n            --out \"$final/machine-decisions.json\" \\\n            --max-parallel 4 \\\n            --cycle 1 \\\n            --artifact-name \"card-backfill-amortized-local-${GITHUB_RUN_ID}-${BATCH_SHA}\" \\\n            --head-sha \"$SOURCE_HEAD\" | tee \"$final/local-adjudicate.log\"",
    "GitHub Models adjudication command");
  value = replaceExact(value,
    "          echo 'PASS — immutable batch adjudicated; token injected; rediscovery=false'",
    "          echo 'PASS — immutable batch adjudicated by the repository-local second desk; cloud inference=0; rediscovery=false'",
    "cloud adjudication success message");
  value = replaceExact(value,
    "machine-adjudicate|source-v3-wave-plan|rebalance-wave|amortization-collect|wave-reduce-amortized)\\.mjs|lib/card-backfill-",
    "machine-adjudicate|local-adjudicate|source-v3-wave-plan|rebalance-wave|amortization-collect|wave-reduce-amortized)\\.mjs|card-backfill-image-features\\.py|lib/card-backfill-",
    "local-desk source-sensitive drift boundary");
  value = replaceExact(value,
    "          node scripts/card-backfill-amortization-fixtures.mjs\n          node scripts/card-backfill-lessons.mjs validate --out \"$RUNNER_TEMP/lessons-validation.json\"",
    "          node scripts/card-backfill-amortization-fixtures.mjs\n          node scripts/card-backfill-local-adjudicate-fixtures.mjs\n          node scripts/card-backfill-lessons.mjs validate --out \"$RUNNER_TEMP/lessons-validation.json\"",
    "local-desk mutation-boundary fixture");
  value = value.replaceAll("inputs.model || 'openai/gpt-4.1-mini'", "inputs.model || 'repository-local'");
  assertIncludes(value, "card-backfill-local-adjudicate.mjs", "local adjudicator");
  assertIncludes(value, "card-backfill-image-features.py", "local image features");
  assertExcludes(value, "card-backfill-machine-adjudicate.mjs", "retired GitHub Models adjudicator");
  assertExcludes(value, "models: read", "retired GitHub Models permission");
  await write(path, value);
}

async function migrateSourcePolicy() {
  const path = "scripts/lib/card-backfill-source-policy-v3.mjs";
  let value = await read(path);
  value = replaceExact(value,
    "const GENERIC_NON_DEPICTION = /\\b(?:building|entrance|street|road|sign|logo|poster|cover|bottle|potion|skull|weapon|gun|vehicle|store|cafe|ride|trophy|plaque|interface|screenshot of text|title card)\\b/i;\nconst PORTRAIT_COSTUME",
    "const GENERIC_NON_DEPICTION = /\\b(?:building|entrance|interior|street|road|sign|logo|poster|advertisement|advert|cover|bottle|potion|skull|weapon|gun|vehicle|trailer|store|cafe|ride|trophy|plaque|interface|screenshot of text|title card|certificate|sheet music|signature|autograph|icon|emoji|mask|mechanism|landscape|lake|reeds)\\b/i;\nconst LIVE_ACTION_DERIVATIVE = /\\b(?:illustration|drawing|graphic|novel|book|edition|painting|artwork)\\b/i;\nconst PORTRAIT_ARTIFACT = /\\b(?:statue|sculpture|certificate|sheet music|signature|autograph|icon|emoji|logo|poster|advertisement|cover|mask|mechanism|landscape|lake|reeds|vehicle|trailer|document|drawing|artwork)\\b/i;\nconst PORTRAIT_NAMESAKE_CONFLICT = /\\b(?:pharmacolog|footballer|soccer|chemist|physician|politician|scientist|composer)\\b/i;\nconst PORTRAIT_CONTEXT = /\\b(?:portrait|headshot|photo of|photograph of|actor|actress|performer|stuntman|stuntwoman|voice actor|film actor|television actor)\\b/i;\nconst PORTRAIT_COSTUME",
    "stricter source-shape constants");
  value = replaceExact(value,
    "  const genericNonDepiction = GENERIC_NON_DEPICTION.test(fileText) && !fileHasAlias;\n  const multi",
    "  const genericNonDepiction = GENERIC_NON_DEPICTION.test(fileText);\n  const liveActionDerivative = side === \"still\" && /physical|live-action/i.test(String(performanceMode || \"\")) && LIVE_ACTION_DERIVATIVE.test(fileText);\n  const portraitArtifact = PORTRAIT_ARTIFACT.test(fileText);\n  const portraitNamesakeConflict = PORTRAIT_NAMESAKE_CONFLICT.test(fileText);\n  const portraitContext = PORTRAIT_CONTEXT.test(fileText);\n  const multi",
    "stricter source-shape facts");
  value = replaceExact(value,
    "    if (!exactPage && !fileHasAlias) reasons.push(\"candidate-not-bound-to-subject-page-or-file\");\n    if (!pageHasProduction && !fileHasProduction) reasons.push(\"candidate-lacks-filed-production-context\");",
    "    if (!fileHasAlias) reasons.push(\"candidate-file-not-explicitly-bound-to-subject\");\n    if (!fileHasProduction) reasons.push(\"candidate-file-lacks-filed-production-context\");",
    "file-level still custody");
  value = replaceExact(value,
    "    if (genericNonDepiction) reasons.push(\"generic-non-depiction-asset\");\n    if (voiceLike",
    "    if (genericNonDepiction) reasons.push(\"generic-non-depiction-asset\");\n    if (liveActionDerivative) reasons.push(\"wrong-adaptation-derivative-for-live-action-claim\");\n    if (voiceLike",
    "live-action derivative rejection");
  value = replaceExact(value,
    "    if (!exactActorPage && !fileHasActor) reasons.push(\"portrait-not-explicitly-bound-to-actor\");\n    if (GROUP.test(file) && !fileHasActor) reasons.push(\"group-or-ambiguous-portrait\");\n    if (PORTRAIT_COSTUME.test(combined)) reasons.push(\"role-costume-or-masked-portrait\");\n    if (FOREIGN_ADAPTATION.test(fileText) && !fileHasActor) reasons.push(\"portrait-is-role-or-franchise-artifact\");",
    "    if (!exactActorPage && !(fileHasActor && portraitContext)) reasons.push(\"portrait-not-explicitly-bound-to-actor\");\n    if (GROUP.test(file)) reasons.push(\"group-or-ambiguous-portrait\");\n    if (PORTRAIT_COSTUME.test(combined)) reasons.push(\"role-costume-or-masked-portrait\");\n    if (portraitArtifact) reasons.push(\"portrait-is-object-document-icon-or-artifact\");\n    if (portraitNamesakeConflict) reasons.push(\"portrait-namesake-profession-conflict\");\n    if (FOREIGN_ADAPTATION.test(fileText) && !fileHasActor) reasons.push(\"portrait-is-role-or-franchise-artifact\");",
    "portrait namesake and artifact rejection");
  value = replaceExact(value,
    "    explicit_chain: side === \"still\" ? Boolean((exactPage || fileHasAlias) && (pageHasProduction || fileHasProduction) && (!voiceLike || roleBound)) : eligible,",
    "    explicit_chain: side === \"still\" ? Boolean(eligible && fileHasAlias && fileHasProduction && (!voiceLike || roleBound)) : eligible,",
    "file-bound explicit chain");
  await write(path, value);
}

async function extendSourcePolicyFixtures() {
  const path = "scripts/card-backfill-source-policy-v3-fixtures.mjs";
  let value = await read(path);
  const insertion = `
const unrelatedExactCharacterFile = evaluateSourceCandidate({
  side: "still", expectedSubject: "Mighty Joe Young", actor: "John Alexander", production: "Mighty Joe Young", performanceMode: "physical-or-live-action", actorEvidence: null,
  candidate: { file: "Transport trailer.jpg", page: { title: "Mighty Joe Young", extract_windows: ["Mighty Joe Young is a film character."] }, source: { description: "transport trailer vehicle", categories: "Trailers" } },
});
assert.equal(unrelatedExactCharacterFile.eligible, false);
assert(unrelatedExactCharacterFile.reasons.includes("candidate-file-not-explicitly-bound-to-subject"));
assert(unrelatedExactCharacterFile.reasons.includes("generic-non-depiction-asset"));

const wrongLiveActionDerivative = evaluateSourceCandidate({
  side: "still", expectedSubject: "Cowardly Lion", actor: "Bert Lahr", production: "The Wizard of Oz", performanceMode: "physical-or-live-action", actorEvidence: null,
  candidate: { file: "Cowardly Lion.png", page: { title: "Cowardly Lion", extract_windows: ["Bert Lahr portrayed the Cowardly Lion in The Wizard of Oz."] }, source: { description: "1900 book illustration of the Cowardly Lion, The Wizard of Oz", categories: "Book illustrations|The Wizard of Oz" } },
});
assert.equal(wrongLiveActionDerivative.eligible, false);
assert(wrongLiveActionDerivative.reasons.includes("wrong-adaptation-derivative-for-live-action-claim"));

const exactPortrait = evaluateSourceCandidate({
  side: "portrait", expectedSubject: "Scott Lawrence", actor: "Scott Lawrence", production: "Darth Vader", performanceMode: "voice-or-animation", actorEvidence: null,
  candidate: { file: "Scott Lawrence.jpg", page: { title: "Scott Lawrence", extract_windows: ["Scott Lawrence is an American actor."] }, source: { description: "Portrait photograph of actor Scott Lawrence", categories: "American actors" } },
});
assert.equal(exactPortrait.eligible, true);

const pharmacologistNamesake = evaluateSourceCandidate({
  side: "portrait", expectedSubject: "Peter Elliott", actor: "Peter Elliott", production: "The Dark Crystal", performanceMode: "physical-or-live-action", actorEvidence: null,
  candidate: { file: "Peter Elliott.jpg", page: { title: "Peter Elliott", extract_windows: ["Peter Elliott is a pharmacologist."] }, source: { description: "Portrait of British pharmacologist Peter Elliott", categories: "Pharmacologists" } },
});
assert.equal(pharmacologistNamesake.eligible, false);
assert(pharmacologistNamesake.reasons.includes("portrait-namesake-profession-conflict"));

const genericActorIcon = evaluateSourceCandidate({
  side: "portrait", expectedSubject: "Kan Tanaka", actor: "Kan Tanaka", production: "Example", performanceMode: "voice-or-animation", actorEvidence: null,
  candidate: { file: "Kan Tanaka Seiyu.png", page: { title: "Kan Tanaka", extract_windows: ["Kan Tanaka is a voice actor."] }, source: { description: "Generic seiyu icon", categories: "Icons" } },
});
assert.equal(genericActorIcon.eligible, false);
assert(genericActorIcon.reasons.includes("portrait-is-object-document-icon-or-artifact"));
`;
  value = replaceExact(value,
    "\nconsole.log(\"card-backfill source-policy v3 fixtures: PASS\");",
    `${insertion}\nconsole.log("card-backfill source-policy v3 fixtures: PASS — exact file custody required; namesakes, icons, objects, and wrong adaptations fail closed");`,
    "source-policy hard-negative fixtures");
  await write(path, value);
}

async function migrateFixtureAndPackage() {
  const localFixture = "scripts/card-backfill-local-adjudicate-fixtures.mjs";
  let fixture = await read(localFixture);
  fixture = replaceExact(fixture,
    "    cohort_key: \"fixture-mixed\",",
    "    cohort_key: cohortStill,",
    "local fixture live-action cohort");
  await write(localFixture, fixture);

  const packagePath = "package.json";
  const packageValue = JSON.parse(await read(packagePath));
  packageValue.scripts["card-backfill:local-adjudicate"] = "node scripts/card-backfill-local-adjudicate.mjs";
  packageValue.scripts["card-backfill:local-adjudicate:fixtures"] = "node scripts/card-backfill-local-adjudicate-fixtures.mjs";
  if (!packageValue.scripts["card-backfill:cohort:fixtures"].includes("card-backfill-local-adjudicate-fixtures.mjs")) {
    packageValue.scripts["card-backfill:cohort:fixtures"] = packageValue.scripts["card-backfill:cohort:fixtures"].replace(
      "node scripts/card-backfill-machine-adjudicate-fixtures.mjs",
      "node scripts/card-backfill-machine-adjudicate-fixtures.mjs && node scripts/card-backfill-local-adjudicate-fixtures.mjs"
    );
  }
  await write(packagePath, JSON.stringify(packageValue, null, 2) + "\n");

  const gatePath = "scripts/gate.mjs";
  let gate = await read(gatePath);
  gate = replaceExact(gate,
    "    runNodeScript(\"Card backfill amortization fixtures\", \"scripts/card-backfill-amortization-fixtures.mjs\");",
    "    runNodeScript(\"Card backfill amortization fixtures\", \"scripts/card-backfill-amortization-fixtures.mjs\");\n    runNodeScript(\"Card backfill local adjudication fixtures\", \"scripts/card-backfill-local-adjudicate-fixtures.mjs\");",
    "canonical local-desk gate");
  await write(gatePath, gate);
}

async function retireActivation() {
  const path = ".github/workflows/card-backfill-amortized-activation.yml";
  await write(path, `name: card-backfill-amortized-activation-retired

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  retired:
    runs-on: ubuntu-latest
    steps:
      - run: |
          echo 'RETIRED — the one retained wave is reduced by card-backfill-local-desk-recovery.yml.'
          echo 'All continuing production waves use the repository-local second desk.'
          echo 'GitHub Models and Copilot policy access are not campaign dependencies.'
          echo 'manual_continue_required=false'
`);
}

async function main() {
  await migrateWorkflow();
  await migrateSourcePolicy();
  await extendSourcePolicyFixtures();
  await migrateFixtureAndPackage();
  await retireActivation();
  console.log("PASS — repository-local second desk installed across workflow, policy, fixtures, gate, package scripts, and activation retirement");
  console.log("CLOUD INFERENCE — GitHub Models=retired; Copilot policy=not required; provider dependency=0");
}

main().catch((error) => {
  console.error(`card-backfill install local desk: ${error.message}`);
  process.exit(1);
});
