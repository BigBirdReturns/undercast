#!/usr/bin/env node
/**
 * gate.mjs — run the ENTIRE canonical gate locally: `npm run gate` (DEC-0011).
 *
 * DEC-0011 rules that `.github/workflows/validate.yml` is the canonical gate and
 * that nothing may maintain "a fragile second copy of shell commands". So this
 * script keeps no copy of any COMMAND: it parses validate.yml and executes its
 * own `run:` steps, in order, in this checkout. What it does keep is a skip-list
 * of machine-setup step NAMES (below) — if those names ever drift from the
 * workflow, the affected step stops being skipped and runs verbatim, so drift
 * makes the gate stricter, never silently weaker.
 *
 *   npm run gate                     # the full contract, as CI runs it
 *   npm run gate -- --skip-rendered  # skip browser steps (no Chromium available)
 *   npm run gate -- --list           # print the steps without running them
 *   npm run gate -- --from "Rebuild DS9"   # resume from the first step matching
 *
 * The parser is deliberately shape-strict and fail-closed: nameless steps,
 * multi-line run blocks, `if:` guards, multiple jobs, or any run: line it did
 * not account for make it refuse to run rather than half-understand the gate.
 */
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const WORKFLOW = ".github/workflows/validate.yml";

// machine-setup steps: skipped or replaced with a cheap local equivalent.
// A rename in the workflow un-skips the step (it then runs verbatim) — loud, not silent.
const SETUP = new Map([
  // npm ci in CI also enforces lockfile<->manifest sync; keep that enforcement
  // locally without reinstalling node_modules on every gate run.
  ["Install rendered-test runtime", "npm ci --dry-run >/dev/null"],
  // browser install is validated by the rendered step itself (and --skip-rendered exists)
  ["Install Chromium", null],
]);
// steps that need a browser (skippable with --skip-rendered)
const RENDERED = [/^Exercise rendered interactions$/i];

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (f) => {
  const i = argv.indexOf(f);
  if (i < 0) return null;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) { console.error(`gate: ${f} needs a value`); process.exit(2); }
  return v;
};

// Minimal, shape-strict parser for this workflow's `- name:` / `run:` step list.
// (Deliberately not a YAML library: the gate must fail loudly if the workflow's
// shape changes, rather than half-understand it.)
function parseSteps(yml) {
  if ((yml.match(/^\s*runs-on:/gm) || []).length !== 1)
    throw new Error(`${WORKFLOW} no longer has exactly one job — update scripts/gate.mjs before trusting this gate`);
  if (/^\s*if:/m.test(yml))
    throw new Error(`${WORKFLOW} has a conditional (if:) step — this gate cannot evaluate it; update scripts/gate.mjs`);
  if (/^\s*shell:/m.test(yml))
    throw new Error(`${WORKFLOW} sets an explicit shell: — this gate assumes the Actions default; update scripts/gate.mjs`);
  const steps = [];
  const lines = yml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*- run:/.test(lines[i]))
      throw new Error(`${WORKFLOW} has a nameless "- run:" step — name it, or update scripts/gate.mjs`);
    const name = lines[i].match(/^\s*- name:\s*(.+?)\s*$/);
    if (!name) continue;
    const runLine = lines[i + 1] ?? "";
    if (/^\s*run:\s*[|>]/.test(runLine))
      throw new Error(`step "${name[1]}" uses a multi-line run block — scripts/gate.mjs only parses single-line run: steps; update the parser before trusting this gate`);
    const run = runLine.match(/^\s*run:\s*(.+?)\s*$/);
    steps.push({ name: name[1], run: run ? run[1] : null });
  }
  if (!steps.length) throw new Error(`no steps parsed from ${WORKFLOW} — its shape changed; update scripts/gate.mjs`);
  // every runnable line in the file must be accounted for — silence is drift
  const runCount = (yml.match(/^\s*(?:- )?run:/gm) || []).length;
  const parsedRuns = steps.filter((s) => s.run).length;
  if (runCount !== parsedRuns)
    throw new Error(`${WORKFLOW} has ${runCount} run: lines but only ${parsedRuns} parsed — a step shape this gate doesn't understand; update scripts/gate.mjs`);
  return steps;
}

const yml = await readFile(WORKFLOW, "utf8");
const all = parseSteps(yml);
const runnable = all
  .filter((s) => s.run)
  .map((s) => (SETUP.has(s.name) ? { ...s, run: SETUP.get(s.name), setup: true } : s))
  .filter((s) => s.run !== null);

if (has("--list")) {
  for (const s of runnable) console.log(`  ${s.setup ? "[setup-equivalent] " : ""}${RENDERED.some((re) => re.test(s.name)) ? "[rendered] " : ""}${s.name}\n      $ ${s.run}`);
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
  // validate.yml sets no shell:, so Actions runs steps under `bash -e {0}`
  // (errexit, NO pipefail). Match that default.
  const r = spawnSync("bash", ["-e", "-c", s.run], { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`\ngate: FAILED at "${s.name}" (exit ${r.status}) after ${ran} passing step(s)`);
    console.error(`      re-run from here: npm run gate -- --from "${s.name}"`);
    process.exit(r.status || 1);
  }
  ran++;
  console.log(`    ok (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}
// fail closed: a gate that executed nothing has validated nothing
if (from && !started) {
  console.error(`gate: FAILED — --from "${from}" matched no step name; nothing ran. Steps:\n${runnable.map((s) => "  " + s.name).join("\n")}`);
  process.exit(2);
}
if (ran === 0) {
  console.error(`gate: FAILED — zero steps executed (${skipped} skipped); an empty run is not a pass`);
  process.exit(2);
}
console.log(`\ngate: PASS — ${ran} step(s) in ${((Date.now() - t0) / 1000).toFixed(0)}s${skipped ? ` (${skipped} skipped)` : ""}`);
