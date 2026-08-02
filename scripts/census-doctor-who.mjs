#!/usr/bin/env node
/**
 * Source-specific Doctor Who census producer.
 *
 * Tardis Wiki stores exact actor and voice-actor names as plain text in
 * individual infoboxes. The generic link-only producer correctly refused those
 * values, but therefore retained the complete Doctor Who slice as unresolved.
 * This adapter reads only a closed performer-field set, requires exact target
 * identity from species fields or an exact target-bearing title, and preserves
 * every other page as out-of-scope or unresolved.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  DOCTOR_WHO_CATEGORIES,
  extractDoctorWhoPage,
  validateDoctorWhoObservation,
} from "./lib/census-doctor-who.mjs";

const API = "https://tardis.fandom.com/api.php";
const FRANCHISE = "Doctor Who";
const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "doctor-who-census"})`;
const args = process.argv.slice(2);
const option = (name, fallback = null) => {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
};
const sourceBag = option("--source-bag");
const reportPath = option("--report", "data/review/adapter-sdk/doctor-who-semantic-001.json");
const capturedAt = new Date().toISOString();
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fileDigest = async (file) => digest(await readFile(file));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequest = 0;

async function mw(params) {
  const delay = Math.max(0, 600 - (Date.now() - lastRequest));
  if (delay) await sleep(delay);
  lastRequest = Date.now();
  const url = `${API}?${new URLSearchParams({ format: "json", origin: "*", ...params })}`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`${API} ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 1_000);
    }
  }
  throw new Error(`Doctor Who source unavailable after 3 attempts: ${url}\n${lastError}`);
}

async function categoryMembers(category, depth = 0) {
  const pages = [];
  let continuation = {};
  do {
    const response = await mw({
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmlimit: "500",
      ...continuation,
    });
    for (const member of response?.query?.categorymembers || []) {
      if (member.ns === 0) pages.push(member.title);
      else if (member.ns === 14 && depth === 0) {
        pages.push(...await categoryMembers(member.title.replace(/^Category:/, ""), 1));
      }
    }
    continuation = response?.continue || null;
  } while (continuation);
  return pages;
}

function sourceUrl(title) {
  return API.replace(/api\.php$/, `wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`);
}

async function networkObservations() {
  const observations = [];
  for (const category of DOCTOR_WHO_CATEGORIES) {
    const titles = [...new Set(await categoryMembers(category))];
    if (!titles.length) throw new Error(`Doctor Who category ${category} returned no pages; refusing a false zero`);
    for (let index = 0; index < titles.length; index += 20) {
      const response = await mw({
        action: "query",
        prop: "revisions",
        rvprop: "ids|timestamp|content",
        rvslots: "main",
        titles: titles.slice(index, index + 20).join("|"),
      });
      for (const page of Object.values(response?.query?.pages || {})) {
        const revision = page?.revisions?.[0] || {};
        const wikitext = revision?.slots?.main?.["*"] || "";
        if (!Number.isInteger(page?.pageid) || !Number.isInteger(revision?.revid) || !revision?.timestamp) {
          throw new Error(`${category} page ${page?.title || "unknown"} lacks exact revision identity`);
        }
        observations.push({
          category,
          title: page.title,
          source: sourceUrl(page.title),
          observed_at: capturedAt,
          pageid: page.pageid,
          revision: revision.revid,
          timestamp: revision.timestamp,
          content_sha256: digest(wikitext),
          wikitext,
        });
      }
    }
    console.log(`Doctor Who ${category}: ${titles.length} source pages`);
  }
  return observations;
}

async function bagObservations(bagRoot) {
  const indexPath = path.join(bagRoot, "source-index.jsonl");
  const lines = (await readFile(indexPath, "utf8")).trim().split(/\r?\n/).filter(Boolean);
  const observations = [];
  for (const line of lines) {
    const row = JSON.parse(line);
    if (row.host !== "tardis.fandom.com") continue;
    const facets = (row.facets || []).filter((facet) => facet.franchise === FRANCHISE && DOCTOR_WHO_CATEGORIES.includes(facet.category));
    if (!facets.length) continue;
    const wikitext = await readFile(path.join(bagRoot, row.path), "utf8");
    for (const facet of facets) observations.push({
      category: facet.category,
      title: facet.title,
      source: facet.source,
      observed_at: facet.observed_at || capturedAt,
      pageid: row.pageid,
      revision: row.revision,
      timestamp: row.timestamp,
      content_sha256: row.content_sha256,
      wikitext,
    });
  }
  if (!observations.length) throw new Error(`source bag ${bagRoot} contains no Doctor Who observations`);
  return observations;
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] ?? "missing";
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

const sourceRows = sourceBag ? await bagObservations(path.resolve(sourceBag)) : await networkObservations();
sourceRows.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title) || a.source.localeCompare(b.source));

const freshCensus = [];
const freshUnresolved = [];
const manifestObservations = [];
const diagnostics = [];
for (const sourceRow of sourceRows) {
  const extraction = extractDoctorWhoPage(sourceRow);
  const manifestRow = {
    franchise: FRANCHISE,
    category: sourceRow.category,
    title: sourceRow.title,
    source: sourceRow.source,
    observed_at: sourceRow.observed_at,
    pageid: sourceRow.pageid,
    revision: sourceRow.revision,
    timestamp: sourceRow.timestamp,
    content_sha256: sourceRow.content_sha256,
    disposition: extraction.disposition,
  };
  const errors = validateDoctorWhoObservation(manifestRow);
  if (errors.length) throw new Error(`${sourceRow.category}/${sourceRow.title}: ${errors.join(", ")}`);
  manifestObservations.push(manifestRow);

  diagnostics.push({
    category: sourceRow.category,
    title: sourceRow.title,
    disposition: extraction.disposition,
    identity_basis: extraction.identity.basis,
    credit_count: extraction.credits.length,
    rejected_field_count: extraction.rejected_fields.length,
    reason: extraction.reason,
  });

  if (extraction.disposition === "credited") {
    const byMode = new Map();
    for (const credit of extraction.credits) {
      const names = byMode.get(credit.performance_mode) || new Set();
      names.add(credit.performer);
      byMode.set(credit.performance_mode, names);
    }
    for (const [performanceMode, performers] of [...byMode].sort(([a], [b]) => a.localeCompare(b))) {
      freshCensus.push({
        franchise: FRANCHISE,
        category: sourceRow.category,
        character: sourceRow.title,
        performers: [...performers].sort(),
        performance_mode: performanceMode,
        source: sourceRow.source,
      });
    }
  } else if (extraction.disposition === "unresolved") {
    freshUnresolved.push({
      franchise: FRANCHISE,
      category: sourceRow.category,
      character: sourceRow.title,
      performance_mode: "unresolved",
      source: sourceRow.source,
      reason: extraction.reason,
    });
  }
}

const rejected = diagnostics.filter((row) => row.rejected_field_count > 0);
if (rejected.length) {
  throw new Error(`Doctor Who source contains ${rejected.length} non-empty trusted performer field(s) with no admissible person name; preserve and adjudicate those values before publication`);
}

let previousCensus = [];
try { previousCensus = JSON.parse(await readFile("data/CENSUS.json", "utf8")); } catch {}
const census = [...previousCensus.filter((row) => row.franchise !== FRANCHISE), ...freshCensus]
  .sort((a, b) => a.franchise.localeCompare(b.franchise) || a.category.localeCompare(b.category)
    || a.character.localeCompare(b.character) || String(a.performance_mode || "").localeCompare(String(b.performance_mode || ""))
    || a.performers.join().localeCompare(b.performers.join()));
await writeFile("data/CENSUS.json", `${JSON.stringify(census, null, 1)}\n`);

let previousUnresolved = [];
try { previousUnresolved = JSON.parse(await readFile("data/CENSUS-UNRESOLVED.json", "utf8")); } catch {}
const unresolved = [...previousUnresolved.filter((row) => row.franchise !== FRANCHISE), ...freshUnresolved]
  .sort((a, b) => a.franchise.localeCompare(b.franchise) || a.category.localeCompare(b.category) || a.character.localeCompare(b.character));
await writeFile("data/CENSUS-UNRESOLVED.json", `${JSON.stringify(unresolved, null, 1)}\n`);

let previousManifest = { observations: [] };
try { previousManifest = JSON.parse(await readFile("data/CENSUS-MANIFEST.json", "utf8")); } catch {}
const observations = [...(previousManifest.observations || []).filter((row) => row.franchise !== FRANCHISE), ...manifestObservations]
  .sort((a, b) => a.franchise.localeCompare(b.franchise) || a.category.localeCompare(b.category)
    || a.title.localeCompare(b.title) || a.source.localeCompare(b.source));
const manifest = {
  version: 1,
  schema: "schema/census-manifest.schema.json",
  captured_at: sourceBag ? (manifestObservations.map((row) => row.observed_at).sort().at(-1) || capturedAt) : capturedAt,
  generator: "scripts/census-doctor-who.mjs",
  scope: { franchises: [FRANCHISE], category: null },
  observations,
  snapshots: {
    census: { path: "data/CENSUS.json", sha256: await fileDigest("data/CENSUS.json"), rows: census.length },
    unresolved: { path: "data/CENSUS-UNRESOLVED.json", sha256: await fileDigest("data/CENSUS-UNRESOLVED.json"), rows: unresolved.length },
  },
};
await writeFile("data/CENSUS-MANIFEST.json", `${JSON.stringify(manifest, null, 1)}\n`);

const projection = spawnSync(process.execPath, ["scripts/census.mjs", "--project-only"], { stdio: "inherit" });
if (projection.error) throw new Error(`census projection could not start: ${projection.error.message}`);
if (projection.status !== 0) throw new Error(`census projection failed with exit ${projection.status}`);

const coverage = JSON.parse(await readFile("data/CENSUS-COVERAGE.json", "utf8"));
const doctorCoverage = coverage.filter((row) => row.franchise === FRANCHISE);
const exactCredits = freshCensus.reduce((total, row) => total + row.performers.length, 0);
const uniqueSourceRevisions = new Set(manifestObservations.map((row) => `${row.pageid}:${row.revision}:${row.content_sha256}`)).size;
const report = {
  version: 1,
  transaction: "DOCTOR-WHO-SEMANTIC-001",
  operation: "source-specific-plain-text-performer-and-target-identity-adapter",
  generated_at: manifest.captured_at,
  source: {
    host: "tardis.fandom.com",
    observation_rows: manifestObservations.length,
    unique_source_revisions: uniqueSourceRevisions,
    duplicate_category_facets: manifestObservations.length - uniqueSourceRevisions,
    categories: countBy(manifestObservations, "category"),
    dispositions: countBy(manifestObservations, "disposition"),
  },
  extraction: {
    credited_pages: diagnostics.filter((row) => row.disposition === "credited").length,
    exact_performer_role_credits: exactCredits,
    distinct_performers: new Set(doctorCoverage.map((row) => row.performer)).size,
    performance_modes: countBy(doctorCoverage, "performance_mode"),
    identity_basis: countBy(diagnostics.filter((row) => row.disposition === "credited"), "identity_basis"),
    rejected_nonempty_trusted_fields: rejected.length,
    unresolved_reasons: countBy(diagnostics.filter((row) => row.disposition === "unresolved"), "reason"),
    role_on_wall: doctorCoverage.filter((row) => row.role_on_wall).length,
    missing_roles: doctorCoverage.filter((row) => !row.role_on_wall).length,
  },
  inputs: Object.fromEntries(await Promise.all([
    "data/CENSUS.json",
    "data/CENSUS-UNRESOLVED.json",
    "data/CENSUS-MANIFEST.json",
    "data/CENSUS-COVERAGE.json",
    "data/CENSUS-SUMMARY.json",
    "data/CENSUS-GAPS.json",
  ].map(async (file) => [file, await fileDigest(file)]))),
  invariant: {
    plain_text_names_accepted_only_in_closed_performer_fields: true,
    target_identity_requires_species_or_exact_target_title: true,
    explicit_non_target_species_is_out_of_scope: true,
    category_membership_is_not_performer_evidence: true,
    generic_actor_field_keeps_performance_mode_unresolved: true,
    voice_actor_field_maps_to_voice: true,
    rejected_nonempty_trusted_fields_are_zero: rejected.length === 0,
  },
  boundary: {
    adapter_certification_created: false,
    estate_activated: false,
    luna_lease_issued: false,
    canonical_specimen_mutated: false,
    roadmap_milestone_completed: false,
    remaining_gate: "complete repository smoke, then independent second-desk certification or explicit blocked disposition",
  },
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Doctor Who semantic adapter: ${manifestObservations.length} observations; ${exactCredits} exact performer-role credits; ${freshUnresolved.length} unresolved; ${rejected.length} rejected trusted fields`);
