#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const root=resolve(process.cwd());
const types={".css":"text/css; charset=utf-8",".html":"text/html; charset=utf-8",".ico":"image/x-icon",".jpg":"image/jpeg",".jpeg":"image/jpeg",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".png":"image/png",".svg":"image/svg+xml; charset=utf-8",".txt":"text/plain; charset=utf-8",".webp":"image/webp",".xml":"application/xml; charset=utf-8"};

createServer((request,response)=>{
  try{
    const url=new URL(request.url||"/","http://127.0.0.1");
    let pathname=decodeURIComponent(url.pathname).replace(/^\/undercast(?=\/|$)/,"")||"/";
    if(pathname.endsWith("/")) pathname+="index.html";
    const file=resolve(root,"."+pathname);
    if(file!==root&&!file.startsWith(root+sep)) throw new Error("outside root");
    if(!existsSync(file)||!statSync(file).isFile()){
      response.writeHead(404,{"content-type":"text/plain; charset=utf-8","cache-control":"no-store"});
      response.end("Not found");
      return;
    }
    response.writeHead(200,{"content-type":types[extname(file).toLowerCase()]||"application/octet-stream","cache-control":"no-store"});
    if(request.method==="HEAD"){ response.end(); return; }
    createReadStream(file).pipe(response);
  }catch(error){
    response.writeHead(400,{"content-type":"text/plain; charset=utf-8"});
    response.end("Bad request");
  }
}).listen(4173,"127.0.0.1",()=>console.log("UNDERCAST test server: http://127.0.0.1:4173/undercast/"));
