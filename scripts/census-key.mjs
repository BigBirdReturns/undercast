// Canonical identity rules shared by census generation and every census gate.
// These parenthetical labels are wiki disambiguators, not separate credit IDs.
// "(mirror)" is deliberately excluded: a mirror-universe character is a
// distinct performed role, not punctuation around the same identity.
export const normalizeCensusKey = (value) => String(value || "").normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase()
  .replace(/\s*\((?:ferengi|character|actor|actress|performer|puppeteer)\)\s*$/i, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export const censusCreditKey = (row) => [row.franchise, row.category, row.character, row.performer]
  .map(normalizeCensusKey).join("|");
export const censusCharacterKey = (row) => [row.franchise, row.category, row.character, ""]
  .map(normalizeCensusKey).join("|");
