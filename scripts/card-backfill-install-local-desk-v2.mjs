#!/usr/bin/env node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const sourcePath = "scripts/card-backfill-install-local-desk.mjs";
const source = await readFile(sourcePath, "utf8");
const prior = "pharmacolog|footballer|soccer|chemist|physician|politician|scientist|composer";
const corrected = "pharmacolog(?:ist|ists|y|ical)?|football(?:er|ers|match)?|soccer|chemist(?:ry)?|physician|politician|scientist|composer";
const occurrences = source.split(prior).length - 1;
if (occurrences !== 1) throw new Error(`expected one namesake-pattern seam, found ${occurrences}`);
const patched = source.replace(prior, corrected);
const root = await mkdtemp(join(tmpdir(), "card-backfill-local-desk-installer-v2-"));
const path = join(root, "installer.mjs");
try {
  await writeFile(path, patched);
  await import(`${pathToFileURL(path).href}?v=2`);

  const fixturePath = "scripts/card-backfill-amortization-fixtures.mjs";
  let fixture = await readFile(fixturePath, "utf8");
  const retiredNeedle = '  "GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}",\n';
  const localNeedle = '  "card-backfill-local-adjudicate.mjs",\n';
  const fixtureOccurrences = fixture.split(retiredNeedle).length - 1;
  if (fixtureOccurrences !== 1) throw new Error(`expected one retired token fixture seam, found ${fixtureOccurrences}`);
  fixture = fixture.replace(retiredNeedle, localNeedle);

  const runtimeAssertion = 'assert(files.runtime.includes("if ! command -v identify") && files.runtime.includes("sudo apt-get install -y imagemagick"));';
  if (!fixture.includes(runtimeAssertion)) throw new Error("amortization runtime assertion seam is missing");
  const runtimeReplacement = [
    'assert(files.runtime.includes("packages+=(imagemagick)"));',
    'assert(files.runtime.includes("packages+=(python3-opencv)"));',
    'assert(files.runtime.includes("packages+=(tesseract-ocr)"));',
    'assert(files.runtime.includes(\'sudo apt-get install -y "${packages[@]}"\'));',
    'assert(!files.workflow.includes("card-backfill-machine-adjudicate.mjs"));',
    'assert(!files.workflow.includes("models: read"));',
  ].join("\n");
  fixture = fixture.replace(runtimeAssertion, runtimeReplacement);
  await writeFile(fixturePath, fixture);

  console.log("PASS — local-desk installer v2 corrected namesake morphology and aligned amortization fixtures with the current local runtime");
} finally {
  await rm(root, { recursive: true, force: true });
}
