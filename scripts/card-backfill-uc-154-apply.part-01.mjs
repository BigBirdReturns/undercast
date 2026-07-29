async function materialize() {
  const control = await loadControl();
  const source = await verifySourcePacket(control);
  await rm(DEST, { recursive: true, force: true });
  await mkdir(DEST, { recursive: true });
  for (const file of expectedFiles) await copyFile(join(SOURCE_ROOT, file), join(DEST, file));

  await writeJson(join(DEST, 'duplicate-scan.json'), {
    ...source.duplicates,
    reviewed_at: control.reviewed_at,
    reviewed_by: control.reviewed_by,
    status: 'pass',
    semantics: 'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'
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
      source_manifest_sha256: control.expected.source_manifest.sha256,
      source_sums_sha256: control.expected.source_sums.sha256
    },
    duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: 2070, status: 'pass' },
    exact_subject_review: {
      identity: control.ruling.identity,
      presentation: control.ruling.presentation,
      crop_ruling: control.ruling.crop_ruling,
      chronology_ruling: control.ruling.chronology_ruling,
      mixed_gallery_ruling: control.ruling.mixed_gallery_ruling,
      portrait_separation_ruling: control.ruling.portrait_separation_ruling,
      notes: control.ruling.notes
    },
    disposition: control.ruling.candidate_disposition,
    canonical_mutation: false
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
    mixed_gallery_ruling: control.ruling.mixed_gallery_ruling,
    portrait_separation_ruling: control.ruling.portrait_separation_ruling,
    canonical_mutation: false,
    disposition: control.ruling.candidate_disposition,
    notes: control.ruling.notes
  });

  const repository = await repositoryHashes();
  const repositoryCount = process.env.REPOSITORY_HASH_COUNT_OVERRIDE ? Number(process.env.REPOSITORY_HASH_COUNT_OVERRIDE) : repository.size;
  assert(repositoryCount === control.expected.duplicate_repository_hash_count, `repository hash denominator drift ${repositoryCount}`);
  for (const hash of [control.expected.selected_source.sha256, control.expected.candidate.sha256, control.expected.crop_preview.sha256]) {
    assert(!(repository.get(hash) || []).length, `authorized UC-154 evidence duplicates canonical media: ${(repository.get(hash) || []).join(', ')}`);
  }
  const sums = [];
  for (const file of expectedFiles.filter(name => name !== 'SHA256SUMS')) sums.push(`${sha(await readFile(join(DEST, file)))}  ${file}`);
  await writeFile(join(DEST, 'SHA256SUMS'), sums.join('\n') + '\n');
  await validate();
  console.log(`MATERIALIZED ${DEST}: ${expectedFiles.length} reviewed evidence files`);
  console.log(`candidate ${control.expected.candidate.sha256}`);
  console.log(`crop ${control.expected.crop_preview.sha256}`);
  console.log('Halloween (2007) first-film boundary retained; Halloween II (2009) excluded');
  console.log('mixed gallery checkpoint retained and rejected');
  console.log('existing Tyler Mane portrait remains unchanged');
  console.log('canonical mutation false');
}

async function validate() {
  const control = await loadControl();
  const names = (await readdir(DEST)).sort();
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-154 permanent file set drift: ${names.join(', ')}`);
  const sums = String(await readFile(join(DEST, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length === expectedFiles.length - 1, 'UC-154 permanent checksum row count drift');
  const sumNames = [];
  for (const line of sums) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match, `malformed UC-154 permanent checksum ${line}`);
    sumNames.push(match[2]);
    assert(sha(await readFile(join(DEST, match[2]))) === match[1], `${match[2]} permanent checksum drift`);
  }
  assert(JSON.stringify(sumNames.sort()) === JSON.stringify(expectedFiles.filter(name => name !== 'SHA256SUMS').sort()), 'UC-154 permanent checksum filename set drift');
  const manifest = await readJson(join(DEST, 'manifest.json'));
  const review = await readJson(join(DEST, 'review.json'));
  const still = await readJson(join(DEST, 'exact-still-record.json'));
  const duplicates = await readJson(join(DEST, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-154' && manifest.actor === 'Tyler Mane' && manifest.character === 'Michael Myers' && manifest.production === 'Halloween (2007)' && manifest.years === '2007–2009' && manifest.side === 'still', 'UC-154 permanent manifest identity drift');
  assert(manifest.custody?.render_artifact?.artifact_id === control.render_artifact.artifact_id && manifest.custody?.render_artifact?.zip_sha256 === control.render_artifact.zip_sha256, 'UC-154 permanent render custody drift');
  assert(manifest.custody?.apply_control_sha256 === sha(await readFile(CONTROL)), 'UC-154 permanent apply control receipt drift');
  assert(manifest.custody?.source_manifest_sha256 === control.expected.source_manifest.sha256 && manifest.custody?.source_sums_sha256 === control.expected.source_sums.sha256, 'UC-154 permanent source custody drift');
  assert(Object.keys(manifest.source_custody || {}).length === 4, 'UC-154 permanent source-page denominator drift');
  assert(manifest.selected_frame?.original?.sha256 === control.expected.selected_source.sha256 && manifest.selected_frame?.caption.includes('Tyler Mane as Michael Myers'), 'UC-154 permanent selected source drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256, 'UC-154 permanent candidate drift');
  assert(manifest.chronology_boundary?.selected_frame_production === 'Halloween (2007)' && manifest.chronology_boundary?.halloween_ii_2009_substitute_forbidden === true && manifest.chronology_boundary?.other_michael_myers_performers_forbidden === true, 'UC-154 permanent chronology boundary drift');
  assert(manifest.still_boundary?.exact_completed_michael_myers_character_still_required === true && manifest.still_boundary?.mixed_gallery_inventory_forbidden === true && manifest.still_boundary?.existing_performer_portrait === 'images/uc-154-portrait.jpg' && manifest.still_boundary?.existing_performer_portrait_must_remain_unchanged === true, 'UC-154 permanent still boundary drift');
  assert(manifest.exact_subject_review?.identity === control.ruling.identity && manifest.exact_subject_review?.presentation === control.ruling.presentation && manifest.exact_subject_review?.crop_ruling === control.ruling.crop_ruling && manifest.exact_subject_review?.chronology_ruling === control.ruling.chronology_ruling && manifest.exact_subject_review?.mixed_gallery_ruling === control.ruling.mixed_gallery_ruling && manifest.exact_subject_review?.portrait_separation_ruling === control.ruling.portrait_separation_ruling && manifest.canonical_mutation === false, 'UC-154 permanent review boundary drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.mixed_gallery_ruling === control.ruling.mixed_gallery_ruling && review.portrait_separation_ruling === control.ruling.portrait_separation_ruling && review.canonical_mutation === false, 'UC-154 permanent review drift');
  assert(still.selected_frame?.selected_image_sha256 === control.expected.selected_source.sha256 && still.chronology_boundary?.selected_frame_production === 'Halloween (2007)' && still.chronology_boundary?.halloween_ii_2009_substitute_forbidden === true && still.still_boundary?.mixed_gallery_inventory_forbidden === true && still.still_boundary?.existing_performer_portrait === 'images/uc-154-portrait.jpg' && still.canonical_mutation === false, 'UC-154 permanent exact-still boundary drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && duplicates.items.length === 3 && duplicates.items.every(item => item.matches.length === 0), 'UC-154 permanent duplicate boundary drift');
  console.log(`VALIDATED ${DEST}`);
  console.log(`manifest ${sha(await readFile(join(DEST, 'manifest.json')))}`);
  console.log(`sums ${sha(await readFile(join(DEST, 'SHA256SUMS')))}`);
}

if (command === 'materialize') await materialize();
else if (command === 'validate') await validate();
else throw new Error(`unknown command ${command}`);
