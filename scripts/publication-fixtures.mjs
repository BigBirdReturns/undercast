#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build, inventory, safePath, externalMedia, verifyArtifact, verifyLinks, payloadManifest, validateFontAssets, FONT_ASSETS, PRIVATE_RELEASE_INPUTS } from './publication.mjs';
import { routeIds, assertRoutes } from './publication-routes.mjs';
import { beginRelease } from './publication-release.mjs';
import { sha256, stableJson, parseManifest } from './lib/preservation.mjs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { spawnSync } from 'node:child_process';

let count = 0;
const test = (name, fn) => { fn(); count++; console.log(`PASS ${name}`); };
fs.mkdirSync('.ci', { recursive: true });
const temp = fs.mkdtempSync(path.resolve('.ci/publication-fixture-'));
const write = (root, file, value) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), value); };
try {
  const source = inventory();
  test('media rejection mechanics and evidence are private release inputs, not payload paths', () => {
    const inputPaths = new Set(source.inputs.map(row => row.path));
    const rejectionDocument = JSON.parse(fs.readFileSync('data/MEDIA-REJECTIONS.json'));
    for (const file of PRIVATE_RELEASE_INPUTS) assert.ok(inputPaths.has(file), `private release input omitted: ${file}`);
    for (const ledger of rejectionDocument.source_ledgers) assert.ok(inputPaths.has(ledger.path), `rejection evidence input omitted: ${ledger.path}`);
    assert.ok(!source.files.has('data/MEDIA-REJECTIONS.json'));
    assert.ok(!source.files.has('data/review/estate-debt/UC-MEDIA-AUDIT-1-20260820.jsonl'));
  });
  test('approved homepage fonts are local, complete, and custody-verified', () => {
    assert.equal(validateFontAssets(process.cwd(), source.files), true);
    const homepage = fs.readFileSync('index.html', 'utf8');
    assert.match(homepage, /href=["']\.\/assets\/site-fonts\.css["']/);
    assert.doesNotMatch(homepage, /fonts\.(?:googleapis|gstatic)\.com/);
    assert.ok(FONT_ASSETS.every(file => source.files.has(file)), 'font asset absent from publication inventory');
  });
  const restored = path.join(temp, 'restored snapshot with spaces');
  // Restoration follows the existing SHA-256 manifest convention. Only declared
  // publication inputs are needed; no caches, recovery bags or machine paths.
  const manifest = source.inputs.map(row => `${row.sha256}  ${row.path}`).join('\n');
  for (const row of parseManifest(manifest)) {
    const bytes = fs.readFileSync(row.path);
    const normalized = /\.(json|jsonld|html|css|js|mjs|svg|xml|txt|md)$/.test(row.path) ? Buffer.from(bytes.toString().replace(/\r\n/g, '\n')) : bytes;
    assert.equal(sha256(normalized), row.sha256);
    write(restored, row.path, normalized);
  }
  test('malformed private rejection registry fails deterministic inventory', () => {
    const file = path.join(restored, 'data/MEDIA-REJECTIONS.json');
    const bytes = fs.readFileSync(file); const document = JSON.parse(bytes);
    document.denominator.rules--;
    fs.writeFileSync(file, JSON.stringify(document));
    try { assert.throws(() => inventory(restored), /denominator\.rules/); }
    finally { fs.writeFileSync(file, bytes); }
  });
  let first, second;
  test('fresh declared-input restore builds without local release mirrors', () => { first = build(restored, path.join(temp, 'first')); });
  test('second isolated build has identical LF payload and input/media identities', () => {
    // Simulate a Windows text checkout of every input, without touching binary media.
    for (const row of source.inputs.filter(row => /\.(json|jsonld|html|css|js|mjs|svg|xml|txt|md)$/.test(row.path))) {
      const file = path.join(restored, row.path);
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/\n/g, '\r\n'));
    }
    second = build(restored, path.join(temp, 'second'));
    assert.equal(stableJson(first), stableJson(second));
  });
  test('artifact verifies at its exact identity', () => verifyArtifact(path.join(temp, 'second'), second));
  test('tampered retained font byte fails custody validation', () => {
    const ledger = JSON.parse(fs.readFileSync(path.join(restored, 'assets/fonts/SOURCES.json')));
    const file = path.join(restored, ledger.fonts[0].path); const bytes = fs.readFileSync(file); const bad = Buffer.from(bytes); bad[0] ^= 1; fs.writeFileSync(file, bad);
    try { assert.throws(() => inventory(restored), /font ledger hash mismatch/); } finally { fs.writeFileSync(file, bytes); }
  });
  test('missing packaged font fails exact artifact verification', () => {
    const output = path.join(temp, 'second'); const font = FONT_ASSETS.find(name => name.endsWith('.woff2')); const file = path.join(output, font); const bytes = fs.readFileSync(file); fs.unlinkSync(file);
    try { assert.throws(() => verifyArtifact(output, second)); } finally { fs.writeFileSync(file, bytes); }
  });
  test('unexpected private artifact file fails', () => {
    const file = path.join(temp, 'second/private.txt'); fs.writeFileSync(file, 'private');
    assert.throws(() => verifyArtifact(path.join(temp, 'second'), second)); fs.unlinkSync(file);
  });
  test('same-size payload tampering fails', () => {
    const file = path.join(temp, 'second/index.html'); const bytes = fs.readFileSync(file); const bad = Buffer.from(bytes); bad[0] ^= 1; fs.writeFileSync(file, bad);
    assert.throws(() => verifyArtifact(path.join(temp, 'second'), second)); fs.writeFileSync(file, bytes);
  });
  test('post-build CRLF mutation fails exact payload verification', () => {
    const file = path.join(temp, 'second/index.html'); const bytes = fs.readFileSync(file); fs.writeFileSync(file, bytes.toString().replace(/\n/g, '\r\n'));
    assert.throws(() => verifyArtifact(path.join(temp, 'second'), second)); fs.writeFileSync(file, bytes);
  });
  test('missing payload fails', () => {
    const file = path.join(temp, 'second/robots.txt'); const bytes = fs.readFileSync(file); fs.unlinkSync(file);
    assert.throws(() => verifyArtifact(path.join(temp, 'second'), second)); fs.writeFileSync(file, bytes);
  });
  test('tampered identity fails', () => assert.throws(() => verifyArtifact(path.join(temp, 'second'), { ...second, input_sha256: '0'.repeat(64) })));
  for (const file of ['../private', '/etc/passwd', 'C:/tmp/a', 'images/../a', 'images\\a', 'images/%2e%2e/a', 'images/a?b', 'images/NUL.jpg', '.git/config']) {
    test(`unsafe path rejected: ${file}`, () => assert.throws(() => safePath(file)));
  }
  const media = source.media.find(row => row.location === 'release');
  const entry = JSON.parse(fs.readFileSync('data/media-manifest.json')).assets[media.path];
  for (const url of ['https://github.com.evil.invalid/BigBirdReturns/undercast/releases/download/media-0001/a.jpg', 'https://github.com/other/repo/releases/download/media-0001/a.jpg', 'javascript:alert(1)', entry.url + '?token=secret', entry.url.replace('https:', 'http:'), entry.url.replace('github.com', 'user@github.com')]) {
    test(`external origin rejected: ${url.slice(0, 65)}`, () => assert.throws(() => externalMedia(media.path, { ...entry, url })));
  }
  test('missing local media fails', () => {
    const local = source.media.find(row => row.location === 'local'); const file = path.join(restored, local.path); const bytes = fs.readFileSync(file); fs.unlinkSync(file);
    assert.throws(() => inventory(restored), /ENOENT/); fs.writeFileSync(file, bytes);
  });
  test('corrupt local media fails', () => {
    const local = source.media.find(row => row.location === 'local'); const file = path.join(restored, local.path); const bytes = fs.readFileSync(file); fs.writeFileSync(file, 'not an image');
    assert.throws(() => inventory(restored), /corrupt local media/); fs.writeFileSync(file, bytes);
  });
  test('malicious imported corpus fails closed before generation', () => {
    const file = path.join(restored, 'data/specimens.json'); const bytes = fs.readFileSync(file); const records = JSON.parse(bytes); records[0].still.src = '../../private'; fs.writeFileSync(file, JSON.stringify(records));
    assert.throws(() => inventory(restored), /corrupt contract dependency/); fs.writeFileSync(file, bytes);
  });
  for (const value of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '<script>alert(1)</script>']) {
    test(`malicious content rejected even with refreshed contract hash: ${value.slice(0, 20)}`, () => {
      const file = path.join(restored, 'data/specimens.json'), contract = path.join(restored, 'data/archive.json');
      const old = fs.readFileSync(file), oldContract = fs.readFileSync(contract);
      const records = JSON.parse(old); records[0].link = value;
      const bytes = Buffer.from(JSON.stringify(records)); const archive = JSON.parse(oldContract);
      archive.canonical.records.sha256 = sha256(bytes); archive.canonical.records.bytes = bytes.length;
      fs.writeFileSync(file, bytes); fs.writeFileSync(contract, JSON.stringify(archive));
      try { assert.throws(() => inventory(restored), /unsafe imported|active imported/); }
      finally { fs.writeFileSync(file, old); fs.writeFileSync(contract, oldContract); }
    });
  }
  test('contract cannot grant publication to a private review path', () => {
    const file = path.join(restored, 'data/archive.json'); const bytes = fs.readFileSync(file); const archive = JSON.parse(bytes);
    archive.canonical.extra = { path: 'data/review/clifford-number/private.json', bytes: 2, sha256: sha256('{}') }; fs.writeFileSync(file, JSON.stringify(archive));
    try { assert.throws(() => inventory(restored), /disallowed evidence/); } finally { fs.writeFileSync(file, bytes); }
  });
  test('static homepage dependency may not disappear', () => {
    const output = path.join(temp, 'second');
    assert.throws(() => verifyLinks(output, second.payload.filter(row => row.path !== 'images/uc-001-still.jpg'), source.ids), /static dependency/);
  });
  test('sitemap equal-count wrong ID fails', () => {
    const output = path.join(temp, 'second'), file = path.join(output, 'sitemap.xml'); const bytes = fs.readFileSync(file);
    fs.writeFileSync(file, bytes.toString().replace('records/UC-001/', 'records/UC-999999/'));
    try { assert.throws(() => verifyLinks(output, payloadManifest(output), source.ids), /sitemap/); } finally { fs.writeFileSync(file, bytes); }
  });
  test('symlink input directory fails', () => {
    const linkRoot = path.join(temp, 'linked'); fs.mkdirSync(linkRoot);
    fs.symlinkSync(path.join(restored, 'data'), path.join(linkRoot, 'data'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => inventory(linkRoot), /symlink/);
    fs.unlinkSync(path.join(linkRoot, 'data'));
  });
  const routesRoot = path.join(temp, 'routes');
  const specimensPath = path.join(temp, 'specimens.json'), tombstonesPath = path.join(temp, 'tombstones.json');
  write(temp, 'specimens.json', JSON.stringify([{ id: 'UC-1' }]));
  write(temp, 'tombstones.json', JSON.stringify({ records: [{ id: 'UC-2', status: 'merged', successor: 'UC-1' }, { id: 'UC-3', status: 'removed' }] }));
  for (const id of ['UC-1', 'UC-2', 'UC-3']) write(routesRoot, `${id}/index.html`, `${id} <a href="../UC-1/">record</a>`);
  const check = () => assertRoutes({ recordsRoot: routesRoot, specimensPath, tombstonesPath });
  test('live plus both tombstone dispositions preserve exact routes', check);
  test('equal-count wrong-ID route rejected', () => { fs.renameSync(path.join(routesRoot, 'UC-3'), path.join(routesRoot, 'UC-4')); assert.throws(check, /route-set/); fs.renameSync(path.join(routesRoot, 'UC-4'), path.join(routesRoot, 'UC-3')); });
  test('missing route rejected', () => { fs.renameSync(path.join(routesRoot, 'UC-3'), path.join(temp, 'held')); assert.throws(check, /route-set/); fs.renameSync(path.join(temp, 'held'), path.join(routesRoot, 'UC-3')); });
  test('duplicate live ID rejected', () => assert.throws(() => routeIds([{ id: 'UC-1' }, { id: 'UC-1' }], { records: [] }), /duplicate/));
  test('live and tombstone collision rejected', () => assert.throws(() => routeIds([{ id: 'UC-1' }], { records: [{ id: 'UC-1', status: 'removed' }] }), /duplicate/));
  test('merged missing successor rejected', () => assert.throws(() => routeIds([], { records: [{ id: 'UC-1', status: 'merged', successor: 'UC-9' }] }), /successor/));
  test('removed redirect rejected', () => assert.throws(() => routeIds([], { records: [{ id: 'UC-1', status: 'removed', successor: 'UC-9' }] }), /redirect/));
  for (const options of [{ from: 'archive' }, { skipRendered: true }]) test('partial gate cannot begin release', () => assert.throws(() => beginRelease(temp, options), /partial/));
  test('sealed temporary prefix is remapped without changing other prefixes or bytes', () => {
    const file = 'scripts/star-trek-lwaxana-eligibility-rejection.mjs'; const before = sha256(fs.readFileSync(file));
    assert.equal(before, 'b93d590bb9be5fe111e35ed53fd433154f13cd8a97d9e93cbdde880a59d37947');
    const require = createRequire(import.meta.url); const original = fs.mkdtempSync;
    require('./historical-temp.cjs');
    try {
      const dir = fs.mkdtempSync('/tmp/lwaxana-kukulkan-projection-');
      assert.equal(path.dirname(dir), path.resolve(tmpdir()));
      fs.rmdirSync(dir);
      assert.throws(() => fs.mkdtempSync(path.join(temp, 'absent/other-')), /ENOENT/);
      assert.equal(sha256(fs.readFileSync(file)), before);
    } finally { fs.mkdtempSync = original; syncBuiltinESMExports(); }
  });
  test('real sealed mkdtemp statement executes in a fresh Windows-compatible Node replay process', () => {
    const source = fs.readFileSync('scripts/star-trek-lwaxana-eligibility-rejection.mjs', 'utf8');
    const statement = source.split(/\r?\n/).find(line => line.startsWith('const projection=fs.mkdtempSync('));
    assert.equal(statement, "const projection=fs.mkdtempSync('/tmp/lwaxana-kukulkan-projection-');");
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import fs from 'node:fs'; ${statement} fs.rmdirSync(projection);`], {
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${JSON.stringify(path.resolve('scripts/historical-temp.cjs'))}` },
    });
    assert.equal(result.status, 0, result.error?.message);
  });
  const pages = parse(fs.readFileSync('.github/workflows/pages.yml', 'utf8'));
  test('Pages build token is read-only and complete gate precedes exact upload', () => {
    assert.deepEqual(pages.permissions, { contents: 'read' });
    assert.deepEqual(pages.jobs.build.permissions, { contents: 'read' });
    const steps = pages.jobs.build.steps;
    const gate = steps.findIndex(step => step.run === 'npm run gate -- --release');
    const upload = steps.findIndex(step => step.uses?.startsWith('actions/upload-pages-artifact@'));
    assert.ok(gate >= 0 && upload > gate);
    assert.equal(steps[upload - 1].run, 'node scripts/gate.mjs --verify-release');
    assert.equal(steps[upload].with.path, '.ci/pages');
  });
  test('Pages deploy runs no checkout or repository code and consumes this attempt artifact', () => {
    assert.equal(pages.jobs.deploy.needs, 'build');
    assert.deepEqual(pages.jobs.deploy.permissions, { pages: 'write', 'id-token': 'write' });
    assert.equal(pages.jobs.deploy.steps.length, 1);
    assert.match(pages.jobs.deploy.steps[0].uses, /^actions\/deploy-pages@[a-f0-9]{40}$/);
    assert.equal(pages.jobs.deploy.steps[0].with.artifact_name, pages.jobs.build.steps.find(step => step.uses?.startsWith('actions/upload-pages-artifact@')).with.name);
  });
  test('Pages wakes from acquisition only on trusted main and never consumes acquisition artifacts', () => {
    assert.deepEqual(pages.on.workflow_run.branches, ['main']);
    assert.match(pages.jobs.build.if, /github\.repository == 'BigBirdReturns\/undercast'/);
    assert.match(pages.jobs.build.if, /head_repository\.full_name == 'BigBirdReturns\/undercast'/);
    assert.match(pages.jobs.build.if, /head_branch == 'main'/);
    assert.equal(pages.on.pull_request_target, undefined);
    assert.ok(pages.jobs.build.steps.every(step => !step.uses?.includes('download-artifact')));
    assert.equal(pages.jobs.build.steps[0].with['persist-credentials'], false);
  });
  test('CI invokes the same gate and all changed workflow actions use immutable pins', () => {
    const validate = parse(fs.readFileSync('.github/workflows/validate.yml', 'utf8'));
    assert.ok(validate.jobs.validate.steps.some(step => step.run === 'npm run gate'));
    for (const workflow of [pages, validate]) for (const job of Object.values(workflow.jobs)) for (const step of job.steps) if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
  });
  console.log(`publication fixtures: PASS ${count}; ${first.payload.length} files; payload ${first.payload_sha256}; inputs ${first.input_sha256}; media ${first.media_sha256}`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
