const ROLE_PARENTHETICAL = /\s*\((?:[^)]*\b(?:voice|vocal|after|narrat|puppet|capture|dub|radio)\b[^)]*)\)\s*/gi;
const ROLE_VARIANT_HINT = /\([^)]*\b(?:voice|vocal|after|narrat|puppet|capture|dub|radio)\b[^)]*\)/i;
const GENERIC_TAIL = /\s+(?:&|and)\s+(?:many|others|more|a bestiary of monsters|the rest|the cast)$/i;
const MULTI_SEPARATOR = /\s*(?:\/|&|,|;|\band\b)\s*/i;
const STOP_WORDS = new Set(["the", "and", "from", "with", "into", "for", "voice", "actor", "film", "series", "character", "role"]);
const PAGE_KIND_MISMATCH = /\b(?:episode|film|movie|novel|comic|soundtrack|attraction|exhibition|museum|list of|franchise|video game|television series)\b/i;
const FOREIGN_ADAPTATION = /\b(?:multiversus|lego|fortnite|comic|manga|novel|statues?|sculptures?|cosplay|merchandise|toys?|figures?|floats?|theme park|attraction|grauman|handprints?|waxworks?|fan art|fanart)\b/i;
const ALWAYS_NON_ROLE_PRESENTATION = /\b(?:statues?|sculptures?|cosplay|merchandise|toys?|action figures?|figurines?|floats?|waxworks?|fan art|fanart)\b/i;
const HUMAN_EVENT_PHOTO = /\b(?:voice actor|actor|actress|fan expo|wondercon|comic[- ]?con|panel discussion|press conference|press event|red carpet|premiere|headshot|portrait|photo ?call|photocall|interview|convention|festival|live shoot|on set|behind the scenes)\b/i;
const GENERIC_NON_DEPICTION = /\b(?:building|entrance|interior|street|road|sign|logo|poster|advertisement|advert|cover|bottle|potion|skull|weapon|gun|vehicle|trailer|store|store ?front|shop ?front|bakery|wrapper|packaging|bubblegum|cafe|ride|trophy|plaque|interface|screenshot of text|title card|certificate|sheet music|signature|autograph|icon|emoji|mask|mechanism|landscape|lake|reeds|framed fact)\b/i;
const LIVE_ACTION_DERIVATIVE = /\b(?:illustration|drawing|graphic|novel|book|edition|painting|artwork)\b/i;
const PORTRAIT_ARTIFACT = /\b(?:statue|sculpture|certificate|sheet music|signature|autograph|icon|emoji|logo|poster|advertisement|cover|mask|mechanism|landscape|lake|reeds|vehicle|trailer|document|drawing|artwork)\b/i;
const PORTRAIT_NAMESAKE_CONFLICT = /\b(?:pharmacolog(?:ist|ists|y|ical)?|football(?:er|ers|match)?|soccer|chemist(?:ry)?|physician|politician|scientist|composer)\b/i;
const PORTRAIT_CONTEXT = /\b(?:portrait|headshot|photo of|photograph of|actor|actress|performer|stuntman|stuntwoman|voice actor|film actor|television actor)\b/i;
const PORTRAIT_COSTUME = /\b(?:cosplay|costume|masked|mask|character makeup|prosthetic|in character|as [A-Z])\b/i;
const GROUP = /\b(?:and|with|cast|group|panel|crew|ensemble|family|team)\b|[,;&]/i;

export function normalizeSourceText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|quot|apos|#39);/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanFiledLabel(value) {
  return String(value || "")
    .replace(ROLE_PARENTHETICAL, " ")
    .replace(GENERIC_TAIL, "")
    .replace(/\s+/g, " ")
    .trim();
}

function aliasVariants(value, { allowPlural = false } = {}) {
  const clean = cleanFiledLabel(value);
  if (!clean) return [];
  const variants = new Set([clean]);
  const noArticle = clean.replace(/^(?:the|a|an)\s+/i, "").trim();
  if (noArticle) variants.add(noArticle);
  const epithetBase = clean.match(/^([A-Za-z0-9][A-Za-z0-9'’-]*)\s+(?:the|of the)\s+/i)?.[1] || null;
  if (epithetBase && !/^(?:the|a|an)$/i.test(epithetBase)) variants.add(epithetBase);
  for (const item of [...variants]) {
    const parts = item.split(/\s+/);
    const last = parts.at(-1) || "";
    if (allowPlural && /^[a-z]+$/i.test(last) && last.length >= 4 && !/(?:ss|us|is|ous|y|ie)$/i.test(last)) {
      const copy = [...parts];
      copy[copy.length - 1] = /s$/i.test(last) ? last.slice(0, -1) : `${last}s`;
      variants.add(copy.join(" "));
    }
  }
  return [...variants];
}

export function sourceSubjectAliases(value) {
  const cleaned = cleanFiledLabel(value);
  if (!cleaned) return [];
  const allowPlural = ROLE_VARIANT_HINT.test(String(value || ""));
  const parts = cleaned
    .split(MULTI_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && !/^(?:many|others|more)$/i.test(part));
  return [...new Set([cleaned, ...parts].flatMap((part) => aliasVariants(part, { allowPlural })).filter(Boolean))].slice(0, 24);
}

export function isMultiSubject(value) {
  const cleaned = cleanFiledLabel(value);
  const parts = cleaned.split(MULTI_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1;
}

function tokenSet(value, minimum = 3) {
  return new Set(normalizeSourceText(value).split(/\s+/).filter((word) => word.length >= minimum && !STOP_WORDS.has(word)));
}

function countOverlap(text, tokens) {
  const hay = normalizeSourceText(text);
  let count = 0;
  for (const token of tokens) if (hay.includes(token)) count += 1;
  return count;
}

function titleBase(value) {
  return normalizeSourceText(String(value || "").replace(/\s*\([^)]*\)\s*$/, ""));
}

function textEquivalent(left, right) {
  const a = normalizeSourceText(left);
  const b = normalizeSourceText(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (/\d/.test(a) || /\d/.test(b)) return a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
  return false;
}

function containsAlias(text, aliases) {
  const hay = normalizeSourceText(text);
  const compactHay = hay.replace(/\s+/g, "");
  return aliases.some((alias) => {
    const needle = normalizeSourceText(alias);
    if (needle.length < 2) return false;
    if (hay === needle || ` ${hay} `.includes(` ${needle} `)) return true;
    return /\d/.test(needle) && compactHay.includes(needle.replace(/\s+/g, ""));
  });
}

function productionMatch(text, production) {
  const tokens = tokenSet(production);
  if (!tokens.size) return false;
  const needed = tokens.size >= 4 ? 2 : 1;
  return countOverlap(text, tokens) >= needed;
}

function actorRoleBound(actorEvidence, aliases, production) {
  if (!actorEvidence) return false;
  if (actorEvidence.explicit_character_and_production === true) return true;
  const text = [
    ...(actorEvidence.character_windows || []),
    ...(actorEvidence.production_windows || []),
  ].join(" ");
  return containsAlias(text, aliases) && productionMatch(text, production);
}

export function evaluateSourceCandidate({ side, expectedSubject, actor, production, performanceMode, candidate, actorEvidence = null }) {
  const aliases = sourceSubjectAliases(expectedSubject);
  const actorAliases = sourceSubjectAliases(actor);
  const pageTitle = candidate?.page?.title || "";
  const pageWindows = candidate?.page?.extract_windows || [];
  const source = candidate?.source || {};
  const file = candidate?.file || "";
  const pageText = [pageTitle, ...pageWindows].join(" ");
  const fileText = [file, source.description || "", source.categories || ""].join(" ");
  const combined = `${pageText} ${fileText}`;
  const exactPage = aliases.some((alias) => textEquivalent(titleBase(pageTitle), alias));
  const pageHasAlias = containsAlias(pageText, aliases);
  const fileHasAlias = containsAlias(fileText, aliases);
  const pageHasActor = actorAliases.length > 0 && containsAlias(pageText, actorAliases);
  const pageHasProduction = productionMatch(pageText, production);
  const fileHasProduction = productionMatch(fileText, production);
  const actorEvidenceBound = actorRoleBound(actorEvidence, aliases, production);
  const voiceLike = /voice|animation/i.test(String(performanceMode || ""));
  const characterPageRoleBound = Boolean((exactPage || pageHasAlias) && pageHasActor && pageHasProduction);
  const roleBound = actorEvidenceBound || characterPageRoleBound;
  const pageLooksLikeActor = actor && textEquivalent(titleBase(pageTitle), actor);
  const pageKindMismatch = PAGE_KIND_MISMATCH.test(pageTitle) && !productionMatch(pageTitle, production);
  const foreignAdaptation = ALWAYS_NON_ROLE_PRESENTATION.test(fileText) || (FOREIGN_ADAPTATION.test(fileText) && !fileHasProduction);
  const humanEventPhoto = HUMAN_EVENT_PHOTO.test(fileText) && (voiceLike || !fileHasAlias);
  const genericNonDepiction = GENERIC_NON_DEPICTION.test(fileText);
  const liveActionDerivative = side === "still" && /physical|live-action/i.test(String(performanceMode || "")) && LIVE_ACTION_DERIVATIVE.test(fileText);
  const portraitArtifact = PORTRAIT_ARTIFACT.test(fileText);
  const portraitNamesakeConflict = PORTRAIT_NAMESAKE_CONFLICT.test(fileText);
  const portraitContext = PORTRAIT_CONTEXT.test(fileText);
  const multi = isMultiSubject(expectedSubject);
  const reasons = [];

  if (side === "still") {
    if (multi) reasons.push("requires-multi-subject-composite");
    if (pageLooksLikeActor) reasons.push("actor-page-is-not-character-still");
    if (humanEventPhoto) reasons.push("human-event-photo-for-character-still");
    if (!fileHasAlias) reasons.push("candidate-file-not-explicitly-bound-to-subject");
    if (!fileHasProduction) reasons.push("candidate-file-lacks-filed-production-context");
    if (pageKindMismatch) reasons.push("page-kind-does-not-match-character-claim");
    if (foreignAdaptation) reasons.push("foreign-adaptation-or-merchandise");
    if (genericNonDepiction) reasons.push("generic-non-depiction-asset");
    if (liveActionDerivative) reasons.push("wrong-adaptation-derivative-for-live-action-claim");
    if (voiceLike && !roleBound) reasons.push("actor-role-chain-not-explicit");
  } else if (side === "portrait") {
    const exactActorPage = actorAliases.some((alias) => textEquivalent(titleBase(pageTitle), alias));
    const fileHasActor = containsAlias(fileText, actorAliases);
    if (!exactActorPage && !(fileHasActor && portraitContext)) reasons.push("portrait-not-explicitly-bound-to-actor");
    if (GROUP.test(file)) reasons.push("group-or-ambiguous-portrait");
    if (PORTRAIT_COSTUME.test(combined)) reasons.push("role-costume-or-masked-portrait");
    if (portraitArtifact) reasons.push("portrait-is-object-document-icon-or-artifact");
    if (portraitNamesakeConflict) reasons.push("portrait-namesake-profession-conflict");
    if (FOREIGN_ADAPTATION.test(fileText) && !fileHasActor) reasons.push("portrait-is-role-or-franchise-artifact");
  } else {
    reasons.push("unsupported-side");
  }

  const eligible = reasons.length === 0;
  let adjustment = 0;
  if (exactPage) adjustment += 180;
  if (fileHasAlias) adjustment += 100;
  if (pageHasProduction) adjustment += 80;
  if (fileHasProduction) adjustment += 60;
  if (roleBound) adjustment += 160;
  if (!eligible) adjustment -= 1000;

  return {
    eligible,
    reasons,
    score_adjustment: adjustment,
    explicit_chain: side === "still" ? Boolean(eligible && fileHasAlias && fileHasProduction && (!voiceLike || roleBound)) : eligible,
    facts: {
      exact_subject_page: exactPage,
      page_has_subject: pageHasAlias,
      file_has_subject: fileHasAlias,
      page_has_actor: pageHasActor,
      page_has_production: pageHasProduction,
      file_has_production: fileHasProduction,
      actor_evidence_bound: actorEvidenceBound,
      character_page_role_bound: characterPageRoleBound,
      actor_role_bound: roleBound,
      page_looks_like_actor: pageLooksLikeActor,
      human_event_photo: humanEventPhoto,
      multi_subject: multi,
    },
  };
}

export function rankBoundCandidates(candidates, context) {
  return (candidates || []).map((candidate) => {
    const binding = evaluateSourceCandidate({ ...context, candidate });
    return { ...candidate, binding, score: Number(candidate.score || 0) + binding.score_adjustment };
  }).sort((a, b) => Number(b.binding?.eligible) - Number(a.binding?.eligible) || Number(b.score || 0) - Number(a.score || 0));
}
