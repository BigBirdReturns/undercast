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
if (!Array.isArray(specimens) || !Array.isArray(sources)) { console.error("FATAL: specimens/SOURCES are not arrays"); process.exit(1); }
// media manifest (optional): images whose bytes live on GitHub Releases
const media = existsSync("data/media-manifest.json") ? load("data/media-manifest.json") : null;
const mediaAssets = (media && media.assets) || {};
const onRelease = (src) => mediaAssets[src] && mediaAssets[src].location === "release"; // resolvable without a local file
const hashBytes = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

// ── profile: schema conformance ───────────────────────────────────────────────
if (existsSync("schema/specimen.schema.json")) conformProfile("schema.specimen", specimens, load("schema/specimen.schema.json"), "specimen");
else skip("schema.specimen", "schema/specimen.schema.json not found");
if (existsSync("schema/source.schema.json")) conformProfile("schema.source", sources, load("schema/source.schema.json"), "source");
else skip("schema.source", "schema/source.schema.json not found");
if (existsSync("data/archive.json") && existsSync("schema/archive.schema.json")) conformObjectProfile("schema.archive", load("data/archive.json"), load("schema/archive.schema.json"), "archive");
else skip("schema.archive", "archive contract or schema missing");
if (existsSync("data/entities.json") && existsSync("schema/entities.schema.json")) conformObjectProfile("schema.entities", load("data/entities.json"), load("schema/entities.schema.json"), "entities");
else skip("schema.entities", "entity projection or schema missing");

// ── profile: unique ids ───────────────────────────────────────────────────────
mark("id.unique");
const seen = new Set();
for (const s of specimens) {
  if (seen.has(s.id)) fail("id.unique", `duplicate specimen id ${s.id}`);
  seen.add(s.id);
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
const hashFile = (p) => sha256Hex(readFileSync(p, "utf8").replace(/\n$/, ""));
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
    const idxIds = new Set(index.map((e) => e.id));
    if (idxIds.size !== index.length) fail("projection.consistency", "duplicate id in index.json");
    for (const s of specimens) if (!idxIds.has(s.id)) fail("projection.consistency", `${s.id} missing from index.json`);
    // 4. every shard file present, hash-verified; union of records == the roster, once each
    const shardIds = new Set();
    for (let i = 0; i < manifest.shards.length; i++) {
      const m = manifest.shards[i];
      if (!existsSync("data/" + m.file)) { fail("projection.consistency", `shard ${m.file} missing`); continue; }
      if (m.sha256 !== hashFile("data/" + m.file)) fail("projection.consistency", `shard ${m.file} bytes ≠ manifest sha256`);
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
  const specIdSet = new Set(specimens.map((s) => s.id));
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
  for (const item of [archive.canonical?.records, archive.canonical?.sources, archive.projections?.lean_index, archive.projections?.shard_manifest, archive.projections?.entities, archive.projections?.search, archive.projections?.media_live, archive.vocabularies?.conditions, ...(archive.web_assets || [])]) {
    if (!item?.path || !existsSync(item.path)) { fail("contract.consistency", `contract path missing: ${item?.path || "undefined"}`); continue; }
    if (item.sha256 !== hashBytes(item.path)) fail("contract.consistency", `${item.path} sha256 drift — rebuild contract`);
    if (item.bytes !== statSync(item.path).size) fail("contract.consistency", `${item.path} byte count drift`);
  }
  const search = load("data/search/manifest.json");
  if (search.generated_from !== manifest.source_sha256) fail("contract.consistency", "search projection was not built from current truth");
  for (const shard of search.shards || []) {
    if (!existsSync(shard.file)) fail("contract.consistency", `search shard missing: ${shard.file}`);
    else if (shard.sha256 !== hashFile(shard.file)) fail("contract.consistency", `search shard hash drift: ${shard.file}`);
  }
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
  if (recordUrls !== specimens.length) fail("crawler.discovery", `sitemap exposes ${recordUrls} record routes, expected ${specimens.length}`);
}
for (const pagePath of ["index.html", "recognition.html"]) {
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
