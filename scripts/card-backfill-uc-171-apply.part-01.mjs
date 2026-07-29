async function validatePermanent(control) {
  const expectedNames = Object.keys(control.expected_files).sort();
  const names = (await readdir(DEST)).sort();
  assert(JSON.stringify(names) === JSON.stringify(expectedNames), `UC-171 permanent file set drift: ${names.join(', ')}`);
  await verifyChecksums(DEST, expectedNames, control.denominators.checksum_row_count);
  for (const name of expectedNames.filter(name => !['manifest.json','review.json','duplicate-scan.json','SHA256SUMS'].includes(name))) {
    await verifyFile(DEST, name, exactExpected(control, name));
  }
  const manifest = await readJson(join(DEST, 'manifest.json'));
  const review = await readJson(join(DEST, 'review.json'));
  const voice = await readJson(join(DEST, 'exact-voice-record.json'));
  const duplicates = await readJson(join(DEST, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-171' && manifest.actor === 'Rob Paulsen' && manifest.character === 'Yakko Warner, Pinky, Raphael' && manifest.production === 'Animaniacs / TMNT' && manifest.years === '1980s–' && manifest.side === 'still', 'UC-171 permanent manifest identity drift');
  assert(manifest.custody?.render_artifact?.artifact_id === control.render_artifact.artifact_id && manifest.custody?.render_artifact?.zip_sha256 === control.render_artifact.zip_sha256, 'UC-171 permanent render custody drift');
  assert(manifest.custody?.apply_control_sha256 === sha(await readFile(CONTROL)) && manifest.custody?.source_manifest_sha256 === control.expected_files['manifest.json'].sha256 && manifest.custody?.source_sums_sha256 === control.expected_files.SHA256SUMS.sha256 && manifest.custody?.source_packet_file_count === control.denominators.packet_file_count, 'UC-171 permanent apply custody drift');
  const bindings = Object.values(manifest.actor_role_custody || {});
  assert(manifest.custody?.failed_discovery_checkpoints?.length === 3 && bindings.length === 4 && bindings.filter(row => row.strict === true).length === 3 && bindings.filter(row => row.reference_only === true).length === 1 && Object.keys(manifest.roles || {}).length === 3, 'UC-171 permanent evidence denominator drift');
  assert(manifest.roles?.yakko?.original?.sha256 === control.expected_files['yakko-original.webp'].sha256, 'UC-171 permanent Yakko drift');
  assert(manifest.roles?.pinky?.original?.sha256 === control.expected_files['pinky-original.webp'].sha256, 'UC-171 permanent Pinky drift');
  assert(manifest.roles?.raphael?.original?.sha256 === control.expected_files['raphael-1987-original.webp'].sha256 && manifest.roles?.raphael?.file_title === 'File:1987 raph 01.jpg', 'UC-171 permanent Raphael drift');
  assert(manifest.chronology_boundary?.later_donatello_cannot_substitute === true && manifest.composite_boundary?.required_roles?.join(',') === 'yakko,pinky,raphael' && manifest.composite_boundary?.existing_performer_portrait === 'images/uc-171-portrait.jpg', 'UC-171 permanent chronology or composite boundary drift');
  assert(manifest.candidate?.sha256 === control.expected_files['uc-171-still-candidate.jpg'].sha256 && manifest.crop_preview?.sha256 === control.expected_files['card-crop-preview.jpg'].sha256, 'UC-171 permanent candidate drift');
  assert(manifest.exact_subject_review?.identity === control.ruling.identity && manifest.exact_subject_review?.presentation === control.ruling.presentation && manifest.exact_subject_review?.crop_ruling === control.ruling.crop_ruling && manifest.exact_subject_review?.chronology_ruling === control.ruling.chronology_ruling && manifest.exact_subject_review?.raphael_ruling === control.ruling.raphael_ruling && manifest.exact_subject_review?.reference_only_ruling === control.ruling.reference_only_ruling && manifest.exact_subject_review?.portrait_separation_ruling === control.ruling.portrait_separation_ruling && manifest.canonical_mutation === false, 'UC-171 permanent review boundary drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.raphael_ruling === control.ruling.raphael_ruling && review.reference_only_ruling === control.ruling.reference_only_ruling && review.portrait_separation_ruling === control.ruling.portrait_separation_ruling && review.canonical_mutation === false, 'UC-171 permanent review drift');
  assert(voice.roles?.yakko?.selected_image?.sha256 === control.expected_files['yakko-original.webp'].sha256 && voice.roles?.pinky?.selected_image?.sha256 === control.expected_files['pinky-original.webp'].sha256 && voice.roles?.raphael?.selected_image?.sha256 === control.expected_files['raphael-1987-original.webp'].sha256 && voice.chronology_boundary?.later_donatello_cannot_substitute === true && voice.composite_boundary?.existing_performer_portrait === 'images/uc-171-portrait.jpg' && voice.canonical_mutation === false, 'UC-171 permanent exact voice drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && duplicates.items.length === 5 && duplicates.items.every(item => item.matches.length === 0), 'UC-171 permanent duplicate boundary drift');
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
    raphael_ruling: control.ruling.raphael_ruling,
    reference_only_ruling: control.ruling.reference_only_ruling,
    portrait_separation_ruling: control.ruling.portrait_separation_ruling,
    canonical_mutation: false,
    disposition: control.ruling.candidate_disposition,
    notes: control.ruling.notes
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
      raphael_ruling: control.ruling.raphael_ruling,
      reference_only_ruling: control.ruling.reference_only_ruling,
      portrait_separation_ruling: control.ruling.portrait_separation_ruling,
      notes: control.ruling.notes
    },
    disposition: control.ruling.candidate_disposition,
    canonical_mutation: false
  });

  const repository = await repositoryHashes();
  assert(repository.size === control.denominators.repository_hash_count, `repository hash denominator drift ${repository.size}`);
  for (const name of ['yakko-original.webp','pinky-original.webp','raphael-1987-original.webp','uc-171-still-candidate.jpg','card-crop-preview.jpg']) {
    const hash = control.expected_files[name].sha256;
    assert(!(repository.get(hash) || []).length, `${name} duplicates canonical media: ${(repository.get(hash) || []).join(', ')}`);
  }

  const sumNames = Object.keys(control.expected_files).filter(name => name !== 'SHA256SUMS').sort();
  const sums = [];
  for (const name of sumNames) sums.push(`${sha(await readFile(join(DEST, name)))}  ${name}`);
  await writeFile(join(DEST, 'SHA256SUMS'), sums.join('\n') + '\n');
  await validatePermanent(control);
  console.log(`MATERIALIZED ${DEST}: ${control.denominators.packet_file_count} reviewed evidence files`);
  console.log(`candidate ${control.expected_files['uc-171-still-candidate.jpg'].sha256}`);
  console.log(`crop ${control.expected_files['card-crop-preview.jpg'].sha256}`);
  console.log('roles Yakko, Pinky, and 1987 animated Raphael retained');
  console.log('blocked Paramount release remains reference-only; live Paramount+ guide remains strict');
  console.log('existing Rob Paulsen portrait remains unchanged');
  console.log('canonical mutation false');
}

if (command === 'materialize') await materialize();
else if (command === 'validate') await validatePermanent(await loadControl());
else throw new Error(`unknown command ${command}`);
