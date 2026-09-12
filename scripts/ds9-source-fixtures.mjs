#!/usr/bin/env node
// Offline source-repair regression fixtures: never imports an executing crawler.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isPerson, splitRoles, charactersFrom, parseRoles, parseCast, doublingDispositions,
  mergeDispositions, characterIdentity, matchWall } from "./ds9-census.mjs";
import { coverageByKey, resolveDS9Key } from "./lib/ds9-coverage.mjs";
import { normalizeCensusKey as norm } from "./census-key.mjs";

let assertions = 0;
const eq = (actual, expected, label) => { assertions++; assert.deepEqual(actual, expected, label); };
const ok = (actual, label) => { assertions++; assert(actual, label); };
const throws = (fn, label) => { assertions++; assert.throws(fn, label); };
const hash = data => createHash("sha256").update(data).digest("hex");
const read = async path => JSON.parse(await readFile(path, "utf8"));
const root = "data/review/estate-debt/uc-1.0-ds9/";
const migration = await read(root + "migration.json");
const captures = (await read(root + "pinned-episode-capture.json")).pages;
const observations = (await read("data/ds9/observations.json")).observations;
const roster = await read("data/ds9/roster.json");
const unresolved = (await read("data/ds9/unresolved.json")).unresolved;
const aliases = (await read("data/ds9/key-aliases.json")).aliases;
const byKey = new Map(roster.map(row => [row.duplicate_key, row]));
const parsed = new Map();
for (const p of captures) {
  const original = observations.find(o => o.revision === p.revision);
  ok(original && original.pageid === p.pageid && original.source === p.source, "exact retained observation identity");
  eq(hash(p.wikitext), original.content_sha256, "retained revision bytes, not today's text");
  parsed.set(p.title, parseCast(p.wikitext, { episode: p.title, source: p.source,
    pageid: p.pageid, revision: p.revision, timestamp: p.timestamp,
    observed_at: p.observed_at, content_sha256: p.content_sha256 }));
}
eq(captures.length, 33, "bounded affected-source capture");
const head = "[[Alien with head tendrils and facial spines 001 |Alien with head tendrils and facial spines]]";
eq(charactersFrom(head).map(c => c.target), ["Alien with head tendrils and facial spines 001"], "Bill Blair target and display conjunctions stay inside link");
for (const annotation of ["archive footage and voice over", "photograph and voice over", "archive footage / voice over & photograph"]) {
  eq(charactersFrom(`[[Jadzia Dax]] (${annotation})`).map(c => c.target), ["Jadzia Dax"], "annotation never becomes another role");
}
for (const tail of ["[[Alien with pink-skin and bulbous head 001|alien on promenade]]", "[[Alien with pink-skin and bulbous head 001|Promenade alien]]"]) {
  eq(charactersFrom(tail).map(c => c.target), ["Alien with pink-skin and bulbous head 001"], "Ivy Borg exact intact source target");
}
for (const sep of [" and ", " / ", " & "]) eq(charactersFrom(`[[Weyoun 6]]${sep}[[Weyoun 7]]`).map(c => c.target), ["Weyoun 6", "Weyoun 7"], "valid dual roles");
eq(splitRoles("{{dis|Foo and Bar|{{small|one and two}}}} and [[Weyoun 7]]").length, 2, "nested templates");
eq(charactersFrom("[[Jadzia Dax]] (note (archive and voice))").length, 1, "nested annotations");
eq(charactersFrom("[[Jadzia Dax]] [archive and voice]").length, 1, "bracket annotations");
eq(charactersFrom("[[Jadzia Dax]]<ref>archive and voice [[Other role]]</ref>").map(c => c.target), ["Jadzia Dax"], "reference links do not replace role");
eq(charactersFrom("[[Jadzia Dax]] {{small|(archive and voice)}}").map(c => c.target), ["Jadzia Dax"], "formatting template annotation");
for (const tail of ["bulbous head 001|alien on promenade]]", "facial spines]]", "voice over)", "[[Jadzia Dax]"]) {
  eq(parseRoles(tail).roles, [], "malformed role never laundered into a source fact");
  ok(parseRoles(tail).rejected.length, "specific malformed disposition");
}
for (const name of ["Nicole deBoer", "Tim deZarn", "Nicole de Boer", "Tim de Zarn", "J.G. Hertzler", "Marc Lawrence van der Kolk", "Andrew J. Robinson"]) ok(isPerson(name), "source candidate passes name prefilter: " + name);
for (const name of ["Unknown actor", "Unknown Actor", "Unknown performers", "Unidentified Performer", "Quark", "Odo", "de Boer", "actor 001"]) eq(isPerson(name), false, "not a person identity: " + name);
eq(new Set(["Nicole deBoer", "Tim deZarn"].map(norm)).size, 2, "distinct performers never collapse by the name fix");
eq(charactersFrom("Étranger")[0]?.display, "Étranger", "Unicode prose role preserved");
eq(charactersFrom("?fragment"), [], "punctuation cannot become a prose role");
for (const tail of ["stunt double for [[Michael Dorn]]", "[[stunt double]] for Michael Dorn", "[[stand-in]] and [[photo double]] for [[Avery Brooks]]", "additional voice actor", "utility performer"]) {
  const p = parseCast(`=== Starring ===\n* [[Example Person]] as ${tail}`, { episode: "fixture", revision: 1 });
  eq(p.raw, [], "utility credits never become designed roles");
  eq(p.unresolved.length, 1, "one typed disposition per credit");
  eq(p.unresolved[0].disposition, "doubling-utility", "utility type preserved");
}
const five = Array.from({ length: 5 }, (_, i) => ({ episode: "Episode " + i, source: "https://example.test/" + i, revision: i + 1, line: "* [[Example Person]] as [[Michael Dorn]]" }));
eq(doublingDispositions({ character: "Michael Dorn", credits: five }).map(r => [r.episode,r.source,r.revision]), five.map(r => [r.episode,r.source,r.revision]), "post-resolution doubling retains five exact locators");
const merged = mergeDispositions([{...five[0], disposition:"doubling-utility",reason:"double"},{...five[0],disposition:"unresolved-role",reason:"no role"},{...five[0],revision:99,disposition:"doubling-utility",reason:"double"}]);
eq(merged.length, 2, "different revision is a distinct observation");
eq(merged[0].reason_history, ["double", "no role"], "rejection history survives coalescing");
const identities = (await read(root + "identity-resolution.json")).titles;
for (const target of ["Alien with head tendrils and facial spines 001", "Alien with pink-skin and bulbous head 001"]) {
  const id = characterIdentity(target, identities[target]);
  eq(id.pageid, null, "aggregate is not an individual role page identity");
  eq(id.title, target, "exact source spelling governs unresolved role");
  ok(id.fragment && id.aggregate_pageid === 233712, "aggregate locator preserved separately");
}
eq(identities["Nicole deBoer"].pageid, 8312, "source redirect identity, not name shape");
eq(identities["Tim deZarn"].pageid, 16066, "distinct source identity");

for (const change of migration.changes) {
  const row = byKey.get(change.to);
  ok(row, "every changed key has a current owner");
  for (const c of change.source_credits) {
    const page = captures.find(p => p.revision === c.revision);
    ok(page.wikitext.includes(c.line), "exact changed credit exists in pinned page");
    ok(row.episodes.some(e => e.source === c.source && e.revision === c.revision), "new assertion has episode/revision locator");
    ok(parsed.get(c.episode).raw.some(r => r.credit.line === c.line), "production parser accepts exact changed credit");
  }
}
eq(migration.changes.filter(c => c.kind === "named-source-omission").length, 4, "all four retained named-source omissions");
eq(byKey.get("p8312|c4556").episode_count, 20, "Nicole: 17 existing plus three exact citations");
eq(byKey.get("p16066|c28061").performer_aliases, ["Tim deZarn"], "retain credited spelling separately from canonical identity");
ok(byKey.get("p8312|c4556").performer_aliases.includes("Nicole deBoer"), "Nicole alias retained");
for (const [old, target] of Object.entries(aliases)) {
  eq(resolveDS9Key(old, aliases), target, "explicit migration alias");
  ok(byKey.has(target) && !byKey.has(old), "no orphan or duplicate active key");
}
throws(() => resolveDS9Key("a", {a:"b",b:"a"}), "cyclic alias rejected");
for (const key of ["p6631|c205", "p6631|t:female changeling"]) eq(resolveDS9Key(key, aliases), key, "Salome historical keys stay distinct");
const recovery = (await read(root + "doubling-locator-recovery.json")).rows;
let occurrences = 0;
for (const r of recovery) for (const episode of r.episodes) {
  const rows = unresolved.filter(u => u.legacy_indices.includes(r.legacy_index) && u.episode === episode.episode && u.revision === episode.revision);
  eq(rows.length, 1, "one recovered disposition per exact episode/credit/revision");
  eq(rows[0].disposition, "doubling-utility", "never promote doubles to faces");
  ok(rows[0].reason_history.includes(r.legacy.reason), "original rejection reason survives");
  ok(captures.find(p => p.revision === episode.revision).wikitext.includes(rows[0].line), "recovered double's exact source line");
  occurrences++;
}
eq(occurrences, 59, "48 aggregate rows describe 59 recovered occurrences");
eq(new Set(unresolved.map(u => JSON.stringify([u.episode,u.source,u.revision,u.line]))).size, unresolved.length, "unique exact dispositions");
eq(unresolved.filter(u => u.disposition === "unknown-performer").length, 66, "all existing unknown performers remain unknown");
for (const [i, original] of migration.original_unresolved.unresolved.entries()) {
  const successors = unresolved.filter(u => u.legacy_indices.includes(i));
  if (migration.changes.some(c => c.legacy_unresolved_index === i)) eq(successors.length, 0, "resolved omission is receipted separately");
  else ok(successors.length > 0 && successors.every(u => u.reason_history.includes(original.reason)), "no historical unresolved entry or rejection history erased");
}
const currentCoverage = (await read("data/ds9/coverage.json")).coverage;
const coverage = coverageByKey(currentCoverage, roster);
const rematched = structuredClone(roster); matchWall(rematched, await read("data/specimens.json"));
for (const row of rematched) eq(coverage.get(row.duplicate_key).wall_ids, row.wall_ids, "coverage matches its live specimen owner");
for (const file of ["eligibility-queue", "maker-queue"]) {
  const queue = (await read(`data/ds9/${file}.json`)).queue;
  eq(queue.length, roster.length, "queue current key denominator");
  for (const q of queue) {
    const c = coverage.get(q.duplicate_key);
    eq([...q.wall_ids].sort(), [...c.wall_ids].sort(), file + ": every wall_ids set equals coverage owner");
    eq(q.on_wall, c.role_on_wall, file + ": current on-wall flag");
  }
  eq(queue.filter(q => q.on_wall).length, 78, "78 assertion joins");
  eq(new Set(queue.flatMap(q => q.wall_ids)).size, 77, "77 cards; assertions are not cards");
}
throws(() => coverageByKey(currentCoverage.slice(1), roster), "missing coverage fails closed");
throws(() => coverageByKey([...currentCoverage,currentCoverage[0]], roster), "duplicate coverage fails closed");
throws(() => coverageByKey([{...currentCoverage[0],wall_ids:null},...currentCoverage.slice(1)],roster), "malformed coverage fails closed");
const edges = (await read("data/ds9/graph/edges.json")).edges;
const graphNodes = new Set((await read("data/ds9/graph/nodes.json")).nodes.map(n => n.type+":"+n.id));
for (const [old, target] of Object.entries((await read("data/ds9/key-aliases.json")).graph_node_aliases)) {
  ok(!graphNodes.has(old) && graphNodes.has(target), "every retired graph endpoint has an explicit live alias");
}
eq(hash(JSON.stringify(edges.filter(e => e.type !== "portrayed"))), migration.non_portrayal_edges_sha256, "relationship evidence byte-equivalent; no species/family inference");
for (const change of migration.changes) {
  const row = byKey.get(change.to), edge = edges.find(e => e.type === "portrayed" && e.from === "performer:"+row.performer && e.to === "character:"+(row.character_page || row.character));
  ok(edge && row.episodes.every(c => edge.episodes.some(e => e.source === c.source && e.revision === c.revision)), "graph includes all repaired episode locators");
}
for (const file of ["eligibility-evidence", "maker-evidence", "eligibility-decisions", "maker-decisions", "observations"]) eq(hash(await readFile(`data/ds9/${file}.json`)), migration.original_hashes[`data/ds9/${file}.json`], "historical evidence/capture/owner bytes unchanged");
eq(roster.length, 555, "source-backed assertion reconciliation");
eq(roster.reduce((n,r) => n+r.episodes.length,0), 1758, "episode citation reconciliation");
eq(unresolved.length, 152, "exact disposition reconciliation");
console.log(`DS9 source repair fixtures: PASS (${assertions} assertions, offline)`);
