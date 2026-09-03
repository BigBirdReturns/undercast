#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const BASELINE_COMMIT = '38116aaf55371fd267db4733bba17a5fcb39d9fd';
const BASELINE_TOTAL = 2228;
const WRAPPER = 'scripts/star-trek-history-composable.mjs';
const HISTORY_ROUTE = 'star-trek:history:check';
const IN_FLIGHT = new Set(['leased', 'drafted', 'merged']);
const TERMINAL = new Set(['resolved', 'rejected']);
const VALID_STATUSES = new Set([
  'queued',
  'leased',
  'drafted',
  'merged',
  'blocked',
  'attention',
  'resolved',
  'rejected',
  'retired',
]);

const ROUTES = [
  {
    route: 'star-trek:lwaxana-eligibility-rejection:check',
    script: 'scripts/star-trek-lwaxana-eligibility-rejection-composable.mjs',
  },
  {
    route: 'star-trek:kzinti-flyer-cycle:check',
    script: 'scripts/star-trek-kzinti-flyer-cycle.mjs',
  },
  {
    route: 'star-trek:lorot-cycle:check',
    script: 'scripts/star-trek-lorot-cycle.mjs',
  },
  {
    route: 'star-trek:maryl-cycle:check',
    script: 'scripts/star-trek-maryl-cycle.mjs',
  },
  {
    route: 'star-trek:queen-of-hearts-cycle:check',
    script: 'scripts/star-trek-queen-of-hearts-cycle.mjs',
  },
  {
    route: 'star-trek:anastasia-komananov-cycle:check',
    script: 'scripts/star-trek-anastasia-komananov-cycle.mjs',
  },
  {
    route: 'star-trek:alice-cycle:check',
    script: 'scripts/star-trek-alice-cycle.mjs',
  },
  {
    route: 'star-trek:benbassat-cycle:check',
    script: 'scripts/star-trek-benbassat-cycle.mjs',
  },
  {
    route: 'star-trek:morgo-cycle:check',
    script: 'scripts/star-trek-morgo-cycle-composable.mjs',
  },
  {
    route: 'star-trek:risik-cycle:check',
    script: 'scripts/star-trek-risik-cycle.mjs',
  },
];

const SEALED_TASK_IDS = new Set([
  'ap_a65494e8328ca262d82a49c0',
  'ap_8f2b1b123aa02bbbb27d00b4',
  'ap_9b7123237c640f1ce0a16ffe',
  'ap_a7bae45c6030e1212e1ad6b0',
  'ap_a2fc2c7b0d3dec8a244ef048',
  'ap_82712ddec2c606e4c7d1a152',
  'ap_c7ff8298a99fe94fc55bbdbc',
  'ap_dd7d1c73ed237230cd6e1d0b',
  'ap_a7fb29c5cce85c86708ea0e6',
  'ap_096624f177ae0c9f2e91836c',
]);

const SEALED_WALL_IDS = Array.from({ length: 9 }, (_, index) => `UC-${1391 + index}`);
const PREFIXES = [
  'star-trek-lwaxana-eligibility-rejection',
  'star-trek-kzinti-flyer',
  'star-trek-lorot',
  'star-trek-maryl',
  'star-trek-queen-of-hearts',
  'star-trek-anastasia-komananov',
  'star-trek-alice',
  'star-trek-benbassat',
  'star-trek-morgo',
  'star-trek-risik',
];

const fail = (message) => {
  throw new Error(`star-trek-history-composable: ${message}`);
};
const ok = (value, message) => {
  if (!value) fail(message);
};
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const stableJson = (value) => JSON.stringify(stable(value));
const same = (actual, expected, message) => ok(stableJson(actual) === stableJson(expected), message);
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const readJson = (root, relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const readJsonl = (root, relative) => fs.readFileSync(path.join(root, relative), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const fileSha256 = (root, relative) => sha256(fs.readFileSync(path.join(root, relative)));

function run(label, executable, args, { cwd = process.cwd(), quiet = false } = {}) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: process.env,
  });
  if (result.error) fail(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    fail(`${label} failed (${result.status}):\n${result.stdout || ''}\n${result.stderr || ''}`);
  }
  if (!quiet && result.stdout) process.stdout.write(result.stdout);
  if (!quiet && result.stderr) process.stderr.write(result.stderr);
  return result;
}

function assertUniqueJobs(jobs, label) {
  const ids = new Set();
  for (const job of jobs) {
    ok(/^ap_[0-9a-f]{24}$/i.test(job.id || ''), `${label} contains an invalid task ID`);
    ok(!ids.has(job.id), `${label} contains duplicate task ${job.id}`);
    ids.add(job.id);
  }
}

function assertCurrentRoutes(currentRoot) {
  const pkg = readJson(currentRoot, 'package.json');
  const scripts = pkg.scripts || {};
  ok(scripts[HISTORY_ROUTE] === `node ${WRAPPER}`, 'history package route drifted');
  for (const entry of ROUTES) {
    ok(
      scripts[entry.route] === `node ${WRAPPER} ${entry.route}`,
      `${entry.route} is not routed through historical composability`,
    );
  }
  const fixture = scripts['autopilot:fixtures'] || '';
  ok(fixture.includes(`npm run ${HISTORY_ROUTE}`), 'Autopilot fixtures omit the historical composability route');
  for (const entry of ROUTES) {
    ok(!fixture.includes(`npm run ${entry.route}`), `Autopilot fixtures still execute live-bound route ${entry.route}`);
  }
}

function listFiles(root, relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  if (!fs.existsSync(directory)) return [];
  const found = [];
  const walk = (absolute) => {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(absolute, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile()) found.push(path.relative(root, child).split(path.sep).join('/'));
    }
  };
  walk(directory);
  return found.sort();
}

function selectedImmutableFiles(root) {
  const scripts = listFiles(root, 'scripts').filter((relative) => {
    if (path.posix.dirname(relative) !== 'scripts') return false;
    const basename = path.posix.basename(relative);
    return PREFIXES.some((prefix) => basename.startsWith(prefix));
  });
  const reviews = listFiles(root, 'data/review/adapter-sdk').filter((relative) => {
    const nestedLwaxana = relative.startsWith(
      'data/review/adapter-sdk/star-trek-lwaxana-eligibility-rejection/',
    );
    const basename = path.posix.basename(relative);
    return nestedLwaxana || PREFIXES.some((prefix) => basename.startsWith(prefix));
  });
  return [...scripts, ...reviews].sort();
}

function assertImmutableCycleFiles(baselineRoot, currentRoot) {
  const baselineFiles = selectedImmutableFiles(baselineRoot);
  const currentFiles = selectedImmutableFiles(currentRoot);
  same(currentFiles, baselineFiles, 'sealed Star Trek checker or receipt path set drifted');
  ok(baselineFiles.length >= 40, `sealed path set is unexpectedly small (${baselineFiles.length})`);
  for (const relative of baselineFiles) {
    ok(
      fileSha256(currentRoot, relative) === fileSha256(baselineRoot, relative),
      `sealed file drifted: ${relative}`,
    );
  }
  return baselineFiles.length;
}

function oneById(rows, id, label) {
  const matches = rows.filter((row) => row.id === id);
  ok(matches.length === 1, `${label} ${id} cardinality drifted (${matches.length})`);
  return matches[0];
}

function assetPath(asset) {
  if (typeof asset === 'string') return asset;
  if (asset && typeof asset === 'object') return asset.src || asset.path || null;
  return null;
}

function assertSealedCanonicalProjections(baselineRoot, currentRoot) {
  const baselineRecords = readJson(baselineRoot, 'data/specimens.json');
  const currentRecords = readJson(currentRoot, 'data/specimens.json');
  const baselineSources = readJson(baselineRoot, 'data/SOURCES.json');
  const currentSources = readJson(currentRoot, 'data/SOURCES.json');
  const baselineAudit = readJson(baselineRoot, 'data/MEDIA-AUDIT.json').items;
  const currentAudit = readJson(currentRoot, 'data/MEDIA-AUDIT.json').items;
  const sitemap = fs.readFileSync(path.join(currentRoot, 'sitemap.xml'), 'utf8');

  let assets = 0;
  for (const wallId of SEALED_WALL_IDS) {
    const baselineRecord = oneById(baselineRecords, wallId, 'baseline record');
    const currentRecord = oneById(currentRecords, wallId, 'current record');
    same(currentRecord, baselineRecord, `${wallId} canonical record drifted`);

    const baselineSource = oneById(baselineSources, wallId, 'baseline source');
    const currentSource = oneById(currentSources, wallId, 'current source');
    same(currentSource, baselineSource, `${wallId} source ledger drifted`);

    const baselineFacets = baselineAudit
      .filter((row) => row.wall_id === wallId)
      .sort((a, b) => a.id.localeCompare(b.id));
    const currentFacets = currentAudit
      .filter((row) => row.wall_id === wallId)
      .sort((a, b) => a.id.localeCompare(b.id));
    same(currentFacets, baselineFacets, `${wallId} media audit drifted`);
    ok(sitemap.includes(`records/${wallId}/`), `${wallId} permanent route is absent`);

    const localAssets = new Set();
    for (const candidate of [
      baselineRecord.still,
      baselineRecord.portrait,
      baselineSource.still,
      baselineSource.portrait,
      ...baselineFacets.map((facet) => facet.asset),
    ]) {
      const relative = assetPath(candidate);
      if (typeof relative === 'string' && /^(?:images|assets)\//.test(relative)) localAssets.add(relative);
    }
    for (const relative of localAssets) {
      ok(fs.existsSync(path.join(baselineRoot, relative)), `${wallId} baseline asset is absent: ${relative}`);
      ok(fs.existsSync(path.join(currentRoot, relative)), `${wallId} current asset is absent: ${relative}`);
      ok(
        fileSha256(currentRoot, relative) === fileSha256(baselineRoot, relative),
        `${wallId} asset bytes drifted: ${relative}`,
      );
      assets += 1;
    }
  }
  return assets;
}

function assertHistoricalJournals(baselineRoot, currentRoot, cycles) {
  const leaseIds = new Set(cycles.map((cycle) => cycle.lease_id));
  let preserved = 0;
  for (const relative of ['data/journal/autopilot.jsonl', 'data/journal/waterline.jsonl']) {
    const baselineRows = readJsonl(baselineRoot, relative).filter((row) => (
      SEALED_TASK_IDS.has(row.task_id)
      || leaseIds.has(row.lease_id)
    ));
    const currentRows = readJsonl(currentRoot, relative);
    const currentById = new Map(currentRows.map((row) => [row.id, row]));
    ok(baselineRows.length > 0, `${relative} has no sealed baseline events`);
    for (const row of baselineRows) {
      const current = currentById.get(row.id);
      ok(current, `${relative} lost historical event ${row.id}`);
      same(current, row, `${relative} historical event ${row.id} drifted`);
      preserved += 1;
    }
  }
  return preserved;
}

function assertSuccessorProjection(baselineRoot, currentRoot) {
  assertCurrentRoutes(currentRoot);
  const baselineState = readJson(baselineRoot, 'data/AUTOPILOT.json');
  const currentState = readJson(currentRoot, 'data/AUTOPILOT.json');
  const baselineJobs = baselineState.jobs.filter((row) => row.scope === 'star-trek');
  const currentJobs = currentState.jobs.filter((row) => row.scope === 'star-trek');
  assertUniqueJobs(baselineJobs, 'baseline Star Trek projection');
  assertUniqueJobs(currentJobs, 'current Star Trek projection');
  ok(baselineJobs.length === BASELINE_TOTAL, `historical denominator drifted (${baselineJobs.length})`);
  ok(currentJobs.length >= BASELINE_TOTAL, `current denominator regressed (${currentJobs.length})`);

  const baselineById = new Map(baselineJobs.map((row) => [row.id, row]));
  const currentById = new Map(currentJobs.map((row) => [row.id, row]));
  for (const job of currentJobs) {
    ok(VALID_STATUSES.has(job.status), `current task ${job.id} has invalid status ${job.status}`);
    ok(typeof job.performer === 'string' && job.performer.trim(), `current task ${job.id} lost performer identity`);
    ok(typeof job.character === 'string' && job.character.trim(), `current task ${job.id} lost character identity`);
    ok(/^[0-9a-f]{64}$/i.test(job.source_fingerprint || ''), `current task ${job.id} has invalid source fingerprint`);
  }

  let terminalPreserved = 0;
  for (const baseline of baselineJobs) {
    const current = currentById.get(baseline.id);
    ok(current, `historical task disappeared: ${baseline.id}`);
    ok(current.performer === baseline.performer, `historical performer drifted: ${baseline.id}`);
    ok(current.character === baseline.character, `historical character drifted: ${baseline.id}`);
    if (TERMINAL.has(baseline.status)) {
      ok(current.status === baseline.status, `historical terminal task reopened: ${baseline.id}`);
      same(current.wall_ids || [], baseline.wall_ids || [], `historical wall custody drifted: ${baseline.id}`);
      same(current.outcome ?? null, baseline.outcome ?? null, `historical outcome drifted: ${baseline.id}`);
      ok(current.attempts === baseline.attempts, `historical attempts drifted: ${baseline.id}`);
      terminalPreserved += 1;
    }
  }

  for (const taskId of SEALED_TASK_IDS) {
    const baseline = baselineById.get(taskId);
    const current = currentById.get(taskId);
    ok(baseline && current, `sealed task missing: ${taskId}`);
    ok(current.source_fingerprint === baseline.source_fingerprint, `sealed task fingerprint drifted: ${taskId}`);
    same(current.performance_modes || [], baseline.performance_modes || [], `sealed task modes drifted: ${taskId}`);
  }

  const active = currentJobs.filter((row) => IN_FLIGHT.has(row.status));
  ok(active.length <= 1, `current Star Trek projection has ${active.length} in-flight tasks`);
  const newJobs = currentJobs.filter((row) => !baselineById.has(row.id));
  const retired = currentJobs.filter((row) => row.status === 'retired');

  const immutableFiles = assertImmutableCycleFiles(baselineRoot, currentRoot);
  const assets = assertSealedCanonicalProjections(baselineRoot, currentRoot);

  const baselineWater = readJson(baselineRoot, 'data/WATERLINE-STATE.json');
  const currentWater = readJson(currentRoot, 'data/WATERLINE-STATE.json');
  const baselineCycles = baselineWater.cycles.filter((cycle) => (
    Object.keys(cycle.task_statuses || {}).some((taskId) => SEALED_TASK_IDS.has(taskId))
  ));
  ok(baselineCycles.length === SEALED_TASK_IDS.size, `sealed cycle cardinality drifted (${baselineCycles.length})`);
  const currentCycles = new Map(currentWater.cycles.map((cycle) => [cycle.id, cycle]));
  for (const cycle of baselineCycles) {
    const current = currentCycles.get(cycle.id);
    ok(current, `sealed waterline cycle disappeared: ${cycle.id}`);
    same(current, cycle, `sealed waterline cycle drifted: ${cycle.id}`);
  }
  const journalEvents = assertHistoricalJournals(baselineRoot, currentRoot, baselineCycles);

  return {
    baseline_total: baselineJobs.length,
    current_total: currentJobs.length,
    population_delta: currentJobs.length - baselineJobs.length,
    new_tasks: newJobs.length,
    retired_tasks: retired.length,
    in_flight: active.length,
    terminal_tasks_preserved: terminalPreserved,
    sealed_cycles: baselineCycles.length,
    sealed_files: immutableFiles,
    sealed_assets: assets,
    sealed_journal_events: journalEvents,
  };
}

function parseArguments(argv) {
  if (argv[0] === '--projection-only') {
    const index = argv.indexOf('--baseline-dir');
    ok(index >= 0 && argv[index + 1], '--projection-only requires --baseline-dir PATH');
    return { projectionOnly: true, baselineDir: path.resolve(argv[index + 1]), focus: null };
  }
  ok(argv.length <= 1, `unexpected arguments: ${argv.join(' ')}`);
  const focus = argv[0] || null;
  if (focus) ok(ROUTES.some((entry) => entry.route === focus), `unknown historical route ${focus}`);
  return { projectionOnly: false, baselineDir: null, focus };
}

const args = parseArguments(process.argv.slice(2));
const currentRoot = process.cwd();

if (args.projectionOnly) {
  ok(fs.existsSync(path.join(args.baselineDir, 'data/AUTOPILOT.json')), 'baseline directory is not an UNDERCAST tree');
  const report = assertSuccessorProjection(args.baselineDir, currentRoot);
  console.log(`star-trek-history-composable: PASS — projection-only ${JSON.stringify(report)}`);
  process.exit(0);
}

assertCurrentRoutes(currentRoot);
const top = run('resolve repository root', 'git', ['rev-parse', '--show-toplevel'], { quiet: true }).stdout.trim();
ok(path.resolve(top) === path.resolve(currentRoot), 'checker must run from the repository root');
run('verify exact historical baseline object', 'git', ['cat-file', '-e', `${BASELINE_COMMIT}^{commit}`], { quiet: true });

const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'undercast-star-trek-history-'));
const historical = path.join(parent, 'worktree');
let added = false;
try {
  run('materialize exact pre-refresh Star Trek baseline', 'git', ['worktree', 'add', '--detach', historical, BASELINE_COMMIT], { quiet: true });
  added = true;
  const selected = args.focus
    ? ROUTES.filter((entry) => entry.route === args.focus)
    : ROUTES;
  for (const entry of selected) {
    run(`validate historical route ${entry.route}`, process.execPath, [entry.script], { cwd: historical });
  }
  const report = assertSuccessorProjection(historical, currentRoot);
  console.log(`star-trek-history-composable: PASS — immutable 2,228-task cycle history and the live successor projection are composable ${JSON.stringify(report)}`);
} finally {
  if (added) {
    spawnSync('git', ['worktree', 'remove', '--force', historical], {
      cwd: currentRoot,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: process.env,
    });
  }
  fs.rmSync(parent, { recursive: true, force: true });
}
