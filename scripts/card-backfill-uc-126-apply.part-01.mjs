async function verifySourcePacket(control) {
  assert(SOURCE_ROOT, 'SOURCE_ROOT is required');
  const names = (await readdir(SOURCE_ROOT)).sort();
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-126 source packet file set drift: ${names.join(', ')}`);
  const map = {
    'manifest.json': control.expected.source_manifest, 'duplicate-scan.json': control.expected.source_duplicate_scan, 'review.json': control.expected.source_review_json, 'review.md': control.expected.source_review_md,
    'SHA256SUMS': control.expected.source_sums, 'exact-role-record.json': control.expected.exact_role_record,
    'bubbles-original.webp': control.expected.bubbles_source, 'timmy-original.webp': control.expected.timmy_source, 'harley-original.webp': control.expected.harley_source, 'twilight-original.webp': control.expected.twilight_source,
    'source-page-vanity-fair-tara-strong-roles.png': control.expected.vanity_page, 'source-page-dc-tara-strong-harley.png': control.expected.dc_page,
    'source-page-bubbles.png': control.expected.bubbles_page, 'source-page-timmy.png': control.expected.timmy_page, 'source-page-harley.png': control.expected.harley_page, 'source-page-twilight.png': control.expected.twilight_page,
    'source-wikitext-bubbles.txt': control.expected.bubbles_wikitext, 'source-wikitext-timmy.txt': control.expected.timmy_wikitext, 'source-wikitext-harley.txt': control.expected.harley_wikitext, 'source-wikitext-twilight.txt': control.expected.twilight_wikitext,
    'uc-126-still-candidate.jpg': control.expected.candidate, 'card-crop-preview.jpg': control.expected.crop_preview
  };
  for (const [name, expected] of Object.entries(map)) await verifyFile(name, expected);
  const sums = String(await readFile(join(SOURCE_ROOT, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length === expectedFiles.length - 1, 'source checksum row count drift');
  const sumNames = [];
  for (const line of sums) { const match = line.match(/^([0-9a-f]{64})  (.+)$/); assert(match, `malformed source checksum ${line}`); sumNames.push(match[2]); assert(sha(await readFile(join(SOURCE_ROOT, match[2]))) === match[1], `${match[2]} source checksum drift`); }
  assert(JSON.stringify(sumNames.sort()) === JSON.stringify(expectedFiles.filter(name => name !== 'SHA256SUMS').sort()), 'source checksum filename set drift');

  const manifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
  const review = await readJson(join(SOURCE_ROOT, 'review.json'));
  const role = await readJson(join(SOURCE_ROOT, 'exact-role-record.json'));
  const duplicates = await readJson(join(SOURCE_ROOT, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-126' && manifest.actor === 'Tara Strong' && manifest.character === 'Bubbles, Timmy, Harley & Twilight' && manifest.production === 'Powerpuff Girls / Fairly OddParents / etc.' && manifest.year === 1998 && manifest.side === 'still', 'source manifest identity drift');
  assert(manifest.custody?.discovery_artifact?.artifact_id === 8707338950 && manifest.custody?.discovery_artifact?.candidate_count === 30 && manifest.custody?.bubbles_probe_artifact?.artifact_id === 8707180738 && manifest.custody?.failed_discovery_checkpoints?.length === 6, 'source discovery custody drift');
  assert(manifest.actor_role_custody?.['vanity-fair-tara-strong-roles']?.page_screenshot?.sha256 === control.expected.vanity_page.sha256 && manifest.actor_role_custody?.['dc-tara-strong-harley']?.page_screenshot?.sha256 === control.expected.dc_page.sha256, 'source strict actor-role custody drift');
  assert(['paramount-timmy-turner','awn-tara-strong-bubbles','hasbro-twilight-sparkle'].every(key => manifest.actor_role_custody?.[key]?.reference_only === true && manifest.actor_role_custody?.[key]?.externally_verified === true), 'source reference-only actor-role custody drift');
  const roleExpected = { bubbles: control.expected.bubbles_source, timmy: control.expected.timmy_source, harley: control.expected.harley_source, twilight: control.expected.twilight_source };
  for (const [key, expected] of Object.entries(roleExpected)) {
    assert(manifest.roles?.[key]?.original?.sha256 === expected.sha256, `source ${key} image drift`);
    assert(manifest.roles?.[key]?.raw_revision?.sha256 === control.expected[`${key}_wikitext`].sha256, `source ${key} raw revision drift`);
  }
  assert(manifest.roles?.bubbles?.resolution_ruling?.includes('185x185') && manifest.chronology_boundary?.all_four_roles_required === true && manifest.chronology_boundary?.canonical_1998_is_bubbles_chronology_only === true, 'source resolution or chronology boundary drift');
  assert(manifest.exact_role_record?.sha256 === control.expected.exact_role_record.sha256, 'source exact-role receipt drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.candidate?.bytes === control.expected.candidate.bytes && manifest.candidate?.width === 1260 && manifest.candidate?.height === 1000, 'source candidate receipt drift');
  assert(manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256 && manifest.crop_preview?.bytes === control.expected.crop_preview.bytes && manifest.crop_preview?.width === 1246 && manifest.crop_preview?.height === 1000, 'source crop receipt drift');
  assert(review.source_sha256s?.bubbles === control.expected.bubbles_source.sha256 && review.source_sha256s?.timmy === control.expected.timmy_source.sha256 && review.source_sha256s?.harley === control.expected.harley_source.sha256 && review.source_sha256s?.twilight === control.expected.twilight_source.sha256 && review.exact_role_record_sha256 === control.expected.exact_role_record.sha256, 'source review source receipt drift');
  assert(review.candidate_sha256 === control.expected.candidate.sha256 && review.crop_preview_sha256 === control.expected.crop_preview.sha256, 'source review candidate drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.resolution_ruling === control.ruling.resolution_ruling && review.canonical_mutation === false, 'source review ruling drift');
  assert(role.record_id === 'UC-126' && role.actor === 'Tara Strong' && role.character === 'Bubbles, Timmy, Harley & Twilight', 'exact role record identity drift');
  for (const [key, expected] of Object.entries(roleExpected)) assert(role.roles?.[key]?.selected_image?.sha256 === expected.sha256, `exact role ${key} image drift`);
  assert(role.composite_boundary?.all_four_roles_required === true && role.composite_boundary?.selected_asset_count === 4 && role.composite_boundary?.selected_assets_byte_distinct === true && role.composite_boundary?.original_1998_bubbles_required === true && role.composite_boundary?.tara_strong_timmy_main_series_required === true && role.composite_boundary?.named_dc_super_hero_girls_harley_continuity_required === true && role.composite_boundary?.friendship_is_magic_twilight_required === true && role.composite_boundary?.canonical_1998_is_bubbles_chronology_only === true && role.canonical_mutation === false, 'exact role composite or chronology drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && duplicates.items.length === 6 && duplicates.items.every(item => Array.isArray(item.matches) && item.matches.length === 0), 'source duplicate boundary drift');
  for (const [name, exception] of Object.entries(control.immutable_source_exceptions || {})) {
    const text = await readFile(join(SOURCE_ROOT, name), 'utf8');
    assert(sha(Buffer.from(text, 'utf8')) === exception.sha256, `${name} source immutable hash drift`);
    assert(JSON.stringify(trailingWhitespaceLines(text)) === JSON.stringify(exception.trailing_whitespace_lines), `${name} source whitespace ledger drift`);
  }
  return { manifest, review, role, duplicates };
}

async function materialize() {
  const control = await loadControl();
  const source = await verifySourcePacket(control);
  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });
  for (const file of expectedFiles) await copyFile(join(SOURCE_ROOT, file), join(DEST, file));
  await writeJson(join(DEST, 'duplicate-scan.json'), { ...source.duplicates, reviewed_at: control.reviewed_at, reviewed_by: control.reviewed_by, status: 'pass', semantics: 'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.' });
  await writeJson(join(DEST, 'manifest.json'), {
    ...source.manifest, reviewed_at: control.reviewed_at, reviewed_by: control.reviewed_by, reviewed_role: control.reviewed_role,
    custody: { ...source.manifest.custody, render_artifact: control.render_artifact, apply_control_sha256: sha(await readFile(CONTROL)), source_manifest_sha256: control.expected.source_manifest.sha256, source_sums_sha256: control.expected.source_sums.sha256 },
    duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: 2070, status: 'pass' },
    exact_subject_review: { identity: control.ruling.identity, presentation: control.ruling.presentation, crop_ruling: control.ruling.crop_ruling, chronology_ruling: control.ruling.chronology_ruling, resolution_ruling: control.ruling.resolution_ruling, notes: control.ruling.notes },
    disposition: control.ruling.candidate_disposition, canonical_mutation: false
  });
  await writeJson(join(DEST, 'review.json'), {
    ...source.review, reviewed_at: control.reviewed_at, reviewed_by: control.reviewed_by, reviewed_role: control.reviewed_role,
    identity_ruling: control.ruling.identity, presentation_ruling: control.ruling.presentation, crop_ruling: control.ruling.crop_ruling, chronology_ruling: control.ruling.chronology_ruling, resolution_ruling: control.ruling.resolution_ruling,
    canonical_mutation: false, disposition: control.ruling.candidate_disposition, notes: control.ruling.notes
  });
  const repository = await repositoryHashes();
  const repositoryCount = process.env.REPOSITORY_HASH_COUNT_OVERRIDE ? Number(process.env.REPOSITORY_HASH_COUNT_OVERRIDE) : repository.size;
  assert(repositoryCount === 2070, `repository hash denominator drift ${repositoryCount}`);
  for (const hash of [control.expected.bubbles_source.sha256, control.expected.timmy_source.sha256, control.expected.harley_source.sha256, control.expected.twilight_source.sha256, control.expected.candidate.sha256, control.expected.crop_preview.sha256]) assert(!(repository.get(hash) || []).length, `authorized evidence duplicates canonical media: ${(repository.get(hash) || []).join(', ')}`);
  const sums = [];
  for (const file of expectedFiles.filter(name => name !== 'SHA256SUMS')) sums.push(`${sha(await readFile(join(DEST, file)))}  ${file}`);
  await writeFile(join(DEST, 'SHA256SUMS'), sums.join('\n') + '\n');
  await validate();
  console.log(`MATERIALIZED ${DEST}: ${expectedFiles.length} reviewed evidence files`);
  console.log(`candidate ${control.expected.candidate.sha256}`);
  console.log(`crop ${control.expected.crop_preview.sha256}`);
  console.log('1998 Bubbles chronology remains separate from Timmy, Harley, and Twilight');
  console.log('controlled 185x185 historical Bubbles source enlargement retained');
  console.log('canonical mutation false');
}

