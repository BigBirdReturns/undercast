#!/usr/bin/env node
import { resolve } from "node:path";
import { mergeSourceCacheDeltas } from "./lib/card-backfill-source-cache.mjs";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

const inputRoot = resolve(option("--input-root"));
const outputRoot = resolve(option("--out"));
const receipt = await mergeSourceCacheDeltas({ inputRoot, outputRoot, now: option("--now", new Date().toISOString()) });
console.log(`PASS — merged source metadata cache: entries=${receipt.counts.entries} added=${receipt.counts.added} reused=${receipt.counts.already_present}`);
console.log(`CACHE — ${outputRoot}`);
