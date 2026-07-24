#!/usr/bin/env node
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const STATE_PATH = "data/MEDIA-SEARCH-STATE.json";
const AUDIT_PATH = "data/MEDIA-AUDIT.json";
const OPERATIONS_PATH = "data/CORPUS-OPERATIONS.json";
const JOURNAL_PATH = "data/journal/media-search.jsonl";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const load = async (file) => JSON.parse(await readFile(file, "utf8"));

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

export function selectDueFacets({ audit, state, scope, retryDays, now, limit }) {
  const latest = new Map();
  for (const attempt of state.attempts || []) {
    const previous = latest.get(attempt.item_id);
    if (!previous || Date.parse(attempt.attempted_at) > Date.parse(previous.attempted_at)) latest.set(attempt.item_id, attempt);
  }
  const retryMs = retryDays * 86_400_000;
  return (audit.items || [])
    .filter((item) => item.scope === scope && item.status === "absent" && !item.asset)
    .filter((item) => {
      const attempt = latest.get(item.id);
      return !attempt || now.getTime() >= Date.parse(attempt.attempted_at) + retryMs;
    })
    .sort((a, b) => Date.parse(a.source_fetched_at || 0) - Date.parse(b.source_fetched_at || 0)
      || b.risk_codes.length - a.risk_codes.length || a.wall_id.localeCompare(b.wall_id) || a.side.localeCompare(b.side))
    .slice(0, limit);
}

export function validateMediaSearchState(state) {
  const errors = [];
  if (state?.version !== 1 || !Array.isArray(state?.attempts)) errors.push("MEDIA-SEARCH-STATE must be version 1 with attempts[]");
  const ids = new Set();
  for (const row of state?.attempts || []) {
    if (!/^ms_[a-f0-9]{24}$/.test(row.id || "")) errors.push(`invalid media-search attempt id ${row.id}`);
    if (ids.has(row.id)) errors.push(`duplicate media-search attempt ${row.id}`); else ids.add(row.id);
    if (!row.item_id || !row.wall_id || !["still", "portrait"].includes(row.side)) errors.push(`${row.id} lacks facet identity`);
    if (!Number.isFinite(Date.parse(row.attempted_at || ""))) errors.push(`${row.id} lacks an attempt timestamp`);
    if (!['candidate', 'no-result', 'error'].includes(row.result)) errors.push(`${row.id} has invalid result ${row.result}`);
    if (row.result === "candidate") {
      if (!row.candidate?.artifact_path || !/^[a-f0-9]{64}$/.test(row.candidate?.sha256 || "") || !Number.isInteger(row.candidate?.bytes)) errors.push(`${row.id} has an invalid candidate receipt`);
      if (row.candidate?.canonical === true) errors.push(`${row.id} falsely marks a search candidate canonical`);
    }
  }
  return errors;
}

async function context() {
  const [audit, state, operations] = await Promise.all([load(AUDIT_PATH), load(STATE_PATH), load(OPERATIONS_PATH)]);
  return { audit, state, operations };
}

async function plan(args) {
  const { audit, state, operations } = await context();
  const scope = option(args, "--scope", "star-trek");
  const limit = Number(option(args, "--limit", "12"));
  const now = new Date(option(args, "--now", new Date().toISOString()));
  const retryDays = operations.quality_policy.media_absence_retry_days;
  const facets = selectDueFacets({ audit, state, scope, retryDays, now, limit });
  return {
    version: 1,
    scope,
    generated_at: now.toISOString(),
    retry_days: retryDays,
    limit,
    facets: facets.map((item) => ({ item_id: item.id, wall_id: item.wall_id, side: item.side, expected_subject: item.expected_subject, source_fetched_at: item.source_fetched_at })),
  };
}

async function search(args) {
  const searchPlan = await plan(args);
  const output = path.resolve(option(args, "--output", ".media-search"));
  const now = searchPlan.generated_at;
  await rm(output, { recursive: true, force: true });
  await mkdir(path.join(output, "assets"), { recursive: true });

  const { audit, state } = await context();
  const selectedById = new Map(searchPlan.facets.map((row) => [row.item_id, row]));
  const selectedItems = (audit.items || []).filter((row) => selectedById.has(row.id));
  const wallIds = [...new Set(selectedItems.map((row) => row.wall_id))];
  const attempts = [];
  const candidates = [];

  if (wallIds.length) {
    const work = await mkdtemp(path.join(tmpdir(), "undercast-media-search-"));
    try {
      await mkdir(path.join(work, "data"), { recursive: true });
      await mkdir(path.join(work, "images"), { recursive: true });
      for (const relative of ["data/specimens.json", "data/SOURCES.json", "data/GAPS.json"]) {
        if (existsSync(relative)) await cp(relative, path.join(work, relative));
        else await writeFile(path.join(work, relative), "[]\n");
      }
      const run = spawnSync(process.execPath, [path.join(ROOT, "scripts/retrieve.mjs")], {
        cwd: work,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        env: {
          ...process.env,
          RETRIEVE_ONLY: wallIds.join(","),
          RETRIEVE_MAX: String(wallIds.length),
          IMAGE_MODE: "loose",
          CONTACT: process.env.CONTACT || "bigbirdreturns@proton.me",
          CRAWL_DELAY_MS: process.env.CRAWL_DELAY_MS || "1500",
        },
      });
      const after = await load(path.join(work, "data/specimens.json"));
      const afterById = new Map(after.map((row) => [row.id, row]));
      for (const item of selectedItems) {
        const proposed = afterById.get(item.wall_id)?.[item.side] || null;
        const id = `ms_${sha256(`${item.id}|${now}`).slice(0, 24)}`;
        if (proposed?.src && existsSync(path.join(work, proposed.src))) {
          const bytes = await readFile(path.join(work, proposed.src));
          const name = `${item.wall_id.toLowerCase()}-${item.side}-${sha256(bytes).slice(0, 12)}${path.extname(proposed.src) || ".jpg"}`;
          const artifactPath = `assets/${name}`;
          await writeFile(path.join(output, artifactPath), bytes);
          const candidate = {
            canonical: false,
            artifact_path: artifactPath,
            sha256: sha256(bytes),
            bytes: bytes.length,
            kind: proposed.kind,
            origin: proposed.origin,
            author: proposed.author || "",
            license: proposed.license || "",
            ...(proposed.year ? { year: proposed.year } : {}),
          };
          attempts.push({ id, item_id: item.id, scope: item.scope, wall_id: item.wall_id, side: item.side, expected_subject: item.expected_subject, attempted_at: now, result: "candidate", candidate });
          candidates.push({ item_id: item.id, wall_id: item.wall_id, side: item.side, expected_subject: item.expected_subject, ...candidate });
        } else {
          attempts.push({ id, item_id: item.id, scope: item.scope, wall_id: item.wall_id, side: item.side, expected_subject: item.expected_subject, attempted_at: now, result: run.status === 0 ? "no-result" : "error", note: run.status === 0 ? "No candidate was found in the isolated retrieval attempt." : String(run.stderr || run.stdout || "retrieval failed").trim().slice(-1000) });
        }
      }
      await writeFile(path.join(output, "retrieve.log"), `${run.stdout || ""}\n${run.stderr || ""}`);
    } finally { await rm(work, { recursive: true, force: true }); }
  }

  const nextState = { ...state, updated_at: now, attempts: [...(state.attempts || []), ...attempts] };
  const errors = validateMediaSearchState(nextState);
  if (errors.length) throw new Error(errors.join("; "));
  await writeFile(STATE_PATH, `${JSON.stringify(nextState, null, 2)}\n`);
  if (attempts.length) {
    await mkdir(path.dirname(JOURNAL_PATH), { recursive: true });
    await appendFile(JOURNAL_PATH, attempts.map((row) => JSON.stringify({ version: 1, op: "media-search.attempted", ...row })).join("\n") + "\n");
  }
  const manifest = { ...searchPlan, attempts: attempts.length, candidates: candidates.length, candidate_rows: candidates, canonical_mutations: 0 };
  await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function run(argv = process.argv.slice(2)) {
  const command = argv.find((value) => !value.startsWith("--")) || "plan";
  const json = argv.includes("--json");
  if (command === "validate") {
    const state = await load(STATE_PATH);
    const errors = validateMediaSearchState(state);
    const result = { version: 1, status: errors.length ? "FAIL" : "PASS", errors, attempts: state.attempts.length };
    console.log(json ? JSON.stringify(result, null, 2) : `media-search validate: ${result.status} — ${result.attempts} attempt(s)`);
    if (errors.length) process.exitCode = 1;
    return result;
  }
  if (command === "plan") {
    const result = await plan(argv);
    console.log(json ? JSON.stringify(result, null, 2) : `media-search plan: ${result.facets.length} due facet(s) in ${result.scope}`);
    return result;
  }
  if (command === "search") {
    const result = await search(argv);
    console.log(json ? JSON.stringify(result, null, 2) : `media-search: ${result.attempts} attempt(s), ${result.candidates} candidate artifact(s), zero canonical mutations`);
    return result;
  }
  throw new Error(`unknown media-search command ${command}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run().catch((error) => { console.error(`media-search: ${error instanceof Error ? error.message : String(error)}`); process.exit(1); });
