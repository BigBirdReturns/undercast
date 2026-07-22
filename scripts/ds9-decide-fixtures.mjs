#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const root = resolve(new URL("..", import.meta.url).pathname);
const cli = join(root, "scripts", "ds9-decide.mjs");
let failures = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => console.log(`PASS ${name}`)).catch((error) => {
    failures++;
    console.error(`FAIL ${name}: ${error.message}`);
  });
}
function invoke(args, env) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, env: { ...process.env, ...env }, encoding: "utf8" });
}

const temp = await mkdtemp(join(tmpdir(), "undercast-ds9-decide-"));
try {
  const evidencePath = join(temp, "evidence.json");
  const decisionsPath = join(temp, "decisions.json");
  const lawPath = join(temp, "GROW.md");
  const queuePath = join(temp, "queue.mjs");
  const fixturesPath = join(temp, "contracts.mjs");
  const failOncePath = join(temp, "queue-fail-once.mjs");
  const markerPath = join(temp, "failed-once");
  const evidenceId = "p1|c1#0123456789abcdef";
  const evidence = {
    performances: {
      "p1|c1": {
        duplicate_key: "p1|c1",
        performer: "Performer One",
        character: "Character One",
        on_wall: false,
        wall_ids: [],
        signals: ["prosthetic-context"],
        evidence: [{
          id: evidenceId,
          kind: "makeup-credit",
          verified: true,
          page: "Character One",
          revision: 123,
          content_sha256: "a".repeat(64),
          basis: "A pinned source explicitly describes a full facial prosthetic application.",
          establishes: "The credited performance used transformative facial prosthetics.",
        }],
      },
    },
  };
  const emptyDecisions = { version: 1, note: "owner-controlled", schema: {}, decisions: [] };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(decisionsPath, `${JSON.stringify(emptyDecisions, null, 2)}\n`);
  await writeFile(lawPath, "# Fixture GROW law\n");
  await writeFile(queuePath, "process.exit(0);\n");
  await writeFile(fixturesPath, "process.exit(0);\n");
  await writeFile(failOncePath, `import { existsSync, writeFileSync } from 'node:fs'; const p=${JSON.stringify(markerPath)}; if (!existsSync(p)) { writeFileSync(p,'1'); process.exit(7); } process.exit(0);\n`);
  const env = {
    DS9_EVIDENCE_PATH: evidencePath,
    DS9_DECISIONS_PATH: decisionsPath,
    DS9_LAW_PATH: lawPath,
    DS9_QUEUE_SCRIPT: queuePath,
    DS9_FIXTURE_SCRIPT: fixturesPath,
  };

  await test("list ranks current undecided dossiers", async () => {
    const result = invoke(["--list", "1"], env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Performer One as Character One/);
  });
  await test("dossier inspection is read-only", async () => {
    const before = await readFile(decisionsPath, "utf8");
    const result = invoke(["p1|c1"], env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /evidence \(1\)/);
    assert.equal(await readFile(decisionsPath, "utf8"), before);
  });
  await test("valid authoring remains dry-run without --write", async () => {
    const before = await readFile(decisionsPath, "utf8");
    const result = invoke(["p1|c1", "--verdict", "eligible", "--cite", "1", "--rationale", "Fixture rationale is sufficiently specific.", "--by", "owner-fixture", "--date", "2026-07-22"], env);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dry-run only/);
    assert.equal(await readFile(decisionsPath, "utf8"), before);
  });
  await test("stale evidence is rejected without mutation", async () => {
    const before = await readFile(decisionsPath, "utf8");
    const result = invoke(["p1|c1", "--verdict", "eligible", "--cite", "stale-id", "--rationale", "Fixture rationale is sufficiently specific.", "--by", "owner-fixture"], env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /stale evidence id/);
    assert.equal(await readFile(decisionsPath, "utf8"), before);
  });
  await test("valid --write records exactly one owner-commanded decision", async () => {
    const result = invoke(["p1|c1", "--verdict", "eligible", "--cite", "1", "--rationale", "Fixture rationale is sufficiently specific.", "--by", "owner-fixture", "--date", "2026-07-22", "--write"], env);
    assert.equal(result.status, 0, result.stderr);
    const doc = JSON.parse(await readFile(decisionsPath, "utf8"));
    assert.equal(doc.decisions.length, 1);
    assert.equal(doc.decisions[0].evidence_ids[0], evidenceId);
    assert.match(doc.decisions[0].grow_md_version, /^GROW\.md@sha256:[0-9a-f]{64}$/);
  });
  await test("prototype-chain keys are dangling", async () => {
    const result = invoke(["constructor"], env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /dangling/);
  });
  await test("stray interrupted-write backup blocks mutation", async () => {
    await writeFile(decisionsPath, `${JSON.stringify(emptyDecisions, null, 2)}\n`);
    const stray = `${decisionsPath}.bak.interrupted`;
    await writeFile(stray, "backup\n");
    const result = invoke(["p1|c1", "--verdict", "eligible", "--cite", "1", "--rationale", "Fixture rationale is sufficiently specific.", "--by", "owner-fixture", "--write"], env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /stray backup/);
    assert.equal(JSON.parse(await readFile(decisionsPath, "utf8")).decisions.length, 0);
    await rm(stray);
  });
  await test("post-write failure restores decisions and rebuilds", async () => {
    await writeFile(decisionsPath, `${JSON.stringify(emptyDecisions, null, 2)}\n`);
    await rm(markerPath, { force: true });
    const result = invoke(["p1|c1", "--verdict", "eligible", "--cite", "1", "--rationale", "Fixture rationale is sufficiently specific.", "--by", "owner-fixture", "--write"], { ...env, DS9_QUEUE_SCRIPT: failOncePath });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /REVERTED/);
    assert.equal(JSON.parse(await readFile(decisionsPath, "utf8")).decisions.length, 0);
  });

  console.log(failures ? `\n${failures} ds9:decide fixture(s) FAILED` : "\nall ds9:decide fixtures pass");
  if (failures) process.exitCode = 1;
} finally {
  await rm(temp, { recursive: true, force: true });
}
