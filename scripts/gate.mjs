#!/usr/bin/env node
/**
 * gate.mjs — run the ENTIRE canonical gate locally: `npm run gate` (DEC-0011).
 *
 * DEC-0011 rules that `.github/workflows/validate.yml` is the canonical gate and
 * that nothing may maintain "a fragile second copy of shell commands". So this
 * script keeps no copy at all: it PARSES validate.yml and executes its own `run:`
 * steps, in order, in this checkout. If the workflow changes, the gate changes
 * with it — they cannot diverge.
 *
 *   npm run gate                     # the full contract, exactly as CI runs it
 *   npm run gate -- --skip-rendered  # skip browser steps (no Chromium available)
 *   npm run gate -- --list           # print the steps without running them
 *   npm run gate -- --from "Rebuild DS9"   # resume from the first step matching
 *
 * Environment-setup steps (checkout, node, npm ci, browser install) are skipped —
 * they prepare a CI machine, not the contract. Everything else runs verbatim.
 */
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const WORKFLOW = ".github/workflows/validate.yml";

// steps that prepare the CI machine rather than validate the archive
const SETUP = [/^Install rendered-test runtime$/i, /^Install Chromium$/i];
// steps that need a browser (skippable with --skip-rendered)
const RENDERED = [/^Exercise rendered interactions$/i];

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

// Minimal, shape-strict parser for this workflow's `- name:` / `run:` step list.
// (Deliberately not a YAML library: the gate must fail loudly if the workflow's
// shape changes, rather than half-understand it.)
function parseSteps(yml) {
  const steps = [];
  const lines = yml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const name = lines[i].match(/^\s*- name:\s*(.+?)\s*$/);
    if (!name) continue;
    const run = lines[i + 1]?.match(/^\s*run:\s*(.+?)\s*$/);
    steps.push({ name: name[1], run: run ? run[1] : null });
  }
  if (!steps.length) throw new Error(`no steps parsed from ${WORKFLOW} — its shape changed; update scripts/gate.mjs`);
  return steps;
}

const yml = await readFile(WORKFLOW, "utf8");
const all = parseSteps(yml);
const runnable = all.filter((s) => s.run && !SETUP.some((re) => re.test(s.name)));

if (has("--list")) {
  for (const s of runnable) console.log(`  ${RENDERED.some((re) => re.test(s.name)) ? "[rendered] " : ""}${s.name}\n      $ ${s.run}`);
  process.exit(0);
}

const from = opt("--from");
let started = !from;
let ran = 0, skipped = 0;
const t0 = Date.now();
console.log(`gate: executing ${WORKFLOW} (${runnable.length} steps)\n`);
for (const s of runnable) {
  if (!started && s.name.toLowerCase().includes(from.toLowerCase())) started = true;
  if (!started) { console.log(`  ~ skipped (before --from): ${s.name}`); skipped++; continue; }
  if (has("--skip-rendered") && RENDERED.some((re) => re.test(s.name))) {
    console.log(`  ~ skipped (--skip-rendered): ${s.name}`); skipped++; continue;
  }
  const t = Date.now();
  process.stdout.write(`  > ${s.name}\n`);
  const r = spawnSync("bash", ["-c", s.run], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\ngate: FAILED at "${s.name}" (exit ${r.status}) after ${ran} passing step(s)`);
    console.error(`      re-run from here: npm run gate -- --from "${s.name}"`);
    process.exit(r.status || 1);
  }
  ran++;
  console.log(`    ok (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}
console.log(`\ngate: PASS — ${ran} step(s) in ${((Date.now() - t0) / 1000).toFixed(0)}s${skipped ? ` (${skipped} skipped)` : ""}`);
