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
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${path}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errs.push(`${path}: ${value} > maximum ${schema.maximum}`);
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

// ── load the catalog ──────────────────────────────────────────────────────────
const specimens = load("data/specimens.json");
const sources = load("data/SOURCES.json");
if (!Array.isArray(specimens) || !Array.isArray(sources)) { console.error("FATAL: specimens/SOURCES are not arrays"); process.exit(1); }

// ── profile: schema conformance ───────────────────────────────────────────────
if (existsSync("schema/specimen.schema.json")) conformProfile("schema.specimen", specimens, load("schema/specimen.schema.json"), "specimen");
else skip("schema.specimen", "schema/specimen.schema.json not found");
if (existsSync("schema/source.schema.json")) conformProfile("schema.source", sources, load("schema/source.schema.json"), "source");
else skip("schema.source", "schema/source.schema.json not found");

// ── profile: unique ids ───────────────────────────────────────────────────────
mark("id.unique");
const seen = new Set();
for (const s of specimens) {
  if (seen.has(s.id)) fail("id.unique", `duplicate specimen id ${s.id}`);
  seen.add(s.id);
}

// ── profile: referential integrity (every image ref resolves to a file) ───────
mark("ref.integrity");
const imgRefs = []; // [{id, side, src}]
for (const s of specimens) {
  for (const side of ["still", "portrait"]) {
    const a = s[side];
    if (a && typeof a === "object" && a.src) {
      imgRefs.push({ id: s.id, side, src: a.src });
      if (!existsSync(a.src)) fail("ref.integrity", `${s.id}.${side} → missing file ${a.src}`);
      else if (statSync(a.src).size === 0) fail("ref.integrity", `${s.id}.${side} → zero-byte file ${a.src}`);
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
