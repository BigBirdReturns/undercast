#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { isCompositeRequiredSubject } from "./lib/card-backfill-source-policy-v3.mjs";

const STOPWORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "the", "to", "with"]);
const FORBIDDEN_DERIVATIVE = /\b(?:street\s+sign|road\s+sign|building|facade|theme\s+park|attraction|statue|sculpture|toy|action\s+figure|figurine|plush|cosplay|cosplayer|costume\s+(?:display|exhibit|replica)|mascot|logo|poster|book\s+cover|album\s+cover|dvd\s+cover|cover\s+art|comic(?:\s+book)?|mural|graffiti|tattoo|license\s+plate|wax\s+figure|fan\s+art|concept\s+art|promotional\s+art|character\s+art|lithograph|illustration|painting|merchandise)\b/i;
const HUMAN_EVENT_PHOTO = /\b(?:voice\s+actor|actor|actress|director|filmmaker|composer|producer|fan\s+expo|comic[- ]?con|red\s+carpet|publicity\s+photo|portrait\s+of|headshot|panel\s+discussion|men\s+with\s+microphones|women\s+with\s+microphones|personality\s+rights|at\s+(?:an?\s+)?(?:expo|convention|festival|premiere|panel|show))\b/i;

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function phraseIn(text, phrase) {
  const hay = ` ${normalize(text)} `;
  const needle = ` ${normalize(phrase)} `;
  return needle.trim().length > 1 && hay.includes(needle);
}

function productionTokens(value) {
  const raw = String(value || "").match(/[A-Za-z0-9]+/g) || [];
  const retained = raw.filter((token) => {
    const lower = token.toLowerCase();
    if (STOPWORDS.has(lower)) return false;
    return token.length >= 3 || /^[A-Z0-9]{1,3}$/.test(token);
  }).map(normalize).filter(Boolean);
  return [...new Set(retained)];
}

function subjectAliases(row) {
  const evidenceAliases = row?.discovery?.source_evidence?.expected_subject_aliases || [];
  const expected = String(row?.expected_subject || "")
    .replace(/\((?:voice|the voice|voice role|vocal performance|uncredited)[^)]*\)/gi, " ")
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
  const fileText = [selected.file, selected.description, selected.categories].filter(Boolean).join(" ");
  const bindingText = [selected.page_title, fileText].filter(Boolean).join(" ");
  const contextText = [bindingText, ...windows].filter(Boolean).join(" ");
  return { selected, evidence, fileText, bindingText, contextText };
}

function productionIsBound(production, bindingText) {
  if (!production) return false;
  if (phraseIn(bindingText, production)) return true;
  const tokens = productionTokens(production);
  if (!tokens.length) return false;
  const normalized = ` ${normalize(bindingText)} `;
  return tokens.every((token) => normalized.includes(` ${token} `));
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
  const { selected, evidence, fileText, bindingText, contextText } = selectedMetadata(row);
  const actorRole = evidence.actor_role || null;
  const pageTitle = selected.page_title || row.candidate.source_page_title || "";
  const pageSubjectBound = aliases.some((alias) => phraseIn(pageTitle, alias));
  const fileSubjectBound = aliases.some((alias) => phraseIn(fileText, alias));
  const actorNameInFile = Boolean(actorRole?.title && phraseIn(fileText, actorRole.title));
  const humanPresentationMatch = fileText.match(HUMAN_EVENT_PHOTO)?.[0] || (actorNameInFile ? actorRole.title : null);
  const subjectBound = fileSubjectBound || (pageSubjectBound && !humanPresentationMatch);
  const production = evidence.production || "";
  const productionBound = productionIsBound(production, bindingText);
  const selectedActorPage = actorPageSelected(selected, actorRole);
  const forbiddenMatch = contextText.match(FORBIDDEN_DERIVATIVE)?.[0] || null;
  const width = Number(row.candidate.width || selected.width || 0);
  const height = Number(row.candidate.height || selected.height || 0);
  const dimensionsPass = width >= minimumWidth && height >= minimumHeight;
  const checks = {
    aliases,
    page_subject_bound: pageSubjectBound,
    file_subject_bound: fileSubjectBound,
    explicit_subject_binding: subjectBound,
    production_tokens_required: productionTokens(production),
    explicit_production_binding: productionBound,
    actor_page_selected_for_still: selectedActorPage,
    actor_name_in_file_metadata: actorNameInFile,
    human_event_photo_match: humanPresentationMatch,
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
  if (humanPresentationMatch) return { accepted: false, reason: "human-event-photo-for-character-still", checks };
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
