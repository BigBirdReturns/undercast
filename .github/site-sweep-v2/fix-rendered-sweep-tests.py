from pathlib import Path
import re

path = Path('tests/rendered/site.spec.mjs')
text = path.read_text('utf-8')

role_test = r'''test("full-site sweep keeps species role-level on recognition and permanent records",async\(\{page\}\)=>\{.*?\n\}\);'''
role_replacement = '''test("full-site sweep keeps species role-level on recognition and permanent records",async({page})=>{
  await open(page,"recognition.html#UC-004");
  await expect(page.locator("#record-title")).toHaveText("Weyoun");
  await expect(page.locator('a[href*="species=Ferengi"]')).toHaveCount(0);
  await open(page,"recognition.html#UC-019");
  await expect(page.locator("#record-title")).toHaveText("Quark");
  expect(await page.locator('a[href*="species=Ferengi"]').count()).toBeGreaterThan(0);
  await open(page,"records/UC-004/");
  await expect(page.locator("h1")).toHaveText("Weyoun");
  await expect(page.locator('a[href*="species=Ferengi"]')).toHaveCount(0);
  await open(page,"records/UC-019/");
  await expect(page.locator("h1")).toHaveText("Quark");
  expect(await page.locator('a[href*="species=Ferengi"]').count()).toBeGreaterThan(0);
});'''
text, count = re.subn(role_test, role_replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'role-level rendered test replacement count {count}')

absence_test = r'''test\("full-site sweep uses canonical absence plates and connects every public surface",async\(\{page\}\)=>\{.*?\n\}\);'''
absence_replacement = '''test("full-site sweep uses canonical absence plates and connects every public surface",async({page})=>{
  await open(page,"index.html");await waitForWall(page);
  const missing=await page.evaluate(async()=>{const rows=await fetch("./data/specimens.json").then(r=>r.json());const row=rows.find(record=>!record.still||!record.portrait);return{id:row.id,missingStill:!row.still,missingPortrait:!row.portrait};});
  await open(page,`index.html#${missing.id}`);
  const card=page.locator(`[data-uid="${missing.id}"]`);
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute("data-flipped","true");
  if(missing.missingStill){await expect(card.locator('.face.front picture.absence-plate img[src$="assets/placeholder-light-clean.png"]')).toHaveCount(1);await expect(card.locator('.face.front picture.absence-plate source[srcset$="assets/placeholder-dark-clean.png"]')).toHaveCount(1);}
  if(missing.missingPortrait){await expect(card.locator('.face.back picture.absence-plate img[src$="assets/placeholder-light-clean.png"]')).toHaveCount(1);await expect(card.locator('.face.back picture.absence-plate source[srcset$="assets/placeholder-dark-clean.png"]')).toHaveCount(1);}
  await expect(card.locator('svg.portrait')).toHaveCount(0);
  for(const route of ["index.html","recognition.html","coverage.html","constellation.html","404.html","records/UC-019/"]){await open(page,route);await expect(page.locator(".archive-map")).toHaveCount(1);await expect(page.locator(".archive-map a")).toHaveCount(5);}
});'''
text, count = re.subn(absence_test, absence_replacement, text, count=1, flags=re.S)
if count != 1:
    raise SystemExit(f'absence rendered test replacement count {count}')

path.write_text(text.rstrip() + '\n', encoding='utf-8')
print('made full-site rendered regressions wait for the state they assert')
