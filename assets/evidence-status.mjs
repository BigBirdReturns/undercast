// Presentation projection only. The maintained media audit remains the review authority.
// Shared by the wall, Recognition, and deterministic no-JavaScript record pages.
const SIDES = ['still', 'portrait'];
const ACCEPTED = new Set(['solid', 'enforced']);
const LABELS = Object.freeze({verified:'Verified', unverified:'Unverified', absent:'Not on file', unavailable:'Review unavailable', review:'Needs review'});
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Same source-key normalization used by media-audit.mjs and preservation.
const sourceKey = value => {
  try { const url = new URL(value); url.hash = ''; return url.toString().replace(/\/$/, ''); }
  catch { return String(value || '').trim(); }
};
const hash = value => /^[a-f0-9]{64}$/.test(value || '');

export function projectEvidence(record, auditByFacet, assetHashes) {
  const result = {id:record.id, actor:record.actor, character:record.character, production:record.production, images:{}};
  for (const side of SIDES) {
    const image = record[side];
    if (!image?.src) { result.images[side] = {state:'absent'}; continue; }
    const review = auditByFacet.get(`${record.id}/${side}`);
    const digest = assetHashes.get(image.src);
    const matches = review?.actor === record.actor && review?.character === record.character &&
      review?.expected_subject === (side === 'still' ? record.character : record.actor) &&
      review?.asset?.src === image.src && sourceKey(review?.asset?.origin) === sourceKey(image.origin) &&
      review?.asset?.kind === image.kind && hash(digest) && review.asset.sha256 === digest;
    const identity = review?.claims?.identity, presentation = review?.claims?.presentation;
    const verified = matches && review.status === 'verified' &&
      ACCEPTED.has(identity?.state) && identity?.value === 'expected' &&
      ACCEPTED.has(presentation?.state) && presentation?.value === (side === 'still' ? 'character-depiction' : 'neutral-human');
    result.images[side] = {src:image.src, origin:image.origin || '', kind:image.kind || null, sha256:digest || null,
      state:verified ? 'verified' : 'unverified', audit_id:matches ? review.id : null};
  }
  return result;
}

export function describeEvidence(record, projection) {
  const bound = projection?.id === record.id && projection?.actor === record.actor &&
    projection?.character === record.character && projection?.production === record.production;
  const result = {};
  for (const side of SIDES) {
    const image = record[side], filed = projection?.images?.[side];
    let state = image?.src ? 'unavailable' : 'absent';
    if (image?.src && projection) {
      state = bound && filed?.src === image.src && filed?.origin === (image.origin || '') && filed?.kind === (image.kind || null) &&
        hash(filed?.sha256) && ['verified','unverified','review'].includes(filed?.state) ? filed.state : 'unverified';
    }
    result[side] = {state, label:LABELS[state]};
  }
  result.references = (Array.isArray(record.references) ? record.references : []).filter(reference => {
    try { return Boolean(reference?.claim) && /^https?:$/.test(new URL(reference.source).protocol); }
    catch { return false; }
  }).length;
  result.referenceLabel = result.references ? `${result.references} claim reference${result.references === 1 ? '' : 's'} on file` : 'Claim references: not on file';
  return result;
}

export function evidenceMarkup(record, projection, href = null) {
  const evidence = describeEvidence(record, projection);
  const facets = SIDES.map(side => `<span class="evidence-facet" data-evidence-side="${side}" data-evidence-state="${evidence[side].state}"><span>${side === 'still' ? 'Character image' : 'Performer portrait'}</span><strong>${evidence[side].label}</strong></span>`).join('');
  const references = href ? `<a class="evidence-references" href="${esc(href)}">${esc(evidence.referenceLabel)}</a>` : `<span class="evidence-references">${esc(evidence.referenceLabel)}</span>`;
  return `<div class="evidence-status" role="group" aria-label="Evidence status for ${esc(record.character)}">${facets}${references}</div>`;
}
