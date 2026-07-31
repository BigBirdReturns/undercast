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
  console.log("PASS — local-desk installer v2 corrected pharmacologist/football namesake morphology before migration");
} finally {
  await rm(root, { recursive: true, force: true });
}
