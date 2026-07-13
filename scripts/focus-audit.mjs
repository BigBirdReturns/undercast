#!/usr/bin/env node
/** Report source images most likely to crop badly in fixed comparison frames. */
import { readFile } from "node:fs/promises";

const specimens=JSON.parse(await readFile("data/specimens.json","utf8"));
const media=JSON.parse(await readFile("data/media-manifest.json","utf8").catch(()=>'\{"assets":\{\}\}'));
const args=process.argv.slice(2);
const valueAfter=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:null;};
const threshold=Number(valueAfter("--threshold")||1.75);
const json=args.includes("--json");
const rows=[];

for(const record of specimens){
  for(const side of ["still","portrait"]){
    const image=record[side], dimensions=image?.src&&media.assets?.[image.src];
    if(!dimensions?.w||!dimensions?.h) continue;
    const ratio=dimensions.h/dimensions.w;
    if(ratio<threshold) continue;
    rows.push({
      id:record.id,side,character:record.character,actor:record.actor,
      width:dimensions.w,height:dimensions.h,ratio:Number(ratio.toFixed(2)),
      focus:image.focus||null,
      strategy:image.focus?`${image.focus.x}/${image.focus.y}`:"comparison default: center/upper",
      src:image.src
    });
  }
}
rows.sort((a,b)=>b.ratio-a.ratio||a.id.localeCompare(b.id));

if(json) console.log(JSON.stringify({threshold,count:rows.length,rows},null,2));
else {
  console.log(`UNDERCAST crop-risk audit — ${rows.length} image(s) at or above ${threshold.toFixed(2)} height/width`);
  for(const row of rows) console.log(`${row.id} ${row.side.padEnd(8)} ${String(row.ratio).padEnd(4)} ${row.strategy.padEnd(30)} ${row.actor} — ${row.character}`);
  console.log("Review the tallest sources first. Add image.focus only when the portrait default does not keep the intended face in frame.");
}
