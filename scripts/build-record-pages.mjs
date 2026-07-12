import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const ROOT=path.resolve(new URL("..",import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/,m=>m.slice(1)));
const records=JSON.parse(await readFile(path.join(ROOT,"data/specimens.json"),"utf8"));
const tombstones=JSON.parse(await readFile(path.join(ROOT,"data/tombstones.json"),"utf8").catch(()=>'{"records":[]}'));
let media={urls:{}};
try{ media=JSON.parse(await readFile(path.join(ROOT,"data/media-live.json"),"utf8")); }catch{}
const OUT=path.join(ROOT,"records");
const ORIGIN="https://bigbirdreturns.github.io/undercast";
const RELEASE=/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/?#]+$/;

const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[ch]);
const url=value=>{ try{ const parsed=new URL(value); return /^https?:$/.test(parsed.protocol)?parsed.href:"#"; }catch{return "#";} };
const imageUrl=image=>{
  if(!image?.src) return "../../assets/placeholder-light-clean.png";
  const live=media.urls?.[image.src];
  return RELEASE.test(live||"")?live:"../../"+image.src.replace(/^\.?\//,"");
};
const figure=(image,label,title)=>`<figure><div class="record-image${image?.src?"":" absent"}"><img src="${esc(imageUrl(image))}" alt="${esc(image?.src?title:`${label} image is not on file`)}" loading="eager"></div><figcaption>${esc(title)}</figcaption></figure>`;
const creditPresent=value=>Boolean(String(value||"").trim()&&!/^(?:—|-|unknown|not credited)$/i.test(String(value).trim()));
const imageEvidence=(image,label)=>image?.origin?`<div class="record-row"><span>${esc(label)} image provenance</span><b><a href="${esc(url(image.origin))}" rel="noopener">Open image source</a></b>${image.author||image.license?`<div>${esc([image.author,image.license].filter(Boolean).join(" · "))}</div>`:""}</div>`:"";

function page(record){
  const id=record.id;
  const canonical=`${ORIGIN}/records/${encodeURIComponent(id)}/`;
  const description=`${record.character} was performed by ${record.actor} in ${record.production}.`;
  const liveImage=record.still?.src?media.urls?.[record.still.src]:"";
  const mainImage=RELEASE.test(liveImage||"")?liveImage:record.still?.src?`${ORIGIN}/${record.still.src}`:`${ORIGIN}/og.png`;
  const source=url(record.link);
  const conditionRows=Array.isArray(record.conditions)?record.conditions.map(condition=>`<div class="record-row"><span>Performance condition · ${esc(condition.scope)}</span><b>${esc(condition.type.replace(/-/g," "))}${condition.episode?` · ${esc(condition.episode)}`:""}</b><div>${esc(condition.note)} · <a href="${esc(url(condition.source))}" rel="noopener">source</a></div></div>`).join(""):"";
  const referenceRows=Array.isArray(record.references)?record.references.map(reference=>`<div class="record-row"><span>Evidence · ${esc(reference.claim.replace(/-/g," "))}</span><b><a href="${esc(url(reference.source))}" rel="noopener">${esc(reference.label)}</a></b>${reference.publisher?`<div>${esc(reference.publisher)}</div>`:""}</div>`).join(""):"";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self'; img-src 'self' https:; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(record.character)} — ${esc(record.actor)} | UNDERCAST</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}"><link rel="describedby" type="application/json" href="../../data/archive.json"><link rel="alternate" type="application/ld+json" href="../../data/dataset.jsonld" title="UNDERCAST dataset description">
<meta property="og:type" content="article"><meta property="og:site_name" content="UNDERCAST"><meta property="og:title" content="${esc(record.character)} — ${esc(record.actor)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${esc(mainImage)}">
<link rel="stylesheet" href="../../assets/site-shell.css"><link rel="stylesheet" href="../../assets/record-page.css"></head>
<body><div class="record-wrap"><header class="site-shell"><a class="site-brand" href="../../index.html"><span class="site-wordmark">UNDERCAST</span><span class="site-tagline">the people behind the faces culture remembers</span></a><nav class="site-nav" aria-label="Archive navigation"><a href="../../index.html#archive">Browse</a><a class="site-primary" href="../../recognition.html#${esc(id)}">Interactive record</a><a href="../../coverage.html">Coverage</a><a href="../../index.html#makers">Makers</a><a href="../../index.html#about">About</a></nav></header>
<main><div class="record-meta"><span><b>${esc(id)}</b> · ${esc(record.universe)}</span><span>${esc(record.production)} · ${esc(record.years)}</span></div>
<section class="record-intro"><div class="record-kicker">The association</div><div class="record-association">${esc(description)}</div></section>
<h1>${esc(record.character)}</h1><div class="record-sub">${record.kind==="voice"?"Voice performance":"Character performance"}</div>
<div class="record-pair">${figure(record.still,"Character",record.character)}${figure(record.portrait,"Performer",record.actor)}</div>
<section class="record-columns"><div><p class="record-reveal">${esc(record.reveal)}</p><p class="record-source">This permanent record is readable without JavaScript. The interactive view adds comparison and live connection paths.</p><div class="record-actions"><a class="record-action primary" href="../../recognition.html#${esc(id)}">Open interactive record <span>→</span></a><a class="record-action" href="../../index.html#${esc(id)}">Find on the wall <span>→</span></a></div></div>
<aside class="record-ledger" aria-label="Record details"><div class="record-row"><span>Performed by</span><b>${esc(record.actor)}</b></div><div class="record-row"><span>Design and build credit</span><b>${esc(creditPresent(record.designer)?record.designer:"Not yet on file")}</b></div>${conditionRows}${referenceRows}<div class="record-row"><span>You already knew them</span><b>${esc(record.knownFor)}</b></div>${source!=="#"?`<div class="record-row"><span>Performer profile</span><b><a href="${esc(source)}" rel="noopener">Open profile</a></b></div>`:""}${imageEvidence(record.still,"Character")}${imageEvidence(record.portrait,"Performer")}</aside></section>
</main></div></body></html>`;
}

function tombstonePage(row){
  const successor=records.find(record=>record.id===row.successor);
  const canonical=`${ORIGIN}/records/${encodeURIComponent(row.successor)}/`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(row.id)} merged into ${esc(row.successor)} | UNDERCAST</title><link rel="canonical" href="${canonical}"><link rel="describedby" type="application/json" href="../../data/archive.json"><link rel="stylesheet" href="../../assets/site-shell.css"><link rel="stylesheet" href="../../assets/record-page.css"></head><body><div class="record-wrap"><header class="site-shell"><a class="site-brand" href="../../index.html"><span class="site-wordmark">UNDERCAST</span><span class="site-tagline">the people behind the faces culture remembers</span></a></header><main><div class="record-meta"><span><b>${esc(row.id)}</b> · merged record</span></div><section class="record-intro"><div class="record-kicker">Catalog continuity</div><div class="record-association">This identifier remains permanent. Its duplicate evidence was merged into ${esc(row.successor)}.</div></section><h1>${esc(successor?.character||row.successor)}</h1><p class="record-reveal">${esc(row.reason)}</p><div class="record-actions"><a class="record-action primary" href="../${esc(row.successor)}/">Open the surviving permanent record <span>→</span></a><a class="record-action" href="../../recognition.html#${esc(row.id)}">Open interactive record <span>→</span></a></div></main></div></body></html>`;
}

await rm(OUT,{recursive:true,force:true});
await mkdir(OUT,{recursive:true});
for(const record of records){
  const dir=path.join(OUT,record.id);
  await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,"index.html"),page(record),"utf8");
}
for(const row of tombstones.records||[]){
  const dir=path.join(OUT,row.id);
  await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,"index.html"),tombstonePage(row),"utf8");
}
console.log(`built ${records.length} live + ${(tombstones.records||[]).length} merged permanent record pages`);
