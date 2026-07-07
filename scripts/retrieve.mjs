#!/usr/bin/env node
/**
 * retrieve.mjs — the image + provenance orchestrator. NO API KEY NEEDED.
 *
 * For each specimen still missing images, it politely crawls wikis for:
 *   - a CHARACTER still (the mask / in-character shot) from the matching wiki
 *   - an ACTOR portrait from Wikipedia (with its license, if any)
 * It caches both into images/, records everything in data/SOURCES.json with a
 * `kind` on every asset (free | copyright | generated), and writes any card it
 * couldn't illustrate to data/GAPS.json — your worklist for hand/gen fills.
 *
 * This is a FAN project. It keeps character stills. It does NOT gate images out
 * on license — it labels them honestly instead. The ledger tells the truth;
 * CREDITS.md (built by credits.mjs) carries visible attribution for the free ones.
 *
 * The one hard rule here is politeness, not copyright: single-threaded, a real
 * delay between requests, an honest User-Agent, and 429 back-off. Don't hammer
 * the wikis. A slow reasonable crawl is the whole etiquette.
 *
 * Run:  node scripts/retrieve.mjs           (chips away RETRIEVE_MAX per run)
 * Env:  RETRIEVE_MAX (default 20), CONTACT (put a real email in your User-Agent)
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { existsSync } from "node:fs";

const REPO    = "https://github.com/BigBirdReturns/undercast";
const CONTACT = process.env.CONTACT || "maintainer";
// Honest + Wikimedia-UA-policy compliant: names the tool and a contact. We drop
// the "-bot" / "node-fetch" tokens because some CDNs hard-block those patterns.
const UA      = `undercast/0.1 (+${REPO}; ${CONTACT})`;
const MAX     = parseInt(process.env.RETRIEVE_MAX || "20", 10);
const DELAY   = parseInt(process.env.CRAWL_DELAY_MS || "1500", 10); // be gentle
// IMAGE_MODE=loose broadens portrait sourcing beyond free Commons photos to the
// franchise Fandom performer pages too (copyright headshots, still logged with
// honest provenance). Fills far denser; default stays free-first ("clean").
const LOOSE   = /^(loose|dense|1|true)$/i.test(process.env.IMAGE_MODE || "");
const DATA    = "data/specimens.json";
const LEDGER  = "data/SOURCES.json";
const GAPS    = "data/GAPS.json";
const IMGDIR  = "images";

const WIKIPEDIA = "https://en.wikipedia.org/w/api.php";

// ── Which wiki holds a CHARACTER's in-character still? ────────────────────────
// A specimen's still-wiki is resolved in this priority order (see stillApiFor):
//   1. an explicit per-card `wiki` hint (full URL, api URL, or a Fandom slug)
//   2. a franchise match on the card's production / character / universe text
//   3. the card's OWN source link host, when it isn't plain Wikipedia
//   4. a universe default
// Anything unresolved falls through to a Wikipedia portrait, then to GAPS.

// universe -> default wiki (last-resort bucket for shelves that map cleanly)
const STILL_WIKIS = {
  "Star Trek":  "https://memory-alpha.fandom.com/api.php",
  "Babylon 5":  "https://babylon5.fandom.com/api.php",
  "Farscape":   "https://farscape.fandom.com/api.php",
  "Kaiju":      "https://wikizilla.org/w/api.php",
};

// franchise keyword -> wiki. First match on "`production` `character` `universe`"
// wins, so a Film/Horror/Voice/TV card lands on the right pedia by its own text.
// Fandom wikis answer at /api.php; standalone MediaWikis (Wikizilla) at /w/api.php.
const FRANCHISE_WIKIS = [
  [/star wars|jedi|sith|mandalorian|wookiee|ewok|clone wars/i, "https://starwars.fandom.com/api.php"],
  [/lord of the rings|hobbit|middle.?earth|tolkien|rings of power/i, "https://lotr.fandom.com/api.php"],
  [/doctor who|dalek|cyberman|tardis|torchwood|sontaran|time lord/i, "https://tardis.fandom.com/api.php"],
  [/predator|\bpredator\b|yautja/i, "https://avp.fandom.com/api.php"],
  [/alien|aliens|xenomorph|prometheus|covenant|nostromo/i, "https://avp.fandom.com/api.php"],
  [/hellboy/i, "https://hellboy.fandom.com/api.php"],
  [/dark crystal|gelfling|skeksis/i, "https://darkcrystal.fandom.com/api.php"],
  [/muppet|sesame street|fraggle|henson|labyrinth \(/i, "https://muppet.fandom.com/api.php"],
  [/power rangers|super sentai|zord/i, "https://powerrangers.fandom.com/api.php"],
  [/ultraman|ultra series|kaiju \(ultra/i, "https://ultra.fandom.com/api.php"],
  [/kamen rider|masked rider/i, "https://kamenrider.fandom.com/api.php"],
  [/godzilla|gamera|mothra|ghidorah|toho|kaiju|tokusatsu/i, "https://wikizilla.org/w/api.php"],
  [/buffy|angel|vampire slayer|sunnydale/i, "https://buffy.fandom.com/api.php"],
  [/harry potter|hogwarts|wizarding world|fantastic beasts/i, "https://harrypotter.fandom.com/api.php"],
  [/game of thrones|westeros|targaryen|house of the dragon/i, "https://gameofthrones.fandom.com/api.php"],
  [/planet of the apes/i, "https://planetoftheapes.fandom.com/api.php"],
  [/ninja turtles|\btmnt\b/i, "https://tmnt.fandom.com/api.php"],
  [/friday the 13th|jason voorhees|camp crystal lake/i, "https://fridaythe13th.fandom.com/api.php"],
  [/hellraiser|pinhead|cenobite/i, "https://hellraiser.fandom.com/api.php"],
  [/nightmare on elm street|freddy krueger/i, "https://elmstreet.fandom.com/api.php"],
  [/marvel|avengers|\bmcu\b|x-men|guardians of the galaxy/i, "https://marvelcinematicuniverse.fandom.com/api.php"],
  [/batman|superman|justice league|\bdc\b comics?/i, "https://dc.fandom.com/api.php"],
  [/star trek/i, "https://memory-alpha.fandom.com/api.php"],
  [/babylon 5/i, "https://babylon5.fandom.com/api.php"],
  [/farscape/i, "https://farscape.fandom.com/api.php"],
];

// Turn a hint / host into a MediaWiki api endpoint. Fandom -> /api.php, else /w/api.php.
function apiFromHost(host) {
  return /(^|\.)fandom\.com$/i.test(host) ? `https://${host}/api.php` : `https://${host}/w/api.php`;
}
function resolveWiki(hint) {
  if (!hint) return null;
  if (/\/api\.php(\?|$)/.test(hint)) return hint;                 // already an api url
  if (/^https?:\/\//i.test(hint)) { try { return apiFromHost(new URL(hint).host); } catch { return null; } }
  return `https://${hint}.fandom.com/api.php`;                    // bare Fandom slug, e.g. "tardis"
}
function stillApiFor(s) {
  const explicit = resolveWiki(s.wiki);
  if (explicit) return explicit;
  const hay = `${s.production || ""} ${s.character || ""} ${s.universe || ""}`;
  for (const [re, api] of FRANCHISE_WIKIS) if (re.test(hay)) return api;
  try { const h = new URL(s.link).host; if (h && !/^en\.wikipedia\.org$/i.test(h)) return apiFromHost(h); } catch {}
  return STILL_WIKIS[s.universe] || null;
}

const FREE = [/cc0/i, /public domain/i, /^\s*pd/i, /cc[-\s]?by([-\s]?sa)?/i];
const isFree = (s = "") => FREE.some((re) => re.test(s));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const extOf = (url) => (url.split("?")[0].match(/\.(jpe?g|png|gif|webp)$/i)?.[1] || "jpg").toLowerCase();

// midpoint year of a card's run ("1993–99" -> 1993, "2011–2017" -> 2014) so we can
// prefer an actor photo taken near when they actually played the role.
const midYear = (years) => {
  const ys = (String(years || "").match(/(?:19|20)\d\d/g) || []).map(Number);
  return ys.length ? Math.round((Math.min(...ys) + Math.max(...ys)) / 2) : 0;
};
// titles that mean a lesser/other version of a character (a game, a reboot, a book)
const SPINOFF = /\b(video ?game|\(game\)|novel|comic|soundtrack|magazine|action figure|lego|\(disambiguation\)|animated series)\b/i;
// files that are not a person's photo (logos, flags, ui chrome, signatures, svgs)
const NONPHOTO = /logo|icon|symbol|commons-|edit-|flag|star_full|ambox|question_|padlock|signature|wikimedia|\.svg$/i;

let lastReq = 0;
async function politeFetch(url, tries = 0) {
  const wait = Math.max(0, DELAY - (Date.now() - lastReq));
  if (wait) await sleep(wait);
  lastReq = Date.now();
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*" } });
  if (r.status === 429 && tries < 4) {
    const back = (tries + 1) * 4000;
    console.log(`  429 — backing off ${back}ms`);
    await sleep(back);
    return politeFetch(url, tries + 1);
  }
  // Wikimedia's media host intermittently 403s under load — that's rate-limiting,
  // not a hard block, so back off and retry (portraits succeed on a later pass).
  if (r.status === 403 && /upload\.wikimedia\.org/.test(url) && tries < 3) {
    await sleep((tries + 1) * 3000);
    return politeFetch(url, tries + 1);
  }
  return r;
}
async function mw(base, params) {
  const url = base + "?" + new URLSearchParams({ format: "json", origin: "*", ...params });
  const r = await politeFetch(url);
  if (!r.ok) throw new Error(`${base} ${r.status}`);
  return r.json();
}
let warnedWikimedia = false;
async function download(url, out) {
  if (existsSync(out)) return true; // cache: never re-fetch
  const r = await politeFetch(url);
  if (!r.ok) {
    // Wikimedia sometimes 403s automated fetches to its media host ("robot policy").
    // Portraits from Commons may then be unavailable; stills (Fandom CDN) are not affected.
    if (r.status === 403 && /upload\.wikimedia\.org/.test(url) && !warnedWikimedia) {
      warnedWikimedia = true;
      console.log("  note: upload.wikimedia.org 403 (robot policy https://w.wiki/4wJS) — free portraits may be skipped from this host; stills unaffected.");
    }
    return false;
  }
  await writeFile(out, Buffer.from(await r.arrayBuffer()));
  return true;
}

// The CHARACTER still — prefer the canonical / most-popular (usually live-action)
// page: try the exact character title first, then a production-scoped search that
// skips spin-off pages (games, novels, reboots) that outrank the real still.
async function characterPage(base, s) {
  const exact = await mw(base, { action: "query", prop: "pageimages", piprop: "name", titles: s.character }).catch(() => null);
  const ep = Object.values(exact?.query?.pages || {})[0];
  if (ep && !("missing" in ep) && !SPINOFF.test(ep.title)) return { title: ep.title, lead: ep.pageimage };
  const sr = await mw(base, { action: "query", list: "search", srsearch: `${s.character} ${s.production || ""}`.trim(), srlimit: "8" }).catch(() => null);
  const titles = (sr?.query?.search || []).map((h) => h.title).filter((t) => !SPINOFF.test(t));
  const cl = s.character.toLowerCase();
  const pick = titles.find((t) => t.toLowerCase() === cl) || titles.find((t) => t.toLowerCase().startsWith(cl)) || titles[0];
  if (!pick) return null;
  const p = await mw(base, { action: "query", prop: "pageimages", piprop: "name", titles: pick }).catch(() => null);
  return { title: pick, lead: Object.values(p?.query?.pages || {})[0]?.pageimage };
}

// a later / other version of a character (an animated cameo, a reboot, a comic)
const LATER_VER = /lower ?decks|prodigy|\banimated\b|reboot|remaster|mirror|\bcomic\b|novel/i;
// behind-the-scenes / non-in-character shots
const BTS = /directing|behind|\bmakeup\b|on set|filming|storyboard|concept|\bart\b|schematic|deleted|blooper/i;
// Prefer a live-action screencap of the ORIGINAL appearance: animated/CG renders
// skew PNG and carry a later in-universe (stardate) year; live-action stills are JPG.
function stillScore(c, isVoice) {
  let sc = 0;
  if (LATER_VER.test(c.file)) sc += 800;
  if (BTS.test(c.file)) sc += 400;
  if (!isVoice && /\.png$/i.test(c.file)) sc += 250;
  if (c.lead) sc -= 100;
  if (c.plain) sc -= 60;
  if (c.starts) sc -= 40;
  const y = parseInt((String(c.file).match(/\b\d{4}\b/) || [])[0] || "0", 10);
  if (y >= 2300) sc += (y - 2300) * 2; // later stardate = less original
  return sc;
}
async function stillCandidates(base, title, leadFile, character) {
  const j = await mw(base, { action: "query", prop: "images", imlimit: "40", titles: title }).catch(() => null);
  const files = (Object.values(j?.query?.pages || {})[0]?.images || []).map((i) => i.title.replace(/^File:/, ""));
  const cl = character.toLowerCase();
  const words = cl.split(/\s+/).filter((w) => w.length >= 3);
  const keep = files.filter((t) => /\.(jpe?g|png)$/i.test(t) && !NONPHOTO.test(t) && words.some((w) => t.toLowerCase().includes(w))).slice(0, 10);
  const out = [];
  for (const f of keep) {
    const q = await mw(base, { action: "query", prop: "imageinfo", iiprop: "url", iiurlwidth: "640", titles: "File:" + f }).catch(() => null);
    const src = Object.values(q?.query?.pages || {})[0]?.imageinfo?.[0]?.thumburl;
    if (!src) continue;
    const bare = f.replace(/\.[a-z]+$/i, "").toLowerCase();
    out.push({ file: f, src, lead: leadFile && f === leadFile, plain: bare === cl, starts: bare.startsWith(cl) });
  }
  return out;
}
async function bestStill(base, s) {
  const pg = await characterPage(base, s).catch(() => null);
  if (!pg) return null;
  const host = new URL(base).host;
  const article = `https://${host}/wiki/${encodeURIComponent(pg.title.replace(/ /g, "_"))}`;
  const cands = await stillCandidates(base, pg.title, pg.lead, s.character).catch(() => []);
  if (cands.length) {
    cands.sort((a, b) => stillScore(a, s.kind === "voice") - stillScore(b, s.kind === "voice"));
    return { src: cands[0].src, article };
  }
  if (!pg.lead) return null; // fall back to the page's lead thumbnail
  const q = await mw(base, { action: "query", prop: "imageinfo", iiprop: "url", iiurlwidth: "640", titles: "File:" + pg.lead }).catch(() => null);
  const src = Object.values(q?.query?.pages || {})[0]?.imageinfo?.[0]?.thumburl;
  return src ? { src, article } : null;
}

async function getStill(s) {
  const wiki = stillApiFor(s);
  let pick = wiki ? await bestStill(wiki, s).catch(() => null) : null;
  if (!pick && LOOSE) pick = await bestStill(WIKIPEDIA, s).catch(() => null); // any character page
  if (!pick) return null;
  const out = `${IMGDIR}/${s.id.toLowerCase()}-still.${extOf(pick.src)}`;
  if (!(await download(pick.src, out))) return null;
  return { src: out, kind: "still", origin: pick.article };
}

// a performer photo from a Fandom wiki's actor page (copyright, but a real face)
async function fandomActorPhoto(base, actor) {
  const s = await mw(base, { action: "query", list: "search", srsearch: actor, srlimit: "1" }).catch(() => null);
  const hit = s?.query?.search?.[0]?.title;
  if (!hit) return null;
  const p = await mw(base, { action: "query", prop: "pageimages", piprop: "thumbnail|name", pithumbsize: "640", titles: hit }).catch(() => null);
  const page = Object.values(p?.query?.pages || {})[0];
  if (!page?.thumbnail?.source) return null;
  return { src: page.thumbnail.source, origin: `https://${new URL(base).host}/wiki/${encodeURIComponent(hit.replace(/ /g, "_"))}` };
}

// which Wikipedia page is the actor
async function actorPage(base, actor) {
  const s = await mw(base, { action: "query", list: "search", srsearch: actor, srlimit: "1" }).catch(() => null);
  return s?.query?.search?.[0]?.title || null;
}

// every photo on the actor's page, each with its date + license — the pool we
// choose a period-appropriate portrait from
async function portraitCandidates(base, pageTitle) {
  const j = await mw(base, { action: "query", prop: "images", imlimit: "60", titles: pageTitle }).catch(() => null);
  const page = Object.values(j?.query?.pages || {})[0];
  const files = (page?.images || []).map((i) => i.title).filter((t) => /\.(jpe?g|png)$/i.test(t) && !NONPHOTO.test(t)).slice(0, 12);
  const out = [];
  for (const f of files) {
    const q = await mw(base, { action: "query", prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "640", titles: f }).catch(() => null);
    const info = Object.values(q?.query?.pages || {})[0]?.imageinfo?.[0];
    if (!info?.thumburl) continue;
    const m = info.extmetadata || {};
    const date = (m.DateTimeOriginal?.value || m.DateTime?.value || "").replace(/<[^>]+>/g, "").trim();
    out.push({
      file: f,
      src: info.thumburl,
      w: info.width || 0,
      h: info.height || 0,
      year: parseInt((date.match(/(?:19|20)\d\d/) || [])[0] || "0", 10),
      license: (m.LicenseShortName?.value || m.License?.value || "").trim(),
      author: (m.Artist?.value || "").replace(/<[^>]+>/g, "").trim(),
      origin: info.descriptionurl || "",
    });
  }
  return out;
}

// filenames that betray a group / event shot rather than a solo headshot
const GROUP = /\b(and|with|cast|group|panel|others|amp)\b|,| ?& ?/i;
// score a portrait candidate: lower is better. Prefer free, close to the role
// year, portrait-orientation (headshots are usually taller than wide), a solo
// photo, and one named after the actor.
function portraitScore(c, target, surname) {
  let sc = 0;
  if (!isFree(c.license)) sc += 1000;
  sc += c.year && target ? Math.abs(c.year - target) : 400;
  if (c.w && c.h && c.w > c.h * 1.05) sc += 350;              // landscape → probably not a headshot
  if (GROUP.test(c.file || "")) sc += 450;                    // group / event photo
  if (surname && (c.file || "").toLowerCase().includes(surname)) sc -= 150; // named after them
  return sc;
}

// The ACTOR portrait (the unmasked face). First a Wikipedia/Commons photo, chosen
// to prefer a freely-licensed one taken closest to when they played the role.
async function wikipediaPortrait(s) {
  const page = await actorPage(WIKIPEDIA, s.actor);
  if (!page) return null;
  const cands = await portraitCandidates(WIKIPEDIA, page).catch(() => []);
  if (!cands.length) return null;
  const target = midYear(s.years);
  const surname = (s.actor.split(/\s+/).pop() || "").toLowerCase();
  cands.sort((a, b) => portraitScore(a, target, surname) - portraitScore(b, target, surname));
  const best = cands[0];
  const out = `${IMGDIR}/${s.id.toLowerCase()}-portrait.${extOf(best.src)}`;
  if (!(await download(best.src, out))) return null;
  return {
    src: out,
    kind: isFree(best.license) ? "free" : "copyright",
    origin: best.origin || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, "_"))}`,
    author: best.author || "",
    license: best.license || "",
    ...(best.year ? { year: best.year } : {}),
  };
}

async function getPortrait(s) {
  const wp = await wikipediaPortrait(s).catch(() => null);
  if (wp) return wp;
  // LOOSE: fall back to the franchise Fandom wiki's performer photo (copyright).
  if (LOOSE) {
    const wiki = stillApiFor(s);
    const cand = wiki ? await fandomActorPhoto(wiki, s.actor).catch(() => null) : null;
    if (cand) {
      const out = `${IMGDIR}/${s.id.toLowerCase()}-portrait.${extOf(cand.src)}`;
      if (await download(cand.src, out)) return { src: out, kind: "copyright", origin: cand.origin, author: "", license: "" };
    }
  }
  return null;
}

// `node scripts/retrieve.mjs --audit` — no network; just report which still-wiki
// each card resolves to and how much of the roster is now reachable.
async function audit() {
  const specimens = JSON.parse(await readFile(DATA, "utf8"));
  const byWiki = {};
  let resolved = 0;
  for (const s of specimens) {
    const api = stillApiFor(s);
    const host = api ? new URL(api).host : "— (no still wiki → Wikipedia portrait / gap)";
    byWiki[host] = (byWiki[host] || 0) + 1;
    if (api) resolved++;
  }
  console.log(`still-wiki coverage: ${resolved}/${specimens.length} cards resolve to a character-still wiki\n`);
  for (const [host, n] of Object.entries(byWiki).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${host}`);
  }
}

async function main() {
  if (process.argv.includes("--audit")) return audit();
  await mkdir(IMGDIR, { recursive: true });
  const specimens = JSON.parse(await readFile(DATA, "utf8"));
  let ledger = [];
  try { ledger = JSON.parse(await readFile(LEDGER, "utf8")); } catch {}
  const gaps = [];
  // RETRIEVE_ONLY=UC-049,UC-054 limits the run to specific cards (targeted re-picks).
  const only = new Set((process.env.RETRIEVE_ONLY || "").split(",").map((x) => x.trim().toUpperCase()).filter(Boolean));
  // process any card missing EITHER side, and fetch only the side it lacks — so a
  // card that already has a still still gets its unmasked portrait filled in.
  const todo = specimens.filter((s) => (only.size ? only.has(s.id.toUpperCase()) : (!s.still || !s.portrait))).slice(0, only.size ? only.size : MAX);
  console.log(`retrieving for ${todo.length} of ${specimens.length} (max ${MAX})`);

  let filled = 0;
  for (const s of todo) {
    try {
      const still = s.still || await getStill(s).catch(() => null);
      const portrait = s.portrait || await getPortrait(s).catch(() => null);
      if (still) s.still = still;
      if (portrait) s.portrait = portrait;

      ledger = ledger.filter((r) => r.id !== s.id);
      ledger.push({ id: s.id, actor: s.actor, character: s.character, universe: s.universe, still, portrait, fetched_at: new Date().toISOString().slice(0, 10) });

      if (still || portrait) {
        filled++;
        console.log(`  ${s.id} ${s.actor}: ${[still && "still", portrait && `portrait(${portrait.kind})`].filter(Boolean).join(" + ")}`);
      } else {
        gaps.push({ id: s.id, actor: s.actor, character: s.character, universe: s.universe });
        console.log(`  ${s.id} ${s.actor}: GAP (nothing found — gen worklist)`);
      }
    } catch (e) { console.log(`  ${s.id} error: ${e.message}`); }
  }

  await writeFile(DATA, JSON.stringify(specimens, null, 2) + "\n");
  await writeFile(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  // merge gaps with any existing outstanding ones
  let priorGaps = [];
  try { priorGaps = JSON.parse(await readFile(GAPS, "utf8")); } catch {}
  const stillGap = specimens.filter((s) => !s.still && !s.portrait).map((s) => ({ id: s.id, actor: s.actor, character: s.character, universe: s.universe }));
  await writeFile(GAPS, JSON.stringify(stillGap, null, 2) + "\n");

  console.log(`done: ${filled} illustrated this run, ${stillGap.length} gaps remain. ledger: ${ledger.length} rows.`);
}
main();
