#!/usr/bin/env node
/**
 * ds9-fixtures.mjs — regression fixtures for the DS9 census + graph.
 *
 * Locks the identity, wall-match, relationship and provenance facts the audit
 * called out. Runs offline against the committed data/ds9 files; exits non-zero
 * on any miss.
 *
 *   npm run ds9:fixtures
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const digest = (v) => createHash("sha256").update(v).digest("hex");
const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const edgesDoc = JSON.parse(await readFile("data/ds9/graph/edges.json", "utf8"));
const edges = edgesDoc.edges;
const relDoc = JSON.parse(await readFile("data/ds9/graph/relationships.json", "utf8"));
const rel = relDoc.charts;
const graphManifest = JSON.parse(await readFile("data/ds9/graph/manifest.json", "utf8"));

let failed = 0;
const check = (name, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <- " + detail}`);
  if (!cond) failed++;
};
const rows = (pred) => roster.filter(pred);
const one = (pred) => { const r = rows(pred); return r.length === 1 ? r[0] : null; };
const edgesOf = (type) => edges.filter((e) => e.type === type);
const hostOf = new Map(edgesOf("host_of").map((e) => [e.to.replace("character:", ""), e]));

console.log("== DS9 census regression fixtures ==");

// --- Garak: one performer identity, one on-wall Elim Garak, no on/off split ---
const garak = one((r) => r.character === "Elim Garak" && !/mirror/i.test(r.character));
check("Garak: single canonical Andrew Robinson→Elim Garak row", !!garak);
check("Garak: performer aliases merge both spellings", !!garak &&
  ["Andrew Robinson", "Andrew J. Robinson"].every((a) => garak.performer_aliases.includes(a)));
check("Garak: Elim Garak is on the wall (UC-005)", !!garak && garak.role_on_wall && garak.wall_ids.includes("UC-005"));
const garakIds = new Set(rows((r) => /garak/i.test(r.character) && !/mirror/i.test(r.character)).map((r) => r.character_pageid));
const split = [...garakIds].filter((id) => {
  const rs = rows((r) => r.character_pageid === id);
  return rs.some((r) => r.role_on_wall) && rs.some((r) => !r.role_on_wall);
});
check("Garak: no character simultaneously on- and off-wall", split.length === 0, `split ids: ${split}`);

// --- Nog ---
const nog = one((r) => r.performer === "Aron Eisenberg" && r.character === "Nog");
check("Nog: Aron Eisenberg → Nog, on wall", !!nog && nog.role_on_wall);

// --- Siddig name change ---
const siddig = rows((r) => r.performer_pageid === 8798);
check("Siddig: single pageid 8798 for all his roles", siddig.length > 0 && siddig.every((r) => r.performer === "Alexander Siddig"));
check("Siddig: aliases include both Siddig El Fadil and Alexander Siddig",
  siddig.some((r) => r.performer_aliases.includes("Siddig El Fadil")));

// --- Weyoun: EXACT clones 4/5/6/7/8, one performer, sourced succession ---
const weyoun = rows((r) => /^Weyoun \d+$/.test(r.character));
const weyounNums = new Set(weyoun.map((r) => +r.character.match(/(\d+)$/)[1]));
check("Weyoun: clones 4,5,6,7,8 all present in roster", [4, 5, 6, 7, 8].every((n) => weyounNums.has(n)),
  `present: ${[...weyounNums].sort()}`);
check("Weyoun: clones are distinct character identities", new Set(weyoun.map((r) => r.character_pageid)).size === weyounNums.size);
check("Weyoun: all clones portrayed by one performer", new Set(weyoun.map((r) => r.performer_pageid)).size === 1);
const cloneOf = new Map(edgesOf("clone_instance_of").map((e) => [e.from.replace("character:Weyoun ", ""), e.designation]));
check("Weyoun: each clone is clone_instance_of the Weyoun line with its designation",
  [4, 5, 6, 7, 8].every((n) => cloneOf.get(String(n)) === n), `map: ${[...cloneOf]}`);
const succ = new Set(edgesOf("succeeded_by").map((e) => e.from.replace("character:Weyoun ", "") + "->" + e.to.replace("character:Weyoun ", "")));
check("Weyoun: succeeded_by is exactly 5→6, 6→7, 7→8 (sourced)",
  succ.size === 3 && ["5->6", "6->7", "7->8"].every((s) => succ.has(s)), `chain: ${[...succ]}`);
check("Weyoun: every succeeded_by edge carries a page basis",
  edgesOf("succeeded_by").every((e) => e.basis && e.source), "");
check("Weyoun: no succeeded_by self-loop", edgesOf("succeeded_by").every((e) => e.from !== e.to));

// --- Dax hosts: nine primary + typed temporary/alternate ---
const primaries = ["Lela Dax", "Tobin Dax", "Emony Dax", "Audrid Dax", "Torias Dax", "Joran Dax", "Curzon Dax", "Jadzia Dax", "Ezri Dax"];
check("Dax: all nine primary hosts present and typed primary",
  primaries.every((h) => hostOf.get(h)?.host_type === "primary"), `missing/mistyped: ${primaries.filter((h) => hostOf.get(h)?.host_type !== "primary")}`);
check("Dax: Verad is typed temporary, Yedrin Dax alternate (not silently primary)",
  hostOf.get("Verad")?.host_type === "temporary" && hostOf.get("Yedrin Dax")?.host_type === "alternate");
check("Dax: no host is untyped", edgesOf("host_of").every((e) => e.host_type));

// --- Klingon Houses ---
const memberOf = (house) => edges.filter((e) => e.type === "member_of" && e.to === "lineage:" + house).map((e) => e.from.replace("character:", ""));
check("House of Martok includes Worf and Martok", ["Worf", "Martok"].every((c) => memberOf("House of Martok").includes(c)));
check("House of Mogh includes Worf", memberOf("House of Mogh").includes("Worf"));

// --- Cardassian web now carries family parentage ---
const cardEdges = new Set(rel.cardassian_web.edges.map((e) => e.type + "|" + e.from + "|" + e.to));
check("cardassian_web includes Enabran Tain → Elim Garak", cardEdges.has("parent_of|character:Enabran Tain|character:Elim Garak"));
check("cardassian_web includes Dukat → Tora Ziyal", cardEdges.has("parent_of|character:Dukat|character:Tora Ziyal"));

// --- family: reciprocal corroboration + NEGATIVE fixtures for explanatory-link bugs ---
const famKey = new Set(edges.filter((e) => ["parent_of", "sibling_of", "spouse_of"].includes(e.type)).map((e) => e.type + "|" + e.from.replace("character:", "") + "|" + e.to.replace("character:", "")));
const famEdges = edges.filter((e) => ["parent_of", "sibling_of", "spouse_of"].includes(e.type));
// NEGATIVE: explanatory links must never become relationships
check("NEGATIVE: Dukat is NOT parent_of Mika (mother of his child, not his child)", !famKey.has("parent_of|Dukat|Mika"));
check("NEGATIVE: Dukat is NOT parent_of Tora Naprem (Ziyal's mother, explanatory link)", !famKey.has("parent_of|Dukat|Tora Naprem"));
check("NEGATIVE: Dukat's wife is NOT sibling_of Tora Ziyal (related-through link)", !famKey.has("sibling_of|Dukat's wife 001|Tora Ziyal") && !famKey.has("sibling_of|Tora Ziyal|Dukat's wife 001"));
check("NEGATIVE: Mika is NOT sibling_of/parent of the hybrid via Dukat", !famKey.has("parent_of|Dukat|Hybrids Mika baby"));
// POSITIVE: real, reciprocally-corroborated relationships survive
for (const [a, t, b] of [["Enabran Tain", "parent_of", "Elim Garak"], ["Dukat", "parent_of", "Tora Ziyal"],
  ["Rom", "parent_of", "Nog"], ["Keldar", "parent_of", "Quark"]])
  check(`family: ${a} ${t} ${b} corroborated`, famKey.has(`${t}|${a}|${b}`));
check("family: every asserted edge is reciprocally corroborated (2 sources)",
  famEdges.every((e) => Array.isArray(e.corroborated_by) && e.corroborated_by.length === 2),
  `${famEdges.filter((e) => !(e.corroborated_by || []).length === 2).length} uncorroborated`);
const famReview = JSON.parse(await readFile("data/ds9/graph/family-review.json", "utf8"));
check("family-review.json preserves one-sided claims (not asserted, not dropped)", famReview.count > 0 && Array.isArray(famReview.review));
const reviewKeys = new Set(famReview.review.map((r) => r.predicate + "|" + (r.parent || r.a) + "|" + (r.child || r.b)));
check("no asserted family edge is also in the one-sided review set",
  [...famKey].every((k) => !reviewKeys.has(k)));

// --- audit findings: refuted removed, nuances tagged with a sourced relation ---
const relOf = (t, a, b) => famEdges.find((e) => e.type === t && e.from === "character:" + a && e.to === "character:" + b)?.relation;
check("audit: every asserted family edge carries a relation qualifier",
  famEdges.every((e) => typeof e.relation === "string"), `${famEdges.filter((e) => !e.relation).length} without relation`);
check("audit REFUTED: Ishka spouse_of Zek removed (partners, never married)",
  !famKey.has("spouse_of|Ishka|Zek") && !famKey.has("spouse_of|Zek|Ishka") &&
  famReview.review.some((r) => /audit-refuted/.test(r.reason || "") && (r.a === "Ishka" || r.parent === "Ishka")));
check("audit STEP: Leeta parent_of Nog tagged step", relOf("parent_of", "Leeta", "Nog") === "step");
check("audit STEP: Kasidy parent_of Jake tagged step", relOf("parent_of", "Kasidy Yates-Sisko", "Jake Sisko") === "step");
check("audit STEP: Jadzia parent_of Alexander tagged step", relOf("parent_of", "Jadzia Dax", "Alexander Rozhenko") === "step");
check("audit SURROGATE: Kira parent_of Kirayoshi tagged surrogate", relOf("parent_of", "Kira Nerys", "Kirayoshi O'Brien") === "surrogate");
check("audit ADOPTIVE: Sergey/Helena parent_of Worf tagged adoptive",
  relOf("parent_of", "Sergey Rozhenko", "Worf") === "adoptive" && relOf("parent_of", "Helena Rozhenko", "Worf") === "adoptive");
check("audit BIOLOGICAL: Rom parent_of Nog stays biological (default, confirmed)", relOf("parent_of", "Rom", "Nog") === "biological");
check("audit: every relation != biological/married carries a relation_source",
  famEdges.filter((e) => !["biological", "married"].includes(e.relation)).every((e) => e.relation_source));

// --- provenance: every relationship edge is cited ---
const RELATIONAL = new Set(["is_species", "affiliated_with", "member_of", "parent_of", "sibling_of", "spouse_of", "host_of", "succeeded_by", "clone_instance_of", "commands", "allied_with", "belligerent_in"]);
const uncited = edges.filter((e) => RELATIONAL.has(e.type) && !e.source && !e.citation_type);
check("provenance: every relationship edge carries source or citation_type", uncited.length === 0,
  `${uncited.length} uncited, e.g. ${uncited[0] && uncited[0].type}`);
check("portrayed edges carry their citing episodes", edgesOf("portrayed").every((e) => Array.isArray(e.episodes) && e.episodes.length && e.episodes[0].source));
check("allied_with is labelled curated (not claimed as parsed)", edgesOf("allied_with").every((e) => e.citation_type === "curated"));

// --- relationships.json is a pure projection of edges.json (no stale) ---
const edgeKeys = new Set(edges.map((e) => e.type + "|" + e.from + "|" + e.to));
const strayEdges = Object.values(rel).flatMap((c) => c.edges).filter((e) => !edgeKeys.has(e.type + "|" + e.from + "|" + e.to));
check("relationships.json contains no edge absent from edges.json (not stale)", strayEdges.length === 0,
  `${strayEdges.length} stray, e.g. ${strayEdges[0] && strayEdges[0].type}`);

// --- graph manifest hashes match the files on disk ---
for (const [name, snap] of Object.entries(graphManifest.snapshots)) {
  const onDisk = digest(await readFile(snap.path, "utf8"));
  check(`manifest hash matches ${snap.path}`, onDisk === snap.sha256);
}

console.log(`\n${failed ? failed + " FIXTURE(S) FAILED" : "all fixtures passed"}`);
process.exit(failed ? 1 : 0);
