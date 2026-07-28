    assert(match, `malformed permanent checksum ${line}`);
    sumNames.push(match[2]);
    assert(sha(await readFile(join(DEST, match[2]))) === match[1], `${match[2]} permanent checksum drift`);
  }
  assert(JSON.stringify(sumNames.sort()) === JSON.stringify(expectedFiles.filter(name => name !== 'SHA256SUMS').sort()), 'permanent checksum filename set drift');
  const manifest = await readJson(join(DEST, 'manifest.json'));
  const review = await readJson(join(DEST, 'review.json'));
  const role = await readJson(join(DEST, 'exact-role-record.json'));
  const duplicates = await readJson(join(DEST, 'duplicate-scan.json'));
  assert(manifest.record_id === 'UC-124' && manifest.actor === 'James Earl Jones' && manifest.character === 'Mufasa (and Darth Vader)' && manifest.production === 'The Lion King / Star Wars' && manifest.year === 1994 && manifest.side === 'still', 'permanent manifest identity drift');
  assert(manifest.custody?.render_artifact?.artifact_id === control.render_artifact.artifact_id && manifest.custody?.render_artifact?.zip_sha256 === control.render_artifact.zip_sha256, 'permanent render custody drift');
  assert(manifest.custody?.apply_control_sha256 === sha(await readFile(CONTROL)), 'permanent apply control receipt drift');
  assert(manifest.custody?.source_manifest_sha256 === control.expected.source_manifest.sha256 && manifest.custody?.source_sums_sha256 === control.expected.source_sums.sha256, 'permanent source custody drift');
  assert(manifest.roles?.mufasa?.original?.sha256 === control.expected.mufasa_source.sha256 && manifest.roles?.vader?.original?.sha256 === control.expected.vader_source.sha256, 'permanent selected source drift');
  assert(manifest.candidate?.sha256 === control.expected.candidate.sha256 && manifest.crop_preview?.sha256 === control.expected.crop_preview.sha256, 'permanent candidate drift');
  assert(manifest.identity_boundary?.canonical_1994_is_lion_king_chronology_not_vader_debut === true && manifest.identity_boundary?.voice_and_physical_embodiment_separate === true && manifest.identity_boundary?.darth_vader_frame_must_not_imply_jones_suit_occupancy === true, 'permanent chronology or embodiment boundary drift');
  assert(manifest.exact_subject_review?.identity === control.ruling.identity && manifest.exact_subject_review?.presentation === control.ruling.presentation && manifest.exact_subject_review?.crop_ruling === control.ruling.crop_ruling && manifest.exact_subject_review?.chronology_ruling === control.ruling.chronology_ruling && manifest.exact_subject_review?.embodiment_ruling === control.ruling.embodiment_ruling && manifest.canonical_mutation === false, 'permanent review boundary drift');
  assert(review.identity_ruling === control.ruling.identity && review.presentation_ruling === control.ruling.presentation && review.crop_ruling === control.ruling.crop_ruling && review.chronology_ruling === control.ruling.chronology_ruling && review.embodiment_ruling === control.ruling.embodiment_ruling && review.canonical_mutation === false, 'permanent review drift');
  assert(role.composite_boundary?.both_roles_required === true && role.composite_boundary?.selected_asset_count === 2 && role.composite_boundary?.canonical_1994_is_lion_king_chronology_not_vader_debut === true && role.composite_boundary?.voice_and_physical_embodiment_separate === true && role.composite_boundary?.darth_vader_frame_must_not_imply_jones_suit_occupancy === true && role.canonical_mutation === false, 'permanent exact-role boundary drift');
  assert(duplicates.status === 'pass' && duplicates.repository_hash_count === 2070 && duplicates.items.length === 4 && duplicates.items.every(item => item.matches.length === 0), 'permanent duplicate boundary drift');
  console.log(`VALIDATED ${DEST}`);
  console.log(`manifest ${sha(await readFile(join(DEST, 'manifest.json')))}`);
  console.log(`sums ${sha(await readFile(join(DEST, 'SHA256SUMS')))}`);
}

if (command === 'materialize') await materialize();
else if (command === 'validate') await validate();
else throw new Error(`unknown command ${command}`);
