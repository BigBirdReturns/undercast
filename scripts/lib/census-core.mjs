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

export function namesFrom(value) {
  const links = [...value.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)?\]\]/g)]
    .map((m) => m[1].trim().replace(/\s*\((actor|actress|performer|puppeteer|Dalek operator)\)$/i, ""));
  return links.filter((n) => n && !/^(File|Image|Category|w:c:|Template):/i.test(n)
    && !/[()\d]/.test(n) && n !== n.toUpperCase()
    && !/uncredited|unknown|various|see below/i.test(n)
    && PERSONISH.test(n) && n.length < 40);
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
