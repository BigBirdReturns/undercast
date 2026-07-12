#!/usr/bin/env node
/** Build deterministic machine-facing projections and the archive contract. */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";

const ORIGIN="https://bigbirdreturns.github.io/undercast";
const sha256=value=>createHash("sha256").update(value).digest("hex");
// GitHub Pages serves repository text with LF endings. Hash that published form
// even when a Windows checkout has core.autocrlf enabled.
const publishedText=async path=>Buffer.from((await readFile(path,"utf8")).replace(/\r\n/g,"\n"),"utf8");
const fileMeta=async path=>{const body=await publishedText(path);return {path,bytes:body.length,sha256:sha256(body)};};
const slug=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48)||"unknown";
const entityKey=(kind,label)=>`${kind}:${slug(label)}-${sha256(String(label).normalize("NFKC").toLowerCase()).slice(0,8)}`;
const tokens=value=>[...new Set(String(value||"").normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[])];
const escXml=value=>String(value).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[ch]);

function parseMakers(value){
  if(!value) return [];
  return String(value)
    .split(/\s*[·•|;\/]\s*|,\s+(?=(?:sculpt|makeup|design|prosthetic|supv|key|from|over|with)\b)/i)
    .map(part=>part
      .replace(/^\s*(?:special\s+)?(?:burn\s+)?(?:makeup(?:\s+effects)?|prosthetics?|costume|creature\s+design|character\s+design|performance\s+capture|mo-?cap|sculpt(?:or|ing)?|design(?:ed|s)?|created|key\s+\w+|supervis(?:ed|or)|animatronics?|puppet(?:eer|ry)?)\b\s*(?:by|:|—|-|effects)?\s*/i,"")
      .replace(/\bsupv\.?\b/ig,"").replace(/\(.*?\)/g,"")
      .replace(/^[\s,–—-]+|[\s,–—-]+$/g,"").trim())
    .filter(Boolean)
    .filter(name=>name.length>=3&&name.length<=60&&/[A-Z]/.test(name)&&!/\b(own|vary|varies|concept|features|frame|team|his|her|their|from|suit)\b/i.test(name));
}

function entitiesFor(kind,records,labelOf){
  const map=new Map();
  for(const record of records){
    for(const label of labelOf(record)){
      const key=entityKey(kind,label);
      const row=map.get(key)||{key,label,record_ids:[]};
      row.record_ids.push(record.id);map.set(key,row);
    }
  }
  return [...map.values()].map(row=>({...row,record_ids:[...new Set(row.record_ids)].sort()})).sort((a,b)=>a.label.localeCompare(b.label));
}

const specimens=JSON.parse(await readFile("data/specimens.json","utf8"));
const sources=JSON.parse(await readFile("data/SOURCES.json","utf8"));
const shardManifest=JSON.parse(await readFile("data/shard-manifest.json","utf8"));
const index=JSON.parse(await readFile("data/index.json","utf8"));

const entities={
  version:1,
  schema:"schema/entities.schema.json",
  generated_from:{path:"data/specimens.json",content_sha256:shardManifest.source_sha256},
  semantics:"Derived navigation projection. Exact labels are grouped; keys are not canonical human identity assertions.",
  performers:entitiesFor("performer",specimens,record=>[record.actor]),
  productions:entitiesFor("production",specimens,record=>[record.production]),
  makers:entitiesFor("maker",specimens,record=>parseMakers(record.designer)),
};
await writeFile("data/entities.json",JSON.stringify(entities,null,1)+"\n");

await rm("data/search",{recursive:true,force:true});
await mkdir("data/search",{recursive:true});
const buckets=new Map();
for(const entry of index){
  const hay=[entry.a,entry.c,entry.p,entry.u,entry.d,entry.co,entry.kw].filter(Boolean).join(" ");
  for(const token of tokens(hay)){
    const bucket=/^[a-z0-9]$/i.test(token[0])?token[0].toLowerCase():"_";
    const map=buckets.get(bucket)||new Map();
    const postings=map.get(token)||[];postings.push(entry.id);map.set(token,postings);buckets.set(bucket,map);
  }
}
const searchShards=[];
for(const bucket of [...buckets.keys()].sort()){
  const object={};
  for(const [token,ids] of [...buckets.get(bucket)].sort((a,b)=>a[0].localeCompare(b[0]))) object[token]=[...new Set(ids)].sort();
  const body=JSON.stringify(object);
  const file=`data/search/${bucket}.json`;
  await writeFile(file,body+"\n");
  searchShards.push({prefix:bucket,file,terms:Object.keys(object).length,bytes:Buffer.byteLength(body),sha256:sha256(body)});
}
const searchManifest={version:1,generated_from:shardManifest.source_sha256,tokenization:"NFKC lowercase Unicode letter/number tokens, minimum length 2",shards:searchShards};
await writeFile("data/search/manifest.json",JSON.stringify(searchManifest,null,1)+"\n");

const canonicalRecords=await fileMeta("data/specimens.json");
const canonicalSources=await fileMeta("data/SOURCES.json");
const leanIndex=await fileMeta("data/index.json");
const entityMeta=await fileMeta("data/entities.json");
const searchMeta=await fileMeta("data/search/manifest.json");
const mediaMeta=await fileMeta("data/media-live.json");
const conditionVocabMeta=await fileMeta("data/vocabularies/conditions.json");
const siteAssets=await Promise.all(["index.html","recognition.html","assets/site-shell.css","assets/record-page.css"].map(fileMeta));
const archive={
  version:1,catalog_id:"undercast",schema:"schema/archive.schema.json",title:"UNDERCAST — performers behind designed faces",canonical_url:`${ORIGIN}/`,
  description:"A provenance-first field index of performers who vanish under prosthetics, masks, creature suits, performance capture, or an unseen voice.",
  identifiers:{record_pattern:"^UC-G?\\d+$",record_key:"id",never_reuse_ids:true},
  canonical:{records:{...canonicalRecords,schema:"schema/specimen.schema.json",count:specimens.length,content_sha256:shardManifest.source_sha256},sources:{...canonicalSources,schema:"schema/source.schema.json",count:sources.length}},
  projections:{lean_index:leanIndex,shard_manifest:{...(await fileMeta("data/shard-manifest.json")),count:shardManifest.count,shards:shardManifest.shards},entities:entityMeta,search:searchMeta,media_live:mediaMeta},
  vocabularies:{conditions:conditionVocabMeta},
  routes:{record:"records/{id}/",interactive_record:"recognition.html#{id}",wall_record:"index.html#{id}",filtered_wall:"index.html?{query}"},
  discovery:{robots:"robots.txt",sitemap:"sitemap.xml",dataset:"data/dataset.jsonld",crawler_guide:"CRAWLERS.md"},
  policies:{truth:"Only canonical.records is hand-maintained truth; every projection is disposable.",evidence:"Do not promote inferred conditions or identities to fact. Evidence-scoped claims require a source URL.",cache:"Every cached artifact is disposable. Verify sha256 before treating a projection as current.",privacy:"No visitor profile, search history, or server-side session is collected."},
  web_assets:siteAssets,
};
await writeFile("data/archive.json",JSON.stringify(archive,null,1)+"\n");

const dataset={"@context":"https://schema.org","@type":"Dataset",name:"UNDERCAST",description:archive.description,url:`${ORIGIN}/`,version:String(archive.version),creator:{"@type":"Organization",name:"UNDERCAST contributors"},isAccessibleForFree:true,keywords:["performers","prosthetics","creature suits","masks","performance capture","voice performance"],distribution:[{"@type":"DataDownload",name:"Canonical specimen catalog",encodingFormat:"application/json",contentUrl:`${ORIGIN}/data/specimens.json`},{"@type":"DataDownload",name:"Archive contract",encodingFormat:"application/json",contentUrl:`${ORIGIN}/data/archive.json`},{"@type":"DataDownload",name:"Derived entity index",encodingFormat:"application/json",contentUrl:`${ORIGIN}/data/entities.json`}]};
await writeFile("data/dataset.jsonld",JSON.stringify(dataset,null,1)+"\n");

const urls=[`${ORIGIN}/`,`${ORIGIN}/recognition.html`,...specimens.map(record=>`${ORIGIN}/records/${record.id}/`)];
const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(loc=>`  <url><loc>${escXml(loc)}</loc></url>`).join("\n")}\n</urlset>\n`;
await writeFile("sitemap.xml",sitemap);
console.log(`built archive contract, ${entities.performers.length} performer credits, ${entities.makers.length} makers, ${searchShards.length} search shards`);
