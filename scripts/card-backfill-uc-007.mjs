#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";

const CONTROL = ".github/CARD-BACKFILL-UC-007.json";
const OUT = process.env.OUT || "/tmp/uc-007-card-backfill";
const UA = `undercast-card-backfill/1.0 (+https://github.com/BigBirdReturns/undercast; ${process.env.CONTACT || "bigbirdreturns@proton.me"})`;
const sha256 = value => createHash("sha256").update(value).digest("hex");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};

function signatureMime(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return "unknown";
}
function extensionFor(mime) {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "bin";
}
function cleanUrl(value) {
  return String(value || "")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/[\\"'<>]+$/g, "");
}
async function fetchRetry(url, options = {}, label = url) {
  let last;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        ...options,
        headers: {
          "User-Agent": UA,
          Accept: "*/*",
          ...(options.headers || {}),
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      last = error;
      if (attempt < 5) await sleep(1000 * attempt);
    }
  }
  throw new Error(`${label} unavailable after retries: ${last?.message || last}`);
}
async function downloadAsset(url, sourcePage, label) {
  const response = await fetchRetry(url, {
    headers: {
      Referer: sourcePage,
      Accept: "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.2",
    },
  }, label);
  const bytes = Buffer.from(await response.arrayBuffer());
  const mime = signatureMime(bytes);
  assert(bytes.length > 10_000, `${label} returned implausibly small bytes (${bytes.length})`);
  assert(mime !== "unknown", `${label} did not return a supported image (${response.headers.get("content-type") || "unknown"})`);
  return {
    bytes,
    mime,
    resolved_url: response.url,
    response_content_type: response.headers.get("content-type") || "",
    sha256: sha256(bytes),
  };
}
function imageCommand() {
  for (const command of ["magick", "convert"]) {
    try {
      execFileSync(command, ["-version"], { stdio: "ignore" });
      return command;
    } catch {}
  }
  throw new Error("ImageMagick is unavailable");
}
function identify(path) {
  const output = execFileSync("identify", ["-format", "%w %h", path], { encoding: "utf8" }).trim();
  const [width, height] = output.split(/\s+/).map(Number);
  assert(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0, `could not identify ${path}`);
  return { width, height };
}
async function walkImages(root) {
  const paths = [];
  if (!existsSync(root)) return paths;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (/\.(?:jpe?g|png|webp|gif)$/i.test(entry.name) && statSync(path).size > 0) paths.push(path);
    }
  }
  return paths;
}

const control = JSON.parse(await readFile(CONTROL, "utf8"));
assert(control.version === 1 && control.lane === "card-backfill" && control.record_id === "UC-007", "UC-007 control scope drift");
assert(control.side === "still" && control.expected_subjects?.length === 2, "UC-007 must represent two still subjects");
await mkdir(OUT, { recursive: true });

const pageResponse = await fetchRetry(control.source_page, {
  headers: { Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1" },
}, "TIME source page");
const pageBytes = Buffer.from(await pageResponse.arrayBuffer());
const pageText = pageBytes.toString("utf8");
await writeFile(join(OUT, "source-page.html"), pageBytes);
for (const assertion of control.source_assertions || []) {
  assert(pageText.includes(assertion) || pageText.includes(assertion.replace("Fanuo", "Faun")), `source page lost required caption: ${assertion}`);
}

const candidates = [...pageText.matchAll(/https:\/\/static\.time\.com\/v3\/assets\/[^\s"'<>]+guilermo-del-toro-pans-labyrinth(?:-2)?\.jpg[^\s"'<>]*/gi)]
  .map(match => cleanUrl(match[0]));
const paleFromPage = candidates.find(url => /pans-labyrinth\.jpg/i.test(url) && !/pans-labyrinth-2\.jpg/i.test(url));
const faunFromPage = candidates.find(url => /pans-labyrinth-2\.jpg/i.test(url));
const sourceUrls = {
  pale_man: paleFromPage || control.fallback_assets.pale_man,
  faun: faunFromPage || control.fallback_assets.faun,
};
assert(sourceUrls.pale_man && sourceUrls.faun, "could not resolve both TIME image URLs");

const downloaded = {};
for (const [key, url] of Object.entries(sourceUrls)) {
  const result = await downloadAsset(url, control.source_page, `${key} source image`);
  const extension = extensionFor(result.mime);
  const output = join(OUT, `${key.replace(/_/g, "-")}-original.${extension}`);
  await writeFile(output, result.bytes);
  downloaded[key] = {
    label: key === "pale_man" ? "The Pale Man" : "The Faun",
    source_page: control.source_page,
    source_credit: control.source_credit,
    requested_url: url,
    resolved_url: result.resolved_url,
    response_content_type: result.response_content_type,
    mime: result.mime,
    bytes: result.bytes.length,
    sha256: result.sha256,
    file: basename(output),
    ...identify(output),
  };
}
assert(downloaded.pale_man.sha256 !== downloaded.faun.sha256, "the two source images are byte-identical");

const command = imageCommand();
const geometry = control.candidate_geometry;
const panelWidth = Number(geometry.panel_width);
const height = Number(geometry.height);
const dividerWidth = Number(geometry.divider_width);
const width = Number(geometry.width);
assert(panelWidth * 2 + dividerWidth === width, "candidate geometry does not close exactly");

for (const key of ["pale_man", "faun"]) {
  const input = join(OUT, downloaded[key].file);
  const panel = join(OUT, `${key.replace(/_/g, "-")}-panel.jpg`);
  execFileSync(command, [
    input,
    "-auto-orient",
    "-resize", `${panelWidth}x${height}^`,
    "-gravity", "center",
    "-extent", `${panelWidth}x${height}`,
    "-strip",
    "-sampling-factor", "4:2:0",
    "-quality", "92",
    panel,
  ], { stdio: "inherit" });
}
const divider = join(OUT, "divider.png");
execFileSync(command, ["-size", `${dividerWidth}x${height}`, `xc:${geometry.background}`, divider], { stdio: "inherit" });
const candidate = join(OUT, "uc-007-still-candidate.jpg");
execFileSync(command, [
  join(OUT, "pale-man-panel.jpg"),
  divider,
  join(OUT, "faun-panel.jpg"),
  "+append",
  "-strip",
  "-sampling-factor", "4:2:0",
  "-quality", "92",
  candidate,
], { stdio: "inherit" });
const candidateBytes = await readFile(candidate);
const candidateInfo = {
  file: basename(candidate),
  mime: signatureMime(candidateBytes),
  bytes: candidateBytes.length,
  sha256: sha256(candidateBytes),
  ...identify(candidate),
};
assert(candidateInfo.mime === "image/jpeg", "candidate is not JPEG");
assert(candidateInfo.width === width && candidateInfo.height === height, "candidate dimensions drifted");

const manifestAssets = existsSync("data/media-manifest.json")
  ? Object.entries(JSON.parse(await readFile("data/media-manifest.json", "utf8")).assets || {})
  : [];
const existingByHash = new Map();
for (const [path, row] of manifestAssets) {
  if (/^[0-9a-f]{64}$/i.test(row?.sha256 || "")) {
    const list = existingByHash.get(row.sha256.toLowerCase()) || [];
    list.push({ path, source: "media-manifest", id: row.id, side: row.side });
    existingByHash.set(row.sha256.toLowerCase(), list);
  }
}
for (const path of await walkImages("images")) {
  const bytes = await readFile(path);
  const hash = sha256(bytes);
  const list = existingByHash.get(hash) || [];
  list.push({ path: relative(".", path), source: "local-image" });
  existingByHash.set(hash, list);
}
const checked = {
  pale_man: downloaded.pale_man.sha256,
  faun: downloaded.faun.sha256,
  candidate: candidateInfo.sha256,
};
const matches = Object.fromEntries(Object.entries(checked).map(([key, hash]) => [key, existingByHash.get(hash) || []]));
const duplicateScan = {
  version: 1,
  record_id: control.record_id,
  method: "SHA-256 exact-byte comparison against data/media-manifest.json and every present repository image",
  manifest_assets_scanned: manifestAssets.length,
  local_images_scanned: (await walkImages("images")).length,
  checked,
  matches,
  status: Object.values(matches).every(rows => rows.length === 0) ? "PASS" : "REVIEW",
};
await writeJson(join(OUT, "duplicate-scan.json"), duplicateScan);
assert(duplicateScan.status === "PASS", `candidate or source bytes duplicate existing media: ${JSON.stringify(matches)}`);

const manifest = {
  version: 1,
  lane: control.lane,
  disposition: "candidate-only",
  record: {
    id: control.record_id,
    actor: control.actor,
    character: control.character,
    production: control.production,
    universe: control.universe,
    side: control.side,
    expected_subjects: control.expected_subjects,
  },
  source: {
    page: control.source_page,
    page_resolved_url: pageResponse.url,
    page_bytes: pageBytes.length,
    page_sha256: sha256(pageBytes),
    publisher: "TIME",
    image_credit: control.source_credit,
    assertions: control.source_assertions,
  },
  originals: downloaded,
  composition: {
    file: candidateInfo.file,
    layout: "Pale Man left; 12-pixel neutral divider; Faun right",
    geometry,
    renderer: execFileSync(command, ["-version"], { encoding: "utf8" }).split("\n")[0],
    deterministic_recipe: [
      `auto-orient each original`,
      `cover-crop each to ${panelWidth}x${height} with center gravity`,
      `append Pale Man, ${dividerWidth}px ${geometry.background} divider, Faun`,
      `strip metadata and encode JPEG quality 92 / 4:2:0`,
    ],
    ...candidateInfo,
  },
  duplicate_scan: duplicateScan,
  review_boundary: {
    identity_certified: false,
    presentation_certified: false,
    required_visual_ruling: "Confirm left panel is the Pale Man, right panel is the Faun, both are exact Pan's Labyrinth production depictions, and the composite remains legible in the UnderCast card crop.",
    canonical_mutation_permitted: false,
  },
  generated_at: new Date().toISOString(),
};
await writeJson(join(OUT, "manifest.json"), manifest);
await writeFile(join(OUT, "SHA256SUMS"), [
  `${downloaded.pale_man.sha256}  ${downloaded.pale_man.file}`,
  `${downloaded.faun.sha256}  ${downloaded.faun.file}`,
  `${candidateInfo.sha256}  ${candidateInfo.file}`,
  `${sha256(await readFile(join(OUT, "manifest.json")))}  manifest.json`,
  `${sha256(await readFile(join(OUT, "duplicate-scan.json")))}  duplicate-scan.json`,
].join("\n") + "\n");
await writeFile(join(OUT, "review.md"), `# UC-007 still candidate\n\nCandidate-only evidence packet for **The Faun & the Pale Man — Doug Jones — Pan's Labyrinth**.\n\n- Left panel: The Pale Man\n- Right panel: The Faun\n- Source page: ${control.source_page}\n- Image credit stated by source: ${control.source_credit}\n- Exact-byte duplicate scan: ${duplicateScan.status}\n- Canonical mutation: not performed\n\nA human or vision reviewer must verify both exact subjects and card-crop legibility before the website-maintenance controller applies the candidate.\n`);
await writeFile(join(OUT, "sheet.html"), `<!doctype html><meta charset="utf-8"><title>UC-007 candidate review</title><style>body{font:15px system-ui;background:#ddd;color:#111;margin:24px}main{max-width:1100px;margin:auto}img{display:block;max-width:100%;height:auto;background:#111;margin:12px 0 28px}code{word-break:break-all}</style><main><h1>UC-007 — The Faun &amp; the Pale Man</h1><p>Candidate-only. Verify both exact subjects and the composite crop.</p><h2>Composite candidate</h2><img src="uc-007-still-candidate.jpg"><h2>Pale Man original</h2><img src="${downloaded.pale_man.file}"><code>${downloaded.pale_man.sha256}</code><h2>Faun original</h2><img src="${downloaded.faun.file}"><code>${downloaded.faun.sha256}</code></main>`);

console.log(`PASS — UC-007 evidence packet built at ${OUT}`);
console.log(`candidate ${candidateInfo.width}x${candidateInfo.height} ${candidateInfo.bytes} bytes sha256:${candidateInfo.sha256}`);
console.log(`duplicate scan: ${duplicateScan.status}`);
