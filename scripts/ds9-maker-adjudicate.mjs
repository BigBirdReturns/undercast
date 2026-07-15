#!/usr/bin/env node
/**
 * Collect, pin, hash, and verify maker receipts. Uses the network.
 *
 * This script never decides applicability and never attaches evidence as a credit.
 * Exact character/species joins are emitted only as non-authoritative signals for
 * the owner review surface. Owner decisions are the sole attachment layer.
 */
import { readFile, writeFile } from "node:fs/promises";
import { pinPages, verifyBasis } from "./lib/adjudicate.mjs";
import { receiptId } from "./lib/maker.mjs";

const roster = JSON.parse(await readFile("data/ds9/roster.json", "utf8"));
const raw = JSON.parse(await readFile("data/ds9/maker-judgments.json", "utf8"));
const claims = raw.claims || [];
const graphEdges = JSON.parse(await readFile("data/ds9/graph/edges.json", "utf8")).edges;
const contact = process.env.CONTACT || "ds9-maker-attribution";
const aggregate = /^Unnamed |(?:personnel|residents|visitors)$|Dabo girls/i;
const charId = (row) => row.character_page || row.character;

const speciesByChar = new Map();
for (const edge of graphEdges) if (edge.type === "is_species") {
  const character = edge.from.replace("character:", "");
  const species = edge.to.replace("species:", "");
  (speciesByChar.get(character) || speciesByChar.set(character, new Set()).get(character)).add(species);
}

const citedPages = [...new Set(claims.map((claim) => claim.source_page).filter(Boolean))];
console.log(`pinning ${citedPages.length} cited page(s)...`);
const pins = await pinPages(citedPages, { contact });

const receipts = {};
for (const [index, claim] of claims.entries()) {
  const pin = pins.get(claim.source_page);
  const possibleKeys = [];
  if (claim.scope === "character" && !aggregate.test(claim.key || "")) {
    for (const row of roster) if (charId(row) === claim.key) possibleKeys.push(row.duplicate_key);
  }
  if (claim.scope === "species") {
    for (const row of roster) if (speciesByChar.get(charId(row))?.has(claim.key)) possibleKeys.push(row.duplicate_key);
  }
  const core = {
    reader_assertion: {
      ordinal: index + 1,
      scope: claim.scope,
      key: claim.key,
      maker: claim.maker,
      maker_type: claim.maker_type,
    },
    source: {
      page: pin?.title || claim.source_page,
      url: pin?.url || null,
      revision: pin?.revision ?? null,
      content_sha256: pin?.content_sha256 ?? null,
      basis: claim.quote,
    },
  };
  const id = receiptId(core);
  if (receipts[id]) throw new Error(`duplicate receipt identity at raw claim ${index + 1}: ${id}`);
  receipts[id] = {
    id,
    ...core,
    verified: !!(pin && !pin.missing && claim.quote && verifyBasis(claim.quote, pin.wikitext)),
    signals: {
      possible_duplicate_keys: [...new Set(possibleKeys)].sort(),
      note: "Non-authoritative exact page/species joins for owner triage only; never decision support by themselves.",
    },
  };
}

const performances = Object.fromEntries(roster.map((row) => {
  const signalIds = Object.values(receipts)
    .filter((receipt) => receipt.signals.possible_duplicate_keys.includes(row.duplicate_key))
    .map((receipt) => receipt.id);
  return [row.duplicate_key, {
    duplicate_key: row.duplicate_key,
    performer: row.performer,
    performer_pageid: row.performer_pageid,
    character: row.character,
    character_page: row.character_page,
    character_pageid: row.character_pageid,
    signal_receipt_ids: signalIds,
    on_wall: row.role_on_wall,
    wall_ids: row.wall_ids,
  }];
}));

const document = {
  version: 3,
  production: "Star Trek: Deep Space Nine",
  captured_at: new Date().toISOString(),
  generator: "scripts/ds9-maker-adjudicate.mjs",
  note: "Pinned maker receipts plus non-authoritative roster signals. Provenance is not applicability. No receipt becomes a performance credit until an owner decision supplies explicit quote spans, scope, rationale, and an immutable policy pin.",
  receipt_count: Object.keys(receipts).length,
  verified_receipts: Object.values(receipts).filter((receipt) => receipt.verified).length,
  receipts,
  performances,
};

await writeFile("data/ds9/maker-evidence.json", JSON.stringify(document, null, 1) + "\n");
console.log(`maker receipts: ${document.receipt_count}; verified: ${document.verified_receipts}`);
console.log(`performance keys: ${Object.keys(performances).length}; credits attached by machine: 0`);
