#!/usr/bin/env node
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
async function exists(path) { try { return (await stat(path)).isFile(); } catch (error) { if (error.code === "ENOENT") return false; throw error; } }

const decisionsRoot = resolve(option("--decisions-root", ".github/card-backfill/adjudications"));
const receiptsRoot = resolve(option("--receipts-root", "data/review/card-backfill-staging/adjudications"));
const out = option("--out", null);
let names = [];
try { names = (await readdir(decisionsRoot)).filter((name) => name.endsWith(".json")).sort(); } catch (error) { if (error.code !== "ENOENT") throw error; }
const pending = [];
for (const name of names) {
  const path = join(decisionsRoot, name);
  const value = JSON.parse(await readFile(path, "utf8"));
  if (value?.version !== 1 || value?.status !== "ready" || !value.batch_sha256) continue;
  const receipt = join(receiptsRoot, `${value.batch_sha256}.json`);
  if (await exists(receipt)) continue;
  pending.push({ path: `.github/card-backfill/adjudications/${name}`, batch_sha256: value.batch_sha256, workflow_run_id: value.source?.workflow_run_id || null });
}
const result = {
  version: 1,
  lane: "card-backfill-ready-decision-barrier",
  blocked: pending.length > 0,
  pending_count: pending.length,
  pending,
  rediscovery_allowed: pending.length === 0,
  canonical_mutation: false,
};
if (out) { await mkdir(dirname(resolve(out)), { recursive: true }); await writeFile(resolve(out), JSON.stringify(result, null, 2) + "\n"); }
if (pending.length) {
  console.error(`BLOCKED — ${pending.length} ready decision file(s) must be reduced from retained artifacts before new discovery`);
  for (const row of pending) console.error(`  ${row.path}`);
  process.exit(75);
}
console.log("PASS — no ready decision is waiting for retained-artifact staging");
