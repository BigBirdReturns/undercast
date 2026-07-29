async function validate() {
  const control = await loadControl();
  const names = (await readdir(DEST)).sort();
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `permanent file set drift: ${names.join(', ')}`);
  const sums = String(await readFile(join(DEST, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length === expectedFiles.length - 1, 'permanent checksum row count drift');
  const sumNames = [];
  for (const line of sums) { const match = line.match(/^([0-9a-f]{64})  (.+)$/); assert(match, `malformed permanent checksum ${line}`); sumNames.push(match[2]); assert(sha(await readFile(join(DEST, match[2]))) === match[1], `${match[2]} permanent checksum drift`); }
  assert(JSON.stringify(sumNames.sort()) === JSON.stringify(expectedFiles.filter(name => name !== 'SHA256SUMS').sort()), 'permanent checksum filename set drift');
  const manifest = await readJson(join(DEST, 'manifest.json'));
  const review = await readJson(join(DEST, 'review.json'));
  const role = await readJson(join(DEST, 'exact-role-record.json'));
  const duplicates = await readJson(join(DEST, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-126' && manifest.actor === 'Tara Strong' && manifest.character === 'Bubbles, Timmy, Harley & Twilight' && manifest.production === 'Powerpuff Girls / Fairly OddParents / etc.' && manifest.year === 1998 && manifest.side === 'still', 'permanent manifest identity drift');
  assert(manifest.custody?.render_artifact?.artifact_id === control.render_artifact.artifact_id && manifest.custody?.render_artifact?.zip_sha256 === control.render_artifact.zip_sha256, 'permanent render custody drift');
  assert(manifest.custody?.apply_control_sha256 === sha(await readFile(CONTROL)), 'permanent apply control receipt drift');
  assert(manifest.custody?.source_manifest_sha256 === control.expected.source_manifest.sha256 && manifest.custody?.source_sums_sha256 === control.expected.source_sums.sha256, 'permanent source custody drift');
  for (const [key, expected] of Object.entries({ bubbles: control.expected.bubbles_source, timmy: control.expected.timmy_source, harley: control.expected.harley_source, twilight: control.expected.twilight_source })) assert(manifest.roles?.[key]?.original?.sha256 === expected.sha256, `permanent ${key} source drift`);
  assert(manifest.roles?.bubbles?.resolution_ruling?.includes('185x185'), 'permanent Bubbles resolution ruling drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256, 'permanent candidate drift');
  assert(manifest.chronology_boundary?.all_four_roles_required === true && manifest.chronology_boundary?.selected_asset_count === 4 && manifest.chronology_boundary?.original_1998_bubbles_required === true && manifest.chronology_boundary?.tara_strong_timmy_main_series_required === true && manifest.chronology_boundary?.named_dc_super_hero_girls_harley_continuity_required === true && manifest.chronology_boundary?.friendship_is_magic_twilight_required === true && manifest.chronology_boundary?.canonical_1998_is_bubbles_chronology_only === true, 'permanent chronology boundary drift');
  assert(manifest.exact_subject_review?.identity === control.ruling.identity && manifest.exact_subject_review?.presentation === control.ruling.presentation && manifest.exact_subject_review?.crop_ruling === control.ruling.crop_ruling && manifest.exact_subject_review?.chronology_ruling === control.ruling.chronology_ruling && manifest.exact_subject_review?.resolution_ruling === control.ruling.resolution_ruling && manifest.canonical_mutation === false, 'permanent review boundary drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.resolution_ruling === control.ruling.resolution_ruling && review.canonical_mutation === false, 'permanent review drift');
  assert(role.composite_boundary?.all_four_roles_required === true && role.composite_boundary?.selected_asset_count === 4 && role.composite_boundary?.original_1998_bubbles_required === true && role.composite_boundary?.tara_strong_timmy_main_series_required === true && role.composite_boundary?.named_dc_super_hero_girls_harley_continuity_required === true && role.composite_boundary?.friendship_is_magic_twilight_required === true && role.composite_boundary?.canonical_1998_is_bubbles_chronology_only === true && role.canonical_mutation === false, 'permanent exact-role boundary drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && duplicates.items.length === 6 && duplicates.items.every(item => item.matches.length === 0), 'permanent duplicate boundary drift');
  for (const [name, exception] of Object.entries(control.immutable_source_exceptions || {})) {
    const text = await readFile(join(DEST, name), 'utf8');
    assert(sha(Buffer.from(text, 'utf8')) === exception.sha256, `${name} permanent immutable hash drift`);
    assert(JSON.stringify(trailingWhitespaceLines(text)) === JSON.stringify(exception.trailing_whitespace_lines), `${name} permanent whitespace ledger drift`);
  }
  console.log(`VALIDATED ${DEST}`);
  console.log(`manifest ${sha(await readFile(join(DEST, 'manifest.json')))}`);
  console.log(`sums ${sha(await readFile(join(DEST, 'SHA256SUMS')))}`);
}

if (command === 'materialize') await materialize();
else if (command === 'validate') await validate();
else throw new Error(`unknown command ${command}`);
