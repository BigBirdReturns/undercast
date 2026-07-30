#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
  buildRepositoryHashIndex,
  copyWithHash,
  decideCandidateDisposition,
  hashFile,
  inspectImage,
  renderCandidate,
  writeChecksumLedger,
} from "./lib/card-backfill-packet.mjs";
import { canonicalJson, sha256 } from "./lib/card-backfill-cohort.mjs";

const args = process.argv.slice(2);
function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writeJson(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + "\n"); }
function safeExtension(path) { const ext = extname(path).toLowerCase(); return [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg"; }
function runMagick(magick, args) { execFileSync(magick, args, { stdio: "pipe", maxBuffer: 64 * 1024 * 1024 }); }

async function packetize() {
  const baseline = resolve(option("--baseline", "."));
  const candidatesRoot = resolve(option("--candidates"));
  const reportPath = resolve(option("--report", join(candidatesRoot, "report.json")));
  const batchPath = resolve(option("--batch"));
  const scopesRoot = resolve(option("--scopes"));
  const control = await readJson(option("--control", ".github/CARD-BACKFILL-COHORT.json"));
  const out = resolve(option("--out", "card-backfill-cohort-packets"));
  const magick = option("--magick", "magick");
  const now = option("--now", new Date().toISOString());

  const [batch, report, canonicalHashes] = await Promise.all([
    readJson(batchPath),
    readJson(reportPath),
    buildRepositoryHashIndex(baseline),
  ]);
  if (report.results?.length !== batch.obligations?.length) throw new Error(`report/batch cardinality mismatch: ${report.results?.length || 0} vs ${batch.obligations?.length || 0}`);
  const reportByFacet = new Map((report.results || []).map((row) => [`${row.wall_id}/${row.side}`, row]));
  const results = [];
  const contactTiles = [];

  await rm(out, { recursive: true, force: true });
  await mkdir(join(out, "packets"), { recursive: true });

  for (const obligation of batch.obligations || []) {
    const packetDir = join(out, "packets", obligation.wall_id);
    await mkdir(packetDir, { recursive: true });
    const scopeSource = join(scopesRoot, `${obligation.wall_id}-${obligation.side}.json`);
    const scope = await readJson(scopeSource);
    await copyFile(scopeSource, join(packetDir, "scope.json"));
    const row = reportByFacet.get(obligation.obligation_id) || null;
    let imageInfo = null;
    let sourcePath = null;
    let sourceCopy = null;
    let selectedSource = null;
    let duplicateMatches = [];
    let render = null;

    if (row?.status === "candidate" && row.candidate?.src) {
      sourcePath = join(candidatesRoot, row.candidate.src);
      imageInfo = inspectImage(sourcePath, magick);
      const sourceSha = await hashFile(sourcePath);
      duplicateMatches = canonicalHashes.get(sourceSha) || [];
      const outputName = `selected-source${safeExtension(sourcePath)}`;
      sourceCopy = await copyWithHash(sourcePath, join(packetDir, outputName));
      selectedSource = {
        output_path: outputName,
        source_path: row.candidate.src,
        origin: row.candidate.origin || null,
        kind: row.candidate.kind || null,
        author: row.candidate.author || "",
        license: row.candidate.license || "",
        year: row.candidate.year || null,
        ...imageInfo,
        ...sourceCopy,
        repository_matches: duplicateMatches,
      };
    }

    const decision = decideCandidateDisposition({
      reportRow: row,
      imageInfo,
      duplicateMatches,
      minimumWidth: control.discovery?.minimum_width || 500,
      minimumHeight: control.discovery?.minimum_height || 400,
    });

    if (decision.disposition === "candidate-pending-independent-visual-adjudication") {
      render = await renderCandidate({ source: join(packetDir, selectedSource.output_path), outDir: packetDir, recordId: obligation.wall_id, side: obligation.side, magick });
      for (const item of [render.result.candidate, render.result.wall_crop]) item.repository_matches = canonicalHashes.get(item.sha256) || [];
      const renderedDuplicate = [render.result.candidate, render.result.wall_crop].some((item) => item.repository_matches.length);
      if (renderedDuplicate) decision.reasons.push("rendered-canonical-byte-duplicate");
      if (renderedDuplicate) decision.disposition = "quarantine";
    }

    const review = {
      version: 1,
      campaign_id: batch.campaign_id,
      estate_sha256: batch.estate_sha256,
      batch_sha256: batch.batch_sha256,
      cohort_key: batch.cohort_key,
      record_id: obligation.wall_id,
      side: obligation.side,
      expected_subject: obligation.expected_subject,
      identity: obligation.identity,
      disposition: decision.disposition,
      quarantine_reasons: decision.reasons,
      discovery: {
        engine: "rolling-media-search/retrieve.mjs",
        run_id: report.run_id || null,
        status: row?.status || "missing-result",
        source_family: obligation.shape.source_route,
        canonical_write: false,
      },
      selected_source: selectedSource,
      independent_evidence: {
        tier: obligation.shape.evidence_tier,
        canonical_link: obligation.canonical_link,
        references: obligation.references,
        performances: obligation.performances,
        selected_image_does_not_independently_prove_identity_or_role: true,
      },
      visual_adjudication: {
        status: decision.disposition === "candidate-pending-independent-visual-adjudication" ? "pending" : "not-authorized",
        "discoverer_may_not_self-approve": true,
        qualified_machine_or_person_second_desk_allowed: true,
        required_identity_value: "expected",
        required_presentation_value: obligation.side === "still" ? "character-depiction" : "neutral-human",
      },
      render_contract: render?.contract || null,
      render_result: render?.result || null,
      duplicate_scan: {
        repository_hash_count: canonicalHashes.size,
        items: [
          ...(selectedSource ? [{ label: "selected source", path: selectedSource.output_path, sha256: selectedSource.sha256, matches: selectedSource.repository_matches }] : []),
          ...(render ? [
            { label: "rendered candidate", path: render.result.candidate.path, sha256: render.result.candidate.sha256, matches: render.result.candidate.repository_matches },
            { label: "wall simulation", path: render.result.wall_crop.path, sha256: render.result.wall_crop.sha256, matches: render.result.wall_crop.repository_matches },
          ] : []),
        ],
      },
      scope_receipt_sha256: scope.receipt_sha256,
      canonical_mutation: false,
    };
    await writeJson(join(packetDir, "review.json"), review);
    await writeJson(join(packetDir, "source-receipt.json"), {
      version: 1,
      record_id: obligation.wall_id,
      side: obligation.side,
      expected_subject: obligation.expected_subject,
      source: selectedSource,
      retrieval_result: row,
      canonical_mutation: false,
    });
    await writeFile(join(packetDir, "review.md"), [
      `# ${obligation.wall_id} ${obligation.side} candidate`,
      "",
      `- Subject: ${obligation.expected_subject}`,
      `- Performer: ${obligation.identity?.actor || "unknown"}`,
      `- Production: ${obligation.identity?.production || "unknown"}`,
      `- Cohort: \`${batch.cohort_key}\``,
      `- Disposition: **${review.disposition}**`,
      `- Canonical mutation: **false**`,
      ...(decision.reasons.length ? ["", `Quarantine: ${decision.reasons.join(", ")}`] : ["", "The packet is ready for independent visual adjudication. Discovery did not approve its own result."]),
      "",
    ].join("\n"));

    const filesBeforeManifest = ["scope.json", "source-receipt.json", "review.json", "review.md"];
    if (selectedSource) filesBeforeManifest.push(selectedSource.output_path);
    if (render) filesBeforeManifest.push(render.result.candidate.path, render.result.wall_crop.path);
    const manifestItems = [];
    for (const name of [...filesBeforeManifest].sort()) manifestItems.push({ path: name, sha256: await hashFile(join(packetDir, name)), bytes: (await stat(join(packetDir, name))).size });
    const manifest = {
      version: 1,
      campaign_id: batch.campaign_id,
      record_id: obligation.wall_id,
      side: obligation.side,
      disposition: review.disposition,
      files: manifestItems,
      packet_sha256: sha256(canonicalJson(manifestItems)),
      canonical_mutation: false,
    };
    await writeJson(join(packetDir, "manifest.json"), manifest);
    const checksum = await writeChecksumLedger(packetDir, [...filesBeforeManifest, "manifest.json"]);

    if (render) {
      const tile = join(packetDir, "contact-tile.jpg");
      runMagick(magick, [render.paths.wall, "-resize", "311x250!", "-gravity", "south", "-fill", "white", "-undercolor", "#000000A0", "-pointsize", "16", "-annotate", "+0+5", `${obligation.wall_id} ${obligation.side}`, tile]);
      contactTiles.push(tile);
    }

    results.push({
      obligation_id: obligation.obligation_id,
      record_id: obligation.wall_id,
      side: obligation.side,
      disposition: review.disposition,
      quarantine_reasons: decision.reasons,
      packet_path: `packets/${obligation.wall_id}`,
      packet_sha256: manifest.packet_sha256,
      checksum_ledger_sha256: checksum.sha256,
      selected_source_sha256: selectedSource?.sha256 || null,
      rendered_candidate_sha256: render?.result.candidate.sha256 || null,
      wall_crop_sha256: render?.result.wall_crop.sha256 || null,
    });
  }

  if (contactTiles.length) runMagick(magick, ["montage", ...contactTiles, "-tile", "4x", "-geometry", "+8+8", join(out, "contact-sheet.jpg")]);
  for (const tile of contactTiles) await rm(tile, { force: true });
  for (const result of results) await rm(join(out, result.packet_path, ".render-work"), { recursive: true, force: true });

  const counts = Object.fromEntries(["candidate-pending-independent-visual-adjudication", "quarantine"].map((key) => [key, results.filter((row) => row.disposition === key).length]));
  const batchResult = {
    version: 1,
    generated_at: now,
    campaign_id: batch.campaign_id,
    estate_sha256: batch.estate_sha256,
    batch_sha256: batch.batch_sha256,
    cohort_key: batch.cohort_key,
    selected_count: batch.selected_count,
    counts,
    results,
    result_sha256: sha256(canonicalJson(results)),
    canonical_mutation: false,
  };
  await writeJson(join(out, "batch-result.json"), batchResult);
  await writeFile(join(out, "summary.txt"), [
    `campaign=${batch.campaign_id}`,
    `cohort=${batch.cohort_key}`,
    `selected=${batch.selected_count}`,
    `candidates_pending_visual_adjudication=${counts["candidate-pending-independent-visual-adjudication"]}`,
    `quarantined=${counts.quarantine}`,
    `repository_hash_count=${canonicalHashes.size}`,
    `result_sha256=${batchResult.result_sha256}`,
    `canonical_mutation=false`,
  ].join("\n") + "\n");
  console.log(`PASS — packetized ${results.length} obligations; ${counts["candidate-pending-independent-visual-adjudication"]} candidate(s), ${counts.quarantine} quarantine(s)`);
  console.log(`OUTPUT — ${out}`);
}

packetize().catch((error) => { console.error(`card-backfill packetize: ${error.message}`); process.exit(1); });
