#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
const args=process.argv.slice(2);
function option(name,fallback=null){const i=args.indexOf(name);if(i<0)return fallback;const value=args[i+1];if(!value||value.startsWith("--"))throw new Error(`${name} requires a value`);return value;}
async function exists(path){try{await stat(path);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function main(){
  const input=resolve(option('--input')),destination=resolve(option('--destination','data/review/card-backfill')),receipt=JSON.parse(await readFile(join(input,'batch-publication-receipt.json'),'utf8'));
  const accepted=receipt.results.filter(row=>row.final_disposition==='reviewed-evidence-candidate');
  if(accepted.length!==receipt.counts.accepted||accepted.length<20||accepted.length>50)throw new Error(`permanent batch count must remain 20-50; observed ${accepted.length}`);
  const sourceRoot=join(input,'permanent');
  const sourceDirs=(await readdir(sourceRoot,{withFileTypes:true})).filter(row=>row.isDirectory()).map(row=>row.name).sort();
  if(sourceDirs.length!==accepted.length)throw new Error(`permanent directory count ${sourceDirs.length} does not match accepted count ${accepted.length}`);
  for(const id of sourceDirs)if(await exists(join(destination,id)))throw new Error(`refusing to overwrite existing permanent packet ${id}`);
  await mkdir(destination,{recursive:true});
  for(const id of sourceDirs)await cp(join(sourceRoot,id),join(destination,id),{recursive:true,errorOnExist:true,force:false});
  const batches=join(destination,'batches');await mkdir(batches,{recursive:true});
  const batchPath=join(batches,`${receipt.batch_sha256}.json`);if(await exists(batchPath))throw new Error(`batch receipt already exists ${receipt.batch_sha256}`);
  await writeFile(batchPath,JSON.stringify({...receipt,materialized_packet_ids:sourceDirs,canonical_mutation:false},null,2)+'\n');
  console.log(`PASS — materialized ${sourceDirs.length} evidence-only packet directories and one batch receipt`);
  console.log(`NEXT — run the complete repository gate once, then commit the exact batch`);
}
main().catch(error=>{console.error(`card-backfill materialize: ${error.message}`);process.exit(1);});
