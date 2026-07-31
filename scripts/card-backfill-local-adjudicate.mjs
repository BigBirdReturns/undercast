#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const STOP_WORDS = new Set(["the", "and", "from", "with", "into", "for", "voice", "actor", "film", "series", "character", "role", "video", "game"]);
const ARTIFACT = /\b(?:death certificate|certificate|sheet music|signature|autograph|icon|emoji|logo|poster|advertisement|advert|cover|mask|mascara|mechanism|statue|sculpture|building|church|interior|landscape|lake|reeds|trailer|vehicle|screen|billboard|drawing|sketch|document|newspaper|trophy|plaque|interface|title card)\b/i;
const PORTRAIT_CONFLICT = /\b(?:pharmacolog|football(?:er)?|soccer|match between|chemist|physician|politician|engineer|scientist|composer|sheet music|certificate|signature|mask|mascara|wrestling ring|children|kids|mechanism|statue|sculpture|lake|reeds)\b/i;
const PORTRAIT_METADATA = /\b(?:photo of|photograph of|portrait of|headshot|actor|actress|performer|stunt(?:man|woman| performer)?|voice actor|film actor|television actor)\b/i;
const GROUP = /\b(?:and|with|group|cast|panel|crew|ensemble|family|team|children|kids)\b|[,;&]/i;

function normalizeSourceText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function sourceSubjectAliases(value) {
  const clean = String(value || "").replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const values = new Set([clean]);
  const noArticle = clean.replace(/^(?:the|a|an)\s+/i, "").trim();
  if (noArticle) values.add(noArticle);
  for (const part of clean.split(/\s*(?:\/|&|,|;|\band\b)\s*/i).map((row) => row.trim()).filter(Boolean)) values.add(part);
  return [...values];
}

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
function numberOption(name, fallback) {
  const value = Number(option(name, String(fallback)));
  if (!Number.isFinite(value)) throw new Error(`${name} must be numeric`);
  return value;
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function cleanText(value, maximum = 1200) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maximum ? `${text.slice(0, maximum)}…` : text;
}
function titleBase(value) { return normalizeSourceText(String(value || "").replace(/\s*\([^)]*\)\s*$/, "")); }
function equivalent(left, right) {
  const a = titleBase(left);
  const b = titleBase(right);
  return Boolean(a && b && a === b);
}
function containsAlias(text, aliases) {
  const hay = ` ${normalizeSourceText(text)} `;
  return aliases.some((alias) => {
    const needle = normalizeSourceText(alias);
    return needle.length >= 2 && (hay.includes(` ${needle} `) || hay.trim() === needle);
  });
}
function productionMatch(text, production) {
  const tokens = normalizeSourceText(production).split(/\s+/).filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  if (!tokens.length) return false;
  const hay = normalizeSourceText(text);
  const required = tokens.length >= 4 ? 2 : 1;
  return tokens.filter((token) => hay.includes(token)).length >= required;
}
function normalizeFileStem(value) {
  return normalizeSourceText(String(value || "").replace(/\.[a-z0-9]{2,5}$/i, ""));
}
function exactSubjectFile(file, aliases) {
  const stem = normalizeFileStem(file);
  return aliases.some((alias) => {
    const subject = normalizeSourceText(alias);
    if (!subject || !stem.startsWith(subject)) return false;
    const tail = stem.slice(subject.length).trim();
    if (!tail) return true;
    return /^(?:low res|hi res|portrait|headshot|photo|photograph|visiting|at|20\d{2}|\d+)(?:\s|$)/.test(tail);
  });
}
function selectedSourceMetadata(review, sourceReceipt) {
  const retrieval = sourceReceipt.retrieval_result || {};
  const discovery = retrieval.discovery || {};
  const candidate = retrieval.candidate || {};
  const prescreened = discovery.source_evidence?.prescreened || [];
  const selected = prescreened.find((row) => row.file === candidate.source_file)
    || prescreened.find((row) => row.source_origin === review.selected_source?.origin)
    || prescreened[0]
    || {};
  const fileText = [
    candidate.source_file,
    selected.description,
    selected.categories,
    review.selected_source?.author,
  ].filter(Boolean).join(" ");
  const pageText = [
    candidate.source_page_title,
    discovery.exact_page_title,
    ...(selected.page_extract_windows || []),
  ].filter(Boolean).join(" ");
  const facts = selected.binding?.facts || discovery.source_evidence?.binding?.facts || {};
  return { retrieval, discovery, candidate, selected, fileText, pageText, facts };
}
async function imageFeatures({ packetDir, review, featureMap, featureScript, python }) {
  const key = `${review.record_id}/${review.side}`;
  if (featureMap) {
    const value = featureMap[key];
    if (!value) throw new Error(`feature map lacks ${key}`);
    return value;
  }
  const imageName = review.selected_source?.output_path
    || review.render_result?.candidate?.path
    || review.render_result?.wall_crop?.path;
  if (!imageName) throw new Error(`candidate ${key} has no presentation image`);
  const imagePath = join(packetDir, imageName);
  const { stdout, stderr } = await execFileAsync(python, [featureScript, "--image", imagePath], {
    maxBuffer: 8 * 1024 * 1024,
    timeout: 90_000,
  });
  if (stderr?.trim()) console.log(`FEATURE ${key}: ${cleanText(stderr, 500)}`);
  return JSON.parse(stdout);
}
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, lane));
  return results;
}

async function main() {
  const candidates = resolve(option("--candidates"));
  const out = resolve(option("--out", join(candidates, "local-decisions.json")));
  const python = option("--python", "python3");
  const featureScript = resolve(option("--feature-script", "scripts/card-backfill-image-features.py"));
  const featureMapPath = option("--feature-map", null);
  const featureMap = featureMapPath ? await readJson(resolve(featureMapPath)) : null;
  const concurrency = Math.max(1, Math.min(8, Math.floor(numberOption("--max-parallel", 4))));
  const identityThreshold = numberOption("--identity-confidence", 0.93);
  const presentationThreshold = numberOption("--presentation-confidence", 0.90);
  const now = option("--now", new Date().toISOString());
  const batch = await readJson(join(candidates, "batch-result.json"));
  const pending = (batch.results || []).filter((row) => row.disposition === "candidate-pending-independent-visual-adjudication");

  const decisions = await runPool(pending, concurrency, async (row) => {
    const packetDir = join(candidates, row.packet_path);
    const [review, sourceReceipt] = await Promise.all([
      readJson(join(packetDir, "review.json")),
      readJson(join(packetDir, "source-receipt.json")),
    ]);
    const source = selectedSourceMetadata(review, sourceReceipt);
    const expectedSubject = review.expected_subject || "";
    const actor = review.identity?.actor || expectedSubject;
    const production = review.identity?.production || "";
    const subjectAliases = sourceSubjectAliases(expectedSubject);
    const actorAliases = sourceSubjectAliases(actor);
    const fileHasSubject = containsAlias(source.fileText, subjectAliases);
    const fileHasActor = containsAlias(source.fileText, actorAliases);
    const fileHasProduction = productionMatch(source.fileText, production);
    const liveActionDerivative = review.side === "still"
      && /physical-or-live-action/i.test(String(batch.cohort_key || ""))
      && /\b(?:illustration|drawing|graphic|novel|book|edition|painting|artwork)\b/i.test(source.fileText);
    const artifactMetadata = ARTIFACT.test(source.fileText) || liveActionDerivative;
    const groupMetadata = GROUP.test(source.candidate.source_file || "");
    const exactLeadPageImage = source.facts.exact_lead_pageimage === true;
    const exactActorPage = String(source.candidate.source_method || "").startsWith("exact-actor-pageimage")
      && exactLeadPageImage
      && (equivalent(source.candidate.source_page_title, actor) || source.facts.page_looks_like_actor === true);
    const pageimageStillBound = exactLeadPageImage
      && source.facts.pageimage_subject_bound === true
      && source.facts.pageimage_production_bound === true;
    const explicitFilePortrait = exactSubjectFile(source.candidate.source_file, actorAliases)
      && fileHasActor
      && PORTRAIT_METADATA.test([source.selected.description, source.selected.categories].filter(Boolean).join(" "))
      && !PORTRAIT_CONFLICT.test(source.fileText)
      && !artifactMetadata;
    const voiceLike = /voice|animation/i.test(String(review.identity?.kind || review.performance_mode || review.cohort_key || ""));
    const roleBound = source.facts.actor_role_bound === true || source.facts.actor_evidence_bound === true;
    let identityValue = "ambiguous";
    let identityConfidence = 0.20;
    let identityNote = "Textual source custody is insufficient for the filed subject.";
    if (review.side === "portrait" && (exactActorPage || explicitFilePortrait)) {
      identityValue = "expected";
      identityConfidence = exactActorPage ? 0.99 : 0.96;
      identityNote = exactActorPage
        ? "The exact actor page and its exact lead page-image relationship bind the selected bytes without relying on the filename."
        : "The selected file title and portrait metadata explicitly name the filed actor without conflicting namesake custody.";
    } else if (review.side === "still" && ((fileHasSubject && fileHasProduction) || pageimageStillBound) && !artifactMetadata && (!voiceLike || roleBound)) {
      identityValue = "expected";
      identityConfidence = pageimageStillBound && !(fileHasSubject && fileHasProduction) ? 0.97 : 0.98;
      identityNote = pageimageStillBound && !(fileHasSubject && fileHasProduction)
        ? "The exact character page, exact lead page-image relationship, filed production context, and required actor-role chain bind the selected bytes without relying on the filename."
        : "The selected file metadata explicitly names both the filed character and production, with the required actor-role chain when applicable.";
    } else if (artifactMetadata || (!fileHasSubject && !fileHasActor)) {
      identityValue = "wrong";
      identityConfidence = 0.98;
      identityNote = "The selected file metadata binds to an object, document, namesake, or other subject rather than the filed claim.";
    }

    const features = await imageFeatures({ packetDir, review, featureMap, featureScript, python });
    const textHeavy = Number(features.text_characters || 0) >= 80 || Number(features.text_area_ratio || 0) >= 0.08;
    const visuallyBlank = Number(features.entropy || 0) < 3.5 || Number(features.white_ratio || 0) >= 0.90;
    let presentationValue = "wrong-presentation";
    let presentationConfidence = 0.98;
    let presentationNote = "The local presentation checks reject this image for the filed facet.";
    if (review.side === "portrait") {
      const valid = features.dominant_single_face === true
        && !textHeavy
        && !visuallyBlank
        && !artifactMetadata
        && !groupMetadata;
      if (valid) {
        presentationValue = "neutral-human";
        presentationConfidence = 0.96;
        presentationNote = "Local face, framing, text-density, and artifact checks find one dominant unmasked human portrait with usable presentation.";
      } else {
        presentationNote = `Portrait presentation failed closed: dominant_face=${Boolean(features.dominant_single_face)} text_heavy=${textHeavy} blank_or_icon=${visuallyBlank} artifact=${artifactMetadata} group=${groupMetadata}.`;
      }
    } else {
      const valid = Number(features.analysis_width || 0) >= 240
        && Number(features.analysis_height || 0) >= 180
        && Number(features.entropy || 0) >= 4.0
        && Number(features.text_characters || 0) < 100
        && Number(features.text_area_ratio || 0) < 0.12
        && Number(features.white_ratio || 0) < 0.88
        && !artifactMetadata;
      if (valid) {
        presentationValue = "character-depiction";
        presentationConfidence = 0.93;
        presentationNote = "Local dimensions, entropy, text-density, blank-frame, and artifact checks find a usable non-document character image.";
      } else {
        presentationNote = `Still presentation failed closed: entropy=${features.entropy} text_characters=${features.text_characters} text_area=${features.text_area_ratio} white=${features.white_ratio} artifact=${artifactMetadata}.`;
      }
    }

    const expectedPresentation = review.visual_adjudication?.required_presentation_value;
    const accepted = identityValue === "expected"
      && identityConfidence >= identityThreshold
      && presentationValue === expectedPresentation
      && presentationConfidence >= presentationThreshold;
    const reason = accepted ? null : [
      identityValue !== "expected" ? `identity=${identityValue}` : null,
      identityConfidence < identityThreshold ? `identity-confidence=${identityConfidence}<${identityThreshold}` : null,
      presentationValue !== expectedPresentation ? `presentation=${presentationValue}; expected=${expectedPresentation}` : null,
      presentationConfidence < presentationThreshold ? `presentation-confidence=${presentationConfidence}<${presentationThreshold}` : null,
    ].filter(Boolean).join("; ");
    const origin = review.selected_source?.origin || source.candidate.source_page || null;
    const canonical = review.independent_evidence?.canonical_link || null;
    const evidence = unique([canonical, origin]);
    const featureDigest = sha256(JSON.stringify(features));
    const decision = {
      record_id: row.record_id,
      side: row.side,
      disposition: accepted ? "accept" : "reject",
      identity: identityValue,
      presentation: presentationValue,
      note: accepted
        ? `Independent local review accepted explicit textual identity custody and the required ${expectedPresentation} presentation.`
        : `Independent local review rejected the candidate: ${reason}`,
      ...(accepted ? {} : { reason }),
      identity_note: identityNote,
      presentation_note: presentationNote,
      evidence,
      identity_evidence: evidence,
      presentation_evidence: origin ? [origin] : [],
      decided_at: now,
      machine: {
        provider: "repository-local",
        model: "opencv-haar-tesseract-source-custody-v2",
        feature_sha256: featureDigest,
        features,
        identity_confidence: identityConfidence,
        presentation_confidence: presentationConfidence,
        identity_threshold: identityThreshold,
        presentation_threshold: presentationThreshold,
        appearance_used_for_identity: false,
        policy: "explicit-file-or-exact-lead-pageimage-binding-and-required-presentation-or-fail-closed"
      }
    };
    console.log(`${accepted ? "ACCEPT" : "REJECT"} ${row.record_id}/${row.side} identity=${identityValue} presentation=${presentationValue}`);
    return decision;
  });

  const value = {
    version: 1,
    status: "ready",
    source: {
      workflow_run_id: process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null,
      artifact_name: option("--artifact-name", process.env.GITHUB_RUN_ID ? `card-backfill-local-${process.env.GITHUB_RUN_ID}` : null),
      head_sha: option("--head-sha", process.env.GITHUB_SHA || null),
      candidate_result_sha256: batch.result_sha256 || null,
      autonomous_cycle: option("--cycle", null) === null ? null : Number(option("--cycle")),
    },
    campaign_id: batch.campaign_id,
    estate_sha256: batch.estate_sha256,
    batch_sha256: batch.batch_sha256,
    cohort_key: batch.cohort_key,
    adjudicator: {
      id: "repository-local-opencv-source-custody-second-desk-v2",
      kind: "machine",
      independent_from_discovery: true,
      method: "deterministic textual source-custody adjudication plus local OpenCV face/framing analysis and bounded Tesseract text-density rejection",
      provider: "repository-local",
      primary_model: "opencv-haar-tesseract-source-custody-v2",
      identity_confidence_threshold: identityThreshold,
      presentation_confidence_threshold: presentationThreshold,
    },
    decisions,
    machine_adjudication: {
      pending_count: pending.length,
      accepted_count: decisions.filter((row) => row.disposition === "accept").length,
      rejected_count: decisions.filter((row) => row.disposition === "reject").length,
      decision_sha256: sha256(JSON.stringify(decisions)),
      canonical_mutation: false,
    },
    canonical_mutation: false,
  };
  await writeJson(out, value);
  console.log(`PASS — independently local-adjudicated ${pending.length} candidate(s): ${value.machine_adjudication.accepted_count} accepted, ${value.machine_adjudication.rejected_count} rejected`);
  console.log(`OUTPUT — ${out}`);
}

main().catch((error) => {
  console.error(`card-backfill local adjudicate: ${error.stack || error.message}`);
  process.exit(1);
});
