#!/usr/bin/env node
/**
 * grow.mjs — nightly ingester for UNDERCAST.
 *
 * Pipeline (per new card):
 *   1. Claude drafts a specimen from a chosen vein (real people only).
 *   2. Wikipedia confirms the person is real (else discard).
 *   3. An image is attached ONLY if a FREELY-LICENSED one is found. The gate is
 *      the LICENSE, not the domain — we try several wikis and keep the first
 *      image whose license is free (PD / CC0 / CC-BY / CC-BY-SA). Everything
 *      else (fair-use studio stills, "all rights reserved") is rejected.
 *   4. The card is appended to data/specimens.json with full provenance, and any
 *      free image's license + author is recorded in data/SOURCES.json — the same
 *      ledger retrieve.mjs uses. credits.mjs renders CREDITS.md from that ledger.
 *
 * On sources: use ANY wiki you like for facts and rosters — their TEXT is
 * CC-BY-SA. But a Fandom wiki's CC-BY-SA covers its text, NOT its images, which
 * are overwhelmingly copyrighted stills served under fair use. That's why the
 * image step gates on the per-file license and why most Fandom images fail it.
 *
 * Guardrails: GROW_BUDGET caps new cards per run; existing actors are skipped;
 * character / production stills are never requested.
 */
import { readFile, writeFile } from "node:fs/promises";

const API_KEY = process.env.ANTHROPIC_API_KEY;
const BUDGET  = parseInt(process.env.GROW_BUDGET || "6", 10);
const MODEL   = process.env.ANTHROPIC_MODEL || "claude-sonnet-5"; // ids move — see docs.claude.com
const DATA    = "data/specimens.json";
const LEDGER  = "data/SOURCES.json"; // one provenance ledger; credits.mjs renders CREDITS.md from it

const VEINS = {
  "Doctor Who":        "Doctor Who monster & creature performers and the Dalek/Cyberman voice artists",
  "Star Wars":         "Star Wars creature, suit, puppet and masked/helmeted performers",
  "Muppets & Henson":  "Muppet performers and Jim Henson's Creature Shop actors",
  "Horror":            "horror slasher, monster and creature performers under masks and prosthetics",
  "Motion capture":    "performance-capture actors who vanish into digital characters",
  "Kaiju & tokusatsu": "Japanese kaiju / tokusatsu suit actors (Ultraman, Kamen Rider, Super Sentai, Gamera)",
  "Classic makeup":    "classic Hollywood makeup-transformation actors and the Universal Monsters tradition",
};
const SHELVES = ["Star Trek","Film","Babylon 5","Farscape","Horror","TV","Voice","Kaiju"];

// ---- the invariant: these licenses, and only these, are reusable ----
const FREE = [/cc0/i, /public domain/i, /^\s*pd/i, /cc[-\s]?by([-\s]?sa)?/i];
const isFree = (s = "") => FREE.some((re) => re.test(s));

// ---- image sources: the gate is the LICENSE, not the domain ----
// Any MediaWiki with a public API works. We search each for the ACTOR (never the
// character), read the lead image's license, and keep the first FREE one. Commons
// files surface via Wikipedia; the Fandom wikis are here to prove the point — the
// same gate runs on them, and it will reject their fair-use stills automatically.
const WIKIS = [
  { name: "Wikipedia",    api: "https://en.wikipedia.org/w/api.php" },
  { name: "Memory Alpha", api: "https://memory-alpha.fandom.com/api.php" },
  { name: "Wookieepedia", api: "https://starwars.fandom.com/api.php" },
  { name: "Gojipedia",    api: "https://godzilla.fandom.com/api.php" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm  = (s) => String(s || "").trim().toLowerCase();

async function claude(prompt) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error("anthropic " + r.status);
  const j = await r.json();
  return (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}

function parseCard(text) {
  let t = text.replace(/```json|```/g, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

function prompt(vein, exclude) {
  return `You curate UNDERCAST, a catalog of performers who vanish under a designed face — heavy prosthetics, a mask, a full creature suit, motion capture, or (kind:"voice") an unseen voice-only role.
Vein: ${VEINS[vein]}.
Pick ONE real, verifiable, reasonably well-known performer from that vein who is NOT in this list: ${exclude.join(", ")}.
Return ONLY a JSON object, no prose, no code fences, with exactly these keys:
{"character":"","actor":"","production":"","years":"YYYY or YYYY-YY","universe":one of ${JSON.stringify(SHELVES)},"designer":"makeup/creature/costume designer or studio","transform":1-5,"kind":"face"|"voice","knownFor":"one sentence","reveal":"two sentences","wiki":"https://en.wikipedia.org/wiki/Name"}
Real people only. Facts must be accurate. JSON only.`;
}

// existence check → canonical Wikipedia title
async function verify(card) {
  let title = (card.wiki || "").split("/wiki/")[1];
  title = title ? decodeURIComponent(title).replace(/_/g, " ") : card.actor;
  const r = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title));
  if (!r.ok) return null;
  const j = await r.json();
  if (j.type === "disambiguation") return null;
  return j.title || title;
}

async function mw(base, params) {
  const url = base + "?" + new URLSearchParams({ format: "json", origin: "*", ...params });
  const r = await fetch(url);
  if (!r.ok) throw new Error(base + " " + r.status);
  return r.json();
}

// on one wiki: find the actor's lead image, return it ONLY if freely licensed
async function imageFrom(base, actor) {
  const s = await mw(base, { action: "query", list: "search", srsearch: actor, srlimit: "1" }).catch(() => null);
  const hit = s?.query?.search?.[0]?.title;
  if (!hit) return null;
  const p = await mw(base, { action: "query", prop: "pageimages", piprop: "name", titles: hit }).catch(() => null);
  const file = Object.values(p?.query?.pages || {})[0]?.pageimage;
  if (!file) return null;
  const q = await mw(base, { action: "query", prop: "imageinfo", iiprop: "url|extmetadata", titles: "File:" + file }).catch(() => null);
  const info = Object.values(q?.query?.pages || {})[0]?.imageinfo?.[0];
  if (!info) return null;
  const m = info.extmetadata || {};
  const license = m.LicenseShortName?.value || m.License?.value || "";
  if (!isFree(license)) return null; // <-- THE GATE, applied identically to every wiki
  return {
    url: info.url,
    license,
    author: (m.Artist?.value || "").replace(/<[^>]+>/g, "").trim() || "Unknown",
    source: info.descriptionurl || "",
  };
}

// try each wiki in turn; first FREE image wins
async function findImage(actor) {
  for (const w of WIKIS) {
    try {
      const img = await imageFrom(w.api, actor);
      if (img) { img.via = w.name; return img; }
    } catch { /* skip this wiki */ }
  }
  return null;
}

async function main() {
  if (!API_KEY) { console.error("missing ANTHROPIC_API_KEY"); process.exit(1); }

  let specimens = [];
  try { specimens = JSON.parse(await readFile(DATA, "utf8")); } catch { specimens = []; }
  let ledger = [];
  try { ledger = JSON.parse(await readFile(LEDGER, "utf8")); } catch { ledger = []; }
  const have = new Set(specimens.map((s) => norm(s.actor)));
  const veins = Object.keys(VEINS);
  let added = 0, tries = 0;

  while (added < BUDGET && tries < BUDGET * 4) {
    tries++;
    const vein = veins[tries % veins.length];
    try {
      const card = parseCard(await claude(prompt(vein, [...have])));
      if (!card.actor || !card.character || have.has(norm(card.actor))) { console.log("skip:", card.actor); continue; }

      const title = await verify(card);
      if (!title) { console.log("unverified, skip:", card.actor); continue; }

      const img = await findImage(card.actor).catch(() => null);

      // field names below MUST match what index.html reads: _grown, _verified, link, portrait
      card.id = "UC-G" + String(specimens.filter((s) => s._grown).length + 1).padStart(3, "0");
      card._grown = true;
      card._verified = true;
      card.link = card.wiki || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
      delete card.wiki;
      card.universe = SHELVES.includes(card.universe) ? card.universe : "Film";
      card.kind = card.kind === "voice" ? "voice" : "face";
      card.transform = Math.max(1, Math.min(5, parseInt(card.transform) || 4));
      // only FREE portraits ever reach here (findImage gates on license), so kind:"free"
      if (img) card.portrait = { src: img.url, kind: "free", origin: img.source, author: img.author, license: img.license };

      specimens.push(card);
      have.add(norm(card.actor));
      added++;
      console.log("grown:", card.actor, "—", card.character, img ? `(+free image via ${img.via})` : "(no free image)");
      // record provenance in the one ledger; credits.mjs turns free portraits into CREDITS.md
      if (img) {
        ledger = ledger.filter((r) => r.id !== card.id);
        ledger.push({ id: card.id, actor: card.actor, character: card.character, universe: card.universe, still: null, portrait: card.portrait, fetched_at: new Date().toISOString().slice(0, 10) });
      }

      await sleep(400);
    } catch (e) { console.log("error, skip:", e.message); }
  }

  await writeFile(DATA, JSON.stringify(specimens, null, 2) + "\n");
  await writeFile(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  console.log(`done: +${added} this run (budget ${BUDGET}). ${specimens.length} total, ${ledger.length} ledger rows.`);
}

main();
