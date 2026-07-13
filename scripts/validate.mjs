#!/usr/bin/env node
/**
 * validate.mjs — the invariants build-gate for UNDERCAST.
 *
 * A preservation system earns trust by REFUSING to publish a corrupt state. This
 * checks the catalog against the invariants that keep it citable at scale and
 * emits a machine-readable result envelope (axm-shaped):
 *
 *   { status: "PASS"|"FAIL", error_count, errors:[{code,message}],
 *     profiles_checked:[...], profiles_unchecked:[{profile,reason}] }
 *
 * Exit codes:  0 = PASS (every profile ran, no errors)
 *              2 = FAIL (one or more invariant errors)
 *              1 = the verifier itself could not run (missing data / bad JSON)
 *
 * "Unchecked is not passed." A profile that could not run is reported in
 * profiles_unchecked, NEVER silently counted as green — the consumer must treat
 * an unchecked profile as unknown, not verified.
 *
 *   node scripts/validate.mjs            # human summary + envelope
 *   node scripts/validate.mjs --json     # envelope only, for CI to parse
 *
 * No dependencies (CI has no npm install): a minimal JSON-Schema validator for
 * exactly the constructs our two schema files use is inlined below.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { normalizeCensusKey } from "./census-key.mjs";

const JSON_ONLY = process.argv.includes("--json");
const errors = [];
const checked = [];
const unchecked = [];
const fail = (code, message) => errors.push({ code, message });
const mark = (profile) => checked.push(profile);
const skip = (profile, reason) => unchecked.push({ profile, reason });

function load(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { console.error(`FATAL: cannot read/parse ${path}: ${e.message}`); process.exit(1); }
}

// ── minimal JSON-Schema validator (draft 2020-12 subset we actually use) ──────
// Supports: type, required, properties, additionalProperties:false, enum,
// pattern, minLength, minimum, maximum, oneOf, and $ref → "#/$defs/<name>".
function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (Number.isInteger(v)) return "integer";
  if (typeof v === "number") return "number";
  return typeof v; // string | boolean | object
}
function typeOk(v, t) {
  if (t === "integer") return Number.isInteger(v);
  if (t === "number") return typeof v === "number";
  return typeOf(v) === t;
}
function validate(value, schema, root, path, errs) {
  if (schema.$ref) {
    const name = schema.$ref.replace(/^#\/\$defs\//, "");
    return validate(value, root.$defs[name], root, path, errs);
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((sub) => {
      const sub_errs = [];
      validate(value, sub, root, path, sub_errs);
      return sub_errs.length === 0;
    });
    if (matches.length !== 1) errs.push(`${path}: matched ${matches.length} of oneOf (expected exactly 1)`);
    return;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeOk(value, t))) { errs.push(`${path}: expected ${types.join("|")}, got ${typeOf(value)}`); return; }
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: ${JSON.stringify(value)} not in enum [${schema.enum.join(", ")}]`);
  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) errs.push(`${path}: shorter than minLength ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path}: "${value.slice(0, 60)}" fails pattern ${schema.pattern}`);
    if (schema.format === "uri") { try { new URL(value); } catch { errs.push(`${path}: is not a valid URI`); } }
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${path}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errs.push(`${path}: ${value} > maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errs.push(`${path}: fewer than minItems ${schema.minItems}`);
    if (schema.maxItems != null && value.length > schema.maxItems) errs.push(`${path}: more than maxItems ${schema.maxItems}`);
    if (schema.uniqueItems) {
      const serialised = value.map((item) => JSON.stringify(item));
      if (new Set(serialised).size !== serialised.length) errs.push(`${path}: duplicate array item`);
    }
    if (schema.items) value.forEach((item, index) => validate(item, schema.items, root, `${path}[${index}]`, errs));
  }
  if (schema.type === "object" || schema.properties) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const req of schema.required || []) if (!(req in value)) errs.push(`${path}: missing required "${req}"`);
      for (const [k, v] of Object.entries(value)) {
        if (schema.properties && schema.properties[k]) validate(v, schema.properties[k], root, `${path}.${k}`, errs);
        else if (schema.additionalProperties === false) errs.push(`${path}: unexpected property "${k}"`);
      }
    }
  }
}
function conformProfile(code, rows, schema, keyName) {
  mark(code);
  let bad = 0;
  for (const row of rows) {
    const errs = [];
    validate(row, schema, schema, row.id || "?", errs);
    if (errs.length) { bad++; if (bad <= 8) fail(code, `${row.id || keyName}: ${errs[0]}`); }
  }
  if (bad > 8) fail(code, `…and ${bad - 8} more ${keyName} records fail schema (${bad} total)`);
}
function conformObjectProfile(code, value, schema, label) {
  mark(code);
  const errs = [];
  validate(value, schema, schema, label, errs);
  for (const message of errs.slice(0, 20)) fail(code, message);
  if (errs.length > 20) fail(code, `and ${errs.length - 20} more schema errors`);
}

// ── load the catalog ──────────────────────────────────────────────────────────
const specimens = load("data/specimens.json");
const sources = load("data/SOURCES.json");
const constellationGraph = existsSync("data/constellations.json") ? load("data/constellations.json") : null;
const tombstones = existsSync("data/tombstones.json") ? load("data/tombstones.json") : { version: 1, records: [] };
if (!Array.isArray(specimens) || !Array.isArray(sources)) { console.error("FATAL: specimens/SOURCES are not arrays"); process.exit(1); }
// media manifest (optional): images whose bytes live on GitHub Releases
const media = existsSync("data/media-manifest.json") ? load("data/media-manifest.json") : null;
const mediaAssets = (media && media.assets) || {};
const onRelease = (src) => mediaAssets[src] && mediaAssets[src].location === "release"; // resolvable without a local file
const hashBytes = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const publishedTextBytes = (p) => Buffer.from(readFileSync(p, "utf8").replace(/\r\n/g, "\n"), "utf8");

// ── profile: schema conformance ───────────────────────────────────────────────
if (existsSync("schema/specimen.schema.json")) conformProfile("schema.specimen", specimens, load("schema/specimen.schema.json"), "specimen");
else skip("schema.specimen", "schema/specimen.schema.json not found");
if (existsSync("schema/source.schema.json")) conformProfile("schema.source", sources, load("schema/source.schema.json"), "source");
else skip("schema.source", "schema/source.schema.json not found");
if (existsSync("data/archive.json") && existsSync("schema/archive.schema.json")) conformObjectProfile("schema.archive", load("data/archive.json"), load("schema/archive.schema.json"), "archive");
else skip("schema.archive", "archive contract or schema missing");
if (existsSync("data/CENSUS-FERENGI-TEST.json") && existsSync("schema/census-test.schema.json")) conformObjectProfile("schema.census_test", load("data/CENSUS-FERENGI-TEST.json"), load("schema/census-test.schema.json"), "Ferengi benchmark");
else skip("schema.census_test", "Ferengi benchmark report or schema missing");
if (existsSync("data/CENSUS-MANIFEST.json") && existsSync("schema/census-manifest.schema.json")) conformObjectProfile("schema.census_manifest", load("data/CENSUS-MANIFEST.json"), load("schema/census-manifest.schema.json"), "census manifest");
else skip("schema.census_manifest", "census observation manifest or schema missing");
if (existsSync("data/tombstones.json") && existsSync("schema/tombstones.schema.json")) conformObjectProfile("schema.tombstones", tombstones, load("schema/tombstones.schema.json"), "tombstones");
else skip("schema.tombstones", "tombstone ledger or schema missing");
if (existsSync("data/entities.json") && existsSync("schema/entities.schema.json")) conformObjectProfile("schema.entities", load("data/entities.json"), load("schema/entities.schema.json"), "entities");
else skip("schema.entities", "entity projection or schema missing");
if (constellationGraph && existsSync("schema/constellations.schema.json")) conformObjectProfile("schema.constellations", constellationGraph, load("schema/constellations.schema.json"), "constellations");
else skip("schema.constellations", "constellation evidence graph or schema missing");

// ── profile: unique ids ───────────────────────────────────────────────────────
mark("id.unique");
const seen = new Set();
const performanceKeys = new Set();
for (const s of specimens) {
  if (seen.has(s.id)) fail("id.unique", `duplicate specimen id ${s.id}`);
  seen.add(s.id);
  const performanceKey = [s.actor, s.character, s.production].map((value) => String(value || "").normalize("NFKC").toLowerCase().trim()).join("|");
  if (performanceKeys.has(performanceKey)) fail("id.unique", `duplicate performer/character/production identity at ${s.id}`);
  performanceKeys.add(performanceKey);
}

// ── profile: referential integrity (every image ref resolves — locally or on a release) ──
mark("ref.integrity");
const imgRefs = []; // [{id, side, src}]
for (const s of specimens) {
  for (const side of ["still", "portrait"]) {
    const a = s[side];
    if (a && typeof a === "object" && a.src) {
      imgRefs.push({ id: s.id, side, src: a.src });
      if (existsSync(a.src)) { if (statSync(a.src).size === 0) fail("ref.integrity", `${s.id}.${side} → zero-byte file ${a.src}`); }
      else if (!onRelease(a.src)) fail("ref.integrity", `${s.id}.${side} → no local file ${a.src} and not published to a release`);
    }
  }
}

// ── profile: no in-card duplicate (front still ≠ back portrait) ───────────────
mark("image.no_in_card_dup");
for (const s of specimens) {
  if (s.still?.src && s.portrait?.src && s.still.src === s.portrait.src)
    fail("image.no_in_card_dup", `${s.id}: still and portrait share ${s.still.src}`);
}

// ── profile: no cross-card duplicate image bytes ──────────────────────────────
// The distinct-still pass drove this to zero; the gate keeps it there. Skipped
// (not passed) if the image files are absent — e.g. a data-only checkout.
// Fixed comparison frames must share one crop policy across every public surface.
// Curated per-image focus is semantic data; the upper-center default protects the
// common tall-portrait case without mutating source images.
mark("image.crop_policy");
const focusedImages = specimens.flatMap((record) => [record.still, record.portrait]).filter((image) => image?.focus);
if (!focusedImages.length) fail("image.crop_policy", "no curated image focus exercises the crop contract");
const cropConsumers = [
  ["index.html", /var\(--focus-y,28%\)/, /data-focus-y/],
  ["recognition.html", /--focus-y:28%/, /data-focus-y/],
  ["assets/record-page.css", /--focus-y:28%/, /data-focus-y/],
  ["scripts/build-record-pages.mjs", /focusAttrs/, /data-focus-y/]
];
for (const [path, defaultPattern, focusPattern] of cropConsumers) {
  const source = readFileSync(path, "utf8");
  if (!defaultPattern.test(source)) fail("image.crop_policy", `${path} lost the shared upper-center crop default`);
  if (!focusPattern.test(source)) fail("image.crop_policy", `${path} does not consume curated image focus`);
}

const presentRefs = imgRefs.filter((r) => existsSync(r.src) && statSync(r.src).size > 0);
if (presentRefs.length === 0) {
  skip("image.no_cross_card_dup", "no image files present to hash");
} else {
  mark("image.no_cross_card_dup");
  const byHash = new Map();
  for (const r of presentRefs) {
    const h = createHash("sha256").update(readFileSync(r.src)).digest("hex");
    (byHash.get(h) || byHash.set(h, []).get(h)).push(`${r.id}:${r.side}`);
  }
  for (const [, members] of byHash) {
    // members within the SAME card+side pair aren't cross-card; flag ≥2 distinct cards
    const cards = new Set(members.map((m) => m.split(":")[0]));
    if (cards.size > 1) fail("image.no_cross_card_dup", `byte-identical image shared by ${members.join(", ")}`);
  }
  if (presentRefs.length < imgRefs.length)
    skip("image.no_cross_card_dup", `${imgRefs.length - presentRefs.length} referenced file(s) absent — hashed only the ${presentRefs.length} present`);
}

// ── profile: specimens ↔ SOURCES consistency ──────────────────────────────────
mark("sources.consistency");
const specIds = new Set(specimens.map((s) => s.id));
const srcById = new Map(sources.map((r) => [r.id, r]));
for (const r of sources) if (!specIds.has(r.id)) fail("sources.consistency", `SOURCES row ${r.id} has no matching specimen`);
for (const s of specimens) {
  const hasProvImg = ["still", "portrait"].some((side) => s[side]?.src);
  if (hasProvImg && !srcById.has(s.id)) fail("sources.consistency", `${s.id} carries images but has no SOURCES ledger row`);
  const row = srcById.get(s.id);
  if (!row) continue;
  for (const field of ["actor", "character", "universe"]) if (row[field] !== s[field]) fail("sources.consistency", `${s.id}.${field} differs between specimen and SOURCES ledger`);
  for (const side of ["still", "portrait"]) if (JSON.stringify(row[side] || null) !== JSON.stringify(s[side] || null)) fail("sources.consistency", `${s.id}.${side} differs between specimen and SOURCES ledger`);
}

mark("id.lifecycle");
const liveIds = new Set(specimens.map((record) => record.id));
const retiredIds = new Set();
for (const row of tombstones.records || []) {
  if (!/^UC-G?\d+$/.test(row.id || "")) fail("id.lifecycle", `invalid tombstone id ${row.id}`);
  if (retiredIds.has(row.id)) fail("id.lifecycle", `duplicate tombstone id ${row.id}`);
  if (liveIds.has(row.id)) fail("id.lifecycle", `${row.id} is both live and retired`);
  if (row.status === "merged") {
    if (!row.successor || !liveIds.has(row.successor) || row.successor === row.id) fail("id.lifecycle", `${row.id} has invalid successor ${row.successor}`);
  } else if (row.status === "removed") {
    if (row.successor) fail("id.lifecycle", `${row.id} removed record must not redirect`);
    if (!String(row.actor || "").trim() || !String(row.character || "").trim() || !/^https:\/\//.test(row.source || ""))
      fail("id.lifecycle", `${row.id} removed record lacks identity or HTTPS correction evidence`);
  } else fail("id.lifecycle", `${row.id} has unsupported retirement status ${row.status}`);
  retiredIds.add(row.id);
}

// ── profile: URL / host safety (link + image origins) ─────────────────────────
mark("url.safety");
const safeUrl = (u) => {
  if (typeof u !== "string" || !u) return true; // absence handled elsewhere
  if (!/^https?:\/\//i.test(u)) return false;    // reject javascript:, data:, //, relative
  try { new URL(u); return true; } catch { return false; }
};
for (const s of specimens) {
  if (!safeUrl(s.link)) fail("url.safety", `${s.id}.link is not a safe http(s) URL: ${String(s.link).slice(0, 60)}`);
  for (const [index, reference] of (s.references || []).entries()) {
    if (!safeUrl(reference.source) || !String(reference.source).startsWith("https://")) fail("url.safety", `${s.id}.references[${index}] is not a safe HTTPS URL`);
  }
  for (const side of ["still", "portrait"]) {
    const o = s[side]?.origin;
    if (o != null && !safeUrl(o)) fail("url.safety", `${s.id}.${side}.origin is not a safe http(s) URL: ${String(o).slice(0, 60)}`);
  }
}

// Evidence-scoped production conditions: controlled vocabulary + a source per claim.
mark("claims.evidence");
const conditionVocabulary = existsSync("data/vocabularies/conditions.json") ? load("data/vocabularies/conditions.json") : null;
if (!conditionVocabulary) fail("claims.evidence", "data/vocabularies/conditions.json is missing");
const conditionTerms = new Set(Object.keys(conditionVocabulary?.terms || {}));
for (const s of specimens) {
  const referenceKeys = new Set();
  for (const [index, reference] of (s.references || []).entries()) {
    const key = `${reference.claim}|${reference.source}`;
    if (referenceKeys.has(key)) fail("claims.evidence", `${s.id} duplicates fact reference ${key}`);
    referenceKeys.add(key);
    if (!safeUrl(reference.source)) fail("claims.evidence", `${s.id}.references[${index}] lacks a safe evidence URL`);
  }
  const conditionKeys = new Set();
  for (const [index, condition] of (s.conditions || []).entries()) {
    if (!conditionTerms.has(condition.type)) fail("claims.evidence", `${s.id}.conditions[${index}] uses unknown type ${condition.type}`);
    if (!safeUrl(condition.source)) fail("claims.evidence", `${s.id}.conditions[${index}] lacks a safe evidence URL`);
    if (["episode", "scene"].includes(condition.scope) && !condition.episode) fail("claims.evidence", `${s.id}.conditions[${index}] scope ${condition.scope} requires episode`);
    const key = [condition.type, condition.scope, condition.episode || ""].join("|");
    if (conditionKeys.has(key)) fail("claims.evidence", `${s.id} duplicates condition claim ${key}`);
    conditionKeys.add(key);
  }
}

// ── profile: projection consistency (index/shards must match the truth) ───────
// The wall serves the generated projections, not specimens.json. If they drift —
// someone edited the data but didn't rebuild — the site would publish stale cards.
// This is the gate that keeps `node scripts/shard.mjs` from being forgotten.
const hashFile = (p) => sha256Hex(readFileSync(p));
function sha256Hex(s) { return createHash("sha256").update(s).digest("hex"); }
if (existsSync("data/index.json") && existsSync("data/shard-manifest.json")) {
  mark("projection.consistency");
  try {
    const manifest = load("data/shard-manifest.json");
    const index = load("data/index.json");
    // 1. truth hash: projections must be built from the CURRENT specimens.json
    const truthHash = sha256Hex(JSON.stringify(specimens));
    if (manifest.source_sha256 !== truthHash)
      fail("projection.consistency", "projections are STALE — data/specimens.json changed since the last `node scripts/shard.mjs`. Rebuild the projections.");
    // 2. counts line up
    if (manifest.count !== specimens.length) fail("projection.consistency", `manifest.count ${manifest.count} ≠ ${specimens.length} specimens`);
    if (index.length !== specimens.length) fail("projection.consistency", `index has ${index.length} entries, expected ${specimens.length}`);
    // 3. index integrity: its own hash + exact id set
    if (manifest.index_sha256 !== hashFile("data/index.json")) fail("projection.consistency", "data/index.json does not match manifest.index_sha256");
    if (manifest.index_bytes !== statSync("data/index.json").size) fail("projection.consistency", "data/index.json does not match manifest.index_bytes");
    const idxIds = new Set(index.map((e) => e.id));
    if (idxIds.size !== index.length) fail("projection.consistency", "duplicate id in index.json");
    for (const s of specimens) if (!idxIds.has(s.id)) fail("projection.consistency", `${s.id} missing from index.json`);
    // 4. every shard file present, hash-verified; union of records == the roster, once each
    const shardIds = new Set();
    for (let i = 0; i < manifest.shards.length; i++) {
      const m = manifest.shards[i];
      if (!existsSync("data/" + m.file)) { fail("projection.consistency", `shard ${m.file} missing`); continue; }
      if (m.sha256 !== hashFile("data/" + m.file)) fail("projection.consistency", `shard ${m.file} bytes ≠ manifest sha256`);
      if (m.bytes !== statSync("data/" + m.file).size) fail("projection.consistency", `shard ${m.file} bytes ≠ manifest byte count`);
      for (const rec of load("data/" + m.file)) {
        if (shardIds.has(rec.id)) fail("projection.consistency", `${rec.id} appears in more than one shard`);
        shardIds.add(rec.id);
      }
    }
    for (const s of specimens) if (!shardIds.has(s.id)) fail("projection.consistency", `${s.id} is in no shard`);
  } catch (e) {
    fail("projection.consistency", "could not verify projections: " + e.message);
  }
} else {
  skip("projection.consistency", "projections not built (data/index.json / shard-manifest.json absent) — run: node scripts/shard.mjs");
}

// ── profile: media manifest consistency (the GitHub Releases store) ───────────
if (media) {
  mark("media.consistency");
  const specIdSet = new Set([...specimens.map((s) => s.id), ...(tombstones.records || []).map((row) => row.id)]);
  const refSrcSet = new Set(imgRefs.map((r) => r.src));
  const perRelease = {};
  const byAsset = new Map();
  let orphans = 0;
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(media.repo || ""))) fail("media.consistency", `manifest.repo "${media.repo}" is not owner/repo`);
  const cap = media.release_capacity || 800;
  for (const [src, e] of Object.entries(mediaAssets)) {
    // An orphaned entry (its card was deleted) is harmless dead weight — the wall keys
    // by live card src, so it's never served — and `media-stage.mjs` prunes it on its next
    // run. Do NOT hard-fail here: that would wedge unrelated nightly commits after a dedup.
    if (!refSrcSet.has(src)) orphans++;
    const sha8 = String(e.sha256 || "").slice(0, 8);
    if (!/^[0-9a-f]{64}$/.test(e.sha256 || "")) fail("media.consistency", `${src}: bad sha256`);
    if (e.asset !== `${String(e.id).toLowerCase()}-${e.side}-${sha8}.${String(e.asset).split(".").pop()}`)
      fail("media.consistency", `${src}: asset name "${e.asset}" isn't content-addressed (expected ${e.id.toLowerCase()}-${e.side}-${sha8}.*)`);
    if (byAsset.has(e.asset) && byAsset.get(e.asset) !== e.sha256) fail("media.consistency", `asset ${e.asset} maps to two different hashes`);
    byAsset.set(e.asset, e.sha256);
    if (!/^media-\d{4}$/.test(e.release || "")) fail("media.consistency", `${src}: bad release tag "${e.release}"`);
    perRelease[e.release] = (perRelease[e.release] || 0) + 1;
    if (!/^https:\/\/github\.com\/.+\/releases\/download\/.+/.test(e.url || "")) fail("media.consistency", `${src}: url is not a release-download URL`);
    if (e.url && !e.url.endsWith(`/${e.release}/${e.asset}`)) fail("media.consistency", `${src}: url does not resolve to ${e.release}/${e.asset}`);
    if (!["pending", "release"].includes(e.location)) fail("media.consistency", `${src}: bad location "${e.location}"`);
    if (!(Number.isInteger(e.bytes) && e.bytes > 0)) fail("media.consistency", `${src}: bad byte size`);
    if (!(Number.isInteger(e.w) && e.w > 0 && Number.isInteger(e.h) && e.h > 0)) fail("media.consistency", `${src}: bad/zero dimensions ${e.w}x${e.h}`);
    if (!specIdSet.has(e.prov)) fail("media.consistency", `${src}: provenance id ${e.prov} matches no specimen`);
    // integrity: if the local file is still present, its bytes must match the recorded hash
    if (existsSync(src)) {
      const b = readFileSync(src);
      if (createHash("sha256").update(b).digest("hex") !== e.sha256) fail("media.consistency", `${src}: local bytes don't match manifest sha256`);
      if (b.length !== e.bytes) fail("media.consistency", `${src}: local byte size ≠ manifest`);
    }
  }
  for (const [tag, n] of Object.entries(perRelease)) if (n > cap) fail("media.consistency", `release ${tag} holds ${n} assets, over capacity ${cap}`);
  // media-live.json is the lean boot map the WALL loads — it must exactly mirror the
  // release-located manifest entries (a drift means the site serves a stale image set).
  if (existsSync("data/media-live.json")) {
    const live = (load("data/media-live.json").urls) || {};
    for (const [src, e] of Object.entries(mediaAssets)) {
      if (e.location === "release" && live[src] !== e.url) fail("media.consistency", `media-live.json missing/wrong url for ${src} — rebuild: node scripts/shard.mjs`);
    }
    for (const src of Object.keys(live)) if (!(mediaAssets[src] && mediaAssets[src].location === "release")) fail("media.consistency", `media-live.json has stale entry ${src}`);
  }
} else {
  skip("media.consistency", "no media manifest (data/media-manifest.json absent) — all images served from Pages");
}

// Derived entity projection: complete exact-label groupings without identity guesses.
if (existsSync("data/entities.json")) {
  mark("entities.consistency");
  const entities = load("data/entities.json");
  if (entities.generated_from?.content_sha256 !== load("data/shard-manifest.json").source_sha256) fail("entities.consistency", "entities projection was not built from current canonical truth");
  for (const group of ["performers", "productions", "makers"]) {
    const keys = new Set();
    for (const entity of entities[group] || []) {
      if (keys.has(entity.key)) fail("entities.consistency", `duplicate ${group} key ${entity.key}`);
      keys.add(entity.key);
      if (!Array.isArray(entity.record_ids) || !entity.record_ids.length) fail("entities.consistency", `${entity.key} has no record_ids`);
      for (const id of entity.record_ids || []) if (!specIds.has(id)) fail("entities.consistency", `${entity.key} references missing ${id}`);
    }
  }
  for (const s of specimens) {
    const normalEntityLabel = (value) => String(value || "").normalize("NFKC").toLowerCase();
    if (!(entities.performers || []).some((entity) => normalEntityLabel(entity.label) === normalEntityLabel(s.actor) && entity.record_ids.includes(s.id))) fail("entities.consistency", `${s.id} missing normalized performer-credit entity`);
    if (!(entities.productions || []).some((entity) => normalEntityLabel(entity.label) === normalEntityLabel(s.production) && entity.record_ids.includes(s.id))) fail("entities.consistency", `${s.id} missing normalized production entity`);
  }
} else skip("entities.consistency", "data/entities.json missing — run node scripts/shard.mjs");

// Maintained constellation graph: broader context may anchor to the archive,
// but only an explicit specimen edge may claim wall eligibility.
if (constellationGraph) {
  mark("constellation.integrity");
  const nodes = new Map(), edges = new Map(), triples = new Set();
  const normalized = (value) => String(value || "").normalize("NFKC").toLowerCase().trim();
  for (const node of constellationGraph.nodes || []) {
    if (nodes.has(node.id)) fail("constellation.integrity", `duplicate node ${node.id}`);
    nodes.set(node.id, node);
    if (!String(node.id || "").startsWith(`${node.kind}:`)) fail("constellation.integrity", `${node.id} kind/id prefix disagreement`);
    if (!/^https:\/\//.test(node.source || "")) fail("constellation.integrity", `${node.id} lacks an HTTPS source`);
    for (const id of node.record_ids || []) if (!specIds.has(id)) fail("constellation.integrity", `${node.id} references missing ${id}`);
  }
  for (const edge of constellationGraph.edges || []) {
    if (edges.has(edge.id)) fail("constellation.integrity", `duplicate edge ${edge.id}`);
    edges.set(edge.id, edge);
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) fail("constellation.integrity", `${edge.id} has a missing endpoint`);
    const triple = `${edge.from}|${edge.predicate}|${edge.to}`;
    if (triples.has(triple)) fail("constellation.integrity", `duplicate relationship ${triple}`);
    triples.add(triple);
    if (!Array.isArray(edge.evidence) || !edge.evidence.length) fail("constellation.integrity", `${edge.id} has no evidence`);
    for (const evidence of edge.evidence || []) if (!/^https:\/\//.test(evidence.source || "")) fail("constellation.integrity", `${edge.id} has non-HTTPS evidence`);
    if (edge.predicate === "performed" && !["specimen", "context"].includes(edge.scope)) fail("constellation.integrity", `${edge.id} performed edge has invalid ${edge.scope} scope`);
    if (edge.predicate !== "performed" && edge.scope !== "structure") fail("constellation.integrity", `${edge.id} structural relationship must use structure scope`);
    if (edge.scope === "specimen") {
      if (!edge.record_id || !specIds.has(edge.record_id)) { fail("constellation.integrity", `${edge.id} specimen edge lacks a live record`); continue; }
      const record = specimens.find((item) => item.id === edge.record_id), person = nodes.get(edge.from), character = nodes.get(edge.to);
      if (person?.kind !== "person" || character?.kind !== "character") fail("constellation.integrity", `${edge.id} specimen endpoints must be person to character`);
      const recordRoles = record ? [record.character, ...(record.performances || []).map((item) => item.character)] : [];
      const actorMatches = record && [record.actor, ...(record.aliases || [])]
        .some((name) => normalizeCensusKey(name) === normalizeCensusKey(person?.label));
      if (record && (!actorMatches
        || !recordRoles.some((role) => normalizeCensusKey(role) === normalizeCensusKey(character?.label))))
        fail("constellation.integrity", `${edge.id} record ${edge.record_id} does not match its person/character nodes or filed performances`);
      if (!person?.record_ids?.includes(edge.record_id) || !character?.record_ids?.includes(edge.record_id)) fail("constellation.integrity", `${edge.id} record anchor is not present on both endpoint nodes`);
    } else if (edge.record_id) fail("constellation.integrity", `${edge.id} non-specimen edge must not claim record_id ${edge.record_id}`);
  }
  const constellationIds = new Set();
  for (const view of constellationGraph.constellations || []) {
    if (constellationIds.has(view.id)) fail("constellation.integrity", `duplicate constellation ${view.id}`);
    constellationIds.add(view.id);
    const memberNodes = new Set(view.node_ids || []);
    for (const id of memberNodes) if (!nodes.has(id)) fail("constellation.integrity", `${view.id} references missing node ${id}`);
    for (const id of view.edge_ids || []) {
      const edge = edges.get(id);
      if (!edge) fail("constellation.integrity", `${view.id} references missing edge ${id}`);
      else if (!memberNodes.has(edge.from) || !memberNodes.has(edge.to)) fail("constellation.integrity", `${view.id} edge ${id} escapes its node set`);
    }
  }
  if (!(constellationGraph.edges || []).some((edge) => edge.scope === "specimen") || !(constellationGraph.edges || []).some((edge) => edge.scope === "context")) fail("constellation.integrity", "graph must preserve the specimen/context boundary explicitly");
} else skip("constellation.integrity", "data/constellations.json missing");

if (existsSync("data/quality.json")) {
  mark("quality.non_regression");
  const quality = load("data/quality.json"), metrics = quality.metrics || {}, baseline = quality.baseline || {};
  if (quality.generated_from !== load("data/shard-manifest.json").source_sha256 || quality.total !== specimens.length) fail("quality.non_regression", "quality projection is stale");
  if (metrics.complete_pair_ratio < baseline.minimum_complete_pair_ratio) fail("quality.non_regression", "complete image-pair ratio fell below baseline");
  if (metrics.missing_both_ratio > baseline.maximum_missing_both_ratio) fail("quality.non_regression", "fully unillustrated ratio exceeded baseline");
  if (metrics.known_maker_ratio < baseline.minimum_known_maker_ratio) fail("quality.non_regression", "known-maker ratio fell below baseline");
  if (metrics.claim_evidence_ratio < baseline.minimum_claim_evidence_ratio) fail("quality.non_regression", "claim-evidence ratio fell below baseline");
} else skip("quality.non_regression", "data/quality.json missing — run node scripts/shard.mjs");

// Franchise/species census: coverage is performer+role, never merely a name
// appearing somewhere else on the wall. A failed source must not become zero.
if (["data/CENSUS.json", "data/CENSUS-COVERAGE.json", "data/CENSUS-GAPS.json", "data/CENSUS-SUMMARY.json", "data/CENSUS-UNRESOLVED.json"].every(existsSync)) {
  mark("census.consistency");
  const census = load("data/CENSUS.json");
  const coverage = load("data/CENSUS-COVERAGE.json");
  const summary = load("data/CENSUS-SUMMARY.json");
  const unresolved = load("data/CENSUS-UNRESOLVED.json");
  if (!Array.isArray(census) || !Array.isArray(coverage) || !Array.isArray(summary.groups)) fail("census.consistency", "census projections have invalid envelopes");
  const coverageKeys = new Set();
  for (const row of coverage || []) {
    const key = [row.franchise, row.category, row.character, row.performer].map((value) => String(value || "").normalize("NFKC").toLowerCase()).join("|");
    if (coverageKeys.has(key)) fail("census.consistency", `duplicate census credit ${key}`);
    coverageKeys.add(key);
    if (!/^https:\/\//.test(row.source || "")) fail("census.consistency", `${row.performer} / ${row.character} lacks an HTTPS census source`);
    if (!Array.isArray(row.wall_ids)) fail("census.consistency", `${row.performer} / ${row.character} lacks wall_ids`);
    for (const id of row.wall_ids || []) if (!specIds.has(id)) fail("census.consistency", `${row.performer} / ${row.character} references missing ${id}`);
    if (row.role_on_wall !== Boolean(row.wall_ids?.length)) fail("census.consistency", `${row.performer} / ${row.character} role_on_wall disagrees with wall_ids`);
  }
  const ferengi = coverage.filter((row) => row.franchise === "Star Trek" && row.category === "Ferengi");
  if (ferengi.length < 1) fail("census.consistency", "Ferengi census is empty; source failure must never publish a false zero");
  const ferengiSummary = summary.groups.find((row) => row.franchise === "Star Trek" && row.category === "Ferengi");
  if (!ferengiSummary || ferengiSummary.credits !== ferengi.length) fail("census.consistency", "Ferengi census summary count drift");
  const unresolvedFerengi = unresolved.filter((row) => row.franchise === "Star Trek" && row.category === "Ferengi");
  if (ferengiSummary?.unresolved_characters !== unresolvedFerengi.length) fail("census.consistency", "Ferengi unresolved-character count drift");
  for (const row of unresolved) if (!/^https:\/\//.test(row.source || "")) fail("census.consistency", `${row.character} unresolved census row lacks an HTTPS source`);
} else skip("census.consistency", "census projections missing — run npm run census:ferengi");

// Census source observations bind the committed snapshot to the exact wiki
// revisions seen by the networked crawler. Project-only rebuilds preserve this
// file while refreshing every derived census surface.
if (existsSync("data/CENSUS-MANIFEST.json")) {
  mark("census.observation_freshness");
  const censusManifest = load("data/CENSUS-MANIFEST.json");
  const expectedSnapshots = {
    census: ["data/CENSUS.json", load("data/CENSUS.json").length],
    unresolved: ["data/CENSUS-UNRESOLVED.json", load("data/CENSUS-UNRESOLVED.json").length],
  };
  for (const [name, [path, rows]] of Object.entries(expectedSnapshots)) {
    const snapshot = censusManifest.snapshots?.[name];
    if (snapshot?.path !== path || snapshot?.sha256 !== hashBytes(path) || snapshot?.rows !== rows)
      fail("census.observation_freshness", `${name} snapshot identity is stale`);
  }
  if ((censusManifest.observations || []).length && !/^\d{4}-\d{2}-\d{2}T/.test(censusManifest.captured_at || ""))
    fail("census.observation_freshness", "observed census pages require a captured_at timestamp");
  const observationKeys = new Set();
  for (const row of censusManifest.observations || []) {
    const key = `${normalizeCensusKey(row.franchise)}|${normalizeCensusKey(row.category)}|${normalizeCensusKey(row.title)}`;
    if (observationKeys.has(key)) fail("census.observation_freshness", `duplicate census page observation ${key}`);
    observationKeys.add(key);
    if (!Number.isInteger(row.pageid) || !Number.isInteger(row.revision) || !/^[a-f0-9]{64}$/.test(row.content_sha256 || ""))
      fail("census.observation_freshness", `${key} lacks durable source revision identity`);
  }
} else skip("census.observation_freshness", "data/CENSUS-MANIFEST.json missing");

// The named benchmark is stricter than aggregate count consistency. Input
// hashes ensure a stale committed report cannot make CI green.
if (existsSync("data/CENSUS-FERENGI-TEST.json")) {
  mark("census.ferengi_benchmark");
  const report = load("data/CENSUS-FERENGI-TEST.json");
  if (report.status !== "PASS" || report.accounting_status !== "PASS")
    fail("census.ferengi_benchmark", `Ferengi benchmark is ${report.status}; accounting is ${report.accounting_status}`);
  if (report.source_rows !== Object.values(report.counts || {}).reduce((sum, count) => sum + count, 0))
    fail("census.ferengi_benchmark", "Ferengi disposition totals do not equal source row count");
  if (!report.constellation_id || report.physical_blockers !== 0)
    fail("census.ferengi_benchmark", "Ferengi exact-edge discoverability is incomplete");
  for (const [path, digest] of Object.entries(report.input_sha256 || {})) {
    if (!existsSync(path) || hashBytes(path) !== digest) fail("census.ferengi_benchmark", `${path} changed since the benchmark report was generated`);
  }
  if (Object.keys(report.input_sha256 || {}).length < 6)
    fail("census.ferengi_benchmark", "Ferengi benchmark report lacks complete input hashes");
  if (!report.input_sha256?.["data/CENSUS-MANIFEST.json"])
    fail("census.ferengi_benchmark", "Ferengi benchmark is not bound to the census observation manifest");
} else skip("census.ferengi_benchmark", "run npm run test:ferengi");

// Versioned archive contract + every advertised checksum.
if (existsSync("data/archive.json")) {
  mark("contract.consistency");
  const archive = load("data/archive.json");
  const manifest = load("data/shard-manifest.json");
  if (archive.version !== 1 || archive.catalog_id !== "undercast") fail("contract.consistency", "unsupported archive contract identity/version");
  if (archive.identifiers?.record_pattern !== "^UC-G?\\d+$" || archive.identifiers?.never_reuse_ids !== true) fail("contract.consistency", "durable identifier policy changed");
  if (archive.canonical?.records?.count !== specimens.length) fail("contract.consistency", "canonical record count drift");
  if (archive.canonical?.sources?.count !== sources.length) fail("contract.consistency", "canonical source count drift");
  if (archive.canonical?.records?.content_sha256 !== manifest.source_sha256) fail("contract.consistency", "canonical content hash drift");
  if (archive.canonical?.constellations?.count !== constellationGraph?.constellations?.length || archive.canonical?.constellations?.nodes !== constellationGraph?.nodes?.length || archive.canonical?.constellations?.edges !== constellationGraph?.edges?.length) fail("contract.consistency", "canonical constellation counts drift");
  for (const item of [archive.canonical?.records, archive.canonical?.sources, archive.canonical?.constellations, archive.canonical?.census_manifest, archive.canonical?.tombstones, ...Object.values(archive.schemas || {}), archive.projections?.lean_index, archive.projections?.shard_manifest, archive.projections?.entities, archive.projections?.search, archive.projections?.media_live, archive.projections?.quality, ...Object.values(archive.projections?.census || {}), archive.vocabularies?.conditions, ...(archive.web_assets || [])]) {
    if (!item?.path || !existsSync(item.path)) { fail("contract.consistency", `contract path missing: ${item?.path || "undefined"}`); continue; }
    const published = publishedTextBytes(item.path);
    if (item.sha256 !== createHash("sha256").update(published).digest("hex")) fail("contract.consistency", `${item.path} sha256 drift — rebuild contract`);
    if (item.bytes !== published.length) fail("contract.consistency", `${item.path} published byte count drift`);
  }
  const search = load("data/search/manifest.json");
  if (search.generated_from !== manifest.source_sha256) fail("contract.consistency", "search projection was not built from current truth");
  for (const shard of search.shards || []) {
    if (!existsSync(shard.file)) fail("contract.consistency", `search shard missing: ${shard.file}`);
    else {
      if (shard.sha256 !== hashFile(shard.file)) fail("contract.consistency", `search shard hash drift: ${shard.file}`);
      if (shard.bytes !== statSync(shard.file).size) fail("contract.consistency", `search shard byte count drift: ${shard.file}`);
    }
  }
  const expectedRedirects = Object.fromEntries((tombstones.records || []).filter((row) => row.status === "merged").map((row) => [row.id, row.successor]));
  if (JSON.stringify(manifest.redirects || {}) !== JSON.stringify(expectedRedirects)) fail("contract.consistency", "manifest redirects drift from canonical tombstones");
} else skip("contract.consistency", "data/archive.json missing — run node scripts/shard.mjs");

// Standards-based crawler discovery must continue to point at the machine contract.
mark("crawler.discovery");
for (const path of ["robots.txt", "sitemap.xml", "CRAWLERS.md", "data/dataset.jsonld"]) if (!existsSync(path)) fail("crawler.discovery", `${path} missing`);
if (existsSync("robots.txt")) {
  const robots = readFileSync("robots.txt", "utf8");
  if (!/^User-agent:\s*\*/mi.test(robots) || !/^Allow:\s*\//mi.test(robots)) fail("crawler.discovery", "robots.txt does not explicitly allow public crawling");
  if (!/^Sitemap:\s*https:\/\/bigbirdreturns\.github\.io\/undercast\/sitemap\.xml/mi.test(robots)) fail("crawler.discovery", "robots.txt does not advertise the canonical sitemap");
}
if (existsSync("sitemap.xml")) {
  const sitemap = readFileSync("sitemap.xml", "utf8");
  const recordUrls = (sitemap.match(/<loc>https:\/\/bigbirdreturns\.github\.io\/undercast\/records\/UC-G?\d+\/<\/loc>/g) || []).length;
  const expectedRoutes = specimens.length + (tombstones.records || []).length;
  if (recordUrls !== expectedRoutes) fail("crawler.discovery", `sitemap exposes ${recordUrls} record routes, expected ${expectedRoutes}`);
}
for (const pagePath of ["index.html", "recognition.html", "coverage.html", "constellation.html"]) {
  const html = readFileSync(pagePath, "utf8");
  if (!/rel="describedby"[^>]+data\/archive\.json/.test(html)) fail("crawler.discovery", `${pagePath} does not link the archive contract`);
  if (!/application\/ld\+json[^>]+data\/dataset\.jsonld/.test(html)) fail("crawler.discovery", `${pagePath} does not advertise Dataset JSON-LD`);
}

// ── emit the result envelope ──────────────────────────────────────────────────
const status = errors.length ? "FAIL" : "PASS";
const envelope = {
  status,
  error_count: errors.length,
  errors: errors.slice(0, 200),
  profiles_checked: [...new Set(checked)],
  profiles_unchecked: unchecked,
  counts: { specimens: specimens.length, sources: sources.length, image_refs: imgRefs.length },
};

if (JSON_ONLY) {
  console.log(JSON.stringify(envelope, null, 2));
} else {
  console.log(`\nUNDERCAST invariant gate — ${status}`);
  console.log(`  specimens: ${specimens.length}  sources: ${sources.length}  image refs: ${imgRefs.length}`);
  console.log(`  profiles checked (${envelope.profiles_checked.length}): ${envelope.profiles_checked.join(", ")}`);
  if (unchecked.length) {
    console.log(`  profiles UNCHECKED (${unchecked.length}) — unchecked is not passed:`);
    for (const u of unchecked) console.log(`    · ${u.profile}: ${u.reason}`);
  }
  if (errors.length) {
    console.log(`\n  ${errors.length} error(s):`);
    for (const e of errors.slice(0, 40)) console.log(`    ✗ [${e.code}] ${e.message}`);
    if (errors.length > 40) console.log(`    …and ${errors.length - 40} more`);
  } else {
    console.log(`  no invariant violations.`);
  }
  console.log("");
}

process.exit(errors.length ? 2 : 0);
