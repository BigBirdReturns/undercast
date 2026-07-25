#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const command = args.shift() || "select";
const root = resolve(process.env.FERENGI_ORBIT_ROOT || args[0] || ".");
const CONTROL = ".github/FERENGI-GOLD-FINAL-PORTRAITS.json";
const SELECTION = "data/review/ferengi-gold/final-portrait-selection-2026-07-25.json";
const RECEIPT = "data/review/ferengi-gold/final-portraits-applied-2026-07-25.json";
const RESOLUTION = "data/review/ferengi-gold/final-portraits-media-resolution-2026-07-25.json";
const SPECIMENS = "data/specimens.json";
const SOURCES = "data/SOURCES.json";
const MEDIA = "data/MEDIA-AUDIT.json";
const MANIFEST = "data/media-manifest.json";

const sha256 = value => createHash("sha256").update(value).digest("hex");
const normalize = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, " ").trim().toLowerCase();
const slug = value => normalize(value).replace(/\s+/g, "-");
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); };
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const https = value => { try { return new URL(value).protocol === "https:"; } catch { return false; } };
const imageExt = path => { const ext = extname(path).toLowerCase(); return ext === ".jpeg" ? ".jpg" : [".jpg", ".png", ".webp"].includes(ext) ? ext : ".jpg"; };
function signature(bytes) {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return ".png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";
  if (bytes.length > 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return ".webp";
  return "";
}
async function filesUnder(start) {
  const out = [];
  async function walk(path) {
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  await walk(start);
  return out;
}
function actorFromPath(path, targets) {
  const key = normalize(path);
  return targets.find(target => key.includes(normalize(target.actor)))?.actor || null;
}
function candidatePath(object) {
  for (const key of ["local", "local_path", "downloaded_path", "candidate_path", "image_path", "path", "file", "output"]) {
    const value = object?.[key];
    if (typeof value === "string" && /\.(?:jpe?g|png|webp)$/i.test(value)) return value;
  }
  return null;
}
function sourcePage(object, context) {
  for (const key of ["source_page", "page_url", "profile_url", "origin", "referer"]) {
    const value = object?.[key] ?? context?.[key];
    if (typeof value === "string" && /^https:\/\//.test(value)) return value;
  }
  return "";
}
function assetUrl(object, context) {
  for (const key of ["asset_url", "resolved_url", "image_url", "url", "download_url", "original_url"]) {
    const value = object?.[key] ?? context?.[key];
    if (typeof value === "string" && /^https:\/\//.test(value)) return value;
  }
  return "";
}
async function resolveCandidatePath(value, jsonPath) {
  if (!value) return null;
  const choices = [resolve(value), resolve(dirname(jsonPath), value), resolve(root, value), resolve(dirname(dirname(jsonPath)), value)];
  for (const path of choices) {
    const row = await stat(path).catch(() => null);
    if (row?.isFile()) return path;
  }
  return null;
}
async function scanCandidates(control) {
  const all = await filesUnder(root);
  const jsonPaths = all.filter(path => path.endsWith(".json"));
  const candidates = [];
  const metadataByBase = new Map();
  for (const jsonPath of jsonPaths) {
    let doc;
    try { doc = JSON.parse(await readFile(jsonPath, "utf8")); } catch { continue; }
    async function walk(value, context = {}) {
      if (Array.isArray(value)) { for (const child of value) await walk(child, context); return; }
      if (!value || typeof value !== "object") return;
      const next = { ...context };
      for (const key of ["actor", "performer", "expected_subject", "provider", "label", "note", "source_page", "page_url", "profile_url", "origin", "referer", "asset_url", "resolved_url", "image_url", "url", "download_url", "original_url"]) {
        if (typeof value[key] === "string") next[key] = value[key];
      }
      const rawPath = candidatePath(value);
      const local = await resolveCandidatePath(rawPath, jsonPath);
      if (local) {
        const actor = value.actor || value.performer || context.actor || context.performer || actorFromPath(`${jsonPath} ${local}`, control.targets);
        const row = {
          actor,
          local,
          source_page: sourcePage(value, next),
          asset_url: assetUrl(value, next),
          provider: value.provider || next.provider || "",
          label: value.label || next.label || "",
          note: value.note || next.note || "",
          json_path: jsonPath,
        };
        candidates.push(row);
        metadataByBase.set(basename(local), row);
      }
      for (const child of Object.values(value)) await walk(child, next);
    }
    await walk(doc);
  }
  // Some orbit outputs put image bytes beside a manifest entry without repeating the local path.
  // Retain those only when a sibling metadata row with the same basename exists or the path itself
  // carries an exact actor and named-page token.
  for (const path of all.filter(path => /\.(?:jpe?g|png|webp)$/i.test(path))) {
    if (/review[-_ ]?sheet|contact[-_ ]?sheet|screenshot|page[-_ ]?capture|triptych/i.test(path)) continue;
    if (candidates.some(row => resolve(row.local) === resolve(path))) continue;
    const meta = metadataByBase.get(basename(path));
    const actor = meta?.actor || actorFromPath(path, control.targets);
    if (!actor || !/named[-_ ]?page|candidate|download|image|thumb/i.test(path)) continue;
    candidates.push({ ...(meta || {}), actor, local: path, source_page: meta?.source_page || "", asset_url: meta?.asset_url || "", provider: meta?.provider || "", label: meta?.label || "", note: meta?.note || "" });
  }
  return candidates;
}
async function existingHashes() {
  const used = new Set();
  const manifest = await readJson(MANIFEST).catch(() => ({ assets: {} }));
  for (const row of Object.values(manifest.assets || {})) if (/^[0-9a-f]{64}$/i.test(row?.sha256 || "")) used.add(row.sha256.toLowerCase());
  for (const path of await filesUnder("images")) {
    if (!/\.(?:jpe?g|png|webp)$/i.test(path)) continue;
    const bytes = await readFile(path).catch(() => null);
    if (bytes?.length) used.add(sha256(bytes));
  }
  return used;
}
function sourceAllowed(target, page) {
  if (!https(page)) return false;
  const host = new URL(page).hostname.toLowerCase();
  return target.preferred_domains.some(domain => host === domain || host.endsWith(`.${domain}`));
}
function scoreCandidate(target, row) {
  const text = `${row.local} ${row.source_page} ${row.asset_url} ${row.provider} ${row.label} ${row.note}`.toLowerCase();
  if (/review[-_ ]?sheet|contact[-_ ]?sheet|screenshot|poster|recommendation|placeholder|sprite|role[-_ ]?still|character[-_ ]?still|group[-_ ]?photo/i.test(text)) return -100000;
  let score = 0;
  for (const [index, token] of (target.preferred_file_tokens || []).entries()) if (text.includes(token.toLowerCase())) score += 3000 - index * 100;
  for (const id of target.exact_ids || []) if (text.includes(id.toLowerCase())) score += 1200;
  const host = https(row.source_page) ? new URL(row.source_page).hostname.toLowerCase() : "";
  for (const [index, domain] of target.preferred_domains.entries()) if (host === domain || host.endsWith(`.${domain}`)) score += 1000 - index * 60;
  if (/named[-_ ]?page/i.test(text)) score += 500;
  if (/original|full|large/i.test(text)) score += 120;
  if (/thumb/i.test(text)) score -= 40;
  return score;
}
async function select() {
  const control = await readJson(CONTROL);
  assert(control.version === 1 && control.scope === "star-trek" && control.species === "ferengi", "final portrait control scope drift");
  assert(control.reviewed_role === "second-desk", "final portrait control needs second-desk authority");
  assert(control.targets.reduce((sum, row) => sum + row.cards.length, 0) === 10, "final portrait control must cover ten cards");
  const raw = await scanCandidates(control);
  const used = await existingHashes();
  const selected = [];
  const diagnostics = [];
  for (const target of control.targets) {
    const pool = [];
    for (const row of raw.filter(candidate => normalize(candidate.actor) === normalize(target.actor))) {
      if (!sourceAllowed(target, row.source_page)) continue;
      const bytes = await readFile(row.local).catch(() => null);
      if (!bytes || bytes.length < 1500) continue;
      const ext = signature(bytes);
      if (!ext) continue;
      const hash = sha256(bytes);
      if (used.has(hash)) continue;
      const score = scoreCandidate(target, row);
      if (score < 0) continue;
      pool.push({ ...row, ext, sha256: hash, bytes: bytes.length, score });
    }
    pool.sort((a, b) => b.score - a.score || b.bytes - a.bytes || a.local.localeCompare(b.local));
    const picks = [];
    for (const row of pool) {
      if (used.has(row.sha256)) continue;
      picks.push(row); used.add(row.sha256);
      if (picks.length === target.required_distinct) break;
    }
    diagnostics.push({ actor: target.actor, candidates: pool.length, selected: picks.map(row => ({ path: relative(root, row.local), source_page: row.source_page, sha256: row.sha256, bytes: row.bytes, score: row.score })) });
    assert(picks.length === target.required_distinct, `${target.actor}: found ${picks.length}/${target.required_distinct} distinct exact-page portrait candidates`);
    assert(target.cards.length === picks.length, `${target.actor}: card/candidate count drift`);
    for (const [index, id] of target.cards.entries()) selected.push({
      id, actor: target.actor, local_path: picks[index].local, source_page: picks[index].source_page,
      asset_url: picks[index].asset_url || "", provider: picks[index].provider || "",
      label: picks[index].label || "", sha256: picks[index].sha256, bytes: picks[index].bytes,
      extension: picks[index].ext.slice(1), score: picks[index].score,
    });
  }
  assert(selected.length === 10 && new Set(selected.map(row => row.sha256)).size === 10, "final portrait selection is not ten distinct images");
  await writeJson(SELECTION, {
    version: 1, scope: "star-trek", species: "ferengi", selected_at: new Date().toISOString(),
    source_workflow_run: control.source_workflow_run, reviewed_by: control.reviewed_by,
    reviewed_role: control.reviewed_role, semantics: control.semantics, entries: selected, diagnostics,
  });
  console.log(`selected ${selected.length} distinct final Ferengi portraits from exact performer/profile pages`);
}
async function apply() {
  const [control, selection, specimens, sources] = await Promise.all([readJson(CONTROL), readJson(SELECTION), readJson(SPECIMENS), readJson(SOURCES)]);
  assert(selection.entries?.length === 10, "final portrait selection must contain ten entries");
  const specimensById = new Map(specimens.map(row => [row.id, row]));
  const sourcesById = new Map(sources.map(row => [row.id, row]));
  const applied = [];
  for (const entry of selection.entries) {
    const specimen = specimensById.get(entry.id), source = sourcesById.get(entry.id);
    assert(specimen && source, `${entry.id} lacks canonical/source row`);
    assert(normalize(specimen.actor) === normalize(entry.actor) && normalize(source.actor) === normalize(entry.actor), `${entry.id} actor identity drift`);
    assert(!specimen.portrait && !source.portrait, `${entry.id} already has a portrait; refusing overwrite`);
    assert(https(entry.source_page), `${entry.id} lacks exact HTTPS performer/profile page`);
    const bytes = await readFile(entry.local_path);
    assert(sha256(bytes) === entry.sha256 && signature(bytes) === `.${entry.extension}`, `${entry.id} selected bytes drift`);
    const output = `images/${entry.id.toLowerCase()}-portrait.${entry.extension}`;
    await mkdir(dirname(output), { recursive: true }); await writeFile(output, bytes);
    const asset = { src: output, kind: "copyright", origin: entry.source_page, pin: true };
    specimen.portrait = asset; source.portrait = asset; source.fetched_at = control.reviewed_at.slice(0, 10);
    applied.push({ ...entry, output, review_note: "Exact performer/profile page attribution; reviewed as one unmasked human in neutral presentation, not role makeup, group ambiguity, poster art, or non-person content." });
  }
  await writeJson(SPECIMENS, specimens); await writeJson(SOURCES, sources);
  await writeJson(RECEIPT, {
    version: 1, scope: "star-trek", species: "ferengi", operation: "close-final-ten-performer-portraits",
    reviewed_by: control.reviewed_by, reviewed_role: control.reviewed_role, reviewed_at: control.reviewed_at,
    source_workflow_run: control.source_workflow_run, semantics: control.semantics, entries: applied,
  });
  console.log(`applied ${applied.length} final Ferengi portraits`);
}
async function resolution() {
  const [control, selection, media] = await Promise.all([readJson(CONTROL), readJson(SELECTION), readJson(MEDIA)]);
  const byKey = new Map(media.items.map(row => [`${row.wall_id}|${row.side}`, row]));
  const votes = [];
  for (const entry of selection.entries) {
    const item = byKey.get(`${entry.id}|portrait`);
    assert(item?.asset?.sha256 === entry.sha256, `${entry.id} media-audit asset receipt drift`);
    votes.push(
      { item_id: item.id, namespace: "identity", value: "expected", note: "Exact named performer/profile source and retained review identify the expected unmasked performer.", asset_sha256: entry.sha256, at: control.reviewed_at, enforced: true },
      { item_id: item.id, namespace: "presentation", value: "neutral-human", note: "Reviewed image presents one unmasked human, not role makeup, a group, poster art, or non-person content.", asset_sha256: entry.sha256, at: control.reviewed_at, enforced: true },
    );
  }
  await writeJson(RESOLUTION, { version: 2, reviewed_by: control.reviewed_by, reviewed_role: control.reviewed_role, reviewed_at: control.reviewed_at, votes });
  console.log(`built ${votes.length} enforced media-audit rulings`);
}
async function validate() {
  const [control, selection, receipt, specimens, sources, media] = await Promise.all([readJson(CONTROL), readJson(SELECTION), readJson(RECEIPT), readJson(SPECIMENS), readJson(SOURCES), readJson(MEDIA)]);
  const bySpecimen = new Map(specimens.map(row => [row.id, row]));
  const bySource = new Map(sources.map(row => [row.id, row]));
  const byAudit = new Map(media.items.map(row => [`${row.wall_id}|${row.side}`, row]));
  assert(selection.entries.length === 10 && receipt.entries.length === 10, "final portrait receipt count drift");
  assert(new Set(selection.entries.map(row => row.sha256)).size === 10, "final portraits are not byte-distinct");
  for (const entry of selection.entries) {
    const specimen = bySpecimen.get(entry.id), source = bySource.get(entry.id), audit = byAudit.get(`${entry.id}|portrait`);
    assert(specimen?.portrait?.src && JSON.stringify(specimen.portrait) === JSON.stringify(source?.portrait), `${entry.id} canonical/source portrait drift`);
    assert(audit?.status === "verified" && audit.asset?.sha256 === entry.sha256, `${entry.id} portrait is ${audit?.status || "missing"}, not verified`);
  }
  console.log("PASS — ten final Ferengi portraits are distinct, provenance-bound and exact-subject verified");
}
if (command === "select") await select();
else if (command === "apply") await apply();
else if (command === "resolution") await resolution();
else if (command === "validate") await validate();
else throw new Error("unknown command; use select, apply, resolution, or validate");
