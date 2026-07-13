#!/usr/bin/env node
/** Semantic hygiene checks that are stricter than basic JSON shape validation. */
import { readFileSync } from "node:fs";

const specimens = JSON.parse(readFileSync("data/specimens.json", "utf8"));
const errors = [];
const fail = (id, message) => errors.push(`${id}: ${message}`);
const disambiguator = /\s\((?:actor|actress|performer|voice actor|puppeteer)\)$/i;
const compositePerson = /\s(?:&|and)\s/i;

for (const record of specimens) {
  if (disambiguator.test(record.actor)) fail(record.id, `actor label leaks a Wikipedia disambiguator (${record.actor})`);
  if (compositePerson.test(record.actor)) fail(record.id, `actor must identify one person, not a composite credit (${record.actor})`);

  for (const side of ["still", "portrait"]) {
    const image = record[side];
    if (!image || image.kind !== "free") continue;
    let url;
    try { url = new URL(image.origin); } catch { fail(record.id, `${side} free image has malformed origin`); continue; }
    if (url.hostname !== "commons.wikimedia.org" || !/^\/wiki\/File:/i.test(decodeURIComponent(url.pathname)))
      fail(record.id, `${side} free image must cite an exact Wikimedia Commons File page`);
    if (!String(image.license || "").trim()) fail(record.id, `${side} free image lacks a license`);
    if (!/(?:public domain|cc0)/i.test(image.license || "") && !String(image.author || "").trim())
      fail(record.id, `${side} attributed free image lacks an author`);
  }

  const filedRoles = new Set();
  for (const performance of record.performances || []) {
    const key = String(performance.character || "").normalize("NFKC").toLowerCase();
    if (filedRoles.has(key)) fail(record.id, `duplicate structured performance ${performance.character}`);
    filedRoles.add(key);
    if (!(performance.references || []).some((reference) => reference.claim === "performance" && /^https:\/\//.test(reference.source || "")))
      fail(record.id, `structured performance ${performance.character} lacks HTTPS performance evidence`);
  }
}

const report = { status: errors.length ? "FAIL" : "PASS", records: specimens.length, error_count: errors.length, errors };
if (process.argv.includes("--json")) console.log(JSON.stringify(report));
else {
  console.log(`Corpus semantic audit: ${report.status} — ${specimens.length} records`);
  for (const error of errors) console.error(`  ERROR ${error}`);
}
if (errors.length) process.exitCode = 2;
