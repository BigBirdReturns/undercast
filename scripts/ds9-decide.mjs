#!/usr/bin/env node
/**
 * Owner-controlled DS9 eligibility decision authoring.
 * Dry-run is the default. No verdict is inferred or written without --write.
 */
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { copyFile, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { validateDecisions, isSubstantive } from "./lib/eligibility.mjs";

const EVIDENCE = process.env.DS9_EVIDENCE_PATH || "data/ds9/eligibility-evidence.json";
const DECISIONS = process.env.DS9_DECISIONS_PATH || "data/ds9/eligibility-decisions.json";
const LAW = process.env.DS9_LAW_PATH || "GROW.md";
const QUEUE_SCRIPT = process.env.DS9_QUEUE_SCRIPT || "scripts/ds9-eligibility-queue.mjs";
const FIXTURE_SCRIPT = process.env.DS9_FIXTURE_SCRIPT || "scripts/ds9-eligibility-fixtures.mjs";
const args = process.argv.slice(2);
const VALUE_FLAGS = new Set(["--verdict", "--cite", "--rationale", "--by", "--date"]);

function has(name) { return args.includes(name); }
function value(name, { required = false } = {}) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    if (required) throw new Error(`${name} requires a value`);
    return null;
  }
  return next;
}
function listLimit() {
  const index = args.indexOf("--list");
  if (index < 0) return null;
  const next = args[index + 1];
  if (!next || next.startsWith("--")) return 25;
  const parsed = Number(next);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) throw new Error("--list count must be an integer from 1 to 1000");
  return parsed;
}
function positionals() {
  const values = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--list") {
      const next = args[index + 1];
      if (next && !next.startsWith("--") && /^\d+$/.test(next)) index++;
      continue;
    }
    if (VALUE_FLAGS.has(arg)) { index++; continue; }
    if (arg.startsWith("--")) continue;
    values.push(arg);
  }
  return values;
}
function todayUtc() { return new Date().toISOString().slice(0, 10); }
function excerpt(input, max = 180) {
  const text = String(input || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
function runNode(label, script) {
  const result = spawnSync(process.execPath, [resolve(script)], { stdio: "inherit" });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} failed (exit ${result.status ?? "unknown"})`);
}
async function atomicJson(path, valueToWrite) {
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tmp, `${JSON.stringify(valueToWrite, null, 1)}\n`);
  await rename(tmp, path);
}

async function main() {
  const decisionsRaw = await readFile(DECISIONS, "utf8");
  const evidenceDoc = JSON.parse(await readFile(EVIDENCE, "utf8"));
  const dossiers = evidenceDoc.performances;
  if (!dossiers || typeof dossiers !== "object" || Array.isArray(dossiers)) throw new Error(`${EVIDENCE} needs performances{}`);
  const decisionsDoc = JSON.parse(decisionsRaw);
  const decidedKeys = new Set((decisionsDoc.decisions || []).map((decision) => decision.duplicate_key));

  const requestedLimit = listLimit();
  if (requestedLimit !== null) {
    const rows = Object.values(dossiers)
      .filter((dossier) => !decidedKeys.has(dossier.duplicate_key))
      .map((dossier) => ({
        key: dossier.duplicate_key,
        performer: dossier.performer,
        character: dossier.character,
        substantive: (dossier.evidence || []).filter(isSubstantive).length,
        signals: dossier.signals || [],
        on_wall: dossier.on_wall,
      }))
      .sort((a, b) => b.substantive - a.substantive || b.signals.length - a.signals.length || Number(b.on_wall) - Number(a.on_wall) || a.performer.localeCompare(b.performer));
    console.log(`review queue, most decidable first (${rows.length} undecided; showing ${Math.min(requestedLimit, rows.length)}):\n`);
    for (const row of rows.slice(0, requestedLimit)) console.log(`  ${row.key.padEnd(18)} ${String(row.substantive).padStart(2)} substantive  ${row.signals.length ? `[${row.signals.join(",")}] ` : ""}${row.on_wall ? "[on-wall] " : ""}${row.performer} as ${row.character}`);
    console.log('\nnext: npm run ds9:decide -- "<duplicate_key>"');
    return;
  }

  const positional = positionals();
  if (positional.length > 1) throw new Error(`unexpected extra arguments: ${positional.slice(1).map(JSON.stringify).join(" ")} (quote multi-word values and duplicate keys)`);
  const key = positional[0];
  if (!key) throw new Error('usage: ds9:decide --list [N] | ds9:decide "<duplicate_key>" [--verdict ... --cite ... --rationale "..." --by ... [--write]]');
  const dossier = Object.hasOwn(dossiers, key) ? dossiers[key] : null;
  if (!dossier) throw new Error(`no performance for duplicate_key ${key} (dangling)`);

  console.log(`\n${dossier.performer} as ${dossier.character}   [${dossier.duplicate_key}]`);
  console.log(`  status: ${decidedKeys.has(key) ? `DECIDED (already in ${DECISIONS})` : "review"}   on_wall: ${dossier.on_wall}${dossier.wall_ids?.length ? ` ${JSON.stringify(dossier.wall_ids)}` : ""}`);
  if (dossier.species_context?.length) console.log(`  species context: ${dossier.species_context.join(", ")}`);
  if (dossier.signals?.length) console.log(`  signals (hints, not verdicts): ${dossier.signals.join(", ")}`);
  if (dossier.reader_transformation) console.log(`  reader note (unjudged): ${excerpt(dossier.reader_transformation)}`);
  console.log(`  evidence (${dossier.evidence.length}):`);
  dossier.evidence.forEach((evidence, index) => {
    const flags = [evidence.kind, evidence.verified ? "verified" : "UNVERIFIED", isSubstantive(evidence) ? "substantive" : "context"].join(", ");
    console.log(`   [${index + 1}] ${evidence.id}\n       ${flags}${evidence.page ? `  ${evidence.page}@${evidence.revision ?? "?"}` : ""}`);
    if (evidence.basis) console.log(`       "${excerpt(evidence.basis)}"`);
    if (evidence.establishes) console.log(`       establishes: ${excerpt(evidence.establishes, 120)}`);
  });

  const verdict = value("--verdict");
  if (!verdict) {
    console.log('\ndry-run authoring: add --verdict eligible|ineligible --cite <ids|ordinals> --rationale "..." --by <handle> [--date YYYY-MM-DD] [--write]');
    return;
  }
  const byId = new Map(dossier.evidence.map((evidence) => [evidence.id, evidence]));
  const cited = (value("--cite", { required: true }) || "").split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    if (byId.has(entry)) return entry;
    const ordinal = Number(entry);
    if (Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= dossier.evidence.length) return dossier.evidence[ordinal - 1].id;
    return entry;
  });
  const date = value("--date") || todayUtc();
  if (date > todayUtc()) throw new Error(`refusing a decision dated in the future (${date} > ${todayUtc()})`);
  const lawBytes = await readFile(LAW);
  if (!lawBytes.toString("utf8").trim()) throw new Error(`${LAW} is empty — refusing to pin a law with no content`);
  const lawPin = `GROW.md@sha256:${createHash("sha256").update(lawBytes).digest("hex")}`;
  const decision = {
    duplicate_key: key,
    verdict,
    rationale: value("--rationale", { required: true }) || "",
    evidence_ids: cited,
    decided_by: value("--by", { required: true }) || "",
    date,
    grow_md_version: lawPin,
  };
  const prospective = [...(decisionsDoc.decisions || []), decision];
  const { errors } = validateDecisions(prospective, dossiers);
  console.log(`\nprospective decision:\n${JSON.stringify(decision, null, 2)}`);
  if (errors.length) throw new Error(`INVALID — refusing${has("--write") ? " to write" : ""}:\n${errors.map((error) => `  - ${error}`).join("\n")}`);
  console.log(`\nvalid ✓ (law pinned: ${lawPin.slice(0, 30)}…)`);
  if (!has("--write")) { console.log("dry-run only — add --write to record it."); return; }

  const decisionsDir = dirname(DECISIONS);
  const decisionsName = DECISIONS.slice(decisionsDir.length + (decisionsDir === "." ? 0 : 1));
  const stray = (await readdir(decisionsDir)).filter((file) => file.startsWith(`${decisionsName}.bak.`));
  if (stray.length) throw new Error(`refusing to write: stray backup(s) from an interrupted run: ${stray.join(", ")}`);
  if ((await readFile(DECISIONS, "utf8")) !== decisionsRaw) throw new Error(`${DECISIONS} changed since validation — re-run`);

  const backup = `${DECISIONS}.bak.${process.pid}.${Date.now()}`;
  await copyFile(DECISIONS, backup);
  let signalInProgress = false;
  const onSignal = () => {
    if (signalInProgress) return;
    signalInProgress = true;
    try { copyFileSync(backup, DECISIONS); } catch {}
    try { rmSync(backup, { force: true }); } catch {}
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    await atomicJson(DECISIONS, { ...decisionsDoc, decisions: prospective });
    runNode("rebuild queue", QUEUE_SCRIPT);
    runNode("contract fixtures", FIXTURE_SCRIPT);
    await rm(backup, { force: true });
    console.log(`\nrecorded: ${dossier.performer} as ${dossier.character} → ${verdict}. Queue and fixtures green.`);
    console.log("commit the owner decision and regenerated projections to make it durable.");
  } catch (error) {
    await copyFile(backup, DECISIONS);
    await rm(backup, { force: true });
    try {
      runNode("queue rebuild after revert", QUEUE_SCRIPT);
      throw new Error(`REVERTED — ${error.message}. The decisions file and projections were restored.`);
    } catch (rebuildError) {
      if (rebuildError.message.startsWith("REVERTED —")) throw rebuildError;
      throw new Error(`REVERTED the decisions file, but queue rebuild after revert failed (${rebuildError.message}); generated DS9 eligibility projections may be stale`);
    }
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    if (existsSync(backup)) await rm(backup, { force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error(`ds9:decide: ${error.message}`);
  process.exitCode = 1;
});
