#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
const TASK="ap_8ab8a9927bf935d152b4155e", WALL="UC-1360", ROLE="Skar", PERFORMER="Dan Starkey", SOURCE="https://tardis.fandom.com/wiki/Skar", FINGERPRINT="933a0fcf7b04560da6c36ef028bb7bc5d39a43f6d986975e5fa676c99e332d71";
const sha=(value)=>crypto.createHash("sha256").update(value).digest("hex");
const read=(path)=>JSON.parse(fs.readFileSync(path,"utf8"));
const jsonl=(path)=>fs.readFileSync(path,"utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const ok=(value,message)=>{if(!value)throw new Error(message)};
const same=(actual,expected,message)=>ok(JSON.stringify(actual)===JSON.stringify(expected),message);
const state=read("data/AUTOPILOT.json"), doctor=state.jobs.filter((row)=>row.scope==="doctor-who"), task=doctor.find((row)=>row.id===TASK);
ok(doctor.length===316,"Doctor Who denominator drifted");
ok(task?.status==="resolved"&&task.performer===PERFORMER&&task.character===ROLE&&task.source_fingerprint===FINGERPRINT,"Skar task identity or status drifted");
same(task.performance_modes,["voice"],"Skar mode drifted");same(task.wall_ids,[WALL],"Skar wall binding drifted");
same({queued:doctor.filter((row)=>row.status==="queued").length,resolved:doctor.filter((row)=>row.status==="resolved").length,in_flight:doctor.filter((row)=>["leased","drafted","merged"].includes(row.status)).length},{queued:301,resolved:15,in_flight:0},"cycle 015 queue accounting drifted");
const specimens=read("data/specimens.json"), card=specimens.find((row)=>row.id===WALL);
ok(card&&card.actor===PERFORMER&&card.character===ROLE&&card.production==="The Doctor and the Dalek"&&card.universe==="Doctor Who"&&card.years==="2014","Skar canonical identity drifted");
ok(card.kind==="voice"&&card.transform===2&&card.designer==="—"&&card.link===SOURCE,"Skar classification drifted");
ok(/^images\/uc-1360-still\.(jpg|png|webp)$/.test(card.still?.src)&&card.portrait?.src==="images/uc-1360-portrait.jpg","Skar media paths drifted");
ok(card.reveal.includes("role-specific vocal processing")&&card.reveal.includes("role-specific design or build maker"),"Skar evidentiary boundary drifted");
ok(card.references?.some((row)=>row.claim==="performance"&&row.source===SOURCE),"Skar performance receipt missing");
const sources=read("data/SOURCES.json"), source=sources.find((row)=>row.id===WALL);
ok(source?.actor===PERFORMER&&source?.character===ROLE&&source?.still?.origin?.includes("Skar.jpg")&&source?.portrait?.origin?.includes("Dan_Starkey"),"Skar media provenance drifted");
const media=read("data/MEDIA-AUDIT.json").items.filter((row)=>row.wall_id===WALL), still=media.find((row)=>row.side==="still"), portrait=media.find((row)=>row.side==="portrait");
ok(media.length===2&&still?.status==="verified"&&portrait?.status==="verified","Skar media denominator or status drifted");
ok(still.asset?.sha256===sha(fs.readFileSync(card.still.src))&&still.claims?.identity?.value==="expected"&&still.claims?.presentation?.value==="character-depiction","Skar character review drifted");
ok(portrait.asset?.sha256===sha(fs.readFileSync(card.portrait.src))&&portrait.claims?.identity?.value==="expected"&&portrait.claims?.presentation?.value==="neutral-human","Skar performer review drifted");
const events=jsonl("data/journal/autopilot.jsonl").filter((row)=>row.task_id===TASK);
for(const op of ["lease.claimed","task.drafted","task.merged","task.media-verified"])ok(events.some((row)=>row.op===op),"Skar missing "+op);
for(const row of events){const body={...row};delete body.id;ok(row.id==="apj_"+sha(JSON.stringify(body)).slice(0,24),"Skar "+row.op+" event is not content-addressed")}
const claim=events.find((row)=>row.op==="lease.claimed");ok(claim?.selection_basis?.includes("cycle-015-skar-selection-v1")&&claim.capability_profile==="text-vision","Skar lease custody drifted");
const accepted=jsonl("data/journal/candidates.jsonl").filter((row)=>row.op==="draft.accept"&&row.specimen===WALL);
ok(accepted.length===1&&accepted[0].actor_name===PERFORMER&&accepted[0].character===ROLE&&accepted[0].verification==="autopilot-source-receipt","Skar growth acceptance drifted");
ok(read("data/drafts.json").length===0,"Skar draft was not consumed");
ok(!read("data/WATERLINE-STATE.json").cycles.some((row)=>row.lease_id===claim.lease_id),"candidate must remain unreceipted until independent qualification");
ok(fs.readFileSync("sitemap.xml","utf8").includes("records/UC-1360/"),"Skar permanent route is absent from sitemap");
const hashes=new Map();for(const specimen of specimens){for(const side of ["still","portrait"]){const path=specimen[side]?.src;if(!path||!fs.existsSync(path))continue;const digest=sha(fs.readFileSync(path)),prior=hashes.get(digest);ok(!prior||prior.id===specimen.id,"cross-card duplicate "+(prior?.id||"unknown")+"/"+specimen.id);hashes.set(digest,{id:specimen.id,side})}}
console.log("doctor-who-cycle-015-candidate: PASS — exact Skar voice custody, exact character image, neutral performer portrait, maker boundary, audited wall closure, and one-cycle isolation are intact");
