const duplicateItems = [
  { label: 'Tyler Mane Michael Myers selected 2007 source', path: selectedSource.path, sha256: selectedSource.sha256, matches: repository.get(selectedSource.sha256) || [] },
  { label: 'UC-154 first-film candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-154 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-154 exact-byte duplicate detected');
await writeJson(join(PACKET, 'duplicate-scan.json'), {
  version: 1,
  repository_hash_count: repository.size,
  items: duplicateItems,
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  status: 'pass',
  semantics: 'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.'
});

const notes = [
  'AFI identifies Tyler Mane as Michael Myers in Rob Zombie’s Halloween (2007), and Tyler Mane’s official site independently describes him as the adult performer behind the mask in the 2007 remake.',
  'The official Halloween franchise archive captions the selected frame as Tyler Mane portraying Michael Myers and ties the image to Rob Zombie’s first Halloween. The official 2007 trailer page independently preserves the first-film cast and chronology.',
  'The broad page titled Halloween 2007 Stills was rejected after visual inspection showed a mixed inventory containing 1978 frames and current-site promotional media. No image from that mixed denominator is admitted.',
  'The selected frame preserves the completed Michael Myers mask, eye openings, hair, shoulders, coveralls, torso, arms, hands, and Tyler Mane’s physical scale in an in-film action scene.',
  'The canonical 2007–2009 range records Tyler Mane’s two-film tenure. This evidence packet is bound only to Halloween (2007); Halloween II (2009) is forbidden as a substitute.',
  'The east-anchored 1260x1000 cover crop removes unused left-wall space while retaining the complete mask, shoulders, torso, both arms, hands, costume, and action context.',
  'The 1246x1000 wall simulation removes seven pixels from each outside edge without changing the Michael Myers identity, 2007 production boundary, or body-legibility ruling.',
  'The existing Tyler Mane performer portrait remains unchanged and outside the still packet’s asserted object.',
  'Exact-byte duplicate screening passes against 2,070 canonical repository hashes.'
];
const review = {
  version: 1,
  record_id: 'UC-154',
  actor: 'Tyler Mane',
  character: 'Michael Myers',
  production: 'Halloween (2007)',
  years: '2007–2009',
  side: 'still',
  expected_subject: 'Michael Myers',
  source_sha256: selectedSource.sha256,
  exact_still_record_sha256: stillRecordReceipt.sha256,
  candidate_sha256: candidate.sha256,
  crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-subject',
  presentation_ruling: 'completed-2007-michael-myers-character-still',
  crop_ruling: 'pass-east-anchored-mask-body-action-crop',
  chronology_ruling: 'pass-2007-first-film-separated-from-2009-sequel',
  mixed_gallery_ruling: 'pass-rejected-mixed-gallery-denominator',
  portrait_separation_ruling: 'pass-existing-performer-portrait-unchanged',
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  reviewed_at: control.reviewed_at,
  canonical_mutation: false,
  disposition: 'reviewed-evidence-candidate',
  notes
};
await writeJson(join(PACKET, 'review.json'), review);
const reviewMd = `# UC-154 reviewed Tyler Mane Michael Myers still candidate\n\n- **Record:** UC-154\n- **Performer:** Tyler Mane\n- **Displayed character:** Michael Myers\n- **Production:** Halloween (2007)\n- **Canonical tenure:** 2007–2009\n- **Selected source:** \`${selectedSource.sha256}\`\n- **Exact still record:** \`${stillRecordReceipt.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** expected subject\n- **Presentation ruling:** completed 2007 Michael Myers character still\n- **Crop ruling:** pass, east-anchored mask/body/action crop\n- **Chronology ruling:** pass, 2007 first film separated from 2009 sequel\n- **Mixed-gallery ruling:** pass, contaminated gallery denominator rejected\n- **Portrait separation:** existing Tyler Mane portrait remains unchanged\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe exact official first-film frame, four page receipts, rejected broad-gallery checkpoint, deterministic candidate, wall simulation, duplicate receipt, and exact-still record remain evidence-only pending independent canonical acceptance.\n`;
await writeFile(join(PACKET, 'review.md'), reviewMd);

const manifest = {
  version: 1,
  lane: 'card-backfill',
  record_id: 'UC-154',
  actor: 'Tyler Mane',
  character: 'Michael Myers',
  production: 'Halloween (2007)',
  years: '2007–2009',
  side: 'still',
  expected_subject: 'Michael Myers',
  reviewed_at: control.reviewed_at,
  reviewed_by: control.reviewed_by,
  reviewed_role: control.reviewed_role,
  custody: {
    targeted_artifact: control.targeted_artifact,
    failed_discovery_checkpoints: control.failed_discovery_checkpoints,
    repair_boundary: control.repair_boundary,
    render_control_sha256: sha(await readFile(CONTROL)),
    targeted_manifest_sha256: manifestReceipt.sha256,
    targeted_summary_sha256: summaryReceipt.sha256,
    targeted_contact_sheet_sha256: contactReceipt.sha256,
    render_artifact: null,
    apply_control_sha256: null
  },
  source_custody: Object.fromEntries(pageRows.map(({ control: row, evidence, screenshot }) => [row.key, {
    provider: row.provider,
    source_page: row.page_url,
    binding: row.binding,
    page_title: evidence.title,
    required_terms: row.required_terms,
    body_sha256: evidence.body_sha256,
    page_screenshot: screenshot
  }])),
  chronology_boundary: exactStillRecord.chronology_boundary,
  still_boundary: exactStillRecord.still_boundary,
  selected_frame: {
    provider: control.selected.provider,
    source_page: control.selected.source_page,
    selected_source_url: control.selected.declared_url,
    caption: control.selected.caption,
    original: selectedSource,
    selection_ruling: control.selected.selection_ruling
  },
  exact_still_record: { path: 'exact-still-record.json', ...stillRecordReceipt },
  candidate: {
    ...candidate,
    recipe: `Auto-orient; ${control.render.filter} cover-resize to ${control.render.resize}; ${control.render.gravity} extent ${control.render.candidate_width}x${control.render.candidate_height}; JPEG quality ${control.render.jpeg_quality}`
  },
  crop_preview: {
    ...cropPreview,
    gravity: control.render.wall_gravity,
    semantics: 'The wall simulation removes seven pixels from each outside edge while preserving the completed mask, eye openings, hair, shoulders, torso, arms, hands, coveralls, physical scale, and first-film action context.'
  },
  rejected_orbit_summary: [
    'The broad page labeled Halloween 2007 Stills exposed a mixed inventory containing 1978 frames and current-site promotional media and was rejected before render authorization.',
    'Halloween II (2009), the original 1978 continuity, later continuities, other Michael Myers performers, young Michael, unmasked Tyler Mane, standalone masks, cosplay, merchandise, games, posters, and montages remain outside the evidence boundary.',
    'Only the exact official caption-local 1080x720 first-film frame was selected.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: repository.size, status: 'pass' },
  exact_subject_review: {
    identity: review.identity_ruling,
    presentation: review.presentation_ruling,
    crop_ruling: review.crop_ruling,
    chronology_ruling: review.chronology_ruling,
    mixed_gallery_ruling: review.mixed_gallery_ruling,
    portrait_separation_ruling: review.portrait_separation_ruling,
    notes
  },
  disposition: 'reviewed-evidence-candidate',
  canonical_mutation: false
};
await writeJson(join(PACKET, 'manifest.json'), manifest);

const packetNames = [
  'card-crop-preview.jpg',
  'duplicate-scan.json',
  'exact-still-record.json',
  'manifest.json',
  'michael-myers-2007-original.jpg',
  'review.json',
  'review.md',
  'source-page-afi-halloween-2007.png',
  'source-page-halloweenmovies-2007-trailer.png',
  'source-page-halloweenmovies-kristina-klebe.png',
  'source-page-tyler-mane-official-halloween-interview.png',
  'uc-154-still-candidate.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-154',
  source: selectedSource,
  exact_still_record: { path: 'exact-still-record.json', ...stillRecordReceipt },
  candidate,
  crop_preview: cropPreview,
  source_pages: Object.fromEntries(pageRows.map(({ control: row, screenshot }) => [row.key, screenshot])),
  repository_hash_count: repository.size,
  failed_discovery_checkpoints: control.failed_discovery_checkpoints,
  packet_files: [...packetNames, 'SHA256SUMS'],
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))),
  review_sha256: sha(await readFile(join(PACKET, 'review.json'))),
  sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))),
  canonical_mutation: false
});
console.log(`PASS — UC-154 exact first-film render packet created at ${PACKET}`);
console.log(`source ${selectedSource.sha256} ${selectedSource.width}x${selectedSource.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`still ${stillRecordReceipt.sha256}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
console.log(`sums ${sha(await readFile(join(PACKET, 'SHA256SUMS')))}`);
