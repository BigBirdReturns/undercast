// census-core.mjs — the pure text layer of the census, split out so fixtures
// can exercise it without triggering a network crawl (census.mjs runs on import).

// Exact performer-bearing template parameters, normalized (lowercase, _ -> space).
// Only these are examined; every other parameter is someone or something else's
// field — patterns, designers, affiliations — and crossing into it is how
// "Fourth Cyber Legion" became a performer.
export const PERFORMER_PARAMS = new Set([
  "actor", "actors", "performer", "performers", "played by", "portrayed by",
  "suit actor", "main actor", "voice actor", "main voice actor",
]);

/**
 * Extract the values of performer-bearing template parameters from wikitext.
 * Nesting-aware: a value ends at the next `|` or `}}` at the level where it
 * began — pipes inside [[links]] and nested {{templates}} belong to the value.
 * Several source wikis serialize a whole infobox on one physical line, so a
 * line-based capture reads every later parameter as part of the actor field.
 */
export function performerFieldValues(wikitext) {
  const values = [];
  for (const m of wikitext.matchAll(/\|\s*([A-Za-z_ ]+?)\s*=/g)) {
    const name = m[1].toLowerCase().replace(/[_\s]+/g, " ").trim();
    if (!PERFORMER_PARAMS.has(name)) continue;
    let i = m.index + m[0].length, depth = 0, link = 0;
    const start = i;
    while (i < wikitext.length) {
      if (wikitext.startsWith("{{", i)) { depth++; i += 2; continue; }
      if (wikitext.startsWith("}}", i)) { if (depth === 0) break; depth--; i += 2; continue; }
      if (wikitext.startsWith("[[", i)) { link++; i += 2; continue; }
      if (wikitext.startsWith("]]", i)) { if (link > 0) link--; i += 2; continue; }
      if (wikitext[i] === "|" && depth === 0 && link === 0) break;
      i++;
    }
    values.push(wikitext.slice(start, i));
  }
  return values;
}

// Initialled professional names (J.G. Hertzler, D.C. Fontana, etc.) are common
// in source credits. Requiring a lowercase letter in the first name silently
// turned exact performer fields into "unresolved" rows. Keep the two-word and
// mixed-case guards below, but accept initials inside an otherwise person-like
// name.
export const PERSONISH = /^[A-ZÀ-Þ][A-Za-zà-þ'.\-]*(?: [A-ZÀ-Þ][A-Za-zà-þ'.\-]*)+$/;

function cleanLinkTarget(raw) {
  return raw.split("#", 1)[0].split("|", 1)[0].trim()
    .replace(/\s*\((actor|actress|performer|puppeteer|Dalek operator)\)$/i, "");
}

function personCandidate(target) {
  return target && !/^(File|Image|Category|w:c:|Template):/i.test(target)
    && !/[()\d]/.test(target) && target !== target.toUpperCase()
    && !/uncredited|unknown|various|see below/i.test(target)
    && PERSONISH.test(target) && target.length < 40;
}

/**
 * Return performer-shaped links while ignoring links that merely annotate a
 * performer already named in the same list segment. Source infoboxes commonly
 * use shapes such as `[[Garth Kemp]] (as [[The Face]])` and
 * `[[Kate Mulgrew]] (posing as [[Kathryn Janeway]])`; the second link is a role
 * or disguise, not another human credit. A parenthesized segment that starts
 * with a performer remains valid, e.g. `([[Jane Doe]] as a child)`.
 */
export function namesFrom(value) {
  const names = [];
  let i = 0, parenDepth = 0, segmentHasPerformer = false;
  while (i < value.length) {
    if (value.startsWith("[[", i)) {
      const end = value.indexOf("]]", i + 2);
      if (end < 0) break;
      const target = cleanLinkTarget(value.slice(i + 2, end));
      const candidate = personCandidate(target);
      if (candidate && (parenDepth === 0 || !segmentHasPerformer)) {
        names.push(target);
        segmentHasPerformer = true;
      }
      i = end + 2;
      continue;
    }
    if (value[i] === "(") { parenDepth++; i++; continue; }
    if (value[i] === ")") { if (parenDepth > 0) parenDepth--; i++; continue; }
    if (parenDepth === 0) {
      const rest = value.slice(i);
      const br = rest.match(/^<br\s*\/?\s*>/i);
      if (br) { segmentHasPerformer = false; i += br[0].length; continue; }
      const conjunction = rest.match(/^\s+(?:and|or)\s+/i);
      if (conjunction) { segmentHasPerformer = false; i += conjunction[0].length; continue; }
      if (/[\n,;*]/.test(value[i])) segmentHasPerformer = false;
    }
    i++;
  }
  return [...new Set(names)];
}

const semanticNormalize = (value) => String(value || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘]/g, "'").replace(/[^a-zA-Z0-9']+/g, " ").trim().toLowerCase();

/**
 * Some character wikis use a performer field to name another fictional
 * character who is performing an alter ego or puppet. For adapters that opt in,
 * demote a row only when every extracted performer is itself a character page
 * in the same captured scope. Mixed human/character fields stop the crawl for
 * review rather than silently dropping one side.
 */
export function demoteCharacterOnlyPerformers(rows, unresolvedRows, franchise) {
  const titles = new Set([...rows, ...unresolvedRows]
    .filter((row) => row.franchise === franchise)
    .map((row) => semanticNormalize(row.character)));
  const kept = [], unresolved = [...unresolvedRows], demoted = [];
  for (const row of rows) {
    if (row.franchise !== franchise) { kept.push(row); continue; }
    const characterPerformers = row.performers.filter((name) => titles.has(semanticNormalize(name)));
    if (!characterPerformers.length) { kept.push(row); continue; }
    if (characterPerformers.length !== row.performers.length) {
      throw new Error(`${franchise} ${row.character} mixes human and character performer targets (${row.performers.join(", ")}); refusing an ambiguous credit`);
    }
    const reason = `source performer field names another fictional character (${characterPerformers.join(", ")}), not a human performer`;
    unresolved.push({ franchise: row.franchise, category: row.category, character: row.character,
      performance_mode: row.performance_mode || "unresolved", source: row.source, reason });
    demoted.push({ ...row, reason });
  }
  return { rows: kept, unresolved, demoted };
}

/**
 * Read a discovered-scope file. Returns null ONLY when the file does not exist
 * (ENOENT) — the one case where falling back to the hand list is honest.
 * EACCES, EISDIR, transient I/O and every other failure throw: a silently
 * narrowed scope publishes false zeros for every category it dropped.
 */
export async function loadScope(readFileFn, scopeFile) {
  let raw;
  try { raw = await readFileFn(scopeFile, "utf8"); }
  catch (err) {
    if (err?.code === "ENOENT") return null;
    throw new Error(`scope file ${scopeFile} is unreadable (${err?.code || err?.message}); refusing to crawl a silently narrowed scope`);
  }
  const discovered = (JSON.parse(raw).included || []).map((row) => row.category);
  if (!discovered.length) throw new Error(`${scopeFile} has no included categories; refusing a scope that narrows the hand list`);
  return discovered;
}
