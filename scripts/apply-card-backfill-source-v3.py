#!/usr/bin/env python3
from pathlib import Path


def replace_exact(path, old, new, count=1):
    target = Path(path)
    text = target.read_text()
    observed = text.count(old)
    if observed != count:
        raise SystemExit(f"{path}: expected {count} exact occurrence(s), observed {observed}: {old[:100]!r}")
    target.write_text(text.replace(old, new, count))


policy = Path("scripts/lib/card-backfill-source-policy-v2.mjs")
text = policy.read_text()
replacements = {
    "  version: 2,": "  version: 3,",
    '  still_route: "mediawiki-multicandidate-v2",': '  still_route: "mediawiki-bound-multicandidate-v3",',
    '  portrait_route: "commons-multicandidate-v2",': '  portrait_route: "commons-bound-multicandidate-v3",',
    "  actor_role_extract_required_when_available: true,": "  actor_role_extract_required_when_available: true,\n  predownload_textual_binding_gate: true,\n  wrong_adaptation_and_non_depiction_filter: true,\n  multi_subjects_require_composite_lane: true,",
}
for old, new in replacements.items():
    if text.count(old) != 1:
        raise SystemExit(f"{policy}: patch denominator drift for {old!r}")
    text = text.replace(old, new, 1)
text = text.replace("source-policy-v2-already-attempted", "source-policy-v3-already-attempted")
text = text.replace("card-backfill-source-policy-v2-estate", "card-backfill-source-policy-v3-estate")
policy.write_text(text)

replace_exact(
    "scripts/card-backfill-source-policy-v2-fixtures.mjs",
    'source_policy_version: 2, final_disposition: "quarantine"',
    'source_policy_version: CARD_BACKFILL_SOURCE_POLICY_V2.version, final_disposition: "quarantine"',
)

planner = Path("scripts/card-backfill-source-v2-plan.mjs")
text = planner.read_text()
text = text.replace("source-policy-v2", "source-policy-v3")
text = text.replace("source_policy_version: 2", "source_policy_version: CARD_BACKFILL_SOURCE_POLICY_V2.version")
text = text.replace("source_policy_v2_ready=", "source_policy_v3_ready=")
text = text.replace("source_policy_v2_cohorts=", "source_policy_v3_cohorts=")
text = text.replace("source policy v2 admits", "source policy v3 admits")
text = text.replace("source-v2 plan:", "source-v3 plan:")
planner.write_text(text)

source = Path("scripts/card-backfill-source-v2.mjs")
text = source.read_text()
import_old = 'import { buildRepositoryHashIndex, inspectImage } from "./lib/card-backfill-packet.mjs";'
import_new = import_old + '\nimport { CARD_BACKFILL_SOURCE_POLICY_V2 } from "./lib/card-backfill-source-policy-v2.mjs";\nimport { rankBoundCandidates, sourceSubjectAliases } from "./lib/card-backfill-source-policy-v3.mjs";'
if text.count(import_old) != 1:
    raise SystemExit("source v2 import seam drift")
text = text.replace(import_old, import_new, 1)

aliases_old = '''function subjectAliases(value) {
  const raw = String(value || "").trim();
  const parts = raw.split(/\\s*(?:\\/|&|,|;|\\band\\b)\\s*/i).map((part) => part.trim()).filter((part) => part.length >= 2);
  return [...new Set([raw, ...parts].filter(Boolean))].slice(0, 8);
}'''
aliases_new = '''function subjectAliases(value) {
  return sourceSubjectAliases(value);
}'''
if text.count(aliases_old) != 1:
    raise SystemExit("source v2 subjectAliases seam drift")
text = text.replace(aliases_old, aliases_new, 1)

still_return_old = '  return { aliases, production, pages: [...pages.values()].map(({ api, page }) => ({ api, title: page.title, url: pageUrl(api, page) })), candidates: [...candidates.values()].sort((a, b) => b.score - a.score) };'
still_return_new = '''  const ranked = rankBoundCandidates([...candidates.values()], {
    side: "still",
    expectedSubject: item.expected_subject || record.character,
    actor: record.actor,
    production,
    performanceMode: item.shape?.performance_mode || item.cohort_key?.split("::")[1],
    actorEvidence,
  });
  return { aliases, production, pages: [...pages.values()].map(({ api, page }) => ({ api, title: page.title, url: pageUrl(api, page) })), candidates: ranked };'''
if text.count(still_return_old) != 1:
    raise SystemExit("source v2 still return seam drift")
text = text.replace(still_return_old, still_return_new, 1)

portrait_return_old = '  return { aliases, production, pages: pages.map(({ api, page }) => ({ api, title: page.title, url: pageUrl(api, page) })), candidates: [...candidates.values()].sort((a, b) => b.score - a.score) };'
portrait_return_new = '''  const ranked = rankBoundCandidates([...candidates.values()], {
    side: "portrait",
    expectedSubject: expected,
    actor: record.actor,
    production,
    performanceMode: item.shape?.performance_mode || item.cohort_key?.split("::")[1],
    actorEvidence: null,
  });
  return { aliases, production, pages: pages.map(({ api, page }) => ({ api, title: page.title, url: pageUrl(api, page) })), candidates: ranked };'''
if text.count(portrait_return_old) != 1:
    raise SystemExit("source v2 portrait return seam drift")
text = text.replace(portrait_return_old, portrait_return_new, 1)

loop_old = '''  for (const [index, candidate] of pool.candidates.slice(0, limits.downloadCandidateLimit * 3).entries()) {
    if (screened.length >= limits.downloadCandidateLimit) break;
    try {'''
loop_new = '''  for (const [index, candidate] of pool.candidates.slice(0, limits.downloadCandidateLimit * 3).entries()) {
    if (screened.length >= limits.downloadCandidateLimit) break;
    if (candidate.binding?.eligible === false) {
      screened.push({
        ...candidate,
        temp: null,
        extension: null,
        image: { width: candidate.source?.width || 0, height: candidate.source?.height || 0 },
        sha256: null,
        bytes: 0,
        duplicate_matches: [],
        prescreen_reason: `source-binding:${candidate.binding.reasons.join("+")}`,
        resolved_url: null,
      });
      continue;
    }
    try {'''
if text.count(loop_old) != 1:
    raise SystemExit("source v2 download loop seam drift")
text = text.replace(loop_old, loop_new, 1)

evidence_old = '''    prescreened: screened.map((row) => ({
      file: row.file,
      page_title: row.page.title,
      page_url: row.page.url,
      source_origin: row.source.origin,
      method: row.method,
      score: row.score,
      width: row.image.width,
      height: row.image.height,
      sha256: row.sha256,
      duplicate_matches: row.duplicate_matches,
      prescreen_reason: row.prescreen_reason,
      description: row.source.description,
      categories: row.source.categories,
      page_extract_windows: row.page.extract_windows,
    })),
  };'''
evidence_new = '''    binding: selected?.binding || null,
    prescreened: screened.map((row) => ({
      file: row.file,
      page_title: row.page.title,
      page_url: row.page.url,
      source_origin: row.source.origin,
      method: row.method,
      score: row.score,
      width: row.image?.width || row.source?.width || 0,
      height: row.image?.height || row.source?.height || 0,
      sha256: row.sha256,
      duplicate_matches: row.duplicate_matches,
      prescreen_reason: row.prescreen_reason,
      binding: row.binding || null,
      description: row.source.description,
      categories: row.source.categories,
      page_extract_windows: row.page.extract_windows,
    })),
  };'''
if text.count(evidence_old) != 1:
    raise SystemExit("source v2 evidence seam drift")
text = text.replace(evidence_old, evidence_new, 1)

selected_old = "description: selected.source.description, categories: selected.source.categories, page_extract_windows: selected.page.extract_windows }, candidate_pool_count:"
selected_new = "binding: selected.binding || null, description: selected.source.description, categories: selected.source.categories, page_extract_windows: selected.page.extract_windows }, candidate_pool_count:"
if text.count(selected_old) != 1:
    raise SystemExit("source v2 selected candidate seam drift")
text = text.replace(selected_old, selected_new, 1)

text = text.replace("version: 2,", "version: CARD_BACKFILL_SOURCE_POLICY_V2.version,")
text = text.replace("source_policy_version: 2", "source_policy_version: CARD_BACKFILL_SOURCE_POLICY_V2.version")
text = text.replace("commons-multicandidate-v2", "commons-bound-multicandidate-v3")
text = text.replace("mediawiki-multicandidate-v2", "mediawiki-bound-multicandidate-v3")
text = text.replace("mediawiki-page-candidate-v2", "mediawiki-page-candidate-v3")
text = text.replace("mediawiki-pageimage-v2", "mediawiki-pageimage-v3")
text = text.replace("exact-actor-page-image-v2", "exact-actor-page-image-v3")
text = text.replace("exact-actor-pageimage-v2", "exact-actor-pageimage-v3")
text = text.replace("commons-name-search-v2", "commons-name-search-v3")
text = text.replace("undercast-card-backfill-source-v2/2.0", "undercast-card-backfill-source-v3/3.0")
text = text.replace("source policy v2 produced", "source policy v3 produced")
text = text.replace("card-backfill source v2:", "card-backfill source v3:")
source.write_text(text)

enrich = Path("scripts/card-backfill-source-v2-enrich-report.mjs")
text = enrich.read_text()
old = "      selected_candidate: selected,\n      actor_role: evidence.actor_role || null,"
new = "      selected_candidate: selected,\n      binding: evidence.binding || selected?.binding || null,\n      actor_role: evidence.actor_role || null,"
if text.count(old) != 1:
    raise SystemExit("source v2 enrichment seam drift")
enrich.write_text(text.replace(old, new, 1))

adjudicator = Path("scripts/card-backfill-machine-adjudicate.mjs")
text = adjudicator.read_text()
old = '''    "1. Do not identify a person or character from appearance. Identity may be `expected` only when the textual source custody explicitly binds the selected file to the filed subject. Appearance is never identity evidence.",
    "2. Use the supplied image only to judge presentation and suitability for the filed facet.",'''
new = '''    "1. Do not identify a person or character from appearance. Identity may be `expected` only when the textual source custody explicitly binds the selected file to the filed subject. Appearance is never identity evidence.",
    "2. For a role image, an explicit textual chain may consist of actor-role evidence naming the actor and character plus an exact character page naming the filed production and carrying the selected file. This is valid source custody even though the actor is not visible in the role image.",
    "3. Use the supplied image only to judge presentation and suitability for the filed facet.",'''
if text.count(old) != 1:
    raise SystemExit("machine adjudicator prompt seam drift")
text = text.replace(old, new, 1)
text = text.replace('    "3. For a portrait,', '    "4. For a portrait,', 1)
text = text.replace('    "4. For a still,', '    "5. For a still,', 1)
text = text.replace('    "5. Ambiguity,', '    "6. Ambiguity,', 1)
text = text.replace('    "6. Be conservative.', '    "7. Be conservative.', 1)
adjudicator.write_text(text)

print("PASS — exact source-policy-v3 semantic patch applied")
