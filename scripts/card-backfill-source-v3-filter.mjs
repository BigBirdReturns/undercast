#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { isCompositeRequiredSubject } from "./lib/card-backfill-source-policy-v3.mjs";

const STOPWORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "the", "to", "with"]);
const FORBIDDEN_DERIVATIVE = /\b(?:street\s+sign|road\s+sign|building|facade|theme\s+park|attraction|statue|sculpture|toy|action\s+figure|figurine|plush|cosplay|cosplayer|costume\s+(?:display|exhibit|replica)|mascot|logo|poster|book\s+cover|album\s+cover|dvd\s+cover|cover\s+art|comic(?:\s+book)?|mural|graffiti|tattoo|license\s+plate|wax\s+figure|fan\s+art|concept\s+art|artwork|merchandise)\b/i;

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value) {
  return normalize(value).split(" ").filter((word) => word && !STOPWORDS.has(word));
}

function phraseIn(text, phrase) {
  const hay = ` ${normalize(text)} `;
  const needle = ` ${normalize(phrase)} `;
  return needle.trim().length > 1 && hay.includes(needle);
}

function subjectAliases(row) {
  const evidenceAliases = row?.discovery?.source_evidence?.expected_subject_aliases || [];
  const expected = String(row?.expected_subject || "")
    .replace(/\((?:voice|voice role|vocal performance|uncredited)[^)]*\)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const values = [...evidenceAliases, expected]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return [...new Set(values.map(normalize).filter(Boolean))];
}

function selectedMetadata(row) {
  const selected = row?.discovery?.selected_candidate || {};
  const evidence = row?.discovery?.source_evidence || {};
  const windows = Array.isArray(selected.page_extract_windows) ? selected.page_extract_windows : [];
  const text = [
    selected.file,
    selected.page_title,
    selected.description,
    selected.categories,
    ...windows,
  ].filter(Boolean).join(" ");
  return { selected, evidence, text };
}

function productionIsBound(production, text, actorRole) {
  if (actorRole?.explicit_character_and_production === true) return true;
  if (!production) return false;
  if (phraseIn(text, production)) return true;
  const tokens = [...new Set(words(production).filter((word) => word.length >= 3))];
  if (!tokens.length) return phraseIn(text, production);
  const normalized = normalize(text);
  const matches = tokens.filter((token) => ` ${normalized} `.includes(` ${token} `)).length;
  return matches >= Math.min(2, tokens.length);
}

function actorPageSelected(selected, actorRole) {
  if (!actorRole) return false;
  const pageTitle = normalize(selected.page_title);
  const actorTitle = normalize(actorRole.title);
  if (pageTitle && actorTitle && pageTitle === actorTitle) return true;
  const pageUrl = String(selected.page_url || "").replace(/\/$/, "");
  const actorUrl = String(actorRole.url || "").replace(/\/$/, "");
  return Boolean(pageUrl && actorUrl && pageUrl === actorUrl);
}

export function evaluateV3Candidate(row, { minimumWidth = 240, minimumHeight = 240 } = {}) {
  if (!row || row.status !== "candidate" || !row.candidate?.src) {
    return { accepted: false, reason: row?.discovery?.failure || "no-v2-candidate", checks: {} };
  }
  if (row.side !== "still") return { accepted: false, reason: "v3-still-only", checks: {} };
  if (isCompositeRequiredSubject(row.expected_subject)) return { accepted: false, reason: "multi-subject-composite-required", checks: {} };

  const aliases = subjectAliases(row);
  const { selected, evidence, text } = selectedMetadata(row);
  const actorRole = evidence.actor_role || null;
  const pageTitle = selected.page_title || row.candidate.source_page_title || "";
  const fileAndDescription = [selected.file, selected.description, selected.categories].filter(Boolean).join(" ");
  const pageSubjectBound = aliases.some((alias) => phraseIn(pageTitle, alias));
  const fileSubjectBound = aliases.some((alias) => phraseIn(fileAndDescription, alias));
  const subjectBound = pageSubjectBound || fileSubjectBound;
  const production = evidence.production || "";
  const productionBound = productionIsBound(production, text, actorRole);
  const selectedActorPage = actorPageSelected(selected, actorRole);
  const forbiddenMatch = text.match(FORBIDDEN_DERIVATIVE)?.[0] || null;
  const width = Number(row.candidate.width || selected.width || 0);
  const height = Number(row.candidate.height || selected.height || 0);
  const dimensionsPass = width >= minimumWidth && height >= minimumHeight;
  const checks = {
    aliases,
    page_subject_bound: pageSubjectBound,
    file_subject_bound: fileSubjectBound,
    explicit_subject_binding: subjectBound,
    explicit_production_binding: productionBound,
    actor_page_selected_for_still: selectedActorPage,
    forbidden_derivative_match: forbiddenMatch,
    width,
    height,
    minimum_width: minimumWidth,
    minimum_height: minimumHeight,
    dimensions_pass: dimensionsPass,
    resolution_repair: dimensionsPass && (width < 500 || height < 400),
  };

  if (!dimensionsPass) return { accepted: false, reason: "below-v3-minimum-dimensions", checks };
  if (selectedActorPage) return { accepted: false, reason: "actor-page-image-for-character-still", checks };
  if (forbiddenMatch) return { accepted: false, reason: "derivative-object-or-namesake-presentation", checks };
  if (!subjectBound) return { accepted: false, reason: "no-explicit-subject-binding", checks };
  if (!productionBound) return { accepted: false, reason: "no-explicit-production-binding", checks };
  return { accepted: true, reason: null, checks };
}

export function applyV3Filter(report, options = {}) {
  const results = [];
  for (const original of report.results || []) {
    const decision = evaluateV3Candidate(original, options);
    const discovery = { ...(original.discovery || {}) };
    discovery.source_policy_version = 3;
    discovery.source_family = "mediawiki-resolution-repair-v3";
    discovery.v3_prescreen = {
      version: 3,
      accepted_for_independent_second_desk: decision.accepted,
      reason: decision.reason,
      checks: decision.checks,
      rejected_candidate: decision.accepted ? null : (discovery.selected_candidate || null),
      canonical_mutation: false,
    };
    discovery.attempts = [...(discovery.attempts || []), {
      stage: "source-policy-v3-precision-summary",
      ok: decision.accepted,
      source_policy_version: 3,
      body_excerpt: `ImageDescription Categories ObjectName SOURCE_POLICY_V3 ${JSON.stringify(discovery.v3_prescreen)}`,
    }];

    if (!decision.accepted) {
      results.push({
        ...original,
        status: "not-found",
        candidate: null,
        candidate_sha256: null,
        discovery: {
          ...discovery,
          failure: `source-policy-v3:${decision.reason}`,
        },
      });
      continue;
    }

    const candidate = {
      ...original.candidate,
      source_policy_version: 3,
      source_method: `${original.candidate.source_method || discovery.selected_candidate?.method || "mediawiki"}+resolution-repair-v3`,
      resolution_repair: decision.checks.resolution_repair,
      original_width: decision.checks.width,
      original_height: decision.checks.height,
    };
    results.push({ ...original, candidate, discovery });
  }

  const counts = Object.fromEntries(["candidate", "unchanged", "not-found"].map((key) => [key, results.filter((row) => row.status === key).length]));
  return {
    ...report,
    version: 3,
    source_policy_version: 3,
    artifact: String(report.artifact || "card-backfill-source").replace(/v2/gi, "v3"),
    counts,
    results,
    canonical_write: false,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback = null) => {
    const index = args.indexOf(name);
    if (index < 0) return fallback;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    return value;
  };
  const reportPath = resolve(option("--report"));
  const outPath = resolve(option("--out", reportPath));
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const filtered = applyV3Filter(report, {
    minimumWidth: Number(option("--minimum-width", "240")),
    minimumHeight: Number(option("--minimum-height", "240")),
  });
  await writeFile(outPath, JSON.stringify(filtered, null, 2) + "\n");
  console.log(`PASS — source policy v3 retained ${filtered.counts.candidate} candidate(s) and quarantined ${filtered.counts["not-found"]} result(s) before second desk`);
  console.log(`OUTPUT — ${outPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`card-backfill source v3 filter: ${error.stack || error.message}`); process.exit(1); });
}
