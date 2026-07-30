#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

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
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + "\n"); }
function cleanText(value, maximum = 4000) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maximum ? `${text.slice(0, maximum)}…` : text;
}
function mimeFor(path, declared = null) {
  if (declared && /^image\//.test(declared)) return declared;
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}
async function dataUri(path, mime) {
  const bytes = await readFile(path);
  return { uri: `data:${mime};base64,${bytes.toString("base64")}`, sha256: sha256(bytes), bytes: bytes.length };
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

const RESPONSE_SCHEMA = {
  name: "card_backfill_independent_adjudication",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      decision: { type: "string", enum: ["accept", "reject"] },
      identity: {
        type: "object",
        additionalProperties: false,
        properties: {
          value: { type: "string", enum: ["expected", "wrong", "ambiguous"] },
          source_binding: { type: "string", enum: ["explicit", "implicit", "none"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          note: { type: "string", minLength: 1 },
        },
        required: ["value", "source_binding", "confidence", "note"],
      },
      presentation: {
        type: "object",
        additionalProperties: false,
        properties: {
          value: { type: "string", enum: ["neutral-human", "character-depiction", "wrong-presentation", "ambiguous"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          note: { type: "string", minLength: 1 },
        },
        required: ["value", "confidence", "note"],
      },
      reason: { type: "string", minLength: 1 },
    },
    required: ["decision", "identity", "presentation", "reason"],
  },
};

function promptFor(review, sourceReceipt) {
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
    "Independently adjudicate one media-evidence candidate.",
    "",
    "Binding rules:",
    "1. Do not identify a person or character from appearance. Identity may be `expected` only when the textual source custody explicitly binds the selected file to the filed subject. Appearance is never identity evidence.",
    "2. Use the supplied image only to judge presentation and suitability for the filed facet.",
    "3. For a portrait, `neutral-human` means an ordinary out-of-character human presentation: no role makeup, creature suit, full public-persona mask, or character treatment.",
    "4. For a still, `character-depiction` means the image visibly depicts the filed character in the filed production or an explicitly source-bound equivalent role image.",
    "5. Ambiguity, weak source binding, group ambiguity, wrong presentation, screenshots of text/UI, logos, or unusable framing require rejection.",
    "6. Be conservative. The caller will apply an additional confidence threshold and will fail closed.",
    "",
    `Filed claim and source custody:\n${JSON.stringify(summary, null, 2)}`,
    "",
    "The attached image is the deterministic evidence composite: the upper region is the proposed card framing and the lower region preserves the complete source image. Return only the requested JSON object.",
  ].join("\n");
}

function responseContent(value) {
  const content = value?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item?.text || item?.content || "").join("");
  throw new Error("model response has no message content");
}
function parseJsonText(text) {
  const trimmed = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}
function retryDelay(response, attempt) {
  const header = response?.headers?.get?.("retry-after");
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(120_000, Math.max(1_000, seconds * 1000));
  return Math.min(60_000, 2_000 * (2 ** attempt));
}
async function sleep(ms) { await new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }

async function callModel({ endpoint, token, model, prompt, image, maximumAttempts = 6 }) {
  const base = {
    model,
    temperature: 0,
    max_tokens: 900,
    messages: [
      { role: "system", content: "You are a conservative independent evidence adjudicator. Follow the typed claim boundary exactly and return strict JSON." },
      { role: "user", content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: image.uri, detail: "high" } },
      ] },
    ],
  };
  let structured = true;
  let lastError = null;
  for (let attempt = 0; attempt < maximumAttempts; attempt++) {
    const body = structured ? { ...base, response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA } } : base;
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      lastError = error;
      if (attempt + 1 < maximumAttempts) { await sleep(retryDelay(null, attempt)); continue; }
      throw error;
    }
    const text = await response.text();
    if (response.ok) return { parsed: parseJsonText(responseContent(JSON.parse(text))), raw: text, model, structured };
    const message = `GitHub Models ${response.status}: ${cleanText(text, 1200)}`;
    lastError = new Error(message);
    if (response.status === 400 && structured && /response[_ -]?format|json[_ -]?schema|unsupported/i.test(text)) {
      structured = false;
      continue;
    }
    if ([408, 409, 429, 500, 502, 503, 504].includes(response.status) && attempt + 1 < maximumAttempts) {
      await sleep(retryDelay(response, attempt));
      continue;
    }
    throw lastError;
  }
  throw lastError || new Error("GitHub Models request exhausted retries");
}

function validateModelDecision(value) {
  if (!value || !["accept", "reject"].includes(value.decision)) throw new Error("model decision is invalid");
  if (!value.identity || !["expected", "wrong", "ambiguous"].includes(value.identity.value)) throw new Error("model identity value is invalid");
  if (!["explicit", "implicit", "none"].includes(value.identity.source_binding)) throw new Error("model source binding is invalid");
  if (!Number.isFinite(value.identity.confidence) || value.identity.confidence < 0 || value.identity.confidence > 1) throw new Error("model identity confidence is invalid");
  if (!value.presentation || !["neutral-human", "character-depiction", "wrong-presentation", "ambiguous"].includes(value.presentation.value)) throw new Error("model presentation value is invalid");
  if (!Number.isFinite(value.presentation.confidence) || value.presentation.confidence < 0 || value.presentation.confidence > 1) throw new Error("model presentation confidence is invalid");
  if (!cleanText(value.identity.note) || !cleanText(value.presentation.note) || !cleanText(value.reason)) throw new Error("model notes are incomplete");
  return value;
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
  const out = resolve(option("--out", join(candidates, "machine-decisions.json")));
  const batch = await readJson(join(candidates, "batch-result.json"));
  const pending = (batch.results || []).filter((row) => row.disposition === "candidate-pending-independent-visual-adjudication");
  const model = option("--model", process.env.CARD_BACKFILL_MODEL || "openai/gpt-4.1-mini");
  const fallbackModel = option("--fallback-model", process.env.CARD_BACKFILL_FALLBACK_MODEL || "openai/gpt-4o-mini");
  const endpoint = option("--endpoint", process.env.GITHUB_MODELS_ENDPOINT || "https://models.github.ai/inference/chat/completions");
  const token = process.env[option("--token-env", "GITHUB_TOKEN")] || "";
  const mockDir = option("--mock-dir", null);
  const identityThreshold = numberOption("--identity-confidence", 0.93);
  const presentationThreshold = numberOption("--presentation-confidence", 0.90);
  const concurrency = Math.max(1, Math.min(8, Math.floor(numberOption("--max-parallel", 2))));
  if (!mockDir && !token) throw new Error("GitHub Models token is required");

  const decisions = await runPool(pending, concurrency, async (row) => {
    const packetDir = join(candidates, row.packet_path);
    const [review, sourceReceipt] = await Promise.all([
      readJson(join(packetDir, "review.json")),
      readJson(join(packetDir, "source-receipt.json")),
    ]);
    const imageName = review.render_result?.candidate?.path || review.render_result?.wall_crop?.path || review.selected_source?.output_path;
    if (!imageName) throw new Error(`candidate ${row.record_id}/${row.side} has no adjudication image`);
    const imagePath = join(packetDir, imageName);
    const image = await dataUri(imagePath, mimeFor(imagePath, review.render_result?.candidate?.mime || review.selected_source?.mime));
    const prompt = promptFor(review, sourceReceipt);
    let result;
    if (mockDir) {
      const parsed = validateModelDecision(await readJson(join(resolve(mockDir), `${row.record_id}.json`)));
      result = { parsed, raw: JSON.stringify(parsed), model: "fixture/mock", structured: true };
    } else {
      try {
        const called = await callModel({ endpoint, token, model, prompt, image });
        result = { ...called, parsed: validateModelDecision(called.parsed) };
      } catch (primaryError) {
        if (!fallbackModel || fallbackModel === model) throw primaryError;
        const called = await callModel({ endpoint, token, model: fallbackModel, prompt, image });
        result = { ...called, parsed: validateModelDecision(called.parsed), primary_error: cleanText(primaryError.message, 1000) };
      }
    }
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
        ? `Independent machine review accepted explicit source-bound identity and the required ${expectedPresentation} presentation.`
        : `Independent machine review rejected or quarantined the candidate: ${thresholdReason || result.parsed.reason}`,
      reason: accepted ? undefined : (thresholdReason || result.parsed.reason),
      identity_note: result.parsed.identity.note,
      presentation_note: result.parsed.presentation.note,
      evidence,
      identity_evidence: evidence,
      presentation_evidence: [review.selected_source?.origin].filter(Boolean),
      decided_at: option("--now", new Date().toISOString()),
      machine: {
        provider: mockDir ? "fixture" : "github-models",
        model: result.model,
        fallback_from: result.primary_error ? model : null,
        prompt_sha256: sha256(prompt),
        response_sha256: sha256(result.raw),
        image_path: `${row.packet_path}/${imageName}`,
        image_sha256: image.sha256,
        image_bytes: image.bytes,
        structured_response: result.structured,
        identity_confidence: result.parsed.identity.confidence,
        presentation_confidence: result.parsed.presentation.confidence,
        identity_threshold: identityThreshold,
        presentation_threshold: presentationThreshold,
        policy: "explicit-source-binding-and-required-presentation-or-fail-closed",
      },
    };
    if (accepted) delete decision.reason;
    console.log(`${accepted ? "ACCEPT" : "REJECT"} ${row.record_id}/${row.side} via ${result.model}`);
    return decision;
  });

  const value = {
    version: 1,
    status: "ready",
    source: {
      workflow_run_id: process.env.GITHUB_RUN_ID ? Number(process.env.GITHUB_RUN_ID) : null,
      artifact_name: option("--artifact-name", process.env.GITHUB_RUN_ID ? `card-backfill-autonomous-${process.env.GITHUB_RUN_ID}` : null),
      head_sha: option("--head-sha", process.env.GITHUB_SHA || null),
      candidate_result_sha256: batch.result_sha256 || null,
      autonomous_cycle: option("--cycle", null) === null ? null : Number(option("--cycle")),
    },
    campaign_id: batch.campaign_id,
    estate_sha256: batch.estate_sha256,
    batch_sha256: batch.batch_sha256,
    cohort_key: batch.cohort_key,
    adjudicator: {
      id: `github-models-${model.replaceAll("/", "-")}-card-backfill-second-desk-v1`,
      kind: "machine",
      independent_from_discovery: true,
      method: "source-bound textual identity review plus direct multimodal presentation review; fail-closed thresholds",
      provider: mockDir ? "fixture" : "github-models",
      primary_model: model,
      fallback_model: fallbackModel,
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
  console.log(`PASS — independently machine-adjudicated ${pending.length} candidate(s): ${value.machine_adjudication.accepted_count} accepted, ${value.machine_adjudication.rejected_count} rejected`);
  console.log(`OUTPUT — ${out}`);
}

main().catch((error) => { console.error(`card-backfill machine adjudicate: ${error.stack || error.message}`); process.exit(1); });
