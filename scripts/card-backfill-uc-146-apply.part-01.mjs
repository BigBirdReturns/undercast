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
      collision_ruling: control.ruling.collision_ruling,
      character_separation_ruling: control.ruling.character_separation_ruling,
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
    collision_ruling: control.ruling.collision_ruling,
    character_separation_ruling: control.ruling.character_separation_ruling,
    canonical_mutation: false,
    disposition: control.ruling.candidate_disposition,
    notes: control.ruling.notes
  });

  const repository = await repositoryHashes();
  const repositoryCount = process.env.REPOSITORY_HASH_COUNT_OVERRIDE ? Number(process.env.REPOSITORY_HASH_COUNT_OVERRIDE) : repository.size;
  assert(repositoryCount === control.expected.duplicate_repository_hash_count, `repository hash denominator drift ${repositoryCount}`);
  for (const hash of [control.expected.selected_source.sha256, control.expected.alternative_source.sha256, control.expected.candidate.sha256, control.expected.crop_preview.sha256]) {
    assert(!(repository.get(hash) || []).length, `authorized UC-146 evidence duplicates canonical media: ${(repository.get(hash) || []).join(', ')}`);
  }
  const sums = [];
  for (const file of expectedFiles.filter(name => name !== 'SHA256SUMS')) sums.push(`${sha(await readFile(join(DEST, file)))}  ${file}`);
  await writeFile(join(DEST, 'SHA256SUMS'), sums.join('\n') + '\n');
  await validate();
  console.log(`MATERIALIZED ${DEST}: ${expectedFiles.length} reviewed evidence files`);
  console.log(`candidate ${control.expected.candidate.sha256}`);
  console.log(`crop ${control.expected.crop_preview.sha256}`);
  console.log('Tim Rose performer portrait remains separate from the existing character still');
  console.log('two strict identity pages and two reference-only owner pages retained');
  console.log('canonical mutation false');
}

async function validate() {
  const control = await loadControl();
  const names = (await readdir(DEST)).sort();
  assert(JSON.stringify(names) === JSON.stringify([...expectedFiles].sort()), `UC-146 permanent file set drift: ${names.join(', ')}`);
  const sums = String(await readFile(join(DEST, 'SHA256SUMS'), 'utf8')).trim().split('\n').filter(Boolean);
  assert(sums.length === expectedFiles.length - 1, 'UC-146 permanent checksum row count drift');
  const sumNames = [];
  for (const line of sums) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert(match, `malformed UC-146 permanent checksum ${line}`);
    sumNames.push(match[2]);
    assert(sha(await readFile(join(DEST, match[2]))) === match[1], `${match[2]} permanent checksum drift`);
  }
  assert(JSON.stringify(sumNames.sort()) === JSON.stringify(expectedFiles.filter(name => name !== 'SHA256SUMS').sort()), 'UC-146 permanent checksum filename set drift');
  const manifest = await readJson(join(DEST, 'manifest.json'));
  const review = await readJson(join(DEST, 'review.json'));
  const portrait = await readJson(join(DEST, 'exact-portrait-record.json'));
  const duplicates = await readJson(join(DEST, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-146' && manifest.actor === 'Tim Rose' && manifest.character === 'Admiral Ackbar / Salacious B. Crumb' && manifest.production === 'Return of the Jedi' && manifest.years === '1983–2019' && manifest.side === 'portrait', 'UC-146 permanent manifest identity drift');
  assert(manifest.custody?.render_artifact?.artifact_id === control.render_artifact.artifact_id && manifest.custody?.render_artifact?.zip_sha256 === control.render_artifact.zip_sha256, 'UC-146 permanent render custody drift');
  assert(manifest.custody?.apply_control_sha256 === sha(await readFile(CONTROL)), 'UC-146 permanent apply control receipt drift');
  assert(manifest.custody?.source_manifest_sha256 === control.expected.source_manifest.sha256 && manifest.custody?.source_sums_sha256 === control.expected.source_sums.sha256, 'UC-146 permanent source custody drift');
  const counts = identityCounts(manifest.identity_custody);
  assert(counts.total === 4 && counts.strict === 2 && counts.reference_only === 2, 'UC-146 permanent identity denominator drift');
  assert(manifest.selected_portrait?.original?.sha256 === control.expected.selected_source.sha256 && manifest.selected_portrait?.license_short_name === 'CC BY-SA 3.0', 'UC-146 permanent selected portrait drift');
  assert(manifest.rejected_alternative?.original?.sha256 === control.expected.alternative_source.sha256 && manifest.rejected_alternative?.license_short_name === 'CC BY-SA 4.0', 'UC-146 permanent alternative portrait drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256, 'UC-146 permanent candidate drift');
  assert(manifest.portrait_boundary?.exact_untransformed_performer_portrait_required === true && manifest.portrait_boundary?.other_people_named_tim_rose_forbidden === true && manifest.portrait_boundary?.existing_character_still === 'images/uc-146-still.jpg' && manifest.portrait_boundary?.existing_character_still_must_remain_unchanged === true, 'UC-146 permanent portrait boundary drift');
  assert(manifest.exact_subject_review?.identity === control.ruling.identity && manifest.exact_subject_review?.presentation === control.ruling.presentation && manifest.exact_subject_review?.crop_ruling === control.ruling.crop_ruling && manifest.exact_subject_review?.collision_ruling === control.ruling.collision_ruling && manifest.exact_subject_review?.character_separation_ruling === control.ruling.character_separation_ruling && manifest.canonical_mutation === false, 'UC-146 permanent review boundary drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.collision_ruling === control.ruling.collision_ruling && review.character_separation_ruling === control.ruling.character_separation_ruling && review.canonical_mutation === false, 'UC-146 permanent review drift');
  assert(portrait.portrait_boundary?.exact_untransformed_performer_portrait_required === true && portrait.portrait_boundary?.other_people_named_tim_rose_forbidden === true && portrait.portrait_boundary?.existing_character_still === 'images/uc-146-still.jpg' && portrait.selected_portrait?.image?.sha256 === control.expected.selected_source.sha256 && portrait.rejected_alternative?.image?.sha256 === control.expected.alternative_source.sha256 && portrait.selected_and_alternative_byte_distinct === true && portrait.canonical_mutation === false, 'UC-146 permanent exact-portrait boundary drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && duplicates.items.length === 4 && duplicates.items.every(item => item.matches.length === 0), 'UC-146 permanent duplicate boundary drift');
  console.log(`VALIDATED ${DEST}`);
  console.log(`manifest ${sha(await readFile(join(DEST, 'manifest.json')))}`);
  console.log(`sums ${sha(await readFile(join(DEST, 'SHA256SUMS')))}`);
}

if (command === 'materialize') await materialize();
else if (command === 'validate') await validate();
else throw new Error(`unknown command ${command}`);
