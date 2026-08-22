#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const cmd = process.argv[2];
const env = process.env;
const EXPECTED_MAIN = env.EXPECTED_MAIN || 'b22d01251746a824a404308e6c9e3466aef2091a';
const TASK_ID = 'ap_a7bae45c6030e1212e1ad6b0';
const SOURCE_FINGERPRINT = 'dd367d1cef3b2089e6757a4321195ea40a6096e6785db9a00fe1a13a846c9e48';
const SOURCE = 'https://memory-alpha.fandom.com/wiki/Maryl';
const SOURCE_PAGEID = 55511;
const SOURCE_REVISION = 3165630;
const SOURCE_TIMESTAMP = '2024-05-31T20:24:48Z';
const SOURCE_CONTENT_SHA256 = 'e6c751211b039a3af3beb9c7f8562c98c13ec596ca82f94d8bd3b2457a0c233f';
const EPISODE_SOURCE = 'https://memory-alpha.fandom.com/wiki/Infinite_Regress_(episode)';
const EPISODE_RECEIPT = {
  content_sha256: '8b7f7186684d8132850813f398f564d5a9c3153f71c3466bac8c74359771a617',
  pageid: 1557,
  revision: 3475117,
  source: EPISODE_SOURCE,
  timestamp: '2026-05-29T15:45:00Z',
};
const PERFORMER = 'Jeri Ryan';
const CHARACTER = 'Maryl';
const PRODUCTION = 'Star Trek: Voyager (Infinite Regress)';
const YEARS = '1998';
const STILL_ORIGIN = 'https://memory-alpha.fandom.com/wiki/File:Seven_as_a_frightened_child.jpg';
const REJECTED_ORIGIN = 'https://memory-alpha.fandom.com/wiki/File:Maryl.jpg';
const STILL_SHA256 = '77a124d4f21f79cc1cbdab2a5bfb33e5cd2cf98e6ba8d488d4e3d912b4035fe4';
const REJECTED_SHA256 = '6cbdf1091b85899027a13086ee129ec565d912f3bbc1d82c2b5fe05163e0e0fe';
const PORTRAIT_FILE = 'Jeri Ryan by Brian Wilkins (2010).jpg';
const PORTRAIT_ORIGIN = 'https://commons.wikimedia.org/wiki/File:Jeri_Ryan_by_Brian_Wilkins_(2010).jpg';
const PRIOR_RECEIPT_PATH = 'data/review/adapter-sdk/star-trek-lorot-cycle.json';
const PRIOR_CHECKER_PATH = 'scripts/star-trek-lorot-cycle.mjs';
const PRIOR_RECEIPT_SHA256 = '1ae4135622cebbe2c1b6f720fbcf424733841b4309c972c058fcc97a49676618';
const PRIOR_CHECKER_SHA256 = 'ca67ce1547a4dcdfe0c910d24c7151e6d04e51cea31bab2b7a6e16acc37c0ced';
const PRIOR_CYCLE_ID = 'cycle_cb79b2fbcd6ff6e9dc749f99';
const KNOWN_FOR = 'The frightened child whose personality Jeri Ryan manifests through Seven of Nine in Infinite Regress (1998).';
const REVEAL = 'The frozen Maryl source credits Erica Mer for the girl in reflection and Jeri Ryan for Seven of Nine assuming Maryl’s personality. This record is limited to Ryan’s physical live-action performance through Seven; Maryl’s original Human body and prosthetic design, makeup, costume, direction, editing, sound, production-shop labor, transformation measurement, and other maker functions remain unresolved.';

const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const stablePretty = (value) => `${JSON.stringify(stable(value), null, 2)}\n`;
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const shaFile = (file) => sha(fs.readFileSync(file));
const normalize = (value) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, ' ').trim().toLowerCase();
const sourceKey = (value) => { try { const url = new URL(value); url.hash = ''; return url.toString().replace(/\/$/, ''); } catch { return String(value || '').trim(); } };

function run(program, args, { capture = false, cwd = process.cwd(), extraEnv = {} } = {}) {
  const result = spawnSync(program, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? (result.stderr || result.stdout || '').trim() : `exit ${result.status}`;
    throw new Error(`${program} ${args.join(' ')} failed: ${detail}`);
  }
  return capture ? result.stdout : '';
}
const node = (script, args = [], options = {}) => run(process.execPath, [script, ...args], options);
const npm = (args, options = {}) => run('npm', args, options);

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function findOne(root, basename) {
  const matches = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name === basename) matches.push(file);
    }
  };
  walk(root);
  ensure(matches.length === 1, `expected one ${basename} under ${root}, found ${matches.length}`);
  return matches[0];
}

function taskRow() {
  const state = readJson('data/AUTOPILOT.json');
  const task = state.jobs.find((row) => row.id === TASK_ID);
  ensure(task, 'Maryl task missing from Autopilot');
  return { state, task };
}

function cardRow() {
  const cards = readJson('data/specimens.json');
  const matches = cards.filter((row) => normalize(row.actor) === normalize(PERFORMER) && normalize(row.character) === normalize(CHARACTER));
  ensure(matches.length === 1, `expected one Maryl/Jeri Ryan card, found ${matches.length}`);
  return { cards, card: matches[0] };
}
