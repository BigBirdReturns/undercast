#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
function fail(message) { throw new Error(message); }
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a value`);
  return value;
}
function has(name) { return args.includes(name); }
function replaceExactly(source, oldValue, newValue, label) {
  const count = source.split(oldValue).length - 1;
  if (count !== 1) fail(`${label}: expected one source match, found ${count}`);
  return source.replace(oldValue, newValue);
}
function normalizedSource(source) {
  let text = source;
  text = replaceExactly(text,
`    manifest.selected_source?.page_url,
    manifest.selected_source?.url,`,
`    manifest.selected_source?.source_page,
    manifest.selected_source?.page_url,
    manifest.selected_source?.url,
    manifest.selected_source?.origin,`,
"selected-source page adapter");
  text = replaceExactly(text,
`  const legacy = Boolean(raw.record?.id && raw.composition?.file);
  const recordId = legacy ? raw.record.id : raw.record_id;
  const side = legacy ? raw.record.side : raw.side;
  assert(key === keyFor(recordId, side), \`\${key} manifest identity drifted\`);
  const actor = legacy ? raw.record.actor : raw.actor;
  const character = legacy ? raw.record.character : raw.character;
  const production = legacy ? raw.record.production : raw.production;
  const candidate = legacy
    ? { path: raw.composition.file, sha256: raw.composition.sha256, mime: raw.composition.mime, width: raw.composition.width, height: raw.composition.height }
    : raw.candidate;
  assert(candidate?.path && /^[0-9a-f]{64}$/.test(candidate.sha256 || ""), \`\${key} candidate receipt is malformed\`);`,
`  const legacy = Boolean(raw.record?.id && raw.composition?.file);
  const batched = Boolean(!legacy && Array.isArray(raw.files) && raw.campaign_id);
  const batchedReviewDoc = batched
    ? await readJson(root, \`\${imported.root}/review.json\`, \`\${key} batched review\`, false)
    : null;
  const batchedReview = batchedReviewDoc?.value || null;
  const recordId = legacy ? raw.record.id : raw.record_id;
  const side = legacy ? raw.record.side : raw.side;
  assert(key === keyFor(recordId, side), \`\${key} manifest identity drifted\`);
  const actor = legacy ? raw.record.actor : batched ? batchedReview?.identity?.actor : raw.actor;
  const character = legacy ? raw.record.character : batched ? batchedReview?.identity?.character : raw.character;
  const production = legacy ? raw.record.production : batched ? batchedReview?.identity?.production : raw.production;
  if (batched && batchedReview?.selected_source) raw.selected_source = batchedReview.selected_source;
  const renderedPermanent = Boolean(!legacy && !batched && !raw.candidate && raw.render?.candidate);
  const candidate = legacy
    ? { path: raw.composition.file, sha256: raw.composition.sha256, mime: raw.composition.mime, width: raw.composition.width, height: raw.composition.height }
    : batched
      ? batchedReview?.render_result?.candidate
      : renderedPermanent
        ? { ...raw.render.candidate, mime: raw.render.candidate.mime || null }
        : raw.candidate;
  assert(candidate?.path && /^[0-9a-f]{64}$/.test(candidate.sha256 || ""), \`\${key} candidate receipt is malformed\`);`,
"packet identity and candidate adapters");
  text = replaceExactly(text,
`  const reviewDoc = legacy ? await readJson(root, \`\${imported.root}/review.json\`, \`\${key} legacy review\`, false) : null;
  const modernReview = raw.exact_subject_review || null;
  const reviewReady = legacy
    ? legacyReviewPassed(reviewDoc?.value)
    : Boolean(raw.reviewed_by && raw.reviewed_role
      && new Set(["reviewed-evidence-candidate", "reviewed-evidence-ready-for-canonical-consideration"]).has(raw.disposition)
      && acceptedIdentity(modernReview?.identity)
      && acceptedPresentation(modernReview?.presentation)
      && modernCropPassed(modernReview));`,
`  const reviewDoc = legacy
    ? await readJson(root, \`\${imported.root}/review.json\`, \`\${key} legacy review\`, false)
    : renderedPermanent
      ? await readJson(root, \`\${imported.root}/review.json\`, \`\${key} rendered packet review\`, false)
      : batchedReviewDoc;
  const modernReview = raw.exact_subject_review || null;
  const renderedReview = renderedPermanent ? reviewDoc?.value || null : null;
  const renderedReviewReady = Boolean(renderedPermanent
    && renderedReview?.disposition === "reviewed-evidence-candidate"
    && renderedReview?.visual_second_desk?.status === "accepted-for-render"
    && renderedReview?.render_result?.candidate?.path === candidate.path
    && renderedReview?.render_result?.candidate?.sha256 === candidate.sha256
    && renderedReview?.render_result?.wall_crop?.path
    && renderedReview?.canonical_mutation === false
    && Array.isArray(renderedReview?.duplicate_scan?.items)
    && renderedReview.duplicate_scan.items.every((item) => Array.isArray(item.matches) && item.matches.length === 0));
  const batchedReviewReady = Boolean(batched
    && batchedReview?.disposition === "reviewed-evidence-candidate"
    && batchedReview?.visual_adjudication?.status === "accepted"
    && batchedReview?.visual_adjudication?.independent_from_discovery === true
    && batchedReview?.visual_adjudication?.identity?.value === "expected"
    && acceptedPresentation(batchedReview?.visual_adjudication?.presentation?.value)
    && batchedReview?.render_result?.candidate?.path === candidate.path
    && batchedReview?.render_result?.candidate?.sha256 === candidate.sha256
    && batchedReview?.render_result?.wall_crop?.path
    && batchedReview?.canonical_mutation === false
    && Array.isArray(batchedReview?.duplicate_scan?.items)
    && batchedReview.duplicate_scan.items.every((item) => Array.isArray(item.matches) && item.matches.length === 0));
  const reviewReady = legacy
    ? legacyReviewPassed(reviewDoc?.value)
    : batched
      ? batchedReviewReady
      : renderedPermanent
        ? renderedReviewReady
        : Boolean(raw.reviewed_by && raw.reviewed_role
          && new Set(["reviewed-evidence-candidate", "reviewed-evidence-ready-for-canonical-consideration"]).has(raw.disposition)
          && acceptedIdentity(modernReview?.identity)
          && acceptedPresentation(modernReview?.presentation)
          && modernCropPassed(modernReview));`,
"packet review adapters");
  text = replaceExactly(text,
`  if (duplicateDoc) duplicatePass = String(duplicateDoc.value?.status || "").toLowerCase() === "pass";
  else if (legacy) duplicatePass = String(reviewDoc?.value?.candidate?.duplicate_scan?.status || raw.duplicate_scan?.status || "").toLowerCase() === "pass";
  else duplicatePass = String(raw.duplicate_scan?.status || "").toLowerCase() === "pass";`,
`  if (duplicateDoc) {
    duplicatePass = String(duplicateDoc.value?.status || "").toLowerCase() === "pass"
      || (Array.isArray(duplicateDoc.value?.items) && duplicateDoc.value.items.every((item) => Array.isArray(item.matches) && item.matches.length === 0));
  } else if (legacy) duplicatePass = String(reviewDoc?.value?.candidate?.duplicate_scan?.status || raw.duplicate_scan?.status || "").toLowerCase() === "pass";
  else if (batched) duplicatePass = batchedReviewReady;
  else if (renderedPermanent) duplicatePass = renderedReviewReady;
  else duplicatePass = String(raw.duplicate_scan?.status || "").toLowerCase() === "pass";`,
"duplicate adapters");
  text = replaceExactly(text,
`    packet_generation: legacy ? "legacy-serial" : "normalized",`,
`    packet_generation: legacy ? "legacy-serial" : batched ? "batched-amortized" : renderedPermanent ? "rendered-permanent" : "normalized",`,
"generation classifier");
  return text;
}

async function main() {
  const root = path.resolve(option("--root", "."));
  const sourcePath = path.join(root, "scripts/estate-packet-adoption-census.mjs");
  const source = await readFile(sourcePath, "utf8");
  const patched = normalizedSource(source);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "packet-census-v2-"));
  const tempPath = path.join(tempRoot, "estate-packet-adoption-census.mjs");
  try {
    await writeFile(tempPath, patched);
    const module = await import(`${pathToFileURL(tempPath).href}?v=${Date.now()}`);
    const census = await module.buildCensus({ root, now: option("--now", new Date().toISOString()) });
    if (has("--write")) {
      const out = path.resolve(root, option("--out", "data/review/estate-debt/COLLECT-005-ADOPTION-CENSUS.json"));
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, `${JSON.stringify(census, null, 2)}\n`);
    }
    if (has("--materialize")) await writeFile(sourcePath, patched);
    console.log(JSON.stringify({ transaction: census.transaction, counts: census.counts, safe_tranches: census.safe_tranches, recommended_next_batch: census.recommended_next_batch, canonical_mutation: false }, null, 2));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`packet adoption census v2 failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
