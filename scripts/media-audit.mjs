#!/usr/bin/env node
import { appendFile, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  MEDIA_AUDIT_VERSION,
  applyVotes,
  copyJson,
  deriveItem,
  makePacket,
  mediaItemId,
  normalize,
  sha256,
  stableJson,
  summarize,
  trackerRows,
  validatePacket,
  validateState,
} from "./lib/media-audit.mjs";

const DEFAULT_STATE = "data/MEDIA-AUDIT.json";
const DEFAULT_SCOPES = "data/MEDIA-AUDIT-SCOPES.json";
const DEFAULT_SPECIMENS = "data/specimens.json";
const DEFAULT_SOURCES = "data/SOURCES.json";
const DEFAULT_MEDIA_MANIFEST = "data/media-manifest.json";
const DEFAULT_JOURNAL = "data/journal/media-audit.jsonl";
const DEFAULT_LOCK = "data/MEDIA-AUDIT.lock";

const args = process.argv.slice(2);
const command = args.shift() || "status";
function option(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} requires a value`);
  return value;
}
const flag = (name) => args.includes(`--${name}`);

async function readJsonBytes(path, fallback) {
  try { const bytes = await readFile(path); return { bytes, value: JSON.parse(bytes) }; }
  catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) {
      const value = copyJson(fallback); return { bytes: Buffer.from(stableJson(value)), value };
    }
    throw new Error(`cannot read ${path}: ${error.message}`);
  }
}
async function readJson(path, fallback) { return (await readJsonBytes(path, fallback)).value; }
async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, path);
}
async function withLock(fn) {
  const path = option("lock", DEFAULT_LOCK);
  await mkdir(dirname(path), { recursive: true });
  let handle;
  try { handle = await open(path, "wx"); await handle.writeFile(`${JSON.stringify({ pid: process.pid, command, at: new Date().toISOString() })}\n`); }
  catch (error) { if (error.code === "EEXIST") throw new Error(`${path} exists; another media-audit writer may be active`); throw error; }
  try { return await fn(); }
  finally { await handle?.close().catch(() => {}); await rm(path, { force: true }); }
}
function journalLines(events) {
  return events.map((entry) => {
    const body = { ...entry };
    const id = `maj_${sha256(stableJson(body)).slice(0, 24)}`;
    return JSON.stringify({ id, ...body });
  }).join("\n") + (events.length ? "\n" : "");
}
async function appendJournal(path, events) {
  if (!events.length) return;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, journalLines(events));
}
function scopedRows(doc) { return Array.isArray(doc) ? doc : doc.scopes; }
function sourceKey(value) {
  try { const url = new URL(value); url.hash = ""; return url.toString().replace(/\/$/, ""); }
  catch { return String(value || "").trim(); }
}
function safeAssetPath(root, src) {
  const absolute = resolve(root, src);
  const rel = relative(resolve(root), absolute);
  if (!src || rel.startsWith("..") || rel === "" || rel.startsWith("/")) throw new Error(`unsafe media asset path ${src}`);
  return absolute;
}
function scopeForSpecimen(scopes, specimen) {
  return scopes.find((scope) => scope.status !== "retired" && (!scope.match?.universe || normalize(scope.match.universe) === normalize(specimen.universe)));
}
function deriveRiskCodes(side, asset, counterpartHash) {
  if (!asset) return ["source-declared-absent"];
  const codes = [];
  let host = "";
  try { host = new URL(asset.origin || "").hostname.toLowerCase(); } catch {}
  if (!asset.origin) codes.push("missing-origin");
  if (side === "portrait" && /(?:^|\.)fandom\.com$/.test(host)) codes.push("fandom-performer-page");
  if (side === "portrait" && asset.kind === "still") codes.push("portrait-kind-still");
  if (side === "still" && asset.kind && asset.kind !== "still") codes.push("still-kind-mismatch");
  if (counterpartHash && counterpartHash === asset.sha256) codes.push("same-bytes-as-opposite-side");
  return [...new Set(codes)].sort();
}
async function buildCurrentState({ previous = null } = {}) {
  const root = option("root", ".");
  const statePath = option("state", DEFAULT_STATE);
  const specimensPath = option("specimens", DEFAULT_SPECIMENS);
  const sourcesPath = option("sources", DEFAULT_SOURCES);
  const mediaManifestPath = option("media-manifest", DEFAULT_MEDIA_MANIFEST);
  const scopesPath = option("scopes", DEFAULT_SCOPES);
  const [specimensDoc, sourcesDoc, mediaDoc, scopesDoc] = await Promise.all([
    readJsonBytes(specimensPath), readJsonBytes(sourcesPath), readJsonBytes(mediaManifestPath, { version: 1, assets: [] }), readJsonBytes(scopesPath),
  ]);
  if (!Array.isArray(specimensDoc.value) || !Array.isArray(sourcesDoc.value)) throw new Error("specimens and SOURCES must be arrays");
  const scopes = scopedRows(scopesDoc.value);
  if (!Array.isArray(scopes) || !scopes.length) throw new Error("MEDIA-AUDIT-SCOPES has no scopes");
  const sources = new Map(sourcesDoc.value.map((row) => [row.id, row]));
  const oldById = new Map((previous?.items || []).map((item) => [item.id, item]));
  const items = [];
  for (const specimen of specimensDoc.value) {
    const scope = scopeForSpecimen(scopes, specimen);
    if (!scope) continue;
    const ledger = sources.get(specimen.id);
    if (!ledger) throw new Error(`SOURCES has no row for ${specimen.id}`);
    if (normalize(ledger.actor) !== normalize(specimen.actor) || normalize(ledger.character) !== normalize(specimen.character)) throw new Error(`SOURCES identity drift for ${specimen.id}`);
    const receipts = {};
    for (const side of ["still", "portrait"]) {
      const specAsset = specimen[side] || null, ledgerAsset = ledger[side] || null;
      if (JSON.stringify(specAsset) !== JSON.stringify(ledgerAsset)) throw new Error(`${specimen.id} ${side} differs between specimens and SOURCES`);
      if (!specAsset) { receipts[side] = null; continue; }
      const path = safeAssetPath(root, specAsset.src);
      const bytes = await readFile(path).catch((error) => { throw new Error(`${specimen.id} ${side} asset unavailable at ${specAsset.src}: ${error.message}`); });
      receipts[side] = { src: specAsset.src, sha256: sha256(bytes), bytes: bytes.length, origin: sourceKey(specAsset.origin), kind: specAsset.kind || null };
    }
    for (const side of ["still", "portrait"]) {
      const id = mediaItemId(scope.id, specimen.id, side);
      const asset = receipts[side];
      const old = oldById.get(id);
      const votes = old?.asset?.sha256 === asset?.sha256 && old?.expected_subject === (side === "still" ? specimen.character : specimen.actor) ? copyJson(old.votes || []) : [];
      const raw = {
        id, scope: scope.id, wall_id: specimen.id, side,
        actor: specimen.actor, character: specimen.character,
        expected_subject: side === "still" ? specimen.character : specimen.actor,
        source_fetched_at: ledger.fetched_at || null,
        asset,
        risk_codes: deriveRiskCodes(side, asset, receipts[side === "still" ? "portrait" : "still"]?.sha256),
        votes,
        status: "review",
        claims: { identity: null, presentation: null },
      };
      const derived = deriveItem(raw);
      raw.status = derived.status; raw.claims = derived.claims;
      items.push(raw);
    }
  }
  items.sort((a, b) => a.scope.localeCompare(b.scope) || a.wall_id.localeCompare(b.wall_id) || a.side.localeCompare(b.side));
  const itemSet = items.map((item) => ({ id: item.id, scope: item.scope, wall_id: item.wall_id, side: item.side, expected_subject: item.expected_subject, asset: item.asset, risk_codes: item.risk_codes }));
  const source = {
    specimens_path: specimensPath,
    specimens_sha256: sha256(specimensDoc.bytes),
    sources_path: sourcesPath,
    sources_sha256: sha256(sourcesDoc.bytes),
    media_manifest_path: mediaManifestPath,
    media_manifest_sha256: sha256(mediaDoc.bytes),
    scopes_path: scopesPath,
    scopes_sha256: sha256(scopesDoc.bytes),
    item_set_sha256: sha256(stableJson(itemSet)),
  };
  const now = option("now", new Date().toISOString());
  const state = { version: MEDIA_AUDIT_VERSION, source, updated_at: previous?.updated_at || now, items };
  const structuralBefore = previous ? stableJson({ source: previous.source, items: previous.items }) : null;
  const structuralAfter = stableJson({ source: state.source, items: state.items });
  if (structuralBefore !== structuralAfter) state.updated_at = now;
  validateState(state);
  return { state, statePath, changed: structuralBefore !== structuralAfter };
}
async function loadState({ requireCurrent = true } = {}) {
  const path = option("state", DEFAULT_STATE);
  const state = await readJson(path);
  validateState(state);
  if (requireCurrent) {
    const current = await buildCurrentState({ previous: state });
    if (stableJson({ source: current.state.source, items: current.state.items.map((item) => ({ ...item, votes: [] })) }) !== stableJson({ source: state.source, items: state.items.map((item) => ({ ...item, votes: [] })) })) {
      throw new Error(`${path} is stale; run media:audit sync`);
    }
  }
  return state;
}
function selectedScope(state) { return option("scope") || null; }
function printSummary(summary) {
  console.log(`media audit${summary.scope ? ` ${summary.scope}` : ""}: ${summary.complete}/${summary.total} complete (${(summary.completion_ratio * 100).toFixed(1)}%); verified=${summary.verified} absent=${summary.absent} review=${summary.review} attention=${summary.attention}`);
  for (const [side, row] of Object.entries(summary.sides).sort()) console.log(`  ${side}: ${row.verified + row.absent}/${row.total} complete; verified=${row.verified} absent=${row.absent} review=${row.review} attention=${row.attention}`);
}
function renderHtml(packet) {
  const cards = packet.items.map((item) => `<article><img src="${escapeHtml(item.asset.src)}" alt=""><h2>${escapeHtml(item.wall_id)} · ${escapeHtml(item.side)}</h2><p><strong>Expected:</strong> ${escapeHtml(item.expected_subject)}</p><p><strong>Character:</strong> ${escapeHtml(item.character)}<br><strong>Performer:</strong> ${escapeHtml(item.actor)}</p><p><strong>Risk:</strong> ${escapeHtml(item.risk_codes.join(", ") || "none")}</p><p><code>${item.asset.sha256}</code></p></article>`).join("\n");
  return `<!doctype html><meta charset="utf-8"><title>UNDERCAST media audit ${packet.packet_id}</title><style>body{font:15px system-ui;margin:24px;background:#eee;color:#111}header{max-width:900px;margin:auto auto 24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}article{background:white;padding:12px;border:1px solid #bbb}img{width:100%;height:260px;object-fit:contain;background:#222}h2{font-size:17px}code{font-size:10px;word-break:break-all}</style><header><h1>UNDERCAST media audit</h1><p>Packet <code>${packet.packet_id}</code>. Reviewer ${escapeHtml(packet.reviewer)} (${escapeHtml(packet.role)}). This sheet supports presentation and identity review; it does not authorize guessing.</p></header><main>${cards}</main>`;
}
function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }

async function syncCommand() {
  return withLock(async () => {
    let previous = null;
    try { previous = await readJson(option("state", DEFAULT_STATE)); validateState(previous); } catch (error) { if (!/cannot read/.test(error.message) && error.code !== "ENOENT") { /* initial invalid state must fail */ if (error.message && !error.message.includes("ENOENT")) throw error; } }
    const result = await buildCurrentState({ previous });
    if (result.changed || !previous) await atomicJson(result.statePath, result.state);
    console.log(result.changed || !previous ? `synced ${result.statePath}` : "media audit sync: no state change");
    printSummary(summarize(result.state, selectedScope(result.state)));
  });
}
async function statusCommand() {
  const state = await loadState();
  const summary = summarize(state, selectedScope(state));
  if (flag("json")) console.log(JSON.stringify({ source: state.source, ...summary }, null, 2)); else printSummary(summary);
}
async function trackerCommand() {
  const state = await loadState();
  const rows = trackerRows(state, { scope: selectedScope(state), reviewer: option("reviewer"), namespace: option("namespace"), includeVerified: flag("all") });
  const limit = Number(option("limit", "100"));
  if (flag("json")) console.log(JSON.stringify(rows.slice(0, limit), null, 2));
  else for (const item of rows.slice(0, limit)) console.log(`${item.status.padEnd(9)} ${item.wall_id} ${item.side.padEnd(8)} ${item.risk_codes.join(",") || "-"} identity=${item.claims.identity?.state || "-"}/${item.claims.identity?.value || "-"} presentation=${item.claims.presentation?.state || "-"}/${item.claims.presentation?.value || "-"}`);
}
async function nextCommand() {
  const state = await loadState();
  const reviewer = option("reviewer"), role = option("role", "reviewer"), namespace = option("namespace");
  const limit = Number(option("limit", "16"));
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit must be 1..100");
  const rows = trackerRows(state, { scope: selectedScope(state), reviewer, namespace, includeVerified: flag("all") }).slice(0, limit);
  if (!rows.length) { console.log("media audit: no matching review items"); process.exitCode = 3; return; }
  const packet = makePacket(state, rows, { reviewer, role, namespace, now: option("now", new Date().toISOString()) });
  const out = option("out"), html = option("html");
  if (out) await atomicJson(out, packet);
  if (html) { await mkdir(dirname(html), { recursive: true }); await writeFile(html, renderHtml(packet)); }
  console.log(JSON.stringify(packet, null, 2));
}
async function submitCommand() {
  return withLock(async () => {
    const packetPath = option("packet"), inputPath = option("input");
    if (!packetPath || !inputPath) throw new Error("submit requires --packet and --input");
    const [state, packet, input] = await Promise.all([loadState(), readJson(packetPath), readJson(inputPath)]);
    validatePacket(packet, state);
    if (input.version !== MEDIA_AUDIT_VERSION || input.packet_id !== packet.packet_id) throw new Error("media-audit result does not match packet");
    if (input.reviewer !== packet.reviewer || input.role !== packet.role) throw new Error("media-audit result reviewer/role does not match packet");
    const packetIds = new Set(packet.items.map((item) => item.item_id));
    if (!Array.isArray(input.votes) || !input.votes.length) throw new Error("media-audit result needs votes[]");
    const votes = input.votes.map((vote) => ({ ...vote, reviewer: input.reviewer, role: input.role }));
    for (const vote of votes) if (!packetIds.has(vote.item_id)) throw new Error(`vote ${vote.item_id} is outside the packet`);
    const result = applyVotes(state, votes, { now: option("now", new Date().toISOString()) });
    await atomicJson(option("state", DEFAULT_STATE), result.state);
    await appendJournal(option("journal", DEFAULT_JOURNAL), result.events);
    console.log(`recorded ${votes.length} media-audit vote(s)`);
    printSummary(summarize(result.state, selectedScope(result.state)));
  });
}
async function resolveCommand() {
  return withLock(async () => {
    const inputPath = option("input");
    if (!inputPath) throw new Error("resolve requires --input");
    const [state, input] = await Promise.all([loadState(), readJson(inputPath)]);
    if (input.version !== MEDIA_AUDIT_VERSION || !Array.isArray(input.votes) || !input.votes.length) throw new Error("resolution file needs version and votes[]");
    const reviewer = input.reviewed_by, role = input.reviewed_role;
    if (!reviewer || !["second-desk", "owner"].includes(role)) throw new Error("resolution file requires second-desk or owner authority");
    const votes = input.votes.map((vote) => ({ ...vote, reviewer, role, enforced: vote.enforced !== false }));
    const result = applyVotes(state, votes, { now: input.reviewed_at || option("now", new Date().toISOString()) });
    await atomicJson(option("state", DEFAULT_STATE), result.state);
    await appendJournal(option("journal", DEFAULT_JOURNAL), result.events);
    console.log(`enforced ${votes.length} reviewed media-audit ruling(s)`);
    printSummary(summarize(result.state, selectedScope(result.state)));
  });
}
async function validateCommand() {
  const state = await loadState();
  validateState(state);
  console.log(`PASS — ${state.items.length} media facets, immutable asset receipts and consensus state valid`);
}
async function gateCommand() {
  const state = await loadState();
  const scope = option("scope");
  if (!scope) throw new Error("gate requires --scope");
  const summary = summarize(state, scope);
  printSummary(summary);
  if (!summary.total) throw new Error(`media audit has no items for scope ${scope}`);
  if (summary.complete !== summary.total) {
    console.error(`media audit gate: ${summary.total - summary.complete} facet(s) remain unverified or require correction`);
    process.exitCode = 2;
  } else console.log(`PASS — ${scope} exact-subject media baseline complete`);
}

async function main() {
  if (command === "sync") return syncCommand();
  if (command === "status") return statusCommand();
  if (command === "tracker") return trackerCommand();
  if (command === "next") return nextCommand();
  if (command === "submit") return submitCommand();
  if (command === "resolve") return resolveCommand();
  if (command === "validate") return validateCommand();
  if (command === "gate") return gateCommand();
  throw new Error(`unknown media-audit command ${command}. Use sync, status, tracker, next, submit, resolve, validate, or gate.`);
}
main().catch((error) => { console.error(`media audit: ${error.message}`); process.exitCode = 1; });
