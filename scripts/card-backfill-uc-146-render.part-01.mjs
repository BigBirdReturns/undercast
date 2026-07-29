const candidatePath = join(PACKET, 'uc-146-portrait-candidate.jpg');
magick(join(PACKET, selectedRow.source.path), '-auto-orient', '-filter', control.render.filter, '-resize', control.render.resize, '-background', control.render.background, '-gravity', control.render.gravity, '-extent', `${control.render.candidate_width}x${control.render.candidate_height}`, '-strip', '-quality', String(control.render.jpeg_quality), candidatePath);
const candidate = { path: 'uc-146-portrait-candidate.jpg', ...(await receipt(candidatePath, { mime: 'image/jpeg', width: control.render.candidate_width, height: control.render.candidate_height })) };
const cropPath = join(PACKET, 'card-crop-preview.jpg');
magick(candidatePath, '-gravity', control.render.wall_gravity, '-crop', `${control.render.wall_width}x${control.render.wall_height}+0+0`, '+repage', '-strip', '-quality', String(control.render.jpeg_quality), cropPath);
const cropPreview = { path: 'card-crop-preview.jpg', ...(await receipt(cropPath, { mime: 'image/jpeg', width: control.render.wall_width, height: control.render.wall_height })) };

const duplicateItems = [
  { label: 'Tim Rose selected Phoenix portrait', path: selectedRow.source.path, sha256: selectedRow.source.sha256, matches: repository.get(selectedRow.source.sha256) || [] },
  { label: 'Tim Rose rejected Celebration Europe II alternative', path: alternativeRow.source.path, sha256: alternativeRow.source.sha256, matches: repository.get(alternativeRow.source.sha256) || [] },
  { label: 'UC-146 portrait candidate', path: candidate.path, sha256: candidate.sha256, matches: repository.get(candidate.sha256) || [] },
  { label: 'UC-146 wall crop preview', path: cropPreview.path, sha256: cropPreview.sha256, matches: repository.get(cropPreview.sha256) || [] }
];
assert(duplicateItems.every(item => item.matches.length === 0), 'UC-146 exact-byte duplicate detected');
await writeJson(join(PACKET, 'duplicate-scan.json'), { version: 1, repository_hash_count: repository.size, items: duplicateItems, reviewed_at: control.reviewed_at, reviewed_by: control.reviewed_by, status: 'pass', semantics: 'Exact SHA-256 comparison against canonical media; evidence-packet files are not canonical bindings.' });

const notes = [
  'The selected object is an untransformed, close head-and-shoulders portrait. Wikimedia Commons metadata names Timothy M. Rose, identifies Phoenix Comicon Fan Fest 2016, credits Gage Skidmore, and supplies a CC BY-SA 3.0 license.',
  'The disambiguated actor record and the MediaMikes interview independently distinguish this Tim Rose from other people sharing the name and associate him with Admiral Ackbar, Salacious B. Crumb, Return of the Jedi, and puppetry work.',
  'Tim Rose’s official site and the current Power of the Force guest page remain reference-only because both rejected hosted-runner transport. Their failures are retained and do not silently satisfy runtime evidence gates.',
  'The correctly captioned Celebration Europe II photograph is retained as an alternative identity object but rejected because its side-profile, table-context composition is less suitable than the selected close portrait.',
  'The 1260x1000 candidate uses centered contain scaling on a neutral background. It preserves the full hairline, face, chin, collar, jacket, and upper torso without fabricating missing image detail.',
  'The 1246x1000 wall simulation removes seven pixels from each outside edge without changing the face, identity, source, or portrait ruling.',
  'The existing UC-146 character still remains unchanged and outside the portrait packet’s asserted object.',
  'Exact-byte duplicate screening passes against 2,070 canonical repository hashes.'
];
const review = {
  version: 1, record_id: 'UC-146', actor: 'Tim Rose', character: 'Admiral Ackbar / Salacious B. Crumb', production: 'Return of the Jedi', years: '1983–2019', side: 'portrait', expected_subject: 'Tim Rose',
  source_sha256: selectedRow.source.sha256, rejected_alternative_sha256: alternativeRow.source.sha256, exact_portrait_record_sha256: portraitRecordReceipt.sha256,
  candidate_sha256: candidate.sha256, crop_preview_sha256: cropPreview.sha256,
  identity_ruling: 'expected-person', presentation_ruling: 'untransformed-performer-portrait', crop_ruling: 'pass-centered-contain-portrait-layout',
  collision_ruling: 'pass-disambiguated-tim-rose-actor-identity', character_separation_ruling: 'pass-portrait-separated-from-existing-character-still',
  reviewed_by: control.reviewed_by, reviewed_role: control.reviewed_role, reviewed_at: control.reviewed_at,
  canonical_mutation: false, disposition: 'reviewed-evidence-candidate', notes
};
await writeJson(join(PACKET, 'review.json'), review);
const reviewMd = `# UC-146 reviewed Tim Rose performer portrait candidate\n\n- **Record:** UC-146\n- **Performer:** Tim Rose\n- **Card context:** Admiral Ackbar / Salacious B. Crumb\n- **Selected portrait:** \`${selectedRow.source.sha256}\`\n- **Rejected alternative:** \`${alternativeRow.source.sha256}\`\n- **Exact portrait record:** \`${portraitRecordReceipt.sha256}\`\n- **Candidate:** \`${candidate.sha256}\`\n- **Wall-crop preview:** \`${cropPreview.sha256}\`\n- **Identity ruling:** expected person\n- **Presentation ruling:** untransformed performer portrait\n- **Crop ruling:** pass, centered contain portrait layout\n- **Collision ruling:** pass, disambiguated Tim Rose actor identity\n- **Character separation:** portrait remains separate from existing character still\n- **Canonical mutation:** none\n\n## Visual and custody ruling\n\n${notes.map(note => `- ${note}`).join('\n')}\n\nThe selected and alternative source bytes, Commons metadata, strict identity receipts, reference-only owner-page custody, deterministic portrait, wall simulation, duplicate receipt, and exact-person record remain evidence-only pending independent canonical acceptance.\n`;
await writeFile(join(PACKET, 'review.md'), reviewMd);

const manifest = {
  version: 1, lane: 'card-backfill', record_id: 'UC-146', actor: 'Tim Rose', character: 'Admiral Ackbar / Salacious B. Crumb', production: 'Return of the Jedi', years: '1983–2019', side: 'portrait', expected_subject: 'Tim Rose',
  reviewed_at: control.reviewed_at, reviewed_by: control.reviewed_by, reviewed_role: control.reviewed_role,
  custody: {
    discovery_artifact: control.discovery_artifact, failed_discovery_checkpoints: control.failed_discovery_checkpoints, discovery_repair_boundary: control.discovery_repair_boundary,
    render_control_sha256: sha(await readFile(CONTROL)), discovery_manifest_sha256: manifestReceipt.sha256, discovery_summary_sha256: summaryReceipt.sha256,
    discovery_contact_sheet_sha256: contactReceipt.sha256, render_artifact: null, apply_control_sha256: null
  },
  identity_custody: Object.fromEntries(identityRows.map(({ control: row, evidence, screenshot }) => [row.key, {
    provider: row.provider, source_page: row.page_url, binding: row.binding, strict: row.strict === true, reference_only: row.reference_only === true, externally_verified: row.externally_verified === true,
    ...(screenshot ? { page_title: evidence.title, body_sha256: evidence.body_sha256, page_screenshot: screenshot } : { runtime_transport: 'reference-only-external-verification' })
  }])),
  commons_category: { source_page: control.commons_category.page_url, page_title: categoryEvidence.title, body_sha256: categoryEvidence.body_sha256, page_screenshot: categoryPage },
  portrait_boundary: exactPortraitRecord.portrait_boundary,
  selected_portrait: {
    provider: control.selected.provider, file_title: control.selected.file_title, source_page: control.selected.source_page, original_url: control.selected.original_url,
    original: selectedRow.source, api_receipt: selectedRow.api, page_receipt: selectedRow.page,
    license_short_name: control.selected.license_short_name, artist: control.selected.artist, description: control.selected.description, selection_ruling: control.selected.selection_ruling
  },
  rejected_alternative: {
    provider: control.alternative.provider, file_title: control.alternative.file_title, source_page: control.alternative.source_page, original_url: control.alternative.original_url,
    original: alternativeRow.source, api_receipt: alternativeRow.api, page_receipt: alternativeRow.page,
    license_short_name: control.alternative.license_short_name, artist: control.alternative.artist, description: control.alternative.description, rejection_ruling: control.alternative.rejection_ruling
  },
  exact_portrait_record: { path: 'exact-portrait-record.json', ...portraitRecordReceipt },
  candidate: { ...candidate, recipe: `Auto-orient; ${control.render.filter} contain-resize to ${control.render.resize}; center on ${control.render.background}; extent ${control.render.candidate_width}x${control.render.candidate_height}; JPEG quality ${control.render.jpeg_quality}` },
  crop_preview: { ...cropPreview, gravity: control.render.wall_gravity, semantics: 'The wall simulation removes seven pixels from each outside edge while preserving Tim Rose’s full face, chin, collar, jacket, and upper torso.' },
  rejected_orbit_summary: [
    'Admiral Ackbar, Salacious B. Crumb, other character masks, other people named Tim Rose, unlabeled group photographs, and images without person-identifying metadata were excluded.',
    'The correctly captioned Celebration Europe II portrait is retained but rejected because the selected Phoenix photograph provides a clearer frontal face and tighter performer portrait.',
    'Two identity-source checkpoints failed closed before owner-controlled pages were retained as reference-only and the runtime identity lane used the disambiguated actor record plus the published interview.'
  ],
  duplicate_scan: { path: 'duplicate-scan.json', repository_hash_count: repository.size, status: 'pass' },
  exact_subject_review: { identity: review.identity_ruling, presentation: review.presentation_ruling, crop_ruling: review.crop_ruling, collision_ruling: review.collision_ruling, character_separation_ruling: review.character_separation_ruling, notes },
  disposition: 'reviewed-evidence-candidate', canonical_mutation: false
};
await writeJson(join(PACKET, 'manifest.json'), manifest);

const packetNames = [
  'card-crop-preview.jpg','duplicate-scan.json','exact-portrait-record.json','manifest.json','review.json','review.md',
  'source-api-commons-celebration-europe-ii.json','source-api-commons-phoenix-2016.json',
  'source-page-commons-category-timothy-m-rose.png','source-page-commons-celebration-europe-ii.png','source-page-commons-phoenix-2016.png',
  'source-page-mediamikes-tim-rose-interview.png','source-page-wikipedia-tim-rose-actor.png',
  'tim-rose-alternative-celebration-europe-ii.jpg','tim-rose-original.jpg','uc-146-portrait-candidate.jpg'
];
const sums = [];
for (const name of packetNames) sums.push(`${sha(await readFile(join(PACKET, name)))}  ${name}`);
await writeFile(join(PACKET, 'SHA256SUMS'), sums.join('\n') + '\n');
await writeJson(join(OUT, 'render-summary.json'), {
  record_id: 'UC-146', selected: selectedRow.source, alternative: alternativeRow.source, exact_portrait_record: { path: 'exact-portrait-record.json', ...portraitRecordReceipt },
  candidate, crop_preview: cropPreview,
  strict_identity_pages: Object.fromEntries(identityRows.filter(row => row.screenshot).map(({ control: row, screenshot }) => [row.key, screenshot])),
  commons_category: categoryPage, repository_hash_count: repository.size, packet_files: [...packetNames, 'SHA256SUMS'],
  manifest_sha256: sha(await readFile(join(PACKET, 'manifest.json'))), review_sha256: sha(await readFile(join(PACKET, 'review.json'))), sums_sha256: sha(await readFile(join(PACKET, 'SHA256SUMS'))), canonical_mutation: false
});
console.log(`PASS — UC-146 exact performer portrait render packet created at ${PACKET}`);
console.log(`selected ${selectedRow.source.sha256} ${selectedRow.source.width}x${selectedRow.source.height}`);
console.log(`alternative ${alternativeRow.source.sha256} ${alternativeRow.source.width}x${alternativeRow.source.height}`);
console.log(`candidate ${candidate.sha256} ${candidate.width}x${candidate.height}`);
console.log(`crop ${cropPreview.sha256} ${cropPreview.width}x${cropPreview.height}`);
console.log(`portrait ${portraitRecordReceipt.sha256}`);
console.log(`manifest ${sha(await readFile(join(PACKET, 'manifest.json')))}`);
console.log(`sums ${sha(await readFile(join(PACKET, 'SHA256SUMS')))}`);
