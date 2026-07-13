#!/usr/bin/env node
/** Check human/fact references carried by the roster. */
import { readFile } from "node:fs/promises";

const USER_AGENT = "undercast-link-audit/1.0 (+https://github.com/BigBirdReturns/undercast)";
const specimens = JSON.parse(await readFile("data/specimens.json", "utf8"));
const constellations = JSON.parse(await readFile("data/constellations.json", "utf8"));
const includeAssets = process.argv.includes("--assets");
const constellationOnly = process.argv.includes("--constellations");
const refs = [];
for (const record of constellationOnly ? [] : specimens) {
  refs.push({ id: record.id, field: "link", url: record.link });
  for (const [index, claim] of (record.references || []).entries()) refs.push({ id: record.id, field: `references[${index}]`, url: claim.source });
  for (const [index, condition] of (record.conditions || []).entries()) refs.push({ id: record.id, field: `conditions[${index}]`, url: condition.source });
  if (includeAssets) {
    if (record.still?.origin) refs.push({ id: record.id, field: "still.origin", url: record.still.origin });
    if (record.portrait?.origin) refs.push({ id: record.id, field: "portrait.origin", url: record.portrait.origin });
  }
}
for (const node of constellations.nodes || []) refs.push({ id: node.id, field: "source", url: node.source });
for (const edge of constellations.edges || []) {
  for (const [index, evidence] of (edge.evidence || []).entries()) refs.push({ id: edge.id, field: `evidence[${index}]`, url: evidence.source });
}

const malformed = [];
for (const ref of refs) {
  try { if (new URL(ref.url).protocol !== "https:") malformed.push({ ...ref, reason: "not HTTPS" }); }
  catch { malformed.push({ ...ref, reason: "malformed URL" }); }
}
const badKeys = new Set(malformed.map((row) => `${row.id}|${row.field}`));
const unique = new Map();
for (const ref of refs) if (!badKeys.has(`${ref.id}|${ref.field}`)) {
  const row = unique.get(ref.url) || { url: ref.url, refs: [] };
  row.refs.push(`${ref.id}.${ref.field}`); unique.set(ref.url, row);
}

const wikipedia = [], direct = [];
for (const row of unique.values()) {
  const parsed = new URL(row.url);
  const match = parsed.hostname === "en.wikipedia.org" && parsed.pathname.match(/^\/wiki\/(.+)$/);
  if (match) wikipedia.push({ ...row, title: decodeURIComponent(match[1]).replace(/_/g, " ") });
  else direct.push(row);
}

const missing = [...malformed], redirects = [], blocked = [];
for (let offset = 0; offset < wikipedia.length; offset += 25) {
  const batch = wikipedia.slice(offset, offset + 25);
  const endpoint = new URL("https://en.wikipedia.org/w/api.php");
  endpoint.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", redirects: "1", titles: batch.map((row) => row.title).join("|") });
  const response = await fetch(endpoint, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Wikipedia API ${response.status}`);
  const body = await response.json();
  const pages = new Map((body.query?.pages || []).map((page) => [String(page.title).toLowerCase(), page]));
  const redirectMap = new Map((body.query?.redirects || []).map((item) => [String(item.from).toLowerCase(), item.to]));
  for (const row of batch) {
    const canonical = redirectMap.get(row.title.toLowerCase()) || row.title;
    const page = pages.get(canonical.toLowerCase());
    if (!page || page.missing) missing.push({ ...row, reason: "Wikipedia page missing" });
    else if (canonical !== row.title) redirects.push({ from: row.url, to: `https://en.wikipedia.org/wiki/${encodeURIComponent(canonical.replace(/ /g, "_"))}`, refs: row.refs });
  }
}

async function probe(row) {
  let last = "request failed";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(row.url, { redirect: "follow", headers: { "User-Agent": USER_AGENT, Range: "bytes=0-0" }, signal: AbortSignal.timeout(20000) });
      await response.body?.cancel();
      if (response.ok || response.status === 206) return null;
      if (response.status === 404 || response.status === 410) return { ...row, reason: `HTTP ${response.status}` };
      if (response.status === 401 || response.status === 403) return { ...row, blocked: `HTTP ${response.status}` };
      last = `HTTP ${response.status}`;
    } catch (error) { last = error?.name === "TimeoutError" ? "timeout" : String(error?.message || error); }
  }
  return { ...row, blocked: last };
}
for (let offset = 0; offset < direct.length; offset += 6) {
  const results = await Promise.all(direct.slice(offset, offset + 6).map(probe));
  blocked.push(...results.filter((row) => row?.blocked));
  missing.push(...results.filter((row) => row && !row.blocked));
}

console.log(`checked ${unique.size} unique URL(s) across ${refs.length} reference(s)`);
console.log(`  Wikipedia: ${wikipedia.length}  direct: ${direct.length}  redirects: ${redirects.length}`);
for (const row of redirects) console.log(`  redirect ${row.from} -> ${row.to} (${row.refs.join(", ")})`);
if (blocked.length) console.log(`  inconclusive (host denied automated probe): ${blocked.length}`);
for (const row of missing) console.error(`  FAIL ${row.url || "(no URL)"} — ${row.reason} (${(row.refs || [`${row.id}.${row.field}`]).join(", ")})`);
if (missing.length) process.exitCode = 1;
