// Canonical identity rules shared by census generation and every census gate.
// Parenthetical labels here are wiki disambiguators, not separate credit IDs.
export const normalizeCensusKey = (value) => String(value || "").normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase()
  .replace(/\s*\((?:ferengi|mirror|character|actor|actress|performer|puppeteer)\)\s*$/i, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export const censusCreditKey = (row) => [row.franchise, row.category, row.character, row.performer]
  .map(normalizeCensusKey).join("|");
export const censusCharacterKey = (row) => [row.franchise, row.category, row.character, ""]
  .map(normalizeCensusKey).join("|");
