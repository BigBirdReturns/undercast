#!/usr/bin/env node
/**
 * ds9-fixtures.mjs — regression fixtures for the DS9 census + graph.
 *
 * Locks the identity, wall-match and relationship facts the audit called out.
 * Runs offline against the committed data/ds9 files; exits non-zero on any miss.
 *
 *   npm run ds9:fixtures
 */
import { readFile } from "node:fs/promises";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const edges = JSON.parse(await readFile("data/ds9/graph/edges.json", "utf8")).edges;
const rel = JSON.parse(await readFile("data/ds9/graph/relationships.json", "utf8")).charts;

let failed = 0;
const check = (name, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <- " + detail}`);
  if (!cond) failed++;
};
const rows = (pred) => roster.filter(pred);
const one = (pred) => { const r = rows(pred); return r.length === 1 ? r[0] : null; };
const hostOf = new Set(edges.filter((e) => e.type === "host_of").map((e) => e.to.replace("character:", "")));

console.log("== DS9 census regression fixtures ==");

// --- Garak: one performer identity, one on-wall Elim Garak, no on/off split ---
const garak = one((r) => r.character === "Elim Garak" && !/mirror/i.test(r.character));
check("Garak: single canonical Andrew Robinson→Elim Garak row", !!garak,
  `found ${rows((r) => r.character === "Elim Garak" && !/mirror/i.test(r.character)).length}`);
check("Garak: performer aliases merge both spellings", !!garak &&
  ["Andrew Robinson", "Andrew J. Robinson"].every((a) => garak.performer_aliases.includes(a)),
  garak && garak.performer_aliases.join(","));
check("Garak: Elim Garak is on the wall (UC-005)", !!garak && garak.role_on_wall && garak.wall_ids.includes("UC-005"),
  garak && `on_wall=${garak.role_on_wall} ids=${garak.wall_ids}`);
// no character identity is both on-wall and off-wall across its performer rows
const garakIds = new Set(rows((r) => /garak/i.test(r.character) && !/mirror/i.test(r.character)).map((r) => r.character_pageid));
const split = [...garakIds].filter((id) => {
  const rs = rows((r) => r.character_pageid === id);
  return rs.some((r) => r.role_on_wall) && rs.some((r) => !r.role_on_wall);
});
check("Garak: no character simultaneously on- and off-wall", split.length === 0, `split ids: ${split}`);

// --- Nog ---
const nog = one((r) => r.performer === "Aron Eisenberg" && r.character === "Nog");
check("Nog: Aron Eisenberg → Nog, on wall", !!nog && nog.role_on_wall, nog && `on_wall=${nog.role_on_wall}`);

// --- Siddig name change ---
const siddig = rows((r) => r.performer_pageid === 8798);
check("Siddig: single pageid 8798 for all his roles", siddig.length > 0);
check("Siddig: aliases include both Siddig El Fadil and Alexander Siddig",
  siddig.length > 0 && siddig.every((r) => r.performer === "Alexander Siddig") &&
  siddig.some((r) => r.performer_aliases.includes("Siddig El Fadil")),
  siddig[0] && siddig[0].performer_aliases.join(","));

// --- Weyoun clones: distinct character identities, one performer ---
const weyoun = rows((r) => /^Weyoun \d+$/.test(r.character));
const weyounCharIds = new Set(weyoun.map((r) => r.character_pageid));
const weyounPerfIds = new Set(weyoun.map((r) => r.performer_pageid));
check("Weyoun: clones are distinct character identities", weyounCharIds.size >= 3, `distinct=${weyounCharIds.size}`);
check("Weyoun: all clones portrayed by one performer (Jeffrey Combs)", weyounPerfIds.size === 1,
  `performer ids=${[...weyounPerfIds]}`);

// --- Dax hosts: the nine canonical hosts ---
const canonHosts = ["Lela Dax", "Tobin Dax", "Emony Dax", "Audrid Dax", "Torias Dax", "Joran Dax", "Curzon Dax", "Jadzia Dax", "Ezri Dax"];
const missingHosts = canonHosts.filter((h) => !hostOf.has(h));
check("Dax: all nine canonical hosts present in host_of", missingHosts.length === 0, `missing: ${missingHosts}`);

// --- Klingon Houses ---
const memberOf = (house) => edges.filter((e) => e.type === "member_of" && e.to === "lineage:" + house).map((e) => e.from.replace("character:", ""));
const martok = memberOf("House of Martok");
const mogh = memberOf("House of Mogh");
check("House of Martok includes Worf and Martok", martok.includes("Worf") && martok.includes("Martok"), martok.join(","));
check("House of Mogh includes Worf", mogh.includes("Worf"), mogh.join(","));

// --- relationship charts are non-empty ---
for (const [k, c] of Object.entries(rel))
  check(`relationship chart "${k}" has edges`, c.edge_count > 0, `edge_count=${c.edge_count}`);

console.log(`\n${failed ? failed + " FIXTURE(S) FAILED" : "all fixtures passed"}`);
process.exit(failed ? 1 : 0);
