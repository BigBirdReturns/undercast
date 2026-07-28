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
  assert(manifest.record_id === 'UC-124' && manifest.actor === 'James Earl Jones' && manifest.character === 'Mufasa (and Darth Vader)' && manifest.production === 'The Lion King / Star Wars' && manifest.year === 1994 && manifest.side === 'still', 'source manifest identity drift');
  assert(manifest.custody?.discovery_artifact?.artifact_id === 8701028244 && manifest.custody?.discovery_artifact?.candidate_count === control.expected.discovery_candidate_count && manifest.custody?.failed_discovery_checkpoints?.length === control.expected.failed_discovery_count, 'source discovery custody drift');
  assert(manifest.actor_role_custody?.['disney-remembering-james-earl-jones']?.page_screenshot?.sha256 === control.expected.disney_actor_page.sha256 && manifest.actor_role_custody?.['starwars-james-earl-jones-vader']?.page_screenshot?.sha256 === control.expected.starwars_actor_page.sha256 && manifest.actor_role_custody?.['d23-lion-king-1994-film']?.page_screenshot?.sha256 === control.expected.d23_film_page.sha256, 'source actor-role custody drift');
  assert(manifest.shared_role_page?.page_screenshot?.sha256 === control.expected.d23_role_page.sha256, 'source shared role-page custody drift');
  assert(manifest.roles?.mufasa?.original?.sha256 === control.expected.mufasa_source.sha256 && manifest.roles?.mufasa?.source_link_id === 44, 'source Mufasa role drift');
  assert(manifest.roles?.vader?.original?.sha256 === control.expected.vader_source.sha256 && manifest.roles?.vader?.source_link_id === 45, 'source Vader role drift');
  assert(manifest.identity_boundary?.voice_and_physical_embodiment_separate === true && manifest.identity_boundary?.darth_vader_frame_must_not_imply_jones_suit_occupancy === true && manifest.identity_boundary?.canonical_1994_is_lion_king_chronology_not_vader_debut === true, 'source chronology or embodiment boundary drift');
  assert(manifest.exact_role_record?.sha256 === control.expected.exact_role_record.sha256, 'source exact-role receipt drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.candidate?.bytes === control.expected.candidate.bytes && manifest.candidate?.width === 1260 && manifest.candidate?.height === 1000, 'source candidate receipt drift');
  assert(manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256 && manifest.crop_preview?.bytes === control.expected.crop_preview.bytes && manifest.crop_preview?.width === 1246 && manifest.crop_preview?.height === 1000, 'source crop receipt drift');
  assert(review.source_sha256s?.mufasa === control.expected.mufasa_source.sha256 && review.source_sha256s?.vader === control.expected.vader_source.sha256 && review.exact_role_record_sha256 === control.expected.exact_role_record.sha256, 'source review source receipt drift');
  assert(review.candidate_sha256 === control.expected.candidate.sha256 && review.crop_preview_sha256 === control.expected.crop_preview.sha256, 'source review candidate drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.embodiment_ruling === control.ruling.embodiment_ruling && review.canonical_mutation === false, 'source review ruling drift');
  assert(role.record_id === 'UC-124' && role.actor === 'James Earl Jones' && role.character === 'Mufasa (and Darth Vader)' && role.roles?.mufasa?.selected_image_sha256 === control.expected.mufasa_source.sha256 && role.roles?.vader?.selected_image_sha256 === control.expected.vader_source.sha256, 'exact role record drift');
  assert(role.composite_boundary?.both_roles_required === true && role.composite_boundary?.selected_asset_count === 2 && role.composite_boundary?.selected_assets_byte_distinct === true && role.composite_boundary?.voice_and_physical_embodiment_separate === true && role.composite_boundary?.darth_vader_frame_must_not_imply_jones_suit_occupancy === true && role.composite_boundary?.canonical_1994_is_lion_king_chronology_not_vader_debut === true && role.canonical_mutation === false, 'exact role composite, chronology, or embodiment drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && (duplicates.items || []).length === 4 && duplicates.items.every(item => Array.isArray(item.matches) && item.matches.length === 0), 'source duplicate boundary drift');
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
      embodiment_ruling: control.ruling.embodiment_ruling,
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
    embodiment_ruling: control.ruling.embodiment_ruling,
    canonical_mutation: false,
    disposition: control.ruling.candidate_disposition,
    notes: control.ruling.notes
  };
  await writeJson(join(DEST, 'review.json'), review);

  const repository = await repositoryHashes();
  const repositoryCount = process.env.REPOSITORY_HASH_COUNT_OVERRIDE ? Number(process.env.REPOSITORY_HASH_COUNT_OVERRIDE) : repository.size;
  assert(repositoryCount === control.expected.duplicate_repository_hash_count, `repository hash denominator drift ${repositoryCount}`);
  for (const hash of [control.expected.mufasa_source.sha256, control.expected.vader_source.sha256, control.expected.candidate.sha256, control.expected.crop_preview.sha256]) {
    assert(!(repository.get(hash) || []).length, `authorized evidence duplicates canonical media: ${(repository.get(hash) || []).join(', ')}`);
  }
  const sums = [];
  for (const file of expectedFiles.filter(name => name !== 'SHA256SUMS')) sums.push(`${sha(await readFile(join(DEST, file)))}  ${file}`);
  await writeFile(join(DEST, 'SHA256SUMS'), sums.join('\n') + '\n');
  await validate();
  console.log(`MATERIALIZED ${DEST}: ${expectedFiles.length} reviewed evidence files`);
  console.log(`candidate ${control.expected.candidate.sha256}`);
  console.log(`crop ${control.expected.crop_preview.sha256}`);
  console.log('1994 Lion King chronology remains separate from Darth Vader history');
  console.log('James Earl Jones voice remains separate from Vader suit occupancy');
  console.log('canonical mutation false');
}

async function validate() {
  const control = await loadControl();
  const names = (await readdir(DEST)).sort();
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `permanent file set drift: ${names.join(', ')}`);
  const sums = String(await readFile(join(DEST, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length === expectedFiles.length - 1, 'permanent checksum row count drift');
  const sumNames = [];
  for (const line of sums) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
