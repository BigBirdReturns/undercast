#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire, syncBuiltinESMExports} from 'node:module';
import {buildWebsiteProfile} from './build-website-profile.mjs';
import {validateWebsiteProfile, renderProfileHtml} from './lib/website-profile.mjs';
import {build, inventory, verifyArtifact, payloadManifest} from './publication.mjs';
import {sha256,stableJson} from './lib/preservation.mjs';

let count=0;
const test=(name,fn)=>{fn();count++;console.log(`PASS ${name}`);};
const base=JSON.parse(fs.readFileSync('config/sites/field-guide.json'));
const alternate=JSON.parse(fs.readFileSync('config/sites/reading-room.json'));
const change=fn=>{const value=structuredClone(base);fn(value);return value;};
test('two profiles use distinct branding, paths, navigation and layout',()=>{
  validateWebsiteProfile(base);validateWebsiteProfile(alternate);
  for(const key of ['brand','base_url','navigation','layout'])assert.notEqual(stableJson(base[key]),stableJson(alternate[key]));
});
for(const [name,fn] of [
  ['new evidence controls',p=>{p.verified=true;}],
  ['injected script',p=>{p.brand.name='<script>alert(1)</script>';}],
  ['multiline labels',p=>{p.navigation[0].label='Browse\nAgain';}],
  ['unknown layout switches',p=>{p.layout.hide_unverified=true;}],
  ['removed destinations',p=>{p.navigation.pop();}],
  ['duplicate destinations',p=>{p.navigation[4]=p.navigation[0];}],
  ['promoted contextual destination',p=>{p.navigation[4]={id:'connections',label:'Connections'};}],
  ['arbitrary navigation URLs',p=>{p.navigation[0].href='https://example.invalid';}],
  ['out of range card widths',p=>{p.layout.card_min_width=40;}],
  ['non-integer widths',p=>{p.layout.max_width=1200.5;}],
  ['non-text brand',p=>{p.brand.name=123;}],
  ['missing required setting',p=>{delete p.base_url;}],
  ['unsupported profile version',p=>{p.version=2;}],
])test(`refuse ${name}`,()=>assert.throws(()=>validateWebsiteProfile(change(fn))));
for(const url of ['http://example.invalid/','javascript:alert(1)','https://user:secret@example.invalid/','https://example.invalid/?q=x','https://example.invalid/#x','https://example.invalid/path','https://example.invalid/a/../b/','https://example.invalid/%2e%2e/','https://example.invalid:8443/']){
  test(`refuse unsafe base ${url.replace(/user:secret/,'credentials')}`,()=>assert.throws(()=>validateWebsiteProfile(change(p=>{p.base_url=url;}))));
}
const homepage=fs.readFileSync('index.html','utf8').replace(/\r\n/g,'\n');
test('template drift fails instead of silently losing a setting',()=>assert.throws(()=>renderProfileHtml(homepage.replace('site-wordmark','old-wordmark'),'index.html',base,'https://bigbirdreturns.github.io/undercast/'),/template slot/));
test('plain text brand and labels remain escaped and scripts remain unchanged',()=>{
  const profile=change(p=>{p.brand.name='Archive & "Research" $&';p.navigation[0].label='Browse & "read" $&';});
  const rendered=renderProfileHtml(homepage,'index.html',profile,'https://bigbirdreturns.github.io/undercast/');
  assert.ok(rendered.includes('Archive &amp; &quot;Research&quot; $&'));
  assert.ok(rendered.includes('Browse &amp; &quot;read&quot; $&'));
  const scripts=html=>[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].filter(match=>!match[0].includes('application/ld+json')).map(match=>match[1]);
  assert.deepEqual(scripts(rendered),scripts(homepage));
});
fs.mkdirSync('.ci/profiles',{recursive:true});
const temp=fs.mkdtempSync(path.resolve('.ci/profiles/fixtures-'));
const restored=path.join(temp,'restored snapshot');
const originalNodeOptions=process.env.NODE_OPTIONS;
const require=createRequire(import.meta.url), saved=[];
const deny=()=>{throw new Error('network forbidden in website-profile fixtures');};
const priorFetch=globalThis.fetch;globalThis.fetch=deny;
for(const [name,keys] of [['node:http',['request','get']],['node:https',['request','get']],['node:net',['connect','createConnection']],['node:tls',['connect']]]){
  const module=require(name);for(const key of keys){saved.push([module,key,module[key]]);module[key]=deny;}
}
syncBuiltinESMExports();
try{
  const preload=path.join(temp,'offline.cjs');
  fs.writeFileSync(preload,`const deny=()=>{throw new Error('network forbidden during profile build')};globalThis.fetch=deny;for(const [name,keys] of [['http',['request','get']],['https',['request','get']],['net',['connect','createConnection']],['tls',['connect']]])for(const key of keys)require(name)[key]=deny;require('module').syncBuiltinESMExports();\n`);
  process.env.NODE_OPTIONS=`${originalNodeOptions||''} --require ${JSON.stringify(preload)}`;
  const source=inventory();
  const extra=['scripts/build-website-profile.mjs','scripts/lib/website-profile.mjs','config/sites/field-guide.json','config/sites/reading-room.json'];
  for(const file of new Set([...source.inputs.map(row=>row.path),...extra])){
    const target=path.join(restored,file);fs.mkdirSync(path.dirname(target),{recursive:true});
    const bytes=fs.readFileSync(file);fs.writeFileSync(target,/\.(json|jsonld|html|css|js|mjs|svg|xml|txt|md)$/.test(file)?bytes.toString().replace(/\r\n/g,'\n'):bytes);
  }
  const out=name=>path.join(restored,'.ci/profiles',name);
  let first,second,replay,production;
  test('standard profile builds from declared snapshot with networking disabled',()=>{first=buildWebsiteProfile(restored,'config/sites/field-guide.json',out('field-guide'));});
  test('nested-path profile builds over the identical archive',()=>{second=buildWebsiteProfile(restored,'config/sites/reading-room.json',out('reading-room'));});
  test('same input and exact protected bytes survive both website configurations',()=>{
    assert.equal(first.source_input_sha256,second.source_input_sha256);
    assert.equal(first.preserved_payload_sha256,second.preserved_payload_sha256);
    assert.equal(first.media_sha256,second.media_sha256);
    assert.notEqual(first.payload_sha256,second.payload_sha256);
    for(const identity of [first,second]){assert.equal(identity.release_authority,false);assert.ok(!identity.payload.some(row=>row.path==='release.json'));}
  });
  test('all canonical contract entries, shards and review states remain identical',()=>{
    const original=JSON.parse(fs.readFileSync(path.join(restored,'data/archive.json')));
    for(const name of ['field-guide','reading-room']){
      const contract=JSON.parse(fs.readFileSync(path.join(out(name),'data/archive.json')));
      for(const key of ['canonical','projections','schemas','identifiers','policies','vocabularies','routes'])assert.deepEqual(contract[key],original[key],`${name} ${key}`);
      assert.ok(contract.web_assets.some(row=>row.path==='website-profile.json'));
      const profile=JSON.parse(fs.readFileSync(path.join(out(name),'website-profile.json')));
      assert.equal(profile.source.archive_sha256,sha256(fs.readFileSync(path.join(restored,'data/archive.json'))));
    }
  });
  test('same-host alternate deployment permits only the explicit canonical-source link',()=>{
    const sameHost=structuredClone(base);sameHost.base_url='https://bigbirdreturns.github.io/profile-preview/';
    fs.writeFileSync(path.join(restored,'config/sites/same-host.json'),JSON.stringify(sameHost)+'\n');
    const identity=buildWebsiteProfile(restored,'config/sites/same-host.json',out('same-host'));
    assert.equal(identity.preserved_payload_sha256,first.preserved_payload_sha256);
  });
  test('second fresh profile build is byte-reproducible',()=>{replay=buildWebsiteProfile(restored,'config/sites/field-guide.json',out('replay'));assert.deepEqual(replay,first);});
  test('unprofiled production build stays isolated from preview settings',()=>{
    production=build(restored,path.join(temp,'production'));
    assert.equal(production.payload_sha256,first.source_payload_sha256);
    assert.ok(!production.payload.some(row=>/website-profile/.test(row.path)));
    assert.equal(fs.readFileSync(path.join(temp,'production/index.html'),'utf8'),homepage);
  });
  test('complete profile manifests verify exact artifacts',()=>{verifyArtifact(out('field-guide'),first);verifyArtifact(out('reading-room'),second);});
  test('profile output cannot overwrite a completed preview',()=>assert.throws(()=>buildWebsiteProfile(restored,'config/sites/field-guide.json',out('field-guide')),/already exists/));
  for(const target of [restored,path.join(restored,'.ci/pages'),path.join(restored,'.ci/site'),path.join(restored,'data')])test('profile output cannot enter source or release directories',()=>assert.throws(()=>buildWebsiteProfile(restored,'config/sites/field-guide.json',target),/release directories/));
  test('unrecognized profile argument cannot change artifact paths',()=>assert.throws(()=>buildWebsiteProfile(restored,'../private.json',out('escape')),/unsafe path/));
  test('preview metadata never advertises the stale production social image',()=>{
    for(const name of ['field-guide','reading-room']){
      const html=fs.readFileSync(path.join(out(name),'index.html'),'utf8');
      assert.ok(html.includes('noindex,nofollow'));assert.doesNotMatch(html,/<meta[^>]*(?:og:image|twitter:image)/);
      assert.ok(fs.readFileSync(path.join(out(name),'robots.txt'),'utf8').includes('Disallow: /'));
    }
  });
  test('corrupting a profile record still fails artifact verification',()=>{
    const file=path.join(out('field-guide'),'data/specimens.json'),bytes=fs.readFileSync(file);fs.writeFileSync(file,'[]\n');
    try{assert.throws(()=>verifyArtifact(out('field-guide'),first));}finally{fs.writeFileSync(file,bytes);}
  });
  test('symlink output parent is refused before writing',()=>{
    const link=out('linked');fs.symlinkSync(temp,link,process.platform==='win32'?'junction':'dir');
    try{assert.throws(()=>buildWebsiteProfile(restored,'config/sites/field-guide.json',path.join(link,'child')),/symlink/);}finally{fs.unlinkSync(link);}
  });
  test('all sources retain their original hashes after profile builds',()=>assert.deepEqual(inventory(restored).inputs,source.inputs));
  console.log(`website profile fixtures: PASS ${count}; production ${production.payload_sha256}; preserved ${first.preserved_payload_sha256}`);
}finally{
  globalThis.fetch=priorFetch;for(const [module,key,value]of saved)module[key]=value;syncBuiltinESMExports();
  if(originalNodeOptions===undefined)delete process.env.NODE_OPTIONS;else process.env.NODE_OPTIONS=originalNodeOptions;
  fs.rmSync(temp,{recursive:true,force:true});
}
