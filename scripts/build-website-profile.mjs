#!/usr/bin/env node
// Isolated preview compilation. The existing build/release commands stay authoritative.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, inventory, payloadManifest, safePath, verifyArtifact, verifyLinks } from './publication.mjs';
import { sha256, stableJson } from './lib/preservation.mjs';
import { validateWebsiteProfile, configureWebsite } from './lib/website-profile.mjs';
const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const RENDERER_FILES = ['scripts/build-website-profile.mjs','scripts/lib/website-profile.mjs'];
const meta = (file, bytes) => ({path:file,bytes:bytes.length,sha256:sha256(bytes)});
const write = (root,file,bytes) => { fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true}); fs.writeFileSync(path.join(root,file),bytes); };
function noLinks(target) {
  const absolute = path.resolve(target); let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current,part);
    if (fs.existsSync(current)) assert.ok(!fs.lstatSync(current).isSymbolicLink(), `symlink profile path: ${target}`);
  }
}
function readInput(root, file) {
  safePath(file); const target = path.join(root,file); noLinks(target);
  const stat = fs.lstatSync(target); assert.ok(stat.isFile() && stat.nlink === 1, 'profile input must be a regular unlinked file');
  return Buffer.from(new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(target)).replace(/\r\n/g,'\n'));
}
export function buildWebsiteProfile(root = ROOT, profilePath, output) {
  root=path.resolve(root); safePath(profilePath);
  const bytes=readInput(root,profilePath), profile=validateWebsiteProfile(JSON.parse(bytes));
  const allowed=path.join(root,'.ci','profiles');
  output=path.resolve(root,output || path.join('.ci','profiles',profile.id));
  assert.ok(output.startsWith(allowed+path.sep), 'profile output must be a fresh child of .ci/profiles; release directories are forbidden');
  safePath(path.relative(allowed,output).split(path.sep).join('/'));
  noLinks(output); assert.ok(!fs.existsSync(output), 'profile output already exists');
  const renderer=RENDERER_FILES.map(file=>meta(file,readInput(root,file)));
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const temporary=fs.mkdtempSync(path.join(path.dirname(output),'.profile-stage-'));
  const stage=path.join(temporary,'site');
  try {
    const source=build(root,stage); verifyArtifact(stage,source);
    const sourceArchiveBytes=fs.readFileSync(path.join(stage,'data/archive.json'));
    const archive=JSON.parse(sourceArchiveBytes), sourceBase=archive.canonical_url;
    assert.notEqual(profile.base_url,sourceBase,'profile preview cannot impersonate the canonical deployment URL');
    const configured=configureWebsite(new Map(source.payload.map(row=>[row.path,fs.readFileSync(path.join(stage,row.path))])),profile,source);
    for(const [file,value] of configured.files)write(stage,file,value);
    const payload=payloadManifest(stage);
    assert.deepEqual(payload.map(row=>row.path),source.payload.map(row=>row.path),'profile may not grant arbitrary publication paths');
    verifyLinks(stage,payload,source.payload.filter(row=>/^records\/[^/]+\/index.html$/.test(row.path)).map(row=>row.path.split('/')[1]).sort(),profile.base_url,[sourceBase+'data/archive.json']);
    // Every path/hash pair in the profile descriptor resolves to the bytes it declares.
    const traverse=value=>{if(!value||typeof value!=='object')return;if(value.path&&value.sha256)assert.deepEqual(meta(value.path,fs.readFileSync(path.join(stage,value.path))),{path:value.path,bytes:value.bytes,sha256:value.sha256},`profile contract drift: ${value.path}`);for(const child of Object.values(value))traverse(child);};
    traverse(JSON.parse(fs.readFileSync(path.join(stage,'data/archive.json'))));
    assert.equal(sha256(stableJson(inventory(root).inputs)),source.input_sha256,'source changed during profile compilation');
    assert.deepEqual(meta(profilePath,readInput(root,profilePath)),meta(profilePath,bytes),'profile changed during build');
    for(const row of renderer)assert.deepEqual(meta(row.path,readInput(root,row.path)),row,'renderer changed during build');
    const identity={version:1,kind:'website-profile-preview',release_authority:false,profile_sha256:sha256(stableJson(profile)),
      source_input_sha256:source.input_sha256,source_payload_sha256:source.payload_sha256,preserved_payload_sha256:configured.preserved_payload_sha256,
      inputs:[...new Map([...source.inputs,meta(profilePath,bytes),...renderer].map(row=>[row.path,row])).values()].sort((a,b)=>a.path<b.path?-1:1),media:source.media,payload};
    identity.input_sha256=sha256(stableJson(identity.inputs));identity.media_sha256=sha256(stableJson(identity.media));identity.payload_sha256=sha256(stableJson(payload));
    verifyArtifact(stage,identity);
    fs.renameSync(stage,output);return identity;
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2), options={};
    for(let i=0;i<args.length;i+=2){assert.ok(['--profile','--out'].includes(args[i])&&!Object.hasOwn(options,args[i]),'use --profile PATH [--out .ci/profiles/NAME]');assert.ok(args[i+1]&&!args[i+1].startsWith('--'),'option requires a value');options[args[i]]=args[i+1];}
    assert.ok(options['--profile'],'--profile is required');
    const identity=buildWebsiteProfile(ROOT,options['--profile'],options['--out']);
    console.log(JSON.stringify({status:'built-preview',release_authority:false,profile_sha256:identity.profile_sha256,source_input_sha256:identity.source_input_sha256,preserved_payload_sha256:identity.preserved_payload_sha256,payload_sha256:identity.payload_sha256,files:identity.payload.length},null,2));
  }catch(error){console.error(`website profile: ${error.message}`);process.exitCode=1;}
}
