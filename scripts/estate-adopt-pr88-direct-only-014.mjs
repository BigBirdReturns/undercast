#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_HEAD = "766b9b6002cfba9710f6dce5f56c4816607bc696";
const SOURCE_PR = 88;
const DEFAULTS = Object.freeze({
  sourceRoot: "/tmp/pr88-direct-only-source",
  evidenceRoot: "data/review/pr88-direct-only/source",
  cropRoot: "data/review/pr88-direct-only/crops",
  cropManifest: "data/review/pr88-direct-only/CROP-MANIFEST.json",
  sourceManifest: "data/review/pr88-direct-only/SOURCE-MANIFEST.json",
  overlap: "data/review/estate-debt/COLLECT-001-PR88-OVERLAP.json",
  specimens: "data/specimens.json",
  sources: "data/SOURCES.json",
  mediaManifest: "data/media-manifest.json",
  quality: "data/quality.json",
  ruling: "data/review/estate-debt/COLLECT-014-PR88-DIRECT-ONLY-RULING.json",
  receipt: "data/review/estate-debt/COLLECT-014-CANONICAL-ADOPTION.json",
  publication: "data/review/estate-debt/COLLECT-014-PUBLICATION.json",
});

const EVIDENCE_FILES = Object.freeze([
  {
    source: "data/review/card-backfill/exact-production-stills-wave-003-provenance.json",
    copy: "exact-production-stills-wave-003-provenance.json",
    git_blob: "1b15d2fdb5afab17f7d11130ef818b61651bdc3b",
  },
  {
    source: "data/review/card-backfill/exact-production-stills-wave-003-media-resolution.json",
    copy: "exact-production-stills-wave-003-media-resolution.json",
    git_blob: "c8bb83af4726e0d943ba47d0b52a6d2cccbc72ba",
  },
  {
    source: "data/review/card-backfill/exact-character-stills-wave-005-provenance.json",
    copy: "exact-character-stills-wave-005-provenance.json",
    git_blob: "456aaaf72e47213a6574da8d479b5a917dc344d3",
  },
  {
    source: "data/review/card-backfill/exact-character-stills-wave-005-media-resolution.json",
    copy: "exact-character-stills-wave-005-media-resolution.json",
    git_blob: "50e5180dbd94cc34964c9c84f46b3e001e1307b8",
  },
  {
    source: "data/review/card-backfill/uc-684-portrait-provenance.json",
    copy: "uc-684-portrait-provenance.json",
    git_blob: "9e3b0bc59adce57364c2b6d38fffb30c3df3abbd",
  },
  {
    source: "data/review/card-backfill/uc-046-uc-684-media-resolution-2026-07-26.json",
    copy: "uc-046-uc-684-media-resolution-2026-07-26.json",
    git_blob: "be0b9c9a2e6778e6c25683a72d89247659b5f13d",
  },
  {
    source: "data/review/card-backfill/star-trek-portraits-wave-004-provenance.json",
    copy: "star-trek-portraits-wave-004-provenance.json",
    git_blob: "f04f8875ccc3f61e10c1f6d9d4858ca52a9ca5f3",
  },
  {
    source: "data/review/card-backfill/star-trek-portraits-wave-004-media-resolution.json",
    copy: "star-trek-portraits-wave-004-media-resolution.json",
    git_blob: "6ae2ffd902d64664c6490cd2d367b8a6f35db5fb",
  },
]);

const ITEMS = Object.freeze([
  {
    obligation_id: "UC-178/still",
    record_id: "UC-178",
    side: "still",
    source_path: "images/uc-178-still.jpg",
    sha256: "2d636065901653585e612634b51ab071abbee2a8cc74262061a42771ffcebc93",
    bytes: 89849,
    width: 1280,
    height: 720,
    expected_subject: "Rocky Dennis — Eric Stoltz — Mask (1985)",
    provenance: "exact-production-stills-wave-003-provenance.json",
    resolution: "exact-production-stills-wave-003-media-resolution.json",
    destination: "images/uc-178-still-2d6360659016.jpg",
    binding: {
      kind: "still",
      origin: "https://www.rottentomatoes.com/m/mask/videos/_MgKTCDx1waV",
      pin: true,
      focus: { x: "center", y: "center" },
    },
    crop_gravity: "center",
  },
  {
    obligation_id: "UC-180/still",
    record_id: "UC-180",
    side: "still",
    source_path: "images/uc-180-still.jpg",
    sha256: "a822b0f938209d0e9bab88174c4b690426fd7c50f5946f7410a3c0aedfeb8ed9",
    bytes: 51826,
    width: 800,
    height: 450,
    expected_subject: "Frankenstein's Monster — Glenn Strange — Abbott and Costello Meet Frankenstein",
    provenance: "exact-production-stills-wave-003-provenance.json",
    resolution: "exact-production-stills-wave-003-media-resolution.json",
    destination: "images/uc-180-still-a822b0f93820.jpg",
    binding: {
      kind: "still",
      origin: "https://www.cracked.com/article_48942_lou-costello-was-the-real-monster-in-abbott-and-costello-meet-frankenstein.html",
      pin: true,
      focus: { x: "right", y: "center" },
    },
    crop_gravity: "east",
  },
  {
    obligation_id: "UC-246/still",
    record_id: "UC-246",
    side: "still",
    source_path: "images/uc-246-still.jpg",
    sha256: "8fbd07acbca9f6d3a54c9298605ba305e42957b495a3e95d1022701c049a9e30",
    bytes: 148578,
    width: 1200,
    height: 675,
    expected_subject: "Shaggy Rogers — Casey Kasem — Scooby-Doo",
    provenance: "exact-character-stills-wave-005-provenance.json",
    resolution: "exact-character-stills-wave-005-media-resolution.json",
    destination: "images/uc-246-still-8fbd07acbca9.jpg",
    binding: {
      kind: "still",
      origin: "https://tv.apple.com/in/episode/the-neon-phantom-of-the-roller-disco/umc.cmc.44a74tcodqyk4ccmm24rfduh2?showId=umc.cmc.73mqdp640dp9366zknwj968xd",
      pin: true,
      focus: { x: "left", y: "center" },
    },
    crop_gravity: "west",
  },
  {
    obligation_id: "UC-250/still",
    record_id: "UC-250",
    side: "still",
    source_path: "images/uc-250-still.jpg",
    sha256: "dc677dbabf7566779f1ba80bb4bab29b24ac66b894079041687ef9436de9f497",
    bytes: 61929,
    width: 600,
    height: 450,
    expected_subject: "Ro-Man — George Barrows — Robot Monster (1953)",
    provenance: "exact-character-stills-wave-005-provenance.json",
    resolution: "exact-character-stills-wave-005-media-resolution.json",
    destination: "images/uc-250-still-dc677dbabf75.jpg",
    binding: {
      kind: "still",
      origin: "https://crackedrearviewer.wordpress.com/2019/06/11/ro-man-holiday-robot-monster-astor-pictures-1953/",
      pin: true,
    },
    crop_gravity: "center",
  },
  {
    obligation_id: "UC-277/still",
    record_id: "UC-277",
    side: "still",
    source_path: "images/uc-277-still.jpg",
    sha256: "9816923c2843a31d6de3ba5fd2a09035261d6c6b1c8f7276a7f9ee5fb687b522",
    bytes: 352153,
    width: 800,
    height: 533,
    expected_subject: "Orgrim Doomhammer — Robert Kazinsky — Warcraft",
    provenance: "exact-character-stills-wave-005-provenance.json",
    resolution: "exact-character-stills-wave-005-media-resolution.json",
    destination: "images/uc-277-still-9816923c2843.jpg",
    binding: {
      kind: "still",
      origin: "https://naekranie.pl/artykuly/warcraft-poczatek-elementy-fabuly-zaczerpniete-z-gier",
      pin: true,
      focus: { x: "center", y: "center" },
    },
    crop_gravity: "center",
  },
  {
    obligation_id: "UC-283/still",
    record_id: "UC-283",
    side: "still",
    source_path: "images/uc-283-still.jpg",
    sha256: "12ecff4901dad96cbf803051f9b8e60c5d33fcb890218fa7ee1eec9458736d50",
    bytes: 69068,
    width: 780,
    height: 438,
    expected_subject: "Eytukan — Wes Studi — Avatar",
    provenance: "exact-character-stills-wave-005-provenance.json",
    resolution: "exact-character-stills-wave-005-media-resolution.json",
    destination: "images/uc-283-still-12ecff4901da.jpg",
    binding: {
      kind: "still",
      origin: "https://www.looper.com/916382/tragic-details-about-the-cast-of-avatar/",
      pin: true,
    },
    crop_gravity: "center",
  },
  {
    obligation_id: "UC-290/still",
    record_id: "UC-290",
    side: "still",
    source_path: "images/uc-290-still.jpg",
    sha256: "fb8537fa12949e3300873404ba2b35da0f72f5ed0691875a10da1c02cdf5ee7f",
    bytes: 353730,
    width: 1798,
    height: 1074,
    expected_subject: "El Santo — Santo vs. Infernal Men",
    provenance: "exact-character-stills-wave-005-provenance.json",
    resolution: "exact-character-stills-wave-005-media-resolution.json",
    destination: "images/uc-290-still-fb8537fa1294.jpg",
    binding: {
      kind: "still",
      origin: "https://bynwr.com/videos/santo-vs-infernal-men",
      pin: true,
    },
    crop_gravity: "center",
  },
  {
    obligation_id: "UC-684/portrait",
    record_id: "UC-684",
    side: "portrait",
    source_path: "images/uc-684-portrait.jpg",
    sha256: "1a2d9a32dbbc05fdba1e4ba6fbfea7dd1b619c1f01a8f0f9f7383f64d54f579c",
    bytes: 74494,
    width: 700,
    height: 1050,
    expected_subject: "James Doohan",
    provenance: "uc-684-portrait-provenance.json",
    resolution: "uc-046-uc-684-media-resolution-2026-07-26.json",
    destination: "images/uc-684-portrait-1a2d9a32dbbc.jpg",
    binding: {
      kind: "free",
      origin: "https://commons.wikimedia.org/wiki/File:Doohan_James_NASA_19670413.jpg",
      author: "NASA",
      license: "Public domain",
      year: 1967,
      pin: true,
    },
    crop_gravity: "center",
  },
  {
    obligation_id: "UC-1092/portrait",
    record_id: "UC-1092",
    side: "portrait",
    source_path: "images/uc-1092-portrait.jpg",
    sha256: "5c73e975be5ba36ed295422f0c789a10a1017886759769590907c2c6171b6933",
    bytes: 578607,
    width: 1408,
    height: 1997,
    expected_subject: "Rick Worthy",
    provenance: "star-trek-portraits-wave-004-provenance.json",
    resolution: "star-trek-portraits-wave-004-media-resolution.json",
    destination: "images/uc-1092-portrait-5c73e975be5b.jpg",
    binding: {
      kind: "free",
      origin: "https://commons.wikimedia.org/wiki/File:Rick_Worthy_2013_(cropped).jpg",
      author: "vagueonthehow",
      license: "CC BY 2.0",
      year: 2013,
      pin: true,
    },
    crop_gravity: "center",
  },
]);

const args = process.argv.slice(2);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gitBlob = (bytes) => createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8")).update(bytes).digest("hex");
const round6 = (value) => Number(Number(value).toFixed(6));
function fail(message) { throw new Error(message); }
function assert(condition, message) { if (!condition) fail(message); }
function has(name) { return args.includes(name); }
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a value`);
  return value;
}
function safeRelative(value, label) {
  const text = String(value || "").replaceAll("\\", "/");
  assert(text && !path.isAbsolute(text) && !text.split("/").includes(".."), `${label} must be repository-relative`);
  return text;
}
function resolveInside(root, relativePath, label = "path") {
  const safe = safeRelative(relativePath, label);
  const absolute = path.resolve(root, safe);
  assert(absolute === root || absolute.startsWith(`${root}${path.sep}`), `${label} escapes repository root`);
  return { safe, absolute };
}
async function exists(absolutePath) {
  try { await access(absolutePath); return true; }
  catch { return false; }
}
async function readDoc(root, relativePath, label = relativePath) {
  const resolved = resolveInside(root, relativePath, label);
  const bytes = await readFile(resolved.absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail(`cannot parse ${resolved.safe}: ${error.message}`); }
  return { ...resolved, bytes, value, sha256: sha256(bytes), git_blob: gitBlob(bytes) };
}
async function readJsonAny(filePath, label = filePath) {
  const absolute = path.resolve(filePath);
  const bytes = await readFile(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail(`cannot parse ${label}: ${error.message}`); }
  return { absolute, bytes, value, sha256: sha256(bytes), git_blob: gitBlob(bytes) };
}
function sameJson(left, right) { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }
function exactRow(rows, predicate, label) {
  const matches = rows.filter(predicate);
  assert(matches.length === 1, `${label}: expected one row, found ${matches.length}`);
  return matches[0];
}
function detectIndent(text) {
  const match = String(text).match(/\n([ \t]+)"/);
  if (!match) return 2;
  if (match[1].includes("\t")) return "\t";
  return Math.min(10, Math.max(1, match[1].length));
}
function jsonLike(originalBytes, value) {
  return Buffer.from(`${JSON.stringify(value, null, detectIndent(originalBytes.toString("utf8")))}\n`, "utf8");
}
async function atomicWrite(absolutePath, bytes) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temporary = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, absolutePath);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}
async function listFilesRecursively(root) {
  if (!(await exists(root))) return [];
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await listFilesRecursively(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}
function bindingFor(item) {
  return { src: item.destination, ...item.binding };
}
function validateBinding(item, binding) {
  assert(binding?.src === item.destination, `${item.obligation_id} destination drifted`);
  if (item.side === "still") assert(binding.kind === "still", `${item.obligation_id} still kind drifted`);
  else assert(new Set(["free", "copyright"]).has(binding.kind), `${item.obligation_id} portrait kind drifted`);
  assert(binding.origin === item.binding.origin, `${item.obligation_id} origin drifted`);
  assert(binding.pin === true, `${item.obligation_id} is not pinned`);
  assert(sameJson(binding.focus ?? null, item.binding.focus ?? null), `${item.obligation_id} focus drifted`);
  assert((binding.author ?? null) === (item.binding.author ?? null), `${item.obligation_id} author drifted`);
  assert((binding.license ?? null) === (item.binding.license ?? null), `${item.obligation_id} license drifted`);
  assert((binding.year ?? null) === (item.binding.year ?? null), `${item.obligation_id} year drifted`);
}
function provenanceRecord(document, item) {
  if (Array.isArray(document.records)) return exactRow(document.records, (row) => row.wall_id === item.record_id, `${item.obligation_id} provenance`);
  if (document.wall_id === item.record_id && document.side === item.side) {
    return {
      wall_id: document.wall_id,
      expected_subject: document.expected_subject,
      path: document.output?.path,
      sha256: document.output?.sha256,
      bytes: document.output?.bytes,
      width: document.output?.width,
      height: document.output?.height,
      source_page: document.source?.page,
      review: document.review?.note,
      embedded_review: document.review,
    };
  }
  fail(`${item.obligation_id} provenance document has no matching record`);
}
function voteFor(document, item, namespace) {
  const matches = (document.votes || []).filter((vote) => vote.namespace === namespace && (vote.evidence || []).some((evidence) => evidence.type === "asset-sha256" && evidence.value === item.sha256));
  assert(matches.length === 1, `${item.obligation_id} must have one ${namespace} vote; found ${matches.length}`);
  return matches[0];
}
async function inspectTransaction({ root = process.cwd(), sourceRoot = DEFAULTS.sourceRoot } = {}) {
  const resolvedRoot = path.resolve(root);
  const resolvedSourceRoot = path.resolve(sourceRoot);
  const [overlapDoc, specimensDoc, sourcesDoc, mediaManifestDoc, cropManifestDoc] = await Promise.all([
    readDoc(resolvedRoot, DEFAULTS.overlap, "PR #88 overlap receipt"),
    readDoc(resolvedRoot, DEFAULTS.specimens, "specimens"),
    readDoc(resolvedRoot, DEFAULTS.sources, "SOURCES"),
    readDoc(resolvedRoot, DEFAULTS.mediaManifest, "media manifest"),
    readDoc(resolvedRoot, DEFAULTS.cropManifest, "PR #88 crop manifest"),
  ]);
  const overlap = overlapDoc.value;
  assert(overlap.transaction === "COLLECT-001" && overlap.pr88?.pr === SOURCE_PR && overlap.pr88?.head === SOURCE_HEAD, "PR #88 overlap authority drifted");
  assert(overlap.counts?.direct_adoption_only === 9 && overlap.direct_adoption_only?.length === 9, "PR #88 direct-only denominator drifted");
  const overlapByKey = new Map(overlap.direct_adoption_only.map((row) => [`${row.record}/${row.side}`, row]));
  assert(sameJson([...overlapByKey.keys()].sort(), ITEMS.map((item) => item.obligation_id).sort()), "PR #88 direct-only set drifted");

  const evidenceDocs = new Map();
  const evidenceCustody = [];
  for (const file of EVIDENCE_FILES) {
    const copiedPath = `${DEFAULTS.evidenceRoot}/${file.copy}`;
    const copied = await readDoc(resolvedRoot, copiedPath, copiedPath);
    const sourceAbsolute = path.join(resolvedSourceRoot, file.source);
    const sourceBytes = await readFile(sourceAbsolute);
    assert(gitBlob(sourceBytes) === file.git_blob, `${file.source} source Git blob drifted`);
    assert(copied.git_blob === file.git_blob, `${copiedPath} is not the exact PR #88 blob`);
    assert(copied.sha256 === sha256(sourceBytes), `${copiedPath} differs from fetched source bytes`);
    evidenceDocs.set(file.copy, copied);
    evidenceCustody.push({ source_path: file.source, copied_path: copiedPath, git_blob: file.git_blob, sha256: copied.sha256 });
  }

  const cropManifest = cropManifestDoc.value;
  assert(cropManifest.transaction === "COLLECT-014" && cropManifest.operation === "pr88-direct-only-current-wall-crop-custody", "PR #88 crop manifest identity drifted");
  assert(cropManifest.source_pr === SOURCE_PR && cropManifest.source_head === SOURCE_HEAD, "PR #88 crop manifest source drifted");
  assert(cropManifest.items?.length === 9, "PR #88 crop manifest denominator drifted");
  const cropByKey = new Map(cropManifest.items.map((row) => [row.obligation_id, row]));

  const existingByHash = new Map();
const addExisting = (hash, label) => {
  if (!/^[0-9a-f]{64}$/.test(hash || "")) return;
  const rows = existingByHash.get(hash) || [];
  rows.push(label);
  existingByHash.set(hash, rows);
};
for (const [src, asset] of Object.entries(mediaManifestDoc.value.assets || {})) addExisting(asset?.sha256, `manifest:${src}`);
for (const absolute of await listFilesRecursively(path.join(resolvedRoot, "images"))) {
  const bytes = await readFile(absolute);
  const relative = path.relative(resolvedRoot, absolute).split(path.sep).join("/");
  addExisting(sha256(bytes), relative);
}
  assert(new Set(ITEMS.map((item) => item.sha256)).size === ITEMS.length, "PR #88 candidate set contains duplicate bytes");

  const specimenById = new Map(specimensDoc.value.map((row) => [row.id, row]));
  const sourceById = new Map(sourcesDoc.value.map((row) => [row.id, row]));
  const contexts = [];
  for (const item of ITEMS) {
    const overlapRow = overlapByKey.get(item.obligation_id);
    assert(overlapRow?.pr88_sha256 === item.sha256 && overlapRow.packet_manifest_on_pr129 === false, `${item.obligation_id} overlap custody drifted`);
    const sourcePath = path.join(resolvedSourceRoot, item.source_path);
    const candidateBytes = await readFile(sourcePath);
    const candidateStat = await stat(sourcePath);
    assert(candidateStat.isFile(), `${item.obligation_id} source candidate is not a file`);
    assert(candidateBytes.length === item.bytes, `${item.obligation_id} candidate byte count drifted`);
    assert(sha256(candidateBytes) === item.sha256, `${item.obligation_id} candidate SHA-256 drifted`);

    const provenanceDoc = evidenceDocs.get(item.provenance)?.value;
    const resolutionDoc = evidenceDocs.get(item.resolution)?.value;
    assert(provenanceDoc && resolutionDoc, `${item.obligation_id} evidence files are missing`);
    const provenance = provenanceRecord(provenanceDoc, item);
    assert(provenance.path === item.source_path && provenance.sha256 === item.sha256 && provenance.bytes === item.bytes, `${item.obligation_id} provenance byte custody drifted`);
    assert(provenance.width === item.width && provenance.height === item.height, `${item.obligation_id} provenance dimensions drifted`);
    assert(provenance.source_page === item.binding.origin, `${item.obligation_id} provenance origin drifted`);
    assert(provenance.expected_subject === item.expected_subject, `${item.obligation_id} expected subject drifted`);
    if (provenance.embedded_review) {
      assert(provenance.embedded_review.identity === "expected" && provenance.embedded_review.presentation === "neutral-human", `${item.obligation_id} embedded review drifted`);
      assert(provenance.embedded_review.reviewed_by === "codex-independent-acceptance", `${item.obligation_id} embedded reviewer drifted`);
    }
    const identityVote = voteFor(resolutionDoc, item, "identity");
    const presentationVote = voteFor(resolutionDoc, item, "presentation");
    assert(identityVote.value === "expected" && identityVote.enforced === true, `${item.obligation_id} identity vote drifted`);
    const expectedPresentation = item.side === "portrait" ? "neutral-human" : "character-depiction";
    assert(presentationVote.value === expectedPresentation && presentationVote.enforced === true, `${item.obligation_id} presentation vote drifted`);
    assert(resolutionDoc.reviewed_role === "second-desk", `${item.obligation_id} resolution lacks second-desk custody`);

    const crop = cropByKey.get(item.obligation_id);
    assert(crop?.candidate_sha256 === item.sha256, `${item.obligation_id} crop candidate hash drifted`);
    assert(crop?.gravity === item.crop_gravity && crop?.width === 1246 && crop?.height === 1000, `${item.obligation_id} crop contract drifted`);
    const cropResolved = resolveInside(resolvedRoot, crop.path, `${item.obligation_id} crop preview`);
    const cropBytes = await readFile(cropResolved.absolute);
    assert(cropBytes.length === crop.bytes && sha256(cropBytes) === crop.sha256, `${item.obligation_id} crop preview bytes drifted`);

    const specimen = specimenById.get(item.record_id);
    const source = sourceById.get(item.record_id);
    assert(specimen && source, `${item.obligation_id} canonical record is missing`);
    assert(specimen.actor === source.actor && specimen.character === source.character && specimen.universe === source.universe, `${item.obligation_id} canonical identity ledgers disagree`);
    const otherSide = item.side === "still" ? "portrait" : "still";
    assert(specimen[otherSide]?.src && source[otherSide]?.src && sameJson(specimen[otherSide], source[otherSide]), `${item.obligation_id} opposite canonical side is incomplete or divergent`);
    const intended = bindingFor(item);
    validateBinding(item, intended);
    const destination = resolveInside(resolvedRoot, item.destination, `${item.obligation_id} destination`);
    const currentSpecimen = specimen[item.side] ?? null;
    const currentSource = source[item.side] ?? null;
    const destinationExists = await exists(destination.absolute);
    const duplicateMatches = existingByHash.get(item.sha256) || [];
    const forbiddenMatches = duplicateMatches.filter((match) => match !== item.destination);
    assert(forbiddenMatches.length === 0, `${item.obligation_id} duplicates existing current-branch media outside its intended destination: ${forbiddenMatches.join(", ")}`);
    let state;
    if (currentSpecimen === null && currentSource === null) {
      assert(!destinationExists, `${item.obligation_id} destination exists before adoption`);
    assert(duplicateMatches.length === 0, `${item.obligation_id} candidate bytes already exist before adoption: ${duplicateMatches.join(", ")}`);
    state = "pending";
    } else {
      assert(sameJson(currentSpecimen, intended) && sameJson(currentSource, intended), `${item.obligation_id} current binding is neither null nor the exact intended adoption`);
      assert(destinationExists, `${item.obligation_id} adopted destination is missing`);
      assert(sha256(await readFile(destination.absolute)) === item.sha256, `${item.obligation_id} adopted destination bytes drifted`);
    assert(duplicateMatches.length === 1 && duplicateMatches[0] === item.destination, `${item.obligation_id} adopted hash custody is not exactly its intended destination: ${duplicateMatches.join(", ")}`);
    state = "already-adopted";
    }
    contexts.push({ item, specimen, source, candidateBytes, destination, intended, state, provenance, identityVote, presentationVote, crop });
  }
  assert(contexts.length === 9, `expected nine PR #88 direct-only contexts, found ${contexts.length}`);
  return { resolvedRoot, resolvedSourceRoot, overlapDoc, specimensDoc, sourcesDoc, mediaManifestDoc, cropManifestDoc, evidenceCustody, contexts };
}

async function applyTransaction({ inspection, now = new Date().toISOString(), reportPath = null }) {
  const pending = inspection.contexts.filter((row) => row.state === "pending");
  const alreadyAdopted = inspection.contexts.filter((row) => row.state === "already-adopted");
  assert(pending.length === 9 && alreadyAdopted.length === 0, `COLLECT-014 requires nine pending objects; found pending=${pending.length}, already=${alreadyAdopted.length}`);
  for (const context of pending) {
    await mkdir(path.dirname(context.destination.absolute), { recursive: true });
    await writeFile(context.destination.absolute, context.candidateBytes, { flag: "wx" });
    context.specimen[context.item.side] = context.intended;
    context.source[context.item.side] = context.intended;
    context.source.fetched_at = String(now).slice(0, 10);
  }
  const sourceManifest = {
    version: 1,
    transaction: "COLLECT-014",
    operation: "pr88-direct-only-source-custody-import",
    recorded_at: now,
    source_pr: SOURCE_PR,
    source_head: SOURCE_HEAD,
    evidence_files: inspection.evidenceCustody,
    candidates: inspection.contexts.map(({ item }) => ({
      obligation_id: item.obligation_id,
      source_path: item.source_path,
      source_git_blob: gitBlob(inspection.contexts.find((row) => row.item.obligation_id === item.obligation_id).candidateBytes),
      sha256: item.sha256,
      bytes: item.bytes,
      width: item.width,
      height: item.height,
      canonical_destination: item.destination,
    })),
    boundary: {
      full_pr_tree_copied: false,
      source_branch_merged: false,
      canonical_mutation: false,
      exact_nine_object_denominator: true,
    },
  };
  const ruling = {
    version: 1,
    transaction: "COLLECT-014",
    operation: "pr88-direct-only-current-head-terminal-adjudication",
    status: "authorized-nine-object-candidate-set",
    recorded_at: now,
    source: {
      pr: SOURCE_PR,
      head: SOURCE_HEAD,
      overlap_receipt_path: inspection.overlapDoc.safe,
      overlap_receipt_sha256: inspection.overlapDoc.sha256,
      source_manifest_path: DEFAULTS.sourceManifest,
      crop_manifest_path: inspection.cropManifestDoc.safe,
      crop_manifest_sha256: inspection.cropManifestDoc.sha256,
    },
    denominator: {
      reviewed: 9,
      authorized: 9,
      blocked: 0,
      stills: 7,
      portraits: 2,
      remaining_after_successful_adoption: 0,
    },
    decisions: inspection.contexts.map(({ item, provenance, identityVote, presentationVote, crop }) => ({
      obligation_id: item.obligation_id,
      record_id: item.record_id,
      side: item.side,
      status: "authorized-current-null-direct-only-adoption",
      candidate: {
        source_path: item.source_path,
        sha256: item.sha256,
        bytes: item.bytes,
        width: item.width,
        height: item.height,
        destination: item.destination,
      },
      evidence: {
        expected_subject: item.expected_subject,
        source_page: item.binding.origin,
        provenance_copy: `${DEFAULTS.evidenceRoot}/${item.provenance}`,
        resolution_copy: `${DEFAULTS.evidenceRoot}/${item.resolution}`,
        identity_vote: identityVote.value,
        presentation_vote: presentationVote.value,
        source_review: provenance.review || null,
      },
      current_head: {
        target_exact_null: true,
        opposite_side_complete: true,
        destination_absent: true,
        current_repository_duplicate_scan: "pass",
      },
      deterministic_crop: {
        path: crop.path,
        sha256: crop.sha256,
        bytes: crop.bytes,
        width: crop.width,
        height: crop.height,
        gravity: crop.gravity,
        ruling: "pass",
      },
      proposed_binding: bindingFor(item),
    })),
    boundary: {
      packet_estate_changed: false,
      source_evidence_rewritten: false,
      review_authority_fabricated: false,
      cross_card_duplicate_rule_lowered: false,
      arbitrary_batch_size_used: false,
      acceptance_receipt_created: false,
      canonical_mutation: false,
    },
  };
  await atomicWrite(inspection.specimensDoc.absolute, jsonLike(inspection.specimensDoc.bytes, inspection.specimensDoc.value));
  await atomicWrite(inspection.sourcesDoc.absolute, jsonLike(inspection.sourcesDoc.bytes, inspection.sourcesDoc.value));
  await atomicWrite(resolveInside(inspection.resolvedRoot, DEFAULTS.sourceManifest, "source manifest").absolute, Buffer.from(`${JSON.stringify(sourceManifest, null, 2)}\n`, "utf8"));
  await atomicWrite(resolveInside(inspection.resolvedRoot, DEFAULTS.ruling, "COLLECT-014 ruling").absolute, Buffer.from(`${JSON.stringify(ruling, null, 2)}\n`, "utf8"));
  const report = {
    version: 1,
    transaction: "COLLECT-014",
    operation: "pr88-direct-only-canonical-adoption-apply",
    generated_at: now,
    counts: { authorized: 9, adopted: 9, already_adopted: 0, stills: 7, portraits: 2 },
    adoptions: inspection.contexts.map(({ item }) => ({ obligation_id: item.obligation_id, state: "adopted", destination_path: item.destination, candidate_sha256: item.sha256 })),
    boundary: {
      discovery_performed: false,
      source_branch_merged: false,
      source_evidence_rewritten: false,
      arbitrary_batch_size_used: false,
      quality_baseline_reset: false,
      complete_gate_required_before_receipt: true,
      canonical_mutation: true,
    },
  };
  if (reportPath) await atomicWrite(path.resolve(reportPath), Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8"));
  return report;
}

async function validateAdopted({ inspection, beforeQualityPath }) {
  assert(inspection.contexts.every((row) => row.state === "already-adopted"), "one or more PR #88 direct-only objects remain pending");
  for (const context of inspection.contexts) {
    assert(sha256(await readFile(context.destination.absolute)) === context.item.sha256, `${context.item.obligation_id} destination bytes drifted`);
    assert(sameJson(context.specimen[context.item.side], context.intended), `${context.item.obligation_id} specimen binding drifted`);
    assert(sameJson(context.source[context.item.side], context.intended), `${context.item.obligation_id} source binding drifted`);
  }
  const [beforeDoc, afterDoc, rulingDoc, sourceManifestDoc] = await Promise.all([
    readJsonAny(beforeQualityPath, "pre-adoption quality"),
    readDoc(inspection.resolvedRoot, DEFAULTS.quality, "post-adoption quality"),
    readDoc(inspection.resolvedRoot, DEFAULTS.ruling, "COLLECT-014 ruling"),
    readDoc(inspection.resolvedRoot, DEFAULTS.sourceManifest, "COLLECT-014 source manifest"),
  ]);
  const before = beforeDoc.value.metrics;
  const after = afterDoc.value.metrics;
  assert(beforeDoc.value.total === 1313 && afterDoc.value.total === 1313, "quality denominator drifted");
  assert(before.complete_pairs === 731 && before.missing_still === 339 && before.missing_portrait === 350 && before.missing_both === 107, "pre-adoption quality is not the cleaned COLLECT-013 state");
  assert(after.complete_pairs === 740, "complete pairs did not reach 740");
  assert(after.missing_still === 332, "missing stills did not reach 332");
  assert(after.missing_portrait === 348, "missing portraits did not reach 348");
  assert(after.missing_both === 107, "missing-both count changed");
  assert(after.complete_pair_ratio === round6(740 / 1313), "complete-pair ratio is not exact");
  assert(after.complete_pairs === before.complete_pairs + 9, "complete-pair delta is not +9");
  assert(after.missing_still === before.missing_still - 7, "missing-still delta is not -7");
  assert(after.missing_portrait === before.missing_portrait - 2, "missing-portrait delta is not -2");
  assert(after.missing_both === before.missing_both, "missing-both delta is not zero");
  assert(sameJson(beforeDoc.value.baseline, afterDoc.value.baseline), "quality baseline changed");
  assert(rulingDoc.value.denominator?.authorized === 9 && rulingDoc.value.denominator?.blocked === 0, "COLLECT-014 ruling denominator drifted");
  assert(sourceManifestDoc.value.candidates?.length === 9 && sourceManifestDoc.value.source_head === SOURCE_HEAD, "COLLECT-014 source manifest drifted");
  return {
    before_doc: beforeDoc,
    after_doc: afterDoc,
    ruling_doc: rulingDoc,
    source_manifest_doc: sourceManifestDoc,
    before,
    after,
    deltas: { complete_pairs: 9, missing_still: -7, missing_portrait: -2, missing_both: 0 },
  };
}

async function promoteTransaction({ inspection, beforeQualityPath, authorizedParent, gatedTree, workflowRun, now }) {
  assert(/^[0-9a-f]{40}$/.test(authorizedParent || ""), "authorized parent is malformed");
  assert(/^[0-9a-f]{40}$/.test(gatedTree || ""), "gated tree is malformed");
  assert(/^\d+$/.test(String(workflowRun || "")), "workflow run is malformed");
  const receiptResolved = resolveInside(inspection.resolvedRoot, DEFAULTS.receipt, "COLLECT-014 receipt");
  assert(!(await exists(receiptResolved.absolute)), "COLLECT-014 receipt already exists");
  const quality = await validateAdopted({ inspection, beforeQualityPath });
  const receipt = {
    version: 1,
    transaction: "COLLECT-014",
    operation: "pr88-direct-only-current-head-canonical-media-adoption",
    status: "paid",
    recorded_at: now,
    product_alignment: "docs/ESTATE-PRODUCT-ALIGNMENT.md",
    source: {
      pr: SOURCE_PR,
      head: SOURCE_HEAD,
      overlap_receipt_path: inspection.overlapDoc.safe,
      overlap_receipt_sha256: inspection.overlapDoc.sha256,
      ruling_path: quality.ruling_doc.safe,
      ruling_sha256: quality.ruling_doc.sha256,
      ruling_git_blob: quality.ruling_doc.git_blob,
      source_manifest_path: quality.source_manifest_doc.safe,
      source_manifest_sha256: quality.source_manifest_doc.sha256,
      source_manifest_git_blob: quality.source_manifest_doc.git_blob,
      crop_manifest_path: inspection.cropManifestDoc.safe,
      crop_manifest_sha256: inspection.cropManifestDoc.sha256,
    },
    authorization: {
      authorized_parent: authorizedParent,
      gated_tree: gatedTree,
      workflow_run: Number(workflowRun),
      exact_head_publication_lease_required: true,
    },
    counts: {
      direct_only_denominator: 9,
      canonical_adoptions: 9,
      rejected: 0,
      remaining_for_terminal_ruling: 0,
      stills: 7,
      portraits: 2,
    },
    quality: {
      before_sha256: quality.before_doc.sha256,
      after_sha256: quality.after_doc.sha256,
      before: quality.before,
      after: quality.after,
      deltas: quality.deltas,
      baseline_unchanged: true,
    },
    adoptions: inspection.contexts.map(({ item }) => ({
      obligation_id: item.obligation_id,
      record_id: item.record_id,
      side: item.side,
      canonical_path: item.destination,
      canonical_sha256: item.sha256,
      image_origin: item.binding.origin,
      evidence_provenance: `${DEFAULTS.evidenceRoot}/${item.provenance}`,
      evidence_resolution: `${DEFAULTS.evidenceRoot}/${item.resolution}`,
    })),
    boundary: {
      visitor_visible_media_improvements: 9,
      source_branch_merged: false,
      full_pr_tree_copied: false,
      arbitrary_batch_size_used: false,
      direct_only_lane_exhausted: true,
      packet_estate_changed: false,
      source_evidence_rewritten: false,
      cross_card_duplicate_rule_lowered: false,
      quality_baseline_reset: false,
      canonical_mutation: true,
      next_authorized_work: "close superseded PR #88 and PR #129 source venues, then merge, deploy, live-verify, and preserve PR #132",
    },
  };
  await atomicWrite(receiptResolved.absolute, Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8"));
  return { receipt: receiptResolved.safe, canonical_adoptions: 9, rejected: 0, remaining: 0 };
}

async function reconcilePublication({ root = process.cwd(), adoptionHead, adoptionTree, gatedTree, workflowRun, reconciliationParent, now }) {
  const resolvedRoot = path.resolve(root);
  for (const [label, value] of Object.entries({ adoptionHead, adoptionTree, gatedTree, reconciliationParent })) assert(/^[0-9a-f]{40}$/.test(value || ""), `${label} is malformed`);
  assert(/^\d+$/.test(String(workflowRun || "")), "workflow run is malformed");
  const receiptDoc = await readDoc(resolvedRoot, DEFAULTS.receipt, "COLLECT-014 receipt");
  const receipt = receiptDoc.value;
  assert(receipt.transaction === "COLLECT-014" && receipt.status === "paid" && receipt.counts?.canonical_adoptions === 9 && receipt.counts?.remaining_for_terminal_ruling === 0, "COLLECT-014 receipt identity drifted");
  assert(receipt.authorization?.workflow_run === Number(workflowRun) && receipt.authorization?.gated_tree === gatedTree, "COLLECT-014 publication authority drifted");
  const publication = {
    version: 1,
    transaction: "COLLECT-014",
    operation: "pr88-direct-only-publication-reconciliation",
    status: "published",
    recorded_at: now,
    authorization: {
      reconciliation_parent: reconciliationParent,
      exact_head_publication_lease_required: true,
    },
    adoption: {
      published_head: adoptionHead,
      published_tree: adoptionTree,
      gated_candidate_tree: gatedTree,
      workflow_run: Number(workflowRun),
      receipt_path: DEFAULTS.receipt,
      receipt_git_blob: receiptDoc.git_blob,
    },
    cumulative: {
      direct_only_denominator: 9,
      canonical_adoptions: 9,
      rejected: 0,
      remaining_for_terminal_ruling: 0,
      complete_pairs: 740,
      missing_stills: 332,
      missing_portraits: 348,
      missing_both: 107,
    },
    residual_estate: {
      pr88_direct_only_obligations: [],
      pr88_direct_only_lane_complete: true,
      imported_packet_estate_complete: true,
    },
    boundary: {
      canonical_mutation: false,
      source_evidence_rewritten: false,
      packet_estate_changed: false,
      adoption_receipt_rewritten: false,
      only_publication_custody_reconciled: true,
      next_authorized_work: "close superseded source PRs, merge PR #132 to main, deploy Pages, verify the live object, and reconcile preservation custody",
    },
  };
  const publicationResolved = resolveInside(resolvedRoot, DEFAULTS.publication, "COLLECT-014 publication");
  await atomicWrite(publicationResolved.absolute, Buffer.from(`${JSON.stringify(publication, null, 2)}\n`, "utf8"));
  return { publication: publicationResolved.safe, adoption_head: adoptionHead, canonical_adoptions: 9, rejected: 0, remaining: 0 };
}

async function main() {
  const root = path.resolve(option("--root", "."));
  const sourceRoot = path.resolve(option("--source-root", DEFAULTS.sourceRoot));
  if (has("--reconcile")) {
    const result = await reconcilePublication({
      root,
      adoptionHead: option("--adoption-head"),
      adoptionTree: option("--adoption-tree"),
      gatedTree: option("--gated-tree"),
      workflowRun: option("--workflow-run"),
      reconciliationParent: option("--reconciliation-parent"),
      now: option("--now", new Date().toISOString()),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const inspection = await inspectTransaction({ root, sourceRoot });
  if (has("--write")) {
    const result = await applyTransaction({ inspection, now: option("--now", new Date().toISOString()), reportPath: option("--report") });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (has("--validate")) {
    const result = await validateAdopted({ inspection, beforeQualityPath: option("--before-quality") });
    console.log(JSON.stringify({ transaction: "COLLECT-014", status: "validated", adoptions: 9, quality: result.deltas }, null, 2));
    return;
  }
  if (has("--promote")) {
    const result = await promoteTransaction({
      inspection,
      beforeQualityPath: option("--before-quality"),
      authorizedParent: option("--authorized-parent"),
      gatedTree: option("--gated-tree"),
      workflowRun: option("--workflow-run"),
      now: option("--now", new Date().toISOString()),
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(JSON.stringify({
    transaction: "COLLECT-014",
    source_pr: SOURCE_PR,
    source_head: SOURCE_HEAD,
    authorized: 9,
    pending: inspection.contexts.filter((row) => row.state === "pending").length,
    already_adopted: inspection.contexts.filter((row) => row.state === "already-adopted").length,
    stills: 7,
    portraits: 2,
    expected_quality: { complete_pairs: 9, missing_still: -7, missing_portrait: -2, missing_both: 0 },
    obligations: inspection.contexts.map((row) => row.item.obligation_id),
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`COLLECT-014 adoption failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
