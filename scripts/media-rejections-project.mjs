#!/usr/bin/env node
// Project a reviewed media-correction ledger into data/MEDIA-REJECTIONS.json.
//
// The rejection document is a fail-closed projection of reviewed invalid media objects.
// Its first 144 rules were compiled by hand from the 2026-07-25 correction ledgers and the
// UC-MEDIA-AUDIT-1 journal; this script makes later decisions reproducible: one ledger,
// one decision id, one denominator key, deterministic rule ids, hash-pinned evidence.
//
//   node scripts/media-rejections-project.mjs \
//     --ledger data/review/estate-debt/UC-MEDIA-AUDIT-2-CORRECTION-LEDGER.json \
//     --decision UC-MEDIA-AUDIT-2 --denominator-key uc_media_audit_2 \
//     --evidence data/review/estate-debt/UC-MEDIA-AUDIT-2-20261022.jsonl \
//     [--scope-rule mrj_... --scope-note "..."] [--now ISO] [--write]
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mediaRejectionRuleId, normalizeMediaLocator, validateMediaRejections } from "./lib/media-rejections.mjs";

const DEFAULT_REJECTIONS = "data/MEDIA-REJECTIONS.json";
const DECISION_RE = /^[A-Z0-9][A-Z0-9-]{2,63}$/;
const DENOMINATOR_KEY_RE = /^[a-z][a-z0-9_]{2,63}$/;
const RECORD_SIDE_SCOPE_NOTE = "Optional per-rule `hash_scope`: `record-side` confines the exact-byte denial to the rule's own wall_id and side because independent hash-bound review verified the same bytes for another record side; absent or `global` denies the bytes everywhere.";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function safeRelative(value, label) {
  const text = String(value || "").replaceAll("\\", "/");
  if (!text || path.isAbsolute(text) || text.split("/").includes("..")) throw new Error(`${label} must be a safe repository-relative path`);
  return text;
}

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function options(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== name) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
    values.push(value);
  }
  return values;
}

export async function projectMediaRejections({
  root = process.cwd(),
  ledgerPath,
  decision,
  denominatorKey,
  evidencePaths = [],
  scopeRules = [],
  rejectionsPath = DEFAULT_REJECTIONS,
  now = new Date().toISOString(),
  write = false,
} = {}) {
  const resolvedRoot = path.resolve(root);
  if (!DECISION_RE.test(String(decision || ""))) throw new Error("--decision must be a safe upper-case identifier");
  if (!DENOMINATOR_KEY_RE.test(String(denominatorKey || ""))) throw new Error("--denominator-key must be a safe snake_case key");
  const rejectionsSafe = safeRelative(rejectionsPath, "rejections path");
  const document = JSON.parse(await readFile(path.join(resolvedRoot, rejectionsSafe), "utf8"));
  validateMediaRejections(document);
  const ledgerSafe = safeRelative(ledgerPath, "correction ledger path");
  const ledger = JSON.parse(await readFile(path.join(resolvedRoot, ledgerSafe), "utf8"));
  if (!Array.isArray(ledger.items) || !ledger.items.length) throw new Error(`${ledgerSafe} lacks items[]`);
  if (ledger.decision && ledger.decision !== decision) throw new Error(`${ledgerSafe} records decision ${ledger.decision}, not ${decision}`);
  if (document.denominator[denominatorKey] !== undefined) throw new Error(`denominator.${denominatorKey} already exists; a decision projects once`);
  if (document.rules.some((rule) => rule.decision === decision)) throw new Error(`${decision} already has projected rules`);

  const existingIds = new Set(document.rules.map((rule) => rule.rule_id));
  const existingKeys = new Set(document.rules.map((rule) => `${rule.wall_id}/${rule.side}/${rule.asset_sha256}`));
  const added = [];
  for (const [index, item] of ledger.items.entries()) {
    const label = `${ledgerSafe} items[${index}]`;
    const sourceLocator = /^https?:\/\//i.test(String(item.source_locator || "")) ? normalizeMediaLocator(item.source_locator) : null;
    const rule = {
      rule_id: null,
      state: "rejected",
      wall_id: item.id,
      side: item.side,
      expected_subject: item.expected_subject,
      asset_sha256: String(item.sha256 || "").toLowerCase(),
      source_locator: sourceLocator,
      preserved_path: item.preserved_path,
      decision,
      ruling: item.ruling,
      evidence: ledgerSafe,
    };
    rule.rule_id = mediaRejectionRuleId(rule);
    const key = `${rule.wall_id}/${rule.side}/${rule.asset_sha256}`;
    if (existingKeys.has(key)) throw new Error(`${label}: ${key} is already rejected`);
    if (existingIds.has(rule.rule_id)) throw new Error(`${label}: rule id collision for ${key}`);
    existingKeys.add(key);
    existingIds.add(rule.rule_id);
    added.push(rule);
  }

  const rules = document.rules.map((rule) => ({ ...rule }));
  for (const { rule_id: ruleId, scope_note: scopeNote } of scopeRules) {
    const rule = rules.find((row) => row.rule_id === ruleId);
    if (!rule) throw new Error(`cannot scope unknown rule ${ruleId}`);
    if (!String(scopeNote || "").trim()) throw new Error(`--scope-rule ${ruleId} requires --scope-note`);
    rule.hash_scope = "record-side";
    rule.scope_note = String(scopeNote).trim();
  }

  const next = {
    ...document,
    generated_at: now,
    matching: scopeRules.length || rules.some((rule) => rule.hash_scope) ? { ...document.matching, hash_scope: RECORD_SIDE_SCOPE_NOTE } : document.matching,
    denominator: { ...document.denominator, rules: rules.length + added.length, [denominatorKey]: added.length },
    source_ledgers: document.source_ledgers.map((row) => ({ ...row })),
    rules: [...rules, ...added],
  };
  for (const relative of [ledgerSafe, ...evidencePaths.map((value) => safeRelative(value, "evidence path"))]) {
    const digest = sha256(await readFile(path.join(resolvedRoot, relative)));
    const existing = next.source_ledgers.find((row) => row.path === relative);
    if (existing) {
      if (existing.sha256 !== digest) throw new Error(`source ledger ${relative} changed after it was pinned`);
      continue;
    }
    next.source_ledgers.push({ path: relative, sha256: digest });
  }
  validateMediaRejections(next);
  if (write) await writeFile(path.join(resolvedRoot, rejectionsSafe), `${JSON.stringify(next, null, 2)}\n`);
  return {
    mode: write ? "write" : "dry-run",
    decision,
    added: added.length,
    scoped: scopeRules.map((row) => row.rule_id),
    rules: next.rules.length,
    denominator: next.denominator,
    rule_ids: added.map((rule) => rule.rule_id),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const scopeRuleIds = options(argv, "--scope-rule");
  const scopeNotes = options(argv, "--scope-note");
  if (scopeRuleIds.length !== scopeNotes.length) throw new Error("every --scope-rule needs exactly one --scope-note");
  const result = await projectMediaRejections({
    root: path.resolve(option(argv, "--root", ".")),
    ledgerPath: option(argv, "--ledger"),
    decision: option(argv, "--decision"),
    denominatorKey: option(argv, "--denominator-key"),
    evidencePaths: options(argv, "--evidence"),
    scopeRules: scopeRuleIds.map((ruleId, index) => ({ rule_id: ruleId, scope_note: scopeNotes[index] })),
    rejectionsPath: option(argv, "--rejections", DEFAULT_REJECTIONS),
    now: option(argv, "--now", new Date().toISOString()),
    write: argv.includes("--write"),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`media rejections projection failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
