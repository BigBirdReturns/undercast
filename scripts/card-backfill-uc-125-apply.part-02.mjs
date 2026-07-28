async function validate() {
  const control = await loadControl();
  const names = (await readdir(DEST)).sort();
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `permanent file set drift: ${names.join(', ')}`);
  const sums = String(await readFile(join(DEST, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length === expectedFiles.length - 1, 'permanent checksum row count drift');
  const sumNames = [];
  for (const line of sums) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match, `malformed permanent checksum ${line}`);
    sumNames.push(match[2]);
    assert(sha(await readFile(join(DEST, match[2]))) === match[1], `${match[2]} permanent checksum drift`);
  }
  assert(JSON.stringify(sumNames.sort()) === JSON.stringify(expectedFiles.filter(name => name !== 'SHA256SUMS').sort()), 'permanent checksum filename set drift');
  const manifest = await readJson(join(DEST, 'manifest.json'));
  const review = await readJson(join(DEST, 'review.json'));
  const role = await readJson(join(DEST, 'exact-role-record.json'));
  const duplicates = await readJson(join(DEST, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-125' && manifest.actor === 'Billy West' && manifest.character === 'Ren, Stimpy & Fry' && manifest.production === 'Ren & Stimpy / Futurama' && manifest.year === 1991 && manifest.side === 'still', 'permanent manifest identity drift');
  assert(manifest.custody?.render_artifact?.artifact_id === control.render_artifact.artifact_id && manifest.custody?.render_artifact?.zip_sha256 === control.render_artifact.zip_sha256, 'permanent render custody drift');
  assert(manifest.custody?.apply_control_sha256 === sha(await readFile(CONTROL)), 'permanent apply control receipt drift');
  assert(manifest.custody?.source_manifest_sha256 === control.expected.source_manifest.sha256 && manifest.custody?.source_sums_sha256 === control.expected.source_sums.sha256, 'permanent source custody drift');
  assert(manifest.roles?.ren?.original?.sha256 === control.expected.ren_source.sha256 && manifest.roles?.stimpy?.original?.sha256 === control.expected.stimpy_source.sha256 && manifest.roles?.fry?.original?.sha256 === control.expected.fry_source.sha256, 'permanent selected source drift');
  assert(manifest.roles.ren.generic_width_floor_exception === true && manifest.roles.stimpy.generic_width_floor_exception === true && manifest.roles.fry.generic_width_floor_exception === true, 'permanent source-width exception drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256, 'permanent candidate drift');
  assert(manifest.chronology_boundary?.ren_1993_takeover_boundary_required === true && manifest.chronology_boundary?.stimpy_1991_role_boundary_required === true && manifest.chronology_boundary?.fry_1999_role_boundary_required === true && manifest.chronology_boundary?.canonical_1991_is_ren_and_stimpy_chronology_not_fry_debut === true && manifest.chronology_boundary?.official_source_width_exceptions === 3, 'permanent chronology or width boundary drift');
  assert(manifest.exact_subject_review?.identity === control.ruling.identity && manifest.exact_subject_review?.presentation === control.ruling.presentation && manifest.exact_subject_review?.crop_ruling === control.ruling.crop_ruling && manifest.exact_subject_review?.chronology_ruling === control.ruling.chronology_ruling && manifest.exact_subject_review?.floor_exception_ruling === control.ruling.floor_exception_ruling && manifest.canonical_mutation === false, 'permanent review boundary drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.floor_exception_ruling === control.ruling.floor_exception_ruling && review.canonical_mutation === false, 'permanent review drift');
  assert(role.composite_boundary?.all_three_roles_required === true && role.composite_boundary?.selected_asset_count === 3 && role.composite_boundary?.ren_1993_takeover_boundary_required === true && role.composite_boundary?.stimpy_1991_role_boundary_required === true && role.composite_boundary?.fry_1999_role_boundary_required === true && role.composite_boundary?.canonical_1991_is_ren_and_stimpy_chronology_not_fry_debut === true && role.composite_boundary?.official_source_width_exceptions === 3 && role.canonical_mutation === false, 'permanent exact-role boundary drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && duplicates.items.length === 5 && duplicates.items.every(item => item.matches.length === 0), 'permanent duplicate boundary drift');
  console.log(`VALIDATED ${DEST}`);
  console.log(`manifest ${sha(await readFile(join(DEST, 'manifest.json')))}`);
  console.log(`sums ${sha(await readFile(join(DEST, 'SHA256SUMS')))}`);
}

if (command === 'materialize') await materialize();
else if (command === 'validate') await validate();
else throw new Error(`unknown command ${command}`);
