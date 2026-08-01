#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { importPacketSnapshot, inspectPacketSnapshot } from "./estate-import-card-backfill-packets.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
function git(root, args) { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
async function file(root, relative, bytes) {
  await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
  await writeFile(path.join(root, relative), bytes);
}
async function packet(root, { id, side, modern }) {
  const lower = id.toLowerCase();
  const dir = `data/review/card-backfill/${id}`;
  const payloads = new Map([
    ["review.json", json({ version: 1, id, side, status: "pass" })],
    ["review.md", Buffer.from(`# ${id}/${side}\nReviewed evidence packet.\n`)],
    ["card-crop-preview.jpg", Buffer.from(`${id}-${side}-crop\n`)],
    [`${lower}-${side}-candidate.jpg`, Buffer.from(`${id}-${side}-candidate\n`)],
    ["selected-source.jpg", Buffer.from(`${id}-${side}-source\n`)],
    ["scope.json", json({ version: 1, record_id: id, side })],
  ]);
  const packetSha = modern ? sha256(Buffer.from(`${id}/${side}/packet`)) : null;
  const manifest = modern ? {
    version: 1,
    campaign_id: "fixture",
    record_id: id,
    side,
    disposition: "reviewed-evidence-candidate",
    files: [...payloads].map(([name, bytes]) => ({ path: name, sha256: sha256(bytes), bytes: bytes.length })),
    packet_sha256: packetSha,
    canonical_mutation: false,
  } : {
    version: 1,
    lane: "card-backfill",
    disposition: "candidate-only",
    record: { id, actor: "Fixture Actor", character: "Fixture Character", side },
    review_boundary: { canonical_mutation_permitted: false },
  };
  payloads.set("manifest.json", json(manifest));
  for (const [name, bytes] of payloads) await file(root, `${dir}/${name}`, bytes);
  const ledgerName = modern ? "checksums.sha256" : "SHA256SUMS";
  const ledger = [...payloads].sort(([a], [b]) => a.localeCompare(b)).map(([name, bytes]) => `${sha256(bytes)}  ${name}`).join("\n") + "\n";
  await file(root, `${dir}/${ledgerName}`, Buffer.from(ledger));
  return { id, side, obligation_id: `${id}/${side}`, packet_sha256: packetSha, root: dir };
}

const root = await mkdtemp(path.join(tmpdir(), "undercast-packet-import-"));
try {
  git(root, ["init", "-b", "target"]);
  git(root, ["config", "user.name", "Fixture"]);
  git(root, ["config", "user.email", "fixture@example.test"]);
  await file(root, "data/specimens.json", Buffer.from("[]\n"));
  await file(root, "data/SOURCES.json", Buffer.from("[]\n"));
  await file(root, "README.md", Buffer.from("target\n"));
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "target base"]);
  const targetSha = git(root, ["rev-parse", "HEAD"]);
  const canonicalBefore = {
    specimens: sha256(await readFile(path.join(root, "data/specimens.json"))),
    sources: sha256(await readFile(path.join(root, "data/SOURCES.json"))),
  };

  git(root, ["switch", "-c", "source"]);
  const legacy = await packet(root, { id: "UC-001", side: "still", modern: false });
  const modern = await packet(root, { id: "UC-002", side: "portrait", modern: true });
  const batchId = sha256(Buffer.from("fixture-publication-batch"));
  await file(root, `data/review/card-backfill/batches/${batchId}.json`, json({
    version: 1,
    lane: "card-backfill-permanent-evidence-batch",
    publication_batch_sha256: batchId,
    counts: { materialized: 1, cohorts: 1, discovery_batches: 1 },
    materialized_packets: [{ obligation_id: modern.obligation_id, record_id: modern.id, side: modern.side, packet_sha256: modern.packet_sha256 }],
    complete_repository_gate_required_before_commit: true,
    canonical_mutation: false,
  }));
  git(root, ["add", "-A"]);
  git(root, ["commit", "-m", "source packet estate"]);
  const sourceSha = git(root, ["rev-parse", "HEAD"]);
  git(root, ["switch", "target"]);

  const inspected = inspectPacketSnapshot({ root, sourceSha, expectedPackets: 2 });
  assert.deepEqual(inspected.counts, {
    packets: 2,
    serial_packets: 1,
    batched_packets: 1,
    batches: 1,
    files: inspected.counts.files,
    bytes: inspected.counts.bytes,
  });
  assert.equal(inspected.packets.find((row) => row.obligation_id === legacy.obligation_id).publication_batch_sha256, null);
  assert.equal(inspected.packets.find((row) => row.obligation_id === modern.obligation_id).publication_batch_sha256, batchId);

  const dry = await importPacketSnapshot({ root, sourceSha, targetParent: targetSha, expectedPackets: 2, sourcePr: 999, write: false, now: "2026-07-31T00:00:00.000Z" });
  assert.equal(dry.counts.paths_new_or_imported, dry.counts.files);
  await assert.rejects(() => readFile(path.join(root, legacy.root, "manifest.json")), /ENOENT/, "dry-run must not import packet files");

  const applied = await importPacketSnapshot({ root, sourceSha, targetParent: targetSha, expectedPackets: 2, sourcePr: 999, write: true, now: "2026-07-31T00:00:00.000Z" });
  assert.equal(applied.counts.packets, 2);
  assert.equal(applied.boundaries.canonical_mutation, false);
  assert.equal(JSON.parse(await readFile(path.join(root, "data/review/estate-debt/COLLECT-002-CARD-BACKFILL-PACKET-IMPORT.json"), "utf8")).source.head_sha, sourceSha);
  assert.equal(sha256(await readFile(path.join(root, "data/specimens.json"))), canonicalBefore.specimens, "packet import must not mutate specimens");
  assert.equal(sha256(await readFile(path.join(root, "data/SOURCES.json"))), canonicalBefore.sources, "packet import must not mutate SOURCES");

  const repeated = await importPacketSnapshot({ root, sourceSha, targetParent: targetSha, expectedPackets: 2, sourcePr: 999, write: false, now: "2026-07-31T00:00:01.000Z" });
  assert.equal(repeated.counts.identical_paths_before_import, repeated.counts.files, "a repeated import must recognize the identical packet estate");
  assert.equal(repeated.counts.paths_new_or_imported, 0);

  await writeFile(path.join(root, legacy.root, "review.md"), Buffer.from("tampered\n"));
  await assert.rejects(
    () => importPacketSnapshot({ root, sourceSha, targetParent: targetSha, expectedPackets: 2, sourcePr: 999, write: false }),
    /conflicts with source packet estate/,
    "target packet drift must fail closed",
  );

  git(root, ["reset", "--hard", "HEAD"]);
  git(root, ["clean", "-fd"]);
  git(root, ["switch", "source"]);
  const modernManifestPath = path.join(root, modern.root, "manifest.json");
  const badManifest = JSON.parse(await readFile(modernManifestPath, "utf8"));
  badManifest.canonical_mutation = true;
  await writeFile(modernManifestPath, json(badManifest));
  git(root, ["add", modern.root]);
  git(root, ["commit", "-m", "permit forbidden mutation"]);
  const badSource = git(root, ["rev-parse", "HEAD"]);
  git(root, ["switch", "target"]);
  assert.throws(() => inspectPacketSnapshot({ root, sourceSha: badSource, expectedPackets: 2 }), /permits canonical mutation/);

  console.log("PASS — packet census, legacy and batch custody, exact checksum coverage, dry-run, binary import, idempotence, canonical isolation, target drift rejection, and mutation-boundary rejection");
} finally {
  await rm(root, { recursive: true, force: true });
}
