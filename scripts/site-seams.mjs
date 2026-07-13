#!/usr/bin/env node
/** Structural smoke test for the public navigation and recovery seams. */
import { readFileSync } from "node:fs";

const read = path => readFileSync(path, "utf8");
const files = Object.fromEntries([
  "index.html","recognition.html","coverage.html","constellation.html","404.html",
  "assets/site-shell.css","assets/constellation.css","assets/record-page.css","scripts/build-record-pages.mjs"
].map(path => [path, read(path)]));
const errors = [];
const expect = (condition, message) => { if (!condition) errors.push(message); };
const has = (path, pattern) => pattern.test(files[path]);

for (const path of ["index.html","recognition.html","coverage.html","constellation.html"]) {
  expect(has(path, /class="skip-link"/), `${path}: missing skip link`);
  expect(has(path, /aria-current="page"/), `${path}: current surface is not exposed`);
}

expect(has("index.html", /<main class="wrap" id="archive">/), "index: archive is not a main landmark");
expect(!has("index.html", /id="grid"[^>]*aria-live/), "index: full card grid must not be an aria-live region");
expect(has("index.html", /id="result-status"[^>]*role="status"/), "index: compact result status missing");
expect(has("index.html", /grid\.setAttribute\("aria-busy","true"\)/), "index: async grid does not expose busy state");
expect(has("index.html", /ucWall/), "index: history-entry return state missing");
expect(!has("index.html", /Every portrait here is an original plaster relief/), "index: obsolete blank-portrait explanation returned");
expect(has("index.html", /specimens\.json",\{cache:"no-store"\}/), "index: canonical fallback may mix cached generations");

expect(has("recognition.html", /<main id="record-view"/), "recognition: persistent main landmark missing");
expect(has("recognition.html", /connections-nav[\s\S]{0,220}prefers-reduced-motion/), "recognition: Connections ignores reduced motion");
expect(has("recognition.html", /data\/archive\.json",\{cache:"no-store"\}/), "recognition: archive snapshot is not fresh");
expect(has("recognition.html", /graphMeta\?\.sha256/), "recognition: constellation graph is not snapshot-versioned");
expect(has("recognition.html", /\.uc-wipe-layer\{position:absolute;inset:0;/), "recognition: comparison images do not retain full-frame geometry");
expect(has("recognition.html", /\.uc-wipe-layer\.is-character\{clip-path:inset\(0 calc\(100% - var\(--split\)\) 0 0\)\}/), "recognition: character wipe is not a fixed-image clip");
expect(has("recognition.html", /\.uc-wipe-layer\.is-person\{clip-path:inset\(0 0 0 var\(--split\)\)/), "recognition: performer wipe is not a fixed-image clip");
expect(!has("recognition.html", /\.uc-wipe-layer\.is-(?:character|person)[^{]*\{[^}]*width:/), "recognition: moving the comparison seam must not resize either image");

expect(has("coverage.html", /data\/archive\.json", \{cache:"no-store"\}/), "coverage: archive snapshot is not fresh");
expect(has("coverage.html", /readArtifact\(census\.coverage/), "coverage: census artifacts are not snapshot-versioned");

expect(has("constellation.html", /class="record-open" href="recognition\.html#/), "constellation: record action is not a real link");
expect(!has("constellation.html", /data-record=/), "constellation: pointer-only record control returned");
expect(has("constellation.html", /id="retry"/), "constellation: retry path missing");
expect(has("constellation.html", /Open the raw graph data/), "constellation: raw-data recovery path missing");
expect(has("constellation.html", /data\/archive\.json", \{cache:"no-store"\}/), "constellation: archive snapshot is not fresh");
expect(has("constellation.html", /meta\?\.sha256/), "constellation: graph is not snapshot-versioned");

expect(has("404.html", /href="\/undercast\/index\.html#archive"/), "404: nested-route-safe wall recovery missing");
expect(has("404.html", /href="\/undercast\/data\/archive\.json"/), "404: machine archive recovery missing");
expect(has("scripts/build-record-pages.mjs", /class="skip-link" href="#record-main"/), "records: skip link missing from generator");
expect(has("scripts/build-record-pages.mjs", /aria-current="page">Permanent record/), "records: current surface missing from generator");
expect(has("assets/record-page.css", /@media\(max-width:420px\)\{\.record-pair\{grid-template-columns:1fr/), "records: narrow comparison breakpoint missing");

for (const path of ["index.html","recognition.html","coverage.html","constellation.html"]) {
  const htmlWithoutComments = files[path].replace(/<!--[\s\S]*?-->/g, "");
  const scripts = [...htmlWithoutComments.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(match => !/application\/(?:ld\+json|json)/i.test(match[1]))
    .map(match => match[2]).filter(Boolean);
  for (const source of scripts) {
    try { Function(source); }
    catch (error) { errors.push(`${path}: inline script does not parse (${error.message})`); }
  }
}

if (errors.length) {
  console.error(`site seams: FAIL (${errors.length})`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log("site seams: PASS (navigation, recovery, state, accessibility, snapshot coherence)");
