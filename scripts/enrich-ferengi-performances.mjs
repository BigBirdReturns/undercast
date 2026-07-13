#!/usr/bin/env node
/** One-time, idempotent migration for audited secondary Ferengi credits. */
import { readFile, writeFile } from "node:fs/promises";

const source = (character) => `https://memory-alpha.fandom.com/wiki/${character.replaceAll(" ", "_")}`;
const performance = (character, production, years, url = source(character)) => ({
  character, production, years, performance_mode: "physical-prosthetic",
  references: [{ claim: "performance", label: `${character} performer credit`, source: url, publisher: "Memory Alpha" }],
});

const additions = {
  "UC-298": [
    performance("Bok", "Star Trek: The Next Generation — Bloodlines", "1994"),
    performance("Gral (Ferengi)", "Star Trek: Deep Space Nine — The Nagus", "1993"),
    performance("Prak", "Star Trek: The Next Generation — Force of Nature", "1993"),
  ],
  "UC-019": [
    performance("Bractor", "Star Trek: The Next Generation — Peak Performance", "1989"),
    performance("Letek", "Star Trek: The Next Generation — The Last Outpost", "1987"),
    performance("Lumba", "Star Trek: Deep Space Nine — Profit and Lace", "1998"),
  ],
  "UC-004": [
    performance("Brunt", "Star Trek: Deep Space Nine", "1995–99"),
    performance("Krem", "Star Trek: Enterprise — Acquisition", "2002"),
  ],
  "UC-021": [
    performance("Farek", "Star Trek: The Next Generation — Ménage à Troi", "1990"),
    performance("Ulis", "Star Trek: Enterprise — Acquisition", "2002"),
  ],
  "UC-110": [performance("Gaila (Ferengi)", "Star Trek: Deep Space Nine", "1997–98")],
  "UC-030": [
    performance("Gint", "Star Trek: Deep Space Nine — Body Parts", "1996"),
    performance("Par Lenor", "Star Trek: The Next Generation — The Perfect Mate", "1992"),
    performance("Sovak", "Star Trek: The Next Generation — Captain's Holiday", "1990"),
  ],
  "UC-887": [performance("Kayron", "Star Trek: The Next Generation — Rascals", "1992")],
  "UC-262": [performance("Nava", "Star Trek: Deep Space Nine — The Nagus", "1993")],
  "UC-675": [performance("Solok (Ferengi)", "Star Trek: The Next Generation — Chain of Command, Part I", "1992")],
  "UC-677": [performance("Tarr", "Star Trek: The Next Generation — The Last Outpost", "1987")],
  "UC-378": [performance("Tol", "Star Trek: Deep Space Nine — Prophet Motive", "1995")],
};

const primaryReferences = {
  "UC-887": ["Berik", "https://memory-alpha.fandom.com/wiki/Berik"],
  "UC-678": ["Grimp", "https://memory-alpha.fandom.com/wiki/Grimp"],
  "UC-676": ["Ishka", "https://memory-alpha.fandom.com/wiki/Ishka"],
  "UC-270": ["Ishka", "https://memory-alpha.fandom.com/wiki/Ishka"],
  "UC-675": ["Krax", "https://memory-alpha.fandom.com/wiki/Krax"],
  "UC-679": ["Leck", "https://memory-alpha.fandom.com/wiki/Leck"],
  "UC-677": ["Lurin", "https://memory-alpha.fandom.com/wiki/Lurin"],
  "UC-031": ["Nog", "https://memory-alpha.fandom.com/wiki/Nog"],
  "UC-680": ["Pel", "https://memory-alpha.fandom.com/wiki/Pel_(Ferengi)"],
  "UC-019": ["Quark", "https://memory-alpha.fandom.com/wiki/Quark"],
  "UC-030": ["Rom", "https://memory-alpha.fandom.com/wiki/Rom"],
  "UC-674": ["Zek", "https://memory-alpha.fandom.com/wiki/Zek"],
};
const dateCorrections = { "UC-887": "1992", "UC-678": "1996", "UC-270": "1997–99", "UC-679": "1997–98" };

const specimens = JSON.parse(await readFile("data/specimens.json", "utf8"));
for (const record of specimens) {
  if (additions[record.id]) {
    const existing = new Set((record.performances || []).map((item) => item.character.normalize("NFKC").toLowerCase()));
    record.performances = [...(record.performances || []), ...additions[record.id].filter((item) => !existing.has(item.character.normalize("NFKC").toLowerCase()))];
  }
  const primary = primaryReferences[record.id];
  if (primary) {
    const reference = { claim: "performance", label: `${primary[0]} performer credit`, source: primary[1], publisher: "Memory Alpha" };
    if (!(record.references || []).some((item) => item.claim === reference.claim && item.source === reference.source))
      record.references = [...(record.references || []), reference];
  }
  if (dateCorrections[record.id]) record.years = dateCorrections[record.id];
}

await writeFile("data/specimens.json", JSON.stringify(specimens, null, 2) + "\n");
console.log(`Enriched ${Object.keys(additions).length} records with exact secondary credits; corrected ${Object.keys(dateCorrections).length} date ranges.`);
