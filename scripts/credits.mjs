#!/usr/bin/env node
/**
 * credits.mjs — build CREDITS.md from data/SOURCES.json.
 *
 * The ledger holds EVERY asset with its `kind`. This file surfaces the subset
 * that legally requires visible attribution — the free-licensed portraits
 * (CC-BY / CC-BY-SA). Character stills are recorded in the ledger for lineage
 * but don't need a credits roll; that's the whole point.
 */
import { readFile, writeFile } from "node:fs/promises";

const ledger = JSON.parse(await readFile("data/SOURCES.json", "utf8").catch(() => "[]"));

const freebies = ledger
  .filter((r) => r.portrait && r.portrait.kind === "free")
  .sort((a, b) => a.id.localeCompare(b.id));

const stillCount = ledger.filter((r) => r.still && r.still.kind === "still").length;

const lines = [];
lines.push("# Credits");
lines.push("");
lines.push("UNDERCAST is a non-commercial fan project. Full asset lineage lives in");
lines.push("[`data/SOURCES.json`](data/SOURCES.json). This file lists the images that");
lines.push("carry a free license requiring visible attribution.");
lines.push("");
lines.push("## Freely-licensed portraits");
lines.push("");
if (freebies.length === 0) {
  lines.push("_None yet — run `node scripts/retrieve.mjs`._");
} else {
  for (const r of freebies) {
    const p = r.portrait;
    const who = p.author || "Unknown";
    const src = p.origin ? ` — [source](${p.origin})` : "";
    lines.push(`- **${r.actor}** (${r.id}) — ${who}, ${p.license}${src}`);
  }
}
lines.push("");
lines.push("## Ledger summary");
lines.push("");
lines.push(`- Free-licensed portraits (attributed above): **${freebies.length}**`);
lines.push(`- Character stills (studio-copyright, shown under fan-use; see ledger): **${stillCount}**`);
lines.push("");
lines.push("Copyright holders: this is a fan project. See the takedown note in the README —");
lines.push("email and any specific asset comes down.");
lines.push("");

await writeFile("CREDITS.md", lines.join("\n"));
console.log(`CREDITS.md written: ${freebies.length} attributed, ${stillCount} character stills.`);
