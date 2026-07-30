import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export function fileSha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function hashFile(path) {
  return fileSha256(await readFile(path));
}

export function inspectImage(path, magick = "magick") {
  const raw = execFileSync(magick, ["identify", "-format", "%m|%w|%h", path], { encoding: "utf8", maxBuffer: 1024 * 1024 }).trim();
  const [format, width, height] = raw.split("|");
  if (!format || !Number(width) || !Number(height)) throw new Error(`cannot inspect image ${path}`);
  return { mime: `image/${format.toLowerCase() === "jpg" ? "jpeg" : format.toLowerCase()}`, width: Number(width), height: Number(height) };
}

async function walkImages(root, current = root, out = []) {
  let entries;
  try { entries = await readdir(current, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return out; throw error; }
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) await walkImages(root, path, out);
    else if (entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) out.push({ path, relative: relative(root, path).replaceAll("\\", "/") });
  }
  return out;
}

export async function buildRepositoryHashIndex(root) {
  const index = new Map();
  const manifestPath = join(root, "data", "media-manifest.json");
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    for (const [path, row] of Object.entries(manifest.assets || {})) {
      if (!/^[a-f0-9]{64}$/i.test(row?.sha256 || "")) continue;
      const rows = index.get(row.sha256) || [];
      rows.push(path);
      index.set(row.sha256, rows);
    }
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const row of await walkImages(join(root, "images"))) {
    const hash = await hashFile(row.path);
    const paths = index.get(hash) || [];
    const repoPath = `images/${row.relative}`;
    if (!paths.includes(repoPath)) paths.push(repoPath);
    index.set(hash, paths);
  }
  for (const paths of index.values()) paths.sort();
  return index;
}

function runMagick(magick, args) {
  execFileSync(magick, args, { stdio: "pipe", maxBuffer: 32 * 1024 * 1024 });
}

export async function renderCandidate({ source, outDir, recordId, side, magick = "magick" }) {
  await mkdir(outDir, { recursive: true });
  const work = join(outDir, ".render-work");
  await mkdir(work, { recursive: true });
  const top = join(work, "top.jpg");
  const backdrop = join(work, "backdrop.jpg");
  const inset = join(work, "inset.png");
  const bottom = join(work, "bottom.jpg");
  const divider = join(work, "divider.png");
  const candidate = join(outDir, `${recordId.toLowerCase()}-${side}-candidate.jpg`);
  const wall = join(outDir, "card-crop-preview.jpg");
  const gravity = side === "portrait" ? "north" : "center";

  runMagick(magick, [source, "-auto-orient", "-strip", "-resize", "1260x560^", "-gravity", gravity, "-extent", "1260x560", "-quality", "92", top]);
  runMagick(magick, [source, "-auto-orient", "-strip", "-resize", "1260x432^", "-gravity", "center", "-extent", "1260x432", "-blur", "0x18", "-brightness-contrast", "-18x0", "-quality", "92", backdrop]);
  runMagick(magick, [source, "-auto-orient", "-strip", "-resize", "680x412>", "-bordercolor", "#d9d5cc", "-border", "2", inset]);
  runMagick(magick, [backdrop, inset, "-gravity", "center", "-composite", "-quality", "92", bottom]);
  runMagick(magick, ["-size", "1260x8", "xc:#d9d5cc", divider]);
  runMagick(magick, [top, divider, bottom, "-append", "-strip", "-quality", "92", candidate]);
  runMagick(magick, [candidate, "-crop", "1246x1000+7+0", "+repage", "-strip", "-quality", "92", wall]);

  const candidateInfo = inspectImage(candidate, magick);
  const wallInfo = inspectImage(wall, magick);
  if (candidateInfo.width !== 1260 || candidateInfo.height !== 1000) throw new Error(`rendered candidate dimensions drift for ${recordId}/${side}`);
  if (wallInfo.width !== 1246 || wallInfo.height !== 1000) throw new Error(`wall simulation dimensions drift for ${recordId}/${side}`);
  return {
    contract: {
      candidate_width: 1260,
      candidate_height: 1000,
      identity_region_height: 560,
      identity_gravity: gravity,
      divider_height: 8,
      full_source_region_height: 432,
      full_source_inset_max_width: 680,
      full_source_inset_max_height: 412,
      all_selected_source_edges_visible_in_inset: true,
      wall_width: 1246,
      wall_height: 1000,
      wall_crop_left_pixels: 7,
      wall_crop_right_pixels: 7,
      jpeg_quality: 92,
      canonical_mutation: false,
    },
    result: {
      candidate: { path: basename(candidate), ...candidateInfo, bytes: (await stat(candidate)).size, sha256: await hashFile(candidate) },
      wall_crop: { path: basename(wall), ...wallInfo, bytes: (await stat(wall)).size, sha256: await hashFile(wall) },
    },
    paths: { candidate, wall },
  };
}

export function decideCandidateDisposition({ reportRow, imageInfo, duplicateMatches, minimumWidth = 500, minimumHeight = 400 }) {
  const reasons = [];
  if (!reportRow || reportRow.status !== "candidate" || !reportRow.candidate?.src) reasons.push("no-new-candidate");
  if (reportRow?.candidate && !reportRow.candidate.origin) reasons.push("missing-source-origin");
  if (imageInfo && (imageInfo.width < minimumWidth || imageInfo.height < minimumHeight)) reasons.push("below-minimum-dimensions");
  if (duplicateMatches?.length) reasons.push("canonical-byte-duplicate");
  return { disposition: reasons.length ? "quarantine" : "candidate-pending-independent-visual-adjudication", reasons };
}

export async function writeChecksumLedger(root, names) {
  const rows = [];
  for (const name of [...names].sort()) rows.push(`${await hashFile(join(root, name))}  ${name}`);
  await writeFile(join(root, "checksums.sha256"), rows.join("\n") + (rows.length ? "\n" : ""));
  return { path: "checksums.sha256", sha256: await hashFile(join(root, "checksums.sha256")), count: rows.length };
}

export async function copyWithHash(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return { bytes: (await stat(destination)).size, sha256: await hashFile(destination) };
}
