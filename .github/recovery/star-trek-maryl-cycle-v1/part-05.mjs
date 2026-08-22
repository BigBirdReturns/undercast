      source_fingerprint: SOURCE_FINGERPRINT,
      performance_mode: 'physical-prosthetic',
    },
    lease_id: stageDoc.lease.id,
    wall_id: stageDoc.wall_id,
    queue: verified.counts,
    media: stageDoc.media,
    boundary: {
      erica_mer_reflection_conflated: false,
      original_maryl_body_inferred: false,
      cross_facet_substitution: false,
      maker_attribution: 'unresolved',
    },
    checks: {
      archive_gate: 'pass',
      media_gate: 'pass',
      prior_lorot_checker: 'pass',
      waterline: 'receipt-required',
    },
  };
  const doc = { ...body, review_sha256: sha(Buffer.from(stablePretty(body))) };
  writeJson(path.join(reviewRoot, 'independent-review.json'), doc);
  console.log(JSON.stringify({ status: 'reviewed', verdict: 'pass', review_sha256: doc.review_sha256 }, null, 2));
}

function checkerSource({ wallId, receiptPath }) {
  return `#!/usr/bin/env node\nimport fs from 'node:fs';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';\nconst RECEIPT=${JSON.stringify(receiptPath)},CHECKER='scripts/star-trek-maryl-cycle.mjs',TASK=${JSON.stringify(TASK_ID)},WALL=${JSON.stringify(wallId)},PERFORMER=${JSON.stringify(PERFORMER)},ROLE=${JSON.stringify(CHARACTER)},SOURCE=${JSON.stringify(SOURCE)},EPISODE_SOURCE=${JSON.stringify(EPISODE_SOURCE)},FINGERPRINT=${JSON.stringify(SOURCE_FINGERPRINT)},MAIN=${JSON.stringify(EXPECTED_MAIN)},STILL_SHA=${JSON.stringify(STILL_SHA256)},STILL_ORIGIN=${JSON.stringify(STILL_ORIGIN)},PORTRAIT_ORIGIN=${JSON.stringify(PORTRAIT_ORIGIN)},PRIOR_RECEIPT=${JSON.stringify(PRIOR_RECEIPT_PATH)},PRIOR_CHECKER=${JSON.stringify(PRIOR_CHECKER_PATH)},PRIOR_RECEIPT_ID=${JSON.stringify(PRIOR_RECEIPT_SHA256)},PRIOR_CHECKER_SHA=${JSON.stringify(PRIOR_CHECKER_SHA256)},PRIOR_CYCLE=${JSON.stringify(PRIOR_CYCLE_ID)};\nconst sha=v=>crypto.createHash('sha256').update(v).digest('hex'),stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v,pretty=v=>JSON.stringify(stable(v),null,2)+'\\n',read=f=>JSON.parse(fs.readFileSync(f,'utf8')),jsonl=f=>fs.readFileSync(f,'utf8').split(/\\r?\\n/).filter(Boolean).map(JSON.parse),ok=(x,m)=>{if(!x)throw Error(m)},same=(a,b,m)=>ok(JSON.stringify(stable(a))===JSON.stringify(stable(b)),m);\nconst receipt=read(RECEIPT),body=structuredClone(receipt);delete body.receipt_sha256;ok(receipt.receipt_sha256===sha(pretty(body))&&receipt.transaction==='STAR-TREK-CYCLE-MARYL'&&receipt.canonical_parent===MAIN,'Maryl receipt identity drifted');ok(receipt.qualification?.checker_sha256===sha(fs.readFileSync(CHECKER)),'Maryl checker hash drifted');\nconst state=read('data/AUTOPILOT.json'),trek=state.jobs.filter(x=>x.scope==='star-trek'),task=trek.find(x=>x.id===TASK);ok(trek.length===2228&&task?.status==='resolved'&&task.performer===PERFORMER&&task.character===ROLE&&task.source_fingerprint===FINGERPRINT,'Maryl task drifted');same(task.performance_modes,['physical-prosthetic'],'Maryl mode drifted');same(task.wall_ids,[WALL],'Maryl wall drifted');ok(task.outcome?.review_sha256===receipt.canonical.outcome_review_sha256,'Maryl review binding drifted');\nconst card=read('data/specimens.json').find(x=>x.id===WALL);ok(card&&card.actor===PERFORMER&&card.character===ROLE&&card.production===${JSON.stringify(PRODUCTION)}&&card.universe==='Star Trek'&&card.years==='1998'&&card.transform===2&&card.designer==='—'&&card.link===SOURCE&&!('kind'in card),'Maryl card drifted');ok(card.knownFor===${JSON.stringify(KNOWN_FOR)}&&card.reveal===${JSON.stringify(REVEAL)},'Maryl copy drifted');ok(card.references?.some(x=>x.claim==='performance'&&x.source===SOURCE)&&card.references?.some(x=>x.claim==='production'&&x.source===EPISODE_SOURCE),'Maryl references drifted');ok(sha(fs.readFileSync(card.still.src))===STILL_SHA&&card.still.origin===STILL_ORIGIN,'Maryl still drifted');ok(card.portrait.origin===PORTRAIT_ORIGIN&&/Brian Wilkins/i.test(card.portrait.author||'')&&/CC BY 2.0/i.test(card.portrait.license||''),'Maryl portrait provenance drifted');ok(sha(fs.readFileSync(card.portrait.src))===receipt.media.portrait_sha256,'Maryl portrait bytes drifted');ok(sha(fs.readFileSync(card.portrait.src))!==sha(fs.readFileSync('images/uc-037-portrait.jpg'))&&sha(fs.readFileSync(card.portrait.src))!==sha(fs.readFileSync('images/uc-1392-portrait.jpg')),'Maryl portrait duplicated prior Jeri Reyan asset');ok(card.still.origin!==${JSON.stringify(REJECTED_ORIGIN)}&&sha(fs.readFileSync(card.still.src))!==${JSON.stringify(REJECTED_SHA256)},'Erica Mer reflection conflated');\nconst source=read('data/SOURCES.json').find(x=>x.id===WALL);same(source.still,card.still,'source still drifted');same(source.portrait,card.portrait,'source portrait drifted');const facets=read('data/MEDIA-AUDIT.json').items.filter(x=>x.wall_id===WALL).sort((a,b)=>a.side.localeCompare(b.side));ok(facets.length===2&&facets.every(x=>x.status==='verified'),'Maryl facets drifted');ok(facets.find(x=>x.side==='still')?.asset?.sha256===STILL_SHA&&facets.find(x=>x.side==='portrait')?.asset?.sha256===receipt.media.portrait_sha256,'Maryl facet bytes drifted');ok(receipt.canonical.record_sha256===sha(pretty(card))&&receipt.media.facets_sha256===sha(pretty(facets))&&receipt.media.source_ledger_sha256===sha(pretty(source)),'Maryl receipt projections drifted');\nconst claims=jsonl('data/journal/autopilot.jsonl').filter(x=>x.op==='lease.claimed'&&x.scope==='star-trek'),water=read('data/WATERLINE-STATE.json'),cycles=water.cycles.filter(x=>x.scope_id==='star-trek'),byLease=new Map(cycles.map(x=>[x.lease_id,x])),own=byLease.get(receipt.lease.id);ok(own?.id===receipt.reviewed_cycle.id&&own.outcome==='completed'&&own.task_statuses?.[TASK]==='resolved','Maryl waterline cycle drifted');const events=jsonl('data/journal/waterline.jsonl').filter(x=>x.id===receipt.reviewed_cycle.event_id&&x.lease_id===receipt.lease.id&&x.receipt_id===own.id);ok(events.length===1,'Maryl waterline event drifted');const later=claims.filter(x=>Date.parse(x.at)>Date.parse(receipt.reviewed_cycle.reviewed_at)),unreceipted=later.filter(x=>!byLease.has(x.lease_id));ok(unreceipted.length<=1,'more than one later cycle is unreceipted');ok(trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length<=1,'more than one later task is active');const resolved=trek.filter(x=>x.status==='resolved').length,queued=trek.filter(x=>x.status==='queued').length;ok(resolved>=425,'resolved floor regressed');if(later.length===0)same({total:trek.length,ueued,resolved,blocked:trek.filter(x=>x.status==='blocked').length,rejected:trek.filter(x=>x.status==='rejected').length,in_flight:trek.filter(x=>['leased','drafted','merged'].includes(x.status)).length},{total:2228,queued:1801,resolved:425,blocked:0,rejected:2,in_flight:0},'Maryl terminal queue drifted');\nconst registry=read('data/ESTATE-REGISTRY.json'),estate=registry.estates.find(x=>x.id==='star-trek'),latest=cycles.at(-1),registryQueued=queued+unreceipted.length;ok(latest&&estate?.next_gate?.includes(latest.id)&&estate.next_gate.includes(registryQueued.toLocaleString('en-US')+' tasks remain queued'),'registry gate drifted');const prior=read(PRIOR_RECEIPT);ok(prior.receipt_sha256===PRIOR_RECEIPT_ID&&prior.reviewed_cycle?.id===PRIOR_CYCLE&&sha(fs.readFileSync(PRIOR_CHECKER))===PRIOR_CHECKER_SHA,'Lorot predecessor drifted');const run=spawnSync(process.execPath,[PRIOR_CHECKER],{encoding:'utf8',maxBuffer:256*1024*1024,env:process.env});ok(run.status===0,'Lorot predecessor checker failed');ok(receipt.boundary?.original_maryl_body_inferred===false&&receipt.boundary?.erica_mer_reflection_conflated===false&&receipt.boundary?.maker_attributed===false&&receipt.boundary?.cross_facet_substitution===false&&receipt.boundary?.additional_lease_issued===false,'Maryl boundary drifted');ok(fs.readFileSync('sitemap.xml','utf8').includes('records/'+WALL+'/'),'Maryl permanent route missing');console.log('star-trek-maryl-cycle: PASS — exact Jeri Ryan Maryl-through-Seven performance custody, Erica Mer reflection separation, source-distinct verified media, unresolved maker functions, reviewed waterline closure, Lorot predecessor custody, and later-cycle bounds are intact');\n`;
}

function finalize() {
  const stageRoot = env.STAGE_ROOT;
  const reviewRoot = env.REVIEW_ROOT;
  const finalRoot = env.FINAL_ROOT;
  ensure(stageRoot && reviewRoot && finalRoot, 'finalize requires STAGE_ROOT, REVIEW_ROOT, and FINAL_ROOT');
  fs.mkdirSync(finalRoot, { recursive: true });
  const stageDoc = readJson(path.join(stageRoot, 'stage.json'));
  const reviewDoc = readJson(path.join(reviewRoot, 'independent-review.json'));
  verifyCandidate(stageDoc);
  ensure(reviewDoc.verdict === 'pass' && reviewDoc.candidate?.commit === env.CANDIDATE_COMMIT && reviewDoc.wall_id === stageDoc.wall_id && reviewDoc.lease_id === stageDoc.lease.id, 'Maryl independent review drifted');
  const reviewBody = { ...reviewDoc }; delete reviewBody.review_sha256;
  ensure(reviewDoc.review_sha256 === sha(Buffer.from(stablePretty(reviewBody))), 'Maryl independent review hash drifted');

  node(PRIOR_CHECKER_PATH);
  node('scripts/validate.mjs');
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);
  const reviewedAt = new Date().toISOString();
  const cycleInput = {
    version: 1,
    scope_id: 'star-trek',
    lease_id: stageDoc.lease.id,
    outcome: 'completed',
    reviewed_by: 'chatgpt-maryl-second-desk',
    reviewed_role: 'second-desk',
    reviewed_at: reviewedAt,
    note: 'The Maryl lease resumed from a durable candidate branch, preserved Erica Mer’s reflected-child performance as separate, verified exact Maryl-through-Seven and Jeri Ryan media, and returned the Star Trek wall to zero media debt.',
    evidence: [
      { type: 'workflow-run', value: `GitHub Actions run ${env.GITHUB_RUN_ID} — staged, independently reviewed, finalized, and published the exact Maryl cycle.` },
      { type: 'commit', value: `${env.CANDIDATE_COMMIT} — durable reviewed Maryl candidate before final receipt publication.` },
      { type: 'restart-proof', value: `Candidate branch ${env.CANDIDATE_BRANCH} and stage/review artifacts ${env.STAGE_ARTIFACT_ID}/${env.REVIEW_ARTIFACT_ID} persisted before finalization.` },
    ],
  };
  writeJson(path.join(finalRoot, 'cycle-input.json'), cycleInput);
  npm(['run', 'waterline', '--', 'record-cycle', '--input', path.join(finalRoot, 'cycle-input.json')]);

  const water = readJson('data/WATERLINE-STATE.json');
  const cycle = water.cycles.filter((row) => row.scope_id === 'star-trek' && row.lease_id === stageDoc.lease.id).at(-1);
  ensure(cycle?.outcome === 'completed' && cycle.task_statuses?.[TASK_ID] === 'resolved', 'Maryl reviewed waterline cycle missing');
  const event = readJsonl('data/journal/waterline.jsonl').filter((row) => row.lease_id === stageDoc.lease.id && row.receipt_id === cycle.id).at(-1);
  ensure(event, 'Maryl waterline event missing');

  const registry = readJson('data/ESTATE-REGISTRY.json');
  const estate = registry.estates.find((row) => row.id === 'star-trek');
  ensure(estate, 'Star Trek estate missing');
  estate.next_gate = `Star Trek reviewed Maryl cycle ${cycle.id} resolved Jeri Ryan’s physical live-action performance as Maryl through Seven of Nine in Infinite Regress (1998) within the preserved 2,228-task denominator; 1,801 tasks remain queued. The exact Seven-as-Maryl role frame and a separately sourced licensed Jeri Ryan portrait are verified. Erica Mer’s reflected-child depiction remains separate, Maryl’s original Human body is not inferred from Seven of Nine, and prosthetic design, makeup, costume, direction, editing, sound, production-shop, transformation measurement, and other maker attribution remain unresolved. Any later cycle must begin from the repository-native thesis rail, claim at most one compatible task, and return to a reviewed cycle receipt before another claim.`;
  writeJson('data/ESTATE-REGISTRY.json', registry);

  // Settle every deterministic projection before hashing the permanent receipt.
  // No source, media-audit, card, or route mutation may occur after those hashes
  // are recorded.
  node('scripts/credits.mjs');
  node('scripts/sync-sources.mjs');
  npm(['run', 'media:audit', '--', 'sync']);
  npm(['run', 'media:audit', '--', 'gate', '--scope', 'star-trek']);
  node('scripts/shard.mjs');
  node('scripts/build-contract.mjs');
  node('scripts/build-record-pages.mjs');

  const card = readJson('data/specimens.json').find((row) => row.id === stageDoc.wall_id);
  const source = readJson('data/SOURCES.json').find((row) => row.id === stageDoc.wall_id);
  const facets = readJson('data/MEDIA-AUDIT.json').items.filter((row) => row.wall_id === stageDoc.wall_id).sort((a, b) => a.side.localeCompare(b.side));
  const task = taskRow().task;
  const counts = queueCounts();
  ensure(JSON.stringify(counts) === JSON.stringify({ total: 2228, queued: 1801, resolved: 425, blocked: 0, rejected: 2, in_flight: 0 }), 'Maryl final queue drifted');
  const next = JSON.parse(node('scripts/thesis-rails.mjs', ['next', '--json'], { capture: true }));
  ensure(next.phase === 'ready-for-one-cycle' && next.candidate?.task_id !== TASK_ID, 'Maryl final rail did not return to collection');

  const receiptPath = 'data/review/adapter-sdk/star-trek-maryl-cycle.json';
  const checkerPath = 'scripts/star-trek-maryl-cycle.mjs';
  const checker = checkerSource({ wallId: stageDoc.wall_id, receiptPath });
  fs.writeFileSync(checkerPath, checker);
