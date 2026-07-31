#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = await mkdtemp(join(tmpdir(), "card-backfill-resilient-adjudication-"));
const wrapper = fileURLToPath(new URL("./card-backfill-machine-adjudicate-resilient.mjs", import.meta.url));
try {
  const counter = join(root, "counter.txt");
  const output = join(root, "output.json");
  const brownout = join(root, "brownout.mjs");
  await writeFile(brownout, `
import fs from 'node:fs';
const counter=process.env.FIXTURE_COUNTER;
const output=process.env.FIXTURE_OUTPUT;
const count=fs.existsSync(counter)?Number(fs.readFileSync(counter,'utf8')):0;
fs.writeFileSync(counter,String(count+1));
if(count<2){
  console.error('GitHub Models 410: {"error":{"code":"github_models_retirement_brownout","message":"temporarily unavailable as part of a scheduled retirement brownout"}}');
  process.exit(1);
}
fs.writeFileSync(output,JSON.stringify({status:'ready'})+'\\n');
console.log('fixture adjudication success');
`);
  const recovered = spawnSync(process.execPath, [wrapper,
    "--adjudicator-script", brownout,
    "--brownout-attempts", "3",
    "--brownout-base-delay-ms", "1",
    "--brownout-max-delay-ms", "2",
  ], {
    encoding: "utf8",
    env: { ...process.env, FIXTURE_COUNTER: counter, FIXTURE_OUTPUT: output },
  });
  assert.equal(recovered.status, 0, recovered.stderr || recovered.stdout);
  assert.equal(Number(await readFile(counter, "utf8")), 3);
  assert.equal(JSON.parse(await readFile(output, "utf8")).status, "ready");
  assert.match(recovered.stdout, /retained packets remain authoritative/);

  const hardCounter = join(root, "hard-counter.txt");
  const hard = join(root, "hard.mjs");
  await writeFile(hard, `
import fs from 'node:fs';
const counter=process.env.FIXTURE_COUNTER;
const count=fs.existsSync(counter)?Number(fs.readFileSync(counter,'utf8')):0;
fs.writeFileSync(counter,String(count+1));
console.error('identity schema is invalid');
process.exit(2);
`);
  const refused = spawnSync(process.execPath, [wrapper,
    "--adjudicator-script", hard,
    "--brownout-attempts", "5",
    "--brownout-base-delay-ms", "1",
    "--brownout-max-delay-ms", "2",
  ], {
    encoding: "utf8",
    env: { ...process.env, FIXTURE_COUNTER: hardCounter },
  });
  assert.notEqual(refused.status, 0);
  assert.equal(Number(await readFile(hardCounter, "utf8")), 1, "non-brownout failures must not be replayed");
  assert.match(refused.stderr, /non-retriable/);

  console.log("card-backfill resilient machine adjudication fixtures: PASS — brownouts retry retained packets; hard failures fail immediately");
} finally {
  await rm(root, { recursive: true, force: true });
}
