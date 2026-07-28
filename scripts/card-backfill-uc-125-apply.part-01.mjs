  const sumNames = [];
  for (const line of sums) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match, `malformed source checksum ${line}`);
    sumNames.push(match[2]);
    assert(sha(await readFile(join(SOURCE_ROOT, match[2]))) === match[1], `${match[2]} source checksum drift`);
  }
  assert(JSON.stringify(sumNames.sort()) === JSON.stringify(expectedFiles.filter(name => name !== 'SHA256SUMS').sort()), 'source checksum filename set drift');

  const manifest = await readJson(join(SOURCE_ROOT, 'manifest.json'));
  const review = await readJson(join(SOURCE_ROOT, 'review.json'));
  const role = await readJson(join(SOURCE_ROOT, 'exact-role-record.json'));
  const duplicates = await readJson(join(SOURCE_ROOT, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-125' && manifest.actor === 'Billy West' && manifest.character === 'Ren, Stimpy & Fry' && manifest.production === 'Ren & Stimpy / Futurama' && manifest.year === 1991 && manifest.side === 'still', 'source manifest identity drift');
  assert(manifest.custody?.discovery_artifact?.artifact_id === 8705524655 && manifest.custody?.discovery_artifact?.candidate_count === control.expected.discovery_candidate_count, 'source discovery custody drift');
  assert(manifest.actor_role_custody?.['billy-west-current-official']?.page_screenshot?.sha256 === control.expected.current_official_page.sha256 && manifest.actor_role_custody?.['billy-west-role-history']?.page_screenshot?.sha256 === control.expected.role_history_page.sha256 && manifest.actor_role_custody?.['paramount-ren-stimpy']?.page_screenshot?.sha256 === control.expected.paramount_page.sha256 && manifest.actor_role_custody?.['hulu-futurama']?.page_screenshot?.sha256 === control.expected.hulu_page.sha256, 'source actor-role custody drift');
  assert(manifest.roles?.ren?.original?.sha256 === control.expected.ren_source.sha256 && manifest.roles?.ren?.generic_width_floor_exception === true, 'source Ren role drift');
  assert(manifest.roles?.stimpy?.original?.sha256 === control.expected.stimpy_source.sha256 && manifest.roles?.stimpy?.generic_width_floor_exception === true, 'source Stimpy role drift');
  assert(manifest.roles?.fry?.original?.sha256 === control.expected.fry_source.sha256 && manifest.roles?.fry?.generic_width_floor_exception === true, 'source Fry role drift');
  assert(manifest.chronology_boundary?.ren_1993_takeover_boundary_required === true && manifest.chronology_boundary?.stimpy_1991_role_boundary_required === true && manifest.chronology_boundary?.fry_1999_role_boundary_required === true && manifest.chronology_boundary?.canonical_1991_is_ren_and_stimpy_chronology_not_fry_debut === true && manifest.chronology_boundary?.official_source_width_exceptions === 3, 'source chronology or width boundary drift');
  assert(manifest.exact_role_record?.sha256 === control.expected.exact_role_record.sha256, 'source exact-role receipt drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.candidate?.bytes === control.expected.candidate.bytes && manifest.candidate?.width === 1260 && manifest.candidate?.height === 1000, 'source candidate receipt drift');
  assert(manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256 && manifest.crop_preview?.bytes === control.expected.crop_preview.bytes && manifest.crop_preview?.width === 1246 && manifest.crop_preview?.height === 1000, 'source crop receipt drift');
  assert(review.source_sha256s?.ren === control.expected.ren_source.sha256 && review.source_sha256s?.stimpy === control.expected.stimpy_source.sha256 && review.source_sha256s?.fry === control.expected.fry_source.sha256 && review.exact_role_record_sha256 === control.expected.exact_role_record.sha256, 'source review source receipt drift');
  assert(review.candidate_sha256 === control.expected.candidate.sha256 && review.crop_preview_sha256 === control.expected.crop_preview.sha256, 'source review candidate drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.floor_exception_ruling === control.ruling.floor_exception_ruling && review.canonical_mutation === false, 'source review ruling drift');
  assert(role.record_id === 'UC-125' && role.actor === 'Billy West' && role.character === 'Ren, Stimpy & Fry' && role.roles?.ren?.selected_image_sha256 === control.expected.ren_source.sha256 && role.roles?.stimpy?.selected_image_sha256 === control.expected.stimpy_source.sha256 && role.roles?.fry?.selected_image_sha256 === control.expected.fry_source.sha256, 'exact role record drift');
  assert(role.composite_boundary?.all_three_roles_required === true && role.composite_boundary?.selected_asset_count === 3 && role.composite_boundary?.selected_assets_byte_distinct === true && role.composite_boundary?.ren_1993_takeover_boundary_required === true && role.composite_boundary?.stimpy_1991_role_boundary_required === true && role.composite_boundary?.fry_1999_role_boundary_required === true && role.composite_boundary?.canonical_1991_is_ren_and_stimpy_chronology_not_fry_debut === true && role.composite_boundary?.official_source_width_exceptions === 3 && role.canonical_mutation === false, 'exact role composite, chronology, or width drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && (duplicates.items || []).length === 5 && duplicates.items.every(item => Array.isArray(item.matches) && item.matches.length === 0), 'source duplicate boundary drift');
  return { manifest, review, role, duplicates };
}

async function materialize() {
  const control = await loadControl();
  const source = await verifySourcePacket(control);
  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });
  for (const file of expectedFiles) await copyFile(join(SOURCE_ROOT, file), join(DEST, file));

  const duplicateScan = {
    ...source.duplicates,
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    status: 'pass',
    semantics: 'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'
  };
  await writeJson(join(DEST, 'duplicate-scan.json'), duplicateScan);
  const manifest = {
    ...source.manifest,
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    reviewed_role: control.reviewed_role,
    custody: {
      ...source.manifest.custody,
      render_artifact: control.render_artifact,
      apply_control_sha256: sha(await readFile(CONTROL)),
      source_manifest_sha256: control.expected.source_manifest.sha256,
      source_sums_sha256: control.expected.source_sums.sha256
    },
    duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: duplicateScan.repository_hash_count, status: 'pass' },
    exact_subject_review: {
      identity: control.ruling.identity,
      presentation: control.ruling.presentation,
      crop_ruling: control.ruling.crop_ruling,
      chronology_ruling: control.ruling.chronology_ruling,
      floor_exception_ruling: control.ruling.floor_exception_ruling,
      notes: control.ruling.notes
    },
    disposition: control.ruling.candidate_disposition,
    canonical_mutation: false
  };
  await writeJson(join(DEST, 'manifest.json'), manifest);
  const review = {
    ...source.review,
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    reviewed_role: control.reviewed_role,
    identity_ruling: control.ruling.identity,
    presentation_ruling: control.ruling.presentation,
    crop_ruling: control.ruling.crop_ruling,
    chronology_ruling: control.ruling.chronology_ruling,
    floor_exception_ruling: control.ruling.floor_exception_ruling,
    canonical_mutation: false,
    disposition: control.ruling.candidate_disposition,
    notes: control.ruling.notes
  };
  await writeJson(join(DEST, 'review.json'), review);

  const repository = await repositoryHashes();
  const repositoryCount = process.env.REPOSITORY_HASH_COUNT_OVERRIDE ? Number(process.env.REPOSITORY_HASH_COUNT_OVERRIDE) : repository.size;
  assert(repositoryCount === control.expected.duplicate_repository_hash_count, `repository hash denominator drift ${repositoryCount}`);
  for (const hash of [control.expected.ren_source.sha256, control.expected.stimpy_source.sha256, control.expected.fry_source.sha256, control.expected.candidate.sha256, control.expected.crop_preview.sha256]) {
    assert(!(repository.get(hash) || []).length, `authorized evidence duplicates canonical media: ${(repository.get(hash) || []).join(', ')}`);
  }
  const sums = [];
  for (const file of expectedFiles.filter(name => name !== 'SHA256SUMS')) sums.push(`${sha(await readFile(join(DEST, file)))}  ${file}`);
  await writeFile(join(DEST, 'SHA256SUMS'), sums.join('\n') + '\n');
  await validate();
  console.log(`MATERIALIZED ${DEST}: ${expectedFiles.length} reviewed evidence files`);
  console.log(`candidate ${control.expected.candidate.sha256}`);
  console.log(`crop ${control.expected.crop_preview.sha256}`);
  console.log('1991 Ren & Stimpy chronology remains separate from the 1993 Ren takeover and 1999 Fry debut');
  console.log('three explicit 240-pixel official-source width exceptions retained');
  console.log('canonical mutation false');
}
