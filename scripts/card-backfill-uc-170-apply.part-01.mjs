async function validatePermanent(control) {
  const expectedNames = Object.keys(control.expected_files).sort();
  const names = (await readdir(DEST)).sort();
  assert(JSON.stringify(names) === JSON.stringify(expectedNames), `UC-170 permanent file set drift: ${names.join(', ')}`);
  await verifyChecksums(DEST, expectedNames, control.denominators.checksum_row_count);
  for (const name of expectedNames.filter(name => !['manifest.json','review.json','duplicate-scan.json','SHA256SUMS'].includes(name))) {
    await verifyFile(DEST, name, exactExpected(control, name));
  }
  const manifest = await readJson(join(DEST, 'manifest.json'));
  const review = await readJson(join(DEST, 'review.json'));
  const voice = await readJson(join(DEST, 'exact-voice-record.json'));
  const duplicates = await readJson(join(DEST, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-170' && manifest.actor === 'Maurice LaMarche' && manifest.character === 'The Brain, Kif Kroker, Egon Spengler' && manifest.production === 'Animaniacs / Futurama' && manifest.years === '1980s–' && manifest.side === 'still', 'UC-170 permanent manifest identity drift');
  assert(manifest.custody?.render_artifact?.artifact_id === control.render_artifact.artifact_id && manifest.custody?.render_artifact?.zip_sha256 === control.render_artifact.zip_sha256, 'UC-170 permanent render custody drift');
  assert(manifest.custody?.apply_control_sha256 === sha(await readFile(CONTROL)) && manifest.custody?.source_manifest_sha256 === control.expected_files['manifest.json'].sha256 && manifest.custody?.source_sums_sha256 === control.expected_files.SHA256SUMS.sha256, 'UC-170 permanent apply custody drift');
  assert(manifest.custody?.failed_discovery_checkpoints?.length === 3 && Object.keys(manifest.actor_role_custody || {}).length === 4 && Object.keys(manifest.selected_roles || {}).length === 3, 'UC-170 permanent evidence denominator drift');
  assert(manifest.selected_roles?.brain?.original?.sha256 === control.expected_files['brain-original.webp'].sha256, 'UC-170 permanent Brain drift');
  assert(manifest.selected_roles?.kif?.original?.sha256 === control.expected_files['kif-original.webp'].sha256 && manifest.selected_roles?.kif?.generic_width_floor_exception === true, 'UC-170 permanent Kif exception drift');
  assert(manifest.selected_roles?.egon?.original?.sha256 === control.expected_files['egon-original.webp'].sha256 && manifest.selected_roles?.egon?.file_title === 'File:EgonColorPMS.png', 'UC-170 permanent Egon drift');
  assert(manifest.candidate?.sha256 === control.expected_files['uc-170-still-candidate.jpg'].sha256 && manifest.crop_preview?.sha256 === control.expected_files['card-crop-preview.jpg'].sha256, 'UC-170 permanent candidate drift');
  assert(manifest.exact_subject_review?.identity === control.ruling.identity && manifest.exact_subject_review?.presentation === control.ruling.presentation && manifest.exact_subject_review?.crop_ruling === control.ruling.crop_ruling && manifest.exact_subject_review?.chronology_ruling === control.ruling.chronology_ruling && manifest.exact_subject_review?.Kif_source_floor_ruling === control.ruling.Kif_source_floor_ruling && manifest.exact_subject_review?.live_action_egon_exclusion_ruling === control.ruling.live_action_egon_exclusion_ruling && manifest.exact_subject_review?.portrait_separation_ruling === control.ruling.portrait_separation_ruling && manifest.canonical_mutation === false, 'UC-170 permanent review boundary drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.Kif_source_floor_ruling === control.ruling.Kif_source_floor_ruling && review.live_action_egon_exclusion_ruling === control.ruling.live_action_egon_exclusion_ruling && review.portrait_separation_ruling === control.ruling.portrait_separation_ruling && review.canonical_mutation === false, 'UC-170 permanent review drift');
  assert(voice.selected_roles?.kif?.image?.sha256 === control.expected_files['kif-original.webp'].sha256 && voice.selected_roles?.kif?.generic_width_floor_exception === true && voice.voice_boundary?.Kif_exception_bound_to_exact_bytes === true && voice.voice_boundary?.live_action_egon_and_harold_ramis_imagery_forbidden === true && voice.voice_boundary?.existing_performer_portrait === 'images/uc-170-portrait.jpg' && voice.canonical_mutation === false, 'UC-170 permanent exact voice drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && duplicates.items.length === 5 && duplicates.items.every(item => item.matches.length === 0), 'UC-170 permanent duplicate boundary drift');
  console.log(`VALIDATED ${DEST}`);
  console.log(`manifest ${sha(await readFile(join(DEST, 'manifest.json')))}`);
  console.log(`review ${sha(await readFile(join(DEST, 'review.json')))}`);
  console.log(`sums ${sha(await readFile(join(DEST, 'SHA256SUMS')))}`);
}

async function materialize() {
  const control = await loadControl();
  const source = await verifySourcePacket(control);
  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });
  for (const name of Object.keys(control.expected_files)) await copyFile(join(SOURCE_ROOT, name), join(DEST, name));

  await writeJson(join(DEST, 'duplicate-scan.json'), {
    ...source.duplicates,
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    status: 'pass',
    semantics: 'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'
  });
  await writeJson(join(DEST, 'review.json'), {
    ...source.review,
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    reviewed_role: control.reviewed_role,
    identity_ruling: control.ruling.identity,
    presentation_ruling: control.ruling.presentation,
    crop_ruling: control.ruling.crop_ruling,
    chronology_ruling: control.ruling.chronology_ruling,
    Kif_source_floor_ruling: control.ruling.Kif_source_floor_ruling,
    live_action_egon_exclusion_ruling: control.ruling.live_action_egon_exclusion_ruling,
    portrait_separation_ruling: control.ruling.portrait_separation_ruling,
    canonical_mutation: false,
    disposition: control.ruling.candidate_disposition
  });
  await writeJson(join(DEST, 'manifest.json'), {
    ...source.manifest,
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    reviewed_role: control.reviewed_role,
    custody: {
      ...source.manifest.custody,
      render_artifact: control.render_artifact,
      apply_control_sha256: sha(await readFile(CONTROL)),
      source_manifest_sha256: control.expected_files['manifest.json'].sha256,
      source_sums_sha256: control.expected_files.SHA256SUMS.sha256,
      source_packet_file_count: control.denominators.packet_file_count
    },
    exact_subject_review: {
      identity: control.ruling.identity,
      presentation: control.ruling.presentation,
      crop_ruling: control.ruling.crop_ruling,
      chronology_ruling: control.ruling.chronology_ruling,
      Kif_source_floor_ruling: control.ruling.Kif_source_floor_ruling,
      live_action_egon_exclusion_ruling: control.ruling.live_action_egon_exclusion_ruling,
      portrait_separation_ruling: control.ruling.portrait_separation_ruling,
      notes: source.review.notes
    },
    disposition: control.ruling.candidate_disposition,
    canonical_mutation: false
  });

  const repository = await repositoryHashes();
  assert(repository.size === control.denominators.repository_hash_count, `repository hash denominator drift ${repository.size}`);
  for (const name of ['brain-original.webp','kif-original.webp','egon-original.webp','uc-170-still-candidate.jpg','card-crop-preview.jpg']) {
    const hash = control.expected_files[name].sha256;
    assert(!(repository.get(hash) || []).length, `${name} duplicates canonical media: ${(repository.get(hash) || []).join(', ')}`);
  }

  const sumNames = Object.keys(control.expected_files).filter(name => name !== 'SHA256SUMS').sort();
  const sums = [];
  for (const name of sumNames) sums.push(`${sha(await readFile(join(DEST, name)))}  ${name}`);
  await writeFile(join(DEST, 'SHA256SUMS'), sums.join('\n') + '\n');
  await validatePermanent(control);
  console.log(`MATERIALIZED ${DEST}: ${control.denominators.packet_file_count} reviewed evidence files`);
  console.log(`candidate ${control.expected_files['uc-170-still-candidate.jpg'].sha256}`);
  console.log(`crop ${control.expected_files['card-crop-preview.jpg'].sha256}`);
  console.log('roles Brain, Kif, animated Egon retained');
  console.log('Kif exact source-floor exception retained without lowering the general floor');
  console.log('existing Maurice LaMarche portrait remains unchanged');
  console.log('canonical mutation false');
}

if (command === 'materialize') await materialize();
else if (command === 'validate') await validatePermanent(await loadControl());
else throw new Error(`unknown command ${command}`);
