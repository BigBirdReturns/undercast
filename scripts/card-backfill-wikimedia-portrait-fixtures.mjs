#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z3qkAAAAASUVORK5CYII=", "base64");
const root = await mkdtemp(join(tmpdir(), "undercast-wikimedia-portrait-fixture-"));
let base;
const server = createServer((request, response) => {
  const url = new URL(request.url, base);
  const sendJson = (value) => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
  if (url.pathname === "/media/actor-one.png" || url.pathname === "/media/actor-two.png") { response.writeHead(200, { "content-type": "image/png" }); response.end(png); return; }
  if (url.pathname === "/enwiki") {
    const titles = url.searchParams.get("titles") || "";
    if (titles === "Actor One") { sendJson({ query: { pages: [{ pageid: 1, title: "Actor One", pageimage: "Actor One.png", thumbnail: { source: `${base}media/actor-one.png`, width: 800, height: 1000 }, pageprops: { wikibase_item: "Q1" } }] } }); return; }
    if (titles === "Actor Two") { sendJson({ query: { pages: [{ pageid: 2, title: "Actor Two", pageprops: { wikibase_item: "Q2" } }] } }); return; }
    if (titles === "Actor Three") { sendJson({ query: { pages: [{ pageid: 3, title: "Actor Three" }] } }); return; }
    if (titles === "File:Actor One.png") { sendJson({ query: { pages: [{ pageid: 11, title: titles, imageinfo: [{ url: `${base}media/actor-one.png`, thumburl: `${base}media/actor-one.png`, descriptionurl: "https://commons.example/Actor_One", width: 800, height: 1000, mime: "image/png", extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, Artist: { value: "Fixture One" } } }] }] } }); return; }
    sendJson({ query: { pages: [{ missing: true, title: titles }] } }); return;
  }
  if (url.pathname === "/wikidata") {
    const id = url.searchParams.get("ids");
    const claims = id === "Q2" ? { P18: [{ mainsnak: { datavalue: { value: "Actor Two.png" } } }] } : {};
    sendJson({ entities: { [id]: { claims } } }); return;
  }
  if (url.pathname === "/commons") {
    const titles = url.searchParams.get("titles") || "";
    if (titles === "File:Actor Two.png") { sendJson({ query: { pages: [{ pageid: 22, title: titles, imageinfo: [{ url: `${base}media/actor-two.png`, thumburl: `${base}media/actor-two.png`, descriptionurl: "https://commons.example/Actor_Two", width: 900, height: 1200, mime: "image/png", extmetadata: { LicenseShortName: { value: "Public domain" }, Artist: { value: "Fixture Two" } } }] }] } }); return; }
    sendJson({ query: { pages: [{ missing: true, title: titles }] } }); return;
  }
  response.writeHead(404, { "content-type": "text/plain" }); response.end("missing");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
base = `http://127.0.0.1:${server.address().port}/`;
try {
  const plan = { version: 1, candidates: [
    { wall_id: "UC-001", side: "portrait", expected_subject: "Actor One", reason: "fixture", canonical_link: "https://en.wikipedia.org/wiki/Actor_One" },
    { wall_id: "UC-002", side: "portrait", expected_subject: "Actor Two", reason: "fixture", canonical_link: "https://en.wikipedia.org/wiki/Actor_Two" },
    { wall_id: "UC-003", side: "portrait", expected_subject: "Actor Three", reason: "fixture", canonical_link: "https://en.wikipedia.org/wiki/Actor_Three" },
  ] };
  const specimens = plan.candidates.map((row) => ({ id: row.wall_id, actor: row.expected_subject, link: row.canonical_link }));
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "plan.json"), JSON.stringify(plan));
  await writeFile(join(root, "specimens.json"), JSON.stringify(specimens));
  const script = fileURLToPath(new URL("./card-backfill-wikimedia-portraits.mjs", import.meta.url));
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [script, "--plan", join(root, "plan.json"), "--specimens", join(root, "specimens.json"), "--out", join(root, "out"), "--journal", join(root, "journal.jsonl"), "--latest", join(root, "latest.json"), "--run-id", "fixture", "--now", "2026-07-29T00:00:00.000Z", "--delay-ms", "0", "--timeout-ms", "3000", "--enwiki-api", `${base}enwiki`, "--wikidata-api", `${base}wikidata`, "--commons-api", `${base}commons`, "--special-file-base", `${base}special`], { stdio: "inherit" });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => code === 0 ? resolveRun() : rejectRun(new Error(`adapter fixture child failed with code ${code} signal ${signal || "none"}`)));
  });
  const report = JSON.parse(await readFile(join(root, "out", "report.json"), "utf8"));
  assert.deepEqual(report.counts, { candidate: 2, unchanged: 0, "not-found": 1 });
  assert.equal(report.canonical_write, false);
  assert.equal(report.results[0].candidate.source_method, "enwiki-pageimage");
  assert.equal(report.results[1].candidate.source_method, "wikidata-p18");
  assert.equal(report.results[2].discovery.failure, "canonical-page-has-no-retrievable-portrait");
  assert((await stat(join(root, "out", report.results[0].candidate.src))).size > 0);
  assert((await stat(join(root, "out", report.results[1].candidate.src))).size > 0);
  const receipt = JSON.parse(await readFile(join(root, "out", "receipts", "UC-002-portrait.json"), "utf8"));
  assert(receipt.attempts.some((row) => row.stage === "wikidata-p18"));
  assert(receipt.attempts.some((row) => row.stage.startsWith("commons-imageinfo")));
  console.log("card-backfill Wikimedia portrait fixtures: PASS");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
