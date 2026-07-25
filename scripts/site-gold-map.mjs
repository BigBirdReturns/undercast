#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize as normalizePath, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const flag = (name) => args.includes(name);
const root = resolve(option("--root", "."));
const out = option("--out", null);
const markdownOut = option("--markdown", null);
const now = option("--now", new Date().toISOString());

const readText = (path, fallback = null) => {
  const full = join(root, path);
  if (!existsSync(full)) {
    if (fallback !== null) return fallback;
    throw new Error(`missing ${path}`);
  }
  return readFileSync(full, "utf8");
};
const readJson = (path, fallback = null) => JSON.parse(readText(path, fallback === null ? null : JSON.stringify(fallback)));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const norm = (value) => String(value || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, " ").trim().toLowerCase();
const by = (rows, keyFn) => {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
};
const countBy = (rows, keyFn) => Object.fromEntries([...by(rows, keyFn)].map(([key, values]) => [key, values.length]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
const sum = (rows, fn) => rows.reduce((total, row) => total + Number(fn(row) || 0), 0);
const ratio = (a, b) => b ? Number((a / b).toFixed(6)) : 0;
const isHttps = (value) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};
const validHash = (value) => /^[0-9a-f]{64}$/i.test(String(value || ""));
const unknownMaker = (value) => !String(value || "").trim() || /^(?:—|-|unknown|uncredited|not on file|n\/a)$/i.test(String(value).trim());
const activeTask = (job) => ["leased", "drafted", "merged"].includes(job.status);
const resolvedTask = (job) => job.status === "resolved";
const declaredCapabilities = (job) => [...new Set([
  ...(job.required_capabilities || []),
  ...(job.lease?.selection?.required_capabilities || []),
].map(String).filter(Boolean))];
const exactReceipt = (job) => Array.isArray(job.source_receipts)
  && job.source_receipts.length > 0
  && job.source_receipts.every((receipt) => isHttps(receipt.source)
    && Number.isInteger(Number(receipt.revision))
    && validHash(receipt.content_sha256));
const baselineQueueable = (job) => job.status === "queued"
  && job.queueable !== false
  && exactReceipt(job)
  && (job.sources || []).some(isHttps)
  && declaredCapabilities(job).length === 0;

const specimens = readJson("data/specimens.json", []);
const sources = readJson("data/SOURCES.json", []);
const media = readJson("data/MEDIA-AUDIT.json", { items: [] });
const mediaSearchJournal = readText("data/journal/media-search.jsonl", "").split(/\r?\n/).filter(Boolean);
const censusSummary = readJson("data/CENSUS-SUMMARY.json", { groups: [] });
const coverage = readJson("data/CENSUS-COVERAGE.json", []);
const unresolved = readJson("data/CENSUS-UNRESOLVED.json", []);
const autopilot = readJson("data/AUTOPILOT.json", { jobs: [] });
const registry = readJson("data/ESTATE-REGISTRY.json", { estates: [] });
const collectionMode = readJson("data/COLLECTION-MODE.json", {});
const species = readJson("data/species.json", { taxa: [] });
const quality = readJson("data/quality.json", {});
const archive = readJson("data/archive.json", {});
const roadmap = readJson("data/ROADMAP.json", { milestones: [] });
const waterline = readJson("data/WATERLINE-STATE.json", { cycles: [], accounting: [] });
const exclusions = readJson("data/CENSUS-EXCLUSIONS.json", { records: [] });

const sourceById = new Map(sources.map((row) => [row.id, row]));
const mediaByWall = by(media.items || [], (item) => item.wall_id);
const recordsByUniverse = by(specimens, (row) => row.universe || "Unfiled");
const catalogUniverses = [...recordsByUniverse.entries()].map(([universe, records]) => {
  const completePair = records.filter((row) => row.still && row.portrait).length;
  const missingStill = records.filter((row) => !row.still).length;
  const missingPortrait = records.filter((row) => !row.portrait).length;
  const missingBoth = records.filter((row) => !row.still && !row.portrait).length;
  const makers = records.filter((row) => !unknownMaker(row.designer)).length;
  const claimEvidence = records.filter((row) => (row.references || []).length
    || (row.performances || []).some((performance) => (performance.references || []).length)).length;
  const audited = records.flatMap((row) => mediaByWall.get(row.id) || []);
  return {
    universe,
    records: records.length,
    face_records: records.filter((row) => row.kind !== "voice").length,
    voice_records: records.filter((row) => row.kind === "voice").length,
    complete_pairs: completePair,
    complete_pair_ratio: ratio(completePair, records.length),
    missing_still: missingStill,
    missing_portrait: missingPortrait,
    missing_both: missingBoth,
    known_makers: makers,
    known_maker_ratio: ratio(makers, records.length),
    claim_evidence: claimEvidence,
    claim_evidence_ratio: ratio(claimEvidence, records.length),
    media_status: countBy(audited, (item) => item.status),
  };
}).sort((a, b) => b.records - a.records || a.universe.localeCompare(b.universe));

const censusFranchises = [...by(censusSummary.groups || [], (group) => group.franchise).entries()].map(([franchise, groups]) => ({
  franchise,
  categories: groups.length,
  credits: sum(groups, (row) => row.credits),
  covered_roles: sum(groups, (row) => row.covered_roles),
  missing_roles: sum(groups, (row) => row.missing_roles),
  unresolved_characters: sum(groups, (row) => row.unresolved_characters),
  coverage_ratio: ratio(sum(groups, (row) => row.covered_roles), sum(groups, (row) => row.credits)),
  source_origins: [...new Set(groups.flatMap((row) => row.source_origins || []))].sort(),
  top_missing_categories: groups.filter((row) => row.missing_roles > 0)
    .sort((a, b) => b.missing_roles - a.missing_roles || a.category.localeCompare(b.category))
    .slice(0, 25)
    .map((row) => ({
      category: row.category,
      credits: row.credits,
      covered_roles: row.covered_roles,
      missing_roles: row.missing_roles,
      unresolved_characters: row.unresolved_characters,
      performance_modes: row.performance_modes,
    })),
})).sort((a, b) => b.missing_roles - a.missing_roles || a.franchise.localeCompare(b.franchise));

const jobs = autopilot.jobs || [];
const jobScopes = [...by(jobs, (job) => job.scope || "unscoped").entries()].map(([scope, rows]) => ({
  scope,
  total: rows.length,
  statuses: countBy(rows, (job) => job.status),
  active: rows.filter(activeTask).length,
  resolved: rows.filter(resolvedTask).length,
  exact_source_bound: rows.filter(exactReceipt).length,
  baseline_queueable: rows.filter(baselineQueueable).length,
  declared_capability_blocked: rows.filter((job) => job.status === "queued" && declaredCapabilities(job).length > 0).length,
  source_receipt_missing: rows.filter((job) => job.status === "queued" && !exactReceipt(job)).length,
})).sort((a, b) => b.baseline_queueable - a.baseline_queueable || b.total - a.total || a.scope.localeCompare(b.scope));

const categoryRows = new Map();
for (const job of jobs) {
  const categories = job.categories?.length ? job.categories : ["Uncategorized"];
  for (const category of categories) {
    const key = `${job.scope || "unscoped"}|${category}`;
    if (!categoryRows.has(key)) categoryRows.set(key, {
      scope: job.scope || "unscoped",
      category,
      total: 0,
      resolved: 0,
      queued: 0,
      active: 0,
      blocked: 0,
      rejected: 0,
      baseline_queueable: 0,
      source_receipt_missing: 0,
      physical: 0,
      voice: 0,
      unresolved_mode: 0,
    });
    const row = categoryRows.get(key);
    row.total++;
    if (job.status === "resolved") row.resolved++;
    if (job.status === "queued") row.queued++;
    if (activeTask(job)) row.active++;
    if (job.status === "blocked") row.blocked++;
    if (["rejected", "retired"].includes(job.status)) row.rejected++;
    if (baselineQueueable(job)) row.baseline_queueable++;
    if (job.status === "queued" && !exactReceipt(job)) row.source_receipt_missing++;
    const modes = job.performance_modes || [];
    if (modes.some((mode) => mode.startsWith("physical-"))) row.physical++;
    if (modes.some((mode) => mode.startsWith("voice"))) row.voice++;
    if (!modes.length || modes.includes("unresolved")) row.unresolved_mode++;
  }
}
const autopilotCategories = [...categoryRows.values()].sort((a, b) => b.baseline_queueable - a.baseline_queueable || b.queued - a.queued || a.scope.localeCompare(b.scope) || a.category.localeCompare(b.category));

const mediaPlanRun = spawnSync(process.execPath, ["scripts/media-search-plan.mjs", "--limit", "100000", "--now", now], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
});
let mediaPlan = { version: 1, generated_at: now, candidates: [], error: null };
if (mediaPlanRun.status === 0) {
  try { mediaPlan = JSON.parse(mediaPlanRun.stdout); }
  catch (error) { mediaPlan.error = `cannot parse media plan: ${error.message}`; }
} else mediaPlan.error = (mediaPlanRun.stderr || mediaPlanRun.stdout || `exit ${mediaPlanRun.status}`).trim();

const specimenById = new Map(specimens.map((row) => [row.id, row]));
const mediaCandidates = mediaPlan.candidates || [];
const mediaCandidatesByUniverse = [...by(mediaCandidates, (candidate) => specimenById.get(candidate.wall_id)?.universe || "Unfiled").entries()]
  .map(([universe, rows]) => ({ universe, candidates: rows.length, sides: countBy(rows, (row) => row.side || "unknown"), reasons: countBy(rows, (row) => row.reason || row.retry_reason || "due") }))
  .sort((a, b) => b.candidates - a.candidates || a.universe.localeCompare(b.universe));

const speciesSummary = (species.taxa || []).map((taxon) => ({
  key: taxon.key,
  label: taxon.label,
  franchise: taxon.franchise,
  named_credits: taxon.counts?.named_credits || 0,
  physical_credits: taxon.counts?.physical_credits || 0,
  voice_credits: taxon.counts?.voice_credits || 0,
  filed_role_credits: taxon.counts?.filed_role_credits || 0,
  primary_card_records: taxon.counts?.primary_card_records || 0,
  unfiled_named_credits: taxon.counts?.unfiled_named_credits || 0,
  unresolved_characters: taxon.counts?.unresolved_characters || 0,
})).sort((a, b) => b.unfiled_named_credits - a.unfiled_named_credits || b.named_credits - a.named_credits || a.label.localeCompare(b.label));

const htmlFiles = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if ([".git", "node_modules", "build", "preservation"].includes(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (extname(name).toLowerCase() === ".html") htmlFiles.push(full);
  }
}
walk(root);
const internalLinks = [];
const linkErrors = [];
const pageRows = [];
const hrefPattern = /\bhref\s*=\s*["']([^"']+)["']/gi;
for (const full of htmlFiles) {
  const rel = relative(root, full).replaceAll("\\", "/");
  const text = readFileSync(full, "utf8");
  const links = [];
  for (const match of text.matchAll(hrefPattern)) {
    const href = match[1];
    if (!href || /^(?:https?:|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    links.push(href);
    const noHash = href.split("#")[0].split("?")[0];
    if (!noHash) continue;
    const target = normalizePath(resolve(dirname(full), noHash));
    let exists = existsSync(target);
    if (exists && statSync(target).isDirectory()) exists = existsSync(join(target, "index.html"));
    if (!exists) linkErrors.push({ page: rel, href });
    internalLinks.push({ page: rel, href });
  }
  pageRows.push({
    path: rel,
    kind: rel.startsWith("records/") ? "record" : "surface",
    internal_links: links.length,
    archive_map: /class=["'][^"']*archive-map/.test(text),
    shared_tokens: /site-tokens\.css/.test(text),
    shared_shell: /site-shell\.css/.test(text),
    theme_control: /uc-theme|theme-toggle|data-theme/.test(text),
  });
}
const rootSurfaces = pageRows.filter((row) => row.kind === "surface" && !row.path.includes("/")).sort((a, b) => a.path.localeCompare(b.path));
const recordPages = pageRows.filter((row) => row.kind === "record");
const sitemapText = readText("sitemap.xml", "");
const sitemapUrls = [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

const estateRows = registry.estates.map((estate) => {
  const scope = estate.autopilot_scope;
  const scopeJobs = scope ? jobs.filter((job) => job.scope === scope) : [];
  const scopeMedia = scope ? (media.items || []).filter((item) => item.scope === scope) : [];
  const census = censusFranchises.find((row) => norm(row.franchise) === norm(estate.label)) || null;
  const wall = catalogUniverses.find((row) => norm(row.universe) === norm(estate.wall_shelf)) || null;
  return {
    id: estate.id,
    label: estate.label,
    priority: estate.priority,
    state: estate.state,
    autopilot_scope: scope,
    wall_shelf: estate.wall_shelf,
    next_gate: estate.next_gate,
    jobs: scope ? {
      total: scopeJobs.length,
      statuses: countBy(scopeJobs, (job) => job.status),
      baseline_queueable: scopeJobs.filter(baselineQueueable).length,
      active: scopeJobs.filter(activeTask).length,
    } : null,
    media: scope ? {
      total: scopeMedia.length,
      statuses: countBy(scopeMedia, (item) => item.status),
    } : null,
    census,
    wall,
  };
}).sort((a, b) => b.priority - a.priority);

const activeEstate = estateRows.find((row) => ["active-corpus", "gold-reference"].includes(row.state)) || null;
const activeScope = activeEstate?.autopilot_scope || null;
const activeScopeJobs = activeScope ? jobs.filter((job) => job.scope === activeScope) : [];
const activeScopeMedia = activeScope ? (media.items || []).filter((item) => item.scope === activeScope) : [];
const activeScopeBaselineQueue = activeScopeJobs.filter(baselineQueueable)
  .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || a.id.localeCompare(b.id));

const cycleRows = (waterline.cycles || []).filter((row) => !activeScope || row.scope_id === activeScope);
const accountingRows = (waterline.accounting || []).filter((row) => !activeScope || row.scope_id === activeScope);
const goldMilestone = roadmap.milestones?.find((row) => row.id === "star-trek-gold-shard") || null;

const goldGates = {
  map_compiled: true,
  canonical_gate_baseline_known: true,
  root_surface_contract: rootSurfaces.length >= 5 && rootSurfaces.every((row) => row.archive_map && row.shared_tokens && row.shared_shell),
  internal_links_resolve: linkErrors.length === 0,
  permanent_routes_match_catalog: recordPages.length >= specimens.length && sitemapUrls.length >= specimens.length,
  active_scope_no_work_in_flight: activeScopeJobs.filter(activeTask).length === 0,
  active_scope_media_debt_zero: activeScopeMedia.every((item) => ["verified", "absent"].includes(item.status)),
  active_scope_exact_task_accounting_present: accountingRows.length > 0,
  active_scope_baseline_queue_drained: activeScopeBaselineQueue.length === 0,
  due_media_search_drained: mediaCandidates.length === 0,
  site_complete_pair_ratio_gte_90pct: (quality.metrics?.complete_pair_ratio || 0) >= 0.9,
  site_known_maker_ratio_gte_90pct: (quality.metrics?.known_maker_ratio || 0) >= 0.9,
  site_claim_evidence_ratio_gte_90pct: (quality.metrics?.claim_evidence_ratio || 0) >= 0.9,
};

const goldLanes = [
  {
    id: "active-estate-population",
    order: 1,
    estate: activeEstate?.id || null,
    open_units: activeScopeBaselineQueue.length,
    unit: "queueable exact source-bound task requiring no declared capability",
    top_categories: autopilotCategories.filter((row) => row.scope === activeScope && row.baseline_queueable > 0).slice(0, 40),
  },
  {
    id: "active-estate-media-enrichment",
    order: 2,
    estate: activeEstate?.id || null,
    open_units: mediaCandidates.filter((candidate) => specimenById.get(candidate.wall_id)?.universe === activeEstate?.wall_shelf).length,
    unit: "due candidate-only media search facet",
  },
  {
    id: "site-wide-media-enrichment",
    order: 3,
    estate: null,
    open_units: mediaCandidates.length,
    unit: "due candidate-only media search facet",
    by_universe: mediaCandidatesByUniverse,
  },
  {
    id: "site-wide-maker-evidence",
    order: 4,
    estate: null,
    open_units: specimens.filter((row) => unknownMaker(row.designer) || !((row.references || []).length || (row.performances || []).some((performance) => (performance.references || []).length))).length,
    unit: "record missing maker and/or claim evidence",
    by_universe: catalogUniverses.map((row) => ({ universe: row.universe, missing_maker: row.records - row.known_makers, missing_claim_evidence: row.records - row.claim_evidence })),
  },
  {
    id: "estate-adapter-advancement",
    order: 5,
    estate: null,
    open_units: estateRows.filter((row) => !["gold-reference", "retired"].includes(row.state)).length,
    unit: "registered estate not yet gold-reference",
    estates: estateRows.map((row) => ({ id: row.id, state: row.state, next_gate: row.next_gate })),
  },
];

const report = {
  version: 1,
  generated_at: now,
  generated_from: {
    specimens_sha256: sha256(readText("data/specimens.json")),
    sources_sha256: sha256(readText("data/SOURCES.json")),
    media_audit_sha256: sha256(readText("data/MEDIA-AUDIT.json")),
    census_summary_sha256: sha256(readText("data/CENSUS-SUMMARY.json")),
    autopilot_sha256: sha256(readText("data/AUTOPILOT.json")),
    estate_registry_sha256: sha256(readText("data/ESTATE-REGISTRY.json")),
  },
  semantics: {
    map: "A whole-site inventory of visible records, source-scoped census observations, exact durable tasks, media search obligations, public routes and registered estates.",
    baseline_queueable: "A queued task with exact retained source revisions, at least one HTTPS source, queueable state and no declared capability requirement. This is a processing lane, not an inferred final eligibility ruling.",
    gold: "No silent surfaces or tasks; active-estate exact work is drained or explicitly dispositioned; every absence is searched on schedule; maker and claim evidence are visible; permanent routes and public navigation remain correct.",
  },
  collection_mode: {
    mode: collectionMode.mode,
    product_contract: collectionMode.product_contract,
    growth: collectionMode.growth,
    rolling_media_search: collectionMode.rolling_media_search,
  },
  archive: {
    records: specimens.length,
    source_rows: sources.length,
    archive_record_count: archive.canonical?.records?.count || null,
    quality: quality.metrics || null,
    universes: catalogUniverses,
  },
  public_map: {
    html_pages: pageRows.length,
    root_surfaces: rootSurfaces,
    permanent_record_pages: recordPages.length,
    sitemap_urls: sitemapUrls.length,
    internal_links: internalLinks.length,
    broken_internal_links: linkErrors,
  },
  species: {
    taxa: speciesSummary.length,
    rows: speciesSummary,
  },
  census: {
    coverage_rows: coverage.length,
    unresolved_rows: unresolved.length,
    exclusions: Array.isArray(exclusions) ? exclusions.length : (exclusions.records || []).length,
    franchises: censusFranchises,
  },
  autopilot: {
    jobs: jobs.length,
    scopes: jobScopes,
    categories: autopilotCategories,
    active_scope: activeScope,
    active_scope_baseline_queue_count: activeScopeBaselineQueue.length,
    active_scope_baseline_queue_preview: activeScopeBaselineQueue.slice(0, 100).map((job) => ({
      id: job.id,
      performer: job.performer,
      character: job.character,
      categories: job.categories,
      performance_modes: job.performance_modes,
      priority: job.priority,
      sources: job.sources,
      source_fingerprint: job.source_fingerprint,
    })),
  },
  media_search: {
    journal_rows: mediaSearchJournal.length,
    due_candidates: mediaCandidates.length,
    error: mediaPlan.error || null,
    by_universe: mediaCandidatesByUniverse,
    candidates: mediaCandidates,
  },
  estates: estateRows,
  active_estate: {
    id: activeEstate?.id || null,
    label: activeEstate?.label || null,
    scope: activeScope,
    records: activeEstate?.wall?.records || 0,
    task_statuses: countBy(activeScopeJobs, (job) => job.status),
    baseline_queueable: activeScopeBaselineQueue.length,
    media_statuses: countBy(activeScopeMedia, (item) => item.status),
    reviewed_cycles: cycleRows.length,
    accounting_receipts: accountingRows.length,
    roadmap_milestone: goldMilestone,
  },
  gold_gates: goldGates,
  gold_lanes: goldLanes,
};

const markdown = `# UNDERCAST whole-site gold map\n\nGenerated ${now}.\n\n## Current archive\n\n- ${specimens.length.toLocaleString()} canonical records\n- ${(quality.metrics?.complete_pair_ratio * 100 || 0).toFixed(1)}% complete image pairs\n- ${(quality.metrics?.known_maker_ratio * 100 || 0).toFixed(1)}% known makers\n- ${(quality.metrics?.claim_evidence_ratio * 100 || 0).toFixed(1)}% claim-level evidence\n- ${mediaCandidates.length.toLocaleString()} media facets due for candidate search\n- ${activeScopeBaselineQueue.length.toLocaleString()} baseline queueable exact tasks in ${activeScope || "the active scope"}\n\n## Gold gates\n\n${Object.entries(goldGates).map(([key, value]) => `- ${value ? "PASS" : "OPEN"} — ${key}`).join("\n")}\n\n## Operating lanes\n\n${goldLanes.map((lane) => `1. **${lane.id}** — ${lane.open_units.toLocaleString()} ${lane.unit}`).join("\n")}\n\n## Estate waterline\n\n${estateRows.map((estate) => `- **${estate.label}** — ${estate.state}; ${estate.next_gate}`).join("\n")}\n`;

if (out) {
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`wrote ${out}`);
} else console.log(JSON.stringify(report, null, 2));
if (markdownOut) {
  writeFileSync(markdownOut, markdown);
  console.log(`wrote ${markdownOut}`);
}

if (flag("--gate") && Object.values(goldGates).some((value) => !value)) process.exitCode = 2;
