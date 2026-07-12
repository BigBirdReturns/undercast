import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const ROOT=path.resolve(new URL("..",import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/,m=>m.slice(1)));
const records=JSON.parse(await readFile(path.join(ROOT,"data/specimens.json"),"utf8"));
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

function page(record){
  const id=record.id;
  const canonical=`${ORIGIN}/records/${encodeURIComponent(id)}/`;
  const description=`${record.character} was performed by ${record.actor} in ${record.production}.`;
  const liveImage=record.still?.src?media.urls?.[record.still.src]:"";
  const mainImage=RELEASE.test(liveImage||"")?liveImage:record.still?.src?`${ORIGIN}/${record.still.src}`:`${ORIGIN}/og.png`;
  const source=url(record.link);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self'; img-src 'self' https:; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(record.character)} — ${esc(record.actor)} | UNDERCAST</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}">
<meta property="og:type" content="article"><meta property="og:site_name" content="UNDERCAST"><meta property="og:title" content="${esc(record.character)} — ${esc(record.actor)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${esc(mainImage)}">
<link rel="stylesheet" href="../../assets/site-shell.css"><link rel="stylesheet" href="../../assets/record-page.css"></head>
<body><div class="record-wrap"><header class="site-shell"><a class="site-brand" href="../../index.html"><span class="site-wordmark">UNDERCAST</span><span class="site-tagline">the people behind the faces culture remembers</span></a><nav class="site-nav" aria-label="Archive navigation"><a href="../../index.html#archive">Browse</a><a class="site-primary" href="../../recognition.html#${esc(id)}">Interactive record</a><a href="../../index.html#makers">Makers</a><a href="../../index.html#about">About</a></nav></header>
<main><div class="record-meta"><span><b>${esc(id)}</b> · ${esc(record.universe)}</span><span>${esc(record.production)} · ${esc(record.years)}</span></div>
<section class="record-intro"><div class="record-kicker">The association</div><div class="record-association">${esc(description)}</div></section>
<h1>${esc(record.character)}</h1><div class="record-sub">${record.kind==="voice"?"Voice performance":"Character performance"}</div>
<div class="record-pair">${figure(record.still,"Character",record.character)}${figure(record.portrait,"Performer",record.actor)}</div>
<section class="record-columns"><div><p class="record-reveal">${esc(record.reveal)}</p><p class="record-source">This permanent record is readable without JavaScript. The interactive view adds comparison and live connection paths.</p><div class="record-actions"><a class="record-action primary" href="../../recognition.html#${esc(id)}">Open interactive record <span>→</span></a><a class="record-action" href="../../index.html#${esc(id)}">Find on the wall <span>→</span></a></div></div>
<aside class="record-ledger" aria-label="Record details"><div class="record-row"><span>Performed by</span><b>${esc(record.actor)}</b></div><div class="record-row"><span>Design and build credit</span><b>${esc(record.designer)}</b></div><div class="record-row"><span>You already knew them</span><b>${esc(record.knownFor)}</b></div>${source!=="#"?`<div class="record-row"><span>Filed reference</span><b><a href="${esc(source)}" rel="noopener">Open source</a></b></div>`:""}</aside></section>
</main></div></body></html>`;
}

await rm(OUT,{recursive:true,force:true});
await mkdir(OUT,{recursive:true});
for(const record of records){
  const dir=path.join(OUT,record.id);
  await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,"index.html"),page(record),"utf8");
}
const urls=[`${ORIGIN}/`,`${ORIGIN}/recognition.html`,...records.map(record=>`${ORIGIN}/records/${record.id}/`)];
const sitemap=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(loc=>`  <url><loc>${esc(loc)}</loc></url>`).join("\n")}\n</urlset>\n`;
await writeFile(path.join(ROOT,"sitemap.xml"),sitemap,"utf8");
console.log(`built ${records.length} permanent record pages`);
