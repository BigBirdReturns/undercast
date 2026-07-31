#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

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
function integerOption(name, fallback, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const value = Number(option(name, String(fallback)));
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be an integer in ${minimum}..${maximum}`);
  return value;
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) { await mkdir(resolve(path, ".."), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + "\n"); }
function cleanText(value, maximum = 4000) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maximum ? `${text.slice(0, maximum)}…` : text;
}
function mimeFor(path, declared = null) {
  if (declared && /^image\//.test(declared)) return declared;
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}
function evidenceUrls(review) {
  const values = [
    review.independent_evidence?.canonical_link,
    review.selected_source?.origin,
    ...(review.independent_evidence?.references || []).map((row) => typeof row === "string" ? row : row?.url),
    ...(review.independent_evidence?.performances || []).map((row) => typeof row === "string" ? row : row?.url),
  ].filter(Boolean);
  return [...new Set(values)];
}
function sourceSummary(review, sourceReceipt) {
  const retrieval = sourceReceipt.retrieval_result || {};
  const discovery = retrieval.discovery || {};
  const candidate = retrieval.candidate || {};
  return {
    canonical_link: review.independent_evidence?.canonical_link || null,
    source_origin: review.selected_source?.origin || candidate.origin || null,
    source_page: candidate.source_page || discovery.canonical_link || null,
    source_file: candidate.source_file || discovery.selected?.file || null,
    source_method: candidate.source_method || discovery.selected?.method || review.discovery?.source_family || null,
    exact_page_title: discovery.exact_page_title || discovery.resolved_title || null,
    author: review.selected_source?.author || candidate.author || null,
    license: review.selected_source?.license || candidate.license || null,
    categories_excerpt: cleanText((discovery.attempts || []).map((row) => row.body_excerpt || "").find((value) => /Categories|ObjectName|ImageDescription/i.test(value)) || "", 1800),
  };
}

function promptFor(review, sourceReceipt, imageName) {
  const summary = {
    record_id: review.record_id,
    filed_side: review.side,
    expected_subject: review.expected_subject,
    filed_identity: review.identity,
    required_identity_value: "expected",
    required_presentation_value: review.visual_adjudication?.required_presentation_value,
    source_custody: sourceSummary(review, sourceReceipt),
    filed_evidence_urls: evidenceUrls(review),
  };
  return [
    "Act as a conservative independent evidence adjudicator.",
    "Return only one strict JSON object. Do not use Markdown or code fences. Do not modify files.",
    "The exact required schema is:",
    JSON.stringify({
      decision: "accept|reject",
      identity: { value: "expected|wrong|ambiguous", source_binding: "explicit|implicit|none", confidence: "number 0..1", note: "non-empty string" },
      presentation: { value: "neutral-human|character-depiction|wrong-presentation|ambiguous", confidence: "number 0..1", note: "non-empty string" },
      reason: "non-empty string",
    }),
    "",
    "Binding rules:",
    "1. Do not identify a person or character from appearance. Identity may be `expected` only when textual source custody explicitly binds the selected file to the filed subject. Appearance is never identity evidence.",
    "2. For a role image, an explicit textual chain may consist of actor-role evidence naming the actor and character plus an exact character page naming the filed production and carrying the selected file.",
    "3. Use the attached image only to judge presentation and suitability for the filed facet.",
    "4. For a portrait, `neutral-human` means an ordinary out-of-character human presentation: no role makeup, creature suit, full public-persona mask, object, artwork, document, generic icon, or character treatment.",
    "5. For a still, `character-depiction` means the image visibly depicts the filed character in the filed production or an explicitly source-bound equivalent role image.",
    "6. Namesake collisions, group ambiguity, wrong adaptation, derivative objects, advertisements, text/UI, logos, unusable framing, and weak source binding require rejection.",
    "7. Be conservative. A separate caller applies higher confidence thresholds and fails closed.",
    "",
    `Filed claim and source custody:\n${JSON.stringify(summary, null, 2)}`,
    "",
    `Evidence composite attachment: @./${imageName}`,
    "The upper region is the proposed card framing. The lower region preserves the complete source image.",
  ].join("\n");
}

function parseJsonText(text) {
  const cleaned = String(text)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error("Copilot CLI response did not contain a JSON object");
}
function validateDecision(value) {
  if (!value || !["accept", "reject"].includes(value.decision)) throw new Error("Copilot decision is invalid");
  if (!value.identity || !["expected", "wrong", "ambiguous"].includes(value.identity.value)) throw new Error("Copilot identity value is invalid");
  if (!["explicit", "implicit", "none"].includes(value.identity.source_binding)) throw new Error("Copilot source binding is invalid");
  if (!Number.isFinite(value.identity.confidence) || value.identity.confidence < 0 || value.identity.confidence > 1) throw new Error("Copilot identity confidence is invalid");
  if (!value.presentation || !["neutral-human", "character-depiction", "wrong-presentation", "ambiguous"].includes(value.presentation.value)) throw new Error("Copilot presentation value is invalid");
  if (!Number.isFinite(value.presentation.confidence) || value.presentation.confidence < 0 || value.presentation.confidence > 1) throw new Error("Copilot presentation confidence is invalid");
  if (!cleanText(value.identity.note) || !cleanText(value.presentation.note) || !cleanText(value.reason)) throw new Error("Copilot notes are incomplete");
  return value;
}
function runProcess(command, commandArgs, { cwd, env, timeoutMs }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, commandArgs, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => { clearTimeout(timer); rejectPromise(error); });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? 1, signal, timed_out: timedOut, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
}
async function callCopilot({ copilotBin, model, prompt, imagePath, attempts, timeoutMs, recordId }) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const work = await mkdtemp(join(tmpdir(), `card-backfill-copilot-${recordId.toLowerCase()}-`));
    try {
      const extension = extname(imagePath).toLowerCase() || ".jpg";
      const imageName = `evidence${extension}`;
      await copyFile(imagePath, join(work, imageName));
      const renderedPrompt = prompt.replace("@./EVIDENCE_ATTACHMENT", `@./${imageName}`);
      await writeFile(join(work, "PROMPT.txt"), renderedPrompt);
      const commandArgs = [
        "--yolo",
        "--sandbox",
        "--no-ask-user",
        "--no-auto-update",
        "--no-color",
        "--no-custom-instructions",
        "--no-remote",
        "--no-remote-export",
        "--silent",
        "--output-format=text",
        `--model=${model}`,
        "-p",
        renderedPrompt,
      ];
      const result = await runProcess(copilotBin, commandArgs, {
        cwd: work,
        timeoutMs,
        env: {
          ...process.env,
          COPILOT_HOME: join(work, ".copilot"),
          COPILOT_PROMPT_FRAME: "0",
          COPILOT_MODEL: model,
        },
      });
      if (result.code !== 0) throw new Error(`Copilot CLI exited ${result.code}${result.timed_out ? " after timeout" : ""}: ${cleanText(result.stderr || result.stdout, 2000)}`);
      const parsed = validateDecision(parseJsonText(result.stdout));
      return {
        parsed,
        raw: result.stdout,
        stderr: result.stderr,
        model,
        attempt,
        prompt_sha256: sha256(renderedPrompt),
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) console.log(`RETRY ${recordId} Copilot CLI attempt ${attempt}/${attempts}: ${cleanText(error.message, 600)}`);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }
  throw lastError || new Error(`Copilot CLI failed for ${recordId}`);
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

export async function adjudicateWithCopilot({
  candidates,
  out,
  copilotBin,
  model,
  concurrency,
  attempts,
  timeoutMs,
  identityThreshold,
  presentationThreshold,
  now,
  artifactName,
  headSha,
  cycle,
}) {
  const batch = await readJson(join(candidates, "batch-result.json"));
  const pending = (batch.results || []).filter((row) => row.disposition === "candidate-pending-independent-visual-adjudication");
  const decisions = await runPool(pending, concurrency, async (row) => {
    const packetDir = join(candidates, row.packet_path);
    const [review, sourceReceipt] = await Promise.all([
      readJson(join(packetDir, "review.json")),
      readJson(join(packetDir, "source-receipt.json")),
    ]);
    const imageName = review.render_result?.candidate?.path || review.render_result?.wall_crop?.path || review.selected_source?.output_path;
    if (!imageName) throw new Error(`candidate ${row.record_id}/${row.side} has no adjudication image`);
    const imagePath = join(packetDir, imageName);
    const imageBytes = await readFile(imagePath);
    const promptTemplate = promptFor(review, sourceReceipt, "EVIDENCE_ATTACHMENT");
    const result = await callCopilot({ copilotBin, model, prompt: promptTemplate, imagePath, attempts, timeoutMs, recordId: row.record_id });
    const expectedPresentation = review.visual_adjudication?.required_presentation_value;
    const accepted = result.parsed.decision === "accept"
      && result.parsed.identity.value === "expected"
      && result.parsed.identity.source_binding === "explicit"
      && result.parsed.identity.confidence >= identityThreshold
      && result.parsed.presentation.value === expectedPresentation
      && result.parsed.presentation.confidence >= presentationThreshold;
    const thresholdReason = accepted ? null : [
      result.parsed.decision !== "accept" ? result.parsed.reason : null,
      result.parsed.identity.value !== "expected" ? `identity=${result.parsed.identity.value}` : null,
      result.parsed.identity.source_binding !== "explicit" ? `source-binding=${result.parsed.identity.source_binding}` : null,
      result.parsed.identity.confidence < identityThreshold ? `identity-confidence=${result.parsed.identity.confidence}<${identityThreshold}` : null,
      result.parsed.presentation.value !== expectedPresentation ? `presentation=${result.parsed.presentation.value}; expected=${expectedPresentation}` : null,
      result.parsed.presentation.confidence < presentationThreshold ? `presentation-confidence=${result.parsed.presentation.confidence}<${presentationThreshold}` : null,
    ].filter(Boolean).join("; ");
    const evidence = evidenceUrls(review);
    const decision = {
      record_id: row.record_id,
      side: row.side,
      disposition: accepted ? "accept" : "reject",
      identity: result.parsed.identity.value,
      presentation: result.parsed.presentation.value,
      note: accepted
        ? `Independent Copilot CLI review accepted explicit source-bound identity and the required ${expectedPresentation} presentation.`
        : `Independent Copilot CLI review rejected or quarantined the candidate: ${thresholdReason || result.parsed.reason}`,
      reason: accepted ? undefined : (thresholdReason || result.parsed.reason),
      identity_note: result.parsed.identity.note,
      presentation_note: result.parsed.presentation.note,
      evidence,
      identity_evidence: evidence,
      presentation_evidence: [review.selected_source?.origin].filter(Boolean),
      decided_at: now,
      machine: {
        provider: "github-copilot-cli",
        model: result.model,
        attempt: result.attempt,
        prompt_sha256: result.prompt_sha256,
        response_sha256: sha256(result.raw),
        stderr_sha256: sha256(result.stderr || ""),
        image_path: `${row.packet_path}/${imageName}`,
        image_sha256: sha256(imageBytes),
        image_bytes: imageBytes.length,
        image_mime: mimeFor(imagePath, review.render_result?.candidate?.mime || review.selected_source?.mime),
        identity_confidence: result.parsed.identity.confidence,
        presentation_confidence: result.parsed.presentation.confidence,
        identity_threshold: identityThreshold,
        presentation_threshold: presentationThreshold,
        policy: "explicit-source-binding-and-required-presentation-or-fail-closed",
      },
    };
    if (accepted) delete decision.reason;
    console.log(`${accepted ? "ACCEPT" : "REJECT"} ${row.record_id}/${row.side} via Copilot CLI ${model}`);
    return decision;
  });
  const value = {
    version: 1,
    status: "ready",
    source: {
      workflow_run_id: process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null,
      artifact_name: artifactName,
      head_sha: headSha,
      candidate_result_sha256: batch.result_sha256 || null,
      autonomous_cycle: cycle,
    },
    campaign_id: batch.campaign_id,
    estate_sha256: batch.estate_sha256,
    batch_sha256: batch.batch_sha256,
    cohort_key: batch.cohort_key,
    adjudicator: {
      id: `github-copilot-cli-${model.replaceAll("/", "-")}-card-backfill-second-desk-v1`,
      kind: "machine",
      independent_from_discovery: true,
      method: "source-bound textual identity review plus attached deterministic evidence composite; fail-closed thresholds",
      provider: "github-copilot-cli",
      model,
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
  };
  await writeJson(out, value);
  console.log(`PASS — independently Copilot-adjudicated ${pending.length} candidate(s): ${value.machine_adjudication.accepted_count} accepted, ${value.machine_adjudication.rejected_count} rejected`);
  console.log(`OUTPUT — ${out}`);
  return value;
}

async function main() {
  const candidates = resolve(option("--candidates"));
  const out = resolve(option("--out", join(candidates, "copilot-decisions.json")));
  const copilotBin = option("--copilot-bin", "copilot");
  const model = option("--model", process.env.COPILOT_MODEL || "auto");
  const concurrency = integerOption("--max-parallel", 4, 1, 8);
  const attempts = integerOption("--attempts", 3, 1, 6);
  const timeoutMs = integerOption("--timeout-ms", 600_000, 10_000, 1_800_000);
  const identityThreshold = numberOption("--identity-confidence", 0.93);
  const presentationThreshold = numberOption("--presentation-confidence", 0.90);
  if (!process.env.GITHUB_TOKEN && copilotBin === "copilot") throw new Error("GITHUB_TOKEN is required for Copilot CLI adjudication");
  await adjudicateWithCopilot({
    candidates,
    out,
    copilotBin,
    model,
    concurrency,
    attempts,
    timeoutMs,
    identityThreshold,
    presentationThreshold,
    now: option("--now", new Date().toISOString()),
    artifactName: option("--artifact-name", process.env.GITHUB_RUN_ID ? `card-backfill-copilot-${process.env.GITHUB_RUN_ID}` : null),
    headSha: option("--head-sha", process.env.GITHUB_SHA || null),
    cycle: option("--cycle", null) === null ? null : Number(option("--cycle")),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`card-backfill Copilot adjudicate: ${error.stack || error.message}`);
    process.exit(1);
  });
}
