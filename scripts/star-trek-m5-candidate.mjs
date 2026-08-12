#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
const TASK="ap_119c89efb9edbdd49dc78cf0", WALL="UC-1361", ROLE="M-5 multitronic unit", PERFORMER="James Doohan", SOURCE="https://memory-alpha.fandom.com/wiki/M-5_multitronic_unit", FINGERPRINT="359dfb9a85e67ee5207561dabc665e1e488e043bd35e1af9850e9283d6745ecb", PRIOR="cycle_9cdab3104f46a978639c5051";
const EXPECTED_QUEUE={"total":2228,"queued":1835,"resolved":392,"blocked":0,"rejected":1,"in_flight":0};
const sha=(value)=>crypto.createHash("sha256").update(value).digest("hex");
const read=(path)=>JSON.parse(fs.readFileSync(path,"utf8"));
const jsonl=(path)=>fs.readFileSync(path,"utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ok=(value,message)=>{if(!value)throw new Error(message)};
const same=(actual,expected,message)=>ok(JSON.stringify(actual)===JSON.stringify(expected),message);
const state=read("data/AUTOPILOT.json"), trek=state.jobs.filter((row)=>row.scope==="star-trek"), task=trek.find((row)=>row.id===TASK);
ok(trek.length===EXPECTED_QUEUE.total,"Star Trek denominator drifted");
ok(task?.status==="resolved"&&task.performer===PERFORMER&&task.character===ROLE&&task.source_fingerprint===FINGERPRINT,"M-5 task identity or status drifted");
same(task.performance_modes,["physical-prosthetic"],"M-5 queued mode hint drifted");same(task.wall_ids,[WALL],"M-5 wall binding drifted");
same({total:trek.length,queued:trek.filter((row)=>row.status==="queued").length,resolved:trek.filter((row)=>row.status==="resolved").length,blocked:trek.filter((row)=>row.status==="blocked").length,rejected:trek.filter((row)=>row.status==="rejected").length,in_flight:trek.filter((row)=>["leased","drafted","merged"].includes(row.status)).length},EXPECTED_QUEUE,"M-5 queue accounting drifted");
const specimens=read("data/specimens.json"), card=specimens.find((row)=>row.id===WALL);
ok(card&&card.actor===PERFORMER&&card.character===ROLE&&card.production==="The Ultimate Computer"&&card.universe==="Star Trek"&&card.years==="1968","M-5 canonical identity drifted");
ok(card.kind==="voice"&&card.transform===2&&card.designer==="—"&&card.link===SOURCE,"M-5 modality or classification drifted");
ok(card.still?.src&&card.portrait?.src&&card.still.src!==card.portrait.src,"M-5 separate media facets drifted");
ok(card.reveal.includes("queued physical-performance hint")&&card.reveal.toLowerCase().includes("no physical performance")&&card.reveal.includes("exact prop or design maker"),"M-5 evidence boundary drifted");
ok(card.references?.some((row)=>row.claim==="performance"&&row.source===SOURCE),"M-5 performance receipt missing");
const sources=read("data/SOURCES.json"), source=sources.find((row)=>row.id===WALL);
ok(source?.actor===PERFORMER&&source?.character===ROLE&&source?.still?.origin&&source?.portrait?.origin==="https://commons.wikimedia.org/wiki/File:Doohan-portraet1.jpg","M-5 media provenance drifted");
const media=read("data/MEDIA-AUDIT.json").items.filter((row)=>row.wall_id===WALL), still=media.find((row)=>row.side==="still"), portrait=media.find((row)=>row.side==="portrait");
ok(media.length===2&&still?.status==="verified"&&portrait?.status==="verified","M-5 media denominator or status drifted");
ok(still.asset?.sha256===sha(fs.readFileSync(card.still.src))&&still.claims?.identity?.value==="expected"&&still.claims?.presentation?.value==="character-depiction","M-5 exact machine image review drifted");
ok(portrait.asset?.sha256===sha(fs.readFileSync(card.portrait.src))&&portrait.claims?.identity?.value==="expected"&&portrait.claims?.presentation?.value==="neutral-human","M-5 performer portrait review drifted");
const allEvents=jsonl("data/journal/autopilot.jsonl").filter((row)=>row.task_id===TASK), claim=allEvents.find((row)=>row.op==="lease.claimed"&&row.selection_basis?.includes("star-trek-m5-cycle-v1"));
ok(claim&&claim.capability_profile==="text-vision"&&claim.selection_strategy==="reviewed-task","M-5 lease custody drifted");
const events=allEvents.filter((row)=>Date.parse(row.at)>=Date.parse(claim.at));for(const op of ["lease.claimed","task.drafted","task.merged","task.media-verified"])ok(events.some((row)=>row.op===op),"M-5 missing "+op);
for(const row of events){const body={...row};delete body.id;ok(row.id==="apj_"+sha(JSON.stringify(body)).slice(0,24),"M-5 "+row.op+" event is not content-addressed")}
const accepted=jsonl("data/journal/candidates.jsonl").filter((row)=>row.op==="draft.accept"&&row.specimen===WALL);
ok(accepted.length===1&&accepted[0].actor_name===PERFORMER&&accepted[0].character===ROLE&&accepted[0].verification==="autopilot-source-receipt","M-5 growth acceptance drifted");
ok(read("data/drafts.json").length===0,"M-5 draft was not consumed");
const water=read("data/WATERLINE-STATE.json");ok(water.cycles.some((row)=>row.id===PRIOR),"latest Star Trek prior cycle missing");ok(!water.cycles.some((row)=>row.lease_id===claim.lease_id),"candidate must remain unreceipted until independent review");
ok(fs.readFileSync("sitemap.xml","utf8").includes("records/UC-1361/"),"M-5 permanent route is absent from sitemap");
const hashes=new Map();for(const specimen of specimens){for(const side of ["still","portrait"]){const path=specimen[side]?.src;if(!path||!fs.existsSync(path))continue;const digest=sha(fs.readFileSync(path)),prior=hashes.get(digest);ok(!prior||prior.id===specimen.id,"cross-card duplicate "+(prior?.id||"unknown")+"/"+specimen.id);hashes.set(digest,{id:specimen.id,side})}}
console.log("star-trek-m5-candidate: PASS — exact James Doohan voice custody, exact M-5 machine image, neutral public-domain performer portrait, explicit modality correction, maker boundary, and one-cycle isolation are intact");
