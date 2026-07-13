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
const constellations=JSON.parse(await readFile("data/constellations.json","utf8"));
const tombstones=JSON.parse(await readFile("data/tombstones.json","utf8").catch(()=>'{"records":[]}'));
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

const qualityBaseline=JSON.parse(await readFile("data/quality-baseline.json","utf8"));
const count=predicate=>specimens.filter(predicate).length;
const ratio=value=>Number((value/specimens.length).toFixed(6));
const completePairs=count(record=>record.still?.src&&record.portrait?.src);
const missingBoth=count(record=>!record.still?.src&&!record.portrait?.src);
const knownMakers=count(record=>String(record.designer||"").trim()&&!/^(?:—|-|unknown|not credited)$/i.test(String(record.designer).trim()));
const claimEvidence=count(record=>Array.isArray(record.references)&&record.references.length);
const quality={version:1,generated_from:shardManifest.source_sha256,total:specimens.length,metrics:{complete_pairs:completePairs,complete_pair_ratio:ratio(completePairs),missing_still:count(record=>!record.still?.src),missing_portrait:count(record=>!record.portrait?.src),missing_both:missingBoth,missing_both_ratio:ratio(missingBoth),known_makers:knownMakers,known_maker_ratio:ratio(knownMakers),records_with_claim_evidence:claimEvidence,claim_evidence_ratio:ratio(claimEvidence)},baseline:qualityBaseline};
await writeFile("data/quality.json",JSON.stringify(quality,null,1)+"\n");

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
  const body=JSON.stringify(object)+"\n";
  const file=`data/search/${bucket}.json`;
  await writeFile(file,body);
  searchShards.push({prefix:bucket,file,terms:Object.keys(object).length,bytes:Buffer.byteLength(body),sha256:sha256(body)});
}
const searchManifest={version:1,generated_from:shardManifest.source_sha256,tokenization:"NFKC lowercase Unicode letter/number tokens, minimum length 2",shards:searchShards};
await writeFile("data/search/manifest.json",JSON.stringify(searchManifest,null,1)+"\n");

const canonicalRecords=await fileMeta("data/specimens.json");
const canonicalSources=await fileMeta("data/SOURCES.json");
const canonicalConstellations=await fileMeta("data/constellations.json");
const leanIndex=await fileMeta("data/index.json");
const entityMeta=await fileMeta("data/entities.json");
const searchMeta=await fileMeta("data/search/manifest.json");
const mediaMeta=await fileMeta("data/media-live.json");
const conditionVocabMeta=await fileMeta("data/vocabularies/conditions.json");
const qualityMeta=await fileMeta("data/quality.json");
const censusMeta={snapshot:await fileMeta("data/CENSUS.json"),coverage:await fileMeta("data/CENSUS-COVERAGE.json"),gaps:await fileMeta("data/CENSUS-GAPS.json"),summary:await fileMeta("data/CENSUS-SUMMARY.json"),unresolved:await fileMeta("data/CENSUS-UNRESOLVED.json")};
const tombstoneMeta=await fileMeta("data/tombstones.json");
const siteAssets=await Promise.all(["index.html","recognition.html","coverage.html","constellation.html","assets/site-shell.css","assets/record-page.css","assets/coverage.css","assets/constellation.css"].map(fileMeta));
const schemas=Object.fromEntries(await Promise.all([
  ["archive","schema/archive.schema.json"],["specimen","schema/specimen.schema.json"],["source","schema/source.schema.json"],["entities","schema/entities.schema.json"],["constellations","schema/constellations.schema.json"]
].map(async([key,path])=>[key,{...(await fileMeta(path)),media_type:"application/schema+json"}])));
const archive={
  version:1,catalog_id:"undercast",schema:"schema/archive.schema.json",title:"UNDERCAST — performers behind designed faces",canonical_url:`${ORIGIN}/`,
  description:"A provenance-first field index of performers who vanish under prosthetics, masks, creature suits, performance capture, or an unseen voice.",
  identifiers:{record_pattern:"^UC-G?\\d+$",record_key:"id",never_reuse_ids:true},
  canonical:{records:{...canonicalRecords,schema:"schema/specimen.schema.json",count:specimens.length,content_sha256:shardManifest.source_sha256},sources:{...canonicalSources,schema:"schema/source.schema.json",count:sources.length},constellations:{...canonicalConstellations,schema:"schema/constellations.schema.json",count:constellations.constellations.length,nodes:constellations.nodes.length,edges:constellations.edges.length},tombstones:{...tombstoneMeta,count:(tombstones.records||[]).length}},
  schemas,
  path_bases:{contract_paths:"repository root",shard_manifest_children:"data/"},
  projections:{lean_index:leanIndex,shard_manifest:{...(await fileMeta("data/shard-manifest.json")),count:shardManifest.count,shards:shardManifest.shards},entities:entityMeta,search:searchMeta,media_live:mediaMeta,quality:qualityMeta,census:censusMeta},
  vocabularies:{conditions:conditionVocabMeta},
  routes:{record:"records/{id}/",interactive_record:"recognition.html#{id}",wall_record:"index.html#{id}",filtered_wall:"index.html?{query}",constellation:"constellation.html?id={constellation_id}&node={node_id}",merged_ids:"canonical.tombstones"},
  discovery:{robots:"robots.txt",sitemap:"sitemap.xml",dataset:"data/dataset.jsonld",crawler_guide:"CRAWLERS.md"},
  policies:{truth:"Canonical records, image-source ledger and tombstones are maintained evidence. Every projection is disposable.",evidence:"Do not promote inferred conditions or identities to fact. Evidence-scoped claims require a source URL.",cache:"Every cached artifact is disposable. sha256 and bytes describe the exact published UTF-8/LF payload.",privacy:"No visitor profile, search history, or server-side session is collected."},
  web_assets:siteAssets,
};
await writeFile("data/archive.json",JSON.stringify(archive,null,1)+"\n");

const dataset={"@context":"https://schema.org","@type":"Dataset","@id":`${ORIGIN}/#dataset`,identifier:"undercast",name:"UNDERCAST",description:archive.description,url:`${ORIGIN}/`,version:String(archive.version),creator:{"@type":"Organization",name:"UNDERCAST contributors"},isAccessibleForFree:true,keywords:["performers","prosthetics","creature suits","masks","performance capture","voice performance","evidence graph"],distribution:[{"@type":"DataDownload",name:"Canonical specimen catalog",encodingFormat:"application/json",contentUrl:`${ORIGIN}/data/specimens.json`},{"@type":"DataDownload",name:"Canonical constellation evidence graph",encodingFormat:"application/json",contentUrl:`${ORIGIN}/data/constellations.json`},{"@type":"DataDownload",name:"Archive contract",encodingFormat:"application/json",contentUrl:`${ORIGIN}/data/archive.json`},{"@type":"DataDownload",name:"Derived entity index",encodingFormat:"application/json",contentUrl:`${ORIGIN}/data/entities.json`},{"@type":"DataDownload",name:"Franchise census coverage",encodingFormat:"application/json",contentUrl:`${ORIGIN}/data/CENSUS-COVERAGE.json`}]};
await writeFile("data/dataset.jsonld",JSON.stringify(dataset,null,1)+"\n");

const urls=[`${ORIGIN}/`,`${ORIGIN}/recognition.html`,`${ORIGIN}/coverage.html`,`${ORIGIN}/constellation.html`,...specimens.map(record=>`${ORIGIN}/records/${record.id}/`),...(tombstones.records||[]).map(record=>`${ORIGIN}/records/${record.id}/`)];
const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(loc=>`  <url><loc>${escXml(loc)}</loc></url>`).join("\n")}\n</urlset>\n`;
await writeFile("sitemap.xml",sitemap);
console.log(`built archive contract, ${entities.performers.length} performer credits, ${entities.makers.length} makers, ${searchShards.length} search shards`);
