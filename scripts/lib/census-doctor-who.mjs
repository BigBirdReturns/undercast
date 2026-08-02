// Doctor Who source adapter. Tardis Wiki stores performer names as plain text
// inside exact infobox fields, unlike the link-heavy sources handled by the
// shared census parser. This module keeps that source-specific grammar isolated.

const FIELD_RE = /\|\s*([A-Za-z0-9_ ]+?)\s*=/g;
const HASH_RE = /^[0-9a-f]{64}$/;
const PERSONISH = /^[A-ZÀ-Þ][A-Za-zà-þ'.\-]*(?: [A-ZÀ-Þ][A-Za-zà-þ'.\-]*)+$/;

export const DOCTOR_WHO_CATEGORIES = Object.freeze([
  "Daleks",
  "Cybermen",
  "Sontarans",
  "Ice Warriors",
]);

export const PERFORMER_PARAMETERS = Object.freeze(new Set([
  "actor",
  "actors",
  "performer",
  "performers",
  "played by",
  "portrayed by",
  "suit actor",
  "main actor",
  "voice actor",
  "main voice actor",
]));

const TARGET_SPECIES = Object.freeze({
  Daleks: /\bdalek\b/i,
  Cybermen: /\b(?:cyber[- ]?(?:man|men|mondan|neomorph|nomad|telosian|master|king|shade|planner|helmet)|cybusman)\b/i,
  Sontarans: /\bsontaran\b/i,
  "Ice Warriors": /\b(?:ice warrior|martian)\b/i,
});

const TARGET_TITLE = Object.freeze({
  Daleks: /\bdalek\b/i,
  Cybermen: /\bcyber/i,
  Sontarans: /\bsontaran\b/i,
  "Ice Warriors": /\bice warrior\b/i,
});

function normalizeParameter(value) {
  return String(value || "").toLowerCase().replace(/[_\s]+/g, " ").trim();
}

export function templateFields(wikitext) {
  const fields = [];
  for (const match of String(wikitext || "").matchAll(FIELD_RE)) {
    const parameter = normalizeParameter(match[1]);
    let index = match.index + match[0].length;
    let templateDepth = 0;
    let linkDepth = 0;
    const start = index;
    while (index < wikitext.length) {
      if (wikitext.startsWith("{{", index)) { templateDepth += 1; index += 2; continue; }
      if (wikitext.startsWith("}}", index)) {
        if (templateDepth === 0) break;
        templateDepth -= 1;
        index += 2;
        continue;
      }
      if (wikitext.startsWith("[[", index)) { linkDepth += 1; index += 2; continue; }
      if (wikitext.startsWith("]]", index)) {
        if (linkDepth > 0) linkDepth -= 1;
        index += 2;
        continue;
      }
      if (wikitext[index] === "|" && templateDepth === 0 && linkDepth === 0) break;
      index += 1;
    }
    fields.push({ parameter, value: wikitext.slice(start, index).trim() });
  }
  return fields;
}

function cleanPersonName(value) {
  return String(value || "")
    .replace(/<!--.*?-->/gs, " ")
    .replace(/^[-*•\s]+|[-*•\s]+$/g, "")
    .replace(/^['\"]+|['\"]+$/g, "")
    .replace(/\s*\((?:actor|actress|performer|puppeteer|dalek operator)\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function admissiblePerson(name) {
  return Boolean(name)
    && name.length < 80
    && !/[\d{}<>]/.test(name)
    && name !== name.toUpperCase()
    && !/\b(?:uncredited|unknown|various|see below|none|n\/a)\b/i.test(name)
    && !/\b(?:legion|empire|host|order|paradigm|service|alliance|corporation|fleet|army|council|committee|group|squad|unit|device|network|project|force|guard|command)\b/i.test(name)
    && PERSONISH.test(name);
}

export function namesFromDoctorWhoField(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];

  const linked = [];
  for (const match of raw.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = cleanPersonName(match[1].split("#", 1)[0].split("|", 1)[0]);
    if (admissiblePerson(target)) linked.push(target);
  }

  // Preserve links as candidates, then parse the remaining plain-text shape.
  // Tardis Wiki's current performer denominator uses unlinked names, with one
  // comma-separated multi-performer field and one actor disambiguator suffix.
  const plainSource = raw
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g, "$1")
    .replace(/<br\s*\/?\s*>/gi, ",")
    .replace(/\s+(?:and|or)\s+/gi, ",")
    .replace(/[;\n]+/g, ",");
  const plain = plainSource.split(",").map(cleanPersonName).filter(admissiblePerson);
  return [...new Set([...linked, ...plain])];
}

export function targetIdentity({ category, title, fields }) {
  if (!DOCTOR_WHO_CATEGORIES.includes(category)) {
    return { status: "invalid-category", basis: null, species: [] };
  }
  const species = fields
    .filter((field) => /^species\d*$/.test(field.parameter))
    .map((field) => field.value.trim())
    .filter(Boolean);
  const speciesText = species.join(" | ");
  if (TARGET_SPECIES[category].test(speciesText)) {
    return { status: "target", basis: "species", species };
  }
  if (!species.length && TARGET_TITLE[category].test(String(title || ""))) {
    return { status: "target", basis: "title", species };
  }
  if (species.length) return { status: "out-of-scope", basis: "species", species };
  return { status: "unresolved", basis: "missing-target-identity", species };
}

function modeForParameter(parameter) {
  if (parameter === "voice actor" || parameter === "main voice actor") return "voice";
  if (parameter === "suit actor") return "physical-prosthetic";
  return "unresolved";
}

export function extractDoctorWhoPage({ category, title, wikitext }) {
  const head = String(wikitext || "").split(/\n==/)[0].slice(0, 4000);
  const fields = templateFields(head);
  const identity = targetIdentity({ category, title, fields });
  const performerFields = fields.filter((field) => PERFORMER_PARAMETERS.has(field.parameter));
  const credits = [];
  const rejectedFields = [];
  for (const field of performerFields) {
    if (!field.value.trim()) continue;
    const names = namesFromDoctorWhoField(field.value);
    if (!names.length) {
      rejectedFields.push({ parameter: field.parameter, value: field.value.trim() });
      continue;
    }
    for (const performer of names) {
      credits.push({
        performer,
        performance_mode: modeForParameter(field.parameter),
        source_parameter: field.parameter,
      });
    }
  }

  const dedupedCredits = [...new Map(credits.map((credit) => [
    `${credit.performer}\u0000${credit.performance_mode}\u0000${credit.source_parameter}`,
    credit,
  ])).values()];

  let disposition = "unresolved";
  let reason = "target identity is not established by species or exact title";
  if (identity.status === "out-of-scope") {
    disposition = "out-of-scope";
    reason = `explicit species is outside ${category}`;
  } else if (identity.status === "target" && dedupedCredits.length) {
    disposition = "credited";
    reason = null;
  } else if (identity.status === "target" && rejectedFields.length) {
    reason = "trusted performer field contains no admissible person name";
  } else if (identity.status === "target" && performerFields.some((field) => field.value.trim())) {
    reason = "trusted performer field could not be resolved";
  } else if (identity.status === "target" && performerFields.length) {
    reason = "trusted performer fields are empty";
  } else if (identity.status === "target") {
    reason = "target page has no trusted performer field";
  }

  return {
    disposition,
    reason,
    identity,
    credits: identity.status === "target" ? dedupedCredits : [],
    performer_fields: performerFields.map((field) => ({ parameter: field.parameter, value: field.value.trim() })),
    rejected_fields: rejectedFields,
  };
}

export function validateDoctorWhoObservation(row) {
  const errors = [];
  if (!DOCTOR_WHO_CATEGORIES.includes(row?.category)) errors.push("unknown Doctor Who category");
  if (!Number.isInteger(row?.pageid)) errors.push("missing pageid");
  if (!Number.isInteger(row?.revision)) errors.push("missing revision");
  if (!HASH_RE.test(String(row?.content_sha256 || ""))) errors.push("invalid content_sha256");
  if (!/^https:\/\/tardis\.fandom\.com\/wiki\//.test(String(row?.source || ""))) errors.push("invalid source host");
  if (!["credited", "unresolved", "out-of-scope"].includes(row?.disposition)) errors.push("invalid disposition");
  return errors;
}
