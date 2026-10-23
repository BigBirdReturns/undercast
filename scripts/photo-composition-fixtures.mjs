#!/usr/bin/env node
import assert from 'node:assert/strict';
import {validateComposition,frameComposition,fingerprint} from './lib/photo-preparations.mjs';
let count=0;const test=(n,f)=>{f();count++;console.log('PASS '+n);};
const row={source_dimensions:[1000,1000],display_dimensions:[1000,1000],source_review:{composition:{protected_region_px:[250,170,750,720],max_height_fraction:.80,min_margin_fraction:.02}},composition:{version:1,display_region_px:[250,170,750,720],max_height_fraction:.80,min_margin_fraction:.02},composition_required:true,operations:[{operation:'identity-copy'}],after:{fit:'contain',focus:{x:50,y:50}}};
const decision={composition_sha256:fingerprint(row.composition)};
test('explicit region fits both production frames',()=>assert.equal(validateComposition(row,decision).length,2));
test('missing composition is refused on required runs',()=>assert.throws(()=>validateComposition({...row,composition:null},decision)));
test('wrong region approval is refused',()=>assert.throws(()=>validateComposition(row,{composition_sha256:'0'.repeat(64)})));
test('actual browser focus must equal reviewed focus',()=>assert.throws(()=>frameComposition(row,380,285,{fit:'contain',position:'0% 0%'})));
test('actual browser fit must equal reviewed fit',()=>assert.throws(()=>frameComposition(row,380,285,{fit:'cover',position:'50% 50%'})));
test('cropped crown is a failed composition even with valid identity',()=>{const r=structuredClone(row);r.after.fit='cover';r.source_review.composition.protected_region_px=[100,10,900,990];r.composition.display_region_px=[100,10,900,990];assert.throws(()=>validateComposition(r));});
test('too-close source requires a different source or framing',()=>{const r=structuredClone(row);r.source_review.composition.protected_region_px=[100,20,900,980];r.composition.display_region_px=[100,20,900,980];assert.throws(()=>validateComposition(r),/too tight/);});
test('crop cannot remove protected subject pixels',()=>{const r=structuredClone(row);r.operations=[{operation:'crop',box_px:[0,200,1000,1000]}];assert.throws(()=>validateComposition(r),/outside/);});
test('source-region transform cannot be silently changed',()=>{const r=structuredClone(row);r.composition.display_region_px[0]+=1;assert.throws(()=>validateComposition(r),/transformed differently/);});
test('legacy preparation remains explicitly outside new composition assessment',()=>assert.deepEqual(validateComposition({}),[]));
test('nonfinite and inverted protected regions fail',()=>{for(const box of [[NaN,0,100,100],[0,500,100,100]]){const r=structuredClone(row);r.source_review.composition.protected_region_px=box;assert.throws(()=>validateComposition(r));}});
test('same percentage contract holds at both real viewport image sizes',()=>{for(const [w,h]of[[273,204.75],[342,256.5],[342,427.5]])assert(frameComposition(row,w,h).pass);});
console.log(`photo composition fixtures: PASS ${count}; no source identity claims`);
