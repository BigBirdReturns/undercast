#!/usr/bin/env node
/**
 * ds9-census.mjs — the DS9 ledger. NO API KEY.
 *
 * Walks every DS9 EPISODE page on Memory Alpha and reads its cast credits.
 * The episode is the citation: every performer<->character assertion is anchored
 * to a specific episode page (title, source URL, revision id, capture time,
 * content hash). This is the complete, show-scoped roster of who wore which face
 * on Star Trek: Deep Space Nine — straight from the wiki's own credit lists.
 *
 *   node scripts/ds9-census.mjs            # crawl 173 episodes -> data/ds9/*.json
 *   node scripts/ds9-census.mjs --project-only  # rebuild coverage from roster, no net
 *
 * Output (all under data/ds9/):
 *   roster.json      one row per (performer, character) with its credit tiers,
 *                    the episodes that cite it, and a wall-match verdict.
 *   observations.json  every episode page observed, with revision identity + hash.
 *   unresolved.json  cast lines that did not parse to a clean performer/character.
 *   manifest.json    crawl scope, capture time, generator, snapshot hashes.
 *   coverage.json    (derived) per-assertion wall match method + duplicate key.
 *
 * This engine only DISCOVERS the sourced roster. Species, lineage graphs and
 * per-performance wall eligibility are judged in later, separately-sourced passes;
 * nothing here decides who belongs on the wall.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { normalizeCensusKey as normalize } from "./census-key.mjs";

const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "ds9-census"})`;
const API = "https://memory-alpha.fandom.com/api.php";
const PRODUCTION = "Star Trek: Deep Space Nine";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const fileDigest = async (path) => digest(await readFile(path));
const args = process.argv.slice(2);
const PROJECT_ONLY = args.includes("--project-only");
const CAPTURED_AT = PROJECT_ONLY ? null : new Date().toISOString();
const wikiUrl = (title) => `https://memory-alpha.fandom.com/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

let lastReq = 0;
async function mw(params) {
  const wait = Math.max(0, 600 - (Date.now() - lastReq)); if (wait) await sleep(wait); lastReq = Date.now();
  const url = API + "?" + new URLSearchParams({ format: "json", origin: "*", ...params });
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(API + " " + r.status);
      return await r.json();
    } catch (error) { lastError = error; if (attempt < 3) await sleep(attempt * 1_000); }
  }
  throw new Error(`DS9 census source unavailable after 3 attempts: ${url}\n${lastError}`);
}

async function categoryMembers(cat) {
  const pages = []; let cont = {};
  do {
    const j = await mw({ action: "query", list: "categorymembers", cmtitle: "Category:" + cat,
      cmnamespace: "0", cmlimit: "500", ...cont });
    for (const m of j?.query?.categorymembers || []) pages.push(m.title);
    cont = j?.continue || null;
  } while (cont);
  return pages;
}

// A performer credit must LOOK like a person: 2+ words, the first capitalised.
// Initialled professional names (J.G. Hertzler) are common, and lowercase
// nobiliary particles (Nicole de Boer, Marc Lawrence van der Kolk) are real —
// accept a particle mid-name but never as the leading word.
const PARTICLES = new Set(["de","van","von","der","den","la","le","del","di","da","du","dos","ten","ter","el","al","bin","st","st."]);
const isPerson = (name) => {
  const words = name.trim().split(/\s+/);
  if (words.length < 2 || name.length >= 40) return false;
  if (!/^[A-ZÀ-Þ][A-Za-zà-þ'.\-]*$/.test(words[0])) return false;
  return words.slice(1).every((w) => /^[A-ZÀ-Þ][A-Za-zà-þ'.\-]*$/.test(w) || PARTICLES.has(w.toLowerCase()));
};
// rank/title words that PRECEDE a character name in a credit line and are never
// themselves the character. If a line resolves to nothing but ranks, the last
// link is kept anyway (see charactersFrom) so a mislabelled title never erases
// a real role.
const RANKS = new Set(["captain","commander","lieutenant commander","lieutenant","lt. commander","lt.","lt",
  "chief","doctor","dr.","major","colonel","general","admiral","ensign","gul","legate","glinn",
  "vedek","kai","subcommander","subaltern","brigadier","professor","chief petty officer","petty officer",
  "crewman","yeoman","cadet","provisional ensign","field supervisor","counselor","chief medical officer"]);

// unnamed background characters use Memory Alpha's procedural naming: the
// "Unnamed ..." prefix, or a species/role descriptor ending in a serial number
// ("Cardassian Terok Nor officer 001"). Both are the wiki's own convention for
// an extra with no in-universe name — a sourced signal, not a guess.
const isUnnamed = (target) => /^Unnamed /i.test(target) || /\s\d{2,}\s*$/.test(target);

// map a section header to a credit tier and whether it is a named credit
function tierOf(header) {
  const h = header.toLowerCase();
  if (/special guest/.test(h)) return { tier: "special-guest", named: true };
  if (/guest/.test(h)) return { tier: "guest", named: true };
  if (/also starring/.test(h)) return { tier: "also-starring", named: true };
  if (/\bstarring\b/.test(h)) return { tier: "starring", named: true };
  if (/uncredited/.test(h)) return { tier: "uncredited", named: false };
  if (/stunt/.test(h)) return { tier: "stunt", named: false };
  if (/stand[- ]?in/.test(h)) return { tier: "stand-in", named: false };
  if (/photo double/.test(h)) return { tier: "photo-double", named: false };
  if (/co-?star/.test(h)) return { tier: "co-star", named: true };
  return null;
}

// pull [[target|display]] / [[target#section]] / {{template}} links out of the
// "as ..." tail. Memory Alpha's {{dis|Name|qualifier}} disambiguation template
// names the character in its first parameter; a bare {{Name}} template IS the
// character. A trailing #section (Quark#Holograms) is stripped to the page.
function linksOf(text) {
  const out = [];
  for (const m of text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g))
    out.push({ target: m[1].trim(), display: (m[2] || m[1]).trim() });
  for (const m of text.matchAll(/\{\{([^}|]+)((?:\|[^}]*)*)\}\}/g)) {
    const name = m[1].trim();
    if (/^(dis|d|disambig)$/i.test(name)) {
      const first = (m[2] || "").split("|").filter(Boolean)[0];
      if (first) out.push({ target: first.trim(), display: first.trim() });
    } else if (!/^(small|big|e|s|m|ep|sup|sub|nowrap|refn|nbsp|dash|[nm]dash|'|")$/i.test(name))
      out.push({ target: name, display: name }); // skip MA formatting/utility templates
  }
  return out.filter((l) => l.target && !/^(File|Image|Category|w:c:|Template|wikipedia):/i.test(l.target));
}

// choose the character link(s) from the "as ..." tail. Rank/title links are
// dropped, but if a segment is ALL ranks the last link is kept so a mislabelled
// title never erases the role. " / " splits a dual role into separate
// assertions. When a segment has no link at all, its plain text is kept as an
// unnamed, page-less character (character_page = null) so credited extras with
// prose-only role descriptions are still counted.
function charactersFrom(tail) {
  // "/", "and", "&" all separate multiple roles in one credit line
  // ("Weyoun 6 and Weyoun 7", "Odo / Odo Alien").
  return tail.split(/\s+\/\s+|\s+&\s+|\s+and\s+/i).map((seg) => {
    const links = linksOf(seg);
    const named = links.filter((l) => !RANKS.has(l.target.toLowerCase()) && !RANKS.has(l.display.toLowerCase()));
    if (named.length) return { ...named[named.length - 1], linked: true };
    if (links.length) return { ...links[links.length - 1], linked: true };
    const text = seg.replace(/^(a|an|the)\s+/i, "").replace(/["']/g, "").replace(/<[^>]+>/g, "").trim();
    // page-less doubling / utility credits ("stunt double for X", "additional
    // voice actor") are not designed roles — drop so the caller marks them unresolved.
    if (/\b(stunt|photo)?\s*double\b|\bstand-?in\b|\bdouble for\b|additional voice|voice double|\butility\b|stunt (performer|coordinator|player)/i.test(text))
      return null;
    if (text && /^[A-Za-zÀ-Þ]/.test(text) && text.length < 60 && !/^and\b/i.test(text))
      return { target: null, display: text, linked: false };
    return null;
  }).filter(Boolean);
}

// Resolve a set of credited link titles to Memory Alpha page identity, following
// normalization and redirects. Returns Map(creditedTitle -> {pageid, title, missing}).
// This is the canonicalizer: "Andrew Robinson" and "Andrew J. Robinson" both
// resolve to pageid 6598; "Siddig El Fadil" and "Alexander Siddig" to 8798.
async function resolveTitles(titles) {
  const resolved = new Map();
  const list = [...new Set(titles)];
  for (let i = 0; i < list.length; i += 50) {
    const j = await mw({ action: "query", redirects: "1", titles: list.slice(i, i + 50).join("|") });
    const q = j?.query || {};
    const step = new Map();                       // from -> to (one hop)
    for (const n of q.normalized || []) step.set(n.from, n.to);
    for (const r of q.redirects || []) step.set(r.from, r.to);
    const byTitle = new Map();                     // final title -> {pageid, missing}
    for (const p of Object.values(q.pages || {}))
      byTitle.set(p.title, { pageid: p.pageid, missing: p.missing !== undefined });
    for (const t of list.slice(i, i + 50)) {
      let cur = t; for (let hop = 0; hop < 6 && step.has(cur); hop++) cur = step.get(cur);
      const info = byTitle.get(cur) || { missing: true };
      resolved.set(t, { title: cur, pageid: info.pageid ?? null, missing: !!info.missing });
    }
  }
  return resolved;
}

async function crawl() {
  const episodes = [...new Set(await categoryMembers("DS9 episodes"))].sort();
  if (episodes.length < 100) throw new Error(`DS9 episodes returned ${episodes.length} pages; refusing a false roster`);
  console.log(`== Star Trek: Deep Space Nine — ${episodes.length} episode pages ==`);
  const observations = [];
  const raw = [];        // ungrouped credits: { performer, target|null, display, tier, tierNamed, cite }
  const unresolved = [];
  let lineNo = 0;

  for (let i = 0; i < episodes.length; i += 20) {
    const j = await mw({ action: "query", prop: "revisions", rvprop: "ids|timestamp|content",
      rvslots: "main", titles: episodes.slice(i, i + 20).join("|") });
    for (const page of Object.values(j?.query?.pages || {})) {
      const revision = page?.revisions?.[0] || {};
      const content = revision?.slots?.main?.["*"] || "";
      if (!Number.isInteger(page.pageid) || !Number.isInteger(revision.revid) || !revision.timestamp)
        throw new Error(`episode ${page.title} lacks revision identity`);
      const obs = { title: page.title, source: wikiUrl(page.title), observed_at: CAPTURED_AT,
        pageid: page.pageid, revision: revision.revid, timestamp: revision.timestamp,
        content_sha256: digest(content) };
      observations.push(obs);
      const cite = { episode: page.title, source: obs.source, pageid: obs.pageid,
        revision: obs.revision, timestamp: obs.timestamp, observed_at: obs.observed_at };

      // the credits live between the first cast header and the next level-2 (==) header
      const castStart = content.search(/===+\s*(Starring|Also starring)/i);
      if (castStart < 0) continue;
      const after = content.slice(castStart);
      const castEnd = after.search(/\n==[^=]/);
      const cast = castEnd < 0 ? after : after.slice(0, castEnd);

      let tier = null, tierNamed = false;
      const lines = cast.split("\n");
      for (let li = 0; li < lines.length; li++) {
        const rawline = lines[li];
        const head = rawline.match(/^===+\s*(.+?)\s*=+\s*$/);
        if (head) { const t = tierOf(head[1]); tier = t?.tier || null; tierNamed = !!t?.named; continue; }
        const line = rawline.match(/^\*\s*\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]\s+as\b(.*)$/);
        if (!line || !tier) continue;
        lineNo++;
        const performer = line[1].trim()
          .replace(/\s*\((actor|actress|performer|puppeteer)\)$/i, "")
          .replace(/,\s*(Jr\.?|Sr\.?|I{2,}|IV|V)$/i, (m, s) => " " + s);
        if (!isPerson(performer)) {
          unresolved.push({ episode: page.title, source: obs.source, tier, line: rawline.trim(),
            reason: "performer link is not a person-like name" });
          continue;
        }
        let chars = charactersFrom(line[2].trim());
        if (!chars.length && !line[2].trim()) {   // roles on following ** sub-bullets
          while (li + 1 < lines.length && /^\*\*+\s*\S/.test(lines[li + 1]))
            chars.push(...charactersFrom(lines[++li].replace(/^\*\*+\s*/, "")));
        }
        chars = chars.filter((c) => {             // a "stunt double"/"stand-in" role is a doubling, not a face
          if (!/\b(stunt|photo)?\s*double\b|\bstand-?in\b|additional voice|voice double|\butility\b|stunt (performer|coordinator|player)/i.test(c.display)) return true;
          unresolved.push({ episode: page.title, source: obs.source, tier, performer, line: rawline.trim(),
            reason: "doubling/utility credit — not a designed character role" });
          return false;
        });
        if (!chars.length) {
          unresolved.push({ episode: page.title, source: obs.source, tier, performer, line: rawline.trim(),
            reason: "no character resolved in the credit line" });
          continue;
        }
        for (const c of chars) raw.push({ performer, target: c.target || null, display: c.display, tier, tierNamed, cite });
      }
    }
    console.log(`  episodes ${i + 1}-${Math.min(i + 20, episodes.length)} scanned; ${raw.length} raw credits`);
  }

  // ---- canonicalize by Memory Alpha page identity ----
  console.log(`\nresolving ${new Set(raw.map((r) => r.performer)).size} performer + ${new Set(raw.filter((r) => r.target).map((r) => r.target)).size} character titles to page identity...`);
  const performerId = await resolveTitles(raw.map((r) => r.performer));
  const characterId = await resolveTitles(raw.filter((r) => r.target).map((r) => r.target));

  const idOfPerformer = (t) => { const r = performerId.get(t); return r?.pageid ? "p" + r.pageid : "p:" + normalize(t); };
  const idOfCharacter = (c) => {
    if (!c.target) return "t:" + normalize(c.display);       // page-less prose role
    const r = characterId.get(c.target); return r?.pageid ? "c" + r.pageid : "c:" + normalize(c.target);
  };

  const assertions = new Map();
  for (const r of raw) {
    const pid = idOfPerformer(r.performer), cid = idOfCharacter(r);
    const key = pid + "|" + cid;
    let row = assertions.get(key);
    if (!row) {
      const pInfo = performerId.get(r.performer) || {};
      const cInfo = r.target ? (characterId.get(r.target) || {}) : {};
      const canonChar = r.target ? (cInfo.title || r.target) : r.display;
      row = {
        performer_id: pid, performer: pInfo.title || r.performer, performer_pageid: pInfo.pageid ?? null,
        performer_aliases: new Set(),
        character_id: cid, character: canonChar, character_page: r.target ? (cInfo.title || r.target) : null,
        character_pageid: cInfo.pageid ?? null,
        character_source: r.target ? wikiUrl(cInfo.title || r.target) : null, character_aliases: new Set(),
        character_named: r.target ? !isUnnamed(cInfo.title || r.target) : false,
        background: true, credit_tiers: new Set(), duplicate_key: key, episodes: [],
      };
      assertions.set(key, row);
    }
    row.performer_aliases.add(r.performer);
    if (r.target) row.character_aliases.add(r.display); else row.character_aliases.add(r.display);
    row.credit_tiers.add(r.tier);
    if (!BACKGROUND_TIERS.has(r.tier)) row.background = false;
    if (!row.episodes.some((e) => e.episode === r.cite.episode)) row.episodes.push(r.cite);
  }

  // doubling post-pass on canonical identity: if a "character" resolves to the
  // same page as a known performer, it is a stand-in/double credit, not a face.
  const performerPages = new Set([...assertions.values()].map((r) => r.performer_id));
  let doublings = 0;
  for (const [key, row] of assertions) {
    if (performerPages.has(row.character_id.replace(/^c/, "p"))) {
      assertions.delete(key); doublings++;
      unresolved.push({ episode: row.episodes[0]?.episode || null, source: row.episodes[0]?.source || null,
        tier: [...row.credit_tiers][0] || null, performer: row.performer,
        line: `${row.performer} as ${row.character}`,
        reason: `doubling credit across ${row.episodes.length} episode(s) — the named role is performer "${row.character}", not a designed character` });
    }
  }
  console.log(`cast lines parsed: ${lineNo}; doublings reclassified: ${doublings}; unresolved: ${unresolved.length}`);
  return { observations, assertions, unresolved, episodeCount: episodes.length };
}

// credit tiers that are, by themselves, background/extra performances
const BACKGROUND_TIERS = new Set(["uncredited", "stunt", "stand-in", "photo-double"]);

// -------- wall match (on canonical identity + every credited alias) --------
function matchWall(rows, specimens) {
  for (const row of rows) {
    const performerNames = [row.performer, ...row.performer_aliases].map(normalize);
    const characterNames = [row.character, row.character_page, ...row.character_aliases].filter(Boolean).map(normalize);
    const performerRecords = specimens.filter((rec) => [rec.actor, ...(rec.aliases || [])]
      .some((name) => performerNames.includes(normalize(name))));
    const roleRecords = performerRecords.filter((rec) =>
      [rec.character, ...(rec.performances || []).map((p) => p.character)]
        .some((r) => characterNames.includes(normalize(r))));
    row.performer_on_wall = performerRecords.length > 0;
    row.role_on_wall = roleRecords.length > 0;
    row.wall_ids = [...new Set(roleRecords.map((rec) => rec.id))];
    row.wall_match_method = "canonical performer page (+ every credited alias) matches specimen actor|aliases AND canonical character (+ aliases) matches specimen character|performances[].character";
  }
}

// ================= run =================
await mkdir("data/ds9", { recursive: true });
let roster, observations, unresolved, manifest;

if (PROJECT_ONLY) {
  roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
  observations = JSON.parse(await readFile("data/ds9/observations.json", "utf8")).observations;
  unresolved = JSON.parse(await readFile("data/ds9/unresolved.json", "utf8")).unresolved;
  manifest = JSON.parse(await readFile("data/ds9/manifest.json", "utf8"));
} else {
  const crawled = await crawl();
  observations = crawled.observations.sort((a, b) => a.title.localeCompare(b.title));
  unresolved = crawled.unresolved.sort((a, b) => (a.episode || "").localeCompare(b.episode || "") || (a.line || "").localeCompare(b.line || ""));
  roster = [...crawled.assertions.values()].map((row) => ({
    performer: row.performer, performer_pageid: row.performer_pageid,
    performer_aliases: [...row.performer_aliases].sort(),
    character: row.character, character_page: row.character_page, character_pageid: row.character_pageid,
    character_source: row.character_source, character_aliases: [...row.character_aliases].sort(),
    // three distinct facts, no longer conflated:
    credit_tiers: [...row.credit_tiers].sort(),          // billing level(s) the credit appeared under
    character_named: row.character_named,                // the character has an in-universe proper name
    background_role: row.background,                      // every credit was an extra/uncredited/stunt tier
    production: PRODUCTION,
    era: null,                                            // story era (Occupation / Dominion War / post-war) unresolved; not faked from airdates
    eligibility: "review",
    eligibility_reason: "unjudged — per-performance makeup assessment pending (species + design pass)",
    duplicate_key: row.duplicate_key,
    episode_count: row.episodes.length,
    episodes: row.episodes.sort((a, b) => a.episode.localeCompare(b.episode)),
  })).sort((a, b) => a.performer.localeCompare(b.performer) || a.character.localeCompare(b.character));
  manifest = {
    version: 2, generator: "scripts/ds9-census.mjs", production: PRODUCTION,
    identity: "performers and characters canonicalized to Memory Alpha pageid (redirects followed); credited spellings kept as aliases",
    era_note: "era is intentionally null — story era is a separate sourced facet, not derivable from production airdates",
    source_wiki: "https://memory-alpha.fandom.com", captured_at: CAPTURED_AT,
    scope: { unit: "DS9 episode cast credit", episodes: crawled.episodeCount },
  };
}

const specimens = JSON.parse(await readFile("data/specimens.json", "utf8"));
matchWall(roster, specimens);

// -------- derived coverage + summary --------
const coverage = roster.map((row) => ({
  performer: row.performer, performer_pageid: row.performer_pageid,
  character: row.character, character_pageid: row.character_pageid, production: row.production,
  character_named: row.character_named, background_role: row.background_role, credit_tiers: row.credit_tiers,
  duplicate_key: row.duplicate_key, wall_match_method: row.wall_match_method,
  performer_on_wall: row.performer_on_wall, role_on_wall: row.role_on_wall, wall_ids: row.wall_ids,
  source: row.episodes[0]?.source || row.character_source }));

const distinctPerformers = new Set(roster.map((r) => r.performer_pageid ?? r.performer)).size;
const distinctCharacters = new Set(roster.map((r) => r.character_pageid ?? r.character)).size;
const namedRoles = roster.filter((r) => r.character_named && !r.background_role);
const extras = roster.filter((r) => !r.character_named || r.background_role);
const onWall = roster.filter((r) => r.role_on_wall);

const summary = {
  version: 2, production: PRODUCTION,
  generated_from: ["data/ds9/roster.json", "data/ds9/observations.json", "data/ds9/unresolved.json"],
  coverage_unit: "one credited performer in one designed/character role on DS9",
  identity_note: "counts are over canonical Memory Alpha page identity; spelling variants (Andrew Robinson / Andrew J. Robinson, Siddig El Fadil / Alexander Siddig) collapse to one performer.",
  scope_note: "Cast credits from all DS9 episode pages on Memory Alpha. Uncredited background performers are included when the wiki names them; anything the wiki leaves unattributed stays in unresolved.json — zero is never inferred.",
  episodes: manifest.scope.episodes,
  assertions: roster.length,
  distinct_performers: distinctPerformers,
  distinct_characters: distinctCharacters,
  named_character_roles: namedRoles.length,
  background_or_unnamed_roles: extras.length,
  role_assertions_on_wall: onWall.length,
  role_assertions_off_wall: roster.length - onWall.length,
  unresolved_cast_lines: unresolved.length,
};

if (!PROJECT_ONLY) {
  await writeFile("data/ds9/roster.json", JSON.stringify(roster, null, 1) + "\n");
  await writeFile("data/ds9/observations.json", JSON.stringify({ version: 1, production: PRODUCTION,
    captured_at: CAPTURED_AT, count: observations.length, observations }, null, 1) + "\n");
  await writeFile("data/ds9/unresolved.json", JSON.stringify({ version: 1, production: PRODUCTION,
    count: unresolved.length, note: "Cast lines that did not resolve to a clean performer+character. Preserved for audit, never dropped.", unresolved }, null, 1) + "\n");
  manifest.snapshots = {
    roster: { path: "data/ds9/roster.json", sha256: await fileDigest("data/ds9/roster.json"), rows: roster.length },
    observations: { path: "data/ds9/observations.json", sha256: await fileDigest("data/ds9/observations.json"), rows: observations.length },
    unresolved: { path: "data/ds9/unresolved.json", sha256: await fileDigest("data/ds9/unresolved.json"), rows: unresolved.length },
  };
  await writeFile("data/ds9/manifest.json", JSON.stringify(manifest, null, 1) + "\n");
}
await writeFile("data/ds9/coverage.json", JSON.stringify({ version: 1, wall_match_method: roster[0]?.wall_match_method || null, count: coverage.length, coverage }, null, 1) + "\n");
await writeFile("data/ds9/summary.json", JSON.stringify(summary, null, 1) + "\n");

console.log(`\nroster: ${roster.length} assertions, ${distinctPerformers} performers, ${distinctCharacters} characters`);
console.log(`named-character roles: ${namedRoles.length}  extras/unnamed: ${extras.length}  on wall: ${onWall.length}`);
console.log(`unresolved cast lines: ${unresolved.length}  ->  data/ds9/`);
