from __future__ import annotations

from pathlib import Path
import base64
import json
import re

ROOT = Path('.')


def read(path: str) -> str:
    return (ROOT / path).read_text('utf-8')


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding='utf-8')


def choose_absence_asset(side: str, exclude: str | None = None) -> str:
    explicit = {
        'character': [
            'assets/absence-character.svg',
            'assets/missing-character.svg',
            'assets/evidence-not-on-file-character.svg',
            'assets/placeholder-character.svg',
            'assets/character-missing.svg',
            'assets/missing-still.svg',
        ],
        'performer': [
            'assets/absence-performer.svg',
            'assets/missing-performer.svg',
            'assets/evidence-not-on-file-performer.svg',
            'assets/placeholder-performer.svg',
            'assets/performer-missing.svg',
            'assets/missing-portrait.svg',
        ],
    }[side]
    for candidate in explicit:
        if candidate != exclude and (ROOT / candidate).is_file():
            return candidate

    candidates: list[tuple[int, str]] = []
    for base in [ROOT / 'assets', ROOT / 'images']:
        if not base.exists():
            continue
        for path in base.rglob('*'):
            if not path.is_file() or path.suffix.lower() not in {'.svg', '.png', '.jpg', '.jpeg', '.webp'}:
                continue
            rel = path.relative_to(ROOT).as_posix()
            if rel == exclude:
                continue
            name = rel.lower()
            content = ''
            if path.suffix.lower() == '.svg':
                content = path.read_text('utf-8', errors='ignore').lower()
            haystack = f'{name} {content}'
            score = 0
            for token, points in [
                ('evidence not on file', 20), ('evidence', 8), ('halftone', 8),
                ('missing', 6), ('absence', 6), ('unknown', 5), ('placeholder', 4),
            ]:
                if token in haystack:
                    score += points
            if side == 'character':
                for token, points in [('character', 12), ('still', 9), ('mask', 5), ('front', 4), ('designed', 3)]:
                    if token in haystack:
                        score += points
                for token, points in [('performer', -8), ('portrait', -8), ('back', -3), ('bare', -3)]:
                    if token in haystack:
                        score += points
            else:
                for token, points in [('performer', 12), ('portrait', 9), ('face', 5), ('back', 4), ('bare', 3), ('human', 3)]:
                    if token in haystack:
                        score += points
                for token, points in [('character', -8), ('still', -8), ('front', -3), ('mask', -2)]:
                    if token in haystack:
                        score += points
            if any(token in name for token in ['favicon', 'og.png', 'logo', 'species']):
                score -= 20
            if score > 0:
                candidates.append((score, rel))
    if not candidates:
        raise SystemExit(f'No approved {side} absence-plate candidate found')
    return sorted(candidates, reverse=True)[0][1]


def promote_asset(source_rel: str, target_rel: str, label: str) -> None:
    target = ROOT / target_rel
    if target.exists():
        return
    source = ROOT / source_rel
    data = source.read_bytes()
    if source.suffix.lower() == '.svg':
        text = data.decode('utf-8')
        comment = f'<!-- Canonical {label} absence plate promoted from {source_rel}. -->\n'
        if text.lstrip().startswith('<?xml'):
            end = text.find('?>') + 2
            text = text[:end] + '\n' + comment + text[end:]
        else:
            text = comment + text
        write(target_rel, text)
        return
    mime = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'
    }[source.suffix.lower()]
    encoded = base64.b64encode(data).decode('ascii')
    write(target_rel, f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-labelledby="title desc">
<title id="title">Evidence not on file</title><desc id="desc">Canonical {label} absence plate promoted from {source_rel}.</desc>
<image width="1200" height="900" preserveAspectRatio="xMidYMid slice" href="data:{mime};base64,{encoded}"/>
</svg>\n''')


character_source = choose_absence_asset('character')
performer_source = choose_absence_asset('performer', character_source)
promote_asset(character_source, 'assets/absence-character.svg', 'character')
promote_asset(performer_source, 'assets/absence-performer.svg', 'performer')

if not (ROOT / 'assets/absence-offline.svg').exists():
    write('assets/absence-offline.svg', '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-labelledby="title desc">
  <title id="title">Image offline</title>
  <desc id="desc">The archived image reference exists, but its bytes could not be loaded.</desc>
  <defs><pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2" fill="#7C918D" opacity=".35"/></pattern></defs>
  <rect width="1200" height="900" fill="#E4DFD5"/>
  <rect x="26" y="26" width="1148" height="848" fill="url(#dots)" stroke="#1C1A16" stroke-width="4"/>
  <path d="M112 690L350 448l156 148 175-208 407 302" fill="none" stroke="#1C1A16" stroke-width="18"/>
  <circle cx="845" cy="280" r="58" fill="none" stroke="#1C1A16" stroke-width="18"/>
  <line x1="82" y1="82" x2="1118" y2="818" stroke="#A83E30" stroke-width="7" stroke-dasharray="22 18"/>
  <rect x="86" y="730" width="1028" height="108" fill="#1C1A16"/>
  <text x="600" y="800" text-anchor="middle" fill="#E4DFD5" font-family="monospace" font-size="46" letter-spacing="12">IMAGE OFFLINE</text>
</svg>\n''')

# Sweep one: species is role-level on every reader-facing record surface.
for path in ['recognition.html', 'scripts/build-record-pages.mjs']:
    text = read(path)
    text = text.replace('taxon.records || []', 'taxon.wall_records || []')
    text = text.replace('taxon.records||[]', 'taxon.wall_records||[]')
    text = re.sub(r'\btaxon\.records\b', 'taxon.wall_records', text)
    if 'taxon.records' in text:
        raise SystemExit(f'{path} still contains person-level taxon.records')
    write(path, text)

# Sweep two: remove the original inline humanoid relief from the wall.
index = read('index.html')
if '/* ---------- portrait generators' in index:
    start = index.index('/* ---------- portrait generators')
    end = index.index('const grid=document.getElementById("grid");')
    replacement = '''/* ---------- shared missing-evidence plates ---------- */
const ABSENCE_PLATES=Object.freeze({character:"./assets/absence-character.svg",performer:"./assets/absence-performer.svg",offline:"./assets/absence-offline.svg"});
function absencePlate(side,label){
  const src=side==="performer"?ABSENCE_PLATES.performer:ABSENCE_PLATES.character;
  const what=side==="performer"?"performer portrait":"character image";
  return `<img class="portrait absence-plate" src="${src}" alt="${esc(label)} — ${what} evidence not on file" loading="lazy">`;
}
function blankCast(){return `<img class="portrait absence-plate absence-offline" src="${ABSENCE_PLATES.offline}" alt="Image evidence exists but is currently offline">`;}
function undercastBlank(img){
  if(!img||img.dataset.blanked)return;img.dataset.blanked="1";
  const holder=document.createElement("div");holder.innerHTML=blankCast();
  const el=holder.firstElementChild;if(el)img.replaceWith(el);
}
'''
    index = index[:start] + replacement + index[end:]
index = index.replace('  const rand=seedRand(s.id);\n', '')
index = re.sub(r'\s*const castSvg\s*=\s*isVoice\s*\?\s*voiceGlyph\([^;]+;', '\n  const castSvg = absencePlate("character",s.character);', index)
index = re.sub(r'\s*const bareSvg\s*=\s*isVoice\s*\?\s*voiceGlyph\([^;]+;', '\n  const bareSvg = absencePlate("performer",s.actor);', index)
index = index.replace('  const castSvg = isVoice ? voiceGlyph(seedRand(s.id+"v")) : reliefBase(seedRand(s.id+"m"),true);', '  const castSvg = absencePlate("character",s.character);')
index = index.replace('  const bareSvg = isVoice ? voiceGlyph(seedRand(s.id+"vb")) : reliefBase(seedRand(s.id+"b"), false);', '  const bareSvg = absencePlate("performer",s.actor);')
for retired in ['reliefBase(', 'voiceGlyph(', 'NO CAST']:
    if retired in index:
        raise SystemExit(f'index.html retains retired fallback signature {retired}')
write('index.html', index)

# Standardize fallback references in the other image-bearing public surfaces.
for path in ['recognition.html', 'scripts/build-record-pages.mjs']:
    text = read(path)
    for old, new in [
        (character_source, 'assets/absence-character.svg'),
        (performer_source, 'assets/absence-performer.svg'),
        ('assets/missing-still.svg', 'assets/absence-character.svg'),
        ('assets/missing-character.svg', 'assets/absence-character.svg'),
        ('assets/missing-portrait.svg', 'assets/absence-performer.svg'),
        ('assets/missing-performer.svg', 'assets/absence-performer.svg'),
    ]:
        text = text.replace('../../' + old, '../../' + new)
        text = text.replace('./' + old, './' + new)
        text = text.replace(old, new)
    write(path, text)

shell = read('assets/site-shell.css')
if '.archive-map{' not in shell:
    shell += '''\n/* Canonical evidence-absence plates: no surface may invent a face. */
.absence-plate{display:block;width:100%;height:100%;object-fit:cover;object-position:center;background:var(--plaster);filter:none!important}
.absence-offline{background:var(--plaster)}

/* Secondary archive map: joins page-specific layouts without changing primary navigation. */
.archive-map{max-width:1200px;margin:32px auto 0;padding:18px 24px;border-top:1px solid var(--shell-rule,var(--line));display:grid;grid-template-columns:minmax(150px,.7fr) repeat(5,minmax(0,1fr));gap:8px;align-items:stretch;font-family:var(--sans,Arial,sans-serif)}
.archive-map__label{display:flex;align-items:center;font-size:10px;line-height:1.4;letter-spacing:.18em;text-transform:uppercase;color:var(--shell-muted,var(--ink-soft))}
.archive-map a{display:flex;align-items:center;min-height:44px;padding:9px 10px;border:1px solid var(--shell-rule,var(--line));color:var(--shell-ink,var(--ink));text-decoration:none;font-size:10px;line-height:1.35;letter-spacing:.08em;text-transform:uppercase}
.archive-map a:hover,.archive-map a:focus-visible{background:var(--shell-accent,var(--grease));border-color:var(--shell-accent,var(--grease));color:var(--plaster,#fff);outline:none}
@media(max-width:780px){.archive-map{grid-template-columns:1fr 1fr}.archive-map__label{grid-column:1/-1}.archive-map a{min-height:48px}}
'''
write('assets/site-shell.css', shell)

root_map = '''<nav class="archive-map" aria-label="Archive paths">
  <span class="archive-map__label">Archive paths</span>
  <a href="./index.html">The wall</a><a href="./recognition.html">Recognition records</a><a href="./coverage.html">Coverage &amp; gaps</a><a href="./constellation.html">Evidence paths</a><a href="./data/archive.json">Machine archive</a>
</nav>'''
absolute_map = root_map.replace('./', '/undercast/')
record_map = root_map.replace('./', '../../')


def insert_map(path: str, markup: str) -> None:
    text = read(path)
    if 'class="archive-map"' in text:
        return
    if '</footer>' in text:
        text = text.replace('</footer>', markup + '\n</footer>', 1)
    elif '</body>' in text:
        text = text.replace('</body>', markup + '\n</body>', 1)
    else:
        raise SystemExit(f'{path} has no archive-map insertion boundary')
    write(path, text)


for path in ['index.html', 'recognition.html', 'coverage.html', 'constellation.html']:
    insert_map(path, root_map)
insert_map('404.html', absolute_map)

generator = read('scripts/build-record-pages.mjs')
if 'class="archive-map"' not in generator:
    if '</body></html>' in generator:
        generator = generator.replace('</body></html>', record_map + '\n</body></html>', 1)
    elif '</body>\n</html>' in generator:
        generator = generator.replace('</body>\n</html>', record_map + '\n</body>\n</html>', 1)
    else:
        raise SystemExit('record generator has no generated body boundary')
write('scripts/build-record-pages.mjs', generator)

write('scripts/lib/site-sweep.mjs', '''import { readFileSync, existsSync } from "node:fs";
import { normalizeCensusKey as normalize } from "../census-key.mjs";

export const PUBLIC_SURFACES=Object.freeze([
  {path:"index.html",kind:"wall"},{path:"recognition.html",kind:"recognition"},
  {path:"coverage.html",kind:"coverage"},{path:"constellation.html",kind:"constellation"},
  {path:"404.html",kind:"error"},
]);

export function wallSpeciesById(projection){
  const map=new Map();
  for(const taxon of projection.taxa||[])for(const record of taxon.wall_records||[]){
    const labels=map.get(record.id)||[];labels.push(taxon.label);map.set(record.id,[...new Set(labels)].sort());
  }
  return map;
}

export function validateSpeciesProjection({projection,index,specimens}){
  const errors=[];const byId=new Map(specimens.map(row=>[row.id,row]));const expected=wallSpeciesById(projection);
  for(const entry of index){const want=expected.get(entry.id)||[],got=[...(entry.sp||[])].sort();if(JSON.stringify(got)!==JSON.stringify(want))errors.push(`${entry.id} wall species ${got.join(",")||"none"}; expected ${want.join(",")||"none"}`);}
  for(const taxon of projection.taxa||[]){
    const filed=new Set((taxon.records||[]).map(row=>row.id));const primary=new Set((taxon.wall_records||[]).map(row=>row.id));
    for(const id of primary)if(!filed.has(id))errors.push(`${taxon.label} primary wall record ${id} is absent from filed records`);
    const primaryKeys=new Set((taxon.credits||[]).filter(row=>row.status==="primary-card").flatMap(row=>(row.wall_ids||[]).map(id=>`${id}|${normalize(row.character)}|${normalize(row.performer)}`)));
    for(const record of taxon.wall_records||[])for(const credit of record.credits||[]){
      const key=`${record.id}|${normalize(credit.character)}|${normalize(credit.performer)}`;
      if(!primaryKeys.has(key))errors.push(`${taxon.label} ${record.id} wall credit is not primary-card: ${credit.character} / ${credit.performer}`);
      if(!byId.has(record.id))errors.push(`${taxon.label} points at missing ${record.id}`);
    }
    for(const row of taxon.credits||[])if(!["primary-card","additional-performance","unfiled"].includes(row.status))errors.push(`${taxon.label} has unknown credit status ${row.status}`);
  }
  return errors;
}

export function validateSurfaceSources(root=process.cwd()){
  const errors=[];
  for(const surface of PUBLIC_SURFACES){
    const path=`${root}/${surface.path}`;if(!existsSync(path)){errors.push(`${surface.path} is missing`);continue;}
    const text=readFileSync(path,"utf8");
    if(!/site-tokens\\.css/.test(text))errors.push(`${surface.path} bypasses shared tokens`);
    if(!/site-shell\\.css/.test(text))errors.push(`${surface.path} bypasses shared shell`);
    if(!/class=["']archive-map["']/.test(text))errors.push(`${surface.path} lacks the shared archive map`);
  }
  for(const asset of ["assets/absence-character.svg","assets/absence-performer.svg","assets/absence-offline.svg"])if(!existsSync(`${root}/${asset}`))errors.push(`${asset} is missing`);
  for(const path of ["index.html","recognition.html","scripts/build-record-pages.mjs"]){
    const text=readFileSync(`${root}/${path}`,"utf8");
    for(const signature of ["reliefBase(","voiceGlyph(","NO CAST"])if(text.includes(signature))errors.push(`${path} retains retired fallback ${signature}`);
    if(!text.includes("assets/absence-character.svg")||!text.includes("assets/absence-performer.svg"))errors.push(`${path} does not consume both canonical absence plates`);
  }
  for(const path of ["recognition.html","scripts/build-record-pages.mjs"]){
    const text=readFileSync(`${root}/${path}`,"utf8");
    if(/taxon\\.records/.test(text))errors.push(`${path} still derives public species from person-level records`);
    if(!/taxon\\.wall_records/.test(text))errors.push(`${path} does not consume exact primary-role wall_records`);
    if(!/class=["']archive-map["']/.test(text))errors.push(`${path} lacks the shared archive-map contract`);
  }
  return errors;
}
''')

write('scripts/site-sweep.mjs', '''#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { validateSpeciesProjection,validateSurfaceSources,wallSpeciesById } from "./lib/site-sweep.mjs";
const load=path=>JSON.parse(readFileSync(path,"utf8"));
const projection=load("data/species.json"),index=load("data/index.json"),specimens=load("data/specimens.json");
const errors=[...validateSpeciesProjection({projection,index,specimens}),...validateSurfaceSources()];
if(errors.length){for(const error of errors)console.error(`site-sweep: ${error}`);process.exit(1);}
console.log(`site-sweep: PASS — ${index.length} wall records, ${wallSpeciesById(projection).size} exact species-tagged records, five root surfaces plus permanent records, canonical absence plates enforced`);
''')

write('scripts/site-sweep-fixtures.mjs', '''#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateSpeciesProjection,wallSpeciesById } from "./lib/site-sweep.mjs";
const leak={taxa:[{label:"Ferengi",records:[{id:"UC-004",credits:[{character:"Brunt",performer:"Jeffrey Combs"}]}],wall_records:[],credits:[{character:"Brunt",performer:"Jeffrey Combs",status:"additional-performance",wall_ids:["UC-004"]}]}]};
assert.deepEqual([...wallSpeciesById(leak)],[]);
assert(validateSpeciesProjection({projection:leak,index:[{id:"UC-004",sp:["Ferengi"]}],specimens:[{id:"UC-004",actor:"Jeffrey Combs",character:"Weyoun"}]}).some(error=>error.includes("UC-004 wall species")));
const exact={taxa:[{label:"Ferengi",records:[{id:"UC-019",credits:[{character:"Quark",performer:"Armin Shimerman"}]}],wall_records:[{id:"UC-019",credits:[{character:"Quark",performer:"Armin Shimerman"}]}],credits:[{character:"Quark",performer:"Armin Shimerman",status:"primary-card",wall_ids:["UC-019"]}]}]};
assert.deepEqual(validateSpeciesProjection({projection:exact,index:[{id:"UC-019",sp:["Ferengi"]}],specimens:[{id:"UC-019",actor:"Armin Shimerman",character:"Quark"}]}),[]);
console.log("site-sweep fixtures: PASS");
''')

package = json.loads(read('package.json'))
package['scripts']['site:sweep'] = 'node scripts/site-sweep.mjs'
package['scripts']['site:sweep:fixtures'] = 'node scripts/site-sweep-fixtures.mjs'
write('package.json', json.dumps(package, indent=2) + '\n')

gate = read('scripts/gate.mjs')
if 'id: "site-sweep"' not in gate:
    anchor = '{ id: "site-seams", label: "Validate public site seams", action: () => runNpmScript("Site seams", "test:site-seams") },'
    if anchor not in gate:
        raise SystemExit('scripts/gate.mjs site-seams anchor missing')
    gate = gate.replace(anchor, anchor + '\n  { id: "site-sweep", label: "Validate full-site role integrity and fallback design", action: () => { runNpmScript("Site sweep fixtures", "site:sweep:fixtures"); runNpmScript("Site sweep", "site:sweep"); } },', 1)
write('scripts/gate.mjs', gate)

test_path = 'tests/rendered/site.spec.mjs'
test = read(test_path)
if 'full-site sweep keeps species role-level' not in test:
    test = test.rstrip() + r'''

test("full-site sweep keeps species role-level on recognition and permanent records",async({page})=>{
  await open(page,"recognition.html#UC-004");
  await expect(page.locator('a[href*="species=Ferengi"]')).toHaveCount(0);
  await open(page,"recognition.html#UC-019");
  expect(await page.locator('a[href*="species=Ferengi"]').count()).toBeGreaterThan(0);
  await open(page,"records/UC-004/");
  await expect(page.locator('a[href*="species=Ferengi"]')).toHaveCount(0);
  await open(page,"records/UC-019/");
  expect(await page.locator('a[href*="species=Ferengi"]').count()).toBeGreaterThan(0);
});

test("full-site sweep uses canonical absence plates and connects every public surface",async({page})=>{
  await open(page,"index.html");await waitForWall(page);
  const missing=await page.evaluate(async()=>{const rows=await fetch("./data/specimens.json").then(r=>r.json());const row=rows.find(record=>!record.still||!record.portrait);return{id:row.id,missingStill:!row.still,missingPortrait:!row.portrait};});
  await open(page,`index.html#${missing.id}`);await waitForWall(page);
  const card=page.locator(`[data-uid="${missing.id}"]`);
  if(missing.missingStill)await expect(card.locator('img[src$="assets/absence-character.svg"]')).toHaveCount(1);
  if(missing.missingPortrait)await expect(card.locator('img[src$="assets/absence-performer.svg"]')).toHaveCount(1);
  await expect(card.locator('svg.portrait')).toHaveCount(0);
  for(const route of ["index.html","recognition.html","coverage.html","constellation.html","404.html","records/UC-019/"]){await open(page,route);await expect(page.locator(".archive-map")).toHaveCount(1);await expect(page.locator(".archive-map a")).toHaveCount(5);}
});
''' + '\n'
write(test_path, test)

write('docs/FULL-SITE-SWEEP.md', f'''# Full-site integrity and design sweep

PR #73 executes two independent sweeps over the public archive.

## Integrity sweep

Species is a property of the **displayed performer-role**, not the person record. The wall, Recognition, and generated permanent records consume `taxon.wall_records`; `taxon.records` and the complete `credits` ledger remain evidence/discovery surfaces for additional performances. The gate compares every lean-index species label to the exact primary-role projection and rejects person-level leakage.

Only `#UC-…` is a specimen hash namespace. Named document anchors remain navigation and must not clear query filters.

## Design sweep

The retired inline humanoid `reliefBase` / `voiceGlyph` fallbacks are removed. The canonical plates preserve the approved replacement artwork promoted from:

- character evidence: `{character_source}`
- performer evidence: `{performer_source}`

A third non-humanoid plate distinguishes an asset that is temporarily offline from evidence that was never acquired.

## Orphan reconciliation

Every public surface retains its legitimate page-specific layout but ends with one shared **Archive paths** map: wall, Recognition, Coverage, Evidence paths, and machine archive. This is secondary navigation, not a promotion of Constellations into the primary site shell. Shared tokens, shell, absence art, and archive map are enforced over all five root surfaces plus the permanent-record generator.
''')

readme = read('README.md')
line = '\nSite-wide role integrity, fallback-art, and orphan-surface contract: `docs/FULL-SITE-SWEEP.md`; enforce it with `npm run site:sweep`.\n'
if 'docs/FULL-SITE-SWEEP.md' not in readme:
    readme = readme.rstrip() + line
write('README.md', readme)

print(json.dumps({'character_source': character_source, 'performer_source': performer_source}, indent=2))
