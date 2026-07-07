#!/usr/bin/env node
/**
 * pin.mjs — lock the BEST mask/face onto a card. NO API KEY.
 *
 * The crawler picks a good image by heuristic; but only a model that actually
 * LOOKS at the candidates can pick the best-framed one. When a session model (or
 * a human) has eyeballed the options, it pins the winners here. Pinned assets are
 * marked `"pin": true` and the crawler will never auto-replace them.
 *
 *   node scripts/pin.mjs UC-001 --wiki https://memory-alpha.fandom.com/api.php \
 *        --still "Morn.jpg" --portrait "Mark Allen Shepherd.jpg"
 *
 * --still / --portrait take a File name on --wiki, or a full image URL.
 * Provenance (license, author, source page) is read from the wiki and logged.
 */
import { readFile, writeFile } from "node:fs/promises";

const UA = `undercast/0.1 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "pin"})`;
const DATA = "data/specimens.json";
const LEDGER = "data/SOURCES.json";
const IMGDIR = "images";
const FREE = [/cc0/i, /public domain/i, /^\s*pd/i, /cc[-\s]?by([-\s]?sa)?/i];
const isFree = (s = "") => FREE.some((re) => re.test(s));
const extOf = (u) => (u.split("?")[0].match(/\.(jpe?g|png|gif|webp)$/i)?.[1] || "jpg").toLowerCase();

const args = process.argv.slice(2);
const id = args[0];
const opt = (k) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : null; };
const wiki = opt("wiki");
if (!id || !/^uc-/i.test(id)) { console.error("usage: node scripts/pin.mjs <UC-id> --wiki <api> [--still <file|url>] [--portrait <file|url>]"); process.exit(1); }

async function resolve(fileOrUrl) {
  if (/^https?:\/\//.test(fileOrUrl)) return { url: fileOrUrl, license: "", author: "", origin: fileOrUrl };
  if (!wiki) throw new Error("a File name needs --wiki");
  const u = wiki + "?" + new URLSearchParams({ format: "json", origin: "*", action: "query", prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "900", titles: "File:" + fileOrUrl });
  const j = await (await fetch(u, { headers: { "User-Agent": UA } })).json();
  const info = Object.values(j.query.pages)[0]?.imageinfo?.[0];
  if (!info) throw new Error("file not found: " + fileOrUrl);
  const m = info.extmetadata || {};
  return { url: info.thumburl || info.url, license: (m.LicenseShortName?.value || "").trim(), author: (m.Artist?.value || "").replace(/<[^>]+>/g, "").trim(), origin: info.descriptionurl || "" };
}
async function download(url, out) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("download " + r.status);
  await writeFile(out, Buffer.from(await r.arrayBuffer()));
}

const specimens = JSON.parse(await readFile(DATA, "utf8"));
let ledger = []; try { ledger = JSON.parse(await readFile(LEDGER, "utf8")); } catch {}
const s = specimens.find((x) => x.id.toLowerCase() === id.toLowerCase());
if (!s) { console.error("no card " + id); process.exit(1); }

for (const side of ["still", "portrait"]) {
  const val = opt(side);
  if (!val) continue;
  const r = await resolve(val);
  const out = `${IMGDIR}/${s.id.toLowerCase()}-${side}.${extOf(r.url)}`;
  await download(r.url, out);
  s[side] = side === "still"
    ? { src: out, kind: "still", origin: r.origin, pin: true }
    : { src: out, kind: isFree(r.license) ? "free" : "copyright", origin: r.origin, author: r.author, license: r.license, pin: true };
  console.log(`pinned ${s.id} ${side}: ${val} -> ${out} (${s[side].kind})`);
}

const i = ledger.findIndex((r) => r.id === s.id);
const row = i >= 0 ? ledger[i] : { id: s.id, actor: s.actor, character: s.character, universe: s.universe, still: null, portrait: null };
row.still = s.still || row.still; row.portrait = s.portrait || row.portrait; row.fetched_at = new Date().toISOString().slice(0, 10);
if (i >= 0) ledger[i] = row; else ledger.push(row);

await writeFile(DATA, JSON.stringify(specimens, null, 2) + "\n");
await writeFile(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
console.log("done. rebuild credits if a free portrait changed: node scripts/credits.mjs");
