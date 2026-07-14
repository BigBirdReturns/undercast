#!/usr/bin/env node
/**
 * ds9-decide.mjs — the owner's decision-authoring tool for the DS9 eligibility
 * review queue. It makes recording a VALID decision cheap; it never makes one.
 *
 * Every guarantee the queue enforces is enforced here FIRST, with the same shared
 * validator (scripts/lib/eligibility.mjs) — a decision that would fail CI cannot
 * be written at all. The GROW.md law version is stamped automatically as an
 * immutable content hash of GROW.md as it exists right now.
 *
 *   npm run ds9:decide -- --list [N]         # rank the queue by decidability
 *   npm run ds9:decide -- <duplicate_key>    # show that performance's dossier
 *   npm run ds9:decide -- <duplicate_key> \
 *       --verdict eligible --cite 2,3 --rationale "..." --by <handle> [--date YYYY-MM-DD]
 *                                            # DRY-RUN: validate + print the decision
 *   ... --write                              # append it, rebuild the queue, run fixtures
 *
 * --cite accepts full content-addressed evidence ids or the [n] ordinals shown in
 * the dossier view (ordinals are an input shorthand only; the file always stores
 * the full ids). Dry-run is the default; nothing changes without --write.
 */
import { readFile, writeFile, copyFile, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { validateDecisions, isSubstantive } from "./lib/eligibility.mjs";

const EVIDENCE = "data/ds9/eligibility-evidence.json";
const DECISIONS = "data/ds9/eligibility-decisions.json";
const LAW = "GROW.md";

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 && !String(argv[i + 1] ?? "").startsWith("--") ? argv[i + 1] : null; };
// a positional is any non-flag token that is not the value of a value-taking flag
const VALUE_FLAGS = new Set(["--verdict", "--cite", "--rationale", "--by", "--date", "--list", "--from"]);
const positional = argv.filter((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(argv[i - 1]));

const dossiers = JSON.parse(await readFile(EVIDENCE, "utf8")).performances;
const decisionsDoc = JSON.parse(await readFile(DECISIONS, "utf8"));
const decidedKeys = new Set((decisionsDoc.decisions || []).map((d) => d.duplicate_key));

// ---------- --list: rank review rows by decidability ----------
if (has("--list")) {
  const n = Number(opt("--list")) || 25;
  const rows = Object.values(dossiers)
    .filter((d) => !decidedKeys.has(d.duplicate_key))
    .map((d) => ({
      key: d.duplicate_key, performer: d.performer, character: d.character,
      substantive: d.evidence.filter(isSubstantive).length,
      signals: d.signals || [], on_wall: d.on_wall,
    }))
    .sort((a, b) => b.substantive - a.substantive || b.signals.length - a.signals.length || Number(b.on_wall) - Number(a.on_wall) || a.performer.localeCompare(b.performer));
  console.log(`review queue, most decidable first (${rows.length} undecided; showing ${Math.min(n, rows.length)}):\n`);
  for (const r of rows.slice(0, n))
    console.log(`  ${r.key.padEnd(18)} ${String(r.substantive).padStart(2)} substantive  ${r.signals.length ? "[" + r.signals.join(",") + "] " : ""}${r.on_wall ? "[on-wall] " : ""}${r.performer} as ${r.character}`);
  console.log(`\nnext: npm run ds9:decide -- <duplicate_key>`);
  process.exit(0);
}

// ---------- resolve the performance ----------
const key = positional[0];
if (!key) { console.error("usage: ds9-decide --list [N] | ds9-decide <duplicate_key> [--verdict ... --cite ... --rationale ... --by ... [--write]]"); process.exit(2); }
const doss = dossiers[key];
if (!doss) { console.error(`no performance for duplicate_key ${key} (dangling)`); process.exit(2); }

// ---------- dossier view ----------
const excerpt = (s, n = 180) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
console.log(`\n${doss.performer} as ${doss.character}   [${doss.duplicate_key}]`);
console.log(`  status: ${decidedKeys.has(key) ? "DECIDED (already in " + DECISIONS + ")" : "review"}   on_wall: ${doss.on_wall}${doss.wall_ids?.length ? " " + JSON.stringify(doss.wall_ids) : ""}`);
if (doss.species_context?.length) console.log(`  species context: ${doss.species_context.join(", ")}`);
if (doss.signals?.length) console.log(`  signals (hints, not verdicts): ${doss.signals.join(", ")}`);
if (doss.reader_transformation) console.log(`  reader note (unjudged): ${excerpt(doss.reader_transformation)}`);
console.log(`  evidence (${doss.evidence.length}):`);
doss.evidence.forEach((e, i) => {
  const flags = [e.kind, e.verified ? "verified" : "UNVERIFIED", isSubstantive(e) ? "substantive" : "context"].join(", ");
  console.log(`   [${i + 1}] ${e.id}\n       ${flags}${e.page ? `  ${e.page}@${e.revision ?? "?"}` : ""}`);
  if (e.basis) console.log(`       "${excerpt(e.basis)}"`);
  if (e.establishes) console.log(`       establishes: ${excerpt(e.establishes, 120)}`);
});

// ---------- authoring ----------
const verdict = opt("--verdict");
if (!verdict) { console.log(`\ndry-run authoring: add --verdict eligible|ineligible --cite <ids|ordinals> --rationale "..." --by <handle> [--date YYYY-MM-DD] [--write]`); process.exit(0); }

const byId = new Map(doss.evidence.map((e) => [e.id, e]));
const cite = (opt("--cite") || "").split(",").map((s) => s.trim()).filter(Boolean).map((c) => {
  if (byId.has(c)) return c;
  const ord = Number(c);
  if (Number.isInteger(ord) && ord >= 1 && ord <= doss.evidence.length) return doss.evidence[ord - 1].id;
  return c; // left as-is; the validator will reject it as stale
});

const today = new Date().toISOString().slice(0, 10);
const growPin = "GROW.md@sha256:" + createHash("sha256").update(await readFile(LAW)).digest("hex");
const decision = {
  duplicate_key: key,
  verdict,
  rationale: opt("--rationale") || "",
  evidence_ids: cite,
  decided_by: opt("--by") || "",
  date: opt("--date") || today,
  grow_md_version: growPin,
};

// validate the WHOLE prospective decisions list with the production validator
const prospective = [...(decisionsDoc.decisions || []), decision];
const { errors } = validateDecisions(prospective, dossiers);
console.log(`\nprospective decision:\n${JSON.stringify(decision, null, 2)}`);
if (errors.length) {
  console.error(`\nINVALID — refusing${has("--write") ? " to write" : ""}:`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`\nvalid ✓ (law pinned: ${growPin.slice(0, 30)}…)`);

if (!has("--write")) { console.log(`dry-run only — add --write to record it.`); process.exit(0); }

// ---------- fail-closed write: backup, write, rebuild, fixtures; revert on any failure ----------
const backup = DECISIONS + ".bak";
await copyFile(DECISIONS, backup);
try {
  await writeFile(DECISIONS, JSON.stringify({ ...decisionsDoc, decisions: prospective }, null, 1) + "\n");
  for (const [label, cmd] of [["rebuild queue", ["scripts/ds9-eligibility-queue.mjs"]], ["contract fixtures", ["scripts/ds9-eligibility-fixtures.mjs"]]]) {
    const r = spawnSync(process.execPath, cmd, { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})`);
  }
  await unlink(backup);
  console.log(`\nrecorded: ${doss.performer} as ${doss.character} → ${verdict}. Queue and fixtures green.`);
  console.log(`commit data/ds9/eligibility-decisions.json + regenerated queue/summary to make it durable.`);
} catch (err) {
  await copyFile(backup, DECISIONS);
  await unlink(backup);
  spawnSync(process.execPath, ["scripts/ds9-eligibility-queue.mjs"], { stdio: "ignore" });
  console.error(`\nREVERTED — ${err.message}. The decisions file is unchanged.`);
  process.exit(1);
}
