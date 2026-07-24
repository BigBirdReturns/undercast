from __future__ import annotations

from pathlib import Path
import re

ROOT = Path('.')
LIGHT = 'assets/placeholder-light-clean.png'
DARK = 'assets/placeholder-dark-clean.png'
OFFLINE = 'assets/absence-offline.svg'


def read(path: str) -> str:
    return (ROOT / path).read_text('utf-8')


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding='utf-8')


for required in [LIGHT, DARK, OFFLINE]:
    if not (ROOT / required).is_file():
        raise SystemExit(f'missing canonical absence asset {required}')

# The owner's approved replacement system is one light/dark halftone plate pair.
# Still and portrait slots differ by accessible label, not by invented face art.
index = read('index.html')
block = re.compile(
    r'/\* ---------- shared missing-evidence plates ---------- \*/.*?const grid=document\.getElementById\("grid"\);',
    re.S,
)
replacement = '''/* ---------- shared missing-evidence plates ---------- */
const ABSENCE_PLATES=Object.freeze({light:"./assets/placeholder-light-clean.png",dark:"./assets/placeholder-dark-clean.png",offline:"./assets/absence-offline.svg"});
function absencePlate(side,label){
  const what=side==="performer"?"performer portrait":"character image";
  const aria=`${label} — ${what} evidence not on file`;
  return `<picture class="portrait absence-plate" role="img" aria-label="${esc(aria)}"><source media="(prefers-color-scheme: dark)" srcset="${ABSENCE_PLATES.dark}"><img src="${ABSENCE_PLATES.light}" alt="" aria-hidden="true" loading="lazy"></picture>`;
}
function blankCast(){return `<img class="portrait absence-plate absence-offline" src="${ABSENCE_PLATES.offline}" alt="Image evidence exists but is currently offline">`;}
function undercastBlank(img){
  if(!img||img.dataset.blanked)return;img.dataset.blanked="1";
  const holder=document.createElement("div");holder.innerHTML=blankCast();
  const el=holder.firstElementChild;if(el)img.replaceWith(el);
}
const grid=document.getElementById("grid");'''
index, count = block.subn(replacement, index, count=1)
if count != 1:
    raise SystemExit(f'index shared absence block replacement count {count}')
for retired in ['assets/absence-character.svg', 'assets/absence-performer.svg', 'reliefBase(', 'voiceGlyph(', 'NO CAST']:
    if retired in index:
        raise SystemExit(f'index retains retired fallback reference {retired}')
write('index.html', index)

# Recognition already carried the approved replacement plates. Restore them if the
# generic installer rewrote either path while retaining its light/dark theme swap.
recognition = read('recognition.html')
recognition = re.sub(
    r'(<img class="uc-absence-light" src=")[^"]+("[^>]*>)',
    rf'\1{LIGHT}\2', recognition,
)
recognition = re.sub(
    r'(<img class="uc-absence-dark" src=")[^"]+("[^>]*>)',
    rf'\1{DARK}\2', recognition,
)
if LIGHT not in recognition or DARK not in recognition:
    raise SystemExit('recognition does not retain both approved absence plates')
write('recognition.html', recognition)

# Permanent routes now render the same approved plate pair for evidence not on file,
# and reserve a separate non-humanoid plate for a filed asset that failed to load.
generator = read('scripts/build-record-pages.mjs')
generator = re.sub(
    r'if\(!image\?\.src\) return "\.\./\.\./assets/[^"]+";',
    'if(!image?.src) return "../../assets/placeholder-light-clean.png";',
    generator,
    count=1,
)
generator = re.sub(
    r'const absence=\(label,status\)=>`<div class="record-absence.*?</div>`;',
    '''const absence=(label,status)=>status==="load-failed"
  ? `<div class="record-absence load-failed" role="img" aria-label="${esc(`${label} image could not be loaded; filed evidence is temporarily unavailable`)}"><img class="record-absence-offline" src="../../assets/absence-offline.svg" alt=""><span>Filed image unavailable</span></div>`
  : `<div class="record-absence not-filed" role="img" aria-label="${esc(`${label} image is not on file`)}"><picture><source media="(prefers-color-scheme: dark)" srcset="../../assets/placeholder-dark-clean.png"><img src="../../assets/placeholder-light-clean.png" alt=""></picture><span>Evidence not on file</span></div>`;''',
    generator,
    count=1,
    flags=re.S,
)
for required in ['placeholder-light-clean.png', 'placeholder-dark-clean.png', 'absence-offline.svg']:
    if required not in generator:
        raise SystemExit(f'permanent record generator lacks {required}')
for retired in ['absence-character.svg', 'absence-performer.svg']:
    generator = generator.replace(retired, 'placeholder-light-clean.png')
write('scripts/build-record-pages.mjs', generator)

# Shared sizing/theme rules. The approved plate remains artwork; no CSS-generated
# face, pseudo-person, or per-surface substitute is permitted.
shell = read('assets/site-shell.css')
shell = shell.replace(
    '.absence-plate{display:block;width:100%;height:100%;object-fit:cover;object-position:center;background:var(--plaster);filter:none!important}',
    '.absence-plate{display:block;width:100%;height:100%;background:var(--plaster);filter:none!important}.absence-plate>img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;filter:none!important}',
)
if '.record-absence picture' not in shell:
    shell += '''\n/* Shared approved absence artwork on generated permanent records. */
.record-absence{position:relative;overflow:hidden}.record-absence picture,.record-absence>img{position:absolute;inset:0;width:100%;height:100%;display:block}.record-absence picture img,.record-absence>img{width:100%;height:100%;object-fit:cover}.record-absence span{position:absolute;left:50%;bottom:7%;transform:translateX(-50%);z-index:2;white-space:nowrap}\n'''
write('assets/site-shell.css', shell)

# Make the permanent whole-site gate enforce the approved pair rather than the
# generic SVG wrappers produced by the first-pass installer.
lib = read('scripts/lib/site-sweep.mjs')
lib = lib.replace(
    '["assets/absence-character.svg","assets/absence-performer.svg","assets/absence-offline.svg"]',
    '["assets/placeholder-light-clean.png","assets/placeholder-dark-clean.png","assets/absence-offline.svg"]',
)
lib = lib.replace(
    'if(!text.includes("assets/absence-character.svg")||!text.includes("assets/absence-performer.svg"))errors.push(`${path} does not consume both canonical absence plates`);',
    'if(!text.includes("assets/placeholder-light-clean.png")||!text.includes("assets/placeholder-dark-clean.png"))errors.push(`${path} does not consume both approved light/dark absence plates`);',
)
for retired in ['absence-character.svg', 'absence-performer.svg']:
    if retired in lib:
        raise SystemExit(f'site-sweep validator still requires {retired}')
write('scripts/lib/site-sweep.mjs', lib)

# Rendered regression: inspect the correct face and prove both variants are wired.
test = read('tests/rendered/site.spec.mjs')
test = test.replace(
    '''  if(missing.missingStill)await expect(card.locator('img[src$="assets/absence-character.svg"]')).toHaveCount(1);
  if(missing.missingPortrait)await expect(card.locator('img[src$="assets/absence-performer.svg"]')).toHaveCount(1);
  await expect(card.locator('svg.portrait')).toHaveCount(0);''',
    '''  if(missing.missingStill){await expect(card.locator('.face.front picture.absence-plate img[src$="assets/placeholder-light-clean.png"]')).toHaveCount(1);await expect(card.locator('.face.front picture.absence-plate source[srcset$="assets/placeholder-dark-clean.png"]')).toHaveCount(1);}
  if(missing.missingPortrait){await expect(card.locator('.face.back picture.absence-plate img[src$="assets/placeholder-light-clean.png"]')).toHaveCount(1);await expect(card.locator('.face.back picture.absence-plate source[srcset$="assets/placeholder-dark-clean.png"]')).toHaveCount(1);}
  await expect(card.locator('svg.portrait')).toHaveCount(0);''',
)
if 'assets/absence-character.svg' in test or 'assets/absence-performer.svg' in test:
    raise SystemExit('rendered regression still expects generic absence wrappers')
write('tests/rendered/site.spec.mjs', test)

# Reconcile the permanent design note with the actual approved assets.
doc = read('docs/FULL-SITE-SWEEP.md')
doc = re.sub(
    r'The canonical plates preserve the approved replacement artwork promoted from:.*?A third non-humanoid plate',
    '''The canonical missing-evidence treatment uses the approved halftone pair already developed for the archive:\n\n- light surface: `assets/placeholder-light-clean.png`\n- dark surface: `assets/placeholder-dark-clean.png`\n\nThe same artwork serves character and performer absences; accessible labels carry the semantic difference. A third non-humanoid plate''',
    doc,
    count=1,
    flags=re.S,
)
write('docs/FULL-SITE-SWEEP.md', doc)

# The generic wrappers are implementation debris, not canonical assets.
for path in ['assets/absence-character.svg', 'assets/absence-performer.svg']:
    (ROOT / path).unlink(missing_ok=True)

print('restored the approved light/dark halftone absence system across all public surfaces')
