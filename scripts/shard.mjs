#!/usr/bin/env node
/**
 * shard.mjs — build the disposable serving projections from the canonical truth.
 *
 *   truth:       data/specimens.json         (canonical; grow/retrieve/curate write it)
 *   projection:  data/index.json             (one lean entry per card — loaded on boot)
 *                data/shards/NNNN.json        (full records, SHARD_SIZE per file — lazy)
 *                data/shard-manifest.json     (counts + per-shard sha256, the load map)
 *
 * Why: a single specimens.json is fetched + parsed whole on every page load. At a
 * million cards that's ~750MB in the browser — dead. This splits the catalog so the
 * boot payload is a lean index (facets + sort + search, no prose) and the heavy
 * per-card fields (reveal, provenance, image refs) load only for the cards actually
 * on screen. Projections are REBUILT from truth, never hand-edited — delete them and
 * re-run and you get byte-identical output (deterministic, stable id order).
 *
 * The index preserves search: name/character/production/universe/designer ride as
 * fields; prose keywords that AREN'T already in those fields (e.g. a species named
 * only in the reveal) ride in `kw`, so "ferengi" still finds Quark. True 1M-scale
 * full-text is the next pass (an inverted index) — see SCALING.md.
 *
 *   node scripts/shard.mjs            # SHARD_SIZE=1000 default
 */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";

const SHARD_SIZE = parseInt(process.env.SHARD_SIZE || "1000", 10);
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const idNum = (id) => { const m = String(id).match(/(\d+)/); return m ? parseInt(m[1], 10) : 0; };

// stopwords + the boilerplate that recurs across reveals — dropped from kw so the
// keyword field carries signal (species, roles, notable extras), not filler.
const STOP = new Set(("the a an and or of to in on for with as at by from is was are were be been being this that it its his her their they them he she who whom which what when where why how not no yes into over under out up down off all any both each few more most other some such only own same so than too very can will just also had has have did does do get got make made take star series film movie voice actor actress played playing plays role roles character characters best known also more later first second"
).split(" "));
const tokens = (t) => [...new Set(String(t || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [])].filter((w) => !STOP.has(w));

const specimens = JSON.parse(await readFile("data/specimens.json", "utf8"));
// stable, human-legible shard order: by catalog number
const ordered = specimens.slice().sort((a, b) => idNum(a.id) - idNum(b.id) || String(a.id).localeCompare(String(b.id)));

// ── lean boot index (Option D: fielded + delta-keyword prose) ──
const index = ordered.map((s, gi) => {
  const inFields = new Set(tokens([s.actor, s.character, s.production, s.universe, s.designer].join(" ")));
  const kw = tokens([s.knownFor, s.reveal].join(" ")).filter((w) => !inFields.has(w));
  const e = {
    id: s.id, sh: Math.floor(gi / SHARD_SIZE),
    u: s.universe, y: s.years || "", d: s.designer || "",
    a: s.actor || "", c: s.character || "", p: s.production || "", tf: s.transform || 0,
  };
  if (s.kind === "voice") e.k = 1;
  if (kw.length) e.kw = kw.join(" ");
  return e;
});

// ── full-record shards (compact JSON — machine-read, not hand-edited) ──
await rm("data/shards", { recursive: true, force: true });
await mkdir("data/shards", { recursive: true });
const shardMeta = [];
for (let i = 0, sh = 0; i < ordered.length; i += SHARD_SIZE, sh++) {
  const slice = ordered.slice(i, i + SHARD_SIZE);
  const file = `shards/${String(sh).padStart(4, "0")}.json`;
  const body = JSON.stringify(slice);
  await writeFile("data/" + file, body + "\n");
  shardMeta.push({ file, n: slice.length, sha256: sha256(body) });
}

const indexBody = JSON.stringify(index);
await writeFile("data/index.json", indexBody + "\n");

const manifest = {
  version: 1,
  built_from: "data/specimens.json",
  source_sha256: sha256(JSON.stringify(specimens)),
  count: ordered.length,
  shard_size: SHARD_SIZE,
  index_bytes: indexBody.length,
  index_sha256: sha256(indexBody),
  shards: shardMeta,
};
await writeFile("data/shard-manifest.json", JSON.stringify(manifest, null, 1) + "\n");

const kb = (n) => (n / 1e3).toFixed(0) + "KB";
console.log(`sharded ${ordered.length} cards → ${shardMeta.length} shard(s) (≤${SHARD_SIZE} each)`);
console.log(`  index.json ${kb(indexBody.length)} (${Math.round(indexBody.length / ordered.length)} B/card) — loaded on boot`);
console.log(`  ${shardMeta.length} shard file(s), ${shardMeta.reduce((a, s) => a + s.n, 0)} records total — loaded lazily`);
console.log(`  rebuild any time: node scripts/shard.mjs   (projections are disposable)`);
