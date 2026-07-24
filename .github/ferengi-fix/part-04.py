test("Ferengi URL preserves the makers anchor and shows only exact displayed roles plus the complete source ledger",async({page})=>{
  await open(page,"index.html?shelf=Star+Trek&species=Ferengi#makers");
  await waitForWall(page);
  await expect(page).toHaveURL(/shelf=Star\+Trek&species=Ferengi#makers$/);
  await expect(page.getByRole("button",{name:"Star Trek",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:"Ferengi",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#result-status")).toHaveText("14 specimens match; 14 shown.");
  const names=await page.locator(".charname").allTextContents();
  expect(names).toEqual(["Quark","Rom","Nog","Quark (mirror)","Brunt (mirror)","Nog (mirror)","Ishka","Bok / Gral / Prak","Krax","DaiMon Lurin","Grimp","Leck","Pel","Berik"]);
  expect(names).not.toContain("Weyoun");
  expect(names).not.toContain("Neelix");
  await expect(page.locator("#speciesContext")).toContainText("70 captured named credits");
  await expect(page.locator("#speciesContext")).toContainText("16 additional performances on file");
  await expect(page.locator("#speciesLedger > li")).toHaveCount(70);
  await expect(page.locator("#makers")).toBeInViewport();
});
'''
if 'Ferengi URL preserves the makers anchor' not in test:
    write(test_path,test.rstrip()+append.rstrip()+'\n')

# README taxonomy contract.
replace_once(
    'README.md',
    '`data/vocabularies/species.json` maps an exact census category to its singular\ndisplay label; `scripts/build-species.mjs` joins those source rows to exact filed\nperformer-role records and publishes `data/species.json`. The wall\'s species\nfilter, card links, focused-record rail and permanent pages all consume that\nprojection. They never classify a role because “Klingon” or “Ferengi” happened\nto appear in reveal prose. The first durable taxa are Klingon and Ferengi; a new\ntaxon is added only when its source category has been captured and retained.\n',
    '`data/vocabularies/species.json` maps an exact census category to its singular\ndisplay label; `scripts/build-species.mjs` joins those source rows to exact filed\nperformer-role records and publishes `data/species.json`. The wall facet uses only\n`wall_records`: cards whose **displayed primary role** belongs to the taxon. A\nperformer\'s additional roles remain visible in the complete source-backed credit\nledger but cannot relabel an unrelated primary card. Source-backed `roleAliases`\nhandle equivalent primary labels such as `DaiMon Lurin` / `Lurin`; all-component\ncomposite cards are accepted only when every displayed role resolves exactly. The\nfirst durable taxa are Klingon and Ferengi; a new taxon is added only when its\nsource category has been captured and retained.\n',
)

# Handoff note; exact queue counts are reconciled after Autopilot sync in the workflow.
handoff=read('HANDOFF.md')
marker='## Exact species-role navigation\n'
section='''## Exact species-role navigation\n\nSpecies filters classify the **displayed primary card role**, never the performer as\na whole. `data/species.json` separately retains every captured named credit as a\nprimary card, an additional performance on file, or an unfiled role. Normal named\nanchors such as `#makers` must preserve URL filters; only `#UC-…` hashes may invoke\ncard focus and clear an incompatible view.\n\nThe retained Ferengi scope currently contains 70 named credits: 16 primary-card\ncredits across 14 illustrated cards, 16 additional performances on file, and 38\nunfiled named credits, plus eight source pages without a named performer.\n\n'''
if marker not in handoff:
    insert_at=handoff.find('## Rolling gold waterline')
    if insert_at<0: raise SystemExit('HANDOFF insertion marker missing')
    handoff=handoff[:insert_at]+section+handoff[insert_at:]
write('HANDOFF.md',handoff)

print('applied permanent Ferengi role-filter source changes')
