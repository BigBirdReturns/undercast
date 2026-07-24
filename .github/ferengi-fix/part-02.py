# ---- Browser: exact wall roles, complete source ledger, and safe named anchors ----
replace_once(
    'index.html',
    '  .maker-active{\n',
    '''  .species-context{border:1px solid var(--seam);background:var(--relief-hi);padding:14px 16px;margin-bottom:20px;font-size:11px;line-height:1.6;color:var(--ink-soft);}\n  .species-context h3{font-family:"Fraunces",serif;font-size:22px;line-height:1;margin:0;color:var(--ink);}\n  .species-summary{display:flex;gap:10px 18px;flex-wrap:wrap;margin-top:8px;}\n  .species-summary b{color:var(--ink);}\n  .species-context .scope-note{margin:8px 0 0;max-width:90ch;}\n  .species-context details{margin-top:10px;border-top:1px dotted var(--line);padding-top:8px;}\n  .species-context summary{cursor:pointer;color:var(--grease);font-weight:700;}\n  .species-ledger{columns:2;column-gap:26px;margin:10px 0 0;padding-left:22px;}\n  .species-ledger li{break-inside:avoid;margin:0 0 7px;padding-right:8px;}\n  .species-ledger .role{color:var(--ink);font-weight:700;}\n  .species-ledger .status{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-faint);}\n  .species-ledger a{color:var(--grease);}\n  @media(max-width:720px){.species-ledger{columns:1;}}\n  .maker-active{\n''',
)
replace_once(
    'index.html',
    '  </div>\n\n  <div class="maker-active" id="makerActive" hidden></div>',
    '  </div>\n\n  <section class="species-context" id="speciesContext" aria-live="polite" hidden></section>\n  <div class="maker-active" id="makerActive" hidden></div>',
)
replace_once(
    'index.html',
    'let MEDIA = {};               // localSrc -> {url,location}: images living on GitHub Releases\n',
    'let MEDIA = {};               // localSrc -> {url,location}: images living on GitHub Releases\nlet SPECIES_PROJECTION = {taxa:[]}; // complete source-backed role ledger + exact wall-role facets\n',
)
replace_once(
    'index.html',
    'const speciesChipsEl=document.getElementById("speciesChips");\n',
    'const speciesChipsEl=document.getElementById("speciesChips");\nconst speciesContextEl=document.getElementById("speciesContext");\n',
)
replace_once(
    'index.html',
    '''function speciesClick(event,el){\n  event.preventDefault();event.stopPropagation();setSpecies(el.dataset.species||"All");\n  (document.getElementById("grid")||document.body).scrollIntoView({behavior:reducedMotion()?"auto":"smooth",block:"start"});\n  return false;\n}\n''',
    '''function speciesClick(event,el){\n  event.preventDefault();event.stopPropagation();setSpecies(el.dataset.species||"All");\n  (document.getElementById("grid")||document.body).scrollIntoView({behavior:reducedMotion()?"auto":"smooth",block:"start"});\n  return false;\n}\nfunction activeTaxon(){ return (SPECIES_PROJECTION.taxa||[]).find(taxon=>taxon.label===speciesFilter)||null; }\nfunction renderSpeciesContext(rows){\n  const taxon=activeTaxon();\n  if(!taxon){ speciesContextEl.hidden=true;speciesContextEl.innerHTML="";return; }\n  const c=taxon.counts||{};\n  const statusLabel={"primary-card":"illustrated primary role","additional-performance":"additional performance on file",unfiled:"not yet a dedicated card"};\n  const ledger=(taxon.credits||[]).map(credit=>{\n    const ids=Array.isArray(credit.wall_ids)?credit.wall_ids:[];\n    let destination="";\n    if(credit.status==="primary-card"&&ids[0]) destination=` · <a href="#${safeId(ids[0])}">card ${esc(ids[0])}</a>`;\n    else if(credit.status==="additional-performance"&&ids[0]) destination=` · <a href="./recognition.html#${safeId(ids[0])}">filed under ${esc(ids[0])}</a>`;\n    else destination=` · <a href="${safeUrl(credit.source)}" target="_blank" rel="noopener">source</a>`;\n    return `<li><span class="role">${esc(credit.character)}</span> — ${esc(credit.performer)}<br><span class="status">${esc(statusLabel[credit.status]||credit.status)}</span>${destination}</li>`;\n  }).join("");\n  speciesContextEl.hidden=false;\n  speciesContextEl.innerHTML=`<h3>${esc(taxon.label)} roles</h3><div class="species-summary"><span><b>${rows.length}</b> illustrated card${rows.length===1?"":"s"} in this view</span><span><b>${esc(c.named_credits)}</b> captured named credits</span><span><b>${esc(c.primary_card_credits)}</b> primary-card credits across ${esc(c.primary_card_records)} cards</span><span><b>${esc(c.additional_performance_credits)}</b> additional performances on file</span><span><b>${esc(c.unfiled_named_credits)}</b> unfiled named credits</span><span><b>${esc(c.unresolved_characters)}</b> source pages without a named performer</span></div><p class="scope-note">The wall below includes only cards whose displayed role is sourced as ${esc(taxon.label)}. The ledger keeps every captured exact performer-role credit visible, including additional roles and work not yet given its own card. This is the retained community-wiki scope, not a claim that every licensed appearance is already captured. <a href="${escAttr(taxon.coverage_route)}">Open coverage view →</a></p><details><summary>Show all ${esc(c.named_credits)} captured named credits</summary><ol class="species-ledger" id="speciesLedger">${ledger}</ol></details>`;\n}\n''',
)
replace_once(
    'index.html',
    '  // active-maker banner (also works when the makers strip is scrolled off screen)\n',
    '  renderSpeciesContext(rows);\n  // active-maker banner (also works when the makers strip is scrolled off screen)\n',
)
replace_once(
    'index.html',
    'async function focusSpecimen(id){\n  id=resolveId(id);\n  if(!id) return;\n',
    '''function decodedHash(){ try{return decodeURIComponent(location.hash.replace(/^#/,""));}catch(_){return "";} }\nfunction specimenHashId(){ const value=decodedHash();return /^UC-G?\\d+$/.test(value)?resolveId(value):""; }\nfunction scrollToNamedHash(){\n  const target=decodedHash();if(!target||specimenHashId())return;\n  const el=document.getElementById(target);\n  if(el) requestAnimationFrame(()=>requestAnimationFrame(()=>el.scrollIntoView({behavior:"auto",block:"start"})));\n}\nasync function focusSpecimen(id){\n  if(!/^UC-G?\\d+$/.test(String(id||""))) return;\n  id=resolveId(id);\n  if(!id) return;\n''',
)
replace_once(
    'index.html',
