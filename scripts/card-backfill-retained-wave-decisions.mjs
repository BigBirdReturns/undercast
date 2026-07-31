#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const SOURCE_RUN_ID = 30593861671;
const SOURCE_HEAD = "16bc625ff47b0f508a4a6958fff0db255f2ca72a";
const WAVE_SHA = "c0caa3c183b89007d8cdf5f661d25678d3f40621468202e246a7ebe56b07417c";
const DECIDED_AT = "2026-07-31T01:30:00.000Z";
const CONTRACT = {"36c567f0e6c2c1c6a7cea47dbc7cf67c94073eedeccf5fcb4c92ee4e8ecb25ad":{"candidate_result_sha256":"e4e9f48ac7464fcf11682200d69a03ef939d8418d6ebab70cb0da751f138305b","rows":[["UC-295/portrait","reject","wrong","wrong-presentation","The selected image depicts an Atlantis/Poseidon architectural statue rather than the filed performer.","The source file and visible object do not bind to the expected subject Atlantis as a performer.","An architectural statue is not a neutral human portrait."],["UC-373/portrait","reject","wrong","neutral-human","The Commons metadata identifies the selected Peter Elliott as a United Kingdom pharmacologist, not the filed British actor.","This is a namesake collision: the selected file categories explicitly point to a pharmacologist rather than the actor.","The image is an ordinary human portrait, but presentation cannot cure the wrong identity custody."],["UC-382/portrait","reject","wrong","neutral-human","The selected file explicitly depicts John Alexander Anderson, a different historical person.","The file title “John Alexander Anderson - Brady-Handy” explicitly binds to a namesake, not the filed actor John Alexander.","The image is an ordinary human portrait, but it is the wrong person."],["UC-383/portrait","reject","ambiguous","wrong-presentation","The selected object is Emil Van Horn’s death certificate rather than a portrait.","A death certificate cannot visually or textually bind the depicted subject because no person is depicted.","A document is not a neutral human portrait."],["UC-457/portrait","reject","ambiguous","neutral-human","The football-event source does not disambiguate the pictured Don Shanks from the footballer namesake and therefore cannot bind the image to the filed stunt performer.","The source context is a Queens Park Rangers match and the searched candidate set contains the footballer namesake; exact performer custody is absent.","The image is an ordinary human portrait, but identity remains unresolved."],["UC-487/portrait","reject","wrong","wrong-presentation","The selected image is sheet music credited to Ed. Wolff, not the filed actor.","The source file names a musical work, not the expected performer.","Sheet music is not a neutral human portrait."],["UC-493/portrait","reject","ambiguous","wrong-presentation","The selected source is a car/group photograph and does not explicitly isolate Bob May.","Multiple people and an automobile are present without exact subject binding to the filed actor.","The framing is not a neutral single-person portrait."],["UC-565/portrait","reject","ambiguous","wrong-presentation","The selected image depicts a lucha mask/object rather than an out-of-character portrait of Blue Demon.","The mask does not explicitly bind a visible human subject to the filed performer.","A mask object or masked persona is not a neutral human portrait."],["UC-588/portrait","reject","ambiguous","wrong-presentation","The selected wrestling-ring group image does not isolate Gran Metalik and presents masked personas.","Group and mask ambiguity prevent exact source-bound identity.","A distant group wrestling scene is not a neutral human portrait."],["UC-593/portrait","reject","wrong","wrong-presentation","The selected image depicts reeds and water, not Averno.","The file is a landscape/nature namesake collision with no performer custody.","A landscape is not a neutral human portrait."],["UC-595/portrait","reject","ambiguous","wrong-presentation","The selected image depicts a Blue Demon mask rather than an out-of-character portrait of Blue Demon Jr.","A mask object does not bind a visible person to the filed performer.","A mask is not a neutral human portrait."],["UC-596/portrait","reject","ambiguous","wrong-presentation","The selected image is a children’s drawing and does not depict or bind Rey Misterio Sr.","The drawing provides no exact source-bound performer identity.","A drawing is not a neutral human portrait."],["UC-625/portrait","accept","expected","neutral-human","","The Commons file title and description explicitly name Joe/Joseph Bishara, matching the filed subject and canonical person page.","The deterministic composite shows a single ordinary out-of-character human portrait with usable framing."],["UC-727/portrait","reject","wrong","wrong-presentation","The selected image is an “INDIGO” cover/text object rather than John Vickery.","The source is a namesake/object collision and does not bind to the filed actor.","A cover or text object is not a neutral human portrait."]]},"ae65c3c28e1392373e6c44b933bf568506bad00442532fa987f208c706352bc5":{"candidate_result_sha256":"ed65772ccb3982d4a8c2e49a6157cfda2ca35d3721fac286b572bb4ac5812563","rows":[["UC-817/portrait","reject","ambiguous","wrong-presentation","The selected image is a distant stadium/video-screen event image and does not explicitly isolate Arisa Komiya.","A screen capture at a group event does not provide exact single-subject custody.","A distant display image is not a neutral human portrait."],["UC-914/portrait","reject","wrong","wrong-presentation","The selected file is the generic Seiyu icon, not Kan Tanaka.","A generic occupation icon cannot bind to the filed person.","An icon is not a neutral human portrait."],["UC-916/portrait","reject","wrong","wrong-presentation","The selected file is the generic Seiyu icon, not Yoshiyuki Kono.","A generic occupation icon cannot bind to the filed person.","An icon is not a neutral human portrait."],["UC-920/portrait","reject","wrong","wrong-presentation","The selected file is the generic Seiyu icon, not Yukimasa Kishino.","A generic occupation icon cannot bind to the filed person.","An icon is not a neutral human portrait."],["UC-938/portrait","reject","wrong","wrong-presentation","The selected image is Junichi Suwabe’s signature board rather than a portrait.","The object may be associated with the subject but it does not depict the filed person.","A signature board is not a neutral human portrait."],["UC-1004/portrait","accept","expected","neutral-human","","The exact Scott Lawrence actor article carries the selected file and explicitly identifies the filed actor.","The deterministic composite shows a single ordinary out-of-character human portrait with usable framing."],["UC-1005/portrait","reject","wrong","wrong-presentation","The selected image depicts a historical door-closing mechanism, not Matt Sloan.","The source file is an object/name collision with no performer custody.","A mechanical object is not a neutral human portrait."]]},"7cacb19045be1e0e4cd8328b7ef7f4237d291e752da50271a07cde8cba480df7":{"candidate_result_sha256":"285ba3345b6e4b5e44a1adeb8e8d262b4f9166f633a6c0ad2741ead6472d2799","rows":[["UC-901/still","reject","wrong","wrong-presentation","The selected image is a historical print of German soldiers, not Sir Didymus from Labyrinth.","The source file and subject do not bind to the filed character or production.","A historical soldiers print is not the required character depiction."]]},"3aaf2d62d35510dc0c1cff2ca35846c4ab62682045f71b3baae79e9a01f52889":{"candidate_result_sha256":"a883e71e36e6b58a2c2e9e8bb4050c56d5a52cd8af700e1376cc7bab298e165b","rows":[["UC-227/still","reject","wrong","wrong-presentation","The selected source depicts Diego Anido at the Goya awards and comes from the namesake film page The Beasts, not Jean Marais as the Beast in the 1946 production.","The source explicitly points to a different person and production.","An event portrait of another actor is not the filed character depiction."],["UC-249/still","reject","wrong","wrong-presentation","The selected image depicts a fighting machine from an earlier War of the Worlds illustration, not Charles Gemora’s Martian in the 1953 film.","The source page and file bind to a machine, not the filed character and production.","A machine illustration is not the required character depiction."],["UC-382/still","reject","wrong","wrong-presentation","The selected image depicts a transport trailer rather than Mighty Joe Young.","The file does not bind the visible subject to the filed character.","A trailer/object is not a character depiction."],["UC-464/still","reject","wrong","wrong-presentation","The selected image is a generic vampire smiley icon, not Jason Voorhees.","A generic icon has no exact character or production custody.","An emoji-style icon is not the required character depiction."],["UC-475/still","reject","wrong","character-depiction","The selected image is W. W. Denslow’s 1900 book illustration of the Cowardly Lion, not Bert Lahr’s 1939 film portrayal.","The source explicitly binds to the wrong adaptation and therefore cannot prove the filed actor-role-production claim.","It is a character depiction, but of the wrong adaptation and production."],["UC-487/still","reject","wrong","wrong-presentation","The selected image is a theater advertisement and does not visibly depict Ed Wolff’s Colossus.","The advertisement does not bind a visible character image to the filed role.","A text-heavy theater ad is not the required character depiction."],["UC-494/still","reject","wrong","wrong-presentation","The selected image is a drive-in advertisement and does not provide a usable depiction of James Arness as the Thing.","The advertisement does not bind a visible character image to the filed role.","A text-heavy advertisement is not the required character depiction."],["UC-550/still","reject","wrong","character-depiction","The selected image depicts Bella Ramsey filming the HBO adaptation, not Ashley Johnson’s Ellie from the Naughty Dog games.","The source explicitly binds to a different performer and adaptation.","It depicts an Ellie adaptation, but not the filed actor-role-production claim."],["UC-601/still","reject","wrong","wrong-presentation","The selected image is a portrait of Charlie Fink from a namesake page, not Brendan Fraser as Charlie in The Whale.","The source explicitly identifies a different person.","An ordinary portrait of another person is not the required character depiction."],["UC-602/still","reject","wrong","wrong-presentation","The selected image depicts the real John du Pont in a group photograph, not Steve Carell’s portrayal in Foxcatcher.","The source explicitly binds to the historical person rather than the filed performer-character-production claim.","A real-person group photograph is not the required character depiction."],["UC-615/still","reject","wrong","wrong-presentation","The selected image is a church interior from the Franks namesake page, not Michael Fassbender as Frank.","The source and visible subject do not bind to the filed character or production.","A church interior is not the required character depiction."]]}};

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}
function natural(left, right) {
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }

async function main() {
  const candidates = resolve(option("--candidates"));
  const out = resolve(option("--out"));
  const sourceHead = option("--source-head");
  const sourceRunId = Number(option("--source-run-id"));
  if (sourceHead !== SOURCE_HEAD) throw new Error(`retained decision source head drift: ${sourceHead}`);
  if (sourceRunId !== SOURCE_RUN_ID) throw new Error(`retained decision source run drift: ${sourceRunId}`);

  const batch = await readJson(join(candidates, "batch-result.json"));
  const contract = CONTRACT[batch.batch_sha256];
  if (!contract) throw new Error(`unreviewed retained batch ${batch.batch_sha256}`);
  if (batch.result_sha256 !== contract.candidate_result_sha256) throw new Error(`candidate result digest drift ${batch.batch_sha256}`);

  const pending = (batch.results || [])
    .filter((row) => row.disposition === "candidate-pending-independent-visual-adjudication")
    .map((row) => `${row.record_id}/${row.side}`)
    .sort(natural);
  const contracted = contract.rows.map((row) => row[0]).sort(natural);
  if (JSON.stringify(pending) !== JSON.stringify(contracted) || new Set(contracted).size !== contracted.length) {
    throw new Error(`retained decision coverage drift ${batch.batch_sha256}`);
  }

  const decisions = [];
  for (const [key, disposition, identity, presentation, reason, identityNote, presentationNote] of contract.rows) {
    const [recordId, side] = key.split("/");
    const sourceRow = batch.results.find((row) => row.record_id === recordId && row.side === side);
    if (!sourceRow) throw new Error(`missing candidate ${key}`);
    const review = await readJson(join(candidates, sourceRow.packet_path, "review.json"));
    const expectedPresentation = review.visual_adjudication?.required_presentation_value;
    const accepted = disposition === "accept";
    if (accepted && (identity !== "expected" || presentation !== expectedPresentation || reason)) {
      throw new Error(`invalid retained acceptance ${key}`);
    }
    if (!accepted && !reason) throw new Error(`retained rejection lacks reason ${key}`);
    const origin = review.selected_source?.origin || null;
    const canonical = review.independent_evidence?.canonical_link || null;
    const evidence = unique([canonical, origin]);
    decisions.push({
      record_id: recordId,
      side,
      disposition,
      identity,
      presentation,
      note: accepted
        ? `Independent retained review accepted explicit textual source custody and the required ${presentation} presentation.`
        : `Independent retained review rejected the candidate: ${reason}`,
      ...(accepted ? {} : { reason }),
      identity_note: identityNote,
      presentation_note: presentationNote,
      evidence,
      identity_evidence: evidence,
      presentation_evidence: origin ? [origin] : [],
      decided_at: DECIDED_AT,
      machine: {
        provider: "openai",
        model: "gpt-5.6-pro",
        review_mode: "retained-artifact-source-custody-plus-direct-visual-review",
        identity_confidence: 0.99,
        presentation_confidence: 0.99,
        identity_threshold: 0.93,
        presentation_threshold: 0.90,
        appearance_used_for_identity: false,
        policy: "explicit-source-binding-and-required-presentation-or-fail-closed"
      }
    });
  }

  const value = {
    version: 1,
    status: "ready",
    source: {
      retained_source_run_id: SOURCE_RUN_ID,
      artifact_name: `card-backfill-amortized-result-${batch.batch_sha256}-${SOURCE_RUN_ID}`,
      head_sha: SOURCE_HEAD,
      candidate_result_sha256: batch.result_sha256,
      wave_sha256: WAVE_SHA,
      source_rediscovery: false
    },
    campaign_id: batch.campaign_id,
    estate_sha256: batch.estate_sha256,
    batch_sha256: batch.batch_sha256,
    cohort_key: batch.cohort_key,
    adjudicator: {
      id: "openai-gpt-5.6-pro-retained-wave-second-desk-v1",
      kind: "machine",
      independent_from_discovery: true,
      method: "independent textual source-custody review plus direct visual review of the deterministic evidence composite; appearance is never identity evidence",
      provider: "openai",
      primary_model: "gpt-5.6-pro",
      identity_confidence_threshold: 0.93,
      presentation_confidence_threshold: 0.90
    },
    decisions,
    machine_adjudication: {
      pending_count: decisions.length,
      accepted_count: decisions.filter((row) => row.disposition === "accept").length,
      rejected_count: decisions.filter((row) => row.disposition === "reject").length,
      decision_sha256: sha256(JSON.stringify(decisions)),
      source_rediscovery: false,
      canonical_mutation: false
    },
    canonical_mutation: false
  };
  await writeJson(out, value);
  console.log(`PASS — authored retained decisions for ${batch.batch_sha256}: accepted=${value.machine_adjudication.accepted_count} rejected=${value.machine_adjudication.rejected_count}`);
  console.log("SOURCE — retained source transport reused; rediscovery=0");
  console.log(`OUTPUT — ${out}`);
}

main().catch((error) => {
  console.error(`card-backfill retained wave decisions: ${error.message}`);
  process.exit(1);
});
