#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const parts = [
  'scripts/card-backfill-uc-178-discover.part01.b64',
  'scripts/card-backfill-uc-178-discover.part02.b64',
  'scripts/card-backfill-uc-178-discover.part03.b64',
  'scripts/card-backfill-uc-178-discover.part04.b64',
  'scripts/card-backfill-uc-178-discover.part05.b64',
  'scripts/card-backfill-uc-178-discover.part06.b64'
];
const encoded = (await Promise.all(parts.map(path => readFile(path, 'utf8')))).join('').replace(/\s+/g, '');
const bytes = Buffer.from(encoded, 'base64');
const digest = createHash('sha256').update(bytes).digest('hex');
if (digest !== '4bbc3a15a13625719883f1e9157c16838da92ae2a7ffc286afe18e5c9ad4c46f') {
  throw new Error(`UC-178 discoverer materialization drift: ${digest}`);
}
const target = 'scripts/.card-backfill-uc-178-discover-run.mjs';
await writeFile(target, bytes);
try {
  const syntax = spawnSync(process.execPath, ['--check', target], { stdio: 'inherit', env: process.env });
  if (syntax.error) throw syntax.error;
  if (syntax.status !== 0) process.exit(syntax.status ?? 1);
  const result = spawnSync(process.execPath, [target], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  await rm(target, { force: true });
}
