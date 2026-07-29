async function validatePermanent(control) {
  const expectedNames = Object.keys(control.expected_files).sort();
  const names = (await readdir(DEST)).sort();
  assert(JSON.stringify(names) === JSON.stringify(expectedNames), `UC-172 permanent file set drift: ${names.join(', ')}`);
  await verifyChecksums(DEST, expectedNames, control.denominators.checksum_row_count);
  for (const name of expectedNames.filter(name => !['manifest.json','SHA256SUMS'].includes(name))) {
    await verifyFile(DEST, name, exactExpected(control, name));
  }
  const manifest = await readJson(join(DEST, 'manifest.json'));
  const review = await readJson(join(DEST, 'review.json'));
  const voice = await readJson(join(DEST, 'exact-voice-record.json'));
  const duplicates = await readJson(join(DEST, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-172' && manifest.actor === 'Jim Cummings' && manifest.character === 'Winnie the Pooh, Tigger, Darkwing Duck' && manifest.production === 'Disney' && manifest.years === '1980s–' && manifest.side === 'still', 'UC-172 permanent manifest identity drift');
  assert(manifest.custody?.render_artifact?.artifact_id === control.render_artifact.artifact_id && manifest.custody?.render_artifact?.upload_digest_sha256 === control.render_artifact.upload_digest_sha256, 'UC-172 permanent render custody drift');
  assert(manifest.custody?.apply_control_sha256 === sha(await readFile(CONTROL)) && manifest.custody?.source_manifest_sha256 === control.expected_files['manifest.json'].sha256 && manifest.custody?.source_sums_sha256 === control.expected_files.SHA256SUMS.sha256 && manifest.custody?.source_packet_file_count === control.denominators.packet_file_count, 'UC-172 permanent apply custody drift');
  assert(manifest.custody?.render_artifact_transport?.downloaded_transport_zip_sha256 && manifest.custody?.render_artifact_transport?.immutable_boundary, 'UC-172 permanent transport custody drift');
  const bindings = Object.values(manifest.actor_role_custody || {});
  assert(manifest.custody?.failed_discovery_checkpoints?.length === 0 && bindings.length === 3 && bindings.every(row => row.strict === true) && Object.keys(manifest.roles || {}).length === 3, 'UC-172 permanent evidence denominator drift');
  assert(manifest.roles?.pooh?.original?.sha256 === control.expected_files['pooh-original.webp'].sha256, 'UC-172 permanent Pooh drift');
  assert(manifest.roles?.tigger?.original?.sha256 === control.expected_files['tigger-original.webp'].sha256, 'UC-172 permanent Tigger drift');
  assert(manifest.roles?.darkwing?.original?.sha256 === control.expected_files['darkwing-original.webp'].sha256, 'UC-172 permanent Darkwing drift');
  assert(manifest.chronology_boundary?.sterling_holloway_pooh_cannot_substitute === true && manifest.chronology_boundary?.paul_winchell_tigger_cannot_substitute === true && manifest.composite_boundary?.required_roles?.join(',') === 'pooh,tigger,darkwing' && manifest.composite_boundary?.existing_performer_portrait === 'images/uc-172-portrait.jpg', 'UC-172 permanent chronology or composite boundary drift');
  assert(manifest.candidate?.sha256 === control.expected_files['uc-172-still-candidate.jpg'].sha256 && manifest.crop_preview?.sha256 === control.expected_files['card-crop-preview.jpg'].sha256, 'UC-172 permanent candidate drift');
  assert(manifest.exact_subject_review?.identity === control.ruling.identity && manifest.exact_subject_review?.presentation === control.ruling.presentation && manifest.exact_subject_review?.crop_ruling === control.ruling.crop_ruling && manifest.exact_subject_review?.chronology_ruling === control.ruling.chronology_ruling && manifest.exact_subject_review?.inheritance_ruling === control.ruling.inheritance_ruling && manifest.exact_subject_review?.portrait_separation_ruling === control.ruling.portrait_separation_ruling && manifest.canonical_mutation === false, 'UC-172 permanent review boundary drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.inheritance_ruling === control.ruling.inheritance_ruling && review.portrait_separation_ruling === control.ruling.portrait_separation_ruling && review.canonical_mutation === false, 'UC-172 permanent review drift');
  assert(voice.roles?.pooh?.selected_image?.sha256 === control.expected_files['pooh-original.webp'].sha256 && voice.roles?.tigger?.selected_image?.sha256 === control.expected_files['tigger-original.webp'].sha256 && voice.roles?.darkwing?.selected_image?.sha256 === control.expected_files['darkwing-original.webp'].sha256 && voice.chronology_boundary?.sterling_holloway_pooh_cannot_substitute === true && voice.chronology_boundary?.paul_winchell_tigger_cannot_substitute === true && voice.composite_boundary?.existing_performer_portrait === 'images/uc-172-portrait.jpg' && voice.canonical_mutation === false, 'UC-172 permanent exact voice drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && duplicates.items.length === 5 && duplicates.items.every(item => item.matches.length === 0), 'UC-172 permanent duplicate boundary drift');
  console.log(`VALIDATED ${DEST}`);
  console.log(`manifest ${sha(await readFile(join(DEST, 'manifest.json')))}`);
  console.log(`review ${sha(await readFile(join(DEST, 'review.json')))}`);
  console.log(`sums ${sha(await readFile(join(DEST, 'SHA256SUMS')))}`);
}

async function materialize() {
  const control = await loadControl();
  const source = await verifySourcePacket(control);
  const downloadedTransportSha256 = process.env.DOWNLOAD_TRANSPORT_SHA256 || '';
  assert(/^[0-9a-f]{64}$/.test(downloadedTransportSha256), 'DOWNLOAD_TRANSPORT_SHA256 is required');
  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });
  for (const name of Object.keys(control.expected_files)) await copyFile(join(SOURCE_ROOT, name), join(DEST, name));

  await writeJson(join(DEST, 'manifest.json'), {
    ...source.manifest,
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    reviewed_role: control.reviewed_role,
    custody: {
      ...source.manifest.custody,
      render_artifact: control.render_artifact,
      render_artifact_transport: {
        artifact_id: control.render_artifact.artifact_id,
        upload_digest_sha256: control.render_artifact.upload_digest_sha256,
        downloaded_transport_zip_sha256: downloadedTransportSha256,
        immutable_boundary: 'The twenty-three internal packet files and their SHA256SUMS ledger are authoritative; the regenerated ZIP container is recorded but not treated as immutable.'
      },
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
      inheritance_ruling: control.ruling.inheritance_ruling,
      portrait_separation_ruling: control.ruling.portrait_separation_ruling,
      notes: control.ruling.notes
    },
    disposition: control.ruling.candidate_disposition,
    canonical_mutation: false
  });

  const repository = await repositoryHashes();
  assert(repository.size === control.denominators.repository_hash_count, `repository hash denominator drift ${repository.size}`);
  for (const name of ['pooh-original.webp','tigger-original.webp','darkwing-original.webp','uc-172-still-candidate.jpg','card-crop-preview.jpg']) {
    const hash = control.expected_files[name].sha256;
    assert(!(repository.get(hash) || []).length, `${name} duplicates canonical media: ${(repository.get(hash) || []).join(', ')}`);
  }
  const sumNames = Object.keys(control.expected_files).filter(name => name !== 'SHA256SUMS').sort();
  const sums = [];
  for (const name of sumNames) sums.push(`${sha(await readFile(join(DEST, name)))}  ${name}`);
  await writeFile(join(DEST, 'SHA256SUMS'), sums.join('\n') + '\n');
  await validatePermanent(control);
  console.log(`MATERIALIZED ${DEST}: ${control.denominators.packet_file_count} reviewed evidence files`);
  console.log(`candidate ${control.expected_files['uc-172-still-candidate.jpg'].sha256}`);
  console.log(`crop ${control.expected_files['card-crop-preview.jpg'].sha256}`);
  console.log('roles Winnie the Pooh, Tigger, and Darkwing Duck retained');
  console.log('Sterling Holloway and Paul Winchell predecessor boundaries retained');
  console.log('existing Jim Cummings portrait remains unchanged');
  console.log('canonical mutation false');
}

if (command === 'materialize') await materialize();
else if (command === 'validate') await validatePermanent(await loadControl());
else throw new Error(`unknown command ${command}`);
