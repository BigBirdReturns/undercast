#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
function integer(name, fallback, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const value = Number(option(name, String(fallback)));
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be an integer in ${minimum}..${maximum}`);
  return value;
}
function withoutWrapperOptions(values) {
  const names = new Set(["--brownout-attempts", "--brownout-base-delay-ms", "--brownout-max-delay-ms", "--adjudicator-script"]);
  const out = [];
  for (let index = 0; index < values.length; index += 1) {
    if (names.has(values[index])) { index += 1; continue; }
    out.push(values[index]);
  }
  return out;
}
function isRetriableBrownout(text) {
  return /github_models_retirement_brownout|GitHub Models 410|temporarily unavailable as part of a scheduled retirement brownout/i.test(String(text));
}
function sleep(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }

export async function runResilientAdjudication({
  adjudicatorScript,
  childArgs,
  attempts,
  baseDelayMs,
  maximumDelayMs,
}) {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = spawnSync(process.execPath, [adjudicatorScript, ...childArgs], {
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      env: process.env,
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status === 0) {
      console.log(`PASS — independent desk completed on resilient attempt ${attempt}/${attempts}`);
      return { attempt, result };
    }
    last = result;
    const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
    if (!isRetriableBrownout(combined)) {
      throw new Error(`independent desk failed with a non-retriable error on attempt ${attempt}: exit ${result.status ?? 1}`);
    }
    if (attempt === attempts) break;
    const delay = Math.min(maximumDelayMs, baseDelayMs * (2 ** (attempt - 1)));
    console.log(`RETRY — GitHub Models brownout on attempt ${attempt}/${attempts}; retained packets remain authoritative; waiting ${delay}ms`);
    await sleep(delay);
  }
  throw new Error(`GitHub Models brownout persisted through ${attempts} retained-artifact attempts; source rediscovery remains forbidden; last exit ${last?.status ?? 1}`);
}

async function main() {
  const attempts = integer("--brownout-attempts", 10, 1, 30);
  const baseDelayMs = integer("--brownout-base-delay-ms", 30_000, 1, 600_000);
  const maximumDelayMs = integer("--brownout-max-delay-ms", 300_000, baseDelayMs, 1_800_000);
  const defaultScript = fileURLToPath(new URL("./card-backfill-machine-adjudicate.mjs", import.meta.url));
  const adjudicatorScript = resolve(option("--adjudicator-script", defaultScript));
  const childArgs = withoutWrapperOptions(args);
  await runResilientAdjudication({ adjudicatorScript, childArgs, attempts, baseDelayMs, maximumDelayMs });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`card-backfill resilient machine adjudicate: ${error.message}`);
    process.exit(1);
  });
}
